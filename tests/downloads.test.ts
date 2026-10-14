import assert from "node:assert/strict";
import { test } from "node:test";
import { fileFromContent } from "../src/background/downloads/content";
import {
  safeDownloadPath,
  safeSegment,
  withExtension,
} from "../src/background/downloads/filenames";
import {
  CHOOSING_LOCATION_AFTER_MS,
  downloadLine,
  downloadRecord,
} from "../src/background/downloads/records";
import { DOWNLOAD_STATUS } from "../src/shared/downloads";
import { getMessages } from "../src/shared/i18n";
import { downloadsDetail } from "../entrypoints/sidepanel/download-tool-display";
import { downloadItem as item } from "./download-fixtures";

test("file names stay inside the Downloads folder and are valid everywhere", () => {
  assert.equal(safeDownloadPath("../../etc/passwd"), "etc/passwd");
  assert.equal(safeDownloadPath("/abs/path/a.txt"), "abs/path/a.txt");
  assert.equal(safeDownloadPath("C:\\Users\\x\\a.txt"), "Users/x/a.txt");
  assert.equal(
    safeDownloadPath("a.txt", "../reports/./q3"),
    "reports/q3/a.txt",
  );
  assert.equal(safeDownloadPath("reports/"), "reports/download");
  assert.equal(safeDownloadPath(""), "download");
  assert.equal(safeDownloadPath("...", "x"), "x/download");
  assert.equal(safeSegment('a<b>:"c"|?*.txt'), "a_b_c_.txt");
  assert.equal(safeSegment(" .hidden. "), "hidden");
  assert.equal(safeSegment("CON.txt"), "_CON.txt");
  assert.equal(safeSegment("lpt1"), "_lpt1");
  assert.equal(safeSegment("invoice.lnk"), "invoice_lnk");
  assert.equal(safeSegment("photo\u202egpj.exe"), "photo_gpj.exe");
  assert.equal(safeSegment("tab\tname\n.md"), "tab_name_.md");
  const long = safeSegment(`${"x".repeat(300)}.xlsx`);
  assert.equal(long.length, 120);
  assert.ok(long.endsWith(".xlsx"));
  assert.equal(withExtension("report", "text/csv"), "report.csv");
  assert.equal(withExtension("report", "text/x-unknown"), "report.txt");
  assert.equal(withExtension("report.md", "text/csv"), "report.md");
  assert.equal(withExtension("blob", "application/x-unknown"), "blob");
});

test("content becomes file bytes of the right type", async () => {
  const csv = fileFromContent({ content: "name\nZürich\n", filename: "a.csv" });
  assert.equal(csv.name, "a.csv");
  assert.equal(csv.blob.type, "text/csv");
  assert.deepEqual(
    [...new Uint8Array(await csv.blob.arrayBuffer()).subarray(0, 4)],
    [0xef, 0xbb, 0xbf, 0x6e],
  );
  const ascii = fileFromContent({ content: "a,b\n", filename: "a.csv" });
  assert.equal(await ascii.blob.text(), "a,b\n");
  const typed = fileFromContent({
    content: "{}",
    filename: "data",
    mimeType: "application/json",
  });
  assert.equal(typed.name, "data.json");
  const plain = fileFromContent({ content: "hi" });
  assert.equal(plain.name, "download.txt");
  assert.equal(plain.blob.type, "text/plain");
  const bytes = fileFromContent({
    content: "AAEC/w==",
    encoding: "base64",
    filename: "raw.bin",
  });
  assert.deepEqual(
    [...new Uint8Array(await bytes.blob.arrayBuffer())],
    [0, 1, 2, 255],
  );
  const dataUrl = fileFromContent({
    content: "data:image/png;base64,iVBORw==",
    filename: "dir/pic",
  });
  assert.equal(dataUrl.name, "pic.png");
  assert.equal(dataUrl.blob.type, "image/png");
  assert.throws(
    () => fileFromContent({ content: "%%%", encoding: "base64" }),
    /not valid base64/,
  );
});

