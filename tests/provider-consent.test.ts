import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import {
  resolveHelperModel,
  resolveImageModel,
  resolveModel,
} from "../src/background/model-resolver";
import { runSubAgentChat } from "../src/background/sub-agent-run";
import * as sessions from "../src/background/stream-sessions";
import { DEFAULT_AGENT } from "../src/shared/agents";
import { DEFAULT_PREFERENCES } from "../src/shared/default-preferences";
import { getMessages } from "../src/shared/i18n";
import { chooseChatModel } from "../src/shared/model-choice";
import {
  isLocalHost,
  providerConsentHost,
  providerHasConsent,
  providerNeedsConsent,
  withProviderConsent,
} from "../src/shared/provider-consent";
import { storage } from "../src/shared/storage";
import type { ProviderConfig, ProviderState } from "../src/shared/types";
import { ProviderConsentError, userErrorText } from "../src/shared/user-errors";
import { installPiRuntimeBrowser } from "./pi-runtime-helpers";

installPiRuntimeBrowser();
afterEach(() => mock.restoreAll());

const at = (baseUrl: string, type: ProviderConfig["type"] = "openai") => ({
  type,
  baseUrl,
});

test("hosts on this device or the local network need no consent", () => {
  for (const host of [
    "localhost",
    "LOCALHOST",
    "app.localhost",
    "nas.local",
    "nas.local.",
    "127.0.0.1",
    "127.8.9.10",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.20",
    "169.254.1.1",
    "0.0.0.0",
    "::1",
    "[::1]",
    "::",
    "fd12:3456::1",
    "fc00::1",
    "fe80::1",
    "[fe80::1%25eth0]",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:c0a8:101",
  ])
    assert.equal(isLocalHost(host), true, host);
  for (const host of [
    "api.openai.com",
    "local",
    "localhost.example.com",
    "mylocal",
    "8.8.8.8",
    "172.15.0.1",
    "172.32.0.1",
    "192.169.0.1",
    "11.0.0.1",
    "128.0.0.1",
    "256.1.1.1",
    "2001:db8::1",
    "::ffff:808:808",
    "::2",
    "fec0::1",
    "1:2:3:4:5:6:7:8:9",
    "1::2::3",
  ])
    assert.equal(isLocalHost(host), false, host);
});

test("providerNeedsConsent reads the endpoint from the base URL or the type's default", () => {
  const cases: Array<[ProviderConfig, boolean, string]> = [
    [at("https://api.openai.com/v1"), true, "api.openai.com"],
    [{ type: "openai" }, true, "api.openai.com"],
    [{ type: "anthropic" }, true, "api.anthropic.com"],
    [{ type: "gemini" }, true, "generativelanguage.googleapis.com"],
    [{ type: "ollama" }, false, "localhost:11434"],
    [at("http://localhost:11434", "ollama"), false, "localhost:11434"],
    [at("http://127.0.0.1:8080/v1"), false, "127.0.0.1:8080"],
    [at("http://[::1]:8080/v1"), false, "[::1]:8080"],
    [at("http://[2001:db8::1]:8080/v1"), true, "[2001:db8::1]:8080"],
    [at("http://192.168.0.2:1234/v1"), false, "192.168.0.2:1234"],
    [at("http://gpu-box.local:8000/v1"), false, "gpu-box.local:8000"],
    [at("https://API.Example.com:443/v1"), true, "api.example.com"],
    [at("https://api.example.com:8443/v1"), true, "api.example.com:8443"],
    [
      at("http://ollama.example.com:11434", "ollama"),
      true,
      "ollama.example.com:11434",
    ],
    [at("  https://proxy.example.com/v1  "), true, "proxy.example.com"],
  ];
  for (const [provider, needs, host] of cases) {
    assert.equal(providerNeedsConsent(provider), needs, provider.baseUrl);
    assert.equal(providerConsentHost(provider), host, provider.baseUrl);
  }
});

test("consent holds for the host it was given for, until it is withdrawn", () => {
  const provider = at("https://api.example.com/v1");
  assert.equal(providerHasConsent(provider), false);
  const allowed = withProviderConsent(provider, true, 42);
  assert.deepEqual(allowed.consent, { host: "api.example.com", grantedAt: 42 });
  assert.equal(providerHasConsent(allowed), true);
  // Another path on the same host keeps it; another host or port asks again.
  assert.equal(
    providerHasConsent({ ...allowed, baseUrl: "https://api.example.com/v2" }),
    true,
  );
  for (const baseUrl of [
    "https://other.example.com/v1",
    "https://api.example.com:8443/v1",
  ])
    assert.equal(providerHasConsent({ ...allowed, baseUrl }), false, baseUrl);
  const withdrawn = withProviderConsent(allowed, false);
  assert.equal("consent" in withdrawn, false);
  assert.equal(providerHasConsent(withdrawn), false);
  // Local endpoints never ask.
  assert.equal(providerHasConsent(at("http://localhost:1234/v1")), true);
});

