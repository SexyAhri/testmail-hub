import { MAX_AUDIT_OPERATION_NOTE_LENGTH, normalizeNotificationAlertConfig } from "../utils/constants";
import { readJsonBody } from "../utils/utils";
import type {
  AccessScope,
  AdminRole,
  CatchAllMode,
  DomainAssetSecretRecord,
  NotificationAlertConfig,
  ProjectBindingRecord,
} from "../server/types";

function toAuditDetail(value: unknown) {
  return JSON.parse(JSON.stringify(value || {}));
}

function normalizeAuditProjectIds(project_ids: number[]) {
  return Array.from(
    new Set(
      (Array.isArray(project_ids) ? project_ids : [])
        .filter((projectId) => Number.isFinite(projectId) && projectId > 0)
        .map((projectId) => Math.floor(projectId)),
    ),
  ).sort((left, right) => left - right);
}

function normalizeAuditStringList(values: string[]) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function buildAuditChangedFields(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  fields: string[],
) {
  return fields.filter(
    (field) => JSON.stringify(previous[field]) !== JSON.stringify(next[field]),
  );
}

export function withAuditOperationNote<T extends Record<string, unknown>>(
  detail: T,
  operation_note = "",
) {
  return toAuditDetail(operation_note ? { ...detail, operation_note } : detail);
}

export function buildResourceUpdateAuditDetail<T extends Record<string, unknown>>(
  previous: T,
  next: T,
  fields: string[],
  operation_note = "",
  extra: Record<string, unknown> = {},
) {
  return withAuditOperationNote(
    {
      changed_fields: buildAuditChangedFields(previous, next, fields),
      previous,
      next,
      ...extra,
      ...next,
    },
    operation_note,
  );
}

export function buildResourceDeleteAuditDetail<T extends Record<string, unknown>>(
  deleted: T,
  operation_note = "",
  extra: Record<string, unknown> = {},
) {
  return withAuditOperationNote(
    {
      deleted,
      ...extra,
      ...deleted,
    },
    operation_note,
  );
}

export function readAuditOperationNote(body: Record<string, unknown>) {
  const operation_note = String(body.operation_note || "").trim();
  if (operation_note.length > MAX_AUDIT_OPERATION_NOTE_LENGTH) {
    return { ok: false as const, error: "operation_note is too long" };
  }
  return { ok: true as const, operation_note };
}

export async function readRequestAuditOperationNote(request: Request) {
  const contentType = String(
    request.headers.get("Content-Type") || "",
  ).toLowerCase();
  if (!contentType.includes("application/json")) {
    return { ok: true as const, operation_note: "" };
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) {
    return { ok: false as const, error: parsed.error || "invalid JSON body" };
  }

  return readAuditOperationNote(parsed.data || {});
}

export function toAdminAuditSnapshot(input: {
  access_scope: AccessScope;
  display_name: string;
  is_enabled: boolean;
  note: string;
  project_ids: number[];
  role: AdminRole;
  username: string;
}) {
  return {
    access_scope: input.access_scope,
    display_name: input.display_name,
    is_enabled: input.is_enabled,
    note: input.note,
    project_ids: normalizeAuditProjectIds(input.project_ids),
    role: input.role,
    username: input.username,
  };
}

export function buildAdminUpdateAuditDetail(
  previous: ReturnType<typeof toAdminAuditSnapshot>,
  next: ReturnType<typeof toAdminAuditSnapshot>,
  operation_note = "",
) {
  const changed_fields: string[] = [];

  if (previous.display_name !== next.display_name)
    changed_fields.push("display_name");
  if (previous.role !== next.role) changed_fields.push("role");
  if (previous.access_scope !== next.access_scope)
    changed_fields.push("access_scope");
  if (previous.is_enabled !== next.is_enabled)
    changed_fields.push("is_enabled");
  if (previous.note !== next.note) changed_fields.push("note");
  if (
    JSON.stringify(previous.project_ids) !== JSON.stringify(next.project_ids)
  ) {
    changed_fields.push("project_ids");
  }

  return withAuditOperationNote(
    {
      changed_fields,
      display_name: next.display_name,
      next,
      previous,
      username: next.username,
    },
    operation_note,
  );
}

