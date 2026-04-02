import {
  addAuditLog,
  createRule,
  deleteRule,
  getRuleById,
  getRulesPaged,
  updateRule,
} from "../../core/db";
import { testRules } from "../../core/logic";
import { sendEventNotifications } from "../../core/notifications";
import { RULES_PAGE_SIZE } from "../../utils/constants";
import { clampPage, json, jsonError, readJsonBody } from "../../utils/utils";
import type { AuthSession, D1Database } from "../../server/types";
import { ensureActorCanManageGlobalSettings } from "../access-control";
import {
  buildResourceDeleteAuditDetail,
  readRequestAuditOperationNote,
  toRuleAuditSnapshot,
} from "../audit";
import { validateRuleBody } from "../validation";

export async function handleAdminRulesGet(
  url: URL,
  db: D1Database,
): Promise<Response> {
  const page = clampPage(url.searchParams.get("page"));
  const payload = await getRulesPaged(db, page, RULES_PAGE_SIZE);
  return json(payload);
}

export async function handleAdminRulesPost(
  request: Request,
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

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateRuleBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await createRule(db, validation.data);
  await addAuditLog(db, {
    action: "rule.create",
    actor,
    detail: validation.data,
    entity_type: "rule",
  });
  await sendEventNotifications(db, "rule.updated", {
    action: "create",
    remark: validation.data.remark,
  });
  return json({ ok: true });
}

export async function handleAdminRulesPut(
  pathname: string,
  request: Request,
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

  const id = Number(pathname.replace("/admin/rules/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid rule id", 400);

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const validation = validateRuleBody(parsed.data || {});
  if (!validation.ok) return jsonError(validation.error, 400);

  await updateRule(db, id, validation.data);
  await addAuditLog(db, {
    action: "rule.update",
    actor,
    detail: { id, ...validation.data },
    entity_id: String(id),
    entity_type: "rule",
  });
  await sendEventNotifications(db, "rule.updated", {
    action: "update",
    id,
    remark: validation.data.remark,
  });
  return json({ ok: true });
}

export async function handleAdminRulesDelete(
  pathname: string,
  request: Request,
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

  const id = Number(pathname.replace("/admin/rules/", ""));
  if (!Number.isFinite(id)) return jsonError("invalid rule id", 400);

  const operationNoteValidation = await readRequestAuditOperationNote(request);
  if (!operationNoteValidation.ok) {
    return jsonError(operationNoteValidation.error || "invalid JSON body", 400);
  }
  const operation_note = operationNoteValidation.operation_note;

  const existing = await getRuleById(db, id);
  if (!existing) return jsonError("rule not found", 404);

  await deleteRule(db, id);
  await addAuditLog(db, {
    action: "rule.delete",
    actor,
    detail: buildResourceDeleteAuditDetail(
      toRuleAuditSnapshot(existing),
      operation_note,
      { id },
    ),
    entity_id: String(id),
    entity_type: "rule",
  });
  await sendEventNotifications(db, "rule.updated", { action: "delete", id });
  return json({ ok: true });
}

export async function handleAdminRulesTest(
  request: Request,
  db: D1Database,
): Promise<Response> {
  const parsed = await readJsonBody<{ content?: string; sender?: string }>(
    request,
  );
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const sender = String(parsed.data?.sender || "")
    .trim()
    .toLowerCase();
  const content = String(parsed.data?.content || "");
  const rules = await getRulesPaged(db, 1, 10_000);
  const result = testRules(
    sender,
    content,
    rules.items.map((rule) => ({
      id: rule.id,
      pattern: rule.pattern,
      remark: rule.remark,
      sender_filter: rule.sender_filter,
    })),
  );
  return json(result);
}
