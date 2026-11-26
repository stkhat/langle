// remove-node-text and trusted-replace-node-text: the text of nodes of one name
// (`#text`, `script` …) changed as the parser adds them, until DOMContentLoaded.
import { namedArgs, textTest, type Win } from "./shared";

const POLICY = "langle-scriptlets";

interface Policy {
  createScript(text: string): unknown;
}

/** The scriptlets' Trusted Types policy, made once per window (null: not allowed). */
function policyOf(win: Win): Policy | null {
  const key = Symbol.for(POLICY);
  const holder = win as Win & {
    [key]?: Policy | null;
    trustedTypes?: {
      createPolicy(
        name: string,
        rules: { createScript(s: string): string },
      ): Policy;
    };
  };
  if (holder[key] === undefined) {
    let policy: Policy | null = null;
    try {
      policy =
        holder.trustedTypes?.createPolicy(POLICY, { createScript: (s) => s }) ??
        null;
    } catch {
      // The page's CSP allows no policy of that name.
    }
    Object.defineProperty(holder, key, { value: policy });
  }
  return holder[key] ?? null;
}

/** Sets a node's text, a script's through a Trusted Types policy where there is one. */
function setText(win: Win, node: Node, text: string) {
  const policy = node.nodeName === "SCRIPT" ? policyOf(win) : null;
  if (policy) {
    try {
      node.textContent = policy.createScript(text) as string;
      return;
    } catch {
      // Fall back to plain text, else drop the script.
    }
  }
  try {
    node.textContent = text;
  } catch {
    if (text === "") node.parentNode?.removeChild(node);
  }
}

/**
 * Changes the text of every `nodeName` node whose text matches `pattern` (and the
 * `includes` / `excludes` arguments) with `edit`, the nodes already there and those
 * the page adds; it stops at DOMContentLoaded unless `stay` or `quitAfter` say
 * otherwise, and after `sedCount` changes.
 */
export function editNodeText(
  win: Win,
  args: readonly string[],
  from: number,
  edit: (text: string) => string,
) {
  const [nodeName = "", pattern = ""] = args;
  if (nodeName === "" || pattern === "") return;
  const name = nodeName.toUpperCase();
  const named = namedArgs(args, from);
  const matches = textTest(pattern);
  const includes =
    named.has("includes") || named.has("condition")
      ? textTest(named.get("includes") ?? named.get("condition") ?? "")
      : () => true;
  const excludes = named.has("excludes")
    ? textTest(named.get("excludes") ?? "")
    : () => false;
  const sedCount = Number(named.get("sedCount") ?? 0) || 0;
  let count = 0;

  const handle = (node: Node) => {
    if (node.nodeName.toUpperCase() !== name) return;
    const text = node.textContent ?? "";
    if (!matches(text) || !includes(text) || excludes(text)) return;
    const next = edit(text);
    if (next === text) return;
    setText(win, node, next);
    count++;
    if (sedCount > 0 && count >= sedCount) observer.disconnect();
  };
  const handleTree = (root: Node) => {
    const walker = win.document.createTreeWalker(root, 0xffffffff);
    for (let node: Node | null = root; node; node = walker.nextNode())
      handle(node);
  };

  const observer = new win.MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes) handleTree(node);
  });
  handleTree(win.document);
  if (sedCount > 0 && count >= sedCount) return;
  observer.observe(win.document, { childList: true, subtree: true });

  if (named.get("stay") === "1") return;
  const quitAfter = Number(named.get("quitAfter") ?? 0) || 0;
  const quit = () => {
    if (quitAfter > 0) win.setTimeout(() => observer.disconnect(), quitAfter);
    else observer.disconnect();
  };
  if (win.document.readyState === "loading")
    win.document.addEventListener("DOMContentLoaded", quit, { once: true });
  else quit();
}
