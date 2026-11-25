import { speak } from "../../content/lookup/speak";
import { warn } from "../../content/lookup/warn";
import { appHostOf } from "../../core/app-host";
import { translatorBackend } from "../../content/translate/backend";
import { SPONSOR_PAGE_URL } from "../../core/links";
import { SPONSOR_CARD } from "../../core/sponsors";
import { send } from "../../messaging/client";
import { watchPackState, watchSettings } from "../../messaging/storage";
import { saveFile } from "../../ui/backup/save-file";
import { mountSetUpPage } from "../../ui/mount-page";
import { WordList, type WordListDeps } from "./WordList";

mountSetUpPage(() => {
  // The app shows no sponsors, and opens a source's page over Home.
  const app = appHostOf();
  const deps: WordListDeps = {
    send,
    now: Date.now,
    saveFile,
    watchPackState,
    speak,
    createTranslator: translatorBackend().create,
    sponsorCard: app ? null : SPONSOR_CARD,
    sponsorPage: app ? "" : SPONSOR_PAGE_URL,
    ...(app && {
      openPage: (url: string) => void app.openPage(url).catch(warn),
    }),
  };
  return { theme: { send, watchSettings }, app: <WordList deps={deps} /> };
});
