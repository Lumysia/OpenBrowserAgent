import { useEffect } from "react";
import { useLatest } from "../../src/ui/use-latest";

// What a setup step is doing while its work runs (connecting, downloading),
// told to the wizard so the forward button says it and waits; undefined
// once done.
export type SetupBusyReport = (reason: string | undefined) => void;

export function useSetupBusy(
  onBusy: SetupBusyReport,
  reason: string | undefined,
) {
  const latest = useLatest(onBusy);
  useEffect(() => {
    latest.current(reason);
    return () => latest.current(undefined);
  }, [reason, latest]);
}
