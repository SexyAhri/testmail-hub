import {
  API_CORS_HEADERS,
  API_CORS_METHODS,
  EMAIL_PREVIEW_LENGTH,
  MAX_MAILBOX_TAG_LENGTH,
  MAX_MAILBOX_TAGS,
} from "./constants";
import type {
  EmailExtractionResult,
  ExportRow,
  ExtractedEmailLink,
  ExtractedLinkKind,
  JsonBodyResult,
  JsonValue,
  RuleMatch,
  RuleMatchInsight,
} from "../server/types";

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

export function slugifyIdentifier(value: unknown, fallback = "item"): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || fallback;
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
  /(?:验证码|校验码|动态码|确认码|提取码|安全码|短信码|登录码|認證碼|驗證碼|認証コード|ワンタイム|verification code|security code|passcode|one[-\s]?time code|otp|auth(?:entication)? code|login code|confirmation code)/i;

const CONTEXTUAL_CODE_PATTERNS = [
  /(?:验证码|校验码|动态码|确认码|提取码|安全码|短信码|登录码|認證碼|驗證碼|認証コード|ワンタイム|verification code|security code|passcode|one[-\s]?time code|otp|auth(?:entication)? code|login code|confirmation code)(?:\s*(?:is|are|:|：|为|是|=|-))*\s*([A-Z0-9][A-Z0-9\s-]{2,14}[A-Z0-9])/gi,
  /(?:code|otp|passcode)(?:\s*(?:is|are|:|：|=|-))*\s*([A-Z0-9][A-Z0-9\s-]{2,14}[A-Z0-9])/gi,
];

const GENERIC_CONTEXT_CODE_PATTERN = /\b[A-Z0-9][A-Z0-9\s-]{2,14}[A-Z0-9]\b/gi;
const GENERIC_NUMERIC_CODE_PATTERN = /\b\d{4,8}\b/g;
const GENERIC_ALPHA_NUMERIC_CODE_PATTERN = /\b[A-Z0-9]{4,10}\b/gi;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;
const HREF_PATTERN = /href\s*=\s*["']([^"']+)["']/gi;
const SCOREABLE_LINK_PATTERN = /(?:token|code|otp|auth|login|signin|verify|confirm|activate|reset|invite|magic|session|password)/i;

type EmailExtractionInput = {
  fromAddress?: unknown;
  htmlBody?: unknown;
  preview?: unknown;
  results?: RuleMatch[];
  subject?: unknown;
  textBody?: unknown;
};

const LINK_CLASSIFIERS: Array<{ kind: ExtractedLinkKind; label: string; patterns: RegExp[]; score: number }> = [
  {
    kind: "verification",
    label: "验证链接",
    patterns: [/verify/i, /verification/i, /confirm/i, /activate/i, /validate/i, /验证码/i, /校验/i, /确认/i, /激活/i],
    score: 78,
  },
  {
    kind: "magic_link",
    label: "魔法链接",
    patterns: [/magic/i, /passwordless/i, /one[-\s]?tap/i, /instant login/i, /直接登录/i, /免密/i],
    score: 76,
  },
  {
    kind: "login",
    label: "登录链接",
    patterns: [/login/i, /log[-\s]?in/i, /signin/i, /sign[-\s]?in/i, /oauth/i, /authorize/i, /approve/i, /continue/i, /登录/i, /登入/i],
    score: 68,
  },
  {
    kind: "reset_password",
    label: "重置密码",
    patterns: [/reset/i, /password/i, /recover/i, /forgot/i, /重置/i, /找回/i, /修改密码/i],
    score: 72,
  },
  {
    kind: "invitation",
    label: "邀请链接",
    patterns: [/invite/i, /invitation/i, /join/i, /workspace/i, /团队邀请/i, /加入/i],
    score: 58,
  },
  {
    kind: "action",
    label: "操作链接",
    patterns: [/review/i, /open/i, /view/i, /manage/i, /track/i, /查看/i, /打开/i, /处理/i],
    score: 42,
  },
];

