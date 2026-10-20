import { CONTAINER_ROLES, nameOf, roleOf } from "./dom";

// The nearest container around an element, as "role name". Many controls
// share a container: its description is kept.
const containers = new WeakMap<Element, string>();
export function containerOf(element: Element) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const known = containers.get(node);
    if (known !== undefined) {
      if (known) return known;
      continue;
    }
    const role = roleOf(node);
    const described = CONTAINER_ROLES.has(role)
      ? `${role} ${nameOf(node, role)}`
      : "";
    containers.set(node, described);
    if (described) return described;
  }
  return "";
}
