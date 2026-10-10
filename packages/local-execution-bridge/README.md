# OpenBrowserAgent Local Execution Bridge

Native Messaging bridge installer and runtime for OpenBrowserAgent.

Install the local execution bridge and create a shell bridge config. Choose the browser you use, such as `chrome`, `edge`, `brave`, `vivaldi`, `chromium`, or `firefox`. For common Linux packaged browsers, use targets such as `firefox-flatpak`, `chromium-flatpak`, `brave-flatpak`, `firefox-snap`, or `chromium-snap`.

On macOS, `chrome`, `edge`, `brave`, `vivaldi`, `chromium`, and `firefox` are supported. Safari is not supported by this bridge because OpenBrowserAgent's Safari build does not use this Native Messaging API.

```bash
npx openbrowseragent-local-execution-bridge@1 install --browser chrome --extension-id <extension-id> --command-id default
```

Example for Firefox:

```bash
npx openbrowseragent-local-execution-bridge@1 install --browser firefox --extension-id <extension-id> --command-id default
```

The installer writes a stable local bridge runtime, a wrapper executable, a Native Messaging manifest, and a bridge config containing a generated secret. It prints JSON with the values to enter in OpenBrowserAgent. When OpenBrowserAgent tests the bridge, the bridge reports the shell, basic environment, and detected local CLI tools it can use for shell commands. On Windows, Brave, Vivaldi, and Chromium targets also register a Chrome-compatible Native Messaging registry key for browsers that read that location.

The Native Messaging manifest points to the generated wrapper path, not to `npx`.

On POSIX systems, a command owns the shell's process group until cleanup completes. When the shell exits, the host terminates remaining members of that group (TERM, then KILL after a short grace period) before reporting the shell's original exit result. Commands that need background work to finish must wait for it in the shell. Cancel, timeout, and browser disconnect also terminate the owned group. This cannot undo completed effects or contain processes that deliberately leave the group. Windows uses `taskkill /T /F` for cancellation; equivalent cleanup after normal shell exit is not guaranteed there.

Update existing bridge runtimes by running the latest package updater. With no arguments, it scans known Native Messaging manifest locations and refreshes every installed OpenBrowserAgent bridge it can find:

```bash
npx openbrowseragent-local-execution-bridge@1 update
```

Use `--browser chrome` or another browser target to update only one browser. If you need to repair or change the extension ID, pass the normal install arguments such as `--browser chrome --extension-id <extension-id> --command-id default`.

### Older Linux Firefox-family installations

Earlier installers placed `librewolf`, `librewolf-flatpak`, `firefox-flatpak`, and `firefox-snap` registrations in `~/.mozilla/native-messaging-hosts`, the ordinary Firefox location. A targeted update now checks the correct location for the selected browser, so it may report that no installed manifests were found for an older installation.

First run the updater without a browser filter to refresh the existing runtime. Then reinstall your browser target to create its registration in the correct location. For example, for LibreWolf:

```bash
npx openbrowseragent-local-execution-bridge@1 update
npx openbrowseragent-local-execution-bridge@1 install --browser librewolf --extension-id <extension-id> --command-id <existing-command-id>
```

Substitute your browser target and installed extension ID. Repeat any original `--config`, `--bridge`, `--wrapper`, `--shell`, `--cwd`, and `--command-name` options when reinstalling. Reusing the same config and command ID retains the existing secret. Let the browser target select the corrected manifest location. Keep the existing `~/.mozilla/native-messaging-hosts` registration: it may serve an ordinary Firefox installation, and this procedure does not require moving or deleting it. Flatpak/Snap runtime access still depends on the browser sandbox.

### Uninstall

Uninstall the native host files:

```bash
npx openbrowseragent-local-execution-bridge@1 uninstall
```

This removes the browser registrations for supported browsers, the generated wrapper, copied bridge runtime, and bridge config. Add `--browser chrome` or another browser target to clean only one browser registration. Files referenced by another bridge registration in a known browser location are kept. Add `--keep-config` if you want to preserve the shell config and secret. For custom installation locations, pass the same `--manifest`, `--wrapper`, `--bridge`, and `--config` paths used during installation; registrations outside the known locations cannot be discovered automatically.
