# Interface languages: plan

**Goal:** the interface language menu offers every native language ("Your language", `NATIVE_LANGUAGES`, 16 today), and by default the interface follows Your language. Every string reads as a native speaker would write it, not as a word-for-word translation.

**User decisions (2026-11-26):**
- Default: **follow Your language.** Until the user picks an interface language, changing Your language changes the interface too. The menu's first entry is "Same as your language"; once the user picks a language, it stays.
- Arabic: **the layout mirrors** (right to left), not only the text.
- The first-run setup (before Your language is chosen) shows in the browser's language when Langle has it, and switches as soon as the user picks "I speak".
- The store name and description are translated too (`_locales/<locale>/messages.json`).

## Decided up front (so translators and the mechanism agree)
- Locale files: `src/i18n/locales/<code>.json`, one per native language code (`zh` is simplified Chinese). Same keys as `en.json`, same `{placeholders}`.
- Plurals: a value is either a string or an object keyed by `Intl.PluralRules` categories (`zero`, `one`, `two`, `few`, `many`, `other`; `other` required), chosen by the `count` var. A language without plural forms (ja, zh, ko, th, id) writes plain strings.
- en.json changes in U0: `settings.languages.uiDesc` loses "More languages are planned."; new key `settings.languages.uiSame` ("Same as your language") for the menu's first entry. Further keys U0 adds are filled in U1's last step.
- Interface language menu: each language by its own name (endonym, "日本語", "Deutsch"), so a reader stuck in an interface they cannot read can find theirs.
- Store listing: Chrome locale codes (`en`, `ja`, `es`, `pt_BR`, `ru`, `fr`, `de`, `zh_CN`, `it`, `pl`, `th`, `hi`, `ar`, `id`, `tr`, `ko`), `default_locale: en`.

## Phases
- [x] **U0 Mechanism** (PR, branch `claude/ui-languages`): locale-aware `t()`, plural forms, the effective locale (picked, else Your language when Langle has it, else English), loading only the chosen locale in content scripts (not every locale in every bundle), re-render on change, `lang`/`dir` on every UI root, RTL layout (logical CSS properties), the Settings menu, the setup page in the browser's language, the store listing's `_locales` with English, migration of stored `uiLocale: "en"` from before (it was the only choice, so it becomes "follow"), tests, docs (architecture "Interface language", ui.md, design.md, status.md), the mock's Settings row.
- [x] **U1 Translations** (PR stacked on U0, branch `claude/ui-locales`): the 15 locale files and store listings, translated per language with a glossary, then reviewed by a second agent per language for naturalness and consistency; keys U0 added filled in.
- [ ] **U2 Rendering check**: every surface (popup, Settings, hover card, dictionary window, word list, setup) rendered in each locale and compared with the mock: German and Russian lengths, Arabic mirrored, Thai and Hindi scripts, CJK line breaks; fixes go in the U1 PR.
- [ ] **U3 Chrome check** (parent): the check build in the user's Chrome in ja, de and ar; error log read and cleared.

## Translation guidelines (U1)
- Write as the product would if it had been made in that language: the platform's usual words (Chrome's and YouTube's own UI in that language for "Settings", "Save", "Download"), the register of a friendly consumer app, the usual politeness level (Japanese です/ます in sentences, plain noun phrases on buttons; German "du" or "Sie" as Chrome's own German UI does).
- Rephrase freely; keep meaning, placeholders and length budget (a button stays about as short as the English).
- One glossary per language for the core terms: New / Learning / Known (the word categories), Saved, meaning, phrase, highlight, word list, Your language, learning language, pack/language data. Use them the same way in every string.
- Language names: the name in that language, with the endonym in parentheses as `en.json` does ("Japonais (日本語)"); the language's own entry is its endonym alone.
- Portuguese: Brazilian. Spanish: neutral Latin American unless the en-es pack's meanings say otherwise. Chinese: simplified, mainland usage.
