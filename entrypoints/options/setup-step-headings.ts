import {
  CloudDownload,
  FolderSync,
  KeyRound,
  Languages,
  MonitorSmartphone,
  MousePointerClick,
  PartyPopper,
  Server,
  type LucideIcon,
} from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import type { SetupStep } from "../../src/shared/setup-steps";

type Setup = Messages["setup"];
type SetupText = {
  [Key in keyof Setup]: Setup[Key] extends string ? Key : never;
}[keyof Setup];

// Each setup step's icon and heading.
export const SETUP_STEP_HEADINGS: Record<
  SetupStep,
  { icon: LucideIcon; title: SetupText; description: SetupText }
> = {
  language: {
    icon: Languages,
    title: "languageTitle",
    description: "languageDescription",
  },
  path: {
    icon: MonitorSmartphone,
    title: "pathTitle",
    description: "pathDescription",
  },
  provider: {
    icon: Server,
    title: "providerTitle",
    description: "providerDescription",
  },
  pages: {
    icon: MousePointerClick,
    title: "pagesTitle",
    description: "pagesDescription",
  },
  sync: {
    icon: FolderSync,
    title: "syncTitle",
    description: "syncDescription",
  },
  passphrase: {
    icon: KeyRound,
    title: "passphraseTitle",
    description: "passphraseDescription",
  },
  download: {
    icon: CloudDownload,
    title: "downloadTitle",
    description: "downloadDescription",
  },
  done: {
    icon: PartyPopper,
    title: "doneTitle",
    description: "doneDescription",
  },
};
