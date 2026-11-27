# Chrome Web Store listing (draft)

Draft for [chrome-store-launch](chrome-store-launch.md) E1, written from the mock's `Store listing` and `Website` pages. The store's description field is plain text: paste each block as it is. The summary is not entered in the dashboard: it is the manifest's `description`, from `public/_locales/<locale>/messages.json` (132 characters at most, one per UI locale, each written to read naturally in its language rather than translated word for word). Every UI locale has a description below, written the same way: from the English, with the UI's own names for features (`src/i18n/locales/<lang>.json`) and the register of [the translation notes](../notes/ui-translation/). Google Drive goes by Google's own name in each language (Google ドライブ, Google Диск, Dysk Google, Google डिस्क, Google 드라이브, Google ไดรฟ์, Google 云端硬盘; elsewhere Google Drive), although the app's UI says "Google Drive" everywhere. Each was written by one agent and reviewed and corrected by a second, independent one; none has been read by a native speaker yet.

## English

### Summary

```
Learn a language from what you love to watch and read. Just hover any word on YouTube, Netflix or the web to see what it means.
```

### Description

```
Learn a language from what you love to watch and read.

Langle works right on top of whatever you're into: a YouTube channel, a Netflix series, an article you can't stop reading. Hover any word to see what it means, save the ones you want to keep, and come back to where you met them. It's free, and there's no account to create.

Just hover
• Words and phrases are highlighted by how well you know them: New, Learning or Known.
• Hover a word for its meaning. Click it to open the dictionary.
• Works on YouTube subtitles, transcripts and comments (Shorts too), on Netflix subtitles, and on articles across the web.

The meaning that fits the context
• Any form of a word leads to its dictionary entry, and phrases are recognized too: hover "dates back" and you get "date back".
• Press "Explain in context" and Chrome's built-in AI picks the meaning that fits the sentence, right on your device. This needs a computer that can run Gemini Nano in Chrome (about 22 GB of free disk space, plus either a GPU with more than 4 GB of VRAM or 16 GB of RAM and 4 CPU cores). Everything else works without it.

Your words, with where you met them
• Every saved word keeps its sentence and the video or page it came from.
• Langle also keeps a history of the sentences you read, so a word you save later already shows where you've seen it before. You can turn this off or clear it in Settings.
• From your word list, jump straight back to the scene in the video. Export to Anki or CSV, or back up everything to a file.

Free, and your data stays yours
• Every feature is included. No paywall, no subscription, no sign-up.
• Langle has no servers. Your words are saved on your device and in your browser's sync.
• If you like, connect your own Google Drive and your words follow you across your computers, with no Langle server in between.

Languages
Learn English, Spanish, French or German, with meanings in any of 16 languages: English, Japanese, Spanish, Portuguese, Russian, French, German, Chinese, Italian, Polish, Thai, Hindi, Arabic, Indonesian, Turkish and Korean. More are on the way.
Once you pick your languages, Langle downloads the language data for that pair. It's a one-time download.

Privacy policy: https://kskt-dev.github.io/langle/privacy/
```

## Japanese

UI names follow `src/i18n/locales/ja.json` (未知 / 学習中 / 既知, 文脈で説明, 文の履歴).

### Summary

```
好きな動画や気になる記事で、外国語を学べます。YouTube、Netflix、ウェブページの単語にカーソルを合わせるだけで、意味がわかります。
```

### Description

```
好きな動画や記事で、外国語を学ぼう。

Langle は、お気に入りの YouTube チャンネルや Netflix の作品、つい読み込んでしまう記事の上で、そのまま使える語学ツールです。単語にカーソルを合わせれば意味がわかり、覚えたい単語は保存して、出会った場所にいつでも戻れます。無料で、アカウントの登録も必要ありません。

カーソルを合わせるだけ
• 単語やフレーズは、どれだけ覚えているかに合わせて「未知」「学習中」「既知」で色分けされます。
• カーソルを合わせると意味が表示され、クリックすると辞書が開きます。
• YouTube の字幕・文字起こし・コメント（ショートにも対応）、Netflix の字幕、ウェブ上の記事で使えます。

文脈に合った意味を
• 活用した形からでも辞書の見出し語にたどり着けます。フレーズにも対応しているので、「dates back」にカーソルを合わせると「date back」が表示されます。
• 「文脈で説明」を押すと、Chrome に組み込まれた AI が、その文に合う意味をお使いのデバイス上で選びます。この機能には、Chrome で Gemini Nano を実行できるパソコンが必要です（空きディスク容量 約 22 GB に加えて、4 GB を超える VRAM を搭載した GPU か、16 GB の RAM と 4 コアの CPU のどちらか）。ほかの機能はこの条件がなくても使えます。

保存した単語は、出会った場所と一緒に
• 保存した単語には、その文と、出てきた動画やページが記録されます。
• 読んだ文の履歴も残るので、あとから保存した単語でも、以前どこで見かけたかがわかります。履歴は設定でオフにしたり、消去したりできます。
• 単語リストから、動画のその場面にすぐ戻れます。Anki や CSV への書き出し、ファイルへのバックアップにも対応しています。

無料。データはあなたの手元に
• すべての機能を無料で使えます。有料プランも、サブスクリプションも、会員登録もありません。
• Langle にはサーバーがありません。単語はお使いのデバイスと、ブラウザの同期機能に保存されます。
• ご自身の Google ドライブに接続すれば、複数のパソコンで同じ単語を使えます。間に Langle のサーバーは入りません。

対応言語
英語、スペイン語、フランス語、ドイツ語を学べます。意味は 16 の言語で表示できます：英語、日本語、スペイン語、ポルトガル語、ロシア語、フランス語、ドイツ語、中国語、イタリア語、ポーランド語、タイ語、ヒンディー語、アラビア語、インドネシア語、トルコ語、韓国語。対応言語は今後も増やしていきます。
言語を選ぶと、その組み合わせの言語データをダウンロードします。ダウンロードは最初の 1 回だけです。

プライバシー ポリシー: https://kskt-dev.github.io/langle/privacy/
```

## Arabic (`ar`)

### Summary

```
تعلّم اللغات من الفيديوهات والمقالات التي تحبها. مرّر المؤشر فوق أي كلمة على YouTube أو Netflix أو أي صفحة ويب لترى معناها.
```

### Description

