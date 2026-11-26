// The lists' rules for m.youtube.com's player response (pinned in
// fixtures/youtube-rules.txt) take its ads out and leave the captions Langle reads.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import captionTracks from "../../../core/subtitles/fixtures/youtube/captionTracks.json";
import { createYouTubeAdapter } from "../../../content/video/youtube/adapter";
import { installYouTubeHooks } from "../../../content/video/youtube/page";
import type { PlatformAdapter } from "../../../content/video/platform";
import { freshWindow, ruleArgs, runScript } from "../../../testing/scriptlets";
import {
  createTestPage,
  VIDEO_ID,
  type TestPage,
} from "../../../testing/youtube-page";
import rules from "./fixtures/youtube-rules.txt?raw";
import jsonPrune from "./json-prune";
import setConstant from "./set-constant";
import type { Win } from "./lib/shared";

const SCRIPTLETS: Record<string, (win: Win, ...args: string[]) => void> = {
  "json-prune": jsonPrune,
  set: setConstant,
};
const RULES = rules
  .split("\n")
  .filter((line) => line.includes("##+js("))
  .map(ruleArgs);

/** A window with every pinned rule of the scriptlet `name` on. */
function windowWith(name: string) {
  const win = freshWindow();
  const scriptlet = SCRIPTLETS[name];
  if (!scriptlet) throw new Error(`no scriptlet ${name}`);
  const own = RULES.filter((rule) => rule.name === name);
  expect(own.length).toBeGreaterThan(0);
  for (const rule of own) scriptlet(win, ...rule.args);
  return win;
}

const AD_FIELDS = ["adPlacements", "playerAds", "adSlots"];
/** The fixture's response with the ad fields a player response carries. */
const WITH_ADS = JSON.stringify({
  ...captionTracks,
  adPlacements: [
    { adPlacementRenderer: { config: { kind: "AD_PLACEMENT_KIND_START" } } },
  ],
  playerAds: [{ playerLegacyDesktopWatchAdsRenderer: { playerAdParams: {} } }],
  adSlots: [
    {
      adSlotRenderer: {
        adSlotMetadata: { slotType: "SLOT_TYPE_PLAYER_BYTES" },
      },
    },
  ],
  adBreakHeartbeatParams: "Q0FB",
});

/** What the page gets: the ad fields gone, the captions as they were. */
function expectWithoutAds(response: unknown) {
  const value = response as Record<string, unknown>;
  for (const field of AD_FIELDS) expect(value).not.toHaveProperty(field);
  expect(value.captions).toEqual(captionTracks.captions);
  // Not among the rule's paths: the player's heartbeat, not an ad.
  expect(value.adBreakHeartbeatParams).toBe("Q0FB");
}

let uninstall: () => void;
beforeAll(() => {
  uninstall = installYouTubeHooks();
});
afterAll(() => uninstall());

let page: TestPage | undefined;
let adapter: PlatformAdapter | undefined;
afterEach(() => {
  adapter?.dispose();
  page?.remove();
  adapter = page = undefined;
});

/** The adapter's caption capture on an m.youtube.com page with `playerResponse`. */
async function captureFrom(playerResponse: unknown) {
  page = createTestPage({ playerResponse: structuredClone(playerResponse) });
  adapter = createYouTubeAdapter({
    href: () => `https://m.youtube.com/watch?v=${VIDEO_ID}`,
    playerRequestWaitMs: 100,
    captureTimeoutMs: 1000,
    pollMs: 20,
  });
  adapter.setPageGate(true);
  const tracks = (await adapter.tracks()).map((track) => track.id);
  const captions = await adapter.loadCaptions({
    learningLang: "en",
    nativeLang: "ja",
    translatorAvailable: false,
  });
  return { tracks, captions };
}

describe("the lists' m.youtube.com player response rules", () => {
  it("json-prune takes the ads out of the parsed response; the captions are still found", async () => {
    const win = windowWith("json-prune");
    const parsed: unknown = win.JSON.parse(WITH_ADS);
    expectWithoutAds(parsed);
    const { tracks, captions } = await captureFrom(parsed);
    expect(tracks).toEqual([".en", "a.en", ".ja", ".es"]);
    expect(captions?.track.lang).toBe("en");
    expect(captions?.cues.length).toBeGreaterThan(0);
  });

  it("json-prune takes them out of the player request's answer too", async () => {
    const win = windowWith("json-prune");
    const answered: unknown = await new win.Response(WITH_ADS).json();
    expectWithoutAds(answered);
    expect((await captureFrom(answered)).tracks).toContain(".en");
  });

  it("set keeps them out of the response in the page's HTML", async () => {
    const win = windowWith("set");
    runScript(win, `var ytInitialPlayerResponse = ${WITH_ADS};`);
    const inline = (win as unknown as Record<string, unknown>)
      .ytInitialPlayerResponse;
    // What the page reads (the fields stay as undefined-valued accessors).
    expectWithoutAds(JSON.parse(JSON.stringify(inline)));
    expect(
      (await captureFrom(JSON.parse(JSON.stringify(inline)))).tracks,
    ).toContain(".en");
  });
});
