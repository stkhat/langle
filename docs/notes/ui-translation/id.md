# Indonesian (id) interface glossary

Register: everyday app Indonesian with **Anda**, as Chrome's and YouTube's Indonesian UI; sentences are short and relaxed ("Anda juga bisa…", "jadi tidak menutupi gambar"), not formal-letter style ("dapat", "tersebut" kept to a minimum). Buttons are bare verbs ("Simpan", "Download", "Hapus"); progress lines are "Me-…" ("Mendownload"). Loanwords as Google's Indonesian UI uses them: "download", "login", "link", "browser", "default", "toolbar". Quotation marks “…”.

| English | Indonesian | Note |
|---|---|---|
| New / Learning / Known (categories) | Baru / Dipelajari / Dikenal | passive adjectives fit every sentence ("kata berstatus Dikenal", "tandai Dikenal"); capitalized where they name the category |
| Learned (filter) | Dikuasai | |
| Saved | Tersimpan / Disimpan | never "Disinkronkan" for the result |
| meaning | arti | everyday word (not "makna") |
| phrase | frasa | |
| word | kata | |
| highlight | sorot / sorotan | "dipilih" is kept for a text selection |
| word list | daftar kata | |
| Your language | bahasa Anda | |
| learning language | bahasa yang dipelajari | |
| interface language | bahasa antarmuka | |
| language data / pack | data bahasa / paket | |
| subtitles / transcript | subtitel / transkrip | YouTube's Indonesian UI |
| sentence | kalimat | |
| sentence history | riwayat kalimat | like "riwayat penelusuran" |
| sync | sinkronisasi / sinkronkan | Chrome's word |
| backup | cadangan, file cadangan | |
| sign in | login | Google's Indonesian word |
| Settings / Download / Theme | Setelan / Download / Tema | Chrome's words; theme options Sistem / Terang / Gelap |
| dictionary window | jendela kamus | |
| on-device AI | AI di perangkat; "AI bawaan {browser}" | |
| toolbar popup | ikon Langle di toolbar | |
| Langle sheet (phone) | panel Langle | |
| phone | ponsel | |

Placeholders:
- `languageName.*` are the bare names ("Inggris", "Jepang"), as Google's Indonesian language menus write them, so the pair reads "Inggris → Jepang"; in sentences they follow "bahasa" ("data bahasa Inggris", "belajar bahasa Inggris"). The option for Indonesian itself is "Bahasa Indonesia".
- Chinese is "Mandarin", the everyday Indonesian name; the option is "Mandarin Sederhana (简体中文)".
- Indonesian has no plural forms, so every count key is a plain string ("5 kata").

Choices:
- "New-word level" section is "Kosakata": the setting says how many common words you already know.
- "Not now" in the consent step is "Lain kali", the usual soft decline in Indonesian apps.
- "Buy me a coffee" is "Traktir saya kopi"; "Nice work!" is "Mantap!".
- "I speak / I'm learning" are "Bahasa saya" / "Saya belajar".

## Review

Second-pass review for naturalness and consistency.

Decisions: register Anda and the glossary stand, except the setup's language labels, which now use the Settings rows' names (Bahasa Anda, Bahasa yang dipelajari); this replaces the «Bahasa saya / Saya belajar» choice above, and the setup title becomes «Atur bahasa» so it does not repeat the first row.

Changed keys:

| Key | Before | After | Why |
|---|---|---|---|
| `settings.level.note` | Kata yang sudah Anda simpan selalu tetap dengan status yang Anda berikan. | Kata yang sudah Anda simpan selalu mempertahankan status yang Anda berikan. | «selalu tetap dengan status» was not idiomatic |
| `settings.comingLater` | Segera hadir | Tersedia nanti | «Segera hadir» promises 'soon'; en only says 'later' |
| `settings.sync.switchDesc` | Menambahkan setiap kata dan statusnya, tanpa sumber atau kalimat. Sampai ke perangkat Anda yang lain jika Anda login ke {browser} dengan sinkronisasi aktif. | Menyinkronkan setiap kata dan statusnya, tanpa sumber atau kalimat. Kata-kata ini sampai ke perangkat Anda yang lain jika Anda login ke {browser} dengan sinkronisasi aktif. | «Menambahkan» was a literal 'adds', and «Sampai» had no subject |
| `settings.cloud.connected` | {provider}. Semuanya disimpan di sana, dalam folder yang hanya bisa dibuka Langle. | Terhubung ke {provider}. Semuanya disimpan di sana, dalam folder yang hanya bisa dibuka Langle. | a bare provider name followed by a period is not a sentence |
| `settings.cloud.connectedAccount` | {provider} ({account}). Semuanya disimpan di sana, dalam folder yang hanya bisa dibuka Langle. | Terhubung ke {provider} ({account}). Semuanya disimpan di sana, dalam folder yang hanya bisa dibuka Langle. | same as connected |
| `settings.cloud.reconnectDesc` | Perubahan baru menunggu di perangkat ini sampai Anda menghubungkan ulang. | Perubahan baru tetap tersimpan di perangkat ini sampai Anda menghubungkan ulang. | «menunggu» personified the changes |
| `saveAll.note` | Kata yang sudah Anda simpan tetap dengan statusnya. Kata yang masuk level kata umum tidak dihitung. | Status kata yang sudah Anda simpan tidak berubah. Kata yang termasuk kosakata Anda tidak dihitung. | «tetap dengan statusnya» was not idiomatic; the common-word level uses the section's name «Kosakata» |
| `video.toggle.on` | Langle aktif — klik untuk menonaktifkan | Langle aktif. Klik untuk menonaktifkan | no dash in a tooltip |
| `video.toggle.off` | Langle nonaktif — klik untuk mengaktifkan | Langle nonaktif. Klik untuk mengaktifkan | no dash in a tooltip |
| `video.menu.dualSubtitles` | Tampilkan subtitel ganda | Tampilkan subtitel dwibahasa | «ganda» means doubled; the setting shows the line in two languages |
| `setup.consent.keepsWhat` | Kata Anda dan riwayat kalimat, alamat web, serta judul di perangkat ini, untuk menunjukkan di mana Anda bertemu sebuah kata. | Kata tersimpan Anda dan riwayat kalimat, alamat web, serta judul di perangkat ini, untuk menunjukkan di mana Anda bertemu sebuah kata. | consent text names the saved words |
| `setup.consent.keepsWhatDevice` | Kata, setelan, dan riwayat kalimat, alamat web, serta judul di ponsel ini, untuk menunjukkan di mana Anda bertemu sebuah kata. | Kata tersimpan, setelan, dan riwayat kalimat, alamat web, serta judul di ponsel ini, untuk menunjukkan di mana Anda bertemu sebuah kata. | same as keepsWhat |
| `setup.consent.sendsWhatDevice` | Hanya kata yang Anda cari atau putar, ke layanan yang menyediakan arti atau suaranya. Kata dan setelan Anda tetap di ponsel ini. | Hanya kata yang Anda cari atau putar, ke layanan yang menyediakan arti atau suaranya. Kata tersimpan dan setelan Anda tetap di ponsel ini. | same as keepsWhat |
| `setup.languages.title` | Bahasa Anda | Atur bahasa | «Bahasa Anda» is now the row below it (no plural in Indonesian to tell them apart) |
| `setup.languages.native` | Bahasa saya | Bahasa Anda | same name as the Settings row it sets |
| `setup.languages.learning` | Saya belajar | Bahasa yang dipelajari | same name as the Settings row it sets |
