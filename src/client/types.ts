import type {
  AdminRole,
  AdminUserRecord,
  AuditLogRecord,
  EmailAttachmentRecord,
  EmailDetail,
  ErrorEventsPayload,
  ErrorEventSummary,
  EmailSummary,
  ErrorEventRecord,
  MailboxRecord,
  MailboxSyncResult,
  NotificationEndpointRecord,
  OutboundContactRecord,
  OutboundEmailAttachmentRecord,
  OutboundEmailRecord,
  OutboundEmailSettings,
  OutboundStats,
  OutboundTemplateRecord,
  OverviewStats,
  PaginationPayload,
  RuleMatch,
  RuleRecord,
  WhitelistSettings,
  WhitelistRecord,
} from "../server/types";

export type {
  AdminRole,
  AdminUserRecord,
  AuditLogRecord,
  EmailAttachmentRecord,
  EmailDetail,
  ErrorEventsPayload,
  ErrorEventSummary,
  EmailSummary,
  ErrorEventRecord,
  MailboxRecord,
  MailboxSyncResult,
  NotificationEndpointRecord,
  OutboundContactRecord,
  OutboundEmailAttachmentRecord,
  OutboundEmailRecord,
  OutboundEmailSettings,
  OutboundStats,
  OutboundTemplateRecord,
  OverviewStats,
  PaginationPayload,
  RuleMatch,
  RuleRecord,
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
    display_name: string;
    role: AdminRole;
    username: string;
  };
}

export interface DomainsPayload {
  domains: string[];
}

export interface LoginPayload {
  password?: string;
  token?: string;
  username?: string;
}

export interface MailboxPayload {
  batch_count?: number;
  domain: string;
  expires_at?: number | string | null;
  generate_random: boolean;
  is_enabled: boolean;
  local_part: string;
  note: string;
  tags?: string[] | string;
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
  events: string[];
  is_enabled: boolean;
  name: string;
  secret: string;
  target: string;
  type: string;
}

export interface AdminMutationPayload {
  display_name: string;
  is_enabled: boolean;
  password?: string;
  role: AdminRole;
  username?: string;
}

export interface RuleTestResult {
  invalid_rules: number[];
  matches: RuleMatch[];
}

export interface EmailSearchPayload {
  address?: string;
  date_from?: number;
  date_to?: number;
  deleted?: "exclude" | "include" | "only";
  domain?: string;
  has_attachments?: boolean;
  has_matches?: boolean;
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
