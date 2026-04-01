import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminRulesDelete,
  handleAdminWhitelistDelete,
} from "../src/handlers/handlers";
import type { AuthSession, D1Database, D1PreparedStatement } from "../src/server/types";

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

test("handleAdminRulesDelete records operation note and rule snapshot", async () => {
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
          if (query.includes("FROM rules WHERE id = ? LIMIT 1")) {
            return {
              created_at: 1,
              id: Number(params[0]),
              is_enabled: 1,
              pattern: "\\b\\d{6}\\b",
              remark: "OpenAI code rule",
              sender_filter: "noreply@openai.com",
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

  const request = new Request("https://example.com/admin/rules/7", {
    body: JSON.stringify({
      operation_note: "Remove obsolete OpenAI code matcher",
    }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });

  const response = await handleAdminRulesDelete("/admin/rules/7", request, db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "rule.delete");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.remark, "OpenAI code rule");
  assert.equal(detail.sender_filter, "noreply@openai.com");
  assert.equal(detail.operation_note, "Remove obsolete OpenAI code matcher");
  assert.equal(detail.deleted?.pattern, "\\b\\d{6}\\b");
});

test("handleAdminWhitelistDelete records operation note and whitelist snapshot", async () => {
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
          if (query.includes("FROM whitelist WHERE id = ? LIMIT 1")) {
            return {
              created_at: 1,
              id: Number(params[0]),
              is_enabled: 1,
              note: "Allow trusted GitHub sender",
              sender_pattern: "notifications@github.com$",
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

  const request = new Request("https://example.com/admin/whitelist/3", {
    body: JSON.stringify({
      operation_note: "Remove obsolete trusted sender exception",
    }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });

  const response = await handleAdminWhitelistDelete("/admin/whitelist/3", request, db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "whitelist.delete");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.note, "Allow trusted GitHub sender");
  assert.equal(detail.sender_pattern, "notifications@github.com$");
  assert.equal(detail.operation_note, "Remove obsolete trusted sender exception");
  assert.equal(detail.deleted?.is_enabled, true);
});
