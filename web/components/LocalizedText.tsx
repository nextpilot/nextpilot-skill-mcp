"use client";

import { useLanguage } from "./LanguageProvider";

export function LocalizedText({ zh, en }: { zh: string; en: string }) {
    const { language } = useLanguage();
    return language === "zh" ? zh : en;
}
