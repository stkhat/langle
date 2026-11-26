// json-prune's property paths (uBO's wiki, "json-prune"): `a.b.c`, with `[]` for every
// item of an array, `*` for every property, and `[-]` / `{-}` to remove the array item
// or property in which the rest of the path is found.
import { isObject, regexOf } from "./shared";

/** Whether the path's parts lead somewhere in `node`. */
function has(node: unknown, parts: readonly string[]): boolean {
  if (parts.length === 0) return true;
  if (!isObject(node)) return false;
  const [part = "", ...rest] = parts;
  if (part === "[]" || part === "*" || part === "[-]" || part === "{-}")
    return Object.values(node).some((value) => has(value, rest));
  return part in node && has(node[part], rest);
}

/** Removes what the path names in `node`; answers whether anything went. */
function prune(node: unknown, parts: readonly string[]): boolean {
  if (!isObject(node)) return false;
  const [part = "", ...rest] = parts;
  let pruned = false;
  if (part === "[-]" || part === "{-}") {
    const keys = Object.keys(node).filter((key) => has(node[key], rest));
    if (Array.isArray(node))
      for (const key of keys.reverse()) node.splice(Number(key), 1);
    else for (const key of keys) Reflect.deleteProperty(node, key);
    return keys.length > 0;
  }
  if (part === "[]" || part === "*") {
    if (part === "[]" && !Array.isArray(node)) return false;
    for (const key of Object.keys(node))
      if (rest.length === 0)
        pruned = Reflect.deleteProperty(node, key) || pruned;
      else pruned = prune(node[key], rest) || pruned;
    return pruned;
  }
  if (!(part in node)) return false;
  if (rest.length === 0) return Reflect.deleteProperty(node, part);
  return prune(node[part], rest);
}

/**
 * json-prune's first two arguments as a function that prunes a parsed value in place:
 * the space-separated paths to remove, once all the needle paths are found (a needle
 * written as `/re/` is for uBO's logger only, and is no condition).
 */
export function jsonPruner(
  prunePaths: string,
  needlePaths = "",
): (value: unknown) => boolean {
  const split = (paths: string) =>
    paths
      .split(/\s+/)
      .filter((path) => path !== "")
      .map((path) => path.split("."));
  const paths = split(prunePaths);
  const needles = regexOf(needlePaths) === undefined ? split(needlePaths) : [];
  return (value) => {
    if (!isObject(value)) return false;
    if (!needles.every((needle) => has(value, needle))) return false;
    let pruned = false;
    for (const path of paths) pruned = prune(value, path) || pruned;
    return pruned;
  };
}
