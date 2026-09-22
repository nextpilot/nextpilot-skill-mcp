import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";

export default [
    {
        ignores: [
            ".next/**",
            "**/.next/**",
            "content/skills/**",
            "content/mcp/**",
            "**/content/skills/**",
            "**/content/mcp/**",
            "**/node_modules/**",
            "**/*.{ts,tsx}",
        ],
    },
    js.configs.recommended,
    {
        plugins: { "@next/next": nextPlugin },
        rules: { ...nextPlugin.configs.recommended.rules },
    },
    {
        files: ["scripts/**/*.{js,mjs}", "lib/**/*.{js,mjs}", "app/**/*.{js,mjs}"],
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
        files: ["functions/**/*.js"],
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
        files: ["public/sw.js"],
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
            "no-unused-vars": "off",
        },
    },
];
