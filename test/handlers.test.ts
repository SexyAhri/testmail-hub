import assert from "node:assert/strict";
import test from "node:test";

import { handleEmailsLatest } from "../src/handlers/handlers";
import type { D1Database, D1PreparedStatement } from "../src/server/types";

test("handleEmailsLatest returns verification_code for public API payload", async () => {
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
      from_address: "notifications@example.com",
      html_body: "",
      message_id: "msg-1",
      received_at: 1774760671582,
      subject: "登录验证码",
      text_body: "Your verification code is 123456.",
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
  const payload = await response.json() as { code: number; data: Record<string, unknown> };

  assert.equal(response.status, 200);
  assert.equal(boundAddress, "code@example.com");
  assert.match(preparedQuery, /text_body/);
  assert.match(preparedQuery, /html_body/);
  assert.equal(payload.code, 200);
  assert.equal(payload.data.verification_code, "123456");
});
