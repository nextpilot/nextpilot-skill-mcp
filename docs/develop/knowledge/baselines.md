# 基线日志：入库、落点与 CI

目的很直接：把少量、体积受控、许可清晰的真实日志提交进仓库，让 CI 在没有外网、
没有本地缓存的机器上也能跑完整的 `compare-baseline` 与图表端到端验证。

关联文档：上游与现状见 [`upstream.md`](upstream.md)；差距与取舍见 [`gap.md`](gap.md)。

## 一、现在的状态（实测）

| 项             | 现状                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| 日志来源       | `tools/testdata/logs/*.ulg`、`*.bin`、`*.BIN`，被 `.gitignore` 挡住，不入库                             |
| 下载工具       | `tools/dev/download_px4_logs.py`（logs.px4.io）、`download_ardupilot_logs.py`（autotest.ardupilot.org） |
| 下载落点       | `.cache/px4/logs/`、`.cache/ardupilot/logs/`，同样不入库                                                |
| 冻结基线       | `tools/testdata/baseline/*.json`，9 份已入库                                                            |
| 基线生成与比对 | `python tools/engine/dump_baseline.py`、`compare_baseline.py`                                           |
| CI 门禁        | `checklist.yml` 的 `compare-baseline` / `check-provider`，`when: [logs]`                                |
| 门禁触发条件   | `check_all.py` 第 231–244 行：`tools/testdata/logs/` 下有 `.ulg`/`.BIN` 才启用 `logs`                   |
| CI 现状        | 日志不在仓库 → CI 输出 `no .ulg/.BIN under tools/testdata/logs (expected in CI)` → 两组检查整组跳过     |

也就是说：9 份基线在仓库里躺着，但 CI 从来没跑过它们。本文要解决的就是这件事。

已入库的 9 份基线及其覆盖：

| slug                                                   | 平台      | 机型   | 时长    | findings | 跑/跳   |
| ------------------------------------------------------ | --------- | ------ | ------- | -------- | ------- |
| `sample_log_small`                                     | PX4       | 多旋翼 | 7.4 s   | 1        | 26 / 5  |
| `sample`                                               | PX4       | 多旋翼 | 181.5 s | 1        | 19 / 10 |
| `efd2ee9d`                                             | PX4       | 多旋翼 | 213.0 s | 3        | 25 / 6  |
| `ce302d3b`                                             | PX4       | 固定翼 | 632.8 s | 11       | 28 / 3  |
| `39f26cce`                                             | PX4       | 固定翼 | 203.4 s | 6        | 27 / 4  |
| `95b077d9`                                             | PX4       | rover  | 73.2 s  | 2        | 22 / 7  |
| `ArduCopter-GSF-00000001`                              | ArduPilot | quad   | 127.9 s | 0        | 21 / 22 |
| `ArduCopter-MinAltFence-00000150`                      | ArduPilot | quad   | 611.8 s | 0        | 21 / 22 |
| `ArduPlane-EK3HeightDatumResetFlushesBuffers-00000001` | ArduPilot | plane  | 29.6 s  | 2        | 20 / 23 |

两个明显的问题：APM 侧 3 份里 2 份 findings 为 0——全是 SITL 仿真、无故障注入，
规则的「正样本」几乎没有，规则写对了没有这些日志证明不了；PX4 侧 6 份全是 SITL
或公开日志，且 APM 只有 quad/plane，没有 heli 和 VTOL。

## 二、目标

| #   | 目标                       | 验收判据                                                  |
| --- | -------------------------- | --------------------------------------------------------- |
| G1  | CI 能跑 `compare-baseline` | 云端 CI 跑 `check_all.py --ci`，`logs` 组不再跳过         |
| G2  | 规则有正样本               | 每条规则至少被 1 份基线命中，或明确记为「本批无正样本」   |
| G3  | 体积受控                   | 入库日志合计 < 20 MB（单份 < 5 MB）                       |
| G4  | 许可清晰                   | 每份日志写明来源 URL 与许可，可追溯、可替换               |
| G5  | 可复现                     | 每份日志在 `index.jsonl` 里记来源与下载命令，删了能下回来 |

## 三、方案：三层日志集