function stored(providers: ProviderState, preferences = {}) {
  mock.method(storage.provider, "get", async () => providers);
  mock.method(storage.preferences, "get", async () => ({
    ...DEFAULT_PREFERENCES,
    ...preferences,
  }));
}

const remote = (
  extra: Partial<ProviderConfig> = {},
  host = "remote.example",
): ProviderConfig => ({
  type: "openai",
  baseUrl: `https://${host}/v1`,
  models: [{ id: `${host}:m`, name: "m" }],
  imageModels: [{ id: `${host}:img`, name: "img" }],
  ...extra,
});

test("every model request stops at the resolver until the provider has consent", async () => {
  const consent = { host: "remote.example", grantedAt: 1 };
  stored({ p: remote() }, { selectedImageModelId: "remote.example:img" });
  const chat = await resolveModel().catch((error) => error);
  assert.ok(chat instanceof ProviderConsentError);
  assert.equal(chat.providerId, "p");
  assert.equal(chat.host, "remote.example");
  await assert.rejects(resolveModel("remote.example:m"), ProviderConsentError);
  await assert.rejects(resolveImageModel(), ProviderConsentError);

  // The helper model is checked on its own.
  stored({
    p: remote({ consent }),
    h: remote({}, "helper.example"),
  });
  const chatModel = await resolveModel();
  assert.equal(chatModel.baseUrl, "https://remote.example/v1");
  await assert.rejects(
    resolveHelperModel("helper.example:m", chatModel),
    ProviderConsentError,
  );
  assert.equal(await resolveHelperModel(undefined, chatModel), chatModel);

  stored(
    { p: remote({ consent }) },
    { selectedImageModelId: "remote.example:img" },
  );
  assert.equal((await resolveImageModel()).modelName, "img");

  // Consent for another host (the base URL changed since) does not count.
  stored({ p: remote({ consent: { host: "old.example", grantedAt: 1 } }) });
  await assert.rejects(resolveModel(), ProviderConsentError);

  // Local providers never ask.
  stored({
    l: {
      type: "openai",
      baseUrl: "http://127.0.0.1:9/v1",
      models: [{ id: "l:m", name: "m" }],
    },
  });
  assert.equal((await resolveModel()).modelName, "m");
});

test("the stopped request tells the user in their language", () => {
  const error = new ProviderConsentError("p", "api.example.com");
  assert.match(
    userErrorText(error, getMessages("en-US")),
    /^api\.example\.com isn’t allowed/,
  );
  assert.match(
    userErrorText(error, getMessages("zh-CN")),
    /^api\.example\.com 尚未获准/,
  );
});

test("a sub-agent on a provider without consent sends nothing", async () => {
  stored({ p: remote() });
  const fetch = mock.method(globalThis, "fetch", async () => {
    throw new Error("nothing may be sent");
  });
  const result = await runSubAgentChat({
    agent: { ...DEFAULT_AGENT, toolGroups: [] },
    task: "do something",
    title: "t",
    parent: { chatId: "parent", toolCallId: "call" },
    onStart: () => {},
    onProgress: () => {},
  });
  sessions.abortSession(result.chatId);
  assert.equal(fetch.mock.callCount(), 0);
  // The parent model reads why (its chat shows it in the UI language).
  assert.match(
    result.error || "",
    /remote\.example needs the user's permission/,
  );
});

test("the chat model choice keeps the resolver's order", () => {
  const providers = {
    a: { type: "openai" as const, models: [{ id: "a1", name: "a1" }] },
    b: { type: "openai" as const, models: [{ id: "b1", name: "b1" }] },
  };
  const prefs = { ...DEFAULT_PREFERENCES, selectedModelId: "b1" };
  assert.equal(chooseChatModel(providers, prefs, "a1")?.providerId, "a");
  assert.equal(chooseChatModel(providers, prefs, "gone")?.providerId, "b");
  assert.equal(
    chooseChatModel(providers, { ...DEFAULT_PREFERENCES })?.providerId,
    "a",
  );
  assert.equal(chooseChatModel({}, prefs), undefined);
});
