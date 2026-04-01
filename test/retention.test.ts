import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRetentionPoliciesPurge,
  buildRetentionPolicyScopeKey,
  getEmails,
  getEmailByMessageIdScoped,
  getMailboxById,
  getMailboxesPaged,
  getRetentionJobRunSummary,
  getWorkspaceCatalog,
  resolveMailboxExpirationTimestamp,
  resolveRetentionPolicyConfigFromRecords,
} from "../src/core/db";
import { handleAdminRetentionJobRunSummaryGet, handleAdminRetentionJobRunsGet, handleAdminRetentionPoliciesPost } from "../src/handlers/handlers";
import { buildRetentionTriggerContext, normalizeRetentionJobActions } from "../src/index";
import type { AuthSession, D1Database, D1PreparedStatement, RetentionPolicyRecord } from "../src/server/types";

function createUnusedDb(): D1Database {
  return {
    prepare(): D1PreparedStatement {
      throw new Error("db should not be queried in this test");
    },
  };
}

function createRetentionLinkedQueryDb(): D1Database {
  const emailRow = {
    archive_reason: "",
    archived_at: null,
    archived_by: "",
    deleted_at: null,
    environment_id: 21,
    environment_name: "Staging",
    environment_slug: "staging",
    extracted_json: "[]",
    from_address: "no-reply@example.com",
    has_attachments: 1,
    html_body: "<p>Your code is 123456</p>",
    mailbox_pool_id: 31,
    mailbox_pool_name: "Login",
    mailbox_pool_slug: "login",
    message_id: "msg-retention-1",
    note: "retention-linked",
    primary_mailbox_address: "code@alpha.example.com",
    project_id: 11,
    project_name: "Alpha",
    project_slug: "alpha",
    raw_headers: "[]",
    received_at: 1_700_000_000_000,
    subject: "Your code",
    tags: "[\"login\"]",
    text_body: "Your code is 123456",
    to_address: "code@alpha.example.com",
  };

  const mailboxRow = {
    address: "code@alpha.example.com",
    created_at: 1_700_000_000_000,
    created_by: "system",
    deleted_at: null,
    environment_id: 21,
    environment_name: "Staging",
    environment_slug: "staging",
    expires_at: null,
    id: 7,
    is_enabled: 1,
    last_received_at: 1_700_000_100_000,
    mailbox_pool_id: 31,
    mailbox_pool_name: "Login",
    mailbox_pool_slug: "login",
    note: "retention-linked",
    project_id: 11,
    project_name: "Alpha",
    project_slug: "alpha",
    receive_count: 4,
    tags: "[\"login\"]",
    updated_at: 1_700_000_200_000,
  };

  const attachmentRows = [
    {
      content_id: "",
      disposition: "attachment",
      filename: "code.txt",
      id: 1,
      is_stored: 1,
      mime_type: "text/plain",
      size_bytes: 64,
    },
  ];

  const policies = [
    createPolicy({
      deleted_email_retention_hours: 720,
      mailbox_ttl_hours: 48,
    }),
    createPolicy({
      email_retention_hours: 96,
      project_id: 11,
      project_name: "Alpha",
      project_slug: "alpha",
      scope_key: "project:11",
      scope_level: "project",
    }),
    createPolicy({
      archive_email_hours: 24,
      environment_id: 21,
      environment_name: "Staging",
      environment_slug: "staging",
      project_id: 11,
      project_name: "Alpha",
      project_slug: "alpha",
      scope_key: "environment:11:21",
      scope_level: "environment",
    }),
    createPolicy({
      deleted_email_retention_hours: 72,
      environment_id: 21,
      environment_name: "Staging",
      environment_slug: "staging",
      mailbox_pool_id: 31,
      mailbox_pool_name: "Login",
      mailbox_pool_slug: "login",
      project_id: 11,
      project_name: "Alpha",
      project_slug: "alpha",
      scope_key: "mailbox_pool:11:21:31",
      scope_level: "mailbox_pool",
    }),
  ];

  return {
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
          if (query.includes("SELECT emails.message_id") && query.includes("ORDER BY emails.received_at DESC")) {
            return { results: [emailRow] };
          }
          if (query.includes("SELECT id, filename, mime_type, disposition, content_id, size_bytes, is_stored FROM email_attachments")) {
            assert.equal(params[0], "msg-retention-1");
            return { results: attachmentRows };
          }
          if (query.includes("FROM mailboxes m") && query.includes("ORDER BY m.created_at DESC")) {
            return { results: [mailboxRow] };
          }
          throw new Error(`Unexpected all query: ${query}`);
        },
        first: async () => {
          if (query.includes("SELECT COUNT(1) as total FROM emails")) {
            return { total: 1 };
          }
          if (query.includes("WHERE emails.message_id = ?")) {
            assert.equal(params[0], "msg-retention-1");
            return emailRow;
          }
          if (query.includes("SELECT COUNT(1) as total FROM mailboxes m")) {
            return { total: 1 };
          }
          if (query.includes("WHERE m.id = ?")) {
            assert.equal(params[0], 7);
            return mailboxRow;
          }
          return null;
        },
        run: async () => {
          throw new Error(`Unexpected run query: ${query}`);
        },
      };
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

