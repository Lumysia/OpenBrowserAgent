# Translation Glossary

OpenBrowserAgent ships its interface in nine languages. This page records the words each language uses for the product's main ideas, so that new strings match what is already there. If you add or change a user-facing string, check this page first; if you introduce a new concept, add it here in the same change.

Strings live in `src/shared/locales/` (the main UI), `src/shared/locales/smart-bar/` (the smart bar), `src/shared/locales/context-menu/` (the right-click menu), `src/shared/locales/downloads/` (the downloads tool's step lines), `src/shared/locales/provider-consent/` (permission to send content to an AI provider) and `public/_locales/` (the extension name, description and shortcut). English (`en-US`) is the source; every other language must have every key.

## General rules

- **One idea, one word.** If the chat is a _conversa_ in one place, it is a _conversa_ everywhere, including tool status lines, settings descriptions and error messages.
- **Name controls by their real label.** When text tells people to press a button or open a page, use that button's or page's exact label. In Chinese, quote it with “” (Simplified) or 「」 (Traditional); in German with „“.
- **Say where things happen.** A button that opens the side panel says so ("Ask in side panel", "Continue in side panel").
- **Agents, not "the assistant".** Settings text that talks about the AI acting in the browser calls it the agent. "AI" is fine in marketing text such as the extension description, and "assistant" stays where it means the assistant's messages in a chat (as in the debug logging option).
- **AI provider, not a bare "provider".** The service that runs the models is the AI provider in every language (the settings page, its buttons, onboarding, errors and permission text). A repeat in the same sentence or inside the provider form may drop "AI" when the full form reads heavy, and the form's fields use plain words ("Name"). Write "AI provider" rather than "model provider". Page translation engines are not providers, and other services (a search provider, a sync backend) keep their own names.
- **Keep placeholders.** `{count}`, `{name}`, `{max}` and the like stay exactly as they are.
- **Use the ellipsis character** `…`, never three dots.
- **Dashes, not hyphens, between phrases.** English and Brazilian Portuguese use a spaced em dash (`—`), German, French and Spanish a spaced en dash (`–`), Japanese and Korean a spaced em dash, and Chinese the double dash `——` with no spaces. A spaced ASCII hyphen (`-`) is never a separator.
- **Chinese uses full-width punctuation** next to Chinese text: `？`, `！`, `：`, `，`, `（）`.
- **Counts go through plural messages.** Any text with `{count}` is a `plural({...})` message with the forms the language needs, and Chinese, Japanese and Korean put the measure word in it (`{count} 个模型`, `{count}個のモデル`, `모델 {count}개`).
- **Leave these untranslated:** OpenBrowserAgent, MCP, Streamable HTTP, JSON, OpenAI, WebDAV, ETag, HTTP, the Origin header name, SKILL.md, agent.json, example.com, and the `RESET` confirmation word (the code compares what people type against it).
- **English titles and buttons use sentence case** ("Chat history", not "Chat History").

## Core terms

| English                           | 简体中文           | 繁體中文           | 日本語                         | 한국어                 |
| --------------------------------- | ------------------ | ------------------ | ------------------------------ | ---------------------- |
| chat                              | 对话               | 對話               | チャット                       | 채팅                   |
| chat history                      | 对话历史           | 對話紀錄           | チャット履歴                   | 채팅 기록              |
| agent                             | 智能体             | 智慧體             | エージェント                   | 에이전트               |
| sub-agent                         | 子智能体           | 子智慧體           | サブエージェント               | 하위 에이전트          |
| Browse / Ask (built-in agents)    | 浏览 / 询问        | 瀏覽 / 詢問        | ブラウズ / 質問                | 탐색 / 질문            |
| … (or compatible) (provider type) | …（或兼容）        | …（或相容）        | …（または互換）                | …(또는 호환)           |
| side panel                        | 侧边栏             | 側邊欄             | サイドパネル                   | 사이드 패널            |
| smart bar                         | 智能工具栏         | 智慧工具列         | スマートバー                   | 스마트 바              |
| model                             | 模型               | 模型               | モデル                         | 모델                   |
| helper model                      | 辅助模型           | 輔助模型           | 補助モデル                     | 보조 모델              |
| AI provider                       | AI 提供商          | AI 提供者          | AI プロバイダー                | AI 제공업체            |
| API key                           | API Key            | API Key            | API キー                       | API 키                 |
| base URL                          | Base URL           | Base URL           | ベース URL                     | Base URL               |
| skill                             | 技能               | 技能               | スキル                         | 스킬                   |
| tool                              | 工具               | 工具               | ツール                         | 도구                   |
| MCP server                        | MCP 服务器         | MCP 伺服器         | MCP サーバー                   | MCP 서버               |
| recommended (MCP servers)         | 推荐               | 推薦               | おすすめ                       | 추천                   |
| request header                    | 请求头             | 請求標頭           | ヘッダー                       | 헤더                   |
| local execution bridge            | 本地执行桥         | 本機執行橋         | ローカル実行ブリッジ           | 로컬 실행 브리지       |
| native messaging host             | 原生消息主机       | 原生訊息主機       | ネイティブメッセージングホスト | 네이티브 메시징 호스트 |
| workspace                         | 工作区             | 工作區             | ワークスペース                 | 워크스페이스           |
| memory                            | 记忆               | 記憶               | メモリ                         | 메모리                 |
| sync                              | 同步               | 同步               | 同期                           | 동기화                 |
| attachment                        | 附件               | 附件               | 添付ファイル                   | 첨부 파일              |
| device (a synced browser)         | 设备               | 裝置               | デバイス                       | 기기                   |
| sync passphrase                   | 同步口令           | 同步密語           | 同期パスフレーズ               | 동기화 암호 문구       |
| sync code (joins another device)  | 同步码             | 同步碼             | 同期コード                     | 동기화 코드            |
| Keys (sync group)                 | 密钥               | 金鑰               | キー                           | 키                     |
| Files (sync group)                | 文件               | 檔案               | ファイル                       | 파일                   |
| screenshot                        | 截图               | 截圖               | スクリーンショット             | 스크린샷               |
| fork (a chat)                     | 分叉               | 分叉               | 分岐                           | 분기                   |
| built-in                          | 内置               | 內建               | 組み込み                       | 내장                   |
| customize (a built-in skill)      | 自定义             | 自訂               | カスタマイズ                   | 사용자 지정            |
| skill use: Auto / Manual / Off    | 自动 / 手动 / 关闭 | 自動 / 手動 / 關閉 | 自動 / 手動 / オフ             | 자동 / 수동 / 끔       |
| footnote                          | 脚注               | 註腳               | 脚注                           | 각주                   |
| load (an image from an answer)    | 加载               | 載入               | 読み込む                       | 불러오기               |
| restore (deleted synced items)    | 恢复               | 還原               | 復元                           | 복원                   |
| merge (synced changes)            | 合并               | 合併               | 統合                           | 병합                   |
| browser profile                   | 浏览器配置文件     | 瀏覽器設定檔       | ブラウザー プロファイル        | 브라우저 프로필        |
| voice (reading aloud)             | 语音               | 語音               | 音声                           | 음성                   |
| code (the agent runs)             | 代码               | 程式碼             | コード                         | 코드                   |
| sandbox (where code runs)         | 沙盒               | 沙盒               | サンドボックス                 | 샌드박스               |
| output limit (of a model)         | 输出上限           | 輸出上限           | 出力の上限                     | 출력 한도              |
| Continue (a cut-off response)     | 继续               | 繼續               | 続ける                         | 계속하기               |
| diagram (Mermaid)                 | 图表               | 圖表               | 図                             | 다이어그램             |

| English                           | Français                          | Deutsch                     | Español                               | Português (Brasil)               |
| --------------------------------- | --------------------------------- | --------------------------- | ------------------------------------- | -------------------------------- |
| chat                              | discussion                        | Chat                        | chat                                  | conversa                         |
| chat history                      | historique des discussions        | Chatverlauf                 | historial de chats                    | histórico de conversas           |
| agent                             | agent                             | Agent                       | agente                                | agente                           |
| sub-agent                         | sous-agent                        | Subagent                    | subagente                             | subagente                        |
| Browse / Ask (built-in agents)    | Naviguer / Demander               | Browsen / Fragen stellen    | Navegar / Preguntar                   | Navegar / Perguntar              |
| … (or compatible) (provider type) | … (ou compatible)                 | … (oder kompatibel)         | … (o compatible)                      | … (ou compatível)                |
| side panel                        | panneau latéral                   | Seitenleiste                | panel lateral                         | painel lateral                   |
| smart bar                         | barre intelligente                | Smart Bar                   | barra inteligente                     | barra inteligente                |
| model                             | modèle                            | Modell                      | modelo                                | modelo                           |
| helper model                      | modèle auxiliaire                 | Hilfsmodell                 | modelo auxiliar                       | modelo auxiliar                  |
| AI provider                       | fournisseur d’IA                  | KI-Anbieter                 | proveedor de IA                       | provedor de IA                   |
| API key                           | clé API                           | API-Schlüssel               | clave API                             | chave de API                     |
| base URL                          | URL de base                       | Basis-URL                   | URL base                              | URL base                         |
| skill                             | compétence                        | Skill                       | habilidad                             | habilidade                       |
| tool                              | outil                             | Tool                        | herramienta                           | ferramenta                       |
| MCP server                        | serveur MCP                       | MCP-Server                  | servidor MCP                          | servidor MCP                     |
| recommended (MCP servers)         | recommandé                        | empfohlen                   | recomendado                           | recomendado                      |
| request header                    | en-tête                           | Header                      | cabecera                              | cabeçalho                        |
| local execution bridge            | pont d’exécution local            | lokale Ausführungs-Bridge   | puente de ejecución local             | ponte de execução local          |
| native messaging host             | hôte de messagerie native         | Native-Messaging-Host       | host de mensajería nativa             | host de mensagens nativas        |
| workspace                         | espace de travail                 | Arbeitsbereich              | espacio de trabajo                    | espaço de trabalho               |
| memory                            | mémoire                           | Gedächtnis                  | memoria                               | memória                          |
| sync                              | synchronisation                   | Synchronisierung            | sincronización                        | sincronização                    |
| attachment                        | pièce jointe                      | Anhang                      | adjunto                               | anexo                            |
| device (a synced browser)         | appareil                          | Gerät                       | dispositivo                           | dispositivo                      |
| sync passphrase                   | phrase secrète de synchronisation | Sync-Passphrase             | frase de contraseña de sincronización | frase secreta de sincronização   |
| sync code (joins another device)  | code de synchronisation           | Sync-Code                   | código de sincronización              | código de sincronização          |
| Keys (sync group)                 | Clés                              | Schlüssel                   | Claves                                | Chaves                           |
| Files (sync group)                | Fichiers                          | Dateien                     | Archivos                              | Arquivos                         |
| screenshot                        | capture d’écran                   | Screenshot                  | captura de pantalla                   | captura de tela                  |
| fork (a chat)                     | créer une branche                 | verzweigen                  | bifurcar                              | ramificar                        |
| built-in                          | intégré                           | integriert                  | integrado                             | integrado                        |
| customize (a built-in skill)      | personnaliser                     | anpassen                    | personalizar                          | personalizar                     |
| skill use: Auto / Manual / Off    | Auto / Manuelle / Désactivée      | Automatisch / Manuell / Aus | Automático / Manual / Desactivada     | Automático / Manual / Desativada |
| footnote                          | note de bas de page               | Fußnote                     | nota al pie                           | nota de rodapé                   |
| load (an image from an answer)    | charger                           | laden                       | cargar                                | carregar                         |
| restore (deleted synced items)    | restaurer                         | wiederherstellen            | restaurar                             | restaurar                        |
| merge (synced changes)            | fusionner                         | zusammenführen              | combinar                              | mesclar                          |
| browser profile                   | profil de navigateur              | Browserprofil               | perfil de navegador                   | perfil de navegador              |
| voice (reading aloud)             | voix                              | Stimme                      | voz                                   | voz                              |
| code (the agent runs)             | code                              | Code                        | código                                | código                           |
| sandbox (where code runs)         | bac à sable                       | Sandbox                     | entorno aislado                       | sandbox                          |
| output limit (of a model)         | limite de sortie                  | Ausgabelimit                | límite de salida                      | limite de saída                  |
| Continue (a cut-off response)     | Continuer                         | Fortsetzen                  | Continuar                             | Continuar                        |
| diagram (Mermaid)                 | diagramme                         | Diagramm                    | diagrama                              | diagrama                         |

The settings pages are **General**, **AI providers & models** (AI 提供商和模型 / AI 提供者和模型 / AI プロバイダーとモデル / AI 제공업체 및 모델 / Fournisseurs d’IA et modèles / KI-Anbieter und Modelle / Proveedores de IA y modelos / Provedores de IA e modelos), **Agents & skills**, **On pages** (网页功能 / 網頁功能 / ページ上の機能 / 페이지 기능 / Sur les pages / Auf Webseiten / En las páginas / Nas páginas), **Sync** and **Advanced**, whose tabs include **Troubleshooting** (故障排除 / 疑難排解 / トラブルシューティング / 문제 해결 / Dépannage / Fehlerbehebung / Solución de problemas / Solução de problemas). The **Models** table names each feature by a short word (Chat, Helper, Smart bar, Translation, Images) using the terms above; its default is "Same model as the chat".

Settings that few people change sit under **Advanced** (高级 / 進階 / 詳細設定 / 고급 / Avancé / Erweitert / Avanzado / Avançado). A provider's **API style** (API 类型 / API 類型 / API の種類 / API 유형 / Type d’API / API-Art / Tipo de API / Tipo de API) keeps the API names Chat Completions and Responses untranslated.

The AI provider form's **thinking switch** chooses how the smart bar and page translation ask models to skip thinking: 思考开关 / 思考開關 / 思考スイッチ / 생각 스위치 / Interrupteur de réflexion / Denkschalter / Interruptor de pensamiento / Chave de pensamento. "Thinking" here is the same idea as the smart bar's "Thinking…" status. Its options keep the request field in parentheses untranslated (`enable_thinking`, `reasoning_effort`), and "Reasoning effort" uses the composer's term.

## Themes and holiday touches

The theme picker in General settings has two groups: the color themes and the pride flags. Flags are named the way each community names them in that language ("Transgender flag", not a color name). Holiday names are the day's usual greeting or name; their status lines follow the style of the regular typing phrases (short, ending in `…`).

| English         | 简体中文 | 繁體中文 | 日本語     | 한국어        |
| --------------- | -------- | -------- | ---------- | ------------- |
| Colors (group)  | 颜色     | 顏色     | カラー     | 색상          |
| Pride (group)   | 骄傲     | 驕傲     | プライド   | 프라이드      |
| … flag          | …旗      | …旗      | …フラッグ  | … 깃발        |
| holiday touches | 节日点缀 | 節日點綴 | 季節の演出 | 기념일 꾸미기 |

| English         | Français         | Deutsch         | Español         | Português (Brasil) |
| --------------- | ---------------- | --------------- | --------------- | ------------------ |
| Colors (group)  | Couleurs         | Farben          | Colores         | Cores              |
| Pride (group)   | Fiertés          | Pride           | Orgullo         | Orgulho            |
| … flag          | Drapeau …        | …-Flagge        | Bandera …       | Bandeira …         |
| holiday touches | touches festives | Festtagsdetails | toques festivos | toques festivos    |

## Smart bar dictionary entries

Translate on a word or short phrase shows a dictionary entry instead of a plain translation. The labels are the ones dictionaries in each language use; "In this context" marks the meaning that fits the page.

| English          | 简体中文   | 繁體中文   | 日本語         | 한국어      |
| ---------------- | ---------- | ---------- | -------------- | ----------- |
| dictionary entry | 词典释义   | 辭典釋義   | 辞書の項目     | 사전 항목   |
| pronunciation    | 发音       | 發音       | 発音           | 발음        |
| In this context  | 在此语境中 | 在此語境中 | この文脈では   | 이 문맥에서 |
| examples         | 例句       | 例句       | 例文           | 예문        |
| synonyms         | 同义词     | 同義詞     | 類義語         | 유의어      |
| collocations     | 常用搭配   | 常用搭配   | コロケーション | 연어        |

| English          | Français               | Deutsch           | Español                | Português (Brasil)    |
| ---------------- | ---------------------- | ----------------- | ---------------------- | --------------------- |
| dictionary entry | entrée de dictionnaire | Wörterbucheintrag | entrada de diccionario | verbete de dicionário |
| pronunciation    | prononciation          | Aussprache        | pronunciación          | pronúncia             |
| In this context  | Dans ce contexte       | In diesem Kontext | En este contexto       | Neste contexto        |
| examples         | exemples               | Beispiele         | ejemplos               | exemplos              |
| synonyms         | synonymes              | Synonyme          | sinónimos              | sinônimos             |
| collocations     | collocations           | Kollokationen     | colocaciones           | colocações            |

While a model thinks before it answers, the bar says so instead of "Writing…": Thinking… / 正在思考… / 正在思考… / 考え中… / 생각 중… / Réflexion… / Denkt nach… / Pensando… / Pensando…. This is the model's reasoning, the same idea run info calls "Reasoning"; the status line uses the everyday verb.

## Context menu and web search

The context menu is the browser's right-click menu; OpenBrowserAgent adds a submenu there. Its titles follow each platform's menu style: short imperative phrases, no final period. `%s` in a title is the selected text, quoted the way the language quotes (“%s” in Simplified Chinese, 「%s」 in Traditional Chinese and Japanese, „%s“ in German, « %s » in French, «%s» in Spanish). "Search the web" means the agent searches and answers with sources; the smart bar's button for it is "AI search". Text the user selected and hands to the side panel is the "selected text": it shows as a card above the composer and a chip on the sent message, named with the same words as in the menu titles.

| English               | 简体中文        | 繁體中文        | 日本語                | 한국어            |
| --------------------- | --------------- | --------------- | --------------------- | ----------------- |
| context menu          | 右键菜单        | 右鍵選單        | コンテキストメニュー  | 컨텍스트 메뉴     |
| search the web        | 联网搜索        | 聯網搜尋        | ウェブ検索            | 웹 검색           |
| AI search (smart bar) | AI搜索          | AI 搜尋         | AI 検索               | AI 검색           |
| linked page           | 链接页面        | 連結頁面        | リンク先のページ      | 링크된 페이지     |
| Copy as Markdown      | 复制为 Markdown | 複製為 Markdown | Markdown としてコピー | Markdown으로 복사 |
| selected text         | 所选文本        | 所選文字        | 選択したテキスト      | 선택한 텍스트     |

| English               | Français              | Deutsch               | Español              | Português (Brasil)   |
| --------------------- | --------------------- | --------------------- | -------------------- | -------------------- |
| context menu          | menu contextuel       | Kontextmenü           | menú contextual      | menu de contexto     |
| search the web        | rechercher sur le web | im Web suchen         | buscar en la web     | pesquisar na web     |
| AI search (smart bar) | Recherche IA          | KI-Suche              | Búsqueda con IA      | Pesquisa com IA      |
| linked page           | page liée             | verlinkte Seite       | página enlazada      | página do link       |
| Copy as Markdown      | Copier en Markdown    | Als Markdown kopieren | Copiar como Markdown | Copiar como Markdown |
| selected text         | texte sélectionné     | ausgewählter Text     | texto seleccionado   | texto selecionado    |

## Toolbar menu

The toolbar button opens a small menu with the active page's tools, "Translate into" and "Open side panel"; its keyboard command is "Open the menu". The tiles carry one or two words (Translate, Smart bar, Subtitles) and their tooltips the full action, using the same words as the right-click menu and Settings. Where the page isn't a web page (browser pages, the new tab page) the heading says so.

| English                     | 简体中文 | 繁體中文 | 日本語                     | 한국어               |
| --------------------------- | -------- | -------- | -------------------------- | -------------------- |
| menu (the toolbar button's) | 菜单     | 選單     | メニュー                   | 메뉴                 |
| Translate (tile)            | 翻译     | 翻譯     | 翻訳                       | 번역                 |
| Subtitles (tile)            | 字幕     | 字幕     | 字幕                       | 자막                 |
| Not a web page              | 不是网页 | 不是網頁 | ウェブページではありません | 웹 페이지가 아닙니다 |

| English                     | Français         | Deutsch        | Español              | Português (Brasil)      |
| --------------------------- | ---------------- | -------------- | -------------------- | ----------------------- |
| menu (the toolbar button's) | menu             | Menü           | menú                 | menu                    |
| Translate (tile)            | Traduire         | Übersetzen     | Traducir             | Traduzir                |
| Subtitles (tile)            | Sous-titres      | Untertitel     | Subtítulos           | Legendas                |
| Not a web page              | Pas une page web | Keine Webseite | No es una página web | Não é uma página da web |

## Provider permission

Before content the user shares in chats (messages, page text, screenshots, files) goes to an AI provider's endpoint, the user agrees once for that endpoint's host (`providerConsent`). The agreement sentence is written in the first person ("I agree that…") because it is the label of a checkbox the user ticks; the same sentence shows in the prompt before the first message, so both read the same. `{host}` is a host name such as api.openai.com and stays as is. "Permission" is the user's consent, never a browser permission. Endpoints on the device or the local network are "local endpoints" and need none.

| English              | 简体中文 | 繁體中文 | 日本語                   | 한국어          |
| -------------------- | -------- | -------- | ------------------------ | --------------- |
| permission (consent) | 许可     | 許可     | 許可                     | 허용            |
| Agree (button)       | 同意     | 同意     | 同意する                 | 동의            |
| Not now (button)     | 暂不     | 暫不     | 今はしない               | 나중에          |
| Withdraw permission  | 撤回许可 | 撤回許可 | 許可を取り消す           | 허용 철회       |
| local endpoint       | 本地端点 | 本機端點 | ローカルのエンドポイント | 로컬 엔드포인트 |

| English              | Français                   | Deutsch              | Español            | Português (Brasil) |
| -------------------- | -------------------------- | -------------------- | ------------------ | ------------------ |
| permission (consent) | autorisation               | Erlaubnis            | permiso            | permissão          |
| Agree (button)       | Accepter                   | Zustimmen            | Aceptar            | Concordar          |
| Not now (button)     | Pas maintenant             | Nicht jetzt          | Ahora no           | Agora não          |
| Withdraw permission  | Retirer l’autorisation     | Erlaubnis widerrufen | Retirar el permiso | Retirar permissão  |
| local endpoint       | point de terminaison local | lokaler Endpunkt     | endpoint local     | endpoint local     |

## Guided setup

Installing the extension opens the **setup**: one step per page with "Back" and "Next", and "Skip" while a step isn't done. After Language it asks "Have you used OpenBrowserAgent before?": "First time here" goes on to AI provider, On web pages and Done; "I use it on another device" goes to "Choose how to sync" (paste a sync code, browser account sync or WebDAV), the sync passphrase when the synced keys have one, "Connect and download" (what arrived, counted by kind) and the same Done. When sync can't connect or brings no AI provider, setup offers "Try again" or "Set up as a new user" (on to the AI provider step). Instructions name the real labels, such as the Sync page's "Copy sync code for another device". Step names reuse the settings' own words (the "On web pages" step is named like the settings page "On pages" in each language). A side panel that opened before setup was finished says "Continue setup", and General has "Run setup again". "Test connection" checks that the AI provider answers; its failures name the part that failed ("Couldn’t connect to the AI provider: …", "Connected, but {model} didn’t answer: …").

| English                    | 简体中文             | 繁體中文             | 日本語                     | 한국어                      |
| -------------------------- | -------------------- | -------------------- | -------------------------- | --------------------------- |
| setup                      | 设置向导             | 設定精靈             | セットアップ               | 설정                        |
| Continue setup             | 继续设置             | 繼續設定             | セットアップを続ける       | 설정 계속하기               |
| Run setup again            | 重新运行设置向导     | 重新執行設定精靈     | セットアップをもう一度実行 | 설정 다시 실행              |
| Skip (a step)              | 跳过                 | 略過                 | スキップ                   | 건너뛰기                    |
| Test connection            | 测试连接             | 測試連線             | 接続をテスト               | 연결 테스트                 |
| First time here            | 第一次使用           | 第一次使用           | 初めて使う                 | 처음 사용합니다             |
| I use it on another device | 我在另一台设备上使用 | 我在另一台裝置上使用 | 別のデバイスで使っている   | 다른 기기에서 사용 중입니다 |
| Set up as a new user       | 作为新用户设置       | 以新使用者身分設定   | 新しいユーザーとして設定   | 새 사용자로 설정            |

| English                    | Français                            | Deutsch                              | Español                            | Português (Brasil)              |
| -------------------------- | ----------------------------------- | ------------------------------------ | ---------------------------------- | ------------------------------- |
| setup                      | configuration                       | Einrichtung                          | configuración                      | configuração                    |
| Continue setup             | Continuer la configuration          | Einrichtung fortsetzen               | Continuar la configuración         | Continuar a configuração        |
| Run setup again            | Relancer la configuration           | Einrichtung erneut starten           | Volver a ejecutar la configuración | Executar a configuração de novo |
| Skip (a step)              | Passer                              | Überspringen                         | Omitir                             | Pular                           |
| Test connection            | Tester la connexion                 | Verbindung testen                    | Probar conexión                    | Testar conexão                  |
| First time here            | C’est ma première fois              | Zum ersten Mal hier                  | Es la primera vez                  | É a primeira vez                |
| I use it on another device | Je l’utilise sur un autre appareil  | Ich nutze es auf einem anderen Gerät | Lo uso en otro dispositivo         | Uso em outro dispositivo        |
| Set up as a new user       | Configurer comme nouvel utilisateur | Als neuer Nutzer einrichten          | Configurar como usuario nuevo      | Configurar como novo usuário    |

## Built-in skills and tool steps

Built-in skills show a translated name and a short description of what they do for the person (the instructions sent to the model stay in English). Tool steps in a chat show a one-line summary: act steps are counted per kind ("Typed in 2 fields, selected 2 options, clicked 1 element"), each kind a plural message, joined with the locale's list separator (`, `, Japanese `、`, Chinese `，`). Tab ids never appear in these lines.

The other tools start their line with one shared action word (`display.toolSteps.actions`: "Created", "Searched", "Reset emulation"), written the way the language reports a finished step: an English past tense, a German participle ("Erstellt"), a French, Spanish or Portuguese action noun ("Création", "Búsqueda", "Pesquisa") so no noun gender is assumed (a participle is fine when it agrees with a noun the label names: "Texte remplacé"; tab actions agree with the tab), Chinese 已…, Japanese …しました, Korean …했어요. Local command lines show the task state ("Running", "Finished"), and loaded tools show as a count ("2 tools"); raw action names and tool ids never appear. Find counts the snapshot lines that match and, in parentheses, the occurrences in them ("1 matching line (2 occurrences)", Chinese "1 行匹配（2 处）"); a match is never a line and an occurrence at once. A failed step shows only "Failed" (`display.toolSteps.failed`); its error text is written for the model and stays in the step's details. A runCode step ("Ran code") shows how long the code ran and how many workspace files it saved ("120 ms · 2 files saved"). "Code" is what the agent writes and runs in its own sandbox; it is not a page "script" (runScript, which runs in the web page): Chinese 代码 vs 脚本, Traditional Chinese 程式碼 vs 指令碼.

A question the assistant asks (the ask step) is "Asking a question" while it waits, "Answered question" once answered, and "Question not answered" (`sidepanel.questionUnanswered`: 问题未回答 / 問題未回答 / 未回答の質問 / 답변하지 않은 질문) when the user wrote a message instead or the response ended first; each of its questions then shows "No answer".

## Errors and default names

A response that ended early shows one line under it: cut off at the model's **output limit**, "Stopped" (the user pressed Stop; the adjective agrees with the response: _Arrêtée_, _Detenida_, _Interrompida_), or the error it ended with. A response is 回复 / 回覆 / 応答 / 응답 / réponse / Antwort / respuesta / resposta, as in the queued-message text. The Continue button sends a short message asking the model to go on from where the response stopped.

An error the user sees starts with what failed in the UI language, then the reason (`common.errorDetail`: "Couldn’t load models: HTTP 401"; French puts a space before the colon, Chinese and Japanese use the full-width `：`). Reasons the extension knows are translated (`display.errors`); a server's or the browser's own text is shown as it came. Default names stored in English when something is created (a provider's type such as "OpenAI-compatible"; every type that names another company's API reads "…-compatible": OpenAI, OpenAI Responses, Anthropic, Gemini, Ollama; older default names without it show the same way, a bridge saved without a name, a recommended MCP server's description) show in the UI language while they are unchanged; a name the user typed shows as typed, and stored data is never rewritten.

## Downloads

The agent's downloads tool saves files to the browser's own Downloads folder. Step lines name the browser's places the way the browser does: the list of downloads it keeps (where the user keeps a flagged file) and the Save dialog it opens when it asks where to save. "Saved" means the file is on disk; a download the browser holds back is "kept" by the user, using the word the browser's own button uses.

A downloads step's title says what happened, not the tool's name: "Downloaded", "Saved", "Download failed", "Downloading", "Download paused", "Waiting for you" (the Save dialog is open or the browser holds a flagged file), "Canceled", "Listed downloads", "No download started"; while it runs, what it is doing ("Saving", "Waiting for a download"). Titles follow the language's tool titles (Chinese 已下载 / 正在下载, Japanese …しました / …中, Korean …됨 / … 중); French, Spanish and Portuguese name the download so no participle needs a gender ("Téléchargement terminé", "Descarga completada", "Download concluído"). The line under it carries only the file and the facts (name, size, progress, reason), since the title already has the verb. A failed download is styled like any failed step.

| English                      | 简体中文         | 繁體中文           | 日本語                         | 한국어                   |
| ---------------------------- | ---------------- | ------------------ | ------------------------------ | ------------------------ |
| download (noun)              | 下载             | 下載               | ダウンロード                   | 다운로드                 |
| Downloads folder             | 下载文件夹       | 下載資料夾         | ダウンロード フォルダー        | 다운로드 폴더            |
| the browser's downloads list | 浏览器的下载列表 | 瀏覽器的下載清單   | ブラウザーのダウンロード一覧   | 브라우저의 다운로드 목록 |
| Save dialog                  | “另存为”对话框   | 「另存新檔」對話框 | 「名前を付けて保存」ダイアログ | 저장 대화상자            |
| keep (a flagged file)        | 保留             | 保留               | 保存                           | 유지                     |
| show in folder               | 在文件夹中显示   | 在資料夾中顯示     | フォルダーに表示               | 폴더에서 보기            |

| English                      | Français                                | Deutsch                    | Español                          | Português (Brasil)              |
| ---------------------------- | --------------------------------------- | -------------------------- | -------------------------------- | ------------------------------- |
| download (noun)              | téléchargement                          | Download                   | descarga                         | download                        |
| Downloads folder             | dossier Téléchargements                 | Downloadordner             | carpeta Descargas                | pasta Downloads                 |
| the browser's downloads list | liste des téléchargements du navigateur | Downloadliste des Browsers | lista de descargas del navegador | lista de downloads do navegador |
| Save dialog                  | boîte de dialogue d’enregistrement      | Speichern-Dialog           | cuadro de diálogo Guardar        | caixa de diálogo Salvar         |
| keep (a flagged file)        | conserver                               | behalten                   | conservar                        | manter                          |
| show in folder               | afficher dans le dossier                | im Ordner anzeigen         | mostrar en la carpeta            | mostrar na pasta                |

## Page translation

"Translate this page" in the context menu translates the whole page; the same item then reads "Show original". Its strings live in `src/shared/locales/page-translate/`. A translation **engine** is where translations come from (the AI model, the browser's built-in translator, or a free web service); it is not a "provider", which stays the AI model provider. The display is either "Original and translation" (each paragraph keeps its original with the translation under it) or "Translation only" (the page's text is replaced by its translation in place). By default the page's **main content** is translated, and in the page's own chrome (navigation, menus, buttons, tabs, dialogs, its header and footer) only what reads as content: headings, sentences, questions. "Also translate menus and buttons" adds the chrome's **short labels** (Chinese 简短标签 / 簡短標籤). "Menus and buttons" means the web page's, never the extension's or the browser's; avoid "sidebar" there (in Chinese and German it reads as the extension's side panel). Google Translate and Microsoft Translator keep their product names in each language's usual form; "(free)" marks the unofficial free services. When an engine can't translate a page and its fallback takes over (one free service for the other, the AI model for the built-in translator), the page's note says the switch is for this page only, names the free services by company alone ("Google", "Microsoft") and the others by their in-sentence names (`engineNames`: "the AI model", "the built-in translator"). Notes put those names where the language needs no other form of them (no sentence start, no contraction or case change): "Switched to Microsoft for this page: Google is limiting requests." The engine's default model is "the same model as the chat" (Chinese 与对话相同的模型), not "the chat's selected model".

The **translate button** sits on an edge of web pages (the edge of the window, never "sidebar"); its close control offers "Hide on {site}" and "Hide everywhere", and Settings lists the sites it is hidden on. The **keyboard shortcut** is the browser's extension shortcut for the same toggle (the smart bar's shortcut-only mode shows the same "Shortcut: …" / "No shortcut set" line and "Change shortcut" button); the browser names the place to change it, so Firefox's hint quotes Firefox's own menu label ("Manage Extension Shortcuts").

**Translate into** is the one target language: pages, video subtitles and the smart bar's Translate and dictionary entries all use it. Its default is the extension's language; descriptions name the features that use it rather than calling it a page setting.

The **toolbar button**'s own right-click menu and the side panel's **"This page"** strip hold the same per-page switches (strings in `src/shared/locales/page-tools/`): translate the page, "Translate into: {language}", "Translate button on this site", "Smart bar on this site" and, on a page with a video, "Translated subtitles for this video". Switch labels name the thing that is on or off, not an action; "this site" is the page's host. Together they are the **page tools** (Chinese 页面工具 / 頁面工具, Japanese ページツール, Korean 페이지 도구, French outils de la page, German Seitenwerkzeuge, Spanish herramientas de la página, Portuguese ferramentas da página).

**Subtitles** are a video's lines, whatever the player calls them (captions, CC); the extension shows each line with its translation under it. "Translate subtitles" is the item in a video's context menu that turns them on for that one video, and it reads "Hide translated subtitles" while the tab's video shows them; "Translate video subtitles" is the setting that translates them by themselves on every video. The video's own subtitle control is the player's "captions", so notes that tell people to use it say "captions in the player".

| English                             | 简体中文                            | 繁體中文                            | 日本語                                   | 한국어                                     |
| ----------------------------------- | ----------------------------------- | ----------------------------------- | ---------------------------------------- | ------------------------------------------ |
| page translation                    | 网页翻译                            | 網頁翻譯                            | ページ翻訳                               | 페이지 번역                                |
| Translate this page                 | 翻译此页面                          | 翻譯此頁面                          | このページを翻訳                         | 이 페이지 번역                             |
| Show original                       | 显示原文                            | 顯示原文                            | 原文を表示                               | 원문 보기                                  |
| translation engine                  | 翻译引擎                            | 翻譯引擎                            | 翻訳エンジン                             | 번역 엔진                                  |
| built-in translator                 | 内置翻译器                          | 內建翻譯器                          | 組み込み翻訳                             | 내장 번역기                                |
| Original and translation            | 原文和译文                          | 原文和譯文                          | 原文と訳文                               | 원문과 번역                                |
| Translation only                    | 仅译文                              | 僅譯文                              | 訳文のみ                                 | 번역만                                     |
| saved translations                  | 已保存的译文                        | 已儲存的譯文                        | 保存された翻訳                           | 저장된 번역                                |
| main content (of a page)            | 正文                                | 正文                                | 本文                                     | 본문                                       |
| Also translate menus and buttons    | 同时翻译菜单和按钮                  | 同時翻譯選單和按鈕                  | メニューとボタンも翻訳                   | 메뉴와 버튼도 번역                         |
| translate button (on pages)         | 翻译按钮                            | 翻譯按鈕                            | 翻訳ボタン                               | 번역 버튼                                  |
| edge (of the page/window)           | 边缘                                | 邊緣                                | 端                                       | 가장자리                                   |
| Hide on {site} / Hide everywhere    | 在 {site} 上隐藏 / 在所有网站上隐藏 | 在 {site} 上隱藏 / 在所有網站上隱藏 | {site} で非表示 / すべてのサイトで非表示 | {site}에서 숨기기 / 모든 사이트에서 숨기기 |
| keyboard shortcut                   | 键盘快捷键                          | 鍵盤快速鍵                          | キーボードショートカット                 | 키보드 단축키                              |
| subtitles                           | 字幕                                | 字幕                                | 字幕                                     | 자막                                       |
| video                               | 视频                                | 影片                                | 動画                                     | 동영상                                     |
| Translate subtitles (menu)          | 翻译字幕                            | 翻譯字幕                            | 字幕を翻訳                               | 자막 번역                                  |
| Translate video subtitles (setting) | 翻译视频字幕                        | 翻譯影片字幕                        | 動画の字幕を翻訳                         | 동영상 자막 번역                           |

| English                             | Français                                | Deutsch                                    | Español                                     | Português (Brasil)                            |
| ----------------------------------- | --------------------------------------- | ------------------------------------------ | ------------------------------------------- | --------------------------------------------- |
| page translation                    | traduction de page                      | Seitenübersetzung                          | traducción de páginas                       | tradução de páginas                           |
| Translate this page                 | Traduire cette page                     | Diese Seite übersetzen                     | Traducir esta página                        | Traduzir esta página                          |
| Show original                       | Afficher l’original                     | Original anzeigen                          | Mostrar original                            | Mostrar original                              |
| translation engine                  | moteur de traduction                    | Übersetzungsdienst                         | motor de traducción                         | mecanismo de tradução                         |
| built-in translator                 | traducteur intégré                      | integrierter Übersetzer                    | traductor integrado                         | tradutor integrado                            |
| Original and translation            | Original et traduction                  | Original und Übersetzung                   | Original y traducción                       | Original e tradução                           |
| Translation only                    | Traduction seule                        | Nur Übersetzung                            | Solo traducción                             | Somente tradução                              |
| saved translations                  | traductions enregistrées                | gespeicherte Übersetzungen                 | traducciones guardadas                      | traduções salvas                              |
| main content (of a page)            | contenu principal                       | Hauptinhalt                                | contenido principal                         | conteúdo principal                            |
| Also translate menus and buttons    | Traduire aussi les menus et les boutons | Auch Menüs und Schaltflächen übersetzen    | Traducir también menús y botones            | Traduzir também menus e botões                |
| translate button (on pages)         | bouton de traduction                    | Übersetzen-Schaltfläche                    | botón de traducir                           | botão de tradução                             |
| edge (of the page/window)           | bord                                    | Rand                                       | borde                                       | borda                                         |
| Hide on {site} / Hide everywhere    | Masquer sur {site} / Masquer partout    | Auf {site} ausblenden / Überall ausblenden | Ocultar en {site} / Ocultar en todas partes | Ocultar em {site} / Ocultar em todos os sites |
| keyboard shortcut                   | raccourci clavier                       | Tastenkombination                          | atajo de teclado                            | atalho de teclado                             |
| subtitles                           | sous-titres                             | Untertitel                                 | subtítulos                                  | legendas                                      |
| video                               | vidéo                                   | Video                                      | vídeo                                       | vídeo                                         |
| Translate subtitles (menu)          | Traduire les sous-titres                | Untertitel übersetzen                      | Traducir subtítulos                         | Traduzir legendas                             |
| Translate video subtitles (setting) | Traduire les sous-titres des vidéos     | Video-Untertitel übersetzen                | Traducir subtítulos de vídeos               | Traduzir legendas de vídeos                   |

## Notes per language

**Simplified Chinese.** Use 对话, never 聊天. A single bridge is a 执行桥; avoid 桥接器 and 桥接. Write 内置, not 内建. API Key and Base URL stay in English, as Chinese developer tools usually show them; Traditional Chinese does the same.

**Traditional Chinese.** Write for Taiwan, in Traditional characters only: 金鑰 for other keys and secrets (not 密鑰), 位址 (not 地址), 設定碼 (not 配置碼), 壓縮檔 (not 壓縮包), 本機 (not 本地), 產生 for generating images, 指令碼 for scripts, 點選 for clicking, 儲存 for saving, 連線 for connecting. Use 智慧體 throughout, never 代理.

**Japanese.** Sentences use です／ます; buttons use short noun or verb forms. Write ブラウザー with the long mark. Put a half-width space between Latin words or numbers and Japanese text, except before counters such as `{count}件`. Use 既定 for "default" and デバイス for "device".

**Korean.** Sentences end in the polite -요 or -ㅂ니다 forms; buttons stay short. Use 구성 for "configure", 활성화 for "enable", 사용자 지정 for "custom", and 제거 for removing something from a list (삭제 is for deleting it for good).

**French.** Address people as _vous_. Use the typographic apostrophe ’ and a regular space before `: ; ? !`, as the rest of the file does. "Prompt" stays as _prompt_; _Instructions_ is the label for an agent's own instructions.

**German.** Always _Sie_, never _du_. The Ask agent is _Fragen stellen_, so it does not read as the noun "questions"; the act tool step is _Mit der Seite interagiert_. Skill and Tool stay in English, matching the English UI and the SKILL.md file. Compounds take a hyphen when one part is English or an acronym (MCP-Server, Smart-Bar-Modell, Sync-Backend).

**Spanish.** Spain Spanish with _tú_. Use _añadir_ (not _agregar_), _eliminar_ for delete, _quitar_ for removing an item from a message or list, and the present perfect for things that just happened (_ha fallado_). A zip archive is a _paquete_, so it is not confused with _archivo_ (file).

**Brazilian Portuguese.** Address people as _você_. The chat is always a _conversa_; do not mix in _chat_. A zip archive is a _pacote_.
