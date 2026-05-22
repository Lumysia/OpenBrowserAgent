# Installation and Packaging

## Requirements

- Node.js and npm.
- A Chromium-based browser for the default Chrome MV3 build.
- Optional: Firefox for the Firefox build target.
- Optional: Safari and Xcode for loading or packaging the Safari MV2 build.

## Development

Install dependencies:

```bash
npm install
```

Run WXT development mode:

```bash
npm run dev
```

Firefox development mode:

```bash
npm run dev:firefox
```

Safari development mode:

```bash
npm run dev:safari
```

## Build

Create the production Chrome MV3 build:

```bash
npm run build
```

The unpacked extension is generated under:

```text
.output/chrome-mv3
```

Load it in Chrome or Edge:

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select `.output/chrome-mv3`.

Firefox build:

```bash
npm run build:firefox
```

The unpacked Firefox extension is generated under:

```text
.output/firefox-mv2
```

Safari build:

```bash
npm run build:safari
```

The unpacked Safari extension is generated under:

```text
.output/safari-mv2
```

Safari does not support Chrome's `sidePanel` manifest entry in this target. In Safari-compatible builds, clicking the extension action opens or focuses `sidepanel.html` as an extension tab instead.

## Zip Package

Create a zip package with the project script:

```bash
npm run zip
```

The script runs WXT packaging and then renames the generated zip with the current short git commit hash.

Evidence: `package.json`, `scripts/rename-zip-with-hash.mjs`.

Recommended release flow:

```bash
npm ci
npm run compile
npm run build
npm run build:firefox
npm run build:safari
npm run zip
```

For manual testing, unzip the package and load it as an unpacked extension. For store distribution, submit the generated zip artifact.

## Provider Setup

Open provider settings from the Options page:

```text
options.html#/providers
```

The UI supports these add-provider entries:

- OpenAI-compatible
- OpenAI Responses
- Anthropic-compatible
- Ollama
- Gemini

The provider registry also includes OpenRouter, AIHubMix, DeepSeek, Z.ai / GLM, Vercel AI Gateway, and Minimax.

Each provider can define display name, API key where applicable, base URL where applicable, fetched models, custom models, default chat model, and image model settings.

## Default Provider URLs

- OpenAI-compatible: `https://api.openai.com/v1`
- OpenAI Responses: `https://api.openai.com/v1`
- Anthropic-compatible: `https://api.anthropic.com/v1`
- OpenRouter: `https://openrouter.ai/api/v1`
- AIHubMix: `https://aihubmix.com/v1`
- DeepSeek: `https://api.deepseek.com/v1`
- Z.ai / GLM: `https://api.z.ai/api/paas/v4`
- Vercel AI Gateway: `https://api.ai-gateway.workers.dev/v1`
- Minimax: `https://api.minimax.io/v1`
- Ollama: `http://localhost:11434`

Evidence: `src/shared/provider-urls.ts`, `entrypoints/options/providers-page.tsx`, `entrypoints/options/provider-models.ts`, `entrypoints/options/test-provider-model.ts`.

## Verification Commands

Run these before a release:

```bash
npm run compile
npm run build
npm run build:firefox
npm run build:safari
npm audit --json
```

The current build may show a Vite/WXT chunk-size warning. That warning does not fail the build, but it should be monitored as dependencies and UI features grow.
