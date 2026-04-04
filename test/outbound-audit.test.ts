import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminOutboundEmailSendExisting,
  handleAdminOutboundEmailsPost,
  handleAdminOutboundEmailsPut,
} from "../src/handlers/handlers";
import type {
  AuthSession,
  D1Database,
  D1PreparedStatement,
  WorkerEnv,
} from "../src/server/types";

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

interface StoredOutboundEmailRow {
  attachment_count: number;
  bcc_addresses: string;
  cc_addresses: string;
  created_at: number;
  created_by: string;
  error_message: string;
  from_address: string;
  from_name: string;
  html_body: string;
  id: number;
  last_attempt_at: number | null;
  provider: string;
  provider_message_id: string;
  reply_to: string | null;
  scheduled_at: number | null;
  sent_at: number | null;
  status: string;
  subject: string;
  text_body: string;
  to_addresses: string;
  updated_at: number;
}

interface StoredOutboundAttachmentRow {
  content_base64: string;
  content_type: string;
  created_at: number;
  filename: string;
  id: number;
  outbound_email_id: number;
  size_bytes: number;
}

function createOutboundAuditEnv(db: D1Database): WorkerEnv {
  return {
    DB: db,
    RESEND_API_KEY: "re_test_key",
    RESEND_DEFAULT_FROM: "noreply@example.com",
    RESEND_DEFAULT_FROM_NAME: "TestMail Hub",
    RESEND_DEFAULT_REPLY_TO: "",
    RESEND_FROM_DOMAIN: "example.com",
  };
}

function createStoredOutboundEmail(input: {
  attachment_count?: number;
  bcc_addresses?: string[];
  cc_addresses?: string[];
  created_at?: number;
  created_by?: string;
  error_message?: string;
  from_address?: string;
  from_name?: string;
  html_body?: string;
  id: number;
  last_attempt_at?: number | null;
  provider?: string;
  provider_message_id?: string;
  reply_to?: string | null;
  scheduled_at?: number | null;
  sent_at?: number | null;
  status?: string;
  subject: string;
  text_body: string;
  to_addresses: string[];
  updated_at?: number;
}): StoredOutboundEmailRow {
  const createdAt = input.created_at ?? 1_710_000_000_000;
  return {
    attachment_count: input.attachment_count ?? 0,
    bcc_addresses: JSON.stringify(input.bcc_addresses ?? []),
    cc_addresses: JSON.stringify(input.cc_addresses ?? []),
    created_at: createdAt,
    created_by: input.created_by ?? "owner",
    error_message: input.error_message ?? "",
    from_address: input.from_address ?? "noreply@example.com",
    from_name: input.from_name ?? "TestMail Hub",
    html_body: input.html_body ?? "",
    id: input.id,
    last_attempt_at: input.last_attempt_at ?? null,
    provider: input.provider ?? "resend",
    provider_message_id: input.provider_message_id ?? "",
    reply_to: input.reply_to ?? "",
    scheduled_at: input.scheduled_at ?? null,
    sent_at: input.sent_at ?? null,
    status: input.status ?? "draft",
    subject: input.subject,
    text_body: input.text_body,
    to_addresses: JSON.stringify(input.to_addresses),
    updated_at: input.updated_at ?? createdAt,
  };
}

