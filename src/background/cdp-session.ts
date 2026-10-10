import { abortable } from "../shared/cancellation";
import { resolveCdpTarget, targetAliases, type CdpTarget } from "./cdp-target";

export type CdpSend = (
  command: string,
  params?: Record<string, unknown>,
) => Promise<Record<string, any>>;
export type CdpRun = {
  <T>(
    args: Record<string, unknown>,
    run: (send: CdpSend) => Promise<T>,
    retain?: true,
  ): Promise<T>;
  release(args: Record<string, unknown>): Promise<void>;
};

type Session = {
  aliases: Set<string>;
  target: chrome.debugger.Debuggee;
  attached: boolean;
  retained: boolean;
  cleanupRequired: boolean;
  detaching?: Promise<void>;
  detached: AbortController;
  done: Promise<void>;
  release: () => void;
  unobserve: () => void;
};

// Each API has its own owners/listeners. Admission/attachment is serialized to
// learn aliases before admitting another route; commands on distinct pages run
// concurrently. Waiters release admission while another call owns their page.
class CdpSessions {
  private owners = new Map<string, Session>();
  private admission = Promise.resolve();

  constructor(private api: typeof chrome.debugger) {}

  private admit<T>(run: () => Promise<T>) {
    const result = this.admission.then(run);
    this.admission = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  async acquire(
    args: Record<string, unknown>,
    signal?: AbortSignal,
    releaseOnly = false,
  ): Promise<Session> {
    let selected: CdpTarget | undefined;
    for (;;) {
      const result = await this.admit(async () => {
        signal?.throwIfAborted();
        // Waiting for an owner must not reselect a different active page.
        selected ??= await resolveCdpTarget(this.api, args, signal);
        signal?.throwIfAborted();
        if (
          this.owners.size &&
          !selected.aliases.some((alias) => alias.startsWith("target:"))
        ) {
          // A retained target-first attachment may outlive discovery support.
          // Chrome accepts its tab alias for this read-only identity query.
          const info = (await abortable(
            this.api
              .sendCommand(selected.candidates[0], "Target.getTargetInfo")
              .catch(() => undefined),
            signal,
          )) as { targetInfo?: { targetId?: string } } | undefined;
          if (info?.targetInfo?.targetId)
            selected.aliases.push(`target:${info.targetInfo.targetId}`);
        }
        const matches = new Set(
          selected.aliases
            .map((alias) => this.owners.get(alias))
            .filter(Boolean),
        );
        if (matches.size > 1)
          throw new Error(
            "CDP attachment identities conflict; cleanup is required.",
          );
        let session = [...matches][0];
        if (session) {
          this.bind(session, selected.aliases);
          if (session.release !== idle) return { wait: session.done };
          // An unconfirmed detach can leave commands executing. No next tool
          // may send page commands until cleanup succeeds.
          if (session.cleanupRequired && !releaseOnly)
            await this.detach(session);
          if (!session.attached) {
            this.forget(session);
            session = undefined;
          }
        }
        if (!session) session = await this.attach(selected, signal);
        session.done = new Promise<void>((resolve) => {
          session!.release = resolve;
        });
        return { session };
      });
      if (result.session) return result.session;
      await abortable(result.wait!, signal);
    }
  }

  private bind(session: Session, aliases: string[]) {
    for (const alias of aliases) {
      const owner = this.owners.get(alias);
      if (owner && owner !== session)
        throw new Error("CDP attachment identity is already owned.");
    }
    for (const alias of aliases) {
      session.aliases.add(alias);
      this.owners.set(alias, session);
    }
  }

  private async attach(selected: CdpTarget, signal?: AbortSignal) {
    const errors: string[] = [];
    for (const target of selected.candidates) {
      signal?.throwIfAborted();
      const session: Session = {
        aliases: new Set(selected.aliases),
        target,
        attached: false,
        retained: false,
        cleanupRequired: false,
        detached: new AbortController(),
        done: Promise.resolve(),
        release: idle,
        unobserve: idle,
      };
      const onDetach = (source: chrome.debugger.Debuggee) => {
        if (targetAliases(source).some((alias) => session.aliases.has(alias)))
          this.confirmDetached(session);
      };
      this.api.onDetach.addListener(onDetach);
      session.unobserve = () => this.api.onDetach.removeListener(onDetach);
      try {
        // Do not abandon a pending native attach on abort: observe its eventual
        // outcome and clean it before allowing another admission.
        await this.api.attach(target, "1.3");
      } catch (error) {
        session.unobserve();
        signal?.throwIfAborted();
        errors.push(String(error));
        continue;
      }
      if (session.detached.signal.aborted) throw session.detached.signal.reason;
      session.attached = true;
      this.bind(session, selected.aliases);
      try {
        signal?.throwIfAborted();
        // When enumeration was unavailable, a tab attachment can still learn
        // its target alias before another caller uses that route.
        if (!selected.aliases.some((alias) => alias.startsWith("target:"))) {
          const info = (await abortable(
            this.api.sendCommand(target, "Target.getTargetInfo"),
            signal,
          ).catch((error) => {
            signal?.throwIfAborted();
            return undefined;
          })) as { targetInfo?: { targetId?: string } } | undefined;
          if (info?.targetInfo?.targetId)
            this.bind(session, [`target:${info.targetInfo.targetId}`]);
        }
        signal?.throwIfAborted();
        session.detached.signal.throwIfAborted();
        return session;
      } catch (error) {
        await this.detach(session).catch(() => {});
        if (!session.attached) this.forget(session);
        throw error;
      }
    }
    throw new Error(`Unable to attach CDP target. ${errors.join("; ")}`);
  }

  private confirmDetached(session: Session) {
    session.attached = false;
    session.retained = false;
    session.cleanupRequired = false;
    session.detached.abort(new Error("CDP session detached."));
    session.unobserve();
    if (session.release === idle) this.forget(session);
  }

  private forget(session: Session) {
    for (const alias of session.aliases)
      if (this.owners.get(alias) === session) this.owners.delete(alias);
    session.unobserve();
  }

  async detach(session: Session): Promise<void> {
    if (!session.attached) return;
    if (session.detaching) return session.detaching;
    session.cleanupRequired = true;
    session.detaching = Promise.resolve().then(async () => {
      try {
        await this.api.detach(session.target);
        this.confirmDetached(session);
      } catch (error) {
        // Only a matching onDetach event confirms cleanup after rejection.
        // Enumeration/error text alone cannot establish attachment ownership.
        if (session.attached)
          throw new Error(
            `CDP detach failed; cleanup is unconfirmed and can be retried: ${String(error)}`,
          );
      } finally {
        session.detaching = undefined;
      }
    });
    return session.detaching;
  }

  async run<T>(
    args: Record<string, unknown>,
    run: (send: CdpSend) => Promise<T>,
    retain?: boolean,
    signal?: AbortSignal,
  ) {
    const session = await this.acquire(args, signal, retain === false);
    const abort = () => {
      void this.detach(session).catch(() => {});
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      signal?.throwIfAborted();
      session.detached.signal.throwIfAborted();
      const result = await run(async (command, params) => {
        signal?.throwIfAborted();
        session.detached.signal.throwIfAborted();
        const result = await abortable(
          abortable(
            this.api.sendCommand(session.target, command, params),
            signal,
          ),
          session.detached.signal,
        );
        signal?.throwIfAborted();
        return (result || {}) as Record<string, any>;
      });
      signal?.throwIfAborted();
      if (retain !== undefined) session.retained = retain;
      return result;
    } finally {
      signal?.removeEventListener("abort", abort);
      try {
        if (signal?.aborted || !session.retained) await this.detach(session);
      } finally {
        session.release();
        session.release = idle;
        if (!session.attached) this.forget(session);
      }
    }
  }
}

function idle() {}
const managers = new WeakMap<typeof chrome.debugger, CdpSessions>();

export function createCdpRun(signal?: AbortSignal): CdpRun {
  const execute = <T>(
    args: Record<string, unknown>,
    run: (send: CdpSend) => Promise<T>,
    retain?: boolean,
  ) => {
    signal?.throwIfAborted();
    const api = chrome.debugger;
    let manager = managers.get(api);
    if (!manager) {
      manager = new CdpSessions(api);
      managers.set(api, manager);
    }
    return abortable(manager.run(args, run, retain, signal), signal);
  };
  return Object.assign(execute, {
    release: (args: Record<string, unknown>) =>
      execute(args, async () => {}, false),
  });
}

export async function cdpEvaluate(
  run: CdpRun,
  args: Record<string, unknown>,
  expression: string,
) {
  const result = await run(args, (send) =>
    send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }),
  );
  return {
    value: result.result?.value,
    exception: result.exceptionDetails?.text,
  };
}

export function cdpCall(
  run: CdpRun,
  args: Record<string, unknown>,
  fn: string,
  values: unknown[],
) {
  return cdpEvaluate(
    run,
    args,
    `(${fn})(...${JSON.stringify(values.map((value) => value ?? null))})`,
  );
}