| 层        | 内容                                      | 入库 | 体积    | 用途                              |
| --------- | ----------------------------------------- | ---- | ------- | --------------------------------- |
| L1 夹具   | 合成最小日志（`apm_make_sample.py` 产物） | 已有 | KB 级   | 解析器契约、字段存在性            |
| L2 基线   | 真实日志切片（截取关键片段）              | 已有 | < 20 MB | `compare-baseline` 端到端         |
| L3 校准集 | 全量真实日志（几百份）                    | 没有 | GB 级   | 误报率统计、阈值标定（本地/cron） |

入库的是 L2——从 L3 里挑出来再剪短的；L3 因为体积、隐私和许可留在本地缓存。

切片之所以可行：`.ulg` 是自描述分块格式，可以按时间窗裁剪——保留头部定义与目标
时间段的消息块。`pyulog` 没有内置裁剪，但块结构清晰（`[magic][msg_size][data]` +
`FMT` 定义），按 `timestamp` 过滤消息块就能重写成合法 ulog；`.bin` 同理按 `TimeUS` 裁。
这需要新写一个 `tools/dev/slice_log.py`，但它不是第一步——先把完整但小的日志入库，
G1 就解决了；切片是解决 G3 的优化项。

选日志的准则。PX4 侧走 logs.px4.io（公开、BSD 兼容）：

| 场景           | 为什么要                                  | 挑法                                                      |
| -------------- | ----------------------------------------- | --------------------------------------------------------- |
| 多旋翼健康飞行 | 主干图表 + 全规则跑通、零/低误报          | `--vehicle Quadrotor --min-duration 120`，无 `ERR`/`CRIT` |
| 固定翼健康飞行 | TECS / 空速 / VTOL 分支                   | `--vehicle Plane`                                         |
| 振动异常       | `vibration.yaml` 正样本                   | 搜 `vibration` / 高振动图标                               |
| EKF 异常       | 创新比与故障位的正样本                    | 搜 `ekf` / `innovation`                                   |
| 电池异常       | `power-remaining.yaml` + 验证 -1 误报修复 | 搜 `battery` / 低电量                                     |
| 失效保护       | `failsafe.yaml` 6 条正样本                | 搜 `failsafe` / `rc lost`                                 |
| 老固件         | `_ref` 候选组、缺字段回退                 | `--version v1.11` 之类                                    |

APM 侧走 autotest.ardupilot.org（SITL；真实故障去 discuss.ardupilot.org 找）：

| 场景         | 为什么要                              | 挑法                                     |
| ------------ | ------------------------------------- | ---------------------------------------- |
| Copter 正常  | 已有 2 份，保留为「不该报警」的负样本 | 现有即可                                 |
| Plane 正常   | 已有 1 份                             | 现有即可                                 |
| heli         | 按机型跳过逻辑的上游参照              | `--vehicle ArduCopterHeli`               |
| VTOL         | VTOL 分支                             | `--vehicle ArduPlaneVTOL`                |
| 故障注入测试 | 本仓最缺的一类                        | `--test` 带 `FFT`/`Fence`/`EKF` 等关键字 |
| 真实外场故障 | 规则正样本的最终来源                  | 论坛求助帖的 `.bin`                      |

## 四、目录约定（改动）

