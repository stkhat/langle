import type { ModelDownload, TranslationProvider } from "./translator";

/**
 * Who waits for a translation, the most urgent first: the playing subtitle line, the
 * dictionary window, the hover card (a tap on a phone), the cards about to play, the
 * lists' rows (architecture.md: "Definitions translated at display time";
 * mobile-translation.md: "Requests and priorities").
 */
export type TranslationPriority =
  "subtitle" | "window" | "hover" | "ahead" | "list";

const RANK: Readonly<Record<TranslationPriority, number>> = {
  subtitle: 0,
  window: 1,
  hover: 2,
  ahead: 3,
  list: 4,
};

export interface TranslationPair {
  from: string;
  to: string;
}

export interface TranslateOptions {
  /**
   * Aborting it resolves this request with no translation at once. The queue drops the
   * job when no request waits for it any more and it has not started; a job that has
   * started finishes and is kept.
   */
  signal?: AbortSignal;
}

/** The content script's one way to the browser's translator. */
export interface TranslationQueue {
  /**
   * `text` translated; undefined when no translation is available (now) or the
   * request was aborted.
   */
  translate(
    text: string,
    priority: TranslationPriority,
    pair: TranslationPair,
    options?: TranslateOptions,
  ): Promise<string | undefined>;
  /**
   * Calls `listener` with every new translation (not one kept from before), whoever
   * asked for it; returns an unsubscribe.
   */
  onTranslated(listener: TranslationListener): () => void;
  /** The pair's model download as its translator reports it (`TranslationProvider.watchDownload`). */
  watchDownload(
    pair: TranslationPair,
    listener: (download: ModelDownload | undefined) => void,
  ): () => void;
}

type TranslationListener = (
  text: string,
  pair: TranslationPair,
  translated: string,
) => void;

/** How many translations the queue keeps for texts asked for again. */
const KEPT = 500;

interface Job {
  key: string;
  pair: TranslationPair;
  text: string;
  rank: number;
  /** Arrival order: first come, first served within a priority. */
  order: number;
  /** The requests waiting for it; one without a signal never leaves. */
  waiters: number;
  /** Handed to the translator: it finishes even when nobody waits any more. */
  started: boolean;
  /** Every request left before it started: it is out of the queue. */
  dropped: boolean;
  result: Promise<string | undefined>;
  resolve(translated: string | undefined): void;
}

/**
 * One queue per content script over the browser's translator (one translator per
 * language pair, created by `translatorFor` on first use): one translation at a time,
 * the highest priority first and in arrival order within a priority. A request waits
 * for its pair's translator to open (its model may be downloading) outside the queue,
 * so other pairs go on translating meanwhile; once it is ready, the request joins the
 * queue, and when it cannot open, the request gets no translation. Requests for a
 * text that is waiting or being translated share its translation; the latest
 * translations are kept, so a text asked for again is not translated again. A text
 * that got no translation (the model not there yet) is asked for again next time.
 * A request can be aborted: it gets no translation at once, and a job whose requests
 * were all aborted before it started is dropped.
 * The lists' requests never start a model download (a request of theirs waits for
 * another to start it); every new translation is told to the listeners.
 */
export function createTranslationQueue(
  translatorFor: (from: string, to: string) => TranslationProvider,
): TranslationQueue {
  const translators = new Map<string, TranslationProvider>();
  const kept = new Map<string, string>();
  /** Jobs waiting or being translated, by key. */
  const jobs = new Map<string, Job>();
  const waiting: Job[] = [];
  const listeners = new Set<TranslationListener>();
  let order = 0;
  let running = false;

  const pairKey = ({ from, to }: TranslationPair) => `${from}>${to}`;

  function translator(pair: TranslationPair) {
    const key = pairKey(pair);
    let found = translators.get(key);
    if (!found) {
      found = translatorFor(pair.from, pair.to);
      translators.set(key, found);
    }
    return found;
  }

  function keep(key: string, translated: string) {
    kept.delete(key);
    kept.set(key, translated);
    if (kept.size > KEPT) kept.delete(kept.keys().next().value!);
  }

  /** The waiting job to translate next. */
  function next(): Job | undefined {
    let best = 0;
    for (let i = 1; i < waiting.length; i++) {
      const job = waiting[i]!;
      const current = waiting[best]!;
      if (
        job.rank < current.rank ||
        (job.rank === current.rank && job.order < current.order)
      )
        best = i;
    }
    return waiting.splice(best, 1)[0];
  }

  function finish(job: Job, translated: string | undefined) {
    jobs.delete(job.key);
    if (translated) keep(job.key, translated);
    job.resolve(translated || undefined);
    if (translated)
      for (const listener of [...listeners])
        try {
          listener(job.text, job.pair, translated);
        } catch (error) {
          console.warn("Langle: a translation listener failed", error);
        }
  }

  async function run() {
    if (running) return;
    running = true;
    for (let job = next(); job; job = next()) {
      job.started = true;
      let translated: string | undefined;
      try {
        translated = await translator(job.pair).translate(job.text);
      } catch {
        translated = undefined;
      }
      finish(job, translated);
    }
    running = false;
  }

  /** Queues `job` once its pair's translator is ready, without holding the queue. */
  async function admit(job: Job) {
    const provider = translator(job.pair);
    let ready: boolean;
    try {
      ready = provider.open
        ? await provider.open(job.rank === RANK.list ? { download: false } : {})
        : true;
    } catch {
      ready = false;
    }
    if (job.dropped) return;
    if (!ready) return finish(job, undefined);
    waiting.push(job);
    // Started after this turn, so requests that became ready together go by priority.
    queueMicrotask(() => void run());
  }

  /**
   * A request for `job` was aborted: drops the job when it was the last one waiting,
   * unless it started or already ended (a newer job may hold its key by then).
   */
  function leave(job: Job) {
    job.waiters -= 1;
    // The key check covers an abort landing between a job's end and its waiter's callback.
    if (job.waiters > 0 || job.started || jobs.get(job.key) !== job) return;
    job.dropped = true;
    jobs.delete(job.key);
    const index = waiting.indexOf(job);
    if (index >= 0) waiting.splice(index, 1);
    job.resolve(undefined);
  }

  /** `job`'s translation, or undefined at once when `signal` aborts. */
  function waitFor(job: Job, signal: AbortSignal): Promise<string | undefined> {
    return new Promise((resolve) => {
      const onAbort = () => {
        resolve(undefined);
        leave(job);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      void job.result.then((translated) => {
        signal.removeEventListener("abort", onAbort);
        resolve(translated);
      });
    });
  }

  return {
    watchDownload(pair, listener) {
      return translator(pair).watchDownload?.(listener) ?? (() => {});
    },
    onTranslated(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    translate(text, priority, pair, { signal } = {}) {
      if (signal?.aborted) return Promise.resolve(undefined);
      const key = `${pairKey(pair)}:${text}`;
      const done = kept.get(key);
      if (done !== undefined) {
        keep(key, done);
        return Promise.resolve(done);
      }
      const rank = RANK[priority];
      let job = jobs.get(key);
      if (job) {
        job.rank = Math.min(job.rank, rank);
        job.waiters += 1;
      } else {
        let resolve!: Job["resolve"];
        const result = new Promise<string | undefined>((r) => (resolve = r));
        job = {
          key,
          pair,
          text,
          rank,
          order: order++,
          waiters: 1,
          started: false,
          dropped: false,
          result,
          resolve,
        };
        jobs.set(key, job);
        void admit(job);
      }
      return signal ? waitFor(job, signal) : job.result;
    },
  };
}
