import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDomainHierarchyMap,
  buildDomainHierarchySummary,
  sortDomainRecordsByHierarchy,
} from "../src/client/pages/domains/domain-hierarchy";

test("buildDomainHierarchyMap 会解析父域名、根域名和后代统计", () => {
  const hierarchyMap = buildDomainHierarchyMap([
    "example.com",
    "qa.example.com",
    "api.qa.example.com",
    "internal.api.qa.example.com",
    "mx.example.com",
    "other.net",
  ]);

  assert.deepEqual(hierarchyMap.get("example.com"), {
    childDomains: ["mx.example.com", "qa.example.com"],
    depth: 0,
    directChildCount: 2,
    domain: "example.com",
    kind: "root",
    lineage: ["example.com"],
    parentDomain: null,
    rootDomain: "example.com",
    totalDescendantCount: 4,
  });
  assert.deepEqual(hierarchyMap.get("qa.example.com"), {
    childDomains: ["api.qa.example.com"],
    depth: 1,
    directChildCount: 1,
    domain: "qa.example.com",
    kind: "subdomain",
    lineage: ["example.com", "qa.example.com"],
    parentDomain: "example.com",
    rootDomain: "example.com",
    totalDescendantCount: 2,
  });
  assert.deepEqual(hierarchyMap.get("api.qa.example.com"), {
    childDomains: ["internal.api.qa.example.com"],
    depth: 2,
    directChildCount: 1,
    domain: "api.qa.example.com",
    kind: "nested_subdomain",
    lineage: ["example.com", "qa.example.com", "api.qa.example.com"],
    parentDomain: "qa.example.com",
    rootDomain: "example.com",
    totalDescendantCount: 1,
  });
});

test("buildDomainHierarchyMap 会在未注册根域名时使用最近的已配置父域名", () => {
  const hierarchyMap = buildDomainHierarchyMap([
    "qa.example.com",
    "api.qa.example.com",
    "edge.api.qa.example.com",
  ]);

  assert.equal(hierarchyMap.get("qa.example.com")?.parentDomain, null);
  assert.equal(hierarchyMap.get("qa.example.com")?.rootDomain, "qa.example.com");
  assert.equal(hierarchyMap.get("api.qa.example.com")?.parentDomain, "qa.example.com");
  assert.equal(hierarchyMap.get("api.qa.example.com")?.rootDomain, "qa.example.com");
  assert.equal(hierarchyMap.get("edge.api.qa.example.com")?.parentDomain, "api.qa.example.com");
  assert.equal(hierarchyMap.get("edge.api.qa.example.com")?.depth, 2);
});

test("sortDomainRecordsByHierarchy 会按树形顺序分组并统计根域名分组", () => {
  const records = [
    { domain: "z.example.com" },
    { domain: "api.qa.example.com" },
    { domain: "example.com" },
    { domain: "other.net" },
    { domain: "qa.example.com" },
  ];
  const hierarchyMap = buildDomainHierarchyMap(records.map(record => record.domain));
  const sortedRecords = sortDomainRecordsByHierarchy(records, hierarchyMap);
  const summary = buildDomainHierarchySummary(hierarchyMap);

  assert.deepEqual(
    sortedRecords.map(record => record.domain),
    [
      "example.com",
      "qa.example.com",
      "api.qa.example.com",
      "z.example.com",
      "other.net",
    ],
  );
  assert.deepEqual(summary, {
    largestGroupRootDomain: "example.com",
    largestGroupSize: 4,
    maxDepth: 2,
    nestedSubdomainCount: 1,
    rootDomainCount: 2,
    subdomainCount: 3,
  });
});