const PLATFORM_MATCHERS: Array<{ domains: string[]; keywords: RegExp[]; label: string; slug: string }> = [
  { slug: "github", label: "GitHub", domains: ["github.com"], keywords: [/github/i, /copilot/i] },
  { slug: "google", label: "Google", domains: ["google.com", "googlemail.com", "gmail.com"], keywords: [/google/i, /gmail/i] },
  { slug: "apple", label: "Apple", domains: ["apple.com", "icloud.com"], keywords: [/apple/i, /icloud/i, /apple id/i] },
  { slug: "paypal", label: "PayPal", domains: ["paypal.com"], keywords: [/paypal/i] },
  { slug: "steam", label: "Steam", domains: ["steampowered.com", "steamcommunity.com"], keywords: [/steam/i, /steampowered/i] },
  { slug: "discord", label: "Discord", domains: ["discord.com", "discordapp.com"], keywords: [/discord/i] },
  { slug: "microsoft", label: "Microsoft", domains: ["microsoft.com", "live.com", "outlook.com"], keywords: [/microsoft/i, /outlook/i, /live\.com/i] },
  { slug: "amazon", label: "Amazon", domains: ["amazon.com", "amazonaws.com"], keywords: [/amazon/i, /aws/i] },
  { slug: "notion", label: "Notion", domains: ["notion.so", "notion.com"], keywords: [/notion/i] },
  { slug: "slack", label: "Slack", domains: ["slack.com"], keywords: [/slack/i] },
  { slug: "openai", label: "OpenAI", domains: ["openai.com"], keywords: [/openai/i, /chatgpt/i] },
  { slug: "figma", label: "Figma", domains: ["figma.com"], keywords: [/figma/i] },
  { slug: "dropbox", label: "Dropbox", domains: ["dropbox.com"], keywords: [/dropbox/i] },
  { slug: "linkedin", label: "LinkedIn", domains: ["linkedin.com"], keywords: [/linkedin/i] },
  { slug: "meta", label: "Meta", domains: ["facebookmail.com", "meta.com", "facebook.com"], keywords: [/facebook/i, /meta/i, /instagram/i] },
  { slug: "x", label: "X", domains: ["x.com", "twitter.com"], keywords: [/twitter/i, /x\.com/i] },
  { slug: "telegram", label: "Telegram", domains: ["telegram.org", "t.me"], keywords: [/telegram/i] },
];

function cloneRegExp(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags);
}

function decodeHtmlEntities(value: string): string {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function cleanExtractedUrl(value: string): string {
  return decodeHtmlEntities(String(value || ""))
    .trim()
    .replace(/[),.;!?]+$/g, "");
}

function isLikelyAssetUrl(url: string): boolean {
  return /\.(?:png|jpe?g|gif|svg|webp|ico|css|js|woff2?|ttf|map)(?:$|\?)/i.test(url);
}

function normalizeVerificationCodeCandidate(value: unknown): string | null {
  let compact = String(value || "")
    .trim()
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")
    .replace(/[\s-]+/g, "");

  if (/^IS\d{4,8}$/i.test(compact)) {
    compact = compact.slice(2);
  }

  const canonical = compact.toUpperCase();
  if (!/^[A-Z0-9]{4,10}$/.test(canonical)) return null;
  if (!/\d/.test(canonical)) return null;
  if (/^(19|20)\d{2}$/.test(canonical)) return null;

  return compact;
}

function addVerificationCandidate(candidates: Map<string, number>, value: unknown, score: number): void {
  const code = normalizeVerificationCodeCandidate(value);
  if (!code) return;

  const normalizedScore =
    score
    + (/[A-Za-z]/.test(code) && /\d/.test(code) ? 8 : 0)
    + (/^\d{6}$/.test(code) ? 6 : 0)
    + (code.length >= 5 && code.length <= 8 ? 4 : 0);

  candidates.set(code, Math.max(candidates.get(code) || 0, normalizedScore));
}

function selectVerificationCandidate(candidates: Map<string, number>): string | null {
  return Array.from(candidates.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];

      const leftMixed = /[A-Za-z]/.test(left[0]) && /\d/.test(left[0]);
      const rightMixed = /[A-Za-z]/.test(right[0]) && /\d/.test(right[0]);
      if (leftMixed !== rightMixed) return rightMixed ? 1 : -1;

      const leftPreferredLength = Math.abs(left[0].length - 6);
      const rightPreferredLength = Math.abs(right[0].length - 6);
      if (leftPreferredLength !== rightPreferredLength) return leftPreferredLength - rightPreferredLength;

      return left[0].localeCompare(right[0]);
    })
    .at(0)?.[0] || null;
}

function collectVerificationCandidatesFromMatches(matches: RuleMatch[] = []): Map<string, number> {
  const candidates = new Map<string, number>();
  for (const item of matches) {
    addVerificationCandidate(
      candidates,
      item.value,
      VERIFICATION_KEYWORD_PATTERN.test(String(item.remark || "")) ? 92 : 56,
    );
  }
  return candidates;
}

