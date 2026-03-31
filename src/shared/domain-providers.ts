export type DomainProviderKey = "cloudflare" | "manual";

export type DomainProviderCapability =
  | "status_read"
  | "mailbox_route_sync"
  | "catch_all_policy"
  | "catch_all_sync"
  | "routing_profile"
  | "zone_id"
  | "email_worker";

export interface DomainProviderDefinition {
  capabilities: DomainProviderCapability[];
  description: string;
  key: DomainProviderKey;
  label: string;
}

const DOMAIN_PROVIDERS: DomainProviderDefinition[] = [
  {
    capabilities: [
      "status_read",
      "mailbox_route_sync",
      "catch_all_policy",
      "catch_all_sync",
      "routing_profile",
      "zone_id",
      "email_worker",
    ],
    description: "适合托管在 Cloudflare Email Routing 的域名，支持路由观测、Catch-all 同步和路由策略。",
    key: "cloudflare",
    label: "Cloudflare Email Routing",
  },
  {
    capabilities: [],
    description: "适合已经在外部系统或人工方式完成收件路由的域名，仅做资产登记、工作空间绑定和邮件归属管理。",
    key: "manual",
    label: "手动 / 外部托管",
  },
];

export function listDomainProviders() {
  return DOMAIN_PROVIDERS.slice();
}

export function getDomainProviderDefinition(provider: string | null | undefined) {
  if (!provider) return null;
  return DOMAIN_PROVIDERS.find(item => item.key === provider) || null;
}

export function domainProviderSupports(
  provider: DomainProviderDefinition | string | null | undefined,
  capability: DomainProviderCapability,
) {
  const definition =
    typeof provider === "string"
      ? getDomainProviderDefinition(provider)
      : provider;
  return Boolean(definition?.capabilities.includes(capability));
}

export function getDomainProviderLabel(provider: string | null | undefined) {
  return getDomainProviderDefinition(provider)?.label || provider || "未知 Provider";
}
