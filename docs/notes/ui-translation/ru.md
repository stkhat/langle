# Russian (ru) interface glossary

Register: **вы** (lowercase), as Chrome's Russian UI ("Войдите в аккаунт", "ваш аккаунт Google"). Buttons and menu items are infinitives ("Сохранить", "Скачать", "Удалить"); progress lines are nouns ("Скачивание…"). Quotation marks «…», nested „…“; dash " — "; "{percent}%" without a space, as Chrome's download UI.

| English | Russian | Note |
|---|---|---|
| New / Learning / Known (categories) | Новое / Изучаю / Знаю | short, from the learner's side, like flashcard apps' «Знаю»; in sentences the plain adjectives «новые», «известные» where they describe words, the names in «» where they name the category («перенесено в «Изучаю»») |
| Learned (filter) | Выучено | |
| Saved | Сохранено | never «синхронизировано» for the result |
| meaning | значение | |
| phrase | выражение | «фраза» reads as a whole sentence |
| word | слово | |
| highlight | подсветка / подсвечивать | «выделение» is kept for a text selection («Выделено · не сохранено») |
| word list | список слов | |
| Your language | ваш язык | |
| learning language | изучаемый язык | |
| interface language | язык интерфейса | |
| language data / pack | языковые данные / пакет | |
| subtitles / transcript | субтитры / расшифровка | YouTube's Russian UI |
| sentence | предложение | |
| sentence history | история предложений | |
| sync | синхронизация | Chrome's word |
| backup | резервная копия, файл резервной копии | |
| sign in | войти | |
| Settings / Download / Theme | Настройки / Скачать / Тема | Chrome's words; theme options Системная / Светлая / Тёмная |
| dictionary window | окно словаря | |
| on-device AI | встроенный ИИ | section title «Встроенный ИИ» |
| toolbar popup | значок Langle на панели инструментов | |
| Langle sheet (phone) | панель Langle | |
| video (YouTube) | видео | |

Placeholders and case:
- `languageName.*` are lowercase adjectives in the nominative, as Google's Russian UI writes language names («английский → японский»); options in menus are capitalized («Японский (日本語)»). A name stands only where the nominative or the (identical) inanimate accusative fits («кто изучает {language}») or in parentheses («языковые данные ({language})»).
- `{syncName}` may be English («Chrome sync») now and Russian later, so it stands in parentheses after «облако браузера» or after a colon, never where a case ending is needed.
- `{provider}`, `{browser}`, `{site}` are brand names or domains, which stay uninflected after prepositions («в Dropbox», «на YouTube»).
- `{when}` is a relative time («2 минуты назад», «только что»); «Последнее сохранение: {when}» takes either a relative time or a date.
- Plural forms one / few / many / other («1 слово», «2 слова», «5 слов»); the `other` form is the fractional one.

Choices:
- "New-word level" section is «Словарный запас»: the setting says how many common words you already know.
- "Most seen" is «Чаще всего»; "A–Z" is «По алфавиту», because the sorted words are in the learning language, not Cyrillic.
- "Mark all as Learning / Known" are «Все в «Изучаю»» / «Все в «Знаю»»: short and spoken; the setting's "Mark as Known" is «Отметить известными».
- "Buy me a coffee" is «Угостить кофе».
- "Google Drive" stays in Latin script in fixed text, matching `{provider}`.
- Store description in the вы form, plain and direct.

## Review

Second-pass review for naturalness and consistency.

Decisions: register вы and the glossary stand, except the setup's language labels, which now use the Settings rows' names («Ваш язык», «Изучаемый язык»). Plural forms checked for one/few/many/other in every counted string.

Changed keys:

