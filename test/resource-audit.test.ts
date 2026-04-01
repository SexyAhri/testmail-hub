import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminApiTokensDelete,
  handleAdminApiTokensPost,
  handleAdminDomainRoutingProfilesDelete,
  handleAdminDomainRoutingProfilesPost,
  handleAdminNotificationsDelete,
  handleAdminNotificationsPost,
  handleAdminRetentionPoliciesDelete,
  handleAdminRetentionPoliciesPost,
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

test("handleAdminNotificationsPost stores safe audit detail without raw secret", async () => {
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
        first: async () => null,
        run: async () => {
          if (query.startsWith("INSERT INTO notification_endpoints")) {
            return { meta: { last_row_id: 7 } };
          }
          if (query.startsWith("INSERT INTO audit_logs")) {
            auditRows.push(params);
          }
          return {};
        },
      };
    },
  };

  const request = new Request("https://example.com/admin/notifications", {
    body: JSON.stringify({
      access_scope: "all",
      alert_config: {},
      events: ["email.received"],
      is_enabled: true,
      name: "登录告警",
      operation_note: "新增登录回调",
      secret: "super-secret-value",
      target: "https://example.com/webhook",
      type: "webhook",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const response = await handleAdminNotificationsPost(request, db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "notification.create");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.name, "登录告警");
  assert.equal(detail.operation_note, "新增登录回调");
  assert.equal(detail.secret_configured, true);
  assert.equal("secret" in detail, false);
});

test("handleAdminApiTokensPost records operation note without leaking plain text token", async () => {
  const auditRows: unknown[][] = [];

  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      let params: unknown[] = [];

      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        all: async () => {
          if (query.includes("FROM api_token_project_bindings")) {
            return { results: [] };
          }
          return { results: [] };
        },
        first: async () => null,
        run: async () => {
          if (query.startsWith("INSERT INTO audit_logs")) {
            auditRows.push(params);
          }
          return {};
        },
      };
    },
  };

  const request = new Request("https://example.com/admin/api-tokens", {
    body: JSON.stringify({
      access_scope: "all",
      description: "供 Playwright 任务读取邮件",
      is_enabled: true,
      name: "Playwright Token",
      operation_note: "给自动化任务新增只读令牌",
      permissions: ["read:mail"],
      project_ids: [],
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const response = await handleAdminApiTokensPost(request, db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "api_token.create");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.name, "Playwright Token");
  assert.equal(detail.operation_note, "给自动化任务新增只读令牌");
  assert.equal(detail.plain_text_token_issued, true);
  assert.equal("plain_text_token" in detail, false);
});

test("handleAdminRetentionPoliciesPost writes operation note into retention audit detail", async () => {
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
          if (query.includes("FROM retention_policies rp") && query.includes("LIMIT 1")) {
            return {
              archive_email_hours: 24,
              created_at: 1,
              deleted_email_retention_hours: null,
              description: "默认归档策略",
              email_retention_hours: null,
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              id: Number(params[0]),
              is_enabled: 1,
              mailbox_pool_id: null,
              mailbox_pool_name: "",
              mailbox_pool_slug: "",
              mailbox_ttl_hours: null,
              name: "默认归档",
              project_id: null,
              project_name: "",
              project_slug: "",
              scope_key: "global",
              scope_level: "global",
              updated_at: 1,
            };
          }
          return null;
        },
        run: async () => {
          if (query.startsWith("INSERT INTO retention_policies")) {
            return { meta: { last_row_id: 41 } };
          }
          if (query.startsWith("INSERT INTO audit_logs")) {
            auditRows.push(params);
          }
          return {};
        },
      };
    },
  };

  const request = new Request("https://example.com/admin/retention-policies", {
    body: JSON.stringify({
      archive_email_hours: 24,
      description: "默认归档策略",
      is_enabled: true,
      name: "默认归档",
      operation_note: "补齐全局归档留痕",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const response = await handleAdminRetentionPoliciesPost(request, db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "retention_policy.create");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.name, "默认归档");
  assert.equal(detail.scope_level, "global");
  assert.equal(detail.operation_note, "补齐全局归档留痕");
});

test("handleAdminDomainRoutingProfilesPost records operation note in routing profile audit detail", async () => {
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
        first: async () => null,
        run: async () => {
          if (query.startsWith("INSERT INTO domain_routing_profiles")) {
            return { meta: { last_row_id: 13 } };
          }
          if (query.startsWith("INSERT INTO audit_logs")) {
            auditRows.push(params);
          }
          return {};
        },
      };
    },
  };

  const request = new Request("https://example.com/admin/domain-routing-profiles", {
    body: JSON.stringify({
      catch_all_forward_to: "ops@vixenahri.cn",
      catch_all_mode: "enabled",
      is_enabled: true,
      name: "默认 Catch-all",
      note: "给测试域名复用",
      operation_note: "补录默认路由策略",
      provider: "cloudflare",
      slug: "default-catch-all",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const response = await handleAdminDomainRoutingProfilesPost(request, db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "domain.routing_profile.create");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.name, "默认 Catch-all");
  assert.equal(detail.catch_all_mode, "enabled");
  assert.equal(detail.operation_note, "补录默认路由策略");
});

test("handleAdminNotificationsDelete records operation note without leaking raw secret", async () => {
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
          if (query.includes("FROM notification_endpoints WHERE id = ? LIMIT 1")) {
            return {
              access_scope: "all",
              alert_config_json: "{}",
              created_at: 1,
              events: JSON.stringify(["email.received"]),
              id: Number(params[0]),
              is_enabled: 1,
              last_error: "",
              last_sent_at: null,
              last_status: "",
              name: "登录告警",
              secret: "super-secret-value",
              target: "https://example.com/webhook",
              type: "webhook",
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

  const request = new Request("https://example.com/admin/notifications/7", {
    body: JSON.stringify({
      operation_note: "停用旧登录回调",
    }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });

  const response = await handleAdminNotificationsDelete("/admin/notifications/7", request, db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "notification.delete");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.name, "登录告警");
  assert.equal(detail.operation_note, "停用旧登录回调");
  assert.equal(detail.secret_configured, true);
  assert.equal("secret" in detail, false);
});

test("handleAdminApiTokensDelete records operation note and token snapshot", async () => {
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
          if (query.includes("FROM api_tokens WHERE id = ? LIMIT 1")) {
            return {
              access_scope: "all",
              created_at: 1,
              created_by: "owner",
              description: "供 Playwright 任务读取邮件",
              expires_at: null,
              id: String(params[0]),
              is_enabled: 1,
              last_used_at: null,
              name: "Playwright Token",
              permissions_json: JSON.stringify(["read:mail"]),
              token_prefix: "tm_abc123",
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

  const request = new Request("https://example.com/admin/api-tokens/token-1", {
    body: JSON.stringify({
      operation_note: "回收旧自动化令牌",
    }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });

  const response = await handleAdminApiTokensDelete("/admin/api-tokens/token-1", request, db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "api_token.delete");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.name, "Playwright Token");
  assert.equal(detail.operation_note, "回收旧自动化令牌");
  assert.deepEqual(detail.permissions, ["read:mail"]);
});

test("handleAdminRetentionPoliciesDelete records operation note in retention delete audit", async () => {
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
          if (query.includes("FROM retention_policies rp") && query.includes("LIMIT 1")) {
            return {
              archive_email_hours: 24,
              created_at: 1,
              deleted_email_retention_hours: null,
              description: "默认归档策略",
              email_retention_hours: null,
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              id: Number(params[0]),
              is_enabled: 1,
              mailbox_pool_id: null,
              mailbox_pool_name: "",
              mailbox_pool_slug: "",
              mailbox_ttl_hours: null,
              name: "默认归档",
              project_id: null,
              project_name: "",
              project_slug: "",
              scope_key: "global",
              scope_level: "global",
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

  const request = new Request("https://example.com/admin/retention-policies/41", {
    body: JSON.stringify({
      operation_note: "回退到上层默认策略",
    }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });

  const response = await handleAdminRetentionPoliciesDelete("/admin/retention-policies/41", request, db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "retention_policy.delete");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.name, "默认归档");
  assert.equal(detail.scope_level, "global");
  assert.equal(detail.operation_note, "回退到上层默认策略");
});

test("handleAdminDomainRoutingProfilesDelete records operation note in routing profile delete audit", async () => {
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
          if (query.includes("FROM domain_routing_profiles rp") && query.includes("WHERE rp.id = ? LIMIT 1")) {
            return {
              catch_all_forward_to: "ops@vixenahri.cn",
              catch_all_mode: "enabled",
              created_at: 1,
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              id: Number(params[0]),
              is_enabled: 1,
              linked_domain_count: 0,
              name: "默认 Catch-all",
              note: "给测试域名复用",
              project_id: null,
              project_name: "",
              project_slug: "",
              provider: "cloudflare",
              slug: "default-catch-all",
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

  const request = new Request("https://example.com/admin/domain-routing-profiles/13", {
    body: JSON.stringify({
      operation_note: "停用旧默认路由策略",
    }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });

  const response = await handleAdminDomainRoutingProfilesDelete("/admin/domain-routing-profiles/13", request, db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "domain.routing_profile.delete");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.name, "默认 Catch-all");
  assert.equal(detail.slug, "default-catch-all");
  assert.equal(detail.operation_note, "停用旧默认路由策略");
});
