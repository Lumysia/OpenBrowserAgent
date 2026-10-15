import { FolderOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getBrowserApi } from "../../src/shared/browser-api";
import {
  DOWNLOAD_ACTION,
  DOWNLOAD_STATUS,
  downloadRecords,
  type DownloadRecord,
  type DownloadStatus,
} from "../../src/shared/downloads";
import { formatBytes, formatNumber } from "../../src/shared/format";
import { formatCount, languageOf, type Messages } from "../../src/shared/i18n";
import { formatToolMessage } from "./format";
import {
  actionLabel,
  compactJoin,
  knownLabel,
  stringValue,
  type ToolRecord,
  type ToolStepState,
  type ToolStepOutcome,
} from "./tool-detail-format";
import { ToolReferenceButton, type ToolReference } from "./tool-references";
import { useMessages } from "../../src/ui/messages";

type Reason = keyof Messages["downloads"]["reasons"];

const REASONS: Array<[RegExp, Reason]> = [
  [/^SERVER_BAD_CONTENT$/, "missing"],
  [/^SERVER_UNAUTHORIZED$/, "signIn"],
  [/^SERVER_(FORBIDDEN|CROSS_ORIGIN_REDIRECT)$/, "denied"],
  [
    /^(NETWORK_|SERVER_(UNREACHABLE|FAILED|CONTENT_LENGTH))|FILE_TOO_SHORT/,
    "network",
  ],
  [/^FILE_(BLOCKED|VIRUS_INFECTED|SECURITY_CHECK_FAILED)$/, "blocked"],
  [/^FILE_/, "disk"],
];

function progress(record: DownloadRecord, language: string) {
  if (!record.totalBytes) return formatBytes(language, record.bytes || 0);
  const percent = Math.floor(((record.bytes || 0) / record.totalBytes) * 100);
  return formatNumber(language, percent / 100, { style: "percent" });
}

// What became of one download, in the interface language.
export function downloadSummary(record: DownloadRecord, t: Messages) {
  const messages = t.downloads;
  const language = languageOf(t);
  const name = record.name;
  if (record.status === DOWNLOAD_STATUS.completed && record.exists === false)
    return formatToolMessage(messages.moved, { name });
  if (record.status === DOWNLOAD_STATUS.completed && record.warning)
    return formatToolMessage(messages.htmlPage, { name });
  const reason =
    REASONS.find(([pattern]) => pattern.test(record.error || ""))?.[1] ||
    "other";
  return formatToolMessage(messages.status[record.status] || "", {
    name,
    size: formatBytes(language, record.bytes || 0),
    progress: progress(record, language),
    reason: messages.reasons[reason],
  });
}

type Title = keyof Messages["downloads"]["titles"];

// The status a step's title names when it handled several downloads: the
// one the user most needs to know about first.
const TITLE_BY_STATUS: Array<[DownloadStatus, Title]> = [
  [DOWNLOAD_STATUS.failed, "failed"],
  [DOWNLOAD_STATUS.needsConfirmation, "waiting"],
  [DOWNLOAD_STATUS.choosingLocation, "waiting"],
  [DOWNLOAD_STATUS.inProgress, "downloading"],
  [DOWNLOAD_STATUS.paused, "paused"],
  [DOWNLOAD_STATUS.canceled, "canceled"],
];

