import {
  applyMailboxSyncCandidate,
  completeMailboxSyncRun,
  failMailboxSyncRun,
  getMailboxSyncRunById,
  getObservedMailboxStats,
  markMailboxSyncRunRunning,
  touchMailboxSyncRunHeartbeat,
} from "../../core/db";
import { captureError } from "../../core/errors";
import { getCloudflareMailboxSyncSnapshotByConfig } from "../../core/mailbox-sync";
import type {
  D1Database,
  MailboxSyncResult,
  MailboxSyncRunRecord,
  WorkerEnv,
} from "../../server/types";
import {
  getCloudflareDomainConfigs,
  getDomainPool,
} from "../domains/domain-assets";

const MAILBOX_SYNC_HEARTBEAT_INTERVAL_MS = 5_000;
const MAILBOX_SYNC_STALE_MS = 15 * 60 * 1000;
const MAILBOX_SYNC_STALE_ERROR =
  "mailbox sync job timed out without heartbeat; please retry";

export function isMailboxSyncRunActive(
  run: Pick<MailboxSyncRunRecord, "status"> | null | undefined,
): boolean {
  return run?.status === "pending" || run?.status === "running";
}

function isMailboxSyncRunStale(
  run:
    | Pick<
        MailboxSyncRunRecord,
        "created_at" | "started_at" | "status" | "updated_at"
      >
    | null
    | undefined,
  now = Date.now(),
): boolean {
  if (!isMailboxSyncRunActive(run)) return false;
  const heartbeatAt = Math.max(
    run?.updated_at || 0,
    run?.started_at || 0,
    run?.created_at || 0,
  );
  return now - heartbeatAt > MAILBOX_SYNC_STALE_MS;
}

export async function finalizeStaleMailboxSyncRun(
  db: D1Database,
  run: MailboxSyncRunRecord | null,
): Promise<MailboxSyncRunRecord | null> {
  if (!run || !isMailboxSyncRunStale(run)) return run;

  const finishedAt = Date.now();
  await failMailboxSyncRun(db, run.id, {
    error_message: MAILBOX_SYNC_STALE_ERROR,
    finished_at: finishedAt,
    started_at: run.started_at,
  });

  return getMailboxSyncRunById(db, run.id);
}

function createMailboxSyncHeartbeat(
  db: D1Database,
  jobId: number,
): (force?: boolean) => Promise<void> {
  let lastHeartbeatAt = 0;

  return async (force = false) => {
    const now = Date.now();
    if (!force && now - lastHeartbeatAt < MAILBOX_SYNC_HEARTBEAT_INTERVAL_MS) {
      return;
    }
    lastHeartbeatAt = now;
    await touchMailboxSyncRunHeartbeat(db, jobId, now);
  };
}

async function runMailboxSync(
  db: D1Database,
  env: WorkerEnv,
  heartbeat?: (force?: boolean) => Promise<void>,
): Promise<MailboxSyncResult> {
  const configuredDomains = await getDomainPool(db, env);
  const observed = await getObservedMailboxStats(db, configuredDomains);
  const domainConfigs = await getCloudflareDomainConfigs(db, env);
  const domainSummaries: MailboxSyncResult["domain_summaries"] = [];
  const cloudflareCandidates: Array<{
    address: string;
    created_by: string;
    is_enabled: boolean;
    last_received_at: number | null;
    receive_count: number;
  }> = [];

  const snapshotResults = await Promise.all(
    domainConfigs.map(async (item) => {
      try {
        const snapshot = await getCloudflareMailboxSyncSnapshotByConfig(
          item.config,
        );
        await heartbeat?.();
        return { domain: item.domain, ok: true as const, snapshot };
      } catch (error) {
        await heartbeat?.();
        return {
          domain: item.domain,
          error,
          ok: false as const,
        };
      }
    }),
  );

  for (const result of snapshotResults) {
    if (!result.ok) {
      throw result.error instanceof Error
        ? result.error
        : new Error("failed to sync Cloudflare email routes");
    }

    domainSummaries?.push({
      catch_all_enabled: result.snapshot.catch_all_enabled,
      cloudflare_configured: result.snapshot.configured,
      cloudflare_routes_total: result.snapshot.candidates.length,
      domain: result.domain,
    });

    cloudflareCandidates.push(
      ...result.snapshot.candidates.map(
        (candidate: {
          address: string;
          is_enabled: boolean;
          last_received_at: number | null;
          receive_count: number;
        }) => ({
          address: candidate.address,
          created_by: `system:cloudflare-mailbox-sync:${result.domain}`,
          is_enabled: candidate.is_enabled,
          last_received_at: candidate.last_received_at,
          receive_count: candidate.receive_count,
        }),
      ),
    );
  }

  const candidates = [
    ...observed.map((item) => ({
      address: item.address,
      created_by: "system:observed-mailbox-sync",
      is_enabled: true,
      last_received_at: item.last_received_at,
      receive_count: item.receive_count,
    })),
    ...cloudflareCandidates,
  ];

  let created_count = 0;
  let skipped_count = 0;
  let updated_count = 0;
  let processedCount = 0;

  for (const candidate of candidates) {
    const outcome = await applyMailboxSyncCandidate(db, candidate);
    if (outcome === "created") created_count += 1;
    else if (outcome === "updated") updated_count += 1;
    else skipped_count += 1;

    processedCount += 1;
    if (processedCount === 1 || processedCount % 25 === 0) {
      await heartbeat?.();
    }
  }

  await heartbeat?.(true);

  return {
    catch_all_enabled:
      domainSummaries?.some((item) => item.catch_all_enabled) || false,
    cloudflare_configured:
      domainSummaries?.some((item) => item.cloudflare_configured) || false,
    cloudflare_routes_total:
      domainSummaries?.reduce(
        (sum, item) => sum + item.cloudflare_routes_total,
        0,
      ) || 0,
    created_count,
    domain_summaries: domainSummaries,
    observed_total: observed.length,
    skipped_count,
    updated_count,
  };
}

export async function executeMailboxSyncRun(
  db: D1Database,
  env: WorkerEnv,
  jobId: number,
  requestedBy: string,
) {
  const startedAt = Date.now();
  await markMailboxSyncRunRunning(db, jobId);
  const heartbeat = createMailboxSyncHeartbeat(db, jobId);

  try {
    const result = await runMailboxSync(db, env, heartbeat);
    const finishedAt = Date.now();
    await completeMailboxSyncRun(db, jobId, {
      finished_at: finishedAt,
      result,
      started_at: startedAt,
    });
  } catch (error) {
    const finishedAt = Date.now();
    const message =
      error instanceof Error ? error.message : "failed to sync mailboxes";
    await captureError(
      db,
      "mailbox.cloudflare_sync_failed",
      new Error(message),
      {
        action: "background_sync",
        requested_by: requestedBy,
        route: "admin/mailboxes/sync",
      },
    );
    await failMailboxSyncRun(db, jobId, {
      error_message: message,
      finished_at: finishedAt,
      started_at: startedAt,
    });
  }
}
