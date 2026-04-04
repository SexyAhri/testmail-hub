import assert from "node:assert/strict";
import test from "node:test";

import { updateOutboundEmailDelivery } from "../src/core/db";
import {
  formatFromHeader,
  parseEmailList,
  validateOutboundEmailInput,
  validateOutboundSettingsInput,
} from "../src/core/outbound";
import {
  buildComposePayload,
  buildContactPayload,
  buildTemplatePayload,
  planOutboundAttachmentSelection,
} from "../src/client/pages/outbound/outbound-utils";
import type { OutboundEmailSettings } from "../src/server/types";
import {
  MAX_OUTBOUND_ATTACHMENTS,
  MAX_OUTBOUND_ATTACHMENT_TOTAL_BYTES,
} from "../src/utils/constants";

test("parseEmailList splits and deduplicates recipient input", () => {
  assert.deepEqual(
    parseEmailList("Foo@Example.com, bar@example.com\nfoo@example.com"),
    ["foo@example.com", "bar@example.com"],
  );
});

test("validateOutboundSettingsInput enforces sender domain", () => {
  const result = validateOutboundSettingsInput(
    {
      allow_external_recipients: true,
      default_from_address: "noreply@other.com",
      default_from_name: "TempMail",
      default_reply_to: "",
    },
    "vixenahri.cn",
  );

  assert.equal(result.ok, false);
});

test("validateOutboundEmailInput accepts external recipients when enabled", () => {
  const settings: OutboundEmailSettings = {
    allow_external_recipients: true,
    api_key_configured: true,
    configured: true,
    default_from_address: "tempmail@vixenahri.cn",
    default_from_name: "TempMail",
    default_reply_to: "",
    from_domain: "vixenahri.cn",
    provider: "resend",
  };

  const result = validateOutboundEmailInput(
    {
      subject: "验证码通知",
      text_body: "您的验证码是 123456",
      to: "user@gmail.com",
    },
    settings,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.to[0], "user@gmail.com");
    assert.equal(result.data.from_address, "tempmail@vixenahri.cn");
  }
});

test("validateOutboundEmailInput blocks external recipients when disabled", () => {
  const settings: OutboundEmailSettings = {
    allow_external_recipients: false,
    api_key_configured: true,
    configured: true,
    default_from_address: "tempmail@vixenahri.cn",
    default_from_name: "TempMail",
    default_reply_to: "",
    from_domain: "vixenahri.cn",
    provider: "resend",
  };

  const result = validateOutboundEmailInput(
    {
      subject: "通知",
      text_body: "test",
      to: "user@gmail.com",
    },
    settings,
  );

  assert.equal(result.ok, false);
});

test("formatFromHeader renders display name and address", () => {
  assert.equal(
    formatFromHeader("Ahri TestMail Hub", "tempmail@vixenahri.cn"),
    "Ahri TestMail Hub <tempmail@vixenahri.cn>",
  );
});

test("updateOutboundEmailDelivery keeps provider_message_id non-null while sending", async () => {
  let boundValues: unknown[] = [];

  const statement = {
    all: async () => ({ results: [] }),
    bind(...values: unknown[]) {
      boundValues = values;
      return this;
    },
    first: async () => null,
    run: async () => ({}),
  };

  const db = {
    prepare() {
      return statement;
    },
  };

  await updateOutboundEmailDelivery(db, 42, {
    error_message: "",
    last_attempt_at: 1234567890,
    status: "sending",
  });

  assert.equal(boundValues[0], "");
  assert.equal(boundValues[1], "sending");
  assert.equal(boundValues[2], "");
  assert.equal(boundValues[3], 1234567890);
  assert.equal(boundValues[4], null);
  assert.equal(boundValues[6], 42);
});

test("planOutboundAttachmentSelection stops accepting files after the max attachment count", () => {
  const existing = Array.from(
    { length: MAX_OUTBOUND_ATTACHMENTS - 1 },
    () => ({ size_bytes: 1 }),
  );

  const plan = planOutboundAttachmentSelection(existing, [
    { size: 10 },
    { size: 10 },
    { size: 10 },
  ]);

  assert.deepEqual(plan.acceptedIndexes, [0]);
  assert.equal(plan.rejected.length, 2);
  assert.ok(plan.rejected.every(item => item.reason === "count"));
});

test("planOutboundAttachmentSelection enforces the total attachment size budget", () => {
  const existing = [{ size_bytes: MAX_OUTBOUND_ATTACHMENT_TOTAL_BYTES - 512 }];

  const plan = planOutboundAttachmentSelection(existing, [
    { size: 256 },
    { size: 300 },
  ]);

  assert.deepEqual(plan.acceptedIndexes, [0]);
  assert.deepEqual(plan.rejected, [{ index: 1, reason: "size" }]);
  assert.equal(plan.nextTotalBytes, MAX_OUTBOUND_ATTACHMENT_TOTAL_BYTES - 256);
});

test("buildComposePayload includes a trimmed operation note", () => {
  const payload = buildComposePayload(
    {
      bcc: [],
      cc: [],
      from_address: " noreply@example.com ",
      from_name: " TestMail Hub ",
      html_body: "<p>Hello</p>",
      operation_note: "  按工单补发验证码  ",
      reply_to: " support@example.com ",
      scheduled_at: null,
      subject: " 验证码通知 ",
      template_id: undefined,
      template_variables: "  {}  ",
      text_body: "Hello",
      to: ["user@example.com"],
    },
    [],
    "send",
  );

  assert.equal(payload.operation_note, "按工单补发验证码");
  assert.equal(payload.subject, "验证码通知");
  assert.equal(payload.from_address, "noreply@example.com");
});

test("buildTemplatePayload includes a trimmed operation note", () => {
  const payload = buildTemplatePayload({
    html_template: "<p>{{code}}</p>",
    is_enabled: true,
    name: " OTP ",
    operation_note: "  切换模板版本  ",
    subject_template: " code ",
    text_template: "body",
    variables: "code",
  });

  assert.equal(payload.operation_note, "切换模板版本");
  assert.equal(payload.name, "OTP");
});

test("buildContactPayload includes a trimmed operation note", () => {
  const payload = buildContactPayload({
    email: " ops@example.com ",
    is_favorite: true,
    name: " Ops ",
    note: " note ",
    operation_note: "  补录值班联系人  ",
    tags: "ops",
  });

  assert.equal(payload.operation_note, "补录值班联系人");
  assert.equal(payload.email, "ops@example.com");
  assert.equal(payload.name, "Ops");
});
