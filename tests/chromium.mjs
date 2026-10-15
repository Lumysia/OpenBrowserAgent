import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { OPTIONS_HASH } from "../src/shared/config.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";

// Headed unless OBA_HEADLESS=1 (CI and containers without a display).
export const HEADED = process.env.OBA_HEADLESS !== "1";

const CHROMIUM_NAMES = [
  "chromium",
  "chromium-browser",
  "google-chrome",
  "google-chrome-stable",
];

// CHROMIUM, or the first Chromium on PATH.
function chromiumPath() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  for (const name of CHROMIUM_NAMES)
    try {
      return execFileSync("which", [name], { encoding: "utf8" }).trim();
    } catch {
      // Not installed under this name.
    }
  throw new Error(
    `No Chromium found: set CHROMIUM or install one of ${CHROMIUM_NAMES.join(", ")}.`,
  );
}

// The ID Chromium gives an unpacked extension: from the manifest key when it
// has one, otherwise from its absolute path, as 32 hex digits spelled a-p.
// Other extensions can run service workers too (Chrome for Testing ships
// component extensions), so the ID can't be taken from the first one seen.
async function unpackedExtensionId(directory) {
  const { key } = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  );
  const source = key ? Buffer.from(key, "base64") : await realpath(directory);
  return createHash("sha256")
    .update(source)
    .digest("hex")
    .slice(0, 32)
    .replace(/./g, (digit) => String.fromCharCode(97 + parseInt(digit, 16)));
}

// The production build (`npm run build:chrome`) in a disposable profile.
export async function launchExtension({
  headed = HEADED,
  args = [],
  extension = resolve(".output/chrome-mv3"),
  // Browser preferences the profile starts with (Default/Preferences).
  preferences,
  // How long one CDP call may take.
  cdpTimeoutMs = 180000,
  // Leave open the setup page the extension opens on install. By default it
  // is closed as if setup had been finished, so tests start from the tabs
  // they open themselves and the side panel opens.
  keepWelcome = false,
} = {}) {
  const executable = chromiumPath();
  const profile = await mkdtemp(
    join(process.env.OBA_PROFILE_DIR || tmpdir(), "oba-profile-"),
  );
  if (preferences) {
    await mkdir(resolve(profile, "Default"));
    await writeFile(
      resolve(profile, "Default/Preferences"),
      JSON.stringify(preferences),
    );
  }
  // Credentials are passed only through CDP to the disposable extension storage.
  // They are neither Chromium command arguments nor inherited environment values.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("OBA_")),
  );
  const child = spawn(
    executable,
    [
      ...(headed ? [] : ["--headless=new"]),
      "--no-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      // Chrome builds turn on field-trial features (e.g. one that serves the
      // default search engine's pages past CDP Fetch); test plain defaults.
      "--disable-field-trial-config",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      `--user-data-dir=${profile}`,
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--remote-debugging-port=0",
      ...args,
      "about:blank",
    ],
    {
      env: { ...env, XDG_CONFIG_HOME: profile, XDG_CACHE_HOME: profile },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let stderr = "";
  let launchError;
  child.on("error", (error) => {
    launchError = error;
  });
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-16000);
  });
  const connections = [];
  const close = async () => {
    connections.forEach((connection) => connection.close());
    if (child.exitCode === null && !launchError) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
      await exited;
      clearTimeout(timer);
    }
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  };
  try {
    const ws = await poll(() => {
      if (launchError || child.exitCode !== null)
        throw new Error(
          "Chromium launch failed; check CHROMIUM and DISPLAY. " +
            (/Missing X server|cannot open display|Failed to open.*display/i.test(
              stderr,
            )
              ? "The configured X display is unavailable."
              : /Authorization required|No protocol specified/i.test(stderr)
                ? "The configured X display requires authorization."
                : `Process exit code: ${child.exitCode}; spawn error: ${launchError?.code || "none"}.`),
        );
      return stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
    });
    const targetsUrl = `http://${new URL(ws).host}/json/list`;
    const targets = async () => (await fetch(targetsUrl)).json();
    const id = await unpackedExtensionId(extension);
    // The extension has loaded once its service worker runs.
    await poll(async () =>
      (await targets()).some(
        (target) =>
          target.type === "service_worker" &&
          target.url.startsWith(`chrome-extension://${id}/`),
      ),
    );
    const connectTo = (url) => connect(url, cdpTimeoutMs);
    const browser = await connectTo(ws);
    connections.push(browser);
    if (!keepWelcome) {
      const welcome = await poll(async () =>
        (await targets()).find(
          (target) =>
            target.type === "page" &&
            target.url ===
              `chrome-extension://${id}/options.html${OPTIONS_HASH.welcome}`,
        ),
      );
      const setup = await connectTo(welcome.webSocketDebuggerUrl);
      await poll(() =>
        setup
          .call(
            (key) =>
              chrome.storage?.local?.set({ [key]: true }).then(() => true),
            STORAGE_KEYS.setupDone,
          )
          .catch(() => false),
      );
      setup.close();
      await browser.send("Target.closeTarget", { targetId: welcome.id });
    }
    // `options` are extra Target.createTarget parameters such as background.
    const open = async (url, options = {}) => {
      const { targetId } = await browser.send("Target.createTarget", {
        ...options,
        url,
      });
      const target = await poll(async () =>
        (await targets()).find((item) => item.id === targetId),
      );
      const page = await connectTo(target.webSocketDebuggerUrl);
      connections.push(page);
      await loaded(page, url);
      return page;
    };
    // Connect to an existing target, e.g. a tab the extension opened or its
    // service worker.
    // A page or frame target is listed with the URL it is going to before
    // that document commits; until then it holds the initial about:blank
    // document (no extension APIs), so wait for its own document to load.
    // A service worker target can show up while the worker is still
    // starting (or one that is stopping), before extension APIs exist in
    // it; wait for a connection whose `chrome.runtime` is there.
    const attach = async (matches, type = "page") => {
      const find = () =>
        poll(async () =>
          (await targets()).find(
            (item) => item.type === type && matches(item.url),
          ),
        );
      if (type !== "service_worker") {
        const target = await find();
        const page = await connectTo(target.webSocketDebuggerUrl);
        connections.push(page);
        await loaded(page, target.url);
        return page;
      }
      return poll(async () => {
        const worker = await connectTo((await find()).webSocketDebuggerUrl);
        const ready = await worker
          .call(() => typeof chrome !== "undefined" && !!chrome.runtime?.id)
          .catch(() => false);
        if (!ready) {
          worker.close();
          return undefined;
        }
        connections.push(worker);
        return worker;
      });
    };
    return { id, browser, open, attach, targets, close, profile };
  } catch (error) {
    await close();
    throw error;
  }
}

