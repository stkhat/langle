# Polish (pl) interface glossary

Register: informal **Ty**, as Chrome's and Google's Polish UI ("Zaloguj się", "Twoje konto Google"), with Ty / Twój capitalized mid-sentence as Google writes them. Buttons are imperatives ("Zapisz", "Pobierz", "Usuń"); switches use the imperfective imperative as Chrome's settings do ("Pokazuj…", "Wyróżniaj…"); progress lines are nouns ("Pobieranie…"). Quotation marks „…”; dash " – "; "{percent}%" without a space.

| English | Polish | Note |
|---|---|---|
| New / Learning / Known (categories) | Nowe / Uczę się / Znam | short and from the learner's side; in sentences "nowe" and "znane" as plain adjectives where they describe words, the names in „…” where they name the category |
| Learned (filter) | Opanowane | "nauczone" sounds childish |
| Saved | Zapisano | never "zsynchronizowano" for the result |
| meaning | znaczenie | |
| phrase | wyrażenie | "fraza" is mostly a search query |
| word | słowo | |
| highlight | wyróżnianie / wyróżniaj | "zaznaczone" is kept for a text selection |
| word list | lista słów | |
| Your language | Twój język | |
| learning language | język nauki | |
| interface language | język interfejsu | |
| language data / pack | dane językowe / pakiet | |
| subtitles / transcript | napisy / transkrypcja | YouTube's Polish UI |
| video (YouTube) | film | YouTube's Polish word |
| sentence | zdanie | |
| sentence history | historia zdań | |
| sync | synchronizacja | Chrome's word |
| backup | kopia zapasowa, plik kopii zapasowej | |
| sign in | zalogować się | |
| Settings / Download / Theme | Ustawienia / Pobierz / Motyw | Chrome's words; theme options Systemowy / Jasny / Ciemny |
| dictionary window | okno słownika | |
| on-device AI | wbudowana AI | "sztuczna inteligencja" is too long for labels; AI is common in Polish UIs |
| toolbar popup | ikona Langle na pasku narzędzi | |
| Langle sheet (phone) | panel Langle | |

Placeholders and case:
- `languageName.*` are lowercase nominatives ("angielski"), as Polish writes language names; options in menus are capitalized ("Japoński (日本語)"). Names stand in parentheses or as a sentence subject, never where the genitive "angielskiego" would be needed.
- `{syncName}` may be English now and Polish later, so it stands in parentheses after "chmura przeglądarki" or after a colon.
- `{provider}`, `{browser}`, `{site}` follow a noun that carries the case ("na dysku {provider}" avoided; "w usłudze {provider}", "na stronie {site}"), so the brand name stays uninflected.
- Plural forms one / few / many / other ("1 słowo", "2 słowa", "5 słów"); `other` (fractions) is written with a colon where the genitive singular would read oddly.

Choices:
- "New-word level" section is "Zasób słów": the setting says how many common words you already know.
- "Most seen" is "Najczęstsze"; "A–Z" is "Alfabetycznie".
- "Mark all as Learning / Known" are "Wszystkie do „Uczę się”" / "Wszystkie do „Znam”": short and spoken; the setting's "Mark as Known" is "Oznacz jako znane".
- "Buy me a coffee" is "Postaw mi kawę", the usual Polish phrase.
- Store description addresses the reader with Ty, as Google Play listings in Polish do.
- No gendered past tense addressed to the user ("widziałeś/widziałaś"): present tense, nouns or impersonal forms instead ("Gdzie występuje", "Wymagane ponowne połączenie").
- "I speak" in setup is "Mój język": "Mówię po" cannot take the endonym that follows.
- "Google Drive" stays in Latin script as a brand, after "usługa" where it needs a case ("Połącz usługę {provider}").

## Review

Second-pass review for naturalness and consistency.

Decisions: register Ty and the glossary stand, except the setup's language labels, which now use the Settings rows' names («Twój język», «Język nauki»); this replaces the «Mój język» choice above. Plural forms checked for one/few/many/other in every counted string.

Changed keys:

