import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { build } from "esbuild";
import { installBrowser } from "./helpers";
import { createWorkspace, upsertWorkspaceFile } from "../src/shared/workspace";
import type { AgentWorkspace } from "../src/shared/types";

// Exercise actual component handlers plus actual storage, with deterministic
// hook/visual plumbing. DOM behavior is covered by browser-workspace.test.mjs.
const bundled = await build({
  stdin: {
    contents: `export {AgentWorkspaceEditor} from './entrypoints/options/agent-workspace-editor'; export {storage} from './src/shared/storage'; export {resetRender} from 'react';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  plugins: [
    {
      name: "editor-handler-fixture",
      setup(builder) {
        builder.onResolve(
          { filter: /^(react(?:\/jsx-runtime)?|lucide-react)$/ },
          (args) => ({ path: args.path, namespace: "fixture" }),
        );
        builder.onResolve(
          { filter: /ui\/components$|skill-options-components$/ },
          (args) => ({ path: args.path, namespace: "fixture" }),
        );
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => {
          if (args.path === "react")
            return {
              contents: `let values=[],index=0;export function resetRender(clear=false){index=0;if(clear)values=[];}export function useState(init){const slot=index++;if(!(slot in values))values[slot]=typeof init==='function'?init():init;return [values[slot],next=>{values[slot]=typeof next==='function'?next(values[slot]):next}];}export function useRef(init){const slot=index++;if(!(slot in values))values[slot]={current:init};return values[slot];}`,
            };
          if (args.path === "react/jsx-runtime")
            return {
              contents: `export const Fragment='Fragment';export function jsx(type,props){return {type,props};}export const jsxs=jsx;`,
            };
          const names =
            args.path === "lucide-react"
              ? ["Check", "FileText", "Pencil", "Plus", "Trash2"]
              : args.path.endsWith("skill-options-components")
                ? ["SkillFileActionButton"]
                : [
                    "Accordion",
                    "AccordionItem",
                    "AccordionTrigger",
                    "AccordionContent",
                    "Button",
                    "CardDescription",
                    "Input",
                    "Textarea",
                  ];
          return {
            contents: names
              .map((name) => `export const ${name}=${JSON.stringify(name)};`)
              .join("\n"),
          };
        });
      },
    },
  ],
});
const component = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);
afterEach(() => mock.restoreAll());

type Node = { type: string; props: Record<string, any> };
function nodes(tree: any): Node[] {
  return !tree || typeof tree !== "object"
    ? []
    : Array.isArray(tree)
      ? tree.flatMap(nodes)
      : [tree, ...nodes(tree.props?.children)];
}
function file(tree: Node, path: string) {
  return nodes(tree).find(
    (node) =>
      node.props?.className === "option-file-block" &&
      nodes(node).some(
        (child) =>
          child.props?.className === "option-file-name" &&
          child.props.children === path,
      ),
  )!;
}
function edit(workspace: AgentWorkspace, path: string, content: string) {
  const result = upsertWorkspaceFile(workspace, path, content);
  assert.equal(result.ok, true);
  return result.workspace;
}

async function fixture() {
  const { local } = installBrowser();
  component.resetRender(true);
  let workspace = edit(
    edit(createWorkspace("fixture"), "NOTES.md", "original"),
    "other.md",
    "other",
  );
  await component.storage.agentWorkspaces.set([workspace]);
  const t = {
    options: new Proxy({}, { get: (_, key) => String(key) }),
    common: { edit: "Edit", delete: "Delete", save: "Save" },
  };
  const render = () => {
    component.resetRender();
    return component.AgentWorkspaceEditor({ workspace, t }) as Node;
  };
  const refresh = async () => {
    workspace = (await component.storage.agentWorkspaces.get())[0];
  };
  const click = (path: string, label: string) =>
    nodes(file(render(), path))
      .find(
        (node) =>
          node.props.label === label ||
          (node.type === "Button" && nodes(node).length && label === "Save"),
      )!
      .props.onClick();
  const type = (text: string) =>
    nodes(render())
      .find((node) => node.type === "Textarea")!
      .props.onChange({ currentTarget: { value: text } });
  const draftText = () =>
    nodes(render()).find((node) => node.type === "Textarea")?.props.value;
  return {
    local,
    render,
    refresh,
    click,
    type,
    draftText,
    async externalEdit(text: string) {
      workspace = edit(workspace, "NOTES.md", text);
      await component.storage.agentWorkspaces.set([workspace]);
    },
    content(path: string) {
      return workspace.files.find((file) => file.path === path)?.content;
    },
  };
}

for (const unrelatedDelete of [false, true]) {
  test(`actual editor rejects stale draft ${unrelatedDelete ? "after unrelated deletion" : "directly"}`, async () => {
    const editor = await fixture();
    editor.click("NOTES.md", "Edit");
    editor.type("stale editor draft");
    await editor.externalEdit("newer agent edit");
    if (unrelatedDelete) {
      await editor.click("other.md", "Delete");
      await editor.refresh();
      assert.equal(editor.content("other.md"), undefined);
    }
    assert.equal(editor.content("NOTES.md"), "newer agent edit");
    assert.equal(editor.draftText(), "stale editor draft");
    await editor.click("NOTES.md", "Save");
    await editor.refresh();
    assert.equal(editor.content("NOTES.md"), "newer agent edit");
    assert.equal(editor.draftText(), "stale editor draft");
    assert.ok(
      nodes(editor.render()).some(
        (node) => node.props.children === "agentWorkspaceConflict",
      ),
    );
  });
}

for (const action of ["type", "switch"] as const) {
  test(`actual editor save completion preserves ${action === "type" ? "typing in the same draft" : "a different opened draft"}`, async () => {
    const editor = await fixture();
    editor.click("NOTES.md", "Edit");
    editor.type("submitted text");
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const originalSet = editor.local.area.set.bind(editor.local.area);
    let held = false;
    mock.method(editor.local.area, "set", async (values) => {
      if (STORAGE_KEY in values && !held) {
        held = true;
        started.resolve();
        await release.promise;
      }
      return originalSet(values);
    });
    const save = editor.click("NOTES.md", "Save");
    await started.promise;
    if (action === "switch") editor.click("other.md", "Edit");
    editor.type("new draft text");
    release.resolve();
    await save;
    await editor.refresh();
    assert.equal(editor.content("NOTES.md"), "submitted text");
    assert.equal(editor.draftText(), "new draft text");
    await editor.click(action === "switch" ? "other.md" : "NOTES.md", "Save");
    await editor.refresh();
    assert.equal(
      editor.content(action === "switch" ? "other.md" : "NOTES.md"),
      "new draft text",
    );
  });
}
const STORAGE_KEY = "agent-workspaces";
