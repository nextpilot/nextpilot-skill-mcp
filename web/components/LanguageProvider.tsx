"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Language = "zh" | "en";

type LanguageContextValue = {
    language: Language;
    setLanguage: (language: Language) => void;
    t: (zh: string, en: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
    children,
    initialLanguage,
}: {
    children: React.ReactNode;
    initialLanguage?: Language;
}) {
    const [language, setLanguageState] = useState<Language>(initialLanguage ?? "zh");

    // 同步 <html lang>：URL 带 locale 时以 URL 为准（initialLanguage），否则回落到本地记忆。
    // 不能因为 initialLanguage 存在就提前 return —— 那会让 /en/* 的 lang 永远停在根 layout
    // 的默认值 zh-CN，读屏软件按中文发音、搜索引擎按中文收录。
    useEffect(() => {
        const nextLanguage = initialLanguage
            ? initialLanguage
            : (() => {
                  const stored = window.localStorage.getItem("nextpilot-language");
                  return stored === "en" || stored === "zh" ? stored : "zh";
              })();
        setLanguageState(nextLanguage);
        document.documentElement.lang = nextLanguage === "zh" ? "zh-CN" : "en";
    }, [initialLanguage]);

    function setLanguage(nextLanguage: Language) {
        setLanguageState(nextLanguage);
        window.localStorage.setItem("nextpilot-language", nextLanguage);
        document.documentElement.lang = nextLanguage === "zh" ? "zh-CN" : "en";
    }

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t: (zh, en) => (language === "zh" ? zh : en) }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) throw new Error("useLanguage must be used within LanguageProvider");
    return context;
}
