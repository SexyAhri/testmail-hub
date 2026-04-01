import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminOutboundContactsDelete,
  handleAdminOutboundEmailsDelete,
  handleAdminOutboundTemplatesDelete,
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

test("handleAdminOutboundEmailsDelete records operation note and email snapshot", async () => {
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
          if (query.includes("FROM outbound_email_attachments WHERE outbound_email_id = ?")) {
            return {
              results: [
                {
                  content_base64: "ZmFrZQ==",
                  content_type: "text/plain",
                  filename: "notes.txt",
                  id: 1,
                  size_bytes: 12,
                },
              ],
            };
          }
          return { results: [] };
        },
        first: async () => {
          if (query.includes("FROM outbound_emails WHERE id = ? LIMIT 1")) {
            return {
              attachment_count: 1,
              bcc_addresses: JSON.stringify(["audit@example.com"]),
              cc_addresses: JSON.stringify(["qa@example.com"]),
              created_at: 1,
              created_by: "owner",
              error_message: "",
              from_address: "noreply@example.com",
              from_name: "TestMail Hub",
              html_body: "<p>Hello</p>",
              id: Number(params[0]),
              last_attempt_at: 1_710_000_300_000,
              provider: "resend",
              provider_message_id: "pm_123",
              reply_to: "support@example.com",
              scheduled_at: 1_710_000_100_000,
              sent_at: 1_710_000_200_000,
              status: "sent",
              subject: "Verification code",
              text_body: "Hello",
              to_addresses: JSON.stringify(["user@example.com", "team@example.com"]),
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

  const request = new Request("https://example.com/admin/outbound/emails/8", {
    body: JSON.stringify({
      operation_note: "Remove delivered OTP copy after verification",
    }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });

  const response = await handleAdminOutboundEmailsDelete("/admin/outbound/emails/8", request, db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "outbound.email.delete");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.subject, "Verification code");
  assert.equal(detail.from_address, "noreply@example.com");
  assert.equal(detail.operation_note, "Remove delivered OTP copy after verification");
  assert.deepEqual(detail.to_addresses, ["team@example.com", "user@example.com"]);
  assert.equal(detail.deleted?.status, "sent");
});

test("handleAdminOutboundTemplatesDelete records operation note and template snapshot", async () => {
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
          if (query.includes("FROM outbound_templates WHERE id = ? LIMIT 1")) {
            return {
              created_at: 1,
              created_by: "owner",
              html_template: "<p>{{code}}</p>",
              id: Number(params[0]),
              is_enabled: 1,
              name: "OTP Template",
              subject_template: "Your code is {{code}}",
              text_template: "Code: {{code}}",
              updated_at: 1,
              variables_json: JSON.stringify(["code", "product"]),
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

  const request = new Request("https://example.com/admin/outbound/templates/5", {
    body: JSON.stringify({
      operation_note: "Retire superseded OTP template",
    }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });

  const response = await handleAdminOutboundTemplatesDelete("/admin/outbound/templates/5", request, db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "outbound.template.delete");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.name, "OTP Template");
  assert.equal(detail.subject_template, "Your code is {{code}}");
  assert.equal(detail.operation_note, "Retire superseded OTP template");
  assert.deepEqual(detail.variables, ["code", "product"]);
  assert.equal(detail.deleted?.html_template_length, 15);
});

test("handleAdminOutboundContactsDelete records operation note and contact snapshot", async () => {
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
          if (query.includes("FROM outbound_contacts WHERE id = ? LIMIT 1")) {
            return {
              created_at: 1,
              email: "ops@example.com",
              id: Number(params[0]),
              is_favorite: 1,
              name: "Ops Team",
              note: "Handles delivery escalations",
              tags: JSON.stringify(["ops", "alerts"]),
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

  const request = new Request("https://example.com/admin/outbound/contacts/3", {
    body: JSON.stringify({
      operation_note: "Remove retired escalation contact",
    }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });

  const response = await handleAdminOutboundContactsDelete("/admin/outbound/contacts/3", request, db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "outbound.contact.delete");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.name, "Ops Team");
  assert.equal(detail.email, "ops@example.com");
  assert.equal(detail.operation_note, "Remove retired escalation contact");
  assert.deepEqual(detail.tags, ["alerts", "ops"]);
  assert.equal(detail.deleted?.is_favorite, true);
});