```
تعلّم اللغات مما تحب مشاهدته وقراءته.

يعمل Langle مباشرةً داخل المحتوى الذي يشدّك: قناة على YouTube، أو مسلسل على Netflix، أو مقال لا تستطيع التوقف عن قراءته. مرّر المؤشر فوق أي كلمة لترى معناها، واحفظ الكلمات التي تريد الاحتفاظ بها، ثم عُد إلى حيث صادفتها. Langle مجاني، ولا يتطلب إنشاء حساب.

يكفي تمرير المؤشر
• تُميَّز الكلمات والعبارات بحسب مدى معرفتك بها: «جديدة» أو «قيد التعلّم» أو «معروفة».
• مرّر المؤشر فوق كلمة لترى معناها، وانقر عليها لفتح القاموس.
• يعمل مع الترجمة المصاحبة ونص الفيديو والتعليقات على YouTube (بما في ذلك Shorts)، ومع الترجمة المصاحبة على Netflix، ومع المقالات في مختلف مواقع الويب.

المعنى الذي يناسب السياق
• أي صيغة للكلمة تقودك إلى مدخلها في القاموس، ويتعرّف Langle على العبارات أيضًا: مرّر المؤشر فوق «dates back» وستظهر لك «date back».
• انقر على «الشرح في السياق» وسيختار الذكاء الاصطناعي المدمج في Chrome المعنى المناسب للجملة، على جهازك مباشرةً. تتطلب هذه الميزة جهاز كمبيوتر يمكنه تشغيل Gemini Nano في Chrome (مساحة خالية على القرص تبلغ نحو 22 غيغابايت، بالإضافة إلى وحدة GPU بذاكرة VRAM تزيد على 4 غيغابايت، أو ذاكرة RAM بسعة 16 غيغابايت ومعالج CPU يضم 4 أنوية). أما بقية الميزات فتعمل من دونها.

كلماتك، مع المكان الذي صادفتها فيه
• تحتفظ كل كلمة تحفظها بجملتها وبالفيديو أو الصفحة التي جاءت منها.
• يحتفظ Langle أيضًا بسجلّ للجمل التي تقرؤها، لذا حتى الكلمة التي تحفظها لاحقًا تُظهر لك فورًا أين رأيتها من قبل. يمكنك إيقاف سجلّ الجمل أو محوه من الإعدادات.
• انتقل من قائمة الكلمات مباشرةً إلى المشهد نفسه في الفيديو. صدّر كلماتك إلى Anki أو بتنسيق CSV، أو احفظ نسخة احتياطية من كل شيء في ملف.

مجاني، وبياناتك ملكك
• جميع الميزات متاحة، بلا خطط مدفوعة ولا اشتراك ولا تسجيل.
• ليس لدى Langle أي خوادم. تُحفظ كلماتك على جهازك وفي مساحة المزامنة في متصفحك.
• إن أردت، اربط حسابك على Google Drive لترافقك كلماتك على جميع أجهزة الكمبيوتر لديك، من دون المرور بأي خادم من خوادم Langle.

اللغات
تعلّم الإنجليزية أو الإسبانية أو الفرنسية أو الألمانية، واعرض المعاني بأي من 16 لغة: الإنجليزية واليابانية والإسبانية والبرتغالية والروسية والفرنسية والألمانية والصينية والإيطالية والبولندية والتايلاندية والهندية والعربية والإندونيسية والتركية والكورية. والمزيد من اللغات في الطريق.
بعد اختيار لغاتك، ينزّل Langle بيانات اللغة الخاصة بهذا الزوج من اللغات. ويتم التنزيل مرة واحدة فقط.

سياسة الخصوصية: https://kskt-dev.github.io/langle/privacy/
```

## German (`de`)

### Summary

```
Sprachen lernen mit dem, was Sie gern sehen und lesen. Zeigen Sie auf YouTube, Netflix oder im Web auf ein Wort, um es zu verstehen.
```

### Description

```
Sprachen lernen mit dem, was Sie gern sehen und lesen.

Langle funktioniert direkt dort, wo Sie ohnehin gerade sind: auf einem YouTube-Kanal, in einer Netflix-Serie, in einem Artikel, von dem Sie nicht loskommen. Zeigen Sie auf ein Wort, um seine Bedeutung zu sehen, speichern Sie die Wörter, die Sie behalten möchten, und kehren Sie später an die Stelle zurück, an der Sie ihnen begegnet sind. Langle ist kostenlos, ein Konto brauchen Sie nicht.

Einfach auf ein Wort zeigen
• Wörter und Ausdrücke werden danach hervorgehoben, wie gut Sie sie kennen: „Neu“, „Lernen“ oder „Bekannt“.
• Zeigen Sie auf ein Wort, um seine Bedeutung zu sehen. Mit einem Klick öffnen Sie das Wörterbuch.
• Funktioniert mit Untertiteln, Transkripten und Kommentaren auf YouTube (auch bei Shorts), mit Untertiteln auf Netflix und mit Artikeln im ganzen Web.

Die Bedeutung, die zum Kontext passt
• Jede Wortform führt zum passenden Wörterbucheintrag, und auch Ausdrücke werden erkannt: Bei „dates back“ sehen Sie „date back“.
• Klicken Sie auf „Im Kontext erklären“, und die integrierte KI von Chrome wählt direkt auf Ihrem Gerät die Bedeutung aus, die zum Satz passt. Dafür brauchen Sie einen Computer, auf dem Gemini Nano in Chrome läuft (etwa 22 GB freier Speicherplatz sowie entweder eine GPU mit mehr als 4 GB VRAM oder 16 GB RAM und 4 CPU-Kerne). Alle anderen Funktionen sind davon unabhängig.

Ihre Wörter und wo Sie ihnen begegnet sind
• Zu jedem gespeicherten Wort merkt sich Langle den Satz und das Video oder die Seite, wo es vorkam.
• Langle führt außerdem einen Verlauf der Sätze, die Sie lesen. So sehen Sie auch bei einem Wort, das Sie erst später speichern, wo es Ihnen schon begegnet ist. Den Satzverlauf können Sie in den Einstellungen deaktivieren oder löschen.
• Aus Ihrer Wortliste springen Sie direkt zur Szene im Video zurück. Exportieren Sie Ihre Wörter für Anki oder als CSV, oder sichern Sie alles in einer Datei.

Kostenlos – und Ihre Daten gehören Ihnen
• Alle Funktionen sind enthalten. Keine kostenpflichtigen Extras, kein Abo, keine Registrierung.
• Langle hat keine Server. Ihre Wörter werden auf Ihrem Gerät und in der Synchronisierung Ihres Browsers gespeichert.
• Wenn Sie möchten, verbinden Sie Ihr eigenes Google Drive. Dann sind Ihre Wörter auf all Ihren Computern dabei, ganz ohne Langle-Server dazwischen.

Sprachen
Lernen Sie Englisch, Spanisch, Französisch oder Deutsch. Die Bedeutungen gibt es in 16 Sprachen: Englisch, Japanisch, Spanisch, Portugiesisch, Russisch, Französisch, Deutsch, Chinesisch, Italienisch, Polnisch, Thailändisch, Hindi, Arabisch, Indonesisch, Türkisch und Koreanisch. Weitere sind in Vorbereitung.
Sobald Sie Ihre Sprachen ausgewählt haben, lädt Langle die Sprachdaten für diese Kombination herunter. Das ist nur einmal nötig.

Datenschutzerklärung: https://kskt-dev.github.io/langle/privacy/
```

