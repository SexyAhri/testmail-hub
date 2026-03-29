import assert from "node:assert/strict";
import test from "node:test";

import { updateOutboundEmailDelivery } from "../src/core/db";
import {
  formatFromHeader,
  parseEmailList,
  validateOutboundEmailInput,
  validateOutboundSettingsInput,
} from "../src/core/outbound";
import type { OutboundEmailSettings } from "../src/server/types";

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
    formatFromHeader("Ahri TempMail Console", "tempmail@vixenahri.cn"),
    "Ahri TempMail Console <tempmail@vixenahri.cn>",
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
