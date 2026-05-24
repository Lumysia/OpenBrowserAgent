# OpenBrowserAgent Local Execution Bridge

Native Messaging bridge installer and runtime for OpenBrowserAgent.

Install the local execution bridge and create a command config. Choose the browser you use, such as `chrome`, `edge`, `brave`, `vivaldi`, `chromium`, or `firefox`. For common Linux packaged browsers, use targets such as `firefox-flatpak`, `chromium-flatpak`, `brave-flatpak`, `firefox-snap`, or `chromium-snap`.

On macOS, `chrome`, `edge`, `brave`, `vivaldi`, `chromium`, and `firefox` are supported. Safari is not supported by this bridge because OpenBrowserAgent's Safari build does not use this Native Messaging API.

```bash
npx openbrowseragent-local-execution-bridge@1 install --browser chrome --extension-id <extension-id> --command <local-cli-command> --command-id default
```

Example for Firefox:

```bash
npx openbrowseragent-local-execution-bridge@1 install --browser firefox --extension-id <extension-id> --command <local-cli-command> --command-id default
```

The installer writes a stable local bridge runtime, a wrapper executable, a Native Messaging manifest, and a bridge config containing a generated secret. It prints JSON with the values to enter in OpenBrowserAgent.

The Native Messaging manifest points to the generated wrapper path, not to `npx`.

Uninstall the native host files:

```bash
npx openbrowseragent-local-execution-bridge@1 uninstall
```

This removes the browser registrations for supported browsers, the generated wrapper, copied bridge runtime, and bridge config. Add `--browser chrome` or another browser target to clean only one browser registration. Add `--keep-config` if you want to preserve the command config and secret.
