import assert from "node:assert/strict";
import test from "node:test";

import {
  clearAdminSessionCookie,
  createManagedApiTokenValue,
  createBootstrapSessionCookie,
  getManagedApiTokenId,
  getAdminSessionFromRequest,
  hashApiTokenValue,
  isApiAuthorized,
} from "../src/core/auth";

test("bootstrap session cookie authorizes subsequent requests", async () => {
  const loginRequest = new Request("https://example.com/auth/login", {
    method: "POST",
    headers: { "User-Agent": "test-agent" },
  });
  const cookie = await createBootstrapSessionCookie(loginRequest, "admin-secret", "session-secret");
  const cookieValue = cookie.split(";")[0];

  const request = new Request("https://example.com/admin/emails?page=1", {
    headers: {
      Cookie: cookieValue,
      "User-Agent": "test-agent",
    },
  });

  const session = await getAdminSessionFromRequest(request, "admin-secret", "session-secret");
  assert.equal(session?.role, "owner");
});

test("tampered admin session cookie is rejected", async () => {
  const loginRequest = new Request("https://example.com/auth/login", {
    method: "POST",
    headers: { "User-Agent": "test-agent" },
  });
  const cookie = await createBootstrapSessionCookie(loginRequest, "admin-secret", "session-secret");
  const cookieValue = cookie.split(";")[0] + "tampered";

  const request = new Request("https://example.com/admin/emails?page=1", {
    headers: {
      Cookie: cookieValue,
      "User-Agent": "test-agent",
    },
  });

  const session = await getAdminSessionFromRequest(request, "admin-secret", "session-secret");
  assert.equal(session, null);
});

test("bearer tokens continue to work for admin and api access", async () => {
  const adminRequest = new Request("https://example.com/admin/emails?page=1", {
    headers: { Authorization: "Bearer admin-secret" },
  });
  const apiRequest = new Request("https://example.com/api/emails/latest?address=a%40b.com", {
    headers: { Authorization: "Bearer api-secret" },
  });

  const session = await getAdminSessionFromRequest(adminRequest, "admin-secret", "session-secret");
  assert.equal(session?.role, "owner");
  assert.equal(isApiAuthorized(apiRequest, "api-secret"), true);
});

test("clear session cookie expires immediately", () => {
  const cookie = clearAdminSessionCookie(new Request("https://example.com/auth/logout", { method: "POST" }));
  assert.match(cookie, /Max-Age=0/);
});

test("managed api tokens expose embedded id and hash consistently", async () => {
  const token = createManagedApiTokenValue("token-123");

  assert.equal(getManagedApiTokenId(token), "token-123");
  assert.equal(getManagedApiTokenId("invalid-token"), null);

  const hashA = await hashApiTokenValue(token);
  const hashB = await hashApiTokenValue(` ${token} `);
  assert.equal(hashA, hashB);
});
