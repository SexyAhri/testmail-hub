import assert from "node:assert/strict";
import test from "node:test";

import {
  changedAdminRecently,
  hasAdminGovernanceNote,
  isHighPrivilegeAdmin,
  isMultiProjectAdmin,
  isPendingAdminLoginAfterChange,
  summarizeAdminGovernance,
} from "../src/client/admin-governance";
import type { AdminUserRecord } from "../src/client/types";

function buildAdminRecord(overrides: Partial<AdminUserRecord> = {}): AdminUserRecord {
  return {
    access_scope: "bound",
    created_at: 1_700_000_000_000,
    display_name: "成员",
    id: "member-1",
    is_enabled: true,
    last_login_at: 1_700_000_000_100,
    last_modified_action: "admin.update",
    last_modified_at: 1_700_000_000_050,
    last_modified_by: "owner",
    note: "默认备注",
    projects: [{ id: 1, name: "Alpha", slug: "alpha" }],
    role: "viewer",
    updated_at: 1_700_000_000_050,
    username: "member-1",
    ...overrides,
  };
}

test("admin governance helpers classify high privilege, cross-project and post-change login risk", () => {
  const highPrivilege = buildAdminRecord({
    access_scope: "all",
    role: "platform_admin",
  });
  const multiProject = buildAdminRecord({
    projects: [
      { id: 1, name: "Alpha", slug: "alpha" },
      { id: 2, name: "Beta", slug: "beta" },
    ],
    role: "project_admin",
  });
  const pendingLogin = buildAdminRecord({
    last_login_at: 1_700_000_000_000,
    last_modified_at: 1_700_000_000_500,
    note: "",
  });

  assert.equal(isHighPrivilegeAdmin(highPrivilege), true);
  assert.equal(isMultiProjectAdmin(multiProject), true);
  assert.equal(hasAdminGovernanceNote(pendingLogin), false);
  assert.equal(isPendingAdminLoginAfterChange(pendingLogin), true);
  assert.equal(changedAdminRecently(pendingLogin, 1_700_000_000_500 + 3 * 24 * 60 * 60 * 1000), true);
});

test("summarizeAdminGovernance aggregates member governance focus counts", () => {
  const records = [
    buildAdminRecord({
      access_scope: "all",
      role: "owner",
    }),
    buildAdminRecord({
      id: "member-2",
      last_login_at: null,
      last_modified_at: 1_700_000_001_000,
      note: "",
      projects: [
        { id: 1, name: "Alpha", slug: "alpha" },
        { id: 2, name: "Beta", slug: "beta" },
      ],
      role: "project_admin",
      username: "member-2",
    }),
    buildAdminRecord({
      id: "member-3",
      last_modified_at: 1_690_000_000_000,
      username: "member-3",
    }),
  ];

  const summary = summarizeAdminGovernance(records, 1_700_000_001_000);

  assert.equal(summary.highPrivilegeCount, 1);
  assert.equal(summary.multiProjectCount, 1);
  assert.equal(summary.missingNoteCount, 1);
  assert.equal(summary.pendingLoginAfterChangeCount, 1);
  assert.equal(summary.recentlyChangedCount, 2);
});
