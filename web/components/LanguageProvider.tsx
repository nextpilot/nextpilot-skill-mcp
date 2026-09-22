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

    useEffect(() => {
        if (initialLanguage) return;
        const stored = window.localStorage.getItem("nextpilot-language");
        const nextLanguage = stored === "en" || stored === "zh" ? stored : "zh";
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