## Spanish (Latin America) (`es`)

### Summary

```
Aprende idiomas con lo que te gusta ver y leer. Pasa el cursor sobre una palabra en YouTube, Netflix o la Web y mira qué significa.
```

### Description

```
Aprende idiomas con lo que te gusta ver y leer.

Langle funciona directamente en lo que te apasiona: un canal de YouTube, una serie de Netflix, un artículo que no puedes dejar de leer. Pasa el cursor sobre cualquier palabra para ver qué significa, guarda las que quieras conservar y vuelve al lugar donde las encontraste. Es gratis y no necesitas crear una cuenta.

Solo pasa el cursor
• Las palabras y expresiones se resaltan según lo bien que las conoces: “Nueva”, “Aprendiendo” o “Conocida”.
• Pasa el cursor sobre una palabra para ver su significado. Haz clic en ella para abrir el diccionario.
• Funciona en los subtítulos, las transcripciones y los comentarios de YouTube (también en Shorts), en los subtítulos de Netflix y en artículos de toda la Web.

El significado que encaja en el contexto
• Cualquier forma de una palabra te lleva a su entrada en el diccionario, y también se reconocen las expresiones: pasa el cursor sobre “dates back” y obtienes “date back”.
• Haz clic en “Explicar en contexto” y la IA integrada de Chrome elige el significado que encaja en la oración, directamente en tu dispositivo. Para esto necesitas una computadora que pueda ejecutar Gemini Nano en Chrome (unos 22 GB de espacio libre en disco, además de una GPU con más de 4 GB de VRAM, o bien 16 GB de RAM y 4 núcleos de CPU). Las demás funciones no tienen este requisito.

Tus palabras, con el lugar donde las encontraste
• Cada palabra guardada conserva su oración y el video o la página de donde salió.
• Langle también guarda un historial de las oraciones que lees, así que una palabra que guardes más adelante ya muestra dónde la viste antes. Puedes desactivar o borrar el historial de oraciones en la configuración.
• Desde tu lista de palabras, vuelve directamente a la escena del video. Exporta a Anki o CSV, o haz una copia de seguridad de todo en un archivo.

Gratis, y tus datos siguen siendo tuyos
• Todo está incluido. Sin funciones de pago, sin suscripciones, sin registro.
• Langle no tiene servidores. Tus palabras se guardan en tu dispositivo y en la sincronización de tu navegador.
• Si quieres, conecta tu propio Google Drive y tus palabras te acompañarán en todas tus computadoras, sin ningún servidor de Langle de por medio.

Idiomas
Aprende inglés, español, francés o alemán, con significados en cualquiera de estos 16 idiomas: inglés, japonés, español, portugués, ruso, francés, alemán, chino, italiano, polaco, tailandés, hindi, árabe, indonesio, turco y coreano. Se irán sumando más.
Cuando eliges tus idiomas, Langle descarga los datos de idioma para esa combinación. La descarga se hace una sola vez.

Política de privacidad: https://kskt-dev.github.io/langle/privacy/
```

## French (`fr`)

### Summary

```
Apprenez une langue avec ce que vous aimez regarder et lire. Survolez un mot sur YouTube, Netflix ou le Web pour en voir le sens.
```

### Description

```
Apprenez une langue avec ce que vous aimez regarder et lire.

Langle s'utilise directement sur ce qui vous passionne : une chaîne YouTube, une série Netflix, un article que vous ne pouvez plus lâcher. Survolez un mot pour en voir le sens, enregistrez ceux que vous voulez garder et retrouvez l'endroit où vous les avez rencontrés. C'est gratuit, et aucun compte n'est nécessaire.

Survolez, tout simplement
• Les mots et les expressions sont surlignés selon votre niveau de maîtrise : « Nouveau », « À apprendre » ou « Connu ».
• Survolez un mot pour afficher son sens. Cliquez dessus pour ouvrir le dictionnaire.
• Fonctionne avec les sous-titres, les transcriptions et les commentaires YouTube (Shorts compris), les sous-titres Netflix et les articles de tout le Web.

Le sens qui correspond au contexte
• Toutes les formes d'un mot mènent à son entrée dans le dictionnaire, et les expressions sont reconnues elles aussi : survolez « dates back » et vous obtenez « date back ».
• Cliquez sur « Expliquer en contexte » : l'IA intégrée à Chrome choisit le sens qui convient à la phrase, directement sur votre appareil. Il faut pour cela un ordinateur capable d'exécuter Gemini Nano dans Chrome (environ 22 Go d'espace disque libre, ainsi qu'un GPU doté de plus de 4 Go de VRAM, ou 16 Go de RAM et 4 cœurs de processeur). Les autres fonctionnalités n'en ont pas besoin.

Vos mots, avec l'endroit où vous les avez rencontrés
• Chaque mot enregistré conserve sa phrase et la vidéo ou la page d'où il vient.
• Langle garde aussi un historique des phrases que vous lisez : un mot que vous enregistrez plus tard indique donc déjà où vous l'avez vu auparavant. Vous pouvez désactiver ou effacer l'historique des phrases dans les paramètres.
• Depuis votre liste de mots, revenez directement à la scène de la vidéo. Exportez vers Anki ou au format CSV, ou sauvegardez tout dans un fichier.

Gratuit, et vos données restent les vôtres
• Toutes les fonctionnalités sont incluses. Aucune option payante, aucun abonnement, aucune inscription.
• Langle n'a aucun serveur. Vos mots sont enregistrés sur votre appareil et dans la synchronisation de votre navigateur.
• Si vous le souhaitez, connectez votre propre Google Drive : vos mots vous suivent alors sur tous vos ordinateurs, sans passer par un serveur Langle.

Langues
Apprenez l'anglais, l'espagnol, le français ou l'allemand, avec le sens des mots dans l'une des 16 langues suivantes : anglais, japonais, espagnol, portugais, russe, français, allemand, chinois, italien, polonais, thaï, hindi, arabe, indonésien, turc et coréen. D'autres langues sont en préparation.
Une fois vos langues choisies, Langle télécharge les données linguistiques de cette combinaison. Ce téléchargement n'a lieu qu'une seule fois.

Règles de confidentialité : https://kskt-dev.github.io/langle/privacy/
```

## Hindi (`hi`)

### Summary

```
अपनी पसंद के वीडियो और लेखों से नई भाषा सीखें। YouTube, Netflix या किसी भी वेबपेज पर किसी शब्द पर कर्सर ले जाएं और उसका मतलब देखें।
```

### Description

