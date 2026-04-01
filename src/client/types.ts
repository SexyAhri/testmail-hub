import type {
  AccessScope,
  AdminRole,
  NotificationAlertConfig,
  ApiTokenPermission,
  ApiTokenRecord,
  AdminUserRecord,
  AuditLogRecord,
  CatchAllMode,
  CloudflareApiTokenMode,
  DomainCatchAllSource,
  DomainAssetRecord,
  DomainRoutingProfileRecord,
  DomainAssetStatusRecord,
  EmailAttachmentRecord,
  EmailDetail,
  EmailExtractionResult,
  ErrorEventsPayload,
  ErrorEventSummary,
  EmailSummary,
  ErrorEventRecord,
  ExtractedEmailLink,
  RuleMatchInsight,
  MailboxRecord,
  MailboxSyncRunRecord,
  MailboxSyncStartResult,
  MailboxSyncResult,
  NotificationDeliveryRecord,
  NotificationDeliveryAttemptRecord,
  NotificationDeliveriesPayload,
  NotificationDeliveryBulkActionResult,
  NotificationDeliverySummary,
  NotificationEndpointRecord,
  OutboundContactRecord,
  OutboundEmailAttachmentRecord,
  OutboundEmailRecord,
  OutboundEmailSettings,
  OutboundStats,
  OutboundTemplateRecord,
  OverviewStats,
  PaginationPayload,
  ProjectBindingRecord,
  RetentionJobAction,
  RetentionJobRunRecord,
  RetentionJobRunSummary,
  ResolvedRetentionPolicy,
  RetentionPolicyRecord,
  RetentionPolicyScopeLevel,
  RuleMatch,
  RuleRecord,
  MailboxPoolRecord,
  WorkspaceCatalog,
  WorkspaceEnvironmentRecord,
  WorkspaceProjectRecord,
  WhitelistSettings,
  WhitelistRecord,
} from "../server/types";

export type {
  AccessScope,
  AdminRole,
  NotificationAlertConfig,
  ApiTokenPermission,
  ApiTokenRecord,
  AdminUserRecord,
  AuditLogRecord,
  CatchAllMode,
  CloudflareApiTokenMode,
  DomainCatchAllSource,
  DomainAssetRecord,
  DomainRoutingProfileRecord,
  DomainAssetStatusRecord,
  EmailAttachmentRecord,
  EmailDetail,
  EmailExtractionResult,
  ErrorEventsPayload,
  ErrorEventSummary,
  EmailSummary,
  ErrorEventRecord,
  ExtractedEmailLink,
  RuleMatchInsight,
  MailboxRecord,
  MailboxSyncRunRecord,
  MailboxSyncStartResult,
  MailboxSyncResult,
  NotificationDeliveryRecord,
  NotificationDeliveryAttemptRecord,
  NotificationDeliveriesPayload,
  NotificationDeliveryBulkActionResult,
  NotificationDeliverySummary,
  NotificationEndpointRecord,
  OutboundContactRecord,
  OutboundEmailAttachmentRecord,
  OutboundEmailRecord,
  OutboundEmailSettings,
  OutboundStats,
  OutboundTemplateRecord,
  OverviewStats,
  PaginationPayload,
  ProjectBindingRecord,
  RetentionJobAction,
  RetentionJobRunRecord,
  RetentionJobRunSummary,
  ResolvedRetentionPolicy,
  RetentionPolicyRecord,
  RetentionPolicyScopeLevel,
  RuleMatch,
  RuleRecord,
  MailboxPoolRecord,
  WorkspaceCatalog,
  WorkspaceEnvironmentRecord,
  WorkspaceProjectRecord,
  WhitelistSettings,
  WhitelistRecord,
};

export interface ApiEnvelope<T> {
  code: number;
  data: T;
  detail?: unknown;
  message?: string;
}

export interface SessionPayload {
  mailbox_domain: string;
  ok: true;
  user: {
    access_scope?: AccessScope;
    display_name: string;
    projects?: ProjectBindingRecord[];
    role: AdminRole;
    username: string;
  };
}

export interface DomainsPayload {
  default_domain: string;
  domains: string[];
}

export interface DomainMutationPayload {
  allow_catch_all_sync: boolean;
  allow_mailbox_route_sync: boolean;
  allow_new_mailboxes: boolean;
  catch_all_forward_to: string;
  catch_all_mode: CatchAllMode;
  cloudflare_api_token?: string;
  cloudflare_api_token_mode?: CloudflareApiTokenMode;
  domain: string;
  email_worker: string;
  environment_id?: number | null;
  is_enabled: boolean;
  is_primary: boolean;
  mailbox_route_forward_to: string;
  note: string;
  operation_note?: string;
  provider: string;
  project_id?: number | null;
  routing_profile_id?: number | null;
  zone_id: string;
}

