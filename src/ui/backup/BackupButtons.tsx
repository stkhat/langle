import { useRef, useState } from "preact/hooks";
import { errorText } from "../../core/util";
import type { ImportResult } from "../../messaging/protocol";
import { t } from "../../i18n/t";
import type { send } from "../../messaging/client";
import { backupFileName } from "../format/format";
import { ChevronDownIcon, MoreIcon } from "../icons";
import { usePressAway } from "../press-away";
import { color } from "../styles";

/** What Export and Import work with; pages pass the browser's, tests pass fakes. */
export interface BackupDeps {
  send: typeof send;
  now(): number;
  /** Hands a file to the user (`save-file.ts`: a download, or the app's share sheet). */
  saveFile(fileName: string, text: string, type?: string): void | Promise<void>;
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

const MENU_CSS = `.mi{display:flex;align-items:center;width:100%;height:36px;padding:0 10px;border:0;border-radius:6px;background:none;color:${color.ink};font:inherit;font-size:14px;text-align:start;cursor:pointer}.mi:hover:not(:disabled),.mi:focus-visible{background:${color.surfaceGray}}.mi:disabled{color:${color.muted};cursor:default}`;
const PHONE_MENU_CSS = `.mi{height:44px;padding:0 12px;border-radius:8px;font-size:15px}.kb{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border:0;padding:0;border-radius:22px;background:none;color:${color.ink};cursor:pointer}`;

/**
 * Export (saves `langle-backup-YYYY-MM-DD.json`) and Import (a file input →
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
  /**
   * The phone layout (mock MobileWordsExport): with `more`, one ⋮ button whose menu
   * also holds Import, in touch sizes.
   */
  phone?: boolean;
}) {
  const { deps, more, phone } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  const menuBox = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  /** A press on the button or in the menu keeps it; decided while the press happens. */
  const inMenu = (event: PointerEvent) =>
    menuBox.current !== null && event.composedPath().includes(menuBox.current);
  usePressAway(menu, () => setMenu(false), inMenu, { now: inMenu });

  async function exportWords(item: ExportItem) {
    setMenu(false);
    props.onNote(null);
    try {
      const count = await item.run();
      props.onNote({
        ok: true,
        text: t("backup.exported", { count }),
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
      await deps.saveFile(backupFileName(new Date(deps.now())), json);
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
        text: t("backup.imported", { count: result.terms }),
      });
      props.onImported?.(result);
    } catch (error) {
      props.onNote({
        ok: false,
        text: t("backup.importFailed", { error: errorText(error) }),
      });
    }
  }

  const menuLabel = phone ? t("backup.menu") : t("backup.export");
  const fileButton = (
    <button
      class={phone ? "mi" : props.class}
      type="button"
      {...(phone && { role: "menuitem" })}
      onClick={() => {
        setMenu(false);
        fileInput.current?.click();
      }}
    >
      {t("backup.import")}
    </button>
  );
  const exportButton = more ? (
    <div
      ref={menuBox}
      style={{
        position: "relative",
        ...(phone && { flex: "none", marginInlineEnd: "-10px" }),
      }}
    >
      <style>{phone ? MENU_CSS + PHONE_MENU_CSS : MENU_CSS}</style>
      {phone ? (
        <button
          type="button"
          class="kb"
          aria-label={menuLabel}
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          <MoreIcon />
        </button>
      ) : (
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
      )}
      {menu && (
        <div
          role="menu"
          aria-label={menuLabel}
          style={{
            position: "absolute",
            top: phone ? "48px" : "46px",
            insetInlineEnd: phone ? "2px" : 0,
            zIndex: 5,
            width: phone ? "240px" : "220px",
            boxSizing: "border-box",
            padding: "6px",
            background: color.raised,
            border: `1px solid ${color.line}`,
            borderRadius: phone ? "12px" : "10px",
            boxShadow: phone
              ? "0 10px 30px rgba(20,24,43,0.18)"
              : "0 8px 24px rgba(20,24,43,0.14)",
          }}
        >
          <div
            style={{
              padding: phone ? "8px 12px 6px" : "8px 10px 6px",
              fontSize: "12px",
              color: color.muted,
            }}
          >
            {t("backup.shownWords", { count: more.count })}
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
          {phone && fileButton}
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
      {!(phone && more) && fileButton}
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
