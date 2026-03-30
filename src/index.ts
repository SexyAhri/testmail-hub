import {
  getBearerToken,
  getAdminSessionFromRequest,
  getManagedApiTokenId,
  hashApiTokenValue,
  hasPermission,
  isApiAuthorized,
} from "./core/auth";
import {
  clearExpiredEmails,
  disableExpiredMailboxes,
  getActiveApiTokenById,
  getAdminAccessContext,
  purgeDeletedEmails,
  touchApiTokenLastUsed,
} from "./core/db";
import { captureError } from "./core/errors";
import { processIncomingEmail } from "./core/logic";
import { processDueNotificationRetries, sendEventNotifications } from "./core/notifications";
import { processDueOutboundEmails } from "./core/outbound-service";
import * as handlers from "./handlers/handlers";
import {
  EXPIRED_EMAIL_RETENTION_HOURS,
  PURGE_DELETED_EMAILS_AFTER_HOURS,
} from "./utils/constants";
import { applyCors, getCorsHeaders, jsonError } from "./utils/utils";
import { isSqliteConstraintError, isSqliteSchemaError } from "./utils/utils";
import type { AdminPermission } from "./utils/constants";
import type {
  ApiTokenPermission,
  AuthSession,
  WorkerEnv,
  WorkerExecutionContext,
  WorkerEmailMessage,
} from "./server/types";

function apiOptionsResponse(request: Request, env: WorkerEnv): Response {
  const cors = getCorsHeaders(request, env.ALLOWED_API_ORIGINS);
  if (!cors.allowed) return new Response("Origin not allowed", { status: 403, headers: cors.headers });
  return new Response(null, { status: 204, headers: cors.headers });
}

function apiJsonError(request: Request, env: WorkerEnv, message: string, status = 400): Response {
  const cors = getCorsHeaders(request, env.ALLOWED_API_ORIGINS);
  if (!cors.allowed && request.headers.get("Origin")) {
    return new Response("Origin not allowed", { status: 403, headers: cors.headers });
  }
  return applyCors(jsonError(message, status), cors.headers);
}

function unauthorizedResponse(message = "Unauthorized", status = 401): Response {
  return new Response(message, { status });
}

async function requireAdmin(
  request: Request,
  env: WorkerEnv,
  permission?: AdminPermission,
) {
  const rawSession = await getAdminSessionFromRequest(request, env.ADMIN_TOKEN, env.SESSION_SECRET);
  if (!rawSession) return { response: unauthorizedResponse(), session: null };

  let session: AuthSession = {
    ...rawSession,
    access_scope: rawSession.access_scope || "all",
    project_ids: Array.isArray(rawSession.project_ids) ? rawSession.project_ids : [],
  };

  if (session.auth_kind === "admin_user") {
    const access = await getAdminAccessContext(env.DB, session.user_id);
    if (!access || !access.is_enabled) {
      return { response: unauthorizedResponse(), session: null };
    }
    session = {
      ...session,
      access_scope: access.access_scope,
      display_name: access.display_name,
      project_ids: access.project_ids,
      role: access.role,
      username: access.username,
    };
  }

  if (permission && !hasPermission(session.role, permission)) {
    const { pathname } = new URL(request.url);
    await captureError(env.DB, "auth.permission_denied", new Error("forbidden"), {
      method: request.method,
      pathname,
      permission,
      role: session.role,
      username: session.username,
    }, env.ERROR_WEBHOOK_URL);
    return { response: unauthorizedResponse("Forbidden", 403), session: null };
  }
  return { response: null, session };
}

function getScopedProjectIds(session: AuthSession): number[] | null {
  return session.access_scope === "bound" ? (Array.isArray(session.project_ids) ? session.project_ids : []) : null;
}

