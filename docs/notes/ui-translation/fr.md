# French (fr) interface glossary

Register: **vous**, as Chrome's French UI. Buttons are infinitives ("Enregistrer", "Télécharger"). French typography: a non-breaking space before `:` `;` `?` `!` `%` and inside « … » (written as U+00A0 in the file).

| English | French | Note |
|---|---|---|
| New / Learning / Known (categories) | Nouveau / À apprendre / Connu | masculine, agreeing with "mot"; "À apprendre" is short enough for the hover card's "+ À apprendre" and reads as a list name; quoted « À apprendre » inside sentences |
| Learned (filter) | Appris | |
| Saved | Enregistré | Chrome's "Enregistrer"; never "synchronisé" for the result |
| meaning | sens | "sens" for a dictionary sense, as French dictionaries say |
| phrase | expression | |
| word | mot | |
| highlight (verb / noun) | surligner / surlignage | |
| word list | Liste de mots | |
| Your language | Votre langue | |
| learning language | Langue que vous apprenez | changed in review; was "Langue apprise" |
| interface language | Langue de l'interface | |
| language data / pack | Données linguistiques / paquet | |
| subtitles / transcript | sous-titres / transcription | as YouTube's French UI |
| sentence | phrase | (French "phrase" = sentence, so English "phrase" is "expression") |
| sentence history | Historique des phrases | |
| sync | synchronisation / synchroniser | |
| backup | sauvegarde, fichier de sauvegarde | |
| sign in | se connecter | |
| Settings / Download / Theme | Paramètres / Télécharger / Thème | Chrome's words |
| dictionary window | fenêtre du dictionnaire | |
| on-device AI | IA sur l'appareil | |
| toolbar popup | fenêtre de la barre d'outils | |
| Langle sheet (phone) | panneau Langle | |
| phone | téléphone | |
| site | site | |

Choices:
- English "phrase" is "expression" everywhere, because French "phrase" means sentence and is used for sentences.
- "New-word level" section is "Niveau de vocabulaire": what the slider sets.
- "Buy me a coffee" is "Offrez-moi un café", the usual Ko-fi wording in French.
- Store description uses the imperative with vous, as French store listings do.

## Review

Second-pass review for naturalness and consistency.

Decisions: register vous and the glossary stand, except the learning-language row (« Langue que vous apprenez », the words the lead sentence already used). Non-breaking spaces checked in every string.

Changed keys:

