import { speak } from "../../content/lookup/speak";
import { translatorBackend } from "../../content/translate/backend";
import { SPONSOR_PAGE_URL } from "../../core/links";
import { SPONSOR_CARD } from "../../core/sponsors";
import { send } from "../../messaging/client";
import { watchPackState, watchSettings } from "../../messaging/storage";
import { download } from "../../ui/backup/download";
import { mountSetUpPage } from "../../ui/mount-page";
import { WordList, type WordListDeps } from "./WordList";

mountSetUpPage(() => {
  const deps: WordListDeps = {
    send,
    now: Date.now,
    download,
    watchPackState,
    speak,
    createTranslator: translatorBackend().create,
    sponsorCard: SPONSOR_CARD,
    sponsorPage: SPONSOR_PAGE_URL,
  };
  return { theme: { send, watchSettings }, app: <WordList deps={deps} /> };
});
