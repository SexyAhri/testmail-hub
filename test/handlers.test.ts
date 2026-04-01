import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminAdminsPost,
  handleAdminDomainAssetsDelete,
  handleAdminDomainAssetsPost,
  handleAdminDomainAssetsSyncCatchAll,
  handleAdminDomainAssetsSyncMailboxRoutes,
  handleAdminDomainAssetsPut,
  handleAdminDomains,
  handleAdminDomainAssetsStatusGet,
  handleAdminEmailDelete,
  handleAdminDomainProvidersGet,
  handleAdminEmailArchive,
  handleAdminEmailDetail,
  handleAdminEmailUnarchive,
  handleAdminMailboxSyncRunGet,
  handleAdminMailboxSyncRunLatestGet,
  handleAdminMailboxesSync,
  handleAdminRulesPost,
  handleAdminWhitelistSettingsPut,
  handleEmailsCode,
  handleEmailsLatest,
  handleEmailsLatestExtraction,
  handlePublicEmailAttachment,
  handlePublicEmailDetail,
  handlePublicEmailExtractions,
} from "../src/handlers/handlers";
import type { AuthSession, D1Database, D1PreparedStatement, WorkerEnv, WorkerExecutionContext } from "../src/server/types";

test("handleEmailsLatest returns extraction payload for public API", async () => {
  let preparedQuery = "";
  let boundAddress = "";

  const statement: D1PreparedStatement = {
    all: async () => ({ results: [] }),
    bind(...values: unknown[]) {
      boundAddress = String(values[0] || "");
      return this;
    },
    first: async () => ({
      extracted_json: '[{"remark":"验证码","rule_id":1,"value":"123456"}]',
      from_address: "noreply@github.com",
      html_body: "",
      message_id: "msg-1",
      received_at: 1774760671582,
      subject: "GitHub 登录验证码",
      text_body: "Your verification code is 123456. Sign in here: https://github.com/session/authorize?token=abc123",
      to_address: "code@example.com",
    }),
    run: async () => ({}),
  };

  const db: D1Database = {
    prepare(query: string) {
      preparedQuery = query;
      return statement;
    },
  };

  const response = await handleEmailsLatest(new URL("https://example.com/api/emails/latest?address=CODE@example.com"), db);
  const payload = await response.json() as { code: number; data: Record<string, any> };

  assert.equal(response.status, 200);
  assert.equal(boundAddress, "code@example.com");
  assert.match(preparedQuery, /text_body/);
  assert.match(preparedQuery, /html_body/);
  assert.match(preparedQuery, /archived_at IS NULL/);
  assert.equal(payload.code, 200);
  assert.equal(payload.data.verification_code, "123456");
  assert.equal(payload.data.extraction?.platform, "GitHub");
  assert.equal(payload.data.extraction?.primary_link?.kind, "login");
});

test("handleEmailsLatestExtraction returns focused extraction payload", async () => {
  const statement: D1PreparedStatement = {
    all: async () => ({ results: [] }),
    bind() {
      return this;
    },
    first: async () => ({
      extracted_json: '[{"remark":"登录链接","rule_id":2,"value":"https://discord.com/login?token=abc123"}]',
      from_address: "noreply@discord.com",
      html_body: "",
      message_id: "msg-2",
      received_at: 1774760672000,
      subject: "Discord Sign In",
      text_body: "Open this magic link: https://discord.com/login?token=abc123",
      to_address: "code@example.com",
    }),
    run: async () => ({}),
  };

  const db: D1Database = {
    prepare() {
      return statement;
    },
  };

  const response = await handleEmailsLatestExtraction(
    new URL("https://example.com/api/emails/latest/extraction?address=code@example.com"),
    db,
  );
  const payload = await response.json() as { code: number; data: Record<string, any> };

  assert.equal(response.status, 200);
  assert.equal(payload.code, 200);
  assert.equal(payload.data.extraction?.platform, "Discord");
  assert.equal(payload.data.extraction?.primary_link?.kind, "magic_link");
  assert.equal(payload.data.result_insights?.length, 1);
});

test("handleEmailsCode returns the latest verification code payload", async () => {
  const statement: D1PreparedStatement = {
    all: async () => ({ results: [] }),
    bind() {
      return this;
    },
    first: async () => ({
      extracted_json: '[{"remark":"验证码","rule_id":1,"value":"654321"}]',
      from_address: "noreply@google.com",
      html_body: "",
      message_id: "msg-code-1",
      received_at: 1774760672600,
      subject: "Google verification code",
      text_body: "Use verification code 654321 to continue.",
      to_address: "code@example.com",
    }),
    run: async () => ({}),
  };

  const db: D1Database = {
    prepare() {
      return statement;
    },
  };

  const response = await handleEmailsCode(
    new URL("https://example.com/api/emails/code?address=code@example.com"),
    db,
  );
  const payload = await response.json() as { code: number; data: Record<string, any> };

  assert.equal(response.status, 200);
  assert.equal(payload.code, 200);
  assert.equal(payload.data.message_id, "msg-code-1");
  assert.equal(payload.data.verification_code, "654321");
});

test("handlePublicEmailDetail returns scoped detail payload without rule results", async () => {
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => {
          if (query.includes("SELECT id, filename, mime_type, disposition, content_id, size_bytes, is_stored FROM email_attachments")) {
            return {
              results: [
                {
                  content_id: null,
                  disposition: "attachment",
                  filename: "code.txt",
                  id: 7,
                  is_stored: 1,
                  mime_type: "text/plain",
                  size_bytes: 5,
                },
              ],
            };
          }

          return { results: [] };
        },
        first: async () => {
          if (query.includes("FROM emails")) {
            return {
              deleted_at: null,
              extracted_json: '[{"remark":"验证码","rule_id":1,"value":"123456"}]',
              from_address: "noreply@github.com",
              has_attachments: 1,
              html_body: "<p>Body</p>",
              mailbox_pool_id: 3,
              mailbox_pool_name: "Login Pool",
              mailbox_pool_slug: "login-pool",
              message_id: "msg-detail-1",
              environment_id: 2,
              environment_name: "staging",
              environment_slug: "staging",
              note: "",
              primary_mailbox_address: "code@example.com",
              project_id: 1,
              project_name: "Console",
              project_slug: "console",
              raw_headers: '[{"key":"X-Test","value":"1"}]',
              received_at: 1774760673000,
              subject: "GitHub login",
              tags: "[]",
              text_body: "Your verification code is 123456.",
              to_address: "code@example.com",
            };
          }

          return null;
        },
        run: async () => ({}),
      };
    },
  };

  const response = await handlePublicEmailDetail("/api/emails/msg-detail-1", db);
  const payload = await response.json() as { code: number; data: Record<string, any> };

  assert.equal(response.status, 200);
  assert.equal(payload.code, 200);
  assert.equal(payload.data.message_id, "msg-detail-1");
  assert.equal(payload.data.attachments?.[0]?.download_url, "/api/emails/msg-detail-1/attachments/7");
  assert.equal("results" in payload.data, false);
  assert.equal(payload.data.scope?.project_id, 1);
});

test("handlePublicEmailExtractions returns extraction details for a message", async () => {
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => ({
          results: query.includes("FROM email_attachments")
            ? []
            : [],
        }),
        first: async () => {
          if (query.includes("FROM emails")) {
            return {
              deleted_at: null,
              extracted_json: '[{"remark":"登录链接","rule_id":2,"value":"https://discord.com/login?token=abc123"}]',
              from_address: "noreply@discord.com",
              has_attachments: 0,
              html_body: "",
              mailbox_pool_id: null,
              mailbox_pool_name: "",
              mailbox_pool_slug: "",
              message_id: "msg-extract-1",
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              note: "",
              primary_mailbox_address: "code@example.com",
              project_id: 1,
              project_name: "Console",
              project_slug: "console",
              raw_headers: "[]",
              received_at: 1774760673200,
              subject: "Discord Sign In",
              tags: "[]",
              text_body: "Open this magic link: https://discord.com/login?token=abc123",
              to_address: "code@example.com",
            };
          }

          return null;
        },
        run: async () => ({}),
      };
    },
  };

  const response = await handlePublicEmailExtractions("/api/emails/msg-extract-1/extractions", db);
  const payload = await response.json() as { code: number; data: Record<string, any> };

  assert.equal(response.status, 200);
  assert.equal(payload.code, 200);
  assert.equal(payload.data.extraction?.platform, "Discord");
  assert.equal(payload.data.extraction?.primary_link?.kind, "magic_link");
  assert.equal(payload.data.results?.length, 1);
});

test("handlePublicEmailAttachment downloads retained attachment content", async () => {
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => {
          if (query.includes("SELECT id, filename, mime_type, disposition, content_id, size_bytes, is_stored FROM email_attachments")) {
            return {
              results: [
                {
                  content_id: null,
                  disposition: "attachment",
                  filename: "hello.txt",
                  id: 9,
                  is_stored: 1,
                  mime_type: "text/plain",
                  size_bytes: 5,
                },
              ],
            };
          }

          return { results: [] };
        },
        first: async () => {
          if (query.includes("content_base64")) {
            return {
              content_base64: "aGVsbG8=",
              content_id: null,
              disposition: "attachment",
              filename: "hello.txt",
              id: 9,
              is_stored: 1,
              mime_type: "text/plain",
              size_bytes: 5,
            };
          }

          if (query.includes("FROM emails")) {
            return {
              deleted_at: null,
              extracted_json: "[]",
              from_address: "noreply@example.com",
              has_attachments: 1,
              html_body: "",
              mailbox_pool_id: null,
              mailbox_pool_name: "",
              mailbox_pool_slug: "",
              message_id: "msg-attachment-1",
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              note: "",
              primary_mailbox_address: "code@example.com",
              project_id: 1,
              project_name: "Console",
              project_slug: "console",
              raw_headers: "[]",
              received_at: 1774760673400,
              subject: "Attachment",
              tags: "[]",
              text_body: "hello",
              to_address: "code@example.com",
            };
          }

          return null;
        },
        run: async () => ({}),
      };
    },
  };

  const response = await handlePublicEmailAttachment("/api/emails/msg-attachment-1/attachments/9", db);
  const content = Buffer.from(await response.arrayBuffer()).toString("utf8");

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "text/plain");
  assert.match(response.headers.get("Content-Disposition") || "", /hello\.txt/);
  assert.equal(content, "hello");
});

