import PostalMime from "postal-mime";
import { getWhitelistSettings, loadRules, loadWhitelist, saveEmail } from "./db";
import {
  MAX_ATTACHMENT_STORAGE_BYTES,
  MAX_MATCH_CONTENT_CHARS,
  MAX_RULE_PATTERN_LENGTH,
  MAX_SENDER_PATTERN_LENGTH,
} from "../utils/constants";
import { base64ByteLength } from "../utils/utils";
import type { D1Database, EmailSavePayload, RuleMatch, WorkerEmailMessage } from "../server/types";

interface ParsedIncomingEmail extends EmailSavePayload {}

export interface ProcessedEmailResult {
  attachment_count: number;
  from: string;
  has_matches: boolean;
  message_id: string;
  received_at: number;
  subject: string;
  to: string[];
}

export async function processIncomingEmail(
  message: WorkerEmailMessage,
  db: D1Database,
): Promise<ProcessedEmailResult | null> {
  const parsed = await parseIncomingEmail(message);

  parsed.from = String(parsed.from || "").toLowerCase();
  parsed.to = Array.isArray(parsed.to) ? parsed.to.map(item => String(item || "").toLowerCase()) : [];

  const whitelistSettings = await getWhitelistSettings(db);
  if (whitelistSettings.enabled) {
    const whitelist = await loadWhitelist(db);
    if (!senderInWhitelist(parsed.from, whitelist.map(item => item.sender_pattern))) {
      return null;
    }
  }

  const rules = await loadRules(db);
  const content = parsed.text || parsed.html || "";
  const matches = applyRules(
    content,
    parsed.from,
    rules.map(rule => ({
      id: rule.id,
      pattern: rule.pattern,
      remark: rule.remark,
      sender_filter: rule.sender_filter,
    })),
  );

  const saved = await saveEmail(db, { ...parsed, matches });
  return {
    attachment_count: parsed.attachments.length,
    from: parsed.from,
    has_matches: matches.length > 0,
    message_id: saved.messageId,
    received_at: saved.receivedAt,
    subject: parsed.subject,
    to: parsed.to,
  };
}

export function testRules(
  sender: string,
  content: string,
  rules: Array<{ id: number; pattern: string; remark: string; sender_filter: string }>,
): { invalid_rules: number[]; matches: RuleMatch[] } {
  const invalid_rules: number[] = [];
  const matches: RuleMatch[] = [];
  const senderValue = String(sender || "").toLowerCase();
  const safeContent = String(content || "").slice(0, MAX_MATCH_CONTENT_CHARS);

  for (const rule of rules) {
    if (!senderMatches(senderValue, rule.sender_filter)) continue;
    const pattern = String(rule.pattern || "");
    if (!pattern || pattern.length > MAX_RULE_PATTERN_LENGTH) {
      invalid_rules.push(rule.id);
      continue;
    }
    try {
      const match = safeContent.match(new RegExp(pattern, "m"));
      if (match?.[0]) {
        matches.push({ rule_id: rule.id, value: match[0], remark: rule.remark || null });
      }
    } catch {
      invalid_rules.push(rule.id);
    }
  }

  return { invalid_rules, matches };
}

async function parseIncomingEmail(message: WorkerEmailMessage): Promise<ParsedIncomingEmail> {
  const rawBody =
    message.raw instanceof ReadableStream
      ? message.raw
      : message.raw instanceof ArrayBuffer
        ? message.raw
        : Uint8Array.from(message.raw).buffer;
  const rawBuffer = await new Response(rawBody).arrayBuffer();
  const parsed = await new PostalMime({ attachmentEncoding: "base64" }).parse(rawBuffer);
  const toList = Array.isArray(parsed.to) ? parsed.to : [];

  return {
    attachments: (parsed.attachments || []).map(attachment => {
      const content_base64 = typeof attachment.content === "string" ? attachment.content : "";
      const size_bytes = base64ByteLength(content_base64);
      return {
        content_base64: size_bytes <= MAX_ATTACHMENT_STORAGE_BYTES ? content_base64 : "",
        content_id: attachment.contentId || null,
        disposition: attachment.disposition || null,
        filename: attachment.filename || "attachment",
        is_stored: size_bytes <= MAX_ATTACHMENT_STORAGE_BYTES,
        mime_type: attachment.mimeType || "application/octet-stream",
        size_bytes,
      };
    }),
    from: parsed.from && "address" in parsed.from ? parsed.from.address || "" : "",
    headers: (parsed.headers || []).map(header => ({ key: header.key, value: header.value })),
    html: parsed.html || "",
    matches: [],
    subject: parsed.subject || "",
    text: parsed.text || "",
    to: toList
      .map(item => ("address" in item ? item.address : ""))
      .filter((item): item is string => Boolean(item)),
  };
}

function applyRules(
  content: string,
  sender: string,
  rules: Array<{ id: number; pattern: string; remark: string; sender_filter: string }>,
): RuleMatch[] {
  return testRules(sender, content, rules).matches;
}

function senderInWhitelist(sender: string, whitelist: string[]): boolean {
  if (whitelist.length === 0) return true;
  const senderValue = String(sender || "").toLowerCase();
  return whitelist.some(pattern => {
    if (!pattern || pattern.length > MAX_SENDER_PATTERN_LENGTH) return false;
    try {
      return new RegExp(pattern, "i").test(senderValue);
    } catch {
      return false;
    }
  });
}

function senderMatches(senderValue: string, filterValue: string): boolean {
  const filter = String(filterValue || "").trim();
  if (!filter) return true;
  const parts = filter.split(/[,\n]/).map(item => item.trim()).filter(Boolean);
  return parts.length === 0 || parts.some(pattern => {
    if (!pattern || pattern.length > MAX_SENDER_PATTERN_LENGTH) return false;
    try {
      return new RegExp(pattern, "i").test(senderValue);
    } catch {
      return false;
    }
  });
}
