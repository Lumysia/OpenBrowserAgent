import { plural } from "../../plural";
import type { TeachLocaleMessages } from "./en-US";

export const teachKo: TeachLocaleMessages = {
  menu: {
    title: "스킬 기록",
    hint: "작업을 한 번 보여 주기",
  },
  pill: {
    recording: "기록 중",
    stop: "중지",
    stopHint: "기록을 중지하고 스킬 작성",
  },
  start: {
    title: "스킬 기록",
    description:
      "이 페이지에서 작업을 직접 한 뒤 중지를 누르세요. 기록이 스킬이 됩니다.",
    purpose: "무엇을 위한 건가요? (선택)",
    purposePlaceholder: "주간 근무표 제출",
    varies: "매번 바뀌는 것은? (선택)",
    variesPlaceholder: "주차와 프로젝트",
    privacy:
      "입력한 내용은 기록되지 않고 어떤 필드를 썼는지만 기록됩니다. 비밀번호와 코드는 절대 기록되지 않습니다.",
    start: "기록 시작",
    unscriptable:
      "이 페이지는 기록할 수 없습니다. 작업이 시작되는 페이지를 여세요.",
    busy: "다른 기록이 열려 있습니다. 새로 시작하기 전에 저장하거나 삭제하세요.",
    showRecording: "기록 보기",
  },
  recording: {
    title: "기록 중",
    steps: plural({ other: "{count}단계" }),
    empty: "페이지에서 작업을 하세요. 각 단계가 여기에 표시됩니다.",
    long: "기록이 길면 스킬 품질이 떨어집니다. 작업이 끝나면 중지하세요.",
    full: "기록이 가득 찼습니다. 이후 단계는 기록되지 않습니다.",
    unrecorded: plural({
      other:
        "페이지에서 {count}개의 동작을 기록하지 못했습니다. 단계가 빠짐없는지 확인하세요.",
    }),
    frames: plural({
      other: "삽입된 프레임 {count}개 안의 단계는 기록되지 않았습니다.",
    }),
    stop: "중지",
    discard: "취소",
    deleteStep: "단계 삭제",
    varies: "매번 바뀜",
    keepExample: "입력한 내용을 예시로 보관",
    dropExample: "예시 보관 안 함",
    exampleKept: "예시를 보관했습니다",
    exampleGone: "페이지에 이 값이 더 이상 없습니다.",
    secret: "비밀 — 저장되지 않음",
  },
  step: {
    click: "{target} 클릭",
    field: "{target}에 입력",
    fieldSubmitted: "{target}에 입력하고 Enter",
    choose: "{target}에서 {choice} 선택",
    chooseSecret: "{target}에서 옵션 선택",
    check: "{target} 선택",
    uncheck: "{target} 선택 해제",
    key: "{key} 누르기",
    navigate: "{url}(으)로 이동",
    openTab: "새 탭: {url}",
    switchTab: "{site}(으)로 전환",
    page: "페이지",
  },
  ended: {
    title: "기록이 끝났습니다",
    tabClosed:
      "탭이 닫혔습니다. 아직 아무것도 보내지 않았습니다. 이 단계로 스킬을 작성하거나 삭제하세요.",
    idle: "한동안 아무 동작이 없었습니다. 아직 아무것도 보내지 않았습니다. 이 단계로 스킬을 작성하거나 삭제하세요.",
    consent:
      "페이지에서 중지했습니다. 스킬을 작성하면 이 단계가 모델로 전송됩니다.",
    write: "스킬 작성",
  },
  writing: {
    title: "스킬 작성 중…",
    description: "모델이 기록된 단계를 지침으로 바꾸고 있습니다.",
  },
  failed: {
    title: "스킬을 작성하지 못했습니다",
    retry: "다시 시도",
  },
  save: {
    title: "스킬 저장",
    name: "이름",
    description: "설명",
    instructions: "에이전트가 따를 지침",
    stored:
      "단계(어느 페이지의 어떤 요소인지)와 함께 스킬로 저장됩니다. 입력한 내용은 저장되지 않습니다. 다른 스킬처럼 동기화됩니다.",
    check: "저장하고 확인",
    checkHint: "새 탭에서 스킬을 한 번 실행하고 마지막 단계 전에 물어봅니다",
    draft: "건너뛰고 초안으로 저장",
  },
  check: {
    message: "기록한 스킬 {name} 확인",
    passed: "확인 통과: {name}이(가) 확인되었습니다.",
    auto: "에이전트가 자동으로 사용하게 하기",
    autoOn: "요청이 맞으면 에이전트가 {name}을(를) 사용합니다.",
    diverged: "{step}단계에서 다르게 진행되었습니다.",
    divergedNoStep: "확인 중 다르게 진행되었습니다.",
    fix: "단계 수정",
    fixMessage: "이번 확인을 바탕으로 {name}의 단계 수정",
    recordAgain: "여기서부터 다시 기록",
    keepDraft: "초안으로 저장",
    done: "완료",
  },
  status: {
    recorded: "기록됨",
    draft: "초안",
    verified: "확인됨",
  },
  skillsHint:
    "스킬을 기록하려면 작업이 시작되는 페이지에서 사이드 패널을 열고 + → 스킬 기록을 선택하세요.",
  tool: {
    skillCheck: {
      running: "확인 결과 보고 중",
      done: "확인 결과를 보고했습니다",
    },
  },
};
