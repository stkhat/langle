// Renders Langle's mark, src/ui/brand/icon.svg, into the toolbar icons: the colored one
// WXT picks up from public/icon/<size>.png, and the gray one the background shows while
// Langle is switched off, public/icon-off/<size>.png (src/background/toolbar-icon.ts),
// and the marked one a new site in the learning language shows, public/icon-new/ at the
// toolbar's 16 and 32 px (src/background/site-mark.ts; ui.md "Articles site by site":
// mark A). Run after editing the SVG: node scripts/make-icons.ts
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { OFF_FILTER } from "../src/ui/brand/off-filter.ts";

const SIZES = [16, 32, 48, 128];
const svg = readFileSync(
  new URL("../src/ui/brand/icon.svg", import.meta.url),
  "utf8",
);
if (!svg.includes('width="128" height="128"'))
  throw new Error("icon.svg no longer says its size as 128×128");

/**
 * Mark A, as the mock draws it over the icon: an orange dot half the icon wide whose
 * box sits 6% of the icon out past its top right corner, with a ring in the toolbar's
 * color around it. The ring is 1/16 of the icon, 1 px at 16 and 2 px at 32, as Chrome
 * draws the mock's (it rounds border widths down to whole pixels). In the PNG the ring
 * is cut out of the icon (transparent), so it takes the toolbar's color in light and
 * dark themes alike.
 */
function withMark(source: string): string {
  const cx = 128 * 0.81;
  const cy = 128 * 0.19;
  const outer = 128 * 0.25;
  const dot = outer - 128 / 16;
  const open = source.indexOf(">", source.indexOf("<svg")) + 1;
  const close = source.lastIndexOf("</svg>");
  return [
    source.slice(0, open),
    `<mask id="mark-cut"><rect width="128" height="128" fill="#fff"/><circle cx="${cx}" cy="${cy}" r="${outer}" fill="#000"/></mask>`,
    `<g mask="url(#mark-cut)">`,
    source.slice(open, close),
    `</g><circle cx="${cx}" cy="${cy}" r="${dot}" fill="#F76707"/>`,
    source.slice(close),
  ].join("");
}

const VARIANTS = [
  { dir: "../public/icon/", filter: "none", svg, sizes: SIZES },
  { dir: "../public/icon-off/", filter: OFF_FILTER, svg, sizes: SIZES },
  {
    dir: "../public/icon-new/",
    filter: "none",
    svg: withMark(svg),
    sizes: [16, 32],
  },
];

const browser = await chromium.launch();
try {
  for (const variant of VARIANTS) {
    const out = new URL(variant.dir, import.meta.url);
    mkdirSync(out, { recursive: true });
    for (const size of variant.sizes) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
      });
      const sized = variant.svg.replace(
        'width="128" height="128"',
        `width="${size}" height="${size}"`,
      );
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block;filter:${variant.filter}}</style>${sized}`,
      );
      await page.screenshot({
        path: new URL(`${size}.png`, out).pathname,
        omitBackground: true,
      });
      await page.close();
    }
  }
} finally {
  await browser.close();
}