test("handleAdminRulesPost rejects read-only analyst role", async () => {
  const db: D1Database = {
    prepare(): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({}),
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "admin_user",
    display_name: "Analyst",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "analyst",
    user_agent_hash: "ua",
    user_id: "analyst-1",
    username: "analyst",
  };

  const request = new Request("https://example.com/admin/rules", {
    body: JSON.stringify({
      is_enabled: true,
      pattern: "code",
      remark: "验证码",
      sender_filter: "",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const response = await handleAdminRulesPost(request, db, actor);
  const payload = await response.json() as { message?: string };

  assert.equal(response.status, 403);
  assert.equal(payload.message, "read-only role cannot modify resources");
});

test("handleAdminWhitelistSettingsPut rejects project-scoped admin for global whitelist switch", async () => {
  const db: D1Database = {
    prepare(): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({}),
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "bound",
    auth_kind: "admin_user",
    display_name: "Project Admin",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    project_ids: [1],
    role: "admin",
    user_agent_hash: "ua",
    user_id: "admin-1",
    username: "project-admin",
  };

  const request = new Request("https://example.com/admin/whitelist/settings", {
    body: JSON.stringify({ enabled: true }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });

  const response = await handleAdminWhitelistSettingsPut(request, db, actor);
  const payload = await response.json() as { message?: string };

  assert.equal(response.status, 403);
  assert.equal(payload.message, "project-scoped admin cannot manage global settings");
});

test("handleAdminEmailArchive archives active email and writes audit log", async () => {
  const runCalls: Array<{ params: unknown[]; query: string }> = [];

  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      let params: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        all: async () => {
          if (query.includes("FROM email_attachments")) {
            return { results: [] };
          }
          return { results: [] };
        },
        first: async () => {
          if (query.includes("FROM emails") && query.includes("WHERE emails.message_id = ?")) {
            return {
              archive_reason: "",
              archived_at: null,
              archived_by: "",
              deleted_at: null,
              extracted_json: "[]",
              from_address: "noreply@example.com",
              has_attachments: 0,
              html_body: "",
              mailbox_pool_id: null,
              mailbox_pool_name: "",
              mailbox_pool_slug: "",
              message_id: "msg-archive-1",
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              note: "",
              primary_mailbox_address: "code@example.com",
              project_id: 1,
              project_name: "Console",
              project_slug: "console",
              raw_headers: "[]",
              received_at: 1774760673000,
              subject: "Archive me",
              tags: "[]",
              text_body: "hello",
              to_address: "code@example.com",
            };
          }
          return null;
        },
        run: async () => {
          runCalls.push({ params, query });
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
    nonce: "n",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner-1",
    username: "owner",
  };

  const response = await handleAdminEmailArchive("/admin/emails/msg-archive-1/archive", db, actor);
  const payload = await response.json() as { code: number; data: { ok: boolean } };

  assert.equal(response.status, 200);
  assert.equal(payload.data.ok, true);
  assert.equal(runCalls.some(call => call.query.includes("UPDATE emails SET archived_at = ?")), true);
  assert.equal(runCalls.some(call => call.query.includes("INSERT INTO audit_logs")), true);
});

test("handleAdminEmailUnarchive rejects emails that are not archived", async () => {
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => (query.includes("FROM email_attachments") ? { results: [] } : { results: [] }),
        first: async () => {
          if (query.includes("FROM emails") && query.includes("WHERE emails.message_id = ?")) {
            return {
              archive_reason: "",
              archived_at: null,
              archived_by: "",
              deleted_at: null,
              extracted_json: "[]",
              from_address: "noreply@example.com",
              has_attachments: 0,
              html_body: "",
              mailbox_pool_id: null,
              mailbox_pool_name: "",
              mailbox_pool_slug: "",
              message_id: "msg-archive-2",
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              note: "",
              primary_mailbox_address: "code@example.com",
              project_id: 1,
              project_name: "Console",
              project_slug: "console",
              raw_headers: "[]",
              received_at: 1774760673000,
              subject: "Archive me",
              tags: "[]",
              text_body: "hello",
              to_address: "code@example.com",
            };
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
    nonce: "n",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner-1",
    username: "owner",
  };

  const response = await handleAdminEmailUnarchive("/admin/emails/msg-archive-2/unarchive", db, actor);
  const payload = await response.json() as { message?: string };

  assert.equal(response.status, 409);
  assert.equal(payload.message, "email is not archived");
});

test("handleAdminEmailDetail allows viewer to read scoped email", async () => {
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => (query.includes("FROM email_attachments") ? { results: [] } : { results: [] }),
        first: async () => {
          if (query.includes("FROM emails") && query.includes("WHERE emails.message_id = ?")) {
            return {
              archive_reason: "",
              archived_at: null,
              archived_by: "",
              deleted_at: null,
              extracted_json: "[]",
              from_address: "noreply@example.com",
              has_attachments: 0,
              html_body: "",
              mailbox_pool_id: null,
              mailbox_pool_name: "",
              mailbox_pool_slug: "",
              message_id: "msg-view-1",
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              note: "",
              primary_mailbox_address: "code@example.com",
              project_id: 1,
              project_name: "Console",
              project_slug: "console",
              raw_headers: "[]",
              received_at: 1774760673000,
              subject: "Viewer can read",
              tags: "[]",
              text_body: "hello",
              to_address: "code@example.com",
            };
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
    display_name: "Viewer",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "viewer",
    user_agent_hash: "ua",
    user_id: "viewer-1",
    username: "viewer",
  };

  const response = await handleAdminEmailDetail("/admin/emails/msg-view-1", db, actor);
  const payload = await response.json() as { data: { message_id: string } };

  assert.equal(response.status, 200);
  assert.equal(payload.data.message_id, "msg-view-1");
});

test("handleAdminEmailDelete rejects viewer role", async () => {
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => (query.includes("FROM email_attachments") ? { results: [] } : { results: [] }),
        first: async () => {
          if (query.includes("FROM emails") && query.includes("WHERE emails.message_id = ?")) {
            return {
              archive_reason: "",
              archived_at: null,
              archived_by: "",
              deleted_at: null,
              extracted_json: "[]",
              from_address: "noreply@example.com",
              has_attachments: 0,
              html_body: "",
              mailbox_pool_id: null,
              mailbox_pool_name: "",
              mailbox_pool_slug: "",
              message_id: "msg-delete-1",
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              note: "",
              primary_mailbox_address: "code@example.com",
              project_id: 1,
              project_name: "Console",
              project_slug: "console",
              raw_headers: "[]",
              received_at: 1774760673000,
              subject: "Viewer cannot delete",
              tags: "[]",
              text_body: "hello",
              to_address: "code@example.com",
            };
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
    display_name: "Viewer",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "viewer",
    user_agent_hash: "ua",
    user_id: "viewer-1",
    username: "viewer",
  };

  const response = await handleAdminEmailDelete(
    "/admin/emails/msg-delete-1",
    new Request("https://example.com/admin/emails/msg-delete-1", { method: "DELETE" }),
    db,
    actor,
  );
  const payload = await response.json() as { message?: string };

  assert.equal(response.status, 403);
  assert.equal(payload.message, "read-only role cannot modify resources");
});

test("handleAdminAdminsPost rejects non-owner creating owner account", async () => {
  const db: D1Database = {
    prepare(): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({}),
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "admin_user",
    display_name: "Global Admin",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "admin",
    user_agent_hash: "ua",
    user_id: "admin-1",
    username: "global-admin",
  };

  const request = new Request("https://example.com/admin/admins", {
    body: JSON.stringify({
      access_scope: "all",
      display_name: "Owner 2",
      is_enabled: true,
      password: "Password123!",
      role: "owner",
      username: "owner-2",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const response = await handleAdminAdminsPost(request, db, actor);
  const payload = await response.json() as { message?: string };

  assert.equal(response.status, 403);
  assert.equal(payload.message, "only owner can manage owner accounts");
});

test("handleAdminDomains returns configured domain assets with env fallback", async () => {
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => {
          if (query.includes("FROM domains d") && query.includes("WHERE d.is_enabled = 1")) {
            return {
              results: [
                {
                  catch_all_forward_to: "",
                  catch_all_mode: "inherit",
                  created_at: 1,
                  domain: "alpha.example.com",
                  email_worker: "worker-a",
                  environment_id: null,
                  environment_name: "",
                  environment_slug: "",
                  id: 1,
                  is_enabled: 1,
                  is_primary: 1,
                  note: "",
                  provider: "cloudflare",
                  project_id: null,
                  project_name: "",
                  project_slug: "",
                  updated_at: 1,
                  zone_id: "zone-a",
                },
                {
                  catch_all_forward_to: "",
                  catch_all_mode: "inherit",
                  created_at: 1,
                  domain: "beta.example.com",
                  email_worker: "worker-b",
                  environment_id: null,
                  environment_name: "",
                  environment_slug: "",
                  id: 2,
                  is_enabled: 1,
                  is_primary: 0,
                  note: "",
                  provider: "cloudflare",
                  project_id: null,
                  project_name: "",
                  project_slug: "",
                  updated_at: 1,
                  zone_id: "zone-b",
                },
              ],
            };
          }

          throw new Error(`Unexpected query: ${query}`);
        },
        first: async () => null,
        run: async () => ({}),
      };
    },
  };

  const actor: AuthSession = {
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };
  const env = { DB: db, MAILBOX_DOMAIN: "fallback.example.com" } as WorkerEnv;

  const response = await handleAdminDomains(new URL("https://example.com/admin/domains"), db, actor, env);
  const payload = await response.json() as { code: number; data: { domains: string[] } };

  assert.equal(response.status, 200);
  assert.deepEqual(payload.data.domains, [
    "alpha.example.com",
    "beta.example.com",
    "fallback.example.com",
  ]);
});

test("handleAdminDomains filters out mailbox-creation-disabled domains for mailbox_create purpose", async () => {
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => {
          if (query.includes("FROM domains d") && query.includes("WHERE d.is_enabled = 1")) {
            return {
              results: [
                {
                  allow_mailbox_route_sync: 1,
                  allow_new_mailboxes: 0,
                  catch_all_forward_to: "",
                  catch_all_mode: "inherit",
                  created_at: 1,
                  domain: "alpha.example.com",
                  email_worker: "worker-a",
                  environment_id: null,
                  environment_name: "",
                  environment_slug: "",
                  id: 1,
                  is_enabled: 1,
                  is_primary: 1,
                  note: "",
                  provider: "cloudflare",
                  project_id: null,
                  project_name: "",
                  project_slug: "",
                  updated_at: 1,
                  zone_id: "zone-a",
                },
                {
                  allow_mailbox_route_sync: 1,
                  allow_new_mailboxes: 1,
                  catch_all_forward_to: "",
                  catch_all_mode: "inherit",
                  created_at: 1,
                  domain: "beta.example.com",
                  email_worker: "worker-b",
                  environment_id: null,
                  environment_name: "",
                  environment_slug: "",
                  id: 2,
                  is_enabled: 1,
                  is_primary: 0,
                  note: "",
                  provider: "cloudflare",
                  project_id: null,
                  project_name: "",
                  project_slug: "",
                  updated_at: 1,
                  zone_id: "zone-b",
                },
              ],
            };
          }

          throw new Error(`Unexpected query: ${query}`);
        },
        first: async () => null,
        run: async () => ({}),
      };
    },
  };

  const actor: AuthSession = {
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };
  const env = { DB: db, MAILBOX_DOMAIN: "" } as WorkerEnv;

  const response = await handleAdminDomains(
    new URL("https://example.com/admin/domains?purpose=mailbox_create"),
    db,
    actor,
    env,
  );
  const payload = await response.json() as { code: number; data: { default_domain: string; domains: string[] } };

  assert.equal(response.status, 200);
  assert.equal(payload.data.default_domain, "beta.example.com");
  assert.deepEqual(payload.data.domains, ["beta.example.com"]);
});

test("handleAdminDomains filters domains by project and environment workspace", async () => {
  const domainRows = [
    {
      catch_all_forward_to: "",
      catch_all_mode: "inherit",
      created_at: 1,
      domain: "global.example.com",
      email_worker: "worker-global",
      environment_id: null,
      environment_name: "",
      environment_slug: "",
      id: 1,
      is_enabled: 1,
      is_primary: 0,
      note: "",
      project_id: null,
      project_name: "",
      project_slug: "",
      provider: "cloudflare",
      updated_at: 1,
      zone_id: "zone-global",
    },
    {
      catch_all_forward_to: "",
      catch_all_mode: "inherit",
      created_at: 1,
      domain: "alpha.example.com",
      email_worker: "worker-alpha",
      environment_id: null,
      environment_name: "",
      environment_slug: "",
      id: 2,
      is_enabled: 1,
      is_primary: 0,
      note: "",
      project_id: 1,
      project_name: "Alpha",
      project_slug: "alpha",
      provider: "cloudflare",
      updated_at: 1,
      zone_id: "zone-alpha",
    },
    {
      catch_all_forward_to: "",
      catch_all_mode: "inherit",
      created_at: 1,
      domain: "alpha-staging.example.com",
      email_worker: "worker-alpha-staging",
      environment_id: 10,
      environment_name: "Staging",
      environment_slug: "staging",
      id: 3,
      is_enabled: 1,
      is_primary: 1,
      note: "",
      project_id: 1,
      project_name: "Alpha",
      project_slug: "alpha",
      provider: "cloudflare",
      updated_at: 1,
      zone_id: "zone-alpha-staging",
    },
    {
      catch_all_forward_to: "",
      catch_all_mode: "inherit",
      created_at: 1,
      domain: "beta.example.com",
      email_worker: "worker-beta",
      environment_id: null,
      environment_name: "",
      environment_slug: "",
      id: 4,
      is_enabled: 1,
      is_primary: 0,
      note: "",
      project_id: 2,
      project_name: "Beta",
      project_slug: "beta",
      provider: "cloudflare",
      updated_at: 1,
      zone_id: "zone-beta",
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
          if (query.includes("FROM domains d")) {
            return { results: domainRows };
          }

          throw new Error(`Unexpected query: ${query}`);
        },
        first: async () => {
          if (query.includes("FROM domains d") && query.includes("WHERE d.domain = ? LIMIT 1")) {
            const domain = String(params[0] || "");
            return domainRows.find(item => item.domain === domain) || null;
          }

          if (query.includes("FROM projects WHERE id = ?")) {
            return {
              created_at: 1,
              description: "",
              id: 1,
              is_enabled: 1,
              name: "Alpha",
              slug: "alpha",
              updated_at: 1,
            };
          }

          if (query.includes("FROM environments e") && query.includes("WHERE e.id = ?")) {
            return {
              created_at: 1,
              description: "",
              id: 10,
              is_enabled: 1,
              name: "Staging",
              project_id: 1,
              project_name: "Alpha",
              project_slug: "alpha",
              slug: "staging",
              updated_at: 1,
            };
          }

          return null;
        },
        run: async () => ({}),
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };
  const env = { DB: db, MAILBOX_DOMAIN: "beta.example.com" } as WorkerEnv;

  const response = await handleAdminDomains(
    new URL("https://example.com/admin/domains?project_id=1&environment_id=10"),
    db,
    actor,
    env,
  );
  const payload = await response.json() as { code: number; data: { default_domain: string; domains: string[] } };

  assert.equal(response.status, 200);
  assert.equal(payload.data.default_domain, "alpha-staging.example.com");
  assert.deepEqual(payload.data.domains, [
    "alpha-staging.example.com",
    "alpha.example.com",
    "global.example.com",
  ]);
});

test("handleAdminDomains falls back to env domain when domain table is missing", async () => {
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => {
          if (query.includes("FROM domains d")) {
            throw new Error("no such table: domains");
          }
          if (query.includes("SELECT to_address FROM emails")) {
            return { results: [] };
          }
          if (query.includes("SELECT address FROM mailboxes")) {
            return { results: [] };
          }

          throw new Error(`Unexpected query: ${query}`);
        },
        first: async () => null,
        run: async () => ({}),
      };
    },
  };

  const actor: AuthSession = {
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };
  const env = { DB: db, MAILBOX_DOMAIN: "fallback.example.com" } as WorkerEnv;

  const response = await handleAdminDomains(new URL("https://example.com/admin/domains"), db, actor, env);
  const payload = await response.json() as { code: number; data: { domains: string[] } };

  assert.equal(response.status, 200);
  assert.deepEqual(payload.data.domains, ["fallback.example.com"]);
});

test("handleAdminDomainAssetsPut writes governance audit action when only governance changes", async () => {
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
          if (query.includes("FROM domains d") && query.includes("WHERE d.id = ? LIMIT 1")) {
            return {
              allow_mailbox_route_sync: 1,
              allow_new_mailboxes: 1,
              catch_all_forward_to: "",
              catch_all_mode: "inherit",
              created_at: 1,
              domain: "alpha.example.com",
              email_worker: "worker-alpha",
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              id: 9,
              is_enabled: 1,
              is_primary: 0,
              note: "",
              project_id: 1,
              project_name: "Alpha",
              project_slug: "alpha",
              provider: "cloudflare",
              routing_profile_catch_all_forward_to: "",
              routing_profile_catch_all_mode: "inherit",
              routing_profile_enabled: 0,
              routing_profile_id: null,
              routing_profile_name: "",
              routing_profile_slug: "",
              updated_at: 1,
              zone_id: "zone-alpha",
            };
          }

          if (query.includes("FROM projects WHERE id = ?")) {
            return {
              created_at: 1,
              description: "",
              id: 1,
              is_enabled: 1,
              name: "Alpha",
              slug: "alpha",
              updated_at: 1,
            };
          }

          return null;
        },
        run: async () => {
          if (query.includes("INSERT INTO audit_logs")) {
            auditRows.push(params);
          }
          return {};
        },
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };

  const request = new Request("https://example.com/admin/domain-assets/9", {
    body: JSON.stringify({
      allow_mailbox_route_sync: true,
      allow_new_mailboxes: false,
      catch_all_forward_to: "",
      catch_all_mode: "inherit",
      cloudflare_api_token: "",
      cloudflare_api_token_mode: "global",
      domain: "alpha.example.com",
      email_worker: "worker-alpha",
      environment_id: null,
      is_enabled: true,
      is_primary: false,
      note: "",
      operation_note: "按治理策略关闭新建邮箱",
      project_id: 1,
      provider: "cloudflare",
      routing_profile_id: null,
      zone_id: "zone-alpha",
    }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });

  const response = await handleAdminDomainAssetsPut("/admin/domain-assets/9", request, db, actor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "domain.governance.update");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.domain, "alpha.example.com");
  assert.deepEqual(detail.change_kinds, ["governance"]);
  assert.equal(detail.operation_note, "按治理策略关闭新建邮箱");
  assert.deepEqual(detail.changed_fields, ["allow_new_mailboxes"]);
  assert.equal(detail.previous_governance?.allow_new_mailboxes, true);
  assert.equal(detail.next_governance?.allow_new_mailboxes, false);
  assert.equal(detail.previous_governance?.allow_mailbox_route_sync, true);
  assert.equal(detail.next_governance?.allow_mailbox_route_sync, true);
});

test("handleAdminDomainAssetsPost allows project-scoped admin to create project domain", async () => {
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
          if (query.includes("FROM projects WHERE id = ?")) {
            return {
              created_at: 1,
              description: "",
              id: 1,
              is_enabled: 1,
              name: "Alpha",
              slug: "alpha",
              updated_at: 1,
            };
          }

          return null;
        },
        run: async () => {
          if (query.includes("INSERT INTO domains")) {
            return { meta: { last_row_id: 21 } };
          }
          if (query.includes("INSERT INTO audit_logs")) {
            auditRows.push(params);
          }
          return {};
        },
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "bound",
    auth_kind: "admin_user",
    display_name: "Project Admin",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    project_ids: [1],
    role: "admin",
    user_agent_hash: "ua",
    user_id: "admin-1",
    username: "project-admin",
  };

  const request = new Request("https://example.com/admin/domain-assets", {
    body: JSON.stringify({
      allow_mailbox_route_sync: true,
      allow_new_mailboxes: true,
      catch_all_forward_to: "",
      catch_all_mode: "inherit",
      cloudflare_api_token: "",
      cloudflare_api_token_mode: "global",
      domain: "alpha.example.com",
      email_worker: "worker-alpha",
      environment_id: null,
      is_enabled: true,
      is_primary: false,
      note: "alpha domain",
      operation_note: "补录项目域名资产",
      project_id: 1,
      provider: "cloudflare",
      routing_profile_id: null,
      zone_id: "zone-alpha",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const response = await handleAdminDomainAssetsPost(request, db, actor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "domain.create");
  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.domain, "alpha.example.com");
  assert.equal(detail.operation_note, "补录项目域名资产");
});

test("handleAdminDomainAssetsPut rejects project-scoped admin updating global domain", async () => {
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => ({ results: [] }),
        first: async () => {
          if (query.includes("FROM domains d") && query.includes("WHERE d.id = ? LIMIT 1")) {
            return {
              allow_mailbox_route_sync: 1,
              allow_new_mailboxes: 1,
              catch_all_forward_to: "",
              catch_all_mode: "inherit",
              created_at: 1,
              domain: "global.example.com",
              email_worker: "worker-global",
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              id: 30,
              is_enabled: 1,
              is_primary: 0,
              note: "",
              project_id: null,
              project_name: "",
              project_slug: "",
              provider: "cloudflare",
              routing_profile_catch_all_forward_to: "",
              routing_profile_catch_all_mode: "inherit",
              routing_profile_enabled: 0,
              routing_profile_id: null,
              routing_profile_name: "",
              routing_profile_slug: "",
              updated_at: 1,
              zone_id: "zone-global",
            };
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
    display_name: "Project Admin",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    project_ids: [1],
    role: "admin",
    user_agent_hash: "ua",
    user_id: "admin-1",
    username: "project-admin",
  };

  const request = new Request("https://example.com/admin/domain-assets/30", {
    body: JSON.stringify({
      allow_mailbox_route_sync: true,
      allow_new_mailboxes: true,
      catch_all_forward_to: "",
      catch_all_mode: "inherit",
      domain: "global.example.com",
      email_worker: "worker-global",
      environment_id: null,
      is_enabled: true,
      is_primary: false,
      note: "",
      project_id: null,
      provider: "cloudflare",
      routing_profile_id: null,
      zone_id: "zone-global",
    }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });

  const response = await handleAdminDomainAssetsPut("/admin/domain-assets/30", request, db, actor);
  const payload = await response.json() as { message?: string };

  assert.equal(response.status, 403);
  assert.equal(payload.message, "project access denied");
});

test("handleAdminDomainAssetsPut rejects disabling a domain with active mailboxes", async () => {
  let updateCalled = false;

  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => {
          if (query.includes("SELECT address FROM mailboxes")) {
            return {
              results: [
                { address: "ops@alpha.example.com" },
              ],
            };
          }
          if (query.includes("SELECT to_address FROM emails")) {
            return { results: [] };
          }
          return { results: [] };
        },
        first: async () => {
          if (query.includes("FROM domains d") && query.includes("WHERE d.id = ? LIMIT 1")) {
            return {
              allow_catch_all_sync: 1,
              allow_mailbox_route_sync: 1,
              allow_new_mailboxes: 1,
              catch_all_forward_to: "",
              catch_all_mode: "inherit",
              cloudflare_api_token: "",
              cloudflare_api_token_configured: 0,
              created_at: 1,
              domain: "alpha.example.com",
              email_worker: "worker-alpha",
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              id: 11,
              is_enabled: 1,
              is_primary: 0,
              mailbox_route_forward_to: "",
              note: "",
              project_id: 1,
              project_name: "Alpha",
              project_slug: "alpha",
              provider: "cloudflare",
              routing_profile_catch_all_forward_to: "",
              routing_profile_catch_all_mode: "inherit",
              routing_profile_enabled: 0,
              routing_profile_id: null,
              routing_profile_name: "",
              routing_profile_slug: "",
              updated_at: 1,
              zone_id: "zone-alpha",
            };
          }

          if (query.includes("FROM projects WHERE id = ?")) {
            return {
              created_at: 1,
              description: "",
              id: 1,
              is_enabled: 1,
              name: "Alpha",
              slug: "alpha",
              updated_at: 1,
            };
          }

          return null;
        },
        run: async () => {
          if (query.startsWith("UPDATE domains SET")) {
            updateCalled = true;
          }
          return {};
        },
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };

  const request = new Request("https://example.com/admin/domain-assets/11", {
    body: JSON.stringify({
      allow_catch_all_sync: true,
      allow_mailbox_route_sync: true,
      allow_new_mailboxes: true,
      catch_all_forward_to: "",
      catch_all_mode: "inherit",
      cloudflare_api_token: "",
      cloudflare_api_token_mode: "global",
      domain: "alpha.example.com",
      email_worker: "worker-alpha",
      environment_id: null,
      is_enabled: false,
      is_primary: false,
      mailbox_route_forward_to: "",
      note: "",
      project_id: 1,
      provider: "cloudflare",
      routing_profile_id: null,
      zone_id: "zone-alpha",
    }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });

  const response = await handleAdminDomainAssetsPut("/admin/domain-assets/11", request, db, actor);
  const payload = await response.json() as { message?: string };

  assert.equal(response.status, 409);
  assert.equal(
    payload.message,
    "cannot disable domain while 1 active mailbox still use alpha.example.com; disable or delete those mailboxes first",
  );
  assert.equal(updateCalled, false);
});

test("handleAdminDomainAssetsPut rejects renaming a domain with active mailboxes", async () => {
  let updateCalled = false;

  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => {
          if (query.includes("SELECT address FROM mailboxes")) {
            return {
              results: [
                { address: "ops@alpha.example.com" },
                { address: "verify@alpha.example.com" },
              ],
            };
          }
          if (query.includes("SELECT to_address FROM emails")) {
            return { results: [] };
          }
          return { results: [] };
        },
        first: async () => {
          if (query.includes("FROM domains d") && query.includes("WHERE d.id = ? LIMIT 1")) {
            return {
              allow_catch_all_sync: 1,
              allow_mailbox_route_sync: 1,
              allow_new_mailboxes: 1,
              catch_all_forward_to: "",
              catch_all_mode: "inherit",
              cloudflare_api_token: "",
              cloudflare_api_token_configured: 0,
              created_at: 1,
              domain: "alpha.example.com",
              email_worker: "worker-alpha",
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              id: 12,
              is_enabled: 1,
              is_primary: 0,
              mailbox_route_forward_to: "",
              note: "",
              project_id: 1,
              project_name: "Alpha",
              project_slug: "alpha",
              provider: "cloudflare",
              routing_profile_catch_all_forward_to: "",
              routing_profile_catch_all_mode: "inherit",
              routing_profile_enabled: 0,
              routing_profile_id: null,
              routing_profile_name: "",
              routing_profile_slug: "",
              updated_at: 1,
              zone_id: "zone-alpha",
            };
          }

          if (query.includes("FROM projects WHERE id = ?")) {
            return {
              created_at: 1,
              description: "",
              id: 1,
              is_enabled: 1,
              name: "Alpha",
              slug: "alpha",
              updated_at: 1,
            };
          }

          return null;
        },
        run: async () => {
          if (query.startsWith("UPDATE domains SET")) {
            updateCalled = true;
          }
          return {};
        },
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };

  const request = new Request("https://example.com/admin/domain-assets/12", {
    body: JSON.stringify({
      allow_catch_all_sync: true,
      allow_mailbox_route_sync: true,
      allow_new_mailboxes: true,
      catch_all_forward_to: "",
      catch_all_mode: "inherit",
      cloudflare_api_token: "",
      cloudflare_api_token_mode: "global",
      domain: "beta.example.com",
      email_worker: "worker-alpha",
      environment_id: null,
      is_enabled: true,
      is_primary: false,
      mailbox_route_forward_to: "",
      note: "",
      project_id: 1,
      provider: "cloudflare",
      routing_profile_id: null,
      zone_id: "zone-alpha",
    }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });

  const response = await handleAdminDomainAssetsPut("/admin/domain-assets/12", request, db, actor);
  const payload = await response.json() as { message?: string };

  assert.equal(response.status, 409);
  assert.equal(
    payload.message,
    "cannot change domain while 2 active mailboxes still use alpha.example.com; disable or delete those mailboxes first",
  );
  assert.equal(updateCalled, false);
});

test("handleAdminDomainAssetsDelete rejects domains with active mailboxes", async () => {
  let deleteCalled = false;

  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => {
          if (query.includes("SELECT address FROM mailboxes")) {
            return {
              results: [
                { address: "ops@alpha.example.com" },
                { address: "verify@alpha.example.com" },
              ],
            };
          }
          if (query.includes("SELECT to_address FROM emails")) {
            return { results: [] };
          }
          return { results: [] };
        },
        first: async () => {
          if (query.includes("FROM domains d") && query.includes("WHERE d.id = ? LIMIT 1")) {
            return {
              allow_catch_all_sync: 1,
              allow_mailbox_route_sync: 1,
              allow_new_mailboxes: 1,
              catch_all_forward_to: "",
              catch_all_mode: "inherit",
              created_at: 1,
              domain: "alpha.example.com",
              email_worker: "worker-alpha",
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              id: 13,
              is_enabled: 1,
              is_primary: 0,
              mailbox_route_forward_to: "",
              note: "",
              project_id: 1,
              project_name: "Alpha",
              project_slug: "alpha",
              provider: "cloudflare",
              routing_profile_catch_all_forward_to: "",
              routing_profile_catch_all_mode: "inherit",
              routing_profile_enabled: 0,
              routing_profile_id: null,
              routing_profile_name: "",
              routing_profile_slug: "",
              updated_at: 1,
              zone_id: "zone-alpha",
            };
          }

          return null;
        },
        run: async () => {
          if (query.startsWith("DELETE FROM domains")) {
            deleteCalled = true;
          }
          return {};
        },
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };

  const request = new Request("https://example.com/admin/domain-assets/13", {
    method: "DELETE",
  });

  const response = await handleAdminDomainAssetsDelete("/admin/domain-assets/13", request, db, actor);
  const payload = await response.json() as { message?: string };

  assert.equal(response.status, 409);
  assert.equal(
    payload.message,
    "cannot delete domain while 2 active mailboxes still use alpha.example.com; disable or delete those mailboxes first",
  );
  assert.equal(deleteCalled, false);
});

test("handleAdminDomainAssetsDelete records operation note with domain snapshot", async () => {
  const auditRows: unknown[][] = [];
  let deleteCalled = false;

  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      let params: unknown[] = [];

      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        all: async () => {
          if (query.includes("SELECT address FROM mailboxes")) {
            return { results: [] };
          }
          if (query.includes("SELECT to_address FROM emails")) {
            return { results: [] };
          }
          return { results: [] };
        },
        first: async () => {
          if (query.includes("FROM domains d") && query.includes("WHERE d.id = ? LIMIT 1")) {
            return {
              allow_catch_all_sync: 1,
              allow_mailbox_route_sync: 1,
              allow_new_mailboxes: 1,
              catch_all_forward_to: "",
              catch_all_mode: "inherit",
              cloudflare_api_token_configured: 1,
              created_at: 1,
              domain: "alpha.example.com",
              email_worker: "worker-alpha",
              environment_id: 2,
              environment_name: "Prod",
              environment_slug: "prod",
              id: Number(params[0]),
              is_enabled: 1,
              is_primary: 0,
              mailbox_route_forward_to: "catch@vixenahri.cn",
              note: "核心收件域名",
              project_id: 1,
              project_name: "Alpha",
              project_slug: "alpha",
              provider: "cloudflare",
              routing_profile_catch_all_forward_to: "",
              routing_profile_catch_all_mode: "inherit",
              routing_profile_enabled: 0,
              routing_profile_id: null,
              routing_profile_name: "",
              routing_profile_slug: "",
              updated_at: 1,
              zone_id: "zone-alpha",
            };
          }
          return null;
        },
        run: async () => {
          if (query.startsWith("DELETE FROM domains")) {
            deleteCalled = true;
          }
          if (query.startsWith("INSERT INTO audit_logs")) {
            auditRows.push(params);
          }
          return {};
        },
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };

  const request = new Request("https://example.com/admin/domain-assets/14", {
    body: JSON.stringify({
      operation_note: "下线旧接入域名",
    }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });

  const response = await handleAdminDomainAssetsDelete("/admin/domain-assets/14", request, db, actor);

  assert.equal(response.status, 200);
  assert.equal(deleteCalled, true);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "domain.delete");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.domain, "alpha.example.com");
  assert.equal(detail.operation_note, "下线旧接入域名");
  assert.equal(detail.cloudflare_api_token_configured, true);
  assert.equal(detail.project_id, 1);
});

test("handleAdminDomainAssetsStatusGet resolves catch-all policy from bound routing profile", async () => {
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => {
          if (query.includes("FROM domains d")) {
            return {
              results: [
                {
                  catch_all_forward_to: "",
                  catch_all_mode: "inherit",
                  created_at: 1,
                  domain: "alpha.example.com",
                  email_worker: "",
                  environment_id: null,
                  environment_name: "",
                  environment_slug: "",
                  id: 1,
                  is_enabled: 1,
                  is_primary: 0,
                  note: "",
                  project_id: null,
                  project_name: "",
                  project_slug: "",
                  provider: "cloudflare",
                  routing_profile_catch_all_forward_to: "ops@example.com",
                  routing_profile_catch_all_mode: "enabled",
                  routing_profile_enabled: 1,
                  routing_profile_id: 9,
                  routing_profile_name: "默认转发策略",
                  routing_profile_slug: "default-forward",
                  updated_at: 1,
                  zone_id: "",
                },
              ],
            };
          }

          if (query.includes("SELECT address FROM mailboxes")) {
            return { results: [] };
          }

          if (query.includes("SELECT to_address FROM emails")) {
            return { results: [] };
          }

          throw new Error(`Unexpected query: ${query}`);
        },
        first: async () => null,
        run: async () => ({}),
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };
  const env = { DB: db, MAILBOX_DOMAIN: "" } as WorkerEnv;

  const response = await handleAdminDomainAssetsStatusGet(db, env, actor);
  const payload = await response.json() as { code: number; data: Array<Record<string, any>> };

  assert.equal(response.status, 200);
  assert.equal(payload.data.length, 1);
  assert.equal(payload.data[0]?.catch_all_mode, "enabled");
  assert.equal(payload.data[0]?.catch_all_source, "routing_profile");
  assert.equal(payload.data[0]?.catch_all_forward_to, "ops@example.com");
  assert.equal(payload.data[0]?.routing_profile_name, "默认转发策略");
});

