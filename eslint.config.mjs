import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "packages/database/src/generated/**"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      "no-undef": "off",
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_"
        }
      ]
    }
  },
  eslintConfigPrettier
];
