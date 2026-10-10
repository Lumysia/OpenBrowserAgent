# Installation and Packaging

OpenBrowserAgent is currently installed from a source build. The default build targets Chromium-based browsers; Firefox and Safari targets are also available.

## Requirements

- Node.js 22.19.0 or later in the 22.x line, or Node.js 24 or newer, and npm. Prefer a supported LTS release.
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

Firefox uses its native sidebar. DOM scripting, tab navigation, downloads, default-engine search, and the separately installed Native Messaging bridge use Firefox extension APIs. CDP tools require Chromium's `debugger` API and are unavailable in Firefox and Safari. Tab grouping requires a browser exposing the tab-group APIs. Safari has no default-engine search integration or local execution bridge in this project; its output still needs conversion and validation with Safari/Xcode on macOS.

For local execution bridge installation, lifecycle behavior, and browser-specific registration targets, see the [bridge guide](../packages/local-execution-bridge/README.md). Flatpak and Snap registration paths do not by themselves grant the sandbox access to host executables.

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
