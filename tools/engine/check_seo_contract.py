r"""SEO 输出契约守卫。

## 为什么要有它

这三项不是"代码写得对不对"，而是"爬虫与社交平台拿到的标签对不对"——本地肉眼看不见，
只能靠源码结构断言。一旦退化，损失是英文页被当中文页收录、分享卡片串语言、lastmod
信号被搜索引擎忽略，而且没有任何本地信号。

## 判据

1. `lib/seo.ts` 的 og:url 复用 canonicalUrl：少写 locale 前缀，社媒抓英文页时按中文
   URL 回访，卡片串语言。
2. `app/[locale]/layout.tsx` 带 lang 纠正脚本：根 layout 的 `<html lang>` 写死 zh-CN，
   而 Next 不允许子 layout 另起 `<html>`，所以只能在子 layout 补脚本纠正。
3. `app/sitemap.ts` 不出现裸 `new Date()` 当 lastModified：它在每次请求时求值，等于
   宣称所有页面刚改过，不可信的 lastmod 会被搜索引擎忽略。
4. `next.config.ts` 下发安全响应头：缺 CSP / X-Frame-Options 就没有第二道防线。

读源码而不是读构建产物：构建一次要分钟级，而这里守的是几行常量之间的关系，
读源码就够，也让这道门能进 pre-push 而不拖慢推送。

输出只用 ASCII 与 GBK 里都有的符号：Windows 控制台默认 GBK，`✓ ✗ ▶` 会崩。

用法：python tools/engine/check_seo_contract.py；任一检查失败退出码为 1。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from _logging import get_logger  # noqa: E402

log = get_logger("seo-contract")

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"


def _read(rel: str) -> str:
    try:
        return (WEB / rel).read_text(encoding="utf-8")
    except OSError:
        return ""


def check_og_url_matches_canonical() -> list[str]:
    """og:url 必须与 canonical 同址。"""
    src = _read("lib/seo.ts")
    if not src:
        return ["web/lib/seo.ts 读不到，无法校验 og:url 契约"]
    if "const ogUrl = canonicalUrl;" not in src:
        return [
            "lib/seo.ts 的 ogUrl 没有复用 canonicalUrl —— og:url 会丢掉 /en、/zh 前缀，"
            "社交平台抓英文页时按中文 URL 回访，卡片内容串语言"
        ]
    return []


def check_locale_lang_script() -> list[str]:
    """[locale] layout 必须带 lang 纠正脚本。"""
    src = _read("app/[locale]/layout.tsx")
    if not src:
        return ["web/app/[locale]/layout.tsx 读不到，无法校验 lang 纠正"]
    if "documentElement.lang" not in src:
        return [
            "app/[locale]/layout.tsx 缺 lang 纠正脚本 —— 根 layout 的 <html lang> 写死 zh-CN，"
            "而 Next 不允许子 layout 另起 <html>；少了这段英文页 lang 会一直是 zh-CN，"
            "搜索引擎按中文收录、读屏软件按中文发音"
        ]
    return []


def check_sitemap_no_fake_lastmod() -> list[str]:
    """sitemap 不许用裸 new Date() 当 lastModified。"""
    src = _read("app/sitemap.ts")
    if not src:
        return ["web/app/sitemap.ts 读不到，无法校验 lastModified"]
    problems: list[str] = []
    for lineno, line in enumerate(src.splitlines(), 1):
        stripped = line.strip()
        if stripped.startswith("//"):
            continue
        if re.search(r"lastModified:\s*new Date\(\s*\)", stripped):
            problems.append(
                f"app/sitemap.ts:{lineno} lastModified 用了裸 new Date() —— 每次请求求值，"
                "等于宣称所有页面刚改过；不可信的 lastmod 会被搜索引擎忽略，不如不写"
            )
    return problems


def check_security_headers() -> list[str]:
    """next.config 必须下发安全响应头。"""
    src = _read("next.config.ts")
    if not src:
        return ["web/next.config.ts 读不到，无法校验安全响应头"]
    required = {
        "X-Content-Type-Options": "防 MIME 嗅探",
        "X-Frame-Options": "防点击劫持",
        "Strict-Transport-Security": "防降级到 http",
        "Content-Security-Policy-Report-Only": "CSP 起步用 Report-Only 观察",
        "Referrer-Policy": "控制 referrer 泄漏",
    }
    # 只认 `key: "<头名>"` 的形态，不认注释里的同名文字——注释写了头名不等于真的下发了，
    # 用子串匹配会让"把代码删了但注释留着"这种改法蒙混过关。
    declared = set(re.findall(r'key:\s*"([^"]+)"', src))
    missing = [f"{k}（{why}）" for k, why in required.items() if k not in declared]
    return [f"next.config.ts 缺安全响应头：{'、'.join(missing)}"] if missing else []


CHECKS: list[tuple[str, object]] = [
    ("og:url 与 canonical 同址", check_og_url_matches_canonical),
    ("[locale] layout 带 lang 纠正", check_locale_lang_script),
    ("sitemap 不写假 lastModified", check_sitemap_no_fake_lastmod),
    ("next.config 下发安全响应头", check_security_headers),
]


def main(argv: list[str]) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)  # 与 check_all.py 同理：重定向时不与子进程输出交错

    log.print_header("SEO 输出契约守卫")

    failed: list[str] = []
    results: list[tuple[str, str]] = []
    for i, (name, fn) in enumerate(CHECKS, 1):
        problems = fn()  # type: ignore[operator]
        ok = len(problems) == 0
        if ok:
            log.print_check(i, len(CHECKS), name, True)
        else:
            # 格式有意义：mutate_guards.py 靠 `FAIL <名字>  -> <一句话>` 数"红了几条"，
            # 名字要与注册表里的 expect 逐字一致。
            one_line = f"FAIL {name}  -> {problems[0]}" + (f"（共 {len(problems)} 处）" if len(problems) > 1 else "")
            log.print_check(i, len(CHECKS), name, False, detail=one_line, err="\n".join(problems))
            failed.append(name)
        results.append((name, "ok" if ok else "fail"))

    return log.print_summary(results, [])


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
