import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminOutboundContactsPost,
  handleAdminOutboundContactsPut,
  handleAdminOutboundTemplatesPost,
  handleAdminOutboundTemplatesPut,
} from "../src/handlers/handlers";
import type {
  AuthSession,
  D1Database,
  D1PreparedStatement,
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

interface TemplateRow {
  created_at: number;
  created_by: string;
  html_template: string;
  id: number;
  is_enabled: number;
  name: string;
  subject_template: string;
  text_template: string;
  updated_at: number;
  variables_json: string;
}

interface ContactRow {
  created_at: number;
  email: string;
  id: number;
  is_favorite: number;
  name: string;
  note: string;
  tags: string;
  updated_at: number;
}

function createTemplateAuditDb(initialRows: TemplateRow[] = []) {
  const auditRows: unknown[][] = [];
  const rows = [...initialRows];
  let nextId = rows.reduce((max, item) => Math.max(max, item.id), 0) + 1;

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
          if (query.startsWith("SELECT id, name, subject_template, text_template, html_template, variables_json, is_enabled, created_by, created_at, updated_at FROM outbound_templates WHERE id = ? LIMIT 1")) {
            const id = Number(params[0]);
            const row = rows.find(item => item.id === id);
            return row ? { ...row } : null;
          }
          return null;
        },
        run: async () => {
          if (query.startsWith("INSERT INTO outbound_templates")) {
            const id = nextId;
            nextId += 1;
            rows.push({
              created_at: Number(params[7]),
              created_by: String(params[6]),
              html_template: String(params[3]),
              id,
              is_enabled: Number(params[5]),
              name: String(params[0]),
              subject_template: String(params[1]),
              text_template: String(params[2]),
              updated_at: Number(params[8]),
              variables_json: String(params[4]),
            });
            return { meta: { last_row_id: id } };
          }

          if (query.startsWith("UPDATE outbound_templates SET name = ?, subject_template = ?, text_template = ?, html_template = ?, variables_json = ?, is_enabled = ?, updated_at = ? WHERE id = ?")) {
            const id = Number(params[7]);
            const row = rows.find(item => item.id === id);
            if (!row) throw new Error(`Missing outbound template row ${id}`);
            row.name = String(params[0]);
            row.subject_template = String(params[1]);
            row.text_template = String(params[2]);
            row.html_template = String(params[3]);
            row.variables_json = String(params[4]);
            row.is_enabled = Number(params[5]);
            row.updated_at = Number(params[6]);
            return {};
          }

          if (query.startsWith("INSERT INTO audit_logs")) {
            auditRows.push(params);
            return {};
          }

          throw new Error(`Unexpected run query: ${query}`);
        },
      };
    },
  };

  return { auditRows, db };
}

function createContactAuditDb(initialRows: ContactRow[] = []) {
  const auditRows: unknown[][] = [];
  const rows = [...initialRows];
  let nextId = rows.reduce((max, item) => Math.max(max, item.id), 0) + 1;

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
          if (query.startsWith("SELECT id, name, email, note, tags, is_favorite, created_at, updated_at FROM outbound_contacts WHERE id = ? LIMIT 1")) {
            const id = Number(params[0]);
            const row = rows.find(item => item.id === id);
            return row ? { ...row } : null;
          }
          return null;
        },
        run: async () => {
          if (query.startsWith("INSERT INTO outbound_contacts")) {
            const id = nextId;
            nextId += 1;
            rows.push({
              created_at: Number(params[5]),
              email: String(params[1]),
              id,
              is_favorite: Number(params[4]),
              name: String(params[0]),
              note: String(params[2]),
              tags: String(params[3]),
              updated_at: Number(params[6]),
            });
            return { meta: { last_row_id: id } };
          }

          if (query.startsWith("UPDATE outbound_contacts SET name = ?, email = ?, note = ?, tags = ?, is_favorite = ?, updated_at = ? WHERE id = ?")) {
            const id = Number(params[6]);
            const row = rows.find(item => item.id === id);
            if (!row) throw new Error(`Missing outbound contact row ${id}`);
            row.name = String(params[0]);
            row.email = String(params[1]);
            row.note = String(params[2]);
            row.tags = String(params[3]);
            row.is_favorite = Number(params[4]);
            row.updated_at = Number(params[5]);
            return {};
          }

          if (query.startsWith("INSERT INTO audit_logs")) {
            auditRows.push(params);
            return {};
          }

          throw new Error(`Unexpected run query: ${query}`);
        },
      };
    },
  };

  return { auditRows, db };
}

function readAuditDetail(row: unknown[] | undefined) {
  return JSON.parse(String(row?.[6] || "{}")) as Record<string, any>;
}

