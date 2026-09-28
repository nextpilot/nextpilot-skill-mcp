import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";

export default [
    {
        ignores: [
            "web/.next/**",
            "**/.next/**",
            "web/content/skills/**",
            "web/content/mcp/**",
            "**/content/skills/**",
            "**/content/mcp/**",
            "**/node_modules/**",
            "**/*.ts",
            "**/*.tsx",
            // Pyodide 运行时与 wheel（第三方产物，由 tools/dev/fetch_pyodide_assets.py 抓取）。
            // 不排除的话 eslint 会去解析 pyodide.js / pyodide.asm.js，报出上万条 no-undef。
            "**/public/pyodide/**",
        ],
    },
    js.configs.recommended,
    {
        plugins: { "@next/next": nextPlugin },
        rules: { ...nextPlugin.configs.recommended.rules },
    },
    {
        files: ["web/scripts/**/*.{js,mjs}", "web/lib/**/*.{js,mjs}", "web/app/**/*.{js,mjs}"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: { ...globals.browser, ...globals.worker, ...globals.node },
        },
        rules: {
            "no-undef": "error",
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
            "no-useless-assignment": "warn",
            "preserve-caught-error": "off",
            "@next/next/no-assign-module-variable": "off",
        },
    },
    {
        files: ["web/functions/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.node,
                fetch: "readonly",
                Response: "readonly",
                Request: "readonly",
                Headers: "readonly",
                URL: "readonly",
                URLSearchParams: "readonly",
                crypto: "readonly",
                TextEncoder: "readonly",
                TextDecoder: "readonly",
                btoa: "readonly",
                atob: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                console: "readonly",
            },
        },
        rules: {
            "no-undef": "error",
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        },
    },
    {
        files: ["web/public/sw.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",
            globals: {
                ...globals.serviceworker,
                URL: "readonly",
                fetch: "readonly",
                Response: "readonly",
                console: "readonly",
            },
        },
        rules: {
            "no-undef": "error",
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        },
    },
];
