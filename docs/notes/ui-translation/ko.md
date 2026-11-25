# Korean (ko) interface glossary

Register: descriptions and messages in 해요체 (friendly consumer-app style, as Korean YouTube and most Korean apps use); buttons and labels as short nouns or noun + 하기-less verb stems (저장, 다운로드, 연결). Spaces around Latin words follow ordinary Korean spacing; particles after a placeholder are written in the form that suits a Latin name (e.g. "{provider}에 저장").

| English | Korean | Note |
|---|---|---|
| New (category) | 새 단어 | chip, filter, button; also used for phrases (the chip names the category) |
| Learning (category) | 학습 중 | |
| Known (category) | 아는 단어 | |
| Learned (filter) | 익힌 단어 | a Known word that went through Learning |
| Saved (storage) | 저장됨 | never 동기화됨 |
| save (a word) | 저장 | |
| meaning | 뜻 | dictionary meanings → 뜻; "Your meanings" → 내 뜻 |
| phrase | 표현 | Korean learning apps' word for multi-word expressions |
| highlight | 하이라이트 | verb: 하이라이트 표시 |
| word list | 단어장 | phone tab "Words" → 단어 |
| Your language | 사용 언어 | not 모국어 (see Review) |
| learning language | 학습 언어 | setup "I'm learning" too |
| language data | 언어 데이터 | |
| subtitles | 자막 | |
| transcript | 스크립트 | YouTube's Korean UI ("스크립트 표시") |
| sentence | 문장 | |
| sync | 동기화 | |
| backup | 백업 | export/import → 내보내기 / 가져오기 (Chrome's Korean UI) |
| sign in | 로그인 | |
| dictionary window | 사전 창 | |
| on-device AI | 기기 내 AI | |
| Settings | 설정 | |
| Download | 다운로드 | |

Choices:
- 해요체 rather than 합니다체: Langle is a friendly learning app; 합니다체 reads like a bank notice.
- "I speak" → 내 언어 is ambiguous; setup labels use 사용 언어 / 학습 언어, the names of the Settings rows they set.
- No (이)가 or (으)로 after a placeholder: rephrase so the particle does not depend on the value ("{head} 등장 위치", "{time} 지점으로").
- "A–Z" kept: the words sorted are in the learning language.

## Review

Second-pass review for naturalness and consistency.

Decision: **Your language → 사용 언어.** The English avoids "native language" on purpose (the language you read best, not necessarily your mother tongue); 모국어 says exactly "mother tongue". The interface row stays 표시 언어 and its first entry is 사용 언어와 같게. New / Learning / Known (새 단어 / 학습 중 / 아는 단어) kept: natural, short, and they work in every slot (아는 단어로 표시, 새 단어로 두기).

Changed keys:

| Key | Before | After | Why |
|---|---|---|---|
| `settings.languages.native` | 모국어 | 사용 언어 | Your language: the English avoids 'native language' on purpose; 모국어 says 'mother tongue'. 사용 언어 is the usual Korean settings word |
| `settings.languages.uiSame` | 모국어와 같게 | 사용 언어와 같게 | follows the 사용 언어 label |
| `settings.languages.lead` | Langle은 학습 언어로 쓰인 페이지에 하이라이트를 표시하고 모국어로 번역해 줘요. | Langle은 학습 언어로 쓰인 페이지에 하이라이트를 표시하고 사용 언어로 번역해 줘요. | 사용 언어 |
| `settings.video.subtitleTranslationDesc` | 현재 자막 아래에 모국어 번역을 표시해요. | 현재 자막 아래에 사용 언어 번역을 표시해요. | 사용 언어 |
| `settings.video.transcriptTranslationDesc` | 스크립트 카드마다 모국어 번역을 표시해요. 자막과 따로 설정할 수 있어요. | 스크립트 카드마다 사용 언어 번역을 표시해요. 자막과 따로 설정할 수 있어요. | 사용 언어 |
| `setup.languages.native` | 모국어 | 사용 언어 | same term as the Settings row it sets |
| `setup.languages.learning` | 배우는 언어 | 학습 언어 | same term as the Settings row it sets |
| `settings.cloud.connected` | {provider}. 모든 데이터가 Langle만 열 수 있는 폴더에 저장돼요. | {provider}에 연결됨. 모든 데이터는 Langle만 열 수 있는 폴더에 저장돼요. | a bare provider name followed by a period is not a Korean sentence |
| `settings.cloud.connectedAccount` | {provider} ({account}). 모든 데이터가 Langle만 열 수 있는 폴더에 저장돼요. | {provider}({account})에 연결됨. 모든 데이터는 Langle만 열 수 있는 폴더에 저장돼요. | same as connected |
| `settings.cloud.lastSaved` | 마지막 저장: {when}. | 마지막 저장: {when} | no period after a colon label, as settings.sync.lastSaved |
| `settings.backup.lastExport` | 마지막으로 내보낸 날: {when} | 마지막 내보내기: {when} | {when} is a relative time (방금, 3분 전), not a day; 날 did not fit |
| `settings.cloud.tooDesc` | 다른 기기들도 {provider}에 저장해요. 로그인은 기기마다 한 번만 하면 돼요. | 다른 기기는 {provider}에 저장하고 있어요. 로그인은 기기마다 한 번만 하면 돼요. | 도 implied this device already saves there |
| `settings.cloud.reconnectDesc` | 다시 연결할 때까지 새 변경사항은 이 기기에서 대기해요. | 다시 연결할 때까지 새 변경사항은 이 기기에 보관돼요. | changes do not 대기하다; they are kept |
| `saveAll.addLearning` | 모두 학습 중으로 | 모두 학습 중으로 표시 | a button needs its verb; 모두 학습 중으로 was a fragment |
| `saveAll.markKnown` | 모두 아는 단어로 | 모두 아는 단어로 표시 | same as addLearning; matches the toast 아는 단어로 표시했어요 |
| `video.words.jump` | {time}(으)로 이동 | {time} 지점으로 이동 | (으)로 after a time read badly; 지점으로 is always right |
| `video.words.places` | {head}이(가) 나오는 시간 | {head} 등장 시간 | no (이)가 after a placeholder |
| `page.words.jump` | {head}(으)로 이동, {count}개 중 {n}번째 | {head} 위치로 이동, {count}개 중 {n}번째 | no (으)로 after a placeholder |
| `page.words.places` | {head}이(가) 나오는 곳 | {head} 등장 위치 | no (이)가 after a placeholder |
| `sponsor.open` | {language}를 배우는 사람들에게 내 제품을 소개해 보세요. | {language}를 배우는 사람들에게 제품을 소개해 보세요. | 내 제품 read as 'my (the user's) product' |
| `setup.consent.sendsWhat` | 사이트 설정을 포함한 단어와 설정을 {syncName}에 보내요. 찾아보거나 재생한 단어는 뜻이나 발음을 제공하는 서비스로 전송될 수 있어요. | 단어와 설정(사이트 선택 포함)을 {syncName}에 보내요. 찾아보거나 재생한 단어는 뜻이나 발음을 제공하는 서비스로 전송될 수 있어요. | 사이트 설정을 포함한 단어와 설정 attached 'including' to the words |
| `setup.consent.keepsWhat` | 단어를 어디서 만났는지 보여 주기 위해 내 단어와 문장·웹 주소·제목 기록을 이 기기에 보관해요. | 단어를 어디서 만났는지 보여 주기 위해 저장한 단어와 문장·웹 주소·제목 기록을 이 기기에 보관해요. | Your words here means the saved words |
| `setup.consent.keepsWhatDevice` | 단어를 어디서 만났는지 보여 주기 위해 내 단어, 설정, 문장·웹 주소·제목 기록을 이 휴대폰에 보관해요. | 단어를 어디서 만났는지 보여 주기 위해 저장한 단어, 설정, 문장·웹 주소·제목 기록을 이 휴대폰에 보관해요. | same as keepsWhat |
| `setup.consent.sendsWhatDevice` | 찾아보거나 재생한 단어만 뜻이나 발음을 제공하는 서비스로 보내요. 내 단어와 설정은 이 휴대폰에만 남아요. | 찾아보거나 재생한 단어만 뜻이나 발음을 제공하는 서비스로 보내요. 저장한 단어와 설정은 이 휴대폰에만 남아요. | same as keepsWhat |
| `video.toggle.on` | Langle 켜짐 — 클릭하면 꺼져요 | Langle 켜짐 · 클릭하면 꺼져요 | the dash is English punctuation; the middle dot is used elsewhere in the UI |
| `video.toggle.off` | Langle 꺼짐 — 클릭하면 켜져요 | Langle 꺼짐 · 클릭하면 켜져요 | same as toggle.on |

## The browser's sync (`{syncName}`)
`env.syncName` is "{browser} 동기화", with the browser's name filled in. 동기화 ends in a vowel: 에, 로. The switch says 저장 so it does not repeat 동기화.
