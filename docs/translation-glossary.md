# Translation Glossary

OpenBrowserAgent ships its interface in nine languages. This page records the words each language uses for the product's main ideas, so that new strings match what is already there. If you add or change a user-facing string, check this page first; if you introduce a new concept, add it here in the same change.

Strings live in `src/shared/locales/` (the main UI), `src/shared/locales/smart-bar/` (the smart bar) and `public/_locales/` (the extension name, description and shortcut). English (`en-US`) is the source; every other language must have every key.

## General rules

- **One idea, one word.** If the chat is a _conversa_ in one place, it is a _conversa_ everywhere, including tool status lines, settings descriptions and error messages.
- **Name controls by their real label.** When text tells people to press a button or open a page, use that button's or page's exact label. In Chinese, quote it with “” (Simplified) or 「」 (Traditional); in German with „“.
- **Say where things happen.** A button that opens the side panel says so ("Ask in side panel", "Continue in side panel").
- **Agents, not "the assistant".** Settings text that talks about the AI acting in the browser calls it the agent. "AI" is fine in marketing text such as the extension description, and "assistant" stays where it means the assistant's messages in a chat (as in the debug logging option).
- **Keep placeholders.** `{count}`, `{name}`, `{max}` and the like stay exactly as they are.
- **Use the ellipsis character** `…`, never three dots.
- **Leave these untranslated:** OpenBrowserAgent, MCP, Streamable HTTP, JSON, OpenAI, WebDAV, SKILL.md, agent.json, example.com, and the `RESET` confirmation word (the code compares what people type against it).
- **English titles and buttons use sentence case** ("Chat history", not "Chat History").

## Core terms

| English                        | 简体中文    | 繁體中文    | 日本語               | 한국어           |
| ------------------------------ | ----------- | ----------- | -------------------- | ---------------- |
| chat                           | 对话        | 對話        | チャット             | 채팅             |
| chat history                   | 对话历史    | 對話紀錄    | チャット履歴         | 채팅 기록        |
| agent                          | 智能体      | 智慧體      | エージェント         | 에이전트         |
| sub-agent                      | 子智能体    | 子智慧體    | サブエージェント     | 하위 에이전트    |
| Browse / Ask (built-in agents) | 浏览 / 询问 | 瀏覽 / 詢問 | ブラウズ / 質問      | 탐색 / 질문      |
| side panel                     | 侧边栏      | 側邊欄      | サイドパネル         | 사이드 패널      |
| smart bar                      | 智能工具栏  | 智慧工具列  | スマートバー         | 스마트 바        |
| model                          | 模型        | 模型        | モデル               | 모델             |
| helper model                   | 辅助模型    | 輔助模型    | 補助モデル           | 보조 모델        |
| provider                       | 提供商      | 提供者      | プロバイダー         | 제공업체         |
| API key                        | API Key     | API Key     | API キー             | API 키           |
| base URL                       | Base URL    | Base URL    | ベース URL           | Base URL         |
| skill                          | 技能        | 技能        | スキル               | 스킬             |
| tool                           | 工具        | 工具        | ツール               | 도구             |
| MCP server                     | MCP 服务器  | MCP 伺服器  | MCP サーバー         | MCP 서버         |
| local execution bridge         | 本地执行桥  | 本機執行橋  | ローカル実行ブリッジ | 로컬 실행 브리지 |
| workspace                      | 工作区      | 工作區      | ワークスペース       | 워크스페이스     |
| memory                         | 记忆        | 記憶        | メモリ               | 메모리           |
| sync                           | 同步        | 同步        | 同期                 | 동기화           |
| attachment                     | 附件        | 附件        | 添付ファイル         | 첨부 파일        |
| screenshot                     | 截图        | 截圖        | スクリーンショット   | 스크린샷         |
| fork (a chat)                  | 分叉        | 分叉        | 分岐                 | 분기             |
| built-in                       | 内置        | 內建        | 組み込み             | 내장             |

