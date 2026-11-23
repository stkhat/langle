# Translate-ahead and the translator part: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build steps 1 and 2 of [docs/specs/mobile-translation.md](../specs/mobile-translation.md) "Build order": translate-ahead with cancelling in the shared translation queue and video session, and one part that hides the browser's Translator API, so the phone app can later plug in its own translator.

**Architecture:** The content scripts' one translation queue (`src/content/translate/queue.ts`) gets a fifth priority, `ahead`, between `hover` and `list`, and an optional `AbortSignal` per request. The video session (`src/content/video/session.ts`) asks, at `ahead`, for the cards that start in the next 10 seconds of video time and aborts the requests a seek leaves behind. A new `TranslatorBackend` (`src/content/translate/backend.ts`) wraps today's Translator API functions; every caller goes through `translatorBackend()`, which step 3 (the app, not in this plan) will make choose the app's bridge when it exists.

**Tech stack:** TypeScript, WXT + Preact, Vitest (unit project in Node, browser project on real Chromium and Firefox).

**Step 3 is not planned here.** The app's translation hosts and bridge provider wait for the app's skeleton, the extension API shim and the engine boundary ([docs/notes/mobile.md](../notes/mobile.md) "Next steps" 3). The spec's test that a recorded 429 answer makes a video choose on-device translation goes with step 3 too.

---

## Before you start
- Read [CLAUDE.md](../../CLAUDE.md), [docs/testing.md](../testing.md) and the spec's "Requests and priorities".
- Work in a worktree of its own off `origin/main` (superpowers:using-git-worktrees), on a branch named `claude/translate-ahead`. The worktree this plan was written in holds unrelated mobile notes.
- Commit after each task, as the plan says (no Claude attribution in messages). Run `npm run verify` before pushing; the pre-push hook refuses a tree it has not passed on. Open a **draft** PR.
- While iterating, run only the touched test files:
  - Unit: `npx vitest run --project unit <file>`
  - Browser on Chromium: `VITEST_BROWSERS=chromium npx vitest run --project browser <file>`
  - Browser on Firefox, sandbox off: `npm run test:browser:firefox -- <file>`

## Files
| File | Change |
| --- | --- |
| `src/content/translate/queue.ts` | `ahead` priority; `TranslateOptions` with `signal`; jobs count their requests and are dropped when all were aborted before starting |
| `src/content/translate/queue.test.ts` | tests for the above |
| `src/content/video/session.ts` | `translateAhead`, `showTranslation`, `Watch.ahead`, `AHEAD_MS`; default translator availability from the backend |
| `src/content/video/session.browser.test.ts` | "translating ahead" tests; two existing expectations updated |
| `src/content/translate/backend.ts` | new: `TranslatorBackend`, `builtInBackend`, `translatorBackend` |
| `src/content/translate/backend.test.ts` | new |
| `src/content/lookup/lookup.ts`, `src/entrypoints/popup/main.tsx`, `src/entrypoints/options/sections/Languages.tsx`, `src/check/start.ts`, `src/entrypoints/wordlist/main.tsx` | go through `translatorBackend()` |
| `docs/specs/architecture.md` | the queue's order and cancelling; the backend in the parts table and code layout |

---

### Task 1: `ahead` priority in the queue

**Files:**

- Modify: `src/content/translate/queue.ts`
- Test: `src/content/translate/queue.test.ts`

- [ ] **Step 1: Write the failing tests.** Add inside `describe("createTranslationQueue", …)`, after the test "takes the lists last, after the hover card":

```ts
it("takes cards about to play after the hover card and before the lists", async () => {
  const t = heldTranslator();
  const queue = createTranslationQueue(() => t.provider);
  const first = queue.translate("first", "hover", EN_JA);
  await flush();
  const all = [
    first,
    queue.translate("list 1", "list", EN_JA),
    queue.translate("ahead 1", "ahead", EN_JA),
    queue.translate("window 1", "window", EN_JA),
    queue.translate("hover 1", "hover", EN_JA),
    queue.translate("ahead 2", "ahead", EN_JA),
    queue.translate("subtitle 1", "subtitle", EN_JA),
  ];
  await flush();
  await t.releaseAll();
  await Promise.all(all);
  expect(t.started).toEqual([
    "first",
    "subtitle 1",
    "window 1",
    "hover 1",
    "ahead 1",
    "ahead 2",
    "list 1",
  ]);
});

it("moves a card about to play up to the subtitle line when it starts playing", async () => {
  const t = heldTranslator();
  const queue = createTranslationQueue(() => t.provider);
  const first = queue.translate("first", "hover", EN_JA);
  await flush();
  const all = [
    first,
    queue.translate("a", "ahead", EN_JA),
    queue.translate("b", "ahead", EN_JA),
    queue.translate("b", "subtitle", EN_JA),
  ];
  await flush();
  await t.releaseAll();
  await Promise.all(all);
  expect(t.started).toEqual(["first", "b", "a"]);
});
```

