import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: [
            "web/.next/**",
            "**/.next/**",
            "web/content/skills/**",
            "web/content/mcp/**",
            "**/content/skills/**",
            "**/content/mcp/**",
            "**/node_modules/**",
            // Pyodide 运行时与 wheel（第三方产物，由 tools/dev/fetch_pyodide_assets.py 抓取）。
            // 不排除的话 eslint 会去解析 pyodide.js / pyodide.asm.js，报出上万条 no-undef。
            "**/public/pyodide/**",
            ".venv/**",
            ".claude/**",
            ".workbuddy/**",
            ".cache/**",
        ],
    },
    js.configs.recommended,
    // TS/TSX 曾整体被忽略（当年没装 TS parser），代价是 react-hooks / @next 规则对 TSX 从未生效过。
    // 现在接入 parser，规则只对 ts/tsx 生效，js 文件维持下面的原生配置不受影响。
    tseslint.config({
        files: ["**/*.ts", "**/*.tsx"],
        extends: [tseslint.configs.recommended],
        rules: {
            // 与下面 js 块的约定保持一致：`_` 前缀 = 刻意不用；caught 不强制带 cause
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
            ],
            "preserve-caught-error": "off",
        },
    }),
    {
        plugins: { "@next/next": nextPlugin, "react-hooks": reactHooks },
        rules: {
            ...nextPlugin.configs.recommended.rules,
            "@next/next/no-html-link-for-pages": "off",
        },
    },
    {
        files: ["**/*.ts", "**/*.tsx"],
        rules: {
            "react-hooks/rules-of-hooks": "error",
            // warn：依赖数组缺失不拦提交，但 CI 里可见（真出过事故的钩子见 analysis-worker）
            "react-hooks/exhaustive-deps": "warn",
        },
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
        files: ["tools/**/*.mjs"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: { ...globals.node },
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
);
