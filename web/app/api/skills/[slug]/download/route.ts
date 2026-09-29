import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { getSkillBySlug } from "@/lib/skills";
import { SKILLS_DIR } from "@/lib/content-dir";

/**
 * GET /api/skills/<slug>/download：Skill 安装包（zip）下载。
 *
 * 一个 Skill = 一个可整体拷进 `.claude/skills/<slug>/` 的目录，所以打的是整个目录
 * （不只是 SKILL.md，否则示例日志和脚本就丢了）。zip 内带顶层目录 `<slug>/`。
 *
 * 打包在运行期做（真源 `web/content/skills/` 直读），不预生成产物：文件总量 ~300KB 级，
 * 内存打包无压力，也不用同步另一份入库物。
 */

/** 目录名即 slug，全仓库都是这个形态；先挡一道，防止 path 拼接被构造穿越 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    if (!SLUG_RE.test(slug) || !getSkillBySlug(slug)) {
        return new Response("Not Found", { status: 404 });
    }

    const dir = path.join(SKILLS_DIR, slug);
    const zip = new JSZip();
    const root = zip.folder(slug);
    if (!root) return new Response("zip error", { status: 500 });

    const walk = (rel: string) => {
        for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
            const relPath = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) walk(relPath);
            else if (e.isFile()) root.file(relPath, fs.readFileSync(path.join(dir, relPath)));
        }
    };
    walk("");

    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    return new Response(new Uint8Array(buf), {
        headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${slug}.zip"`,
            "Cache-Control": "public, max-age=300",
        },
    });
}
