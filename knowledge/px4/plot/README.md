# plot/ —— 结果页绘图预设（曲线与地图**同一套声明**）

每个 YAML 描述报告页里的一组图。**曲线**与**地图轨迹**用的是同一套结构，差别只在
`container`：`axes` 进「数据图表」tab，`map` 渲染在常驻地图区。加/改图只改这里，不用碰前端代码。

构建期由 `web/scripts/build-knowledge.mjs` 编译并校验，两处产物：

| 产物                                                      | 消费者                                   | 内容                        |
| --------------------------------------------------------- | ---------------------------------------- | --------------------------- |
| `web/lib/knowledge/plots.generated.ts`                    | 前端（`lib/chart-presets.ts` 解析布局）  | 全部预设（曲线 + 地图声明） |
| `web/workers/pyodide-px4log-engine.ts` 里的 `facts.track` | 引擎（`engine/providers/px4.py` 取轨迹） | `container: map` 那一份     |

写错了**构建就失败**（`pnpm build:kb`）：字段引用过不了校验、`label` 个数与 `ydata` 对不上、
一张图里混了两种单位、两个预设都声明地图……都在这里拦住，别指望运行期报错。

## 骨架

照抄 `plot-template.yml`（`*-template.yml` 不参与加载）。最简的一份：

```yaml
id: power
title: 电源
description: 电压 / 电流 / 剩余电量，多面板共享时间轴。
order: 5
conditions:
  topics: [battery_status]
outputs:
  - container: axes
    title: 电压
    ylabel: V
    children:
      - mode: TimeSeries
        ydata:
          - ref("battery_status[0].voltage_v")
```

## 字段

### 顶层

| 键                      | 必填 | 说明                                                                                                                     |
| ----------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| `id`                    | ✓    | 锚点与去重；别改（页面内定位靠它）                                                                                       |
| `title` / `description` | ✓    | 卡片标题与一句话说明                                                                                                     |
| `order`                 |      | 页面上这组图的先后（缺省 999）                                                                                           |
| `conditions`            |      | **与规则同形**：`firmware` / `airframe` / `topics` / `precheck`。图上一般只用 `topics`（项内 `\|\|` = 任意一个存在即可） |
| `compute`               |      | 换算节点，与规则的 `compute` 是**同一套**（Python 子集 + `engine/operators.py` 的算子）。算出来的变量给 `ydata` 引用     |
| `outputs`               | ✓    | 见下                                                                                                                     |

### `outputs[]`（容器）

| 键                | 必填      | 说明                                                                                   |
| ----------------- | --------- | -------------------------------------------------------------------------------------- |
| `container`       | ✓         | `axes`（一张曲线图）｜`map`（地图轨迹，**全局最多一个**）                              |
| `title`           |           | 这张图的标题；`axes` 里可用 `{instance}` 占位（`per_instance` 时）                     |
| `ylabel`          | ✓（axes） | 这张图的 y 轴标签。**一张图只画一个量纲**：同一图里写了 `unit=` 的引用必须目标单位相同 |
| `xlabel`          |           | 缺省「秒（相对日志开始）」；`xyplot` 时写你的横轴名                                    |
| `legend` / `grid` |           | 缺省 `true`                                                                            |
| `flipx` / `flipy` |           | 缺省 `false`                                                                           |
| `range`           |           | `[x0,x1]` 或 `[x0,x1,y0,y1]`；缺省自动适配                                             |
| `hlines`          |           | 水平参考线 `{value, level: ok\|warning\|critical, label}`                              |
| `per_instance`    |           | `true` 时把写了 `[:]` 的引用按实例拆成多张图（如每个 IMU 一张）                        |
| `children`        | ✓         | 见下                                                                                   |

### `children[]`（取数）

`axes` 的 child：

