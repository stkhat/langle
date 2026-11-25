import { useEffect, useState } from "preact/hooks";
import { learningLanguages, nativeLanguages } from "../../../core/languages";
import { pairsOfPack } from "../../../core/packs/pairs";
import { combinedState } from "../../../core/packs/state";
import { translatorBackend } from "../../../content/translate/backend";
import { languageOption, languagePair } from "../../../i18n/languages";
import { t, type MessageKey } from "../../../i18n/t";
import type { PackStatus } from "../../../messaging/protocol";
import { megabytesTenths } from "../../../ui/format/format";
import { CheckIcon } from "../../../ui/icons";
import { Meter } from "../../../ui/Meter";
import { RowLabel } from "../../../ui/RowLabel";
import { color } from "../../../ui/styles";
import { Section, type SectionProps } from "../rows";

function LanguageSelect(props: {
  id: string;
  title: MessageKey;
  desc: MessageKey;
  value: string;
  options: readonly string[];
  onPick: (code: string) => void;
}) {
  return (
    <div class="row">
      <RowLabel for={props.id} title={t(props.title)} desc={t(props.desc)} />
      <select
        id={props.id}
        class="sel"
        value={props.value}
        onChange={(e) => props.onPick(e.currentTarget.value)}
      >
        {props.options.map((code) => (
          <option key={code} value={code}>
            {languageOption(code)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Downloaded packs the chosen pair does not use, together by the pair they are for. */
interface OtherData {
  /** "Spanish → English"; a pack no offered pair uses shows its name. */
  label: string;
  packs: string[];
  size: number;
}

function otherData(others: PackStatus["others"]): OtherData[] {
  const groups = new Map<string, OtherData>();
  for (const { pack, size } of others) {
    const pair = pairsOfPack(pack)[0];
    const label = pair ? languagePair(pair.learning, pair.native) : pack;
    const group = groups.get(label);
    if (group) {
      group.packs.push(pack);
      group.size += size;
    } else groups.set(label, { label, packs: [pack], size });
  }
  return [...groups.values()];
}

/**
 * A data row's title: on a phone its state or button sits beside it while both fit,
 * else under it (`PHONE_SETTINGS_CSS`).
 */
const DATA_LABEL = { flexBasis: "180px" };

/**
 * The chosen pair's download: Downloaded, its share, or Couldn't download with Retry;
 * once its packs are there, Download while the translator waits for the user's
 * consent (iOS, mock MobileSettingsLanguages).
 */
function PairDataState(props: {
  packs: PackStatus["pair"]["packs"];
  noTranslator: boolean;
  onRetry: () => void;
  onDownload: () => void;
}) {
  const { state, percent } = combinedState(props.packs);
  if (state === "ready" && props.noTranslator)
    return (
      <button class="btn" type="button" onClick={props.onDownload}>
        {t("settings.languages.dataDownload")}
      </button>
    );
  if (state === "ready")
    return (
      <span class="st">
        <CheckIcon />
        <span>{t("settings.languages.dataDownloaded")}</span>
      </span>
    );
  if (state === "downloading")
    return (
      <span class="st">
        <span>{t("settings.languages.dataDownloading", { percent })}</span>
        <Meter share={percent} width="120px" />
      </span>
    );
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "12px",
        minWidth: "220px",
        justifyContent: "flex-end",
      }}
    >
      <span class="st" style={{ minWidth: 0, color: color.danger }}>
        {t("settings.languages.dataFailed")}
      </span>
      <button class="btn" type="button" onClick={props.onRetry}>
        {t("action.retry")}
      </button>
    </span>
  );
}

/**
 * Mock LanguageData: the chosen pair's data with its state (every pack is downloaded),
 * then other downloaded data, which can be removed.
 */
function LanguageData(props: {
  status: PackStatus;
  learning: string;
  native: string;
  noTranslator: boolean;
  onRetry: () => void;
  onDownload: () => void;
  onRemove: (packs: string[]) => void;
}) {
  const { pair } = props.status;
  const others = otherData(props.status.others);
  const pairSize = megabytesTenths(
    pair.packs.reduce((sum, p) => sum + p.size, 0),
  );
  return (
    <div
      class="row"
      style={{
        flexDirection: "column",
        alignItems: "stretch",
        gap: 0,
        paddingBottom: 0,
      }}
    >
      <RowLabel
        title={t("settings.languages.data")}
        desc={t("settings.languages.dataDesc")}
        style={{ paddingBottom: "10px" }}
      />
      <div class="sub data">
        <RowLabel
          small
          style={DATA_LABEL}
          title={languagePair(props.learning, props.native)}
          desc={t(
            props.noTranslator
              ? "settings.languages.dataNoTranslator"
              : "settings.languages.dataSize",
            { size: pairSize },
          )}
        />
        <PairDataState
          packs={pair.packs}
          noTranslator={props.noTranslator}
          onRetry={props.onRetry}
          onDownload={props.onDownload}
        />
      </div>
      {others.map((other) => (
        <div key={other.label} class="sub data">
          <RowLabel
            small
            style={DATA_LABEL}
            title={other.label}
            desc={t("settings.languages.dataUnused", {
              size: megabytesTenths(other.size),
            })}
          />
          <button
            class="btn"
            type="button"
            aria-label={t("settings.languages.dataRemoveLabel", {
              pair: other.label,
            })}
            onClick={() => props.onRemove(other.packs)}
          >
            {t("action.remove")}
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Whether the pair's translator waits for the user's consent to download it (iOS,
 * after Apple's sheet was declined), and Download, which shows the sheet again.
 */
function useNoTranslator(learning: string, native: string) {
  const [waiting, setWaiting] = useState(false);
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    let current = true;
    void translatorBackend()
      .waitsForConsent(learning, native)
      .then((now) => current && setWaiting(now));
    return () => {
      current = false;
    };
  }, [learning, native, asked]);
  return {
    waiting,
    download: () => {
      void translatorBackend()
        .downloadModels(learning, native)
        .finally(() => setAsked((n) => n + 1));
    },
  };
}

export function LanguagesSection(
  props: SectionProps & {
    packs: PackStatus | undefined;
    onRetry: () => void;
    onRemove: (packs: string[]) => void;
  },
) {
  const s = props.settings;
  const noTranslator = useNoTranslator(s.learningLang, s.nativeLang);

  /**
   * A new learning language comes with a native language it has a dictionary into.
   * Either starts the translator's model download for the pair, which needs this
   * user activation (the change).
   */
  function pickLanguage(key: "learningLang" | "nativeLang", value: string) {
    const change =
      key === "learningLang"
        ? {
            learningLang: value,
            nativeLang: nativeLanguages(value)[0] ?? s.nativeLang,
          }
        : { nativeLang: value };
    const next = { ...s, ...change };
    void translatorBackend().downloadModels(next.learningLang, next.nativeLang);
    props.change(change);
  }

  return (
    <Section
      id="languages"
      label="settings.section.languages"
      lead={t("settings.languages.lead")}
    >
      <LanguageSelect
        id="lang-learn"
        title="settings.languages.learning"
        desc="settings.languages.learningDesc"
        value={s.learningLang}
        options={learningLanguages()}
        onPick={(code) => pickLanguage("learningLang", code)}
      />
      <LanguageSelect
        id="lang-native"
        title="settings.languages.native"
        desc="settings.languages.nativeDesc"
        value={s.nativeLang}
        options={nativeLanguages(s.learningLang)}
        onPick={(code) => pickLanguage("nativeLang", code)}
      />
      <LanguageSelect
        id="lang-ui"
        title="settings.languages.ui"
        desc="settings.languages.uiDesc"
        value={s.uiLocale}
        options={["en"]}
        onPick={(uiLocale) => props.change({ uiLocale })}
      />
      {props.packs && (
        <LanguageData
          status={props.packs}
          learning={s.learningLang}
          native={s.nativeLang}
          noTranslator={noTranslator.waiting}
          onRetry={props.onRetry}
          onDownload={noTranslator.download}
          onRemove={props.onRemove}
        />
      )}
    </Section>
  );
}
