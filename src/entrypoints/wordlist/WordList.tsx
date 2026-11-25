import type { CSSProperties } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { TouchMode } from "../../content/touch/touch-mode";
import { sendStatus } from "../../content/lookup/status";
import { warn } from "../../content/lookup/warn";
import type { TranslationProvider } from "../../content/translate/translator";
import type { WordStatus } from "../../core/classify";
import type { PackStates } from "../../core/packs/state";
import { PacksUnavailableError } from "../../core/packs/unavailable";
import { languagePair } from "../../i18n/languages";
import { t, type MessageKey } from "../../i18n/t";
import type { TermSummary } from "../../messaging/protocol";
import {
  BackupButtons,
  BackupStatus,
  type BackupDeps,
  type BackupNote,
} from "../../ui/backup/BackupButtons";
import { BrandHeader } from "../../ui/BrandHeader";
import type { SponsorCard } from "../../core/sponsors";
import { SearchIcon } from "../../ui/icons";
import { usePhoneLayout } from "../../ui/phone-layout";
import { PHONE_SCREEN, PhoneBackBar, PhoneTitle } from "../../ui/phone-screen";
import { Segmented } from "../../ui/Segmented";
import { color, FONT, PAGE_BUTTON_CSS } from "../../ui/styles";
import { DetailsPanel, savedFrom, type Details } from "./DetailsPanel";
import { COLUMNS, Rows } from "./Rows";
import { exportWords, type WordFormat } from "./export-words";
import { useWordListData } from "./useWordListData";

/** What the word list works with; `main.tsx` passes the browser's, tests pass fakes. */
export interface WordListDeps extends BackupDeps {
  speak(text: string, lang: string): void;
  /** The background's pack states now and after every change (`watchPackState`). */
  watchPackState(listener: (states: PackStates) => void): () => void;
  /** The page's translator for a pair (the browser's built-in one). */
  createTranslator(from: string, to: string): TranslationProvider;
  /** The card under the details (`SPONSOR_CARD`); null: the spot is open. */
  sponsorCard: SponsorCard | null;
  /** The page for would-be sponsors (`SupportLinks.sponsor`); empty while it does not exist. */
  sponsorPage: string;
  /** Opens a source's page; missing: a link opens a new tab (the app opens it over Home). */
  openPage?: (url: string) => void;
  /** The page's touch mode but in tests (`usePhoneLayout`). */
  touch?: TouchMode;
}

/** "learned": known words that went there from learning (`learnedAt`). */
type StatusFilter = "all" | "learning" | "learned" | "known";
type KindFilter = "all" | "word" | "phrase";
type Sort = "recent" | "az" | "seen";

const CSS = `
body{margin:0;background:${color.surface}}
${PAGE_BUTTON_CSS}
.sel{height:40px;padding:0 12px;border:1px solid ${color.lineStrong};border-radius:8px;background:${color.card};color:${color.ink};font:inherit;font-size:14px}
.th{font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${color.muted};font-weight:600;text-align:left;padding:0 12px 10px}
.rowb:hover{background:${color.surface} !important}
.ib:hover{background:${color.surfaceGray} !important}
.chip{display:inline-flex;align-items:center;height:40px;padding:0 13px;border-radius:999px;border:1px solid ${color.lineStrong};background:${color.card};color:${color.ink3};font:inherit;font-size:14px;cursor:pointer;white-space:nowrap}
.chip[aria-pressed="true"]{border-color:${color.ink};background:${color.ink};color:${color.onInk};font-weight:600}
`;

const STATUS_TABS: readonly { id: StatusFilter; label: MessageKey }[] = [
  { id: "all", label: "filter.all" },
  { id: "learning", label: "status.learning" },
  { id: "learned", label: "status.learned" },
  { id: "known", label: "status.known" },
];
const KIND_TABS: readonly { id: KindFilter; label: MessageKey }[] = [
  { id: "all", label: "filter.all" },
  { id: "word", label: "kind.words" },
  { id: "phrase", label: "kind.phrases" },
];
const EXPORTS: readonly [WordFormat, MessageKey][] = [
  ["anki", "export.anki"],
  ["csv", "export.csv"],
];
const SORTS: readonly [Sort, MessageKey][] = [
  ["recent", "wordlist.sort.recent"],
  ["az", "wordlist.sort.az"],
  ["seen", "wordlist.sort.seen"],
];

