import {
  addAuditLog,
  backfillMailboxWorkspaceScope,
  createMailbox,
  createMailboxSyncRun,
  deleteMailbox,
  getActiveMailboxSyncRun,
  getLatestMailboxSyncRun,
  getMailboxById,
  getMailboxSyncRunById,
  getMailboxesPaged,
  resolveMailboxExpirationTimestamp,
  resolveRetentionPolicyConfig,
  updateMailbox,
} from "../../core/db";
import {
  deleteCloudflareMailboxRouteByConfig,
  isCloudflareMailboxRouteConfigConfigured,
  upsertCloudflareMailboxRouteByConfig,
} from "../../core/mailbox-sync";
import { captureError } from "../../core/errors";
import { MAILBOX_PAGE_SIZE } from "../../utils/constants";
import {
  clampNumber,
  clampPage,
  json,
  jsonError,
  normalizeEmailAddress,
  readJsonBody,
} from "../../utils/utils";
import type {
  AuthSession,
  D1Database,
  WorkerEnv,
  WorkerExecutionContext,
} from "../../server/types";
import {
  ensureActorCanAccessProject,
  ensureActorCanManageGlobalSettings,
  ensureActorCanWrite,
  getActorProjectIds,
} from "../access-control";
import {
  buildResourceDeleteAuditDetail,
  readRequestAuditOperationNote,
  toMailboxAuditSnapshot,
} from "../audit";
import {
  getDefaultMailboxDomain,
  getDomainPool,
  resolveMailboxSyncConfig,
} from "../domains/domain-assets";
import {
  executeMailboxSyncRun,
  finalizeStaleMailboxSyncRun,
  isMailboxSyncRunActive,
} from "./mailbox-sync-jobs";
import { resolveWorkspaceAssignment } from "../request-helpers";
import {
  normalizeNullable,
  parseOptionalId,
  validateMailboxBody,
} from "../validation";

export async function handleAdminMailboxesGet(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  const payload = await getMailboxesPaged(
    db,
    page,
    MAILBOX_PAGE_SIZE,
    {
      environment_id: clampNumber(url.searchParams.get("environment_id"), {
        min: 1,
      }),
      includeDeleted: url.searchParams.get("include_deleted") === "1",
      keyword: normalizeNullable(url.searchParams.get("keyword")),
      mailbox_pool_id: clampNumber(url.searchParams.get("mailbox_pool_id"), {
        min: 1,
      }),
      project_id: clampNumber(url.searchParams.get("project_id"), { min: 1 }),
    },
    getActorProjectIds(actor),
  );
  return json(payload);
}

export async function handleAdminMailboxesSync(
  db: D1Database,
  env: WorkerEnv,
  actor?: AuthSession,
  ctx?: WorkerExecutionContext,
): Promise<Response> {
  if (actor) {
    try {
      ensureActorCanManageGlobalSettings(actor);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "permission denied",
        403,
      );
    }
  }
  const existingRun = await finalizeStaleMailboxSyncRun(
    db,
    await getActiveMailboxSyncRun(db),
  );
  if (existingRun && isMailboxSyncRunActive(existingRun)) {
    return json(
      {
        job_id: existingRun.id,
        started_at: existingRun.started_at,
        status: existingRun.status,
      },
      202,
    );
  }

  const startedAt = Date.now();
  const requestedBy = actor?.username || "system";
  const jobId = await createMailboxSyncRun(db, {
    requested_by: requestedBy,
    started_at: startedAt,
    status: "pending",
    trigger_source: "manual",
  });

  const task = executeMailboxSyncRun(db, env, jobId, requestedBy);
  if (ctx) {
    ctx.waitUntil(task);
  } else {
    await task;
  }

  return json(
    {
      job_id: jobId,
      started_at: startedAt,
      status: "pending",
    },
    202,
  );
}

export async function handleAdminMailboxSyncRunGet(
  pathname: string,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageGlobalSettings(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const match = pathname.match(/^\/admin\/mailboxes\/sync-runs\/(\d+)$/);
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0) {
    return jsonError("invalid sync job id", 400);
  }

  const record = await finalizeStaleMailboxSyncRun(
    db,
    await getMailboxSyncRunById(db, id),
  );
  if (!record) return jsonError("sync job not found", 404);
  return json(record);
}

