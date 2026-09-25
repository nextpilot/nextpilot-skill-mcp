# EXAMPLE.md

完整场景集合。每个例子都是「输入 → 输出」，模型可以直接当 few-shot 用。

SKILL.md 里只保留了最短的一个，是为了让单文件场景也能跑；这里放全的。

---

## 场景 1：新增主题后订阅端拿不到数据

**输入**

```cpp
// 定义了 my_sensor_data.msg，加了 CMakeLists，发布了数据
uORB::Subscription _att_sub{ORB_ID(vehicle_attitude)};
// Run() 里
if (_att_sub.updated()) {
    vehicle_attitude_s att{};
    _att_sub.copy(&att);       // 有人这么写
    do_something(att.timestamp);
}
```

**输出**

`updated()` 只把"有更新"这个标志清掉，**不取数据**。下一次 update 会把这份数据覆盖。

必须改用 `update()`——它内部就是 `updated() + copy()` 的组合：

```cpp
vehicle_attitude_s att{};
if (_att_sub.update(&att)) {   // 检查 + 拷贝，一步
    do_something(att.timestamp);
}
```

> 判定依据：`updated()` 的语义是 poll-and-clear，`update(&dst)` 是 poll-and-copy。混用会静默丢帧，不会报错。

---

## 场景 2：`uorb top` 里频率为 0

**输入**

```text
新写的模块注册了 motor_temp 主题，uorb top 里频率一直是 0，
listener motor_temp 也没输出，但代码编译通过、模块 start 成功了
```

**输出**

```text
排查顺序：

1. 发布端是否真的执行到了 publish 行
   → 大概率没有。频率为 0 且 listener 无输出 = 主题节点从未创建，
     而节点是在第一次 publish 时创建的。

2. 检查初始化路径：Publication 的 advertise 是否成功
   if (!_pub.advertise()) { PX4_ERR("advertise failed"); return false; }

3. 结构体是否零初始化 + 填了 timestamp
   my_sensor_data_s data{};              // 必须 {} 零初始化
   data.timestamp = hrt_absolute_time();  // 必填，不填数据不进日志
   _pub.publish(data);

4. 以上都对 → 再看订阅端
```

**不要反过来查。** 从订阅端开始查会浪费在同一个问题上。

---

## 场景 3：多 IMU 实例数据串号

**输入**

```text
板子上有两个 IMU，读出来的加速度值时而对时错，像是随机串到了另一个传感器的值
```

**输出**

```cpp
// ❌ 错：按实例下标假设顺序
uORB::Subscription _imu_sub{ORB_ID(sensor_accel), 1};  // 下标 1 不等于"第二个 IMU"

// ✅ 对：按 device_id 过滤，这个 ID 由传感器校准时写入，稳定
uORB::SubscriptionMultiArray<sensor_accel_s> _sub{ORB_ID::sensor_accel};
for (auto &s : _sub) {
    s.update();
    if (s.get().device_id != _cal_acc0_id) continue;   // CAL_ACC0_ID
    // 这才是你要的那个
}
```

> 实例下标在多实例设备里是**不稳定的**，插拔顺序、初始化时序都会影响它。`device_id` 才是身份。

---

## 场景 4：自定义主题不进日志

**输入**

```text
motor_temp 在 uorb top 里有频率，listener 也能看到值，但 ulog 里抓不到这个主题
```

**输出**

```text
SDLOG_PROFILE 没有覆盖这个主题。这个参数是个 bitmask，按类别决定是否记录。

param show SDLOG_PROFILE
param set SDLOG_PROFILE 131        # 在原值基础上或上需要的位

常用位：
  1   ATTITUDE_ESTIMATE
  4   HIGH_RATE
  8   ...

改完确认：飞一次，下来用 pyulog 检查
  ulog_info sample.ulg | grep motor_temp
```

注：老固件是 `SDLOG_PRIO_*` 系列布尔参数，v1.14 之后统一成 `SDLOG_PROFILE` bitmask。

---

## 反例：什么时候不该用这个 Skill

**输入**

```text
悬停时机头慢慢向右偏，该订阅哪个主题看？
```

**输出**

这不是 uORB 机制问题，是**症状诊断**问题。应该走 [`px4-ulog-analyzer`](../px4-ulog-analyzer/) 的症状→字段映射。

> 越界的回答会显得很蠢：用户问的是"偏航为什么漂"，如果开始讲 `update()` 和 `updated()` 的区别，等于没答。