test("buildRetentionTriggerContext keeps manual trigger actor for audit detail", () => {
  const detail = buildRetentionTriggerContext("manual", {
    access_scope: "bound",
    auth_kind: "admin_user",
    display_name: "Project Admin",
    role: "project_admin",
    user_id: "admin-1",
    username: "project-admin",
  });

  assert.equal(detail.trigger_source, "manual");
  assert.equal(detail.triggered_by.display_name, "Project Admin");
  assert.equal(detail.triggered_by.username, "project-admin");
  assert.equal(detail.triggered_by.auth_kind, "admin_user");
  assert.equal(detail.triggered_by.access_scope, "bound");
  assert.equal(detail.triggered_by.is_system, false);
});

test("buildRetentionTriggerContext falls back to system actor for scheduled runs", () => {
  const detail = buildRetentionTriggerContext("scheduled");

  assert.equal(detail.trigger_source, "scheduled");
  assert.equal(detail.triggered_by.display_name, "系统留存任务");
  assert.equal(detail.triggered_by.username, "system-retention");
  assert.equal(detail.triggered_by.auth_kind, "system");
  assert.equal(detail.triggered_by.access_scope, "all");
  assert.equal(detail.triggered_by.is_system, true);
});

test("normalizeRetentionJobActions filters invalid values and falls back to full maintenance", () => {
  assert.deepEqual(
    normalizeRetentionJobActions([
      "expire_mailboxes",
      "purge_active_emails",
      "unknown_action",
      "expire_mailboxes",
    ]),
    ["expire_mailboxes", "purge_active_emails"],
  );
  assert.deepEqual(
    normalizeRetentionJobActions([]),
    ["expire_mailboxes", "archive_emails", "purge_active_emails", "purge_deleted_emails"],
  );
  assert.deepEqual(
    normalizeRetentionJobActions(null),
    ["expire_mailboxes", "archive_emails", "purge_active_emails", "purge_deleted_emails"],
  );
});

