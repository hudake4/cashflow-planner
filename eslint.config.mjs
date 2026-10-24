import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".tools/**",
      "out/**",
      "electron/dist/**",
      "dist-desktop/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "test-evidence/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Money is integer cents parsed from strings (docs/CONVENTIONS.md section 1).
  // parseFloat on a money string loses cents; use parseMoneyToCents / the SimpleFIN mapper.
  {
    files: ["src/**/*.{ts,tsx}", "electron/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "parseFloat", message: "Money is integer cents parsed from strings. Use parseMoneyToCents (src/domain/money.ts)." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Number", property: "parseFloat", message: "Money is integer cents parsed from strings. Use parseMoneyToCents (src/domain/money.ts)." },
      ],
    },
  },

  // src/domain is pure: no Prisma, no I/O, no clock (docs/CONVENTIONS.md section 9).
  // "Today" is passed in; the only clock read is todayLocal's default argument in dates.ts.
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@prisma/client", "@prisma/*"], message: "src/domain is pure. Load data in src/server and pass it in." },
            { group: ["@/server/*", "*/server/*", "../server/*", "../../server/*"], message: "src/domain must not depend on src/server." },
            { group: ["node:*", "fs", "fs/*", "path", "child_process", "http", "https", "net", "os", "crypto"], message: "src/domain does no I/O." },
            { group: ["next", "next/*", "react", "react/*", "react-dom", "react-dom/*"], message: "src/domain has no framework dependencies." },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: "src/domain never reads the clock. Accept `today` as an argument.",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "src/domain never reads the clock. Accept `today` or `now` as an argument.",
        },
      ],
    },
  },
];

export default eslintConfig;
