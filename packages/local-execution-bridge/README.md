# OpenBrowserAgent Local Execution Bridge

Native Messaging bridge installer and runtime for OpenBrowserAgent.

Install the local execution bridge and create a shell bridge config. Choose the browser you use, such as `chrome`, `edge`, `brave`, `vivaldi`, `chromium`, or `firefox`.

On macOS, `chrome`, `edge`, `brave`, `vivaldi`, `chromium`, and `firefox` are supported. Safari is not supported by this bridge because OpenBrowserAgent's Safari build does not use this Native Messaging API.

```bash
npx openbrowseragent-local-execution-bridge@1 install --browser chrome --extension-id <extension-id> --command-id default
```

Example for Firefox:

```bash
npx openbrowseragent-local-execution-bridge@1 install --browser firefox --extension-id <extension-id> --command-id default
```

The installer writes a stable local bridge runtime, a wrapper executable, a Native Messaging manifest, and a bridge config containing a generated secret. It prints JSON with the values to enter in OpenBrowserAgent. When OpenBrowserAgent tests the bridge, the bridge reports the shell, basic environment, and detected local CLI tools it can use for shell commands. On Windows, Brave, Vivaldi, and Chromium targets also register Chrome's Native Messaging registry key for browsers that read that location, but only when that key is unused; an existing Chrome registration is never replaced or removed.

The Native Messaging manifest points to the generated wrapper path, not to `npx`.

On POSIX systems, a command owns the shell's process group until cleanup completes. When the shell exits, the host terminates remaining members of that group (TERM, then KILL after a short grace period) before reporting the shell's original exit result. Commands that need background work to finish must wait for it in the shell. Cancel, timeout, and browser disconnect also terminate the owned group. This cannot undo completed effects or contain processes that deliberately leave the group. Windows uses `taskkill /T /F` for cancellation; equivalent cleanup after normal shell exit is not guaranteed there.

Update existing bridge runtimes by running the latest package updater. With no arguments, it scans known Native Messaging manifest locations and refreshes every installed OpenBrowserAgent bridge it can find:

```bash
npx openbrowseragent-local-execution-bridge@1 update
```

Use `--browser chrome` or another browser target to update only one browser. If you need to repair or change the extension ID, pass the normal install arguments such as `--browser chrome --extension-id <extension-id> --command-id default`.

### Uninstall

Uninstall the native host files:

```bash
npx openbrowseragent-local-execution-bridge@1 uninstall
```

This removes the browser registrations for supported browsers, the generated wrapper, copied bridge runtime, and bridge config. Add `--browser chrome` or another browser target to clean only one browser registration. Files referenced by another bridge registration in a known browser location are kept. Add `--keep-config` if you want to preserve the shell config and secret. For custom installation locations, pass the same `--manifest`, `--wrapper`, `--bridge`, and `--config` paths used during installation; registrations outside the known locations cannot be discovered automatically.
