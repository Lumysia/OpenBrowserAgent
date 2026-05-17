import { Bot } from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../src/ui/components";

export function ProvidersEmptyState({ t }: { t: Messages }) {
  return (
    <div className="sidepanel">
      <div className="empty">
        <Card className="stack" style={{ maxWidth: 320 }}>
          <CardHeader>
            <Bot size={34} />
            <CardTitle>{t.sidepanel.connectProviderTitle}</CardTitle>
            <CardDescription>
              {t.sidepanel.connectProviderDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => chrome.runtime.openOptionsPage()}>
              {t.sidepanel.addProvider}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