```
जो देखना और पढ़ना पसंद है, उसी से नई भाषा सीखें।

Langle वहीं काम करता है जहां आपका मन लगता है: कोई YouTube चैनल, Netflix की कोई सीरीज़, या ऐसा लेख जिसे आप पढ़ते ही चले जाते हैं। किसी भी शब्द पर कर्सर ले जाएं और उसका मतलब देखें, जो शब्द याद रखने हैं उन्हें सेव करें, और फिर वहीं लौटें जहां वे आपको मिले थे। यह मुफ़्त है और कोई खाता बनाने की ज़रूरत नहीं है।

बस कर्सर ले जाएं
• शब्द और फ़्रेज़ इस हिसाब से हाइलाइट होते हैं कि आप उन्हें कितनी अच्छी तरह जानते हैं: “नया”, “सीख रहे” या “जाने-पहचाने”।
• किसी शब्द पर कर्सर ले जाएं, उसका मतलब दिख जाएगा। उस पर क्लिक करें, डिक्शनरी खुल जाएगी।
• YouTube के सबटाइटल, ट्रांसक्रिप्ट और टिप्पणियों (Shorts में भी), Netflix के सबटाइटल और वेब के लेखों पर काम करता है।

संदर्भ के हिसाब से सही मतलब
• शब्द किसी भी रूप में हो, आप उसकी डिक्शनरी एंट्री तक पहुंच जाते हैं। फ़्रेज़ भी पहचाने जाते हैं: “dates back” पर कर्सर ले जाएं, तो “date back” दिखेगा।
• “संदर्भ में समझाएं” दबाएं, और Chrome का बिल्ट-इन AI आपके डिवाइस पर ही वाक्य के हिसाब से सही मतलब चुन लेगा। इसके लिए ऐसा कंप्यूटर चाहिए जो Chrome में Gemini Nano चला सके (करीब 22 GB खाली डिस्क स्पेस, और साथ में 4 GB से ज़्यादा VRAM वाला GPU, या फिर 16 GB RAM और 4 CPU कोर)। बाकी सब कुछ इसके बिना भी काम करता है।

आपके शब्द, उस जगह के साथ जहां वे मिले
• हर सेव किए गए शब्द के साथ उसका वाक्य और वह वीडियो या पेज भी रहता है जहां से वह आया।
• Langle आपके पढ़े हुए वाक्यों का इतिहास भी रखता है, इसलिए जो शब्द आप बाद में सेव करते हैं, उसके लिए भी तुरंत दिख जाता है कि वह पहले कहां मिला था। वाक्यों का इतिहास आप सेटिंग में बंद कर सकते हैं या मिटा सकते हैं।
• शब्द सूची से सीधे वीडियो के उसी सीन पर पहुंचें। Anki या CSV में एक्सपोर्ट करें, या सब कुछ एक फ़ाइल में बैकअप कर लें।

मुफ़्त, और आपका डेटा आपका ही
• हर सुविधा शामिल है। न कोई पेड प्लान, न सदस्यता, न साइन-अप।
• Langle का कोई सर्वर नहीं है। आपके शब्द आपके डिवाइस पर और आपके ब्राउज़र के सिंक में सेव होते हैं।
• चाहें तो अपनी Google डिस्क कनेक्ट करें, फिर आपके शब्द आपके सभी कंप्यूटरों पर आपके साथ रहेंगे। बीच में Langle का कोई सर्वर नहीं होता।

भाषाएं
अंग्रेज़ी, स्पैनिश, फ़्रेंच या जर्मन सीखें, और मतलब 16 में से किसी भी भाषा में देखें: अंग्रेज़ी, जापानी, स्पैनिश, पुर्तगाली, रूसी, फ़्रेंच, जर्मन, चीनी, इटैलियन, पोलिश, थाई, हिन्दी, अरबी, इंडोनेशियाई, तुर्की और कोरियन। आगे और भाषाएं जोड़ी जाएंगी।
भाषाएं चुनने के बाद Langle उस जोड़ी का भाषा डेटा डाउनलोड करता है। यह डाउनलोड सिर्फ़ एक बार होता है।

निजता नीति: https://kskt-dev.github.io/langle/privacy/
```

## Indonesian (`id`)

### Summary

```
Belajar bahasa dari tontonan dan bacaan favorit Anda. Arahkan kursor ke kata di YouTube, Netflix, atau web untuk melihat artinya.
```

### Description

```
Belajar bahasa dari tontonan dan bacaan favorit Anda.

Langle bisa langsung dipakai di apa pun yang sedang Anda nikmati: channel YouTube, serial Netflix, atau artikel yang membuat Anda terus membaca. Arahkan kursor ke kata mana pun untuk melihat artinya, simpan kata yang ingin Anda ingat, lalu kembali ke tempat Anda menemukannya. Gratis, dan tidak perlu membuat akun.

Cukup arahkan kursor
• Kata dan frasa disorot sesuai seberapa baik Anda mengenalnya: Baru, Dipelajari, atau Dikenal.
• Arahkan kursor ke kata untuk melihat artinya. Klik untuk membuka kamus.
• Bisa dipakai di subtitel, transkrip, dan komentar YouTube (termasuk Shorts), subtitel Netflix, dan artikel di seluruh web.

Arti yang sesuai konteks
• Bentuk kata apa pun mengarah ke entri kamusnya, dan frasa juga dikenali: arahkan kursor ke “dates back” dan Anda akan melihat “date back”.
• Tekan “Jelaskan dalam konteks”, dan AI bawaan Chrome akan memilih arti yang cocok dengan kalimatnya, langsung di perangkat Anda. Fitur ini memerlukan komputer yang bisa menjalankan Gemini Nano di Chrome (ruang disk kosong sekitar 22 GB, ditambah GPU dengan VRAM lebih dari 4 GB atau RAM 16 GB dan CPU 4 core). Semua fitur lain tetap bisa dipakai tanpa itu.

Kata Anda, lengkap dengan tempat Anda menemukannya
• Setiap kata yang disimpan mencatat kalimatnya serta video atau halaman asalnya.
• Langle juga menyimpan riwayat kalimat yang Anda baca, jadi kata yang baru Anda simpan belakangan pun sudah menunjukkan di mana Anda pernah melihatnya. Anda bisa menonaktifkan atau menghapus riwayat ini di Setelan.
• Dari daftar kata, langsung kembali ke adegan itu di video. Ekspor ke Anki atau CSV, atau cadangkan semuanya ke sebuah file.

Gratis, dan data Anda tetap milik Anda
• Semua fitur sudah termasuk. Tidak ada fitur berbayar, langganan, atau pendaftaran.
• Langle tidak punya server. Kata-kata Anda disimpan di perangkat dan di penyimpanan sinkronisasi browser Anda.
• Jika mau, hubungkan Google Drive Anda sendiri agar kata-kata Anda ikut ke semua komputer Anda, tanpa melalui server Langle.

Bahasa
Pelajari bahasa Inggris, Spanyol, Prancis, atau Jerman, dengan arti dalam 16 bahasa: Inggris, Jepang, Spanyol, Portugis, Rusia, Prancis, Jerman, Mandarin, Italia, Polandia, Thai, Hindi, Arab, Indonesia, Turki, dan Korea. Bahasa lain akan menyusul.
Setelah Anda memilih bahasa, Langle mendownload data bahasa untuk pasangan bahasa itu. Download ini cukup sekali saja.

Kebijakan Privasi: https://kskt-dev.github.io/langle/privacy/
```