- [ ] **Step 2: Run them and see them fail.** `npx vitest run --project unit src/content/translate/queue.test.ts`. Expected: the first test fails on the order (Vitest does not type-check, and `RANK["ahead"]` is undefined, so "ahead" texts sort wrongly); `npm run typecheck` also reports `"ahead"` as not a `TranslationPriority`.

- [ ] **Step 3: Add the priority.** In `queue.ts`, replace the `TranslationPriority` comment, type and `RANK`:

```ts
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
```

- [ ] **Step 4: Run the tests and see them pass.** Same command. Expected: all tests in the file pass.

- [ ] **Step 5: Commit.**

```bash
git add src/content/translate/queue.ts src/content/translate/queue.test.ts
git commit -m "Add an ahead priority to the translation queue"
```

### Task 2: Cancelling requests in the queue

**Files:**

- Modify: `src/content/translate/queue.ts`
- Test: `src/content/translate/queue.test.ts`

- [ ] **Step 1: Write the failing tests.** Add after the tests of Task 1:

```ts
it("gives an aborted request nothing at once and never starts a job nobody waits for", async () => {
  const t = heldTranslator();
  const queue = createTranslationQueue(() => t.provider);
  const first = queue.translate("first", "hover", EN_JA);
  await flush();
  const controller = new AbortController();
  const dropped = queue.translate("dropped", "ahead", EN_JA, {
    signal: controller.signal,
  });
  await flush();
  controller.abort();
  expect(await dropped).toBeUndefined();
  await t.releaseAll();
  expect(await first).toBe("ja(first)");
  expect(t.started).toEqual(["first"]);
});

it("gives nothing to a request whose signal is already aborted, and starts nothing", async () => {
  const t = heldTranslator();
  const queue = createTranslationQueue(() => t.provider);
  const late = queue.translate("late", "ahead", EN_JA, {
    signal: AbortSignal.abort(),
  });
  expect(await late).toBeUndefined();
  await flush();
  expect(t.started).toEqual([]);
});

it("keeps a job that another request still waits for", async () => {
  const t = heldTranslator();
  const queue = createTranslationQueue(() => t.provider);
  const first = queue.translate("first", "hover", EN_JA);
  await flush();
  const controller = new AbortController();
  const aborted = queue.translate("shared", "ahead", EN_JA, {
    signal: controller.signal,
  });
  const waiting = queue.translate("shared", "subtitle", EN_JA);
  await flush();
  controller.abort();
  expect(await aborted).toBeUndefined();
  await t.releaseAll();
  expect(await first).toBe("ja(first)");
  expect(await waiting).toBe("ja(shared)");
  expect(t.started).toEqual(["first", "shared"]);
});

it("finishes and keeps a job that started before its request was aborted", async () => {
  const t = heldTranslator();
  const queue = createTranslationQueue(() => t.provider);
  const controller = new AbortController();
  const aborted = queue.translate("started", "ahead", EN_JA, {
    signal: controller.signal,
  });
  await flush();
  expect(t.started).toEqual(["started"]);
  controller.abort();
  expect(await aborted).toBeUndefined();
  await t.releaseAll();
  // Kept: asked for again, it is not translated again.
  expect(await queue.translate("started", "hover", EN_JA)).toBe("ja(started)");
  expect(t.started).toEqual(["started"]);
});

it("leaves a newer job for the same text alone when an old request is aborted", async () => {
  const queue = createTranslationQueue(() => ({
    // Cannot open the first time: that job ends with no translation.
    open: vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true),
    translate: async (text) => `ja(${text})`,
  }));
  const controller = new AbortController();
  const old = queue.translate("text", "ahead", EN_JA, {
    signal: controller.signal,
  });
  expect(await old).toBeUndefined();
  const fresh = queue.translate("text", "hover", EN_JA);
  controller.abort();
  expect(await fresh).toBe("ja(text)");
});
```