const showsIn = (term: TermSummary, status: StatusFilter) =>
  status === "all" ||
  (status === "learned"
    ? term.status === "known" && term.learnedAt !== undefined
    : term.status === status);

const byKey = (a: TermSummary, b: TermSummary) => a.key.localeCompare(b.key);
const COMPARE: Record<Sort, (a: TermSummary, b: TermSummary) => number> = {
  recent: (a, b) => b.lastSeen - a.lastSeen || byKey(a, b),
  az: byKey,
  seen: (a, b) => b.seen - a.seen || b.lastSeen - a.lastSeen || byKey(a, b),
};

/** Mock WordList's filters: a segmented control on the tab gray. */
function FilterTabs<T extends string>(props: {
  label: string;
  tabs: readonly { id: T; label: MessageKey }[];
  value: T;
  onPick: (value: T) => void;
}) {
  return (
    <Segmented
      label={props.label}
      options={props.tabs.map((tab) => ({ ...tab, label: t(tab.label) }))}
      value={props.value}
      onPick={props.onPick}
      style={{ background: color.tab }}
      button={() => ({ height: "34px", padding: "0 14px" })}
    />
  );
}

/** The phone layout's filters (mock MobileWords): a row of pill chips. */
function FilterChips<T extends string>(props: {
  label: string;
  tabs: readonly { id: T; label: MessageKey }[];
  value: T;
  onPick: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={props.label}
      style={{ display: "flex", gap: "8px", flex: "none" }}
    >
      {props.tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          class="chip"
          aria-pressed={tab.id === props.value}
          onClick={() => props.onPick(tab.id)}
        >
          {t(tab.label)}
        </button>
      ))}
    </div>
  );
}

/** How long the phone layout's toast shows. */
const TOAST_MS = 3000;

/** The phone layout's note of an export or import: a pill over the list for a while. */
function Toast(props: { note: BackupNote; onGone: () => void }) {
  const { note, onGone } = props;
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(onGone, TOAST_MS);
    return () => clearTimeout(timer);
  }, [note]);
  return (
    note && (
      <span
        role="status"
        style={{
          position: "fixed",
          left: "50%",
          bottom: "calc(16px + env(safe-area-inset-bottom))",
          transform: "translateX(-50%)",
          zIndex: 3,
          maxWidth: "calc(100% - 40px)",
          boxSizing: "border-box",
          padding: "10px 16px",
          borderRadius: "999px",
          background: note.ok ? color.ink : color.danger,
          color: color.onInk,
          fontSize: "14px",
          boxShadow: "0 6px 18px rgba(20,24,43,0.2)",
        }}
      >
        {note.text}
      </span>
    )
  );
}

