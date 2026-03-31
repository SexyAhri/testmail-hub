import type { AccessScope, AdminRole, NotificationAlertConfig } from "../server/types";

export const PAGE_SIZE = 20;
export const RULES_PAGE_SIZE = 12;
export const MAILBOX_PAGE_SIZE = 20;
export const AUDIT_PAGE_SIZE = 25;
export const ADMIN_PAGE_SIZE = 25;
export const TRASH_PAGE_SIZE = 20;
export const OUTBOUND_EMAIL_PAGE_SIZE = 20;
export const OUTBOUND_TEMPLATE_PAGE_SIZE = 20;
export const OUTBOUND_CONTACT_PAGE_SIZE = 30;
export const RETENTION_POLICY_PAGE_SIZE = 20;
export const RETENTION_JOB_PAGE_SIZE = 20;

export const SESSION_TTL_SECONDS = 60 * 60 * 12;
export const SESSION_COOKIE_NAME = "admin_session";
export const MAX_MATCH_CONTENT_CHARS = 20000;
export const MAX_RULE_PATTERN_LENGTH = 2000;
export const MAX_SENDER_PATTERN_LENGTH = 500;
export const MAX_SENDER_FILTER_LENGTH = 2000;
export const MAX_RULE_REMARK_LENGTH = 200;
export const MAX_MAILBOX_ADDRESS_LENGTH = 320;
export const MAX_MAILBOX_NOTE_LENGTH = 200;
export const MAX_MAILBOX_TAGS = 20;
export const MAX_MAILBOX_TAG_LENGTH = 32;
export const MAX_EMAIL_NOTE_LENGTH = 500;
export const MAX_WORKSPACE_DESCRIPTION_LENGTH = 280;
export const MAX_WORKSPACE_NAME_LENGTH = 80;
export const MAX_WORKSPACE_SLUG_LENGTH = 64;
export const MAX_SCOPE_BINDINGS = 50;
export const MAX_API_TOKEN_NAME_LENGTH = 80;
export const MAX_API_TOKEN_DESCRIPTION_LENGTH = 280;
export const MAX_OUTBOUND_BODY_LENGTH = 100_000;
export const MAX_OUTBOUND_ATTACHMENTS = 10;
export const MAX_OUTBOUND_ATTACHMENT_TOTAL_BYTES = 5 * 1024 * 1024;
export const MAX_OUTBOUND_FROM_NAME_LENGTH = 120;
export const MAX_OUTBOUND_RECIPIENTS = 50;
export const MAX_OUTBOUND_SUBJECT_LENGTH = 200;
export const MAX_OUTBOUND_TEMPLATE_NAME_LENGTH = 120;
export const MAX_OUTBOUND_CONTACT_NOTE_LENGTH = 200;
export const MAX_ATTACHMENT_STORAGE_BYTES = 2 * 1024 * 1024;
export const MAX_RETENTION_HOURS = 24 * 365 * 5;
export const EMAIL_PREVIEW_LENGTH = 180;
export const PURGE_DELETED_EMAILS_AFTER_HOURS = 24 * 30;
export const EXPIRED_EMAIL_RETENTION_HOURS = 48;

export const API_CORS_METHODS = "GET, OPTIONS";
export const API_CORS_HEADERS = "Authorization, Content-Type";

export type NotificationEventCategory =
  | "email"
  | "lifecycle"
  | "admin"
  | "rule"
  | "system"
  | "outbound";

export interface NotificationEventDefinition {
  aliases?: string[];
  category: NotificationEventCategory;
  description: string;
  key: string;
  label: string;
}

export const NOTIFICATION_EVENT_CATEGORY_LABELS: Record<NotificationEventCategory, string> = {
  admin: "管理员事件",
  email: "邮件事件",
  lifecycle: "生命周期",
  outbound: "发信事件",
  rule: "规则事件",
  system: "系统事件",
};

export const DEFAULT_NOTIFICATION_ALERT_CONFIG: NotificationAlertConfig = {
  dead_letter_critical_threshold: 5,
  dead_letter_warning_threshold: 1,
  inactivity_hours: 24,
  min_attempts_24h: 5,
  retrying_critical_threshold: 10,
  retrying_warning_threshold: 1,
  success_rate_critical_threshold: 70,
  success_rate_warning_threshold: 95,
};

