#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const YAML_PATH = resolve(ROOT, "web", "node_modules", "yaml", "dist", "index.js");
const RULES_DIRS = ["knowledge/px4/rules", "knowledge/ardupilot/rules"];

function migrateItem(root, YAML) {
    if (!root || !root.has) return false;
    let changed = false;
    const { YAMLMap, YAMLSeq } = YAML;
    const outputs = root.get("outputs");

    // guard_tags -> triggers with severity:guard
    if (outputs?.has?.("guard_tags")) {
        const gt = outputs.get("guard_tags");
        if (gt && Array.isArray(gt.items)) {
            let tr = root.get("triggers");
            if (!tr) {
                tr = new YAMLSeq();
                root.set("triggers", tr);
            }
            for (const g of gt.items) {
                const gj = g.toJSON();
                const m = new YAMLMap();
                m.set("when", gj.when);
                m.set("severity", "guard");
                m.set("label", gj.tag);
                m.set("description", "Data quality: " + gj.tag);
                // add minimal evidence for validation
                const ev = new YAMLMap();
                ev.set("source", "");
                m.set("evidence", ev);
                tr.add(m);
            }
            outputs.delete("guard_tags");
            changed = true;
            if (outputs.items.length === 0) root.delete("outputs");
        }
    }

    // outputs.tag -> top-level tag
    if (outputs?.has?.("tag") && !root.has("tag")) {
        root.set("tag", outputs.get("tag"));
        changed = true;
    }

    // remove outputs.check
    if (outputs?.has?.("check")) {
        outputs.delete("check");
        changed = true;
    }

    // outputs.stats -> outputs array
    if (outputs?.has?.("stats")) {
        const sj = outputs.get("stats").toJSON();
        const arr = new YAMLSeq();
        for (const [k, v] of Object.entries(sj)) {
            const it = new YAMLMap();
            it.set("name", k);
            it.set("value", v.var || v.value || "");
            if (v.round !== undefined) it.set("round", v.round);
            if (v.unit) it.set("unit", v.unit);
            if (v.description) it.set("description", v.description);
            arr.add(it);
        }
        root.set("outputs", arr);
        changed = true;
    }

    // clean empty outputs
    if (outputs?.has?.("tag") && (!outputs.items || outputs.items.length <= 1)) {
        root.delete("outputs");
        changed = true;
    }

    // trigger fields -> evidence sub-object; tag -> label
    const triggers = root.get("triggers");
    if (triggers?.items) {
        for (const t of triggers.items) {
            if (!t?.has) continue;
            // tag -> label (trigger-level tag, not rule-level)
            if (t.has("tag")) {
                const val = t.get("tag");
                if (val !== undefined && val !== null) {
                    if (!t.has("label")) t.set("label", val);
                }
                t.delete("tag");
                changed = true;
            }
            // title -> description
            if (t.has("title") && !t.has("description")) {
                t.set("description", t.get("title"));
                t.delete("title");
                changed = true;
            }
            // ensure evidence exists (guard triggers and others)
            if (!t.has("evidence")) {
                const _ev = new YAMLMap();
                _ev.set("source", "");
                t.set("evidence", _ev);
                changed = true;
            }
            // field/value/threshold/unit -> evidence
            if (t.has("field") || t.has("value") || t.has("threshold") || t.has("unit")) {
                let _ev = t.get("evidence");
                if (!_ev || typeof _ev.set !== "function") {
                    _ev = new YAMLMap();
                    t.set("evidence", _ev);
                }
                if (t.has("field")) {
                    _ev.set("source", t.get("field"));
                    t.delete("field");
                }
                if (t.has("value")) {
                    _ev.set("value", t.get("value"));
                    t.delete("value");
                }
                if (t.has("threshold")) {
                    _ev.set("threshold", t.get("threshold"));
                    t.delete("threshold");
                }
                if (t.has("unit")) {
                    _ev.set("unit", t.get("unit"));
                    t.delete("unit");
                }
                changed = true;
            }
        }
    }
    return changed;
}

function migrateDoc(doc, YAML) {
    const root = doc.contents;
    if (!root) return false;
    // YAMLSeq: top-level array (e.g. failsafe.yaml)
    if (root instanceof YAML.YAMLSeq) {
        let changed = false;
        for (const item of root.items) {
            if (migrateItem(item, YAML)) changed = true;
        }
        return changed;
    }
    // YAMLMap: single rule object
    if (root instanceof YAML.YAMLMap) {
        return migrateItem(root, YAML);
    }
    return false;
}

async function main() {
    const mod = await import(pathToFileURL(YAML_PATH).href);
    const YAML = mod.default || mod;
    if (!YAML.YAMLMap) {
        console.error("yaml module not found at", YAML_PATH);
        process.exit(1);
    }
    let total = 0;
    for (const dir of RULES_DIRS) {
        const fd = resolve(ROOT, dir);
        let files;
        try {
            files = readdirSync(fd).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
        } catch (e) {
            continue;
        }
        for (const f of files) {
            const fp = resolve(fd, f);
            const raw = readFileSync(fp, "utf-8");
            const docs = YAML.parseAllDocuments(raw);
            const dl = Array.isArray(docs) ? docs : [docs];
            let ch = false;
            for (const d of dl) {
                if (migrateDoc(d, YAML)) ch = true;
            }
            if (ch) {
                total++;
                writeFileSync(fp, dl.map((d) => d.toString({ lineWidth: 0 })).join("\n"), "utf-8");
                console.log("[OK] " + dir + "/" + f);
            }
        }
    }
    // clean up
    try {
        unlinkSync(resolve(ROOT, "tools", "test.txt"));
    } catch {}
    console.log("\nDone: " + total + " files migrated.");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
