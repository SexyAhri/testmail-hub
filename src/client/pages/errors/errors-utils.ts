import type { ErrorEventSummary } from "../../types";

export const EMPTY_SUMMARY: ErrorEventSummary = {
  admin_total: 0,
  auth_total: 0,
  latest_created_at: null,
  outbound_total: 0,
  recent_24h_total: 0,
  sync_total: 0,
  total: 0,
  unique_sources: 0,
};

const SOURCE_NAME_MAP: Record<string, string> = {
  "admin.create_failed": "管理员新增失败",
  "auth.login_failed": "登录失败",
  "auth.permission_denied": "权限拒绝",
  "mailbox.cloudflare_sync_failed": "邮箱同步 Cloudflare 失败",
  "outbound.resend_send_failed": "Resend 发信失败",
};

export function normalizeSearchValue(value: string | null) {
  const normalized = String(value || "").trim();
  return normalized || undefined;
}

export function getCurrentPage(value: string | null) {
  const page = Number.parseInt(value || "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function getSourceMeta(source: string) {
  if (source.startsWith("auth.")) return { color: "red", label: "鉴权" };
  if (source.startsWith("admin.")) return { color: "orange", label: "管理" };
  if (source.startsWith("mailbox.") || source.startsWith("cloudflare.")) return { color: "cyan", label: "邮箱同步" };
  if (source.startsWith("outbound.")) return { color: "purple", label: "发信" };
  if (source.startsWith("notification.")) return { color: "gold", label: "通知" };
  return { color: "default", label: "系统" };
}

export function formatSourceName(source: string) {
  if (SOURCE_NAME_MAP[source]) return SOURCE_NAME_MAP[source];
  return source
    .split(".")
    .map(part => part.replace(/_/g, " "))
    .join(" / ");
}

export function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

export function buildContextPreview(value: unknown) {
  const normalized = stringifyJson(value).replace(/\s+/g, " ").trim();
  if (!normalized || normalized === "{}" || normalized === "[]") return "无附加上下文";
  return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized;
}
