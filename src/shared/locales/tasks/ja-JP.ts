import { plural } from "../../plural";
import type { TasksLocaleMessages } from "./en-US";

export const tasksJaJP: TasksLocaleMessages = {
  title: "タスク",
  untitled: "無題のタスク",
  count: plural({ other: "{count}件のタスク" }),
  newTask: "新しいタスク",
  editTask: "タスクを編集",
  makeTask: "タスクにする",
  empty: "タスクはまだありません",
  emptyHint:
    "あとで、スケジュールに沿って、またはページが変わったときにエージェントに作業させます。",
  kinds: {
    once: "1回",
    interval: "繰り返し",
    daily: "毎日",
    weekly: "毎週",
    watch: "ページを監視",
  },
  units: {
    minutes: plural({ other: "{count}分" }),
    hours: plural({ other: "{count}時間" }),
    days: plural({ other: "{count}日" }),
  },
  unitNames: {
    minutes: "分",
    hours: "時間",
    days: "日",
  },
  form: {
    title: "タイトル",
    prompt: "やること",
    promptPlaceholder: "このページのニュースを確認して新しい内容を要約する",
    watchPrompt: "条件と報告する内容",
    watchPromptPlaceholder: "価格が 50 を下回ったら知らせる",
    kind: "タイミング",
    at: "日時",
    every: "間隔",
    unit: "単位",
    time: "時刻",
    days: "曜日",
    url: "ページのアドレス",
    part: "ページの範囲",
    partPage: "メインコンテンツ",
    partElement: "選択した要素",
    pickElement: "ページで選択",
    checkEvery: "確認の間隔（分）",
    watchHint:
      "毎回の確認ではモデルを使わずにページを読み、監視するテキストが変わったときだけエージェントを実行します。",
    agent: "エージェント",
    mayAct:
      "このエージェントは自律操作できます。実行時にクリック、入力、変更を行うツールを使えます。",
    looksOnly:
      "実行時は見るだけです。読み取り、検索、報告のみで、クリック、入力、変更は行いません。",
    device: "実行するデバイス",
    thisDevice: "{name}（このデバイス）",
    save: "タスクを保存",
    invalidPrompt: "タスクでやることを入力してください。",
    invalidUrl: "http または https のアドレスを入力してください。",
    invalidAt: "日時を選んでください。",
  },
  schedule: {
    once: "1回、{time}",
    every: "{amount}ごと",
    daily: "毎日 {time}",
    weekly: "{days} {time}",
    watch: plural({ other: "{page} を{count}分ごとに監視" }),
  },
  status: {
    running: "実行中",
    paused: "一時停止中",
    pausedFailures: "失敗が続いたため一時停止中",
    needsUser: "対応が必要",
    allPaused: "すべてのタスクが一時停止中",
    otherDevice: "{device} で実行",
    done: "完了",
  },
  results: {
    reported: "報告あり",
    nothing: "新しい情報なし",
    met: "条件を満たしました",
    notMet: "条件を満たしていません",
    unchanged: "変化なし",
    needsUser: "対応が必要",
    failed: "失敗",
  },
  lastRun: "前回の実行 {time}",
  nextRun: "次回の実行 {time}",
  actions: {
    runNow: "今すぐ実行",
    pause: "一時停止",
    resume: "再開",
    edit: "編集",
    delete: "タスクを削除",
    deleteConfirm:
      "このタスクを削除しますか？これまでの結果はチャット履歴に残ります。",
    openResult: "結果を開く",
  },
  notify: {
    titlePrefix: {
      result: "タスクの結果",
      met: "監視",
      needsUser: "タスクに対応が必要",
      paused: "タスクを一時停止",
    },
    finished: "タスクが完了しました。開いて結果を確認できます。",
    conditionMet: "監視している条件を満たしました。",
    needsUser: "続けるにはあなたの回答が必要です。",
    paused: "タスクが続けて失敗したため一時停止しました。",
  },
  agentPermission: {
    label: "自律操作",
    description:
      "スケジュールされたタスクと監視で、クリック、入力、送信、変更を行うツールを使えます。オフの場合、これらの実行は見るだけです。",
  },
  settings: {
    title: "スケジュールされたタスク",
    description:
      "ブラウザーが開いている間、タスクと監視はバックグラウンドで実行されます。",
    pauseAll: "すべてのタスクを一時停止",
    pauseAllDescription:
      "オフにするまで、どのデバイスでもスケジュールされたタスクや監視は実行されません。",
    notificationsUnavailable:
      "このブラウザーにはシステム通知がありません。結果はツールバーのボタンとタスク一覧に表示されます。",
  },
  tool: {
    scheduleTask: { running: "タスクを作成中", done: "タスクを作成しました" },
    taskResult: { running: "結果を報告中", done: "結果を報告しました" },
  },
};
