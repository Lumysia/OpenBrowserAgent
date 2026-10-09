import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export async function launchExtension({ headed = true } = {}) {
  const profile = await mkdtemp(resolve(".output/pi-browser-profile-"));
  const extension = resolve(".output/chrome-mv3");
  // Credentials are passed only through CDP to the disposable extension storage.
  // They are neither Chromium command arguments nor inherited environment values.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("OBA_")),
  );
  const child = spawn(
    process.env.CHROMIUM || "/usr/bin/chromium",
    [
      ...(headed ? [] : ["--headless=new"]),
      "--no-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      `--user-data-dir=${profile}`,
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--remote-debugging-port=0",
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
    await rm(profile, { recursive: true, force: true });
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
    const worker = await poll(async () =>
      (await targets()).find(
        (target) =>
          target.type === "service_worker" &&
          target.url.startsWith("chrome-extension://"),
      ),
    );
    const id = new URL(worker.url).host;
    const browser = await connect(ws);
    connections.push(browser);
    const open = async (url) => {
      const { targetId } = await browser.send("Target.createTarget", { url });
      const target = await poll(async () =>
        (await targets()).find((item) => item.id === targetId),
      );
      const page = await connect(target.webSocketDebuggerUrl);
      connections.push(page);
      await poll(() => page.call(() => document.readyState === "complete"));
      return page;
    };
    return { id, browser, open, close };
  } catch (error) {
    await close();
    throw error;
  }
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

async function connect(url) {
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
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
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
      }, 180000);
      pending.set(current, { resolve, reject, timer, method });
      socket.send(JSON.stringify({ id: current, method, params }));
    });
  return {
    send,
    async call(fn, argument) {
      const result = await send("Runtime.evaluate", {
        expression: `(${fn.toString()})(${JSON.stringify(argument) ?? "undefined"})`,
        awaitPromise: true,
        returnByValue: true,
      });
      // Do not print exceptionDetails: CDP can include the expression/credentials.
      if (result.exceptionDetails)
        throw new Error("Extension evaluation failed");
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
