import { spawnSync } from "node:child_process";

for (const command of [
  "npx wxt zip",
  "node scripts/rename-zip-with-hash.mjs",
]) {
  const result = spawnSync(command, {
    encoding: "utf8",
    shell: true,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
