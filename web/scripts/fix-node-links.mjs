#!/usr/bin/env node
/*
 * 修 pnpm 虚拟 store 里退化成空目录的嵌套符号链接（含 `@scope/name`）。
 * pnpm install 认为依赖树已就绪，直到运行期 require 抛 MODULE_NOT_FOUND。
 *
 * 判据是「.pnpm 里有没有对应版本的可读实体」而非「是不是空目录」：
 * 跨平台可选依赖（sharp / next-swc / tailwind-oxide 其它平台二进制）本就留空目录，不动；
 * 找不到实体就跳过。
 *
 * 用法：node scripts/fix-node-links.mjs [--check]
 *   --check  只报告，不修改；有可修项时退出码 1
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NM = path.join(ROOT, "node_modules");
const PNPM = path.join(NM, ".pnpm");
const CHECK_ONLY = process.argv.includes("--check");

/** 目录里是否存在可读的 package.json（穿透链接）。 */
function hasPackage(dir) {
    try {
        return fs.statSync(path.join(dir, "package.json")).isFile();
    } catch {
        return false;
    }
}

/**
 * 收集 .pnpm 中每个包名的所有实体位置。
 * 目录名超长会被截断成 `<prefix>_<hash>`，只能靠目录内真实结构判断，不能靠目录名匹配。
 */
function indexEntities() {
    const index = new Map();
    for (const entry of fs.readdirSync(PNPM)) {
        const nmDir = path.join(PNPM, entry, "node_modules");
        if (!fs.existsSync(nmDir)) continue;
        for (const first of fs.readdirSync(nmDir)) {
            const firstPath = path.join(nmDir, first);
            let stat;
            try {
                stat = fs.lstatSync(firstPath);
            } catch {
                continue;
            }
            if (!stat.isDirectory()) continue;

            if (first.startsWith("@")) {
                for (const name of fs.readdirSync(firstPath)) {
                    if (name.startsWith(".")) continue;
                    const full = `${first}/${name}`;
                    const dir = path.join(firstPath, name);
                    if (!hasPackage(dir)) continue;
                    push(index, full, dir);
                }
            } else {
                if (first.startsWith(".")) continue;
                if (!hasPackage(firstPath)) continue;
                push(index, first, firstPath);
            }
        }
    }
    return index;
}

function push(index, key, value) {
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(value);
}

/** 读取实体的 package.json 版本；读不到返回 null。 */
function entityVersion(dir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version ?? null;
    } catch {
        return null;
    }
}

/**
 * 把 semver range 压成主版本号（`^7.0.2` / `~7.1.0` / `7.0.2` → "7"）。
 * 只用来在多个实体间挑对主版本，不做完整 semver 解析。
 */
function majorOf(spec) {
    const m = /(\d+)\./.exec(spec ?? "");
    return m ? m[1] : null;
}

/**
 * 同一包在 .pnpm 里可能有多份实体（不同 peer 组合 / 版本各一份）。挑选顺序：
 *   1. 与 owner 同条目（跨组链接会让 peer 上下文整体错位）；
 *   2. 主版本与声明一致（可能存在旧版残留，挑错会让 tsc 静默跑成另一个大版本）；
 *   3. 兜底取第一个。
 */
function pickEntity(candidates, ownerEntry, wantMajor) {
    if (!candidates.length) return null;
    if (ownerEntry) {
        const sameEntry = candidates.find((c) => c.includes(path.sep + ownerEntry + path.sep));
        if (sameEntry) return sameEntry;
    }
    if (wantMajor) {
        const sameMajor = candidates.find((c) => (entityVersion(c) ?? "").startsWith(`${wantMajor}.`));
        if (sameMajor) return sameMajor;
    }
    return candidates[0];
}

/** 把空目录换成指向实体的链接；返回是否真的改了东西。 */
function relink(linkPath, target) {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) return false;
    fs.rmdirSync(linkPath);
    fs.symlinkSync(target, linkPath, "junction");
    return true;
}

const index = indexEntities();

const repairable = [];
const skipped = [];

