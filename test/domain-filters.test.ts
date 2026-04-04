import assert from "node:assert/strict";
import test from "node:test";

import {
  canRepairCatchAllDrift,
  canRepairMailboxRouteDrift,
  hasMailboxRouteMismatch,
  isGovernanceBlockedDomainStatus,
  matchesDomainAssetKeyword,
  matchesDomainHealthFilter,
  matchesDomainRoutingProfileKeyword,
  matchesDomainScopeFilter,
  matchesDomainStatusKeyword,
  resolveEffectiveCatchAllPolicy,
} from "../src/client/domain-filters";

test("resolveEffectiveCatchAllPolicy prefers routing profile when domain uses inherit", () => {
  const effective = resolveEffectiveCatchAllPolicy({
    catch_all_forward_to: "",
    catch_all_mode: "inherit",
    routing_profile_catch_all_forward_to: "ops@example.com",
    routing_profile_catch_all_mode: "enabled",
    routing_profile_enabled: true,
    routing_profile_id: 7,
  });

  assert.equal(effective.source, "routing_profile");
  assert.equal(effective.catch_all_mode, "enabled");
  assert.equal(effective.catch_all_forward_to, "ops@example.com");
});

test("domain drift repair helpers only allow actionable domains", () => {
  const asset = {
    allow_catch_all_sync: true,
    allow_mailbox_route_sync: true,
    catch_all_forward_to: "ops@example.com",
    catch_all_mode: "enabled" as const,
    is_enabled: true,
    provider: "cloudflare",
    routing_profile_catch_all_forward_to: "",
    routing_profile_catch_all_mode: "inherit" as const,
    routing_profile_enabled: false,
    routing_profile_id: null,
  };

  assert.equal(
    canRepairCatchAllDrift(asset, {
      catch_all_drift: true,
      cloudflare_configured: true,
      cloudflare_error: "",
    }),
    true,
  );
  assert.equal(
    canRepairCatchAllDrift(asset, {
      catch_all_drift: true,
      cloudflare_configured: true,
      cloudflare_error: "token invalid",
    }),
    false,
  );
  assert.equal(
    canRepairMailboxRouteDrift(asset, {
      catch_all_mode: "inherit",
      cloudflare_configured: true,
      cloudflare_error: "",
      mailbox_route_expected_total: 2,
      mailbox_route_extra_total: 0,
      mailbox_route_missing_total: 2,
      mailbox_route_drift: true,
    }),
    true,
  );
  assert.equal(
    canRepairMailboxRouteDrift(
      {
        allow_mailbox_route_sync: true,
        is_enabled: true,
        provider: "manual",
      },
      {
        catch_all_mode: "inherit",
        cloudflare_configured: true,
        cloudflare_error: "",
        mailbox_route_expected_total: 1,
        mailbox_route_extra_total: 0,
        mailbox_route_missing_total: 1,
        mailbox_route_drift: true,
      },
    ),
    false,
  );
});

test("mailbox route mismatch helper and governance blocked filter detect blocked drifts", () => {
  const asset = {
    allow_catch_all_sync: false,
    allow_mailbox_route_sync: false,
    catch_all_forward_to: "ops@example.com",
    catch_all_mode: "enabled" as const,
    is_enabled: true,
    provider: "cloudflare",
    routing_profile_catch_all_forward_to: "",
    routing_profile_catch_all_mode: "inherit" as const,
    routing_profile_enabled: false,
    routing_profile_id: null,
  };
  const blockedStatus = {
    catch_all_drift: true,
    catch_all_mode: "enabled" as const,
    cloudflare_configured: true,
    cloudflare_error: "",
    mailbox_route_drift: false,
    mailbox_route_expected_total: 2,
    mailbox_route_extra_total: 1,
    mailbox_route_missing_total: 2,
  };

  assert.equal(hasMailboxRouteMismatch(blockedStatus), true);
  assert.equal(isGovernanceBlockedDomainStatus(asset, blockedStatus), true);
  assert.equal(matchesDomainHealthFilter(blockedStatus, asset, "governance_blocked"), true);
});

