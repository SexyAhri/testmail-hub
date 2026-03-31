import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRetentionPoliciesPurge,
  buildRetentionPolicyScopeKey,
  resolveMailboxExpirationTimestamp,
  resolveRetentionPolicyConfigFromRecords,
} from "../src/core/db";
import { handleAdminRetentionJobRunsGet, handleAdminRetentionPoliciesPost } from "../src/handlers/handlers";
import type { AuthSession, D1Database, D1PreparedStatement, RetentionPolicyRecord } from "../src/server/types";

function createUnusedDb(): D1Database {
  return {
    prepare(): D1PreparedStatement {
      throw new Error("db should not be queried in this test");
    },
  };
}

function createPolicy(
  overrides: Partial<RetentionPolicyRecord>,
): RetentionPolicyRecord {
  return {
    archive_email_hours: null,
    created_at: 1,
    deleted_email_retention_hours: null,
    description: "",
    email_retention_hours: null,
    environment_id: null,
    environment_name: "",
    environment_slug: "",
    id: 1,
    is_enabled: true,
    mailbox_pool_id: null,
    mailbox_pool_name: "",
    mailbox_pool_slug: "",
    mailbox_ttl_hours: null,
    name: "policy",
    project_id: null,
    project_name: "",
    project_slug: "",
    scope_key: "global",
    scope_level: "global",
    updated_at: 1,
    ...overrides,
  };
}

test("buildRetentionPolicyScopeKey generates stable scope identifiers", () => {
  assert.equal(buildRetentionPolicyScopeKey({}), "global");
  assert.equal(buildRetentionPolicyScopeKey({ project_id: 8 }), "project:8");
  assert.equal(
    buildRetentionPolicyScopeKey({ project_id: 8, environment_id: 5 }),
    "environment:8:5",
  );
  assert.equal(
    buildRetentionPolicyScopeKey({ project_id: 8, environment_id: 5, mailbox_pool_id: 2 }),
    "mailbox_pool:8:5:2",
  );
});

test("resolveRetentionPolicyConfigFromRecords applies the most specific value per field", () => {
  const resolved = resolveRetentionPolicyConfigFromRecords(
    [
      createPolicy({
        deleted_email_retention_hours: 720,
        email_retention_hours: 48,
      }),
      createPolicy({
        email_retention_hours: 72,
        project_id: 1,
        project_name: "Alpha",
        project_slug: "alpha",
        scope_key: "project:1",
        scope_level: "project",
      }),
      createPolicy({
        environment_id: 2,
        environment_name: "Staging",
        environment_slug: "staging",
        mailbox_ttl_hours: 24,
        project_id: 1,
        project_name: "Alpha",
        project_slug: "alpha",
        scope_key: "environment:1:2",
        scope_level: "environment",
      }),
      createPolicy({
        deleted_email_retention_hours: 168,
        environment_id: 2,
        environment_name: "Staging",
        environment_slug: "staging",
        mailbox_pool_id: 3,
        mailbox_pool_name: "Login",
        mailbox_pool_slug: "login",
        project_id: 1,
        project_name: "Alpha",
        project_slug: "alpha",
        scope_key: "mailbox_pool:1:2:3",
        scope_level: "mailbox_pool",
      }),
    ],
    { project_id: 1, environment_id: 2, mailbox_pool_id: 3 },
  );

  assert.equal(resolved.email_retention_hours, 72);
  assert.equal(resolved.email_retention_source, "project");
  assert.equal(resolved.mailbox_ttl_hours, 24);
  assert.equal(resolved.mailbox_ttl_source, "environment");
  assert.equal(resolved.deleted_email_retention_hours, 168);
  assert.equal(resolved.deleted_email_retention_source, "mailbox_pool");
});

test("resolveRetentionPolicyConfigFromRecords resolves archive hours independently", () => {
  const resolved = resolveRetentionPolicyConfigFromRecords(
    [
      createPolicy({
        archive_email_hours: 24,
      }),
      createPolicy({
        archive_email_hours: 12,
        project_id: 1,
        project_name: "Alpha",
        project_slug: "alpha",
        scope_key: "project:1",
        scope_level: "project",
      }),
      createPolicy({
        environment_id: 2,
        environment_name: "Staging",
        environment_slug: "staging",
        project_id: 1,
        project_name: "Alpha",
        project_slug: "alpha",
        scope_key: "environment:1:2",
        scope_level: "environment",
      }),
    ],
    { project_id: 1, environment_id: 2 },
  );

  assert.equal(resolved.archive_email_hours, 12);
  assert.equal(resolved.archive_email_source, "project");
});

test("resolveMailboxExpirationTimestamp fills mailbox expiry from retention ttl when request omits it", () => {
  const now = 1_700_000_000_000;

  assert.equal(
    resolveMailboxExpirationTimestamp(null, { mailbox_ttl_hours: 24 }, now),
    now + 24 * 60 * 60 * 1000,
  );
  assert.equal(
    resolveMailboxExpirationTimestamp(now + 123, { mailbox_ttl_hours: 24 }, now),
    now + 123,
  );
  assert.equal(resolveMailboxExpirationTimestamp(null, { mailbox_ttl_hours: null }, now), null);
});

