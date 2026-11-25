# Spanish (es) interface glossary

Neutral Latin American Spanish (as Chrome's and YouTube's es-419 UI). Register: **tú** ("tu idioma", "elige"), as Google's es-419 products. Buttons are infinitives ("Guardar", "Descargar"). "video" without accent. Quotes “…”.

| English | Spanish | Note |
|---|---|---|
| New / Learning / Known (categories) | Nueva / Aprendiendo / Conocida | feminine, agreeing with "palabra" (and "expresión"); "Aprendiendo" is the usual status word in learning apps |
| Learned (filter) | Aprendida | |
| Saved | Guardado | never "sincronizado" for the result |
| meaning | significado | |
| phrase | expresión | |
| word | palabra | |
| highlight (verb / noun) | resaltar / resaltado | |
| word list | Lista de palabras | |
| Your language | Tu idioma | |
| learning language | Idioma que aprendes | |
| interface language | Idioma de la interfaz | |
| language data / pack | Datos de idioma / paquete | |
| subtitles / transcript | subtítulos / transcripción | as YouTube es-419 |
| sentence | oración | the usual Latin American word |
| sentence history | Historial de oraciones | |
| sync | sincronización / sincronizar | |
| backup | copia de seguridad | Chrome's term |
| sign in | iniciar sesión | |
| Settings / Download / Theme | Configuración / Descargar / Tema | Chrome es-419 |
| dictionary window | ventana del diccionario | |
| on-device AI | IA en el dispositivo | |
| toolbar popup | menú de Langle en la barra de herramientas | |
| Langle sheet (phone) | panel de Langle | |
| phone | teléfono | |
| site | sitio | |

Choices:
- Language names (`languageName.*`) stay capitalized because they are also shown alone ("Inglés → Español"); in sentences they sit in parentheses so no lowercase is needed.
- "New-word level" section is "Nivel de vocabulario".
- "Buy me a coffee" is "Invítame un café", the common Latin American phrasing.
- "Continue" on the phone home screen is "Seguir viendo", as YouTube and Netflix es-419.

## Review

Second-pass review for naturalness and consistency.

Decisions: register tú and the glossary stand. Category names are singular feminine labels, so a sentence that puts one after a plural noun frames it (« de la categoría “…” »).

Changed keys:

| Key | Before | After | Why |
|---|---|---|---|
| `wordlist.col.seen` | Vistas | Veces | the column holds a count; « Vistas » read as 'views' |
| `settings.highlighting.switch` | Resaltar palabras “{category}” | Resaltar palabras de la categoría “{category}” | {category} is the singular name (Nueva/Aprendiendo/Conocida); « palabras “Conocida” » did not agree |
| `settings.ai.unknown.desc` | En cuanto se abre la ventana del diccionario. Las palabras que sí tienen entrada se explican cuando tocas “Explicar en contexto”. | En cuanto se abre la ventana del diccionario. Las palabras que sí tienen entrada se explican cuando haces clic en “Explicar en contexto”. | a desktop setting: « tocas » is a touch verb |
| `settings.comingLater` | Próximamente | Disponible más adelante | « Próximamente » promises 'soon'; en only says 'later' |
| `settings.sync.switchDesc` | Agrega cada palabra y su estado, sin fuentes ni oraciones. Llega a tus otros dispositivos cuando hayas iniciado sesión en {browser} con la sincronización activada. | Sincroniza cada palabra y su estado, pero no las fuentes ni las oraciones. Llega a tus otros dispositivos si iniciaste sesión en {browser} con la sincronización activada. | « Agrega » was a literal 'adds'; « cuando hayas iniciado sesión » was stiff |
| `export.col.seen` | Vistas | Veces | same as wordlist.col.seen |
| `settings.cloud.connected` | {provider}. Todo se guarda ahí, en una carpeta que solo Langle puede abrir. | Conectado a {provider}. Todo se guarda ahí, en una carpeta que solo Langle puede abrir. | a bare provider name followed by a period is not a sentence |
| `settings.cloud.connectedAccount` | {provider} ({account}). Todo se guarda ahí, en una carpeta que solo Langle puede abrir. | Conectado a {provider} ({account}). Todo se guarda ahí, en una carpeta que solo Langle puede abrir. | same as connected |
| `settings.cloud.reconnectDesc` | Los cambios nuevos esperan en este dispositivo hasta que vuelvas a conectar. | Los cambios nuevos se quedan en este dispositivo hasta que vuelvas a conectar. | « esperan » personified the changes |
| `notices.lead` | Langle descarga los datos de idioma que usa. Cada paquete de abajo tiene, en conjunto, la licencia indicada y enumera las fuentes con las que se creó y sus licencias. | Langle descarga los datos de idioma que usa. Cada paquete de la lista se distribuye en su totalidad con la licencia indicada y enumera las fuentes con las que se creó y sus licencias. | « tiene, en conjunto, la licencia » was translationese |
| `video.menu.dualSubtitles` | Subtítulos dobles | Subtítulos bilingües | « dobles » reads as duplicated subtitles |
| `support.becomeSponsor` | Ser patrocinador | Hazte patrocinador | the usual call to action; « Ser patrocinador » read as a dictionary entry |
| `setup.consent.keepsWhat` | Tus palabras y un historial de oraciones, direcciones web y títulos en este dispositivo, para mostrar dónde encontraste una palabra. | Tus palabras guardadas y un historial de oraciones, direcciones web y títulos en este dispositivo, para mostrar dónde encontraste una palabra. | consent text names the saved words |
| `setup.consent.keepsWhatDevice` | Tus palabras, tu configuración y un historial de oraciones, direcciones web y títulos en este teléfono, para mostrar dónde encontraste una palabra. | Tus palabras guardadas, tu configuración y un historial de oraciones, direcciones web y títulos en este teléfono, para mostrar dónde encontraste una palabra. | same as keepsWhat |
| `setup.consent.sendsWhat` | Las palabras y la configuración, incluida la de los sitios, a {syncName}. Una palabra que buscas o escuchas puede ir al servicio que da su significado o su sonido. | Las palabras y la configuración, incluida la de los sitios, a {syncName}. Una palabra que buscas o escuchas puede enviarse al servicio que ofrece su significado o su pronunciación. | 'sound' is the pronunciation; « puede ir » was loose for a policy text |
| `setup.consent.sendsWhatDevice` | Solo una palabra que buscas o escuchas, al servicio que da su significado o su sonido. Tus palabras y tu configuración se quedan en este teléfono. | Solo una palabra que buscas o escuchas, al servicio que ofrece su significado o su pronunciación. Tus palabras guardadas y tu configuración se quedan en este teléfono. | saved words; pronunciation, as sendsWhat |
