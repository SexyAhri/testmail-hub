import {
  addAuditLog,
  createDomainAsset,
  deleteDomainAsset,
  getDomainAssetById,
  getDomainAssetUsageStats,
  getDomainAssetWithSecretById,
  getDomainAssetsPaged,
  getDomainRoutingProfileById,
  updateDomainAsset,
} from "../../core/db";
import {
  deleteCloudflareMailboxRouteByConfig,
  getCloudflareMailboxSyncSnapshotByConfig,
  isCloudflareMailboxRouteConfigConfigured,
  resolveCloudflareMailboxRouteConfig,
  updateCloudflareCatchAllRuleByConfig,
  upsertCloudflareMailboxRouteByConfig,
} from "../../core/mailbox-sync";
import { captureError } from "../../core/errors";
import {
  getDomainProviderLabel,
  listDomainProviders,
} from "../../shared/domain-providers";
import { ADMIN_PAGE_SIZE } from "../../utils/constants";
import {
  clampNumber,
  clampPage,
  json,
  jsonError,
  normalizeEmailAddress,
  readJsonBody,
} from "../../utils/utils";
import type { AuthSession, D1Database, WorkerEnv } from "../../server/types";
import {
  ensureActorCanAccessProject,
  ensureActorCanManageDomains,
  getScopedProjectIds,
} from "../access-control";
import {
  buildAuditChangedFields,
  buildAuditedDomainAssetSnapshot,
  buildResourceDeleteAuditDetail,
  buildResourceUpdateAuditDetail,
  describeDomainCloudflareToken,
  readRequestAuditOperationNote,
  withAuditOperationNote,
} from "../audit";
import {
  describeActiveMailboxCount,
  domainAllowsCatchAllSync,
  domainAllowsMailboxRouteSync,
  getDefaultMailboxDomain,
  getDomainActiveMailboxTotal,
  getDomainPool,
  listDomainAssetStatusRecords,
  resolveDomainCloudflareApiToken,
  resolveEffectiveDomainCatchAllPolicy,
  routingProfileMatchesWorkspace,
  type DomainPoolOptions,
  type DomainWorkspaceScope,
} from "./domain-assets";
import { resolveWorkspaceAssignment } from "../request-helpers";
import { validateDomainAssetBody } from "../validation";

export async function handleAdminDomains(
  url: URL,
  db: D1Database,
  actor: AuthSession,
  env: WorkerEnv,
): Promise<Response> {
  const purpose = String(url.searchParams.get("purpose") || "")
    .trim()
    .toLowerCase();
  const domainPoolOptions: DomainPoolOptions = {
    allowMailboxCreationOnly: purpose === "mailbox_create",
  };
  const requestedScope = {
    environment_id: clampNumber(url.searchParams.get("environment_id"), {
      min: 1,
    }),
    project_id: clampNumber(url.searchParams.get("project_id"), { min: 1 }),
  };
  const hasWorkspaceFilter =
    requestedScope.project_id !== null ||
    requestedScope.environment_id !== null;

  let workspace: DomainWorkspaceScope | null | undefined;
  if (hasWorkspaceFilter) {
    const resolvedScope = await resolveWorkspaceAssignment(db, requestedScope);
    if (!resolvedScope.ok) return jsonError(resolvedScope.error, 400);
    try {
      ensureActorCanAccessProject(actor, resolvedScope.data.project_id);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "project access denied",
        403,
      );
    }
    workspace = {
      environment_id: resolvedScope.data.environment_id,
      project_id: resolvedScope.data.project_id,
    };
  }

  const domains = await getDomainPool(
    db,
    env,
    actor,
    workspace,
    domainPoolOptions,
  );
  const default_domain = await getDefaultMailboxDomain(
    db,
    env,
    actor,
    workspace,
    domainPoolOptions,
  );
  return json({ default_domain, domains });
}

export async function handleAdminDomainAssetsGet(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  return json(
    await getDomainAssetsPaged(
      db,
      page,
      ADMIN_PAGE_SIZE,
      getScopedProjectIds(actor),
    ),
  );
}

export async function handleAdminDomainAssetsStatusGet(
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  return json(await listDomainAssetStatusRecords(db, env, actor));
}

export async function handleAdminDomainProvidersGet(): Promise<Response> {
  return json(listDomainProviders());
}

