/**
 * 面板解析器的守卫：实例怎么数、区间引用怎么展开，这几条规矩有人改坏就会红。
 * 规矩本身写在 `lib/panel-resolver.ts`（唯一一份），这里只证明它照着规矩跑：
 *   1. 数实例不能看采样点数（`n`）  2. 不拆图时 `a[:].b` 展开成 `a[0].b`、`a[1].b`…
 *   3. 拆图时区间引用不展开，每张图只画自己那个实例  4. 实例数不齐按并集展开，缺的给告警
 *   5. 不写下标是单条线（= 实例 0），既不展开也不触发拆图  6. 构建期正则放行 `field[i,j]`、拒绝多维与字母下标
 * 用 `--experimental-strip-types` 直接跑，import 真正的 `lib/panel-resolver.ts`——断言写在副本上守不住真身。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { resolveAxes, topicInstances, parseFieldRef } from "../lib/panel-resolver.ts";
import { splitFieldRef } from "./lib/rule-expr.mjs";

import { log } from "./lib/log.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const NO_HLINE = { hlineColor: () => "#000" };

/** 假 manifest：三个实例的 accel、一个实例的 gyro、只采到一个点的 cfg。
 *  `n` 故意设成与"是不是实例"无关的值，守的就是"不能拿 n 判实例"。 */
const M = {
    topics: [
        { topic: "accel", instance: 0, n: 500, fields: [{ name: "x" }, { name: "z" }] },
        { topic: "accel", instance: 1, n: 500, fields: [{ name: "x" }, { name: "z" }] },
        { topic: "accel", instance: 2, n: 500, fields: [{ name: "x" }, { name: "z" }] },
        { topic: "gyro", instance: 0, n: 400, fields: [{ name: "x" }] },
        // 只有一个采样点，它仍然是"实例 0"，老实现（filter n>1）会把它丢掉
        { topic: "cfg", instance: 0, n: 1, fields: [{ name: "id" }] },
        { topic: "cfg", instance: 1, n: 1, fields: [{ name: "id" }] },
    ],
};

const AXES = {
    title: "T{instance}",
    ylabel: "",
    xlabel: "秒",
    legend: true,
    grid: true,
    flipx: false,
    flipy: false,
    range: null,
    hlines: null,
    children: [],
};

const child = (ydata, labels) => ({
    mode: "TimeSeries",
    xdata: null,
    ydata: ydata.map((f) => ({ kind: "field", fields: [f], unit: null })),
    labels: labels ?? ydata,
    styles: [],
    colors: [],
});

const lines = (r) => r.panels.flatMap((p) => p.requests.flatMap((q) => q.series.map((s) => s.label)));
const refs = (r) => r.panels.flatMap((p) => p.requests.flatMap((q) => q.ydata.map((d) => d.fields[0])));

const checks = [];
function check(name, fn) {
    checks.push([name, fn]);
}

// 1 ── 数实例不看采样点数
check("数实例不看采样点数", () => {
    const got = topicInstances(M, "cfg");
    return got.join(",") === "0,1" ? null : `只采到一个点的实例被丢了：得到 [${got}]，应是 [0,1]`;
});
check("数实例不重复不漏", () => {
    const got = topicInstances(M, "accel");
    return got.join(",") === "0,1,2" ? null : `accel 的实例是 [${got}]，应是 [0,1,2]`;
});

// 2 ── 不拆图：区间引用展开成多条线，命名 a[i].b
check("区间引用同图展开成多条线", () => {
    const r = resolveAxes({ ...AXES, split_by_instance: false, children: [child(["accel[:].x"])] }, M, NO_HLINE);
    const got = lines(r);
    return got.join(" | ") === "accel[0].x | accel[1].x | accel[2].x"
        ? null
        : `展开出来是 [${got}]，应是 accel[0..2].x`;
});
check("展开后的线把实例写死进引用", () => {
    const r = resolveAxes({ ...AXES, split_by_instance: false, children: [child(["accel[:].x"])] }, M, NO_HLINE);
    const got = refs(r);
    return got.join(",") === "accel[0].x,accel[1].x,accel[2].x"
        ? null
        : `发出去的引用是 [${got}]——区间没展开引擎取不到`;
});
// 看 refs 而不是 lines：图例文案由上面那条单独守，两条共用一个观测量会让"只改坏图例"一次红三条，分不清坏在哪
check("闭区间含两端", () => {
    const r = resolveAxes({ ...AXES, split_by_instance: false, children: [child(["accel[1:2].x"])] }, M, NO_HLINE);
    const got = refs(r);
    return got.join(",") === "accel[1].x,accel[2].x" ? null : `[1:2] 展成了 [${got}]，应含实例 1 和 2`;
});