## Italian (`it`)

### Summary

```
Impara le lingue con ciò che ami guardare e leggere: su YouTube, Netflix o sul web, passa il mouse su una parola per capirla.
```

### Description

```
Impara le lingue con ciò che ami guardare e leggere.

Langle funziona direttamente su ciò che ti appassiona: un canale YouTube, una serie Netflix, un articolo da cui non riesci a staccarti. Passa il mouse su una parola per vederne il significato, salva quelle che vuoi tenere e torna dove le hai incontrate. È gratuito e non serve creare un account.

Basta passare il mouse
• Parole ed espressioni vengono evidenziate in base a quanto le conosci: “Nuova”, “Da imparare” o “Conosciuta”.
• Passa il mouse su una parola per vederne il significato. Fai clic per aprire il dizionario.
• Funziona con sottotitoli, trascrizioni e commenti di YouTube (anche negli Shorts), con i sottotitoli di Netflix e con gli articoli di tutto il web.

Il significato giusto nel contesto
• Qualsiasi forma di una parola porta alla sua voce nel dizionario, e vengono riconosciute anche le espressioni: passa il mouse su “dates back” e ottieni “date back”.
• Fai clic su “Spiega nel contesto” e l'IA integrata di Chrome sceglie il significato adatto alla frase, direttamente sul tuo dispositivo. Per questa funzione serve un computer in grado di eseguire Gemini Nano in Chrome (circa 22 GB di spazio libero su disco, più una GPU con oltre 4 GB di VRAM oppure 16 GB di RAM e una CPU a 4 core). Tutto il resto funziona anche senza.

Le tue parole e dove le hai incontrate
• Ogni parola salvata conserva la sua frase e il video o la pagina da cui proviene.
• Langle tiene anche una cronologia delle frasi che leggi: così, quando salvi una parola in un secondo momento, vedi già dove l'avevi incontrata. Puoi disattivare o cancellare la cronologia delle frasi nelle impostazioni.
• Dal tuo elenco parole torni subito alla scena del video. Esporta in Anki o in CSV, oppure fai il backup di tutto in un file.

Gratis, e i tuoi dati restano tuoi
• Tutte le funzioni sono incluse. Nessuna funzione a pagamento, nessun abbonamento, nessuna registrazione.
• Langle non ha server. Le tue parole vengono salvate sul tuo dispositivo e nella sincronizzazione del browser.
• Se vuoi, collega il tuo Google Drive: le tue parole ti seguiranno su tutti i tuoi computer, senza alcun server di Langle in mezzo.

Lingue
Impara inglese, spagnolo, francese o tedesco, con i significati in una delle 16 lingue disponibili: inglese, giapponese, spagnolo, portoghese, russo, francese, tedesco, cinese, italiano, polacco, thailandese, hindi, arabo, indonesiano, turco e coreano. Altre sono in arrivo.
Una volta scelte le lingue, Langle scarica i dati linguistici per quella combinazione. Il download avviene una sola volta.

Norme sulla privacy: https://kskt-dev.github.io/langle/privacy/
```

## Korean (`ko`)

### Summary

```
좋아하는 영상과 관심 있는 글로 외국어를 배워 보세요. YouTube, Netflix, 웹페이지에서 단어에 마우스를 올리기만 하면 뜻이 보여요.
```

### Description

```
좋아하는 영상과 글로 외국어를 배워 보세요.

Langle은 즐겨 보는 YouTube 채널, 빠져 있는 Netflix 시리즈, 끝까지 읽게 되는 글에서 바로 쓸 수 있어요. 단어에 마우스를 올리면 뜻이 보이고, 기억하고 싶은 단어는 저장해 두었다가 처음 만난 곳으로 언제든 다시 돌아갈 수 있어요. 무료이고, 계정을 만들 필요도 없어요.

마우스를 올리기만 하면
• 단어와 표현은 얼마나 잘 아는지에 따라 ‘새 단어’, ‘학습 중’, ‘아는 단어’로 나뉘어 하이라이트 표시돼요.
• 단어에 마우스를 올리면 뜻이 보이고, 클릭하면 사전이 열려요.
• YouTube 자막, 스크립트, 댓글(Shorts 포함), Netflix 자막, 웹의 다양한 글에서 쓸 수 있어요.

문맥에 맞는 뜻
• 단어가 어떤 형태로 나와도 사전의 해당 항목으로 연결되고, 표현도 인식해요. “dates back”에 마우스를 올리면 “date back”이 나와요.
• ‘문맥으로 설명’을 누르면 Chrome에 내장된 AI가 기기에서 바로 그 문장에 맞는 뜻을 골라 줘요. 이 기능을 쓰려면 Chrome에서 Gemini Nano를 실행할 수 있는 컴퓨터가 필요해요(약 22GB의 여유 디스크 공간, 그리고 VRAM이 4GB를 넘는 GPU 또는 16GB RAM과 4코어 CPU). 나머지 기능은 이 조건 없이도 모두 쓸 수 있어요.

저장한 단어는 만난 곳과 함께
• 저장한 단어에는 그 단어가 나온 문장과 동영상 또는 페이지가 함께 기록돼요.
• Langle은 읽은 문장을 ‘문장 기록’으로 남겨 두기 때문에, 나중에 저장한 단어도 전에 어디서 봤는지 바로 알 수 있어요. 이 기록은 ‘설정’에서 끄거나 삭제할 수 있어요.
• 단어장에서 동영상의 그 장면으로 바로 돌아갈 수 있어요. Anki나 CSV로 내보내거나, 모든 데이터를 파일로 백업할 수도 있어요.

무료, 그리고 데이터는 내 것
• 모든 기능을 무료로 쓸 수 있어요. 유료 기능도, 구독도, 회원가입도 없어요.
• Langle에는 서버가 없어요. 단어는 기기와 브라우저의 동기화 공간에 저장돼요.
• 원하면 내 Google 드라이브를 연결해 여러 컴퓨터에서 같은 단어를 이어서 쓸 수 있어요. 중간에 Langle 서버를 거치지 않아요.

언어
영어, 스페인어, 프랑스어, 독일어를 배울 수 있어요. 뜻은 영어, 일본어, 스페인어, 포르투갈어, 러시아어, 프랑스어, 독일어, 중국어, 이탈리아어, 폴란드어, 태국어, 힌디어, 아랍어, 인도네시아어, 터키어, 한국어까지 16개 언어로 볼 수 있어요. 지원 언어는 계속 늘려 갈 예정이에요.
언어를 고르면 Langle이 그 언어 조합의 데이터를 다운로드해요. 다운로드는 처음 한 번만 하면 돼요.

개인정보처리방침: https://kskt-dev.github.io/langle/privacy/
```

## Polish (`pl`)

### Summary

