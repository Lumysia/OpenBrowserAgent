// Stored settings every shot starts from: light theme, default pink accent.
export const BASE_PREFERENCES = {
  colorScheme: "light",
  accentColor: "pink",
  autoRetry: false,
  maxToolSteps: 20,
};

// The demo AI providers have names in the locale's words and neutral model
// names: the store counts third-party brand names in screenshots as keyword
// spam. Ids are the same in every locale.
const MAIN = "main";
const LOCAL = "local";
export const MAIN_MODEL_ID = `${MAIN}:assistant-large`;

const models = (provider, label, names) =>
  names.map((name) => ({
    id: `${provider}:${name}`,
    name,
    displayName: `${label} / ${name}`,
  }));

// The main AI provider, answering at `baseUrl`. A consent stored for its
// host keeps the prompt before the first message away; the key is a
// placeholder that the options page masks and nothing ever receives.
export function mainProvider(demo, baseUrl, apiKey = "") {
  const label = demo.providers.main;
  return {
    id: MAIN,
    type: "openai",
    label,
    baseUrl,
    apiKey,
    consent: { host: new URL(baseUrl).host, grantedAt: 1767225600000 },
    models: models(MAIN, label, [
      "assistant-large",
      "assistant-small",
      "assistant-vision",
    ]),
  };
}

const providers = (demo) => ({
  [MAIN]: mainProvider(
    demo,
    "https://api.example.com/v1",
    "sk-demo-0000000000000000000000000000",
  ),
  [LOCAL]: {
    id: LOCAL,
    type: "openai",
    label: demo.providers.local,
    baseUrl: "http://localhost:8080/v1",
    apiKey: "",
    models: models(LOCAL, demo.providers.local, ["local-small"]),
  },
});

// Seeds the settings shots through the options page itself, then reloads it.
export async function seedOptions(page, demo) {
  await page.call(
    async (values) => {
      await chrome.storage.local.set({
        provider: values.providers,
        language: values.locale,
        preferences: values.preferences,
      });
    },
    {
      providers: providers(demo),
      locale: demo.locale,
      preferences: { ...BASE_PREFERENCES, selectedModelId: MAIN_MODEL_ID },
    },
  );
  await page.send("Page.reload");
}
