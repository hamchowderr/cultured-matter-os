import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      "react/no-children-prop": "off",
      "react-hooks/exhaustive-deps": "off",
      "@next/next/no-img-element": "off",
      // React Compiler rules new in eslint-plugin-react-hooks 7 (Next 16). Existing code
      // predates them; warn until each site is reworked.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/use-memo": "warn"
    }
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".claude/**", ".agents/**", "agent/**"])
]);
