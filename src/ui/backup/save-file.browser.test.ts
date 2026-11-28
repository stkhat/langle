import { afterEach, describe, expect, it, vi } from "vitest";
import type { SharedFile } from "../../core/app-host";
import { saveFile } from "./save-file";

afterEach(() => vi.restoreAllMocks());

/** The anchors `saveFile` clicks, with the file each one's Blob URL holds. */
function watchDownloads() {
  const clicked: { name: string; url: string; inDocument: boolean }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({
      name: this.download,
      url: this.href,
      inDocument: this.isConnected,
    });
  });
  return clicked;
}

describe("saveFile", () => {
  it("downloads through a Blob URL where there is no appHost", async () => {
    const clicked = watchDownloads();
    await saveFile(
      "langle.csv",
      "word,meaning\r\n",
      "text/csv;charset=utf-8",
      {},
    );
    expect(clicked).toHaveLength(1);
    const [link] = clicked;
    expect(link!.name).toBe("langle.csv");
    expect(link!.url).toMatch(/^blob:/);
    expect(link!.inDocument).toBe(true);
    const blob = await (await fetch(link!.url)).blob();
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(await blob.text()).toBe("word,meaning\r\n");
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("hands the file to the app's share sheet where appHost exists, and downloads nothing", async () => {
    const clicked = watchDownloads();
    const shared: SharedFile[] = [];
    const appHost = {
      openPage: () => Promise.resolve(),
      shareFile: (file: SharedFile) => {
        shared.push(file);
        // The first went to a target; the sheet closed without one for the second.
        return Promise.resolve(shared.length === 1);
      },
    };
    expect(
      await saveFile("langle-backup.json", '{"a":1}', undefined, { appHost }),
    ).toBe(true);
    expect(
      await saveFile(
        "anki.txt",
        "#separator:tab\n",
        "text/plain;charset=utf-8",
        {
          appHost,
        },
      ),
    ).toBe(false);
    expect(shared).toEqual([
      { name: "langle-backup.json", mime: "application/json", text: '{"a":1}' },
      {
        name: "anki.txt",
        mime: "text/plain;charset=utf-8",
        text: "#separator:tab\n",
      },
    ]);
    expect(clicked).toEqual([]);
  });

  it("fails as the share sheet does", async () => {
    const appHost = {
      openPage: () => Promise.resolve(),
      shareFile: () => Promise.reject(new Error("no sheet")),
    };
    await expect(
      saveFile("a.json", "{}", undefined, { appHost }),
    ).rejects.toThrow("no sheet");
  });
});