export async function handleAdminDomainAssetsPost(
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "domain access denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateDomainAssetBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const workspaceScope = await resolveWorkspaceAssignment(db, validation.scope);
  if (!workspaceScope.ok) return jsonError(workspaceScope.error, 400);
  try {
    ensureActorCanAccessProject(actor, workspaceScope.data.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  if (validation.data.routing_profile_id) {
    const routingProfile = await getDomainRoutingProfileById(
      db,
      validation.data.routing_profile_id,
    );
    if (!routingProfile) return jsonError("routing profile not found", 404);
    if (routingProfile.provider !== validation.data.provider) {
      return jsonError(
        "routing profile provider does not match domain provider",
        400,
      );
    }
    if (!routingProfileMatchesWorkspace(routingProfile, workspaceScope.data)) {
      return jsonError("routing profile does not match domain workspace", 400);
    }
  }

  const tokenResolution = resolveDomainCloudflareApiToken(
    null,
    validation.data,
  );
  if (!tokenResolution.ok) return jsonError(tokenResolution.error, 400);

  const {
    operation_note,
    cloudflare_api_token: _submittedCloudflareApiToken,
    cloudflare_api_token_mode: _submittedCloudflareApiTokenMode,
    ...validatedAsset
  } = validation.data;
  const nextAsset = {
    ...validatedAsset,
    cloudflare_api_token: tokenResolution.value,
    ...workspaceScope.data,
  };
  const id = await createDomainAsset(db, nextAsset);
  await addAuditLog(db, {
    action: "domain.create",
    actor,
    detail: withAuditOperationNote(
      {
        id,
        ...buildAuditedDomainAssetSnapshot(nextAsset),
      },
      operation_note,
    ),
    entity_id: String(id),
    entity_type: "domain",
  });
  return json({ ok: true });
}

export async function handleAdminDomainAssetsPut(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "domain access denied",
      403,
    );
  }

  const match = pathname.match(/^\/admin\/domain-assets\/(\d+)$/);
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0) {
    return jsonError("invalid domain id", 400);
  }

  const existing = await getDomainAssetWithSecretById(db, id);
  if (!existing) return jsonError("domain not found", 404);
  try {
    ensureActorCanAccessProject(actor, existing.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateDomainAssetBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  const workspaceScope = await resolveWorkspaceAssignment(db, validation.scope);
  if (!workspaceScope.ok) return jsonError(workspaceScope.error, 400);
  try {
    ensureActorCanAccessProject(actor, workspaceScope.data.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  if (validation.data.routing_profile_id) {
    const routingProfile = await getDomainRoutingProfileById(
      db,
      validation.data.routing_profile_id,
    );
    if (!routingProfile) return jsonError("routing profile not found", 404);
    if (routingProfile.provider !== validation.data.provider) {
      return jsonError(
        "routing profile provider does not match domain provider",
        400,
      );
    }
    if (!routingProfileMatchesWorkspace(routingProfile, workspaceScope.data)) {
      return jsonError("routing profile does not match domain workspace", 400);
    }
  }

  const tokenResolution = resolveDomainCloudflareApiToken(
    existing,
    validation.data,
  );
  if (!tokenResolution.ok) return jsonError(tokenResolution.error, 400);

  const {
    operation_note,
    cloudflare_api_token: _submittedCloudflareApiToken,
    cloudflare_api_token_mode: _submittedCloudflareApiTokenMode,
    ...validatedAsset
  } = validation.data;
  const nextAsset = {
    ...validatedAsset,
    cloudflare_api_token: tokenResolution.value,
    ...workspaceScope.data,
  };
  const mutatesActiveMailboxOwnership =
    existing.domain !== nextAsset.domain ||
    existing.project_id !== nextAsset.project_id ||
    existing.environment_id !== nextAsset.environment_id;
  const disablesDomain = existing.is_enabled && !nextAsset.is_enabled;
  if (mutatesActiveMailboxOwnership || disablesDomain) {
    const activeMailboxTotal = await getDomainActiveMailboxTotal(
      db,
      existing.domain,
    );
    if (activeMailboxTotal > 0) {
      const mailboxSummary = describeActiveMailboxCount(activeMailboxTotal);
      if (existing.domain !== nextAsset.domain) {
        return jsonError(
          `cannot change domain while ${mailboxSummary} still use ${existing.domain}; disable or delete those mailboxes first`,
          409,
        );
      }
      if (
        existing.project_id !== nextAsset.project_id ||
        existing.environment_id !== nextAsset.environment_id
      ) {
        return jsonError(
          `cannot move domain workspace while ${mailboxSummary} still use ${existing.domain}; migrate or delete those mailboxes first`,
          409,
        );
      }
      if (disablesDomain) {
        return jsonError(
          `cannot disable domain while ${mailboxSummary} still use ${existing.domain}; disable or delete those mailboxes first`,
          409,
        );
      }
    }
  }

  await updateDomainAsset(db, id, nextAsset);
  const governanceChanged =
    existing.allow_new_mailboxes !== nextAsset.allow_new_mailboxes ||
    existing.allow_catch_all_sync !== nextAsset.allow_catch_all_sync ||
    existing.allow_mailbox_route_sync !== nextAsset.allow_mailbox_route_sync;
  const changeKinds = new Set<string>();
  if (governanceChanged) changeKinds.add("governance");
  if (
    existing.domain !== nextAsset.domain ||
    existing.provider !== nextAsset.provider ||
    existing.zone_id !== nextAsset.zone_id ||
    existing.email_worker !== nextAsset.email_worker ||
    existing.mailbox_route_forward_to !== nextAsset.mailbox_route_forward_to ||
    existing.cloudflare_api_token !== nextAsset.cloudflare_api_token ||
    existing.catch_all_mode !== nextAsset.catch_all_mode ||
    existing.catch_all_forward_to !== nextAsset.catch_all_forward_to ||
    existing.routing_profile_id !== nextAsset.routing_profile_id ||
    existing.is_enabled !== nextAsset.is_enabled ||
    existing.is_primary !== nextAsset.is_primary ||
    existing.note !== nextAsset.note ||
    existing.project_id !== nextAsset.project_id ||
    existing.environment_id !== nextAsset.environment_id
  ) {
    changeKinds.add("config");
  }
  const auditAction =
    governanceChanged && changeKinds.size === 1
      ? "domain.governance.update"
      : "domain.update";
  const previous = buildAuditedDomainAssetSnapshot(existing);
  const next = buildAuditedDomainAssetSnapshot(nextAsset);
  await addAuditLog(db, {
    action: auditAction,
    actor,
    detail: buildResourceUpdateAuditDetail(
      previous,
      next,
      [
        "allow_catch_all_sync",
        "allow_mailbox_route_sync",
        "allow_new_mailboxes",
        "catch_all_forward_to",
        "catch_all_mode",
        "cloudflare_api_token_configured",
        "cloudflare_api_token_mode",
        "domain",
        "email_worker",
        "environment_id",
        "is_enabled",
        "is_primary",
        "mailbox_route_forward_to",
        "note",
        "project_id",
        "provider",
        "routing_profile_id",
        "zone_id",
      ],
      operation_note,
      {
        id,
        change_kinds: Array.from(changeKinds),
        previous_governance: {
          allow_catch_all_sync: existing.allow_catch_all_sync,
          allow_mailbox_route_sync: existing.allow_mailbox_route_sync,
          allow_new_mailboxes: existing.allow_new_mailboxes,
        },
        next_governance: {
          allow_catch_all_sync: nextAsset.allow_catch_all_sync,
          allow_mailbox_route_sync: nextAsset.allow_mailbox_route_sync,
          allow_new_mailboxes: nextAsset.allow_new_mailboxes,
        },
        previous_scope: {
          environment_id: existing.environment_id,
          project_id: existing.project_id,
        },
        previous_cloudflare_token: describeDomainCloudflareToken(existing),
        next_cloudflare_token: describeDomainCloudflareToken(nextAsset),
      },
    ),
    entity_id: String(id),
    entity_type: "domain",
  });
  return json({ ok: true });
}

export async function handleAdminDomainAssetsDelete(
  pathname: string,
  request: Request,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "domain access denied",
      403,
    );
  }

  const match = pathname.match(/^\/admin\/domain-assets\/(\d+)$/);
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0) {
    return jsonError("invalid domain id", 400);
  }
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const existing = await getDomainAssetById(db, id);
  if (!existing) return jsonError("domain not found", 404);
  try {
    ensureActorCanAccessProject(actor, existing.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }

  const activeMailboxTotal = await getDomainActiveMailboxTotal(
    db,
    existing.domain,
  );
  if (activeMailboxTotal > 0) {
    const mailboxSummary = describeActiveMailboxCount(activeMailboxTotal);
    return jsonError(
      `cannot delete domain while ${mailboxSummary} still use ${existing.domain}; disable or delete those mailboxes first`,
      409,
    );
  }

  await deleteDomainAsset(db, id);
  await addAuditLog(db, {
    action: "domain.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      buildAuditedDomainAssetSnapshot(existing),
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "domain",
  });
  return json({ ok: true });
}

export async function handleAdminDomainAssetsSyncCatchAll(
  pathname: string,
  request: Request,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "domain access denied",
      403,
    );
  }

  const match = pathname.match(
    /^\/admin\/domain-assets\/(\d+)\/sync-catch-all$/,
  );
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0) {
    return jsonError("invalid domain id", 400);
  }
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const asset = await getDomainAssetWithSecretById(db, id);
  if (!asset) return jsonError("domain not found", 404);
  try {
    ensureActorCanAccessProject(actor, asset.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }
  const effectivePolicy = resolveEffectiveDomainCatchAllPolicy(asset);
  if (effectivePolicy.catch_all_mode === "inherit") {
    return jsonError("catch-all policy is set to inherit", 400);
  }
  if (!domainAllowsCatchAllSync(asset)) {
    return jsonError("catch-all sync is disabled for this domain", 400);
  }

  const config = domainAllowsCatchAllSync(asset)
    ? resolveCloudflareMailboxRouteConfig(env, {
        api_token: asset.cloudflare_api_token,
        domain: asset.domain,
        email_worker: asset.email_worker,
        mailbox_route_forward_to: asset.mailbox_route_forward_to,
        zone_id: asset.zone_id,
      })
    : null;
  if (!isCloudflareMailboxRouteConfigConfigured(config)) {
    return jsonError(
      `${getDomainProviderLabel(asset.provider)} does not expose catch-all sync for this domain`,
      400,
    );
  }

  try {
    const previousSnapshot =
      await getCloudflareMailboxSyncSnapshotByConfig(config);
    const snapshot = await updateCloudflareCatchAllRuleByConfig(config, {
      enabled: effectivePolicy.catch_all_mode === "enabled",
      forward_to:
        effectivePolicy.catch_all_mode === "enabled"
          ? effectivePolicy.catch_all_forward_to
          : null,
    });
    const previous = {
      catch_all_enabled: previousSnapshot.catch_all_enabled,
      catch_all_forward_to: previousSnapshot.catch_all_forward_to,
    };
    const next = {
      catch_all_enabled: snapshot.catch_all_enabled,
      catch_all_forward_to: snapshot.catch_all_forward_to,
    };
    await addAuditLog(db, {
      action: "domain.catch_all_sync",
      actor,
      detail: withAuditOperationNote(
        {
          catch_all_mode: effectivePolicy.catch_all_mode,
          catch_all_source: effectivePolicy.catch_all_source,
          changed_fields: buildAuditChangedFields(previous, next, [
            "catch_all_enabled",
            "catch_all_forward_to",
          ]),
          configured: snapshot.configured,
          domain: asset.domain,
          id,
          next,
          previous,
          ...next,
        },
        operation_note,
      ),
      entity_id: String(id),
      entity_type: "domain",
    });
    return json({
      catch_all_enabled: snapshot.catch_all_enabled,
      catch_all_forward_to: snapshot.catch_all_forward_to,
      configured: snapshot.configured,
      ok: true,
    });
  } catch (error) {
    await captureError(db, "cloudflare.catch_all_sync_failed", error, {
      domain: asset.domain,
      domain_id: id,
    });
    return jsonError(
      error instanceof Error ? error.message : "failed to sync catch-all",
      502,
    );
  }
}

