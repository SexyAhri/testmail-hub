export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface JsonBodyResult<T> {
  data?: T;
  error?: string;
  ok: boolean;
}

export interface D1QueryResult<T> {
  results: T[];
  success?: boolean;
}

export interface D1PreparedStatement {
  all<T = Record<string, unknown>>(): Promise<D1QueryResult<T>>;
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface WorkerAssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface WorkerEmailMessage {
  forward(address: string): Promise<void>;
  raw: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array;
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export type AdminRole =
  | "owner"
  | "platform_admin"
  | "project_admin"
  | "operator"
  | "viewer";
export type AccessScope = "all" | "bound";
export type AuthKind = "bootstrap_token" | "admin_user";
export type ApiTokenPermission = "read:attachment" | "read:code" | "read:mail" | "read:rule-result";
export type CatchAllMode = "inherit" | "enabled" | "disabled";
export type CloudflareApiTokenMode = "global" | "domain";
export type DomainCatchAllSource = "domain" | "inherit" | "routing_profile";

export interface AuthSession {
  access_scope?: AccessScope;
  auth_kind: AuthKind;
  display_name: string;
  expires_at: number;
  project_ids?: number[];
  role: AdminRole;
  user_agent_hash: string;
  user_id: string;
  username: string;
}

export interface WorkerEnv {
  ADMIN_TOKEN?: string;
  ALLOWED_API_ORIGINS?: string;
  API_TOKEN?: string;
  ASSETS?: WorkerAssetsBinding;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_EMAIL_WORKER?: string;
  CLOUDFLARE_ZONE_ID?: string;
  DB: D1Database;
  ERROR_WEBHOOK_URL?: string;
  FORWARD_TO?: string;
  MAILBOX_DOMAIN?: string;
  RESEND_API_KEY?: string;
  RESEND_DEFAULT_FROM?: string;
  RESEND_DEFAULT_FROM_NAME?: string;
  RESEND_DEFAULT_REPLY_TO?: string;
  RESEND_FROM_DOMAIN?: string;
  SESSION_SECRET?: string;
}

export interface RuleMatch {
  [key: string]: JsonValue;
  remark: string | null;
  rule_id: number;
  value: string;
}

export interface EmailAttachmentRecord {
  content_id: string | null;
  disposition: string | null;
  filename: string;
  id: number;
  is_stored: boolean;
  mime_type: string;
  size_bytes: number;
}

export type ExtractedLinkKind =
  | "verification"
  | "magic_link"
  | "login"
  | "reset_password"
  | "invitation"
  | "action"
  | "other";

export interface ExtractedEmailLink {
  [key: string]: JsonValue;
  host: string;
  kind: ExtractedLinkKind;
  label: string;
  score: number;
  url: string;
}

export interface EmailExtractionResult {
  [key: string]: JsonValue;
  links: ExtractedEmailLink[];
  platform: string | null;
  platform_slug: string | null;
  primary_link: ExtractedEmailLink | null;
  verification_code: string | null;
}

export type RuleMatchInsightType =
  | "verification_code"
  | "verification_hint"
  | "magic_link"
  | "login_link"
  | "reset_link"
  | "platform_signal"
  | "generic";

export interface RuleMatchInsight {
  [key: string]: JsonValue;
  confidence: number;
  confidence_label: "high" | "medium" | "low";
  match_type: RuleMatchInsightType;
  reason: string;
  source: RuleMatch;
}

export interface WorkspaceScope {
  environment_id: number | null;
  environment_name: string;
  environment_slug: string;
  mailbox_pool_id: number | null;
  mailbox_pool_name: string;
  mailbox_pool_slug: string;
  project_id: number | null;
  project_name: string;
  project_slug: string;
}

export interface WorkspaceProjectRecord {
  created_at: number;
  description: string;
  environment_count: number;
  id: number;
  is_enabled: boolean;
  mailbox_count: number;
  mailbox_pool_count: number;
  name: string;
  resolved_retention: ResolvedRetentionPolicy;
  slug: string;
  updated_at: number;
}

export interface WorkspaceEnvironmentRecord {
  created_at: number;
  description: string;
  id: number;
  is_enabled: boolean;
  mailbox_count: number;
  mailbox_pool_count: number;
  name: string;
  project_id: number;
  project_name: string;
  project_slug: string;
  resolved_retention: ResolvedRetentionPolicy;
  slug: string;
  updated_at: number;
}

export interface MailboxPoolRecord {
  created_at: number;
  description: string;
  environment_id: number;
  environment_name: string;
  environment_slug: string;
  id: number;
  is_enabled: boolean;
  mailbox_count: number;
  name: string;
  project_id: number;
  project_name: string;
  project_slug: string;
  resolved_retention: ResolvedRetentionPolicy;
  slug: string;
  updated_at: number;
}

export interface WorkspaceCatalog {
  environments: WorkspaceEnvironmentRecord[];
  mailbox_pools: MailboxPoolRecord[];
  projects: WorkspaceProjectRecord[];
}

export interface EmailSummary extends WorkspaceScope {
  archive_reason: string;
  archived_at: number | null;
  archived_by: string;
  deleted_at: number | null;
  extraction: EmailExtractionResult;
  from_address: string;
  has_attachments: boolean;
  message_id: string;
  note: string;
  primary_mailbox_address: string;
  preview: string;
  received_at: number;
  resolved_retention: ResolvedRetentionPolicy;
  result_count: number;
  subject: string;
  tags: string[];
  to_address: string;
  verification_code: string | null;
}

export interface EmailDetail extends EmailSummary {
  attachments: EmailAttachmentRecord[];
  html_body: string;
  raw_headers: Array<{ key: string; value: string }>;
  result_insights: RuleMatchInsight[];
  results: RuleMatch[];
  text_body: string;
}

export interface RuleRecord {
  created_at: number;
  id: number;
  is_enabled: boolean;
  pattern: string;
  remark: string;
  sender_filter: string;
  updated_at: number;
}

export interface WhitelistRecord {
  created_at: number;
  id: number;
  is_enabled: boolean;
  note: string;
  sender_pattern: string;
  updated_at: number;
}

export interface MailboxRecord extends WorkspaceScope {
  address: string;
  created_at: number;
  created_by: string;
  deleted_at: number | null;
  expires_at: number | null;
  id: number;
  is_enabled: boolean;
  last_received_at: number | null;
  note: string;
  receive_count: number;
  resolved_retention: ResolvedRetentionPolicy;
  tags: string[];
  updated_at: number;
}

export type RetentionPolicyScopeLevel = "global" | "project" | "environment" | "mailbox_pool";
export type RetentionJobAction =
  | "expire_mailboxes"
  | "archive_emails"
  | "purge_active_emails"
  | "purge_deleted_emails";

export interface RetentionPolicyRecord extends WorkspaceScope {
  archive_email_hours: number | null;
  created_at: number;
  deleted_email_retention_hours: number | null;
  description: string;
  email_retention_hours: number | null;
  id: number;
  is_enabled: boolean;
  mailbox_ttl_hours: number | null;
  name: string;
  scope_key: string;
  scope_level: RetentionPolicyScopeLevel;
  updated_at: number;
}

export interface ResolvedRetentionPolicy {
  archive_email_hours: number | null;
  archive_email_source: RetentionPolicyScopeLevel | "default" | null;
  deleted_email_retention_hours: number | null;
  deleted_email_retention_source: RetentionPolicyScopeLevel | "default" | null;
  email_retention_hours: number | null;
  email_retention_source: RetentionPolicyScopeLevel | "default" | null;
  mailbox_ttl_hours: number | null;
  mailbox_ttl_source: RetentionPolicyScopeLevel | "default" | null;
}

export interface RetentionJobRunRecord {
  archived_email_count: number;
  applied_policy_count: number;
  created_at: number;
  detail_json: JsonValue;
  duration_ms: number | null;
  error_message: string;
  expired_mailbox_count: number;
  finished_at: number | null;
  id: number;
  purged_active_email_count: number;
  purged_deleted_email_count: number;
  scanned_email_count: number;
  started_at: number;
  status: "failed" | "success";
  trigger_source: string;
}

export interface RetentionJobRunSummary {
  average_duration_ms_24h: number | null;
  consecutive_failure_count: number;
  last_failed_at: number | null;
  last_run: {
    duration_ms: number | null;
    finished_at: number | null;
    id: number;
    started_at: number;
    status: RetentionJobRunRecord["status"];
    trigger_source: string;
  } | null;
  last_success_at: number | null;
  recent_24h_archived_email_count: number;
  recent_24h_expired_mailbox_count: number;
  recent_24h_failed_count: number;
  recent_24h_purged_active_email_count: number;
  recent_24h_purged_deleted_email_count: number;
  recent_24h_run_count: number;
  recent_24h_scanned_email_count: number;
  recent_24h_success_count: number;
  total_failed_count: number;
  total_run_count: number;
  total_success_count: number;
}

export interface DomainAssetRecord {
  allow_catch_all_sync: boolean;
  allow_mailbox_route_sync: boolean;
  allow_new_mailboxes: boolean;
  catch_all_forward_to: string;
  catch_all_mode: CatchAllMode;
  cloudflare_api_token_configured: boolean;
  created_at: number;
  domain: string;
  email_worker: string;
  mailbox_route_forward_to: string;
  environment_id: number | null;
  environment_name: string;
  environment_slug: string;
  id: number;
  is_enabled: boolean;
  is_primary: boolean;
  note: string;
  provider: string;
  project_id: number | null;
  project_name: string;
  project_slug: string;
  routing_profile_catch_all_forward_to: string;
  routing_profile_catch_all_mode: CatchAllMode;
  routing_profile_enabled: boolean;
  routing_profile_id: number | null;
  routing_profile_name: string;
  routing_profile_slug: string;
  updated_at: number;
  zone_id: string;
}

export interface DomainAssetSecretRecord extends DomainAssetRecord {
  cloudflare_api_token: string;
}

export interface DomainAssetStatusRecord {
  active_mailbox_total: number;
  allow_catch_all_sync: boolean;
  allow_mailbox_route_sync: boolean;
  allow_new_mailboxes: boolean;
  catch_all_drift: boolean;
  catch_all_enabled: boolean;
  catch_all_forward_to: string;
  catch_all_forward_to_actual: string;
  catch_all_mode: CatchAllMode;
  catch_all_source: DomainCatchAllSource;
  cloudflare_configured: boolean;
  cloudflare_error: string;
  cloudflare_routes_total: number;
  domain: string;
  email_total: number;
  mailbox_route_drift: boolean;
  mailbox_route_enabled_total: number;
  mailbox_route_expected_total: number;
  mailbox_route_extra_total: number;
  mailbox_route_missing_total: number;
  observed_mailbox_total: number;
  provider: string;
  routing_profile_name: string;
}

export interface DomainRoutingProfileRecord {
  catch_all_forward_to: string;
  catch_all_mode: CatchAllMode;
  created_at: number;
  environment_id: number | null;
  environment_name: string;
  environment_slug: string;
  id: number;
  is_enabled: boolean;
  linked_domain_count: number;
  name: string;
  note: string;
  project_id: number | null;
  project_name: string;
  project_slug: string;
  provider: string;
  slug: string;
  updated_at: number;
}

export interface MailboxSyncResult {
  catch_all_enabled: boolean;
  cloudflare_configured: boolean;
  cloudflare_routes_total: number;
  created_count: number;
  domain_summaries?: Array<{
    catch_all_enabled: boolean;
    cloudflare_configured: boolean;
    cloudflare_routes_total: number;
    domain: string;
  }>;
  observed_total: number;
  skipped_count: number;
  updated_count: number;
}

export type MailboxSyncRunStatus = "pending" | "running" | "success" | "failed";

export interface MailboxSyncRunRecord extends MailboxSyncResult {
  created_at: number;
  duration_ms: number | null;
  error_message: string;
  finished_at: number | null;
  id: number;
  requested_by: string;
  started_at: number;
  status: MailboxSyncRunStatus;
  trigger_source: string;
  updated_at: number;
}

export interface MailboxSyncStartResult {
  job_id: number;
  started_at: number;
  status: MailboxSyncRunStatus;
}

export interface ProjectBindingRecord {
  id: number;
  name: string;
  slug: string;
}

export interface AdminUserRecord {
  access_scope: AccessScope;
  created_at: number;
  display_name: string;
  id: string;
  is_enabled: boolean;
  last_login_at: number | null;
  last_modified_action: string;
  last_modified_at: number | null;
  last_modified_by: string;
  note: string;
  projects: ProjectBindingRecord[];
  role: AdminRole;
  updated_at: number;
  username: string;
}

export interface NotificationAlertConfig {
  dead_letter_critical_threshold: number;
  dead_letter_warning_threshold: number;
  inactivity_hours: number;
  min_attempts_24h: number;
  retrying_critical_threshold: number;
  retrying_warning_threshold: number;
  success_rate_critical_threshold: number;
  success_rate_warning_threshold: number;
}

export interface NotificationEndpointRecord {
  access_scope: AccessScope;
  alert_config: NotificationAlertConfig;
  created_at: number;
  events: string[];
  id: number;
  is_enabled: boolean;
  last_error: string;
  last_sent_at: number | null;
  last_status: string;
  name: string;
  projects: ProjectBindingRecord[];
  secret: string;
  target: string;
  type: string;
  updated_at: number;
}

export type NotificationDeliveryStatus = "failed" | "pending" | "retrying" | "success";

export interface NotificationDeliveryScope {
  environment_id?: number | null;
  mailbox_pool_id?: number | null;
  project_id?: number | null;
  project_ids?: number[];
}

export interface NotificationDeliveryRecord {
  attempt_count: number;
  created_at: number;
  dead_letter_reason: string;
  event: string;
  id: number;
  is_dead_letter: boolean;
  last_attempt_at: number | null;
  last_error: string;
  max_attempts: number;
  next_retry_at: number | null;
  notification_endpoint_id: number;
  payload: JsonValue;
  response_status: number | null;
  resolved_at: number | null;
  resolved_by: string;
  scope: NotificationDeliveryScope;
  status: NotificationDeliveryStatus;
  updated_at: number;
}

export interface NotificationDeliveryAttemptRecord {
  attempt_number: number;
  attempted_at: number;
  created_at: number;
  duration_ms: number | null;
  error_message: string;
  id: number;
  next_retry_at: number | null;
  notification_delivery_id: number;
  notification_endpoint_id: number;
  response_status: number | null;
  status: NotificationDeliveryStatus;
  updated_at: number;
}

export interface NotificationSummaryAlert {
  code:
    | "dead_letter_backlog"
    | "inactive_24h"
    | "low_success_rate_24h"
    | "retry_queue_active";
  description: string;
  severity: "critical" | "info" | "warning";
  title: string;
}

export interface NotificationDeliverySummary {
  alerts: NotificationSummaryAlert[];
  avg_duration_ms_24h: number | null;
  dead_letter_total: number;
  failed_total: number;
  health_status: "critical" | "healthy" | "idle" | "warning";
  last_attempt_at: number | null;
  last_failure_at: number | null;
  last_success_at: number | null;
  pending_total: number;
  recent_attempts_24h: number;
  recent_failed_attempts_24h: number;
  recent_success_attempts_24h: number;
  resolved_dead_letter_total: number;
  retrying_total: number;
  success_total: number;
  success_rate_24h: number;
  total_attempts: number;
  total_deliveries: number;
}

export interface NotificationDeliveriesPayload extends PaginationPayload<NotificationDeliveryRecord> {
  summary: NotificationDeliverySummary;
}

export interface NotificationDeliveryBulkActionError {
  delivery_id: number;
  message: string;
}

export interface NotificationDeliveryBulkActionResult {
  errors: NotificationDeliveryBulkActionError[];
  failed_count: number;
  requested_count: number;
  status_breakdown?: Partial<Record<NotificationDeliveryStatus, number>>;
  success_count: number;
}

export interface ApiTokenRecord {
  access_scope: AccessScope;
  created_at: number;
  created_by: string;
  description: string;
  expires_at: number | null;
  id: string;
  is_enabled: boolean;
  last_used_at: number | null;
  name: string;
  permissions: ApiTokenPermission[];
  projects: ProjectBindingRecord[];
  token_prefix: string;
  token_preview: string;
  updated_at: number;
}

export interface AuditLogRecord {
  action: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  created_at: number;
  detail_json: JsonValue;
  entity_id: string;
  entity_type: string;
  id: number;
}

export interface ErrorEventRecord {
  context_json: JsonValue;
  created_at: number;
  id: number;
  message: string;
  source: string;
  stack: string;
}

export interface ErrorEventSummary {
  admin_total: number;
  auth_total: number;
  latest_created_at: number | null;
  outbound_total: number;
  recent_24h_total: number;
  sync_total: number;
  total: number;
  unique_sources: number;
}

export interface PaginationPayload<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ErrorEventsPayload extends PaginationPayload<ErrorEventRecord> {
  source_options: string[];
  summary: ErrorEventSummary;
}

export interface EmailSearchFilters {
  address?: string | null;
  archived?: "exclude" | "include" | "only";
  date_from?: number | null;
  date_to?: number | null;
  deleted?: "exclude" | "include" | "only";
  domain?: string | null;
  environment_id?: number | null;
  has_attachments?: boolean | null;
  has_matches?: boolean | null;
  mailbox_pool_id?: number | null;
  project_id?: number | null;
  sender?: string | null;
  subject?: string | null;
}

export interface EmailSavePayload {
  attachments: Array<{
    content_base64: string;
    content_id: string | null;
    disposition: string | null;
    filename: string;
    is_stored: boolean;
    mime_type: string;
    size_bytes: number;
  }>;
  from: string;
  headers: Array<{ key: string; value: string }>;
  html: string;
  matches: RuleMatch[];
  subject: string;
  text: string;
  to: string[];
}

export interface OverviewStats {
  active_mailboxes: number;
  attachment_total: number;
  deleted_email_total: number;
  email_total: number;
  environment_total: number;
  error_total: number;
  mailbox_pool_total: number;
  matched_email_total: number;
  project_total: number;
  recent_daily: Array<{ day: string; value: number }>;
  top_domains: Array<{ label: string; value: number }>;
  top_senders: Array<{ label: string; value: number }>;
}

export interface ExportRow {
  [key: string]: JsonValue;
}

export interface WhitelistSettings {
  enabled: boolean;
}

export interface OutboundEmailSettings {
  allow_external_recipients: boolean;
  api_key_configured: boolean;
  configured: boolean;
  default_from_address: string;
  default_from_name: string;
  default_reply_to: string;
  from_domain: string;
  provider: "resend";
}

export type OutboundEmailStatus = "draft" | "failed" | "scheduled" | "sending" | "sent";

export interface OutboundEmailAttachmentRecord {
  content_base64?: string;
  content_type: string;
  filename: string;
  id: number;
  size_bytes: number;
}

export interface OutboundEmailRecord {
  attachment_count: number;
  attachments?: OutboundEmailAttachmentRecord[];
  bcc_addresses: string[];
  cc_addresses: string[];
  created_at: number;
  created_by: string;
  error_message: string;
  from_address: string;
  from_name: string;
  html_body: string;
  id: number;
  last_attempt_at: number | null;
  provider: string;
  provider_message_id: string;
  reply_to: string;
  scheduled_at: number | null;
  sent_at: number | null;
  status: OutboundEmailStatus;
  subject: string;
  text_body: string;
  to_addresses: string[];
  updated_at: number;
}

export interface OutboundTemplateRecord {
  created_at: number;
  created_by: string;
  html_template: string;
  id: number;
  is_enabled: boolean;
  name: string;
  subject_template: string;
  text_template: string;
  updated_at: number;
  variables: string[];
}

export interface OutboundContactRecord {
  created_at: number;
  email: string;
  id: number;
  is_favorite: boolean;
  name: string;
  note: string;
  tags: string[];
  updated_at: number;
}

export interface OutboundStats {
  recent_daily: Array<{ day: string; failed: number; sent: number; scheduled: number }>;
  top_recipient_domains: Array<{ label: string; value: number }>;
  total_drafts: number;
  total_failed: number;
  total_scheduled: number;
  total_sent: number;
}