| English                        | Français                   | Deutsch                   | Español                   | Português (Brasil)      |
| ------------------------------ | -------------------------- | ------------------------- | ------------------------- | ----------------------- |
| chat                           | discussion                 | Chat                      | chat                      | conversa                |
| chat history                   | historique des discussions | Chatverlauf               | historial de chats        | histórico de conversas  |
| agent                          | agent                      | Agent                     | agente                    | agente                  |
| sub-agent                      | sous-agent                 | Subagent                  | subagente                 | subagente               |
| Browse / Ask (built-in agents) | Naviguer / Demander        | Browsen / Fragen          | Navegar / Preguntar       | Navegar / Perguntar     |
| side panel                     | panneau latéral            | Seitenleiste              | panel lateral             | painel lateral          |
| smart bar                      | barre intelligente         | Smart Bar                 | barra inteligente         | barra inteligente       |
| model                          | modèle                     | Modell                    | modelo                    | modelo                  |
| helper model                   | modèle auxiliaire          | Hilfsmodell               | modelo auxiliar           | modelo auxiliar         |
| provider                       | fournisseur                | Anbieter                  | proveedor                 | provedor                |
| API key                        | clé API                    | API-Schlüssel             | clave API                 | chave de API            |
| base URL                       | URL de base                | Basis-URL                 | URL base                  | URL base                |
| skill                          | compétence                 | Skill                     | habilidad                 | habilidade              |
| tool                           | outil                      | Tool                      | herramienta               | ferramenta              |
| MCP server                     | serveur MCP                | MCP-Server                | servidor MCP              | servidor MCP            |
| local execution bridge         | pont d’exécution local     | lokale Ausführungs-Bridge | puente de ejecución local | ponte de execução local |
| workspace                      | espace de travail          | Arbeitsbereich            | espacio de trabajo        | espaço de trabalho      |
| memory                         | mémoire                    | Gedächtnis                | memoria                   | memória                 |
| sync                           | synchronisation            | Synchronisierung          | sincronización            | sincronização           |
| attachment                     | pièce jointe               | Anhang                    | adjunto                   | anexo                   |
| screenshot                     | capture d’écran            | Screenshot                | captura de pantalla       | captura de tela         |
| fork (a chat)                  | créer une branche          | verzweigen                | bifurcar                  | ramificar               |
| built-in                       | intégré                    | integriert                | integrado                 | integrado               |

## Notes per language

**Simplified Chinese.** Use 对话, never 聊天. A single bridge is a 执行桥; avoid 桥接器 and 桥接. Write 内置, not 内建. API Key and Base URL stay in English, as Chinese developer tools usually show them; Traditional Chinese does the same.

**Traditional Chinese.** Write for Taiwan, in Traditional characters only: 金鑰 for other keys and secrets (not 密鑰), 位址 (not 地址), 設定碼 (not 配置碼), 壓縮檔 (not 壓縮包), 本機 (not 本地), 產生 for generating images, 指令碼 for scripts, 點選 for clicking, 儲存 for saving, 連線 for connecting. Use 智慧體 throughout, never 代理.

**Japanese.** Sentences use です／ます; buttons use short noun or verb forms. Write ブラウザー with the long mark. Put a half-width space between Latin words or numbers and Japanese text, except before counters such as `{count}件`. Use 既定 for "default" and デバイス for "device".

**Korean.** Sentences end in the polite -요 or -ㅂ니다 forms; buttons stay short. Use 구성 for "configure", 활성화 for "enable", 사용자 지정 for "custom", and 제거 for removing something from a list (삭제 is for deleting it for good).

**French.** Address people as _vous_. Use the typographic apostrophe ’ and a regular space before `: ; ? !`, as the rest of the file does. "Prompt" stays as _prompt_; _Instructions_ is the label for an agent's own instructions.

**German.** Always _Sie_, never _du_. Skill and Tool stay in English, matching the English UI and the SKILL.md file. Compounds take a hyphen when one part is English or an acronym (MCP-Server, Smart-Bar-Modell, Sync-Backend).

**Spanish.** Spain Spanish with _tú_. Use _añadir_ (not _agregar_), _eliminar_ for delete, _quitar_ for removing an item from a message or list, and the present perfect for things that just happened (_ha fallado_). A zip archive is a _paquete_, so it is not confused with _archivo_ (file).

**Brazilian Portuguese.** Address people as _você_. The chat is always a _conversa_; do not mix in _chat_. A zip archive is a _pacote_.
