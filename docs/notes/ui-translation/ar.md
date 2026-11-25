# Arabic (ar) interface glossary

Modern Standard Arabic, as Chrome's Arabic UI. The layout is mirrored, so text is written as natural right-to-left Arabic.

Register: the second person masculine singular in sentences, as Chrome's Arabic UI does ("يمكنك", "انقر"); buttons, menu items and switches are verbal nouns ("حفظ", "تنزيل", "إعادة المحاولة", "عرض النص"); progress lines use "جارٍ …" ("جارٍ التنزيل"). Gendered forms are avoided where a verbal noun or passive does the job ("عند تسجيل الدخول", "تم استيراد"). Punctuation: Arabic comma "،", question mark "؟", semicolon "؛"; quotation marks «…».

Digits: **Western digits** (0–9), as Chrome's Arabic UI and `Intl.NumberFormat("ar")` in current Chrome produce; the number placeholders are filled by code, and the few fixed numbers are written the same way. Percent as "{percent}%".

| English | Arabic | Note |
|---|---|---|
| New / Learning / Known (categories) | جديدة / قيد التعلّم / معروفة | feminine, agreeing with كلمة and عبارة; names in «…» inside sentences |
| Learned (filter) | مُتقَنة | "mastered"; dates as "أُتقنت: {date}" |
| Saved | تم الحفظ / محفوظة | never "تمت المزامنة" for the result |
| meaning | المعنى / المعاني | |
| phrase | عبارة | |
| word | كلمة | |
| highlight | التمييز / تمييز | "محدّدة" is kept for a text selection |
| word list | قائمة الكلمات | |
| Your language | لغتك | |
| learning language | اللغة التي تتعلّمها | |
| interface language | لغة الواجهة | |
| language data / pack | بيانات اللغة / حزمة | |
| subtitles | الترجمة المصاحبة | the standard term for on-screen subtitles; plain "الترجمة" is kept for the translation into your language, so the two never collide |
| transcript | النص | YouTube's Arabic UI ("عرض النص") |
| sentence | جملة / جمل | |
| sentence history | سجلّ الجمل | like "سجلّ التصفّح" |
| sync | المزامنة | Chrome's word |
| backup | النسخة الاحتياطية / النسخ الاحتياطي | |
| sign in | تسجيل الدخول | |
| connect / disconnect (cloud) | ربط / إلغاء الربط | |
| Settings / Download / Theme | الإعدادات / تنزيل / السمة | Chrome's words; theme options النظام / فاتح / داكن |
| default | تلقائي | Chrome's word for a default setting |
| dictionary window | نافذة القاموس | |
| on-device AI | الذكاء الاصطناعي على الجهاز | "المدمج في {browser}" when the browser is named |
| toolbar popup | رمز Langle في شريط الأدوات | |
| Langle sheet (phone) | لوحة Langle | |
| MB / KB | ميغابايت / كيلوبايت | as Chrome's Arabic UI |

Placeholders:
- `languageName.*` carry the article ("الإنجليزية"), so they read correctly after "في", "بيانات" and "يتعلّمون" without change.
- The language pair arrow is "←" so it points from the learning language to your language in right-to-left reading.
- `{syncName}`, `{provider}`, `{browser}` stay in Latin script; no Arabic prefix (و، بـ، لـ) is attached to a placeholder.
- Plural forms zero / one / two / few / many / other: one and two are written as words ("كلمة واحدة", "كلمتان"), few takes the plural ("3 كلمات"), many the accusative singular ("11 جهازًا"), other the genitive singular ("100 كلمة").

Choices:
- "New-word level" section is "حصيلة الكلمات": the setting says how many common words you already know.
- "Mark all as Learning / Known" are "وضع الكل في «قيد التعلّم»" / "وضع الكل في «معروفة»".
- "Become a sponsor" is "رعاية Langle" and "Nice work!" is "عمل رائع!" to avoid a gendered imperative or address.
- "I speak / I'm learning" are "أتحدّث" / "أتعلّم": with the chosen language after them they read as a sentence ("أتحدّث العربية").

## Review

Second-pass review for naturalness and consistency.

Decisions: MSA, masculine second person and the glossary stand, except the setup's language labels, which now use the Settings rows' names (لغتك، اللغة التي تتعلّمها); this replaces the أتحدّث / أتعلّم choice above. All six plural forms checked in every counted string; settings.level.label's other form (genitive singular) is the one whole hundreds and thousands take.

Changed keys:

