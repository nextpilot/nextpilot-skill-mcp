/**
 * pnpm hook：给 typescript-eslint 全链注入 typescript@6 作为普通依赖。
 *
 * 背景：项目主工具链用 typescript@7（tsc/typecheck），但 typescript-eslint 8.x
 * 不支持 TS >=7（官方 tracking: typescript-eslint#10940）。tseslint 对 typescript
 * 声明的是 peerDependencies，pnpm 会把使用方的 7.0.2 链接进去，导致 eslint 一加载就抛
 * "does not support TS 7.0"。这里把 peer 删掉、改成 dependencies（^6），让 eslint 侧
 * 静态解析用 TS 6，web 构建与类型检查（直接依赖 typescript@7）不受影响。
 * tseslint 官方支持 TS 7 后，删除本文件与 pnpm-workspace.yaml 里的 `pnpmfile: true`。
 */
function readPackage(pkg) {
    if (
        pkg.name === "typescript-eslint" ||
        pkg.name === "@typescript-eslint/parser" ||
        pkg.name === "@typescript-eslint/eslint-plugin" ||
        pkg.name === "@typescript-eslint/typescript-estree"
    ) {
        if (pkg.peerDependencies) delete pkg.peerDependencies.typescript;
        pkg.dependencies = { ...(pkg.dependencies || {}), typescript: "^6" };
    }
    return pkg;
}

module.exports = { hooks: { readPackage } };
