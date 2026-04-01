import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminAdminsGet,
  handleAdminAuditLogs,
  handleAdminAdminsPost,
  handleAdminAdminsPut,
} from "../src/handlers/handlers";
import {
  hasAdminPermission,
  normalizeAdminRole,
} from "../src/utils/constants";
import type { AuthSession, D1Database, D1PreparedStatement } from "../src/server/types";

test("admin role normalization keeps legacy values compatible with the new role model", () => {
  assert.equal(normalizeAdminRole("admin", "all"), "platform_admin");
  assert.equal(normalizeAdminRole("admin", "bound"), "project_admin");
  assert.equal(normalizeAdminRole("analyst", "all"), "viewer");
  assert.equal(normalizeAdminRole("project_admin", "bound"), "project_admin");
  assert.equal(normalizeAdminRole("unknown", "all"), null);
  assert.equal(hasAdminPermission("admin", "admins:write", "bound"), true);
  assert.equal(hasAdminPermission("analyst", "emails:write", "all"), false);
});

test("project-scoped admin cannot create global admin accounts", async () => {
  const db: D1Database = {
    prepare(): D1PreparedStatement {
      return {
        all: async () => ({ results: [] }),
        bind() {
          return this;
        },
        first: async () => null,
        run: async () => ({}),
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "bound",
    auth_kind: "admin_user",
    display_name: "项目管理员",
    expires_at: Date.now() + 60_000,
    project_ids: [1],
    role: "project_admin",
    user_agent_hash: "ua",
    user_id: "project-admin-1",
    username: "project-admin",
  };

  const request = new Request("https://example.com/admin/admins", {
    body: JSON.stringify({
      access_scope: "all",
      display_name: "平台成员",
      is_enabled: true,
      password: "Password123!",
      role: "platform_admin",
      username: "platform-member",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const response = await handleAdminAdminsPost(request, db, actor);
  const payload = await response.json() as { message?: string };

  assert.equal(response.status, 400);
  assert.equal(payload.message, "project-scoped resource must use bound access_scope");
});

test("project-scoped admin cannot update members outside their bound projects", async () => {
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      let params: unknown[] = [];

      return {
        all: async () => {
          if (query.includes("FROM admin_project_bindings")) {
            return {
              results: [
                {
                  binding_id: "member-1",
                  project_id: 1,
                  project_name: "Alpha",
                  project_slug: "alpha",
                },
                {
                  binding_id: "member-1",
                  project_id: 2,
                  project_name: "Beta",
                  project_slug: "beta",
                },
              ],
            };
          }
          return { results: [] };
        },
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        first: async () => {
          if (query.includes("FROM admin_users WHERE id = ? LIMIT 1")) {
            if (params[0] === "member-1") {
              return {
                access_scope: "bound",
                display_name: "跨项目成员",
                id: "member-1",
                is_enabled: 1,
                role: "project_admin",
                username: "member-1",
              };
            }
          }
          return null;
        },
        run: async () => ({}),
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "bound",
    auth_kind: "admin_user",
    display_name: "项目管理员",
    expires_at: Date.now() + 60_000,
    project_ids: [1],
    role: "project_admin",
    user_agent_hash: "ua",
    user_id: "project-admin-1",
    username: "project-admin",
  };

  const request = new Request("https://example.com/admin/admins/member-1", {
    body: JSON.stringify({
      access_scope: "bound",
      display_name: "收敛后的成员",
      is_enabled: true,
      project_ids: [1],
      role: "operator",
    }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });

  const response = await handleAdminAdminsPut("/admin/admins/member-1", request, db, actor);
  const payload = await response.json() as { message?: string };

  assert.equal(response.status, 403);
  assert.equal(payload.message, "admin user is outside your scope");
});

test("admin update writes audit detail with previous and next member snapshot", async () => {
  let auditDetailJson = "";

  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      let params: unknown[] = [];

      return {
        all: async () => {
          if (query.includes("FROM admin_project_bindings")) {
            return {
              results: [
                {
                  binding_id: "member-1",
                  project_id: 1,
                  project_name: "Alpha",
                  project_slug: "alpha",
                },
              ],
            };
          }
          return { results: [] };
        },
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        first: async () => {
          if (query.includes("FROM admin_users WHERE id = ? LIMIT 1")) {
            return {
              access_scope: "bound",
              display_name: "旧成员名称",
              id: "member-1",
              is_enabled: 1,
              note: "旧备注",
              role: "viewer",
              username: "member-1",
            };
          }
          return null;
        },
        run: async () => {
          if (query.includes("INSERT INTO audit_logs")) {
            auditDetailJson = String(params[6] || "");
          }
          return {};
        },
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "admin_user",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    project_ids: [],
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner-1",
    username: "owner",
  };

  const request = new Request("https://example.com/admin/admins/member-1", {
    body: JSON.stringify({
      access_scope: "bound",
      display_name: "新成员名称",
      is_enabled: false,
      note: "新的职责备注",
      operation_note: "按交接单收缩成员权限",
      project_ids: [1],
      role: "operator",
    }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });

  const response = await handleAdminAdminsPut("/admin/admins/member-1", request, db, actor);
  const payload = JSON.parse(auditDetailJson) as {
    changed_fields: string[];
    next: Record<string, unknown>;
    operation_note?: string;
    previous: Record<string, unknown>;
  };

  assert.equal(response.status, 200);
  assert.equal(payload.previous.note, "旧备注");
  assert.equal(payload.next.note, "新的职责备注");
  assert.equal(payload.previous.role, "viewer");
  assert.equal(payload.next.role, "operator");
  assert.ok(payload.changed_fields.includes("display_name"));
  assert.ok(payload.changed_fields.includes("role"));
  assert.ok(payload.changed_fields.includes("is_enabled"));
  assert.ok(payload.changed_fields.includes("note"));
  assert.equal(payload.operation_note, "按交接单收缩成员权限");
});

test("admin create writes operation note into audit detail", async () => {
  let auditDetailJson = "";

  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      let params: unknown[] = [];

      return {
        all: async () => {
          if (query.includes("FROM admin_project_bindings")) {
            return { results: [] };
          }
          return { results: [] };
        },
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        first: async () => {
          if (query.includes("FROM admin_users WHERE username = ? LIMIT 1")) {
            return null;
          }
          return null;
        },
        run: async () => {
          if (query.includes("INSERT INTO audit_logs")) {
            auditDetailJson = String(params[6] || "");
          }
          return {};
        },
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "admin_user",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    project_ids: [],
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner-1",
    username: "owner",
  };

  const request = new Request("https://example.com/admin/admins", {
    body: JSON.stringify({
      access_scope: "all",
      display_name: "值班成员",
      is_enabled: true,
      note: "轮值支持",
      operation_note: "按本周值班计划新增",
      password: "Password123!",
      role: "viewer",
      username: "duty-viewer",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const response = await handleAdminAdminsPost(request, db, actor);
  const payload = JSON.parse(auditDetailJson) as {
    display_name: string;
    operation_note?: string;
    username: string;
  };

  assert.equal(response.status, 200);
  assert.equal(payload.username, "duty-viewer");
  assert.equal(payload.display_name, "值班成员");
  assert.equal(payload.operation_note, "按本周值班计划新增");
});

test("admin list GET applies server-side filters", async () => {
  const preparedStatements: Array<{ params: unknown[]; query: string }> = [];

  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      let params: unknown[] = [];

      return {
        all: async () => {
          if (query.includes("FROM admin_project_bindings")) {
            return { results: [] };
          }
          return { results: [] };
        },
        bind(...values: unknown[]) {
          params = values;
          preparedStatements.push({ params: [...values], query });
          return this;
        },
        first: async () => {
          if (query.includes("COUNT(1) as total FROM admin_users")) {
            return { total: 0 };
          }
          return null;
        },
        run: async () => ({}),
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "admin_user",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    project_ids: [],
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner-1",
    username: "owner",
  };

  const response = await handleAdminAdminsGet(
    new URL("https://example.com/admin/admins?page=2&keyword=ops&role=project_admin&access_scope=bound&project_id=7&is_enabled=1"),
    db,
    actor,
  );
  const payload = await response.json() as { code: number; data: { items: unknown[]; total: number } };

  assert.equal(response.status, 200);
  assert.equal(payload.code, 200);
  assert.equal(payload.data.total, 0);

  const listStatement = preparedStatements.find(item =>
    item.query.includes("FROM admin_users")
    && item.query.includes("ORDER BY created_at DESC LIMIT ? OFFSET ?"),
  );

  assert.ok(listStatement);
  assert.match(listStatement.query, /admin_users\.username LIKE \?/);
  assert.match(listStatement.query, /admin_users\.display_name LIKE \?/);
  assert.match(listStatement.query, /admin_users\.note LIKE \?/);
  assert.match(listStatement.query, /admin_users\.role = \?/);
  assert.match(listStatement.query, /admin_users\.access_scope = \?/);
  assert.match(listStatement.query, /admin_users\.is_enabled = \?/);
  assert.match(listStatement.query, /bindings\.project_id = \?/);
  assert.match(listStatement.query, /AS last_modified_at/);
  assert.match(listStatement.query, /AS last_modified_by/);
  assert.match(listStatement.query, /AS last_modified_action/);
  assert.ok(listStatement.params.includes("%ops%"));
  assert.ok(listStatement.params.includes("project_admin"));
  assert.ok(listStatement.params.includes("bound"));
  assert.ok(listStatement.params.includes(1));
  assert.ok(listStatement.params.includes(7));
});

test("audit log GET applies server-side filters", async () => {
  const preparedStatements: Array<{ params: unknown[]; query: string }> = [];

  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      let params: unknown[] = [];

      return {
        all: async () => ({ results: [] }),
        bind(...values: unknown[]) {
          params = values;
          preparedStatements.push({ params: [...values], query });
          return this;
        },
        first: async () => {
          if (query.includes("COUNT(1) as total FROM audit_logs")) {
            return { total: 0 };
          }
          return null;
        },
        run: async () => ({}),
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "admin_user",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    project_ids: [],
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner-1",
    username: "owner",
  };

  const response = await handleAdminAuditLogs(
    new URL("https://example.com/admin/audit?page=3&keyword=owner&entity_type=admin_user&entity_id=member-1&action_prefix=admin."),
    db,
    actor,
  );
  const payload = await response.json() as { code: number; data: { items: unknown[]; total: number } };

  assert.equal(response.status, 200);
  assert.equal(payload.code, 200);
  assert.equal(payload.data.total, 0);

  const listStatement = preparedStatements.find(item =>
    item.query.includes("FROM audit_logs")
    && item.query.includes("ORDER BY created_at DESC LIMIT ? OFFSET ?"),
  );

  assert.ok(listStatement);
  assert.match(listStatement.query, /actor_name LIKE \?/);
  assert.match(listStatement.query, /entity_type = \?/);
  assert.match(listStatement.query, /entity_id = \?/);
  assert.match(listStatement.query, /action LIKE \?/);
  assert.ok(listStatement.params.includes("%owner%"));
  assert.ok(listStatement.params.includes("admin_user"));
  assert.ok(listStatement.params.includes("member-1"));
  assert.ok(listStatement.params.includes("admin.%"));
});

test("admin list GET rejects invalid role filters", async () => {
  const db: D1Database = {
    prepare(): D1PreparedStatement {
      return {
        all: async () => ({ results: [] }),
        bind() {
          return this;
        },
        first: async () => null,
        run: async () => ({}),
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "admin_user",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    project_ids: [],
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner-1",
    username: "owner",
  };

  const response = await handleAdminAdminsGet(
    new URL("https://example.com/admin/admins?role=super-admin"),
    db,
    actor,
  );
  const payload = await response.json() as { message?: string };

  assert.equal(response.status, 400);
  assert.equal(payload.message, "invalid role");
});
