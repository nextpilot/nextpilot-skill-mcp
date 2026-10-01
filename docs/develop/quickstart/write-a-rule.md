# 编写一条新规则

**目标：一条检查规则从改 YAML 到本地验证通过。**
规则的写法语法（字段、算子、表达式子集）是另一门学问，真源在站内
[`/guide/write-rules`](https://nextpilot-skill-mcp.pages.dev/guide/write-rules) 与
[`/guide/rule-schema`](https://nextpilot-skill-mcp.pages.dev/guide/rule-schema)
（构建期从 `knowledge/` 生成），本文只讲开发闭环。

---

## 一、规则住哪、长什么样

```text
knowledge/px4/rules/*.yaml        # PX4：26 条，一个主题一份（vibration.yaml、gps.yaml…）
knowledge/ardupilot/rules/*.yaml  # ArduPilot：16 条
knowledge/px4/plot/*.yml          # 图表声明（报告页画什么图）
knowledge/px4/facts.yaml          # 码表、文案、执行顺序
```

一条规则的最小骨架：

```yaml
id: vibration-high
title: 振动过高
severity: warn
topic: vehicle_magnitude_estimator_status
expr: "max(vibration_metric) > 0.05" # 安全子集的 Python 表达式
```

语法与全部字段以站内 `/guide/rule-schema` 为准，本文不复述。

## 二、改完怎么验证（闭环）

```bash
# 1. 构建期校验（dev server 挂着 watch 就自动跑；单独跑用这条）
pnpm web:build:kb                 # 规则缺字段 / 算子没注册 / 表达式编译不过 → 直接 throw

# 2. 字段引用 lint：规则里引用的字段名真实存在吗
python tools/engine/check_rules_fields.py --strict

# 3. 单条规则调参：为什么命中 / 没命中
python tools/engine/check_rules_compute.py --rule vibration-high <日志路径>

# 4. 引擎单测
pnpm eng:test
```

**在站点上看效果**：dev server 开着时改 YAML → 热重建 → 刷新
`/log` 传日志看报告、`/guide/rule-catalogue` 看规则清单（自动生成）、
`/tools/editor` 用规则编辑器改。

## 三、改了阈值必须打新基线

引擎结论是「同输入 → 同结论」的回归锚点：结论变化必须是显式动作。
改完阈值/逻辑，用真实日志重新打基线：

```bash
python tools/engine/dump_baseline.py    # 确认改动是有意的之后
```

日志集怎么建、基线怎么入库，见 [`../knowledge/baselines.md`](../knowledge/baselines.md)
与 [`../testing/log-regression.md`](../testing/log-regression.md)。
基线文件入库，日志文件不入库——两者生命周期不同。

## 四、过门禁

```bash
git push    # pre-push hook 自动跑 check_all.py --push（含字段 lint、基线比对、契约检查）
```

提交消息格式见 [`../contribute/README.md`](../contribute/README.md)。

## 五、两个容易踩的

1. 算子只能用注册过的：`op:` 引用 `knowledge/engine/operators.py` 的 92 个算子，
   没有「内置隐式算子」——没注册构建期就红。
2. 新规则要带反例：规则清单页的「反例自检」要求每条规则都能被自己的反例打红，
   写规则时同步想清楚"什么日志不该命中"。
