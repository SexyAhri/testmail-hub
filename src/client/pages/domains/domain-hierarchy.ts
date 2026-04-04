export type DomainHierarchyKind = "nested_subdomain" | "root" | "subdomain";

export interface DomainHierarchyEntry {
  childDomains: string[];
  depth: number;
  directChildCount: number;
  domain: string;
  kind: DomainHierarchyKind;
  lineage: string[];
  parentDomain: string | null;
  rootDomain: string;
  totalDescendantCount: number;
}

export interface DomainHierarchySummary {
  largestGroupRootDomain: string | null;
  largestGroupSize: number;
  maxDepth: number;
  nestedSubdomainCount: number;
  rootDomainCount: number;
  subdomainCount: number;
}

const DOMAIN_LINEAGE_SORT_SEPARATOR = "、";

function normalizeDomain(domain: string | null | undefined) {
  return String(domain || "").trim().toLowerCase();
}

function findNearestRegisteredParent(domain: string, domainSet: Set<string>) {
  const labels = domain.split(".");

  for (let index = 1; index < labels.length - 1; index += 1) {
    const candidate = labels.slice(index).join(".");
    if (domainSet.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

function buildFallbackEntry(domain: string): DomainHierarchyEntry {
  return {
    childDomains: [],
    depth: 0,
    directChildCount: 0,
    domain,
    kind: "root",
    lineage: [domain],
    parentDomain: null,
    rootDomain: domain,
    totalDescendantCount: 0,
  };
}

function getHierarchyEntry(domain: string, hierarchyMap: Map<string, DomainHierarchyEntry>) {
  const normalized = normalizeDomain(domain);
  return hierarchyMap.get(normalized) || buildFallbackEntry(normalized);
}

export function buildDomainHierarchyMap(domains: Iterable<string>) {
  const normalizedDomains = Array.from(
    new Set(
      Array.from(domains)
        .map(domain => normalizeDomain(domain))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const domainSet = new Set(normalizedDomains);
  const resolvedEntries = new Map<string, DomainHierarchyEntry>();

  const resolveEntry = (domain: string): DomainHierarchyEntry => {
    const cached = resolvedEntries.get(domain);
    if (cached) return cached;

    const parentDomain = findNearestRegisteredParent(domain, domainSet);
    const parentEntry = parentDomain ? resolveEntry(parentDomain) : null;
    const depth = parentEntry ? parentEntry.depth + 1 : 0;
    const rootDomain = parentEntry ? parentEntry.rootDomain : domain;
    const lineage = parentEntry ? [...parentEntry.lineage, domain] : [domain];
    const entry: DomainHierarchyEntry = {
      childDomains: [],
      depth,
      directChildCount: 0,
      domain,
      kind: depth <= 0 ? "root" : depth === 1 ? "subdomain" : "nested_subdomain",
      lineage,
      parentDomain,
      rootDomain,
      totalDescendantCount: 0,
    };

    resolvedEntries.set(domain, entry);
    return entry;
  };

  for (const domain of normalizedDomains) {
    resolveEntry(domain);
  }

  for (const entry of resolvedEntries.values()) {
    if (!entry.parentDomain) continue;

    const parentEntry = resolvedEntries.get(entry.parentDomain);
    if (!parentEntry) continue;
    parentEntry.childDomains.push(entry.domain);
  }

  const countDescendants = (domain: string): number => {
    const entry = resolvedEntries.get(domain);
    if (!entry) return 0;

    entry.childDomains.sort((left, right) => left.localeCompare(right));
    entry.directChildCount = entry.childDomains.length;
    entry.totalDescendantCount = entry.childDomains.reduce(
      (total, childDomain) => total + 1 + countDescendants(childDomain),
      0,
    );
    return entry.totalDescendantCount;
  };

  for (const entry of resolvedEntries.values()) {
    if (!entry.parentDomain) {
      countDescendants(entry.domain);
    }
  }

  return resolvedEntries;
}

export function buildDomainHierarchySummary(hierarchyMap: Map<string, DomainHierarchyEntry>): DomainHierarchySummary {
  const rootDomainCounts = new Map<string, number>();
  let maxDepth = 0;
  let subdomainCount = 0;
  let nestedSubdomainCount = 0;
  let rootDomainCount = 0;

  for (const entry of hierarchyMap.values()) {
    rootDomainCounts.set(entry.rootDomain, (rootDomainCounts.get(entry.rootDomain) || 0) + 1);
    maxDepth = Math.max(maxDepth, entry.depth);

    if (entry.depth === 0) {
      rootDomainCount += 1;
    } else {
      subdomainCount += 1;
      if (entry.depth > 1) {
        nestedSubdomainCount += 1;
      }
    }
  }

  let largestGroupRootDomain: string | null = null;
  let largestGroupSize = 0;

  for (const [rootDomain, count] of rootDomainCounts.entries()) {
    if (
      count > largestGroupSize
      || (count === largestGroupSize && largestGroupRootDomain && rootDomain.localeCompare(largestGroupRootDomain) < 0)
      || (count === largestGroupSize && !largestGroupRootDomain)
    ) {
      largestGroupRootDomain = rootDomain;
      largestGroupSize = count;
    }
  }

  return {
    largestGroupRootDomain,
    largestGroupSize,
    maxDepth,
    nestedSubdomainCount,
    rootDomainCount,
    subdomainCount,
  };
}

export function compareDomainsByHierarchy(
  leftDomain: string,
  rightDomain: string,
  hierarchyMap: Map<string, DomainHierarchyEntry>,
) {
  const leftEntry = getHierarchyEntry(leftDomain, hierarchyMap);
  const rightEntry = getHierarchyEntry(rightDomain, hierarchyMap);

  if (leftEntry.rootDomain !== rightEntry.rootDomain) {
    return leftEntry.rootDomain.localeCompare(rightEntry.rootDomain);
  }

  const leftLineageKey = leftEntry.lineage.join(DOMAIN_LINEAGE_SORT_SEPARATOR);
  const rightLineageKey = rightEntry.lineage.join(DOMAIN_LINEAGE_SORT_SEPARATOR);
  if (leftLineageKey !== rightLineageKey) {
    return leftLineageKey.localeCompare(rightLineageKey);
  }

  if (leftEntry.depth !== rightEntry.depth) {
    return leftEntry.depth - rightEntry.depth;
  }

  return leftEntry.domain.localeCompare(rightEntry.domain);
}

export function sortDomainRecordsByHierarchy<T extends { domain: string }>(
  records: T[],
  hierarchyMap: Map<string, DomainHierarchyEntry>,
) {
  return [...records].sort((left, right) => compareDomainsByHierarchy(left.domain, right.domain, hierarchyMap));
}