- [ ] **Step 2: Run them and see them fail.** `npx vitest run --project unit src/content/translate/queue.test.ts`. Expected: "dropped" is started, and the aborted requests wait for their translation instead of resolving at once (Vitest does not type-check the fourth argument; `npm run typecheck` does).

- [ ] **Step 3: Implement cancelling.** In `queue.ts`:

Add after `TranslationPair`:

```ts
export interface TranslateOptions {
  /**
   * Aborting it resolves this request with no translation at once. The queue drops the
   * job when no request waits for it any more and it has not started; a job that has
   * started finishes and is kept.
   */
  signal?: AbortSignal;
}
```

In `TranslationQueue`, give `translate` the options (and say so in its comment):

```ts
  /** `text` translated; undefined when no translation is available (now) or the request was aborted. */
  translate(
    text: string,
    priority: TranslationPriority,
    pair: TranslationPair,
    options?: TranslateOptions,
  ): Promise<string | undefined>;
```

Add to `interface Job`, after `order`:

```ts
/** The requests waiting for it; one without a signal never leaves. */
waiters: number;
/** Handed to the translator: it finishes even when nobody waits any more. */
started: boolean;
/** Every request left before it started: it is out of the queue. */
dropped: boolean;
```

Add this sentence to the doc comment of `createTranslationQueue`, after "…is asked for again next time.": "A request can be aborted: it gets no translation at once, and a job whose requests were all aborted before it started is dropped."

In `run()`, mark the job before translating:

```ts
    for (let job = next(); job; job = next()) {
      job.started = true;
      let translated: string | undefined;
```

In `admit()`, stop when the job was dropped while its translator opened:

```ts
if (job.dropped) return;
if (!ready) return finish(job, undefined);
```

Add after `admit()`:

```ts
/**
 * A request for `job` was aborted: drops the job when it was the last one waiting,
 * unless it started or already ended (a newer job may hold its key by then).
 */
function leave(job: Job) {
  job.waiters -= 1;
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
```

Replace `translate` in the returned object:

```ts
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
```

- [ ] **Step 4: Run the tests and see them pass.** Same command, then `npm run typecheck`. Expected: all pass, the earlier ones too.

- [ ] **Step 5: Commit.**

```bash
git add src/content/translate/queue.ts src/content/translate/queue.test.ts
git commit -m "Let translation requests be aborted"
```

### Task 3: Translate ahead in the video session

**Files:**

- Modify: `src/content/video/session.ts`
- Test: `src/content/video/session.browser.test.ts`

The rules (spec "Requests and priorities"): only while Langle follows the video (on, no ad showing); the window is the cards whose start lies in the next 10 seconds of video time; the window is worked out again only when its cards or the playing card change, never on every frame, so a card that got no translation is asked again at the next change, not in a loop; the playing card that got no translation is asked again at the same moment, at `subtitle`.

- [ ] **Step 1: Write the failing tests.** Add after `describe("the built-in translator", …)`:

