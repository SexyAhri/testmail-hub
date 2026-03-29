import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmailPreview,
  extractVerificationCode,
  getCorsHeaders,
  isValidEmailAddress,
  normalizeEmailAddress,
} from "../src/utils/utils";

test("cors allows same-origin requests and blocks foreign origins by default", () => {
  const sameOriginRequest = new Request("https://worker.example.com/api/emails/latest", {
    headers: { Origin: "https://worker.example.com" },
  });
  const foreignOriginRequest = new Request("https://worker.example.com/api/emails/latest", {
    headers: { Origin: "https://evil.example.com" },
  });

  assert.equal(getCorsHeaders(sameOriginRequest, "").allowed, true);
  assert.equal(getCorsHeaders(foreignOriginRequest, "").allowed, false);
});

test("cors allows configured extra origins", () => {
  const request = new Request("https://worker.example.com/api/emails/latest", {
    headers: { Origin: "https://app.example.com" },
  });

  const cors = getCorsHeaders(request, "https://app.example.com, https://other.example.com");
  assert.equal(cors.allowed, true);
  assert.equal(cors.headers["Access-Control-Allow-Origin"], "https://app.example.com");
});

test("email helpers normalize and preview content", () => {
  assert.equal(normalizeEmailAddress(" Foo@Example.COM "), "foo@example.com");
  assert.equal(isValidEmailAddress("foo@example.com"), true);
  assert.equal(isValidEmailAddress("not-an-email"), false);
  assert.equal(buildEmailPreview("Hello\nworld", ""), "Hello world");
});

test("extractVerificationCode returns the expected contextual numeric code", () => {
  assert.equal(
    extractVerificationCode({
      subject: "Your GitHub verification code",
      textBody: "Use verification code 123456 to continue signing in.",
    }),
    "123456",
  );
});

test("extractVerificationCode strips invalid IS prefix false positives", () => {
  assert.equal(
    extractVerificationCode({
      textBody: "Verification code: IS123456",
    }),
    "123456",
  );
});

test("extractVerificationCode supports mixed alphanumeric codes after Chinese separators", () => {
  assert.equal(
    extractVerificationCode({
      textBody: "您的验证码为: 336ad5，请在 5 分钟内完成验证。",
    }),
    "336ad5",
  );
});
