export const localExecutionBridgeSetup = {
  name: "local-execution-bridge-setup",
  description:
    "Set up, test, update or remove a local execution bridge so the agent can run commands on the user's computer. Use before localBridges add/update/test/delete, or when no tested bridge exists.",
  body: `# Local execution bridge setup

A local execution bridge is a small Native Messaging host on the user's computer. The extension sends it a shell command with a shared secret; it runs the command in the configured shell and returns stdout, stderr and the exit code. Chromium browsers and Firefox are supported, Safari is not.

## When the user wants something run and no bridge works

1. \`localBridges\` list (load it with \`toolSearch\`). If a tested bridge exists, use \`localCommand\` and stop here.
2. Explain in one sentence that a one-time setup is needed, then collect what the installer needs, with \`ask\` and only for what you don't know:
   - the browser: chrome, edge, brave, vivaldi, chromium or firefox;
   - the extension ID, shown on the browser's extensions page (chrome://extensions with developer mode on) for OpenBrowserAgent.
3. Give one complete command for the user to run in a terminal, with no placeholders:
   \`npx openbrowseragent-local-execution-bridge@1 install --browser <browser> --extension-id <id> --command-id default\`
   Add \`--shell <shell>\` only if the user wants a specific shell. From a source checkout, \`npm run install-local-execution-bridge -- …\` works too.
4. From the installer's output take \`hostName\`, \`commandId\` (as \`bridgeKey\`) and \`secret\`, and call \`localBridges\` add with them, then \`test\`.
5. \`test\` reports the shell, environment and command-line tools the bridge sees; choose command syntax from it. Then run the user's original request with \`localCommand\`.

Do not tell the user to run their task by hand instead; the setup is the only thing they run themselves.

## Other tasks

- Update the bridge files: the user runs \`npx openbrowseragent-local-execution-bridge@1 update\` (add \`--browser <browser>\` for one browser). Secrets are kept.
- Remove: \`localBridges\` delete for the extension's side; the user runs \`npx openbrowseragent-local-execution-bridge@1 uninstall\` for the files.
- Test failing with a missing or stale host: ask the user to rerun the install command for the same browser and extension ID, restart the browser fully, then test again. On Windows with Brave, Vivaldi or Chromium the latest installer registers both browser-specific and Chrome-compatible keys.

## Rules

- Install once; send later tasks through \`localCommand\`, never through the installer.
- Never invent secrets; the installer generates them, and \`localBridges\` shows a generated secret only once.
- Local programs, files and CLIs run through the bridge, not through \`subAgent\`.
`,
};