```ts
describe("translating ahead", () => {
  const builtIn = (cues: Cue[]) => ({
    vid1: captionsOf(cues, { source: "builtIn", lang: "ja", cues: [] }),
  });
  /** At 0 s the window is 0–10 s; at 3 s it is 3–13 s (the clip is 4 s long). */
  const SPREAD: Cue[] = [
    { startMs: 0, endMs: 1000, text: "Mix the flour." },
    { startMs: 5000, endMs: 6000, text: "Add the water." },
    { startMs: 12000, endMs: 13000, text: "Bake it." },
  ];
  /** A translator that records what it is asked, and answers with `answer`. */
  function recording(
    answer = (text: string) => `ja(${text})` as string | undefined,
  ) {
    const asked: string[] = [];
    const translator: TranslationProvider = {
      translate: async (text) => {
        asked.push(text);
        return answer(text);
      },
    };
    return { asked, translator };
  }

  it("translates the cards that start in the next 10 seconds before they play", async () => {
    const { asked, translator } = recording();
    const { state, video } = await start(builtIn(SPREAD), {
      translatorAvailable: true,
      translator,
    });
    await ready(state);
    await expect.poll(() => state().translations[1]).toBe("ja(Add the water.)");
    expect(asked).not.toContain("Bake it.");
    await seekTo(video, 3);
    await expect.poll(() => state().translations[2]).toBe("ja(Bake it.)");
  });

  it("drops the cards a seek leaves behind before they are translated", async () => {
    const started: string[] = [];
    const held: (() => void)[] = [];
    const translator: TranslationProvider = {
      translate(text) {
        started.push(text);
        return new Promise((resolve) =>
          held.push(() => resolve(`ja(${text})`)),
        );
      },
    };
    const cues: Cue[] = [
      { startMs: 0, endMs: 1000, text: "Mix the flour." },
      { startMs: 1000, endMs: 2000, text: "Add the water." },
      { startMs: 13000, endMs: 14000, text: "Bake it." },
    ];
    const { state, video } = await start(builtIn(cues), {
      translatorAvailable: true,
      translator,
    });
    await ready(state);
    // The playing card is translated; "Add the water." waits ahead.
    await expect.poll(() => started).toEqual(["Mix the flour."]);
    // At 3.5 s the window is 3.5–13.5 s: "Add the water." is behind, "Bake it." comes in.
    await seekTo(video, 3.5);
    held.shift()!();
    await expect.poll(() => started).toEqual(["Mix the flour.", "Bake it."]);
    held.shift()!();
    await expect.poll(() => state().translations[2]).toBe("ja(Bake it.)");
    expect(started).not.toContain("Add the water.");
  });

  it("asks once for a card that stays in the window across a seek", async () => {
    const { asked, translator } = recording();
    const { state, video } = await start(builtIn(SPREAD), {
      translatorAvailable: true,
      translator,
    });
    await ready(state);
    await expect.poll(() => state().translations[1]).toBe("ja(Add the water.)");
    // 0.5 s: the window lost "Mix the flour." but keeps "Add the water."
    await seekTo(video, 0.5);
    await seekTo(video, 0.7);
    expect(asked.filter((t) => t === "Add the water.")).toHaveLength(1);
  });

  it("asks again for a card that got no translation only when the window changes", async () => {
    const { asked, translator } = recording(() => undefined);
    const { state, video } = await start(builtIn(SPREAD), {
      translatorAvailable: true,
      translator,
    });
    await ready(state);
    const water = () => asked.filter((t) => t === "Add the water.").length;
    await expect.poll(water).toBe(1);
    // 0.5 s: the window lost "Mix the flour.", so it is worked out again.
    await seekTo(video, 0.5);
    await expect.poll(water).toBe(2);
    // The same cards: not asked again, however often the session updates.
    await seekTo(video, 0.6);
    await seekTo(video, 0.7);
    expect(water()).toBe(2);
  });

  it("asks for nothing ahead while Langle is off", async () => {
    const { asked, translator } = recording();
    const { state, video, session } = await start(builtIn(SPREAD), {
      translatorAvailable: true,
      translator,
    });
    await ready(state);
    session.app.setEnabled(false);
    await seekTo(video, 3);
    expect(asked).not.toContain("Bake it.");
    session.app.setEnabled(true);
    await expect.poll(() => asked).toContain("Bake it.");
  });
});
```

- [ ] **Step 2: Run them and see them fail.** `VITEST_BROWSERS=chromium npx vitest run --project browser src/content/video/session.browser.test.ts -t "translating ahead"`. Expected: they time out or fail on the counts, because nothing is asked for ahead yet ("asks for nothing ahead while Langle is off" times out on its last line).

- [ ] **Step 3: Implement it.** In `session.ts`:

Add before `export interface VideoDeps`:

```ts
/** How far ahead, in video time, the built-in translator translates cards (mobile-translation.md). */
const AHEAD_MS = 10_000;

/** The first index of `cues` (sorted by start) that starts at or after `ms`. */
function firstStartingAt(cues: readonly { startMs: number }[], ms: number) {
  let low = 0;
  let high = cues.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (cues[middle]!.startMs < ms) low = middle + 1;
    else high = middle;
  }
  return low;
}
```

In `interface Watch`, after `translations`:

```ts
/** Cards about to play, asked for ahead and not answered yet, each with its abort. */
ahead: Map<number, AbortController>;
/** The window and playing card `translateAhead` last worked on. */
aheadKey: string;
```

In `open()`, where the `Watch` is built, after `translations: new Map(),`:

```ts
      ahead: new Map(),
      aheadKey: "",
```

and right after `watch = w;`:

```ts
// Moving on to another video aborts what was asked for ahead.
w.controller.signal.addEventListener(
  "abort",
  () => {
    for (const controller of w.ahead.values()) controller.abort();
    w.ahead.clear();
  },
  { once: true },
);
```

