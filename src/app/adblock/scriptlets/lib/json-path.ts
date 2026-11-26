// uBO-flavored JSONPath, the queries of the `edit` scriptlets, written from uBO's wiki
// page "uBO-flavored JSONPath" (read 2026-11-26): RFC 9535's dot and bracket
// selectors, wildcards, indexes, filters with comparisons, uBO's regex selectors and
// string operators, `;`-chained sub-queries with quantifiers, and assignments.
//
// Queries without `v2:` that do not start with `$` are uBO's older syntax, which the
// lists still use (`..itemSectionRenderer.contents.*[?.adSlotRenderer]`): there a
// filter (`[?.a]`, no `@`) keeps or drops the nodes it follows instead of selecting
// their children, and the query starts at the root without `$`.
import { isObject, regexOf } from "./shared";

type Key = string | number;

type Selector =
  | { kind: "names"; names: Key[] }
  | { kind: "wildcard" }
  | { kind: "regex"; regex: RegExp }
  | { kind: "filter"; filter: Filter };

interface Segment {
  readonly descendant: boolean;
  readonly selector: Selector;
}

interface Filter {
  /** The path from the node tested (`@`). */
  readonly path: Segment[];
  readonly op?: string;
  readonly value?: unknown;
}

interface SubQuery {
  readonly segments: Segment[];
  readonly min: number;
  readonly max: number;
}

type Assignment =
  | { kind: "value"; value: unknown }
  | { kind: "merge"; value: Record<string, unknown> }
  | { kind: "replace"; regex: RegExp; replacement: string };

export interface JsonPath {
  readonly queries: SubQuery[];
  readonly assignment?: Assignment;
  readonly legacy: boolean;
}

/** A node the query reached, with where it is held (none for the root). */
interface Location {
  readonly owner?: Record<string, unknown>;
  readonly key?: Key;
  readonly value: unknown;
}

/** Splits `text` at `separator` where it is outside quotes, brackets and braces. */
function splitTop(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "[" || c === "{" || c === "(") depth++;
    else if (c === "]" || c === "}" || c === ")") depth--;
    else if (depth === 0 && text.startsWith(separator, i)) {
      parts.push(text.slice(start, i));
      start = i + separator.length;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** Where the top-level `=` or `+=` of an assignment starts, or -1. */
function assignmentStart(text: string): number {
  let depth = 0;
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (depth === 0 && c === "=") return text[i - 1] === "+" ? i - 1 : i;
  }
  return -1;
}

