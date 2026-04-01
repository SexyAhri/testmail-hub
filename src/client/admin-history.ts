import type { AuditLogRecord } from "./types";

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  if (!Array.isArray(value)) return [];

  return value
    .map(item => String(item || "").trim())
    .filter(Boolean);
}

export function getAdminHistoryOperationNote(record: Pick<AuditLogRecord, "detail_json">) {
  return readString(asObject(record.detail_json), "operation_note");
}

export function getAdminHistoryChangedFields(record: Pick<AuditLogRecord, "detail_json">) {
  return readStringArray(asObject(record.detail_json), "changed_fields");
}

export interface AdminHistorySummary {
  accessChangeCount: number;
  latestOperationNote: string;
  latestOperationNoteActor: string;
  latestOperationNoteAt: number | null;
  noteChangeCount: number;
  operationNoteCount: number;
  roleChangeCount: number;
  total: number;
}

export function summarizeAdminHistory(records: AuditLogRecord[]): AdminHistorySummary {
  let accessChangeCount = 0;
  let latestOperationNote = "";
  let latestOperationNoteActor = "";
  let latestOperationNoteAt: number | null = null;
  let noteChangeCount = 0;
  let operationNoteCount = 0;
  let roleChangeCount = 0;

  for (const record of records) {
    const changedFields = getAdminHistoryChangedFields(record);
    const operationNote = getAdminHistoryOperationNote(record);

    if (changedFields.includes("role")) roleChangeCount += 1;
    if (changedFields.includes("note")) noteChangeCount += 1;
    if (changedFields.includes("access_scope") || changedFields.includes("project_ids")) {
      accessChangeCount += 1;
    }
    if (operationNote) {
      operationNoteCount += 1;
      if (!latestOperationNote) {
        latestOperationNote = operationNote;
        latestOperationNoteActor = record.actor_name || "";
        latestOperationNoteAt = record.created_at || null;
      }
    }
  }

  return {
    accessChangeCount,
    latestOperationNote,
    latestOperationNoteActor,
    latestOperationNoteAt,
    noteChangeCount,
    operationNoteCount,
    roleChangeCount,
    total: records.length,
  };
}