function collectVerificationCandidatesFromSources(sources: string[]): Map<string, number> {
  const candidates = new Map<string, number>();

  for (const [sourceIndex, source] of sources.entries()) {
    const sourceScoreBoost = sourceIndex === 0 ? 6 : sourceIndex === 1 ? 12 : 0;

    for (const pattern of CONTEXTUAL_CODE_PATTERNS) {
      for (const match of source.matchAll(cloneRegExp(pattern))) {
        addVerificationCandidate(candidates, match[1], 86 + sourceScoreBoost);
      }
    }

    const segments = String(source || "")
      .split(/[\r\n]+|[。！？!?]+/)
      .map(item => item.trim())
      .filter(Boolean);

    for (const segment of segments) {
      if (!VERIFICATION_KEYWORD_PATTERN.test(segment)) continue;

      for (const candidate of segment.matchAll(cloneRegExp(GENERIC_CONTEXT_CODE_PATTERN))) {
        addVerificationCandidate(candidates, candidate[0], 74 + sourceScoreBoost);
      }

      for (const numericCandidate of segment.matchAll(cloneRegExp(GENERIC_NUMERIC_CODE_PATTERN))) {
        addVerificationCandidate(candidates, numericCandidate[0], 64 + sourceScoreBoost);
      }
    }
  }

  if (!sources.some(source => VERIFICATION_KEYWORD_PATTERN.test(source))) {
    return candidates;
  }

  for (const source of sources) {
    for (const candidate of source.matchAll(cloneRegExp(GENERIC_NUMERIC_CODE_PATTERN))) {
      addVerificationCandidate(candidates, candidate[0], 40);
    }
    for (const candidate of source.matchAll(cloneRegExp(GENERIC_ALPHA_NUMERIC_CODE_PATTERN))) {
      addVerificationCandidate(candidates, candidate[0], 34);
    }
  }

  return candidates;
}

function extractRelevantLinks(input: EmailExtractionInput): ExtractedEmailLink[] {
  const candidates = new Map<string, string[]>();
  const textSources = [
    String(input.subject || ""),
    String(input.textBody || ""),
    String(input.preview || ""),
    stripHtml(String(input.htmlBody || "")),
  ].filter(Boolean);

  const addLinkCandidate = (rawUrl: string, context: string) => {
    const url = cleanExtractedUrl(rawUrl);
    if (!/^https?:\/\//i.test(url) || isLikelyAssetUrl(url)) return;
    const contexts = candidates.get(url) || [];
    if (context) contexts.push(context);
    candidates.set(url, contexts);
  };

  for (const source of textSources) {
    for (const match of source.matchAll(cloneRegExp(URL_PATTERN))) {
      const rawUrl = match[0];
      const index = match.index || 0;
      addLinkCandidate(rawUrl, source.slice(Math.max(0, index - 120), Math.min(source.length, index + rawUrl.length + 120)));
    }
  }

  const htmlBody = String(input.htmlBody || "");
  for (const match of htmlBody.matchAll(cloneRegExp(HREF_PATTERN))) {
    const rawUrl = String(match[1] || "");
    const index = match.index || 0;
    addLinkCandidate(rawUrl, htmlBody.slice(Math.max(0, index - 140), Math.min(htmlBody.length, index + rawUrl.length + 180)));
  }

  const links = Array.from(candidates.entries())
    .map(([url, contexts]) => {
      let host = "";
      try {
        host = new URL(url).host.replace(/^www\./i, "").toLowerCase();
      } catch {
        return null;
      }

      const urlSignal = url;
      const contextSignal = contexts.join("\n");
      const signal = `${urlSignal}\n${contextSignal}`;
      let bestKind: ExtractedLinkKind = "other";
      let bestLabel = "普通链接";
      let bestScore = SCOREABLE_LINK_PATTERN.test(signal) ? 26 : 0;

      for (const classifier of LINK_CLASSIFIERS) {
        const urlMatched = classifier.patterns.some(pattern => pattern.test(urlSignal));
        const contextMatched = classifier.patterns.some(pattern => pattern.test(contextSignal));
        if (!urlMatched && !contextMatched) continue;

        const keywordBoost = /[?&](?:token|code|otp|auth|magic|session)=/i.test(url) ? 10 : 0;
        const magicContextBoost =
          classifier.kind === "magic_link" && /(?:magic|passwordless|one[-\s]?tap|直接登录|免密)/i.test(contextSignal)
            ? 24
            : 0;
        const score =
          classifier.score + keywordBoost + magicContextBoost + (urlMatched ? 14 : 0) + (contextMatched ? 4 : 0);
        if (score > bestScore) {
          bestKind = classifier.kind;
          bestLabel = classifier.label;
          bestScore = score;
        }
      }

      return {
        host,
        kind: bestKind,
        label: bestLabel,
        score: bestScore,
        url,
      } satisfies ExtractedEmailLink;
    })
    .filter((item): item is ExtractedEmailLink => Boolean(item));

  const filtered = links.filter(link => link.score > 0);
  const finalLinks = filtered.length > 0 ? filtered : links.slice(0, 1).map(link => ({ ...link, score: 1 }));

  return finalLinks
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url))
    .slice(0, 6);
}

