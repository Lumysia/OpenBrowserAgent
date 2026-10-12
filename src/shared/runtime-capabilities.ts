// The Chrome debugger (CDP) backs trusted typing, runScript and devtools.
export function areCdpAvailable() {
  return !!(globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome
    ?.debugger;
}
