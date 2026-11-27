# Portuguese (pt, Brazilian) interface glossary

Brazilian Portuguese, as Chrome's and YouTube's pt-BR UI. Register: **você** ("seu idioma", "escolha"). Buttons are infinitives ("Salvar", "Baixar"). In sentences the app takes the article, as Brazilians say it: "o Langle". Quotes “…”, "{percent}%" without a space.

| English | Portuguese | Note |
|---|---|---|
| New / Learning / Known (categories) | Nova / Aprendendo / Conhecida | feminine, agreeing with "palavra" (and "expressão") |
| Learned (filter) | Aprendida | |
| Saved | Salvo | Chrome pt-BR "Salvar"; never "sincronizado" for the result |
| meaning | significado | |
| phrase | expressão | |
| word | palavra | |
| highlight (verb / noun) | destacar / destaque | |
| word list | Lista de palavras | |
| Your language | Seu idioma | |
| learning language | Idioma que você aprende | |
| interface language | Idioma da interface | |
| language data / pack | Dados de idioma / pacote | |
| subtitles / transcript | legendas / transcrição | as YouTube pt-BR |
| sentence | frase | Brazilian usage |
| sentence history | Histórico de frases | |
| sync | sincronização / sincronizar | |
| backup | backup | the word Brazilians use |
| sign in | fazer login | |
| Settings / Download / Theme | Configurações / Baixar / Tema | "Baixar" is shorter than "Fazer o download" and what people say |
| dictionary window | janela do dicionário | |
| on-device AI | IA no dispositivo | |
| toolbar popup | menu do Langle na barra de ferramentas | |
| Langle sheet (phone) | painel do Langle | |
| phone | celular | Brazilian word |
| site | site | |

Choices:
- Language names stay capitalized (they are also shown alone); in sentences they sit in parentheses.
- "New-word level" section is "Nível de vocabulário".
- "Buy me a coffee" is "Me pague um café", the usual Brazilian phrasing.
- "Continue" on the phone home screen is "Continuar assistindo", as YouTube and Netflix pt-BR.

## Review

Second-pass review for naturalness and consistency.

Decisions: register você and the glossary stand. Category names are singular feminine labels, so a sentence that puts one after a plural noun frames it (« da categoria “…” »).

Changed keys:

| Key | Before | After | Why |
|---|---|---|---|
| `settings.highlighting.switch` | Destacar palavras “{category}” | Destacar palavras da categoria “{category}” | {category} is the singular name (Nova/Aprendendo/Conhecida); « palavras “Conhecida” » did not agree |
| `settings.ai.unknown.desc` | Assim que a janela do dicionário abre. Palavras com verbete são explicadas quando você toca em “Explicar no contexto”. | Assim que a janela do dicionário abre. Palavras com verbete são explicadas quando você clica em “Explicar no contexto”. | a desktop setting: « toca » is a touch verb |
| `settings.comingLater` | Em breve | Disponível mais tarde | « Em breve » promises 'soon'; en only says 'later' |
| `settings.video.belowVideoDesc` | Em uma caixa maior abaixo do player, para nada cobrir a imagem. | Em uma caixa maior abaixo do player, para não cobrir a imagem. | « para nada cobrir » was clumsy |
| `settings.sync.switchDesc` | Envia cada palavra e seu status, sem fontes nem frases. Chega aos seus outros dispositivos quando você faz login no {browser} com a sincronização ativada. | Envia cada palavra e seu status, sem fontes nem frases. Chega aos seus outros dispositivos quando você está conectado ao {browser} com a sincronização ativada. | a state, not the act of logging in |
| `settings.cloud.connected` | {provider}. Tudo é salvo lá, em uma pasta que só o Langle pode abrir. | Conectado ao {provider}. Tudo é salvo lá, em uma pasta que só o Langle pode abrir. | a bare provider name followed by a period is not a sentence |
| `settings.cloud.connectedAccount` | {provider} ({account}). Tudo é salvo lá, em uma pasta que só o Langle pode abrir. | Conectado ao {provider} ({account}). Tudo é salvo lá, em uma pasta que só o Langle pode abrir. | same as connected |
| `settings.cloud.lastChecked` | Outros dispositivos verificados pela última vez: {when} | Última verificação dos outros dispositivos: {when} | a label, parallel to the other 'last …' lines |
| `settings.cloud.reconnectDesc` | As novas alterações aguardam neste dispositivo até você reconectar. | As novas alterações ficam neste dispositivo até você reconectar. | « aguardam » personified the changes |
| `notices.lead` | O Langle baixa os dados de idioma que usa. Cada pacote abaixo tem, como um todo, a licença indicada e lista as fontes de onde foi feito, com as licenças delas. | O Langle baixa os dados de idioma que usa. Cada pacote abaixo é distribuído, como um todo, sob a licença indicada e lista as fontes usadas para criá-lo, com as respectivas licenças. | « tem, como um todo, a licença » was translationese |
| `video.menu.dualSubtitles` | Legendas duplas | Legendas bilíngues | « duplas » reads as duplicated subtitles |
| `setup.consent.keepsWhat` | Suas palavras e um histórico de frases, endereços da web e títulos neste dispositivo, para mostrar onde você encontrou uma palavra. | Suas palavras salvas e um histórico de frases, endereços da web e títulos neste dispositivo, para mostrar onde você encontrou uma palavra. | consent text names the saved words |
| `setup.consent.keepsWhatDevice` | Suas palavras, configurações e um histórico de frases, endereços da web e títulos neste celular, para mostrar onde você encontrou uma palavra. | Suas palavras salvas, configurações e um histórico de frases, endereços da web e títulos neste celular, para mostrar onde você encontrou uma palavra. | same as keepsWhat |
| `setup.consent.sendsWhat` | Palavras e configurações, incluindo as escolhas de sites, para o {syncName}. Uma palavra que você pesquisa ou ouve pode ir para o serviço que fornece o significado ou o som dela. | Palavras e configurações, incluindo as escolhas de sites, para o {syncName}. Uma palavra que você pesquisa ou ouve pode ir para o serviço que fornece o significado ou a pronúncia dela. | 'sound' is the pronunciation |
| `setup.consent.sendsWhatDevice` | Só uma palavra que você pesquisa ou ouve, para o serviço que fornece o significado ou o som dela. Suas palavras e configurações ficam neste celular. | Só uma palavra que você pesquisa ou ouve, para o serviço que fornece o significado ou a pronúncia dela. Suas palavras salvas e configurações ficam neste celular. | saved words; pronunciation, as sendsWhat |

## The browser's sync (`{syncName}`)
`env.syncName` is "sincronização do {browser}", with the browser's name filled in. Feminine, with its article: "na / da / para a {syncName}".

## The phone app's own bars (`app.*`, M6f)
The shells draw these themselves (tab bar, title bar, ⋮, toasts, accessibility labels); the background sends them in the interface language. The tab names are the pages' own (`app.words` = `wordlist.phoneTitle`, `app.settings` = `settings.title`), `app.search` is `home.search`, and `app.on` / `app.off` are `settings.adBlocking.on` / `.off`. `app.editAddress` is `home.search` without the site. `{reasons}` in `app.buildRefused` stays English (the manifest keys the build lacks). Second pass:
- Home → Início; Tabs → Abas (an app's tabs; guias are a browser's); the app takes the article in sentences (Fechar o Langle, O Langle não pode…).
