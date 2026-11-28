# PDFs in Langle's own viewer: design and plan

> **For agentic workers:** the main session orchestrates; each phase below is one subagent and one stacked PR ([CLAUDE.md](../../CLAUDE.md), "Working style" and "Token budget"). Tick a phase when its PR is ready. Decisions move into [architecture.md](../specs/architecture.md) and [ui.md](../specs/ui.md) as each phase lands; this plan is deleted once the last phase is merged.

**Goal:** a PDF opened in Chrome can be read with Langle: highlights, hover meanings, the dictionary window, phrases, saving, the Words panel and recorded sources, as on articles, on top of the PDF's own pages.

**Status:** designed with the user 2026-11-28 (brainstorm). Mock not drawn yet (P1).

---

## Why a viewer of our own
Chrome shows PDFs in its built-in viewer (PDFium, inside an internal extension page). Other extensions cannot inject into it, and it offers no API for its text or layout, so Langle cannot run on top of it. PDFium being open source does not help: the wall is the browser's isolation, not the engine. Langle therefore opens the PDF again in an extension page of its own, rendered with pdf.js.

Considered and not chosen:
- **Reflowed text** (extract the text, rebuild paragraphs as an HTML article, run article mode on it): least new code, but loses figures, tables, formulas and layout. The user chose the original pages (layout A).
- **PDFium compiled to WebAssembly**: Chrome's own fidelity and per-character boxes, but no web text layer, scrolling or find, and a community build to maintain. pdf.js has a `TextLayer` that places transparent text over the canvas at the right scale. The engine sits behind one part (`PdfEngine`) so it can be swapped if measurements ever call for it.
- **Taking over every PDF** (always open PDFs in Langle): needs access to every host, against site-by-site access ([architecture](../specs/architecture.md) "Site access").
- **Right-click lookup inside Chrome's viewer** (`contextMenus` selection → side panel dictionary): works where the PDF cannot be fetched again; left for later.

## Scope (first version)
- In: an extension page `pdf.html` that shows a PDF's pages and gives them everything article mode gives (above). Web PDFs and local files. The PDF's outline (bookmarks).
- Out: OCR of scanned PDFs, taking over Chrome's viewer, right-click lookup, annotations, forms, printing, page thumbnails, the phone app.
- Measured types: papers and technical documents (two columns, footnotes, captions, formulas), books and long reads (one column, running headers, page numbers), reports and handouts (mixed columns, boxes, figures). Slides only have to not break (no broken sentences, no misplaced highlights).