function createOutboundAuditDbFixture(options: {
  appSettings?: Record<string, string>;
  attachments?: StoredOutboundAttachmentRow[];
  emails?: StoredOutboundEmailRow[];
} = {}) {
  const auditRows: unknown[][] = [];
  const appSettings = new Map(Object.entries(options.appSettings || {}));
  const emails = [...(options.emails || [])];
  const attachments = [...(options.attachments || [])];
  let nextEmailId = emails.reduce((max, item) => Math.max(max, item.id), 0) + 1;
  let nextAttachmentId = attachments.reduce((max, item) => Math.max(max, item.id), 0) + 1;

  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      let params: unknown[] = [];

      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        all: async () => {
          if (query.startsWith("SELECT id, filename, content_type, content_base64, size_bytes FROM outbound_email_attachments WHERE outbound_email_id = ?")) {
            const outboundEmailId = Number(params[0]);
            return {
              results: attachments
                .filter(item => item.outbound_email_id === outboundEmailId)
                .sort((left, right) => left.id - right.id)
                .map(item => ({ ...item })),
            };
          }

          if (query.includes("FROM notification_endpoints ORDER BY created_at DESC")) {
            return { results: [] };
          }

          if (query.includes("FROM notification_endpoint_project_bindings")) {
            return { results: [] };
          }

          throw new Error(`Unexpected all query: ${query}`);
        },
        first: async () => {
          if (query.startsWith("SELECT value FROM app_settings WHERE key = ? LIMIT 1")) {
            const key = String(params[0]);
            return appSettings.has(key) ? { value: appSettings.get(key) } : null;
          }

          if (query.startsWith("SELECT id, provider, provider_message_id, from_name, from_address, reply_to, to_addresses, cc_addresses, bcc_addresses, subject, text_body, html_body, status, error_message, created_by, created_at, updated_at, scheduled_at, sent_at, last_attempt_at, attachment_count FROM outbound_emails WHERE id = ? LIMIT 1")) {
            const id = Number(params[0]);
            const row = emails.find(item => item.id === id);
            return row ? { ...row } : null;
          }

          if (query.startsWith("SELECT id FROM outbound_emails WHERE created_by = ? AND subject = ? AND created_at = ? ORDER BY id DESC LIMIT 1")) {
            const [createdBy, subject, createdAt] = params as [string, string, number];
            const row = emails.find(item =>
              item.created_by === createdBy
              && item.subject === subject
              && item.created_at === createdAt,
            );
            return row ? { id: row.id } : null;
          }

          return null;
        },
        run: async () => {
          if (query.startsWith("INSERT INTO outbound_emails")) {
            const id = nextEmailId;
            nextEmailId += 1;

            emails.push({
              attachment_count: Number(params[17]),
              bcc_addresses: String(params[6]),
              cc_addresses: String(params[5]),
              created_at: Number(params[12]),
              created_by: String(params[11]),
              error_message: "",
              from_address: String(params[2]),
              from_name: String(params[1]),
              html_body: String(params[9]),
              id,
              last_attempt_at: params[16] === null ? null : Number(params[16]),
              provider: String(params[0]),
              provider_message_id: "",
              reply_to: params[3] === null ? null : String(params[3]),
              scheduled_at: params[14] === null ? null : Number(params[14]),
              sent_at: params[15] === null ? null : Number(params[15]),
              status: String(params[10]),
              subject: String(params[7]),
              text_body: String(params[8]),
              to_addresses: String(params[4]),
              updated_at: Number(params[13]),
            });

            return { meta: { last_row_id: id } };
          }

          if (query.startsWith("UPDATE outbound_emails SET provider = ?, from_name = ?, from_address = ?, reply_to = ?, to_addresses = ?, cc_addresses = ?, bcc_addresses = ?, subject = ?, text_body = ?, html_body = ?, status = ?, scheduled_at = ?, attachment_count = ?, updated_at = ? WHERE id = ?")) {
            const id = Number(params[14]);
            const row = emails.find(item => item.id === id);
            if (!row) throw new Error(`Missing outbound email row ${id}`);

            row.provider = String(params[0]);
            row.from_name = String(params[1]);
            row.from_address = String(params[2]);
            row.reply_to = params[3] === null ? null : String(params[3]);
            row.to_addresses = String(params[4]);
            row.cc_addresses = String(params[5]);
            row.bcc_addresses = String(params[6]);
            row.subject = String(params[7]);
            row.text_body = String(params[8]);
            row.html_body = String(params[9]);
            row.status = String(params[10]);
            row.scheduled_at = params[11] === null ? null : Number(params[11]);
            row.attachment_count = Number(params[12]);
            row.updated_at = Number(params[13]);

            return {};
          }

          if (query.startsWith("DELETE FROM outbound_email_attachments WHERE outbound_email_id = ?")) {
            const outboundEmailId = Number(params[0]);
            const remaining = attachments.filter(item => item.outbound_email_id !== outboundEmailId);
            attachments.length = 0;
            attachments.push(...remaining);
            return {};
          }

          if (query.startsWith("INSERT INTO outbound_email_attachments")) {
            attachments.push({
              content_base64: String(params[3]),
              content_type: String(params[2]),
              created_at: Number(params[5]),
              filename: String(params[1]),
              id: nextAttachmentId,
              outbound_email_id: Number(params[0]),
              size_bytes: Number(params[4]),
            });
            nextAttachmentId += 1;
            return {};
          }

          if (query.startsWith("UPDATE outbound_emails SET provider_message_id = ?, status = ?, error_message = ?, last_attempt_at = ?, sent_at = ?, updated_at = ? WHERE id = ?")) {
            const id = Number(params[6]);
            const row = emails.find(item => item.id === id);
            if (!row) throw new Error(`Missing outbound email row ${id}`);

            row.provider_message_id = String(params[0] ?? "");
            row.status = String(params[1]);
            row.error_message = String(params[2] ?? "");
            row.last_attempt_at = params[3] === null ? null : Number(params[3]);
            row.sent_at = params[4] === null ? null : Number(params[4]);
            row.updated_at = Number(params[5]);

            return {};
          }

          if (query.startsWith("INSERT INTO audit_logs")) {
            auditRows.push(params);
            return {};
          }

          if (query.startsWith("INSERT INTO error_events")) {
            return {};
          }

          throw new Error(`Unexpected run query: ${query}`);
        },
      };
    },
  };

  return { auditRows, db };
}

