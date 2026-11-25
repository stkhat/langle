import type { ComponentChildren, VNode } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import type { TouchMode } from "../../content/touch/touch-mode";
import {
  learnableFrom,
  learningFor,
  spokenLanguages,
  suggestedPair,
} from "../../core/languages";
import type { SyncPlace } from "../../core/browser-env";
import type { Settings } from "../../core/settings";
import { languageOption } from "../../i18n/languages";
import { t } from "../../i18n/t";
import type { send as Send } from "../../messaging/client";
import type { LanguagePair, SetupStatus } from "../../messaging/protocol";
import { LangleMark } from "../../ui/LangleMark";
import { usePhoneLayout } from "../../ui/phone-layout";
import { color, FONT, PAGE_BUTTON_CSS } from "../../ui/styles";
import { palettes } from "../../ui/theme";

/** What the setup page works with; `main.tsx` passes the browser's, tests pass fakes. */
export interface WelcomeDeps {
  send: typeof Send;
  watchSettings(listener: (settings: Settings) => void): () => void;
  /** The browser's UI language, e.g. "pt-BR". */
  uiLanguage: string;
  /** `BrowserEnv.sync`: the browser's sync, or this device only (the phone app). */
  sync: SyncPlace;
  /** This build can connect Google Drive (offered only beside browser sync, as in Settings). */
  drive: boolean;
  /** The policy's address; empty: the link is left out. */
  privacyPolicy: string;
  /** Resolves once the translator's downloads are asked for (in the click). */
  startModels(learning: string, native: string): Promise<void>;
  /** "Not now". */
  close(): void;
  /** The page was opened on a device that is set up. */
  alreadySetUp(): void;
  /** The page's touch mode but in tests (`usePhoneLayout`). */
  touch?: TouchMode;
}

const CSS = `
body{background:${color.surface}}
a{color:${color.greenText}}a:hover{color:${color.greenDark}}
.card{background:${color.card};border:1px solid ${color.line};border-radius:14px;padding:24px;display:flex;flex-direction:column;gap:18px}
.h1{margin:0;font-size:18px;line-height:1.35;font-weight:700}
.row{display:flex;gap:14px;padding:9px 0;border-top:1px solid ${color.soft}}
.ic{flex:none;display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;background:${color.greenPale};color:${color.greenText}}
.what{flex:1;min-width:0;margin:0;font-size:14px;line-height:1.5;color:${color.ink2}}
.lt{font-size:15px;font-weight:600;color:${color.ink}}
.what .lt{display:block}
.field{display:flex;flex-direction:column;gap:6px}
.sel{box-sizing:border-box;width:100%;height:40px;padding:0 12px;border:1px solid ${color.lineStrong};border-radius:8px;background:${color.card};color:${color.ink};font:inherit;font-size:14px}
.sel:disabled{color:${color.muted};background:${color.surface};opacity:1}
${PAGE_BUTTON_CSS}
.btn{box-sizing:border-box}
.btn:hover{background:${color.surface}}
.go{border-color:${color.greenFill};background:${color.greenFill};color:${color.white}}
.go:hover{background:${palettes.light.greenDark}}
.btn:disabled,.btn:disabled:hover{border-color:${color.line};background:${color.line};color:${color.muted};cursor:default}
.ph .h1{font-size:26px;line-height:1.25;letter-spacing:-0.01em}
.ph .row{padding:14px 0;border-top-color:${color.line}}
.ph .ic{width:40px;height:40px;border-radius:12px}
.ph .what{font-size:15px}
.ph .lt{font-size:16px}
.ph .what .lt{margin-bottom:2px}
.ph .field{gap:8px}
.ph .sel{height:50px;padding:0 14px;border-radius:12px;font-size:16px}
.ph .sel:disabled{background:${color.surfaceGray}}
.ph .btn{width:100%;height:50px;border-radius:12px;font-size:16px}
.bar{position:sticky;bottom:0;display:flex;flex-direction:column;gap:10px;padding:14px 24px max(14px,env(safe-area-inset-bottom));background:${color.surface};border-top:1px solid ${color.line}}
`;

const ICONS = {
  book: "M12 6.5C10 5 7 4.5 3 5v13c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V5c-4-.5-7 0-9 1.5zM12 6.5v13",
  bookmark: "M6.5 4h11v16L12 16l-5.5 4z",
  arrow: "M4 12h15M13 6l6 6-6 6",
};

