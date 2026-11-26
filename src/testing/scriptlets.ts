// For the scriptlets' tests (src/app/adblock/scriptlets/): a window of its own for each
// test to patch, and a list rule's `+js(…)` arguments as the engine reads them.
import { afterEach } from "vitest";
import type { Win } from "../app/adblock/scriptlets/lib/shared";

const frames: HTMLIFrameElement[] = [];
afterEach(() => {
  for (const frame of frames.splice(0)) frame.remove();
});

/** A fresh same-origin window (an about:blank iframe), removed after the test. */
export function freshWindow(): Win {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  frames.push(frame);
  return frame.contentWindow as Win;
}

/** Runs `code` as an inline script of `win`'s document. */
export function runScript(win: Win, code: string) {
  const script = win.document.createElement("script");
  script.textContent = code;
  win.document.body.append(script);
  script.remove();
}

/**
 * The arguments of a `+js(…)` rule's body, as adblock-rust reads them
 * (`parse_scriptlet_args`): comma-separated and trimmed, `\,` for a comma, and an
 * argument in quotes taken as it is inside them.
 */
function scriptletArgs(body: string): string[] {
  const args: string[] = [];
  let rest = body.trim();
  while (rest !== "") {
    const quote = /^["'`]/.exec(rest)?.[0];
    if (quote) {
      let end = 1;
      while (
        end < rest.length &&
        !(rest[end] === quote && rest[end - 1] !== "\\")
      )
        end++;
      args.push(rest.slice(1, end).replaceAll(`\\${quote}`, quote));
      rest = rest
        .slice(end + 1)
        .trimStart()
        .replace(/^,/, "")
        .trimStart();
      continue;
    }
    const match = /^((?:\\.|[^,\\])*)(,|$)/s.exec(rest);
    const raw = match?.[1] ?? rest;
    args.push(raw.trim().replace(/\\,/g, ","));
    rest = rest.slice((match?.[0] ?? rest).length).trimStart();
  }
  return args;
}

/** The scriptlet name and arguments of a list's `domains##+js(name, …)` rule. */
export function ruleArgs(line: string): { name: string; args: string[] } {
  const body = /#\+js\((.*)\)\s*$/.exec(line)?.[1] ?? "";
  const [name = "", ...args] = scriptletArgs(body);
  return { name, args };
}
