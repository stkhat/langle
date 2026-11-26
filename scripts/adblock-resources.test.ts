import { basename } from "node:path";
import { describe, expect, test } from "vitest";
import {
  scriptletFiles,
  scriptletResource,
  TRUSTED_PERMISSION,
  type AdblockResource,
} from "./adblock-resources.ts";

const resources: AdblockResource[] = await Promise.all(
  scriptletFiles().map(scriptletResource),
);

describe("the scriptlet resources", () => {
  test("has one per scriptlet file, named after it", () => {
    expect(resources.map((resource) => resource.name)).toEqual(
      scriptletFiles().map((file) => basename(file).replace(/\.ts$/, ".js")),
    );
    expect(resources.map((resource) => resource.name)).toContain(
      "json-prune.js",
    );
  });

  test("names and aliases end in .js and are each used once", () => {
    const names = resources.flatMap((resource) => [
      resource.name,
      ...resource.aliases,
    ]);
    for (const name of names) expect(name).toMatch(/^[\w.-]+\.js$/);
    expect(new Set(names).size).toBe(names.length);
  });

  test("gives the engine a function it can call, which runs the bundled scriptlet", () => {
    for (const resource of resources) {
      expect(resource.kind.mime).toBe("application/javascript");
      const code = Buffer.from(resource.content, "base64").toString("utf8");
      const name = `langle_${resource.name.replace(/\.js$/, "").replace(/-/g, "_")}`;
      expect(code.startsWith(`function ${name}() {`)).toBe(true);
      expect(code).toContain("return scriptlet(window, ...arguments);");
      // It parses as a script.
      expect(() => new Function(code)).not.toThrow();
      expect(code).not.toMatch(/^\s*(import|export)\b/m);
    }
  });

  test("lets only the trusted lists call the trusted scriptlets", () => {
    for (const resource of resources)
      expect(resource.permission).toBe(
        resource.name.startsWith("trusted-") ? TRUSTED_PERMISSION : undefined,
      );
  });
});