test("matchesDomainHealthFilter classifies healthy and issue states", () => {
  const asset = {
    allow_catch_all_sync: true,
    allow_mailbox_route_sync: true,
    catch_all_forward_to: "ops@example.com",
    catch_all_mode: "enabled" as const,
    is_enabled: true,
    provider: "cloudflare",
    routing_profile_catch_all_forward_to: "",
    routing_profile_catch_all_mode: "inherit" as const,
    routing_profile_enabled: false,
    routing_profile_id: null,
  };

  const healthyStatus = {
    catch_all_drift: false,
    catch_all_mode: "enabled" as const,
    cloudflare_configured: true,
    cloudflare_error: "",
    mailbox_route_expected_total: 1,
    mailbox_route_extra_total: 0,
    mailbox_route_missing_total: 0,
    mailbox_route_drift: false,
  };
  const issueStatus = {
    catch_all_drift: false,
    catch_all_mode: "inherit" as const,
    cloudflare_configured: false,
    cloudflare_error: "",
    mailbox_route_expected_total: 1,
    mailbox_route_extra_total: 0,
    mailbox_route_missing_total: 1,
    mailbox_route_drift: true,
  };

  assert.equal(matchesDomainHealthFilter(healthyStatus, asset, "healthy"), true);
  assert.equal(matchesDomainHealthFilter(healthyStatus, asset, "issues"), false);
  assert.equal(matchesDomainHealthFilter(issueStatus, asset, "issues"), true);
  assert.equal(matchesDomainHealthFilter(issueStatus, asset, "unconfigured"), true);
  assert.equal(matchesDomainHealthFilter(issueStatus, asset, "mailbox_route_drift"), true);
});

test("pure Catch-all domains do not enter mailbox route drift flow", () => {
  const asset = {
    allow_mailbox_route_sync: true,
    is_enabled: true,
    provider: "cloudflare",
  };
  const pureCatchAllStatus = {
    catch_all_mode: "enabled" as const,
    cloudflare_configured: true,
    cloudflare_error: "",
    mailbox_route_drift: false,
    mailbox_route_expected_total: 0,
    mailbox_route_extra_total: 3,
    mailbox_route_missing_total: 0,
  };

  assert.equal(hasMailboxRouteMismatch(pureCatchAllStatus), false);
  assert.equal(canRepairMailboxRouteDrift(asset, pureCatchAllStatus), false);
  assert.equal(matchesDomainHealthFilter(pureCatchAllStatus, null, "mailbox_route_drift"), false);
});

test("domain keyword and scope filters cover asset, status and routing profile views", () => {
  const asset = {
    domain: "mail.example.com",
    environment_id: 3,
    environment_name: "staging",
    mailbox_route_forward_to: "team@example.com",
    note: "主登录域名",
    project_id: 2,
    project_name: "账号中心",
    provider: "cloudflare",
    routing_profile_name: "default-mail",
    zone_id: "zone_123",
  };
  const status = {
    catch_all_forward_to: "ops@example.com",
    catch_all_forward_to_actual: "ops@example.com",
    cloudflare_error: "token expired",
    domain: "mail.example.com",
    provider: "cloudflare",
    routing_profile_name: "default-mail",
  };
  const profile = {
    environment_id: 3,
    environment_name: "staging",
    name: "default-mail",
    note: "统一默认策略",
    project_id: 2,
    project_name: "账号中心",
    provider: "cloudflare",
    slug: "default-mail",
  };

  assert.equal(matchesDomainAssetKeyword(asset, "登录"), true);
  assert.equal(matchesDomainStatusKeyword(status, asset, "expired"), true);
  assert.equal(matchesDomainRoutingProfileKeyword(profile, "统一默认"), true);
  assert.equal(matchesDomainScopeFilter(asset, "environment"), true);
  assert.equal(matchesDomainScopeFilter({ environment_id: null, project_id: 2 }, "project"), true);
  assert.equal(matchesDomainScopeFilter(null, "global"), true);
});
