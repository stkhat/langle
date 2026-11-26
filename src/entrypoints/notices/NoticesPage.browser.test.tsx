import data from "virtual:langle-notices";
import { describe, expect, it } from "vitest";
import { cleanup, render } from "vitest-browser-preact";
import { NoticesPage } from "./NoticesPage";

describe("NoticesPage", () => {
  it("shows every pack Langle downloads with its license and every source", async () => {
    const screen = await render(<NoticesPage data={data} />);
    expect(data.packs.length).toBeGreaterThan(5);
    for (const pack of data.packs) {
      const card = screen.getByRole("region", {
        name: pack.title,
        exact: true,
      });
      await expect.element(card).toBeVisible();
      const text = card.element().textContent;
      expect(text).toContain(pack.package);
      expect(text).toContain(pack.license.name);
      for (const source of pack.sources) {
        const link = card.getByRole("link", {
          name: source.title,
          exact: true,
        });
        await expect.element(link).toHaveAttribute("href", source.url);
        expect(text).toContain(`${source.title} · ${source.license.name}`);
        expect(text).toContain(source.used);
      }
    }
  });

  it("links to the licenses of the bundled libraries and fonts", async () => {
    const screen = await render(<NoticesPage data={data} />);
    await expect
      .element(screen.getByRole("link", { name: "THIRD_PARTY_LICENSES.txt" }))
      .toHaveAttribute("href", "/THIRD_PARTY_LICENSES.txt");
  });

  it("carries the full notices of the WordNet-style licenses", async () => {
    const screen = await render(<NoticesPage data={data} />);
    const notices = screen.getByRole("region", { name: "License notices" });
    await expect.element(notices).toBeVisible();
    expect(data.notices.map((notice) => notice.title)).toEqual(
      expect.arrayContaining([expect.stringContaining("WordNet")]),
    );
    const text = notices.element().textContent;
    for (const notice of data.notices) {
      expect(text).toContain(notice.title);
      expect(text).toContain(notice.text);
    }
  });

  it("credits the phone app's filter lists and ad-blocking engine, in the app only", async () => {
    const list = (title: string, license: string) => ({
      title,
      url: `https://${title.toLowerCase().replace(/ /g, "")}.example/`,
      by: `The ${title} authors`,
      license: { name: license, url: "https://licence.example/" },
      used: `rules from ${title}`,
    });
    const app = {
      ...data,
      adBlocking: {
        lists: [
          list("EasyList", "GPL 3.0 or later, or CC BY-SA 3.0 or later"),
          list("uBlock filters", "GPL 3.0"),
        ],
        engine: list("adblock-rust 0.13.6", "MPL 2.0"),
      },
    };
    expect(
      (await render(<NoticesPage data={data} />))
        .getByRole("region", { name: "Ad blocking" })
        .query(),
    ).toBeNull();
    cleanup();

    const screen = await render(<NoticesPage data={app} />);
    const card = screen.getByRole("region", { name: "Ad blocking" });
    await expect.element(card).toBeVisible();
    const text = card.element().textContent ?? "";
    expect(text).toContain(
      "The app blocks ads with these filter lists, which it downloads unchanged from their own sites, and with the engine below them.",
    );
    const sources = [...app.adBlocking.lists, app.adBlocking.engine];
    expect(
      card
        .getByRole("listitem")
        .elements()
        .map((li) => li.querySelector("a")?.textContent),
    ).toEqual(sources.map((source) => source.title));
    for (const source of sources) {
      await expect
        .element(card.getByRole("link", { name: source.title, exact: true }))
        .toHaveAttribute("href", source.url);
      expect(text).toContain(`${source.title} · ${source.license.name}`);
      expect(text).toContain(`Used for: ${source.used}`);
    }
  });
});
