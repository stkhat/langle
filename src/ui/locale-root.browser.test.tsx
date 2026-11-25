// The roots of Langle's UI in the interface language: a new render on a change, `lang`
// and `dir`, and the layout mirrored for Arabic (architecture "Interface language").
import { render } from "preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it } from "vitest";
import { setUiLocale, t, type LocaleMessages } from "../i18n/t";
import { BackChevronIcon } from "./icons";
import { followDocumentLocale, PageLocale, UiRoot } from "./locale-root";
import { root } from "./styles";
import { Switch } from "./Switch";

/** A test-only Arabic locale: two messages, the rest falls back to English. */
const AR: LocaleMessages = {
  "settings.languages.uiSame": "مثل لغتك",
  "dict.sentences": {
    zero: "لا جمل",
    one: "جملة واحدة",
    two: "جملتان",
    few: "{count} جمل",
    many: "{count} جملة",
    other: "{count} جملة",
  },
};

let host: HTMLElement | undefined;
afterEach(() => {
  if (host) render(null, host);
  host?.remove();
  host = undefined;
  setUiLocale("en");
  document.documentElement.removeAttribute("lang");
  document.documentElement.removeAttribute("dir");
});

function mount(ui: preact.JSX.Element) {
  host = document.createElement("div");
  document.body.append(host);
  render(ui, host);
  return host;
}

function Label() {
  return <span data-label>{t("settings.languages.uiSame")}</span>;
}

/** A part with state of its own, as a page's: a count that clicks raise. */
function Counter() {
  const [n, setN] = useState(0);
  return (
    <button type="button" data-counter onClick={() => setN((m) => m + 1)}>
      {n} {t("dict.sentences", { count: n })}
    </button>
  );
}

describe("UiRoot", () => {
  it("renders the UI again in the new language, with its lang and dir", async () => {
    const el = mount(
      <UiRoot>
        <Label />
      </UiRoot>,
    );
    const wrapper = el.firstElementChild as HTMLElement;
    expect(wrapper.lang).toBe("en");
    expect(wrapper.dir).toBe("ltr");
    expect(el.querySelector("[data-label]")!.textContent).toBe(
      "Same as your language",
    );
    setUiLocale("ar", AR);
    await expect
      .poll(() => el.querySelector("[data-label]")!.textContent)
      .toBe("مثل لغتك");
    const next = el.firstElementChild as HTMLElement;
    expect(next.lang).toBe("ar");
    expect(next.dir).toBe("rtl");
    // `display: contents`: the wrapper adds no box to the layout.
    expect(getComputedStyle(next).display).toBe("contents");
  });

  it("breaks Korean between words and Japanese between phrases, wherever the text sits", async () => {
    const el = mount(
      <UiRoot>
        <p data-ui>{t("settings.languages.uiSame")}</p>
        <p data-ko lang="ko">
          클라우드
        </p>
        <p data-ja lang="ja">
          一切ありません
        </p>
      </UiRoot>,
    );
    const breaking = (selector: string) =>
      getComputedStyle(el.querySelector(selector)!).wordBreak;
    expect(breaking("[data-ui]")).toBe("normal");
    expect(breaking("[data-ko]")).toBe("keep-all");
    expect(breaking("[data-ja]")).toBe("auto-phrase");
    setUiLocale("ko", {});
    await expect.poll(() => breaking("[data-ui]")).toBe("keep-all");
  });

  it("mirrors the layout for Arabic and keeps it for English", async () => {
    const el = mount(
      <UiRoot>
        <div style={root({ display: "block", width: "200px" })}>
          <Switch checked label="On" onToggle={() => {}} />
          <BackChevronIcon />
        </div>
      </UiRoot>,
    );
    const knobSide = () => {
      const track = el.querySelector("[role=switch]")!.getBoundingClientRect();
      const knob = el
        .querySelector("[role=switch] span")!
        .getBoundingClientRect();
      return knob.left - track.left < track.right - knob.right
        ? "left"
        : "right";
    };
    const chevron = () => getComputedStyle(el.querySelector("svg")!).transform;
    expect(knobSide()).toBe("right");
    expect(chevron()).toBe("none");
    setUiLocale("ar", AR);
    await expect.poll(knobSide).toBe("left");
    expect(chevron()).toBe("matrix(-1, 0, 0, 1, 0, 0)");
    // `all: initial` on a part's root leaves the direction inherited.
    expect(
      getComputedStyle(el.querySelector("[role=switch]")!.parentElement!)
        .direction,
    ).toBe("rtl");
  });
});

describe("PageLocale", () => {
  it("renders the page again in the new language and keeps its state", async () => {
    const el = mount(<PageLocale app={<Counter />} />);
    const button = el.querySelector<HTMLButtonElement>("[data-counter]")!;
    button.click();
    button.click();
    await expect.poll(() => button.textContent).toBe("2 2 sentences");
    setUiLocale("ar", AR);
    await expect
      .poll(() => el.querySelector("[data-counter]")!.textContent)
      .toBe("2 جملتان");
  });
});

describe("followDocumentLocale", () => {
  it("puts the language and direction on <html>", () => {
    followDocumentLocale();
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
    setUiLocale("ar", AR);
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });
});
