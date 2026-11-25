# Turkish (tr) interface glossary

Register: **siz**, as Chrome's Turkish UI ("Oturum açın", "Google Hesabınız"). Buttons, menu items and switches use the bare imperative as Chrome does ("Kaydet", "İndir", "Kaldır", "Çeviriyi göster"); instructions in sentences use the -In form ("Bir tuşa basın"); progress lines are "…iliyor" ("İndiriliyor"). Quotation marks “…”; percent sign before the number, "%{percent}", as Turkish writes it.

| English | Turkish | Note |
|---|---|---|
| New / Learning / Known (categories) | Yeni / Öğreniyorum / Biliyorum | short and from the learner's side; "Öğrenilen" was dropped because it also reads as "learned"; names in “…” inside sentences |
| Learned (filter) | Öğrenildi | |
| Saved | Kaydedildi | never "senkronize edildi" for the result |
| meaning | anlam | |
| phrase | ifade | |
| word | kelime | Google's Turkish word (not "sözcük") |
| highlight | vurgula / vurgulama | "seçili" is kept for a text selection |
| word list | kelime listesi | |
| Your language | diliniz | |
| learning language | öğrendiğiniz dil | |
| interface language | arayüz dili | |
| language data / pack | dil verileri / paket | |
| subtitles / transcript | altyazı / transkript | YouTube's Turkish UI ("Transkripti göster") |
| sentence | cümle | |
| sentence history | cümle geçmişi | like "tarama geçmişi" |
| sync | senkronizasyon | Chrome's word |
| backup | yedek, yedek dosyası | |
| sign in | oturum açmak | Chrome's phrase |
| Settings / Download / Theme | Ayarlar / İndir / Tema | Chrome's words; theme options Sistem / Açık / Koyu |
| dictionary window | sözlük penceresi | |
| on-device AI | cihaz üzerinde yapay zeka | |
| toolbar popup | araç çubuğundaki Langle simgesi | |
| Langle sheet (phone) | Langle paneli | |

Placeholders and suffixes:
- No case suffix is ever attached to a placeholder (vowel harmony depends on the filled-in name). A noun carries the suffix instead: "{provider} hizmetine", "{site} sitesinde", "{browser} tarayıcısında".
- "Langle" is a fixed name read "Lengıl", so it takes suffixes with an apostrophe as Google's Turkish UI does with product names: "Langle'ın", "Langle'a", "Langle'ı".
- `languageName.*` are the plain names ("İngilizce"), which work as adjectives without a suffix ("İngilizce verileri", "İngilizce öğrenenler", "en sık kullanılan 5.000 İngilizce kelime").
- `{syncName}` may be English now and Turkish later, so it stands in parentheses or before "hizmeti".
- Plurals: Turkish keeps the noun singular after a number ("5 kelime"), so the one and other forms would be identical; those keys are plain strings.

Choices:
- "New-word level" section is "Kelime dağarcığı": the setting says how many common words you already know.
- "Mark all as Learning / Known" are "Tümünü “Öğreniyorum” yap" / "Tümünü “Biliyorum” yap".
- "Buy me a coffee" is "Bana bir kahve ısmarla", the usual Turkish phrase.
- "Most seen" is "En çok görülen"; "A–Z" is "A–Z" as Turkish UIs write it.

## Review

Second-pass review for naturalness and consistency.

Decisions: register siz and the glossary stand, except the setup's language labels, which now use the Settings rows' names (Diliniz, Öğrendiğiniz dil).

Changed keys:

