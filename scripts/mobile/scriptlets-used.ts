// Which scriptlets the phone app's filter lists use (docs/specs/mobile-app.md "M6: ad
// blocking", docs/plans/mobile-app.md "M6b"): fetches the lists of
// mobile/protocol/filter-lists.json (the file the shells read too) and counts their
// `+js(…)` rules by scriptlet, youtube.com's first. The full result goes to a JSON file
// (default .output/scriptlets-used.json); the console gets the counts.
// Usage: node scripts/mobile/scriptlets-used.ts [out.json]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface FilterList {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly fallbacks: readonly string[];
  readonly licence: string;
  readonly home: string;
  /** Its rules may call the trusted-* scriptlets (parsed with their permission). */
  readonly trusted?: boolean;
}

export const FILTER_LISTS_FILE = join(
  import.meta.dirname,
  "../../mobile/protocol/filter-lists.json",
);

export function filterLists(): readonly FilterList[] {
  return (
    JSON.parse(readFileSync(FILTER_LISTS_FILE, "utf8")) as {
      lists: FilterList[];
    }
  ).lists;
}

/**
 * uBO's other names for its scriptlets, as its wiki's Resources Library lists them
 * (read 2026-11-26), so that a count adds up every spelling of one scriptlet.
 */
const ALIASES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries({
    "abort-current-script": ["acs", "abort-current-inline-script", "acis"],
    "abort-on-property-read": ["aopr"],
    "abort-on-property-write": ["aopw"],
    "abort-on-stack-trace": ["aost"],
    "addEventListener-defuser": ["aeld", "prevent-addEventListener"],
    "addEventListener-logger": ["aell"],
    "remove-cookie": ["cookie-remover"],
    "noeval-if": ["prevent-eval-if"],
    "noeval-silent": ["silent-noeval"],
    "prevent-fetch": ["no-fetch-if"],
    "trusted-replace-fetch-response": ["trusted-rpfr"],
    "prevent-requestAnimationFrame": ["no-requestAnimationFrame-if", "norafif"],
    "prevent-setInterval": [
      "no-setInterval-if",
      "nosiif",
      "setInterval-defuser",
    ],
    "prevent-setTimeout": ["no-setTimeout-if", "nostif", "setTimeout-defuser"],
    "prevent-xhr": ["no-xhr-if"],
    "remove-attr": ["ra"],
    "remove-class": ["rc"],
    "trusted-replace-node-text": ["trusted-rpnt", "replace-node-text", "rpnt"],
    "remove-node-text": ["rmnt"],
    "trusted-replace-outbound-text": ["trusted-rpot"],
    "prevent-refresh": ["refresh-defuser"],
    "set-constant": ["set"],
    "trusted-set-constant": ["trusted-set"],
    "adjust-setInterval": ["nano-setInterval-booster", "nano-sib"],
    "adjust-setTimeout": ["nano-setTimeout-booster", "nano-stb"],
    "close-window": ["window-close-if"],
    "prevent-window-open": [
      "nowoif",
      "no-window-open-if",
      "window.open-defuser",
    ],
  }).flatMap(([name, aliases]) => aliases.map((alias) => [alias, name])),
);

/** A scriptlet's own name: without `.js`, aliases resolved. */
export function canonicalName(name: string): string {
  const bare = name.trim().replace(/\.js$/, "");
  return ALIASES[bare] ?? bare;
}

export interface ScriptletRule {
  /** The rule's domains as written (`~` exclusions kept); empty for a generic rule. */
  readonly domains: readonly string[];
  /** `#@#+js(…)`: an exception, which turns the scriptlet off where it names. */
  readonly exception: boolean;
  readonly name: string;
  readonly line: string;
}

const RULE = /^([^#]*)#(@?)#\+js\((.*)\)\s*$/;

/** The `+js(…)` rules of a list's text. */
export function scriptletRules(text: string): ScriptletRule[] {
  const rules: ScriptletRule[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("!")) continue;
    const match = RULE.exec(line);
    if (!match) continue;
    const [, domains = "", exception, body = ""] = match;
    // The name runs to the first comma that no backslash escapes.
    const name = canonicalName(/^((?:\\.|[^,\\])*)/.exec(body)?.[1] ?? "");
    rules.push({
      domains: domains === "" ? [] : domains.split(","),
      exception: exception === "@",
      name,
      line,
    });
  }
  return rules;
}

/** Whether a rule applies on youtube.com (or one of its subdomains, `youtube.*`). */
export function onYouTube(rule: ScriptletRule): boolean {
  return rule.domains.some((domain) =>
    /^([\w-]+\.)*youtube\.(com|\*)$/.test(domain),
  );
}

export interface ScriptletCount {
  readonly name: string;
  readonly rules: number;
  readonly youtube: number;
  readonly byList: Readonly<Record<string, number>>;
}

/** The scriptlets of the lists' blocking rules (not exceptions), most used first. */
export function countScriptlets(
  lists: readonly { id: string; rules: readonly ScriptletRule[] }[],
): ScriptletCount[] {
  const counts = new Map<
    string,
    { rules: number; youtube: number; byList: Record<string, number> }
  >();
  for (const { id, rules } of lists)
    for (const rule of rules) {
      if (rule.exception) continue;
      const count = counts.get(rule.name) ?? {
        rules: 0,
        youtube: 0,
        byList: {},
      };
      count.rules += 1;
      if (onYouTube(rule)) count.youtube += 1;
      count.byList[id] = (count.byList[id] ?? 0) + 1;
      counts.set(rule.name, count);
    }
  return [...counts]
    .map(([name, count]) => ({ name, ...count }))
    .sort((a, b) => b.youtube - a.youtube || b.rules - a.rules);
}

async function fetchList(list: FilterList): Promise<string> {
  for (const url of [list.url, ...list.fallbacks]) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.text();
      console.warn(`${url}: HTTP ${response.status}`);
    } catch (error) {
      console.warn(`${url}: ${String(error)}`);
    }
  }
  throw new Error(`${list.id}: no URL answered`);
}

async function main() {
  const out = resolve(process.argv[2] ?? ".output/scriptlets-used.json");
  const fetched = await Promise.all(
    filterLists().map(async (list) => {
      const text = await fetchList(list);
      return {
        id: list.id,
        version: /^! Version: (.*)$/m.exec(text)?.[1] ?? "",
        rules: scriptletRules(text),
      };
    }),
  );
  const counts = countScriptlets(fetched);
  const youtubeRules = fetched.flatMap(({ id, rules }) =>
    rules.filter(onYouTube).map((rule) => ({ list: id, ...rule })),
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify(
      {
        fetched: new Date().toISOString(),
        lists: fetched.map(({ id, version, rules }) => ({
          id,
          version,
          rules: rules.length,
        })),
        counts,
        youtubeRules,
      },
      null,
      2,
    ),
  );
  for (const { id, version, rules } of fetched)
    console.log(`${id} ${version}: ${rules.length} +js rules`);
  console.log(`\nyoutube.com (${youtubeRules.length} rules):`);
  for (const { name, youtube } of counts.filter((count) => count.youtube > 0))
    console.log(`  ${String(youtube).padStart(5)}  ${name}`);
  console.log(`\nall lists (${counts.length} scriptlets, top 25):`);
  for (const { name, rules } of [...counts]
    .sort((a, b) => b.rules - a.rules)
    .slice(0, 25))
    console.log(`  ${String(rules).padStart(5)}  ${name}`);
  console.log(`\nwritten to ${out}`);
}

if (import.meta.main) await main();
