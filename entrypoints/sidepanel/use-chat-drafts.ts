import { useCallback, useState } from "react";

export function useChatDraft(activeChatId: string | undefined) {
  const [inputDrafts, setInputDrafts] = useState<Record<string, string>>({});
  const inputDraftKey = activeChatId || "new";
  const input = inputDrafts[inputDraftKey] || "";
  const setInput = useCallback(
    (value: string) => {
      setInputDrafts((items) => ({ ...items, [inputDraftKey]: value }));
    },
    [inputDraftKey],
  );
  const clearInput = useCallback(() => {
    setInputDrafts((items) => {
      const next = { ...items };
      delete next[inputDraftKey];
      return next;
    });
  }, [inputDraftKey]);

  return { input, setInput, clearInput };
}
