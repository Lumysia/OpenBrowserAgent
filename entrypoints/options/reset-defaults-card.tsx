import { RotateCcw } from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  ConfirmButton,
} from "../../src/ui/components";

// Restores the built-in items of a list (keeping the user's own), or the
// whole list as it ships. Both ask before they run.
export function ResetDefaultsCard({
  t,
  title,
  description,
  onResetBuiltins,
  onResetAll,
}: {
  t: Messages;
  title: string;
  description: string;
  onResetBuiltins: () => void;
  onResetAll: () => void;
}) {
  const confirm = {
    confirmLabel: t.common.confirm,
    cancelLabel: t.common.cancel,
    variant: "outline",
  } as const;
  return (
    <Card>
      <CardContent className="settings-action-row">
        <div>
          <CardTitle className="settings-section-title">
            <RotateCcw /> {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="row">
          <ConfirmButton {...confirm} onConfirm={onResetBuiltins}>
            {t.options.resetBuiltins}
          </ConfirmButton>
          <ConfirmButton {...confirm} onConfirm={onResetAll}>
            {t.options.resetDefaults}
          </ConfirmButton>
        </div>
      </CardContent>
    </Card>
  );
}