```text
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

`.gitignore` 的改法：对挑定的基线日志加白名单例外（现行第 57–59 行排除 `*.ulg` /
`*.bin` / `*.BIN` 之后）：

```gitignore
# 受控体积的基线日志入库（见 docs/develop/knowledge/baselines.md）
!tools/testdata/logs/px4-quad-healthy-*.ulg
!tools/testdata/logs/px4-fw-healthy-*.ulg
!tools/testdata/logs/apm-copter-*.BIN
```

这里父目录 `logs/` 没被排除、只有通配名被排除，所以按文件名的否定规则是有效的。
用命名前缀白名单而不是整体放开，是让下载脚本随手扔进来的日志默认仍然不入库——
只有明确挑过、登记过来源的那几份才进仓库，防止有人把 GB 级缓存误提交。

## 五、CI 怎么用

现状的阻塞点在 `check_all.py` 第 231–244 行：只有扫到 `.ulg`/`.BIN` 才把 `logs`
组加进活动检查。日志入库后 `has_logs` 自动为真，`compare-baseline` 与
`check-provider` 自动生效，`check_all.py` 本身不用改。

要做的小改动：

| 改动                         | 文件                   | 目的                   |
| ---------------------------- | ---------------------- | ---------------------- |
| 白名单放行基线日志           | `.gitignore`           | 挑过的日志能 `git add` |
| `index.jsonl` 来源登记       | `tools/testdata/logs/` | G4/G5：可追溯、可替换  |
| 体积门禁                     | `checklist.yml` 新 job | 防止大日志进仓库（G3） |
| `compare-baseline` 的 `when` | 不变                   | 日志入库后自动生效     |

体积门禁新增一个检查项：

```yaml
id: "baseline-log-size"
name: "Baseline log size budget"
when: [push, ci]
workdir: "{ROOT}"
command: ["{PYTHON}", "tools/engine/check_log_budget.py"] # 新增
hint: "入库日志合计超预算或单份超 5MB。要么换更小的日志，要么先切片（tools/dev/slice_log.py）。"
```

三个环境的一致性：线上 CI 用入库的 L2 基线跑 `check_all.py --ci`；本地开发用
`.cache/` 里的 L3 全量，`check_all.py --logs` 可选更大样本；推送前 `--push` 走快的。
入库的 L2 会被本地的 `logs` 扫描一并吃到，没有问题——本地只是多跑几份小的；
想只跑 L3，用 `--skip-logs` 再手动指定，或之后给 `dump_baseline.py` 加
`--only-in-repo` 开关。

## 六、执行顺序（最小步）

| 步   | 动作                                                         | 产出        | 依赖  |
| ---- | ------------------------------------------------------------ | ----------- | ----- |
| S1   | 从 logs.px4.io 挑 2 份 PX4 健康飞行（quad + fw，各 < 5 MB）  | 2 个 `.ulg` | 无    |
| S2   | 从 autotest 挑 1 份带故障的 APM 日志（补 findings=0 的空白） | 1 个 `.BIN` | 无    |
| S3   | 写 `index.jsonl`（slug / 来源 URL / 许可 / 为什么要它）      | 登记表      | 无    |
| S4   | `.gitignore` 加白名单                                        | 可提交      | S1–S3 |
| S5   | `dump_baseline.py` 冻结，产出 `baseline/*.json`              | 新基线      | S4    |
| S6   | 本地 `check_all.py`（不带 `--skip-logs`）确认 `logs` 组全绿  | 验证        | S5    |
| S7   | 加体积门禁 job + `check_log_budget.py`                       | CI 保护     | S1    |
| S8   | 观察线上 CI 是否跑 `compare-baseline`                        | G1 达成     | S6    |
| 后续 | `slice_log.py` 切片，换掉大日志                              | G3 强化     | 可选  |

S1–S4 是把日志加进仓库的最小闭环，S5–S6 让基线生效。

## 七、风险与对策

| 风险             | 后果                                         | 对策                                                |
| ---------------- | -------------------------------------------- | --------------------------------------------------- |
| 误提交大日志     | 下载脚本跑完直接 `git add logs/`，仓库爆     | 命名前缀白名单 + 体积门禁                           |
| GPS 轨迹隐私     | 自家飞机会泄漏起降点                         | 只用公开来源；自家日志必须切片/匿名化               |
| 许可不清         | GPL 日志混进来                               | `index.jsonl` 强制填 `license`，CI 校验非空         |
| 基线漂移         | 换 pyulog 版本 → `parserVersion` 变 → 假报警 | 已处理：`compare_baseline.py` 的 `IGNORED_TOP_KEYS` |
| 切片破坏格式     | 裁错了解析报错，CI 红                        | 切片后必须 `dump_baseline.py` 跑通再提交            |
| 只加「干净」日志 | 规则永远不命中，回归集证明不了什么（现状）   | G2：每批必须含故障正样本                            |

与上游对照：只有 FlightMD 认真做了回归集（50 份真实日志的量级），本仓靠「分场景」
而非「拼数量」；Flight Review 不存日志（有服务端，用户上传即分析），本仓零上传，
必须自带样本——入库基线不是可选项，是 CI 能跑的前提。