export function toNotificationAuditSnapshot(input: {
  access_scope: AccessScope;
  alert_config: NotificationAlertConfig;
  events: string[];
  is_enabled: boolean;
  name: string;
  project_ids?: number[];
  projects?: ProjectBindingRecord[];
  secret?: string;
  target: string;
  type: string;
}) {
  return {
    access_scope: input.access_scope,
    alert_config: normalizeNotificationAlertConfig(input.alert_config),
    events: normalizeAuditStringList(input.events),
    is_enabled: input.is_enabled,
    name: input.name,
    project_ids: normalizeAuditProjectIds(
      input.project_ids || input.projects?.map((project) => project.id) || [],
    ),
    secret_configured: Boolean(String(input.secret || "").trim()),
    target: input.target,
    type: input.type,
  };
}

export function toApiTokenAuditSnapshot(input: {
  access_scope: AccessScope;
  description: string;
  expires_at: number | null;
  is_enabled: boolean;
  name: string;
  permissions: string[];
  project_ids?: number[];
  projects?: ProjectBindingRecord[];
}) {
  return {
    access_scope: input.access_scope,
    description: input.description,
    expires_at: input.expires_at ?? null,
    is_enabled: input.is_enabled,
    name: input.name,
    permissions: normalizeAuditStringList(input.permissions),
    project_ids: normalizeAuditProjectIds(
      input.project_ids || input.projects?.map((project) => project.id) || [],
    ),
  };
}

export function toRetentionPolicyAuditSnapshot(input: {
  archive_email_hours: number | null;
  deleted_email_retention_hours: number | null;
  description: string;
  email_retention_hours: number | null;
  environment_id: number | null;
  is_enabled: boolean;
  mailbox_pool_id: number | null;
  mailbox_ttl_hours: number | null;
  name: string;
  project_id: number | null;
  scope_key: string;
  scope_level?: string;
}) {
  return {
    archive_email_hours: input.archive_email_hours ?? null,
    deleted_email_retention_hours: input.deleted_email_retention_hours ?? null,
    description: input.description,
    email_retention_hours: input.email_retention_hours ?? null,
    environment_id: input.environment_id ?? null,
    is_enabled: input.is_enabled,
    mailbox_pool_id: input.mailbox_pool_id ?? null,
    mailbox_ttl_hours: input.mailbox_ttl_hours ?? null,
    name: input.name,
    project_id: input.project_id ?? null,
    scope_key: input.scope_key,
    scope_level:
      input.scope_level ||
      (input.mailbox_pool_id
        ? "mailbox_pool"
        : input.environment_id
          ? "environment"
          : input.project_id
            ? "project"
            : "global"),
  };
}

export function toDomainRoutingProfileAuditSnapshot(input: {
  catch_all_forward_to: string;
  catch_all_mode: CatchAllMode;
  environment_id: number | null;
  is_enabled: boolean;
  name: string;
  note: string;
  project_id: number | null;
  provider: string;
  slug: string;
}) {
  return {
    catch_all_forward_to: input.catch_all_forward_to,
    catch_all_mode: input.catch_all_mode,
    environment_id: input.environment_id ?? null,
    is_enabled: input.is_enabled,
    name: input.name,
    note: input.note,
    project_id: input.project_id ?? null,
    provider: input.provider,
    slug: input.slug,
  };
}

export function toWorkspaceProjectAuditSnapshot(input: {
  description: string;
  environment_count?: number;
  is_enabled: boolean;
  mailbox_count?: number;
  mailbox_pool_count?: number;
  name: string;
  slug: string;
}) {
  return {
    description: input.description,
    environment_count: input.environment_count ?? 0,
    is_enabled: input.is_enabled,
    mailbox_count: input.mailbox_count ?? 0,
    mailbox_pool_count: input.mailbox_pool_count ?? 0,
    name: input.name,
    slug: input.slug,
  };
}

