import { describe, expect, it } from "vitest";
import {
  MAX_REGEX_CHARS,
  undecidedUrlRegexes,
  type DecidedHosts,
} from "./undecided-url";

/** The plain set check the regexes must agree with. */
function decided(host: string, hosts: DecidedHosts): boolean {
  const name = host.toLowerCase();
  return (
    hosts.exact.some((entry) => entry.toLowerCase() === name) ||
    hosts.withSubdomains.some((entry) => {
      const site = entry.toLowerCase();
      return name === site || name.endsWith(`.${site}`);
    })
  );
}

/** Compiled once per set of regexes: compiling per URL is what made the checks slow. */
const compiledOf = new WeakMap<readonly string[], RegExp[]>();
const matchesAny = (regexes: readonly string[], url: string) => {
  let compiled = compiledOf.get(regexes);
  if (!compiled) {
    compiled = regexes.map((source) => new RegExp(source));
    compiledOf.set(regexes, compiled);
  }
  return compiled.some((regex) => regex.test(url));
};

/** A small seeded random source, so a failure repeats. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz0123456789-";
const TLDS = ["com", "org", "co.uk", "de", "io", "example", "xn--p1ai"];

function randomHost(next: () => number): string {
  const label = () => {
    const length = 1 + Math.floor(next() * 8);
    let text = "";
    // No "-" first, as in real labels.
    for (let i = 0; i < length; i++)
      text += LETTERS[Math.floor(next() * (i === 0 ? 36 : LETTERS.length))];
    return text;
  };
  const labels = Array.from({ length: Math.floor(next() * 3) }, label);
  return [...labels, label(), TLDS[Math.floor(next() * TLDS.length)]].join(".");
}

/** Pages on a host: ports, paths, queries, both schemes, a user name. */
const urlsOf = (host: string) => [
  `https://${host}/`,
  `http://${host}/a/b?c=d`,
  `https://${host}:8443/x`,
  `http://user:pass@${host}/`,
];

/** Hosts near a decided one: subdomains, prefixes, suffixes, one character off. */
const neighbours = (host: string) =>
  [
    host,
    `www.${host}`,
    `a.b.${host}`,
    `x${host}`,
    `${host}x`,
    host.slice(1),
    host.slice(0, -1),
    `${host}.evil`,
    `${host.slice(0, -1)}z`,
  ].filter((name) => name !== "" && !name.startsWith("."));

function expectAgrees(
  hosts: DecidedHosts,
  probes: readonly string[],
  maxChars?: number,
) {
  const regexes = undecidedUrlRegexes(hosts, maxChars);
  const wrong = probes.flatMap((host) =>
    urlsOf(host).flatMap((url) =>
      matchesAny(regexes, url) === !decided(host, hosts) ? [] : [url],
    ),
  );
  expect(wrong).toEqual([]);
  return regexes;
}

