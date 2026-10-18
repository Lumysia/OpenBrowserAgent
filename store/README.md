# Chrome Web Store assets

Everything the Chrome Web Store listing needs, kept with the code so a new release can refresh it.

- `listing/<locale>.txt`: store description for each UI language.
- `privacy-practices.txt`: answers for the Privacy practices tab. These are the single purpose, one justification per permission in the order the dashboard lists them, remote code, data usage and the privacy policy URL. Check it against `.output/chrome-mv3/manifest.json` when permissions change.
- `graphics/`: store icon (128×128), small promo tile (440×280) and marquee (1400×560). The icon sources are in `docs/assets/brand/`.
- `screenshots/<locale>/`: five 1280×800 screenshots per UI language, made by the extension itself:

  ```sh
  npm run build:chrome
  npm run store:screenshots -- --locale en-US
  ```

  Omit `--locale` to make every language. `demo/` holds the demo pages and the per-language texts the script uses.

The listing, the Privacy practices answers and `PRIVACY.md` are written so they stay correct across releases: no version numbers, counts, language lists, named built-in agents or skills, menu items, keyboard shortcuts or setting paths. Describe lasting capabilities and rules instead, and keep every listing file at the same line count as `en-US`. They need an edit only when a permission, a kind of data or a data recipient changes, or a capability is added or removed.

In the dashboard, put the `en-US` screenshots under Global screenshots, and each language's own set under Localized screenshots.

## Review history

Rejections and what fixed them, so the next listing change doesn't repeat them.

- 2026-10-14, 0.1.0, Keyword Spam (Yellow Argon): the description listed provider names ("OpenAI-compatible, Anthropic-compatible, Gemini, OpenRouter, DeepSeek, Ollama and other providers"), quoted in five languages. The store counts brand names, not punctuation: rewriting such a list as a sentence is also rejected. Fix: name only the API formats and local models, no brand list (#115). Keep third-party brand names out of the listing text, screenshots and promo images.
