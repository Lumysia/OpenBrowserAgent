import { useState } from "react";
import { Check, Copy, Plus, Terminal } from "lucide-react";
import { getBrowserApi } from "../../src/shared/browser-api";
import {
  LOCAL_EXECUTION_BRIDGE_BROWSERS,
  localExecutionBridgeInstallCommand,
  parseInstallerOutput,
  type InstallerFields,
  type LocalExecutionBridgeBrowser,
} from "../../src/shared/local-execution-bridge-install";
import {
  Button,
  CardDescription,
  Feedback,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsSection,
  Textarea,
} from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { useTransient } from "../../src/ui/use-transient";

// The browser this page runs in, as the installer names it where that can
// be told from the extension's own URL; the user picks another brand.
function defaultBrowser(): LocalExecutionBridgeBrowser {
  return getBrowserApi().runtime.getURL("").startsWith("moz-extension:")
    ? "firefox"
    : "chrome";
}

// Setting up a bridge in two steps: run the installer command (with this
// extension's ID in it), then paste what it prints to add and test the
// bridge.
export function LocalExecutionBridgeSetup({
  onAdd,
}: {
  onAdd: (fields: InstallerFields) => Promise<void>;
}) {
  const t = useMessages();
  const o = t.options;
  const [browser, setBrowser] = useState(defaultBrowser);
  const [output, setOutput] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [adding, setAdding] = useState(false);
  const [copied, showCopied] = useTransient<boolean>();
  const command = localExecutionBridgeInstallCommand(
    browser,
    getBrowserApi().runtime.id,
  );

  const add = async () => {
    const fields = parseInstallerOutput(output);
    setInvalid(!fields);
    if (!fields) return;
    setAdding(true);
    try {
      await onAdd(fields);
      setOutput("");
    } finally {
      setAdding(false);
    }
  };

  return (
    <SettingsSection
      icon={<Terminal />}
      title={o.localExecutionBridgeSetup}
      description={o.localExecutionBridgeSetupDescription}
      contentClassName="stack"
    >
      <Label>
        {o.localExecutionBridgeBrowser}
        <Select
          value={browser}
          onValueChange={(value) =>
            setBrowser(value as LocalExecutionBridgeBrowser)
          }
        >
          <SelectTrigger aria-label={o.localExecutionBridgeBrowser}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOCAL_EXECUTION_BRIDGE_BROWSERS.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Label>
      <div className="bridge-install-command">
        <code>{command}</code>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void navigator.clipboard
              .writeText(command)
              .then(() => showCopied(true))
          }
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? t.common.copied : t.common.copy}
        </Button>
      </div>
      <Label>
        {o.localExecutionBridgeInstallerOutput}
        <Textarea
          value={output}
          placeholder={o.localExecutionBridgeInstallerOutputPlaceholder}
          onChange={(event) => {
            setOutput(event.currentTarget.value);
            setInvalid(false);
          }}
        />
      </Label>
      {invalid && (
        <Feedback error>
          {o.localExecutionBridgeInstallerOutputInvalid}
        </Feedback>
      )}
      <CardDescription>{o.localExecutionBridgeInstallerHint}</CardDescription>
      <div className="row">
        <Button disabled={!output.trim() || adding} onClick={() => void add()}>
          <Plus size={15} /> {o.localExecutionBridgeAddFromOutput}
        </Button>
      </div>
    </SettingsSection>
  );
}
