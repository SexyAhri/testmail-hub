import assert from "node:assert/strict";
import test from "node:test";

import { handleAdminMailboxesDelete } from "../src/handlers/handlers";
import type { AuthSession, D1Database, D1PreparedStatement, WorkerEnv } from "../src/server/types";

const ownerActor: AuthSession = {
  access_scope: "all",
  auth_kind: "bootstrap_token",
  display_name: "Owner",
  expires_at: Date.now() + 60_000,
  nonce: "n",
  role: "owner",
  user_agent_hash: "ua",
  user_id: "owner-1",
  username: "owner",
};

test("handleAdminMailboxesDelete records operation note and mailbox snapshot", async () => {
  const auditRows: unknown[][] = [];

  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      let params: unknown[] = [];

      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        all: async () => ({ results: [] }),
        first: async () => {
          if (query.includes("FROM mailboxes m") && query.includes("WHERE m.id = ?")) {
            return {
              address: "qa@example.com",
              created_at: 1,
              created_by: "owner",
              deleted_at: null,
              environment_id: 8,
              environment_name: "Production",
              environment_slug: "production",
              expires_at: 1_700_000_000_000,
              id: Number(params[0]),
              is_enabled: 1,
              last_received_at: 1_700_000_100_000,
              mailbox_pool_id: 12,
              mailbox_pool_name: "Regression Pool",
              mailbox_pool_slug: "regression-pool",
              note: "Mailbox for smoke tests",
              project_id: 5,
              project_name: "Primary Project",
              project_slug: "primary-project",
              receive_count: 9,
              tags: JSON.stringify(["smoke", "qa"]),
              updated_at: 1,
            };
          }
          return null;
        },
        run: async () => {
          if (query.startsWith("INSERT INTO audit_logs")) {
            auditRows.push(params);
          }
          return {};
        },
      };
    },
  };

  const env = {
    MAILBOX_DOMAIN: "mail.vixenahri.cn",
  } as WorkerEnv;

  const request = new Request("https://example.com/admin/mailboxes/9", {
    body: JSON.stringify({
      operation_note: "Retire expired smoke-test mailbox",
    }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });

  const response = await handleAdminMailboxesDelete("/admin/mailboxes/9", request, db, env, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "mailbox.delete");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.address, "qa@example.com");
  assert.equal(detail.project_name, "Primary Project");
  assert.equal(detail.environment_name, "Production");
  assert.equal(detail.mailbox_pool_name, "Regression Pool");
  assert.equal(detail.operation_note, "Retire expired smoke-test mailbox");
  assert.deepEqual(detail.tags, ["qa", "smoke"]);
  assert.equal(detail.deleted?.receive_count, 9);
});