export interface DomainRoutingProfileMutationPayload {
  catch_all_forward_to: string;
  catch_all_mode: CatchAllMode;
  environment_id?: number | null;
  is_enabled: boolean;
  name: string;
  note: string;
  operation_note?: string;
  project_id?: number | null;
  provider: string;
  slug?: string;
}

export interface DomainSyncPayload {
  operation_note?: string;
}

export interface AuditOperationPayload {
  operation_note?: string;
}

export interface LoginPayload {
  password?: string;
  token?: string;
  username?: string;
}

export interface MailboxPayload {
  batch_count?: number;
  domain: string;
  environment_id?: number | null;
  expires_at?: number | string | null;
  generate_random: boolean;
  is_enabled: boolean;
  local_part: string;
  mailbox_pool_id?: number | null;
  note: string;
  project_id?: number | null;
  tags?: string[] | string;
}

export interface WorkspaceProjectPayload {
  description: string;
  is_enabled: boolean;
  name: string;
  slug?: string;
}

export interface WorkspaceEnvironmentPayload {
  description: string;
  is_enabled: boolean;
  name: string;
  project_id: number;
  slug?: string;
}

export interface MailboxPoolPayload {
  description: string;
  environment_id: number;
  is_enabled: boolean;
  name: string;
  project_id: number;
  slug?: string;
}

export interface RetentionPolicyPayload {
  archive_email_hours?: number | null;
  deleted_email_retention_hours?: number | null;
  description: string;
  email_retention_hours?: number | null;
  environment_id?: number | null;
  is_enabled: boolean;
  mailbox_pool_id?: number | null;
  mailbox_ttl_hours?: number | null;
  name: string;
  operation_note?: string;
  project_id?: number | null;
}

export interface RuleMutationPayload {
  is_enabled: boolean;
  pattern: string;
  remark: string;
  sender_filter: string;
}

export interface WhitelistMutationPayload {
  is_enabled: boolean;
  note: string;
  sender_pattern: string;
}

export interface EmailMetadataPayload {
  note: string;
  tags?: string[] | string;
}

export interface NotificationMutationPayload {
  access_scope: AccessScope;
  alert_config: NotificationAlertConfig;
  events: string[];
  is_enabled: boolean;
  name: string;
  operation_note?: string;
  project_ids?: number[] | string;
  secret: string;
  target: string;
  type: string;
}

export interface AdminMutationPayload {
  access_scope: AccessScope;
  display_name: string;
  is_enabled: boolean;
  note: string;
  operation_note?: string;
  password?: string;
  project_ids?: number[] | string;
  role: AdminRole;
  username?: string;
}

export interface AdminListFilters {
  access_scope?: AccessScope | null;
  is_enabled?: boolean | null;
  keyword?: string;
  project_id?: number | null;
  role?: AdminRole | null;
}

export interface AuditLogListFilters {
  action?: string | null;
  action_prefix?: string | null;
  entity_id?: string | null;
  entity_type?: string | null;
  keyword?: string;
}

export interface ApiTokenMutationPayload {
  access_scope: AccessScope;
  description: string;
  expires_at?: number | null;
  is_enabled: boolean;
  name: string;
  operation_note?: string;
  permissions: ApiTokenPermission[] | string;
  project_ids?: number[] | string;
}

export interface ApiTokenIssueResult {
  plain_text_token: string;
  token: ApiTokenRecord;
}

export interface RuleTestResult {
  invalid_rules: number[];
  matches: RuleMatch[];
}

export interface EmailSearchPayload {
  address?: string;
  archived?: "exclude" | "include" | "only";
  date_from?: number;
  date_to?: number;
  deleted?: "exclude" | "include" | "only";
  domain?: string;
  environment_id?: number;
  has_attachments?: boolean;
  has_matches?: boolean;
  mailbox_pool_id?: number;
  project_id?: number;
  sender?: string;
  subject?: string;
}

export interface OutboundEmailPayload {
  attachments?: OutboundEmailAttachmentPayload[];
  bcc?: string[] | string;
  cc?: string[] | string;
  from_address?: string;
  from_name?: string;
  html_body?: string;
  id?: number;
  mode?: "draft" | "send";
  reply_to?: string;
  scheduled_at?: number | null;
  subject: string;
  template_id?: number | null;
  template_variables?: Record<string, string> | string;
  text_body?: string;
  to: string[] | string;
}

export interface OutboundEmailSettingsPayload {
  allow_external_recipients: boolean;
  default_from_address: string;
  default_from_name: string;
  default_reply_to: string;
}

export interface OutboundEmailAttachmentPayload {
  content_base64: string;
  content_type: string;
  filename: string;
  size_bytes: number;
}

export interface OutboundTemplatePayload {
  html_template: string;
  is_enabled: boolean;
  name: string;
  subject_template: string;
  text_template: string;
  variables?: string[] | string;
}

export interface OutboundContactPayload {
  email: string;
  is_favorite: boolean;
  name: string;
  note: string;
  tags?: string[] | string;
}
