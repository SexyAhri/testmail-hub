import {
  domainProviderSupports,
  getDomainProviderDefinition,
} from "../../shared/domain-providers";
import type {
  CatchAllMode,
  CloudflareApiTokenMode,
} from "../../server/types";
import {
  MAX_WORKSPACE_DESCRIPTION_LENGTH,
  MAX_WORKSPACE_NAME_LENGTH,
  MAX_WORKSPACE_SLUG_LENGTH,
} from "../../utils/constants";
import {
  isValidEmailAddress,
  normalizeEmailAddress,
  slugifyIdentifier,
} from "../../utils/utils";
import { readAuditOperationNote } from "../audit";
import {
  DOMAIN_MAX_LENGTH,
  isValidDomainValue,
  normalizeDomainValue,
  parseOptionalId,
} from "./shared";

export interface ValidatedDomainAssetMutation {
  allow_catch_all_sync: boolean;
  allow_mailbox_route_sync: boolean;
  allow_new_mailboxes: boolean;
  catch_all_forward_to: string;
  catch_all_mode: CatchAllMode;
  cloudflare_api_token: string;
  cloudflare_api_token_mode: CloudflareApiTokenMode;
  domain: string;
  email_worker: string;
  is_enabled: boolean;
  is_primary: boolean;
  mailbox_route_forward_to: string;
  note: string;
  operation_note: string;
  provider: string;
  routing_profile_id: number | null;
  zone_id: string;
}

export function validateDomainRoutingProfileBody(body: Record<string, unknown>) {
  const name = String(body.name || "").trim();
  const slug = slugifyIdentifier(
    body.slug || body.name || "routing-profile",
    "routing-profile",
  ).slice(0, MAX_WORKSPACE_SLUG_LENGTH);
  const catch_all_mode = String(body.catch_all_mode || "inherit")
    .trim()
    .toLowerCase() as CatchAllMode;
  const catch_all_forward_to = normalizeEmailAddress(body.catch_all_forward_to);
  const provider = String(body.provider || "cloudflare")
    .trim()
    .toLowerCase();
  const note = String(body.note || "").trim();
  const operationNoteValidation = readAuditOperationNote(body);
  const project_id = parseOptionalId(body.project_id);
  const environment_id = parseOptionalId(body.environment_id);
  const is_enabled = body.is_enabled !== false;

  if (!name) return { ok: false as const, error: "name is required" };
  if (name.length > MAX_WORKSPACE_NAME_LENGTH) {
    return { ok: false as const, error: "name is too long" };
  }
  if (!slug) return { ok: false as const, error: "slug is required" };
  if (slug.length > MAX_WORKSPACE_SLUG_LENGTH) {
    return { ok: false as const, error: "slug is too long" };
  }
  if (!provider) return { ok: false as const, error: "provider is required" };
  const providerDefinition = getDomainProviderDefinition(provider);
  if (!providerDefinition) {
    return { ok: false as const, error: "provider is not supported" };
  }
  if (!domainProviderSupports(providerDefinition, "routing_profile")) {
    return {
      ok: false as const,
      error: `${providerDefinition.label} does not support routing profiles`,
    };
  }
  if (!["inherit", "enabled", "disabled"].includes(catch_all_mode)) {
    return { ok: false as const, error: "invalid catch_all_mode" };
  }
  if (catch_all_forward_to.length > 320) {
    return { ok: false as const, error: "catch_all_forward_to is too long" };
  }
  if (catch_all_forward_to && !isValidEmailAddress(catch_all_forward_to)) {
    return {
      ok: false as const,
      error: "catch_all_forward_to must be a valid email address",
    };
  }
  if (catch_all_mode === "enabled" && !catch_all_forward_to) {
    return {
      ok: false as const,
      error: "catch_all_forward_to is required when catch_all_mode is enabled",
    };
  }
  if (note.length > MAX_WORKSPACE_DESCRIPTION_LENGTH) {
    return { ok: false as const, error: "note is too long" };
  }
  if (!operationNoteValidation.ok) return operationNoteValidation;

  return {
    ok: true as const,
    data: {
      catch_all_forward_to,
      catch_all_mode,
      is_enabled,
      name,
      note,
      operation_note: operationNoteValidation.operation_note,
      provider,
      slug,
    },
    scope: {
      environment_id,
      project_id,
    },
  };
}