At the end of `update()`, after the `played` line:

```ts
if (state.translationSource === "builtIn")
  translateAhead(w, following ? video.currentTime * 1000 : undefined);
```

`state` and `following` are the values `update()` reads at its top; `translationSource` does not change while a video is open.

Replace `translateCard` with these three functions:

```ts
function translateCard(w: Watch, index: number) {
  let pending = w.translations.get(index);
  if (!pending) {
    const cue = store.get().cues[index];
    const asked =
      cue && subtitlePair
        ? lookup.translator.translate(flat(cue.text), "subtitle", subtitlePair)
        : Promise.resolve(undefined);
    pending = asked;
    w.translations.set(index, asked);
    void asked.then((text) => {
      // No translation (the translator was not ready): `translateAhead` asks again.
      if (!text && w.translations.get(index) === asked)
        w.translations.delete(index);
      showTranslation(w, index, text);
    });
  }
  return pending;
}

/** Shows a card's built-in translation in the transcript, and under the subtitle while it plays. */
function showTranslation(w: Watch, index: number, text: string | undefined) {
  if (watch !== w || !text) return;
  const state = store.get();
  const translations = [...state.translations];
  translations[index] = text;
  store.set({
    translations,
    subtitleTranslation:
      state.current === index ? text : state.subtitleTranslation,
  });
}

/**
 * Translate-ahead (mobile-translation.md: "Requests and priorities"). At `timeMs`
 * (undefined while Langle does not follow the video), asks at `ahead` for the cards
 * that start in the next AHEAD_MS and have no translation or request yet, asks again
 * for the playing card if it got none, and aborts the requests for cards that left
 * the window. Works only when the window or the playing card changed, so a card that
 * got no translation is asked again then, never on every frame. New requests go out
 * before old ones are aborted, so a text in both keeps its job.
 */
function translateAhead(w: Watch, timeMs: number | undefined) {
  const pair = subtitlePair;
  if (!pair) return;
  const { cues, translations, current } = store.get();
  const from = timeMs === undefined ? 0 : firstStartingAt(cues, timeMs);
  const to =
    timeMs === undefined ? 0 : firstStartingAt(cues, timeMs + AHEAD_MS + 1);
  const key = `${from}:${to}:${current}`;
  if (key === w.aheadKey) return;
  w.aheadKey = key;
  if (current >= 0 && !translations[current] && !w.translations.has(current))
    void translateCard(w, current);
  for (let index = from; index < to; index++) {
    if (translations[index] || w.translations.has(index) || w.ahead.has(index))
      continue;
    const controller = new AbortController();
    w.ahead.set(index, controller);
    void lookup.translator
      .translate(flat(cues[index]!.text), "ahead", pair, {
        signal: controller.signal,
      })
      .then((text) => {
        if (w.ahead.get(index) === controller) w.ahead.delete(index);
        showTranslation(w, index, text);
      });
  }
  for (const [index, controller] of w.ahead)
    if (index < from || index >= to || w.translations.has(index)) {
      w.ahead.delete(index);
      controller.abort();
    }
}
```

- [ ] **Step 4: Run the new tests and see them pass.** Same command. Expected: all five pass.

- [ ] **Step 5: Update the two existing tests that ahead requests change.**
  - In "translates the cues as they play" (`describe("the built-in translator")`), delete the last line, `expect(translated).not.toContain(CUES[1]!.text);`: the card between is now translated ahead, which the new tests cover.
  - In "translates the playing subtitle line before a hover card's definition" (`describe("translating English definitions")`), the cards after the first are now asked for ahead, below the hover card. Make the final expectation:

```ts
await expect
  .poll(() => started)
  .toEqual([
    "You figure out the yeast.",
    "Knead the dough.",
    "To come to understand",
    "It is a tangy loaf.",
  ]);
```

- [ ] **Step 6: Run the whole file on both browsers.**
  - `VITEST_BROWSERS=chromium npx vitest run --project browser src/content/video/session.browser.test.ts`
  - With the sandbox off: `npm run test:browser:firefox -- src/content/video/session.browser.test.ts`

  Expected: all pass (the review traced no other test that uses the built-in source). If another one fails, debug it (superpowers:systematic-debugging); change an expectation only when the failure is the extra ahead texts, with the reason in a comment.