export async function handleAdminDomainAssetsSyncMailboxRoutes(
  pathname: string,
  request: Request,
  db: D1Database,
  env: WorkerEnv,
  actor: AuthSession,
): Promise<Response> {
  try {
    ensureActorCanManageDomains(actor);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "domain access denied",
      403,
    );
  }

  const match = pathname.match(
    /^\/admin\/domain-assets\/(\d+)\/sync-mailbox-routes$/,
  );
  const id = Number(match?.[1] || 0);
  if (!Number.isFinite(id) || id <= 0) {
    return jsonError("invalid domain id", 400);
  }
  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const asset = await getDomainAssetWithSecretById(db, id);
  if (!asset) return jsonError("domain not found", 404);
  try {
    ensureActorCanAccessProject(actor, asset.project_id);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "project access denied",
      403,
    );
  }
  if (!domainAllowsMailboxRouteSync(asset)) {
    return jsonError("mailbox route sync is disabled for this domain", 400);
  }

  const config = domainAllowsMailboxRouteSync(asset)
    ? resolveCloudflareMailboxRouteConfig(env, {
        api_token: asset.cloudflare_api_token,
        domain: asset.domain,
        email_worker: asset.email_worker,
        mailbox_route_forward_to: asset.mailbox_route_forward_to,
        zone_id: asset.zone_id,
      })
    : null;
  if (!isCloudflareMailboxRouteConfigConfigured(config)) {
    return jsonError(
      `${getDomainProviderLabel(asset.provider)} does not expose mailbox route sync for this domain`,
      400,
    );
  }

  const usageStats = await getDomainAssetUsageStats(
    db,
    [asset.domain],
    getScopedProjectIds(actor),
  );
  const expectedAddresses = Array.from(
    new Set(
      (usageStats[0]?.active_mailbox_addresses || [])
        .map((address) => normalizeEmailAddress(address))
        .filter(Boolean),
    ),
  ).sort();
  const expectedAddressSet = new Set(expectedAddresses);
  const effectivePolicy = resolveEffectiveDomainCatchAllPolicy(asset);

  if (effectivePolicy.catch_all_mode === "enabled" && expectedAddresses.length === 0) {
    return jsonError("pure catch-all domains do not manage explicit mailbox routes", 400);
  }

  try {
    const snapshot = await getCloudflareMailboxSyncSnapshotByConfig(config);
    const previous = {
      cloudflare_routes_total: snapshot.candidates.length,
      enabled_routes_total: snapshot.candidates.filter(
        (item) => item.is_enabled,
      ).length,
      expected_total: expectedAddresses.length,
      extra_total: 0,
    };
    const extraAddresses = Array.from(
      new Set(
        snapshot.candidates
          .map((candidate) => normalizeEmailAddress(candidate.address))
          .filter((address) => address && !expectedAddressSet.has(address)),
      ),
    ).sort();

    let created_count = 0;
    let deleted_count = 0;
    let skipped_count = 0;
    let updated_count = 0;

    for (const address of expectedAddresses) {
      const outcome = await upsertCloudflareMailboxRouteByConfig(config, {
        address,
        is_enabled: true,
      });
      if (outcome === "created") created_count += 1;
      else if (outcome === "updated") updated_count += 1;
      else skipped_count += 1;
    }

    for (const address of extraAddresses) {
      const outcome = await deleteCloudflareMailboxRouteByConfig(
        config,
        address,
      );
      if (outcome === "deleted") deleted_count += 1;
      else skipped_count += 1;
    }

    const nextSnapshot = await getCloudflareMailboxSyncSnapshotByConfig(config);
    previous.extra_total = extraAddresses.length;
    const next = {
      cloudflare_routes_total: nextSnapshot.candidates.length,
      enabled_routes_total: nextSnapshot.candidates.filter(
        (item) => item.is_enabled,
      ).length,
      expected_total: expectedAddresses.length,
      extra_total: nextSnapshot.candidates.filter(
        (item) => !expectedAddressSet.has(normalizeEmailAddress(item.address)),
      ).length,
    };
    await addAuditLog(db, {
      action: "domain.mailbox_route_sync",
      actor,
      detail: withAuditOperationNote(
        {
          changed_fields: buildAuditChangedFields(previous, next, [
            "cloudflare_routes_total",
            "enabled_routes_total",
            "extra_total",
          ]),
          cloudflare_routes_total: next.cloudflare_routes_total,
          created_count,
          deleted_count,
          domain: asset.domain,
          enabled_routes_total: next.enabled_routes_total,
          expected_total: expectedAddresses.length,
          extra_total: extraAddresses.length,
          id,
          next,
          previous,
          skipped_count,
          updated_count,
        },
        operation_note,
      ),
      entity_id: String(id),
      entity_type: "domain",
    });
    return json({
      cloudflare_routes_total: nextSnapshot.candidates.length,
      configured: nextSnapshot.configured,
      created_count,
      deleted_count,
      enabled_routes_total: nextSnapshot.candidates.filter(
        (item) => item.is_enabled,
      ).length,
      expected_total: expectedAddresses.length,
      ok: true,
      skipped_count,
      updated_count,
    });
  } catch (error) {
    await captureError(db, "cloudflare.mailbox_route_sync_failed", error, {
      domain: asset.domain,
      domain_id: id,
    });
    return jsonError(
      error instanceof Error ? error.message : "failed to sync mailbox routes",
      502,
    );
  }
}
