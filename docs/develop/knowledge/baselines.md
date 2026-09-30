# 基线日志：为什么入库、放哪、CI 怎么用

> **一句话**：把**少量、体积受控、许可清晰**的真实日志**提交进仓库**，
> 让 CI 在**没有外网、没有本地缓存**的机器上也能跑完整的 `compare-baseline`
> 与图表端到端验证。

关联：本仓现状见 [`upstream-inventory.md`](upstream-inventory.md)；
规则逐条对表见 `upstream-itemized.md`(upstream-itemized.md)。

---

## 一、现在的状态（实测）

| 项               | 现状                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 日志来源         | `tools/testdata/logs/*.ulg`、`*.bin`、`*.BIN` —— **被 `.gitignore` 挡住，不入库**                                                                    |
| 下载工具         | `tools/dev/download_px4_logs.py`（logs.px4.io）、`tools/dev/download_ardupilot_logs.py`（autotest.ardupilot.org）                                    |
| 下载落点         | `.cache/px4/logs/`、`.cache/ardupilot/logs/` —— 也在 `.gitignore` 里                                                                                 |
| 冻结基线         | `tools/testdata/baseline/*.json` —— **9 份已入库**                                                                                                   |
| 基线生成         | `python tools/engine/dump_baseline.py`                                                                                                               |
| 基线比对         | `python tools/engine/compare_baseline.py`                                                                                                            |
| CI 门禁          | `checklist.yml` 的 `compare-baseline` / `check-provider`，**`when: [logs]`**                                                                         |
| **门禁触发条件** | `check_all.py` 第 231–244 行：`tools/testdata/logs/` 下**有 `.ulg`/`.BIN` 才启用 `logs`**                                                            |
| **CI 现状**      | 日志不在仓库 → CI 日志输出 `[logs] no .ulg/.BIN under tools/testdata/logs (expected in CI)` → **`compare-baseline` 与 `check-provider` 整组被 skip** |

**结论：9 份基线在仓库里躺着，但 CI 永远不跑它们。** 这正是"便于线上 CI 同步开展"要修的事。

### 已入库的 9 份基线（及其覆盖）

| slug                                                   | 平台      | 机型   | 时长    | findings | 跑/跳   |
| ------------------------------------------------------ | --------- | ------ | ------- | -------- | ------- |
| `sample_log_small`                                     | PX4       | 多旋翼 | 7.4 s   | 1        | 26 / 5  |
| `sample`                                               | PX4       | 多旋翼 | 181.5 s | 1        | 19 / 10 |
| `efd2ee9d`                                             | PX4       | 多旋翼 | 213.0 s | 3        | 25 / 6  |
| `ce302d3b`                                             | PX4       | 固定翼 | 632.8 s | 11       | 28 / 3  |
| `39f26cce`                                             | PX4       | 固定翼 | 203.4 s | 6        | 27 / 4  |
| `95b077d9`                                             | PX4       | rover  | 73.2 s  | 2        | 22 / 7  |
| `ArduCopter-GSF-00000001`                              | ArduPilot | quad   | 127.9 s | **0**    | 21 / 22 |
| `ArduCopter-MinAltFence-00000150`                      | ArduPilot | quad   | 611.8 s | **0**    | 21 / 22 |
| `ArduPlane-EK3HeightDatumResetFlushesBuffers-00000001` | ArduPilot | plane  | 29.6 s  | 2        | 20 / 23 |

**看出来的两个问题**：

1. **APM 侧 3 份里 2 份 findings = 0** —— 全是 SITL 仿真、无故障注入，
   **规则的"正样本"几乎没有**。规则写对了没有，这些日志证明不了。
2. **PX4 侧 6 份全是 SITL / 公开日志**，且 **APM 只有 quad/plane，没有 heli / 无 VTOL**。

---

## 二、目标

