import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminEnvironmentsDelete,
  handleAdminMailboxPoolsDelete,
  handleAdminProjectsDelete,
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

test("handleAdminProjectsDelete records operation note in workspace project delete audit", async () => {
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
          if (query.includes("FROM projects WHERE id = ? LIMIT 1")) {
            return {
              created_at: 1,
              description: "Core workspace",
              id: Number(params[0]),
              is_enabled: 1,
              name: "Primary Project",
              slug: "primary-project",
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

  const request = new Request("https://example.com/admin/projects/5", {
    body: JSON.stringify({
      operation_note: "Retire migrated workspace project",
    }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });

  const response = await handleAdminProjectsDelete("/admin/projects/5", request, db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "workspace.project.delete");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.name, "Primary Project");
  assert.equal(detail.slug, "primary-project");
  assert.equal(detail.operation_note, "Retire migrated workspace project");
  assert.equal(detail.deleted?.description, "Core workspace");
});

test("handleAdminEnvironmentsDelete records operation note in workspace environment delete audit", async () => {
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
          if (query.includes("FROM environments e") && query.includes("WHERE e.id = ? LIMIT 1")) {
            return {
              created_at: 1,
              description: "Production environment",
              id: Number(params[0]),
              is_enabled: 1,
              name: "Production",
              project_id: 5,
              project_name: "Primary Project",
              project_slug: "primary-project",
              slug: "production",
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

  const request = new Request("https://example.com/admin/environments/8", {
    body: JSON.stringify({
      operation_note: "Remove retired production environment shell",
    }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });

  const response = await handleAdminEnvironmentsDelete("/admin/environments/8", request, db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "workspace.environment.delete");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.name, "Production");
  assert.equal(detail.project_name, "Primary Project");
  assert.equal(detail.operation_note, "Remove retired production environment shell");
  assert.equal(detail.deleted?.slug, "production");
});

test("handleAdminMailboxPoolsDelete records operation note in workspace mailbox pool delete audit", async () => {
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
          if (query.includes("FROM mailbox_pools mp") && query.includes("WHERE mp.id = ? LIMIT 1")) {
            return {
              created_at: 1,
              description: "Legacy pool for smoke tests",
              environment_id: 8,
              environment_name: "Production",
              environment_slug: "production",
              id: Number(params[0]),
              is_enabled: 1,
              name: "Legacy Pool",
              project_id: 5,
              project_name: "Primary Project",
              project_slug: "primary-project",
              slug: "legacy-pool",
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

  const request = new Request("https://example.com/admin/mailbox-pools/12", {
    body: JSON.stringify({
      operation_note: "Drop superseded mailbox pool",
    }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });

  const response = await handleAdminMailboxPoolsDelete("/admin/mailbox-pools/12", request, db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "workspace.mailbox_pool.delete");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.name, "Legacy Pool");
  assert.equal(detail.environment_name, "Production");
  assert.equal(detail.operation_note, "Drop superseded mailbox pool");
  assert.equal(detail.deleted?.slug, "legacy-pool");
});
