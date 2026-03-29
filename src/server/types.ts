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

export type AdminRole = "owner" | "admin" | "analyst";
export type AuthKind = "bootstrap_token" | "admin_user";

export interface AuthSession {
  auth_kind: AuthKind;
  display_name: string;
  expires_at: number;
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

export interface EmailSummary {
  deleted_at: number | null;
  from_address: string;
  has_attachments: boolean;
  message_id: string;
  note: string;
  preview: string;
  received_at: number;
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

export interface MailboxRecord {
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
  tags: string[];
  updated_at: number;
}

export interface MailboxSyncResult {
  catch_all_enabled: boolean;
  cloudflare_configured: boolean;
  cloudflare_routes_total: number;
  created_count: number;
  observed_total: number;
  skipped_count: number;
  updated_count: number;
}

export interface AdminUserRecord {
  created_at: number;
  display_name: string;
  id: string;
  is_enabled: boolean;
  last_login_at: number | null;
  role: AdminRole;
  updated_at: number;
  username: string;
}

export interface NotificationEndpointRecord {
  created_at: number;
  events: string[];
  id: number;
  is_enabled: boolean;
  last_error: string;
  last_sent_at: number | null;
  last_status: string;
  name: string;
  secret: string;
  target: string;
  type: string;
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
  date_from?: number | null;
  date_to?: number | null;
  deleted?: "exclude" | "include" | "only";
  domain?: string | null;
  has_attachments?: boolean | null;
  has_matches?: boolean | null;
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
  error_total: number;
  matched_email_total: number;
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