async function requireApiAccess(
  request: Request,
  env: WorkerEnv,
  permission: ApiTokenPermission,
): Promise<{ project_ids: number[] | null; response: Response | null; token_id: string | null }> {
  if (isApiAuthorized(request, env.API_TOKEN)) {
    return { project_ids: null, response: null, token_id: null };
  }

  const bearerToken = getBearerToken(request);
  const managedTokenId = getManagedApiTokenId(bearerToken);
  if (!managedTokenId) {
    return { project_ids: null, response: apiJsonError(request, env, "Unauthorized", 401), token_id: null };
  }

  const token = await getActiveApiTokenById(env.DB, managedTokenId);
  if (!token) {
    return { project_ids: null, response: apiJsonError(request, env, "Unauthorized", 401), token_id: null };
  }

  const incomingHash = await hashApiTokenValue(bearerToken);
  if (incomingHash !== token.token_hash) {
    return { project_ids: null, response: apiJsonError(request, env, "Unauthorized", 401), token_id: null };
  }

  if (!token.permissions.includes(permission)) {
    return { project_ids: null, response: apiJsonError(request, env, "Forbidden", 403), token_id: token.id };
  }

  await touchApiTokenLastUsed(env.DB, token.id);
  return {
    project_ids: token.access_scope === "bound" ? token.projects.map(project => project.id) : null,
    response: null,
    token_id: token.id,
  };
}

