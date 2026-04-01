import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminEmailDelete,
  handleAdminEmailPurge,
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

function createEmailAuditDb(auditRows: unknown[][]): D1Database {
  return {
    prepare(query: string): D1PreparedStatement {
      let params: unknown[] = [];

      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        all: async () => {
          if (query.includes("FROM email_attachments WHERE email_message_id = ? ORDER BY id ASC")) {
            return { results: [] };
          }
          if (query.includes("SELECT DISTINCT project_id FROM email_mailbox_links")) {
            return { results: [{ project_id: 7 }] };
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
              environment_id: 9,
              environment_name: "Production",
              environment_slug: "production",
              extracted_json: JSON.stringify([{ type: "code", value: "123456" }]),
              from_address: "noreply@openai.com",
              has_attachments: 1,
              html_body: "<p>Your code is 123456</p>",
              mailbox_pool_id: 12,
              mailbox_pool_name: "OTP Pool",
              mailbox_pool_slug: "otp-pool",
              message_id: String(params[0]),
              note: "OTP mail for login",
              primary_mailbox_address: "login@testmail.local",
              project_id: 7,
              project_name: "Core Project",
              project_slug: "core-project",
              raw_headers: "[]",
              received_at: 1_710_100_000_000,
              subject: "Your verification code",
              tags: JSON.stringify(["otp", "openai"]),
              text_body: "Your code is 123456",
              to_address: "user@example.com",
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
}

test("handleAdminEmailDelete records operation note and email snapshot", async () => {
  const auditRows: unknown[][] = [];
  const db = createEmailAuditDb(auditRows);
  const request = new Request("https://example.com/admin/emails/msg-1", {
    body: JSON.stringify({
      operation_note: "Move processed OTP email to trash after support verification",
    }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });

  const response = await handleAdminEmailDelete("/admin/emails/msg-1", request, db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "email.delete");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.message_id, "msg-1");
  assert.equal(detail.subject, "Your verification code");
  assert.equal(detail.project_name, "Core Project");
  assert.equal(detail.operation_note, "Move processed OTP email to trash after support verification");
  assert.equal(detail.deletion_kind, "soft_delete");
  assert.deepEqual(detail.tags, ["openai", "otp"]);
  assert.equal(detail.deleted?.verification_code, "123456");
});

test("handleAdminEmailPurge records operation note and email snapshot", async () => {
  const auditRows: unknown[][] = [];
  const db = createEmailAuditDb(auditRows);
  const request = new Request("https://example.com/admin/emails/msg-2/purge", {
    body: JSON.stringify({
      operation_note: "Purge expired OTP email after retention exception review",
    }),
    headers: { "Content-Type": "application/json" },
    method: "DELETE",
  });

  const response = await handleAdminEmailPurge("/admin/emails/msg-2/purge", request, db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0]?.[3], "email.purge");

  const detail = JSON.parse(String(auditRows[0]?.[6] || "{}")) as Record<string, any>;
  assert.equal(detail.message_id, "msg-2");
  assert.equal(detail.primary_mailbox_address, "login@testmail.local");
  assert.equal(detail.operation_note, "Purge expired OTP email after retention exception review");
  assert.equal(detail.deletion_kind, "purge");
  assert.equal(detail.deleted?.has_attachments, true);
});
