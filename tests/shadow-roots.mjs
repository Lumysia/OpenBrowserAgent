// Our UI in web pages lives in closed shadow roots, out of reach of page
// scripts. Tests reach them through CDP: a DevTools DOM snapshot pierces
// closed roots.

// Runs `fn(root, argument)` in the page with the first shadow root that
// `matches` (a CDP DOM node), or with null when there is none.
export async function inShadowRoot(page, matches, fn, argument) {
  const options = { awaitPromise: true, returnByValue: true };
  const objectGroup = "shadow-root-test";
  let object;
  // The snapshot's node ids go stale when the host moves (into or out of a
  // modal dialog or a fullscreen element) right after it was taken.
  for (let attempt = 0; !object; attempt++) {
    const { root } = await page.send("DOM.getDocument", {
      depth: -1,
      pierce: true,
    });
    const shadow = findShadowRoot(root, matches);
    if (!shadow)
      return value(
        await page.send("Runtime.evaluate", {
          ...options,
          expression: `(${fn})(null, ${JSON.stringify(argument) ?? "undefined"})`,
        }),
      );
    object = await page
      .send("DOM.resolveNode", { nodeId: shadow.nodeId, objectGroup })
      .then(
        (result) => result.object,
        (error) => {
          if (attempt === 2) throw error;
        },
      );
  }
  try {
    return value(
      await page.send("Runtime.callFunctionOn", {
        ...options,
        functionDeclaration: `function (argument) { return (${fn})(this, argument); }`,
        objectId: object.objectId,
        arguments: [{ value: argument }],
      }),
    );
  } finally {
    await page.send("Runtime.releaseObjectGroup", { objectGroup });
  }
}

function value(result) {
  if (result.exceptionDetails) throw new Error("Shadow root evaluation failed");
  return result.result?.value;
}

function findShadowRoot(node, matches) {
  const found = node.shadowRoots?.find(matches);
  if (found) return found;
  for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) {
    const inner = findShadowRoot(child, matches);
    if (inner) return inner;
  }
  return undefined;
}

// Whether a CDP node's `class` attribute lists `name`.
export function hasClass(node, name) {
  const attributes = node.attributes || [];
  const index = attributes.indexOf("class");
  return index >= 0 && attributes[index + 1].split(/\s+/).includes(name);
}
