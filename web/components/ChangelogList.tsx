import type { ChangelogEntry } from "@/lib/types";
import { formatDate } from "@/lib/format";

/** 版本历史（对齐 SkillHub 的版本列表：版本号 / 日期 / 变更条目） */
export function ChangelogList({ entries, currentVersion }: { entries: ChangelogEntry[]; currentVersion?: string }) {
    if (entries.length === 0) {
        return <p className="text-sm text-muted">暂无版本记录。</p>;
    }

    return (
        <ol className="relative space-y-6 border-l border-border pl-6">
            {entries.map((e, i) => {
                const isCurrent = e.version === currentVersion || (!currentVersion && i === 0);
                return (
                    <li key={`${e.version}-${i}`} className="relative">
                        <span
                            className={`absolute top-1 -left-[31px] h-2.5 w-2.5 rounded-full ring-4 ring-surface ${
                                isCurrent ? "bg-primary" : "bg-border"
                            }`}
                            aria-hidden
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-semibold">v{e.version}</span>
                            {isCurrent && (
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                                    当前版本
                                </span>
                            )}
                            <span className="text-xs text-muted">{formatDate(e.date)}</span>
                        </div>
                        {e.notes.length > 0 && (
                            <ul className="mt-2 space-y-1 text-sm leading-6 text-muted">
                                {e.notes.map((n) => (
                                    <li key={n} className="flex gap-2">
                                        <span className="text-border">·</span>
                                        <span>{n}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
