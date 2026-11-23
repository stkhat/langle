import { useRef, useState } from "preact/hooks";
import { errorText } from "../../core/util";
import type { ImportResult } from "../../messaging/protocol";
import { t } from "../../i18n/t";
import type { send } from "../../messaging/client";
import { backupFileName, fmt } from "../format/format";
import { ChevronDownIcon } from "../icons";
import { usePressAway } from "../press-away";
import { color } from "../styles";

/** What Export and Import work with; pages pass the browser's, tests pass fakes. */
export interface BackupDeps {
  send: typeof send;
  now(): number;
  /** Hands a file to the user (a download). */
  download(fileName: string, text: string, type?: string): void;
}

/** The result of the last export or import, as a short line; null while there is none. */
export type BackupNote = { ok: boolean; text: string } | null;

export function BackupStatus(props: { note: BackupNote; lineHeight?: number }) {
  const { note } = props;
  return (
    note && (
      <span
        role="status"
        style={{
          fontSize: "13px",
          lineHeight: props.lineHeight,
          color: note.ok ? color.greenDark : color.danger,
        }}
      >
        {note.text}
      </span>
    )
  );
}

/** A file the word list's Export menu writes besides the backup (Anki, CSV). */
export interface ExportItem {
  label: string;
  /** Writes the file; resolves to how many words it holds. */
  run(): Promise<number>;
}

/** The word list's other exports: they write the words shown (`count`). */
export interface MoreExports {
  count: number;
  items: readonly ExportItem[];
}

const MENU_CSS = `.mi{display:flex;align-items:center;width:100%;height:36px;padding:0 10px;border:0;border-radius:6px;background:none;color:${color.ink};font:inherit;font-size:14px;text-align:left;cursor:pointer}.mi:hover:not(:disabled),.mi:focus-visible{background:${color.surfaceGray}}.mi:disabled{color:${color.muted};cursor:default}`;

/**
 * Export (downloads `langle-backup-YYYY-MM-DD.json`) and Import (a file input →
 * `importJson`) buttons, shared by the settings page and the word list. Each press
 * clears the note first; failures and the import's count come back through `onNote`.
 */
export function BackupButtons(props: {
  deps: BackupDeps;
  /** The buttons' class (each page styles its own `.btn`). */
  class: string;
  onNote(note: BackupNote): void;
  onExported?(): void;
  onImported?(result: ImportResult): void;
  /** With these, Export opens a menu: the words shown as each, then the backup. */
  more?: MoreExports;
}) {
  const { deps, more } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  const menuBox = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  usePressAway(
    menu,
    () => setMenu(false),
    (event) =>
      menuBox.current !== null &&
      event.composedPath().includes(menuBox.current),
  );

  async function exportWords(item: ExportItem) {
    setMenu(false);
    props.onNote(null);
    try {
      const count = await item.run();
      props.onNote({
        ok: true,
        text:
          count === 1
            ? t("backup.exported.one")
            : t("backup.exported", { count: fmt(count) }),
      });
    } catch (error) {
      props.onNote({
        ok: false,
        text: t("backup.exportFailed", { error: errorText(error) }),
      });
    }
  }

  async function exportFile() {
    props.onNote(null);
    try {
      const json = await deps.send({ type: "exportJson" });
      deps.download(backupFileName(new Date(deps.now())), json);
      props.onExported?.();
    } catch (error) {
      props.onNote({
        ok: false,
        text: t("backup.exportFailed", { error: errorText(error) }),
      });
    }
  }

  async function importFile(file: File) {
    props.onNote(null);
    try {
      const result = await deps.send({
        type: "importJson",
        json: await file.text(),
      });
      props.onNote({
        ok: true,
        text:
          result.terms === 1
            ? t("backup.imported.one")
            : t("backup.imported", { count: fmt(result.terms) }),
      });
      props.onImported?.(result);
    } catch (error) {
      props.onNote({
        ok: false,
        text: t("backup.importFailed", { error: errorText(error) }),
      });
    }
  }

  const exportButton = more ? (
    <div ref={menuBox} style={{ position: "relative" }}>
      <style>{MENU_CSS}</style>
      <button
        class={props.class}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu(!menu)}
      >
        {t("backup.export")}
        <ChevronDownIcon />
      </button>
      {menu && (
        <div
          role="menu"
          aria-label={t("backup.export")}
          style={{
            position: "absolute",
            top: "46px",
            right: 0,
            zIndex: 5,
            width: "220px",
            boxSizing: "border-box",
            padding: "6px",
            background: color.raised,
            border: `1px solid ${color.line}`,
            borderRadius: "10px",
            boxShadow: "0 8px 24px rgba(20,24,43,0.14)",
          }}
        >
          <div
            style={{
              padding: "8px 10px 6px",
              fontSize: "12px",
              color: color.muted,
            }}
          >
            {t("backup.shownWords", { count: fmt(more.count) })}
          </div>
          {more.items.map((item) => (
            <button
              key={item.label}
              class="mi"
              type="button"
              role="menuitem"
              disabled={more.count === 0}
              onClick={() => void exportWords(item)}
            >
              {item.label}
            </button>
          ))}
          <div
            style={{ height: "1px", margin: "6px 4px", background: color.line }}
          ></div>
          <button
            class="mi"
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false);
              void exportFile();
            }}
          >
            {t("backup.exportBackup")}
          </button>
        </div>
      )}
    </div>
  ) : (
    <button class={props.class} type="button" onClick={() => void exportFile()}>
      {t("backup.export")}
    </button>
  );

  return (
    <>
      {exportButton}
      <button
        class={props.class}
        type="button"
        onClick={() => fileInput.current?.click()}
      >
        {t("backup.import")}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        aria-label={t("backup.file")}
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) void importFile(file);
        }}
      />
    </>
  );
}
