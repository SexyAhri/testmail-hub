import {
  MAX_RULE_PATTERN_LENGTH,
  MAX_RULE_REMARK_LENGTH,
  MAX_SENDER_FILTER_LENGTH,
  MAX_SENDER_PATTERN_LENGTH,
} from "../../utils/constants";

export function validateRuleBody(body: Record<string, unknown>) {
  const remark = String(body.remark || "").trim();
  const sender_filter = String(body.sender_filter || "").trim();
  const pattern = String(body.pattern || "").trim();
  const is_enabled = body.is_enabled !== false;

  if (!pattern) return { ok: false as const, error: "pattern is required" };
  if (pattern.length > MAX_RULE_PATTERN_LENGTH) {
    return { ok: false as const, error: "pattern is too long" };
  }
  if (remark.length > MAX_RULE_REMARK_LENGTH) {
    return { ok: false as const, error: "remark is too long" };
  }
  if (sender_filter.length > MAX_SENDER_FILTER_LENGTH) {
    return { ok: false as const, error: "sender_filter is too long" };
  }

  return {
    ok: true as const,
    data: {
      is_enabled,
      pattern,
      remark,
      sender_filter,
    },
  };
}

export function validateWhitelistBody(body: Record<string, unknown>) {
  const sender_pattern = String(body.sender_pattern || "").trim();
  const note = String(body.note || "").trim();
  const is_enabled = body.is_enabled !== false;

  if (!sender_pattern) {
    return { ok: false as const, error: "sender_pattern is required" };
  }
  if (sender_pattern.length > MAX_SENDER_PATTERN_LENGTH) {
    return { ok: false as const, error: "sender_pattern is too long" };
  }
  if (note.length > MAX_RULE_REMARK_LENGTH) {
    return { ok: false as const, error: "note is too long" };
  }

  return {
    ok: true as const,
    data: {
      is_enabled,
      note,
      sender_pattern,
    },
  };
}
