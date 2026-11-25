# German (de) interface glossary

Register: **Sie**, as Chrome's German UI ("Melden Sie sich an", "Ihr Google-Konto"). Buttons are infinitives ("Speichern", "Herunterladen"); progress lines use "Wird … " ("Wird heruntergeladen"). German quotation marks „…“, dash " – ", "{percent} %" with a space.

| English | German | Note |
|---|---|---|
| New / Learning / Known (categories) | Neu / Lernen / Bekannt | "Lernen" follows Anki's German card state; in sentences "neu" and "bekannt" are plain adjectives ("als bekannt markieren"), "Lernen" is quoted („Lernen“) because it is a name, not an adjective |
| Learned (filter) | Gelernt | |
| Saved | Gespeichert | never "synchronisiert" for the result |
| meaning | Bedeutung | |
| phrase | Ausdruck / Ausdrücke | "Phrase" sounds like an empty phrase in German |
| word | Wort / Wörter | |
| highlight (verb / noun) | hervorheben / Hervorhebung | |
| word list | Wortliste | |
| Your language | Ihre Sprache | |
| learning language | Lernsprache | |
| interface language | Anzeigesprache | shorter than "Sprache der Benutzeroberfläche" |
| language data / pack | Sprachdaten / Paket | |
| subtitles / transcript | Untertitel / Transkript | as YouTube's German UI |
| sentence | Satz / Sätze | |
| sentence history | Satzverlauf | like "Browserverlauf" |
| sync | Synchronisierung / synchronisieren; "Sync-Speicher" for the quota | Chrome: "Synchronisierung" |
| backup | Sicherung, Sicherungsdatei | |
| sign in | anmelden | |
| Settings / Download / Theme | Einstellungen / Herunterladen / Design | Chrome's words |
| dictionary window | Wörterbuchfenster | |
| on-device AI | KI auf dem Gerät | |
| toolbar popup | Pop-up in der Symbolleiste | |
| Langle sheet (phone) | Langle-Bereich | |
| phone | Smartphone | |
| site | Website | |

Choices:
- "New-word level" section is "Wortschatzniveau": the setting is how big a vocabulary Langle assumes.
- "Where you saw it" is "Fundstellen", the usual German word for places a word occurs.
- "Buy me a coffee" is "Einen Kaffee spendieren": the infinitive avoids clashing du/Sie in an imperative.
- Store description in the infinitive style of German store listings.

## Review

Second-pass review for naturalness and consistency.

Decisions: register Sie and the glossary stand. Category names stay Neu / Lernen / Bekannt; where a sentence needs the bare name it is quoted or framed („Kategorie „…““).

Changed keys:

| Key | Before | After | Why |
|---|---|---|---|
| `settings.level.label` | Die {count} häufigsten Wörter auf {language} als bekannt werten | Die {count} häufigsten Wörter auf {language} als bekannt behandeln | „als bekannt behandeln“ is the usual phrasing; „werten“ read like grading |
| `settings.highlighting.switch` | Wörter „{category}“ hervorheben | Wörter der Kategorie „{category}“ hervorheben | {category} is the bare name (Neu/Lernen/Bekannt); „Wörter „Lernen“ hervorheben“ did not read as German |
| `settings.comingLater` | Demnächst | Später verfügbar | „Demnächst“ promises 'soon'; en only says 'later' |
| `settings.cloud.connected` | {provider}. Alles wird dort gespeichert, in einem Ordner, den nur Langle öffnen kann. | Mit {provider} verbunden. Alles wird dort in einem Ordner gespeichert, den nur Langle öffnen kann. | a bare provider name followed by a period is not a sentence |
| `settings.cloud.connectedAccount` | {provider} ({account}). Alles wird dort gespeichert, in einem Ordner, den nur Langle öffnen kann. | Mit {provider} verbunden ({account}). Alles wird dort in einem Ordner gespeichert, den nur Langle öffnen kann. | same as connected |
| `settings.cloud.reconnectDesc` | Neue Änderungen warten auf diesem Gerät, bis Sie die Verbindung wiederherstellen. | Neue Änderungen bleiben auf diesem Gerät, bis Sie die Verbindung wiederherstellen. | „warten“ personified the changes |
| `notices.lead` | Langle lädt die Sprachdaten herunter, die es verwendet. Jedes Paket unten steht als Ganzes unter der angegebenen Lizenz und nennt die Quellen, aus denen es erstellt wurde, samt deren Lizenzen. | Langle lädt die Sprachdaten herunter, die es verwendet. Jedes der folgenden Pakete steht als Ganzes unter der angegebenen Lizenz und nennt die Quellen, aus denen es erstellt wurde, samt deren Lizenzen. | „Jedes Paket unten“ was a literal 'below' |
| `popup.setup.consent` | Dafür brauchen wir Ihre Zustimmung zum Umgang mit Ihren Daten. | Dafür ist Ihre Zustimmung zum Umgang mit Ihren Daten nötig. | the app never speaks as „wir“ elsewhere |
| `words.sort.order` | In Reihenfolge | Der Reihe nach | the natural German for 'in order'; „In Reihenfolge“ is incomplete |
| `setup.consent.keepsWhat` | Ihre Wörter und einen Verlauf von Sätzen, Webadressen und Titeln auf diesem Gerät, um zu zeigen, wo Ihnen ein Wort begegnet ist. | Ihre gespeicherten Wörter und einen Verlauf von Sätzen, Webadressen und Titeln auf diesem Gerät, um zu zeigen, wo Ihnen ein Wort begegnet ist. | consent text names the saved words |
| `setup.consent.keepsWhatDevice` | Ihre Wörter, Einstellungen und einen Verlauf von Sätzen, Webadressen und Titeln auf diesem Smartphone, um zu zeigen, wo Ihnen ein Wort begegnet ist. | Ihre gespeicherten Wörter, Einstellungen und einen Verlauf von Sätzen, Webadressen und Titeln auf diesem Smartphone, um zu zeigen, wo Ihnen ein Wort begegnet ist. | same as keepsWhat |
| `setup.consent.sendsWhatDevice` | Nur ein Wort, das Sie nachschlagen oder abspielen, an den Dienst, der seine Bedeutung oder Aussprache liefert. Ihre Wörter und Einstellungen bleiben auf diesem Smartphone. | Nur ein Wort, das Sie nachschlagen oder abspielen, an den Dienst, der seine Bedeutung oder Aussprache liefert. Ihre gespeicherten Wörter und Einstellungen bleiben auf diesem Smartphone. | same as keepsWhat |
