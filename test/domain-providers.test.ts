import assert from "node:assert/strict";
import test from "node:test";

import {
  domainProviderSupports,
  getDomainProviderDefinition,
  getDomainProviderLabel,
  listDomainProviders,
} from "../src/shared/domain-providers";

test("listDomainProviders exposes cloudflare and manual providers", () => {
  const providers = listDomainProviders();

  assert.equal(providers.length, 2);
  assert.deepEqual(
    providers.map(item => item.key),
    ["cloudflare", "manual"],
  );
});

test("cloudflare provider exposes sync and routing capabilities", () => {
  const provider = getDomainProviderDefinition("cloudflare");

  assert.ok(provider);
  assert.equal(getDomainProviderLabel("cloudflare"), "Cloudflare Email Routing");
  assert.equal(domainProviderSupports(provider, "status_read"), true);
  assert.equal(domainProviderSupports(provider, "mailbox_route_sync"), true);
  assert.equal(domainProviderSupports(provider, "catch_all_policy"), true);
  assert.equal(domainProviderSupports(provider, "routing_profile"), true);
});

test("manual provider only keeps asset registration semantics", () => {
  const provider = getDomainProviderDefinition("manual");

  assert.ok(provider);
  assert.equal(getDomainProviderLabel("manual"), "手动 / 外部托管");
  assert.equal(domainProviderSupports(provider, "status_read"), false);
  assert.equal(domainProviderSupports(provider, "catch_all_policy"), false);
  assert.equal(domainProviderSupports(provider, "routing_profile"), false);
});
