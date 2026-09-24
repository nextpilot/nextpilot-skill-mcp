# EXAMPLE.md

完整场景集合。每个例子都是「输入 → 输出」，模型可以直接当 few-shot 用。

---

## 场景 1：悬停机头缓慢右偏

**输入**

```text
四轴悬停，不碰杆，机头持续缓慢向右偏转
```

**输出**

```json
{
  "check": [
    "CAL_MAG0_ID 是否与当前磁罗盘匹配（换过 GPS 模块的常见）",
    "vehicle_magnetometer 是否有干扰——看起飞前后的模值变化",
    "MC_YAWRATE_I 是否过小，不足以补偿稳态力矩"
  ],
  "params": ["CAL_MAG0_ID", "MC_YAWRATE_I", "EKF2_MAG_TYPE"],
  "steps": [
    "param diff 先确认改过什么，别盲调",
    "param dump > backup.txt 备份",
    "先排除磁罗盘干扰，再考虑调 yaw 增益",
    "改动后必须 param save"
  ],
  "note": "偏航漂移八成是磁罗盘问题，不是 yaw PID 的问题。直接加 I 能压住表象，但换场地会复发。"
}
```

> 关键：**先排除再调参**。这个顺序在 PID 调参那份里也有同样的要求，两者是连贯的。

---

## 场景 2：改了参数重启就丢

**输入**

```text
在 mavlink shell 里 param set MPC_XY_P 1.2，
手感变好了，第二天上电 param show MPC_XY_P 还是 0.95
```

**输出**

```text
param set 只改 RAM 里的值，断电即失。必须：

    param set MPC_XY_P 1.2
    param save

save 之后重启验证一次。另外注意：部分参数需要重启模块或整机才生效，
save 之后立刻 param show 看到的已经是新值，但运行中的模块可能还用着旧的。

另外两个可能性：
1. 地面站连接时把备份的参数表同步回了飞机，覆盖了改动
2. 该参数被启停脚本里的某行重置了（查 rc.autostart / rc.mc_defaults）
```

---

## 场景 3：换机架后行为诡异

**输入**

```text
从四轴换成六轴，改了 SYS_AUTOSTART，
飞机能解锁但飞起来感觉不对，某些失效保护不按预期触发
```

**输出**

```text
SYS_AUTOSTART 变了但旧机架的参数还在。正确流程：

    param set SYS_AUTOCONFIG 1
    reboot

SYS_AUTOCONFIG=1 会让系统在启动时按新的 SYS_AUTOSTART 重置所有受影响的参数，
然后自己把 SYS_AUTOCONFIG 置回 0。

注意：这一步会清掉你之前所有的参数改动。所以顺序是——
先 param dump 备份 → 换机架重置 → 再重新应用你的调参。
```

---

## 场景 4：自定义参数在 `param find` 里找不到

**输入**

```cpp
// params.yaml
my_module_max_velocity_tuning:
    # ...
```

**输出**

参数名长度上限约 16 字符。`my_module_max_velocity_tuning` 有 29 个字符，被静默截断后 `param_find` 返回 null，但不会有任何错误日志——这是最难查的一类失败。

```yaml
# 改成
my_mod_max_vel:     # 13 字符，安全
    num:
      default: 5.0
```

> 命名建议：`<模块缩写>_<含义>`，控制在 12 字符以内留余量。截断不会有任何报错——这是这个坑最隐蔽的地方。

---

## 场景 5：模块读不到参数更新

**输入**

```text
param set MY_MOD_MAX_VEL 10，模块里 param_find 拿到的还是旧值 5
```

**输出**

```cpp
// ❌ 只在 init 里 param_find 一次，之后再也不管
MyModule::init() {
    _handle = param_find("MY_MOD_MAX_VEL");
    param_get(_handle, &_val);
}

// ✅ 两种正解，选一：
// 1. 继承 ModuleParams，在 Run() 里调 updateParams()
void MyModule::Run() {
    updateParams();      // 同步所有声明过的参数
    ...
}

// 2. 订阅 parameter_update 主题手动处理
uORB::Subscription _param_sub{ORB_ID(parameter_update)};
if (_param_sub.update()) { param_get(_handle, &_val); }
```

> 大多数 PX4 模块用方式 1。`updateParams()` 需要在模块里先 `DEFINE_PARAMETERS` 声明。