export default {
  async email(message: WorkerEmailMessage, env: WorkerEnv, ctx: WorkerExecutionContext) {
    try {
      const processed = await processIncomingEmail(message, env.DB);

      if (processed) {
        ctx.waitUntil(
          (async () => {
            const payload = {
              attachment_count: processed.attachment_count,
              environment_id: processed.environment_id,
              extraction: { ...processed.extraction },
              from: processed.from,
              has_matches: processed.has_matches,
              mailbox_pool_id: processed.mailbox_pool_id,
              message_id: processed.message_id,
              preview: processed.preview,
              project_id: processed.project_id,
              project_ids: [...processed.project_ids],
              received_at: processed.received_at,
              result_count: processed.result_count,
              result_insights: processed.result_insights.map(item => ({ ...item, source: { ...item.source } })),
              results: processed.results.map(item => ({ ...item })),
              subject: processed.subject,
              to: [...processed.to],
            };
            const scope = {
              environment_id: processed.environment_id,
              mailbox_pool_id: processed.mailbox_pool_id,
              project_id: processed.project_id,
              project_ids: [...processed.project_ids],
            };

            await sendEventNotifications(env.DB, "email.received", payload, scope);
            if (processed.has_matches) {
              await sendEventNotifications(env.DB, "email.matched", payload, scope);
            }
            if (processed.extraction.verification_code) {
              await sendEventNotifications(env.DB, "email.code_extracted", payload, scope);
            }
            if (processed.extraction.links.length > 0) {
              await sendEventNotifications(env.DB, "email.link_extracted", payload, scope);
            }
          })(),
        );
      }

      if (processed && env.FORWARD_TO) {
        ctx.waitUntil(message.forward(env.FORWARD_TO));
      }
    } catch (error) {
      console.error("Email processing failed:", error);
      ctx.waitUntil(captureError(env.DB, "email", error, {}, env.ERROR_WEBHOOK_URL));
    }
  },

  async fetch(request: Request, env: WorkerEnv) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      if (pathname === "/api/emails/latest") {
        if (method === "OPTIONS") return apiOptionsResponse(request, env);
        if (method !== "GET") return apiJsonError(request, env, "Method Not Allowed", 405);

        const cors = getCorsHeaders(request, env.ALLOWED_API_ORIGINS);
        if (!cors.allowed && request.headers.get("Origin")) {
          return new Response("Origin not allowed", { status: 403, headers: cors.headers });
        }
        const apiAccess = await requireApiAccess(request, env, "read:mail");
        if (apiAccess.response) return apiAccess.response;

        const response = await handlers.handleEmailsLatest(url, env.DB, apiAccess.project_ids);
        return applyCors(response, cors.headers);
      }

      if (pathname === "/api/emails/latest/extraction") {
        if (method === "OPTIONS") return apiOptionsResponse(request, env);
        if (method !== "GET") return apiJsonError(request, env, "Method Not Allowed", 405);

        const cors = getCorsHeaders(request, env.ALLOWED_API_ORIGINS);
        if (!cors.allowed && request.headers.get("Origin")) {
          return new Response("Origin not allowed", { status: 403, headers: cors.headers });
        }
        const apiAccess = await requireApiAccess(request, env, "read:code");
        if (apiAccess.response) return apiAccess.response;

        const response = await handlers.handleEmailsLatestExtraction(url, env.DB, apiAccess.project_ids);
        return applyCors(response, cors.headers);
      }

      if (pathname === "/api/emails/code") {
        if (method === "OPTIONS") return apiOptionsResponse(request, env);
        if (method !== "GET") return apiJsonError(request, env, "Method Not Allowed", 405);

        const cors = getCorsHeaders(request, env.ALLOWED_API_ORIGINS);
        if (!cors.allowed && request.headers.get("Origin")) {
          return new Response("Origin not allowed", { status: 403, headers: cors.headers });
        }
        const apiAccess = await requireApiAccess(request, env, "read:code");
        if (apiAccess.response) return apiAccess.response;

        const response = await handlers.handleEmailsCode(url, env.DB, apiAccess.project_ids);
        return applyCors(response, cors.headers);
      }

      if (/^\/api\/emails\/[^/]+\/attachments\/\d+$/.test(pathname)) {
        if (method === "OPTIONS") return apiOptionsResponse(request, env);
        if (method !== "GET") return apiJsonError(request, env, "Method Not Allowed", 405);

        const cors = getCorsHeaders(request, env.ALLOWED_API_ORIGINS);
        if (!cors.allowed && request.headers.get("Origin")) {
          return new Response("Origin not allowed", { status: 403, headers: cors.headers });
        }
        const apiAccess = await requireApiAccess(request, env, "read:attachment");
        if (apiAccess.response) return apiAccess.response;

        const response = await handlers.handlePublicEmailAttachment(pathname, env.DB, apiAccess.project_ids);
        return applyCors(response, cors.headers);
      }

      if (/^\/api\/emails\/[^/]+\/extractions$/.test(pathname)) {
        if (method === "OPTIONS") return apiOptionsResponse(request, env);
        if (method !== "GET") return apiJsonError(request, env, "Method Not Allowed", 405);

        const cors = getCorsHeaders(request, env.ALLOWED_API_ORIGINS);
        if (!cors.allowed && request.headers.get("Origin")) {
          return new Response("Origin not allowed", { status: 403, headers: cors.headers });
        }
        const apiAccess = await requireApiAccess(request, env, "read:rule-result");
        if (apiAccess.response) return apiAccess.response;

        const response = await handlers.handlePublicEmailExtractions(pathname, env.DB, apiAccess.project_ids);
        return applyCors(response, cors.headers);
      }

      if (/^\/api\/emails\/[^/]+$/.test(pathname)) {
        if (method === "OPTIONS") return apiOptionsResponse(request, env);
        if (method !== "GET") return apiJsonError(request, env, "Method Not Allowed", 405);

        const cors = getCorsHeaders(request, env.ALLOWED_API_ORIGINS);
        if (!cors.allowed && request.headers.get("Origin")) {
          return new Response("Origin not allowed", { status: 403, headers: cors.headers });
        }
        const apiAccess = await requireApiAccess(request, env, "read:mail");
        if (apiAccess.response) return apiAccess.response;

        const response = await handlers.handlePublicEmailDetail(pathname, env.DB, apiAccess.project_ids);
        return applyCors(response, cors.headers);
      }

      if (pathname === "/auth/login" && method === "POST") {
        return handlers.handleAdminLogin(request, env);
      }

      if (pathname === "/auth/session" && method === "GET") {
        const auth = await requireAdmin(request, env);
        if (auth.response || !auth.session) return auth.response!;
        return handlers.handleAdminSession(env, auth.session);
      }

      if (pathname === "/auth/logout" && method === "POST") {
        return handlers.handleAdminLogout(request);
      }

      if (pathname.startsWith("/admin/")) {
        const permission = resolveAdminPermission(pathname, method);
        const auth = await requireAdmin(request, env, permission || undefined);
        if (auth.response || !auth.session) return auth.response!;
        const actor = auth.session;

        if (pathname === "/admin/domains" && method === "GET") return handlers.handleAdminDomains(url, env.DB, actor, env);
        if (pathname === "/admin/domain-assets" && method === "GET") return handlers.handleAdminDomainAssetsGet(url, env.DB, actor);
        if (pathname === "/admin/domain-assets/status" && method === "GET") {
          return handlers.handleAdminDomainAssetsStatusGet(env.DB, env, actor);
        }
        if (pathname === "/admin/domain-assets" && method === "POST") return handlers.handleAdminDomainAssetsPost(request, env.DB, actor);
        if (/^\/admin\/domain-assets\/\d+\/sync-catch-all$/.test(pathname) && method === "POST") {
          return handlers.handleAdminDomainAssetsSyncCatchAll(pathname, env.DB, env, actor);
        }
        if (pathname.startsWith("/admin/domain-assets/") && method === "PUT") return handlers.handleAdminDomainAssetsPut(pathname, request, env.DB, actor);
        if (pathname.startsWith("/admin/domain-assets/") && method === "DELETE") return handlers.handleAdminDomainAssetsDelete(pathname, env.DB, actor);
        if (pathname === "/admin/workspace/catalog" && method === "GET") {
          return handlers.handleAdminWorkspaceCatalog(url, env.DB, actor);
        }
        if (pathname === "/admin/projects" && method === "POST") {
          return handlers.handleAdminProjectsPost(request, env.DB, actor);
        }
        if (pathname.startsWith("/admin/projects/") && method === "PUT") {
          return handlers.handleAdminProjectsPut(pathname, request, env.DB, actor);
        }
        if (pathname.startsWith("/admin/projects/") && method === "DELETE") {
          return handlers.handleAdminProjectsDelete(pathname, env.DB, actor);
        }
        if (pathname === "/admin/environments" && method === "POST") {
          return handlers.handleAdminEnvironmentsPost(request, env.DB, actor);
        }
        if (pathname.startsWith("/admin/environments/") && method === "PUT") {
          return handlers.handleAdminEnvironmentsPut(pathname, request, env.DB, actor);
        }
        if (pathname.startsWith("/admin/environments/") && method === "DELETE") {
          return handlers.handleAdminEnvironmentsDelete(pathname, env.DB, actor);
        }
        if (pathname === "/admin/mailbox-pools" && method === "POST") {
          return handlers.handleAdminMailboxPoolsPost(request, env.DB, actor);
        }
        if (pathname.startsWith("/admin/mailbox-pools/") && method === "PUT") {
          return handlers.handleAdminMailboxPoolsPut(pathname, request, env.DB, actor);
        }
        if (pathname.startsWith("/admin/mailbox-pools/") && method === "DELETE") {
          return handlers.handleAdminMailboxPoolsDelete(pathname, env.DB, actor);
        }
        if (pathname === "/admin/stats/overview" && method === "GET") return handlers.handleAdminOverviewStats(env.DB, actor);
        if (pathname === "/admin/audit" && method === "GET") return handlers.handleAdminAuditLogs(url, env.DB);
        if (pathname === "/admin/errors" && method === "GET") return handlers.handleAdminErrors(url, env.DB);

        if (pathname === "/admin/emails" && method === "GET") return handlers.handleAdminEmails(url, env.DB, actor);
        if (/^\/admin\/emails\/[^/]+\/metadata$/.test(pathname) && method === "PUT") {
          return handlers.handleAdminEmailMetadataPut(pathname, request, env.DB, actor);
        }
        if (/^\/admin\/emails\/[^/]+\/restore$/.test(pathname) && method === "POST") {
          return handlers.handleAdminEmailRestore(pathname, env.DB, actor);
        }
        if (/^\/admin\/emails\/[^/]+\/purge$/.test(pathname) && method === "DELETE") {
          return handlers.handleAdminEmailPurge(pathname, env.DB, actor);
        }
        if (/^\/admin\/emails\/[^/]+\/attachments\/\d+$/.test(pathname) && method === "GET") {
          return handlers.handleAdminEmailAttachment(pathname, env.DB, actor);
        }
        if (pathname.startsWith("/admin/emails/") && method === "GET") {
          return handlers.handleAdminEmailDetail(pathname, env.DB, actor);
        }
        if (pathname.startsWith("/admin/emails/") && method === "DELETE") {
          return handlers.handleAdminEmailDelete(pathname, env.DB, actor);
        }

        if (pathname === "/admin/rules" && method === "GET") return handlers.handleAdminRulesGet(url, env.DB);
        if (pathname === "/admin/rules" && method === "POST") return handlers.handleAdminRulesPost(request, env.DB, actor);
        if (pathname === "/admin/rules/test" && method === "POST") return handlers.handleAdminRulesTest(request, env.DB);
        if (pathname.startsWith("/admin/rules/") && method === "PUT") return handlers.handleAdminRulesPut(pathname, request, env.DB, actor);
        if (pathname.startsWith("/admin/rules/") && method === "DELETE") return handlers.handleAdminRulesDelete(pathname, env.DB, actor);

        if (pathname === "/admin/whitelist/settings" && method === "GET") return handlers.handleAdminWhitelistSettingsGet(env.DB);
        if (pathname === "/admin/whitelist/settings" && method === "PUT") {
          return handlers.handleAdminWhitelistSettingsPut(request, env.DB, actor);
        }
        if (pathname === "/admin/whitelist" && method === "GET") return handlers.handleAdminWhitelistGet(url, env.DB);
        if (pathname === "/admin/whitelist" && method === "POST") return handlers.handleAdminWhitelistPost(request, env.DB, actor);
        if (pathname.startsWith("/admin/whitelist/") && method === "PUT") return handlers.handleAdminWhitelistPut(pathname, request, env.DB, actor);
        if (pathname.startsWith("/admin/whitelist/") && method === "DELETE") return handlers.handleAdminWhitelistDelete(pathname, env.DB, actor);

        if (pathname === "/admin/mailboxes" && method === "GET") return handlers.handleAdminMailboxesGet(url, env.DB, actor);
        if (pathname === "/admin/mailboxes/sync" && method === "POST") return handlers.handleAdminMailboxesSync(env.DB, env, actor);
        if (pathname === "/admin/mailboxes" && method === "POST") return handlers.handleAdminMailboxesPost(request, env.DB, env, actor);
        if (pathname.startsWith("/admin/mailboxes/") && method === "PUT") return handlers.handleAdminMailboxesPut(pathname, request, env.DB, env, actor);
        if (pathname.startsWith("/admin/mailboxes/") && method === "DELETE") return handlers.handleAdminMailboxesDelete(pathname, env.DB, env, actor);

        if (pathname === "/admin/admins" && method === "GET") return handlers.handleAdminAdminsGet(url, env.DB);
        if (pathname === "/admin/admins" && method === "POST") return handlers.handleAdminAdminsPost(request, env.DB, actor);
        if (pathname.startsWith("/admin/admins/") && method === "PUT") return handlers.handleAdminAdminsPut(pathname, request, env.DB, actor);

        if (pathname === "/admin/notifications" && method === "GET") return handlers.handleAdminNotificationsGet(url, env.DB, actor);
        if (/^\/admin\/notifications\/\d+\/deliveries$/.test(pathname) && method === "GET") {
          return handlers.handleAdminNotificationDeliveriesGet(pathname, url, env.DB, actor);
        }
        if (pathname === "/admin/notifications" && method === "POST") return handlers.handleAdminNotificationsPost(request, env.DB, actor);
        if (/^\/admin\/notifications\/deliveries\/\d+\/retry$/.test(pathname) && method === "POST") {
          return handlers.handleAdminNotificationDeliveryRetry(pathname, env.DB, actor);
        }
        if (/^\/admin\/notifications\/\d+\/test$/.test(pathname) && method === "POST") {
          return handlers.handleAdminNotificationsTest(pathname, env.DB, actor);
        }
        if (pathname.startsWith("/admin/notifications/") && method === "PUT") return handlers.handleAdminNotificationsPut(pathname, request, env.DB, actor);
        if (pathname.startsWith("/admin/notifications/") && method === "DELETE") return handlers.handleAdminNotificationsDelete(pathname, env.DB, actor);
        if (pathname === "/admin/api-tokens" && method === "GET") return handlers.handleAdminApiTokensGet(url, env.DB, actor);
        if (pathname === "/admin/api-tokens" && method === "POST") return handlers.handleAdminApiTokensPost(request, env.DB, actor);
        if (pathname.startsWith("/admin/api-tokens/") && method === "PUT") return handlers.handleAdminApiTokensPut(pathname, request, env.DB, actor);
        if (pathname.startsWith("/admin/api-tokens/") && method === "DELETE") return handlers.handleAdminApiTokensDelete(pathname, env.DB, actor);

        if (pathname === "/admin/outbound/settings" && method === "GET") {
          return handlers.handleAdminOutboundSettingsGet(env.DB, env);
        }
        if (pathname === "/admin/outbound/settings" && method === "PUT") {
          return handlers.handleAdminOutboundSettingsPut(request, env.DB, env, actor);
        }
        if (pathname === "/admin/outbound/stats" && method === "GET") {
          return handlers.handleAdminOutboundStatsGet(env.DB);
        }
        if (pathname === "/admin/outbound/emails" && method === "GET") {
          return handlers.handleAdminOutboundEmailsGet(url, env.DB);
        }
        if (pathname === "/admin/outbound/emails" && method === "POST") {
          return handlers.handleAdminOutboundEmailsPost(request, env.DB, env, actor);
        }
        if (/^\/admin\/outbound\/emails\/\d+\/send$/.test(pathname) && method === "POST") {
          return handlers.handleAdminOutboundEmailSendExisting(pathname, env.DB, env, actor);
        }
        if (pathname.startsWith("/admin/outbound/emails/") && method === "PUT") {
          return handlers.handleAdminOutboundEmailsPut(pathname, request, env.DB, env, actor);
        }
        if (pathname.startsWith("/admin/outbound/emails/") && method === "GET") {
          return handlers.handleAdminOutboundEmailDetail(pathname, env.DB);
        }
        if (pathname.startsWith("/admin/outbound/emails/") && method === "DELETE") {
          return handlers.handleAdminOutboundEmailsDelete(pathname, env.DB, actor);
        }
        if (pathname === "/admin/outbound/templates" && method === "GET") {
          return handlers.handleAdminOutboundTemplatesGet(env.DB);
        }
        if (pathname === "/admin/outbound/templates" && method === "POST") {
          return handlers.handleAdminOutboundTemplatesPost(request, env.DB, actor);
        }
        if (pathname.startsWith("/admin/outbound/templates/") && method === "PUT") {
          return handlers.handleAdminOutboundTemplatesPut(pathname, request, env.DB, actor);
        }
        if (pathname.startsWith("/admin/outbound/templates/") && method === "DELETE") {
          return handlers.handleAdminOutboundTemplatesDelete(pathname, env.DB, actor);
        }
        if (pathname === "/admin/outbound/contacts" && method === "GET") {
          return handlers.handleAdminOutboundContactsGet(env.DB);
        }
        if (pathname === "/admin/outbound/contacts" && method === "POST") {
          return handlers.handleAdminOutboundContactsPost(request, env.DB, actor);
        }
        if (pathname.startsWith("/admin/outbound/contacts/") && method === "PUT") {
          return handlers.handleAdminOutboundContactsPut(pathname, request, env.DB, actor);
        }
        if (pathname.startsWith("/admin/outbound/contacts/") && method === "DELETE") {
          return handlers.handleAdminOutboundContactsDelete(pathname, env.DB, actor);
        }

        if (pathname.startsWith("/admin/export/") && method === "GET") {
          const resource = pathname.replace("/admin/export/", "");
          return handlers.handleAdminExport(resource, env.DB, url.searchParams.get("format") || "csv", actor);
        }

        return jsonError("Not Found", 404);
      }

      if (pathname.startsWith("/api/")) return apiJsonError(request, env, "Not Found", 404);
      if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
        return env.ASSETS.fetch(request);
      }
      return new Response("Not Found", { status: 404 });
    } catch (error) {
      await captureError(
        env.DB,
        "fetch",
        error,
        { method, pathname },
        env.ERROR_WEBHOOK_URL,
      );
      if (isSqliteSchemaError(error)) {
        return jsonError(
          "数据库结构未升级，请先执行 npm run db:migrate:local（本地）或 npm run db:migrate:remote（线上）。",
          500,
        );
      }
      if (isSqliteConstraintError(error)) {
        return jsonError(normalizeConstraintMessage(error), 409);
      }
      if (error instanceof Error && error.message) {
        return jsonError(error.message, 500);
      }
      return jsonError("Internal Server Error", 500);
    }
  },

  async scheduled(_event: unknown, env: WorkerEnv, ctx: WorkerExecutionContext) {
    ctx.waitUntil(
      (async () => {
        try {
          await processDueNotificationRetries(env.DB, 20);
          const outbound = await processDueOutboundEmails(env.DB, env, 10);
          for (const email of outbound.sent) {
            await sendEventNotifications(env.DB, "email.sent", {
              provider: email.provider,
              provider_message_id: email.provider_message_id,
              subject: email.subject,
              to: email.to_addresses,
            });
          }
          for (const email of outbound.failed) {
            await sendEventNotifications(env.DB, "email.send_failed", {
              error: email.error_message,
              provider: email.provider,
              subject: email.subject,
              to: email.to_addresses,
            });
          }

          await clearExpiredEmails(env.DB, EXPIRED_EMAIL_RETENTION_HOURS);
          await purgeDeletedEmails(env.DB, PURGE_DELETED_EMAILS_AFTER_HOURS);
          const expiredMailboxes = await disableExpiredMailboxes(env.DB);
          for (const mailbox of expiredMailboxes) {
            await sendEventNotifications(env.DB, "mailbox.expired", {
              address: mailbox.address,
              expires_at: mailbox.expires_at,
              project_id: mailbox.project_id,
              project_name: mailbox.project_name,
            }, {
              environment_id: mailbox.environment_id,
              mailbox_pool_id: mailbox.mailbox_pool_id,
              project_id: mailbox.project_id,
              project_ids: mailbox.project_id ? [mailbox.project_id] : [],
            });
          }
        } catch (error) {
          await captureError(env.DB, "scheduled", error, {}, env.ERROR_WEBHOOK_URL);
        }
      })(),
    );
  },
};

