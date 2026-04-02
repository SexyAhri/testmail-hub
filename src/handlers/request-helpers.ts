import { validateWorkspaceAssignment } from "../core/db";
import type { D1Database } from "../server/types";

export function parseNotificationDeliveryIds(input: Record<string, unknown>):
  | { data: number[]; ok: true }
  | {
      error: string;
      ok: false;
    } {
  const ids = Array.isArray(input.delivery_ids) ? input.delivery_ids : [];
  const normalizedIds = Array.from(
    new Set(
      ids
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.floor(value)),
    ),
  );

  if (normalizedIds.length === 0) {
    return {
      error: "delivery_ids must contain at least one valid id",
      ok: false,
    };
  }

  return { data: normalizedIds, ok: true };
}

export async function resolveWorkspaceAssignment(
  db: D1Database,
  input: {
    environment_id?: number | null;
    mailbox_pool_id?: number | null;
    project_id?: number | null;
  },
) {
  try {
    return {
      ok: true as const,
      data: await validateWorkspaceAssignment(db, input),
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "invalid workspace assignment",
    };
  }
}
