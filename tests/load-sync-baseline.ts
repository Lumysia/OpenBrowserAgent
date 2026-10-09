import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// Run the identical workload against a Git revision without touching the work
// tree or installing different dependencies. Only the two original adapter
// modules are substituted; their unchanged shared dependencies are reused.
export async function loadSyncBaseline(revision: string) {
  await mkdir(resolve(".output"), { recursive: true });
  const directory = await mkdtemp(resolve(".output/sync-baseline-"));
  try {
    for (const name of ["sync-backends-impl", "sync-tinybase-doc"]) {
      const source = execFileSync(
        "git",
        ["show", `${revision}:src/shared/${name}.ts`],
        { encoding: "utf8" },
      );
      const rewritten = source.replace(
        /from "\.\/([^"]+)"/g,
        (_match, module) => {
          const path =
            module === "sync-tinybase-doc"
              ? resolve(directory, "sync-tinybase-doc.mjs")
              : resolve("src/shared", `${module}.ts`);
          return `from ${JSON.stringify(pathToFileURL(path).href)}`;
        },
      );
      const compiled = ts.transpileModule(rewritten, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ES2022,
        },
      });
      await writeFile(resolve(directory, `${name}.mjs`), compiled.outputText);
    }
    const backend = await import(
      pathToFileURL(resolve(directory, "sync-backends-impl.mjs")).href
    );
    const codec = await import(
      pathToFileURL(resolve(directory, "sync-tinybase-doc.mjs")).href
    );
    return { ...backend, ...codec };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