test("handleAdminOutboundTemplatesPost records operation note and safe template snapshot", async () => {
  const fixture = createTemplateAuditDb();

  const request = new Request("https://example.com/admin/outbound/templates", {
    body: JSON.stringify({
      html_template: "<p>{{code}}</p>",
      is_enabled: true,
      name: "OTP Template",
      operation_note: "新增登录验证码模板",
      subject_template: "Your code is {{code}}",
      text_template: "Code: {{code}}",
      variables: "product, code",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const response = await handleAdminOutboundTemplatesPost(request, fixture.db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(fixture.auditRows.length, 1);
  assert.equal(fixture.auditRows[0]?.[3], "outbound.template.create");
  assert.equal(fixture.auditRows[0]?.[5], "1");

  const detail = readAuditDetail(fixture.auditRows[0]);
  assert.equal(detail.id, 1);
  assert.equal(detail.name, "OTP Template");
  assert.equal(detail.subject_template, "Your code is {{code}}");
  assert.equal(detail.operation_note, "新增登录验证码模板");
  assert.equal(detail.html_template_length, 15);
  assert.deepEqual(detail.variables, ["code", "product"]);
});

test("handleAdminOutboundTemplatesPut records previous and next template snapshot", async () => {
  const fixture = createTemplateAuditDb([
    {
      created_at: 1,
      created_by: "owner",
      html_template: "<p>{{code}}</p>",
      id: 4,
      is_enabled: 1,
      name: "OTP Template",
      subject_template: "Code {{code}}",
      text_template: "Code {{code}}",
      updated_at: 1,
      variables_json: JSON.stringify(["code"]),
    },
  ]);

  const request = new Request("https://example.com/admin/outbound/templates/4", {
    body: JSON.stringify({
      html_template: "<p>{{product}}: {{code}}</p>",
      is_enabled: false,
      name: "OTP Template V2",
      operation_note: "切换到新版模板变量结构",
      subject_template: "{{product}} verification code",
      text_template: "{{product}} code: {{code}}",
      variables: "product, code",
    }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });

  const response = await handleAdminOutboundTemplatesPut("/admin/outbound/templates/4", request, fixture.db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(fixture.auditRows.length, 1);
  assert.equal(fixture.auditRows[0]?.[3], "outbound.template.update");

  const detail = readAuditDetail(fixture.auditRows[0]);
  assert.equal(detail.operation_note, "切换到新版模板变量结构");
  assert.equal(detail.previous?.name, "OTP Template");
  assert.equal(detail.next?.name, "OTP Template V2");
  assert.equal(detail.next?.is_enabled, false);
  assert.ok(detail.changed_fields.includes("name"));
  assert.ok(detail.changed_fields.includes("subject_template"));
  assert.ok(detail.changed_fields.includes("text_template_length"));
  assert.ok(detail.changed_fields.includes("html_template_length"));
  assert.ok(detail.changed_fields.includes("variables"));
  assert.ok(detail.changed_fields.includes("is_enabled"));
});

test("handleAdminOutboundContactsPost records operation note and contact snapshot", async () => {
  const fixture = createContactAuditDb();

  const request = new Request("https://example.com/admin/outbound/contacts", {
    body: JSON.stringify({
      email: "ops@example.com",
      is_favorite: true,
      name: "Ops Team",
      note: "Handles delivery escalations",
      operation_note: "补录值班联系人",
      tags: "alerts, ops",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const response = await handleAdminOutboundContactsPost(request, fixture.db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(fixture.auditRows.length, 1);
  assert.equal(fixture.auditRows[0]?.[3], "outbound.contact.create");
  assert.equal(fixture.auditRows[0]?.[5], "1");

  const detail = readAuditDetail(fixture.auditRows[0]);
  assert.equal(detail.id, 1);
  assert.equal(detail.email, "ops@example.com");
  assert.equal(detail.name, "Ops Team");
  assert.equal(detail.operation_note, "补录值班联系人");
  assert.equal(detail.is_favorite, true);
  assert.deepEqual(detail.tags, ["alerts", "ops"]);
});

test("handleAdminOutboundContactsPut records previous and next contact snapshot", async () => {
  const fixture = createContactAuditDb([
    {
      created_at: 1,
      email: "ops@example.com",
      id: 7,
      is_favorite: 0,
      name: "Ops Team",
      note: "Handles escalations",
      tags: JSON.stringify(["ops"]),
      updated_at: 1,
    },
  ]);

  const request = new Request("https://example.com/admin/outbound/contacts/7", {
    body: JSON.stringify({
      email: "alerts@example.com",
      is_favorite: true,
      name: "Alert Team",
      note: "Owns delivery alerts",
      operation_note: "整理联系人资料并提升为收藏",
      tags: "alerts, ops",
    }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });

  const response = await handleAdminOutboundContactsPut("/admin/outbound/contacts/7", request, fixture.db, ownerActor);

  assert.equal(response.status, 200);
  assert.equal(fixture.auditRows.length, 1);
  assert.equal(fixture.auditRows[0]?.[3], "outbound.contact.update");

  const detail = readAuditDetail(fixture.auditRows[0]);
  assert.equal(detail.operation_note, "整理联系人资料并提升为收藏");
  assert.equal(detail.previous?.email, "ops@example.com");
  assert.equal(detail.next?.email, "alerts@example.com");
  assert.equal(detail.next?.is_favorite, true);
  assert.ok(detail.changed_fields.includes("email"));
  assert.ok(detail.changed_fields.includes("is_favorite"));
  assert.ok(detail.changed_fields.includes("name"));
  assert.ok(detail.changed_fields.includes("note"));
  assert.ok(detail.changed_fields.includes("tags"));
});