- [ ] **Step 7: Commit.**

```bash
git add src/content/video/session.ts src/content/video/session.browser.test.ts
git commit -m "Translate the cards of the next 10 seconds ahead"
```

### Task 4: The translator part

**Files:**
- Create: `src/content/translate/backend.ts`
- Create: `src/content/translate/backend.test.ts`
- Modify: `src/content/lookup/lookup.ts`, `src/content/video/session.ts`, `src/entrypoints/popup/main.tsx`, `src/entrypoints/options/sections/Languages.tsx`, `src/check/start.ts`, `src/entrypoints/wordlist/main.tsx`

- [ ] **Step 1: Write the failing test.** `src/content/translate/backend.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { builtInBackend } from "./backend";
import type { TranslatorGlobal } from "./translator";

/** A browser whose Translator API has the pair's model on the device. */
const withModel: TranslatorGlobal = {
  Translator: {
    availability: async () => "available",
    create: async () => ({ translate: async (text: string) => `ja(${text})` }),
  },
};

describe("builtInBackend", () => {
  it("translates with the browser's Translator API", async () => {
    const backend = builtInBackend(withModel);
    expect(await backend.available("en", "ja")).toBe(true);
    expect(await backend.create("en", "ja").translate("A cat.")).toBe(
      "ja(A cat.)",
    );
  });

  it("has no translator where the browser has no Translator API", async () => {
    const backend = builtInBackend({});
    expect(await backend.available("en", "ja")).toBe(false);
    expect(
      await backend.create("en", "ja").translate("A cat."),
    ).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and see it fail.** `npx vitest run --project unit src/content/translate/backend.test.ts`. Expected: FAIL, `./backend` does not exist.

- [ ] **Step 3: Write the part.** `src/content/translate/backend.ts`:

```ts
import {
  builtInTranslatorAvailable,
  createBuiltInTranslator,
  downloadModelsOnFirstActivation,
  downloadTranslationModels,
  type TranslationProvider,
  type TranslatorGlobal,
} from "./translator";

/**
 * Where this platform's translations come from (mobile-translation.md: "Parts"): the
 * browser's built-in translator in the extension; the app's translation host in the
 * phone app, chosen by whether the app's bridge exists (not built yet).
 */
export interface TranslatorBackend {
  /** The translator for `from` → `to`; nothing is loaded until it is used. */
  create(from: string, to: string): TranslationProvider;
  /** Whether `from` → `to` can be translated here, now or after a download. */
  available(from: string, to: string): Promise<boolean>;
  /** Starts the downloads Langle translates `learning` → `native` with. */
  downloadModels(learning: string, native: string): Promise<void>;
  /** Starts them at the first user activation on `target`; returns the disarm. */
  downloadOnFirstActivation(
    target: EventTarget,
    languages: () => { learning: string; native: string },
    options?: { now?: boolean },
  ): () => void;
}

/** The browser's built-in translator (Translator API), over `translator.ts`. */
export function builtInBackend(
  g: TranslatorGlobal = globalThis as TranslatorGlobal,
): TranslatorBackend {
  return {
    create: (from, to) => createBuiltInTranslator(from, to, g),
    available: (from, to) => builtInTranslatorAvailable(from, to, g),
    downloadModels: (learning, native) =>
      downloadTranslationModels(learning, native, g),
    downloadOnFirstActivation: (target, languages, options) =>
      downloadModelsOnFirstActivation(target, languages, options, g),
  };
}

