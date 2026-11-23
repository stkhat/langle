// One translated-caption request (`tlang=ja`) under stated conditions, the same steps on every
// engine (docs/notes/mobile.md "Translated captions"). Prints one JSON line.
//   node mobile/prototypes/tlang-check.mjs <webview|gecko|wk> <fresh|keep> <wait seconds> [video id] [block off]
// fresh: the app's data is cleared first (an empty first caption body gets one reload, reported
// as `reloaded`). wait: at least this long between the player response
// and the translated request; 0 asks as soon as the original English track is there.
// webview and gecko need ANDROID_SERIAL (an emulator: `fresh` clears data) and scripts/mobile/env.sh,
// wk needs SIM_UDID and WK_APP (the built LangleProbe.app). Run with the sandbox off.
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const [engine, data, waitArg, video = "iG9CE55wbtY", block = "on"] =
  process.argv.slice(2);
const { ANDROID_SERIAL = "", SIM_UDID = "", WK_APP = "" } = process.env;
const here = path.dirname(fileURLToPath(import.meta.url));
const url = `https://m.youtube.com/watch?v=${video}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = (cmd, ...args) =>
  execFileSync(cmd, args, {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 32 * 1024 * 1024,
  });
const adb = (...args) => run("adb", ...args);
const simctl = (...args) => run("xcrun", "simctl", ...args);

/** An Android prototype: started with intents, read from logcat. */
function android(pkg, command) {
  if (!ANDROID_SERIAL.startsWith("emulator-"))
    throw new Error("ANDROID_SERIAL must name an emulator");
  return {
    open(clear) {
      if (clear) adb("shell", "pm", "clear", pkg);
      else adb("shell", "am", "force-stop", pkg);
      adb("logcat", "-c");
      adb(
        "shell",
        `am start -n ${pkg}/.MainActivity --es url '${url}' --es block ${block}`,
      );
    },
    log: () => adb("logcat", "-d", "-s", "LangleProbe:*"),
    command,
    close: () => adb("shell", "am", "force-stop", pkg),
  };
}

function webview() {
  const pkg = "dev.langle.probe.webview";
  const options = {
    captions: `{ languageCode: "en" }`,
    captionsJa: `{ languageCode: "en", translationLanguage: { languageCode: "ja", languageName: "Japanese" } }`,
  };
  return android(pkg, (name) =>
    run(
      "node",
      path.join(here, "cdp.mjs"),
      pkg,
      `(() => { const p = document.querySelector("#movie_player"); p.mute?.();
        ${name === "captions" ? `if (p.getPlayerState?.() !== 1) { p.playVideo?.(); return "playing"; }` : ""}
        p.loadModule?.("captions");
        p.setOption("captions", "track", ${options[name]}); return "ok"; })()`,
    ),
  );
}

function gecko() {
  const pkg = "dev.langle.probe.gecko";
  return android(pkg, (name) =>
    adb("shell", `am start -n ${pkg}/.MainActivity --es cmd ${name}`),
  );
}

function wk() {
  if (!SIM_UDID || !WK_APP) throw new Error("SIM_UDID and WK_APP are needed");
  const id = "dev.langle.probe.wk";
  let text = "";
  let stream;
  const stop = () => {
    try {
      simctl("terminate", SIM_UDID, id);
    } catch {
      /* not running */
    }
  };
  return {
    async open(clear) {
      stop();
      stream?.kill();
      text = "";
      if (clear) {
        simctl("uninstall", SIM_UDID, id);
        simctl("install", SIM_UDID, WK_APP);
      }
      stream = spawn("xcrun", [
        ...["simctl", "spawn", SIM_UDID, "log", "stream"],
        ...["--level", "info", "--style", "compact"],
        ...["--predicate", 'subsystem == "dev.langle.probe"'],
      ]);
      stream.stdout.on("data", (chunk) => (text += chunk));
      await sleep(1500);
      simctl("launch", SIM_UDID, id, "-url", url, "-block", block);
    },
    log: () => text,
    command: (name) =>
      simctl("spawn", SIM_UDID, "notifyutil", "-p", `dev.langle.probe.${name}`),
    close() {
      stream?.kill();
      stop();
    },
  };
}

const app = { webview, gecko, wk }[engine]();

/** The page's messages of a type so far. */
function messages(type) {
  return [...app.log().matchAll(/ page main [^{\n]*(\{.*\})/g)].flatMap(
    ([, json]) => {
      try {
        const message = JSON.parse(json);
        return message.type === type ? [message] : [];
      } catch {
        return [];
      }
    },
  );
}

async function until(find, seconds) {
  const end = Date.now() + seconds * 1000;
  for (;;) {
    const found = find();
    if (found) return found;
    if (Date.now() > end) return undefined;
    await sleep(1000);
  }
}

const result = {
  at: new Date().toISOString(),
  engine,
  data,
  wait: Number(waitArg),
  block,
  video,
};
const original = () =>
  messages("timedtext").find(
    (m) => !m.tlang && m.lang === "en" && m.status === 200 && m.bytes > 0,
  );
const emptyOriginal = () =>
  messages("timedtext").find((m) => !m.tlang && m.lang === "en" && !m.bytes);

/** Loads the video and gets its English track; returns when the player response came. */
async function load(clear) {
  await app.open(clear);
  const response = await until(() => messages("playerResponse")[0], 120);
  if (!response) throw new Error("no player response");
  const since = Date.now();
  result.playability = response.status;
  // The player asks by itself once it plays and has its PO token. Asked before that it gets an
  // empty body and never asks again, so wait for it first; it may also pick another track or none.
  await until(() => original() ?? emptyOriginal(), 30);
  for (let i = 0; i < 4 && !original() && !emptyOriginal(); i++) {
    try {
      app.command("captions");
    } catch {
      /* the player is not there yet */
    }
    await until(() => original() ?? emptyOriginal(), 12);
  }
  result.originalAfterSeconds = Math.round((Date.now() - since) / 1000);
  return since;
}

try {
  let since = await load(data === "fresh");
  // The player does not ask again after an empty body (its PO token was not ready).
  if (!original() && emptyOriginal()) {
    result.reloaded = true;
    since = await load(false);
  }
  if (!original()) throw new Error("no original English track");
  await sleep(Math.max(0, result.wait * 1000 - (Date.now() - since)));
  app.command("captionsJa");
  result.afterSeconds = Math.round((Date.now() - since) / 1000);
  const answer = await until(
    () => messages("timedtext").find((m) => m.tlang === "ja"),
    30,
  );
  if (!answer) throw new Error("no translated request");
  result.status = answer.status;
  result.bytes = answer.bytes;
} catch (error) {
  result.error = String(error.message ?? error).split("\n")[0];
} finally {
  try {
    // Every timedtext request of the run, so a burst or an earlier refusal shows.
    result.requests = messages("timedtext").map(
      (m) => `${m.lang}${m.tlang ? `>${m.tlang}` : ""}:${m.status}:${m.bytes}`,
    );
    app.close();
  } catch (error) {
    result.error ??= String(error.message ?? error).split("\n")[0];
  }
}
console.log(JSON.stringify(result));
process.exit(0);
