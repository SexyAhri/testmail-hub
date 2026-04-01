import assert from "node:assert/strict";
import test from "node:test";

import {
  extractCloudflareMailboxCandidates,
  resolveCloudflareMailboxRouteConfig,
  upsertCloudflareMailboxRouteByConfig,
} from "../src/core/mailbox-sync";

test("extractCloudflareMailboxCandidates maps literal matcher rules", () => {
  const candidates = extractCloudflareMailboxCandidates(
    [
      {
        actions: [{ type: "worker", value: ["temp-email-worker"] }],
        enabled: true,
        matchers: [{ field: "to", type: "literal", value: "Code@vixenahri.cn" }],
      },
    ],
    "vixenahri.cn",
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].address, "code@vixenahri.cn");
  assert.equal(candidates[0].is_enabled, true);
});

test("extractCloudflareMailboxCandidates filters non-domain and invalid addresses", () => {
  const candidates = extractCloudflareMailboxCandidates(
    [
      {
        actions: [{ type: "worker" }],
        enabled: true,
        matchers: [{ field: "to", type: "literal", value: "bad-address" }],
      },
      {
        actions: [{ type: "worker" }],
        enabled: true,
        matchers: [{ field: "to", type: "literal", value: "ok@example.com" }],
      },
      {
        actions: [{ type: "worker" }],
        enabled: false,
        matchers: [{ field: "to", type: "literal", value: "ops@vixenahri.cn" }],
      },
    ],
    "vixenahri.cn",
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].address, "ops@vixenahri.cn");
  assert.equal(candidates[0].is_enabled, false);
});

test("resolveCloudflareMailboxRouteConfig prefers domain-scoped API token overrides", () => {
  const config = resolveCloudflareMailboxRouteConfig(
    {
      CLOUDFLARE_API_TOKEN: "global-token",
      CLOUDFLARE_EMAIL_WORKER: "env-worker",
      CLOUDFLARE_ZONE_ID: "zone-global",
      MAILBOX_DOMAIN: "example.com",
    },
    {
      api_token: "domain-token",
      domain: "alpha.example.com",
      email_worker: "worker-alpha",
      mailbox_route_forward_to: "relay@primary.example.com",
      zone_id: "zone-alpha",
    },
  );

  assert.deepEqual(config, {
    apiToken: "domain-token",
    mailboxDomain: "alpha.example.com",
    routeForwardTo: "relay@primary.example.com",
    workerName: "worker-alpha",
    zoneId: "zone-alpha",
  });
});

test("upsertCloudflareMailboxRouteByConfig prefers explicit forward target for new routes", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ method: string; payload?: Record<string, unknown>; url: string }> = [];

  globalThis.fetch = async (input, init) => {
    const method = String(init?.method || "GET").toUpperCase();
    const url = String(input);
    const payload = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    requests.push({ method, payload, url });

    if (url.includes("/email/routing/rules?page=")) {
      return new Response(JSON.stringify({
        result: [],
        result_info: { total_pages: 1 },
        success: true,
      }), { status: 200 });
    }

    if (url.endsWith("/email/routing/rules") && method === "POST") {
      return new Response(JSON.stringify({ result: { id: "rule-1" }, success: true }), { status: 200 });
    }

    throw new Error(`Unexpected fetch: ${method} ${url}`);
  };

  try {
    const outcome = await upsertCloudflareMailboxRouteByConfig(
      {
        apiToken: "domain-token",
        mailboxDomain: "alpha.example.com",
        routeForwardTo: "relay@primary.example.com",
        workerName: "worker-alpha",
        zoneId: "zone-alpha",
      },
      {
        address: "ops@alpha.example.com",
        is_enabled: true,
      },
    );

    assert.equal(outcome, "created");
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1]?.payload?.actions, [{ type: "forward", value: ["relay@primary.example.com"] }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
