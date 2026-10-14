import { plural } from "../../plural";
import type { DisplayMessages } from "./en-US";

export const displayZhCN: DisplayMessages = {
  counts: {
    models: plural({ other: "{count} 个模型" }),
    files: plural({ other: "{count} 个文件" }),
    characters: plural({ other: "{count} 个字符" }),
  },
  providerTypes: {
    openai: "OpenAI 兼容",
    "openai-responses": "OpenAI Responses",
    anthropic: "Anthropic 兼容",
  },
  builtinSkills: {
    "fill-form": {
      name: "填写表单",
      description:
        "根据你提供的信息或文件填写网页表单，逐项检查，只在你明确要求时提交。",
    },
    "tidy-tabs": {
      name: "整理标签页",
      description: "关闭重复的标签页，把相关的分组，并找出不再需要的标签页。",
    },
    "openbrowseragent-help": {
      name: "OpenBrowserAgent 帮助",
      description: "解答有关使用和设置 OpenBrowserAgent 的问题。",
    },
    "skill-creator": {
      name: "技能创建器",
      description: "创建、保存或改进技能，例如把刚完成的任务保存为技能。",
    },
    "local-execution-bridge-setup": {
      name: "设置本地执行桥",
      description:
        "设置、测试、更新或移除本地执行桥，让智能体可以在你的电脑上运行命令。",
    },
  },
  toolSteps: {
    page: "页面",
    tabs: plural({ other: "{count} 个标签页" }),
    lines: plural({ other: "{count} 行" }),
    matches: plural({ other: "{count} 处匹配" }),
    results: plural({ other: "{count} 条结果" }),
    items: plural({ other: "{count} 项" }),
    editsApplied: plural({ other: "已应用 {applied}/{count} 处修改" }),
    tabActions: {
      open: "已打开",
      switch: "已切换到",
      close: "已关闭",
      navigate: "已跳转",
      back: "已后退",
      forward: "已前进",
      reload: "已重新加载",
      group: "已分组",
      ungroup: "已取消分组",
    },
    actStepSeparator: "，",
    actSteps: {
      click: plural({ other: "点击了 {count} 个元素" }),
      type: plural({ other: "填写了 {count} 个字段" }),
      press: plural({ other: "按下了 {count} 个按键" }),
      select: plural({ other: "选择了 {count} 个选项" }),
      hover: plural({ other: "悬停了 {count} 个元素" }),
      scroll: plural({ other: "滚动了 {count} 次" }),
      wait: plural({ other: "等待了 {count} 次" }),
      drag: plural({ other: "拖动了 {count} 个元素" }),
      dialog: plural({ other: "处理了 {count} 个对话框" }),
      other: plural({ other: "执行了其他 {count} 个步骤" }),
    },
  },
};
