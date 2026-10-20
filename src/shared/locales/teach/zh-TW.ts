import { plural } from "../../plural";
import type { TeachLocaleMessages } from "./en-US";

export const teachZhTW: TeachLocaleMessages = {
  menu: {
    title: "錄製技能",
    hint: "把任務示範給智慧體看一遍",
  },
  pill: {
    recording: "錄製中",
    stop: "停止",
    stopHint: "停止錄製並撰寫技能",
  },
  start: {
    title: "錄製技能",
    description:
      "在此頁面上自己完成一遍任務，然後按「停止」。錄製內容會變成一個技能。",
    purpose: "用途是什麼？（選填）",
    purposePlaceholder: "提交每週工時表",
    varies: "每次有什麼不同？（選填）",
    variesPlaceholder: "週次和專案",
    privacy:
      "不會錄製你輸入的內容，只記錄你用了哪個欄位。密碼和驗證碼一律不錄製。",
    start: "開始錄製",
    unscriptable: "此頁面無法錄製。請開啟任務開始的頁面。",
    busy: "另一個錄製尚未完成。開始新的錄製前，請先儲存或捨棄它。",
    showRecording: "顯示錄製",
  },
  recording: {
    title: "錄製中",
    steps: plural({ other: "{count} 個步驟" }),
    empty: "在頁面上完成任務，每個步驟都會顯示在這裡。",
    long: "錄製太長，技能效果會變差。任務完成後就停止。",
    full: "錄製已滿：之後的步驟不會被錄製。",
    unrecorded: plural({
      other: "頁面上有 {count} 個操作無法錄製。請檢查步驟是否完整。",
    }),
    frames: plural({
      other: "{count} 個內嵌框架中的步驟未錄製。",
    }),
    stop: "停止",
    discard: "捨棄",
    deleteStep: "刪除步驟",
    varies: "每次不同",
    keepExample: "把我輸入的內容保留為範例",
    dropExample: "不保留範例",
    exampleKept: "已保留範例",
    exampleGone: "頁面上已經沒有這個值了。",
    secret: "機密——絕不儲存",
  },
  step: {
    click: "點選{target}",
    field: "在{target}中輸入",
    fieldSubmitted: "在{target}中輸入並按 Enter",
    choose: "在{target}中選擇{choice}",
    chooseSecret: "在{target}中選擇一個選項",
    check: "勾選{target}",
    uncheck: "取消勾選{target}",
    key: "按 {key}",
    navigate: "前往 {url}",
    openTab: "新分頁：{url}",
    switchTab: "切換到 {site}",
    page: "頁面",
  },
  ended: {
    title: "錄製已結束",
    tabClosed:
      "它的分頁已關閉。尚未傳送任何內容：可以用這些步驟編寫技能，或捨棄它們。",
    idle: "一段時間內沒有操作。尚未傳送任何內容：可以用這些步驟編寫技能，或捨棄它們。",
    consent: "已在頁面上停止。編寫技能會把這些步驟傳送給你的模型。",
    write: "編寫技能",
  },
  writing: {
    title: "正在撰寫技能…",
    description: "模型正在把錄製的步驟寫成說明。",
  },
  failed: {
    title: "無法撰寫技能",
    retry: "重試",
  },
  save: {
    title: "儲存技能",
    name: "名稱",
    description: "描述",
    instructions: "智慧體將遵循的說明",
    stored:
      "將儲存為技能，包含其步驟：在哪個頁面用了哪個控制項。不會儲存你輸入的內容。它會像其他技能一樣同步。",
    check: "儲存並檢查",
    checkHint: "在新分頁中執行一次技能，最後一步前會先問你",
    draft: "略過，儲存為草稿",
  },
  check: {
    message: "檢查錄製的技能 {name}",
    passed: "檢查通過：{name} 已驗證。",
    auto: "讓智慧體自動使用",
    autoOn: "智慧體現在會在請求合適時使用 {name}。",
    diverged: "檢查在第 {step} 步出現了不同。",
    divergedNoStep: "檢查過程出現了不同。",
    fix: "修正步驟",
    fixMessage: "根據這次檢查修正 {name} 的步驟",
    recordAgain: "從這裡重新錄製",
    keepDraft: "儲存為草稿",
    done: "完成",
  },
  status: {
    recorded: "已錄製",
    draft: "草稿",
    verified: "已驗證",
  },
  skillsHint:
    "要錄製技能，請在任務開始的頁面開啟側邊欄，然後選擇「+」→「錄製技能」。",
  tool: {
    skillCheck: { running: "正在回報檢查結果", done: "已回報檢查結果" },
  },
};