```
Ucz się języków z tego, co lubisz oglądać i czytać. Na YouTube, Netfliksie i w sieci najedź na słowo, by zobaczyć, co znaczy.
```

### Description

```
Ucz się języków z tego, co lubisz oglądać i czytać.

Langle działa bezpośrednio tam, gdzie spędzasz czas: na kanale na YouTube, w serialu na Netfliksie, w artykule, od którego nie możesz się oderwać. Najeżdżaj na słowa, by zobaczyć, co znaczą, zapisuj te, które chcesz zapamiętać, i wracaj tam, gdzie się pojawiły. Langle jest bezpłatny i nie wymaga zakładania konta.

Wystarczy najechać kursorem
• Słowa i wyrażenia są wyróżniane według tego, jak dobrze je znasz: „Nowe”, „Uczę się” lub „Znam”.
• Najedź na słowo, by zobaczyć jego znaczenie. Kliknij je, by otworzyć słownik.
• Działa w napisach, transkrypcjach i komentarzach na YouTube (także w Shorts), w napisach na Netfliksie oraz w artykułach w całej sieci.

Znaczenie dopasowane do kontekstu
• Każda forma słowa prowadzi do jego hasła w słowniku. Langle rozpoznaje też wyrażenia: najedź na „dates back”, a zobaczysz „date back”.
• Kliknij „Wyjaśnij w kontekście”, a wbudowana AI Chrome wybierze znaczenie pasujące do zdania – bezpośrednio na Twoim urządzeniu. Ta funkcja wymaga komputera, na którym Chrome może uruchomić Gemini Nano (ok. 22 GB wolnego miejsca na dysku oraz karta graficzna z ponad 4 GB pamięci VRAM lub, zamiast niej, 16 GB RAM i 4 rdzenie procesora). Wszystko inne działa bez niej.

Twoje słowa i miejsca, w których się pojawiły
• Przy każdym zapisanym słowie zostaje zdanie, w którym wystąpiło, oraz film lub strona, z których pochodzi.
• Langle prowadzi też historię czytanych zdań, więc nawet przy słowie zapisanym później od razu widać, gdzie pojawiło się wcześniej. Historię zdań możesz wyłączyć lub wyczyścić w Ustawieniach.
• Z listy słów przejdziesz prosto do danej sceny w filmie. Eksportuj słowa do Anki lub CSV albo zapisz kopię zapasową wszystkiego w pliku.

Bezpłatnie, a Twoje dane zostają u Ciebie
• Wszystkie funkcje są dostępne. Bez płatnych planów, subskrypcji i rejestracji.
• Langle nie ma serwerów. Twoje słowa są zapisywane na Twoim urządzeniu i w ramach synchronizacji przeglądarki.
• Jeśli chcesz, połącz swój Dysk Google, a Twoje słowa będą z Tobą na każdym z Twoich komputerów – bez żadnego serwera Langle po drodze.

Języki
Ucz się angielskiego, hiszpańskiego, francuskiego lub niemieckiego, a znaczenia sprawdzaj w jednym z 16 języków: angielskim, japońskim, hiszpańskim, portugalskim, rosyjskim, francuskim, niemieckim, chińskim, włoskim, polskim, tajskim, hindi, arabskim, indonezyjskim, tureckim i koreańskim. Kolejne są w przygotowaniu.
Po wybraniu języków Langle pobierze dane językowe dla tej pary. Pobierasz je tylko raz.

Polityka prywatności: https://kskt-dev.github.io/langle/privacy/
```

## Portuguese (Brazil) (`pt_BR`)

### Summary

```
Aprenda idiomas com o que você gosta de ver e ler. Passe o mouse numa palavra no YouTube, na Netflix ou na Web e veja o significado.
```

### Description

```
Aprenda idiomas com o que você gosta de ver e ler.

O Langle funciona direto no que você mais curte: um canal do YouTube, uma série da Netflix, um artigo que você não consegue parar de ler. Passe o mouse em qualquer palavra para ver o significado, salve as que quiser manter e volte ao lugar onde você as encontrou. É grátis e não é preciso criar conta.

Basta passar o mouse
• Palavras e expressões são destacadas conforme o quanto você as conhece: “Nova”, “Aprendendo” ou “Conhecida”.
• Passe o mouse numa palavra para ver o significado. Clique nela para abrir o dicionário.
• Funciona nas legendas, transcrições e comentários do YouTube (inclusive nos Shorts), nas legendas da Netflix e em artigos de toda a Web.

O significado certo para o contexto
• Qualquer forma de uma palavra leva ao verbete no dicionário, e expressões também são reconhecidas: passe o mouse em “dates back” e você verá “date back”.
• Clique em “Explicar no contexto” e a IA integrada do Chrome escolhe o significado que combina com a frase, direto no seu dispositivo. Para isso, é preciso um computador capaz de rodar o Gemini Nano no Chrome (cerca de 22 GB de espaço livre em disco, além de uma GPU com mais de 4 GB de VRAM, ou então 16 GB de RAM e 4 núcleos de CPU). Os outros recursos funcionam sem esse requisito.

Suas palavras, com o lugar onde você as encontrou
• Cada palavra salva guarda a frase e o vídeo ou a página de onde veio.
• O Langle também mantém um histórico das frases que você lê, então uma palavra que você salvar depois já mostra onde você a viu antes. Você pode desativar ou limpar o histórico de frases nas configurações.
• Na sua lista de palavras, volte direto para a cena do vídeo. Exporte para o Anki ou em CSV, ou faça backup de tudo em um arquivo.

Grátis, e seus dados continuam sendo seus
• Todos os recursos estão incluídos. Sem recursos pagos, sem assinatura, sem cadastro.
• O Langle não tem servidores. Suas palavras ficam salvas no seu dispositivo e na sincronização do navegador.
• Se quiser, conecte seu próprio Google Drive, e suas palavras acompanham você em todos os seus computadores, sem nenhum servidor do Langle no meio.

Idiomas
Aprenda inglês, espanhol, francês ou alemão, com significados em qualquer um destes 16 idiomas: inglês, japonês, espanhol, português, russo, francês, alemão, chinês, italiano, polonês, tailandês, hindi, árabe, indonésio, turco e coreano. Outros estão a caminho.
Depois que você escolhe os idiomas, o Langle baixa os dados de idioma desse par. O download é feito uma única vez.

Política de Privacidade: https://kskt-dev.github.io/langle/privacy/
```

## Russian (`ru`)

### Summary

```
Учите языки по тому, что вам интересно смотреть и читать. На YouTube, в Netflix и на сайтах наведите на слово — и увидите значение.
```

### Description