| Key | Before | After | Why |
|---|---|---|---|
| `settings.highlighting.switch` | تمييز الكلمات: {category} | تمييز كلمات فئة «{category}» | {category} is the bare name (جديدة/قيد التعلّم/معروفة); «تمييز الكلمات: معروفة» read as a label fragment |
| `settings.comingLater` | قريبًا | يتوفر لاحقًا | «قريبًا» promises 'soon'; en only says 'later' |
| `settings.history.pages` | zero: لا صفحات ولا فيديوهات · تُحذف الأقدم أولًا عند امتلاء المساحة / one: صفحة أو فيديو واحد · تُحذف الأقدم أولًا عند امتلاء المساحة / two: اثنان من الصفحات والفيديوهات · تُحذف الأقدم أولًا عند امتلاء المساحة / few: {count} صفحات وفيديوهات · تُحذف الأقدم أولًا عند امتلاء المساحة / many: {count} صفحة وفيديو · تُحذف الأقدم أولًا عند امتلاء المساحة / other: {count} صفحة وفيديو · تُحذف الأقدم أولًا عند امتلاء المساحة | zero: لا صفحات ولا فيديوهات · تُحذف الأقدم أولًا عند امتلاء المساحة / one: صفحة أو فيديو واحد · تُحذف الأقدم أولًا عند امتلاء المساحة / two: 2 من الصفحات والفيديوهات · تُحذف الأقدم أولًا عند امتلاء المساحة / few: {count} صفحات وفيديوهات · تُحذف الأقدم أولًا عند امتلاء المساحة / many: {count} صفحة وفيديو · تُحذف الأقدم أولًا عند امتلاء المساحة / other: {count} صفحة وفيديو · تُحذف الأقدم أولًا عند امتلاء المساحة | two: «اثنان من الصفحات والفيديوهات» was clumsy; a count of mixed items reads «2 من …» |
| `settings.sync.switchDesc` | يضيف كل كلمة وحالتها، دون المصادر والجمل. وتصل إلى أجهزتك الأخرى عند تسجيل الدخول إلى {browser} مع تفعيل المزامنة. | تُزامَن الكلمات وحالاتها فقط، دون المصادر والجمل، وتصل إلى أجهزتك الأخرى عند تسجيل الدخول إلى {browser} مع تفعيل المزامنة. | «يضيف» was a literal 'adds', and «وتصل» had no feminine subject |
| `settings.cloud.connected` | {provider}. يُحفظ كل شيء هناك في مجلد لا يفتحه إلا Langle. | تم ربط {provider}. يُحفظ كل شيء هناك في مجلد لا يفتحه إلا Langle. | a bare provider name followed by a period is not a sentence |
| `settings.cloud.connectedAccount` | {provider} ({account}). يُحفظ كل شيء هناك في مجلد لا يفتحه إلا Langle. | تم ربط {provider} ({account}). يُحفظ كل شيء هناك في مجلد لا يفتحه إلا Langle. | same as connected |
| `settings.cloud.reconnectDesc` | تنتظر التغييرات الجديدة على هذا الجهاز حتى تعيد الربط. | تبقى التغييرات الجديدة على هذا الجهاز حتى تعيد الربط. | «تنتظر» personified the changes |
| `dict.fitsHere` | يناسب هنا | مناسب هنا | a chip states a quality: «مناسب», not the verb «يناسب» |
| `saveAll.note` | تحتفظ الكلمات التي حفظتها سابقًا بحالتها. ولا تُحتسب الكلمات الواقعة ضمن مستوى الكلمات الشائعة. | تحتفظ الكلمات التي حفظتها سابقًا بحالتها. ولا تُحتسب الكلمات التي تقع ضمن حصيلة كلماتك. | use the section name «حصيلة الكلمات» for the common-word level |
| `video.toggle.on` | Langle مفعّل — انقر لإيقافه | Langle مفعّل. انقر لإيقافه | no dash in a tooltip |
| `video.toggle.off` | Langle متوقف — انقر لتفعيله | Langle متوقف. انقر لتفعيله | no dash in a tooltip |
| `video.menu.dualSubtitles` | عرض ترجمة مصاحبة مزدوجة | عرض ترجمة مصاحبة بلغتين | «مزدوجة» means doubled; the setting shows the line in two languages |
| `time.justNow` | الآن | قبل لحظات | fills «آخر حفظ: {when}», a past time; «الآن» means 'now' |
| `sponsor.sponsored` | برعاية | مموَّل | «برعاية» alone is an unfinished 'sponsored by' |
| `setup.consent.where` | يحفظ بياناتك على جهازك وفي خدماتك السحابية الخاصة فقط، ولا مكان غير ذلك. ولا يتلقى المطوّر أيًّا منها. | يحفظ بياناتك على جهازك وفي خدماتك السحابية الخاصة فقط، لا في أي مكان آخر. ولا يتلقى المطوّر أيًّا منها. | «ولا مكان غير ذلك» was a calque of 'nowhere else' |
| `setup.consent.whereDevice` | يحفظ بياناتك على هذا الهاتف فقط، ولا مكان غير ذلك. ولا يتلقى المطوّر أيًّا منها. | يحفظ بياناتك على هذا الهاتف فقط، لا في أي مكان آخر. ولا يتلقى المطوّر أيًّا منها. | same as where |
| `setup.consent.keepsWhat` | بكلماتك وسجلّ للجمل وروابط الصفحات وعناوينها على هذا الجهاز، ليُظهر أين صادفت الكلمة. | بكلماتك المحفوظة وسجلّ للجمل وروابط الصفحات وعناوينها على هذا الجهاز، ليُظهر أين صادفت الكلمة. | consent text names the saved words |
| `setup.consent.keepsWhatDevice` | بكلماتك وإعداداتك وسجلّ للجمل وروابط الصفحات وعناوينها على هذا الهاتف، ليُظهر أين صادفت الكلمة. | بكلماتك المحفوظة وإعداداتك وسجلّ للجمل وروابط الصفحات وعناوينها على هذا الهاتف، ليُظهر أين صادفت الكلمة. | same as keepsWhat |
| `setup.consent.sendsWhatDevice` | الكلمة التي تبحث عنها أو تستمع إليها فقط، إلى الخدمة التي توفّر معناها أو نطقها. وتبقى كلماتك وإعداداتك على هذا الهاتف. | الكلمة التي تبحث عنها أو تستمع إليها فقط، إلى الخدمة التي توفّر معناها أو نطقها. وتبقى كلماتك المحفوظة وإعداداتك على هذا الهاتف. | same as keepsWhat |
| `setup.languages.native` | أتحدّث | لغتك | same name as the Settings row it sets |
| `setup.languages.learning` | أتعلّم | اللغة التي تتعلّمها | same name as the Settings row it sets |
