# 项目长期约定（nextpilot-skill-mcp）

## 注释写"为什么"，不写开发日志（用户 2026-09-22 明确要求，已两次强调）

注释**一句话**回答"这条规则为什么存在"，禁止写成开发日志。判定方法：
把注释里的**时间词、发现过程、后果推演**全部删掉后还剩下理由，才合格。

- 禁止：事故复盘（"后来搬到 X，于是开始恒红"）、反思总结（"恒红的守卫比没有守卫更坏"）、
  时间线（"2026-09-18 那天……"）、发现过程（"实测第一版就是这个错"）。
- 教训归 CLAUDE.md 或工作记录，不撒在代码各处。
- 举例——坏："判据是'这份文件的作者是脚本不是人'。格式化改了也白改——下次
  build-knowledge.mjs 一跑就变回去，还会被报成产物不一致。所以生成物一律排除。"
  好："生成物由脚本重写，格式化了会被下次构建覆盖。"

**动手前先给 plan 等用户同意**（同一天明确要求）。不要"顺手就改"——即便是修红灯。
现状交代清楚即可，决定权归用户。

## 检查分档（本机实测，2026-09-22，非估算）

校验命令的单一事实源是 `tools/ci/checklist.yml`，`check_all.py` 只做转发；
hooks 与 workflow 都只调 `check_all.py`。

| 检查 | 实测 |
| --- | --- |
| ruff format --check / ruff check | 2s / 1s |
| pytest engine/tests | 3s |
| check_artifact / check_engine_purity / build:kb --check | 各 1s |
| check-skill-spec / check-mcp-spec | 各 1s（自带反例自检） |
| tsc --noEmit / eslint | 2s / 3s |
| check_hygiene | 4s |
| 日志回归四项（baseline/provider/probe/lint_rules） | 共 11s |
| **test-issue-filer** | **42s** |
| **next build** | **144s**（清单 timeout 300s，安全） |
| **playwright-analyze（日志分析流程 11 条）** | **约 420s**（timeout 900，CI 里最长一步） |
| **mutate_guards（43 条变异）** | **约 20 分钟**（27 条打在 test-issue-filer 上，42s×27） |

分档结论：本地只留秒级；分钟级的（E2E / build / 自证）全部放云端 CI。

CI `checks` job 估算约 **17 分钟**（build + 冒烟 + analyze + 其余），预算 40 分钟，余量约 2.3 倍。

## 两处易混的 `sample.ulg`（动手前先分清）

**同名不同物**，内容完全不一样：

| 路径 | 入库 | 大小 | topic | 时长 |
| --- | --- | --- | --- | --- |
| `tools/calibrate/logs/sample.ulg` | ❌ 不入库 | 4.0MB | 15 | 69s |
| `web/e2e/fixtures/sample.ulg` | ✅ **入库** | 921KB | 70 | 1174s |

**推论**：CI 里的 `playwright-analyze` 能真跑，靠的是右边那份（**不需要 `has_logs` 门控**）；
日志回归 4 项靠左边那份，云端必然 SKIP。**别把它们当同一份文件。**

⚠️ **「原始日志不入库」不能当通用红线引用**：它对 `tools/calibrate/logs/*.ulg` 成立，
但 `web/e2e/fixtures/sample.ulg` 是已入库的例外（含 GPS 63.417°N/10.408°E，用户 2026-09-22
知情后裁决保留现状）。

## `--with-*` 开关与 `--stage` 是两个正交维度（踩过一次）

**不许从阶段列表反推开关。** 原形：`.githooks/pre-push` 写
`if with_e2e and "ci" not in stages: cmd.append("--with-e2e")` ——
而 E2E 步骤就住在 `ci` 阶段里，于是条件**恒假**，`WITH_E2E=1` 静默不跑 E2E。

- 正确：`if with_e2e: cmd.append("--with-e2e")`，各自独立传。
- 已配守卫：`check_hygiene.py`「hook 不从阶段列表反推开关」+ 对应变异自证。

**这类 bug 没有任何输出**（命令拼得出、退出码 0、日志正常），**只能靠静态扫**。

## 写守卫时的两个坑（都实际恒绿过）

1. **正则里的字符类要含数字**：开关名 `with_e2e` 含 `2`，`[a-z_]+` 匹配不到 →
   守卫**恒绿**。一条永远不红的守卫比没有守卫更坏。用 `[a-z0-9_]+`。