test("getRetentionJobRunSummary returns aggregated lifecycle observability metrics", async () => {
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      let params: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        all: async () => {
          if (query.includes("SELECT status")) {
            return {
              results: [
                { status: "failed" },
                { status: "failed" },
                { status: "success" },
                { status: "failed" },
              ],
            };
          }
          throw new Error(`Unexpected all query: ${query}`);
        },
        first: async () => {
          if (query.includes("COUNT(1) as total_run_count")) {
            return {
              total_failed_count: 2,
              total_run_count: 12,
              total_success_count: 10,
            };
          }
          if (query.includes("COUNT(1) as recent_24h_run_count")) {
            assert.equal(params.length, 1);
            return {
              average_duration_ms_24h: 1825.5,
              recent_24h_archived_email_count: 9,
              recent_24h_expired_mailbox_count: 2,
              recent_24h_failed_count: 1,
              recent_24h_purged_active_email_count: 4,
              recent_24h_purged_deleted_email_count: 7,
              recent_24h_run_count: 5,
              recent_24h_scanned_email_count: 88,
              recent_24h_success_count: 4,
            };
          }
          if (query.includes("SELECT id, trigger_source, status, started_at, finished_at, duration_ms")) {
            return {
              duration_ms: 2100,
              finished_at: 1_700_000_300_000,
              id: 99,
              started_at: 1_700_000_298_000,
              status: "failed",
              trigger_source: "scheduled",
            };
          }
          if (query.includes("WHERE status = 'success'")) {
            return {
              finished_at: 1_700_000_100_000,
              started_at: 1_700_000_098_000,
            };
          }
          if (query.includes("WHERE status = 'failed'")) {
            return {
              finished_at: 1_700_000_300_000,
              started_at: 1_700_000_298_000,
            };
          }
          throw new Error(`Unexpected first query: ${query}`);
        },
        run: async () => {
          throw new Error(`Unexpected run query: ${query}`);
        },
      };
    },
  };

  const summary = await getRetentionJobRunSummary(db);

  assert.equal(summary.total_run_count, 12);
  assert.equal(summary.total_success_count, 10);
  assert.equal(summary.total_failed_count, 2);
  assert.equal(summary.recent_24h_run_count, 5);
  assert.equal(summary.recent_24h_success_count, 4);
  assert.equal(summary.recent_24h_failed_count, 1);
  assert.equal(summary.recent_24h_scanned_email_count, 88);
  assert.equal(summary.recent_24h_archived_email_count, 9);
  assert.equal(summary.recent_24h_purged_active_email_count, 4);
  assert.equal(summary.recent_24h_purged_deleted_email_count, 7);
  assert.equal(summary.recent_24h_expired_mailbox_count, 2);
  assert.equal(summary.average_duration_ms_24h, 1825.5);
  assert.equal(summary.last_run?.id, 99);
  assert.equal(summary.last_run?.status, "failed");
  assert.equal(summary.last_success_at, 1_700_000_100_000);
  assert.equal(summary.last_failed_at, 1_700_000_300_000);
  assert.equal(summary.consecutive_failure_count, 2);
});