| #   | 目标                           | 验收判据                                                            |
| --- | ------------------------------ | ------------------------------------------------------------------- |
| G1  | **CI 能跑 `compare-baseline`** | 云端 CI（无外网缓存）跑 `check_all.py --ci`，`logs` 组**不再 skip** |
| G2  | **规则有正样本**               | 每条规则至少被 1 份基线命中，或明确记为"本批无正样本"               |
| G3  | **体积受控**                   | 入库日志合计 **< 20 MB**（单份 < 5 MB）                             |
| G4  | **许可清晰**                   | 每份日志写明来源 URL / 许可，可追溯、可替换                         |
| G5  | **可复现**                     | 每份日志在 `index.jsonl` 里记来源与下载命令，删了能下回来           |

---

## 三、方案：三层日志集

| 层            | 内容                                                | 入库 | 体积    | 用途                              |
| ------------- | --------------------------------------------------- | ---- | ------- | --------------------------------- |
| **L1 夹具**   | 合成最小日志（`tools/dev/apm_make_sample.py` 产物） | ✅   | KB 级   | 解析器契约、字段存在性            |
| **L2 基线**   | **真实日志切片**（截取关键片段，非全量）            | ✅   | < 20 MB | `compare-baseline` 端到端         |
| **L3 校准集** | 全量真实日志（几百份）                              | ❌   | GB 级   | 误报率统计、阈值标定（本地/cron） |

**核心取舍**：L3 不入库（体积 + 隐私 + 许可）。**入库的是 L2 —— 从 L3 里挑出来再剪短的。**

### 3.1 为什么"切片"可行

`.ulg` 是自描述分块格式，可以**按时间窗裁剪**：保留头部定义 + 目标时间段的消息块。
`pyulog` 无内置裁剪，但块结构清晰（`[magic][msg_size][data]` + `FMT` 定义），
**按 `timestamp` 过滤消息块**即可重写成合法 ulog。`.bin`（APM）同理，按 `TimeUS` 裁。

> **这是一件要写代码的事**：新增 `tools/dev/slice_log.py`。
> **它不是本轮必做**——先能把**完整但小的**日志入库，就解决 G1；
> 切片是解决 G3 的优化项。

### 3.2 选日志的准则

**PX4 侧**（`logs.px4.io` 公开、可下载、BSD 兼容）：

| 场景           | 为什么要                                                             | 挑法                                                         |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| 多旋翼健康飞行 | 主干图表 + 全规则跑通、零/低误报                                     | `--vehicle Quadrotor --min-duration 120`，无 `ERR`/`CRIT` 的 |
| 固定翼健康飞行 | TECS / 空速 / VTOL 分支                                              | `--vehicle Plane`                                            |
| **振动异常**   | `vibration.yaml` 正样本                                              | 搜 `vibration` / 高振动图标的日志                            |
| **EKF 异常**   | `ekf-innovation.yaml`（占比判据）/ `ekf-faults.yaml`（故障位）正样本 | 搜 `ekf` / `innovation`                                      |
| **电池异常**   | `power-remaining.yaml` + 验证 `-1` 误报修复                          | 搜 `battery` / 低电量                                        |
| **失效保护**   | `failsafe.yaml` 6 条正样本                                           | 搜 `failsafe` / `rc lost`                                    |
| **老固件**     | `_ref` 候选组、缺字段回退                                            | `--version v1.11` 之类                                       |

**APM 侧**（`autotest.ardupilot.org`，SITL；真实故障去 `discuss.ardupilot.org`）：

| 场景             | 为什么要                                       | 挑法                                        |
| ---------------- | ---------------------------------------------- | ------------------------------------------- |
| Copter 正常      | 已有 2 份，保留为"不该报警"的负样本            | 现有即可                                    |
| Plane 正常       | 已有 1 份，`ArduPlane-EK3HeightDatum…`         | 现有即可                                    |
| **heli**         | 上游 `vehicle_profile` / 按机型跳过逻辑        | `--vehicle ArduCopterHeli`                  |
| **VTOL**         | VTOL 分支                                      | `--vehicle ArduPlaneVTOL`                   |
| **故障注入测试** | **本仓最缺**：autotest 的 `*Fails*` / 异常用例 | `--test` 带 `FFT`/`Fence`/`EKF` 等关键字    |
| 真实外场故障     | 规则正样本的最终来源                           | `discuss.ardupilot.org` 用户求助帖的 `.bin` |

