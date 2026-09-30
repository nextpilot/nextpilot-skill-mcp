# 日志规则校准脚本

用真实 `.ulg` 校准阈值的本地工具（阈值本身住在 `knowledge/` 下）。
它**直接跑 knowledge/engine/ 下的 Python 引擎与 knowledge/px4/rules/\*.yaml 中的规则**，
与浏览器端 Pyodide 执行的是同一份规则源码、同一套逻辑——改完 `knowledge/` 无需 Node 构建即可回归。

本地跑引擎的命令行入口在 `tools/engine/run_engine.py`：

- `python tools/engine/run_engine.py <file.ulg> ...`：输出完整 findings JSON（规则清单见站内
  `/guide/rule-catalogue`，构建期生成在 `web/.generated/guide/rule-catalogue.mdx`，不入库）。
- `python tools/engine/run_engine.py --probe-data <file.ulg> ...`：校验数据层三个 API
  （`np_manifest` / `np_materials` / `np_series`）的结构、JSON 合法性（NaN→null）
  与降采样点数。
- `dump_px4log_stats.py <file.ulg> ...`：dump 三个关键消息的原始指标分布，用于定阈值。
- `dump_px4log_fields.py <file.ulg>`：打印 `vehicle_imu_status / estimator_status /
battery_status / sensor_imu` 的真实字段名（不同 PX4 版本字段差异很大）。
- `check_rules_compute.py <file.ulg> <rule_id>`（**已搬到 `tools/engine/`**）：**表达式级**调试——把规则的 compute 拆成子表达式
  逐个求值，回答"这一层为什么算不出来"，纯文本输出。
- `workbench.py <file.ulg> <rule_id|规则文件名>`：**单条规则体检**——在同一份日志上跑
  compute 与 triggers，给出结论、一张自包含 HTML（曲线 + 阈值线 + 规则算出的值 + 缺什么），
  退出码 0（跑通）/ 2（用错或产物旧）/ 3（跑不通）。图优先复用浏览器那张
  （`web/lib/knowledge/plots.generated.ts` 的 `PLOT_PRESETS`），取数走引擎 `np_series()`，
  与浏览器同一条路径。加 `--open` 直接打开。
  **不给任何参数**则进网页模式：起一个只听 127.0.0.1 的临时服务并打开浏览器
  （`--port` 指定端口，`--no-browser` 不自动弹窗，Ctrl+C 结束）。
  网页模式是**三个工具**，首页各一个入口（`/ulog` / `/rule` / `/plot`）：
  - **① 看日志（probe ulog）**：列出一份 `.ulg` 里有哪些 topic（含实例数与采样数），
    点开一个 topic 看它有哪些字段，勾上字段就看取值摘要（最小/最大/均值/首尾）与曲线。
    清单来自 `np_manifest()`，取值来自 `np_series()`。
  - **② 日志 + 规则**（`knowledge/px4/rules/*.yaml`，26 个文件 / 31 条规则）：左栏改 YAML →
    「保存并看效果」= 直接写回源文件 → 跑一次 `build-knowledge.mjs`（约 1 秒）→
    右栏**把这个文件里装的规则全跑一遍**，逐条出结论 + 图 + 执行过程。
  - **③ 日志 + 图**（`knowledge/px4/plot/*.yml`）：同上，但右栏出的是「这张图画出来什么样」。

  ②③ 的共同约定：
  - **按文件编、不按规则 id 拆开编** —— 按 id 编辑要「解析 → 改一条 → 反序化回 YAML」，
    那会冲掉注释与 `>-` 折叠写法；而一个文件本来就能装多条规则（`failsafe.yaml` 有 6 条），
    所以保存后是整文件一起跑，改一条顺手改崩隔壁能立刻看见。左栏顶部的下拉框直接切文件。
  - 保存是**局部刷新**：只换右栏，编辑框的滚动位置与光标不动。服务端按请求头 `X-Partial`
    决定回 JSON 还是整页，没有 JS 的浏览器也能用。
  - 编译不过时右栏给出**精确到「第几项 / 第几列」**的报错，并**自动把源文件还原成
    保存前的样子**（备份在 `.cache/px4/kb-backup/`）——`knowledge/` 里不会留下一个让
    `pnpm build:kb` 红掉的文件，而编辑框里的内容仍然保留。
  - 编译走的是构建期那一份编译器（Node 侧 `build-knowledge.mjs`），Python 侧不重复实现。

## 冻结基线与等价比对（规则重构时必用）

- `dump_baseline.py`（**已搬到 `tools/engine/`**）：把 `tools/testdata/logs/*.ulg` 的**完整引擎输出**冻结到 `baseline/<slug>.json`。
  这是"一条经验一个 YAML"重构前的唯一真相，重构规则时不得改动（除非单独提交并说明理由）。
- `compare_baseline.py`（**已搬到 `tools/engine/`**）：重新跑同一份日志，
  与冻结基线**逐字段深度比较**（findings 的 id/ruleId/severity/tag/title/evidence/docUrl/suggestion
  与 stats/tags/guards/phases/checks*/matchedFaults）。退出码 0/1，任何差异（含 finding 的
  **顺序变化**，id 是按顺序分配的）都算回归。重构每一步都必须 `tools/engine/compare_baseline.py` 全绿。

依赖：`pip install pyulog numpy`；Python **3.11+**。

`logs/` 存放校准用真实日志（含 GPS 轨迹，勿提交大文件 / 涉密日志）。

## 在哪儿跑（云端 CI 覆盖不到）

本目录现在**全是手动探查**，都要 `logs/` 下的真实 `.ulg`——目录名终于和里面装的东西对上了。
以前这里还混着门禁类脚本（其中 `check_engine_pyodide.py` 根本不需要日志，却挂着 push 阶段
每次都跑），现已搬到 `tools/engine/`（引擎与规则）与 `tools/common/`（通用，不绑定本仓库）。

这些日志含 GPS 轨迹、按隐私规则不入库（见 `.gitignore`），**云端 CI 的 checkout 里没有它们，
依赖日志那几项必然被跳过**。所以这部分只在开发机跑，已挂在 `.githooks/pre-push` 上：

```bash
git config core.hooksPath .githooks   # 每台机器做一次
```

统一入口是 `python tools/ci/check_all.py`（本机有日志时自动带上本目录这组校验；
校验清单与分组、以及「CI 全绿不等于回归过了」的原因，见该脚本的模块文档）。
