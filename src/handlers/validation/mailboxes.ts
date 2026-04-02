import {
  MAX_EMAIL_NOTE_LENGTH,
  MAX_MAILBOX_ADDRESS_LENGTH,
  MAX_MAILBOX_NOTE_LENGTH,
  MAX_MAILBOX_TAGS,
} from "../../utils/constants";
import {
  createRandomMailboxLocalPart,
  isValidEmailAddress,
  normalizeEmailAddress,
  normalizeTags,
} from "../../utils/utils";
import { parseNullableTimestamp, parseOptionalId } from "./shared";

export function validateEmailMetadataBody(body: Record<string, unknown>) {
  const note = String(body.note || "").trim();
  const tags = normalizeTags(body.tags);

  if (note.length > MAX_EMAIL_NOTE_LENGTH) {
    return { ok: false as const, error: "note is too long" };
  }

  return {
    ok: true as const,
    data: {
      note,
      tags,
    },
  };
}

export function validateMailboxBody(
  body: Record<string, unknown>,
  defaultDomain: string,
  allowBatch = true,
):
  | {
      data: Array<{
        address: string;
        expires_at: number | null;
        is_enabled: boolean;
        note: string;
        tags: string[];
      }>;
      ok: true;
      scope: {
        environment_id: number | null;
        mailbox_pool_id: number | null;
        project_id: number | null;
      };
    }
  | { error: string; ok: false } {
  const directAddress = normalizeEmailAddress(body.address);
  const localPart = String(body.local_part || "")
    .trim()
    .toLowerCase();
  const domain = String(body.domain || defaultDomain || "")
    .trim()
    .toLowerCase();
  const note = String(body.note || "").trim();
  const is_enabled = body.is_enabled !== false;
  const generateRandom = body.generate_random === true;
  const batch_count = allowBatch ? Number(body.batch_count || 1) : 1;
  const expires_at = parseNullableTimestamp(body.expires_at);
  const tags = normalizeTags(body.tags);
  const project_id = parseOptionalId(body.project_id);
  const environment_id = parseOptionalId(body.environment_id);
  const mailbox_pool_id = parseOptionalId(body.mailbox_pool_id);

  if (note.length > MAX_MAILBOX_NOTE_LENGTH) {
    return { ok: false, error: "note is too long" };
  }
  if (tags.length > MAX_MAILBOX_TAGS) {
    return { ok: false, error: "too many tags" };
  }
  if (!directAddress && !domain) {
    return { ok: false, error: "domain is required" };
  }

  const addresses: string[] = [];
  if (directAddress) {
    addresses.push(directAddress);
  } else {
    const count =
      Number.isFinite(batch_count) && batch_count > 0
        ? Math.min(50, Math.floor(batch_count))
        : 1;
    for (let index = 0; index < count; index += 1) {
      const finalLocalPart =
        localPart || (generateRandom ? createRandomMailboxLocalPart() : "");
      if (!finalLocalPart) {
        return { ok: false, error: "local_part is required" };
      }
      addresses.push(
        `${finalLocalPart}${count > 1 ? `-${index + 1}` : ""}@${domain}`,
      );
    }
  }

  const normalized = addresses.map((address) => normalizeEmailAddress(address));
  if (
    normalized.some((address) => address.length > MAX_MAILBOX_ADDRESS_LENGTH)
  ) {
    return { ok: false, error: "address is too long" };
  }
  if (normalized.some((address) => !isValidEmailAddress(address))) {
    return { ok: false, error: "address is invalid" };
  }

  return {
    ok: true,
    data: normalized.map((address) => ({
      address,
      expires_at,
      is_enabled,
      note,
      tags,
    })),
    scope: {
      environment_id,
      mailbox_pool_id,
      project_id,
    },
  };
}