test("records state the outcome, never a guess", () => {
  const now = Date.parse("2026-10-14T10:00:10.000Z");
  const status = (values: Partial<chrome.downloads.DownloadItem>) =>
    downloadRecord(item(values), { now }).status;
  assert.equal(status({}), DOWNLOAD_STATUS.completed);
  assert.equal(
    status({ state: "interrupted", error: "USER_CANCELED" }),
    DOWNLOAD_STATUS.canceled,
  );
  assert.equal(
    status({ state: "interrupted", error: "NETWORK_FAILED" }),
    DOWNLOAD_STATUS.failed,
  );
  assert.equal(
    status({ state: "in_progress", danger: "file" }),
    DOWNLOAD_STATUS.needsConfirmation,
  );
  assert.equal(
    status({ state: "in_progress", danger: "asyncScanning" }),
    DOWNLOAD_STATUS.inProgress,
  );
  assert.equal(
    status({ state: "in_progress", paused: true }),
    DOWNLOAD_STATUS.paused,
  );
  assert.equal(
    status({ state: "in_progress", filename: "" }),
    DOWNLOAD_STATUS.choosingLocation,
  );
  assert.equal(
    downloadRecord(item({ state: "in_progress", filename: "" }), {
      now: Date.parse("2026-10-14T10:00:00.000Z") + CHOOSING_LOCATION_AFTER_MS,
    }).status,
    DOWNLOAD_STATUS.inProgress,
  );

  const done = downloadRecord(item({}), { now, mine: true });
  assert.deepEqual(
    {
      name: done.name,
      path: done.path,
      bytes: done.bytes,
      mine: done.mine,
      danger: done.danger,
    },
    {
      name: "report.pdf",
      path: "/home/mara/Downloads/report.pdf",
      bytes: 2_400_000,
      mine: true,
      danger: undefined,
    },
  );
  assert.equal(
    downloadLine(done),
    "#3 report.pdf: completed, 2.3 MB (application/pdf), saved at /home/mara/Downloads/report.pdf. From https://files.test/report.pdf.",
  );
  assert.match(
    downloadLine(
      downloadRecord(
        item({ state: "interrupted", error: "SERVER_BAD_CONTENT" }),
        {
          now,
          mine: true,
        },
      ),
    ),
    /: failed: the server has no such file \(for example HTTP 404\) \[SERVER_BAD_CONTENT\]\. Nothing usable was saved\./,
  );
  assert.match(
    downloadLine(
      downloadRecord(item({ state: "in_progress", danger: "file" }), { now }),
    ),
    /\(not started by you\): held by the browser.*danger: file.*keep it in the browser's downloads list/,
  );
  assert.match(
    downloadLine(
      downloadRecord(
        item({
          state: "in_progress",
          bytesReceived: 1_048_576,
          totalBytes: 4_194_304,
        }),
        { now, mine: true },
      ),
    ),
    /still downloading, 1\.0 MB of 4\.0 MB \(25%\)\. Call downloads wait with id 3/,
  );
  const moved = downloadRecord(item({ exists: false }), { now });
  assert.match(downloadLine(moved), /has since been moved or deleted/);
  const page = downloadRecord(
    item({ filename: "/d/report.html", mime: "text/html" }),
    { now },
  );
  assert.equal(page.warning, "html_page");
  assert.equal(
    downloadRecord(
      item({
        url: "https://files.test/export",
        finalUrl: "https://files.test/export",
        filename: "/d/export.html",
        mime: "text/html",
      }),
      { now },
    ).warning,
    undefined,
  );
  const data = downloadRecord(
    item({ url: `data:text/csv;base64,${"A".repeat(5000)}`, finalUrl: "" }),
    { now },
  );
  assert.equal(data.url, "data:text/csv;…");
  const redirected = downloadRecord(
    item({ finalUrl: "https://cdn.test/report.pdf" }),
    { now },
  );
  assert.match(
    downloadLine(redirected),
    /From https:\/\/files\.test\/report\.pdf \(redirected to https:\/\/cdn\.test\/report\.pdf\)\./,
  );
});

test("the side panel line says what became of each download", () => {
  const t = getMessages("en-US");
  const record = (values: Record<string, unknown>) => ({
    id: 1,
    name: "report.pdf",
    status: "completed",
    bytes: 2_400_000,
    ...values,
  });
  const line = (output: Record<string, unknown>, input = {}) =>
    downloadsDetail(input, output, t);
  assert.equal(line({ downloads: [record({})] }), "Saved report.pdf · 2.3 MB");
  assert.equal(
    line({
      downloads: [record({ status: "failed", error: "SERVER_BAD_CONTENT" })],
    }),
    "Couldn't download report.pdf: the file isn't on the server",
  );
  assert.equal(
    line({
      downloads: [record({ status: "failed", error: "NETWORK_TIMEOUT" })],
    }),
    "Couldn't download report.pdf: network error",
  );
  assert.equal(
    line({
      downloads: [
        record({ status: "in_progress", bytes: 25, totalBytes: 100 }),
      ],
    }),
    "Downloading report.pdf · 25%",
  );
  assert.equal(
    line({ downloads: [record({ warning: "html_page" })] }),
    "report.pdf is a web page, not the file",
  );
  assert.equal(
    line({ action: "list", downloads: [record({}), record({ id: 2 })] }),
    "2 downloads",
  );
  assert.equal(line({ action: "list", downloads: [] }), "No downloads");
  assert.equal(
    line({}, { action: "download", url: "https://x.test/a.pdf" }),
    "Downloaded · https://x.test/a.pdf",
  );
  assert.equal(
    downloadsDetail({}, { downloads: [record({})] }, getMessages("zh-CN")),
    "已保存 report.pdf · 2.3 MB",
  );
});
