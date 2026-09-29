/**
 * 「日志分析」的两句固定文案：隐私承诺 + 免责声明。
 *
 * 措辞只在这里改，以前各写各的（页脚一句、上传卡自己另写一句近似的），迟早改一边漏一边。
 * 落点（2026-09-22 定稿）：两句都只在上传卡，标题行带「最大支持300MB」，其后依次是
 * 隐私承诺、免责声明。句尾不带标点，由落点自己补句号。
 */
export const LOG_PRIVACY_NOTE = {
    zh: "日志在浏览器本地解析，原始文件不上传",
    en: "Logs are parsed locally in your browser; raw files are never uploaded",
} as const;

export const ANALYSIS_DISCLAIMER = {
    zh: "分析结果为辅助判读，不能完全替代人工排查",
    en: "Analysis results assist interpretation and cannot fully replace human troubleshooting",
} as const;
