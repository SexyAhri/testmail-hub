import {
  API_CORS_HEADERS,
  API_CORS_METHODS,
  EMAIL_PREVIEW_LENGTH,
  MAX_MAILBOX_TAG_LENGTH,
  MAX_MAILBOX_TAGS,
} from "./constants";
import type { ExportRow, JsonBodyResult, JsonValue, RuleMatch } from "../server/types";

export function clampPage(value: string | null | undefined): number {
  const page = Number(value);
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

export function clampNumber(
  value: string | null | undefined,
  options: { max?: number; min?: number } = {},
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;

  if (options.min !== undefined && parsed < options.min) return options.min;
  if (options.max !== undefined && parsed > options.max) return options.max;
  return parsed;
}

export function safeParseJson<T = JsonValue>(value: unknown, fallback: T | null = null): T | null {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function readJsonBody<T>(request: Request): Promise<JsonBodyResult<T>> {
  try {
    return { ok: true, data: (await request.json()) as T };
  } catch {
    return { ok: false, error: "invalid JSON body" };
  }
}

export function applyCors(response: Response, corsHeaders: Record<string, string>): Response {
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

export function json<T>(data: T, status = 200): Response {
  return Response.json({ code: status, data }, { status });
}

export function jsonError(message: string, status = 400, detail?: JsonValue): Response {
  return Response.json({ code: status, message, detail }, { status });
}

export function normalizeEmailAddress(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function isValidEmailAddress(value: unknown): boolean {
  const address = normalizeEmailAddress(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
}

export function createRandomMailboxLocalPart(length = 10): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  let output = "";
  for (const value of randomValues) output += chars[value % chars.length];
  return output;
}

export function normalizeTags(value: unknown): string[] {
  const rawItems = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[,\n]/)
        .map(item => item.trim())
        .filter(Boolean);

  return Array.from(
    new Set(
      rawItems
        .map(item => String(item).trim().toLowerCase())
        .filter(Boolean)
        .map(item => item.slice(0, MAX_MAILBOX_TAG_LENGTH)),
    ),
  ).slice(0, MAX_MAILBOX_TAGS);
}

export function buildEmailPreview(textBody: unknown, htmlBody: unknown): string {
  const text = String(textBody || "").trim();
  const fallback = stripHtml(String(htmlBody || "")).trim();
  const source = text || fallback;
  if (!source) return "";
  return source.replace(/\s+/g, " ").slice(0, EMAIL_PREVIEW_LENGTH);
}

export function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ");
}

const VERIFICATION_KEYWORD_PATTERN =
  /(?:\u9a8c\u8bc1\u7801|\u6821\u9a8c\u7801|\u52a8\u6001\u7801|\u786e\u8ba4\u7801|\u63d0\u53d6\u7801|verification code|security code|passcode|one[-\s]?time code|otp|auth code|login code)/i;

const CONTEXTUAL_CODE_PATTERNS = [
  /(?:\u9a8c\u8bc1\u7801|\u6821\u9a8c\u7801|\u52a8\u6001\u7801|\u786e\u8ba4\u7801|\u63d0\u53d6\u7801|verification code|security code|passcode|one[-\s]?time code|otp|auth code|login code)(?:\s*(?:is|:|\uff1a|\u4e3a|\u662f|=|-))*\s*([A-Z0-9][A-Z0-9\s-]{2,12}[A-Z0-9])/i,
  /(?:code|otp)(?:\s*(?:is|:|\uff1a|=|-))*\s*([A-Z0-9][A-Z0-9\s-]{2,12}[A-Z0-9])/i,
];

const GENERIC_CONTEXT_CODE_PATTERN = /[A-Z0-9][A-Z0-9\s-]{2,12}[A-Z0-9]/gi;

function normalizeVerificationCodeCandidate(value: unknown): string | null {
  let compact = String(value || "")
    .trim()
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")
    .replace(/[\s-]+/g, "");

  if (/^IS\d{4,8}$/i.test(compact)) {
    compact = compact.slice(2);
  }

  const canonical = compact.toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(canonical)) return null;
  if (!/\d/.test(canonical)) return null;
  if (/^(19|20)\d{2}$/.test(canonical)) return null;

  return compact;
}

function uniqueVerificationCodes(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function chooseVerificationCodeCandidate(candidates: string[]): string | null {
  if (candidates.length === 0) return null;

  const mixed = candidates.find(item => /[A-Za-z]/.test(item) && /\d/.test(item));
  if (mixed) return mixed;

  const numeric = candidates.find(item => /^\d{4,8}$/.test(item));
  if (numeric) return numeric;

  return candidates[0] || null;
}

function extractVerificationCodeFromMatches(matches: RuleMatch[] = []): string | null {
  const prioritized = uniqueVerificationCodes(
    matches
      .filter(item => VERIFICATION_KEYWORD_PATTERN.test(String(item.remark || "")))
      .map(item => normalizeVerificationCodeCandidate(item.value)),
  );

  const prioritizedNumeric = prioritized.filter(item => /^\d{4,8}$/.test(item));
  if (prioritizedNumeric.length > 0) return prioritizedNumeric[0];
  if (prioritized.length === 1) return prioritized[0];

  const generic = uniqueVerificationCodes(matches.map(item => normalizeVerificationCodeCandidate(item.value)));
  const genericNumeric = generic.filter(item => /^\d{4,8}$/.test(item));
  if (genericNumeric.length === 1) return genericNumeric[0];
  if (generic.length === 1) return generic[0];

  return null;
}

function extractVerificationCodeFromKeywordSegments(sources: string[]): string | null {
  for (const source of sources) {
    const segments = String(source || "")
      .split(/[\r\n]+|[。！？!?]+/)
      .map(item => item.trim())
      .filter(Boolean);

    for (const segment of segments) {
      if (!VERIFICATION_KEYWORD_PATTERN.test(segment)) continue;

      for (const pattern of CONTEXTUAL_CODE_PATTERNS) {
        const matched = normalizeVerificationCodeCandidate(segment.match(pattern)?.[1]);
        if (matched) return matched;
      }

      const candidates = uniqueVerificationCodes(
        (segment.match(GENERIC_CONTEXT_CODE_PATTERN) || []).map(candidate => normalizeVerificationCodeCandidate(candidate)),
      );
      const selected = chooseVerificationCodeCandidate(candidates);
      if (selected) return selected;
    }
  }

  return null;
}

export function extractVerificationCode(input: {
  htmlBody?: unknown;
  preview?: unknown;
  results?: RuleMatch[];
  subject?: unknown;
  textBody?: unknown;
}): string | null {
  const byMatches = extractVerificationCodeFromMatches(input.results || []);
  if (byMatches) return byMatches;

  const sources = [
    String(input.subject || ""),
    String(input.textBody || ""),
    stripHtml(String(input.htmlBody || "")),
    String(input.preview || ""),
  ].filter(Boolean);

  const byKeywordSegments = extractVerificationCodeFromKeywordSegments(sources);
  if (byKeywordSegments) return byKeywordSegments;

  for (const source of sources) {
    for (const pattern of CONTEXTUAL_CODE_PATTERNS) {
      const matched = normalizeVerificationCodeCandidate(source.match(pattern)?.[1]);
      if (matched) return matched;
    }
  }

  const hasKeyword = sources.some(source => VERIFICATION_KEYWORD_PATTERN.test(source));
  if (!hasKeyword) return null;

  const numericCandidates = uniqueVerificationCodes(
    sources.flatMap(source =>
      (source.match(/\b\d{4,8}\b/g) || []).map(candidate => normalizeVerificationCodeCandidate(candidate)),
    ),
  );
  if (numericCandidates.length === 1) return numericCandidates[0];

  const mixedCandidates = uniqueVerificationCodes(
    sources.flatMap(source =>
      (source.match(/\b[A-Z0-9]{4,8}\b/gi) || []).map(candidate => normalizeVerificationCodeCandidate(candidate)),
    ),
  );
  if (mixedCandidates.length === 1) return mixedCandidates[0];

  return null;
}

export function getCorsHeaders(
  request: Request,
  allowedOriginsValue: string | undefined,
): { allowed: boolean; headers: Record<string, string> } {
  const requestUrl = new URL(request.url);
  const requestOrigin = requestUrl.origin;
  const origin = request.headers.get("Origin");
  const allowedOrigins = new Set(
    String(allowedOriginsValue || "")
      .split(",")
      .map(item => item.trim())
      .filter(Boolean),
  );

  allowedOrigins.add(requestOrigin);

  if (!origin) {
    return { allowed: true, headers: { Vary: "Origin" } };
  }

  if (!allowedOrigins.has(origin)) {
    return { allowed: false, headers: { Vary: "Origin" } };
  }

  return {
    allowed: true,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": API_CORS_METHODS,
      "Access-Control-Allow-Headers": API_CORS_HEADERS,
      Vary: "Origin",
    },
  };
}

export function maybeBoolean(value: string | null | undefined): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (["1", "true", "yes"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no"].includes(value.toLowerCase())) return false;
  return null;
}

export function parseDeletedFilter(
  value: string | null | undefined,
): "exclude" | "include" | "only" {
  if (value === "only" || value === "include") return value;
  return "exclude";
}

export function base64ByteLength(base64Value: string): number {
  const normalized = String(base64Value || "");
  if (!normalized) return 0;
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

export function escapeCsvCell(value: JsonValue): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value) || typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export function toCsv(rows: ExportRow[]): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    new Set(rows.flatMap(row => Object.keys(row))),
  );
  const lines = [
    headers.join(","),
    ...rows.map(row =>
      headers
        .map(header => {
          const cell = escapeCsvCell(row[header] ?? null).replace(/"/g, '""');
          return `"${cell}"`;
        })
        .join(","),
    ),
  ];
  return lines.join("\n");
}

export function downloadResponse(
  body: string,
  filename: string,
  contentType: string,
): Response {
  return new Response(body, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": contentType,
    },
  });
}

export function binaryResponse(
  bytes: Uint8Array,
  options: { contentDisposition: string; contentType: string },
): Response {
  const payload = Uint8Array.from(bytes).buffer;
  return new Response(payload, {
    headers: {
      "Content-Disposition": options.contentDisposition,
      "Content-Type": options.contentType,
    },
  });
}

export function decodeBase64(base64Value: string): Uint8Array {
  const raw = atob(base64Value);
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

export function encodeBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeBase64Url(value: string): Uint8Array {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const raw = atob(normalized + padding);
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

export function jsonStringify(value: JsonValue, fallback = "{}"): string {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

export function isSqliteSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /no such table|no such column/i.test(message);
}

export function isSqliteConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /sqlite_constraint|constraint failed|unique constraint/i.test(message);
}
