import assert from "node:assert/strict";
import { test } from "node:test";
import { watchOpenedTabs } from "../src/background/user-focus";
import { eventListeners, fakeTabs, installChrome } from "./fake-chrome";

const AGENT = 1;
const USER = 2;

// The agent's tab in front, the user's tab behind it, and the browser's
// events; `whileReading` runs while the watch reads the tabs in front, after
// the browser answered.
function installBrowser(whileReading = () => {}) {
  const { api, state } = fakeTabs(
    [
      { id: AGENT, url: "https://agent.test/" },
      { id: USER, url: "https://user.test/" },
    ],
    AGENT,
  );
  const onActivated =
    eventListeners<(info: { tabId: number; windowId: number }) => void>();
  const onCreatedNavigationTarget =
    eventListeners<(details: { sourceTabId: number; tabId: number }) => void>();
  const activate = (tabId: number) => {
    state.active = tabId;
    onActivated.emit({ tabId, windowId: 1 });
  };
  installChrome({
    tabs: {
      ...api,
      query: async (info: chrome.tabs.QueryInfo) => {
        const tabs = await api.query(info);
        whileReading();
        return tabs;
      },
      update: async (id: number, props: chrome.tabs.UpdateProperties) => {
        const tab = await api.update(id, props);
        if (props.active) onActivated.emit({ tabId: id, windowId: 1 });
        return tab;
      },
      onActivated,
    },
    webNavigation: { onCreatedNavigationTarget },
  });
  // The agent's page opens a tab, which the browser brings to the front.
  const openFromAgentPage = async () => {
    const { id } = await api.create({ url: "https://agent.test/more" });
    activate(id!);
    onCreatedNavigationTarget.emit({ sourceTabId: AGENT, tabId: id! });
    return id!;
  };
  return { state, activate, openFromAgentPage };
}

test("a tab the agent's page opens goes behind the tab the user switched to", async () => {
  const browser = installBrowser();
  const watch = await watchOpenedTabs(AGENT);
  browser.activate(USER);
  const opened = await browser.openFromAgentPage();
  assert.deepEqual(await watch.stop(), [opened]);
  assert.equal(browser.state.active, USER);
});

test("a switch the user makes while the watch starts is not lost", async () => {
  let switched = false;
  const browser = installBrowser(() => {
    if (switched) return;
    switched = true;
    browser.activate(USER);
  });
  const watch = await watchOpenedTabs(AGENT);
  await browser.openFromAgentPage();
  await watch.stop();
  assert.equal(browser.state.active, USER);
});

test("with the agent's tab in front, the opened tab stays in front", async () => {
  const browser = installBrowser();
  const watch = await watchOpenedTabs(AGENT);
  const opened = await browser.openFromAgentPage();
  await watch.stop();
  assert.equal(browser.state.active, opened);
});