export const NOTIFICATION_EVENT_DEFINITIONS = [
  {
    aliases: [],
    category: "email",
    description: "收到一封新邮件后触发，适合自动化测试等待邮件到达。",
    key: "email.received",
    label: "邮件接收",
  },
  {
    aliases: ["email.match"],
    category: "email",
    description: "邮件命中了规则引擎后触发，适合做筛选和路由回调。",
    key: "email.matched",
    label: "规则命中",
  },
  {
    aliases: ["email.code"],
    category: "email",
    description: "从邮件里成功提取验证码后触发。",
    key: "email.code_extracted",
    label: "验证码提取",
  },
  {
    aliases: ["email.link"],
    category: "email",
    description: "从邮件里成功提取登录链接、验证链接或魔法链接后触发。",
    key: "email.link_extracted",
    label: "链接提取",
  },
  {
    aliases: [],
    category: "email",
    description: "邮件被归档后触发。",
    key: "email.archived",
    label: "邮件归档",
  },
  {
    aliases: [],
    category: "email",
    description: "邮件取消归档后触发。",
    key: "email.unarchived",
    label: "取消归档",
  },
  {
    aliases: [],
    category: "email",
    description: "邮件进入删除态后触发。",
    key: "email.deleted",
    label: "邮件删除",
  },
  {
    aliases: [],
    category: "email",
    description: "邮件从删除态恢复后触发。",
    key: "email.restored",
    label: "邮件恢复",
  },
  {
    aliases: [],
    category: "lifecycle",
    description: "邮箱到期并被自动停用后触发。",
    key: "mailbox.expired",
    label: "邮箱到期",
  },
  {
    aliases: ["retention.completed"],
    category: "lifecycle",
    description: "生命周期 / retention 任务执行成功后触发。",
    key: "lifecycle.retention_completed",
    label: "生命周期完成",
  },
  {
    aliases: ["retention.failed"],
    category: "lifecycle",
    description: "生命周期 / retention 任务执行失败后触发。",
    key: "lifecycle.retention_failed",
    label: "生命周期失败",
  },
  {
    aliases: ["admin.signed_in"],
    category: "admin",
    description: "管理员登录成功后触发。",
    key: "admin.login",
    label: "管理员登录",
  },
  {
    aliases: ["rule.changed"],
    category: "rule",
    description: "规则新增、修改后触发，便于同步规则缓存或审计。",
    key: "rule.updated",
    label: "规则更新",
  },
  {
    aliases: ["error"],
    category: "system",
    description: "系统捕获错误事件后触发，适合接入运维告警。",
    key: "error.raised",
    label: "系统错误",
  },
  {
    aliases: ["outbound.sent"],
    category: "outbound",
    description: "发信成功后触发。",
    key: "email.sent",
    label: "发信成功",
  },
  {
    aliases: ["outbound.failed"],
    category: "outbound",
    description: "发信失败后触发。",
    key: "email.send_failed",
    label: "发信失败",
  },
] as const satisfies readonly NotificationEventDefinition[];

export type NotificationEvent = (typeof NOTIFICATION_EVENT_DEFINITIONS)[number]["key"];
export const NOTIFICATION_EVENTS = NOTIFICATION_EVENT_DEFINITIONS.map(item => item.key) as NotificationEvent[];

const NOTIFICATION_EVENT_ALIAS_MAP = Object.fromEntries(
  NOTIFICATION_EVENT_DEFINITIONS.flatMap(item =>
    (item.aliases || []).map(alias => [alias, item.key]),
  ),
) as Record<string, NotificationEvent>;

const NOTIFICATION_EVENT_MAP = Object.fromEntries(
  NOTIFICATION_EVENT_DEFINITIONS.map(item => [item.key, item]),
) as Record<NotificationEvent, (typeof NOTIFICATION_EVENT_DEFINITIONS)[number]>;

export function getNotificationEventDefinition(value: string | null | undefined) {
  const normalized = normalizeNotificationEventValue(value);
  if (!normalized || normalized === "*") return null;
  return NOTIFICATION_EVENT_MAP[normalized] || null;
}