export async function handleAdminMailboxSyncRunLatestGet(
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageGlobalSettings(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  return json(
    await finalizeStaleMailboxSyncRun(db, await getLatestMailboxSyncRun(db)),
  );
}

export async function handleAdminMailboxesPost(
  request: Request,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const requestedScope = {
    environment_id: parseOptionalId(parsed.data?.environment_id),
    mailbox_pool_id: parseOptionalId(parsed.data?.mailbox_pool_id),
    project_id: parseOptionalId(parsed.data?.project_id),
  };
  const workspaceScope = await resolveWorkspaceAssignment(db, requestedScope);
  if (!workspaceScope.ok) return jsonError(workspaceScope.error, 400);
  try {
    ensureActorCanAccessProject(actor, workspaceScope.data.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const mailboxDomainOptions = { allowMailboxCreationOnly: true };
  const defaultDomain = await getDefaultMailboxDomain(
    db,
    env,
    actor,
    workspaceScope.data,
    mailboxDomainOptions,
  );

  const validation = validateMailboxBody(parsed.data || {}, defaultDomain);
  if (!validation.ok) return jsonError(validation.error, 400);
  const domainPool = new Set(
    await getDomainPool(
      db,
      env,
      actor,
      workspaceScope.data,
      mailboxDomainOptions,
    ),
  );
  if (
    domainPool.size > 0 &&
    validation.data.some(
      (item) =>
        !domainPool.has(
          normalizeEmailAddress(item.address).split("@")[1] || "",
        ),
    )
  ) {
    return jsonError("domain is not configured", 400);
  }

  const resolvedRetention = await resolveRetentionPolicyConfig(
    db,
    workspaceScope.data,
  );
  const mailboxExpiryNow = Date.now();

  for (const mailbox of validation.data) {
    const mailboxDomain =
      normalizeEmailAddress(mailbox.address).split("@")[1] || "";
    const syncConfig = await resolveMailboxSyncConfig(db, env, mailboxDomain);
    if (isCloudflareMailboxRouteConfigConfigured(syncConfig)) {
      try {
        await upsertCloudflareMailboxRouteByConfig(syncConfig, {
          address: mailbox.address,
          is_enabled: mailbox.is_enabled,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "failed to sync mailbox route to Cloudflare";
        await captureError(
          db,
          "mailbox.cloudflare_sync_failed",
          new Error(message),
          {
            action: "create",
            address: mailbox.address,
            actor: actor.username,
          },
        );
        return jsonError(message, 502);
      }
    }
    const createdMailbox = await createMailbox(db, {
      ...mailbox,
      ...workspaceScope.data,
      created_by: actor.username,
      expires_at: resolveMailboxExpirationTimestamp(
        mailbox.expires_at,
        resolvedRetention,
        mailboxExpiryNow,
      ),
    });
    await backfillMailboxWorkspaceScope(db, createdMailbox, [
      createdMailbox.address,
    ]);
  }

  await addAuditLog(db, {
    action: "mailbox.create",
    actor,
    detail: {
      addresses: validation.data.map((item) => item.address),
      count: validation.data.length,
      ...workspaceScope.data,
    },
    entity_type: "mailbox",
  });
  return json({
    count: validation.data.length,
    mailboxes: validation.data,
    ok: true,
  });
}

export async function handleAdminMailboxesPut(
  pathname: string,
  request: Request,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = Number(pathname.replace("/admin/mailboxes/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid mailbox id", 400);
  const existing = await getMailboxById(db, id, getActorProjectIds(actor));
  if (!existing || existing.deleted_at !== null) {
    return jsonError("mailbox not found", 404);
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const requestedScope = {
    environment_id: parseOptionalId(parsed.data?.environment_id),
    mailbox_pool_id: parseOptionalId(parsed.data?.mailbox_pool_id),
    project_id: parseOptionalId(parsed.data?.project_id),
  };
  const workspaceScope = await resolveWorkspaceAssignment(db, requestedScope);
  if (!workspaceScope.ok) return jsonError(workspaceScope.error, 400);
  try {
    ensureActorCanAccessProject(actor, workspaceScope.data.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const mailboxDomainOptions = { allowMailboxCreationOnly: true };
  const defaultDomain = await getDefaultMailboxDomain(
    db,
    env,
    actor,
    workspaceScope.data,
    mailboxDomainOptions,
  );

  const validation = validateMailboxBody(
    parsed.data || {},
    defaultDomain,
    false,
  );
  if (!validation.ok) return jsonError(validation.error, 400);
  const domainPool = new Set(
    await getDomainPool(
      db,
      env,
      actor,
      workspaceScope.data,
      mailboxDomainOptions,
    ),
  );
  if (
    domainPool.size > 0 &&
    validation.data.some((item) => {
      const nextDomain =
        normalizeEmailAddress(item.address).split("@")[1] || "";
      const existingDomain =
        normalizeEmailAddress(existing.address).split("@")[1] || "";
      return nextDomain !== existingDomain && !domainPool.has(nextDomain);
    })
  ) {
    return jsonError("domain is not configured", 400);
  }

  const nextMailbox = validation.data[0];
  const nextDomain =
    normalizeEmailAddress(nextMailbox.address).split("@")[1] || "";
  const existingDomain =
    normalizeEmailAddress(existing.address).split("@")[1] || "";
  const nextSyncConfig = await resolveMailboxSyncConfig(db, env, nextDomain);
  const existingSyncConfig = await resolveMailboxSyncConfig(
    db,
    env,
    existingDomain,
  );
  if (
    isCloudflareMailboxRouteConfigConfigured(nextSyncConfig) ||
    isCloudflareMailboxRouteConfigConfigured(existingSyncConfig)
  ) {
    try {
      if (isCloudflareMailboxRouteConfigConfigured(nextSyncConfig)) {
        await upsertCloudflareMailboxRouteByConfig(nextSyncConfig, {
          address: nextMailbox.address,
          is_enabled: nextMailbox.is_enabled,
        });
      }

      const existingAddress = normalizeEmailAddress(existing.address);
      const nextAddress = normalizeEmailAddress(nextMailbox.address);
      if (
        existingAddress &&
        nextAddress &&
        existingAddress !== nextAddress &&
        isCloudflareMailboxRouteConfigConfigured(existingSyncConfig)
      ) {
        await deleteCloudflareMailboxRouteByConfig(
          existingSyncConfig,
          existingAddress,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "failed to sync mailbox route to Cloudflare";
      await captureError(
        db,
        "mailbox.cloudflare_sync_failed",
        new Error(message),
        {
          action: "update",
          actor: actor.username,
          mailbox_id: id,
          next_address: nextMailbox.address,
          previous_address: existing.address,
        },
      );
      return jsonError(message, 502);
    }
  }

  const updatedMailbox = await updateMailbox(db, id, {
    ...nextMailbox,
    ...workspaceScope.data,
  });
  await backfillMailboxWorkspaceScope(db, updatedMailbox, [
    existing.address,
    updatedMailbox.address,
  ]);
  await addAuditLog(db, {
    action: "mailbox.update",
    actor,
    detail: { id, ...nextMailbox, ...workspaceScope.data },
    entity_id: String(id),
    entity_type: "mailbox",
  });
  return json({ mailbox: nextMailbox, ok: true });
}

export async function handleAdminMailboxesDelete(
  pathname: string,
  request: Request,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanWrite(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "permission denied",
      403,
    );
  }

  const id = Number(pathname.replace("/admin/mailboxes/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid mailbox id", 400);
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;
  const existing = await getMailboxById(db, id, getActorProjectIds(actor));
  if (!existing || existing.deleted_at !== null) {
    return jsonError("mailbox not found", 404);
  }

  const existingDomain =
    normalizeEmailAddress(existing.address).split("@")[1] || "";
  const syncConfig = await resolveMailboxSyncConfig(db, env, existingDomain);
  if (isCloudflareMailboxRouteConfigConfigured(syncConfig)) {
    try {
      await deleteCloudflareMailboxRouteByConfig(syncConfig, existing.address);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "failed to delete Cloudflare mailbox route";
      await captureError(
        db,
        "mailbox.cloudflare_sync_failed",
        new Error(message),
        {
          action: "delete",
          actor: actor.username,
          address: existing.address,
          mailbox_id: id,
        },
      );
      return jsonError(message, 502);
    }
  }

  await deleteMailbox(db, id);
  await addAuditLog(db, {
    action: "mailbox.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toMailboxAuditSnapshot(existing),
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "mailbox",
  });
  return json({ ok: true });
}
