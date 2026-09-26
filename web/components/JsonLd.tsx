/**
 * 通用 JSON-LD 结构化数据脚本。
 *
 * 用法：<JsonLd data={siteJsonLd()} />
 */
export function JsonLd({ data }: { data: object }) {
    return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