// V8 runs these RE2-shaped regexes with backtracking: under a busy machine (verify runs
// every suite at once) the larger checks can take several times their 0.5 s alone.
describe("undecidedUrlRegexes", { timeout: 30_000 }, () => {
  it("matches every web page when nothing is decided", () => {
    const regexes = expectAgrees({ exact: [], withSubdomains: [] }, [
      "example.com",
      "a.b",
      "localhost",
      "127.0.0.1",
    ]);
    expect(regexes).toHaveLength(1);
  });

  it("leaves out exact hosts but not their subdomains or near names", () => {
    const hosts = {
      exact: ["example.com", "news.example.org", "localhost"],
      withSubdomains: [],
    };
    expectAgrees(hosts, [
      ...hosts.exact.flatMap(neighbours),
      "ample.com",
      "example.co",
      "example.com.au",
      "myexample.com",
      "localhost.localdomain",
    ]);
  });

  it("leaves out a host and every subdomain of it", () => {
    const hosts = { exact: ["blog.site.net"], withSubdomains: ["example.com"] };
    expectAgrees(hosts, [
      ...["example.com", "blog.site.net", "site.net"].flatMap(neighbours),
      "deep.a.b.example.com",
      "notexample.com",
      "example.com.evil.org",
    ]);
  });

  it("agrees when one decided host is a prefix or a suffix of another", () => {
    const hosts = {
      exact: ["a.com", "aa.com", "b.a.com", "example.co", "example.com"],
      withSubdomains: ["c.a.com", "x.org", "xx.org"],
    };
    expectAgrees(hosts, [
      ...[...hosts.exact, ...hosts.withSubdomains].flatMap(neighbours),
      "d.c.a.com",
      "ca.com",
      "a.x.org",
      "axx.org",
    ]);
  });

  it("reads hosts written in capitals or in Unicode as the browser writes them", () => {
    const regexes = undecidedUrlRegexes({
      exact: ["Example.COM", "bücher.example"],
      withSubdomains: ["ÉCOLE.fr"],
    });
    for (const url of [
      "https://example.com/",
      "https://xn--bcher-kva.example/",
      "https://xn--cole-9oa.fr/",
      "https://www.xn--cole-9oa.fr/",
    ])
      expect(matchesAny(regexes, url), url).toBe(false);
    expect(matchesAny(regexes, "https://xn--cole-9oa.fr.evil/")).toBe(true);
  });

  it("never matches what is not an http or https page", () => {
    const regexes = undecidedUrlRegexes({ exact: [], withSubdomains: [] });
    for (const url of [
      "ftp://example.com/",
      "file:///tmp/a.html",
      "chrome://extensions/",
      "https:///",
      "https://[::1]:8080/",
    ])
      expect(matchesAny(regexes, url), url).toBe(false);
  });

  // V8 backtracks through these regexes (Chrome's RE2 does not), so the large sets
  // are checked with small pieces or a sample of hosts.
  it("agrees with a plain set check over random hosts", () => {
    const next = random(7);
    for (const count of [5, 50, 300]) {
      const pool = Array.from({ length: count * 2 }, () => randomHost(next));
      const hosts = {
        exact: pool.slice(0, count),
        withSubdomains: pool.slice(count, count + Math.ceil(count / 10)),
      };
      expectAgrees(
        hosts,
        [
          ...pool.slice(0, 120).flatMap(neighbours),
          ...Array.from({ length: 100 }, () => randomHost(next)),
        ],
        1000,
      );
    }
  });

  it("splits a set into pieces under the size limit that still agree", () => {
    const next = random(11);
    const pool = Array.from({ length: 400 }, () => randomHost(next));
    const hosts = {
      exact: pool.slice(0, 360),
      withSubdomains: pool.slice(360),
    };
    const regexes = undecidedUrlRegexes(hosts, 4000);
    expect(regexes.length).toBeGreaterThan(5);
    for (const source of regexes)
      expect(source.length).toBeLessThanOrEqual(4000);
    const compiled = regexes.map((source) => new RegExp(source));
    const probes = [
      ...pool.flatMap(neighbours),
      ...Array.from({ length: 300 }, () => randomHost(next)),
    ];
    const wrong = probes.filter(
      (host) =>
        compiled.some((regex) => regex.test(`https://${host}/`)) ===
        decided(host, hosts),
    );
    expect(wrong).toEqual([]);
  });

  it("keeps 5,000 hosts in a few pieces of at most MAX_REGEX_CHARS", () => {
    const next = random(13);
    const pool = Array.from({ length: 5000 }, () => randomHost(next));
    const regexes = undecidedUrlRegexes({ exact: pool, withSubdomains: [] });
    expect(regexes.length).toBeLessThanOrEqual(16);
    for (const source of regexes)
      expect(source.length).toBeLessThanOrEqual(MAX_REGEX_CHARS);
  });

  it("uses only what RE2 accepts: no lookaround, no backreferences", () => {
    const next = random(3);
    const pool = Array.from({ length: 300 }, () => randomHost(next));
    const regexes = undecidedUrlRegexes({
      exact: [...pool.slice(0, 250), "a_b.example", "x-y.example"],
      withSubdomains: pool.slice(250),
    });
    for (const source of regexes) {
      expect(source).not.toMatch(/\(\?[=!<]/);
      expect(source).not.toMatch(/\\[1-9bBkK]/);
      expect(() => new RegExp(source)).not.toThrow();
    }
  });
});