// The downloads tool's step title: what happened ("Downloaded", "Download
// failed", "Waiting for you"), not the tool's name.
export function downloadsOutcome(
  input: ToolRecord,
  output: ToolRecord,
  t: Messages,
  state: ToolStepState,
): ToolStepOutcome | undefined {
  const titles = t.downloads.titles;
  const action = stringValue(input.action);
  const target = downloadTarget(input);
  if (state === "running") {
    const title = knownLabel(t.downloads.running, action);
    return title ? { title, description: target } : undefined;
  }
  if (state === "failed")
    return action === DOWNLOAD_ACTION.list || action === DOWNLOAD_ACTION.cancel
      ? undefined
      : { title: titles.failed, failed: true, description: target };
  // The output's action: a run that ended before the tool returned has none.
  if (output.action === DOWNLOAD_ACTION.list) return { title: titles.listed };
  const records = downloadRecords(output);
  if (!records.length)
    return output.action === DOWNLOAD_ACTION.wait
      ? { title: titles.noneStarted }
      : undefined;
  const key =
    TITLE_BY_STATUS.find(([status]) =>
      records.some((record) => record.status === status),
    )?.[1] ||
    (action === DOWNLOAD_ACTION.save || action === DOWNLOAD_ACTION.images
      ? "saved"
      : "downloaded");
  return { title: titles[key], failed: key === "failed" };
}

// The file or address a step works on, before its outcome is known.
function downloadTarget(input: ToolRecord) {
  return (
    stringValue(input.filename) ||
    stringValue(input.url) ||
    stringValue(input.source)
  );
}

// The downloads tool's step line.
export function downloadsDetail(
  input: ToolRecord,
  output: ToolRecord,
  t: Messages,
) {
  const records = downloadRecords(output);
  if (output.action === DOWNLOAD_ACTION.list)
    return records.length
      ? formatCount(t.downloads.listed, records.length)
      : t.downloads.none;
  if (records.length)
    return records.map((record) => downloadSummary(record, t)).join(" · ");
  return compactJoin([actionLabel(input.action, t), downloadTarget(input)]);
}

// Records whose file is on this device: the same download id with the same
// path (a synced chat's ids belong to another device's browser).
function useFilesOnDevice(records: DownloadRecord[]) {
  const [present, setPresent] = useState<number[]>([]);
  const key = records.map((record) => `${record.id}:${record.path}`).join("|");
  useEffect(() => {
    const api = getBrowserApi().downloads;
    if (!records.length || !api?.search) return;
    let active = true;
    const check = async () => {
      const found = await Promise.all(
        records.map(async (record) => {
          const [item] = await api.search({ id: record.id });
          return item?.state === "complete" &&
            item.exists &&
            !!record.path &&
            item.filename === record.path
            ? record.id
            : undefined;
        }),
      );
      if (active)
        setPresent(found.filter((id): id is number => id !== undefined));
    };
    const changed = (delta: chrome.downloads.DownloadDelta) => {
      if (records.some((record) => record.id === delta.id))
        check().catch(() => undefined);
    };
    check().catch(() => undefined);
    api.onChanged?.addListener(changed);
    return () => {
      active = false;
      api.onChanged?.removeListener(changed);
    };
    // `key` names the records; the array itself is new on every render.
  }, [key]);
  return present;
}

// "Show in folder" for the files a step saved, in any tool's output.
export function DownloadReferences({ output }: { output: unknown }) {
  const t = useMessages();
  const action = (output as ToolRecord | undefined)?.action;
  const records = useMemo(
    () =>
      action === DOWNLOAD_ACTION.list
        ? []
        : downloadRecords(output).filter(
            (record) =>
              !!record.path &&
              record.status !== DOWNLOAD_STATUS.failed &&
              record.status !== DOWNLOAD_STATUS.canceled,
          ),
    [action, output],
  );
  const present = useFilesOnDevice(records);
  const shown = records.filter((record) => present.includes(record.id));
  if (!shown.length) return null;
  return (
    <div className="tool-references">
      {shown.map((record, index) => (
        <ToolReferenceButton
          key={record.id}
          reference={showInFolder(record, t)}
          index={index}
        />
      ))}
    </div>
  );
}

function showInFolder(record: DownloadRecord, t: Messages): ToolReference {
  return {
    title: record.name,
    icon: <FolderOpen size={14} />,
    label: formatToolMessage(t.downloads.showFileInFolder, {
      name: record.name,
    }),
    action: () => getBrowserApi().downloads.show(record.id),
  };
}
