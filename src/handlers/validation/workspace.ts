import {
  MAX_WORKSPACE_DESCRIPTION_LENGTH,
  MAX_WORKSPACE_NAME_LENGTH,
  MAX_WORKSPACE_SLUG_LENGTH,
} from "../../utils/constants";
import { slugifyIdentifier } from "../../utils/utils";
import { parseOptionalId } from "./shared";

export function validateProjectBody(body: Record<string, unknown>) {
  const name = String(body.name || "").trim();
  const slug = slugifyIdentifier(
    body.slug || body.name || "project",
    "project",
  ).slice(0, MAX_WORKSPACE_SLUG_LENGTH);
  const description = String(body.description || "").trim();
  const is_enabled = body.is_enabled !== false;

  if (!name) return { ok: false as const, error: "name is required" };
  if (name.length > MAX_WORKSPACE_NAME_LENGTH) {
    return { ok: false as const, error: "name is too long" };
  }
  if (!slug) return { ok: false as const, error: "slug is required" };
  if (slug.length > MAX_WORKSPACE_SLUG_LENGTH) {
    return { ok: false as const, error: "slug is too long" };
  }
  if (description.length > MAX_WORKSPACE_DESCRIPTION_LENGTH) {
    return { ok: false as const, error: "description is too long" };
  }

  return {
    ok: true as const,
    data: {
      description,
      is_enabled,
      name,
      slug,
    },
  };
}

export function validateEnvironmentBody(body: Record<string, unknown>) {
  const name = String(body.name || "").trim();
  const slug = slugifyIdentifier(
    body.slug || body.name || "environment",
    "environment",
  ).slice(0, MAX_WORKSPACE_SLUG_LENGTH);
  const description = String(body.description || "").trim();
  const project_id = parseOptionalId(body.project_id);
  const is_enabled = body.is_enabled !== false;

  if (!project_id) {
    return { ok: false as const, error: "project_id is required" };
  }
  if (!name) return { ok: false as const, error: "name is required" };
  if (name.length > MAX_WORKSPACE_NAME_LENGTH) {
    return { ok: false as const, error: "name is too long" };
  }
  if (!slug) return { ok: false as const, error: "slug is required" };
  if (slug.length > MAX_WORKSPACE_SLUG_LENGTH) {
    return { ok: false as const, error: "slug is too long" };
  }
  if (description.length > MAX_WORKSPACE_DESCRIPTION_LENGTH) {
    return { ok: false as const, error: "description is too long" };
  }

  return {
    ok: true as const,
    data: {
      description,
      is_enabled,
      name,
      project_id,
      slug,
    },
  };
}

export function validateMailboxPoolBody(body: Record<string, unknown>) {
  const name = String(body.name || "").trim();
  const slug = slugifyIdentifier(
    body.slug || body.name || "mailbox-pool",
    "mailbox-pool",
  ).slice(0, MAX_WORKSPACE_SLUG_LENGTH);
  const description = String(body.description || "").trim();
  const project_id = parseOptionalId(body.project_id);
  const environment_id = parseOptionalId(body.environment_id);
  const is_enabled = body.is_enabled !== false;

  if (!project_id) {
    return { ok: false as const, error: "project_id is required" };
  }
  if (!environment_id) {
    return { ok: false as const, error: "environment_id is required" };
  }
  if (!name) return { ok: false as const, error: "name is required" };
  if (name.length > MAX_WORKSPACE_NAME_LENGTH) {
    return { ok: false as const, error: "name is too long" };
  }
  if (!slug) return { ok: false as const, error: "slug is required" };
  if (slug.length > MAX_WORKSPACE_SLUG_LENGTH) {
    return { ok: false as const, error: "slug is too long" };
  }
  if (description.length > MAX_WORKSPACE_DESCRIPTION_LENGTH) {
    return { ok: false as const, error: "description is too long" };
  }

  return {
    ok: true as const,
    data: {
      description,
      environment_id,
      is_enabled,
      name,
      project_id,
      slug,
    },
  };
}
