# PDF viewer spike (S0, measured 2026-11-28)

Answers to the five questions of [pdf](../plans/pdf.md) "S0 Spike". They were measured with a check build on a branch that is never merged (`claude/pdf-spike`): pdfjs-dist **6.5.438** (the latest stable), a bare `pdf.html` viewer (canvas pages, pdf.js `TextLayer`, words painted with the CSS Custom Highlight API), and a popup harness that logs what it can see of the active tab and fetch.

Where it ran:
- **Playwright's Chromium 158.0.8127.18** (headless, 1280×800, device pixel ratio 1), the extension loaded through CDP `Extensions.loadUnpacked`. `activeTab` was granted with CDP `Extensions.triggerAction` on the PDF tab (it stands in for a click on the toolbar button; it needs `--enable-unsafe-extension-debugging` and the tab's `"tab"` target from `Target.getTargets`).
- **The user's Chrome 158.0.0.0** (macOS, retina, device pixel ratio 2), driven through Claude in Chrome: what the worker sees of PDF tabs without a grant, fetches without a grant, and the speed runs. Claude in Chrome cannot click the toolbar, so no `activeTab` there.

Test server: `localhost:8766` and `127.0.0.1:8766` (two hosts), serving PDFs as `application/pdf`, without `.pdf` in the URL, as `application/octet-stream`, with `Content-Disposition: attachment`, with `Access-Control-Allow-Origin: *`, and behind a cookie per SameSite value. The spike manifest added `host_permissions: ["http://localhost/*"]` (a granted host; `127.0.0.1` stays ungranted). Chrome did not grant that added host in the user's profile after the update, so there the user's Chrome is the "no grant" case only.

Test PDFs (kept in the git-ignored `data/raw/pdf/`, never committed):
| Name | Source | License | Pages | Bytes |
|---|---|---|---|---|
| paper | LLaMA, arXiv 2302.13971v1, https://arxiv.org/pdf/2302.13971v1 (LaTeX, two columns) | CC BY 4.0 | 27 | 726,566 |
| report | NIST SP 800-30 Rev. 1, https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-30r1.pdf | US government work (public domain) | 95 | 826,897 |
| book | Moby-Dick, Project Gutenberg #2701 HTML (https://gutenberg.pglaf.org/2/7/0/2701/2701-h/2701-h.htm), printed to A5 by Chromium with a running header and page numbers | public domain | 671 | 2.86 MB |
| std-fonts, cmap | written by the spike script: non-embedded Helvetica, Times, Courier; non-embedded KozMinPr6N through `UniJIS-UCS2-H` | — | 1 each | small |