function detectPlatform(
  input: EmailExtractionInput,
  links: ExtractedEmailLink[],
): Pick<EmailExtractionResult, "platform" | "platform_slug"> {
  const fromAddress = normalizeEmailAddress(input.fromAddress);
  const fromDomain = fromAddress.includes("@") ? fromAddress.split("@").pop() || "" : "";
  const keywordSource = [
    String(input.subject || ""),
    String(input.textBody || ""),
    stripHtml(String(input.htmlBody || "")),
  ].join("\n");

  let bestMatch: { label: string; score: number; slug: string } | null = null;

  for (const matcher of PLATFORM_MATCHERS) {
    let score = 0;

    if (matcher.domains.some(domain => fromDomain === domain || fromDomain.endsWith(`.${domain}`))) {
      score += 92;
    }

    for (const domain of matcher.domains) {
      if (links.some(link => link.host === domain || link.host.endsWith(`.${domain}`))) {
        score += 48;
      }
    }

    if (matcher.keywords.some(pattern => pattern.test(keywordSource))) {
      score += 22;
    }

    if (!score) continue;
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { label: matcher.label, score, slug: matcher.slug };
    }
  }

  return {
    platform: bestMatch?.label || null,
    platform_slug: bestMatch?.slug || null,
  };
}

export function extractEmailExtraction(input: EmailExtractionInput): EmailExtractionResult {
  const sources = [
    String(input.subject || ""),
    String(input.textBody || ""),
    stripHtml(String(input.htmlBody || "")),
    String(input.preview || ""),
  ].filter(Boolean);

  const verificationCandidates = collectVerificationCandidatesFromMatches(input.results || []);
  for (const [code, score] of collectVerificationCandidatesFromSources(sources)) {
    verificationCandidates.set(code, Math.max(verificationCandidates.get(code) || 0, score));
  }

  const verification_code = selectVerificationCandidate(verificationCandidates);
  const links = extractRelevantLinks(input);
  const { platform, platform_slug } = detectPlatform(input, links);

  return {
    links,
    platform,
    platform_slug,
    primary_link: links[0] || null,
    verification_code,
  };
}

export function extractVerificationCode(input: EmailExtractionInput): string | null {
  return extractEmailExtraction(input).verification_code;
}

function toConfidenceLabel(score: number): RuleMatchInsight["confidence_label"] {
  if (score >= 85) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function normalizeCompareValue(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function mapLinkKindToInsightType(kind: ExtractedLinkKind): RuleMatchInsight["match_type"] {
  if (kind === "magic_link") return "magic_link";
  if (kind === "login") return "login_link";
  if (kind === "reset_password") return "reset_link";
  if (kind === "verification") return "verification_hint";
  return "generic";
}

export function buildRuleMatchInsights(
  matches: RuleMatch[] = [],
  extraction: EmailExtractionResult,
): RuleMatchInsight[] {
  const finalVerificationCode = normalizeCompareValue(extraction.verification_code);

  return matches.map(match => {
    const remark = String(match.remark || "");
    const value = String(match.value || "");
    const signal = `${remark}\n${value}`;
    const normalizedValue = normalizeCompareValue(value);
    const normalizedCodeCandidate = normalizeCompareValue(normalizeVerificationCodeCandidate(value));
    const linkedItem = extraction.links.find(link =>
      normalizedValue
      && (
        normalizeCompareValue(link.url).includes(normalizedValue)
        || normalizedValue.includes(normalizeCompareValue(link.host))
      )
    );

    let match_type: RuleMatchInsight["match_type"] = "generic";
    let confidence = 56;
    let reason = "规则命中了邮件正文中的普通文本片段";

    if (finalVerificationCode && normalizedCodeCandidate && normalizedCodeCandidate === finalVerificationCode) {
      match_type = "verification_code";
      confidence = 96;
      reason = "命中内容与系统提取出的最终验证码一致";
    } else if (linkedItem) {
      match_type = mapLinkKindToInsightType(linkedItem.kind);
      confidence = Math.max(72, Math.min(94, linkedItem.score + 6));
      reason = `命中内容与识别出的${linkedItem.label}特征一致`;
    } else if (VERIFICATION_KEYWORD_PATTERN.test(signal)) {
      match_type = "verification_hint";
      confidence = 78;
      reason = "规则命中了验证码相关关键词或上下文";
    } else if (
      extraction.platform
      && normalizeCompareValue(signal).includes(normalizeCompareValue(extraction.platform))
    ) {
      match_type = "platform_signal";
      confidence = 72;
      reason = `命中内容与识别平台 ${extraction.platform} 的特征一致`;
    }

    return {
      confidence,
      confidence_label: toConfidenceLabel(confidence),
      match_type,
      reason,
      source: { ...match },
    };
  });
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

export function parseArchivedFilter(
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