test("getWorkspaceCatalog attaches resolved retention summary for project environment and mailbox pool views", async () => {
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => {
          if (query.includes("FROM projects p")) {
            return {
              results: [
                {
                  created_at: 1,
                  description: "Project Alpha",
                  environment_count: 1,
                  id: 11,
                  is_enabled: 1,
                  mailbox_count: 3,
                  mailbox_pool_count: 1,
                  name: "Alpha",
                  slug: "alpha",
                  updated_at: 2,
                },
              ],
            };
          }

          if (query.includes("FROM environments e")) {
            return {
              results: [
                {
                  created_at: 3,
                  description: "Staging",
                  id: 21,
                  is_enabled: 1,
                  mailbox_count: 2,
                  mailbox_pool_count: 1,
                  name: "Staging",
                  project_id: 11,
                  project_name: "Alpha",
                  project_slug: "alpha",
                  slug: "staging",
                  updated_at: 4,
                },
              ],
            };
          }

          if (query.includes("FROM mailbox_pools mp")) {
            return {
              results: [
                {
                  created_at: 5,
                  description: "Login Pool",
                  environment_id: 21,
                  environment_name: "Staging",
                  environment_slug: "staging",
                  id: 31,
                  is_enabled: 1,
                  mailbox_count: 2,
                  name: "Login",
                  project_id: 11,
                  project_name: "Alpha",
                  project_slug: "alpha",
                  slug: "login",
                  updated_at: 6,
                },
              ],
            };
          }

          if (query.includes("FROM retention_policies rp")) {
            return {
              results: [
                createPolicy({
                  deleted_email_retention_hours: 720,
                  mailbox_ttl_hours: 24,
                }),
                createPolicy({
                  email_retention_hours: 96,
                  project_id: 11,
                  project_name: "Alpha",
                  project_slug: "alpha",
                  scope_key: "project:11",
                  scope_level: "project",
                }),
                createPolicy({
                  archive_email_hours: 12,
                  environment_id: 21,
                  environment_name: "Staging",
                  environment_slug: "staging",
                  project_id: 11,
                  project_name: "Alpha",
                  project_slug: "alpha",
                  scope_key: "environment:11:21",
                  scope_level: "environment",
                }),
                createPolicy({
                  deleted_email_retention_hours: 72,
                  environment_id: 21,
                  environment_name: "Staging",
                  environment_slug: "staging",
                  mailbox_pool_id: 31,
                  mailbox_pool_name: "Login",
                  mailbox_pool_slug: "login",
                  project_id: 11,
                  project_name: "Alpha",
                  project_slug: "alpha",
                  scope_key: "mailbox_pool:11:21:31",
                  scope_level: "mailbox_pool",
                }),
              ],
            };
          }

          throw new Error(`Unexpected all query: ${query}`);
        },
        first: async () => null,
        run: async () => {
          throw new Error(`Unexpected run query: ${query}`);
        },
      };
    },
  };

  const catalog = await getWorkspaceCatalog(db, true);

  assert.equal(catalog.projects[0]?.resolved_retention.mailbox_ttl_hours, 24);
  assert.equal(catalog.projects[0]?.resolved_retention.mailbox_ttl_source, "global");
  assert.equal(catalog.projects[0]?.resolved_retention.email_retention_hours, 96);
  assert.equal(catalog.projects[0]?.resolved_retention.email_retention_source, "project");
  assert.equal(catalog.projects[0]?.resolved_retention.deleted_email_retention_hours, 720);
  assert.equal(catalog.projects[0]?.resolved_retention.deleted_email_retention_source, "global");

  assert.equal(catalog.environments[0]?.resolved_retention.archive_email_hours, 12);
  assert.equal(catalog.environments[0]?.resolved_retention.archive_email_source, "environment");
  assert.equal(catalog.environments[0]?.resolved_retention.email_retention_hours, 96);
  assert.equal(catalog.environments[0]?.resolved_retention.email_retention_source, "project");

  assert.equal(catalog.mailbox_pools[0]?.resolved_retention.archive_email_hours, 12);
  assert.equal(catalog.mailbox_pools[0]?.resolved_retention.archive_email_source, "environment");
  assert.equal(catalog.mailbox_pools[0]?.resolved_retention.deleted_email_retention_hours, 72);
  assert.equal(catalog.mailbox_pools[0]?.resolved_retention.deleted_email_retention_source, "mailbox_pool");
});

test("getEmails attaches resolved retention summary to email governance list views", async () => {
  const payload = await getEmails(createRetentionLinkedQueryDb(), 1, 20, {}, [11]);

  assert.equal(payload.total, 1);
  assert.equal(payload.items[0]?.resolved_retention.mailbox_ttl_hours, 48);
  assert.equal(payload.items[0]?.resolved_retention.mailbox_ttl_source, "global");
  assert.equal(payload.items[0]?.resolved_retention.archive_email_hours, 24);
  assert.equal(payload.items[0]?.resolved_retention.archive_email_source, "environment");
  assert.equal(payload.items[0]?.resolved_retention.email_retention_hours, 96);
  assert.equal(payload.items[0]?.resolved_retention.email_retention_source, "project");
  assert.equal(payload.items[0]?.resolved_retention.deleted_email_retention_hours, 72);
  assert.equal(payload.items[0]?.resolved_retention.deleted_email_retention_source, "mailbox_pool");
});

