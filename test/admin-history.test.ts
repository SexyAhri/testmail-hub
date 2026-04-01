import assert from "node:assert/strict";
import test from "node:test";

import {
  getAdminHistoryChangedFields,
  getAdminHistoryOperationNote,
  summarizeAdminHistory,
} from "../src/client/admin-history";
import type { AuditLogRecord } from "../src/client/types";

function buildAuditRecord(overrides: Partial<AuditLogRecord> = {}): AuditLogRecord {
  return {
    action: "admin.update",
    actor_id: "owner-1",
    actor_name: "Owner",
    actor_role: "owner",
    created_at: 1_700_000_000_000,
    detail_json: {},
    entity_id: "member-1",
    entity_type: "admin_user",
    id: 1,
    ...overrides,
  };
}

test("admin history helpers extract operation note and changed fields", () => {
  const record = buildAuditRecord({
    detail_json: {
      changed_fields: ["role", "project_ids"],
      operation_note: "按交接流程回收项目权限",
    },
  });

  assert.equal(getAdminHistoryOperationNote(record), "按交接流程回收项目权限");
  assert.deepEqual(getAdminHistoryChangedFields(record), ["role", "project_ids"]);
});

test("summarizeAdminHistory aggregates governance metrics from audit records", () => {
  const records = [
    buildAuditRecord({
      action: "admin.update",
      actor_name: "平台管理员",
      created_at: 1_700_000_001_000,
      detail_json: {
        changed_fields: ["role", "access_scope", "project_ids"],
        operation_note: "项目交接后收缩授权",
      },
      id: 2,
    }),
    buildAuditRecord({
      action: "admin.update",
      actor_name: "平台管理员",
      created_at: 1_700_000_000_500,
      detail_json: {
        changed_fields: ["note"],
      },
      id: 3,
    }),
    buildAuditRecord({
      action: "admin.create",
      actor_name: "Owner",
      created_at: 1_700_000_000_100,
      detail_json: {
        operation_note: "按值班计划新增成员",
      },
      id: 4,
    }),
  ];

  const summary = summarizeAdminHistory(records);

  assert.equal(summary.total, 3);
  assert.equal(summary.roleChangeCount, 1);
  assert.equal(summary.accessChangeCount, 1);
  assert.equal(summary.noteChangeCount, 1);
  assert.equal(summary.operationNoteCount, 2);
  assert.equal(summary.latestOperationNote, "项目交接后收缩授权");
  assert.equal(summary.latestOperationNoteActor, "平台管理员");
  assert.equal(summary.latestOperationNoteAt, 1_700_000_001_000);
});
