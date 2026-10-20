import { plural } from "../../plural";
import type { TeachLocaleMessages } from "./en-US";

export const teachZhCN: TeachLocaleMessages = {
  menu: {
    title: "录制技能",
    hint: "把任务演示给智能体看一遍",
  },
  pill: {
    recording: "录制中",
    stop: "停止",
    stopHint: "停止录制并编写技能",
  },
  start: {
    title: "录制技能",
    description:
      "在此页面上自己完成一遍任务，然后点“停止”。录制内容会变成一个技能。",
    purpose: "用途是什么？（可选）",
    purposePlaceholder: "提交每周工时表",
    varies: "每次有什么不同？（可选）",
    variesPlaceholder: "周次和项目",
    privacy:
      "不会录制你输入的内容，只记录你用了哪个字段。密码和验证码一律不录制。",
    start: "开始录制",
    unscriptable: "此页面无法录制。请打开任务开始的页面。",
    busy: "另一个录制尚未完成。开始新的录制前，请先保存或丢弃它。",
    showRecording: "显示录制",
  },
  recording: {
    title: "录制中",
    steps: plural({ other: "{count} 个步骤" }),
    empty: "在页面上完成任务，每个步骤都会显示在这里。",
    long: "录制太长，技能效果会变差。任务完成后就停止。",
    full: "录制已满：之后的步骤不会被录制。",
    unrecorded: plural({
      other: "页面上有 {count} 个操作无法录制。请检查步骤是否完整。",
    }),
    frames: plural({
      other: "{count} 个嵌入框架中的步骤未录制。",
    }),
    stop: "停止",
    discard: "放弃",
    deleteStep: "删除步骤",
    varies: "每次不同",
    keepExample: "把我输入的内容保留为示例",
    dropExample: "不保留示例",
    exampleKept: "已保留示例",
    exampleGone: "页面上已经没有这个值了。",
    secret: "机密——绝不保存",
  },
  step: {
    click: "点击{target}",
    field: "在{target}中输入",
    fieldSubmitted: "在{target}中输入并按 Enter",
    choose: "在{target}中选择{choice}",
    chooseSecret: "在{target}中选择一个选项",
    check: "勾选{target}",
    uncheck: "取消勾选{target}",
    key: "按 {key}",
    navigate: "前往 {url}",
    openTab: "新标签页：{url}",
    switchTab: "切换到 {site}",
    page: "页面",
  },
  ended: {
    title: "录制已结束",
    tabClosed:
      "它的标签页已关闭。尚未发送任何内容：可以用这些步骤编写技能，或丢弃它们。",
    idle: "一段时间内没有操作。尚未发送任何内容：可以用这些步骤编写技能，或丢弃它们。",
    consent: "已在页面上停止。编写技能会把这些步骤发送给你的模型。",
    write: "编写技能",
  },
  writing: {
    title: "正在编写技能…",
    description: "模型正在把录制的步骤写成说明。",
  },
  failed: {
    title: "无法编写技能",
    retry: "重试",
  },
  save: {
    title: "保存技能",
    name: "名称",
    description: "描述",
    instructions: "智能体将遵循的说明",
    stored:
      "将保存为技能，包含其步骤：在哪个页面用了哪个控件。不会保存你输入的内容。它会像其他技能一样同步。",
    check: "保存并检查",
    checkHint: "在新标签页中运行一次技能，最后一步前会先问你",
    draft: "跳过，保存为草稿",
  },
  check: {
    message: "检查录制的技能 {name}",
    passed: "检查通过：{name} 已验证。",
    auto: "让智能体自动使用",
    autoOn: "智能体现在会在请求合适时使用 {name}。",
    diverged: "检查在第 {step} 步出现了不同。",
    divergedNoStep: "检查过程出现了不同。",
    fix: "修正步骤",
    fixMessage: "根据这次检查修正 {name} 的步骤",
    recordAgain: "从这里重新录制",
    keepDraft: "保存为草稿",
    done: "完成",
  },
  status: {
    recorded: "已录制",
    draft: "草稿",
    verified: "已验证",
  },
  skillsHint:
    "要录制技能，请在任务开始的页面打开侧边栏，然后选择“+”→“录制技能”。",
  tool: {
    skillCheck: { running: "正在报告检查结果", done: "已报告检查结果" },
  },
};