export function toWorkspaceEnvironmentAuditSnapshot(input: {
  description: string;
  is_enabled: boolean;
  mailbox_count?: number;
  mailbox_pool_count?: number;
  name: string;
  project_id: number;
  project_name: string;
  project_slug: string;
  slug: string;
}) {
  return {
    description: input.description,
    is_enabled: input.is_enabled,
    mailbox_count: input.mailbox_count ?? 0,
    mailbox_pool_count: input.mailbox_pool_count ?? 0,
    name: input.name,
    project_id: input.project_id,
    project_name: input.project_name,
    project_slug: input.project_slug,
    slug: input.slug,
  };
}

export function toWorkspaceMailboxPoolAuditSnapshot(input: {
  description: string;
  environment_id: number;
  environment_name: string;
  environment_slug: string;
  is_enabled: boolean;
  mailbox_count?: number;
  name: string;
  project_id: number;
  project_name: string;
  project_slug: string;
  slug: string;
}) {
  return {
    description: input.description,
    environment_id: input.environment_id,
    environment_name: input.environment_name,
    environment_slug: input.environment_slug,
    is_enabled: input.is_enabled,
    mailbox_count: input.mailbox_count ?? 0,
    name: input.name,
    project_id: input.project_id,
    project_name: input.project_name,
    project_slug: input.project_slug,
    slug: input.slug,
  };
}

export function toMailboxAuditSnapshot(input: {
  address: string;
  created_by: string;
  environment_id: number | null;
  environment_name: string;
  environment_slug: string;
  expires_at: number | null;
  is_enabled: boolean;
  last_received_at: number | null;
  mailbox_pool_id: number | null;
  mailbox_pool_name: string;
  mailbox_pool_slug: string;
  note: string;
  project_id: number | null;
  project_name: string;
  project_slug: string;
  receive_count: number;
  tags: string[];
}) {
  return {
    address: input.address,
    created_by: input.created_by,
    environment_id: input.environment_id ?? null,
    environment_name: input.environment_name,
    environment_slug: input.environment_slug,
    expires_at: input.expires_at ?? null,
    is_enabled: input.is_enabled,
    last_received_at: input.last_received_at ?? null,
    mailbox_pool_id: input.mailbox_pool_id ?? null,
    mailbox_pool_name: input.mailbox_pool_name,
    mailbox_pool_slug: input.mailbox_pool_slug,
    note: input.note,
    project_id: input.project_id ?? null,
    project_name: input.project_name,
    project_slug: input.project_slug,
    receive_count: input.receive_count,
    tags: normalizeAuditStringList(input.tags),
  };
}

export function toRuleAuditSnapshot(input: {
  is_enabled: boolean;
  pattern: string;
  remark: string;
  sender_filter: string;
}) {
  return {
    is_enabled: input.is_enabled,
    pattern: input.pattern,
    remark: input.remark,
    sender_filter: input.sender_filter,
  };
}

export function toWhitelistAuditSnapshot(input: {
  is_enabled: boolean;
  note: string;
  sender_pattern: string;
}) {
  return {
    is_enabled: input.is_enabled,
    note: input.note,
    sender_pattern: input.sender_pattern,
  };
}

export function toOutboundEmailAuditSnapshot(input: {
  attachment_count: number;
  bcc_addresses: string[];
  cc_addresses: string[];
  created_by: string;
  from_address: string;
  from_name: string;
  last_attempt_at: number | null;
  provider: string;
  reply_to: string;
  scheduled_at: number | null;
  sent_at: number | null;
  status: string;
  subject: string;
  to_addresses: string[];
}) {
  return {
    attachment_count: input.attachment_count,
    bcc_addresses: normalizeAuditStringList(input.bcc_addresses),
    cc_addresses: normalizeAuditStringList(input.cc_addresses),
    created_by: input.created_by,
    from_address: input.from_address,
    from_name: input.from_name,
    last_attempt_at: input.last_attempt_at ?? null,
    provider: input.provider,
    reply_to: input.reply_to,
    scheduled_at: input.scheduled_at ?? null,
    sent_at: input.sent_at ?? null,
    status: input.status,
    subject: input.subject,
    to_addresses: normalizeAuditStringList(input.to_addresses),
  };
}

