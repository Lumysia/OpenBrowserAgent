# Installation and Packaging

OpenBrowserAgent is currently installed from a source build. The default build targets Chromium-based browsers; Firefox and Safari targets are also available.

## Requirements

- Node.js and npm.
- A Chromium-based browser for the default Chrome MV3 build.
- Optional: Firefox for the Firefox build target.
- Optional: Safari and Xcode for loading or packaging the Safari MV2 build.

## Install From Source

Install dependencies:

```bash
npm install
```

Create a production build:

```bash
npm run build
```

The unpacked extension is generated under `.output/chrome-mv3`. To load it:

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select `.output/chrome-mv3`.

## Development

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

Create the production Chromium MV3 build:

```bash
npm run build
```

The unpacked extension is generated under:

```text
.output/chrome-mv3
```

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

For manual testing, unzip the package and load it as an unpacked extension. For store distribution, submit the generated zip artifact.

## Provider Setup

Open the extension settings and select Providers.

The UI supports these add-provider entries:

- OpenAI-compatible
- OpenAI Responses
- Anthropic-compatible
- Ollama
- Gemini

The provider registry also includes OpenRouter, AIHubMix, DeepSeek, Z.ai / GLM, Vercel AI Gateway, and Minimax.

Each provider can define display name, API key where applicable, base URL where applicable, fetched models, custom models, default chat model, and image model settings.