export function validateDomainAssetBody(body: Record<string, unknown>) {
  const allow_catch_all_sync = body.allow_catch_all_sync !== false;
  const allow_new_mailboxes = body.allow_new_mailboxes !== false;
  const allow_mailbox_route_sync = body.allow_mailbox_route_sync !== false;
  const catch_all_mode = String(body.catch_all_mode || "inherit")
    .trim()
    .toLowerCase() as CatchAllMode;
  const catch_all_forward_to = normalizeEmailAddress(body.catch_all_forward_to);
  const cloudflare_api_token = String(body.cloudflare_api_token || "").trim();
  const cloudflare_api_token_mode = String(
    body.cloudflare_api_token_mode || "global",
  )
    .trim()
    .toLowerCase() as CloudflareApiTokenMode;
  const domain = normalizeDomainValue(body.domain);
  const provider = String(body.provider || "cloudflare")
    .trim()
    .toLowerCase();
  const zone_id = String(body.zone_id || "").trim();
  const email_worker = String(body.email_worker || "").trim();
  const mailbox_route_forward_to = normalizeEmailAddress(
    body.mailbox_route_forward_to,
  );
  const note = String(body.note || "").trim();
  const operationNoteValidation = readAuditOperationNote(body);
  const project_id = parseOptionalId(body.project_id);
  const environment_id = parseOptionalId(body.environment_id);
  const routing_profile_id = parseOptionalId(body.routing_profile_id);
  const is_enabled = body.is_enabled !== false;
  const is_primary = body.is_primary === true;

  if (!domain) return { ok: false as const, error: "domain is required" };
  if (domain.length > DOMAIN_MAX_LENGTH) {
    return { ok: false as const, error: "domain is too long" };
  }
  if (!isValidDomainValue(domain)) {
    return { ok: false as const, error: "domain is invalid" };
  }
  if (!provider) return { ok: false as const, error: "provider is required" };
  const providerDefinition = getDomainProviderDefinition(provider);
  if (!providerDefinition) {
    return { ok: false as const, error: "provider is not supported" };
  }
  if (!["inherit", "enabled", "disabled"].includes(catch_all_mode)) {
    return { ok: false as const, error: "invalid catch_all_mode" };
  }
  if (!["global", "domain"].includes(cloudflare_api_token_mode)) {
    return { ok: false as const, error: "invalid cloudflare_api_token_mode" };
  }
  if (zone_id.length > 128) {
    return { ok: false as const, error: "zone_id is too long" };
  }
  if (email_worker.length > 128) {
    return { ok: false as const, error: "email_worker is too long" };
  }
  if (cloudflare_api_token.length > 2048) {
    return { ok: false as const, error: "cloudflare_api_token is too long" };
  }
  if (mailbox_route_forward_to.length > 320) {
    return {
      ok: false as const,
      error: "mailbox_route_forward_to is too long",
    };
  }
  if (catch_all_forward_to.length > 320) {
    return { ok: false as const, error: "catch_all_forward_to is too long" };
  }
  if (
    mailbox_route_forward_to &&
    !isValidEmailAddress(mailbox_route_forward_to)
  ) {
    return {
      ok: false as const,
      error: "mailbox_route_forward_to must be a valid email address",
    };
  }
  if (catch_all_forward_to && !isValidEmailAddress(catch_all_forward_to)) {
    return {
      ok: false as const,
      error: "catch_all_forward_to must be a valid email address",
    };
  }
  if (!domainProviderSupports(providerDefinition, "zone_id") && zone_id) {
    return {
      ok: false as const,
      error: `${providerDefinition.label} does not support zone_id`,
    };
  }
  if (
    !domainProviderSupports(providerDefinition, "email_worker") &&
    email_worker
  ) {
    return {
      ok: false as const,
      error: `${providerDefinition.label} does not support email_worker`,
    };
  }
  if (
    !domainProviderSupports(providerDefinition, "mailbox_route_sync") &&
    mailbox_route_forward_to
  ) {
    return {
      ok: false as const,
      error: `${providerDefinition.label} does not support mailbox_route_forward_to`,
    };
  }
  if (
    providerDefinition.key !== "cloudflare" &&
    (cloudflare_api_token_mode === "domain" || cloudflare_api_token)
  ) {
    return {
      ok: false as const,
      error: `${providerDefinition.label} does not support cloudflare_api_token override`,
    };
  }
  if (!domainProviderSupports(providerDefinition, "catch_all_policy")) {
    if (catch_all_mode !== "inherit" || catch_all_forward_to) {
      return {
        ok: false as const,
        error: `${providerDefinition.label} does not support catch-all policy management`,
      };
    }
  }
  if (catch_all_mode === "enabled" && !catch_all_forward_to) {
    return {
      ok: false as const,
      error: "catch_all_forward_to is required when catch_all_mode is enabled",
    };
  }
  if (
    routing_profile_id &&
    !domainProviderSupports(providerDefinition, "routing_profile")
  ) {
    return {
      ok: false as const,
      error: `${providerDefinition.label} does not support routing profiles`,
    };
  }
  if (note.length > MAX_WORKSPACE_DESCRIPTION_LENGTH) {
    return { ok: false as const, error: "note is too long" };
  }
  if (!operationNoteValidation.ok) return operationNoteValidation;

  return {
    ok: true as const,
    data: {
      allow_catch_all_sync,
      allow_mailbox_route_sync,
      allow_new_mailboxes,
      catch_all_forward_to,
      catch_all_mode,
      cloudflare_api_token,
      cloudflare_api_token_mode,
      domain,
      email_worker,
      is_enabled,
      is_primary,
      mailbox_route_forward_to,
      note,
      operation_note: operationNoteValidation.operation_note,
      provider,
      routing_profile_id,
      zone_id,
    } satisfies ValidatedDomainAssetMutation,
    scope: {
      environment_id,
      project_id,
    },
  };
}