export function normalizeNotificationEventValue(value: string | null | undefined): NotificationEvent | "*" | null {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (normalized === "*") return "*";
  if (Object.hasOwn(NOTIFICATION_EVENT_MAP, normalized)) {
    return normalized as NotificationEvent;
  }
  return NOTIFICATION_EVENT_ALIAS_MAP[normalized] || null;
}

export function normalizeNotificationEventValues(values: string[]) {
  const invalid: string[] = [];
  const normalizedValues: Array<NotificationEvent | "*"> = [];
  const seen = new Set<string>();

  for (const item of values) {
    const normalized = normalizeNotificationEventValue(item);
    if (!normalized) {
      invalid.push(String(item || "").trim());
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    normalizedValues.push(normalized);
  }

  return {
    invalid: invalid.filter(Boolean),
    values: normalizedValues,
  };
}

function parseNotificationAlertNumber(value: unknown, fallback: number, minimum: number, maximum?: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.max(minimum, parsed);
  if (maximum !== undefined) return Math.min(maximum, normalized);
  return normalized;
}

export function normalizeNotificationAlertConfig(
  input: Partial<Record<keyof NotificationAlertConfig, unknown>> | null | undefined,
): NotificationAlertConfig {
  const base = DEFAULT_NOTIFICATION_ALERT_CONFIG;
  const warningSuccessRate = parseNotificationAlertNumber(
    input?.success_rate_warning_threshold,
    base.success_rate_warning_threshold,
    0,
    100,
  );
  const criticalSuccessRate = Math.min(
    warningSuccessRate,
    parseNotificationAlertNumber(
      input?.success_rate_critical_threshold,
      base.success_rate_critical_threshold,
      0,
      100,
    ),
  );
  const deadLetterWarning = Math.floor(parseNotificationAlertNumber(
    input?.dead_letter_warning_threshold,
    base.dead_letter_warning_threshold,
    0,
  ));
  const retryingWarning = Math.floor(parseNotificationAlertNumber(
    input?.retrying_warning_threshold,
    base.retrying_warning_threshold,
    0,
  ));

  return {
    dead_letter_critical_threshold: Math.max(
      deadLetterWarning,
      Math.floor(parseNotificationAlertNumber(
        input?.dead_letter_critical_threshold,
        base.dead_letter_critical_threshold,
        0,
      )),
    ),
    dead_letter_warning_threshold: deadLetterWarning,
    inactivity_hours: Math.floor(parseNotificationAlertNumber(input?.inactivity_hours, base.inactivity_hours, 0)),
    min_attempts_24h: Math.floor(parseNotificationAlertNumber(input?.min_attempts_24h, base.min_attempts_24h, 0)),
    retrying_critical_threshold: Math.max(
      retryingWarning,
      Math.floor(parseNotificationAlertNumber(
        input?.retrying_critical_threshold,
        base.retrying_critical_threshold,
        0,
      )),
    ),
    retrying_warning_threshold: retryingWarning,
    success_rate_critical_threshold: criticalSuccessRate,
    success_rate_warning_threshold: warningSuccessRate,
  };
}

export const ACCESS_SCOPES = ["all", "bound"] as const;
export const API_TOKEN_PERMISSIONS = [
  "read:mail",
  "read:code",
  "read:attachment",
  "read:rule-result",
] as const;

export const ADMIN_ROLE_ORDER: AdminRole[] = [
  "owner",
  "platform_admin",
  "project_admin",
  "operator",
  "viewer",
];

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  operator: "执行成员",
  owner: "所有者",
  platform_admin: "平台管理员",
  project_admin: "项目管理员",
  viewer: "只读成员",
};

export function normalizeAdminRole(
  value: string | null | undefined,
  accessScope: AccessScope = "all",
): AdminRole | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "owner") return "owner";
  if (normalized === "platform_admin") return "platform_admin";
  if (normalized === "project_admin") return "project_admin";
  if (normalized === "operator") return "operator";
  if (normalized === "viewer") return "viewer";
  if (normalized === "admin") {
    return accessScope === "bound" ? "project_admin" : "platform_admin";
  }
  if (normalized === "analyst") return "viewer";
  return null;
}

