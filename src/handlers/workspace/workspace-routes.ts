import { getWorkspaceCatalog } from "../../core/db";
import { json } from "../../utils/utils";
import type { AuthSession, D1Database } from "../../server/types";
import { getScopedProjectIds } from "../access-control";

export async function handleAdminWorkspaceCatalog(
  url: URL,
  db: D1Database,
  actor: AuthSession,
): Promise<Response> {
  const includeDisabled = url.searchParams.get("include_disabled") === "1";
  return json(
    await getWorkspaceCatalog(db, includeDisabled, getScopedProjectIds(actor)),
  );
}