test("getEmailByMessageIdScoped attaches resolved retention summary to email detail view", async () => {
  const detail = await getEmailByMessageIdScoped(createRetentionLinkedQueryDb(), "msg-retention-1", [11]);

  assert.ok(detail);
  assert.equal(detail?.resolved_retention.mailbox_ttl_hours, 48);
  assert.equal(detail?.resolved_retention.archive_email_hours, 24);
  assert.equal(detail?.resolved_retention.email_retention_hours, 96);
  assert.equal(detail?.resolved_retention.deleted_email_retention_hours, 72);
  assert.equal(detail?.attachments.length, 1);
});

test("getMailboxesPaged attaches resolved retention summary to mailbox governance list views", async () => {
  const payload = await getMailboxesPaged(createRetentionLinkedQueryDb(), 1, 20, {}, [11]);

  assert.equal(payload.total, 1);
  assert.equal(payload.items[0]?.resolved_retention.mailbox_ttl_hours, 48);
  assert.equal(payload.items[0]?.resolved_retention.mailbox_ttl_source, "global");
  assert.equal(payload.items[0]?.resolved_retention.archive_email_hours, 24);
  assert.equal(payload.items[0]?.resolved_retention.archive_email_source, "environment");
  assert.equal(payload.items[0]?.resolved_retention.email_retention_hours, 96);
  assert.equal(payload.items[0]?.resolved_retention.email_retention_source, "project");
  assert.equal(payload.items[0]?.resolved_retention.deleted_email_retention_hours, 72);
  assert.equal(payload.items[0]?.resolved_retention.deleted_email_retention_source, "mailbox_pool");
});

test("getMailboxById attaches resolved retention summary to mailbox detail view", async () => {
  const mailbox = await getMailboxById(createRetentionLinkedQueryDb(), 7, [11]);

  assert.ok(mailbox);
  assert.equal(mailbox?.resolved_retention.mailbox_ttl_hours, 48);
  assert.equal(mailbox?.resolved_retention.archive_email_hours, 24);
  assert.equal(mailbox?.resolved_retention.email_retention_hours, 96);
  assert.equal(mailbox?.resolved_retention.deleted_email_retention_hours, 72);
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

test("applyRetentionPoliciesPurge can execute a single lifecycle action type", async () => {
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
          if (query.startsWith("DELETE FROM email_mailbox_links WHERE email_message_id = ?")) {
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
          if (query.startsWith("UPDATE emails SET archived_at = ?")) {
            throw new Error("archive should not run in purge-active-only mode");
          }
          throw new Error(`Unexpected run query: ${query}`);
        },
      };
    },
  };

  const summary = await applyRetentionPoliciesPurge(
    db,
    {},
    {
      archive_emails: false,
      purge_active_emails: true,
      purge_deleted_emails: false,
    },
  );

  assert.equal(summary.archived_email_count, 0);
  assert.equal(summary.purged_active_email_count, 1);
  assert.equal(summary.purged_deleted_email_count, 0);
  assert.deepEqual(summary.purged_active_emails.map(item => item.message_id), ["purge-active"]);
  assert.equal(emails.some(item => item.message_id === "archive-me"), true);
  assert.equal(emails.some(item => item.message_id === "purge-active"), false);
  assert.equal(emails.some(item => item.message_id === "purge-deleted"), true);
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

test("handleAdminRetentionJobRunSummaryGet rejects project-scoped admin access", async () => {
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

  const response = await handleAdminRetentionJobRunSummaryGet(
    createUnusedDb(),
    actor,
  );
  const payload = await response.json() as { message: string };

  assert.equal(response.status, 403);
  assert.equal(payload.message, "project-scoped admin cannot access global observability");
});
