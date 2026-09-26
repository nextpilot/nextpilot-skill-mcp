import type { Metadata } from "next";
import { ArrowLeft, Compass, Radar } from "lucide-react";

export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

export default function NotFound() {
    return (
        <div className="page-shell relative flex min-h-[70vh] flex-col items-center justify-center text-center">
            {/* 点阵背景 — 与 Hero 区一致 */}
            <div
                className="pointer-events-none absolute inset-0"
                style={{
                    backgroundImage: "radial-gradient(circle, rgba(24,121,78,0.06) 1px, transparent 1px)",
                    backgroundSize: "26px 26px",
                    backgroundPosition: "-2px -2px",
                }}
                aria-hidden
            />

            {/* 装饰图标 */}
            <div className="relative mb-10 flex items-center gap-5" aria-hidden>
                <Radar className="h-12 w-12 text-primary/20" strokeWidth={1.5} />
                <div className="relative">
                    <span className="text-[120px] font-bold leading-none tracking-[-0.05em] text-primary/8 select-none sm:text-[160px]">
                        404
                    </span>
                    {/* 扫过 0 的光标线 */}
                    <span className="absolute left-[38%] top-[9%] h-[72%] w-[2px] bg-primary/25 blur-[1px] animate-pulse sm:left-[38.5%] sm:h-[74%]" />
                </div>
                <Compass className="h-12 w-12 text-primary/20" strokeWidth={1.5} />
            </div>

            <h1 className="relative text-xl font-semibold tracking-[-0.01em] text-text sm:text-2xl">
                信号丢失 · Signal Lost
            </h1>

            <p className="relative mt-3 max-w-md text-[15px] leading-7 text-muted">
                目标页面已偏离预定航线，或从未存在于这片空域。
                <br />
                请检查飞行计划（URL），或返回基地重新导航。
            </p>
            <p className="relative mt-1 text-[13px] leading-6 text-faint">
                The page you requested is off course or does not exist in this airspace.
            </p>

            <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3">
                <a href="/" className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-[15px]">
                    <ArrowLeft className="h-[18px] w-[18px]" />
                    返回基地
                </a>
                <a href="/analyze" className="btn-ghost inline-flex items-center gap-2 px-5 py-2.5 text-[15px]">
                    <Radar className="h-[18px] w-[18px]" />
                    分析飞控日志
                </a>
            </div>
        </div>
    );
}
