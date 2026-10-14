import { plural } from "../../plural";
import type { DisplayMessages } from "./en-US";

export const displayJaJP: DisplayMessages = {
  counts: {
    models: plural({ other: "{count}個のモデル" }),
    files: plural({ other: "{count}個のファイル" }),
    characters: plural({ other: "{count}文字" }),
  },
  providerTypes: {
    openai: "OpenAI 互換",
    "openai-responses": "OpenAI Responses",
    anthropic: "Anthropic 互換",
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
  toolSteps: {
    page: "ページ",
    tabs: plural({ other: "{count}個のタブ" }),
    lines: plural({ other: "{count}行" }),
    matches: plural({ other: "{count}件一致" }),
    results: plural({ other: "{count}件の結果" }),
    items: plural({ other: "{count}件" }),
    editsApplied: plural({ other: "{count}件中{applied}件の編集を適用" }),
    tabActions: {
      open: "開きました",
      switch: "切り替えました",
      close: "閉じました",
      navigate: "移動しました",
      back: "戻りました",
      forward: "進みました",
      reload: "再読み込みしました",
      group: "グループ化しました",
      ungroup: "グループを解除しました",
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