## 1. Fetching the PDF again: `activeTab` and cookies
| Fetch from the extension | Granted host (`localhost`) | No grant (`127.0.0.1`, arXiv) | `activeTab` on the PDF tab |
|---|---|---|---|
| Result | works, response type `basic` | `Failed to fetch` (Playwright and the user's Chrome), also on the `Access-Control-Allow-Origin: *` route with `credentials: "include"` | works, type `basic` |
| Cookies sent | all: SameSite Lax, Strict and None | only SameSite=None | all, Strict included |
| Headers | `Sec-Fetch-Site: none`, no `Origin` | `Origin: chrome-extension://…`, `Sec-Fetch-Site: cross-site` | `Sec-Fetch-Site: none` |

- Under `activeTab` (Playwright, triggered on `127.0.0.1` paper, a cookie-gated paper, a URL without `.pdf`, and arXiv), these all worked: the popup's `HEAD` and `GET`, a fetch by the service worker while the grant lived, and `executeScript` into the PDF tab doing its own same-origin fetch and returning base64 (13–24 ms for 726 KB). The grant covers the whole extension origin, not only the popup.
- **The grant ends when that tab navigates.** Opening `pdf.html?src=…` in the same tab (`tabs.update`) and fetching there fails (`Failed to fetch`). Opening it in a new tab (`tabs.create`) works, since the PDF tab and its grant stay.
- So `activeTab` is enough to fetch the bytes, but only before the tab leaves the PDF. Reloading `pdf.html` later, or reopening it from the word list, has no grant.

**For P1:** the popup's "Open in Langle" asks the worker to fetch the bytes while the grant lives (its fetch works and it outlives the popup), stores them under a token (Cache API or IndexedDB; not measured), then navigates the same tab to `pdf.html?src=<url>&k=<token>`. The viewer reads the bytes by token and drops them when done. Without stored bytes it fetches `src`: this works when the host is granted (site access), and otherwise shows "could not be opened again" with "Open file", and could offer the site-access grant for that host.

## 2. Telling that the active tab shows a PDF
- Without a grant, the worker's `tabs.query` gives PDF tabs no `url` and no `title`, in Playwright and in the user's Chrome (the manifest has no `tabs` permission). With `activeTab` the popup sees both. The title is the file name (`paper.pdf`, `2302.13971v1.pdf`, `paper` for the URL without `.pdf`) or the PDF's own title (the NIST report).
- **`executeScript` works in Chrome's PDF viewer tab** under `activeTab`: `document.contentType === "application/pdf"`, no `<embed>` reachable, `<body>` with no children, in 4–16 ms. This holds for URLs without `.pdf`.
- `HEAD` works too but costs a round trip (204 ms on arXiv), and some servers answer `HEAD` differently from `GET`.
- `application/octet-stream` and `Content-Disposition: attachment` download instead of showing Chrome's viewer, so there is no PDF tab to detect.

**For P1:** the popup probes the tab with `executeScript` and `document.contentType === "application/pdf"`. No URL or title rules.

## 3. pdf.js 6 under MV3
- **The default MV3 CSP works**: no `content_security_policy` key, no CSP violations (`securitypolicyviolation` listener), no console errors. The module worker (`pdf.worker.min.mjs`) and pdf.js 6's new renderer worker (`pdf.renderer.min.mjs`, `GlobalWorkerOptions.rendererSrc`; it renders pages off the main thread) start from the extension through Vite `?url` imports. `disableWorkerRendering` (main-thread canvas) works too.
- **`isEvalSupported` no longer exists in pdf.js 6**: the option is gone and the worker has no `eval` or `new Function` path. Nothing to set. Keep pdf.js up to date (CVE-2024-4367 was in the font code).
- **Bundled assets** are passed through `cMapUrl`, `standardFontDataUrl`, `wasmUrl` and `iccUrl` (`runtime.getURL`). The `cmap` PDF fetched `UniJIS-UCS2-H.bcmap` and `Adobe-Japan1-UCS2.bcmap` and rendered 日本語の文章 correctly. The non-embedded Helvetica, Times and Courier PDF used system fonts and fetched nothing from `standard_fonts` on macOS; other systems may.
- pdf.js reports through `console.warn` (for example `Cannot load system font: KozMinPr6N-Regular`), which the check build's error log records as warnings. Set pdf.js's `verbosity` to errors.
- **Size added**:

| Part | Unpacked | Zipped (`zip -9`) |
|---|---|---|
| `pdf.mjs` + viewer chunk | 452 KB | 550 KB for all the JS |
| worker | 1.27 MB | (in the line above) |
| renderer worker | 122 KB | (in the line above) |
| `cmaps` | 1.6 MB | 1.01 MB |
| `standard_fonts` | 816 KB | 549 KB |
| `wasm` | 1.4 MB | 509 KB |
| `iccs` | 20 KB | 11 KB |
| **Production build** | 2.96 MB → 8.19 MB | **1.18 MB → 3.81 MB** |

- `wasm` holds JBIG2, OpenJPEG and QCMS decoders, their no-WebAssembly fallbacks (`*_nowasm_fallback.js`, 132 + 338 KB) and QuickJS (`quickjs-eval.*`, 475 KB, for PDF scripting).

**For P1:** copy only `cmaps`, `standard_fonts`, `iccs` and the three decoders' `.wasm` files. Drop the no-WebAssembly fallbacks (MV3 Chrome has WebAssembly) and QuickJS (no PDF scripting: forms are out of scope). That saves about 945 KB unpacked. `verbosity: errors`.

## 4. Highlights on the transparent text layer
- The CSS Custom Highlight API paints pdf.js's text layer spans. With the article colours as they are (opaque backgrounds), **the highlight background covers the canvas glyphs below** and the word turns into a coloured block. Painting the highlighted text (`color` set) shows a second copy of the text over the canvas that does not line up exactly. Semi-transparent backgrounds dim the glyphs.
- **What works**: the canvas above the text layer with `mix-blend-mode: multiply` and `pointer-events: none`, and `isolation: isolate` on each page. The highlight backgrounds and underlines show through as in the article colours, the glyphs stay black, and hover and selection still reach the text layer.
- **Zoom**: changing `--total-scale-factor` (1.33 → 2.08 → 1.07) keeps every highlight on its word, with no rebuild (pdf.js 6's `TextLayer` scales through CSS only).
- Caveat: inside a long span, a highlight box can sit about one character off horizontally on LaTeX fonts. The text layer uses a fallback font whose widths differ from the embedded one, and pdf.js scales the whole span to the run's width, not each glyph.
- Screenshots: `data/raw/pdf/out/q4-*.png` (git-ignored).

**For P1/P2:** paint with the canvas-over-text-layer blend; keep the mock's colours. P2 measures the horizontal drift on the quality corpus and, if it shows, splits long spans at word boundaries using the text content's glyph widths.

## 5. Speed: windowed text layer against all pages
Windowed: canvases and text layers for the visible pages and two on each side, dropped beyond three. All: a text layer for every page, built one after another. Each run: open, then 6 s of scrolling at 2,000 px/s right away ("early"), then 1 s idle and 6 s more ("settled"), then a jump to the middle page. "Dropped" counts the frames missed: a frame that took n times the median (16.7 ms) counts n − 1. Heap is the viewer page's JS heap (`performance.memory`), not the workers and not the DOM.

The user's Chrome (dpr 2, 1334×742), one run each:
| Document | Mode | First highlight | All text layers | Early: missed / frames, max frame | Settled: missed / frames, long tasks | Spans (max) | Highlight ranges | DOM nodes | Heap |
|---|---|---|---|---|---|---|---|---|---|
| paper (27) | window | 109–115 ms | — | 0–10 / 351–362, 17.7–183 ms | 0–4 / 358–362, 0 | 1,925 | 807 | 1,767 | 4.3–4.7 MB |
| paper | all | 63 ms | 255 ms | 3 / 358, 50 ms | 2 / 360, 0 | 5,604 | 2,493 | 7,549 | 6.6 MB |
| report (95) | window | 90 ms | — | 0 / 361, 17.7 ms | 0 / 362, 0 | 498 | 597 | 759 | 4.5 MB |
| report | all | 73 ms | 1.2 s | 31 / 330, 83 ms | 12 / 350, 7 (429 ms) | 8,605 | 10,729 | 13,533 | 4.9 MB |
| book (671) | window | 90 ms | — | 0 / 361, 17.8 ms | 0 / 362, 0 | 264 | 245 | 1,105 | 4.1 MB |
| book | all | 85 ms | 30.7 s | 163 / 197, 167 ms | 169 / 195, 39 (4.0 s in 6 s) | 35,435 | 31,289 | 55,879 | 7.0 MB |

Playwright's Chromium (dpr 1), two runs each, agrees: windowed runs missed no frames on any document (first highlight 105–174 ms, a text layer 8–26 ms, jumping to the middle page 14–28 ms); the book with every text layer took 29–34 s to build them (43–51 ms a layer, growing), had 263–323 long tasks (19–26 s in all), and missed 105–162 frames against 199–256 drawn even after building (frames up to 367 ms).

- The first paper window run in the user's Chrome missed 10 frames early (one 183 ms frame); the repeat missed none. Likely warm-up.
- With every text layer, scrolling stays janky after they are built: the book's settled scroll had 39 long tasks. This comes from the DOM and highlight ranges (56k nodes, 31k ranges), not from building.
- Windowed, the span count stayed under 2,000 on all three documents, and every number is flat in the document's length.

**For P2:** the windowed text layer is required, as planned. Article mode's highlight ranges must follow the window too (ranges only for pages with a text layer).

## Not measured
- A real click on the toolbar button (CDP `triggerAction` stood in for it, in Playwright's Chromium of the same version); `activeTab` in the user's Chrome.
- Storing the bytes for the hand-off (Cache API or IndexedDB) and its time on large PDFs.
- `file://` PDF tabs (needs "Allow access to file URLs"; local files go through "Open file").
- DOM and GPU memory; workers' memory.
- Signed URLs that expire, and servers that answer `HEAD` and `GET` differently.
