import { plural } from "../../plural";
import type { TasksLocaleMessages } from "./en-US";

export const tasksKo: TasksLocaleMessages = {
  title: "작업",
  untitled: "제목 없는 작업",
  count: plural({ other: "작업 {count}개" }),
  newTask: "새 작업",
  editTask: "작업 편집",
  makeTask: "작업으로 만들기",
  empty: "아직 작업이 없습니다",
  emptyHint:
    "에이전트가 나중에, 일정에 따라, 또는 페이지가 바뀔 때 일을 하게 합니다.",
  kinds: {
    once: "한 번",
    interval: "반복",
    daily: "매일",
    weekly: "매주",
    watch: "페이지 감시",
  },
  units: {
    minutes: plural({ other: "{count}분" }),
    hours: plural({ other: "{count}시간" }),
    days: plural({ other: "{count}일" }),
  },
  unitNames: {
    minutes: "분",
    hours: "시간",
    days: "일",
  },
  form: {
    title: "제목",
    prompt: "할 일",
    promptPlaceholder: "이 페이지의 뉴스를 확인하고 새 내용을 요약",
    watchPrompt: "조건과 보고할 내용",
    watchPromptPlaceholder: "가격이 50 아래로 내려가면 알려 줘",
    kind: "시점",
    at: "날짜와 시간",
    every: "간격",
    unit: "단위",
    time: "시간",
    days: "요일",
    url: "페이지 주소",
    part: "페이지 부분",
    partPage: "주요 콘텐츠",
    partElement: "선택한 요소",
    pickElement: "페이지에서 선택",
    checkEvery: "확인 간격(분)",
    watchHint:
      "확인할 때마다 모델 없이 페이지를 읽고, 감시하는 텍스트가 바뀐 경우에만 에이전트를 실행합니다.",
    agent: "에이전트",
    mayAct:
      "이 에이전트는 스스로 작업을 수행할 수 있습니다. 실행 중 클릭, 입력, 변경을 하는 도구를 사용할 수 있습니다.",
    looksOnly:
      "실행은 보기만 합니다. 읽고, 검색하고, 보고할 뿐 클릭, 입력, 변경은 하지 않습니다.",
    device: "실행 기기",
    thisDevice: "{name}(이 기기)",
    save: "작업 저장",
    invalidPrompt: "작업이 할 일을 입력하세요.",
    invalidUrl: "http 또는 https 주소를 입력하세요.",
    invalidAt: "날짜와 시간을 선택하세요.",
  },
  schedule: {
    unknown: "최신 버전의 일정",
    once: "한 번, {time}",
    every: "{amount}마다",
    daily: "매일 {time}",
    weekly: "{days} {time}",
    watch: plural({ other: "{count}분마다 {page} 감시" }),
  },
  status: {
    unsupported: "최신 버전 필요",
    running: "실행 중",
    paused: "일시 중지됨",
    pausedFailures: "실패가 반복되어 일시 중지됨",
    needsUser: "확인 필요",
    allPaused: "모든 작업이 일시 중지됨",
    otherDevice: "{device}에서 실행",
    done: "완료",
  },
  results: {
    reported: "보고함",
    nothing: "새 소식 없음",
    met: "조건 충족",
    notMet: "조건 미충족",
    unchanged: "변경 없음",
    answered: "답변만 함",
    needsUser: "확인 필요",
    failed: "실패",
  },
  lastRun: "마지막 실행 {time}",
  nextRun: "다음 실행 {time}",
  actions: {
    runNow: "지금 실행",
    pause: "일시 중지",
    resume: "다시 시작",
    edit: "편집",
    delete: "작업 삭제",
    deleteConfirm: "이 작업을 삭제할까요? 지난 결과는 채팅 기록에 남습니다.",
    openResult: "결과 열기",
  },
  notify: {
    titlePrefix: {
      result: "작업 결과",
      met: "감시",
      needsUser: "작업 확인 필요",
      paused: "작업 일시 중지",
    },
    finished: "작업이 끝났습니다. 열어서 결과를 확인하세요.",
    conditionMet: "감시 중인 조건이 충족되었습니다.",
    needsUser: "계속하려면 답변이 필요합니다.",
    paused: "작업이 연속으로 실패하여 일시 중지되었습니다.",
  },
  agentPermission: {
    label: "스스로 작업 수행",
    description:
      "예약 작업과 감시에서 클릭, 입력, 제출, 변경을 하는 도구를 사용할 수 있습니다. 끄면 이런 실행은 보기만 합니다.",
  },
  settings: {
    title: "예약 작업",
    description:
      "브라우저가 열려 있는 동안 작업과 감시는 백그라운드에서 실행됩니다.",
    pauseAll: "모든 작업 일시 중지",
    pauseAllDescription:
      "이 설정을 끌 때까지 어떤 기기에서도 예약 작업이나 감시가 실행되지 않습니다.",
    notificationsUnavailable:
      "이 브라우저에는 시스템 알림이 없습니다. 결과는 툴바 버튼과 작업 목록에 표시됩니다.",
  },
  tool: {
    scheduleTask: { running: "작업 만드는 중", done: "작업을 만들었습니다" },
    taskResult: { running: "결과 보고 중", done: "결과를 보고했습니다" },
  },
};
