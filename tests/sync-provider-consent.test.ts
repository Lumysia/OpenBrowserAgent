import assert from "node:assert/strict";
import test from "node:test";
import {
  providerHasConsent,
  withProviderConsent,
} from "../src/shared/provider-consent";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import type { ProviderConfig } from "../src/shared/types";
import { ALL_ON, device, memoryServer, memoryTransport } from "./sync-fixtures";

// A provider's consent is stored with it, so it syncs with it: a provider
// synced to another device does not ask again, and providers from versions
// without consent read as needing it.

const PROVIDERS = STORAGE_KEYS.provider;
type Providers = Record<string, ProviderConfig>;

function pair() {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  return { clock, a, b };
}

const openai: ProviderConfig = {
  id: "openai",
  type: "openai",
  apiKey: "sk-1",
  baseUrl: "https://api.openai.com/v1",
  models: [{ id: "openai:gpt", name: "gpt" }],
};

test("consent given on one device holds on the other, and withdrawing it syncs too", async () => {
  const { clock, a, b } = pair();
  await a.set(PROVIDERS, { openai: withProviderConsent(openai, true, 7) });
  await a.sync("edit");
  await b.sync();
  const synced = b.get<Providers>(PROVIDERS).openai;
  assert.deepEqual(synced.consent, { host: "api.openai.com", grantedAt: 7 });
  assert.equal(providerHasConsent(synced), true);

  clock.now += 60_000;
  await b.set(PROVIDERS, {
    openai: withProviderConsent(b.get<Providers>(PROVIDERS).openai, false),
  });
  await b.sync("edit");
  await a.sync();
  for (const on of [a, b]) {
    const provider = on.get<Providers>(PROVIDERS).openai;
    assert.equal("consent" in provider, false, on.name);
    assert.equal(providerHasConsent(provider), false, on.name);
  }
});

test("a provider from an older version has no consent and keeps working through sync", async () => {
  const { clock, a, b } = pair();
  // Written by a version without consent: no field.
  await a.set(PROVIDERS, { openai });
  await a.sync("edit");
  await b.sync();
  assert.equal(providerHasConsent(b.get<Providers>(PROVIDERS).openai), false);

  // B agrees while A, still the older version, changes the key: both
  // changes are kept.
  clock.now += 60_000;
  await b.set(PROVIDERS, {
    openai: withProviderConsent(b.get<Providers>(PROVIDERS).openai, true, 9),
  });
  clock.now += 60_000;
  await a.set(PROVIDERS, { openai: { ...openai, apiKey: "sk-2" } });
  await b.sync("edit");
  await a.sync("edit");
  await b.sync();
  for (const on of [a, b]) {
    const provider = on.get<Providers>(PROVIDERS).openai;
    assert.equal(provider.apiKey, "sk-2", on.name);
    assert.deepEqual(
      provider.consent,
      { host: "api.openai.com", grantedAt: 9 },
      on.name,
    );
  }

  // An older version that edits the provider in its form keeps fields it
  // does not know; moving it to another host leaves the consent invalid.
  clock.now += 60_000;
  await a.set(PROVIDERS, {
    openai: {
      ...a.get<Providers>(PROVIDERS).openai,
      baseUrl: "https://proxy.example.com/v1",
    },
  });
  await a.sync("edit");
  await b.sync();
  const moved = b.get<Providers>(PROVIDERS).openai;
  assert.equal(moved.consent?.host, "api.openai.com");
  assert.equal(providerHasConsent(moved), false);
});
