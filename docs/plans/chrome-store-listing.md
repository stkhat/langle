# Chrome Web Store listing (draft)

Draft for [chrome-store-launch](chrome-store-launch.md) E1, written from the mock's `Store listing` and `Website` pages. The store's description field is plain text: paste each block as it is. The summary is not entered in the dashboard: it is the manifest's `description`, from `public/_locales/<locale>/messages.json` (132 characters at most, one per UI locale, each written to read naturally in its language rather than translated word for word). Languages without a description of their own here show the English one.

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
• Press "Explain in context" and Chrome's built-in AI picks the meaning that fits the sentence, right on your device. This needs a computer that can run Gemini Nano in Chrome (about 22 GB of free disk space, plus a GPU with more than 4 GB of VRAM or 16 GB of RAM and 4 CPU cores). Everything else works without it.

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
• 「文脈で説明」を押すと、Chrome に組み込まれた AI が、その文に合う意味をお使いのデバイス上で選びます。この機能には、Chrome で Gemini Nano を実行できるパソコンが必要です（空きディスク容量 約 22 GB と、4 GB を超える VRAM を搭載した GPU、または 16 GB の RAM と 4 コアの CPU）。ほかの機能はこの条件がなくても使えます。

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