| Key | Before | After | Why |
|---|---|---|---|
| `popup.sync.space` | Место для синхронизации: {used} КБ из {quota} КБ | Место для синхронизации: занято {used} КБ из {quota} КБ | en says 'used'; without «занято» the numbers read as free space |
| `settings.highlighting.switch` | Подсвечивать слова «{category}» | Подсвечивать слова категории «{category}» | {category} is the bare name (Новое/Изучаю/Знаю); «слова «Знаю»» did not read as Russian |
| `settings.comingLater` | Скоро | Появится позже | «Скоро» promises 'soon'; en only says 'later' |
| `settings.video.keysDesc` | Переход по субтитрам, пока Langle включён. Нажмите на клавишу, чтобы её изменить. | Переход по субтитрам, пока Langle включён. Щёлкните по клавише, чтобы её изменить. | «Нажмите на клавишу» read as pressing a keyboard key; the user clicks the on-screen key |
| `settings.sync.switchDesc` | Сохраняет каждое слово и его статус, без источников и предложений. Попадает на другие ваши устройства, если вы вошли в {browser} и включили синхронизацию. | Синхронизируются слова и их статус, но не источники и предложения. На другие ваши устройства они попадут, если вы вошли в {browser} и включили синхронизацию. | «Сохраняет … Попадает» had no clear subject for the second verb |
| `settings.cloud.connected` | {provider}. Всё сохраняется там, в папке, которую может открыть только Langle. | Подключено хранилище {provider}. Всё сохраняется там, в папке, которую может открыть только Langle. | a bare provider name followed by a period is not a sentence |
| `settings.cloud.connectedAccount` | {provider} ({account}). Всё сохраняется там, в папке, которую может открыть только Langle. | Подключено хранилище {provider} ({account}). Всё сохраняется там, в папке, которую может открыть только Langle. | same as connected |
| `settings.cloud.reconnectDesc` | Новые изменения ждут на этом устройстве, пока вы не переподключитесь. | Новые изменения останутся на этом устройстве, пока вы не переподключитесь. | «ждут» personified the changes |
| `video.toggle.on` | Langle включён — нажмите, чтобы выключить | Langle включён. Нажмите, чтобы выключить | no dash in a tooltip |
| `video.toggle.off` | Langle выключен — нажмите, чтобы включить | Langle выключен. Нажмите, чтобы включить | no dash in a tooltip |
| `video.menu.dualSubtitles` | Двойные субтитры | Двуязычные субтитры | «Двойные» means doubled; the setting shows the line in two languages |
| `home.search` | Найдите на YouTube или введите адрес | Поиск на YouTube или адрес сайта | a search field placeholder is a noun phrase, not an imperative |
| `setup.consent.keepsWhat` | Ваши слова и историю предложений, веб-адресов и заголовков на этом устройстве — чтобы показывать, где вы встречали слово. | Ваши сохранённые слова и историю предложений, веб-адресов и заголовков на этом устройстве — чтобы показывать, где вы встречали слово. | consent text names the saved words |
| `setup.consent.keepsWhatDevice` | Ваши слова, настройки и историю предложений, веб-адресов и заголовков на этом телефоне — чтобы показывать, где вы встречали слово. | Ваши сохранённые слова, настройки и историю предложений, веб-адресов и заголовков на этом телефоне — чтобы показывать, где вы встречали слово. | same as keepsWhat |
| `setup.consent.sendsWhatDevice` | Только слово, которое вы ищете или слушаете, — в сервис, который даёт его значение или произношение. Ваши слова и настройки остаются на этом телефоне. | Только слово, которое вы ищете или слушаете, — в сервис, который даёт его значение или произношение. Ваши сохранённые слова и настройки остаются на этом телефоне. | same as keepsWhat |
| `setup.languages.native` | Мой язык | Ваш язык | same name as the Settings row it sets |
| `setup.languages.learning` | Я изучаю | Изучаемый язык | same name as the Settings row it sets; pairs with «Ваш язык» |
| store `description` | Учите языки на видео и статьях, которые вы и так смотрите и читаете. | Учите языки по видео и статьям, которые вы и так смотрите и читаете. | «учить по» is the idiom for learning from material; «на видео и статьях» was ungrammatical |
| `settings.level.label` | one: Считать известным {count} самое частое слово ({language}) / few: Считать известными {count} самых частых слова ({language}) / many: Считать известными {count} самых частых слов ({language}) / other: Считать известными {count} самых частых слова ({language}) | one: Считать известным {count} самое частое слово ({language}) / few: Считать известными {count} самых частых слова ({language}) / many: Считать известными {count} самых частых слов ({language}) / other: Считать известными {count} самых частых слов ({language}) | the caller passes {count} formatted ("5 000"), which can only resolve to `other`; levels are whole thousands and hundreds, which take the many form |
