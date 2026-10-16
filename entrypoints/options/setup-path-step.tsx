import { MonitorSmartphone, Sparkles } from "lucide-react";
import type { SetupPath } from "../../src/shared/setup-steps";
import { ChoiceCard, ChoiceCards } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";

// Setup's question whether OpenBrowserAgent is new here: a first-time user
// sets it up, a returning one syncs it from another device.
export function SetupPathStep({
  path,
  onChoose,
}: {
  path: SetupPath | undefined;
  onChoose: (path: SetupPath) => void;
}) {
  const s = useMessages().setup;
  return (
    <ChoiceCards aria-label={s.pathTitle} className="setup-path-choices">
      <ChoiceCard
        icon={<Sparkles size={18} />}
        title={s.pathNew}
        description={s.pathNewDescription}
        selected={path === "new"}
        onClick={() => onChoose("new")}
      />
      <ChoiceCard
        icon={<MonitorSmartphone size={18} />}
        title={s.pathReturning}
        description={s.pathReturningDescription}
        selected={path === "returning"}
        onClick={() => onChoose("returning")}
      />
    </ChoiceCards>
  );
}