| 键                          | 必填 | 说明                                                                                                                                                                                               |
| --------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                      | ✓    | `TimeSeries`（横轴=时间）｜`xyplot`（横轴=你给的 `xdata`）                                                                                                                                         |
| `xdata`                     |      | `xyplot` 必填；写了的**优先**，不写才走"自动定时间轴"（见下）                                                                                                                                      |
| `ydata`                     | ✓    | 要画的线，**YAML 列表、一行一条**（也可以流式 `[甲, 乙]`，但项里带逗号时必须给每项加引号，块列表更省事）。每一项要么是字段引用（`ref(...)` 或裸写 `topic.field`），要么是 `compute` 算出来的变量名 |
| `label` / `style` / `color` |      | **YAML 列表**，与 `ydata` **逐项对齐**（个数不等就构建失败，报错指出第几项；只有一项也要写 `[甲]`）。`style` 取 `solid｜dashed｜dotted`；`color` 是 `#rrggbb`                                      |

`map` 的 child：`mode: track` + `label` + `max_points` + `lat` / `lon` / `alt`（各一个字段引用，
**必须写明实例**：同一条轨道的时间戳与 `fix_type` 要跟坐标来自同一个话题的同一个实例）。

## 横轴（时间轴）是怎么定的

`TimeSeries` 不写 `xdata` 时，横轴取**命中字段那个话题的 `timestamp`**（同一个实例）——
这样横轴与曲线来自同一份采样，天然对齐。判据按顺序是：

1. `ydata` 里**第一个取到数据**的字段引用所在的话题；
2. 整张图都由 `compute` 算出来时（ydata 全是变量名），从 `compute` 语句里反推**第一个 topic
   在日志里存在**的引用——`ref("topic.field")` 与裸写的 `topic.field` 都认。
   例：`roll, pitch, yaw = quat_to_euler(vehicle_attitude.q)` → 横轴 = `vehicle_attitude.timestamp`。

**边界（要注意）**：第 2 条是启发式——它挑的是"文字上先出现的、话题存在的引用"，不是"哪条序列
在驱动横轴"。所以**一张图的 `compute` 如果横跨两个话题**（例如四元数来自 `vehicle_attitude`、
又算了条 GPS 的速度），横轴可能取到另一个话题；两个话题采样数不同时，降采样按横轴长度走，
索引到较短的那条序列会**报错**（画不出来，而不是画一张错的图）。

> **这种图请显式写 `xdata`**：它是字段引用，写了就优先，兜底不再介入。
> 想让两条不同采样率的序列对齐，也有现成算子（`fill_to` / `head`，见算子目录）。

## 取数语言：与规则完全一致

字段引用就是规则里那套（见 `/guide/rule-schema`）：

```yaml
ydata:
  - ref("sensor_gps[0].latitude_deg", "vehicle_gps_position[0].latitude_deg", unit="deg")
```

- **候选组**按顺序取第一个在日志里存在的：字段改名（`ref("新名", "旧名")`）、话题改名
  （`ref("sensor_gps[0].x", "vehicle_gps_position[0].x")`）都用它——**老固件少个字段不用写回退规则**，
  取不到那条线就是 `null`，前端自动不画。
- **`unit=` 是期望输出单位**，源单位构建期从 `meta/` 查（查不到会告警，补一行到
  `meta/topic-overrides.yaml` 即可）。**只在需要换算时才写**：字段本来就是目标单位就别写
  （不写 = 不换算、也不查表）。
- 实例写进字段名：`topic[N].field` 取第 N 个实例；不写或 `[:]` 是所有实例（要配 `per_instance`
  或用会归约的算子，图上直接用会报错）。

## 约定

- 图上的**换算一律在引擎侧**（`compute` 节点或 `unit=`）：前端只画，不写数学。
- 抽稀（`max_points`）与"剔除未定位采样"是**引擎侧**的事（轨迹）；曲线走 LTTB 降采样。
- 颜色不写就按站点调色板（`lib/chart-presets.ts` 的 `SERIES_COLORS_*`）顺序取；
  **别在 YAML 里写死一堆色值**，换主题时会打架。
