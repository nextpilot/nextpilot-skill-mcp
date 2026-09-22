/**
 * 标题的「中文 | English」写法解析。
 * 渲染（MDX 的 h2/h3 覆写）与右侧目录（从原始 markdown 抽取）必须用同一套规则，
 * 否则目录里的锚点会指不到标题上。此处不依赖 node，客户端组件也能引。
 */

export function splitHeading(text: string): { zh: string; en: string } {
    const [zh, ...rest] = text.split("|");
    const head = zh.trim();
    // 只有中文时英文回退到同一串，避免英文界面下出现空标题
    return { zh: head, en: rest.join("|").trim() || head };
}

/** 生成锚点 id。中文原样保留（href 侧再 encodeURIComponent），标点折叠成连字符。 */
export function headingId(zh: string): string {
    const slug = zh
        .toLowerCase()
        .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
        .replace(/^-+|-+$/g, "");
    return slug || "section";
}

export function headingHref(zh: string): string {
    return `#${encodeURIComponent(headingId(zh))}`;
}