function Row(props: {
  icon: keyof typeof ICONS;
  phone: boolean;
  verb: string;
  children: ComponentChildren;
}) {
  const size = props.phone ? 22 : 20;
  return (
    <li class="row">
      <span class="ic">
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d={ICONS[props.icon]} />
        </svg>
      </span>
      <p class="what">
        <strong class="lt">{props.verb}</strong>
        {props.children}
      </p>
    </li>
  );
}

const report = (error: unknown) => console.error(error);

function Brand(props: { phone: boolean }) {
  const { phone } = props;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: phone ? "10px" : "8px",
      }}
    >
      <LangleMark size={phone ? 34 : 28} />
      <span
        style={{
          fontSize: phone ? "20px" : "15px",
          fontWeight: 700,
          letterSpacing: phone ? "-0.01em" : undefined,
        }}
      >
        {t("app.name")}
      </span>
    </div>
  );
}

/**
 * One step: a card on a computer; on a phone the whole screen, with the step's buttons
 * in a bar along the bottom (mock `First run on a phone`).
 */
function Step(props: {
  phone: boolean;
  /** The step's heading's id. */
  title: string;
  /** Between the phone screen's parts. */
  gap: number;
  actions: ComponentChildren;
  children: ComponentChildren;
}) {
  if (!props.phone)
    return (
      <section class="card" aria-labelledby={props.title}>
        {props.children}
        {props.actions}
      </section>
    );
  return (
    <section
      aria-labelledby={props.title}
      style={{ flex: 1, display: "flex", flexDirection: "column" }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: `${props.gap}px`,
          padding: "calc(16px + env(safe-area-inset-top)) 24px 16px",
        }}
      >
        <Brand phone />
        {props.children}
      </div>
      <div class="bar">{props.actions}</div>
    </section>
  );
}

function Consent(props: {
  deps: WelcomeDeps;
  phone: boolean;
  agreed(status: SetupStatus): void;
}) {
  const { deps, phone } = props;
  const title = useId();
  const [busy, setBusy] = useState(false);
  const device = deps.sync.kind === "device";

  async function agree() {
    setBusy(true);
    try {
      const status = await deps.send({ type: "agreeSetup" });
      // With nothing left the background closes this tab.
      if (status.stage !== "ready") props.agreed(status);
    } catch (error) {
      report(error);
      setBusy(false);
    }
  }

  const notNow = (
    <button type="button" class="btn" onClick={() => deps.close()}>
      {t("setup.consent.notNow")}
    </button>
  );
  const agreeButton = (
    <button
      type="button"
      class="btn go"
      style={phone ? undefined : { flex: 1 }}
      disabled={busy}
      onClick={() => void agree()}
    >
      {t("setup.consent.agree")}
    </button>
  );
  return (
    <Step
      phone={phone}
      title={title}
      gap={20}
      actions={
        phone ? (
          <>
            {agreeButton}
            {notNow}
          </>
        ) : (
          <div style={{ display: "flex", gap: "12px" }}>
            {notNow}
            {agreeButton}
          </div>
        )
      }
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: phone ? "8px" : "6px",
        }}
      >
        <h1 id={title} class="h1">
          {t("setup.consent.title")}
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: phone ? "15px" : "14px",
            lineHeight: 1.5,
            color: color.ink2,
          }}
        >
          <strong style={{ fontWeight: 600, color: color.ink }}>
            {t("setup.consent.noServers")}
          </strong>{" "}
          {device ? t("setup.consent.whereDevice") : t("setup.consent.where")}
          {deps.privacyPolicy && (
            <>
              {" "}
              <a
                href={deps.privacyPolicy}
                target="_blank"
                rel="noopener noreferrer"
                style={{ whiteSpace: "nowrap" }}
              >
                {t("setup.consent.policy")}
              </a>
            </>
          )}
        </p>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        <Row icon="book" phone={phone} verb={t("setup.consent.reads")}>
          {t("setup.consent.readsWhat")}
        </Row>
        <Row icon="bookmark" phone={phone} verb={t("setup.consent.keeps")}>
          {device
            ? t("setup.consent.keepsWhatDevice")
            : t("setup.consent.keepsWhat")}
        </Row>
        <Row icon="arrow" phone={phone} verb={t("setup.consent.sends")}>
          {deps.sync.kind === "browser"
            ? t("setup.consent.sendsWhat", { syncName: deps.sync.name })
            : t("setup.consent.sendsWhatDevice")}
          {/* Drive is offered beside browser sync only (Settings "Sync and backup"). */}
          {deps.drive && !device && (
            <span style={{ display: "block", marginTop: "4px" }}>
              {t("setup.consent.sendsDrive")}
            </span>
          )}
        </Row>
      </ul>
    </Step>
  );
}

