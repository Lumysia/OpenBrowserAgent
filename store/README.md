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

In the dashboard, put the `en-US` screenshots under Global screenshots, and each language's own set under Localized screenshots.
