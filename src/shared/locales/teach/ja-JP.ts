import { plural } from "../../plural";
import type { TeachLocaleMessages } from "./en-US";

export const teachJaJP: TeachLocaleMessages = {
  menu: {
    title: "スキルを記録",
    hint: "タスクを一度やって見せる",
  },
  pill: {
    recording: "記録中",
    stop: "停止",
    stopHint: "記録を停止してスキルを作成",
  },
  start: {
    title: "スキルを記録",
    description:
      "このページでタスクを自分で行い、「停止」を押してください。記録がスキルになります。",
    purpose: "何のためのものですか？（任意）",
    purposePlaceholder: "週次の勤務表を提出する",
    varies: "毎回変わるものは？（任意）",
    variesPlaceholder: "週とプロジェクト",
    privacy:
      "入力した内容は記録されず、どの欄を使ったかだけが記録されます。パスワードやコードは記録されません。",
    start: "記録を開始",
    unscriptable:
      "このページは記録できません。タスクを始めるページを開いてください。",
    busy: "別の記録が開いています。新しく始める前に保存するか破棄してください。",
    showRecording: "記録を表示",
  },
  recording: {
    title: "記録中",
    steps: plural({ other: "{count}ステップ" }),
    empty: "ページでタスクを行ってください。各ステップがここに表示されます。",
    long: "記録が長いとスキルの質が下がります。タスクが終わったら停止してください。",
    full: "記録がいっぱいです。以降のステップは記録されません。",
    unrecorded: plural({
      other:
        "ページ上の{count}件の操作を記録できませんでした。ステップに漏れがないか確認してください。",
    }),
    frames: plural({
      other: "{count}個の埋め込みフレーム内のステップは記録されませんでした。",
    }),
    stop: "停止",
    discard: "破棄",
    deleteStep: "ステップを削除",
    varies: "毎回変わる",
    keepExample: "入力した内容を例として残す",
    dropExample: "例を残さない",
    exampleKept: "例を残しました",
    exampleGone: "ページにこの値がもうありません。",
    secret: "機密 — 保存されません",
  },
  step: {
    click: "{target}をクリック",
    field: "{target}に入力",
    fieldSubmitted: "{target}に入力して Enter",
    choose: "{target}で{choice}を選択",
    chooseSecret: "{target}で選択肢を選ぶ",
    check: "{target}をオン",
    uncheck: "{target}をオフ",
    key: "{key} を押す",
    navigate: "{url} に移動",
    openTab: "新しいタブ：{url}",
    switchTab: "{site} に切り替え",
    page: "ページ",
  },
  ended: {
    title: "記録を終了しました",
    tabClosed:
      "タブが閉じられました。まだ何も送信していません。これらのステップからスキルを書くか、破棄してください。",
    idle: "しばらく操作がありませんでした。まだ何も送信していません。これらのステップからスキルを書くか、破棄してください。",
    consent:
      "ページ上で停止しました。スキルを書くと、これらのステップがモデルに送信されます。",
    write: "スキルを書く",
  },
  writing: {
    title: "スキルを作成中…",
    description: "モデルが記録したステップを手順書にしています。",
  },
  failed: {
    title: "スキルを作成できませんでした",
    retry: "再試行",
  },
  save: {
    title: "スキルを保存",
    name: "名前",
    description: "説明",
    instructions: "エージェントが従う手順",
    stored:
      "スキルとしてステップ（どのページのどの要素か）と一緒に保存されます。入力した内容は保存されません。他のスキルと同じように同期されます。",
    check: "保存して確認",
    checkHint: "新しいタブでスキルを一度実行し、最後のステップの前に確認します",
    draft: "スキップして下書きとして保存",
  },
  check: {
    message: "記録したスキル {name} を確認",
    passed: "確認に成功しました：{name} は確認済みです。",
    auto: "エージェントに自動で使わせる",
    autoOn: "リクエストに合うとき、エージェントが {name} を使います。",
    diverged: "ステップ {step} で動作が異なりました。",
    divergedNoStep: "確認中に動作が異なりました。",
    fix: "ステップを修正",
    fixMessage: "この確認をもとに {name} のステップを修正",
    recordAgain: "ここから記録し直す",
    keepDraft: "下書きとして保存",
    done: "完了",
    submit: "送信する",
    dontSubmit: "送信しない",
  },
  status: {
    recorded: "記録",
    draft: "下書き",
    verified: "確認済み",
  },
  skillsHint:
    "スキルを記録するには、タスクを始めるページでサイドパネルを開き、「+」→「スキルを記録」を選びます。",
  tool: {
    skillCheck: { running: "確認結果を報告中", done: "確認結果を報告しました" },
  },
};
