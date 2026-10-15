import { plural } from "../../plural";
import type { DisplayMessages } from "./en-US";

export const displayJaJP: DisplayMessages = {
  counts: {
    models: plural({ other: "{count}個のモデル" }),
    files: plural({ other: "{count}個のファイル" }),
    characters: plural({ other: "{count}文字" }),
  },
  providerTypes: {
    openai: "OpenAI（または互換）",
    "openai-responses": "OpenAI（Responses API）",
    anthropic: "Anthropic（または互換）",
    gemini: "Google Gemini",
    ollama: "Ollama（ローカル）",
  },
  mcpServerPresets: {
    exa: "ウェブ検索とページ内容の抽出。",
    parallel: "抜粋付きのウェブ検索とページの取得。",
    tinyfish: "ウェブとニュースの検索。",
    firecrawl:
      "ウェブ検索、ページのスクレイピング、ドキュメントの解析。無料のリクエスト上限は低めです。",
  },
  builtinSkills: {
    "fill-form": {
      name: "フォーム入力",
      description:
        "指定された情報やファイルからウェブフォームに入力し、すべての欄を確認します。送信は指示があったときだけ行います。",
    },
    "tidy-tabs": {
      name: "タブの整理",
      description:
        "重複したタブを閉じ、関連するタブをグループにまとめ、不要になったタブを見つけます。",
    },
    "openbrowseragent-help": {
      name: "OpenBrowserAgent ヘルプ",
      description: "OpenBrowserAgent の使い方や設定についての質問に答えます。",
    },
    "skill-creator": {
      name: "スキル作成",
      description:
        "スキルを作成、保存、改善します。たとえば、今行った作業をスキルとして保存できます。",
    },
    "local-execution-bridge-setup": {
      name: "ローカル実行ブリッジの設定",
      description:
        "ローカル実行ブリッジを設定、テスト、更新、削除し、エージェントがこのコンピューターでコマンドを実行できるようにします。",
    },
  },
  errors: {
    noModel:
      "モデルが設定されていません。「設定」→「AI プロバイダー」でプロバイダーを追加してください。",
    noImageModel:
      "画像モデルが設定されていません。「設定」→「AI プロバイダー」で選んでください。",
    baseUrlRequired: "ベース URL を入力してください。",
    bridgeNotFound: "この実行ブリッジはもうありません。",
    bridgeHostRequired: "ネイティブメッセージングホスト名を入力してください。",
    bridgeTimeout: "実行ブリッジから時間内に応答がありませんでした。",
    syncKeysLocked:
      "API キーは同期されていますが、ロックされています。「設定 → 同期」で同期パスフレーズを入力してください。",
  },
  toolSteps: {
    failed: "失敗",
    page: "ページ",
    tabs: plural({ other: "{count}個のタブ" }),
    lines: plural({ other: "{count}行" }),
    matchingLines: plural({ other: "{count}行が一致" }),
    matchingLinesWithOccurrences: plural({
      other: "{count}行が一致（{occurrences}）",
    }),
    occurrences: plural({ other: "{count}箇所" }),
    results: plural({ other: "{count}件の結果" }),
    items: plural({ other: "{count}件" }),
    tools: plural({ other: "{count}個のツール" }),
    filesSaved: plural({ other: "{count}件のファイルを保存" }),
    editsApplied: plural({ other: "{count}件中{applied}件の編集を適用" }),
    actions: {
      open: "開きました",
      switch: "切り替えました",
      close: "閉じました",
      navigate: "移動しました",
      back: "戻りました",
      forward: "進みました",
      reload: "再読み込みしました",
      group: "グループ化しました",
      ungroup: "グループを解除しました",
      list: "一覧を取得しました",
      search: "検索しました",
      read: "読み込みました",
      write: "書き込みました",
      append: "追記しました",
      replace: "テキストを置換しました",
      delete: "削除しました",
      create: "作成しました",
      patch: "編集しました",
      add: "追加しました",
      update: "更新しました",
      test: "テストしました",
      status: "状態を確認しました",
      resources: "ネットワークリソースを一覧表示しました",
      emulate: "デバイスをエミュレートしました",
      reset: "エミュレーションをリセットしました",
      download: "ダウンロードしました",
      save: "保存しました",
      wait: "ダウンロードを待ちました",
      retry: "再試行しました",
      images: "画像を保存しました",
      run: "実行しました",
      start: "開始しました",
      cancel: "キャンセルしました",
    },
    commandStates: {
      running: "実行中",
      done: "完了",
      error: "失敗",
      canceled: "キャンセル済み",
      missing: "タスクが見つかりません",
    },
    actStepSeparator: "、",
    actSteps: {
      click: plural({ other: "{count}個の要素をクリック" }),
      type: plural({ other: "{count}個の欄に入力" }),
      press: plural({ other: "{count}個のキーを押下" }),
      select: plural({ other: "{count}個の項目を選択" }),
      hover: plural({ other: "{count}個の要素にポインターを移動" }),
      scroll: plural({ other: "{count}回スクロール" }),
      wait: plural({ other: "{count}回待機" }),
      drag: plural({ other: "{count}個の要素をドラッグ" }),
      dialog: plural({ other: "{count}個のダイアログに応答" }),
      other: plural({ other: "ほかに{count}個の手順を実行" }),
    },
  },
};
