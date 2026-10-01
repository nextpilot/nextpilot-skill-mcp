# 检查与门禁的坑

写代码时留意这几条，能省掉大部分"为什么红了"的排查时间。

## 命令与工具

- **`pnpm` 是全局工具**，`web/node_modules/` 下没有它。清单里原先写
  `{NODE} node_modules/pnpm/bin/pnpm.cjs` —— 那条路径不存在，
  于是这一步在**任何机器上都恒红**（恒红与恒绿同样是"没有守卫"）。
- **`checklist.yml` 里 `{PNPM}` 是占位符，不是笔误**：与 `{NODE}` 一样走 PATH
  （`shutil.which("pnpm")`）。
- **`pnpm --filter` 必须带 `./`**：`web` 是**目录**不是包名（`web/package.json` 的
  `name` 是 `nextpilot-skill-mcp`），不带 `./` 时 pnpm 按包名匹配 → 匹配 0 个项目 →
  **rc=0、零输出、静默空跑**。由 `check_pnpm_filter` 拦。
- **本地 `pnpm audit` 必须带 `--registry=https://registry.npmjs.org/`**：
  本机 `~/.npmrc` 指向 npmmirror，那镜像没实现 audit 端点，不带就本机红、CI 绿。
- **`ruff` 只认 `.py`、`eslint` 只认 `.js`/`.mjs`**，都不看 Markdown 代码块。
- **`check_secrets` 扫全仓**（含 `.md`）—— 文档里留一句假密钥同样会被抓。
- **`pnpm add` 在本机会卡 20+ 分钟**（实测 21m52s，resolve 337 个包后只新增 1 个），
  期间零输出，容易被误判成卡死。安装时用后台任务跑。
- **`pnpm add` 会因 `ERR_PNPM_IGNORED_BUILDS` 报错但不影响装包**：这是 pnpm 的构建脚本
  审批机制（需 `pnpm approve-builds`），与所装的包无关。别当成安装失败而重装一遍。
- **`pnpm web:dev` 会阻止第二个 dev server**：Next 16 按**目录**判重（不是按端口），
  同一目录已有 dev server 时会直接报错退出，换 `PORT` 没用。

## E2E

- **`--grep` 匹配完整标题链**（`describe › test`），所以 grep `日志分析流程` 会命中整个
  describe 的 11 条，而不是"只跑那条 420s"。要精确只跑一条得用
  `--grep '上传 .ulg 并完成分析'`。同一类判据写错曾导致 `--grep-invert` 失效。
- **E2E 首次跑要 7 分钟**：Pyodide 要下 WASM + numpy + pyulog，别在前 2 分钟就以为卡死。
- **站点内容不需要同步**：真源就在 `web/content/` 下（guide/skills/mcp，全部入库），
  运行期读盘，dev 下改完刷新即见。

## 知识构建

- **`build-knowledge` 的产物里有一个落在 `knowledge/` 根**
  （`rules-editor-schema.generated.json`）。所以 `--watch` 只监听 `rules/`、`plot/`、
  `meta/`、`knowledge/llm/` 这些真源目录，并在监听顶层目录时按文件名滤掉
  `*.generated.*` —— 否则写产物会触发自己、无限重建。

## hook 的解释器探测

`python` 不等同于"有 ruff 的 python"：本机 `python` 可能解析到没有 ruff 的托管 Python，
而 `check_all.py` 内部用 `sys.executable -m ruff` 跑格式化检查。hook 若被那个解释器启动，
ruff 那一步直接 `No module named ruff`，**每次 push 都红**。所以 hook 必须自己探测解释器，
不能靠 shebang。

探测的三条约束：

1. **优先 anaconda，回退 PATH 上的 `python`**。顺序不能反——托管 Python 恰好排在 PATH 前面，反了等于没探测。
2. **探测不到时按需 `re-exec`**：若 `sys.executable` 不是选中的那个、且 hook 是被 Python 启动的，用 `os.execv` 换到选中的解释器重跑自己（加环境变量哨兵防无限递归）。
3. **`exit 127` 是逃生门**：两个候选都不可用时打印明确的"缺什么"再 `exit 127`，由 Git 放行。hook 的职责是提醒，不是把人锁在门外。

候选顺序写死，不读配置文件——多一个事实源就多一处会腐烂。

**Windows 上 Git 用 `/bin/sh` 启动 hook，脚本里一律用 `/` 分隔符**，反斜杠会被 sh 当转义符吃掉。

**hook 的变异锚点一律用单行**：`mutate_guards._apply` 按字节读写，工作区里 hook 是 CRLF，
多行锚点里写 `\n` 一个都匹配不到，会报 `anchor mismatch`。

## 文档 § 引用的点名解析

卫生检查解析「`X.md` §4」这类引用时，曾经只用「原文直配 + basename 回退」两步定位文档。
basename 回退会赌扫描顺序：全仓多份 `README.md`，谁先进索引谁赢——`contribute/README.md`
（含 2.1/2.2/2.3 编号小节）进索引后，`architecture/web-app.md` 一句
「`../operations/README.md` §4」就指错文档报悬空；markdown 链接的 **URL 部分也是文档名**
且比链接文本离 § 更近，只看文本躲不开这个坑。

现在按三步解析：原文直配 → **按相对链接语义解析**（URL 里的 `../x/y.md` 相对引用方文档
定位）→ 唯一 basename。**撞名短名不算点名**，解析不出唯一落点就走「本文档/全局」回退，
不再赌扫描顺序。写「点名 + 节号」时尽量点名到唯一短名（如 `checks-by-stage.md`），
实在要引 README 就写相对路径。