test("handleAdminDomainProvidersGet returns available domain providers", async () => {
  const response = await handleAdminDomainProvidersGet();
  const payload = await response.json() as { code: number; data: Array<Record<string, any>> };

  assert.equal(response.status, 200);
  assert.equal(payload.data.length >= 2, true);
  assert.deepEqual(
    payload.data.map(item => item.key),
    ["cloudflare", "manual"],
  );
});

test("handleAdminDomainAssetsStatusGet keeps domain-level catch-all override above routing profile", async () => {
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => {
          if (query.includes("FROM domains d")) {
            return {
              results: [
                {
                  catch_all_forward_to: "",
                  catch_all_mode: "disabled",
                  created_at: 1,
                  domain: "beta.example.com",
                  email_worker: "",
                  environment_id: null,
                  environment_name: "",
                  environment_slug: "",
                  id: 2,
                  is_enabled: 1,
                  is_primary: 0,
                  note: "",
                  project_id: null,
                  project_name: "",
                  project_slug: "",
                  provider: "cloudflare",
                  routing_profile_catch_all_forward_to: "ops@example.com",
                  routing_profile_catch_all_mode: "enabled",
                  routing_profile_enabled: 1,
                  routing_profile_id: 11,
                  routing_profile_name: "共享默认策略",
                  routing_profile_slug: "shared-default",
                  updated_at: 1,
                  zone_id: "",
                },
              ],
            };
          }

          if (query.includes("SELECT address FROM mailboxes")) {
            return { results: [] };
          }

          if (query.includes("SELECT to_address FROM emails")) {
            return { results: [] };
          }

          throw new Error(`Unexpected query: ${query}`);
        },
        first: async () => null,
        run: async () => ({}),
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };
  const env = { DB: db, MAILBOX_DOMAIN: "" } as WorkerEnv;

  const response = await handleAdminDomainAssetsStatusGet(db, env, actor);
  const payload = await response.json() as { code: number; data: Array<Record<string, any>> };

  assert.equal(response.status, 200);
  assert.equal(payload.data.length, 1);
  assert.equal(payload.data[0]?.catch_all_mode, "disabled");
  assert.equal(payload.data[0]?.catch_all_source, "domain");
  assert.equal(payload.data[0]?.routing_profile_name, "共享默认策略");
});
test("handleAdminDomainAssetsPost stores domain-scoped Cloudflare token without leaking audit secret", async () => {
  const domainRows: unknown[][] = [];
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
          if (query.includes("FROM projects WHERE id = ?")) {
            return {
              created_at: 1,
              description: "",
              id: 1,
              is_enabled: 1,
              name: "Alpha",
              slug: "alpha",
              updated_at: 1,
            };
          }

          return null;
        },
        run: async () => {
          if (query.includes("INSERT INTO domains")) {
            domainRows.push(params);
            return { meta: { last_row_id: 51 } };
          }
          if (query.includes("INSERT INTO audit_logs")) {
            auditRows.push(params);
          }
          return {};
        },
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };

  const request = new Request("https://example.com/admin/domain-assets", {
    body: JSON.stringify({
      allow_mailbox_route_sync: true,
      allow_new_mailboxes: true,
      catch_all_forward_to: "",
      catch_all_mode: "inherit",
      cloudflare_api_token: "domain-secret-123",
      cloudflare_api_token_mode: "domain",
      domain: "alpha.example.com",
      email_worker: "worker-alpha",
      environment_id: null,
      is_enabled: true,
      is_primary: false,
      mailbox_route_forward_to: "relay@primary.example.com",
      note: "alpha domain",
      project_id: 1,
      provider: "cloudflare",
      routing_profile_id: null,
      zone_id: "zone-alpha",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const response = await handleAdminDomainAssetsPost(request, db, actor);

  assert.equal(response.status, 200);
  assert.equal(domainRows.length, 1);
  assert.equal(domainRows[0]?.includes("domain-secret-123"), true);
  assert.equal(auditRows.length, 1);

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.cloudflare_api_token_configured, true);
  assert.equal(detail.cloudflare_api_token_mode, "domain");
  assert.equal(detail.mailbox_route_forward_to, "relay@primary.example.com");
  assert.equal(JSON.stringify(detail).includes("domain-secret-123"), false);
});

test("handleAdminDomainAssetsPut keeps existing domain-scoped token when replacement is blank", async () => {
  const updateRows: unknown[][] = [];
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
          if (query.includes("FROM domains d") && query.includes("WHERE d.id = ? LIMIT 1")) {
            return {
              allow_mailbox_route_sync: 1,
              allow_new_mailboxes: 1,
              catch_all_forward_to: "",
              catch_all_mode: "inherit",
              cloudflare_api_token: "existing-secret-456",
              cloudflare_api_token_configured: 1,
              created_at: 1,
              domain: "alpha.example.com",
              email_worker: "worker-alpha",
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              id: 9,
              is_enabled: 1,
              is_primary: 0,
              note: "",
              project_id: 1,
              project_name: "Alpha",
              project_slug: "alpha",
              provider: "cloudflare",
              routing_profile_catch_all_forward_to: "",
              routing_profile_catch_all_mode: "inherit",
              routing_profile_enabled: 0,
              routing_profile_id: null,
              routing_profile_name: "",
              routing_profile_slug: "",
              updated_at: 1,
              zone_id: "zone-alpha",
            };
          }

          if (query.includes("FROM projects WHERE id = ?")) {
            return {
              created_at: 1,
              description: "",
              id: 1,
              is_enabled: 1,
              name: "Alpha",
              slug: "alpha",
              updated_at: 1,
            };
          }

          return null;
        },
        run: async () => {
          if (query.includes("UPDATE domains SET")) {
            updateRows.push(params);
          }
          if (query.includes("INSERT INTO audit_logs")) {
            auditRows.push(params);
          }
          return {};
        },
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };

  const request = new Request("https://example.com/admin/domain-assets/9", {
    body: JSON.stringify({
      allow_mailbox_route_sync: true,
      allow_new_mailboxes: true,
      catch_all_forward_to: "",
      catch_all_mode: "inherit",
      cloudflare_api_token: "",
      cloudflare_api_token_mode: "domain",
      domain: "alpha.example.com",
      email_worker: "worker-alpha",
      environment_id: null,
      is_enabled: true,
      is_primary: false,
      note: "",
      project_id: 1,
      provider: "cloudflare",
      routing_profile_id: null,
      zone_id: "zone-alpha",
    }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });

  const response = await handleAdminDomainAssetsPut("/admin/domain-assets/9", request, db, actor);

  assert.equal(response.status, 200);
  assert.equal(updateRows.length, 1);
  assert.equal(updateRows[0]?.includes("existing-secret-456"), true);
  assert.equal(auditRows.length, 1);

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.deepEqual(detail.next_cloudflare_token, {
    cloudflare_api_token_configured: true,
    cloudflare_api_token_mode: "domain",
  });
  assert.equal(JSON.stringify(detail).includes("existing-secret-456"), false);
});

