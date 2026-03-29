import assert from "node:assert/strict";
import test from "node:test";

import { extractCloudflareMailboxCandidates } from "../src/core/mailbox-sync";

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
