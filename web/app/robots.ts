import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";

// host / sitemap 两行要是当前生效的域名。域名是构建期常量（`SITE_URL`），
// 换域名 = 改环境变量 + 重新部署，robots 与 sitemap 一直指向同一个地址。
export default function robots(): MetadataRoute.Robots {
    const siteUrl = SITE_URL;
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