function readAuditDetail(auditRow: unknown[] | undefined) {
  return JSON.parse(String(auditRow?.[6] || "{}")) as Record<string, any>;
}

test("handleAdminOutboundEmailsPost records operation note when saving a draft", async () => {
  const fixture = createOutboundAuditDbFixture();
  const request = new Request("https://example.com/admin/outbound/emails", {
    body: JSON.stringify({
      mode: "draft",
      operation_note: "先保存草稿待审批",
      subject: "验证码通知",
      text_body: "您好，验证码是 123456",
      to: ["user@example.com"],
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const response = await handleAdminOutboundEmailsPost(
    request,
    fixture.db,
    createOutboundAuditEnv(fixture.db),
    ownerActor,
  );

  assert.equal(response.status, 200);
  assert.equal(fixture.auditRows.length, 1);
  assert.equal(fixture.auditRows[0]?.[3], "outbound.email.save_draft");

  const detail = readAuditDetail(fixture.auditRows[0]);
  assert.equal(detail.subject, "验证码通知");
  assert.equal(detail.status, "draft");
  assert.equal(detail.operation_note, "先保存草稿待审批");
  assert.equal(detail.id, 1);
  assert.equal(detail.previous, undefined);
});

test("handleAdminOutboundEmailsPut records previous and next snapshots for scheduled updates", async () => {
  const scheduledAt = Date.now() + 60 * 60 * 1000;
  const fixture = createOutboundAuditDbFixture({
    emails: [
      createStoredOutboundEmail({
        id: 5,
        reply_to: "",
        status: "draft",
        subject: "旧主题",
        text_body: "旧内容",
        to_addresses: ["owner@example.com"],
      }),
    ],
  });
  const request = new Request("https://example.com/admin/outbound/emails/5", {
    body: JSON.stringify({
      html_body: "<p>计划明早群发</p>",
      mode: "send",
      operation_note: "改成明早定时群发",
      reply_to: "ops@example.com",
      scheduled_at: scheduledAt,
      subject: "新的计划通知",
      text_body: "计划明早群发",
      to: ["owner@example.com", "qa@example.com"],
    }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });

  const response = await handleAdminOutboundEmailsPut(
    "/admin/outbound/emails/5",
    request,
    fixture.db,
    createOutboundAuditEnv(fixture.db),
    ownerActor,
  );

  assert.equal(response.status, 200);
  assert.equal(fixture.auditRows.length, 1);
  assert.equal(fixture.auditRows[0]?.[3], "outbound.email.schedule");

  const detail = readAuditDetail(fixture.auditRows[0]);
  assert.equal(detail.operation_note, "改成明早定时群发");
  assert.equal(detail.previous?.status, "draft");
  assert.equal(detail.next?.status, "scheduled");
  assert.equal(detail.previous?.subject, "旧主题");
  assert.equal(detail.next?.subject, "新的计划通知");
  assert.equal(detail.reply_to, "ops@example.com");
  assert.ok(detail.changed_fields.includes("reply_to"));
  assert.ok(detail.changed_fields.includes("scheduled_at"));
  assert.ok(detail.changed_fields.includes("status"));
  assert.ok(detail.changed_fields.includes("subject"));
  assert.ok(detail.changed_fields.includes("text_body_length"));
  assert.ok(detail.changed_fields.includes("html_body_length"));
  assert.ok(detail.changed_fields.includes("to_addresses"));
});

test("handleAdminOutboundEmailsPost preserves record id and operation note when sending fails", async () => {
  const fixture = createOutboundAuditDbFixture();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "provider unavailable" }), {
      headers: { "Content-Type": "application/json" },
      status: 503,
    });

  try {
    const request = new Request("https://example.com/admin/outbound/emails", {
      body: JSON.stringify({
        mode: "send",
        operation_note: "立即发送失败留痕",
        subject: "失败通知",
        text_body: "请稍后重试",
        to: ["user@example.com"],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const response = await handleAdminOutboundEmailsPost(
      request,
      fixture.db,
      createOutboundAuditEnv(fixture.db),
      ownerActor,
    );

    assert.equal(response.status, 502);
    assert.equal(fixture.auditRows.length, 1);
    assert.equal(fixture.auditRows[0]?.[3], "outbound.email.send_failed");
    assert.equal(fixture.auditRows[0]?.[5], "1");

    const detail = readAuditDetail(fixture.auditRows[0]);
    assert.equal(detail.subject, "失败通知");
    assert.equal(detail.status, "failed");
    assert.equal(detail.operation_note, "立即发送失败留痕");
    assert.equal(detail.error, "provider unavailable");
    assert.equal(detail.id, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("handleAdminOutboundEmailSendExisting accepts an audit operation note", async () => {
  const fixture = createOutboundAuditDbFixture({
    emails: [
      createStoredOutboundEmail({
        error_message: "provider unavailable",
        id: 9,
        last_attempt_at: 1_710_000_100_000,
        status: "failed",
        subject: "重试通知",
        text_body: "请重试",
        to_addresses: ["user@example.com"],
      }),
    ],
  });
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ id: "re_123" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  try {
    const request = new Request("https://example.com/admin/outbound/emails/9/send", {
      body: JSON.stringify({
        operation_note: "人工确认后重新发送",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const response = await handleAdminOutboundEmailSendExisting(
      "/admin/outbound/emails/9/send",
      request,
      fixture.db,
      createOutboundAuditEnv(fixture.db),
      ownerActor,
    );

    assert.equal(response.status, 200);
    assert.equal(fixture.auditRows.length, 1);
    assert.equal(fixture.auditRows[0]?.[3], "outbound.email.send");

    const detail = readAuditDetail(fixture.auditRows[0]);
    assert.equal(detail.operation_note, "人工确认后重新发送");
    assert.equal(detail.previous?.status, "failed");
    assert.equal(detail.next?.status, "sent");
    assert.ok(detail.changed_fields.includes("last_attempt_at"));
    assert.ok(detail.changed_fields.includes("sent_at"));
    assert.ok(detail.changed_fields.includes("status"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
