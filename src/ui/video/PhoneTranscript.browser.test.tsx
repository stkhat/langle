import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { Cue } from "../../core/subtitles/types";
import { cleanUpMounts, mountInShadowRoot } from "../../testing/shadow-root";
import { PhoneTranscript } from "./PhoneTranscript";
import type { TranscriptProps } from "./Transcript";

const CUES: Cue[] = [
  { startMs: 0, endMs: 1000, text: "Knead the dough." },
  { startMs: 61_000, endMs: 62_000, text: "Let it rest." },
];

const props = (patch: Partial<TranscriptProps> = {}): TranscriptProps => ({
  cues: CUES,
  spans: [null, null],
  translations: ["生地をこねる。", ""],
  showTranslation: true,
  highlight: { new: true, learning: true, known: false },
  current: 1,
  onSeek: () => {},
  onWordEnter: () => {},
  onWordLeave: () => {},
  onWordClick: () => {},
  onSelectStart: () => {},
  onSelect: () => undefined,
  learningLang: "en",
  nativeLang: "ja",
  touch: true,
  ...patch,
});

afterEach(cleanUpMounts);

describe("the transcript on a phone", () => {
  test("under the video: a heading, times beside the lines, the playing card marked", async () => {
    const screen = await mountInShadowRoot(
      <PhoneTranscript {...props()} column={false} height={300} />,
    );
    await expect
      .element(screen.getByRole("heading", { name: "Transcript" }))
      .toBeVisible();
    await expect.element(screen.getByText("1:01")).toBeVisible();
    await expect.element(screen.getByText("生地をこねる。")).toBeVisible();
    const playing = screen.container.querySelector('[aria-current="true"]');
    expect(playing?.textContent).toContain("Let it rest.");
  });

  test("a tap on a card seeks to it", async () => {
    const onSeek = vi.fn();
    const screen = await mountInShadowRoot(
      <PhoneTranscript {...props({ onSeek })} column={false} />,
    );
    await userEvent.click(screen.getByText("Knead the dough."));
    expect(onSeek).toHaveBeenCalledWith(0);
  });

  test("the fold button hides and shows the cards, with a 44px target", async () => {
    const screen = await mountInShadowRoot(
      <PhoneTranscript {...props()} column={false} />,
    );
    const hide = screen.getByRole("button", { name: "Hide transcript" });
    expect(hide.element().getBoundingClientRect().height).toBe(44);
    await userEvent.click(hide);
    await expect
      .element(screen.getByText("Knead the dough."))
      .not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Show transcript" }),
    );
    await expect.element(screen.getByText("Knead the dough.")).toBeVisible();
  });

  test("in the column beside a fullscreen video there is no fold button", async () => {
    const screen = await mountInShadowRoot(
      <PhoneTranscript {...props()} column />,
    );
    await expect
      .element(screen.getByRole("heading", { name: "Transcript" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Hide transcript" }))
      .not.toBeInTheDocument();
  });
});
