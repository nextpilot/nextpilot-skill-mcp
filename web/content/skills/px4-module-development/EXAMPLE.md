# EXAMPLE.md

完整场景集合。每个例子都是「输入 → 输出」，模型可以直接当 few-shot 用。

这份文件里最关键的是**场景 3**——三个沉默失败都在这里。它们不报错，所以特别难查。

---

## 场景 1：要加一个 100Hz 读姿态的模块

**输入**

```text
要加一个 100Hz 读姿态并输出计算结果的模块，该怎么搭？
```

**输出**

```text
结构：

src/modules/my_module/
├── CMakeLists.txt
├── my_module.cpp
└── params.yaml       可选

CMakeLists.txt：
    px4_add_module(
        MODULE modules__my_module
        MAIN my_module
        SRCS my_module.cpp
        DEPENDS
            px4_work_queue
    )

类：继承 ModuleParams + px4::ScheduledWorkItem（用工作队列，不用独立任务）

启动：多旋翼加一行到 ROMFS/px4fmu_common/init.d/rc.mc_apps
        my_module start
```

```cpp
MyModule::MyModule() :
    ModuleParams(nullptr),
    ScheduledWorkItem(MODULE_NAME, px4::wq_configurations::hp_default) {}

bool MyModule::init()
{
    ScheduleOnInterval(10000);   // 微秒 → 100Hz。写了才会跑
    return true;
}

void MyModule::Run()
{
    if (should_exit()) { ScheduleClear(); exit_and_cleanup(); return; }
    updateParams();

    vehicle_attitude_s att{};
    if (_att_sub.update(&att)) {
        my_output_s out{};
        out.timestamp = hrt_absolute_time();   // 必填
        _out_pub.publish(out);
    }
}
```

---

## 场景 2：`start` 报命令不存在

**输入**

```text
代码写完了，编译也过了，但 nsh 里敲 my_module start 提示 command not found
```

**输出**

```text
三种可能，按顺序查：

1. CMakeLists.txt 没被包含进构建
   → src/modules/<parent>/CMakeLists.txt 里要有 add_subdirectory(my_module)
   → 或者 boards/<vendor>/<target>/default.px4board 里没有启用 modules__my_module

2. MAIN 名字对不上
   → px4_add_module(... MAIN my_module) 的 MAIN 就是命令行里的名字

3. 固件没烧进去
   → make <target> upload 之后确认 boot banner 里的版本变了

诊断命令：
   top                         # 看进程在不在
   my_module status            # 存在但不响应，说明 init 失败了
   dmesg | tail                # 看启动阶段的错误
```

> 最常见的是 1。而且它不是"编译错误"，是"编译没把这个东西编进去"——所以编译通过毫无安慰作用。

---

## 场景 3：三个沉默失败

**输入**

```text
模块能起来，top 里看得到进程，但什么都不输出
```

**输出**

```text
三个原因都不报错，逐条排除：

1. 忘了调度 → Run() 一次都不执行
   检查 init() 里有没有 ScheduleOnInterval() / ScheduleNow()。
   这是最常见的，而且完全沉默——start 返回成功，进程在跑，就是不干活。

2. 忘了 publish → 数据压根没发出去
   检查 Run() 里的 publish 是否真的走到了（加一行 PX4_INFO 验证）。

3. 忘填 timestamp → 下游拒绝这条数据
   my_output_s out{};
   out.timestamp = hrt_absolute_time();   // 不填数据不进日志，很多时候也不被消费

退出的时候别忘了：
   if (should_exit()) { ScheduleClear(); exit_and_cleanup(); return; }
   少了 exit_and_cleanup()，第二次 start 会失败，而且原因不明显。
```

---

## 场景 4：工作队列选型

**输入**

```text
要写一个传感器驱动，SPI 接口，1000Hz 采样。该挂哪个队列？
```

**输出**

```text
IMU/SPI 驱动不用通用队列，走专门的 INS / SPI 系列：
    px4::wq_configurations::SPI0     // 有编号的硬件总线队列
    px4::wq_configurations::INS0     // IMU 专用

通用模块才在下面这个序列里选（优先级从高到低）：
    rate_ctrl             角速率控制，最高频 —— 别放你的模块
    nav_and_controllers   导航与控制器
    hp_default            高优先级默认
    lp_default            低优先级默认

1000Hz SPI 驱动放 SPI0/NuttX 自己的总线队列，
不要塞进 nav_and_controllers——会拖慢整架飞机的控制回路。

判断依据：
  - 有硬件总线（SPI/I2C）→ INS*/SPI* 系列
  - 纯计算任务 → 看它对延迟的要求，越敏感越往上挑
  - 无所谓 + 低负载 → lp_default，别占用高优先级队列
```

---

## 场景 5：什么时候用独立任务

**输入**

```text
我的模块需要读串口数据，用工作队列可以吗
```

**输出**

```text
不可以。工作队列的回调里不允许阻塞。

判断标准很直接：
  - 纯计算、读 uORB、写 uORB、周期性处理  → 工作队列
  - 需要等 I/O（串口 read、socket recv、wait sem）→ 独立任务 px4::Task 系

工作队列是所有注册在它上面的模块共用的。
你在回调里阻塞一次，队列上其它所有模块一起延迟——
而且表现是"某些模块莫名其妙周期性掉帧"，非常难联想到你这行代码。

要阻塞，就起独立任务：

class MySerial : public ModuleBase<MySerial>, public px4::Task
{
    void Run() override { ... read(fd, buf, n); ... }   // 可以阻塞
};
```

---

## 反例：这套东西在 NextPilot 上不适用

**输入**

```text
我在用 NextPilot（RT-Thread），照着 PX4 教程建模块，CMakeLists 写好了该怎么编译
```

**输出**

```text
NextPilot 不用 CMake。照搬会直接扑空。

| PX4              | NextPilot                      |
|------------------|--------------------------------|
| CMake            | scons + SConscript             |
| .px4board        | Kconfig + menuconfig           |
| 启动脚本注册     | RT-Thread 自动初始化宏         |
| src/modules/     | apps/ 下按类别分目录           |

所以上面所有关于 px4_add_module / MAIN / wq_configurations 的内容都不适用。

NextPilot 侧要提供的东西完全不同：SConscript 的写法、Kconfig 裁剪项、
如何用 RT-Thread 的自动初始化把模块挂进去、controller / estimator / telemetry
三个目录分别放什么。那份内容需要单独写一份 Skill。
```

> 主动承认不适用，比硬凑一套"大概可以这样"的答案有用得多。
