import { FolderOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getBrowserApi } from "../../src/shared/browser-api";
import {
  DOWNLOAD_ACTION,
  DOWNLOAD_STATUS,
  downloadRecords,
  type DownloadRecord,
} from "../../src/shared/downloads";
import { formatBytes } from "../../src/shared/format";
import { formatCount, type Messages } from "../../src/shared/i18n";
import { actionLabel, compactJoin, stringValue } from "./tool-detail-format";
import { ToolReferenceButton, type ToolReference } from "./tool-references";

type ToolRecord = Record<string, unknown>;
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

function fill(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  );
}

function progress(record: DownloadRecord) {
  if (!record.totalBytes) return formatBytes(record.bytes || 0);
  return `${Math.floor(((record.bytes || 0) / record.totalBytes) * 100)}%`;
}

// What became of one download, in the interface language.
export function downloadSummary(record: DownloadRecord, t: Messages) {
  const messages = t.downloads;
  const name = record.name;
  if (record.status === DOWNLOAD_STATUS.completed && record.exists === false)
    return fill(messages.moved, { name });
  if (record.status === DOWNLOAD_STATUS.completed && record.warning)
    return fill(messages.htmlPage, { name });
  const reason =
    REASONS.find(([pattern]) => pattern.test(record.error || ""))?.[1] ||
    "other";
  return fill(messages.status[record.status] || "", {
    name,
    size: formatBytes(record.bytes || 0),
    progress: progress(record),
    reason: messages.reasons[reason],
  });
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
  return compactJoin([
    actionLabel(input.action, t),
    stringValue(input.filename) ||
      stringValue(input.url) ||
      stringValue(input.source),
  ]);
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
export function DownloadReferences({
  output,
  t,
}: {
  output: unknown;
  t: Messages;
}) {
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
    label: fill(t.downloads.showFileInFolder, { name: record.name }),
    action: () => getBrowserApi().downloads.show(record.id),
  };
}