## What the user sees
Follows the mock once it is drawn (P1); the mock wins.
- **Entry from a PDF tab**: the toolbar popup on a tab showing a PDF offers "Open in Langle". It opens `pdf.html?src=<url>` in the same tab, so Back returns to Chrome's viewer. Whether the tab shows a PDF is decided from the content, not the URL's ending: the popup runs `executeScript` in the tab under `activeTab` and checks `document.contentType === "application/pdf"` (S0: works in Chrome's viewer, 4–16 ms, also for URLs without `.pdf`).
- **Local files**: "Open file" in the viewer and drag-and-drop onto it. No permission needed. Whether the popup or Home links to the viewer directly is decided in the mock.
- **Bar** (one thin bar at the top): file name, page "12 / 48" (type a number to jump), zoom (−, +, fit width), "Open file", and an outline button only when the PDF has an outline.
- **Outline**: a panel on the left listing the PDF's outline; an entry jumps to its place.
- **Find**: the browser's own Ctrl+F (it finds text in the pages whose text layer exists).
- **Article UI unchanged**: highlights, hover card, dictionary window, phrase selection, Words panel, the end-of-article save.
- **Failures**, each one line in the viewer pointing at "Open file":
  - the PDF cannot be fetched again (sign-in, expired signed URL, 403): "This PDF could not be opened again. Download it and open the file."
  - no text (scanned): the pages show, with "This PDF has no text."
  - password: pdf.js's password prompt; the user types it
  - not the learning language: nothing runs, as on articles

## Permissions
- Fetching the PDF again needs access to its host. S0: `activeTab` (granted by opening the popup) is enough, with the site's cookies (SameSite Strict included), but **only until the tab navigates**: a fetch from `pdf.html` opened in the same tab fails. So "Open in Langle" has the service worker fetch the bytes while the grant lives and store them under a token, then navigates the tab to `pdf.html?src=<url>&k=<token>`; the viewer takes the bytes by token ([notes](../notes/pdf.md) "1").
- Reloading the viewer or reopening from the word list has no `activeTab`: it fetches `src`, which works when the host is granted (site access), and otherwise shows "This PDF could not be opened again" with "Open file". Whether it also offers the site-access grant for that host is decided in the mock.
- No new install warning. Local files need nothing (file picker and drop, not `file://` access).

## Parts
1. **`PdfEngine`** (`src/pdf/engine.ts`): wraps pdf.js. Open (URL or bytes), page count, outline, each page's size, render a page to a canvas at a scale, a page's text with positions (`getTextContent`). pdf.js 6: its worker and renderer worker load from the extension under the default MV3 CSP, and pages render off the main thread. Bundled (no remote code): character maps, standard fonts, ICC profiles and the JBIG2, OpenJPEG and QCMS `.wasm` decoders; left out: the no-WebAssembly fallbacks and QuickJS (PDF scripting). That adds under 2.6 MB to the zipped package (S0: 1.18 → 3.81 MB with everything, fallbacks and QuickJS included). pdf.js 6 has no `isEvalSupported` (no eval path left); `verbosity` set to errors, since its warnings land in the check log. pdf.js kept up to date (CVE-2024-4367). Nothing else imports pdf.js.
2. **Viewer** (`src/entrypoints/pdf/`, Preact): the bar, the pages, the outline panel. Every page's frame is laid out at its size from the start (scrolling and page numbers are right before anything renders).
   - Canvases are drawn only for pages near the viewport and dropped when far.
   - **Text layers exist only for the pages around the viewport** (the visible ones and two on each side), and are removed when far. The span count stays in the thousands whatever the document's length. S0 measured it: windowed, under 2,000 spans and no missed frames on a 27-page paper, a 95-page report and a 671-page book; with every page's text layer, the book took 30 s to build them and scrolling stayed janky afterwards (56k DOM nodes, 31k highlight ranges).
   - Zoom scales the text layer through pdf.js's CSS scale variable; no rebuild (S0: highlights stay on their words).
   - Painting: the canvas sits above the text layer with `mix-blend-mode: multiply` and `pointer-events: none` (`isolation: isolate` per page), so the article highlight colours show through and the glyphs stay sharp. Opaque highlight backgrounds under the canvas would hide the glyphs.
3. **Reading order** (`src/pdf/reading-order.ts`, pure, no DOM): from every page's positioned text to paragraphs in reading order.
   - Items → lines → columns (shared left edges and the gap between them) → paragraphs (line spacing, indents, sentence ends).
   - Lines repeated at the same place over several pages (running headers and footers, page numbers) are left out.
   - Footnotes and captions are paragraphs of their own, apart from the body (font size and place).
   - Joins: a line ending in "-" before a line starting in lower case joins without the hyphen; a paragraph whose sentence does not end at a column or page end continues in the next column's or page's first paragraph.
   - General rules from page structure and measurement only: no per-site, per-publisher or per-document cases ([CLAUDE.md](../../CLAUDE.md) "Fix the class, not the example").
   - The whole document's text is read up front (in the worker; strings only, light), since repeated headers and cross-page joins need every page. Analysis runs over the whole document.
4. **Blocks for article mode**: article mode works on `TextBlock`s (a block's text and the text nodes it comes from, `page-text.ts`) and already takes blocks that appear and disappear (`blocks.ts`, `BlockChange`).
   - Each paragraph from (3) becomes a `TextBlock` over the text layer's nodes. It is **added when every page it spans has its text layer** and removed when one of them goes. A paragraph spans adjacent pages only, so the window of two pages on each side always covers it.
   - `TextBlock` is generalised so that a piece can cover **part of a node**: a dropped hyphen or a left-out header is not in the block's text, and offsets still map to nodes.
   - The PDF supplies the blocks and their order instead of `collectBlocks` reading the DOM; reading order is not DOM order across columns.
   - Highlight ranges exist only for blocks whose pages have a text layer, so they follow the window too.
   - S0 saw highlight boxes drift by about one character inside long spans on LaTeX fonts (the text layer's fallback font is narrower or wider than the embedded one). P2 measures it on the corpus and, if it shows, splits long spans at word boundaries using the text content's glyph widths.
   - From there the existing parts work unchanged: analysis, highlights (CSS Custom Highlight API, which paints the background of the text layer's transparent text, as `highlighter.ts` does on pages), hover and dictionary, the Words panel, the end-of-article save (the end is the last paragraph of the document).
5. **Source** (`SourceInput`):
   - Web PDF: its URL and page number; the word list reopens it with `pdf.html?src=<url>#page=<n>`.
   - Local file: file name and a hash of its bytes; the word list shows the name, with no link.
   - Title: the PDF's own title when it has one, else the file name.

## Settings
- The viewer follows the articles switch (`articles`, `enabled`).
- The per-site off list applies to the PDF's host; a local file has none.
- Language detection as on articles, on a sample of the document's text.

## Testing and measurement ([testing.md](../testing.md))
- **Unit** (Node): reading order over fixtures of positioned text taken from real PDFs (text and boxes only, from PDFs whose license allows it; otherwise kept git-ignored with the study data).
- **Browser** (Chromium): a small test PDF made by a script in the repo. Highlights land on the right words; hover and dictionary; highlights stay put after zoom; blocks appear and go as pages scroll in and out; outline jumps.
- **E2E**: a PDF tab served by the test server → popup → "Open in Langle" → viewer with highlights; "Open file".
- **Quality** (P4): a corpus of each measured type from openly licensed sources (arXiv CC BY papers, public-domain books, government reports). Measured: sentences broken across lines, columns or pages; wrong joins; header, footer and page-number leakage; hyphen joins. A sample judged blind (`judge` agents), as in real-content-quality.
- **Speed** (S0, again in P2): time to first highlight, scrolling smoothness and memory on a two-column paper (~20 pages), a 100-page report and a 500-page book.
- **Real Chrome check** per [development.md](../development.md) "Checking in your own Chrome", ending with the error-log snippet.

## Progress
- [x] S0 Spike (no product code): answers in [notes](../notes/pdf.md)
- [ ] P1 Mock, spec sections, `PdfEngine` and the viewer (pages, bar, outline, open file, popup entry)
- [ ] P2 Reading order and blocks: article mode on the pages
- [ ] P3 Sources and the word list
- [ ] P4 First quality round and the real Chrome check

## S0 Spike
In a throwaway build in the user's Chrome; each answer says what was measured and on which Chrome version. Answered 2026-11-28 in [notes](../notes/pdf.md); the decisions above follow from them.
1. Can the extension page `fetch` a PDF from the tab's host with only `activeTab` (popup opened on that tab)? Are cookies sent (signed-in PDFs)?
2. How the popup tells that the active tab shows a PDF (the tab's URL and title, `Content-Type` through a `HEAD` request, Chrome's viewer).
3. pdf.js in MV3: module worker from the extension, bundled character maps and standard fonts, the extension's CSP, `isEvalSupported: false`.
4. CSS Custom Highlight API on pdf.js's transparent text layer: background and underline show, and align after zoom.
5. Speed of the windowed text layer against one for every page, on the three documents under "Speed".
