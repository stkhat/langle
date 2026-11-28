/**
 * The toolbar icon's mark shows on hosts the user has not decided on yet
 * (architecture.md "Site access": the mark). `declarativeContent`'s `UrlFilter` has no
 * negation and its `urlMatches` is RE2 (no lookaround, no backreferences), so the
 * decided hosts become regexes that match a page's URL only when its host is outside
 * them. Pure, so it is tested against a plain set check.
 */

/** The hosts not to mark: some exactly, some with every subdomain too. */
export interface DecidedHosts {
  exact: readonly string[];
  withSubdomains: readonly string[];
}

/**
 * The longest regex built. Chrome refused one complement regex at ~477k characters
 * (RE2's program size, so the limit depends on the shape); a quarter of that keeps a
 * margin and 2,000 hosts in a handful of pieces (docs/notes/site-access.md, 3).
 */
export const MAX_REGEX_CHARS = 100_000;

/** A host's characters as the URL has them: not the port's `:`, the path's `/`, or `@`. */
const HOST_CHAR = "[^:/@]";
/** The scheme, then a user name and password if the URL has them. */
const PREFIX = "^https?://(?:[^/@]*@)?";
/** A port, then the path (a web URL always has one). */
const SUFFIX = "(?::\\d+)?/";

/** The browser's form of a host (lowercase, punycode), or undefined for what is none. */
function canonical(host: string): string | undefined {
  try {
    const name = new URL(`http://${host.trim()}/`).hostname;
    // IPv6 literals hold `:`, which `HOST_CHAR` leaves out: they are never marked.
    return /^[a-z0-9._-]+$/.test(name) ? name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A trie of the decided hosts read from their end, so that "every subdomain" is a
 * subtree: `end` when a host ending exactly here is decided, `all` when every host
 * whose end reaches here is (the `.` before a host decided with its subdomains).
 */
interface Node {
  kids: Map<string, Node>;
  end: boolean;
  all: boolean;
}

const node = (): Node => ({ kids: new Map(), end: false, all: false });

function walk(root: Node, reversed: string): Node {
  let at = root;
  for (const char of reversed) {
    let next = at.kids.get(char);
    if (!next) at.kids.set(char, (next = node()));
    at = next;
  }
  return at;
}

const reverse = (text: string) => [...text].reverse().join("");
/** A host character outside a class: only `.` means anything else there. */
const literal = (char: string) => (char === "." ? "\\." : char);
/** A host character inside a negated class: only `-` means anything else there. */
const inClass = (char: string) => (char === "-" ? "\\-" : char);

/**
 * Regexes, any of which matches an `http`/`https` page's URL exactly when its host is
 * outside `decided`: `^https?://H(:\d+)?/` for an undecided host `H`. Read from its
 * end, a host is undecided where it leaves the trie (a character no decided host has
 * there, or its start) before a decided end. So the regex for a node `n` is what may
 * come before `n`'s ending: nothing (unless a host ending so is decided), any host
 * characters and then one that leads nowhere in the trie, or a child's regex and then
 * that child's character. A regex longer than `maxChars` is split by ending: the
 * biggest subtrees go to regexes of their own, siblings packed together, each ending in
 * its subtree's characters.
 */
export function undecidedUrlRegexes(
  decided: DecidedHosts,
  maxChars = MAX_REGEX_CHARS,
): string[] {
  const root = node();
  for (const host of decided.exact) {
    const name = canonical(host);
    if (name) walk(root, reverse(name)).end = true;
  }
  for (const host of decided.withSubdomains) {
    const name = canonical(host);
    if (!name) continue;
    const apex = walk(root, reverse(name));
    apex.end = true;
    walk(apex, ".").all = true;
  }

  const pieces: string[] = [];
  const wrap = (body: string, ending: string) =>
    `${PREFIX}${body}${[...ending].map(literal).join("")}${SUFFIX}`;

  /** What may come before `ending` (the host's last characters, `at`'s path). */
  function before(at: Node, ending: string, isRoot: boolean): string {
    const chars = [...at.kids.keys()].sort();
    const leave = chars.length
      ? `${HOST_CHAR}*[^${chars.map(inClass).join("")}:/@]`
      : `${HOST_CHAR}+`;
    const children = chars.flatMap((char) => {
      const kid = at.kids.get(char)!;
      if (kid.all) return [];
      const ends = char + ending;
      return [{ text: before(kid, ends, false) + literal(char) }];
    });
    const optional = !at.end && !isRoot;
    const assemble = () => {
      const alternatives = [leave, ...children.map((child) => child.text)];
      if (alternatives.length === 1 && !optional) return leave;
      return `(?:${alternatives.join("|")})${optional ? "?" : ""}`;
    };
    let text = assemble();
    if (wrap(text, ending).length <= maxChars) return text;
    // The biggest subtrees leave until this one fits; they are packed into pieces of
    // their own, each a group of siblings ending in their characters and `ending`.
    children.sort((a, b) => b.text.length - a.text.length);
    const out: string[][] = [];
    while (wrap(text, ending).length > maxChars && children.length) {
      const { text: child } = children.shift()!;
      const room = (group: string[]) =>
        wrap(`(?:${[...group, child].join("|")})`, ending).length <= maxChars;
      const group = out.find(room);
      if (group) group.push(child);
      else out.push([child]);
      text = assemble();
    }
    for (const group of out)
      pieces.push(wrap(`(?:${group.join("|")})`, ending));
    return text;
  }

  const body = before(root, "", true);
  return [wrap(body, ""), ...pieces];
}
