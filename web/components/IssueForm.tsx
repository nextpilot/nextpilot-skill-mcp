"use client";

import { useState } from "react";
import { Info, Send } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { reportManual } from "@/lib/issue-bridge";

/**
 * 站内的「提交 issue」表单。**不直接碰任何 issue API**——
 * 走的是报告页「反馈问题」已经是同一条链：
 *   reportManual() → POST /api/issues（边缘入口）→ _lib/issue-filer.js（建单）
 * token 只在边缘函数，浏览器拿不到写权限（见 functions/api/issues.js 头注释）。
 *
 * 与报告页那个入口的区别只有一处：那边带着"命中的规则 / 结论条数"，
 * 这里是站外通用反馈，那些结构性字段给空值（sanitizePayload 有默认值，不会炸）。
 */

/** 与 SiteHeader 的源代码外链同源；ISSUE_PROVIDER 若换平台，这里要跟着改。 */
const REPO_ISSUES_URL = "https://gitee.com/nextpilot/nextpilot-skill-mcp/issues";

/**
 * 分类只作为**文本前缀**拼进 note（`[bug] …`），不新增结构化字段。
 *
 * 为什么不加一个 category 字段：那要动 ALLOWED_KINDS / sanitizePayload / 建单模板
 * 和它的一整套自测；而分类对 triage 的价值，一个稳定标签就够了。
 * 标签刻意用 ascii：issue 落到仓库里是给所有人看的，不该跟着界面语言变。
 */
const CATEGORIES = [
  { tag: "bug", zh: "页面出错 / 功能异常", en: "Something is broken" },
  { tag: "verdict", zh: "分析结论不对 / 漏判", en: "Wrong or missing verdict" },
  { tag: "idea", zh: "功能建议", en: "Feature request" },
  { tag: "other", zh: "其他", en: "Other" },
];

/** reportManual 内部会再截到 500，留 20 给上面的分类前缀。 */
const MAX_NOTE = 480;
const MIN_NOTE = 5;

export function IssueForm() {
  const { t } = useLanguage();
  const [tag, setTag] = useState<string>(CATEGORIES[0].tag);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = note.trim();
    if (text.length < MIN_NOTE) {
      setError(
        t(
          `请至少写 ${MIN_NOTE} 个字，否则我们没法复现`,
          `Please write at least ${MIN_NOTE} characters so we can reproduce it`,
        ),
      );
      return;
    }
    setError(null);
    reportManual({
      ruleIds: [],
      findingCount: 0,
      severityCounts: { critical: 0, warning: 0, info: 0 },
      note: `[${tag}] ${text}`,
    });
    // 注意：reportManual 是 fire-and-forget（内部不 await、失败也静默），
    // 所以这里只能说"已提交"，不能说"已建单"。
    // 线上若没配 ISSUE_ENABLED，整条上报层是 no-op（见 .env.example）——
    // 那种情况下这条反馈会静默消失，用 /issue-probe 才能查出来。
    setSent(true);
  }

  if (sent) {
    return (
      <div className="w-full max-w-lg">
        <div className="rounded-lg border border-border bg-surface-2 p-5">
          <p className="flex items-start gap-2 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              {t(
                "已提交，谢谢。系统会在代码仓库自动建一条公开 issue；相同内容的反馈会追加在同一条的评论里，不重复建单。",
                "Submitted, thanks. An issue is filed in the repository automatically; duplicates are appended as comments instead of new issues.",
              )}
            </span>
          </p>
          <a
            href={REPO_ISSUES_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost mt-4 inline-flex"
          >
            {t("在仓库里查看", "View in repository")}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg">
      <div className="mb-6 flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("提交反馈 / 报告问题", "Report an issue")}</h1>
        <p className="text-sm text-muted">
          {t(
            "页面报错、结论不对、功能建议都可以写在这里。提交后由服务端转发到代码仓库自动建单。",
            "Bugs, wrong verdicts, feature requests — all welcome. Submissions are forwarded to the repository and filed automatically.",
          )}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t("类型", "Type")}</span>
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="input w-full"
          >
            {CATEGORIES.map((c) => (
              <option key={c.tag} value={c.tag}>
                {t(c.zh, c.en)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("描述", "Description")}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={6}
            maxLength={MAX_NOTE}
            placeholder={t(
              "例如：上传 xxx.ulg 后页面白屏 / 振动结论与实飞不符 / 希望支持批量分析",
              "e.g. Blank page after uploading xxx.ulg / vibration verdict doesn't match the flight / batch analysis please",
            )}
            className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm"
          />
          <span className="mt-1 block text-right text-xs text-muted">
            {note.length} / {MAX_NOTE}
          </span>
        </label>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button type="submit" className="btn-primary w-full py-2.5">
          <Send className="h-4 w-4" />
          {t("提交", "Submit")}
        </button>
      </form>

      {/* 脱敏规则在 lib/error-policy.js，两侧同一份实现——这里只是把结论讲清楚，
          不复制规则本身（谁再抄一份，test-issue-filer.mjs 会红）。 */}
      <p className="mt-4 text-xs leading-5 text-muted">
        {t(
          "提交内容会自动脱敏：邮箱、IP、本机路径、token 等会被替换成占位符，所以别指望在这里留联系方式。issue 公开可见，请勿填写敏感信息；日志内容与字段数值不会上传。",
          "Submissions are scrubbed automatically: emails, IPs, local paths and tokens become placeholders, so don't rely on this form to leave contact info. Issues are public — never include sensitive data. Log contents and field values are never uploaded.",
        )}
      </p>
    </div>
  );
}