```
Учите языки по тому, что вам интересно смотреть и читать.

Langle работает прямо там, где вам интересно: на канале YouTube, в сериале на Netflix или в статье, от которой невозможно оторваться. Наводите курсор на слова, чтобы увидеть значение, сохраняйте те, что хотите запомнить, и возвращайтесь туда, где вы их встретили. Это бесплатно, и создавать аккаунт не нужно.

Просто наведите курсор
• Слова и выражения подсвечиваются в зависимости от того, насколько хорошо вы их знаете: «Новое», «Изучаю» или «Знаю».
• Наведите курсор на слово — появится его значение. Нажмите на него — откроется словарь.
• Работает с субтитрами, расшифровкой и комментариями на YouTube (в том числе в Shorts), с субтитрами на Netflix и со статьями на любых сайтах.

Значение, которое подходит по контексту
• Любая форма слова приводит к его статье в словаре. Выражения Langle тоже распознаёт: наведите курсор на «dates back» — и увидите «date back».
• Нажмите «Объяснить в контексте», и встроенный ИИ Chrome выберет значение, которое подходит к предложению, прямо на вашем устройстве. Для этого нужен компьютер, на котором Chrome может запускать Gemini Nano (около 22 ГБ свободного места на диске, а также либо видеокарта с видеопамятью больше 4 ГБ, либо 16 ГБ оперативной памяти и 4 ядра процессора). Всё остальное работает и без этого.

Ваши слова и места, где вы их встретили
• У каждого сохранённого слова остаются предложение и видео или страница, где оно встретилось.
• Langle также ведёт историю предложений, которые вы читаете, поэтому даже у слова, сохранённого позже, сразу видно, где оно вам уже попадалось. Историю предложений можно отключить или очистить в настройках.
• Из списка слов можно сразу вернуться к нужной сцене в видео. Экспортируйте слова в Anki или CSV либо сохраните всё в файл резервной копии.

Бесплатно, а ваши данные остаются вашими
• Все функции доступны бесплатно: без платных тарифов, подписки и регистрации.
• У Langle нет серверов. Слова сохраняются на вашем устройстве и в хранилище синхронизации браузера.
• При желании подключите свой Google Диск, и слова будут с вами на всех ваших компьютерах — без участия серверов Langle.

Языки
Изучайте английский, испанский, французский или немецкий, а значения смотрите на любом из 16 языков: английском, японском, испанском, португальском, русском, французском, немецком, китайском, итальянском, польском, тайском, хинди, арабском, индонезийском, турецком и корейском. Другие языки появятся позже.
Когда вы выберете языки, Langle скачает языковые данные для этой пары. Скачать их нужно только один раз.

Политика конфиденциальности: https://kskt-dev.github.io/langle/privacy/
```

## Thai (`th`)

### Summary

```
เรียนภาษาจากวิดีโอและบทความที่คุณชอบ แค่วางเคอร์เซอร์บนคำใดก็ได้ใน YouTube, Netflix หรือหน้าเว็บ ก็จะเห็นความหมายทันที
```

### Description

```
เรียนภาษาจากวิดีโอและบทความที่คุณชอบ

Langle ใช้งานได้ทันทีบนสิ่งที่คุณชอบดูและชอบอ่าน ไม่ว่าจะเป็นช่อง YouTube ซีรีส์ใน Netflix หรือบทความที่อ่านแล้ววางไม่ลง วางเคอร์เซอร์บนคำใดก็ได้เพื่อดูความหมาย บันทึกคำที่อยากจำไว้ แล้วกลับไปยังจุดที่คุณเจอคำนั้นได้ทุกเมื่อ ใช้งานได้ฟรี และไม่ต้องสร้างบัญชี

แค่วางเคอร์เซอร์
• คำและวลีจะถูกไฮไลต์ตามระดับที่คุณรู้จัก แบ่งเป็น “ใหม่” “กำลังเรียน” และ “รู้แล้ว”
• วางเคอร์เซอร์บนคำเพื่อดูความหมาย และคลิกเพื่อเปิดพจนานุกรม
• ใช้ได้กับคำบรรยาย ข้อความถอดเสียง และความคิดเห็นใน YouTube (รวมถึง Shorts) คำบรรยายใน Netflix และบทความทั่วทั้งเว็บ

ความหมายที่เข้ากับบริบท
• ไม่ว่าคำจะอยู่ในรูปใด ก็พาไปถึงคำนั้นในพจนานุกรมได้ และยังตรวจจับวลีได้ด้วย เช่น วางเคอร์เซอร์บน “dates back” จะได้ “date back”
• กด “อธิบายตามบริบท” แล้ว AI ที่มีมาในตัว Chrome จะเลือกความหมายที่เข้ากับประโยคนั้นให้ โดยประมวลผลบนอุปกรณ์ของคุณเอง ฟีเจอร์นี้ต้องใช้คอมพิวเตอร์ที่รัน Gemini Nano ใน Chrome ได้ (พื้นที่ดิสก์ว่างประมาณ 22 GB และ GPU ที่มี VRAM มากกว่า 4 GB หรือ RAM 16 GB กับ CPU 4 คอร์) ส่วนฟีเจอร์อื่นๆ ใช้ได้ตามปกติแม้เครื่องไม่ตรงตามสเปกนี้

คำศัพท์ของคุณ พร้อมแหล่งที่เจอ
• ทุกคำที่บันทึกไว้จะมีประโยค และวิดีโอหรือหน้าเว็บที่เป็นที่มาของคำนั้นติดไปด้วย
• Langle ยังเก็บประวัติประโยคที่คุณอ่านไว้ด้วย คำที่คุณบันทึกทีหลังจึงแสดงได้ทันทีว่าคุณเคยเห็นคำนั้นที่ไหนมาก่อน คุณปิดหรือล้างประวัติประโยคได้ในการตั้งค่า
• กลับไปยังฉากนั้นในวิดีโอได้ทันทีจากคลังคำศัพท์ ส่งออกไปยัง Anki หรือ CSV หรือสำรองข้อมูลทั้งหมดเป็นไฟล์ก็ได้

ฟรี และข้อมูลเป็นของคุณ
• มีครบทุกฟีเจอร์ ไม่มีฟีเจอร์ที่ต้องจ่ายเงินเพิ่ม ไม่มีค่าสมาชิก และไม่ต้องลงทะเบียน
• Langle ไม่มีเซิร์ฟเวอร์ คำของคุณจะบันทึกไว้ในอุปกรณ์ของคุณและในพื้นที่ซิงค์ของเบราว์เซอร์
• หากต้องการ ก็เชื่อมต่อ Google ไดรฟ์ของคุณเองได้ แล้วคำของคุณจะตามไปอยู่ในคอมพิวเตอร์ทุกเครื่องของคุณ โดยไม่ผ่านเซิร์ฟเวอร์ของ Langle เลย

ภาษา
เรียนภาษาอังกฤษ สเปน ฝรั่งเศส หรือเยอรมัน โดยดูความหมายได้ใน 16 ภาษา ได้แก่ อังกฤษ ญี่ปุ่น สเปน โปรตุเกส รัสเซีย ฝรั่งเศส เยอรมัน จีน อิตาลี โปแลนด์ ไทย ฮินดี อาหรับ อินโดนีเซีย ตุรกี และเกาหลี นอกจากนี้จะมีภาษาอื่นๆ เพิ่มเข้ามาอีก
เมื่อเลือกภาษาแล้ว Langle จะดาวน์โหลดข้อมูลภาษาสำหรับคู่ภาษานั้น โดยดาวน์โหลดเพียงครั้งเดียว

นโยบายความเป็นส่วนตัว: https://kskt-dev.github.io/langle/privacy/
```