// 3 ── 拆图：区间引用不展开，每张图只画自己那个实例
check("拆图时区间引用不再展开", () => {
    const r = resolveAxes({ ...AXES, split_by_instance: true, children: [child(["accel[:].x"], ["X"])] }, M, NO_HLINE);
    const titles = r.panels.map((p) => p.title);
    const per = r.panels.map((p) => p.requests[0].series.map((s) => s.label).join(","));
    if (titles.length !== 3) return `拆成了 ${titles.length} 张图，应是 3 张`;
    if (per.join(" / ") !== "X / X / X") return `每张图里的线是 [${per}]——拆图后每张图只该画自己那一路`;
    return null;
});
check("拆图时实例号随面板走", () => {
    const r = resolveAxes({ ...AXES, split_by_instance: true, children: [child(["accel[:].x"], ["X"])] }, M, NO_HLINE);
    const insts = r.panels.map((p) => p.requests[0].instance);
    return insts.join(",") === "0,1,2" ? null : `各面板的 instance 是 [${insts}]，应是 0,1,2`;
});

// 4 ── 实例数不齐：取并集 + 告警
// 两件事合成一条断言：它们共用同一处产出（并集被砍短则缺失实例不存在、告警自然不产生）；
// 拆两条的话"砍齐"会一次红两条，分不清坏在哪。
check("实例数不齐取并集并给告警", () => {
    const r = resolveAxes(
        { ...AXES, title: "混合", split_by_instance: false, children: [child(["accel[:].x", "gyro[:].x"])] },
        M,
        NO_HLINE,
    );
    const got = refs(r);
    if (got.join(" | ") !== "accel[0].x | accel[1].x | accel[2].x | gyro[0].x") {
        return `并集展开出来是 [${got}]——gyro 只有实例 0，accel 的三个实例不能因此少画`;
    }
    const all = [...(r.warnings ?? []), ...r.panels.flatMap((p) => p.warnings ?? [])];
    const hit = all.filter((w) => w.includes("gyro.x") && w.includes("实例 1"));
    return hit.length > 0 ? null : `告警栏拿不到提示（现有 ${all.length} 条）——少的那一路会无声消失`;
});

// 5 ── 不写下标 = 单条线
check("不写下标是单条线", () => {
    const r = resolveAxes(
        { ...AXES, title: "裸写", split_by_instance: false, children: [child(["accel.x"])] },
        M,
        NO_HLINE,
    );
    const got = refs(r);
    return got.join(",") === "accel.x" ? null : `裸写被改成了 [${got}]——保持作者写的原文，报错文案才认得`;
});
check("不写下标不触发拆图", () => {
    const r = resolveAxes(
        { ...AXES, title: "裸写", split_by_instance: true, children: [child(["accel.x"])] },
        M,
        NO_HLINE,
    );
    return r.panels.length === 1 ? null : `拆成了 ${r.panels.length} 张图——"不写下标"不是"要拆"的信号`;
});

// 6 ── 二维下标
check("构建期放行二维下标", () => {
    const p = splitFieldRef("vehicle_attitude[0].q[10,2]");
    if (!p) return "field[i,j] 过不了构建期校验";
    return p.fieldIndex === "10,2" ? null : `拆出来的 fieldIndex 是 ${p.fieldIndex}，应是 "10,2"`;
});
check("构建期拒绝三维下标", () => {
    return splitFieldRef("vehicle_attitude.q[1,2,3]") === null ? null : "三维下标不该放行";
});
check("构建期拒绝字母下标", () => {
    return splitFieldRef("vehicle_attitude.q[a,b]") === null ? null : "字母下标不该放行";
});
check("前端正则与构建期同形", () => {
    for (const good of ["accel.q[0]", "accel.q[10,2]", "accel[0].q[1,2]"]) {
        if (!parseFieldRef(good)) return `前端正则放不过 ${good}——两边正则必须同形`;
    }
    for (const bad of ["accel.q[1,2,3]", "accel.q[a,b]"]) {
        if (parseFieldRef(bad)) return `前端正则放过了 ${bad}——两边正则必须同形`;
    }
    return null;
});

// 7 ── 静态：消费方不能再自己抄一份"按 n 筛实例"。只扫两个消费方，不扫本体（本体的同一规矩上面已有行为断言；
//     两边都扫则任何一处改动一次红两条，看不出坏的是"行为"还是"多抄了一份"）。
//     只看代码行：注释里正大光明写着"这里曾经判 t.n > 1"，连注释一起扫会恒红。
check("消费方没有自己再按采样点数筛实例", () => {
    const strip = (s) =>
        s
            .split("\n")
            .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
            .join("\n");
    for (const [rel, why] of [
        ["../lib/chart-presets.ts", "chart-presets.ts 里又出现按 n 过滤——那份逻辑已经合并进 panel-resolver"],
        [
            "../lib/tools/compile-yaml-preset.ts",
            "compile-yaml-preset.ts 里又出现按 n 过滤——那份逻辑已经合并进 panel-resolver",
        ],
    ]) {
        if (/\bt\.n\b/.test(strip(readFileSync(join(HERE, rel), "utf8")))) return why;
    }
    return null;
});

let failed = 0;
for (const [name, fn] of checks) {
    let why;
    try {
        why = fn();
    } catch (err) {
        why = String(err && err.message ? err.message : err);
    }
    if (why) {
        failed += 1;
        log.err(`  FAIL  ${name}  → ${why}`);
    } else {
        log.ok(`  ok    ${name}`);
    }
}
log.info(failed === 0 ? `panel-resolver: ${checks.length} 项全过` : `${failed} 项未过`);
process.exit(failed === 0 ? 0 : 1);