---

## 四、目录约定（改动）

```
tools/testdata/
├── logs/                        # 新增：入库的真实日志（受控体积）
│   ├── index.jsonl              # 每行：slug / file / platform / 来源 URL / 许可 / 备注
│   ├── px4-quad-healthy-*.ulg
│   ├── px4-fw-healthy-*.ulg
│   ├── px4-vibe-bad-*.ulg
│   ├── apm-copter-GSF-*.BIN
│   └── ...
├── baseline/                    # 不变：冻结的引擎输出（9 份已在库）
└── fixtures/                    # 新增：合成夹具（KB 级，无隐私）
```

**`.gitignore` 改动**（现行第 57–59 行）：

```gitignore
# 校准用真实飞行日志：默认不入库（含 GPS 轨迹）
tools/testdata/logs/*.ulg
tools/testdata/logs/*.bin
tools/testdata/logs/*.BIN
# 例外：受控体积的基线日志入库（见 `docs/develop/knowledge/baselines.md` §四）
!tools/testdata/logs/px4-quad-healthy-*.ulg
!tools/testdata/logs/px4-fw-healthy-*.ulg
!tools/testdata/logs/apm-copter-*.BIN
```

> **为什么用"白名单 + 命名前缀"而不是整体放开**：`.gitignore` 的否定规则
> **无法重新包含被其父目录排除的文件**，但这里父目录 `logs/` 本身没被排除，
> 只有 `*.ulg` 被排除 —— 所以 `!具体文件名` 是**有效**的。
> 用**命名前缀白名单**的好处：下载脚本随手扔进来的日志**默认仍然不入库**，
> 只有明确挑了、记了来源的那几份才进 —— **防止有人把 GB 级缓存误提交**。

---

## 五、CI 怎么用（关键）

### 5.1 现状的 block 点

`check_all.py` 第 231–244 行：

```python
log_dir = ROOT / "tools" / "testdata" / "logs"
logs = (... if not args.skip_logs else [])   # 扫 .ulg/.bin/.BIN
has_logs = bool(logs)
if has_logs:
    active.add("logs")                        # 只有扫到日志才启用
```

→ 日志入库后，**`has_logs` 自动为真，`compare-baseline` / `check-provider` 自动生效**，
**不需要改 `check_all.py`**。

### 5.2 要做的小改动

| 改动                                          | 文件                   | 为什么                              |
| --------------------------------------------- | ---------------------- | ----------------------------------- |
| 白名单放行基线日志                            | `.gitignore`           | 让 `logs/` 里挑过的日志能 `git add` |
| 加 `index.jsonl` 来源登记                     | `tools/testdata/logs/` | G4/G5：可追溯、可替换               |
| 加体积门禁                                    | `checklist.yml` 新 job | **防止有人把大日志塞进来**（G3）    |
| `compare-baseline` 的 `when` 从 `[logs]` 起效 | 不变                   | 日志入库后自动生效                  |

**体积门禁**（新增，建议）：

```yaml
id: "baseline-log-size"
name: "Baseline log size budget"
when: [push, ci]
workdir: "{ROOT}"
command: ["{PYTHON}", "tools/engine/check_log_budget.py"] # 新增
hint: "入库日志合计超预算或单份超 5MB。要么换更小的日志，要么先切片（tools/dev/slice_log.py）。"
```

### 5.3 线上 CI 与本地的一致性

| 环境         | 日志来源                     | 跑什么                                       |
| ------------ | ---------------------------- | -------------------------------------------- |
| **线上 CI**  | **入库的 L2 基线**（仓库内） | `check_all.py --ci`：`compare-baseline` 全跑 |
| **本地开发** | `.cache/` 全量 L3            | `check_all.py --logs`：可选更大样本          |
| **推送前**   | 两者都有                     | `check_all.py --push`（快）                  |

