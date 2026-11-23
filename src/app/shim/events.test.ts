import { describe, expect, test, vi } from "vitest";
import { createEvent } from "./events";

describe("createEvent", () => {
  test("calls listeners in the order they were added, with the event's args", () => {
    const event = createEvent<[number, string]>();
    const calls: string[] = [];
    event.addListener((n, s) => void calls.push(`a ${n} ${s}`));
    event.addListener((n, s) => void calls.push(`b ${n} ${s}`));
    event.emit(1, "x");
    expect(calls).toEqual(["a 1 x", "b 1 x"]);
  });

  test("returns what each listener returned", () => {
    const event = createEvent<[], number>();
    event.addListener(() => 1);
    event.addListener(() => 2);
    expect(event.emit()).toEqual([1, 2]);
  });

  test("adds a listener once", () => {
    const event = createEvent<[]>();
    const listener = vi.fn();
    event.addListener(listener);
    event.addListener(listener);
    event.emit();
    expect(listener).toHaveBeenCalledOnce();
  });

  test("knows its listeners and forgets a removed one", () => {
    const event = createEvent<[]>();
    const listener = vi.fn();
    expect(event.hasListeners()).toBe(false);
    event.addListener(listener);
    expect(event.hasListener(listener)).toBe(true);
    expect(event.hasListeners()).toBe(true);
    event.removeListener(listener);
    expect(event.hasListener(listener)).toBe(false);
    event.emit();
    expect(listener).not.toHaveBeenCalled();
  });

  test("does not call a listener removed during the emit", () => {
    const event = createEvent<[]>();
    const later = vi.fn();
    event.addListener(() => event.removeListener(later));
    event.addListener(later);
    event.emit();
    expect(later).not.toHaveBeenCalled();
  });

  test("lets a listener remove itself during the emit", () => {
    const event = createEvent<[]>();
    const once = vi.fn(() => event.removeListener(once));
    const other = vi.fn();
    event.addListener(once);
    event.addListener(other);
    event.emit();
    event.emit();
    expect(once).toHaveBeenCalledOnce();
    expect(other).toHaveBeenCalledTimes(2);
  });

  test("goes on to the next listener when one throws, and reports the error", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const event = createEvent<[]>();
    const next = vi.fn();
    event.addListener(() => {
      throw new Error("boom");
    });
    event.addListener(next);
    event.emit();
    expect(next).toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