## Turkish (`tr`)

### Summary

```
Sevdiğiniz videolar ve makalelerle dil öğrenin. YouTube'da, Netflix'te veya web'de bir kelimenin üzerine gelin, anlamını görün.
```

### Description

```
İzlemeyi ve okumayı sevdiğiniz içeriklerle dil öğrenin.

Langle, ilgilendiğiniz içeriklerde doğrudan çalışır: bir YouTube kanalında, bir Netflix dizisinde ya da elinizden bırakamadığınız bir makalede. Anlamını görmek için herhangi bir kelimenin üzerine gelin, aklınızda tutmak istediklerinizi kaydedin ve onlarla karşılaştığınız yere geri dönün. Ücretsizdir ve hesap oluşturmanız gerekmez.

Üzerine gelmeniz yeterli
• Kelimeler ve ifadeler, onları ne kadar iyi bildiğinize göre vurgulanır: “Yeni”, “Öğreniyorum” veya “Biliyorum”.
• Anlamını görmek için bir kelimenin üzerine gelin. Sözlüğü açmak için kelimeyi tıklayın.
• YouTube altyazılarında, transkriptlerinde ve yorumlarında (Shorts dahil), Netflix altyazılarında ve web'deki makalelerde çalışır.

Bağlama uyan anlam
• Bir kelime hangi biçimde olursa olsun sizi sözlükteki maddesine götürür. İfadeler de tanınır: “dates back” ifadesinin üzerine geldiğinizde “date back” karşınıza çıkar.
• “Bağlamda açıkla” düğmesine bastığınızda Chrome'un yerleşik yapay zekası, cümleye uyan anlamı doğrudan cihazınızda seçer. Bu özellik için Chrome'da Gemini Nano çalıştırabilen bir bilgisayar gerekir (yaklaşık 22 GB boş disk alanı; ayrıca 4 GB'tan fazla VRAM'i olan bir GPU ya da 16 GB RAM ile 4 CPU çekirdeği). Diğer her şey bu olmadan da çalışır.

Kelimeleriniz ve karşılaştığınız yerler
• Kaydettiğiniz her kelime, geçtiği cümleyi ve geldiği videoyu ya da sayfayı saklar.
• Langle okuduğunuz cümlelerin geçmişini de tutar. Böylece sonradan kaydettiğiniz bir kelimenin daha önce nerede karşınıza çıktığını hemen görürsünüz. Cümle geçmişini Ayarlar'dan kapatabilir veya temizleyebilirsiniz.
• Kelime listenizden videodaki o sahneye doğrudan dönebilirsiniz. Kelimelerinizi Anki'ye ya da CSV olarak dışa aktarın veya her şeyi bir dosyaya yedekleyin.

Ücretsiz ve verileriniz size ait
• Tüm özellikler dahildir. Ücretli sürüm, abonelik veya kayıt yok.
• Langle'ın sunucusu yoktur. Kelimeleriniz cihazınızda ve tarayıcınızın senkronizasyon alanında kaydedilir.
• İsterseniz kendi Google Drive hesabınızı bağlayın, kelimeleriniz tüm bilgisayarlarınızda yanınızda olsun. Arada hiçbir Langle sunucusu yoktur.

Diller
İngilizce, İspanyolca, Fransızca veya Almanca öğrenin; anlamları 16 dilden birinde görün: İngilizce, Japonca, İspanyolca, Portekizce, Rusça, Fransızca, Almanca, Çince, İtalyanca, Lehçe, Tayca, Hintçe, Arapça, Endonezce, Türkçe ve Korece. Yeni diller yolda.
Dillerinizi seçtiğinizde Langle, bu dil çifti için dil verilerini indirir. Bu indirme yalnızca bir kez yapılır.

Gizlilik Politikası: https://kskt-dev.github.io/langle/privacy/
```

## Chinese (Simplified) (`zh_CN`)

### Summary

```
用你喜欢的视频和感兴趣的文章学外语。在 YouTube、Netflix 或网页上，把鼠标悬停在单词上，就能看到它的意思。
```

### Description

```
用你喜欢的视频和文章学外语。

Langle 可以直接在你喜欢的内容上使用：常看的 YouTube 频道、正在追的 Netflix 剧集，或是一篇让你欲罢不能的文章。把鼠标悬停在单词上就能看到释义，想记住的单词可以保存下来，以后随时回到遇见它的地方。完全免费，也不用注册账号。

悬停即可
• 单词和短语会按你的熟悉程度高亮显示：“生词”“学习中”或“熟词”。
• 鼠标悬停在单词上即可查看释义，点击则会打开词典。
• 支持 YouTube 的字幕、文字记录和评论（包括 Shorts）、Netflix 的字幕，以及网上的各类文章。

贴合语境的释义
• 无论单词以什么形式出现，都能找到它在词典中的词条；短语也能识别：悬停在“dates back”上，会显示“date back”。
• 点击“结合语境解释”，Chrome 内置的 AI 会直接在你的设备上选出最贴合这句话的释义。此功能需要一台能在 Chrome 中运行 Gemini Nano 的电脑（约 22 GB 可用磁盘空间；另需显存超过 4 GB 的 GPU，或 16 GB 内存和 4 核 CPU）。其他功能不受此限制。

单词和它的出处
• 每个保存的单词都会附上原句，以及它出自的视频或网页。
• Langle 还会保留你读过的句子记录，所以即使是之后才保存的单词，也能看到你以前在哪里见过它。你可以在“设置”中关闭或清除句子记录。
• 在单词本中可以直接跳回视频里的对应场景。还可以导出到 Anki 或 CSV，或者把所有数据备份成一个文件。

免费，数据始终属于你
• 所有功能都可以免费使用。没有付费功能，没有订阅，也无需注册。
• Langle 没有服务器。你的单词保存在你的设备和浏览器的同步空间中。
• 如果愿意，你还可以连接自己的 Google 云端硬盘，这样在你的每台电脑上都能用到这些单词，中间不经过任何 Langle 服务器。

语言
可以学习英语、西班牙语、法语或德语，释义支持 16 种语言：英语、日语、西班牙语、葡萄牙语、俄语、法语、德语、中文、意大利语、波兰语、泰语、印地语、阿拉伯语、印度尼西亚语、土耳其语和韩语。后续还会增加更多语言。
选好语言后，Langle 会下载这组语言的数据，只需下载一次。

隐私权政策：https://kskt-dev.github.io/langle/privacy/
```
