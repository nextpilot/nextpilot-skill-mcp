"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Cloud,
  GitBranch,
  HardDrive,
  Loader2,
  LogOut,
  Mail,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { signOut, useSession } from "@/components/SessionProvider";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { LocalizedText } from "@/components/LocalizedText";
import { getDeviceId } from "@/lib/device-id";
import { initReportStore, listReports } from "@/lib/report-history";
import { formatDateTime } from "@/lib/format";

/** GET /api/reports 返回的记录（只取列表页要用的字段） */
interface CloudReport {
  id: string;
  fileName: string;
  findingCount: number;
  hasReport: boolean;
  analyzedAt: string;
}

const PLAN_LABEL: Record<string, string> = {
  free: "免费版",
  pro: "Pro 个人版",
  team: "团队版",
};

export function MeClient() {
  const { data: session, status } = useSession();

  const [quota, setQuota] = useState<{ used: number; limit: number; day: string } | null>(null);
  const [cloud, setCloud] = useState<CloudReport[] | null>(null);
  /** 本机报告（IndexedDB，只在这台设备）：null 表示还在初始化 */
  const [localCount, setLocalCount] = useState<number | null>(null);
  const [localCritical, setLocalCritical] = useState(0);

  // 账号信息与额度（登录后才有意义）
  useEffect(() => {
    if (status !== "authenticated") {
      setQuota(null);
      setCloud(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const resp = await fetch("/api/me", {
          cache: "no-store",
          headers: { "x-device-id": getDeviceId() },
        });
        if (resp.ok && !cancelled) {
          const data = await resp.json();
          if (data.quota) setQuota(data.quota);
        }
      } catch {
        // 边缘函数不可用时不阻断页面
      }
      try {
        const resp = await fetch("/api/reports", { cache: "no-store" });
        if (resp.ok && !cancelled) {
          const data = await resp.json();
          setCloud(data.reports ?? []);
        }
      } catch {
        // 同上
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  // 本机报告存档（IndexedDB）：所有设备都不上传，/me 只给个概览，明细在 /analyze
  useEffect(() => {
    void (async () => {
      await initReportStore();
      const all = listReports();
      setLocalCount(all.length);
      setLocalCritical(
        all.reduce(
          (sum, r) => sum + (r.findings ?? []).filter((f) => f.severity === "critical").length,
          0,
        ),
      );
    })();
  }, []);

  if (status === "loading") {
    return (
      <div className="page-shell flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="page-shell py-10">
        <Breadcrumbs items={[{ label: "我的" }]} />
        <div className="card mx-auto max-w-md p-8 text-center">
          <p className="text-lg font-semibold">
            <LocalizedText zh="请先登录" en="Sign in required" />
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">
            <LocalizedText
              zh="登录后可以在这里查看账号信息、AI 解读额度与云端报告。"
              en="Sign in to see your account, AI quota and cloud reports."
            />
          </p>
          <Link
            href="/login?callbackUrl=%2Fme"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <LocalizedText zh="去登录" en="Sign in" />
          </Link>
        </div>
      </div>
    );
  }

  const name = session.user.name || session.user.email || "飞手";
  const plan = PLAN_LABEL[session.user.plan] ?? session.user.plan;
  const quotaLeft = quota ? Math.max(quota.limit - quota.used, 0) : null;

  return (
    <div className="page-shell pt-4 pb-10 sm:pt-5">
      <Breadcrumbs items={[{ label: "我的" }]} />
      <h1 className="text-[24px] font-semibold tracking-[-0.02em]">
        <LocalizedText zh="我的" en="My account" />
      </h1>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* 账号信息 */}
        <div className="card p-5">
          <div className="flex items-start gap-4">
            {session.user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt=""
                className="h-14 w-14 shrink-0 rounded-full border border-border object-cover"
              />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
                {name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold text-text" title={session.user.email ?? name}>
                {name}
              </p>
              {session.user.email && (
                <p className="mt-0.5 truncate text-sm text-muted">{session.user.email}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
                  {plan}
                </span>
                {session.user.loginType && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-muted">
                    {session.user.loginType === "github" ? (
                      <>
                        <GitBranch className="h-3 w-3" />
                        GitHub
                      </>
                    ) : (
                      <>
                        <Mail className="h-3 w-3" />
                        <LocalizedText zh="邮箱登录" en="Email" />
                      </>
                    )}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void signOut({ redirectTo: "/" })}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              <LogOut className="h-4 w-4" />
              <LocalizedText zh="退出" en="Sign out" />
            </button>
          </div>
        </div>

        {/* 今日 AI 解读额度 */}
        <div className="card p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Zap className="h-4 w-4 text-primary" />
            <LocalizedText zh="今日 AI 解读额度" en="Today's AI quota" />
          </div>
          {quota ? (
            <>
              <div className="mt-3 flex items-baseline gap-2">
                <span
                  className={`text-2xl font-bold ${quotaLeft === 0 ? "text-critical" : "text-text"}`}
                >
                  {quotaLeft}
                </span>
                <span className="text-sm text-muted">/ {quota.limit} 次</span>
                <span className="ml-auto text-xs text-faint">每日 0 点（UTC）重置</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    quotaLeft === 0 ? "bg-critical" : "bg-primary"
                  }`}
                  style={{ width: `${Math.min((quota.used / quota.limit) * 100, 100)}%` }}
                />
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted">
              <LocalizedText zh="额度信息暂不可用" en="Quota unavailable" />
            </p>
          )}
        </div>
      </div>

      {/* 报告概览 */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Cloud className="h-4 w-4" />}
          label={<LocalizedText zh="云端报告" en="Cloud reports" />}
          value={cloud === null ? "—" : cloud.length}
          hint={
            cloud === null
              ? undefined
              : <LocalizedText zh="登录账号名下，跨设备可见" en="Linked to your account" />
          }
        />
        <StatCard
          icon={<HardDrive className="h-4 w-4" />}
          label={<LocalizedText zh="本机报告" en="Local reports" />}
          value={localCount === null ? "—" : localCount}
          hint={<LocalizedText zh="只在这台设备的浏览器里" en="Only on this device" />}
        />
        <StatCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label={<LocalizedText zh="本机严重告警" en="Critical findings" />}
          value={localCount === null ? "—" : localCritical}
          hint={<LocalizedText zh="本机报告中的 critical 结论" en="In local reports" />}
        />
      </div>

      {/* 云端报告列表 */}
      <div className="card mt-4 p-4 sm:p-5">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <Cloud className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">
            <LocalizedText zh="云端分析报告" en="Cloud reports" />
          </span>
          {cloud && <span className="text-xs text-muted">（{cloud.length}）</span>}
          <Link
            href="/analyze"
            className="ml-auto inline-flex items-center gap-0.5 text-xs text-muted hover:text-primary"
          >
            <LocalizedText zh="管理全部历史" en="Manage all history" />
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {cloud === null ? (
          <p className="px-1 py-6 text-center text-xs text-muted">
            <LocalizedText zh="加载中…" en="Loading…" />
          </p>
        ) : cloud.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs leading-5 text-muted">
            <LocalizedText
              zh="暂无云端报告。登录后生成的 AI 报告会同步到这里，保留 7 天。"
              en="No cloud reports yet. Reports generated while signed in sync here and are kept for 7 days."
            />
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {cloud.slice(0, 10).map((r) => (
              <li key={r.id}>
                <Link
                  href={`/analyze/${encodeURIComponent(r.id)}`}
                  className="flex items-center gap-3 rounded-md px-1 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">{r.fileName}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {formatDateTime(r.analyzedAt)} · {r.findingCount} 项检查结论
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {cloud !== null && cloud.length > 10 && (
          <p className="mt-2 text-center text-[11px] text-faint">
            仅显示最近 10 条，全部记录见
            <Link href="/analyze" className="mx-0.5 text-primary hover:underline">
              日志分析
            </Link>
            页
          </p>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  value: number | string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </span>
      <p className="mt-2 text-lg font-bold leading-tight text-text">{value}</p>
      <p className="text-xs text-muted">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-4 text-faint">{hint}</p>}
    </div>
  );
}