export function isReadOnlyAdminRole(
  role: AdminRole | string | null | undefined,
  accessScope: AccessScope = "all",
) {
  return normalizeAdminRole(role, accessScope) === "viewer";
}

export function requiresGlobalAdminScope(
  role: AdminRole | string | null | undefined,
  accessScope: AccessScope = "all",
) {
  const normalized = normalizeAdminRole(role, accessScope);
  return normalized === "owner" || normalized === "platform_admin";
}

export function requiresBoundAdminScope(
  role: AdminRole | string | null | undefined,
  accessScope: AccessScope = "all",
) {
  return normalizeAdminRole(role, accessScope) === "project_admin";
}

export type AdminPermission =
  | "admins:read"
  | "admins:write"
  | "api_tokens:read"
  | "api_tokens:write"
  | "emails:delete"
  | "emails:read"
  | "emails:restore"
  | "emails:write"
  | "exports:read"
  | "mailboxes:read"
  | "mailboxes:write"
  | "notifications:read"
  | "notifications:write"
  | "outbound:read"
  | "outbound:write"
  | "rules:read"
  | "rules:test"
  | "rules:write"
  | "system:audit"
  | "system:errors"
  | "workspace:read"
  | "workspace:write"
  | "whitelist:read"
  | "whitelist:write";

export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  operator: [
    "emails:read",
    "emails:delete",
    "emails:restore",
    "emails:write",
    "exports:read",
    "mailboxes:read",
    "mailboxes:write",
    "notifications:read",
    "notifications:write",
    "outbound:read",
    "outbound:write",
    "rules:read",
    "rules:test",
    "rules:write",
    "whitelist:read",
    "whitelist:write",
    "workspace:read",
  ],
  owner: [
    "admins:read",
    "admins:write",
    "api_tokens:read",
    "api_tokens:write",
    "emails:read",
    "emails:delete",
    "emails:restore",
    "emails:write",
    "exports:read",
    "mailboxes:read",
    "mailboxes:write",
    "notifications:read",
    "notifications:write",
    "outbound:read",
    "outbound:write",
    "rules:read",
    "rules:test",
    "rules:write",
    "system:audit",
    "system:errors",
    "workspace:read",
    "workspace:write",
    "whitelist:read",
    "whitelist:write",
  ],
  platform_admin: [
    "admins:read",
    "admins:write",
    "api_tokens:read",
    "api_tokens:write",
    "emails:read",
    "emails:delete",
    "emails:restore",
    "emails:write",
    "exports:read",
    "mailboxes:read",
    "mailboxes:write",
    "notifications:read",
    "notifications:write",
    "outbound:read",
    "outbound:write",
    "rules:read",
    "rules:test",
    "rules:write",
    "system:audit",
    "system:errors",
    "workspace:read",
    "workspace:write",
    "whitelist:read",
    "whitelist:write",
  ],
  project_admin: [
    "admins:read",
    "admins:write",
    "api_tokens:read",
    "api_tokens:write",
    "emails:read",
    "emails:delete",
    "emails:restore",
    "emails:write",
    "exports:read",
    "mailboxes:read",
    "mailboxes:write",
    "notifications:read",
    "notifications:write",
    "outbound:read",
    "outbound:write",
    "rules:read",
    "rules:test",
    "rules:write",
    "workspace:read",
    "workspace:write",
    "whitelist:read",
    "whitelist:write",
  ],
  viewer: [
    "emails:read",
    "exports:read",
    "mailboxes:read",
    "notifications:read",
    "outbound:read",
    "rules:read",
    "rules:test",
    "workspace:read",
    "whitelist:read",
  ],
};

export function getAdminRolePermissions(
  role: AdminRole | string | null | undefined,
  accessScope: AccessScope = "all",
) {
  const normalized = normalizeAdminRole(role, accessScope);
  return normalized ? ROLE_PERMISSIONS[normalized] : [];
}

export function hasAdminPermission(
  role: AdminRole | string | null | undefined,
  permission: AdminPermission,
  accessScope: AccessScope = "all",
) {
  return getAdminRolePermissions(role, accessScope).includes(permission);
}
