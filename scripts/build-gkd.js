const fs = require("fs");
const path = require("path");
const vm = require("vm");

const OUTPUT_PATH = path.join(process.cwd(), "gkd.json5");
const VERSION_OUTPUT_PATH = path.join(process.cwd(), "gkd.version.json5");
const LOCAL_RULES_PATH = path.join(process.cwd(), "local-rules.json");

const UPSTREAMS = [
  {
    name: "聚合版",
    url: "https://gkd-subscription-667.pages.dev/gkd.json5",
  },
  {
    name: "聚合版",
    url: "https://registry.npmmirror.com/@ganlinte/gkd-subscription/latest/files",
  },
  {
    name: "聚合版",
    url: "https://registry.npmmirror.com/@aisouler/gkd_subscription/latest/files/dist/AIsouler_gkd.json5",
  },
  {
    name: "聚合版",
    url: "https://registry.npmmirror.com/gkd-subscription/latest/files",
  },
];

const OUTPUT_META = {
  id: 100001,
  name: "聚合版",
  author: "LionLiu",
  updateUrl: "https://raw.githubusercontent.com/jsllb1986/gkd-rules/main/gkd.json5",
  checkUpdateUrl: "https://raw.githubusercontent.com/jsllb1986/gkd-rules/main/gkd.version.json5",
  supportUri: "https://github.com/jsllb1986/gkd-rules",
};

function parseLooseObject(text, sourceName) {
  try {
    return vm.runInNewContext(`(${text})`, {}, { timeout: 5000 });
  } catch (error) {
    throw new Error(`Failed to parse ${sourceName}: ${error.message}`);
  }
}

async function fetchSubscription(url, sourceName) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "gkd-rules-aggregator",
      accept: "application/json,text/plain,*/*",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${sourceName}: HTTP ${response.status}`);
  }
  const text = await response.text();
  return parseLooseObject(text, sourceName);
}

function readLocalRules() {
  return JSON.parse(fs.readFileSync(LOCAL_RULES_PATH, "utf8"));
}

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = stable(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function ruleSignature(rule, inheritedActivityIds) {
  if (typeof rule === "string") {
    return JSON.stringify(
      stable({
        raw: rule,
        activityIds: toArray(inheritedActivityIds),
      }),
    );
  }
  return JSON.stringify(
    stable({
      matches: rule.matches,
      anyMatches: rule.anyMatches,
      excludeMatches: rule.excludeMatches,
      position: rule.position,
      action: rule.action,
      actionDelay: rule.actionDelay,
      actionCd: rule.actionCd,
      actionCdKey: rule.actionCdKey,
      actionMaximum: rule.actionMaximum,
      actionMaximumKey: rule.actionMaximumKey,
      fastQuery: rule.fastQuery,
      matchTime: rule.matchTime,
      resetMatch: rule.resetMatch,
      order: rule.order,
      preKeys: toArray(rule.preKeys),
      excludeActivityIds: toArray(rule.excludeActivityIds),
      activityIds: toArray(rule.activityIds).length
        ? toArray(rule.activityIds)
        : toArray(inheritedActivityIds),
    }),
  );
}

function mergeUniqueArrays(a, b) {
  return Array.from(new Set([...toArray(a), ...toArray(b)]));
}

function normalizeRule(rule) {
  if (typeof rule === "string") return rule;
  const next = { ...rule };
  if (next.snapshotUrls) next.snapshotUrls = mergeUniqueArrays(next.snapshotUrls, []);
  if (next.exampleUrls) next.exampleUrls = mergeUniqueArrays(next.exampleUrls, []);
  if (next.activityIds) next.activityIds = mergeUniqueArrays(next.activityIds, []);
  return next;
}

function mergeRules(targetGroup, incomingGroup) {
  const seen = new Map();
  const mergedRules = [];

  for (const rule of toArray(targetGroup.rules)) {
    const normalized = normalizeRule(rule);
    const sig = ruleSignature(normalized, targetGroup.activityIds);
    seen.set(sig, normalized);
    mergedRules.push(normalized);
  }

  for (const rule of toArray(incomingGroup.rules)) {
    const normalized = normalizeRule(rule);
    const sig = ruleSignature(normalized, incomingGroup.activityIds);
    const existing = seen.get(sig);
    if (!existing) {
      seen.set(sig, normalized);
      mergedRules.push(normalized);
      continue;
    }
    if (typeof normalized === "string" || typeof existing === "string") {
      continue;
    }
    if (normalized.snapshotUrls || existing.snapshotUrls) {
      existing.snapshotUrls = mergeUniqueArrays(existing.snapshotUrls, normalized.snapshotUrls);
    }
    if (normalized.exampleUrls || existing.exampleUrls) {
      existing.exampleUrls = mergeUniqueArrays(existing.exampleUrls, normalized.exampleUrls);
    }
  }

  targetGroup.rules = mergedRules;
}

function dedupeGroupRules(group) {
  const seen = new Map();
  const deduped = [];

  for (const rule of toArray(group.rules)) {
    const normalized = normalizeRule(rule);
    const sig = ruleSignature(normalized, group.activityIds);
    const existing = seen.get(sig);
    if (!existing) {
      seen.set(sig, normalized);
      deduped.push(normalized);
      continue;
    }
    if (typeof normalized === "string" || typeof existing === "string") {
      continue;
    }
    if (normalized.snapshotUrls || existing.snapshotUrls) {
      existing.snapshotUrls = mergeUniqueArrays(existing.snapshotUrls, normalized.snapshotUrls);
    }
    if (normalized.exampleUrls || existing.exampleUrls) {
      existing.exampleUrls = mergeUniqueArrays(existing.exampleUrls, normalized.exampleUrls);
    }
  }

  group.rules = deduped;
}

function mergeGroups(baseGroups, incomingGroups) {
  const result = [];
  const byName = new Map();

  for (const group of toArray(baseGroups)) {
    const copy = {
      ...group,
      activityIds: group.activityIds ? mergeUniqueArrays(group.activityIds, []) : undefined,
      rules: toArray(group.rules).map(normalizeRule),
    };
    result.push(copy);
    byName.set(copy.name, copy);
  }

  for (const group of toArray(incomingGroups)) {
    const existing = byName.get(group.name);
    if (!existing) {
      const copy = {
        ...group,
        activityIds: group.activityIds ? mergeUniqueArrays(group.activityIds, []) : undefined,
        rules: toArray(group.rules).map(normalizeRule),
      };
      result.push(copy);
      byName.set(copy.name, copy);
      continue;
    }

    existing.activityIds = mergeUniqueArrays(existing.activityIds, group.activityIds);
    mergeRules(existing, group);
  }

  const usedKeys = new Set();
  let nextKey = 1;
  for (const group of result) {
    if (Number.isInteger(group.key) && !usedKeys.has(group.key)) {
      usedKeys.add(group.key);
      continue;
    }
    while (usedKeys.has(nextKey)) nextKey += 1;
    group.key = nextKey;
    usedKeys.add(nextKey);
    nextKey += 1;
  }

  return result;
}

function mergeCategories(subscriptions) {
  const result = [];
  const seen = new Set();
  for (const subscription of subscriptions) {
    for (const category of toArray(subscription.categories)) {
      const sig = `${category.key}::${category.name}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      result.push(category);
    }
  }
  return result;
}