/** A JSON value, or a single-quoted string. */
function literal(text: string): unknown {
  const trimmed = text.trim();
  if (/^'.*'$/s.test(trimmed)) return trimmed.slice(1, -1).replace(/\\'/g, "'");
  return JSON.parse(trimmed);
}

class Parser {
  i = 0;
  readonly text: string;
  constructor(text: string) {
    this.text = text;
  }

  get rest() {
    return this.text.slice(this.i);
  }

  segments(stopAt = ""): Segment[] {
    const segments: Segment[] = [];
    if (this.text[this.i] === "$" || this.text[this.i] === "@") this.i++;
    while (this.i < this.text.length && !stopAt.includes(this.text[this.i]!)) {
      if (this.rest.startsWith("..")) {
        this.i += 2;
        segments.push({ descendant: true, selector: this.selector() });
      } else if (this.text[this.i] === ".") {
        this.i++;
        segments.push({ descendant: false, selector: this.selector() });
      } else if (this.text[this.i] === "[") {
        segments.push({ descendant: false, selector: this.selector() });
      } else throw new SyntaxError(`JSONPath: ${this.rest}`);
    }
    return segments;
  }

  selector(): Selector {
    const c = this.text[this.i];
    if (c === "[") return this.bracket();
    if (c === "*") {
      this.i++;
      return { kind: "wildcard" };
    }
    if (c === "/") return { kind: "regex", regex: this.regex() };
    const name = /^[^.[\]=!<>^$*~;\s]+/.exec(this.rest)?.[0] ?? "";
    this.i += name.length;
    return { kind: "names", names: [name] };
  }

  regex(): RegExp {
    const match = /^\/((?:\\.|[^/\\])+)\/([dgimsuvy]*)/.exec(this.rest);
    if (!match) throw new SyntaxError(`JSONPath: ${this.rest}`);
    this.i += match[0].length;
    return new RegExp(match[1] ?? "", match[2]);
  }

  /** The inside of `[…]`, to its closing bracket. */
  bracketText(): string {
    const start = ++this.i;
    let depth = 1;
    let quote = "";
    for (; this.i < this.text.length; this.i++) {
      const c = this.text[this.i];
      if (quote) {
        if (c === "\\") this.i++;
        else if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === "[") depth++;
      else if (c === "]" && --depth === 0) break;
    }
    if (depth !== 0) throw new SyntaxError(`JSONPath: unclosed [`);
    return this.text.slice(start, this.i++);
  }

  bracket(): Selector {
    const inside = this.bracketText().trim();
    if (inside === "*") return { kind: "wildcard" };
    if (inside.startsWith("?"))
      return { kind: "filter", filter: filterOf(inside.slice(1).trim()) };
    const regex = regexOf(inside);
    if (regex) return { kind: "regex", regex };
    const names = splitTop(inside, ",").map((part) => {
      const value = literal(part);
      if (typeof value !== "string" && typeof value !== "number")
        throw new SyntaxError(`JSONPath: [${inside}]`);
      return value;
    });
    return { kind: "names", names };
  }
}

const OPERATORS = ["==", "!=", "<=", ">=", "^=", "$=", "*=", "<", ">", "="];

function filterOf(text: string): Filter {
  const parser = new Parser(text);
  const path = parser.segments("=!<>^$*");
  const rest = parser.rest.trim();
  if (rest === "") return { path };
  const op = OPERATORS.find((candidate) => rest.startsWith(candidate));
  if (!op) throw new SyntaxError(`JSONPath: ?${text}`);
  const operand = rest.slice(op.length).trim();
  if (op === "=") {
    const regex = regexOf(operand);
    if (regex) return { path, op: "regex", value: regex };
    return { path, op: "==", value: literal(operand) };
  }
  return { path, op, value: literal(operand) };
}

function assignmentOf(text: string): Assignment {
  if (text.startsWith("+=")) {
    const value = literal(text.slice(2));
    if (!isObject(value)) throw new SyntaxError(`JSONPath: ${text}`);
    return { kind: "merge", value };
  }
  const value = text.slice(1).trim();
  const repl = /^repl\((.*)\)$/s.exec(value);
  if (repl) {
    const spec = literal(repl[1] ?? "") as {
      pattern?: string;
      regex?: string;
      replacement?: string;
    };
    const regex =
      typeof spec.regex === "string"
        ? (regexOf(spec.regex) ?? new RegExp(spec.regex))
        : new RegExp(
            String(spec.pattern ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          );
    return { kind: "replace", regex, replacement: spec.replacement ?? "" };
  }
  if (/^call\(/.test(value))
    throw new SyntaxError("JSONPath: call() is not supported");
  return { kind: "value", value: literal(value) };
}

/** Parses a query; throws a SyntaxError for what it cannot read. */
export function parseJsonPath(query: string): JsonPath {
  const v2 = query.startsWith("v2:");
  const text = v2 ? query.slice(3) : query;
  const legacy = !v2 && !text.startsWith("$");
  const parts = splitTop(text, ";");
  let assignment: Assignment | undefined;
  const queries = parts.map((part, index) => {
    let body = part.trim();
    let min = 1;
    let max = Infinity;
    if (index === parts.length - 1) {
      const at = assignmentStart(body);
      if (at >= 0) {
        assignment = assignmentOf(body.slice(at));
        body = body.slice(0, at);
      }
    } else {
      const quantifier = /\{(\d*)(,?)(\d*)\}$/.exec(body);
      if (quantifier) {
        body = body.slice(0, quantifier.index);
        min = quantifier[1] ? Number(quantifier[1]) : 0;
        max = quantifier[3]
          ? Number(quantifier[3])
          : quantifier[2]
            ? Infinity
            : min;
      }
    }
    return { segments: new Parser(body).segments(), min, max };
  });
  return { queries, assignment, legacy };
}

function children(node: unknown): Location[] {
  if (!isObject(node)) return [];
  const owner = node;
  if (Array.isArray(node))
    return node.map((value, key) => ({ owner, key, value: value as unknown }));
  return Object.keys(node).map((key) => ({ owner, key, value: node[key] }));
}

function descendants(location: Location): Location[] {
  const all = [location];
  for (const child of children(location.value)) all.push(...descendants(child));
  return all;
}

function compare(op: string | undefined, actual: unknown, expected: unknown) {
  switch (op) {
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    case "regex":
      return typeof actual === "string" && (expected as RegExp).test(actual);
    default:
      break;
  }
  if (typeof actual === "string" && typeof expected === "string") {
    if (op === "^=") return actual.startsWith(expected);
    if (op === "$=") return actual.endsWith(expected);
    if (op === "*=") return actual.includes(expected);
  }
  const ordered =
    (typeof actual === "number" && typeof expected === "number") ||
    (typeof actual === "string" && typeof expected === "string");
  if (!ordered) return false;
  const [a, b] = [actual as number, expected as number];
  if (op === "<") return a < b;
  if (op === "<=") return a <= b;
  if (op === ">") return a > b;
  if (op === ">=") return a >= b;
  return false;
}

function passes(filter: Filter, node: unknown, legacy: boolean): boolean {
  const found = walk(filter.path, [{ value: node }], legacy);
  if (filter.op === undefined) return found.length > 0;
  return found.some(({ value }) => compare(filter.op, value, filter.value));
}

function select(
  selector: Selector,
  from: Location,
  legacy: boolean,
): Location[] {
  switch (selector.kind) {
    case "wildcard":
      return children(from.value);
    case "regex":
      return children(from.value).filter(
        ({ key }) => typeof key === "string" && selector.regex.test(key),
      );
    case "filter":
      if (legacy)
        return passes(selector.filter, from.value, legacy) ? [from] : [];
      return children(from.value).filter(({ value }) =>
        passes(selector.filter, value, legacy),
      );
    case "names": {
      const node = from.value;
      if (!isObject(node)) return [];
      return selector.names.flatMap((name) => {
        const key =
          Array.isArray(node) && typeof name === "number" && name < 0
            ? node.length + name
            : name;
        return Object.hasOwn(node, key)
          ? [{ owner: node, key, value: node[key] }]
          : [];
      });
    }
  }
}

function walk(
  segments: readonly Segment[],
  start: Location[],
  legacy: boolean,
): Location[] {
  let nodes = start;
  for (const { descendant, selector } of segments) {
    const from = descendant ? nodes.flatMap(descendants) : nodes;
    nodes = from.flatMap((location) => select(selector, location, legacy));
  }
  return nodes;
}

/**
 * Runs the query on `root`, in place: removes what it found, or with `trusted`, applies
 * its assignment there. Answers how many places changed.
 */
export function editJson(
  path: JsonPath,
  root: unknown,
  trusted: boolean,
): number {
  if (path.assignment && !trusted) return 0;
  let found: Location[] = [];
  for (const { segments, min, max } of path.queries) {
    found = walk(segments, [{ value: root }], path.legacy);
    if (found.length < min || found.length > max) return 0;
  }
  const { assignment } = path;
  if (!assignment) {
    // Each place once; an array's items from the last, so the other indexes stay right.
    const keys = new Map<Record<string, unknown>, Set<Key>>();
    for (const { owner, key } of found)
      if (owner !== undefined && key !== undefined)
        keys.set(owner, (keys.get(owner) ?? new Set()).add(key));
    let removed = 0;
    for (const [owner, set] of keys) {
      removed += set.size;
      if (Array.isArray(owner))
        for (const index of [...set].map(Number).sort((a, b) => b - a))
          owner.splice(index, 1);
      else for (const key of set) Reflect.deleteProperty(owner, key);
    }
    return removed;
  }
  let changed = 0;
  for (const { owner, key, value } of found) {
    if (assignment.kind === "merge") {
      if (!isObject(value)) continue;
      Object.assign(value, structuredClone(assignment.value));
    } else if (owner === undefined || key === undefined) continue;
    else if (assignment.kind === "value")
      owner[key] = structuredClone(assignment.value);
    else if (typeof value === "string")
      owner[key] = value.replace(assignment.regex, assignment.replacement);
    else continue;
    changed++;
  }
  return changed;
}
