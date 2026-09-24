# EXAMPLE.md

完整场景集合。每个例子都是「输入 → 输出」，模型可以直接当 few-shot 用。

这份文件里最关键的是**场景 3 和场景 4**——它们示范什么时候必须回答"无法判定"。这是 Skill 质量的分水岭。

---

## 场景 1：炸机后完整排查

**输入**

```text
四轴，手动模式起飞悬停约 20 秒后突然侧翻坠机。
日志：https://review.px4.io/plot_app?log=xxxx
```

**输出**

```json
[
  {
    "severity": "critical",
    "rule": "gyro_clipping",
    "field": "vehicle_imu_status.gyro_clipping[0]",
    "title": "陀螺仪削波",
    "value": 1847,
    "threshold": 0,
    "docUrl": "https://docs.px4.io/main/en/config/vibration_isolation.html",
    "note": "起飞即有计数，说明传感器量程全程打满。后续所有基于 IMU 的结论均不可信。"
  },
  {
    "severity": "critical",
    "rule": "ekf_height_reject",
    "field": "estimator_status.innovation_check_flags",
    "title": "EKF 高度创新被拒",
    "value": 6,
    "threshold": 0,
    "note": "按位解析：bit1(vel_ned) + bit2(pos_vert) 置位。这是振动导致的结果，不是根因。"
  },
  {
    "severity": "critical",
    "rule": "actuator_saturated",
    "field": "actuator_outputs.output[1]",
    "title": "2 号电机输出饱和",
    "value": 2000,
    "threshold": 1900,
    "note": "估计器输出错误导致控制器持续修正，最终饱和。"
  },
  {
    "severity": "info",
    "rule": "logged_message_check",
    "field": "logged_message.severity",
    "title": "无机载告警",
    "value": null,
    "note": "已确认飞控未主动上报任何 critical 告警。PID 代码没察觉这是翅膀的问题。"
  }
]
```

**结论**：根因是陀螺仪削波（振动），EKF 高度发散和电机饱和都是它的下游结果。**不要径直去调 PID**——振动不解决，怎么调都会再炸。

---

## 场景 2：症状描述而非日志文件

**输入**

```text
没有日志在手，只知道：悬停时飞机随机缓慢右偏
```

**输出**

```text
没有日志文件就无法给出带阈值的确定结论。以下是应该检查的字段，按优先级：

1. estimator_sensor_bias.gyro_bias[2]   — 偏航角速度零偏是否稳定不收敛
2. vehicle_magnetometer                 — 磁罗盘是否被干扰（起飞前后对比）
3. CAL_MAG0_ID                          — 是否与当前罗盘匹配（换过 GPS 模块的常见）
4. vehicle_gps_position.fix_type / eph  — GPS 定位质量差会让 EKF 用不一致的航向源

拿到日志后再逐项核对。注意：第 1 项在老固件里是 estimator_status.states[11]，
新固件才拆到 estimator_sensor_bias。
```

> 没有数据时给"该查什么"是可以的；给"我认为大概是 X"不可以。前者是可验证的指引，后者是不可证伪的猜测。

---

## 场景 3：字段缺失——必须诚实

**输入**

```text
PX4 v1.12 的日志。帮我看下 estimator_sensor_bias.gyro_bias 是多少
```

**输出**

```json
{
  "rule": "gyro_bias_check",
  "field": "estimator_sensor_bias.gyro_bias",
  "status": "无法判定",
  "reason": "该日志来自 PX4 v1.12，estimator_sensor_bias 主题不存在。当时零偏在 estimator_status.states[] 的第 10-15 位。",
  "alternative": {
    "field": "estimator_status.states[11]",
    "caveat": "需确认该版本的 states 数组索引定义，1.12 与 1.13 的排布有过调整"
  }
}
```

**绝对不要**返回一个凭印象估算的数值。一份日志里只要出现一条不可信的结论，整份报告就失效了。

---

## 场景 4：振动超标时拒绝继续分析

**输入**

```text
accel_vibration_metric = 45。帮我看看姿态跟踪是不是也有问题
```

**输出**

```text
不回答这个问题。

accel_vibration_metric = 45 远超推荐阈值（一般机架 < 20，穿越机 < 30）。
在振动超标的前提下，姿态、EKF、速率环的所有结论都不可信——
分析它们只会得到看似合理的错误结论。

先解决振动：
  1. vehicle_imu_status.gyro_clipping[] 是否为 0（>0 说明量程也打满了）
  2. 检查 IMU 减震、机架共振、桨平衡
  3. 可先用 IMU_GYRO_NF_* 陷波对准机架共振频率缓解，再谈后续分析

振动降下来之后再来问姿态的问题。
```

> 这类"拒答"比"有问必答"更有价值。模型为了完成任务而勉强回答，是扯淡最大的来源。

---

## 场景 5：区分飞控问题与操作问题

**输入**

```text
日志显示 actuator_outputs.output[] 在某一时刻全部拉满，是假保护吗
```

**输出**

```text
先看 manual_control_setpoint，确认那一刻飞行员在做什么：

- 如果 sticks 在极限位置 → 这是操作带来的正常输出，不是故障
- 如果 sticks 在中位而输出拉满 → 才是真正的异常

同时交叉核对：
  vehicle_status.nav_state     是否在这一刻跳变
  vehicle_status.failsafe      是否被置位
  battery_status.voltage_v     是否出现跌落


实际发生过相当比例的「飞控抽风」报告，最后证明是打杆太猛。
先排除操作因素，再怀疑硬件。
```
