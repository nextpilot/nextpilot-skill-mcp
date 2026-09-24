# EXAMPLE.md

完整场景集合。每个例子都是「输入 → 输出」，模型可以直接当 few-shot 用。

这份文件里最关键的是**场景 4**——它示范什么时候必须拒绝调参。

---

## 场景 1：起飞就高频抖动

**输入**

```json
{
  "symptom": "起飞后机身高频抖动，声音发紧",
  "axis": "roll",
  "current": { "P": 0.15, "I": 0.08, "D": 0.003 },
  "log": { "gyro_clipping": 0, "accel_vibration_metric": 0.09 }
}
```

**输出**

```json
{
  "next": { "P": 0.15, "I": 0.08, "D": 0.0021 },
  "reason": "振动指标 0.09 在合理范围且无削波，排除机械问题；抖动集中在大油门段，判断为 D 偏大放大噪声，下调 30% 并同步收紧 D 项低通。",
  "verify": [
    "对比 vehicle_rates_setpoint.roll 与 vehicle_attitude.rollspeed",
    "复飞确认抖动消失且响应未变肉"
  ],
  "safety": [
    "每次只改一个轴一个变量",
    "改动前 param dump 备份",
    "小风无干扰条件下复飞"
  ]
}
```

---

## 场景 2：打杆过冲、松杆回弹

**输入**

```text
快速打杆到极限再松杆，飞机会明显过冲然后弹回来两三次才稳住。
振动正常，gyro_clipping = 0。
```

**输出**

```json
{
  "diagnosis": "典型的 D 不足，同时 I 可能过量导致回弹后的二次振荡",
  "adjust": [
    { "param": "MC_ROLLRATE_D", "action": "increase", "step": "每次 +20%，到出现高频噪声为止回退一格" },
    { "param": "MC_ROLLRATE_I", "action": "check", "note": "若回弹是缓慢的过冲，先查 I 是否饱和" }
  ],
  "order": "先加 D，收敛后再看 I。不要同时动两个数，否则不知道是谁在起作用。",
  "verify": "vehicle_rates_setpoint.roll 的阶跃 vs vehicle_attitude.rollspeed 的超调量",
  "safety": ["改一个参数，复飞一次", "param save", "复飞"]
}
```

---

## 场景 3：悬停缓慢漂移

**输入**

```text
悬停不碰杆，飞机会缓慢向一个方向飘，需要持续补杆
```

**输出**

```json
{
  "check_first": [
    "estimator_sensor_bias.gyro_bias[] 是否收敛 — 新固件；老固件看 estimator_status.states[]",
    "accel_vibration_metric 是否在合理范围",
    "桨是否平衡、机臂是否水平"
  ],
  "adjust": [
    { "param": "MC_ROLLRATE_I", "action": "increase", "note": "确认零偏已校准后才动" }
  ],
  "warning": "如果没有先确认零偏就去加 I，会把传感器偏差用积分补偿掉——换场地或温度变了就会复发。"
}
```

**顺序不能反**：先排除零偏/振动，再调 I。

---

## 场景 4：只有某一个轴抖 —— 拒绝调参

**输入**

```text
俯仰轴（pitch）抖得很厉害，横滚很正常
```

**输出**

```text
不去调 pitch 的增益。

只有单轴出问题，对称性决定了这几乎不可能是增益问题——
pitch 和 roll 用的是同一套增益（除非你单独改过某一个轴）。

单轴抖动先查物理：
  1. 该轴的电机 — 轴承是否有框量、螺丝是否拧紧
  2. 该轴的桨 — 是否有磕碰、是否装反
  3. 该轴的机臂 — 是否松动
  4. 该机的配重 — 电池偏向哪一侧

增益层面要做的只有一件事：确认 MC_PITCHRATE_P/I/D 与 MC_ROLLRATE_P/I/D
是否被改成了不同的值。如果是，先把它们恢复一致。

如果查完物理都没问题且增益对称，那更可能是 IMU 安装方向或减震的问题。
```

> 这类拒绝很重要。用户说"调一下 pitch 的 PID"，照做一定能给出一组数字，而且当场可能还"好像好点了"——因为降增益确实能压住任何抖动。但真正的断桨、松螺丝还在，下次不会这么巧。

---

## 场景 5：大油门段手感变软

**输入**

```text
悬停手感很好，但推大油门时明显感觉跟不上，像被什么东西拖着
```

**输出**

```json
{
  "diagnosis": "推力模型参数 THR_MDL_FAC 不准，大油门段控制器预估的推力与实际不符",
  "adjust": [
    { "param": "THR_MDL_FAC", "action": "tune", "note": "不是 PID 增益问题" }
  ],
  "reason": "悬停段好 = PID 没问题；只在某个油门段失效 = 控制器的推力→输出映射在那个区间不准。",
  "note": "这个场景下盲目加 P 会破坏悬停段已经调好的手感，得不偿失。"
}
```

---

## 场景 6：快速验证清单

**输入**

```text
改完参数了，怎么确认改动是有效的
```

**输出**

```bash
# 1. 先备份
param dump > backup_before.txt

# 2. 改
param set MC_ROLLRATE_D 0.0021
param save          # 忘了这句，明天回来全部白干

# 3. 复飞，然后对比日志
ulog_info latest.ulg | grep -i vehicle_rates_setpoint

# 4. 看设定值 vs 实际值
#    - 持续滞后 → 加 P
#    - 过冲     → 加 D
#    - 稳态偏差 → 加 I

# 5. 下次还想改，先看自己改过什么
param diff
```

**永远不要在没备份的情况下开始调。**