> **注意**：入库的 L2 会**同时**被本地的 `logs` 扫描吃到。
> 这没问题 —— 本地只是多跑几份小的；L3 大样本在 `.cache/` 不参与。
> 若本地想只跑 L3，用 `--skip-logs` 后再手动指定，或后续给 `dump_baseline.py`
> 加 `--only-in-repo` 开关。

---

## 六、执行顺序（最小步）

| 步   | 动作                                                              | 产出        | 阻塞  |
| ---- | ----------------------------------------------------------------- | ----------- | ----- |
| S1   | 从 `logs.px4.io` 挑 **2 份 PX4 健康飞行**（quad + fw，各 < 5 MB） | 2 个 `.ulg` | 无    |
| S2   | 从 autotest 挑 **1 份带故障的 APM 日志**（补 finding=0 的空白）   | 1 个 `.BIN` | 无    |
| S3   | 写 `index.jsonl`（slug / 来源 URL / 许可 / 为什么要它）           | 登记表      | 无    |
| S4   | `.gitignore` 加白名单                                             | 可提交      | S1–S3 |
| S5   | `dump_baseline.py` 冻结 → 产出 `baseline/*.json`                  | 新基线      | S4    |
| S6   | 本地 `check_all.py`（不带 `--skip-logs`）确认 `logs` 组**全绿**   | 验证        | S5    |
| S7   | 加体积门禁 job + `check_log_budget.py`                            | CI 保护     | S1    |
| S8   | 观察线上 CI 是否跑 `compare-baseline`                             | G1 达成     | S6    |
| 后续 | `tools/dev/slice_log.py` 切片 → 换掉大日志                        | G3 强化     | 可选  |

**S1–S4 就是"把日志加进仓库"的最小闭环**，S5–S6 是"让基线生效"。

---

## 七、风险与反例

| 风险               | 反例 / 后果                                    | 对策                                                |
| ------------------ | ---------------------------------------------- | --------------------------------------------------- |
| **误提交大日志**   | 有人跑完下载脚本直接 `git add logs/` → 仓库爆  | 命名前缀白名单 + 体积门禁                           |
| **GPS 轨迹隐私**   | 公开日志本身已公开；自家飞机日志会泄漏起降点   | **只用公开来源**；自家日志必须切片/匿名化           |
| **许可不清**       | 上游 GPL 日志混进来                            | `index.jsonl` 强制填 `license`，CI 校验非空         |
| **基线漂移**       | 换 pyulog 版本 → `parserVersion` 变 → 假报警   | 已处理：`compare_baseline.py` 的 `IGNORED_TOP_KEYS` |
| **切片破坏格式**   | 裁错了 → 解析报错，CI 红                       | 切片后**必须** `dump_baseline.py` 跑通再提交        |
| **只加"干净"日志** | 规则永远不命中，回归集证明不了什么（**现状**） | G2：每批必须含**故障正样本**                        |

---

## 八、与上游做法对照

| 上游                    | 怎么做                             | 本仓取舍                                        |
| ----------------------- | ---------------------------------- | ----------------------------------------------- |
| **U7 FlightMD**         | **50 份真实日志验证**              | ✅ 学做法；本仓入库量小，靠"分场景"而非"拼数量" |
| U1 Flight Review        | 不存日志，用户上传即分析、传完不留 | 🚫 那是有服务端；本仓零上传，**必须自带样本**   |
| U2/U5 robotto / apm-mcp | 仓库里无日志，测试靠合成           | 🟡 本仓现在只有合成 → **这正是要补的**          |
| U6 WebTools             | 用户本地选文件，无内置样本         | 🚫 同 U1                                        |

**一句话**：**上游**里只有 FlightMD 认真做了回归集，而它是"50 份"的量级；
本仓是零上传架构，**入库基线不是可选项，是 CI 能跑的前提**。