2. **`mutate_guards._apply` 按字节读写**，锚点必须与文件行尾逐字节一致。
   hook 文件在工作区是 **CRLF**，多行锚点里写 `\n` 匹配不到（报 `anchor mismatch`）。
   **hook 的变异锚点一律用单行。**

## 环境事实

- 项目 Python 是 `C:\Users\zhanfuyu\anaconda3\python.exe`（有 ruff/pytest/numpy/pyulog）。
  托管 Python 3.13 缺科学栈，`check_artifact` / `check_hygiene` 会假失败。
- Bash 工具需先 `export PATH="/usr/bin:/bin:/mingw64/bin:$PATH"` 才能用。
- 远端是 gitee 私仓 `https://gitee.com/nextpilot/nextpilot-skill-mcp.git`，
  免提权能 `git ls-remote`；`git push` 实测要 **6 分钟**且中途零输出（别误判卡死）。
- 本机**没有 `xz` 命令行工具**，但 Python 标准库有 `lzma`。

## gitee 的 Git LFS 不可用（实测，别再规划 LFS 方案）

gitee 的 LFS **只对付费/试用企业版开放**，免费与个人仓库一律拒绝。实测证据
（2026-09-22）：

```bash
curl -s -X POST -H "Accept: application/vnd.git-lfs+json" \
  -H "Content-Type: application/vnd.git-lfs+json" \
  -d '{"operation":"download","transfers":["basic"],"objects":[]}' \
  https://gitee.com/nextpilot/nextpilot-skill-mcp.git/info/lfs/objects/batch
```

→ 本仓库 **403** `LFS only supported repository in paid or trial enterprise.`；
对照 `gitee.com/oschina/git-osc.git` 同请求 **200**。
即端点与请求都对，**是服务端按仓库拒绝**。网上"免费 5GB LFS"的说法与本仓库实测冲突。

大文件（本项目的测试日志）改用 **xz 压缩入库**：`lzma.compress(preset=6)` 实测
39.2MB → 16.0MB，最大单文件 7.21MB，远低于 gitee 免费版单文件 50MB 的上限。

## 本机 registry 会导致 audit / 部分安装失败（实测）

本机 `~/.npmrc` 与 pnpm registry 都指向 **`registry.npmmirror.com`**，由此两个坑：

- **`pnpm audit` 直连必失败**：该镜像**没实现 audit 端点** →
  `ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS`。**必须加
  `--registry=https://registry.npmjs.org/`**（实测通，5.7s）。
  CI 未配 registry、默认走官方源，所以不写这个 flag 会"本机红、CI 绿"。
- **pip 装包走 aliyun 镜像**（`mirrors.aliyun.com`，HTTP），会被 pip 判定为
  不安全主机而忽略；有的包（如 `pip-audit`）因此"找不到版本"。
  需要时显式 `--index-url https://pypi.org/simple`。

## 本机没有 xz 命令行工具

但 Python 标准库有 `lzma`（实测可用），压缩/解压走标准库即可，不依赖外部二进制。

## 本机 `python` 没有 ruff（hook / 脚本设计的硬约束）

`python` 解析到托管 `.workbuddy/binaries/python/3.13.12`，**没有 ruff**；
项目要的是 `C:/Users/zhanfuyu/anaconda3/python.exe`（ruff 0.16.7，与第 40 行同一条事实，
这里单列是因为它决定了一个设计）：**任何"用 python 跑检查"的脚本都必须自己探测解释器**，
不能靠 shebang 或 PATH。否则 `sys.executable -m ruff` 直接 `No module named ruff`。

`check_all.py` 内部就是用 `sys.executable -m ruff` —— 所以**启动它的解释器必须是带 ruff 的那个**。
这是 `.githooks/pre-commit` 在本机历史上坏掉的根因。

## Git 在 Windows 上的 hook 调用规则（Git 源码行为）

- 只认**无扩展名**的 hook，或 `.exe` / `.bat` / `.cmd`——**`.ps1` 永远不会被 Git 调用**（纯手动辅助脚本）。
- Git 用 `/bin/sh` 启动 hook，**脚本里路径一律用 `/` 分隔符**：
  连 `python.exe` 前那一节也要写 `C:/Users/.../python.exe`，反斜杠会被 sh 当转义符吃掉。