/** The word list page (mock WordList): saved words, filters, and the selected word's details. */
export function WordList({ deps }: { deps: WordListDeps }) {
  const phone = usePhoneLayout(deps.touch);
  const data = useWordListData(deps);
  const { langs, terms, reload, findTerm, packs, meanings } = data;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [note, setNote] = useState<BackupNote>(null);
  /** The phone layout shows the selected word's details over the list. */
  const [open, setOpen] = useState(false);
  /** The selection the last lookup was for, so a late answer is dropped. */
  const looking = useRef<string | null>(null);
  /** The selected term whose lookup waits for language data. */
  const lookupWaiting = useRef<TermSummary | null>(null);
  const now = deps.now();

  data.onPacksReady.current = () => {
    const waiting = lookupWaiting.current;
    lookupWaiting.current = null;
    reload()
      .then((list) => {
        if (waiting && looking.current === waiting.id)
          select(list?.find((term) => term.id === waiting.id) ?? waiting);
      })
      .catch(warn);
  };

  const rows = useMemo(() => {
    if (!terms) return [];
    const q = query.trim().toLowerCase();
    return terms
      .filter(
        (term) =>
          showsIn(term, status) &&
          (kind === "all" || term.kind === kind) &&
          (!q ||
            term.key.toLowerCase().includes(q) ||
            (term.short ?? "").toLowerCase().includes(q) ||
            (term.meanings ?? []).some((m) =>
              m.line.toLowerCase().includes(q),
            )),
      )
      .sort(COMPARE[sort]);
  }, [terms, query, status, kind, sort]);

  // The first row is selected when the list first shows; a phone shows the list alone.
  useEffect(() => {
    if (!phone && selectedId === null && rows[0]) select(rows[0]);
  }, [rows]);

  function select(term: TermSummary) {
    if (!langs) return;
    setSelectedId(term.id);
    looking.current = term.id;
    deps
      .send({
        type: "lookup",
        lang: langs.learning,
        key: term.key,
      })
      .then((result) => {
        if (looking.current !== term.id) return;
        setDetails({
          term,
          status: result.status,
          ...(result.entry && { entry: result.entry }),
          ...(result.ipa !== undefined && { ipa: result.ipa }),
          occurrences: [...result.here, ...result.elsewhere],
          meanings: result.yourMeanings,
        });
      })
      .catch((error: unknown) => {
        if (
          error instanceof PacksUnavailableError &&
          looking.current === term.id
        ) {
          // Looked up again once the data is on the device.
          lookupWaiting.current = term;
          packs.add(error.packs);
        }
        warn(error);
      });
  }

  async function changeStatus(to: WordStatus) {
    if (!details || !langs) return;
    const { term } = details;
    try {
      const sent = await sendStatus(
        deps.send,
        { termId: term.id, status: details.status },
        to,
        () => {
          const o = savedFrom(details.occurrences);
          return (
            o && {
              lang: langs.learning,
              key: term.key,
              display: term.display,
              kind: term.kind,
              source: { ...o.source, lang: langs.learning },
              sentence: o.sentence,
              ...(o.translation !== undefined && {
                translation: o.translation,
              }),
              pos: o.pos,
            }
          );
        },
      );
      if (!sent) return;
      setDetails((current) =>
        current?.term.id === term.id ? { ...current, status: to } : current,
      );
      await reload();
    } catch (error) {
      warn(error);
    }
  }

  if (!langs || !terms) return null;

  const empty =
    terms.length === 0
      ? t("wordlist.empty")
      : rows.length === 0
        ? t("wordlist.noMatch")
        : null;

  const backup = (
    <BackupButtons
      deps={deps}
      class="btn"
      phone={phone}
      onNote={setNote}
      onImported={() => void reload().catch(warn)}
      more={{
        count: rows.length,
        items: EXPORTS.map(([format, label]) => ({
          label: t(label),
          run: () => {
            setNote({ ok: true, text: t("backup.exporting") });
            return exportWords({ format, rows, langs, deps, data });
          },
        })),
      }}
    />
  );
  const list = (
    <Rows
      rows={rows}
      selectedId={selectedId}
      nativeLang={langs.native}
      now={now}
      empty={empty}
      phone={phone}
      onPick={(term) => {
        select(term);
        setOpen(true);
      }}
      onShown={(shown) =>
        meanings.shown(
          shown.map((term) => ({ key: term.id, head: term.display })),
        )
      }
    />
  );
  const panel = details && (
    <DetailsPanel
      details={details}
      row={findTerm(details.term.id)}
      nativeLang={langs.native}
      learningLang={langs.learning}
      now={now}
      onStatus={(to) => void changeStatus(to)}
      onSpeak={(head) => deps.speak(head, langs.learning)}
      sponsorCard={deps.sponsorCard}
      sponsorPage={deps.sponsorPage}
      phone={phone}
      onOpen={deps.openPage}
    />
  );
  const sortSelect = (style?: CSSProperties) => (
    <select
      id="sort"
      class="sel"
      {...(phone && { "aria-label": t("wordlist.sort") })}
      value={sort}
      onChange={(e) => setSort(e.currentTarget.value as Sort)}
      style={style}
    >
      {SORTS.map(([value, label]) => (
        <option key={value} value={value}>
          {t(label)}
        </option>
      ))}
    </select>
  );

  if (phone)
    return (
      <>
        <div
          inert={open}
          style={{ ...PHONE_SCREEN, height: "100dvh", overflow: "hidden" }}
        >
          <style>{CSS}</style>
          <PhoneTitle title={t("wordlist.phoneTitle")}>
            <span style={{ fontSize: "13px", color: color.muted }}>
              {languagePair(langs.learning, langs.native)}
            </span>
            {backup}
          </PhoneTitle>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              height: "48px",
              marginTop: "-6px",
              padding: "0 16px",
              boxSizing: "border-box",
              border: `1px solid ${color.lineStrong}`,
              borderRadius: "24px",
              background: color.card,
              color: color.muted,
              flex: "none",
            }}
          >
            <SearchIcon size={20} />
            <input
              type="search"
              aria-label={t("wordlist.search")}
              placeholder={t("wordlist.searchPlaceholder")}
              value={query}
              onInput={(e) => setQuery(e.currentTarget.value)}
              style={{
                flex: 1,
                minWidth: 0,
                border: 0,
                padding: 0,
                background: "none",
                color: color.ink,
                font: "inherit",
                fontSize: "16px",
                outline: "none",
              }}
            />
          </label>
          <FilterChips
            label={t("wordlist.status")}
            tabs={STATUS_TABS}
            value={status}
            onPick={setStatus}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "-4px",
              flex: "none",
            }}
          >
            <FilterChips
              label={t("wordlist.kind")}
              tabs={KIND_TABS}
              value={kind}
              onPick={setKind}
            />
            <span style={{ flex: 1 }}></span>
            {sortSelect({
              height: "44px",
              maxWidth: "124px",
              padding: "0 2px",
              border: 0,
              background: "none",
              color: color.greenText,
              fontWeight: 600,
            })}
          </div>
          <section
            aria-label={t("wordlist.list")}
            style={{
              flex: "0 1 auto",
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              borderRadius: "12px",
              background: color.card,
              border: `1px solid ${color.line}`,
              overflow: "hidden",
            }}
          >
            {list}
          </section>
          <Toast note={note} onGone={() => setNote(null)} />
        </div>
        {open && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 4,
              overflowY: "auto",
              background: color.surface,
              color: color.ink,
              fontFamily: FONT,
              fontSize: "15px",
            }}
          >
            <PhoneBackBar
              label={t("wordlist.phoneTitle")}
              onBack={() => setOpen(false)}
            />
            {details?.term.id === selectedId && panel}
          </div>
        )}
      </>
    );

  return (
    <div
      style={{
        height: "100vh",
        minHeight: "560px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        padding: "32px 64px",
        background: color.surface,
        color: color.ink,
        fontFamily: FONT,
      }}
    >
      <style>{CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <BrandHeader
          size="page"
          heading
          title={t("wordlist.title")}
          pair={languagePair(langs.learning, langs.native)}
        />
        <span style={{ flex: 1 }}></span>
        <BackupStatus note={note} />
        {backup}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            width: "320px",
            height: "40px",
            padding: "0 12px",
            boxSizing: "border-box",
            border: `1px solid ${color.lineStrong}`,
            borderRadius: "8px",
            background: color.card,
            color: color.muted,
          }}
        >
          <SearchIcon />
          <input
            type="search"
            aria-label={t("wordlist.search")}
            placeholder={t("wordlist.searchPlaceholder")}
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              background: "none",
              color: color.ink,
              font: "inherit",
              fontSize: "14px",
              outline: "none",
            }}
          />
        </label>
        <FilterTabs
          label={t("wordlist.status")}
          tabs={STATUS_TABS}
          value={status}
          onPick={setStatus}
        />
        <FilterTabs
          label={t("wordlist.kind")}
          tabs={KIND_TABS}
          value={kind}
          onPick={setKind}
        />
        <span style={{ flex: 1 }}></span>
        <label for="sort" style={{ fontSize: "13px", color: color.muted }}>
          {t("wordlist.sort")}
        </label>
        {sortSelect()}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: "20px" }}>
        <section
          aria-label={t("wordlist.list")}
          style={{
            flex: 1,
            minWidth: 0,
            background: color.card,
            border: `1px solid ${color.line}`,
            borderRadius: "14px",
            padding: "16px 8px 8px",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: COLUMNS }}>
            <span class="th">{t("kind.word")}</span>
            <span class="th">{t("wordlist.col.meaning")}</span>
            <span class="th">{t("wordlist.status")}</span>
            <span class="th">{t("wordlist.col.seen")}</span>
            <span class="th">{t("wordlist.col.lastSeen")}</span>
          </div>
          {list}
        </section>
        {panel}
      </div>
    </div>
  );
}
