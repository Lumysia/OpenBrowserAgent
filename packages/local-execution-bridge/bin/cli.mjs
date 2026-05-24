#!/usr/bin/env node

const [, , command, ...args] = process.argv;

if (!command || command === "install") {
  process.argv = [process.argv[0], process.argv[1], ...args];
  await import("./install.mjs");
} else if (command === "uninstall") {
  process.argv = [process.argv[0], process.argv[1], ...args];
  await import("./uninstall.mjs");
} else if (command === "run") {
  process.argv = [process.argv[0], process.argv[1], ...args];
  await import("./bridge.mjs");
} else if (command === "help" || command === "--help" || command === "-h") {
  console.log(`Usage:
  openbrowseragent-local-execution-bridge install --browser chrome --extension-id <id>
  openbrowseragent-local-execution-bridge uninstall --browser chrome
  openbrowseragent-local-execution-bridge run`);
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