| Key | Before | After | Why |
|---|---|---|---|
| `popup.sync.space` | Miejsce na synchronizację: {used} KB z {quota} KB | Miejsce na synchronizację: zajęte {used} KB z {quota} KB | en says 'used'; without it the numbers read as free space |
| `settings.level.label` | one: Traktuj {count} najczęstsze słowo ({language}) jako znane / few: Traktuj {count} najczęstsze słowa ({language}) jako znane / many: Traktuj {count} najczęstszych słów ({language}) jako znane / other: Najczęstsze słowa ({language}) traktowane jako znane: {count} | one: Traktuj {count} najczęstsze słowo ({language}) jako znane / few: Traktuj {count} najczęstsze słowa ({language}) jako znane / many: Traktuj {count} najczęstszych słów ({language}) jako znane / other: Traktuj {count} najczęstszych słów ({language}) jako znane | the caller passes {count} formatted ("5000" with a space), which can only resolve to `other`; levels are whole hundreds and thousands, which take the many form |
| `settings.highlighting.switch` | Wyróżniaj słowa „{category}” | Wyróżniaj słowa z kategorii „{category}” | {category} is the bare name (Nowe/Uczę się/Znam); „słowa „Znam”” did not read as Polish |
| `settings.highlighting.unsavedAtEndDesc` | Co się z nimi dzieje, gdy film się kończy albo dochodzisz do końca artykułu. „Zostaw jako nowe” zostawia je na następny raz; „Oznacz jako znane” zapisuje wszystkie jako „Znam”. | Co się z nimi dzieje, gdy film się kończy albo dochodzisz do końca artykułu. „Zostaw jako nowe” pozostawia je na następny raz; „Oznacz jako znane” zapisuje wszystkie jako „Znam”. | «Zostaw … zostawia» repeated the verb |
| `settings.comingLater` | Wkrótce | Dostępne później | «Wkrótce» promises 'soon'; en only says 'later' |
| `settings.sites.lead` | Gdzie działa Langle. Na pojedynczej stronie możesz go też wyłączyć ikoną Langle na pasku narzędzi. | Gdzie działa Langle. Na pojedynczej stronie możesz go też wyłączyć za pomocą ikony Langle na pasku narzędzi. | «wyłączyć ikoną» is clumsy instrumental |
| `settings.sync.switchDesc` | Zapisuje każde słowo i jego status, bez źródeł i zdań. Trafia na Twoje inne urządzenia po zalogowaniu się w przeglądarce {browser} z włączoną synchronizacją. | Synchronizowane są słowa i ich status, bez źródeł i zdań. Trafiają na Twoje inne urządzenia po zalogowaniu się w przeglądarce {browser} z włączoną synchronizacją. | «Zapisuje … Trafia» had no clear subject for the second verb |
| `settings.cloud.connected` | {provider}. Wszystko jest tam zapisywane, w folderze, który może otworzyć tylko Langle. | Połączono z usługą {provider}. Wszystko jest tam zapisywane, w folderze, który może otworzyć tylko Langle. | a bare provider name followed by a period is not a sentence |
| `settings.cloud.connectedAccount` | {provider} ({account}). Wszystko jest tam zapisywane, w folderze, który może otworzyć tylko Langle. | Połączono z usługą {provider} ({account}). Wszystko jest tam zapisywane, w folderze, który może otworzyć tylko Langle. | same as connected |
| `settings.cloud.reconnectDesc` | Nowe zmiany czekają na tym urządzeniu, aż połączysz się ponownie. | Nowe zmiany pozostaną na tym urządzeniu, dopóki nie połączysz się ponownie. | «czekają» personified the changes |
| `video.toggle.on` | Langle jest włączony – kliknij, aby wyłączyć | Langle jest włączony. Kliknij, aby wyłączyć | no dash in a tooltip |
| `video.toggle.off` | Langle jest wyłączony – kliknij, aby włączyć | Langle jest wyłączony. Kliknij, aby włączyć | no dash in a tooltip |
| `video.menu.dualSubtitles` | Podwójne napisy | Napisy dwujęzyczne | «Podwójne» means doubled; the setting shows the line in two languages |
| `setup.consent.where` | Zapisuje Twoje dane tylko na Twoim urządzeniu i w Twoich własnych usługach chmurowych, nigdzie indziej. Autor nie dostaje z nich niczego. | Zapisuje Twoje dane tylko na Twoim urządzeniu i w Twoich własnych usługach chmurowych, nigdzie indziej. Twórca aplikacji nie otrzymuje żadnych z nich. | «Autor nie dostaje z nich niczego» was colloquial for a privacy statement |
| `setup.consent.whereDevice` | Zapisuje Twoje dane tylko na tym telefonie, nigdzie indziej. Autor nie dostaje z nich niczego. | Zapisuje Twoje dane tylko na tym telefonie, nigdzie indziej. Twórca aplikacji nie otrzymuje żadnych z nich. | same as where |
| `setup.consent.keepsWhat` | Twoje słowa oraz historię zdań, adresów stron i tytułów na tym urządzeniu, aby pokazać, gdzie pojawiło się dane słowo. | Twoje zapisane słowa oraz historię zdań, adresów stron i tytułów na tym urządzeniu, aby pokazać, gdzie pojawiło się dane słowo. | consent text names the saved words |
| `setup.consent.keepsWhatDevice` | Twoje słowa, ustawienia oraz historię zdań, adresów stron i tytułów na tym telefonie, aby pokazać, gdzie pojawiło się dane słowo. | Twoje zapisane słowa, ustawienia oraz historię zdań, adresów stron i tytułów na tym telefonie, aby pokazać, gdzie pojawiło się dane słowo. | same as keepsWhat |
| `setup.consent.sendsWhatDevice` | Tylko słowo, które sprawdzasz lub odsłuchujesz, do usługi podającej jego znaczenie lub wymowę. Twoje słowa i ustawienia zostają na tym telefonie. | Tylko słowo, które sprawdzasz lub odsłuchujesz, do usługi podającej jego znaczenie lub wymowę. Twoje zapisane słowa i ustawienia zostają na tym telefonie. | same as keepsWhat |
| `setup.languages.native` | Mój język | Twój język | same name as the Settings row it sets |
| `setup.languages.learning` | Uczę się | Język nauki | same name as the Settings row it sets; «Uczę się» also clashed with the category name |
| store `description` | Ucz się języków na filmach i artykułach, które i tak oglądasz i czytasz. | Ucz się języków z filmów i artykułów, które i tak oglądasz i czytasz. | «uczyć się z» is the idiom for learning from material |