test("handleAdminDomainAssetsStatusGet prefers domain-scoped Cloudflare token for status reads", async () => {
  const fetchCalls: Array<{ authorization: string; url: string }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const headers = init?.headers as Record<string, string> | undefined;
    fetchCalls.push({
      authorization: String(headers?.Authorization || headers?.authorization || ""),
      url: String(input),
    });

    if (String(input).includes("/email/routing/rules/catch_all")) {
      return new Response(JSON.stringify({
        result: {
          actions: [{ type: "forward", value: ["ops@example.com"] }],
          enabled: true,
        },
        success: true,
      }), { status: 200 });
    }

    return new Response(JSON.stringify({
      result: [
        {
          actions: [{ type: "worker", value: ["worker-alpha"] }],
          enabled: true,
          matchers: [{ field: "to", type: "literal", value: "ops@alpha.example.com" }],
        },
      ],
      result_info: { total_pages: 1 },
      success: true,
    }), { status: 200 });
  };

  try {
    const db: D1Database = {
      prepare(query: string): D1PreparedStatement {
        return {
          bind() {
            return this;
          },
          all: async () => {
            if (query.includes("FROM domains d")) {
              return {
                results: [
                  {
                    allow_mailbox_route_sync: 1,
                    allow_new_mailboxes: 1,
                    catch_all_forward_to: "",
                    catch_all_mode: "inherit",
                    cloudflare_api_token: "domain-secret-789",
                    cloudflare_api_token_configured: 1,
                    created_at: 1,
                    domain: "alpha.example.com",
                    email_worker: "worker-alpha",
                    environment_id: null,
                    environment_name: "",
                    environment_slug: "",
                    id: 1,
                    is_enabled: 1,
                    is_primary: 0,
                    note: "",
                    project_id: null,
                    project_name: "",
                    project_slug: "",
                    provider: "cloudflare",
                    routing_profile_catch_all_forward_to: "",
                    routing_profile_catch_all_mode: "inherit",
                    routing_profile_enabled: 0,
                    routing_profile_id: null,
                    routing_profile_name: "",
                    routing_profile_slug: "",
                    updated_at: 1,
                    zone_id: "zone-alpha",
                  },
                ],
              };
            }

            if (query.includes("SELECT address FROM mailboxes")) {
              return { results: [] };
            }

            if (query.includes("SELECT to_address FROM emails")) {
              return { results: [] };
            }

            throw new Error(`Unexpected query: ${query}`);
          },
          first: async () => null,
          run: async () => ({}),
        };
      },
    };

    const actor: AuthSession = {
      access_scope: "all",
      auth_kind: "bootstrap_token",
      display_name: "Owner",
      expires_at: Date.now() + 60_000,
      nonce: "n",
      role: "owner",
      user_agent_hash: "ua",
      user_id: "owner",
      username: "owner",
    };
    const env = {
      CLOUDFLARE_API_TOKEN: "global-token",
      DB: db,
      MAILBOX_DOMAIN: "",
    } as WorkerEnv;

    const response = await handleAdminDomainAssetsStatusGet(db, env, actor);
    const payload = await response.json() as { code: number; data: Array<Record<string, any>> };

    assert.equal(response.status, 200);
    assert.equal(payload.data.length, 1);
    assert.equal(payload.data[0]?.cloudflare_configured, true);
    assert.equal(fetchCalls.length, 2);
    assert.deepEqual(
      fetchCalls.map(call => call.authorization),
      ["Bearer domain-secret-789", "Bearer domain-secret-789"],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("handleAdminDomainAssetsStatusGet reports mailbox route drift for missing and extra routes", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    if (String(input).includes("/email/routing/rules/catch_all")) {
      return new Response(JSON.stringify({
        result: {
          actions: [{ type: "forward", value: ["ops@example.com"] }],
          enabled: false,
        },
        success: true,
      }), { status: 200 });
    }

    return new Response(JSON.stringify({
      result: [
        {
          actions: [{ type: "worker", value: ["worker-alpha"] }],
          enabled: true,
          matchers: [{ field: "to", type: "literal", value: "ops@alpha.example.com" }],
        },
        {
          actions: [{ type: "worker", value: ["worker-alpha"] }],
          enabled: true,
          matchers: [{ field: "to", type: "literal", value: "orphan@alpha.example.com" }],
        },
      ],
      result_info: { total_pages: 1 },
      success: true,
    }), { status: 200 });
  };

  try {
    const db: D1Database = {
      prepare(query: string): D1PreparedStatement {
        return {
          bind() {
            return this;
          },
          all: async () => {
            if (query.includes("FROM domains d")) {
              return {
                results: [
                  {
                    allow_catch_all_sync: 1,
                    allow_mailbox_route_sync: 1,
                    allow_new_mailboxes: 1,
                    catch_all_forward_to: "",
                    catch_all_mode: "inherit",
                    cloudflare_api_token: "",
                    cloudflare_api_token_configured: 0,
                    created_at: 1,
                    domain: "alpha.example.com",
                    email_worker: "worker-alpha",
                    environment_id: null,
                    environment_name: "",
                    environment_slug: "",
                    id: 1,
                    is_enabled: 1,
                    is_primary: 0,
                    mailbox_route_forward_to: "",
                    note: "",
                    project_id: null,
                    project_name: "",
                    project_slug: "",
                    provider: "cloudflare",
                    routing_profile_catch_all_forward_to: "",
                    routing_profile_catch_all_mode: "inherit",
                    routing_profile_enabled: 0,
                    routing_profile_id: null,
                    routing_profile_name: "",
                    routing_profile_slug: "",
                    updated_at: 1,
                    zone_id: "zone-alpha",
                  },
                ],
              };
            }

            if (query.includes("SELECT address FROM mailboxes")) {
              return {
                results: [
                  { address: "ops@alpha.example.com" },
                  { address: "verify@alpha.example.com" },
                ],
              };
            }

            if (query.includes("SELECT to_address FROM emails")) {
              return { results: [] };
            }

            throw new Error(`Unexpected query: ${query}`);
          },
          first: async () => null,
          run: async () => ({}),
        };
      },
    };

    const actor: AuthSession = {
      access_scope: "all",
      auth_kind: "bootstrap_token",
      display_name: "Owner",
      expires_at: Date.now() + 60_000,
      nonce: "n",
      role: "owner",
      user_agent_hash: "ua",
      user_id: "owner",
      username: "owner",
    };
    const env = {
      CLOUDFLARE_API_TOKEN: "global-token",
      DB: db,
      MAILBOX_DOMAIN: "",
    } as WorkerEnv;

    const response = await handleAdminDomainAssetsStatusGet(db, env, actor);
    const payload = await response.json() as { code: number; data: Array<Record<string, any>> };

    assert.equal(response.status, 200);
    assert.equal(payload.data.length, 1);
    assert.equal(payload.data[0]?.mailbox_route_expected_total, 2);
    assert.equal(payload.data[0]?.mailbox_route_enabled_total, 2);
    assert.equal(payload.data[0]?.mailbox_route_missing_total, 1);
    assert.equal(payload.data[0]?.mailbox_route_extra_total, 1);
    assert.equal(payload.data[0]?.mailbox_route_drift, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("handleAdminDomainAssetsSyncCatchAll rejects domains with catch-all sync governance disabled", async () => {
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => ({ results: [] }),
        first: async () => {
          if (query.includes("FROM domains d") && query.includes("WHERE d.id = ? LIMIT 1")) {
            return {
              allow_catch_all_sync: 0,
              allow_mailbox_route_sync: 1,
              allow_new_mailboxes: 1,
              catch_all_forward_to: "ops@example.com",
              catch_all_mode: "enabled",
              cloudflare_api_token: "",
              cloudflare_api_token_configured: 0,
              created_at: 1,
              domain: "alpha.example.com",
              email_worker: "worker-alpha",
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              id: 7,
              is_enabled: 1,
              is_primary: 0,
              note: "",
              project_id: null,
              project_name: "",
              project_slug: "",
              provider: "cloudflare",
              routing_profile_catch_all_forward_to: "",
              routing_profile_catch_all_mode: "inherit",
              routing_profile_enabled: 0,
              routing_profile_id: null,
              routing_profile_name: "",
              routing_profile_slug: "",
              updated_at: 1,
              zone_id: "zone-alpha",
            };
          }

          return null;
        },
        run: async () => ({}),
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };
  const env = { DB: db } as WorkerEnv;
  const request = new Request("https://example.com/admin/domain-assets/7/sync-catch-all", {
    method: "POST",
  });

  const response = await handleAdminDomainAssetsSyncCatchAll(
    "/admin/domain-assets/7/sync-catch-all",
    request,
    db,
    env,
    actor,
  );
  const payload = await response.json() as { message?: string };

  assert.equal(response.status, 400);
  assert.equal(payload.message, "catch-all sync is disabled for this domain");
});

test("handleAdminDomainAssetsSyncCatchAll writes audit detail with operation note", async () => {
  const originalFetch = globalThis.fetch;
  const auditRows: unknown[][] = [];
  let catchAllEnabled = false;
  let catchAllForwardTo = "old@example.com";

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = String(init?.method || "GET").toUpperCase();

    if (url.includes("/email/routing/rules/catch_all") && method === "GET") {
      return new Response(JSON.stringify({
        result: {
          actions: catchAllForwardTo ? [{ type: "forward", value: [catchAllForwardTo] }] : [],
          enabled: catchAllEnabled,
        },
        success: true,
      }), { status: 200 });
    }

    if (url.includes("/email/routing/rules?page=") && method === "GET") {
      return new Response(JSON.stringify({
        result: [],
        result_info: { total_pages: 1 },
        success: true,
      }), { status: 200 });
    }

    if (url.includes("/email/routing/rules/catch_all") && method === "PUT") {
      const body = JSON.parse(String(init?.body || "{}")) as Record<string, any>;
      catchAllEnabled = body.enabled !== false;
      catchAllForwardTo = String(body.actions?.[0]?.value?.[0] || "");
      return new Response(JSON.stringify({ result: null, success: true }), { status: 200 });
    }

    throw new Error(`Unexpected fetch: ${method} ${url}`);
  };

  try {
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
            if (query.includes("FROM domains d") && query.includes("WHERE d.id = ? LIMIT 1")) {
              return {
                allow_catch_all_sync: 1,
                allow_mailbox_route_sync: 1,
                allow_new_mailboxes: 1,
                catch_all_forward_to: "ops@example.com",
                catch_all_mode: "enabled",
                cloudflare_api_token: "domain-secret-123",
                cloudflare_api_token_configured: 1,
                created_at: 1,
                domain: "alpha.example.com",
                email_worker: "worker-alpha",
                environment_id: null,
                environment_name: "",
                environment_slug: "",
                id: 7,
                is_enabled: 1,
                is_primary: 0,
                mailbox_route_forward_to: "",
                note: "",
                project_id: 1,
                project_name: "Alpha",
                project_slug: "alpha",
                provider: "cloudflare",
                routing_profile_catch_all_forward_to: "",
                routing_profile_catch_all_mode: "inherit",
                routing_profile_enabled: 0,
                routing_profile_id: null,
                routing_profile_name: "",
                routing_profile_slug: "",
                updated_at: 1,
                zone_id: "zone-alpha",
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

    const actor: AuthSession = {
      access_scope: "all",
      auth_kind: "bootstrap_token",
      display_name: "Owner",
      expires_at: Date.now() + 60_000,
      nonce: "n",
      role: "owner",
      user_agent_hash: "ua",
      user_id: "owner",
      username: "owner",
    };
    const env = {
      CLOUDFLARE_API_TOKEN: "global-token",
      DB: db,
      MAILBOX_DOMAIN: "",
    } as WorkerEnv;
    const request = new Request("https://example.com/admin/domain-assets/7/sync-catch-all", {
      body: JSON.stringify({
        operation_note: "按变更单同步 Catch-all",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const response = await handleAdminDomainAssetsSyncCatchAll(
      "/admin/domain-assets/7/sync-catch-all",
      request,
      db,
      env,
      actor,
    );
    const payload = await response.json() as { data?: Record<string, any> };
    const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;

    assert.equal(response.status, 200);
    assert.equal(payload.data?.catch_all_enabled, true);
    assert.equal(payload.data?.catch_all_forward_to, "ops@example.com");
    assert.equal(auditRows.length, 1);
    assert.equal(detail.operation_note, "按变更单同步 Catch-all");
    assert.equal(detail.previous?.catch_all_enabled, false);
    assert.equal(detail.previous?.catch_all_forward_to, "old@example.com");
    assert.equal(detail.next?.catch_all_enabled, true);
    assert.equal(detail.next?.catch_all_forward_to, "ops@example.com");
    assert.deepEqual(detail.changed_fields, ["catch_all_enabled", "catch_all_forward_to"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("handleAdminDomainAssetsSyncMailboxRoutes syncs expected routes and removes extra routes", async () => {
  const originalFetch = globalThis.fetch;
  const auditRows: unknown[][] = [];
  let nextRuleId = 3;
  let rules = [
    {
      actions: [{ type: "worker", value: ["worker-alpha"] }],
      enabled: false,
      id: "rule-1",
      matchers: [{ field: "to", type: "literal", value: "ops@alpha.example.com" }],
      name: "Mailbox route: ops@alpha.example.com",
      priority: 1,
    },
    {
      actions: [{ type: "worker", value: ["worker-alpha"] }],
      enabled: true,
      id: "rule-2",
      matchers: [{ field: "to", type: "literal", value: "orphan@alpha.example.com" }],
      name: "Mailbox route: orphan@alpha.example.com",
      priority: 2,
    },
  ];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = String(init?.method || "GET").toUpperCase();

    if (url.includes("/email/routing/rules/catch_all")) {
      return new Response(JSON.stringify({
        result: {
          actions: [{ type: "worker", value: ["worker-alpha"] }],
          enabled: false,
        },
        success: true,
      }), { status: 200 });
    }

    if (url.includes("/email/routing/rules?page=") && method === "GET") {
      return new Response(JSON.stringify({
        result: rules,
        result_info: { total_pages: 1 },
        success: true,
      }), { status: 200 });
    }

    if (url.endsWith("/email/routing/rules") && method === "POST") {
      const body = JSON.parse(String(init?.body || "{}")) as Record<string, any>;
      const rule = {
        ...body,
        id: `rule-${nextRuleId++}`,
      };
      rules = [...rules, rule];
      return new Response(JSON.stringify({ result: rule, success: true }), { status: 200 });
    }

    if (url.includes("/email/routing/rules/") && method === "PUT") {
      const id = url.split("/email/routing/rules/")[1] || "";
      const body = JSON.parse(String(init?.body || "{}")) as Record<string, any>;
      rules = rules.map(rule => rule.id === id ? { ...rule, ...body } : rule);
      const updated = rules.find(rule => rule.id === id) || null;
      return new Response(JSON.stringify({ result: updated, success: true }), { status: 200 });
    }

    if (url.includes("/email/routing/rules/") && method === "DELETE") {
      const id = url.split("/email/routing/rules/")[1] || "";
      rules = rules.filter(rule => rule.id !== id);
      return new Response(JSON.stringify({ result: null, success: true }), { status: 200 });
    }

    throw new Error(`Unexpected fetch: ${method} ${url}`);
  };

  try {
    const db: D1Database = {
      prepare(query: string): D1PreparedStatement {
        let params: unknown[] = [];

        return {
          bind(...values: unknown[]) {
            params = values;
            return this;
          },
          all: async () => {
            if (query.includes("SELECT address FROM mailboxes")) {
              return {
                results: [
                  { address: "ops@alpha.example.com" },
                  { address: "verify@alpha.example.com" },
                ],
              };
            }

            if (query.includes("SELECT to_address FROM emails")) {
              return { results: [] };
            }

            return { results: [] };
          },
          first: async () => {
            if (query.includes("FROM domains d") && query.includes("WHERE d.id = ? LIMIT 1")) {
              return {
                allow_catch_all_sync: 1,
                allow_mailbox_route_sync: 1,
                allow_new_mailboxes: 1,
                catch_all_forward_to: "",
                catch_all_mode: "inherit",
                cloudflare_api_token: "domain-secret-123",
                cloudflare_api_token_configured: 1,
                created_at: 1,
                domain: "alpha.example.com",
                email_worker: "worker-alpha",
                environment_id: null,
                environment_name: "",
                environment_slug: "",
                id: 8,
                is_enabled: 1,
                is_primary: 0,
                mailbox_route_forward_to: "",
                note: "",
                project_id: 1,
                project_name: "Alpha",
                project_slug: "alpha",
                provider: "cloudflare",
                routing_profile_catch_all_forward_to: "",
                routing_profile_catch_all_mode: "inherit",
                routing_profile_enabled: 0,
                routing_profile_id: null,
                routing_profile_name: "",
                routing_profile_slug: "",
                updated_at: 1,
                zone_id: "zone-alpha",
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

    const actor: AuthSession = {
      access_scope: "all",
      auth_kind: "bootstrap_token",
      display_name: "Owner",
      expires_at: Date.now() + 60_000,
      nonce: "n",
      role: "owner",
      user_agent_hash: "ua",
      user_id: "owner",
      username: "owner",
    };
    const env = {
      CLOUDFLARE_API_TOKEN: "global-token",
      DB: db,
      MAILBOX_DOMAIN: "",
    } as WorkerEnv;
    const request = new Request("https://example.com/admin/domain-assets/8/sync-mailbox-routes", {
      body: JSON.stringify({
        operation_note: "按巡检结果回收漂移路由",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const response = await handleAdminDomainAssetsSyncMailboxRoutes(
      "/admin/domain-assets/8/sync-mailbox-routes",
      request,
      db,
      env,
      actor,
    );
    const payload = await response.json() as { data?: Record<string, any> };
    const data = payload.data || {};

    assert.equal(response.status, 200);
    assert.equal(data.created_count, 1);
    assert.equal(data.updated_count, 1);
    assert.equal(data.deleted_count, 1);
    assert.equal(data.expected_total, 2);
    assert.equal(data.enabled_routes_total, 2);
    assert.equal(data.cloudflare_routes_total, 2);
    assert.deepEqual(
      rules.map(rule => String(rule.matchers?.[0]?.value || "")).sort(),
      ["ops@alpha.example.com", "verify@alpha.example.com"],
    );
    assert.deepEqual(
      rules.map(rule => rule.enabled).sort(),
      [true, true],
    );
    assert.equal(auditRows.length, 1);
    const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
    assert.equal(detail.operation_note, "按巡检结果回收漂移路由");
    assert.equal(detail.previous?.cloudflare_routes_total, 2);
    assert.equal(detail.previous?.enabled_routes_total, 1);
    assert.equal(detail.previous?.extra_total, 1);
    assert.equal(detail.next?.cloudflare_routes_total, 2);
    assert.equal(detail.next?.enabled_routes_total, 2);
    assert.equal(detail.next?.extra_total, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("handleAdminDomainAssetsSyncMailboxRoutes rejects domains with mailbox route sync governance disabled", async () => {
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => ({ results: [] }),
        first: async () => {
          if (query.includes("FROM domains d") && query.includes("WHERE d.id = ? LIMIT 1")) {
            return {
              allow_catch_all_sync: 1,
              allow_mailbox_route_sync: 0,
              allow_new_mailboxes: 1,
              catch_all_forward_to: "",
              catch_all_mode: "inherit",
              cloudflare_api_token: "",
              cloudflare_api_token_configured: 0,
              created_at: 1,
              domain: "alpha.example.com",
              email_worker: "worker-alpha",
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              id: 9,
              is_enabled: 1,
              is_primary: 0,
              mailbox_route_forward_to: "",
              note: "",
              project_id: null,
              project_name: "",
              project_slug: "",
              provider: "cloudflare",
              routing_profile_catch_all_forward_to: "",
              routing_profile_catch_all_mode: "inherit",
              routing_profile_enabled: 0,
              routing_profile_id: null,
              routing_profile_name: "",
              routing_profile_slug: "",
              updated_at: 1,
              zone_id: "zone-alpha",
            };
          }

          return null;
        },
        run: async () => ({}),
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };
  const env = { DB: db } as WorkerEnv;
  const request = new Request("https://example.com/admin/domain-assets/9/sync-mailbox-routes", {
    method: "POST",
  });

  const response = await handleAdminDomainAssetsSyncMailboxRoutes(
    "/admin/domain-assets/9/sync-mailbox-routes",
    request,
    db,
    env,
    actor,
  );
  const payload = await response.json() as { message?: string };

  assert.equal(response.status, 400);
  assert.equal(payload.message, "mailbox route sync is disabled for this domain");
});

test("handleAdminDomainAssetsSyncMailboxRoutes rejects project scope violations", async () => {
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => ({ results: [] }),
        first: async () => {
          if (query.includes("FROM domains d") && query.includes("WHERE d.id = ? LIMIT 1")) {
            return {
              allow_catch_all_sync: 1,
              allow_mailbox_route_sync: 1,
              allow_new_mailboxes: 1,
              catch_all_forward_to: "",
              catch_all_mode: "inherit",
              cloudflare_api_token: "",
              cloudflare_api_token_configured: 0,
              created_at: 1,
              domain: "alpha.example.com",
              email_worker: "worker-alpha",
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              id: 10,
              is_enabled: 1,
              is_primary: 0,
              mailbox_route_forward_to: "",
              note: "",
              project_id: 3,
              project_name: "Gamma",
              project_slug: "gamma",
              provider: "cloudflare",
              routing_profile_catch_all_forward_to: "",
              routing_profile_catch_all_mode: "inherit",
              routing_profile_enabled: 0,
              routing_profile_id: null,
              routing_profile_name: "",
              routing_profile_slug: "",
              updated_at: 1,
              zone_id: "zone-alpha",
            };
          }

          return null;
        },
        run: async () => ({}),
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "bound",
    auth_kind: "bootstrap_token",
    display_name: "Project Admin",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    project_ids: [2],
    role: "admin",
    user_agent_hash: "ua",
    user_id: "admin",
    username: "admin",
  };
  const env = { DB: db } as WorkerEnv;
  const request = new Request("https://example.com/admin/domain-assets/10/sync-mailbox-routes", {
    method: "POST",
  });

  const response = await handleAdminDomainAssetsSyncMailboxRoutes(
    "/admin/domain-assets/10/sync-mailbox-routes",
    request,
    db,
    env,
    actor,
  );
  const payload = await response.json() as { message?: string };

  assert.equal(response.status, 403);
  assert.equal(payload.message, "project access denied");
});

test("handleAdminMailboxesSync reuses active mailbox sync job", async () => {
  const recentStartedAt = Date.now() - 5_000;
  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "nonce",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };

  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        all: async () => ({ results: [] }),
        first: async () => {
          if (query.includes("FROM mailbox_sync_runs WHERE status IN ('pending', 'running')")) {
            return {
              catch_all_enabled: 1,
              cloudflare_configured: 1,
              cloudflare_routes_total: 12,
              created_at: recentStartedAt,
              created_count: 3,
              domain_summaries_json: "[]",
              duration_ms: null,
              error_message: "",
              finished_at: null,
              id: 42,
              observed_total: 8,
              requested_by: "owner",
              skipped_count: 5,
              started_at: recentStartedAt,
              status: "running",
              trigger_source: "manual",
              updated_at: recentStartedAt + 100,
              updated_count: 4,
            };
          }
          return null;
        },
        run: async () => {
          throw new Error(`Unexpected run query`);
        },
      };
    },
  };

  const ctx: WorkerExecutionContext = {
    waitUntil() {
      throw new Error("waitUntil should not be called when reusing active job");
    },
  };

  const response = await handleAdminMailboxesSync(db, { DB: db } as WorkerEnv, actor, ctx);
  const payload = await response.json() as { data?: Record<string, unknown> };

  assert.equal(response.status, 202);
  assert.equal(payload.data?.job_id, 42);
  assert.equal(payload.data?.status, "running");
});

test("handleAdminMailboxesSync recovers stale mailbox sync job and starts a new one", async () => {
  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "nonce",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };

  const staleStartedAt = Date.now() - 20 * 60 * 1000;
  const backgroundTasks: Promise<unknown>[] = [];
  let staleFailParams: unknown[] | null = null;

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
          if (query.includes("FROM mailbox_sync_runs WHERE status IN ('pending', 'running')")) {
            return {
              catch_all_enabled: 0,
              cloudflare_configured: 1,
              cloudflare_routes_total: 3,
              created_at: staleStartedAt,
              created_count: 1,
              domain_summaries_json: "[]",
              duration_ms: null,
              error_message: "",
              finished_at: null,
              id: 51,
              observed_total: 2,
              requested_by: "owner",
              skipped_count: 0,
              started_at: staleStartedAt,
              status: "running",
              trigger_source: "manual",
              updated_at: staleStartedAt,
              updated_count: 1,
            };
          }
          if (query.includes("FROM mailbox_sync_runs WHERE id = ?")) {
            return {
              catch_all_enabled: 0,
              cloudflare_configured: 1,
              cloudflare_routes_total: 3,
              created_at: staleStartedAt,
              created_count: 1,
              domain_summaries_json: "[]",
              duration_ms: 20 * 60 * 1000,
              error_message: "mailbox sync job timed out without heartbeat; please retry",
              finished_at: staleStartedAt + 20 * 60 * 1000,
              id: Number(params[0]),
              observed_total: 2,
              requested_by: "owner",
              skipped_count: 0,
              started_at: staleStartedAt,
              status: "failed",
              trigger_source: "manual",
              updated_at: staleStartedAt + 20 * 60 * 1000,
              updated_count: 1,
            };
          }
          return null;
        },
        run: async () => {
          if (query.includes("UPDATE mailbox_sync_runs SET status = 'failed'")) {
            staleFailParams = params;
            return {};
          }
          if (query.includes("INSERT INTO mailbox_sync_runs")) {
            return {
              meta: {
                last_row_id: 77,
              },
            };
          }
          return {};
        },
      };
    },
  };

  const ctx: WorkerExecutionContext = {
    waitUntil(promise: Promise<unknown>) {
      backgroundTasks.push(Promise.resolve(promise));
    },
  };

  const response = await handleAdminMailboxesSync(db, { DB: db } as WorkerEnv, actor, ctx);
  await Promise.all(backgroundTasks);
  const payload = await response.json() as { data?: Record<string, unknown> };

  assert.equal(response.status, 202);
  assert.equal(payload.data?.job_id, 77);
  assert.equal(payload.data?.status, "pending");
  assert.ok(staleFailParams);
  assert.equal(staleFailParams?.[0], "mailbox sync job timed out without heartbeat; please retry");
});

test("handleAdminMailboxSyncRunLatestGet marks stale mailbox sync job as failed", async () => {
  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "nonce",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };

  const staleStartedAt = Date.now() - 20 * 60 * 1000;
  let staleFailParams: unknown[] | null = null;

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
          if (query.includes("FROM mailbox_sync_runs ORDER BY created_at DESC")) {
            return {
              catch_all_enabled: 0,
              cloudflare_configured: 1,
              cloudflare_routes_total: 5,
              created_at: staleStartedAt,
              created_count: 2,
              domain_summaries_json: "[]",
              duration_ms: null,
              error_message: "",
              finished_at: null,
              id: 58,
              observed_total: 4,
              requested_by: "owner",
              skipped_count: 1,
              started_at: staleStartedAt,
              status: "running",
              trigger_source: "manual",
              updated_at: staleStartedAt,
              updated_count: 1,
            };
          }
          if (query.includes("FROM mailbox_sync_runs WHERE id = ?")) {
            assert.equal(params[0], 58);
            return {
              catch_all_enabled: 0,
              cloudflare_configured: 1,
              cloudflare_routes_total: 5,
              created_at: staleStartedAt,
              created_count: 2,
              domain_summaries_json: "[]",
              duration_ms: 20 * 60 * 1000,
              error_message: "mailbox sync job timed out without heartbeat; please retry",
              finished_at: staleStartedAt + 20 * 60 * 1000,
              id: 58,
              observed_total: 4,
              requested_by: "owner",
              skipped_count: 1,
              started_at: staleStartedAt,
              status: "failed",
              trigger_source: "manual",
              updated_at: staleStartedAt + 20 * 60 * 1000,
              updated_count: 1,
            };
          }
          return null;
        },
        run: async () => {
          if (query.includes("UPDATE mailbox_sync_runs SET status = 'failed'")) {
            staleFailParams = params;
            return {};
          }
          return {};
        },
      };
    },
  };

  const response = await handleAdminMailboxSyncRunLatestGet(db, actor);
  const payload = await response.json() as { data?: Record<string, unknown> };

  assert.equal(response.status, 200);
  assert.equal(payload.data?.id, 58);
  assert.equal(payload.data?.status, "failed");
  assert.equal(payload.data?.error_message, "mailbox sync job timed out without heartbeat; please retry");
  assert.ok(staleFailParams);
});

test("mailbox sync run read endpoints return latest and targeted run status", async () => {
  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "nonce",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };

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
          if (query.includes("FROM mailbox_sync_runs ORDER BY created_at DESC")) {
            return {
              catch_all_enabled: 0,
              cloudflare_configured: 1,
              cloudflare_routes_total: 9,
              created_at: 1_700_000_000_000,
              created_count: 2,
              domain_summaries_json: '[{"domain":"alpha.example.com","cloudflare_configured":true,"cloudflare_routes_total":9,"catch_all_enabled":false}]',
              duration_ms: 1200,
              error_message: "",
              finished_at: 1_700_000_001_200,
              id: 9,
              observed_total: 4,
              requested_by: "owner",
              skipped_count: 1,
              started_at: 1_700_000_000_000,
              status: "success",
              trigger_source: "manual",
              updated_at: 1_700_000_001_200,
              updated_count: 1,
            };
          }
          if (query.includes("FROM mailbox_sync_runs WHERE id = ?")) {
            assert.equal(params[0], 9);
            return {
              catch_all_enabled: 0,
              cloudflare_configured: 1,
              cloudflare_routes_total: 9,
              created_at: 1_700_000_000_000,
              created_count: 2,
              domain_summaries_json: "[]",
              duration_ms: 1200,
              error_message: "",
              finished_at: 1_700_000_001_200,
              id: 9,
              observed_total: 4,
              requested_by: "owner",
              skipped_count: 1,
              started_at: 1_700_000_000_000,
              status: "success",
              trigger_source: "manual",
              updated_at: 1_700_000_001_200,
              updated_count: 1,
            };
          }
          return null;
        },
        run: async () => {
          throw new Error("Unexpected run query");
        },
      };
    },
  };

  const latestResponse = await handleAdminMailboxSyncRunLatestGet(db, actor);
  const latestPayload = await latestResponse.json() as { data?: Record<string, unknown> };
  assert.equal(latestResponse.status, 200);
  assert.equal(latestPayload.data?.id, 9);
  assert.equal(latestPayload.data?.status, "success");

  const detailResponse = await handleAdminMailboxSyncRunGet("/admin/mailboxes/sync-runs/9", db, actor);
  const detailPayload = await detailResponse.json() as { data?: Record<string, unknown> };
  assert.equal(detailResponse.status, 200);
  assert.equal(detailPayload.data?.id, 9);
  assert.equal(detailPayload.data?.cloudflare_routes_total, 9);
});

test("handleAdminDomainAssetsPut writes governance audit when catch-all sync rule changes", async () => {
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
          if (query.includes("FROM domains d") && query.includes("WHERE d.id = ? LIMIT 1")) {
            return {
              allow_catch_all_sync: 1,
              allow_mailbox_route_sync: 1,
              allow_new_mailboxes: 1,
              catch_all_forward_to: "",
              catch_all_mode: "inherit",
              cloudflare_api_token: "",
              cloudflare_api_token_configured: 0,
              created_at: 1,
              domain: "alpha.example.com",
              email_worker: "worker-alpha",
              environment_id: null,
              environment_name: "",
              environment_slug: "",
              id: 9,
              is_enabled: 1,
              is_primary: 0,
              note: "",
              project_id: 1,
              project_name: "Alpha",
              project_slug: "alpha",
              provider: "cloudflare",
              routing_profile_catch_all_forward_to: "",
              routing_profile_catch_all_mode: "inherit",
              routing_profile_enabled: 0,
              routing_profile_id: null,
              routing_profile_name: "",
              routing_profile_slug: "",
              updated_at: 1,
              zone_id: "zone-alpha",
            };
          }

          if (query.includes("FROM projects WHERE id = ?")) {
            return {
              created_at: 1,
              description: "",
              id: 1,
              is_enabled: 1,
              name: "Alpha",
              slug: "alpha",
              updated_at: 1,
            };
          }

          return null;
        },
        run: async () => {
          if (query.includes("INSERT INTO audit_logs")) {
            auditRows.push(params);
          }
          return {};
        },
      };
    },
  };

  const actor: AuthSession = {
    access_scope: "all",
    auth_kind: "bootstrap_token",
    display_name: "Owner",
    expires_at: Date.now() + 60_000,
    nonce: "n",
    role: "owner",
    user_agent_hash: "ua",
    user_id: "owner",
    username: "owner",
  };

  const request = new Request("https://example.com/admin/domain-assets/9", {
    body: JSON.stringify({
      allow_catch_all_sync: false,
      allow_mailbox_route_sync: true,
      allow_new_mailboxes: true,
      catch_all_forward_to: "",
      catch_all_mode: "inherit",
      cloudflare_api_token: "",
      cloudflare_api_token_mode: "global",
      domain: "alpha.example.com",
      email_worker: "worker-alpha",
      environment_id: null,
      is_enabled: true,
      is_primary: false,
      note: "",
      project_id: 1,
      provider: "cloudflare",
      routing_profile_id: null,
      zone_id: "zone-alpha",
    }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });

  const response = await handleAdminDomainAssetsPut("/admin/domain-assets/9", request, db, actor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "domain.governance.update");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.previous_governance?.allow_catch_all_sync, true);
  assert.equal(detail.next_governance?.allow_catch_all_sync, false);
});