export function toOutboundTemplateAuditSnapshot(input: {
  created_by: string;
  html_template: string;
  is_enabled: boolean;
  name: string;
  subject_template: string;
  text_template: string;
  variables: string[];
}) {
  return {
    created_by: input.created_by,
    html_template_length: input.html_template.length,
    is_enabled: input.is_enabled,
    name: input.name,
    subject_template: input.subject_template,
    text_template_length: input.text_template.length,
    variables: normalizeAuditStringList(input.variables),
  };
}

export function toOutboundContactAuditSnapshot(input: {
  email: string;
  is_favorite: boolean;
  name: string;
  note: string;
  tags: string[];
}) {
  return {
    email: input.email,
    is_favorite: input.is_favorite,
    name: input.name,
    note: input.note,
    tags: normalizeAuditStringList(input.tags),
  };
}

export function toEmailAuditSnapshot(input: {
  archive_reason: string;
  archived_at: number | null;
  archived_by: string;
  deleted_at: number | null;
  environment_id: number | null;
  environment_name: string;
  environment_slug: string;
  extraction: { platform?: string | null };
  from_address: string;
  has_attachments: boolean;
  mailbox_pool_id: number | null;
  mailbox_pool_name: string;
  mailbox_pool_slug: string;
  note: string;
  primary_mailbox_address: string;
  project_id: number | null;
  project_name: string;
  project_slug: string;
  received_at: number;
  result_count: number;
  subject: string;
  tags: string[];
  to_address: string;
  verification_code: string | null;
}) {
  return {
    archive_reason: input.archive_reason,
    archived_at: input.archived_at ?? null,
    archived_by: input.archived_by,
    deleted_at: input.deleted_at ?? null,
    environment_id: input.environment_id ?? null,
    environment_name: input.environment_name,
    environment_slug: input.environment_slug,
    extraction_platform: String(input.extraction?.platform || ""),
    from_address: input.from_address,
    has_attachments: input.has_attachments,
    mailbox_pool_id: input.mailbox_pool_id ?? null,
    mailbox_pool_name: input.mailbox_pool_name,
    mailbox_pool_slug: input.mailbox_pool_slug,
    note: input.note,
    primary_mailbox_address: input.primary_mailbox_address,
    project_id: input.project_id ?? null,
    project_name: input.project_name,
    project_slug: input.project_slug,
    received_at: input.received_at,
    result_count: input.result_count,
    subject: input.subject,
    tags: normalizeAuditStringList(input.tags),
    to_address: input.to_address,
    verification_code: input.verification_code,
  };
}

export function describeDomainCloudflareToken(input: {
  provider: string;
  cloudflare_api_token?: string | null;
  cloudflare_api_token_configured?: boolean;
}) {
  const configured =
    input.provider === "cloudflare" &&
    (typeof input.cloudflare_api_token_configured === "boolean"
      ? input.cloudflare_api_token_configured
      : Boolean(String(input.cloudflare_api_token || "").trim()));
  return {
    cloudflare_api_token_configured: configured,
    cloudflare_api_token_mode: configured ? "domain" : "global",
  };
}

export function buildAuditedDomainAssetSnapshot(input: {
  allow_catch_all_sync: boolean;
  allow_mailbox_route_sync: boolean;
  allow_new_mailboxes: boolean;
  catch_all_forward_to: string;
  catch_all_mode: CatchAllMode;
  cloudflare_api_token?: string | null;
  cloudflare_api_token_configured?: boolean;
  domain: string;
  email_worker: string;
  environment_id: number | null;
  is_enabled: boolean;
  is_primary: boolean;
  mailbox_route_forward_to: string;
  note: string;
  project_id: number | null;
  provider: string;
  routing_profile_id: number | null;
  zone_id: string;
}) {
  const {
    cloudflare_api_token: _cloudflareApiToken,
    cloudflare_api_token_configured: _cloudflareApiTokenConfigured,
    ...rest
  } = input;
  return {
    ...rest,
    ...describeDomainCloudflareToken(input),
  };
}

export function resolveStoredCloudflareTokenSnapshot(
  existing: (Pick<DomainAssetSecretRecord, "cloudflare_api_token"> & {
    provider: string;
  }) | null,
) {
  return describeDomainCloudflareToken({
    provider: existing?.provider || "cloudflare",
    cloudflare_api_token: existing?.cloudflare_api_token || "",
  });
}