| Key | Before | After | Why |
|---|---|---|---|
| `settings.languages.learning` | Langue apprise | Langue que vous apprenez | „Langue apprise“ reads as 'a language already learned'; same words as the lead and the setup's « J'apprends » |
| `settings.languages.dataUnused` | Inutilisé par vos langues actuelles · {size} Mo | Non utilisé par vos langues actuelles · {size} Mo | « Inutilisé » is stiff; « Non utilisé » is the usual UI word |
| `settings.highlighting.unsavedAtEndDesc` | Ce qu'ils deviennent à la fin d'une vidéo ou d'un article. « Laisser en Nouveau » les garde pour la prochaine fois ; « Marquer comme connus » les enregistre tous comme connus. | Ce qu'ils deviennent à la fin d'une vidéo ou d'un article. « Garder comme nouveaux » les laisse pour la prochaine fois ; « Marquer comme connus » les enregistre tous comme connus. | follows keepNew |
| `settings.highlighting.keepNew` | Laisser en Nouveau | Garder comme nouveaux | « Laisser en Nouveau » is not French; pairs with « Marquer comme connus » |
| `settings.comingLater` | Bientôt disponible | Disponible plus tard | « Bientôt » promises 'soon'; en only says 'later' |
| `settings.sites.never` | Jamais sur | Jamais actif sur | « Jamais sur » had no verb and did not read as a heading |
| `settings.history.switchDesc` | Jamais synchronisé. Les pages de votre liste « Jamais sur » ne sont pas conservées. | Jamais synchronisé. Les pages de votre liste « Jamais actif sur » ne sont pas conservées. | follows sites.never |
| `settings.history.switchDescCloud` | Les pages de votre liste « Jamais sur » ne sont pas conservées. | Les pages de votre liste « Jamais actif sur » ne sont pas conservées. | follows sites.never |
| `settings.sync.switchDesc` | Ajoute chaque mot et son statut, sans les sources ni les phrases. Parvient à vos autres appareils quand vous êtes connecté à {browser} avec la synchronisation activée. | Synchronise chaque mot et son statut, mais pas les sources ni les phrases. Vos autres appareils les reçoivent si vous êtes connecté à {browser} avec la synchronisation activée. | « Ajoute » was a literal 'adds'; « Parvient à » was stiff |
| `settings.cloud.desc` | Synchronisez tout via Google Drive, Dropbox, OneDrive, un dossier sur cet ordinateur ou WebDAV, pour le jour où l'espace de {syncName} ne suffit plus. | Synchronisez tout via Google Drive, Dropbox, OneDrive, un dossier sur cet ordinateur ou WebDAV, au cas où l'espace de {syncName} viendrait à manquer. | « pour le jour où … ne suffit plus » had the wrong tense; « au cas où … viendrait à manquer » is the idiom |
| `settings.cloud.descNoFolder` | Synchronisez tout via Google Drive, Dropbox, OneDrive ou WebDAV, pour le jour où l'espace de {syncName} ne suffit plus. | Synchronisez tout via Google Drive, Dropbox, OneDrive ou WebDAV, au cas où l'espace de {syncName} viendrait à manquer. | same as desc |
| `settings.cloud.offer` | Enregistrez tout, y compris les sources et les phrases, dans votre {provider}, pour le jour où l'espace de {syncName} ne suffit plus. | Enregistrez tout, y compris les sources et les phrases, dans votre {provider}, au cas où l'espace de {syncName} viendrait à manquer. | same as desc |
| `settings.cloud.connected` | {provider}. Tout y est enregistré, dans un dossier que seul Langle peut ouvrir. | Connecté à {provider}. Tout y est enregistré, dans un dossier que seul Langle peut ouvrir. | a bare provider name followed by a period is not a sentence |
| `settings.cloud.connectedAccount` | {provider} ({account}). Tout y est enregistré, dans un dossier que seul Langle peut ouvrir. | Connecté à {provider} ({account}). Tout y est enregistré, dans un dossier que seul Langle peut ouvrir. | same as connected |
| `settings.cloud.reconnectDesc` | Les nouvelles modifications attendent sur cet appareil jusqu'à la reconnexion. | Les nouvelles modifications restent sur cet appareil en attendant la reconnexion. | « attendent » personified the changes |
| `settings.cloud.updateDesc` | Un autre appareil a enregistré avec une version plus récente de Langle, ses modifications ne sont donc pas encore lues ici. | Un autre appareil a enregistré avec une version plus récente de Langle ; ses modifications ne sont donc pas encore lues ici. | comma splice |
| `dict.explain.error` | Impossible d'expliquer ce mot. | Explication impossible. | the selection may be an expression, not « ce mot » |
| `saveAll.markKnown` | Tout mettre en « Connu » | Tout marquer comme connus | same verb as its result line (« marqués comme connus ») and the Settings button |
| `support.nudge.title` | Bravo ! Vous avez {count} mots « À apprendre ». | Bravo ! Vous avez déjà {count} mots « À apprendre ». | 'hit' is a milestone: « déjà » |
| `setup.consent.keepsWhat` | Vos mots et un historique des phrases, adresses web et titres sur cet appareil, pour montrer où vous avez rencontré un mot. | Vos mots enregistrés et un historique des phrases, adresses web et titres sur cet appareil, pour montrer où vous avez rencontré un mot. | consent text names the saved words |
| `setup.consent.keepsWhatDevice` | Vos mots, vos paramètres et un historique des phrases, adresses web et titres sur ce téléphone, pour montrer où vous avez rencontré un mot. | Vos mots enregistrés, vos paramètres et un historique des phrases, adresses web et titres sur ce téléphone, pour montrer où vous avez rencontré un mot. | same as keepsWhat |
| `setup.consent.sendsWhatDevice` | Seulement un mot que vous recherchez ou écoutez, au service qui fournit son sens ou sa prononciation. Vos mots et vos paramètres restent sur ce téléphone. | Seulement un mot que vous recherchez ou écoutez, au service qui fournit son sens ou sa prononciation. Vos mots enregistrés et vos paramètres restent sur ce téléphone. | same as keepsWhat |
| `setup.consent.sendsDrive` | Si vous connectez Google Drive, ces données et votre historique y sont envoyés. Votre adresse e-mail Google est conservée pour rester connecté. | Si vous connectez Google Drive, ces données et votre historique y sont envoyés. Votre adresse e-mail Google est conservée pour maintenir la connexion. | « pour rester connecté » had the e-mail address as subject |
| store `description` | Apprenez des langues avec les vidéos et les articles que vous lisez déjà. | Apprenez des langues avec les vidéos que vous regardez déjà et les articles que vous lisez. | videos are watched, not read (« lisez » covered both) |

## The browser's sync (`{syncName}`)
`env.syncName` is "synchronisation {browser}", with the browser's name filled in. Feminine, with its article: « dans la / de la / à la {syncName} ».

## The phone app's own bars (`app.*`, M6f)
The shells draw these themselves (tab bar, title bar, ⋮, toasts, accessibility labels); the background sends them in the interface language. The tab names are the pages' own (`app.words` = `wordlist.phoneTitle`, `app.settings` = `settings.title`), `app.search` is `home.search`, and `app.on` / `app.off` are `settings.adBlocking.on` / `.off`. `app.editAddress` is `home.search` without the site. `{reasons}` in `app.buildRefused` stays English (the manifest keys the build lacks). Second pass:
- Home → Accueil; Forward → Avancer, as Chrome's French menu; a non-breaking space before the colon of `app.buildRefused`.