function resolveAdminPermission(pathname: string, method: string): AdminPermission | null {
  if (pathname.startsWith("/admin/workspace") || pathname.startsWith("/admin/projects") || pathname.startsWith("/admin/environments") || pathname.startsWith("/admin/mailbox-pools")) {
    return method === "GET" ? "workspace:read" : "workspace:write";
  }
  if (pathname.startsWith("/admin/admins")) return method === "GET" ? "admins:read" : "admins:write";
  if (pathname.startsWith("/admin/api-tokens")) return method === "GET" ? "api_tokens:read" : "api_tokens:write";
  if (pathname.startsWith("/admin/notifications")) return method === "GET" ? "notifications:read" : "notifications:write";
  if (pathname.startsWith("/admin/outbound")) return method === "GET" ? "outbound:read" : "outbound:write";
  if (pathname.startsWith("/admin/rules/test")) return "rules:test";
  if (pathname.startsWith("/admin/rules")) return method === "GET" ? "rules:read" : "rules:write";
  if (pathname.startsWith("/admin/whitelist")) return method === "GET" ? "whitelist:read" : "whitelist:write";
  if (pathname.startsWith("/admin/mailboxes")) return method === "GET" ? "mailboxes:read" : "mailboxes:write";
  if (pathname.startsWith("/admin/domain-assets")) return method === "GET" ? "mailboxes:read" : "mailboxes:write";
  if (pathname.startsWith("/admin/emails")) {
    if (method === "GET") return "emails:read";
    if (pathname.endsWith("/metadata")) return "emails:write";
    if (pathname.endsWith("/restore")) return "emails:restore";
    return "emails:delete";
  }
  if (pathname.startsWith("/admin/export")) return "exports:read";
  if (pathname.startsWith("/admin/audit")) return "system:audit";
  if (pathname.startsWith("/admin/errors") || pathname.startsWith("/admin/stats")) return "system:errors";
  if (pathname.startsWith("/admin/domains")) return "mailboxes:read";
  return null;
}

function normalizeConstraintMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/admin_users\.username|username/i.test(message)) return "username already exists";
  if (/mailboxes\.address|address/i.test(message)) return "mailbox address already exists";
  if (/projects\.slug/i.test(message)) return "project slug already exists";
  if (/idx_environments_project_slug|environments/i.test(message)) return "environment slug already exists in the selected project";
  if (/idx_mailbox_pools_environment_slug|mailbox_pools/i.test(message)) return "mailbox pool slug already exists in the selected environment";
  return "database constraint failed";
}
