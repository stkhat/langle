import { describe, expect, it } from "vitest";
import { createTouchMode, TOUCH_QUERY } from "./touch-mode";

/** A media query list whose answer the test changes, as a device change would. */
function fakeMedia(matches: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const asked: string[] = [];
  const list = {
    matches,
    addEventListener(
      _type: "change",
      listener: (e: { matches: boolean }) => void,
    ) {
      listeners.add(listener);
    },
    removeEventListener(
      _type: "change",
      listener: (e: { matches: boolean }) => void,
    ) {
      listeners.delete(listener);
    },
  };
  return {
    asked,
    listeners,
    match(query: string) {
      asked.push(query);
      return list as unknown as MediaQueryList;
    },
    change(to: boolean) {
      list.matches = to;
      for (const listener of [...listeners]) listener({ matches: to });
    },
  };
}

describe("createTouchMode", () => {
  it("asks whether the primary pointer cannot hover and is coarse", () => {
    const media = fakeMedia(false);
    createTouchMode(media.match);
    expect(media.asked).toEqual([TOUCH_QUERY]);
    expect(TOUCH_QUERY).toBe("(hover: none) and (pointer: coarse)");
  });

  it("is off with a mouse and on with a touch screen", () => {
    expect(createTouchMode(fakeMedia(false).match).on()).toBe(false);
    expect(createTouchMode(fakeMedia(true).match).on()).toBe(true);
  });

  it("follows changes and tells its listeners until they stop watching", () => {
    const media = fakeMedia(false);
    const mode = createTouchMode(media.match);
    const seen: boolean[] = [];
    const unwatch = mode.watch((on) => seen.push(on));
    media.change(true);
    expect(mode.on()).toBe(true);
    media.change(false);
    expect(seen).toEqual([true, false]);
    unwatch();
    media.change(true);
    expect(seen).toEqual([true, false]);
    expect(media.listeners.size).toBe(0);
  });
});
