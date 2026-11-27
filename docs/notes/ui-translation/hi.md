# Hindi (hi) interface glossary

Register: everyday Hindi as in Google's, Chrome's and YouTube's Hindi UI: Devanagari, the polite आप form, imperative buttons in the करें form (सेव करें, डाउनलोड करें) or short nouns. English loanwords where Hindi apps use them (सेटिंग, डाउनलोड, सिंक, बैकअप, हाइलाइट, सबटाइटल), not Sanskritised coinages. Nukta spellings as Google uses them (फ़ाइल, फ़्रेज़).

| English | Hindi | Note |
|---|---|---|
| New (category) | नया | "New words" → नए शब्द |
| Learning (category) | सीख रहे | as in "शब्द जो आप सीख रहे हैं" |
| Known (category) | जाने-पहचाने | familiar words; fits buttons |
| Learned (filter) | सीख लिए | a Known word that went through Learning |
| Saved (storage) | सेव हो गया | never सिंक हो गया |
| save (a word) | सेव करें | |
| meaning | मतलब | everyday word; अर्थ reads bookish |
| phrase | फ़्रेज़ | |
| highlight | हाइलाइट | |
| word list | शब्द सूची | phone tab "Words" → शब्द |
| Your language | आपकी भाषा | |
| learning language | सीखी जा रही भाषा | setup "I speak" / "I'm learning" → मेरी भाषा / जो भाषा सीखनी है (no gendered verb) |
| language data | भाषा डेटा | |
| subtitles | सबटाइटल | YouTube's Hindi UI |
| transcript | ट्रांसक्रिप्ट | YouTube's Hindi UI |
| sentence | वाक्य | |
| sync | सिंक | |
| backup | बैकअप | export/import → एक्सपोर्ट / इंपोर्ट |
| sign in | साइन इन | |
| dictionary window | डिक्शनरी विंडो | Hindi apps say डिक्शनरी more than शब्दकोश |
| on-device AI | डिवाइस पर चलने वाला AI | short: डिवाइस का AI |
| Settings | सेटिंग | |
| Download | डाउनलोड करें | |

Choices:
- First-person forms avoided where Hindi would mark gender (सीख रहा/रही): labels are phrased without a gendered verb.
- जाने-पहचाने for Known: natural, adjective-like, works in "जाने-पहचाने शब्द" and on a button.
- "A–Z" kept: the words sorted are in the learning language.

## Review

Second-pass review for naturalness and consistency.

The glossary holds up: Your language is already आपकी भाषा (not मातृभाषा), and the categories नया / सीख रहे / जाने-पहचाने work in every slot. Inside sentences the learning language is phrased "जो भाषा आप सीख रहे हैं" rather than the label form सीखी जा रही भाषा. "Mark as Known" keeps the default form जाना-पहचाना after a को object (सभी को जाना-पहचाना मानें).

Changed keys:

| Key | Before | After | Why |
|---|---|---|---|
| `settings.languages.lead` | Langle उन पेजों पर हाइलाइट दिखाता है जो आपकी सीखी जा रही भाषा में लिखे हैं, और आपकी भाषा में अनुवाद करता है। | Langle उन पेजों को हाइलाइट करता है जो उस भाषा में लिखे हैं जिसे आप सीख रहे हैं, और आपकी भाषा में अनुवाद करता है। | आपकी सीखी जा रही भाषा was stiff inside a sentence |
| `settings.sites.articlesDesc` | आपकी सीखी जा रही भाषा में लिखे पेजों पर हाइलाइट और डिक्शनरी। | आप जो भाषा सीख रहे हैं, उसमें लिखे पेजों पर हाइलाइट और डिक्शनरी। | same as languages.lead |
| `settings.comingLater` | जल्द आ रहा है | बाद में आएगा | जल्द आ रहा है promises 'soon'; en only says 'later' |
| `settings.sync.switchDesc` | हर शब्द और उसकी स्थिति जोड़ता है, सोर्स या वाक्य नहीं। जब आप {browser} में साइन इन हों और सिंक चालू हो, तो यह आपके दूसरे डिवाइस तक पहुंचता है। | सिर्फ़ हर शब्द और उसकी स्थिति सिंक होती है, सोर्स या वाक्य नहीं। जब आप {browser} में साइन इन हों और सिंक चालू हो, तो यह आपके दूसरे डिवाइस तक पहुंचती है। | जोड़ता है was a literal 'adds' |
| `settings.cloud.connected` | {provider}। सब कुछ वहां एक ऐसे फ़ोल्डर में सेव है जिसे सिर्फ़ Langle खोल सकता है। | {provider} कनेक्ट है। सब कुछ वहां एक ऐसे फ़ोल्डर में सेव है जिसे सिर्फ़ Langle खोल सकता है। | a bare provider name followed by । is not a sentence |
| `settings.cloud.connectedAccount` | {provider} ({account})। सब कुछ वहां एक ऐसे फ़ोल्डर में सेव है जिसे सिर्फ़ Langle खोल सकता है। | {provider} ({account}) कनेक्ट है। सब कुछ वहां एक ऐसे फ़ोल्डर में सेव है जिसे सिर्फ़ Langle खोल सकता है। | same as connected |
| `settings.cloud.lastSaved` | आखिरी बार सेव: {when}। | आखिरी बार सेव: {when} | no । after a colon label, as settings.sync.lastSaved |
| `settings.backup.lastExport` | आखिरी एक्सपोर्ट: {when}। | आखिरी एक्सपोर्ट: {when} | same as lastSaved |
| `dict.explain.thinking` | सोचा जा रहा है… | सोच रहा है… | the passive सोचा जा रहा है reads oddly for a progress line |
| `video.toggle.on` | Langle चालू है — बंद करने के लिए क्लिक करें | Langle चालू है। बंद करने के लिए क्लिक करें | the dash is English punctuation |
| `video.toggle.off` | Langle बंद है — चालू करने के लिए क्लिक करें | Langle बंद है। चालू करने के लिए क्लिक करें | same as toggle.on |

## The browser's sync (`{syncName}`)
`env.syncName` is "{browser} सिंक", with the browser's name filled in. The switch says सेव करें so it does not repeat सिंक.

## The phone app's own bars (`app.*`, M6f)
The shells draw these themselves (tab bar, title bar, ⋮, toasts, accessibility labels); the background sends them in the interface language. The tab names are the pages' own (`app.words` = `wordlist.phoneTitle`, `app.settings` = `settings.title`), `app.search` is `home.search`, and `app.on` / `app.off` are `settings.adBlocking.on` / `.off`. `app.editAddress` is `home.search` without the site. `{reasons}` in `app.buildRefused` stays English (the manifest keys the build lacks). Second pass:
- More → ज़्यादा विकल्प (and alone, और, reads as 'and'); Settings → सेटिंग as the page title.