function Choice(props: {
  label: string;
  value: string;
  options: readonly string[];
  disabled?: boolean;
  choose(value: string): void;
}) {
  const id = useId();
  // Nothing to choose where one language is all there is.
  const prompt = props.options.length !== 1 || props.value === "";
  return (
    <div class="field">
      <label class="lt" for={id}>
        {props.label}
      </label>
      <select
        id={id}
        class="sel"
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.choose(event.currentTarget.value)}
      >
        {prompt && (
          <option value="" disabled>
            {t("setup.languages.choose")}
          </option>
        )}
        {props.options.map((code) => (
          <option key={code} value={code}>
            {languageOption(code)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** "I speak"'s languages, by their English names. */
const spoken = () =>
  spokenLanguages().sort((a, b) =>
    languageOption(a).localeCompare(languageOption(b), "en"),
  );

function Languages(props: {
  deps: WelcomeDeps;
  phone: boolean;
  status: SetupStatus;
}) {
  const { deps } = props;
  const title = useId();
  const [pair, setPair] = useState<LanguagePair>(() =>
    suggestedPair(deps.uiLanguage, props.status.pair ?? undefined),
  );
  const [busy, setBusy] = useState(false);
  const touched = useRef(false);

  // A pair that browser sync brings late fills in until the user chooses.
  useEffect(
    () =>
      deps.watchSettings(() => {
        deps.send({ type: "setupStatus" }).then((status) => {
          if (!touched.current)
            setPair(suggestedPair(deps.uiLanguage, status.pair ?? undefined));
        }, report);
      }),
    [deps],
  );

  function choose(next: LanguagePair) {
    touched.current = true;
    setPair(next);
  }

  async function start() {
    touched.current = true;
    setBusy(true);
    try {
      // First: the click's activation is needed, and the tab closes after Start.
      await deps.startModels(pair.learningLang, pair.nativeLang);
      await deps.send({ type: "startLangle", ...pair });
    } catch (error) {
      report(error);
      setBusy(false);
    }
  }

  return (
    <Step
      phone={props.phone}
      title={title}
      gap={24}
      actions={
        <button
          type="button"
          class="btn go"
          disabled={busy || !pair.nativeLang || !pair.learningLang}
          onClick={() => void start()}
        >
          {t("setup.languages.start")}
        </button>
      }
    >
      <h1 id={title} class="h1">
        {t("setup.languages.title")}
      </h1>
      <Choice
        label={t("setup.languages.native")}
        value={pair.nativeLang}
        options={spoken()}
        choose={(nativeLang) =>
          choose({
            nativeLang,
            learningLang: learningFor(nativeLang, pair.learningLang),
          })
        }
      />
      <Choice
        label={t("setup.languages.learning")}
        value={pair.learningLang}
        options={learnableFrom(pair.nativeLang)}
        disabled={pair.nativeLang === ""}
        choose={(learningLang) => choose({ ...pair, learningLang })}
      />
    </Step>
  );
}

/**
 * "Set up Langle" (ui.md "First-run consent"; mock `First run — your data and consent`,
 * `— your languages`, and on a phone `First run on a phone`): the disclosure, then the
 * languages, in one tab. Only "Agree and continue" is consent.
 */
export function Welcome(props: { deps: WelcomeDeps }) {
  const { deps } = props;
  const phone = usePhoneLayout(deps.touch);
  const [status, setStatus] = useState<SetupStatus>();

  useEffect(() => {
    deps.send({ type: "setupStatus" }).then((now) => {
      if (now.stage === "ready") deps.alreadySetUp();
      else setStatus(now);
    }, report);
  }, [deps]);

  let step: VNode | null = null;
  if (status?.stage === "consent")
    step = <Consent deps={deps} phone={phone} agreed={setStatus} />;
  else if (status?.stage === "languages")
    step = <Languages deps={deps} phone={phone} status={status} />;

  if (phone)
    return (
      <main
        class="ph"
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100dvh",
          fontFamily: FONT,
          fontSize: "15px",
          color: color.ink,
        }}
      >
        <style>{CSS}</style>
        {step}
      </main>
    );
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "24px",
        fontFamily: FONT,
        color: color.ink,
      }}
    >
      <style>{CSS}</style>
      <div
        style={{
          width: "520px",
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <Brand phone={false} />
        {step}
      </div>
    </main>
  );
}
