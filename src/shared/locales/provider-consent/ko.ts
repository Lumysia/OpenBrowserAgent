import type { ProviderConsentLocaleMessages } from "./en-US";

export const providerConsentKo: ProviderConsentLocaleMessages = {
  agreement:
    "채팅에서 공유하는 내용(메시지, 페이지 텍스트, 스크린샷, 파일)이 {host}(으)로 전송되는 데 동의합니다.",
  promptTitle: "내용 전송을 허용할까요?",
  allow: "동의",
  decline: "나중에",
  allowed: "내용 수신 허용됨",
  withdraw: "허용 철회",
  needsPermission: "허용 필요",
  localEndpoint: "로컬 엔드포인트({host}) — 허용이 필요 없어요.",
  requiredToSave: "API 키를 저장하려면 위의 확인란을 선택하세요.",
  required:
    "{host}은(는) 아직 내용 수신이 허용되지 않았어요. 사이드 패널에서 메시지를 보낼 때 또는 ‘설정’ → ‘AI 제공업체’에서 동의하세요.",
};
