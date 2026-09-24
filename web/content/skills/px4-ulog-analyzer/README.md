# PX4 ULog 日志字段诊断

> 给人看的设计说明。给 AI 看的指令在 [SKILL.md](./SKILL.md)，评分等运营数据在站点上。

## 做什么

把「炸机了」「飞得不正常」这类模糊诉求，映射到 `.ulg` 里的**具体主题字段**，并按固定顺序逐层排查。

核心主张：**先从字段拿确定的数，再解释发生了什么。** 反过来做（先看曲线猜原因）是不可复现的——同一份日志两个人能读出两种结论，而且都能自圆其说。

## 不做什么

| 不管 | 归谁 |
|---|---|
| 画图、拉曲线 | Flight Review / PlotJuggler——专业工具做得更好，不要在这里重复 |
| 找到根因后该怎么改参数 | [`px4-parameter-system`](../px4-parameter-system/) |
| 增益该怎么调 | [`px4-pid-tuning`](../px4-pid-tuning/) |
| 日志文件的二进制格式细节 | pyulog /官方文档 |

**这是一张方法卡，不是日志浏览器。** 它教的是"看哪个字段、用什么阈值判断"，最终产出是一组带出处的结论，不是一张图。

## 为什么诊断顺序是写死的

SKILL.md 里那 1→9 的顺序不允许模型自由发挥，理由是它按「**会让后续数据失效的程度**」排序：

```
1. logged_message      飞控自己说了什么 — 最高优先级，它知道的和它愿意说的
2. vehicle_status      有没有触发 failsafe
3. 振动 / 削波          ← 数据不可信的话，后面全白看
4. EKF
5. 电源                电压跌落能同时解释 GPS 丢星、重启、失控
6. GPS
7. 执行器输出
8. 姿态跟踪
9. 零偏
```

振动放在第三位而不是最后，是因为**振动超标时，基于 IMU 的一切结论都不可信**。如果先去看姿态跟踪误差再回头发现振动爆了，中间那段分析全废。

电源排在 GPS 前面同理：欠压会同时导致 GPS 丢星和罗盘异常，把它当成独立的两个问题会得出错误结论。

## 为什么强制「每条结论回指到字段 + 阈值 + 出处」

这是整个 Skill 最硬的一条约束，也是最难执行的。没有它的话，模型会退化成"看曲线说感觉"——**而那恰恰是人类直觉最容易出错的方式**。

用户拿到的每条结论必须能自己验证：`estimator_status.innovation_check_flags = 12，阈值 0，见 <文档链接>`。这条结论不对，用户可以指着数值反驳。这种可证伪性是你这个站区别于其他 AI 工具的地方。

对应地，还有一条同样重要的约束：**读不到字段时返回「无法判定」，不许猜。** 一份老固件的日志缺 `estimator_sensor_bias`，模型如果凭印象编一个数值出来，整个报告的可信度就归零了。

## 适用版本

字段表以 PX4 v1.14 为准。已知的版本差异：

- **零偏主题**：较新固件从 `estimator_status.states[]` 拆出独立的 `estimator_sensor_bias`。解析时按固件版本切换绑定，否则老日志读不到——这是最常见的版本坑。
- **执行器输出**：新版推荐 `actuator_motors.control[]`，旧版是 `actuator_outputs.output[]`。

## 自带的脚本与素材

| 文件 | 作用 |
|---|---|
| `scripts/quick_check.py` | 把关键字段按固定顺序拉出来，输出 JSON。**只给数，不给结论**——判断交给 SKILL.md 描述的规则 |
| `scripts/make_fixture.py` | 合成三份测试用 `.ulg`，地面真值已知、字节可复现 |
| `assets/*.ulg` | 上面那个脚本的产物，同时也是回归测试的输入 |

```bash
python3 scripts/quick_check.py flight.ulg          # 体检一份自己的日志
python3 scripts/make_fixture.py --outdir assets    # 重新生成素材（需要的话）
node eval-skills.mjs px4-ulog-diagnostics --e2e    # 端到端回归，不需要 API key
```

数值判断交给规则、解释交给模型，这个分工是有意的：**阈值随固件和机架变，改一处比重写 prompt 可靠。**

## 与其他 Skill 的关系

```
px4-ulog-diagnostics      ← 你在这里
   ↓ 给出根因
px4-parameter-system      该改哪个参数
   ↓ 给出取值逻辑
px4-pid-tuning            PID 增益专项

反过来，px4-pid-tuning 的验证环节依赖这里的字段
（vehicle_rates_setpoint vs vehicle_attitude.rollspeed）。
```

三者是流水线关系，不重复、不互相替代。

## 维护

`SKILL.md` 里那张「症状 → 主题.字段」表，严格说是**知识本体**，理想的归宿是 `knowledge/px4/facts.yaml`（字段名/中文名/单位）和 `fault-kb.yaml`（症状→根因→排查）。

现在它先活在卡片里，因为那样对单次调用最方便。但两边的更新要同步——如果 `facts.yaml` 改了字段名，这里必须跟上。这是当前已知的技术债。
