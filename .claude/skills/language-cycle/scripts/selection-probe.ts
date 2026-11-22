// The selection check's Nano probe (references/selection.md): a content script that only
// selection-probe-build.ts's throwaway check build has, on the study server's own pages
// (http://127.0.0.1:8766/run/<batch>). It asks the on-device model with Langle's own
// prompt, provider and answer check, one prompt and one batch at a time, saving each
// answer as it comes: opened again, it goes on where it stopped.
import { chromePromptApi } from "../../../../src/content/explain/chrome-prompt-api";
import type { Answer } from "../../../../src/core/explain/answer";
import { answerVersion, ask } from "../../../../src/core/explain/ask";
import type { ExplainInput } from "../../../../src/core/explain/prompt";
import type { ExplanationProvider } from "../../../../src/core/explain/provider";

/** batches/<name>.json */
export interface ProbeBatch {
  name: string;
  learning: string;
  native: string;
  items: { id: string; input: ExplainInput }[];
}

/** results/<name>.json */
export interface ProbeResult {
  name: string;
  /** The provider and the browser's major version. */
  model: string;
  results: {
    id: string;
    answerVersion: string;
    ms: number;
    answer?: Answer;
    lines?: number;
    error?: string;
  }[];
}

const PORT = "8766";
const TIMEOUT_MS = 60_000;
/** The model is gone or stuck: stop, so that the batch can be opened again later. */
const ERRORS_IN_A_ROW = 5;

/**
 * Asks what `before` has no answer to. Returns a last line for the page: it starts
 * with "done", or says why it stopped. Saves nothing when the model cannot run.
 */
export async function runBatch(o: {
  batch: ProbeBatch;
  before: ProbeResult | undefined;
  provider: ExplanationProvider | undefined;
  save(result: ProbeResult): Promise<void>;
  say(line: string): void;
}): Promise<string> {
  const { batch, before, provider } = o;
  if (!provider) return "stopped: this browser has no on-device model API";
  const available = await provider.availability(batch);
  if (available !== "ready") return `stopped: the model is ${available}`;

  const model = `${provider.name} ${provider.version}`;
  const answered = new Map(
    before?.results.filter((r) => r.answer).map((r) => [r.id, r]),
  );
  for (const { id, input } of batch.items) {
    const kept = answered.get(id);
    if (!kept) continue;
    // Never mix two prompts' or two models' answers in one result.
    if (kept.answerVersion !== answerVersion(input) || before?.model !== model)
      return "stopped: the kept answers are another prompt's or model's; use another --label";
  }

  const result: ProbeResult = { name: batch.name, model, results: [...answered.values()] };
  let failed = 0;
  for (const { id, input } of batch.items) {
    if (answered.has(id)) continue;
    o.say(`running: ${result.results.length} of ${batch.items.length}`);
    const started = performance.now();
    const base = { id, answerVersion: answerVersion(input) };
    const took = () => Math.round(performance.now() - started);
    try {
      const { answer, lines } = await ask(provider, input, AbortSignal.timeout(TIMEOUT_MS));
      result.results.push({ ...base, ms: took(), answer, lines });
      failed = 0;
    } catch (error) {
      result.results.push({ ...base, ms: took(), error: String(error) });
      failed++;
    }
    await o.save(result);
    if (failed >= ERRORS_IN_A_ROW)
      return `stopped: ${failed} errors in a row (${result.results.at(-1)?.error})`;
  }
  const errors = result.results.filter((r) => r.error).length;
  return `done: ${result.results.length - errors} answers, ${errors} errors, of ${batch.items.length}`;
}

/** Runs the batch the page is for, and says on the page how far it is. */
export async function startProbe() {
  if (location.port !== PORT) return;
  const name = location.pathname.split("/")[2] ?? "";
  const status = document.querySelector("#langle-probe");
  if (!/^[a-z0-9-]+$/.test(name) || !status) return;
  const say = (line: string) => {
    status.textContent = line;
    document.title = line;
  };
  async function read<T>(path: string): Promise<T | undefined> {
    const response = await fetch(path);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return (await response.json()) as T;
  }
  async function save(result: ProbeResult) {
    const response = await fetch(`/result/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
    if (!response.ok) throw new Error(`Saving: HTTP ${response.status}`);
  }
  say("waiting: another batch runs");
  try {
    // One batch at a time across the server's tabs.
    const last = await navigator.locks.request("langle-selection-probe", async () => {
      const batch = await read<ProbeBatch>(`/batch/${name}`);
      if (!batch) return "stopped: no such batch";
      const before = await read<ProbeResult>(`/result/${name}`);
      return runBatch({ batch, before, provider: chromePromptApi(), save, say });
    });
    say(last);
  } catch (error) {
    say(`stopped: ${String(error)}`);
  }
}