/** This platform's translator part. */
export const translatorBackend = (): TranslatorBackend => builtInBackend();
```

- [ ] **Step 4: Run the test and see it pass.** Same command. Expected: PASS.

- [ ] **Step 5: Send every caller through `translatorBackend()`.** No behaviour changes.
  - `src/content/lookup/lookup.ts`: replace the import of `createBuiltInTranslator` and `downloadModelsOnFirstActivation` with `import { translatorBackend } from "../translate/backend";` (keep `type TranslationProvider` from `../translate/translator`). In `LookupDeps`, the comment of `createTranslator` becomes `/** Default: this platform's translator (\`translatorBackend\`). */`. Replace `deps.createTranslator ?? createBuiltInTranslator` with `deps.createTranslator ?? translatorBackend().create`, and `downloadModelsOnFirstActivation(document, () => {` with `translatorBackend().downloadOnFirstActivation(document, () => {`.
  - `src/content/video/session.ts`: replace `import { builtInTranslatorAvailable } from "../translate/translator";` with `import { translatorBackend } from "../translate/backend";`. In `VideoDeps`, the comment of `translatorAvailable` becomes `/** Default: asks this platform's translator (\`translatorBackend\`). */`. Replace `deps.translatorAvailable ?? builtInTranslatorAvailable` with `deps.translatorAvailable ?? translatorBackend().available`.
  - `src/entrypoints/popup/main.tsx`: import `translatorBackend` from `../../content/translate/backend` instead of `downloadModelsOnFirstActivation`; call `translatorBackend().downloadOnFirstActivation(document, () => ({ learning: learningLang, native: nativeLang }), { now: true })`.
  - `src/entrypoints/options/sections/Languages.tsx`: import `translatorBackend` from `../../../content/translate/backend` instead of `downloadTranslationModels`; call `void translatorBackend().downloadModels(next.learningLang, next.nativeLang);`.
  - `src/check/start.ts`: import `translatorBackend` from `../content/translate/backend`; `pairChosen: (learning, native) => void translatorBackend().downloadModels(learning, native),`.
  - `src/entrypoints/wordlist/main.tsx`: import `translatorBackend` from `../../content/translate/backend`; `createTranslator: translatorBackend().create,`.

- [ ] **Step 6: Check and test.** Run `npm run check` (types, lint, format, knip), then `npm test` and the browser files that use these entry points: `VITEST_BROWSERS=chromium npx vitest run --project browser src/content src/entrypoints`. Expected: all pass; knip reports no unused export.

- [ ] **Step 7: Commit.**

```bash
git add src/content/translate/backend.ts src/content/translate/backend.test.ts src/content/lookup/lookup.ts src/content/video/session.ts src/entrypoints/popup/main.tsx src/entrypoints/options/sections/Languages.tsx src/check/start.ts src/entrypoints/wordlist/main.tsx
git commit -m "Put the built-in translator behind one part"
```

### Task 5: Spec and verification

**Files:**
- Modify: `docs/specs/architecture.md`

- [ ] **Step 1: Update the architecture spec.**
  - "Definitions translated at display time", the line "One queue per page with the subtitle translator: current subtitle line, then the window, then the hover card, then lists" becomes: "One queue per page with the subtitle translator: current subtitle line, then the window, then the hover card, then the cards about to play (the next 10 seconds of video time, [mobile-translation.md](mobile-translation.md)), then lists. A request can be aborted; a job is dropped when every request for it was aborted before it started".
  - Parts table, `TranslationProvider` row, implementation column: append "; created through `TranslatorBackend` (`content/translate/backend.ts`), the platform's translator part".
  - "Choosing a translation", after "Articles have no site translation…": "- With the built-in translator, the cards that start in the next 10 seconds of video time are translated ahead, below the hover card; a seek drops the requests it leaves behind".

- [ ] **Step 2: Verify everything.** With the sandbox off: `npm run verify`. Expected: it passes (about 75 s).

- [ ] **Step 3: Check in Chrome.** In the user's Chrome with the check build ([docs/development.md](../development.md) "Checking in your own Chrome"). The new code runs only when a video's subtitles use the built-in translator, which YouTube rarely does (it has `tlang`), so check on Netflix (`netflix.com/watch/70274124`; Netflix has no `tlang`):
  - Through `langle:check-settings`, set the native language to one Langle offers that the title has no subtitle track for, so the session chooses the built-in translator. Confirm that it did (the dictionary window or the transcript says "Machine translation"). Restore the setting afterwards.
  - With the model downloaded: the transcript shows translations of the next cards before they play; a seek far ahead fills the new cards within a few seconds; nothing is translated while Langle is turned off from the toolbar, and turning it on again starts it.
  - With the model not downloaded yet (a pair Chrome has not downloaded, if one is offered): English shows and nothing breaks; once the download ends, the cards fill in.
  - Read the check build's error log, fix or explain every entry, then clear it.

- [ ] **Step 4: Commit, push, open a draft PR.**

```bash
git add docs/specs/architecture.md
git commit -m "Describe translate-ahead and the translator part in the spec"
git push -u origin claude/translate-ahead
gh pr create --draft --title "Translate ahead and the translator part" --body "Steps 1 and 2 of docs/specs/mobile-translation.md: an ahead priority and cancelling in the translation queue, translate-ahead in the video session, and the built-in translator behind one part."
```
