import {
  getAdminSessionFromRequest,
  hasPermission,
  isApiAuthorized,
} from "./core/auth";
import { disableExpiredMailboxes, clearExpiredEmails, purgeDeletedEmails } from "./core/db";
import { captureError } from "./core/errors";
import { processIncomingEmail } from "./core/logic";
import { sendEventNotifications } from "./core/notifications";
import { processDueOutboundEmails } from "./core/outbound-service";
import * as handlers from "./handlers/handlers";
import {
  EXPIRED_EMAIL_RETENTION_HOURS,
  PURGE_DELETED_EMAILS_AFTER_HOURS,
} from "./utils/constants";
import { applyCors, getCorsHeaders, jsonError } from "./utils/utils";
import { isSqliteConstraintError, isSqliteSchemaError } from "./utils/utils";
import type { AdminPermission } from "./utils/constants";
import type { WorkerEnv, WorkerExecutionContext, WorkerEmailMessage } from "./server/types";

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
  const session = await getAdminSessionFromRequest(request, env.ADMIN_TOKEN, env.SESSION_SECRET);
  if (!session) return { response: unauthorizedResponse(), session: null };
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

export default {
  async email(message: WorkerEmailMessage, env: WorkerEnv, ctx: WorkerExecutionContext) {
    try {
      const processed = await processIncomingEmail(message, env.DB);

      if (processed) {
        ctx.waitUntil(
          sendEventNotifications(
            env.DB,
            processed.has_matches ? "email.matched" : "email.received",
            { ...processed },
          ),
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
        if (!isApiAuthorized(request, env.API_TOKEN)) {
          return apiJsonError(request, env, "Unauthorized", 401);
        }

        const response = await handlers.handleEmailsLatest(url, env.DB);
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

        if (pathname === "/admin/domains" && method === "GET") return handlers.handleAdminDomains(url, env.DB);
        if (pathname === "/admin/stats/overview" && method === "GET") return handlers.handleAdminOverviewStats(env.DB);
        if (pathname === "/admin/audit" && method === "GET") return handlers.handleAdminAuditLogs(url, env.DB);
        if (pathname === "/admin/errors" && method === "GET") return handlers.handleAdminErrors(url, env.DB);

        if (pathname === "/admin/emails" && method === "GET") return handlers.handleAdminEmails(url, env.DB);
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
          return handlers.handleAdminEmailAttachment(pathname, env.DB);
        }
        if (pathname.startsWith("/admin/emails/") && method === "GET") {
          return handlers.handleAdminEmailDetail(pathname, env.DB);
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

        if (pathname === "/admin/mailboxes" && method === "GET") return handlers.handleAdminMailboxesGet(url, env.DB);
        if (pathname === "/admin/mailboxes/sync" && method === "POST") return handlers.handleAdminMailboxesSync(env.DB, env);
        if (pathname === "/admin/mailboxes" && method === "POST") return handlers.handleAdminMailboxesPost(request, env.DB, env, actor);
        if (pathname.startsWith("/admin/mailboxes/") && method === "PUT") return handlers.handleAdminMailboxesPut(pathname, request, env.DB, env, actor);
        if (pathname.startsWith("/admin/mailboxes/") && method === "DELETE") return handlers.handleAdminMailboxesDelete(pathname, env.DB, env, actor);

        if (pathname === "/admin/admins" && method === "GET") return handlers.handleAdminAdminsGet(url, env.DB);
        if (pathname === "/admin/admins" && method === "POST") return handlers.handleAdminAdminsPost(request, env.DB, actor);
        if (pathname.startsWith("/admin/admins/") && method === "PUT") return handlers.handleAdminAdminsPut(pathname, request, env.DB, actor);

        if (pathname === "/admin/notifications" && method === "GET") return handlers.handleAdminNotificationsGet(url, env.DB);
        if (pathname === "/admin/notifications" && method === "POST") return handlers.handleAdminNotificationsPost(request, env.DB, actor);
        if (/^\/admin\/notifications\/\d+\/test$/.test(pathname) && method === "POST") {
          return handlers.handleAdminNotificationsTest(pathname, env.DB);
        }
        if (pathname.startsWith("/admin/notifications/") && method === "PUT") return handlers.handleAdminNotificationsPut(pathname, request, env.DB, actor);
        if (pathname.startsWith("/admin/notifications/") && method === "DELETE") return handlers.handleAdminNotificationsDelete(pathname, env.DB, actor);

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
          return handlers.handleAdminExport(resource, env.DB, url.searchParams.get("format") || "csv");
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
  if (pathname.startsWith("/admin/admins")) return method === "GET" ? "admins:read" : "admins:write";
  if (pathname.startsWith("/admin/notifications")) return method === "GET" ? "notifications:read" : "notifications:write";
  if (pathname.startsWith("/admin/outbound")) return method === "GET" ? "outbound:read" : "outbound:write";
  if (pathname.startsWith("/admin/rules/test")) return "rules:test";
  if (pathname.startsWith("/admin/rules")) return method === "GET" ? "rules:read" : "rules:write";
  if (pathname.startsWith("/admin/whitelist")) return method === "GET" ? "whitelist:read" : "whitelist:write";
  if (pathname.startsWith("/admin/mailboxes")) return method === "GET" ? "mailboxes:read" : "mailboxes:write";
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
  return "database constraint failed";
}
