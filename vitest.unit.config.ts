import { defineConfig, defineProject } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";
import { localesPlugin } from "./scripts/locales.ts";

export const unit = defineProject({
  plugins: [WxtVitest(), localesPlugin()],
  test: {
    name: "unit",
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["src/**/*.browser.test.ts"],
  },
});

// The unit project alone, for Stryker, which cannot select a project.
export default defineConfig(unit);
