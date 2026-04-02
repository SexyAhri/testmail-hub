import {
  MAX_RETENTION_HOURS,
  MAX_SCOPE_BINDINGS,
} from "../../utils/constants";
import type { AccessScope, AuthSession } from "../../server/types";
import { getActorProjectIds, isActorProjectScoped } from "../access-control";

export const PASSWORD_MIN_LENGTH = 8;
export const DOMAIN_MAX_LENGTH = 253;

const ACCESS_SCOPE_SET = new Set<string>(["all", "bound"]);

export const API_TOKEN_PERMISSION_SET = new Set<string>([
  "read:attachment",
  "read:code",
  "read:mail",
  "read:rule-result",
]);

export function parseOptionalId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

export function normalizeDomainValue(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");
}

export function isValidDomainValue(domain: string): boolean {
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,}$/i.test(
    domain,
  );
}

export function parseNullableTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}

export function parseProjectIdsInput(value: unknown): number[] {
  const parsed = Array.isArray(value)
    ? value.map((item) => parseOptionalId(item))
    : String(value || "")
        .split(/[,\n]/)
        .map((item) => parseOptionalId(item.trim()));

  return Array.from(
    new Set(
      parsed.filter(
        (item): item is number =>
          item !== null && Number.isFinite(item) && item > 0,
      ),
    ),
  );
}

export function parseNullableHours(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") {
    return { ok: true as const, value: null };
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { ok: false as const, error: `${field} must be a positive integer` };
  }
  if (parsed > MAX_RETENTION_HOURS) {
    return { ok: false as const, error: `${field} is too large` };
  }

  return { ok: true as const, value: parsed };
}

export function validateAccessScopeInput(
  body: Record<string, unknown>,
  actor: AuthSession | null,
  options: { allowGlobalScope: boolean },
) {
  const access_scope = String(body.access_scope || "all")
    .trim()
    .toLowerCase();
  const project_ids = parseProjectIdsInput(body.project_ids);

  if (!ACCESS_SCOPE_SET.has(access_scope)) {
    return { ok: false as const, error: "invalid access_scope" };
  }
  if (project_ids.length > MAX_SCOPE_BINDINGS) {
    return { ok: false as const, error: "too many project bindings" };
  }
  if (access_scope === "all") {
    if (!options.allowGlobalScope) {
      return {
        ok: false as const,
        error: "project-scoped resource must use bound access_scope",
      };
    }
    return {
      ok: true as const,
      data: {
        access_scope: "all" as AccessScope,
        project_ids: [],
      },
    };
  }

  if (project_ids.length === 0) {
    return {
      ok: false as const,
      error: "project_ids is required when access_scope is bound",
    };
  }

  if (actor && isActorProjectScoped(actor)) {
    const actorProjectIds = getActorProjectIds(actor);
    if (project_ids.some((projectId) => !actorProjectIds.includes(projectId))) {
      return {
        ok: false as const,
        error: "project binding is outside your scope",
      };
    }
  }

  return {
    ok: true as const,
    data: {
      access_scope: "bound" as AccessScope,
      project_ids,
    },
  };
}

export function normalizeNullable(value: string | null): string | null {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
}

export function normalizeExportResource(value: string) {
  const resource = String(value || "")
    .trim()
    .toLowerCase();
  if (
    [
      "emails",
      "trash",
      "rules",
      "whitelist",
      "mailboxes",
      "admins",
      "notifications",
      "audit",
    ].includes(resource)
  ) {
    return resource as
      | "admins"
      | "audit"
      | "emails"
      | "mailboxes"
      | "notifications"
      | "rules"
      | "trash"
      | "whitelist";
  }
  return null;
}
