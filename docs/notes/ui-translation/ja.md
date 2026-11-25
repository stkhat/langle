# Japanese (ja) interface glossary

Register: sentences in です/ます; buttons, labels and menu items as short noun phrases or plain verb stems (保存, ダウンロード, 閉じる), as Chrome's and YouTube's Japanese UI do. No ～してください unless the sentence is an instruction the user must follow (e.g. an input hint). Half-width spaces around Latin words and placeholders that hold Latin text ("Langle の設定", "{provider} に保存"), following Google's Japanese UI style. Full-width parentheses in language names ("英語（English）").

| English | Japanese | Note |
|---|---|---|
| New (category) | 未知 | pairs with 既知 (未知語/既知語 is the usual learner's pair); see Review |
| Learning (category) | 学習中 | |
| Known (category) | 既知 | the word-category term vocabulary apps use; "知っている" is too long for chips |
| Learned (filter) | 習得済み | a Known word that went through Learning |
| Saved (storage) | 保存済み / 保存しました | never 同期済み (the UI never says "Synced") |
| save (a word) | 保存 | |
| meaning | 意味 | dictionary column "意味"; "Your meanings" → 自分の意味 |
| phrase | フレーズ | |
| highlight | ハイライト | verb: ハイライト表示 |
| word list | 単語帳 | phone tab "Words" → 単語 |
| Your language | 使用言語 | not 母語; see Review |
| learning language | 学習言語 | setup "I'm learning" too |
| language data | 言語データ | |
| subtitles | 字幕 | |
| transcript | 文字起こし | YouTube's Japanese UI |
| sentence | 文 | sentence history → 文の履歴 |
| sync | 同期 | |
| backup | バックアップ | export/import → エクスポート / インポート |
| sign in | ログイン | Chrome's Japanese UI |
| dictionary window | 辞書ウィンドウ | |
| on-device AI | デバイス上の AI | |
| Settings | 設定 | |
| Download | ダウンロード | |

Choices:
- "I speak" / "I'm learning" in setup → 使用言語 / 学習言語: Japanese setup screens label the field, not a first-person sentence, and the labels match the Settings rows they set.
- "New-word level" → 語彙レベル, the usual Japanese heading for this kind of setting.
- "A–Z" kept as is: the words sorted are in the learning language.
- Toasts with counts ("{count} words marked as Learning") → 「{count} 語を学習中にしました」: 語 is the natural counter for words.

## Review

Second-pass review for naturalness and consistency.

Decisions:
- **Your language → 使用言語**, not 母語 or あなたの言語. The English avoids "native language" on purpose (people pick the language they read best, not always their mother tongue); 母語 says exactly "mother tongue" and would make a bilingual or heritage speaker hesitate. 使用言語 is the word Japanese software uses for "the language you use", and it is what the user calls this setting. あなたの言語 is translationese (Japanese UI avoids あなた). The one risk, confusion with the interface language, is handled by the interface row being 表示言語 and its first entry 使用言語と同じ, which is exactly the default behaviour. Setup uses the same words (使用言語 / 学習言語) so the user recognises the rows later.
- **New / Learning / Known → 未知 / 学習中 / 既知.** The names fill noun slots everywhere: chips, "+ 学習中", "{category}の単語をハイライト", "未知のまま", "既知にする", "既知として扱う", "{count} 語を既知にしました". Verb forms (覚えた, 知ってる) break in those slots (覚えたにする, 知ってるのまま) and 覚えた collides with 習得済み (Learned, a Known word that went through Learning). 新出 is textbook jargon ("newly introduced in this lesson") and reads oddly outside a textbook (新出のまま). 未知 / 既知 is a pair every adult reads at a glance and the standard learner's terms (未知語 / 既知語); 学習中 sits naturally between them.

Changed keys:

| Key | Before | After | Why |
|---|---|---|---|
| `settings.languages.native` | 母語 | 使用言語 | Your language: 使用言語 (see decision above) |
| `settings.languages.uiSame` | 母語と同じ | 使用言語と同じ | follows the 使用言語 label |
| `settings.languages.lead` | Langle は学習言語で書かれたページをハイライトし、母語に翻訳します。 | Langle は学習言語で書かれたページをハイライトし、使用言語に翻訳します。 | 使用言語 |
| `settings.video.subtitleTranslationDesc` | 今の字幕の下に、母語の訳を表示します。 | 今の字幕の下に、使用言語の訳を表示します。 | 使用言語 |
| `settings.video.transcriptTranslationDesc` | 文字起こしの各カードに母語の訳を表示します。字幕とは別に設定できます。 | 文字起こしの各カードに使用言語の訳を表示します。字幕とは別に設定できます。 | 使用言語 |
| `setup.languages.native` | 母語 | 使用言語 | same term as the Settings row it sets |
| `setup.languages.learning` | 学習する言語 | 学習言語 | same term as the Settings row it sets; pairs with 使用言語 |
| `card.chip.new` | 新出 | 未知 | New: 未知 pairs with 既知 and reads naturally in every slot (未知のまま, 未知の単語); 新出 is textbook jargon |
| `lookup.status.new` | 新出 · 未保存 | 未知 · 未保存 | New: 未知 |
| `settings.section.level` | 新出単語のレベル | 語彙レベル | the usual Japanese heading for this setting; 新出単語のレベル was a literal rendering |
| `settings.level.lead` | 保存していない単語は、よく使われる単語でなければ新出として扱われます。語彙が増えてきたら数を上げましょう。 | 保存していない単語は、よく使われる単語でない限り未知として扱われます。語彙が増えてきたら数を上げましょう。 | New: 未知; でない限り reads better than でなければ here |
| `settings.highlighting.unsavedAtEnd` | 保存しなかった新出単語 | 保存しなかった未知の単語 | New: 未知 |
| `settings.highlighting.unsavedAtEndDesc` | 動画が終わったときや、記事を最後まで読んだときの扱いです。「新出のまま」は次回もそのまま残し、「既知にする」はすべて既知として保存します。 | 動画が終わったときや、記事を最後まで読んだときの扱いです。「未知のまま」は次回までそのまま残し、「既知にする」はすべて既知として保存します。 | New: 未知; 次回まで fits 'leaves them for next time' |
| `settings.highlighting.keepNew` | 新出のまま | 未知のまま | New: 未知 |
| `settings.highlighting.switch` | {category}をハイライト | {category}の単語をハイライト | {category} is the bare category name (未知/学習中/既知); 既知をハイライト is not Japanese |
| `saveAll.note` | 保存済みの単語はステータスが変わりません。頻出単語のレベル内の単語は数えません。 | 保存済みの単語はステータスが変わりません。語彙レベル内のよく使われる単語は数えません。 | refers to the 語彙レベル setting by its name |
| `settings.comingLater` | 近日対応 | 今後対応予定 | 近日 promises 'soon'; en only says 'later' |
| `settings.cloud.connected` | {provider}。すべてのデータが、Langle だけが開けるフォルダに保存されています。 | {provider} に接続済み。すべてのデータは、Langle だけが開けるフォルダに保存されています。 | a bare provider name followed by 。 is not a Japanese sentence |
| `settings.cloud.connectedAccount` | {provider}（{account}）。すべてのデータが、Langle だけが開けるフォルダに保存されています。 | {provider}（{account}）に接続済み。すべてのデータは、Langle だけが開けるフォルダに保存されています。 | same as connected |
| `settings.cloud.lastSaved` | 最終保存: {when}。 | 最終保存: {when} | no 。 after a colon label, as settings.sync.lastSaved and settings.backup.lastExport |
| `settings.cloud.reconnectDesc` | 再接続するまで、新しい変更はこのデバイスで待機します。 | 再接続するまで、新しい変更はこのデバイスに保留されます。 | 保留 is the natural word; 待機します personified the changes |
| `settings.cloud.tooDesc` | ほかのデバイスも {provider} に保存します。ログインはデバイスごとに 1 回だけです。 | ほかのデバイスは {provider} に保存しています。ログインはデバイスごとに 1 回だけです。 | も implied this device already saves there |
| `notices.lead` | Langle は使用する言語データをダウンロードします。以下の各パッケージは表示のとおり全体としてライセンスされ、作成に使った出典とそのライセンスを記載しています。 | Langle は使用する言語データをダウンロードします。以下の各パッケージについて、全体に適用されるライセンスと、作成に使った出典およびそのライセンスを記載しています。 | 全体としてライセンスされ was translationese |
| `setup.consent.where` | データはお使いのデバイスと、自分のクラウドサービスにだけ保存され、ほかには送られません。開発者がデータを受け取ることは一切ありません。 | データはお使いのデバイスと、ご自身のクラウドサービスにだけ保存され、ほかには送られません。開発者がデータを受け取ることは一切ありません。 | お使いの/自分の mixed registers in one sentence; consent text uses ご自身の |
| `setup.consent.keepsWhat` | 自分の単語と、文・ウェブアドレス・タイトルの履歴をこのデバイスに（単語と出会った場所を表示するため）。 | 保存した単語と、文・ウェブアドレス・タイトルの履歴をこのデバイスに（単語と出会った場所を表示するため）。 | Your words here means the saved words; 自分の単語 read oddly in a policy list |
| `setup.consent.keepsWhatDevice` | 自分の単語、設定、文・ウェブアドレス・タイトルの履歴をこのスマートフォンに（単語と出会った場所を表示するため）。 | 保存した単語、設定、文・ウェブアドレス・タイトルの履歴をこのスマートフォンに（単語と出会った場所を表示するため）。 | same as keepsWhat |
| `setup.consent.sendsWhatDevice` | 調べたり再生したりした単語だけを、意味や音声を提供するサービスへ。自分の単語と設定はこのスマートフォンから出ません。 | 調べたり再生したりした単語だけを、意味や音声を提供するサービスへ。保存した単語と設定はこのスマートフォンから出ません。 | same as keepsWhat |
| `home.words` | 自分の単語 | 単語帳 | the button opens the word list; 単語帳 is the glossary term |
| `video.toggle.on` | Langle はオンです — クリックでオフ | Langle はオンです。クリックするとオフになります | a dash between clauses is not Japanese punctuation |
| `video.toggle.off` | Langle はオフです — クリックでオン | Langle はオフです。クリックするとオンになります | same as toggle.on |
| `support.coffeeIfYouEnjoy` | Langle が気に入ったら{coffee} | Langle が気に入ったら、{coffee} | a comma before the bold call to action, as Japanese writes it |

## The browser's sync (`{syncName}`)
`env.syncName` is "{browser} の同期", with the browser's name filled in. No space between it and a following particle (「Chrome の同期に」); the switch says 保存, not 同期で同期.
