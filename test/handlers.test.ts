import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminDomains,
  handleEmailsCode,
  handleEmailsLatest,
  handleEmailsLatestExtraction,
  handlePublicEmailAttachment,
  handlePublicEmailDetail,
  handlePublicEmailExtractions,
} from "../src/handlers/handlers";
import type { AuthSession, D1Database, D1PreparedStatement, WorkerEnv } from "../src/server/types";

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