// Waits until `page` shows `url`, loaded, with the extension's APIs on an
// extension page. A check that runs as the document commits fails with its
// context; the next one runs in the new document.
function loaded(page, url) {
  return poll(() =>
    page
      .call((requestedUrl) => {
        const expected = new URL(requestedUrl);
        return (
          location.href === expected.href &&
          document.readyState === "complete" &&
          (expected.protocol !== "chrome-extension:" ||
            typeof globalThis.chrome?.storage?.local?.set === "function")
        );
      }, url)
      .catch(() => false),
  );
}

export async function poll(getValue, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = await getValue();
    if (value) return value;
    await delay(50);
  }
  throw new Error("Browser check timed out");
}

// Waits until the page is visually at rest: fonts loaded, no finite
// animation or transition running, and two frames drawn after that (when
// the page is visible).
export async function settled(page, timeoutMs = 15000) {
  await poll(
    () =>
      page.call(async () => {
        await document.fonts.ready;
        // Hidden pages (background tabs) advance no animations.
        if (document.hidden) return true;
        return document
          .getAnimations()
          .every(
            (animation) =>
              animation.playState !== "running" ||
              animation.effect?.getTiming().iterations === Infinity,
          );
      }),
    timeoutMs,
  );
  await nextFrames(page);
}

// Two frames of a visible page have run (hidden pages draw none).
export function nextFrames(page) {
  return page.call(
    () =>
      document.hidden ||
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))),
      ),
  );
}

async function connect(url, timeoutMs) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("CDP connection failed")),
      { once: true },
    );
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    if (message.method)
      listeners
        .get(message.method)
        ?.forEach((listener) => listener(message.params));
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(`CDP ${waiter.method} failed`));
    else waiter.resolve(message.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const current = ++id;
      const timer = setTimeout(() => {
        pending.delete(current);
        reject(new Error(`CDP ${method} timed out`));
      }, timeoutMs);
      pending.set(current, { resolve, reject, timer, method });
      socket.send(JSON.stringify({ id: current, method, params }));
    });
  return {
    send,
    // Listens to a CDP event, such as Fetch.requestPaused.
    on(method, listener) {
      listeners.set(method, [...(listeners.get(method) || []), listener]);
    },
    async call(fn, argument) {
      const result = await send("Runtime.evaluate", {
        expression: `(${fn.toString()})(${JSON.stringify(argument) ?? "undefined"})`,
        awaitPromise: true,
        returnByValue: true,
      });
      // Do not print exceptionDetails: CDP can include the expression/credentials.
      if (result.exceptionDetails) {
        const details = result.exceptionDetails;
        const name = details.exception?.className;
        const safeName = [
          "Error",
          "TypeError",
          "ReferenceError",
          "SyntaxError",
        ].includes(name)
          ? name
          : "OtherError";
        // Only built-in type and numeric locations: expressions, error messages,
        // stacks, provider configuration and model text must never be printed.
        throw new Error(
          `Extension evaluation failed: ${JSON.stringify({ name: safeName, line: details.lineNumber, column: details.columnNumber })}`,
        );
      }
      return result.result?.value;
    },
    close() {
      for (const waiter of pending.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error("CDP closed"));
      }
      pending.clear();
      socket.close();
    },
  };
}
