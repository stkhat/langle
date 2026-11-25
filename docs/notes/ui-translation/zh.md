# Chinese, simplified (zh) interface glossary

Register: mainland simplified Chinese, the plain friendly tone of Chrome's and YouTube's zh-CN UI; buttons as two- to four-character verbs or nouns (保存, 下载, 连接). Half-width spaces between Chinese and Latin words or placeholders that hold Latin text ("Langle 设置", "保存到 {provider}"), as Google's zh-CN UI does. Full-width punctuation in sentences, full-width parentheses in language names ("英语（English）").

| English | Chinese | Note |
|---|---|---|
| New (category) | 生词 | the standard learner's word for unfamiliar words (生词本) |
| Learning (category) | 学习中 | |
| Known (category) | 熟词 | the pair of 生词 (see Review) |
| Learned (filter) | 已学会 | a Known word that went through Learning |
| Saved (storage) | 已保存 | never 已同步 |
| save (a word) | 保存 | |
| meaning | 释义 | dictionary sense; "Your meanings" → 我的释义 |
| phrase | 短语 | |
| highlight | 高亮 | |
| word list | 单词本 | phone tab "Words" → 单词 |
| Your language | 我的语言 | not 母语 (see Review); in sentences 你的语言 |
| learning language | 学习语言 | setup "I'm learning" too |
| language data | 语言数据 | |
| subtitles | 字幕 | |
| transcript | 文字记录 | YouTube's zh-CN UI |
| sentence | 句子 | sentence history → 句子记录 |
| sync | 同步 | |
| backup | 备份 | export/import → 导出 / 导入 |
| sign in | 登录 | |
| dictionary window | 词典窗口 | |
| on-device AI | 设备端 AI | |
| Settings | 设置 | |
| Download | 下载 | |

Choices:
- 生词 for New: Chinese learners call every not-yet-known word 生词; 新词 reads as "neologism".
- 熟词 for Known (not 已掌握): many Known words were never studied (common-word level), and 熟词 says only "familiar word"; 已学会 is kept for Learned. (First pass had 已认识; see Review.)
- "A–Z" kept: the words sorted are in the learning language.

## Review

Second-pass review for naturalness and consistency.

Decisions:
- **Known → 熟词.** 生词 / 熟词 is the pair Chinese learners and vocabulary apps use; 生词 / 学习中 / 已认识 mixed a noun with state words, and 熟词 reads well in every slot (标记为熟词, 全部标为熟词, 视为熟词).
- **Your language → 我的语言** (sentences: 你的语言), not 母语: the English avoids "native language" on purpose. Setup uses the Settings rows' names (我的语言 / 学习语言) under the title 设置语言.

Changed keys:

| Key | Before | After | Why |
|---|---|---|---|
| `status.known` | 已认识 | 熟词 | Known: 熟词 is the learner's pair of 生词 (生词/熟词 in vocabulary apps); 生词 / 学习中 / 已认识 mixed a noun with states |
| `settings.level.label` | 把最常用的 {count} 个{language}单词视为已认识 | 把最常用的 {count} 个{language}单词视为熟词 | Known: 熟词 |
| `settings.highlighting.knownDesc` | 你标记为已认识的单词。 | 你标记为熟词的单词。 | Known: 熟词 |
| `settings.highlighting.unsavedAtEndDesc` | 视频结束或读到文章末尾时如何处理这些单词。“保留为生词”会留到下次；“标记为已认识”会把它们全部保存为已认识。 | 视频结束或读到文章末尾时如何处理这些单词。“保留为生词”会留到下次；“标记为熟词”会把它们全部保存为熟词。 | Known: 熟词 |
| `settings.highlighting.markKnown` | 标记为已认识 | 标记为熟词 | Known: 熟词 |
| `dict.notSavedNote` | 尚未保存。保存为“学习中”或“已认识”后，Langle 会记住你下次在哪里见到它。 | 尚未保存。保存为“学习中”或“熟词”后，Langle 会记住你下次在哪里见到它。 | Known: 熟词 |
| `saveAll.markKnown` | 全部标为已认识 | 全部标为熟词 | Known: 熟词 |
| `saveAll.done.known` | 已将 {count} 个单词标为已认识 | 已将 {count} 个单词标为熟词 | Known: 熟词 |
| `saveAll.done.known.one` | 已将 1 个单词标为已认识 | 已将 1 个单词标为熟词 | Known: 熟词 |
| `settings.languages.native` | 母语 | 我的语言 | Your language: the English avoids 'native language' on purpose; 我的 is how zh-CN UIs name the user's own settings (as 我的释义) |
| `settings.languages.uiSame` | 与母语相同 | 与我的语言相同 | follows the 我的语言 label |
| `settings.languages.lead` | Langle 会高亮用学习语言写成的网页，并翻译成你的母语。 | Langle 会高亮用学习语言写成的网页，并翻译成你的语言。 | not 母语 |
| `settings.video.subtitleTranslationDesc` | 在当前字幕下方显示母语译文。 | 在当前字幕下方，用你的语言显示这一句的译文。 | not 母语 |
| `settings.video.transcriptTranslationDesc` | 在每张文字记录卡片上显示母语译文。与字幕分开设置。 | 在每张文字记录卡片上，用你的语言显示译文。与字幕分开设置。 | not 母语 |
| `setup.languages.title` | 你的语言 | 设置语言 | the rows below are 我的语言 / 学习语言; 你的语言 next to 我的语言 mixed persons |
| `setup.languages.native` | 我的母语 | 我的语言 | same term as the Settings row it sets |
| `setup.languages.learning` | 我在学 | 学习语言 | same term as the Settings row it sets |
| `settings.languages.dataUnused` | 当前语言未使用 · {size} MB | 当前语言设置未使用 · {size} MB | 当前语言 read as 'the current language' |
| `settings.cloud.connected` | {provider}。所有数据都保存在那里一个只有 Langle 能打开的文件夹中。 | 已连接 {provider}。所有数据都保存在一个只有 Langle 能打开的文件夹中。 | a bare provider name followed by 。 is not a sentence; 那里一个 was clumsy |
| `settings.cloud.connectedAccount` | {provider}（{account}）。所有数据都保存在那里一个只有 Langle 能打开的文件夹中。 | 已连接 {provider}（{account}）。所有数据都保存在一个只有 Langle 能打开的文件夹中。 | same as connected |
| `settings.cloud.lastSaved` | 上次保存：{when}。 | 上次保存：{when} | no 。 after a colon label, as settings.sync.lastSaved |
| `settings.backup.lastExport` | 上次导出：{when}。 | 上次导出：{when} | same as lastSaved |
| `settings.cloud.tooDesc` | 你的其他设备也会保存到 {provider}。每台设备只需登录一次。 | 你的其他设备正在保存到 {provider}。每台设备只需登录一次。 | 也会 implied this device already saves there |
| `settings.comingLater` | 即将推出 | 后续推出 | 即将推出 promises 'soon'; en only says 'later' |
| `settings.sync.switchDesc` | 只添加单词及其状态，不包括出处和句子。在 {browser} 中登录并开启同步后，你的其他设备也会收到。 | 只同步单词及其状态，不包括出处和句子。在 {browser} 中登录并开启同步后，你的其他设备也会收到。 | 添加 was a literal 'adds' |
| `dict.fitsHere` | 符合此处 | 适合此句 | 符合此处 is not idiomatic |
| `sponsor.sponsored` | 赞助 | 赞助内容 | the usual zh-CN label for sponsored content |
| `video.toggle.on` | Langle 已开启 — 点击关闭 | Langle 已开启，点击即可关闭 | the dash is English punctuation |
| `video.toggle.off` | Langle 已关闭 — 点击开启 | Langle 已关闭，点击即可开启 | same as toggle.on |

## The browser's sync (`{syncName}`)
`env.syncName` is "{browser} 同步", with the browser's name filled in. No space before a following Chinese word (「Chrome 同步空间」). The switch says 保存到, not 通过…同步.