function mergeGlobalGroups(subscriptions) {
  const result = [];
  for (const subscription of subscriptions) {
    for (const group of toArray(subscription.globalGroups)) {
      const existing = result.find((item) => item.name === group.name);
      if (!existing) {
        result.push({
          ...group,
          apps: toArray(group.apps).map((item) => ({ ...item })),
          rules: toArray(group.rules).map(normalizeRule),
        });
        continue;
      }
      existing.apps = mergeApps(existing.apps || [], group.apps || []);
      mergeRules(existing, group);
    }
  }

  const usedKeys = new Set();
  let nextKey = 1;
  for (const group of result) {
    if (Number.isInteger(group.key) && !usedKeys.has(group.key)) {
      usedKeys.add(group.key);
      continue;
    }
    while (usedKeys.has(nextKey)) nextKey += 1;
    group.key = nextKey;
    usedKeys.add(nextKey);
    nextKey += 1;
  }

  return result;
}

function mergeApps(baseApps, incomingApps) {
  const result = [];
  const byId = new Map();

  for (const app of toArray(baseApps)) {
    const copy = {
      ...app,
      groups: mergeGroups([], app.groups || []),
    };
    result.push(copy);
    byId.set(copy.id, copy);
  }

  for (const app of toArray(incomingApps)) {
    const existing = byId.get(app.id);
    if (!existing) {
      const copy = {
        ...app,
        groups: mergeGroups([], app.groups || []),
      };
      result.push(copy);
      byId.set(copy.id, copy);
      continue;
    }
    existing.name = existing.name || app.name;
    existing.enable = existing.enable ?? app.enable;
    existing.groups = mergeGroups(existing.groups || [], app.groups || []);
  }

  return result;
}

function sortOutput(subscription) {
  subscription.categories = toArray(subscription.categories).sort((a, b) => (a.key ?? 0) - (b.key ?? 0));
  subscription.globalGroups = toArray(subscription.globalGroups).sort((a, b) => (a.key ?? 0) - (b.key ?? 0));
  subscription.apps = toArray(subscription.apps).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const app of subscription.apps) {
    app.groups = toArray(app.groups).sort((a, b) => (a.key ?? 0) - (b.key ?? 0));
    for (const group of app.groups) {
      dedupeGroupRules(group);
    }
  }
  return subscription;
}

async function main() {
  const upstreams = [];
  for (const upstream of UPSTREAMS) {
    upstreams.push(await fetchSubscription(upstream.url, upstream.name));
  }

  const localRules = readLocalRules();
  const previousVersion = parseLooseObject(fs.readFileSync(OUTPUT_PATH, "utf8"), "current output").version || 1;

  let mergedApps = [];
  mergedApps = mergeApps(mergedApps, upstreams[0].apps || []);
  mergedApps = mergeApps(mergedApps, upstreams[1].apps || []);
  mergedApps = mergeApps(mergedApps, upstreams[2].apps || []);
  mergedApps = mergeApps(mergedApps, upstreams[3].apps || []);
  mergedApps = mergeApps(mergedApps, localRules.apps || []);

  const output = sortOutput({
    ...OUTPUT_META,
    version: Number(previousVersion) + 1,
    categories: mergeCategories(upstreams),
    globalGroups: mergeGlobalGroups(upstreams),
    apps: mergedApps,
  });

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    VERSION_OUTPUT_PATH,
    `${JSON.stringify({ id: output.id, version: output.version }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Generated ${OUTPUT_PATH}`);
  console.log(`Generated ${VERSION_OUTPUT_PATH}`);
  console.log(`Version: ${output.version}`);
  console.log(`Apps: ${output.apps.length}`);
  console.log(`Global groups: ${output.globalGroups.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

