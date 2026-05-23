export function getBrowserApi() {
  const apiGlobal = globalThis as typeof globalThis & {
    browser?: typeof chrome;
    chrome?: typeof chrome;
  };
  return apiGlobal.browser ?? apiGlobal.chrome ?? chrome;
}
