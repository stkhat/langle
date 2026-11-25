# Thai (th) interface glossary

Register: neutral, polite everyday app Thai as in Chrome's and YouTube's Thai UI; no ครับ/ค่ะ; address the user as คุณ only where a sentence needs a subject. Buttons as short verbs or nouns (บันทึก, ดาวน์โหลด, เชื่อมต่อ). English loanwords where Thai apps use them (ไฮไลต์, ซิงค์, แอป).

| English | Thai | Note |
|---|---|---|
| New (category) | ใหม่ | chip; "New words" → คำใหม่ |
| Learning (category) | กำลังเรียน | |
| Known (category) | รู้แล้ว | |
| Learned (filter) | จำได้แล้ว | a Known word that went through Learning; kept apart from รู้แล้ว |
| Saved (storage) | บันทึกแล้ว | never ซิงค์แล้ว |
| save (a word) | บันทึก | |
| meaning | ความหมาย | "Your meanings" → ความหมายของคุณ |
| phrase | วลี | |
| highlight | ไฮไลต์ | |
| word list | คลังคำศัพท์ | phone tab "Words" → คำศัพท์ |
| Your language | ภาษาของคุณ | not ภาษาแม่ (see Review) |
| learning language | ภาษาที่เรียน | setup "I'm learning" too |
| language data | ข้อมูลภาษา | |
| subtitles | คำบรรยาย | YouTube's Thai UI |
| transcript | ข้อความถอดเสียง | YouTube's Thai UI |
| sentence | ประโยค | sentence history → ประวัติประโยค |
| sync | ซิงค์ | Chrome's Thai UI |
| backup | สำรองข้อมูล | export/import → ส่งออก / นำเข้า |
| sign in | ลงชื่อเข้าใช้ | Chrome's Thai UI |
| dictionary window | หน้าต่างพจนานุกรม | |
| on-device AI | AI ในอุปกรณ์ | |
| Settings | การตั้งค่า | |
| Download | ดาวน์โหลด | |

Choices:
- รู้แล้ว / จำได้แล้ว: short status words that fit buttons and keep Known and Learned distinct.
- คำบรรยาย for subtitles, matching YouTube Thai, rather than ซับไตเติล.
- "A–Z" kept: the words sorted are in the learning language.

## Review

Second-pass review for naturalness and consistency.

Decision: **Your language → ภาษาของคุณ**, not ภาษาแม่: the English avoids "native language" on purpose, and ภาษาของคุณ is how Thai UIs name it. Setup uses the Settings rows' names (ภาษาของคุณ / ภาษาที่เรียน) under the title ตั้งค่าภาษา. Categories ใหม่ / กำลังเรียน / รู้แล้ว kept. The Never run on list is เว็บไซต์ที่ไม่ใช้ Langle (no dangling preposition) and is quoted by that name.

Changed keys:

| Key | Before | After | Why |
|---|---|---|---|
| `settings.languages.native` | ภาษาแม่ | ภาษาของคุณ | Your language: the English avoids 'native language' on purpose; ภาษาแม่ says 'mother tongue'. ภาษาของคุณ is the usual Thai UI phrasing |
| `settings.languages.uiSame` | เหมือนภาษาแม่ | เหมือนภาษาของคุณ | follows the ภาษาของคุณ label |
| `settings.languages.lead` | Langle ไฮไลต์หน้าเว็บที่เขียนด้วยภาษาที่คุณเรียน และแปลเป็นภาษาแม่ของคุณ | Langle ไฮไลต์หน้าเว็บที่เขียนด้วยภาษาที่คุณเรียน และแปลเป็นภาษาของคุณ | not ภาษาแม่ |
| `settings.video.subtitleTranslationDesc` | บรรทัดในภาษาแม่ของคุณใต้คำบรรยายปัจจุบัน | บรรทัดในภาษาของคุณใต้คำบรรยายปัจจุบัน | not ภาษาแม่ |
| `settings.video.transcriptTranslationDesc` | บรรทัดในภาษาแม่ของคุณบนการ์ดข้อความถอดเสียงแต่ละใบ ตั้งค่าแยกจากคำบรรยาย | บรรทัดในภาษาของคุณบนการ์ดข้อความถอดเสียงแต่ละใบ ตั้งค่าแยกจากคำบรรยาย | not ภาษาแม่ |
| `setup.languages.title` | ภาษาของคุณ | ตั้งค่าภาษา | the first row below is now ภาษาของคุณ; the title would repeat it |
| `setup.languages.native` | ภาษาแม่ | ภาษาของคุณ | same term as the Settings row it sets |
| `setup.languages.learning` | ภาษาที่กำลังเรียน | ภาษาที่เรียน | same term as the Settings row it sets |
| `settings.comingLater` | เร็วๆ นี้ | จะมีในภายหลัง | เร็วๆ นี้ promises 'soon'; en only says 'later' |
| `settings.cloud.connected` | {provider} ข้อมูลทั้งหมดบันทึกไว้ที่นั่น ในโฟลเดอร์ที่มีแค่ Langle เปิดได้ | เชื่อมต่อ {provider} แล้ว ข้อมูลทั้งหมดบันทึกไว้ในโฟลเดอร์ที่มีแค่ Langle เปิดได้ | a bare provider name did not read as a status |
| `settings.cloud.connectedAccount` | {provider} ({account}) ข้อมูลทั้งหมดบันทึกไว้ที่นั่น ในโฟลเดอร์ที่มีแค่ Langle เปิดได้ | เชื่อมต่อ {provider} ({account}) แล้ว ข้อมูลทั้งหมดบันทึกไว้ในโฟลเดอร์ที่มีแค่ Langle เปิดได้ | same as connected |
| `settings.sync.switchDesc` | เพิ่มแต่ละคำและสถานะของคำนั้น ไม่รวมแหล่งที่มาหรือประโยค จะไปถึงอุปกรณ์อื่นๆ ของคุณเมื่อคุณลงชื่อเข้าใช้ {browser} และเปิดการซิงค์ไว้ | ซิงค์เฉพาะคำและสถานะของคำ ไม่รวมแหล่งที่มาหรือประโยค และจะไปถึงอุปกรณ์อื่นๆ ของคุณเมื่อคุณลงชื่อเข้าใช้ {browser} และเปิดการซิงค์ไว้ | เพิ่มแต่ละคำ was a literal 'adds each word' |
| `dict.fitsHere` | เข้ากับที่นี่ | เหมาะกับประโยคนี้ | เข้ากับที่นี่ is not idiomatic |
| `dict.explain.noFit` | ไม่มีความหมายในพจนานุกรมที่เข้ากับที่นี่ | ไม่มีความหมายในพจนานุกรมที่เหมาะกับประโยคนี้ | same wording as fitsHere |
| `dict.usedHere` | ความหมายที่นี่ | ใช้อยู่ที่นี่ | ความหมายที่นี่ did not say the meaning is the one in use |
| `dict.usedHereOf` | ความหมายที่นี่: {meaning} | ใช้อยู่ที่นี่: {meaning} | same as usedHere |
| `dict.meta.at` | {site} · ที่ {time} | {site} · {time} | ที่ before a time is not Thai |
| `dict.notSavedNote` | ยังไม่ได้บันทึก บันทึกเป็นกำลังเรียนหรือรู้แล้ว แล้ว Langle จะจำไว้ว่าคุณเห็นคำนี้ที่ไหนในครั้งต่อไป | ยังไม่ได้บันทึก หากบันทึกเป็น “กำลังเรียน” หรือ “รู้แล้ว” Langle จะจำไว้ว่าคุณเห็นคำนี้ที่ไหนในครั้งต่อไป | รู้แล้ว แล้ว read as a stutter; quoted category names |
| `sponsor.open` | พื้นที่สำหรับผลิตภัณฑ์ของคุณ ต่อหน้าผู้ที่กำลังเรียน{language} | แนะนำผลิตภัณฑ์ของคุณให้ผู้ที่กำลังเรียน{language}ได้เห็นที่นี่ | ต่อหน้า was a literal 'in front of' |
| `video.toggle.on` | Langle เปิดอยู่ — คลิกเพื่อปิด | Langle เปิดอยู่ คลิกเพื่อปิด | the dash is English punctuation; Thai separates with a space |
| `video.toggle.off` | Langle ปิดอยู่ — คลิกเพื่อเปิด | Langle ปิดอยู่ คลิกเพื่อเปิด | same as toggle.on |
| `setup.consent.where` | Langle บันทึกข้อมูลของคุณไว้ในอุปกรณ์ของคุณและบริการคลาวด์ของคุณเองเท่านั้น ไม่มีที่อื่น นักพัฒนาไม่ได้รับข้อมูลใดๆ เลย | Langle บันทึกข้อมูลของคุณไว้ในอุปกรณ์ของคุณและบริการคลาวด์ของคุณเองเท่านั้น และไม่บันทึกไว้ที่อื่น นักพัฒนาไม่ได้รับข้อมูลใดๆ เลย | ไม่มีที่อื่น was a literal 'nowhere else' |
| `setup.consent.whereDevice` | Langle บันทึกข้อมูลของคุณไว้ในโทรศัพท์เครื่องนี้เท่านั้น ไม่มีที่อื่น นักพัฒนาไม่ได้รับข้อมูลใดๆ เลย | Langle บันทึกข้อมูลของคุณไว้ในโทรศัพท์เครื่องนี้เท่านั้น และไม่บันทึกไว้ที่อื่น นักพัฒนาไม่ได้รับข้อมูลใดๆ เลย | same as where |
| `settings.sites.never` | ไม่ใช้งานบน | เว็บไซต์ที่ไม่ใช้ Langle | ไม่ใช้งานบน ended on a dangling preposition |
| `settings.history.switchDesc` | ไม่มีการซิงค์ หน้าเว็บในรายการ “ไม่ใช้งานบน” จะไม่ถูกเก็บ | ไม่มีการซิงค์ หน้าเว็บในรายการ “เว็บไซต์ที่ไม่ใช้ Langle” จะไม่ถูกเก็บ | quotes the list by its new name |
| `settings.history.switchDescCloud` | หน้าเว็บในรายการ “ไม่ใช้งานบน” จะไม่ถูกเก็บ | หน้าเว็บในรายการ “เว็บไซต์ที่ไม่ใช้ Langle” จะไม่ถูกเก็บ | quotes the list by its new name |

## The browser's sync (`{syncName}`)
`env.syncName` is "การซิงค์ของ {browser}", with the browser's name filled in. Written straight after ใน / ไปยัง, with a space after it (it ends in the browser's Latin name).
