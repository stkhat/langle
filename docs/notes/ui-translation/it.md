# Italian (it) interface glossary

Register: **tu**, as Chrome's and YouTube's Italian UI ("il tuo account", "Accedi"). Buttons are imperatives as Google's Italian UI does ("Salva", "Scarica", "Annulla"). Quotes “…”, "{percent}%" without a space.

| English | Italian | Note |
|---|---|---|
| New / Learning / Known (categories) | Nuova / Da imparare / Conosciuta | feminine, agreeing with "parola" (and "espressione"); "Da imparare" reads as the name of a study list, where a bare gerund would not |
| Learned (filter) | Imparata | |
| Saved | Salvato | never "sincronizzato" for the result |
| meaning | significato | |
| phrase | espressione | |
| word | parola | |
| highlight (verb / noun) | evidenziare / evidenziazione | |
| word list | Elenco parole | |
| Your language | La tua lingua | |
| learning language | Lingua che studi | |
| interface language | Lingua dell'interfaccia | |
| language data / pack | Dati linguistici / pacchetto | |
| subtitles / transcript | sottotitoli / trascrizione | as YouTube's Italian UI |
| sentence | frase | |
| sentence history | Cronologia delle frasi | Chrome's "Cronologia" |
| sync | sincronizzazione / sincronizzare | |
| backup | backup | |
| sign in | accedere | |
| Settings / Download / Theme | Impostazioni / Scarica / Tema | Chrome's words |
| dictionary window | finestra del dizionario | |
| on-device AI | IA sul dispositivo | |
| toolbar popup | menu di Langle nella barra degli strumenti | |
| Langle sheet (phone) | pannello di Langle | |
| phone | telefono | |
| site | sito | |

Choices:
- Language names stay capitalized (also shown alone); in sentences they sit in parentheses.
- "New-word level" section is "Livello di vocabolario".
- "Buy me a coffee" is "Offrimi un caffè".
- "Continue" on the phone home screen is "Continua a guardare", as YouTube's Italian UI.

## Review

Second-pass review for naturalness and consistency.

Decisions: register tu and the glossary stand. Category names are singular feminine labels, so a sentence that puts one after a plural noun frames it (« della categoria “…” »).

Changed keys:

| Key | Before | After | Why |
|---|---|---|---|
| `settings.highlighting.switch` | Evidenzia le parole “{category}” | Evidenzia le parole della categoria “{category}” | {category} is the singular name (Nuova/Da imparare/Conosciuta); « le parole “Conosciuta” » did not agree |
| `settings.ai.unknown.desc` | Appena si apre la finestra del dizionario. Le parole con una voce vengono spiegate quando tocchi “Spiega nel contesto”. | Appena si apre la finestra del dizionario. Le parole con una voce vengono spiegate quando fai clic su “Spiega nel contesto”. | a desktop setting: « tocchi » is a touch verb |
| `settings.comingLater` | Prossimamente | Disponibile più avanti | « Prossimamente » promises 'soon'; en only says 'later' |
| `settings.video.belowVideoDesc` | In un riquadro più grande sotto il player, così non copre l'immagine. | In un riquadro più grande sotto il player, così nulla copre l'immagine. | the subject was missing (« così non copre ») |
| `settings.sites.never` | Mai su | Mai attivo su | « Mai su » had no verb and did not read as a heading |
| `settings.history.switchDesc` | Mai sincronizzata. Le pagine nel tuo elenco “Mai su” non vengono conservate. | Mai sincronizzata. Le pagine nel tuo elenco “Mai attivo su” non vengono conservate. | follows sites.never |
| `settings.history.switchDescCloud` | Le pagine nel tuo elenco “Mai su” non vengono conservate. | Le pagine nel tuo elenco “Mai attivo su” non vengono conservate. | follows sites.never |
| `settings.sync.switchDesc` | Aggiunge ogni parola e il suo stato, senza fonti né frasi. Arriva agli altri tuoi dispositivi quando hai eseguito l'accesso a {browser} con la sincronizzazione attiva. | Sincronizza ogni parola e il suo stato, ma non le fonti né le frasi. Arriva agli altri tuoi dispositivi quando hai eseguito l'accesso a {browser} con la sincronizzazione attiva. | « Aggiunge » was a literal 'adds' |
| `settings.cloud.connected` | {provider}. Tutto viene salvato lì, in una cartella che solo Langle può aprire. | Collegato a {provider}. Tutto viene salvato lì, in una cartella che solo Langle può aprire. | a bare provider name followed by a period is not a sentence |
| `settings.cloud.connectedAccount` | {provider} ({account}). Tutto viene salvato lì, in una cartella che solo Langle può aprire. | Collegato a {provider} ({account}). Tutto viene salvato lì, in una cartella che solo Langle può aprire. | same as connected |
| `dict.fitsHere` | Adatto qui | Si adatta qui | « Adatto qui » is not how Italian says it |
| `dict.explain.thinking` | Ci sto pensando… | Sto pensando… | « Ci sto pensando » sounds like a person mulling a request |
| `dict.explain.noFit` | Nessuno dei significati del dizionario è adatto qui. | Nessuno dei significati del dizionario si adatta qui. | follows fitsHere |
| `video.menu.dualSubtitles` | Sottotitoli doppi | Sottotitoli bilingui | « doppi » reads as duplicated subtitles |
| `time.justNow` | proprio ora | poco fa | a past time ('saved · just now'); « proprio ora » means 'right now' |
| `support.nudge.title` | Ottimo lavoro! Hai già {count} parole Da imparare. | Ottimo lavoro! Hai già {count} parole in “Da imparare”. | a capitalised « Da imparare » mid-sentence read as a typo; it is the list's name |
| `popup.setup.title` | Langle non è ancora partito | Langle non è ancora attivo | « partito » is colloquial for a program that has not been set up |
| `setup.consent.where` | Salva i tuoi dati solo sul tuo dispositivo e nei tuoi servizi cloud, da nessun'altra parte. Lo sviluppatore non ne riceve nessuno. | Salva i tuoi dati solo sul tuo dispositivo e nei tuoi servizi cloud, da nessun'altra parte. Lo sviluppatore non riceve nulla. | « non ne riceve nessuno » read as 'receives nobody' |
| `setup.consent.whereDevice` | Salva i tuoi dati solo su questo telefono, da nessun'altra parte. Lo sviluppatore non ne riceve nessuno. | Salva i tuoi dati solo su questo telefono, da nessun'altra parte. Lo sviluppatore non riceve nulla. | same as where |
| `setup.consent.keepsWhat` | Le tue parole e una cronologia di frasi, indirizzi web e titoli su questo dispositivo, per mostrarti dove hai incontrato una parola. | Le tue parole salvate e una cronologia di frasi, indirizzi web e titoli su questo dispositivo, per mostrarti dove hai incontrato una parola. | consent text names the saved words |
| `setup.consent.keepsWhatDevice` | Le tue parole, le impostazioni e una cronologia di frasi, indirizzi web e titoli su questo telefono, per mostrarti dove hai incontrato una parola. | Le tue parole salvate, le impostazioni e una cronologia di frasi, indirizzi web e titoli su questo telefono, per mostrarti dove hai incontrato una parola. | same as keepsWhat |
| `setup.consent.sendsWhatDevice` | Solo una parola che cerchi o ascolti, al servizio che ne fornisce il significato o la pronuncia. Le tue parole e le impostazioni restano su questo telefono. | Solo una parola che cerchi o ascolti, al servizio che ne fornisce il significato o la pronuncia. Le tue parole salvate e le impostazioni restano su questo telefono. | same as keepsWhat |
| `setup.consent.sendsDrive` | Se colleghi Google Drive, questi dati e la tua cronologia finiscono lì. La tua email Google viene conservata per restare collegato. | Se colleghi Google Drive, questi dati e la tua cronologia finiscono lì. La tua email Google viene conservata per mantenere il collegamento. | « per restare collegato » had the email as subject |

## The browser's sync (`{syncName}`)
`env.syncName` is "sincronizzazione di {browser}", with the browser's name filled in. Feminine, with its article: «nella / della / alla {syncName}».

## The phone app's own bars (`app.*`, M6f)
The shells draw these themselves (tab bar, title bar, ⋮, toasts, accessibility labels); the background sends them in the interface language. The tab names are the pages' own (`app.words` = `wordlist.phoneTitle`, `app.settings` = `settings.title`), `app.search` is `home.search`, and `app.on` / `app.off` are `settings.adBlocking.on` / `.off`. `app.editAddress` is `home.search` without the site. `{reasons}` in `app.buildRefused` stays English (the manifest keys the build lacks). Second pass:
- Home stays Home, as YouTube's Italian UI; Tabs → Schede; On / Off copy the ad-blocking row (Attivo / Disattivato).
