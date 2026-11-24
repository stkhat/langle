import { describe, expect, it } from "vitest";
import {
  createRecognizer,
  LONG_PRESS_MS,
  SLOP_PX,
  TAP_MAX_MS,
  type Gesture,
  type TouchInput,
} from "./gestures";

/** Feeds every input to a new recognizer and returns what each gave. */
function run(inputs: TouchInput[]): (Gesture | undefined)[] {
  const recognizer = createRecognizer();
  return inputs.map((input) => recognizer.feed(input));
}

const gestures = (inputs: TouchInput[]) =>
  run(inputs).filter((g): g is Gesture => g !== undefined);

describe("createRecognizer", () => {
  it("has the spec's thresholds", () => {
    expect([TAP_MAX_MS, LONG_PRESS_MS, SLOP_PX]).toEqual([500, 500, 10]);
  });

  it("recognizes a tap: released soon, within the slop, at the release point", () => {
    expect(
      run([
        { type: "down", x: 100, y: 200, t: 0 },
        { type: "move", x: 104, y: 203, t: 80 },
        { type: "up", x: 106, y: 204, t: 120 },
      ]),
    ).toEqual([undefined, undefined, { type: "tap", x: 106, y: 204 }]);
  });

  it("gives nothing for a slow release that is not a long-press", () => {
    // The long-press timer has not fired (or fired late): the press is neither.
    expect(
      gestures([
        { type: "down", x: 100, y: 200, t: 0 },
        { type: "up", x: 100, y: 200, t: TAP_MAX_MS },
      ]),
    ).toEqual([]);
  });

  it("recognizes a long-press, then a drag, then the release", () => {
    expect(
      run([
        { type: "down", x: 100, y: 200, t: 0 },
        { type: "tick", t: LONG_PRESS_MS - 1 },
        { type: "move", x: 103, y: 201, t: 300 },
        { type: "tick", t: LONG_PRESS_MS },
        { type: "move", x: 150, y: 201, t: 700 },
        { type: "move", x: 190, y: 230, t: 800 },
        { type: "up", x: 192, y: 231, t: 900 },
      ]),
    ).toEqual([
      undefined,
      // A timer that fires early is not a long-press yet.
      undefined,
      undefined,
      { type: "longPress", x: 103, y: 201 },
      { type: "drag", x: 150, y: 201 },
      { type: "drag", x: 190, y: 230 },
      { type: "release", x: 192, y: 231 },
    ]);
  });

  it("releases a long-press without a drag", () => {
    expect(
      gestures([
        { type: "down", x: 10, y: 20, t: 0 },
        { type: "tick", t: 600 },
        { type: "up", x: 11, y: 20, t: 1500 },
      ]),
    ).toEqual([
      { type: "longPress", x: 10, y: 20 },
      { type: "release", x: 11, y: 20 },
    ]);
  });

  it("gives scroll for a move past the slop before the long-press, then nothing until the next press", () => {
    expect(
      run([
        { type: "down", x: 100, y: 200, t: 0 },
        { type: "move", x: 100, y: 200 + SLOP_PX, t: 50 },
        { type: "move", x: 100, y: 260, t: 100 },
        { type: "tick", t: LONG_PRESS_MS },
        { type: "up", x: 100, y: 300, t: 200 },
        { type: "down", x: 50, y: 50, t: 1000 },
        { type: "up", x: 50, y: 50, t: 1100 },
      ]),
    ).toEqual([
      undefined,
      { type: "scroll" },
      undefined,
      undefined,
      undefined,
      undefined,
      { type: "tap", x: 50, y: 50 },
    ]);
  });

  it("treats a move just inside the slop as still pressed", () => {
    expect(
      gestures([
        { type: "down", x: 0, y: 0, t: 0 },
        { type: "move", x: 6, y: 7, t: 50 },
        { type: "up", x: 6, y: 7, t: 100 },
      ]),
    ).toEqual([{ type: "tap", x: 6, y: 7 }]);
  });

  it.each<[string, TouchInput[]]>([
    ["while pressed", [{ type: "down", x: 1, y: 1, t: 0 }]],
    [
      "after the long-press",
      [
        { type: "down", x: 1, y: 1, t: 0 },
        { type: "tick", t: 500 },
      ],
    ],
    [
      "while dragging",
      [
        { type: "down", x: 1, y: 1, t: 0 },
        { type: "tick", t: 500 },
        { type: "move", x: 60, y: 1, t: 600 },
      ],
    ],
    [
      "after a scroll",
      [
        { type: "down", x: 1, y: 1, t: 0 },
        { type: "move", x: 1, y: 80, t: 50 },
      ],
    ],
    ["before any press", []],
  ])(
    "cancel %s drops the gesture: nothing until the next press",
    (_, before) => {
      const recognizer = createRecognizer();
      for (const input of before) recognizer.feed(input);
      const after = [
        recognizer.feed({ type: "cancel", t: 650 }),
        recognizer.feed({ type: "tick", t: 700 }),
        recognizer.feed({ type: "move", x: 90, y: 90, t: 710 }),
        recognizer.feed({ type: "up", x: 90, y: 90, t: 720 }),
      ];
      expect(after).toEqual([undefined, undefined, undefined, undefined]);
      recognizer.feed({ type: "down", x: 5, y: 5, t: 800 });
      expect(recognizer.feed({ type: "up", x: 5, y: 5, t: 850 })).toEqual({
        type: "tap",
        x: 5,
        y: 5,
      });
    },
  );

  it.each<[string, TouchInput[]]>([
    ["pressed", []],
    ["long-pressed", [{ type: "tick", t: 500 }]],
    [
      "dragging",
      [
        { type: "tick", t: 500 },
        { type: "move", x: 80, y: 10, t: 550 },
      ],
    ],
  ])("a second finger while one is %s cancels", (_, held) => {
    const recognizer = createRecognizer();
    recognizer.feed({ type: "down", x: 10, y: 10, t: 0 });
    for (const input of held) recognizer.feed(input);
    expect(recognizer.feed({ type: "down", x: 200, y: 10, t: 560 })).toBe(
      undefined,
    );
    expect(
      [
        recognizer.feed({ type: "tick", t: 1100 }),
        recognizer.feed({ type: "move", x: 90, y: 10, t: 1110 }),
        recognizer.feed({ type: "up", x: 200, y: 10, t: 1120 }),
        recognizer.feed({ type: "up", x: 90, y: 10, t: 1130 }),
      ].filter(Boolean),
    ).toEqual([]);
  });
});
