import type { MetadataRoute } from "next";
import { getSiteSettings } from "@/lib/site-settings";

// host / sitemap 两行必须是**当前生效的域名**：后台改了域名而这里还写旧地址，
// 搜索引擎会照着 robots 里的 sitemap 去爬一个不存在（或已换站）的地址。
export default async function robots(): Promise<MetadataRoute.Robots> {
    const { siteUrl } = await getSiteSettings();
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            disallow: ["/api/", "/internal/", "/edge-dev/", "/zh/me", "/en/me"],
            crawlDelay: 5,
        },
        sitemap: `${siteUrl}/sitemap.xml`,
        host: siteUrl,
    };
}