test("applyRetentionPoliciesPurge returns detailed execution summary", async () => {
  const now = Date.now();
  const policies = [
    createPolicy({
      archive_email_hours: 24,
      deleted_email_retention_hours: 168,
      email_retention_hours: 72,
    }),
  ];

  const emails = [
    {
      archived_at: null,
      deleted_at: null,
      environment_id: 2,
      mailbox_pool_id: 3,
      message_id: "archive-me",
      project_id: 1,
      received_at: now - 30 * 60 * 60 * 1000,
    },
    {
      archived_at: null,
      deleted_at: null,
      environment_id: 2,
      mailbox_pool_id: 3,
      message_id: "purge-active",
      project_id: 1,
      received_at: now - 80 * 60 * 60 * 1000,
    },
    {
      archived_at: null,
      deleted_at: now - 200 * 60 * 60 * 1000,
      environment_id: 4,
      mailbox_pool_id: 5,
      message_id: "purge-deleted",
      project_id: 2,
      received_at: now - 220 * 60 * 60 * 1000,
    },
    {
      archived_at: null,
      deleted_at: null,
      environment_id: null,
      mailbox_pool_id: null,
      message_id: "keep-active",
      project_id: null,
      received_at: now - 4 * 60 * 60 * 1000,
    },
  ];

  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      let params: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        all: async () => {
          if (query.includes("FROM retention_policies rp")) {
            return { results: policies };
          }
          if (query.includes("SELECT message_id, received_at, deleted_at, archived_at, project_id, environment_id, mailbox_pool_id FROM emails")) {
            return { results: emails.map(item => ({ ...item })) };
          }
          throw new Error(`Unexpected all query: ${query}`);
        },
        first: async () => null,
        run: async () => {
          if (query.startsWith("UPDATE emails SET archived_at = ?")) {
            const messageId = String(params[3]);
            const target = emails.find(item => item.message_id === messageId);
            if (target) {
              target.archived_at = Number(params[0]);
            }
            return {};
          }
          if (query.startsWith("DELETE FROM email_attachments WHERE email_message_id = ?")) {
            return {};
          }
          if (query.startsWith("DELETE FROM emails WHERE message_id = ?")) {
            const messageId = String(params[0]);
            const index = emails.findIndex(item => item.message_id === messageId);
            if (index >= 0) emails.splice(index, 1);
            return {};
          }
          throw new Error(`Unexpected run query: ${query}`);
        },
      };
    },
  };

  const summary = await applyRetentionPoliciesPurge(db, {});

  assert.equal(summary.applied_policy_count, 1);
  assert.equal(summary.scanned_email_count, 4);
  assert.equal(summary.archived_email_count, 1);
  assert.equal(summary.purged_active_email_count, 1);
  assert.equal(summary.purged_deleted_email_count, 1);
  assert.deepEqual(summary.affected_project_ids, [1, 2]);
  assert.deepEqual(summary.archived_emails.map(item => item.message_id), ["archive-me"]);
  assert.deepEqual(summary.purged_active_emails.map(item => item.message_id), ["purge-active"]);
  assert.deepEqual(summary.purged_deleted_emails.map(item => item.message_id), ["purge-deleted"]);
  assert.deepEqual(
    summary.scope_summaries,
    [
      {
        archived_email_count: 1,
        environment_id: 2,
        mailbox_pool_id: 3,
        project_id: 1,
        purged_active_email_count: 1,
        purged_deleted_email_count: 0,
      },
      {
        archived_email_count: 0,
        environment_id: 4,
        mailbox_pool_id: 5,
        project_id: 2,
        purged_active_email_count: 0,
        purged_deleted_email_count: 1,
      },
    ],
  );
  assert.ok((emails.find(item => item.message_id === "archive-me")?.archived_at || 0) > 0);
  assert.equal(emails.some(item => item.message_id === "purge-active"), false);
  assert.equal(emails.some(item => item.message_id === "purge-deleted"), false);
  assert.equal(emails.some(item => item.message_id === "keep-active"), true);
});

test("handleAdminRetentionPoliciesPost rejects project-scoped admin creating global policy", async () => {
  const actor: AuthSession = {
    access_scope: "bound",
    auth_kind: "admin_user",
    display_name: "Project Admin",
    expires_at: Date.now() + 60_000,
    nonce: "nonce",
    project_ids: [1],
    role: "admin",
    user_agent_hash: "ua",
    user_id: "admin-1",
    username: "project-admin",
  };

  const request = new Request("https://example.com/admin/retention-policies", {
    body: JSON.stringify({
      description: "",
      email_retention_hours: 48,
      is_enabled: true,
      name: "Global retention",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const response = await handleAdminRetentionPoliciesPost(request, createUnusedDb(), actor);
  const payload = await response.json() as { message: string };

  assert.equal(response.status, 403);
  assert.equal(payload.message, "project-scoped admin cannot manage global settings");
});

test("handleAdminRetentionJobRunsGet rejects project-scoped admin access", async () => {
  const actor: AuthSession = {
    access_scope: "bound",
    auth_kind: "admin_user",
    display_name: "Project Admin",
    expires_at: Date.now() + 60_000,
    nonce: "nonce",
    project_ids: [1],
    role: "admin",
    user_agent_hash: "ua",
    user_id: "admin-1",
    username: "project-admin",
  };

  const response = await handleAdminRetentionJobRunsGet(
    new URL("https://example.com/admin/retention-jobs?page=1"),
    createUnusedDb(),
    actor,
  );
  const payload = await response.json() as { message: string };

  assert.equal(response.status, 403);
  assert.equal(payload.message, "project-scoped admin cannot access global observability");
});