for (const entry of fs.readdirSync(PNPM)) {
    const nmDir = path.join(PNPM, entry, "node_modules");
    if (!fs.existsSync(nmDir)) continue;

    for (const first of fs.readdirSync(nmDir)) {
        if (first.startsWith(".")) continue;
        const firstPath = path.join(nmDir, first);
        let stat;
        try {
            stat = fs.lstatSync(firstPath);
        } catch {
            continue;
        }
        if (!stat.isDirectory()) continue;

        const targets = first.startsWith("@")
            ? fs
                  .readdirSync(firstPath)
                  .filter((n) => !n.startsWith("."))
                  .map((n) => [path.join(firstPath, n), `${first}/${n}`])
            : [[firstPath, first]];

        for (const [linkPath, fullName] of targets) {
            const good = hasPackage(linkPath);
            let isLink;
            try {
                isLink = fs.lstatSync(linkPath).isSymbolicLink();
            } catch {
                continue;
            }

            if (good && isLink) continue; // 已可用的链接不动：跨组复用是 pnpm 的正常行为
            if (good && !isLink) continue;
            if (!good && isLink) continue; // 断链不在此脚本职责内

            const entity = pickEntity(index.get(fullName) ?? [], entry);
            if (!entity) {
                skipped.push(`${entry} -> ${fullName}`);
                continue;
            }
            if (CHECK_ONLY) {
                repairable.push(`${entry} -> ${fullName}`);
                continue;
            }
            if (relink(linkPath, entity)) repairable.push(`${entry} -> ${fullName}`);
        }
    }
}

/*
 * 顶层 node_modules/<pkg> 也会退化成空目录（症状一致）。按 package.json 声明的直接依赖
 * 逐个核对；顶层只链直接依赖，不要遍历 .pnpm 全部条目。
 */
const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
for (const rawName of Object.keys({ ...pkgJson.dependencies, ...pkgJson.devDependencies })) {
    const linkPath = path.join(NM, rawName);
    if (hasPackage(linkPath)) continue;

    // npm alias 依赖（`typescript@npm:<real>@<ver>`）的实体目录名用真实包名，不是别名。
    const spec = pkgJson.dependencies?.[rawName] ?? pkgJson.devDependencies?.[rawName] ?? "";
    const aliased = /^npm:(.+)@([^@]+)$/.exec(spec);
    const searchName = aliased ? aliased[1] : rawName;
    const wantMajor = majorOf(aliased ? aliased[2] : spec);

    const entity = pickEntity(index.get(searchName) ?? [], "", wantMajor);
    if (!entity) {
        // .pnpm 里确实没有实体，只是引用方声明了，不算问题（如可选 peer）。
        skipped.push(`顶层 ${rawName}`);
        continue;
    }

    if (CHECK_ONLY) {
        repairable.push(`顶层 ${rawName}`);
        continue;
    }

    // 顶层要处理三种坏形态：不存在、空目录、断链（比 .pnpm 内部多一种"不存在"）。
    // 断链也一并重建：指向实体比保留一个指不到东西的链接可信。
    let isLink = false;
    try {
        isLink = fs.lstatSync(linkPath).isSymbolicLink();
    } catch {
        // 路径不存在，直接建链接，无需清场。
    }
    if (isLink) fs.rmSync(linkPath, { recursive: true, force: true });
    else if (fs.existsSync(linkPath)) fs.rmdirSync(linkPath);
    fs.symlinkSync(entity, linkPath, "junction");
    repairable.push(`顶层 ${rawName}`);
}

if (CHECK_ONLY) {
    if (repairable.length > 0) {
        console.error(`${repairable.length} 处空链接（.pnpm 里有实体但没链上）：`);
        for (const r of repairable) console.error(`  - ${r}`);
        process.exitCode = 1;
    } else {
        console.log("链接完好");
    }
} else {
    console.log(`填补空链接 ${repairable.length} 处`);
    console.log(`跳过 ${skipped.length} 处（.pnpm 无实体，属跨平台可选依赖）`);
}
