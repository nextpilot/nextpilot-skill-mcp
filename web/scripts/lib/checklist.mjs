// 「这道门还挂在统一入口上吗」的唯一判据提供者。
//
// checklist.yml 是多文档 YAML，格式变过一次（数组 `- id:` → 每文档一个 `id:`）。
// 守卫若各自用字面量去 includes，改一次格式就会集体误判成「门被删了」——
// 那比门真被删更糟：它红在一个不存在的问题上，人会照错误信息去改错的地方。
// 所以判据只有这一份，且与 check_all.py 的读法一致（safe_load_all）。
//
// 只解析 YAML、不做字符串匹配：注释里出现同样的 id 不该算「门还在」。

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAllDocuments } from "yaml";

/**
 * 清单里有没有注册这个 id。
 * 解析失败（YAML 坏了）返回 false：那本来就该红，交给守卫报出来。
 */
export function checklistHasStep(id, repoRoot) {
    const raw = readFileSync(join(repoRoot, "tools", "ci", "checklist.yml"), "utf8");
    for (const doc of parseAllDocuments(raw)) {
        if (doc.errors?.length) continue;
        const data = doc.toJS();
        if (data && data.id === id) return true;
    }
    return false;
}