| Key | Before | After | Why |
|---|---|---|---|
| `settings.highlighting.switch` | “{category}” kelimelerini vurgula | “{category}” kategorisindeki kelimeleri vurgula | {category} is the bare name (Yeni/Öğreniyorum/Biliyorum); «“Biliyorum” kelimelerini» did not read as Turkish |
| `settings.highlighting.unsavedAtEndDesc` | Video bittiğinde veya makalenin sonuna geldiğinizde bu kelimelere ne olacağı. “Yeni olarak bırak” onları bir dahaki sefere bırakır; “Biliyorum olarak işaretle” hepsini “Biliyorum” olarak kaydeder. | Video bittiğinde veya makalenin sonuna geldiğinizde bu kelimelere ne olacağı. “Yeni olarak bırak” onları bir sonraki sefere saklar; “Biliyorum olarak işaretle” hepsini “Biliyorum” olarak kaydeder. | «bırak … bırakır» repeated the verb |
| `settings.comingLater` | Yakında | Daha sonra eklenecek | «Yakında» promises 'soon'; en only says 'later' |
| `settings.sync.switchDesc` | Her kelimeyi ve durumunu ekler; kaynakları ve cümleleri eklemez. {browser} tarayıcısında senkronizasyon açıkken oturum açtıysanız diğer cihazlarınıza da ulaşır. | Her kelime ve durumu senkronize edilir; kaynaklar ve cümleler hariç. {browser} tarayıcısında oturum açıp senkronizasyonu açtıysanız diğer cihazlarınıza da ulaşır. | «ekler … eklemez» was a literal 'adds' |
| `settings.cloud.connected` | {provider}. Her şey orada, yalnızca Langle'ın açabildiği bir klasöre kaydedilir. | {provider} hesabınız bağlı. Her şey orada, yalnızca Langle'ın açabildiği bir klasöre kaydedilir. | a bare provider name followed by a period is not a sentence |
| `settings.cloud.connectedAccount` | {provider} ({account}). Her şey orada, yalnızca Langle'ın açabildiği bir klasöre kaydedilir. | {provider} hesabınız ({account}) bağlı. Her şey orada, yalnızca Langle'ın açabildiği bir klasöre kaydedilir. | same as connected |
| `settings.cloud.reconnectDesc` | Siz yeniden bağlanana kadar yeni değişiklikler bu cihazda bekler. | Yeni değişiklikler, siz yeniden bağlanana kadar bu cihazda kalır. | «bekler» personified the changes |
| `dict.explain.error` | Bu açıklanamadı. | Açıklama yapılamadı. | «Bu açıklanamadı» left «bu» without a referent |
| `dict.notSavedNote` | Henüz kaydedilmedi. “Öğreniyorum” veya “Biliyorum” olarak kaydedin; Langle bir dahaki sefere nerede gördüğünüzü hatırlasın. | Henüz kaydedilmedi. “Öğreniyorum” veya “Biliyorum” olarak kaydedin; Langle onu bir dahaki sefere nerede gördüğünüzü hatırlar. | «hatırlasın» (let it remember) read as a wish, not a result |
| `saveAll.note` | Daha önce kaydettiğiniz kelimeler durumlarını korur. Sık kullanılan kelime seviyesindeki kelimeler sayılmaz. | Daha önce kaydettiğiniz kelimeler durumlarını korur. Kelime dağarcığı seviyenizdeki kelimeler sayılmaz. | use the section's own name «Kelime dağarcığı» for the common-word level |
| `video.toggle.on` | Langle açık — kapatmak için tıklayın | Langle açık. Kapatmak için tıklayın | no dash in a tooltip |
| `video.toggle.off` | Langle kapalı — açmak için tıklayın | Langle kapalı. Açmak için tıklayın | no dash in a tooltip |
| `video.menu.dualSubtitles` | Çift altyazı göster | İki dilli altyazı göster | «Çift altyazı» means doubled subtitles; the setting shows the line in two languages |
| `setup.consent.keepsWhat` | Bir kelimeyle nerede karşılaştığınızı göstermek için kelimelerinizi ve cümle, web adresi ve başlık geçmişinizi bu cihazda. | Bir kelimeyle nerede karşılaştığınızı göstermek için kayıtlı kelimelerinizi ve cümle, web adresi ve başlık geçmişinizi bu cihazda. | consent text names the saved words |
| `setup.consent.keepsWhatDevice` | Bir kelimeyle nerede karşılaştığınızı göstermek için kelimelerinizi, ayarlarınızı ve cümle, web adresi ve başlık geçmişinizi bu telefonda. | Bir kelimeyle nerede karşılaştığınızı göstermek için kayıtlı kelimelerinizi, ayarlarınızı ve cümle, web adresi ve başlık geçmişinizi bu telefonda. | same as keepsWhat |
| `setup.consent.sendsWhatDevice` | Yalnızca aradığınız veya dinlediğiniz kelimeyi, anlamını ya da sesini sağlayan hizmete. Kelimeleriniz ve ayarlarınız bu telefonda kalır. | Yalnızca aradığınız veya dinlediğiniz kelimeyi, anlamını ya da sesini sağlayan hizmete. Kayıtlı kelimeleriniz ve ayarlarınız bu telefonda kalır. | same as keepsWhat |
| `setup.languages.native` | Konuştuğum dil | Diliniz | same name as the Settings row it sets |
| `setup.languages.learning` | Öğrendiğim dil | Öğrendiğiniz dil | same name as the Settings row it sets; pairs with «Diliniz» |
