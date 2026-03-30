import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmailPreview,
  buildRuleMatchInsights,
  extractEmailExtraction,
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

test("extractEmailExtraction identifies platform and login link", () => {
  const extraction = extractEmailExtraction({
    fromAddress: "noreply@github.com",
    subject: "Sign in to GitHub",
    textBody: "Use verification code 123456 to continue. Sign in: https://github.com/session/authorize?token=abc123",
  });

  assert.equal(extraction.verification_code, "123456");
  assert.equal(extraction.platform, "GitHub");
  assert.equal(extraction.primary_link?.host, "github.com");
  assert.equal(extraction.primary_link?.kind, "login");
});

test("extractEmailExtraction identifies magic links and provider from content", () => {
  const extraction = extractEmailExtraction({
    subject: "Discord 登录提醒",
    textBody: "使用这个 magic link 继续登录: https://discord.com/login?token=abc123",
  });

  assert.equal(extraction.platform, "Discord");
  assert.equal(extraction.links.length, 1);
  assert.equal(extraction.primary_link?.kind, "magic_link");
});

test("extractEmailExtraction extracts verification links from html hrefs", () => {
  const extraction = extractEmailExtraction({
    fromAddress: "appleid@id.apple.com",
    htmlBody:
      '<html><body><a href="https://appleid.apple.com/verify/account?token=abc123">验证 Apple ID</a></body></html>',
  });

  assert.equal(extraction.platform, "Apple");
  assert.equal(extraction.primary_link?.kind, "verification");
  assert.equal(extraction.primary_link?.host, "appleid.apple.com");
});

test("buildRuleMatchInsights annotates verification and link matches", () => {
  const extraction = extractEmailExtraction({
    fromAddress: "noreply@github.com",
    subject: "GitHub verification",
    textBody: "Your verification code is 123456. Sign in here: https://github.com/session/authorize?token=abc123",
    results: [
      { remark: "验证码", rule_id: 1, value: "123456" },
      { remark: "登录链接", rule_id: 2, value: "github.com/session/authorize" },
    ],
  });

  const insights = buildRuleMatchInsights(
    [
      { remark: "验证码", rule_id: 1, value: "123456" },
      { remark: "登录链接", rule_id: 2, value: "github.com/session/authorize" },
    ],
    extraction,
  );

  assert.equal(insights[0]?.match_type, "verification_code");
  assert.equal(insights[0]?.confidence_label, "high");
  assert.equal(insights[1]?.match_type, "login_link");
});
