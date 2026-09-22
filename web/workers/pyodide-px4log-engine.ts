// ⚠️ 自动生成，请勿手改。源文件在 engine/ 与 knowledge/px4/，改完跑 `pnpm build:kb`（dev/build 自动执行）。
import faultKbJson from "./fault-kb.generated.json";

const rules = [{"id":"px4-airspeed-invalid","name":"空速健康","group":"airspeed","order":1,"compute":["cruise_ok = require_true(masked_any_in(vehicle_status.nav_state, vehicle_status.timestamp, ARMED_INTERVALS, codes=[3, 8]))","invalid_frac = _try(ratio_equal( ref(\"airspeed_validated.airspeed_sensor_measurement_valid\"), value=0))","has_invalid = invalid_frac is not None","tas_min = _try(min(airspeed_validated.true_airspeed_m_s))"],"outputs":{"tag":"low_airspeed","stats":{"airspeedInvalidRatio":{"var":"invalid_frac","round":3},"airspeedMinM":{"var":"tas_min","round":1}},"check":"airspeed"},"triggers":[{"when":"has_invalid and invalid_frac >= 0.50","severity":"critical","tag":"low_airspeed","threshold":0.5,"value":"f\"{invalid_frac:.3f}\"","field":"airspeed_validated.airspeed_sensor_measurement_valid","title":"空速传感器在固定翼段大部分时间无效（{invalid_frac:.0%} 样本）","suggestion":"结合故障库 F009：空速失效极易引发失速，检查空速管堵塞/积水、管路漏气与校准。"},{"when":"has_invalid and invalid_frac >= 0.10","severity":"warning","tag":"low_airspeed","threshold":0.1,"value":"f\"{invalid_frac:.3f}\"","field":"airspeed_validated.airspeed_sensor_measurement_valid","title":"空速传感器间歇无效（{invalid_frac:.0%} 样本）","suggestion":"结合故障库 F009 检查空速管与管路密封。"}],"firmware":"any","airframe":"fixed_wing","topics":[["airspeed_validated"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"airspeed","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},{"id":"px4-attitude-oscillation","name":"姿态误差高频振荡","group":"attitude_tracking","order":2,"version":"1.1.0","ran_when":"seg_ok","compute":["p99, osc_hz, seg_n = _try(att_tracking_stats(\n  att_q=vehicle_attitude.q,\n  # 指令源：两路都给，**有 q_d 就用 q_d**（新版只记它），没有才回退 roll/pitch_body。\n  # 顺序由算子定，规则不用管版本——按存在性挑，不按版本号挑。\n  sp_q=ref(\"vehicle_attitude_setpoint.q_d\"),\n  sp_roll=ref(\"vehicle_attitude_setpoint.roll_body\"),\n  sp_pitch=ref(\"vehicle_attitude_setpoint.pitch_body\"),\n  att_ts=vehicle_attitude.timestamp,\n  sp_ts=vehicle_attitude_setpoint.timestamp,\n  intervals=ARMED_INTERVALS,\n  tilt_min_deg=10.0, min_samples=50, sample_rate=50))","seg_ok = seg_n > 50 if seg_n else False","p99_stat = p99 if seg_ok else None","osc_stat = osc_hz if seg_ok else None"],"outputs":{"tag":"attitude_overshoot","stats":{"attitudeErrDegP99":{"var":"p99_stat","round":1},"attitudeOscHz":{"var":"osc_stat","round":2}},"check":"attitude_tracking"},"triggers":[{"when":"osc_stat >= 4.0 and p99_stat >= 25.0 and IS_FIXED_WING","severity":"warning","tag":"attitude_overshoot","threshold":4,"value":"f\"{osc_stat:.2f}\"","unit":"Hz","field":"姿态跟踪误差符号翻转频率","title":"姿态误差高频振荡（约 {osc_stat:.1f} Hz）","suggestion":"振荡多与控制增益/机架共振相关，禁用大幅调参，先做频响检查。"},{"when":"osc_stat >= 4.0 and p99_stat >= 15.0 and not IS_FIXED_WING","severity":"warning","tag":"attitude_overshoot","threshold":4,"value":"f\"{osc_stat:.2f}\"","unit":"Hz","field":"姿态跟踪误差符号翻转频率","title":"姿态误差高频振荡（约 {osc_stat:.1f} Hz）","suggestion":"振荡多与控制增益/机架共振相关，禁用大幅调参，先做频响检查。"}],"firmware":"any","airframe":"any","topics":[["vehicle_attitude"],["vehicle_attitude_setpoint"]],"status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"attitude","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},{"id":"px4-attitude-overshoot","name":"姿态跟踪超调","group":"attitude_tracking","order":1,"version":"1.1.0","ran_when":"seg_ok","compute":["p99, osc_hz, seg_n = _try(att_tracking_stats(\n  att_q=vehicle_attitude.q,\n  # 指令源：两路都给，**有 q_d 就用 q_d**（新版只记它），没有才回退 roll/pitch_body。\n  # 顺序由算子定，规则不用管版本——按存在性挑，不按版本号挑。\n  sp_q=ref(\"vehicle_attitude_setpoint.q_d\"),\n  sp_roll=ref(\"vehicle_attitude_setpoint.roll_body\"),\n  sp_pitch=ref(\"vehicle_attitude_setpoint.pitch_body\"),\n  att_ts=vehicle_attitude.timestamp,\n  sp_ts=vehicle_attitude_setpoint.timestamp,\n  intervals=ARMED_INTERVALS,\n  tilt_min_deg=10.0, min_samples=50, sample_rate=50))","seg_ok = seg_n > 50 if seg_n else False","p99_stat = p99 if seg_ok else None","osc_stat = osc_hz if seg_ok else None"],"outputs":{"tag":"attitude_overshoot","stats":{"attitudeErrDegP99":{"var":"p99_stat","round":1},"attitudeOscHz":{"var":"osc_stat","round":2}},"check":"attitude_tracking"},"triggers":[{"when":"p99_stat >= 40.0 and IS_FIXED_WING","severity":"critical","tag":"attitude_overshoot","threshold":25,"value":"f\"{p99_stat:.1f}\"","unit":"°","field":"vehicle_attitude vs vehicle_attitude_setpoint（机动段）","title":"姿态跟踪误差过大（p99 {p99_stat:.1f}°）","suggestion":"结合故障库 F006：检查姿态环增益、机架共振；避免直接大幅降 PID。"},{"when":"p99_stat >= 25.0 and IS_FIXED_WING","severity":"warning","tag":"attitude_overshoot","threshold":25,"value":"f\"{p99_stat:.1f}\"","unit":"°","field":"vehicle_attitude vs vehicle_attitude_setpoint（机动段）","title":"姿态跟踪误差偏大（p99 {p99_stat:.1f}°）","suggestion":"结合故障库 F006 排查；大风环境下优先归因环境扰动。"},{"when":"p99_stat >= 30.0 and not IS_FIXED_WING","severity":"critical","tag":"attitude_overshoot","threshold":15,"value":"f\"{p99_stat:.1f}\"","unit":"°","field":"vehicle_attitude vs vehicle_attitude_setpoint（机动段）","title":"姿态跟踪误差过大（p99 {p99_stat:.1f}°）","suggestion":"结合故障库 F006：检查姿态环增益、机架共振；避免直接大幅降 PID。"},{"when":"p99_stat >= 15.0 and not IS_FIXED_WING","severity":"warning","tag":"attitude_overshoot","threshold":15,"value":"f\"{p99_stat:.1f}\"","unit":"°","field":"vehicle_attitude vs vehicle_attitude_setpoint（机动段）","title":"姿态跟踪误差偏大（p99 {p99_stat:.1f}°）","suggestion":"结合故障库 F006 排查；大风环境下优先归因环境扰动。"}],"firmware":"any","airframe":"any","topics":[["vehicle_attitude"],["vehicle_attitude_setpoint"]],"status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"attitude","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},{"id":"px4-cpu-load","group":"cpu","name":"CPU 负载","compute":["cpu_max = max(cpuload.load)"],"outputs":{"check":"cpu_load","stats":{"cpuLoadMax":{"var":"cpu_max","round":3}}},"triggers":[{"when":"cpu_max >= 0.95","severity":"critical","threshold":0.95,"value":"f\"{cpu_max:.3f}\"","field":"cpuload.load(max)","title":"CPU 负载峰值 {cpu_max:.0%} 超阈值","suggestion":"CPU 长期接近满载会导致控制环丢步；检查高耗率模块与日志流配置。"},{"when":"cpu_max >= 0.90","severity":"warning","threshold":0.9,"value":"f\"{cpu_max:.3f}\"","field":"cpuload.load(max)","title":"CPU 负载峰值 {cpu_max:.0%} 偏高","suggestion":"关注 CPU 余量，必要时降低消息发布率。"}],"firmware":"any","airframe":"any","topics":[["cpuload"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"system","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},{"id":"px4-ekf-fault","name":"EKF 融合硬故障","group":"ekf_faults","order":1,"compute":["fault_raw = _try(bit_or_max( ref(\"estimator_status[:].filter_fault_flags\")))","fault_union = _try(coalesce(fault_raw, 0))","crit_bits = _try(has_bits(fault_union, 63))"],"outputs":{"tag":"ekf_innovation_failure","check":"ekf_faults"},"triggers":[{"when":"crit_bits","severity":"critical","threshold":0,"value":"f\"fault={fault_union}\"","field":"estimator_status.filter_fault_flags","title":"EKF 报告核心融合硬故障（filter_fault_flags={fault_union}）","suggestion":"估计器出现硬故障，建议停飞排查传感器与振动后重新标定。"},{"when":"fault_union > 0 and not crit_bits","severity":"info","tag":null,"threshold":0,"value":"fault_union","field":"estimator_status.filter_fault_flags","title":"EKF 报告非核心辅助传感器融合拒绝（filter_fault_flags={fault_union}，常见为未使用视觉/光流）","suggestion":"若该机确实未启用视觉/光流定位，此位可忽略；否则检查对应传感器。"}],"firmware":"any","airframe":"any","topics":[["estimator_status"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"ekf","doc":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"},{"id":"px4-ekf-innovation","name":"EKF 创新检验","group":"ekf_innovations","order":1,"compute":["frac, names, inst = worst_reject_ratio(\n  ref(\"estimator_status[:].innovation_check_flags\"),\n  ref(\"estimator_status[:].vel_test_ratio\"),\n  ref(\"estimator_status[:].pos_test_ratio\"),\n  ref(\"estimator_status[:].hgt_test_ratio\"),\n  ref(\"estimator_status[:].hdg_test_ratio\"),\n  ref(\"estimator_status[:].mag_test_ratio\"),\n  ref(\"estimator_status[:].tas_test_ratio\"),\n  ref(\"estimator_status[:].hagl_test_ratio\"),\n  ref(\"estimator_status[:].beta_test_ratio\"),\n  primary_min=3,\n  primary_names=[\"速度\", \"水平位置\", \"垂直位置\", \"磁罗盘 X\", \"磁罗盘 Y\", \"磁罗盘 Z\",\n                 \"航向\", \"空速\", \"侧滑\", \"离地高度\", \"光流 X\", \"光流 Y\"],\n  ge=1.0,                    # 通道判拒阈值：ratio >= 1 即该路观测被 EKF 拒绝\n  channel_min=3,             # 通道最少被拒样本数，去偶发尖峰毛刺\n  channel_labels=[\"速度\", \"水平位置\", \"垂直高度\", \"航向\", \"磁罗盘\", \"空速\", \"离地高度\", \"侧滑\"],\n  fallback_label=\"未知通道\")","pct = frac * 100"],"outputs":{"tag":"ekf_innovation_failure","stats":{"ekfRejectRatioPct":{"var":"pct","round":2}},"check":"ekf_innovations"},"triggers":[{"when":"pct >= 5.0","severity":"critical","threshold":5,"value":"f\"{pct:.2f}\"","unit":"%","field":"estimator_status 创新检验拒绝样本占比","title":"EKF 创新检验持续失败（estimator #{inst}：{names}）","suggestion":"涉及：{names}。检查对应传感器健康度、安装与校准。"},{"when":"pct >= 1.0","severity":"warning","threshold":1,"value":"f\"{pct:.2f}\"","unit":"%","field":"estimator_status 创新检验拒绝样本占比","title":"EKF 创新检验偶发失败（estimator #{inst}：{names}）","suggestion":"涉及：{names}。关注 GPS 卫星数、磁罗盘干扰、振动与气压计异常。"}],"firmware":"any","airframe":"any","topics":[["estimator_status"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"ekf","doc":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"},{"id":"px4-failsafe-failsafe","name":"失效保护触发","group":"failsafe","order":1,"compute":["events = rising_edge_events(vehicle_status.failsafe, vehicle_status.timestamp, ARMED_INTERVALS, T0_US)"],"foreach":{"var":"events","keys":["t_s"]},"triggers":[{"when":"True","severity":"critical","tag":"failsafe","value":"f\"set at {t_s:.1f}s\"","field":"vehicle_status.failsafe","title":"触发失效保护（飞行中，t={t_s:.1f}s）","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。"}],"firmware":"any","airframe":"any","version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"failsafe","outputs":{"check":"failsafe"},"doc":"https://docs.px4.io/main/en/config/safety.html"},{"id":"px4-failsafe-rc_signal_lost","name":"遥控信号丢失","group":"failsafe","order":2,"compute":["events = rising_edge_events(vehicle_status.rc_signal_lost, vehicle_status.timestamp, ARMED_INTERVALS, T0_US)"],"foreach":{"var":"events","keys":["t_s"]},"triggers":[{"when":"True","severity":"warning","tag":"rc_lost","value":"f\"set at {t_s:.1f}s\"","field":"vehicle_status.rc_signal_lost","title":"遥控信号丢失（飞行中，t={t_s:.1f}s）","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。"}],"firmware":"any","airframe":"any","version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"failsafe","outputs":{"check":"failsafe"},"doc":"https://docs.px4.io/main/en/config/safety.html"},{"id":"px4-failsafe-data_link_lost","name":"数据链路丢失","group":"failsafe","order":3,"compute":["events = rising_edge_events(vehicle_status.data_link_lost, vehicle_status.timestamp, ARMED_INTERVALS, T0_US)"],"foreach":{"var":"events","keys":["t_s"]},"triggers":[{"when":"True","severity":"warning","tag":null,"value":"f\"set at {t_s:.1f}s\"","field":"vehicle_status.data_link_lost","title":"数据链路丢失（飞行中，t={t_s:.1f}s）","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。"}],"firmware":"any","airframe":"any","version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"failsafe","outputs":{"check":"failsafe"},"doc":"https://docs.px4.io/main/en/config/safety.html"},{"id":"px4-failsafe-engine_failure","name":"动力故障保护","group":"failsafe","order":4,"compute":["events = rising_edge_events(vehicle_status.engine_failure, vehicle_status.timestamp, ARMED_INTERVALS, T0_US)"],"foreach":{"var":"events","keys":["t_s"]},"triggers":[{"when":"True","severity":"critical","tag":null,"value":"f\"set at {t_s:.1f}s\"","field":"vehicle_status.engine_failure","title":"发动机/动力故障保护（飞行中，t={t_s:.1f}s）","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。"}],"firmware":"any","airframe":"any","version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"failsafe","outputs":{"check":"failsafe"},"doc":"https://docs.px4.io/main/en/config/safety.html"},{"id":"px4-failsafe-mission_failure","name":"任务失效保护","group":"failsafe","order":5,"compute":["events = rising_edge_events(vehicle_status.mission_failure, vehicle_status.timestamp, ARMED_INTERVALS, T0_US)"],"foreach":{"var":"events","keys":["t_s"]},"triggers":[{"when":"True","severity":"critical","tag":null,"value":"f\"set at {t_s:.1f}s\"","field":"vehicle_status.mission_failure","title":"任务失效保护（飞行中，t={t_s:.1f}s）","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。"}],"firmware":"any","airframe":"any","version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"failsafe","outputs":{"check":"failsafe"},"doc":"https://docs.px4.io/main/en/config/safety.html"},{"id":"px4-failsafe-nav","name":"失效保护导航状态","group":"failsafe","order":6,"compute":["events = step_into_events(vehicle_status.nav_state, vehicle_status.timestamp, ARMED_INTERVALS, T0_US, codes={5: \"AUTO_RTL\", 12: \"DESCEND\", 13: \"TERMINATION\", 18: \"LAND\"})"],"foreach":{"var":"events","keys":["t_s","code","name"]},"triggers":[{"when":"True","severity":"critical","tag":"failsafe","value":"name","field":"vehicle_status.nav_state","title":"飞行中导航状态切换为 {name}（t={t_s:.1f}s）","suggestion":"说明飞控进入失效保护状态，需结合前文事件定位触发原因。"}],"firmware":"any","airframe":"any","topics":[["vehicle_status"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"failsafe","outputs":{"check":"failsafe"},"doc":"https://docs.px4.io/main/en/config/safety.html"},{"id":"px4-gps-eph","name":"GPS 水平位置误差","group":"gps_health","order":1,"compute":["eph_pos = keep_gt(vehicle_gps_position.eph, gt=0)","eph_m = eph_pos * 0.001","e_p95 = percentile(eph_m, p=95)","e_max = max(eph_m)"],"outputs":{"tag":"gps_eph_high","stats":{"gpsEphP95M":{"var":"e_p95","round":2},"gpsEphMaxM":{"var":"e_max","round":2}},"check":"gps_health"},"triggers":[{"when":"e_p95 >= 10.0","severity":"warning","tag":"gps_eph_high","threshold":10,"value":"f\"{e_p95:.2f}\"","unit":"m","field":"vehicle_gps_position.eph(armed p95)","title":"GPS 水平位置误差持续偏大（p95 {e_p95:.1f} m）","suggestion":"结合故障库 F002：排查天线电磁干扰/遮挡/馈线虚接/多路径。"},{"when":"e_p95 >= 5.0","severity":"info","tag":"gps_eph_high","threshold":5,"value":"f\"{e_p95:.2f}\"","unit":"m","field":"vehicle_gps_position.eph(armed p95)","title":"GPS 水平位置误差偶发偏大（p95 {e_p95:.1f} m）","suggestion":"关注天线安装位置与遮挡。"}],"firmware":"any","airframe":"any","topics":[["vehicle_gps_position"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"gps","doc":"https://docs.px4.io/main/en/gps_compass/"},{"id":"px4-gps-jump","name":"GPS 位置跳变","group":"gps_health","order":3,"compute":["step = _try(adjacent_speed_mps( ref(\"vehicle_gps_position.latitude_deg\", \"vehicle_gps_position.lat\", unit=\"deg\"), ref(\"vehicle_gps_position.longitude_deg\", \"vehicle_gps_position.lon\", unit=\"deg\"), ref(\"vehicle_gps_position.timestamp\")))","njump = _try(to_int(count_above(step, gt=50.0)))"],"outputs":{"tag":"gps_jump","stats":{"gpsJumpCount":{"var":"njump"}},"check":"gps_health"},"triggers":[{"when":"njump >= 3","severity":"warning","tag":"gps_jump","threshold":3,"value":"njump","unit":"次","field":"vehicle_gps_position lat/lon 相邻差分","title":"GPS 位置出现 {njump} 次异常跳变（>50 m/s）","suggestion":"结合故障库 F002：排查多路径、馈线与电磁干扰；室内跳变为正常现象。"}],"firmware":"any","airframe":"any","topics":[["vehicle_gps_position"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"gps","doc":"https://docs.px4.io/main/en/gps_compass/"},{"id":"px4-gps-sats","name":"GPS 卫星数","group":"gps_health","order":2,"compute":["s_min_raw = min(vehicle_gps_position.satellites_used)","s_min = to_int(s_min_raw)"],"outputs":{"tag":"gps_eph_high","stats":{"gpsSatellitesMin":{"var":"s_min"}},"check":"gps_health"},"triggers":[{"when":"s_min <= 6","severity":"warning","tag":"gps_eph_high","threshold":8,"value":"s_min","unit":"颗","field":"vehicle_gps_position.satellites_used(min)","title":"GPS 卫星数最少仅 {s_min} 颗","suggestion":"卫星数不足时定位易跳变；排查遮挡与天线。"}],"firmware":"any","airframe":"any","topics":[["vehicle_gps_position"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"gps","doc":"https://docs.px4.io/main/en/gps_compass/"},{"id":"px4-guard-log-dropouts","name":"数据质量-日志丢包","group":"guards","order":3,"outputs":{"guard_tags":[{"when":"DROPOUT_MS > 1000","tag":"log_dropouts_high"}]},"firmware":"any","airframe":"any","version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"guard","compute":[]},{"id":"px4-guard-restart","name":"数据质量-中途重启","group":"guards","order":1,"outputs":{"guard_tags":[{"when":"RESTART_DETECTED","tag":"restart_detected"}]},"firmware":"any","airframe":"any","version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"guard","compute":[]},{"id":"px4-guard-short-log","name":"数据质量-短日志","group":"guards_early","order":1,"outputs":{"guard_tags":[{"when":"ARMED_S > 0 and ARMED_S < 60","tag":"insufficient_data"},{"when":"ARMED_S == 0 and DURATION_S < 60","tag":"insufficient_data"}]},"firmware":"any","airframe":"any","version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"guard","compute":[]},{"id":"px4-guard-topic-missing","name":"数据质量-关键 topic 缺失","group":"guards","order":2,"outputs":{"guard_tags":[{"when":"not has_topic('vehicle_status')","tag":"topic_missing:vehicle_status"},{"when":"not has_topic('battery_status')","tag":"topic_missing:battery_status"},{"when":"not has_topic('estimator_status')","tag":"topic_missing:estimator_status"}]},"firmware":"any","airframe":"any","version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"guard","compute":[]},{"id":"px4-imu-bias-drift","name":"陀螺零偏漂移","group":"imu_bias","order":1,"version":"1.1.0","compute":["bx, by, bz, bts, src_text = _try(gyro_bias_series( ref(\"estimator_sensor_bias[0].gyro_bias\"), ref(\"estimator_sensor_bias[0].timestamp\"), ref(\"estimator_states[0].states\"), ref(\"estimator_states[0].timestamp\"), ref(\"estimator_status[0].states\"), ref(\"estimator_status[0].timestamp\"), slot=10, sources=[\"estimator_sensor_bias.gyro_bias[]\",\n         \"estimator_states.states[10..12]\",\n         \"estimator_status.states[10..12]\"]))","worst_abs, worst_axis, worst_drift, drift_axis = gyro_bias_worst( bx, by, bz, bts, ARMED_INTERVALS, labels=[\"X\", \"Y\", \"Z\"], min_count=10)","temp_range = _try(max_temp_range(ref(\"vehicle_imu_status[0].temperature_gyro\"), ref(\"vehicle_air_data[0].ambient_temperature\")))","bias_stat = _try(larger(worst_abs, worst_drift))"],"outputs":{"tag":"imu_bias_drift","stats":{"gyroBiasMaxRadS":{"var":"worst_abs","round":4},"gyroBiasDriftRadS":{"var":"worst_drift","round":4},"gyroBiasSource":{"var":"src_text"},"imuTempRangeC":{"var":"temp_range","round":1}},"guard_tags":[{"when":"temp_range >= 15","tag":"temperature_change_large"}],"check":"imu_bias"},"triggers":[{"when":"worst_abs >= 0.05 or worst_drift >= 0.05","severity":"critical","tag":"imu_bias_drift","threshold":0.02,"value":"f\"{bias_stat:.4f}\"","unit":"rad/s","field":"{src_text}","title":"陀螺零偏异常（轴 {worst_axis}：绝对值 {worst_abs:.4f} rad/s，漂移 {worst_drift:.4f} rad/s）","suggestion":"结合故障库 F005：检查 IMU 安装紧固、执行陀螺/加计标定；若温度跨度大，优先按温度漂移解释。"},{"when":"worst_abs >= 0.02 or worst_drift >= 0.02","severity":"warning","tag":"imu_bias_drift","threshold":0.02,"value":"f\"{bias_stat:.4f}\"","unit":"rad/s","field":"{src_text}","title":"陀螺零偏异常（轴 {worst_axis}：绝对值 {worst_abs:.4f} rad/s，漂移 {worst_drift:.4f} rad/s）","suggestion":"结合故障库 F005：检查 IMU 安装紧固、执行陀螺/加计标定；若温度跨度大，优先按温度漂移解释。"}],"firmware":"any","airframe":"any","precheck":["not HAS_ARMED"],"status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"imu","doc":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"},{"id":"px4-imu-clipping","name":"加速度计削波","group":"vibration","order":3,"compute":["clip, clip_idx, clip_axis = worst_column_delta(\n  ref(\"vehicle_imu_status[:].accel_clipping\", alias=\"clipping\"))","clip_stat = clip if clip > 0 else None"],"outputs":{"tag":"high_vibration","stats":{"imuAccelClippingCountMax":{"var":"clip_stat"}},"check":"vibration"},"triggers":[{"when":"clip >= 1000","severity":"critical","threshold":1000,"value":"clip","unit":"count","field":"vehicle_imu_status.accel_clipping[{clip_axis}](末值-首值)","title":"加速度计削波严重：IMU #{clip_idx} 轴 {clip_axis} 全日志累计削波 {clip} 次（理想值为 0）","suggestion":"持续削波会破坏 EKF 估计，请优先排除机械振动源。"},{"when":"clip >= 100","severity":"warning","threshold":100,"value":"clip","unit":"count","field":"vehicle_imu_status.accel_clipping[{clip_axis}](末值-首值)","title":"检测到明显加速度计削波：IMU #{clip_idx} 轴 {clip_axis} 全日志累计削波 {clip} 次（理想值为 0）","suggestion":"削波表明振动峰值已超出传感器量程，建议排查机械振动源。"},{"when":"clip > 0","severity":"info","tag":null,"threshold":0,"value":"clip","unit":"count","field":"vehicle_imu_status.accel_clipping[{clip_axis}](末值-首值)","title":"偶发加速度计削波：IMU #{clip_idx} 轴 {clip_axis} 全日志累计削波 {clip} 次（理想值为 0）","suggestion":"少量削波可先观察；频次升高或伴随振动告警需排查机械问题。"}],"firmware":"any","airframe":"any","topics":[["vehicle_imu_status"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"vibration","doc":"https://docs.px4.io/main/en/assembly/vibration_isolation.html"},{"id":"px4-log-errors","name":"日志错误消息","group":"logged_messages","order":1,"version":"1.0.1","compute":["n = count_items(MESSAGES, key=\"level_name\", in_list=[\"EMERGENCY\", \"ALERT\", \"CRITICAL\", \"ERROR\"])","samples = take_items(MESSAGES, key=\"level_name\", in_list=[\"EMERGENCY\", \"ALERT\", \"CRITICAL\", \"ERROR\"], limit=5, clip={\"message\": 200}, drop=[\"level\", \"level_name\"])"],"triggers":[{"when":"n > 0","severity":"critical","tag":null,"threshold":0,"value":"n","unit":"条","field":"ulog.logged_messages(log_level<=3)","title":"日志中出现 {n} 条 ERROR 及以上消息","suggestion":"按时间顺序核对错误原文，这通常是定位根因最直接的证据。","evidence_extra":{"samples":"samples"}}],"firmware":"any","airframe":"any","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"messages","outputs":{"check":"logged_messages"},"doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},{"id":"px4-log-warnings","name":"日志警告消息","group":"logged_messages","order":2,"version":"1.0.1","compute":["n = count_items(MESSAGES, key=\"level_name\", eq=\"WARNING\")","samples = take_items(MESSAGES, key=\"level_name\", eq=\"WARNING\", limit=5, clip={\"message\": 200}, drop=[\"level\", \"level_name\"])"],"triggers":[{"when":"n > 0","severity":"warning","tag":null,"threshold":0,"value":"n","unit":"条","field":"ulog.logged_messages(log_level=4)","title":"日志中出现 {n} 条 WARNING 消息","evidence_extra":{"samples":"samples"}}],"firmware":"any","airframe":"any","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"messages","outputs":{"check":"logged_messages"},"doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},{"id":"px4-mode-thrash","name":"飞行模式抖动","group":"mode_thrash","order":1,"compute":["n_changes_raw = edges_count(vehicle_status.nav_state)","n_changes = to_int(n_changes_raw)"],"outputs":{"stats":{"navStateChanges":{"var":"n_changes"}},"check":"mode_thrash"},"triggers":[{"when":"n_changes > 12","severity":"warning","tag":null,"threshold":12,"value":"n_changes","unit":"次","field":"vehicle_status.nav_state 变化次数","title":"飞行模式切换 {n_changes} 次（>12），可能存在模式抖动","suggestion":"频繁切模式易诱发操纵混乱；检查遥控器开关与失效保护反复触发。"}],"firmware":"any","airframe":"any","topics":[["vehicle_status"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"mode","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},{"id":"px4-motor-unbalance","name":"电机输出不平衡","group":"motor_balance","order":1,"version":"1.1.0","compute":["mts = actuator_motors.timestamp","cols = actuator_motors.control","seg = active_window_mask(mts, ARMED_INTERVALS, vehicle_status.nav_state, vehicle_status.timestamp, codes=[2, 4, 6, 14, 21], min_active=20)","spread, busiest, idlest, n_active = column_spread_stats( cols, seg, min_mean=0.01, min_channels=4)"],"outputs":{"tag":"motor_output_unbalance","stats":{"motorControlSpread":{"var":"spread","round":3},"motorCountActive":{"var":"n_active"}},"check":"motor_balance"},"triggers":[{"when":"spread >= 0.15","severity":"critical","tag":"motor_output_unbalance","threshold":0.15,"value":"f\"{spread:.3f}\"","field":"actuator_motors.control[](悬停段均值极差)","title":"电机输出不平衡（悬停段通道 {busiest} 与 {idlest} 差 {spread:.3f}）","suggestion":"结合故障库 F008：检查桨叶型号/正反桨是否一致、单电机效率、机架形变。"},{"when":"spread >= 0.08","severity":"warning","tag":"motor_output_unbalance","threshold":0.08,"value":"f\"{spread:.3f}\"","field":"actuator_motors.control[](悬停段均值极差)","title":"电机输出差异偏大（通道 {busiest} 与 {idlest} 差 {spread:.3f}）","suggestion":"结合故障库 F008 排查动力一致性；偶发差异可先观察。"}],"firmware":"any","airframe":"any","topics":[["actuator_motors"]],"status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"motor","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},{"id":"px4-power-cell-voltage","name":"单电芯电压","group":"battery","order":1,"version":"1.1.0","compute":["vmin, cell_min, cells, have_measured, have_fallback, no_cell = _try(cell_voltage_min( ref(\"battery_status[0].voltage_cell_v\"), ref(\"battery_status[0].voltage_v\"), ref(\"battery_status[0].voltage_filtered_v\"), ref(\"battery_status[0].cell_count\")))"],"outputs":{"tag":"battery_voltage_drop","stats":{"batteryVoltageMin":{"var":"vmin","round":2},"batteryCellCount":{"var":"cells"},"batteryCellVoltageMin":{"var":"cell_min","round":3}},"check":"battery"},"triggers":[{"when":"have_measured and cell_min < 3.55","severity":"critical","threshold":3.55,"value":"f\"{cell_min:.3f}\"","unit":"V/cell","field":"battery_status.voltage_cell_v[](实测最小值)","title":"电芯电压严重过低","suggestion":"存在过放风险，检查电池老化、放电倍率匹配与低压告警阈值。"},{"when":"have_fallback and not have_measured and cell_min < 3.55","severity":"critical","threshold":3.55,"value":"f\"{cell_min:.3f}\"","unit":"V/cell","field":"battery_status.voltage_v(min)/cell_count","title":"电芯电压严重过低","suggestion":"存在过放风险，检查电池老化、放电倍率匹配与低压告警阈值。"},{"when":"have_measured and cell_min < 3.70","severity":"warning","threshold":3.7,"value":"f\"{cell_min:.3f}\"","unit":"V/cell","field":"battery_status.voltage_cell_v[](实测最小值)","title":"电芯电压偏低","suggestion":"建议核对剩余容量估计与返航电压裕度。"},{"when":"have_fallback and not have_measured and cell_min < 3.70","severity":"warning","threshold":3.7,"value":"f\"{cell_min:.3f}\"","unit":"V/cell","field":"battery_status.voltage_v(min)/cell_count","title":"电芯电压偏低","suggestion":"建议核对剩余容量估计与返航电压裕度。"},{"when":"no_cell","severity":"info","tag":null,"value":"f\"missing\"","field":"battery_status.voltage_cell_v / cell_count","title":"日志缺少电芯电压与 cell_count，未做单电芯判断"}],"firmware":"any","airframe":"any","topics":[["battery_status"]],"status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"power","doc":"https://docs.px4.io/main/en/config/battery.html"},{"id":"px4-power-remaining","name":"电池剩余电量","group":"battery","order":3,"compute":["rem = min_ge(ref(\"battery_status[0].remaining\"), ge=0)","rem_pct = rem * 100"],"outputs":{"tag":"battery_voltage_drop","stats":{"batteryRemainingMin":{"var":"rem","round":3}},"check":"battery"},"triggers":[{"when":"rem <= 0.10","severity":"critical","threshold":0.1,"value":"f\"{rem:.3f}\"","field":"battery_status.remaining(min)","title":"电池剩余电量极低（{rem_pct:.0f}%）","suggestion":"剩余电量低于 10%，应立即返航；检查电量估算与电池健康。"},{"when":"rem <= 0.20","severity":"warning","threshold":0.2,"value":"f\"{rem:.3f}\"","field":"battery_status.remaining(min)","title":"电池剩余电量偏低（{rem_pct:.0f}%）","suggestion":"剩余电量低于 20%，注意返航裕度。"}],"firmware":"any","airframe":"any","topics":[["battery_status"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"power","doc":"https://docs.px4.io/main/en/config/battery.html"},{"id":"px4-power-sag","name":"飞行中持续压降","group":"battery","order":2,"compute":["cell_min_t = rows_aggregate(ref(\"battery_status[0].voltage_cell_v\"), agg=\"min\", gt=0)","drop, tail = head_tail_median_drop(cell_min_t, ref(\"battery_status[0].timestamp\"), ARMED_INTERVALS, skip_first_s=5, min_seg=20)"],"outputs":{"tag":"battery_voltage_drop","stats":{"batteryCellSagFlight":{"var":"drop","round":3}},"check":"battery"},"triggers":[{"when":"drop >= 0.30 and tail < 3.70","severity":"warning","threshold":0.3,"value":"f\"{drop:.3f}\"","unit":"V","field":"battery_status.voltage_cell_v[] armed 段趋势","title":"飞行中单电芯持续压降 {drop:.2f} V（尾段中位 {tail:.2f} V）","suggestion":"持续压降区别于大机动瞬时压降：排查电芯老化内阻、插头虚接、线缆线径与负载匹配。"}],"firmware":"any","airframe":"any","topics":[["battery_status"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"power","doc":"https://docs.px4.io/main/en/config/battery.html"},{"id":"px4-vibration","name":"高频振动","group":"vibration","order":1,"compute":["vibe_mean, vibe_p95, vibe_max, imu_idx = worst_mean_stats(\n  ref(\"vehicle_imu_status[:].accel_vibration_metric\"), min_mean=0)"],"outputs":{"tag":"high_vibration","stats":{"imuAccelVibrationMean":{"var":"vibe_mean","round":3},"imuAccelVibrationP95":{"var":"vibe_p95","round":3},"imuAccelVibrationMax":{"var":"vibe_max","round":3}},"check":"vibration"},"triggers":[{"when":"vibe_mean >= 9.81","severity":"critical","threshold":9.81,"value":"f\"{vibe_mean:.3f}\"","unit":"m/s^2","field":"vehicle_imu_status.accel_vibration_metric(均值)","title":"高频振动严重超标（IMU #{imu_idx}）","suggestion":"Flight Review 红色区间（>9.81 m/s^2）。结合故障库条目排查桨叶/电机/机架/减震。"},{"when":"vibe_mean >= 4.905","severity":"warning","threshold":4.905,"value":"f\"{vibe_mean:.3f}\"","unit":"m/s^2","field":"vehicle_imu_status.accel_vibration_metric(均值)","title":"高频振动偏大（IMU #{imu_idx}）","suggestion":"Flight Review 橙色区间（4.905~9.81 m/s^2）。结合故障库条目排查桨叶动平衡/电机/IMU 减震。"}],"firmware":"any","airframe":"any","topics":[["vehicle_imu_status"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"vibration","doc":"https://docs.px4.io/main/en/assembly/vibration_isolation.html"},{"id":"px4-vtol-transition-attitude","name":"VTOL 转换姿态越限","group":"vtol_transition","order":1,"compute":["trans_n = _try(count_above(vtol_vehicle_status.vtol_in_trans_mode, gt=0))","trans_n_i = _try(to_int(trans_n))","trans_mask = _try(fill_to(ref(\"vtol_vehicle_status.vtol_in_trans_mode\"), ref(\"vtol_vehicle_status.timestamp\"), ref(\"vehicle_attitude.timestamp\")))","roll, pitch, yaw = _try(quat_to_euler(ref(\"vehicle_attitude.q\")))","tilt_max = _try(masked_absmax(larger(abs_values(roll), abs_values(pitch)), trans_mask))","trans_cnt = _try(count_true(trans_mask))","enough = _try(trans_cnt > 5)","has_tilt = tilt_max is not None","tilt_stat = _try(tilt_max if enough else None)"],"outputs":{"tag":"vtol_convert_attitude_over","stats":{"vtolTransitionSamples":{"var":"trans_n_i"},"vtolTransitionMaxTiltDeg":{"var":"tilt_stat","round":1}},"check":"vtol_transition"},"triggers":[{"when":"has_tilt and enough and tilt_max > 8.0","severity":"warning","tag":"vtol_convert_attitude_over","threshold":8,"value":"f\"{tilt_max:.1f}\"","unit":"°","field":"vehicle_attitude（vtol_in_trans_mode 段）","title":"VTOL 转换阶段姿态越限（最大 {tilt_max:.1f}°，限值 8°）","suggestion":"结合故障库 F003：复盘转换时序与推力匹配，强风环境优先归因环境扰动。"}],"firmware":"any","airframe":"any","topics":[["vtol_vehicle_status"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"vtol","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},{"id":"px4-wind-estimate","name":"风扰估计","group":"wind_estimate","order":1,"compute":["w_p95 = percentile(\n  hypot(coalesce(ref(\"estimator_wind[0].windspeed_north\"),\n                 ref(\"wind_estimate[0].windspeed_north\")),\n        coalesce(ref(\"estimator_wind[0].windspeed_east\"),\n                 ref(\"wind_estimate[0].windspeed_east\"))),\n  p=95)"],"outputs":{"tag":"wind_disturb","guard_tags":[{"when":"w_p95 >= 8.0","tag":"wind_strong"}],"stats":{"windSpeedP95M":{"var":"w_p95","round":1}},"check":"wind_estimate"},"triggers":[{"when":"w_p95 >= 12.0","severity":"warning","tag":"wind_disturb","threshold":8,"value":"f\"{w_p95:.1f}\"","unit":"m/s","field":"estimator_wind.windspeed_north/east","title":"估计风速较大（p95 {w_p95:.1f} m/s）","suggestion":"结合故障库 F010：强风属环境扰动，姿态超调/转换越限优先归因风，不要直接改 PID。"},{"when":"w_p95 >= 8.0","severity":"info","tag":"wind_disturb","threshold":8,"value":"f\"{w_p95:.1f}\"","unit":"m/s","field":"estimator_wind.windspeed_north/east","title":"估计风速偏大（p95 {w_p95:.1f} m/s）","suggestion":"解释姿态类异常时需考虑风扰因素。"}],"firmware":"any","airframe":"any","topics":[["estimator_wind","wind_estimate"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"wind","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"}];
const facts = {"group_order":["guards_early","vibration","ekf_innovations","ekf_faults","battery","cpu","gps_health","failsafe","mode_thrash","motor_balance","imu_bias","attitude_tracking","airspeed","vtol_transition","wind_estimate","logged_messages","guards"],"rule_meta":{"defaults":{"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"}},"by_group":{"airspeed":{"category":"airspeed","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"attitude_tracking":{"category":"attitude","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"battery":{"category":"power","doc":"https://docs.px4.io/main/en/config/battery.html"},"cpu":{"category":"system","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"ekf_faults":{"category":"ekf","doc":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"},"ekf_innovations":{"category":"ekf","doc":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"},"failsafe":{"category":"failsafe","doc":"https://docs.px4.io/main/en/config/safety.html"},"gps_health":{"category":"gps","doc":"https://docs.px4.io/main/en/gps_compass/"},"guards":{"category":"guard"},"guards_early":{"category":"guard"},"imu_bias":{"category":"imu","doc":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"},"logged_messages":{"category":"messages","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"mode_thrash":{"category":"mode","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"motor_balance":{"category":"motor","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"vibration":{"category":"vibration","doc":"https://docs.px4.io/main/en/assembly/vibration_isolation.html"},"vtol_transition":{"category":"vtol","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"wind_estimate":{"category":"wind","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"}}},"log_levels":{"48":"EMERGENCY","49":"ALERT","50":"CRITICAL","51":"ERROR","52":"WARNING","53":"NOTICE","54":"INFO","55":"DEBUG"},"vehicle_types":{"1":"rotary_wing","2":"fixed_wing","3":"rover","4":"airship"},"airframe_aliases":{"mc":"rotary_wing","fw":"fixed_wing"},"nav_state_names":{"0":"Manual","1":"Altitude","2":"Position","3":"Mission","4":"Hold","5":"Return","6":"Position Slow","7":"Free5","8":"Free4","10":"Acro","11":"Free3","12":"Descend","13":"Termination","14":"Offboard","15":"Stabilized","16":"Free2","17":"Takeoff","18":"Land","19":"Free1","20":"Follow","21":"Orbit","22":"VTOL Takeoff"},"nav_state_groups":[{"phase":"takeoff","codes":[17,22]},{"phase":"hover","codes":[2,4,6,14,21]},{"phase":"maneuver","codes":[0,1,10,15]},{"phase":"fw_cruise","codes":[3,8]},{"phase":"landing","codes":[18,20,5,12,13]}],"sys_info_keys":["sys_name","ver_sw","ver_sw_release","ver_vendor_sw_release","ver_hw","ver_hw_subtype","sys_os_name","sys_os_ver","sys_toolchain","sys_toolchain_ver","sys_mcu","time_start_utc","duration","git_branch"],"ulog_msg_types":[{"code":"B","name":"标志位","en":"Flag Bits","desc":"兼容性标志，只在文件开头出现"},{"code":"I","name":"信息","en":"Information","desc":"键 → 值，系统信息字典"},{"code":"M","name":"多值信息","en":"Multi Information","desc":"键 → 多组值，无时间戳（一条长消息会拆成多行续写，故条数多于键数）"},{"code":"F","name":"消息格式","en":"Format","desc":"每个订阅话题的字段定义"},{"code":"P","name":"参数","en":"Parameter","desc":"日志开头的参数值；飞行中改参数也用它"},{"code":"Q","name":"参数默认值","en":"Default Parameter","desc":"只记与当前值不同的默认值（一个参数可能写两条）"},{"code":"A","name":"订阅话题","en":"Add Logged","desc":"每个话题实例一条"},{"code":"R","name":"取消订阅","en":"Remove Logged","desc":"运行中停止记录某话题"},{"code":"D","name":"数据","en":"Data","desc":"日志主体：订阅话题的每一次采样"},{"code":"L","name":"日志消息","en":"Logging","desc":"带时间戳的日志行"},{"code":"C","name":"带标签日志消息","en":"Tagged Logging","desc":"同上，另有来源 tag"},{"code":"O","name":"丢包","en":"Dropout","desc":"记录线程来不及时丢掉的时长"},{"code":"S","name":"同步标记","en":"Sync","desc":"每约 4 KB 一个，损坏后靠它重新对齐"}],"info_key_docs":{"ver_sw":{"name":"固件提交号","desc":"固件构建时的 git 提交，用来对上游源码"},"ver_sw_branch":{"name":"固件分支","desc":"构建所在的分支 / 标签"},"ver_sw_release":{"name":"固件版本号","desc":"打包成 major<<24 | minor<<16 | patch<<8 | 类型（1=release 等）"},"ver_vendor_sw_release":{"name":"厂商版本号","desc":"厂商自定义版本；255 表示厂商未使用"},"ver_hw":{"name":"硬件型号","desc":"飞控板型号，判断引脚 / 传感器配置的入口"},"ver_hw_subtype":{"name":"硬件子型号","desc":"同型号的不同批次 / 变体"},"ver_data_format":{"name":"数据格式版本","desc":"ULog 数据格式版本，与本站解析器看到的格式对应"},"sys_name":{"name":"系统名","desc":"固定为 PX4"},"sys_os_name":{"name":"操作系统","desc":"NuttX（飞控本机）或 Linux（机载计算机）"},"sys_os_ver":{"name":"OS 提交号","desc":"操作系统的 git 提交"},"sys_os_ver_release":{"name":"OS 版本号","desc":"打包方式同固件版本号"},"sys_toolchain":{"name":"工具链","desc":"编译固件用的工具链"},"sys_toolchain_ver":{"name":"工具链版本","desc":"工具链的具体版本，排查\"换个编译器行为就不一样\"时用"},"sys_mcu":{"name":"MCU","desc":"主控芯片型号与硅版本"},"sys_uuid":{"name":"飞控唯一 ID","desc":"PX4GUID，出厂烧录；同型号不同板子也不同，可用来区分设备"},"time_ref_utc":{"name":"UTC 时间参考","desc":"相对启动的偏移（秒）；0 表示这次飞行没对时"},"time_start_utc":{"name":"起始 UTC 时间","desc":"日志起始时刻（旧固件记录）"},"boot_time_utc_us":{"name":"启动时刻","desc":"UTC 微秒；只有对过时才有意义"},"duration":{"name":"日志时长","desc":"秒（旧固件记录）"},"git_branch":{"name":"固件分支","desc":"旧固件的分支名字段"},"metadata_events_sha256":{"name":"事件元数据哈希","desc":"事件定义文件的 SHA-256，用来校验事件定义是否被改动"}},"metrics":[{"key":"imuAccelVibrationMax","label":"最大振动","unit":"m/s²","topic":"vehicle_imu_status","field":"accel_vibration_metric","op":"max","round":2},{"key":"batteryVoltageMin","label":"最低电压","unit":"V","topic":"battery_status","field":"voltage_v","op":"min","round":2},{"key":"batteryCellVoltageMin","label":"最低电芯电压","unit":"V","topic":"battery_status","fields":["voltage_cell_v","voltage_v","voltage_filtered_v","cell_count"],"op":"cell_voltage_min","pick":"vmin","round":3},{"key":"currentMax","label":"最大电流","unit":"A","topic":"battery_status","field":"current_a","op":"max","round":2},{"key":"batteryRemainingMin","label":"最低剩余电量","unit":"0..1","topic":"battery_status","field":"remaining","op":"min_ge","ge":0,"round":3},{"key":"gpsSatellitesMin","label":"最少搜星","unit":"颗","topic":"vehicle_gps_position","field":["satellites_used","satellites_visible"],"op":"min","round":0},{"key":"gpsEphMaxM","label":"最大定位误差","unit":"m","topic":"vehicle_gps_position","field":"eph","op":"max","scale":0.001,"round":2},{"key":"cpuLoadMax","label":"CPU 峰值","unit":"0..1","topic":"cpuload","field":"load","op":"max","round":3},{"key":"imuAccelClippingCountMax","label":"加速度计削波计数","unit":"次"},{"key":"imuTempRangeC","label":"IMU 温度跨度","unit":"°C"},{"key":"ekfRejectRatioPct","label":"EKF 拒绝占比","unit":"比例"},{"key":"attitudeErrDegP99","label":"姿态误差 p99","unit":"°"},{"key":"attitudeOscHz","label":"姿态振荡频率","unit":"Hz"},{"key":"motorControlSpread","label":"电机输出离散度"},{"key":"motorCountActive","label":"活跃电机数","unit":"个"},{"key":"gyroBiasMaxRadS","label":"陀螺零偏最大","unit":"rad/s"},{"key":"gyroBiasDriftRadS","label":"陀螺零偏漂移","unit":"rad/s"},{"key":"windSpeedP95M","label":"风速 p95","unit":"m/s"},{"key":"airspeedMinM","label":"最低空速","unit":"m/s"},{"key":"airspeedInvalidRatio","label":"空速无效占比","unit":"比例"},{"key":"gpsJumpCount","label":"GPS 跳变次数","unit":"次"},{"key":"navStateChanges","label":"模式切换次数","unit":"次"},{"key":"vtolTransitionSamples","label":"VTOL 转换样本数","unit":"个"},{"key":"batteryCellCount","label":"电芯数","unit":"个"}],"track":{"container":"map","title":"轨迹","legend":true,"children":[{"label":"gps","max_points":1500,"lat":{"cands":["sensor_gps[0].latitude_deg","vehicle_gps_position[0].latitude_deg","vehicle_gps_position[0].lat"],"unit":"deg"},"lon":{"cands":["sensor_gps[0].longitude_deg","vehicle_gps_position[0].longitude_deg","vehicle_gps_position[0].lon"],"unit":"deg"},"alt":{"cands":["sensor_gps[0].altitude_msl_m","vehicle_gps_position[0].altitude_msl_m","vehicle_gps_position[0].alt"],"unit":"m"},"topics":[["sensor_gps",0],["vehicle_gps_position",0]]}],"conditions":{"topics":[["sensor_gps","vehicle_gps_position"]]}}};

const fieldUnits = {"sensor_gps.altitude_msl_m":"m","sensor_gps.latitude_deg":"deg","sensor_gps.longitude_deg":"deg","vehicle_gps_position.lat":"degE7","vehicle_gps_position.latitude_deg":"deg","vehicle_gps_position.lon":"degE7","vehicle_gps_position.longitude_deg":"deg","vehicle_gps_position.alt":"mm","vehicle_gps_position.altitude_msl_m":"m"};

export const PY_ULG_CHECKS = String.raw`"""预定函数（算子）注册表 —— 经验文件里的 \`op:\` 只能引用这里注册的算子。

约定：
- 算子签名用 @operator 声明 in_arity / out_arity / out_names，
  构建期按签名校验规则文件里 in/out 的数量（多输入/多输出不靠约定，靠校验）。
  \`in_arity\` 也可以给**列表**（如 \`[1, 4]\`），表示同一种运算接受两种写法——
  目前只有 \`quat_to_euler\`（收一组四列，或收 w/x/y/z 四列）这么用。
- 调用形式 fn(*args, **opts)：args 是按 \`in\` 顺序取到的值（numpy 数组或标量），
  opts 是节点上的其他键（unit / instance 等），算子用 **kw 吸收不关心的项。
- 返回：out_arity==1 时返回标量；>1 时返回与 out_names 等长的元组。
- 数据不足时返回 None，框架据此跳过该规则（不产出 finding）。
"""

OPERATORS: dict[str, object] = {}
SIGNATURES: dict[str, dict] = {}


def operator(name: str, in_arity: int = 1, out_arity: int = 1, out_names=None, doc: str = ""):
    """把一个函数注册为经验可引用的算子。"""

    def deco(fn):
        OPERATORS[name] = fn
        SIGNATURES[name] = {
            "in_arity": in_arity,
            "out_arity": out_arity,
            "out_names": list(out_names or []),
            "doc": doc or (fn.__doc__ or "").strip().split("\n")[0],
        }
        return fn

    return deco


def _finite(values):
    """过滤非有限值（NaN/Inf），返回 np 数组。"""
    import numpy as np

    a = np.asarray(values, dtype=float)
    return a[np.isfinite(a)]


# ─────────────────────────── 标量统计 ───────────────────────────


@operator("max", doc="最大值（忽略 NaN）")
def op_max(values, **kw):
    if values is None:
        return None
    a = _finite(values)
    return float(a.max()) if a.size else None


@operator("min", doc="最小值（忽略 NaN）")
def op_min(values, **kw):
    if values is None:
        return None
    a = _finite(values)
    return float(a.min()) if a.size else None


@operator("min_ge", doc="有限且 >= ge 的最小值（排除无效值，如 remaining=-1 表示未知）")
def op_min_ge(values, ge=None, **kw):
    if values is None:
        return None
    a = _finite(values)
    if ge is not None:
        a = a[a >= float(ge)]
    return float(a.min()) if a.size else None


@operator("scale", in_arity=1, out_arity=1, doc="标量乘以系数（如比例 → 百分比）")
def op_scale(x, factor=1.0, **kw):
    return float(x) * float(factor) if x is not None else None


@operator("mean", doc="均值（忽略 NaN）")
def op_mean(values, **kw):
    if values is None:
        return None
    a = _finite(values)
    return float(a.mean()) if a.size else None


# ─────────────────────────── 空值 / 逻辑 / 算术（通用积木）───────────────────────────


@operator("is_none", doc="值是否为 None（数据缺失在数据流里显式传播，而不是断链）")
def op_is_none(x, **kw):
    return x is None


@operator("is_not_none", doc="值是否非 None")
def op_is_not_none(x, **kw):
    return x is not None


@operator("gt", in_arity=2, doc="a > b 的布尔结果（把阈值条件变成可喂给 value_if 的标记）")
def op_gt(a, b, **kw):
    if a is None or b is None:
        return None
    return float(a) > float(b)


@operator("both", in_arity=2, doc="逻辑与：两个布尔量皆真")
def op_both(a, b, **kw):
    return bool(a) and bool(b)


@operator("coalesce", in_arity=2, doc="返回第一个非 None 的值，都缺失则 None")
def op_coalesce(a, b, **kw):
    return a if a is not None else b


@operator("value_if", in_arity=2, doc="cond 为真返回 x，否则 None（条件性产出统计值）")
def op_value_if(cond, x, **kw):
    return x if cond else None


@operator("div", in_arity=2, doc="a / b；b 为 0 或任一输入缺失返回 None；require_positive 时要求两者 >0")
def op_div(a, b, require_positive=False, **kw):
    if a is None or b is None or float(b) == 0:
        return None
    if require_positive and not (float(a) > 0 and float(b) > 0):
        return None
    return float(a) / float(b)


# ─────────────────────────── 定长数组字段（任意 float32[n] 时间序列列集合）───────────────────────────


def _as_columns(matrix):
    """数组字段经 _read_field_ref 收集后是“每元素一列”的列表（各列为等长时间序列）；
    单序列输入也兼容。跳过 None 占位列。"""
    import numpy as np

    if matrix is None:
        return []
    if not isinstance(matrix, (list, tuple)):
        matrix = [matrix]
    return [np.asarray(c, dtype=float) for c in matrix if c is not None]


@operator(
    "columns_aggregate",
    doc="先对每列做 column_op 标量归约，再用 combine 跨列归约（如各电芯最小值中的最小值，gt=0 排除占位 0）",
)
def op_columns_aggregate(matrix, column_op="min", combine="min", gt=None, ge=None, **kw):
    import numpy as np

    scalars = []
    for a in _as_columns(matrix):
        a = _finite(a)
        if gt is not None:
            a = a[a > float(gt)]
        if ge is not None:
            a = a[a >= float(ge)]
        if a.size:
            scalars.append(float(getattr(np, str(column_op))(a)))
    if not scalars:
        return None
    return float(getattr(np, str(combine))(scalars))


@operator(
    "rows_aggregate",
    doc="跨列逐时刻归约成一条时间序列（如每个时刻各电芯的最低电压）；gt/ge 之外处置 NaN",
)
def op_rows_aggregate(matrix, agg="min", gt=None, ge=None, **kw):
    import numpy as np

    cols = _as_columns(matrix)
    if not cols:
        return None
    stack = np.vstack(cols)
    if gt is not None:
        stack = np.where(stack > float(gt), stack, np.nan)
    if ge is not None:
        stack = np.where(stack >= float(ge), stack, np.nan)
    return getattr(np, str(agg))(stack, axis=0)


@operator(
    "head_tail_median_drop",
    in_arity=3,
    out_arity=2,
    out_names=["drop", "tail_median"],
    doc="第一个区间内（跳过前 skip_first_s 秒）头段中位数 - 尾段中位数；任意 (序列, 时间戳, 区间) 通用",
)
def op_head_tail_median_drop(x, vts, intervals, skip_first_s=5, min_seg=20, head_frac=0.1, tail_frac=0.2, **kw):
    """intervals 为 (start_us, end_us) 列表，只取第一个；seg 长度须 > min_seg。
    返回 (落差, 尾段中位数)，数据不足返回 None。"""
    import numpy as np

    if x is None or vts is None or not intervals:
        return None
    x = np.asarray(x, dtype=float)
    vts = np.asarray(vts, dtype=np.int64)
    if len(x) != len(vts):
        return None
    start_us = int(intervals[0][0])
    lo = int(np.searchsorted(vts, start_us + int(float(skip_first_s) * 1e6)))
    seg = x[lo:]
    seg = seg[np.isfinite(seg)]
    if len(seg) <= int(min_seg):
        return None
    tail = float(np.median(seg[-max(5, int(len(seg) * float(tail_frac))) :]))
    head = float(np.median(seg[: max(5, int(len(seg) * float(head_frac)))]))
    return float(head - tail), tail


# ─────────────────────────── 多实例传感器（分组取数）───────────────────────────
# 这类算子的输入是「每个传感器实例一组数据」的列表（规则里用 ref(..., instance=-1) 取）。
# 数组字段（如 float32[3]）每组是「每元素一列」的列表。
# 全部通用：不认识任何具体 topic/字段，只做跨实例归约，取「最差实例」并回传其序号。


def _groups(groups):
    return [g for g in (groups or []) if g is not None]


def _as_group_list(x):
    """分组取数（instance=-1）→ 列表，**保留 None 占位**。

    实例序号（标题里的 “IMU #1”、estimator #2）必须与原始 dataset 顺序一致，
    所以这里不能过滤 None——过滤会让后面的实例序号整体前移。
    """
    if x is None:
        return []
    if isinstance(x, (list, tuple)):
        return list(x)
    return [x]


def _pick(lst, i):
    return lst[i] if i < len(lst) else None


@operator(
    "worst_mean_stats",
    out_arity=4,
    out_names=["mean", "p95", "vmax", "instance"],
    doc="每个实例一条标量序列：取均值最大的实例，回传其均值/p95/最大值/实例序号；"
    "均值不超过 min_mean 的实例视作无效（缺省 0，即要求确有有效样本）",
)
def op_worst_mean_stats(groups, min_mean=0.0, **kw):
    import numpy as np

    best = None
    for i, g in enumerate(_as_group_list(groups)):
        if g is None or isinstance(g, (list, tuple)):
            continue
        a = _finite(g)
        if not a.size:
            continue
        m = float(a.mean())
        if m <= float(min_mean):
            continue
        if best is None or m > best[0]:  # 严格大于：并列时保留首个实例
            best = (m, float(np.percentile(a, 95)), float(a.max()), i)
    return best  # 无有效实例时返回 None


@operator(
    "worst_rss_mean",
    in_arity=3,
    out_arity=2,
    out_names=["rss", "instance"],
    doc="每个实例三轴序列：mean(sqrt(x^2+y^2+z^2))，取 RSS 最大的实例及序号；"
    "不超过 min_mean 的实例视作无效（缺省 0，与迁移前初值 0 的严格比较大一致）",
)
def op_worst_rss_mean(gx, gy, gz, min_mean=0.0, **kw):
    import numpy as np

    xs, ys, zs = _as_group_list(gx), _as_group_list(gy), _as_group_list(gz)
    best = None
    for i in range(max(len(xs), len(ys), len(zs))):
        x, y, z = _pick(xs, i), _pick(ys, i), _pick(zs, i)
        if x is None or y is None or z is None:
            continue
        if isinstance(x, (list, tuple)) or isinstance(y, (list, tuple)) or isinstance(z, (list, tuple)):
            continue
        rss = float(np.mean(np.sqrt(np.asarray(x, float) ** 2 + np.asarray(y, float) ** 2 + np.asarray(z, float) ** 2)))
        if rss <= float(min_mean):
            continue
        if best is None or rss > best[0]:
            best = (rss, i)
    return best


@operator(
    "worst_column_delta",
    out_arity=3,
    out_names=["count", "instance", "axis"],
    doc="每个实例一组等长列（如 float32[3] 计数序列）：逐列取 max-min，回传全局最大差值及其实例/列序号",
)
def op_worst_column_delta(groups, **kw):
    import numpy as np

    best = None
    for i, g in enumerate(_as_group_list(groups)):
        if not isinstance(g, (list, tuple)):
            continue
        for axis, col in enumerate(g):
            if col is None:
                continue
            delta = int(np.max(col)) - int(np.min(col))
            if best is None or delta > best[0]:
                best = (delta, i, axis)
    return best


# ─────────────────────────── 位掩码 / 跨实例归约（通用）───────────────────────────


@operator("has_bits", in_arity=2, doc="value 是否置起了 mask 中的任意一位（mask 传 -1 表示“任意位非零”）")
def op_has_bits(value, mask, **kw):
    if value is None or mask is None:
        return None
    return bool(int(value) & int(mask))


@operator("to_int", doc="取整（位掩码/计数类字段：保证证据与文案里按整数呈现，而不是 1.0）")
def op_to_int(x, **kw):
    return None if x is None else int(x)


@operator("bit_or_max", doc="位掩码序列按实例分组：每实例取最大值后按位或（跨实例合并置位）")
def op_bit_or_max(groups, **kw):
    acc = 0
    seen = False
    for g in _groups(groups):
        if g is None or isinstance(g, (list, tuple)) or not len(g):
            continue
        seen = True
        acc |= int(max(int(v) for v in g))
    return acc if seen else None


@operator("max_of_max", doc="数值序列按实例分组：每实例取最大值，再跨实例取最大（忽略缺失实例）")
def op_max_of_max(groups, **kw):
    best = None
    for g in _groups(groups):
        if g is None or isinstance(g, (list, tuple)):
            continue
        a = _finite(g)
        if not a.size:
            continue
        m = float(a.max())
        if best is None or m > best:
            best = m
    return best


@operator(
    "worst_reject_ratio",
    in_arity=9,
    out_arity=3,
    out_names=["frac", "names", "instance"],
    doc="按实例扫描“拒绝占比”：主信号（位掩码，如创新检验标志）非空时用它（非零样本占比、"
    "按位或展开位名），否则逐一比较候选通道（有限样本中 >= ge 的占比，需 >= channel_min 个）；"
    "取全局最大占比，返回占比/命中名称/实例序号。字段名与标签全部由经验文件提供。",
)
def op_worst_reject_ratio(
    primary,
    ch0,
    ch1,
    ch2,
    ch3,
    ch4,
    ch5,
    ch6,
    ch7,
    primary_min=3,
    primary_names=None,
    ge=1.0,
    channel_min=3,
    channel_labels=None,
    fallback_label="未知通道",
    **kw,
):
    import numpy as np

    bit_names = list(primary_names or [])
    chan_labels = list(channel_labels or [])
    # 保留 None 占位：主信号整列缺失时仍要按实例序号继续扫通道（否则不产出任何候选）
    primary_groups = _as_group_list(primary)
    chan_groups = [_as_group_list(c) for c in (ch0, ch1, ch2, ch3, ch4, ch5, ch6, ch7)]
    n_inst = max([len(primary_groups)] + [len(cg) for cg in chan_groups])
    best = None
    for i in range(n_inst):
        g = _pick(primary_groups, i)
        # 主信号存在且非空：该实例只用主信号（与迁移前一致，不再回落扫通道）
        if g is not None and not isinstance(g, (list, tuple)) and len(g):
            bad = int(np.count_nonzero(g))
            if bad < int(primary_min):
                continue
            union = 0
            for v in np.asarray(g):  # 不转 float：位掩码必须按位精确
                union |= int(v)
            fired = "、".join(bit_names[b] for b in range(len(bit_names)) if union & (1 << b))
            frac = bad / float(len(g))
            if best is None or frac > best[0]:
                best = (frac, fired or fallback_label, i)
            continue
        for ci, cg in enumerate(chan_groups):
            if cg is None or i >= len(cg) or cg[i] is None:
                continue
            arr = _finite(cg[i])
            if not arr.size:
                continue
            n_bad = int(np.count_nonzero(arr >= float(ge)))
            if n_bad < int(channel_min):
                continue
            frac = n_bad / float(arr.size)
            label = chan_labels[ci] if ci < len(chan_labels) else ""
            if best is None or frac > best[0]:
                best = (frac, label or fallback_label, i)
    return best


# ─────────────────────────── 序列统计 / 边沿 / 地理（通用）───────────────────────────


@operator("percentile", doc="有限值的第 p 百分位（如 p=95）；无有效值则 None")
def op_percentile(values, p=95, **kw):
    import numpy as np

    if values is None:
        return None
    a = _finite(values)
    return float(np.percentile(a, float(p))) if a.size else None


@operator("count_above", doc="有限值中 > gt 的样本个数")
def op_count_above(values, gt=0.0, **kw):
    import numpy as np

    if values is None:
        return None
    a = _finite(values)
    return int(np.count_nonzero(a > float(gt)))


@operator("edges_count", doc="相邻样本取值发生变化（不等于）的次数：状态/模式切换计数")
def op_edges_count(values, **kw):
    import numpy as np

    if values is None:
        return None
    a = np.asarray(values)
    if a.size < 2:
        return 0
    return int(np.count_nonzero(a[1:] != a[:-1]))


@operator("is_zero", doc="是否等于 0（未置位/无效计数类字段的判据）")
def op_is_zero(x, **kw):
    return None if x is None else float(x) == 0.0


@operator("keep_gt", doc="只保留有限且 > gt 的样本（如排除 eph<=0 的无效值），返回序列")
def op_keep_gt(values, gt=0.0, **kw):
    if values is None:
        return None
    a = _finite(values)
    a = a[a > float(gt)]
    return a if a.size else None


@operator("scale_series", doc="整条序列乘系数（如 mm → m），与标量版 scale 互补")
def op_scale_series(values, factor=1.0, **kw):
    import numpy as np

    if values is None:
        return None
    return np.asarray(values, dtype=float) * float(factor)


@operator(
    "adjacent_speed_mps",
    in_arity=3,
    doc="经纬度与时间戳（us）→ 相邻样本地面速度序列（m/s）；等距柱状近似。"
    '**入参是度**（口径由规则在 ref(..., unit="deg") 上统一好）——算子不认识固件版本、'
    "也不认识 degE7 这种老口径。",
)
def op_adjacent_speed_mps(lat_in, lon_in, ts_us, **kw):
    import numpy as np

    if lat_in is None or lon_in is None or ts_us is None:
        return None
    lat = np.radians(np.asarray(lat_in, dtype=float))
    lon = np.radians(np.asarray(lon_in, dtype=float))
    if lat.size < 3 or lat.size != lon.size or lat.size != len(ts_us):
        return None
    dt = np.diff(np.asarray(ts_us, dtype=float)) / 1e6
    dlat = np.diff(lat) * 6371000.0
    dlon = np.diff(lon) * 6371000.0 * np.cos(lat[:-1])
    return np.sqrt(dlat**2 + dlon**2) / np.maximum(dt, 1e-3)


@operator("read", doc="显式取数/透传：把字段原样放进环境（供 coalesce 等后续节点使用）")
def op_read(values, **kw):
    return values


@operator("hypot", in_arity=2, doc="逐样本 sqrt(a^2 + b^2)（如由北/东风分量合成风速）")
def op_hypot(a, b, **kw):
    import numpy as np

    if a is None or b is None:
        return None
    return np.sqrt(np.asarray(a, dtype=float) ** 2 + np.asarray(b, dtype=float) ** 2)


# 四元数先**归一化**再转欧拉角：日志里的四元数可能因插值/截断略偏离单位长度，
# 不归一化会放大 atan2 误差。2026-09-17 之前这里有一个同名的第二个定义（不归一化、带
# 一个从未被调用方用过的 degrees 开关）静默覆盖了本实现，两个消费者（plot/attitude.yml
# 的图表换算与 vtol-transition 规则）实际拿到的都是那个不归一化的版本——已删除。
# 教训：OPERATORS[name] = fn 是赋值，**算子名重复注册不报错、后者静默胜出**；
# 用 ruff 的 F811 在提交前拦住（见仓库根 pyproject.toml）。
@operator(
    "quat_to_euler",
    in_arity=[1, 4],  # 两种写法都认：**一个**四列数组，或**四列**分开给
    out_arity=3,
    out_names=["roll", "pitch", "yaw"],
    doc="四元数 → 欧拉角（度，先归一化）。"
    '一个输入：四元数四列组成的数组（ref("vehicle_attitude.q") 取出来就是这个形状）；'
    "四个输入：w, x, y, z 四列",
)
def op_quat_to_euler(w, x=None, y=None, z=None, **kw):
    import numpy as np

    if x is None and y is None and z is None:
        # 一个输入 = 「每元素一列」类型的字段（q 这种）：ref 给回来的是一组列
        if not isinstance(w, (list, tuple)) or len(w) < 4:
            return None, None, None
        w, x, y, z = w[0], w[1], w[2], w[3]
    if w is None or x is None or y is None or z is None:
        return None, None, None
    w, x, y, z = (np.asarray(v, dtype=float) for v in (w, x, y, z))
    # 归一化：日志里的四元数可能因插值/截断略偏离单位长度，不归一化会放大 atan2 误差
    n = np.sqrt(w * w + x * x + y * y + z * z)
    n = np.where(n > 0, n, np.nan)
    w, x, y, z = w / n, x / n, y / n, z / n
    roll = np.degrees(np.arctan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)))
    pitch = np.degrees(np.arcsin(np.clip(2 * (w * y - z * x), -1.0, 1.0)))
    yaw = np.degrees(np.arctan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)))
    return roll, pitch, yaw


@operator("ratio_equal", doc="取值为 value 的样本占比（如无效标志 == 0 的比例）；分母为全部样本")
def op_ratio_equal(values, value=0.0, **kw):
    import numpy as np

    if values is None:
        return None
    a = np.asarray(values, dtype=float)
    if not a.size:
        return None
    return float(np.count_nonzero(a == float(value))) / max(len(a), 1)


@operator(
    "masked_any_in",
    in_arity=3,
    doc="时间轴上的“区间内取值为集合之一”判定：在 intervals（us 区间列表）内是否存在取值"
    "落在 codes 中的样本；codes 由经验文件给出，任意状态字段通用",
)
def op_masked_any_in(values, ts_us, intervals, codes=None, **kw):
    import numpy as np

    if values is None or ts_us is None or not intervals or not codes:
        return None
    vals = np.asarray(values)
    ts = np.asarray(ts_us, dtype=np.int64)
    if vals.size != ts.size:
        return None
    mask = np.zeros(ts.size, dtype=bool)
    for s, e in intervals:
        lo = int(np.searchsorted(ts, int(s)))
        hi = ts.size if e is None else int(np.searchsorted(ts, int(e)))
        mask[lo:hi] = True
    if not np.any(mask):
        return False
    return bool(np.any(np.isin(vals[mask], list(codes))))


@operator("require_true", doc="门控：条件为真返回 True，否则 None（使数据流在此中止，等效于原 if 分支）")
def op_require_true(cond, **kw):
    if cond is None:
        return None
    return True if cond else None


# ─────────────────────────── 事件（一个规则 → 多条 finding）───────────────────────────
# 返回「事件列表」（每项一个 dict）。配合规则级 \`foreach:\`：框架对每个事件按同一套
# trigger 模板发一条 finding，因此文案仍写在经验文件里，算子只负责找事件。


@operator(
    "rising_edge_events",
    in_arity=4,
    doc="上升沿事件（前一拍 != 1 且当前 == 1）且落在 intervals 内："
    "返回 [{t_s: 相对日志起点秒数}, ...]；t0_us 一般传内置变量 t0_us",
)
def op_rising_edge_events(values, ts_us, intervals, t0_us, **kw):
    import numpy as np

    if values is None or ts_us is None or not intervals:
        return None
    a = np.asarray(values)
    ts = np.asarray(ts_us, dtype=np.int64)
    if a.size != ts.size or a.size < 2:
        return None
    t0 = int(t0_us or 0)
    events = []
    for i in range(1, a.size):
        if int(a[i]) != 1 or int(a[i - 1]) == 1:
            continue
        t = int(ts[i])
        if not any(t >= int(s) and (e is None or t <= int(e)) for s, e in intervals):
            continue
        events.append({"t_s": (t - t0) / 1e6})
    return events


@operator(
    "step_into_events",
    in_arity=4,
    doc="状态切换到 codes 集合内的取值、且落在 intervals 内的事件："
    "返回 [{t_s, code, name}, ...]，codes 形如 {5: AUTO_RTL}（名称由经验文件给出）",
)
def op_step_into_events(values, ts_us, intervals, t0_us, codes=None, **kw):
    import numpy as np

    if values is None or ts_us is None or not intervals or not codes:
        return None
    a = np.asarray(values)
    ts = np.asarray(ts_us, dtype=np.int64)
    if a.size != ts.size or a.size < 2:
        return None
    t0 = int(t0_us or 0)
    wanted = {int(k): str(v) for k, v in dict(codes).items()}
    events = []
    for i in range(1, a.size):
        code = int(a[i])
        if code == int(a[i - 1]) or code not in wanted:
            continue
        t = int(ts[i])
        if not any(t >= int(s) and (e is None or t <= int(e)) for s, e in intervals):
            continue
        events.append({"t_s": (t - t0) / 1e6, "code": code, "name": wanted[code]})
    return events


# ─────────────────────────── 结构化条目列表（日志消息等）───────────────────────────


def _item_hit(it, key, eq, lte, gte, in_list):
    if not isinstance(it, dict):
        return False
    if eq is None and lte is None and gte is None and in_list is None:
        return True  # 无条件 = 全选（可当计数器用）
    v = it.get(key)
    if v is None:
        return False
    if in_list is not None:
        return v in list(in_list)
    return (eq is not None and v == eq) or (lte is not None and v <= lte) or (gte is not None and v >= gte)


@operator("count_items", doc="条目列表里满足条件的条数：按 key 字段判定，in_list / eq / lte / gte")
def op_count_items(items, key="level", eq=None, lte=None, gte=None, in_list=None, **kw):
    if not items:
        return 0
    return sum(1 for it in items if _item_hit(it, key, eq, lte, gte, in_list))


@operator("take_items", doc="条目列表里满足条件的前 limit 条（drop 可去掉辅助键；clip 可按字段截断文本）")
def op_take_items(
    items,
    key="level",
    eq=None,
    lte=None,
    gte=None,
    in_list=None,
    limit=5,
    drop=None,
    clip=None,
    **kw,
):
    out = []
    clips = {str(k): int(v) for k, v in dict(clip or {}).items()}
    for it in items or []:
        if not _item_hit(it, key, eq, lte, gte, in_list):
            continue
        item = dict(it)
        for k in drop if isinstance(drop, (list, tuple)) else [drop] if drop else []:
            item.pop(k, None)
        for k, n in clips.items():
            if isinstance(item.get(k), str):
                item[k] = item[k][:n]
        out.append(item)
        if len(out) >= int(limit):
            break
    return out


# ─────────────────────────── 姿态 / 时间轴（通用）───────────────────────────


@operator(
    "interp_to",
    in_arity=3,
    doc="把 src_ts 上的取值线性插值到 dst_ts 时间轴（如姿态指令对齐到姿态时间轴）",
)
def op_interp_to(values, src_ts, dst_ts, **kw):
    import numpy as np

    if values is None or src_ts is None or dst_ts is None:
        return None
    v = np.asarray(values, dtype=float)
    s = np.asarray(src_ts, dtype=np.int64)
    d = np.asarray(dst_ts, dtype=np.int64)
    if v.size < 2 or s.size != v.size or not d.size:
        return None
    return np.interp(d, s[: v.size], v)


@operator(
    "fill_to",
    in_arity=3,
    doc="把 src_ts 上的取值按“向前保持”映射到 dst_ts（如转换段标志采样到姿态时间轴）",
)
def op_fill_to(values, src_ts, dst_ts, **kw):
    import numpy as np

    if values is None or src_ts is None or dst_ts is None:
        return None
    v = np.asarray(values)
    s = np.asarray(src_ts, dtype=np.int64)
    d = np.asarray(dst_ts, dtype=np.int64)
    if not v.size or s.size != v.size or not d.size:
        return None
    idx = np.clip(np.searchsorted(s, d, side="right") - 1, 0, v.size - 1)
    return v[idx]


@operator("abs_values", doc="逐样本绝对值")
def op_abs_values(values, **kw):
    import numpy as np

    if values is None:
        return None
    return np.abs(np.asarray(values, dtype=float))


@operator("larger", in_arity=2, doc="逐样本取较大者（如 max(|roll|, |pitch|)）")
def op_larger(a, b, **kw):
    import numpy as np

    if a is None or b is None:
        return None
    return np.maximum(np.asarray(a, dtype=float), np.asarray(b, dtype=float))


@operator("masked_absmax", in_arity=2, doc="掩码为真的样本里 |值| 的最大值；无样本则 None")
def op_masked_absmax(values, mask, **kw):
    import numpy as np

    if values is None or mask is None:
        return None
    v = np.asarray(values, dtype=float)
    m = np.asarray(mask, dtype=bool)
    n = min(v.size, m.size)
    sel = np.abs(v[:n])[m[:n]]
    sel = sel[np.isfinite(sel)]
    return float(sel.max()) if sel.size else None


@operator("count_true", doc="布尔掩码里为真的样本数")
def op_count_true(mask, **kw):
    import numpy as np

    if mask is None:
        return None
    return int(np.count_nonzero(np.asarray(mask, dtype=bool)))


# ─────────────────────────── 掩码 / 多通道（通用）───────────────────────────


@operator("interval_mask", in_arity=2, doc="时间戳落在 intervals 内的布尔掩码（armed 段等）")
def op_interval_mask(ts_us, intervals, **kw):
    import numpy as np

    if ts_us is None or not intervals:
        return None
    ts = np.asarray(ts_us, dtype=np.int64)
    mask = np.zeros(ts.size, dtype=bool)
    for s, e in intervals:
        lo = int(np.searchsorted(ts, int(s)))
        hi = ts.size if e is None else int(np.searchsorted(ts, int(e)))
        mask[lo:hi] = True
    return mask


@operator("values_in", in_arity=2, doc="逐样本判定取值是否落在 codes 集合内，返回布尔掩码")
def op_values_in(values, codes, **kw):
    import numpy as np

    if values is None or not codes:
        return None
    return np.isin(np.asarray(values), list(codes))


@operator("mask_and", in_arity=2, doc="两个布尔掩码逐样本取与")
def op_mask_and(a, b, **kw):
    import numpy as np

    if a is None or b is None:
        return None
    x, y = np.asarray(a, dtype=bool), np.asarray(b, dtype=bool)
    n = min(x.size, y.size)
    return x[:n] & y[:n]


@operator("choose", in_arity=3, doc="cond 为真取 a，否则取 b（数据流里的分支合并）")
def op_choose(cond, a, b, **kw):
    return a if cond else b


@operator("count_columns", doc="数组字段的有效列数（跳过 None/空占位列）")
def op_count_columns(matrix, **kw):
    return len(_as_columns(matrix))


@operator(
    "active_column_means",
    in_arity=2,
    doc="掩码内逐通道均值，只保留均值 > min_mean 的通道（未接/未用通道均值≈0，排除）；"
    "返回 [{index, mean}, ...]；列长与掩码不一致时退化为前 N 个样本",
)
def op_active_column_means(matrix, mask, min_mean=0.01, **kw):
    import numpy as np

    if matrix is None or mask is None:
        return None
    m = np.asarray(mask, dtype=bool)
    n_on = int(np.count_nonzero(m))
    out = []
    for i, col in enumerate(matrix if isinstance(matrix, (list, tuple)) else [matrix]):
        if col is None:
            continue
        v = np.asarray(col, dtype=float)
        if v.size == m.size:
            v = v[m]
        else:
            v = v[:n_on]  # 与原实现一致：长度不匹配时取前 N 个
        v = v[np.isfinite(v)]
        if v.size and float(np.mean(v)) > float(min_mean):
            out.append({"index": i, "mean": float(np.mean(v))})
    return out


@operator(
    "items_spread",
    out_arity=3,
    out_names=["spread", "max_index", "min_index"],
    doc="条目列表按 value_key 求极差，并回传取最大/最小者（并列取先出现者）的 index_key",
)
def op_items_spread(items, value_key="mean", index_key="index", **kw):
    if not items:
        return None
    best = worst = items[0]
    for it in items[1:]:
        if it[value_key] > best[value_key]:
            best = it
        if it[value_key] < worst[value_key]:
            worst = it
    return (float(best[value_key] - worst[value_key]), best.get(index_key), worst.get(index_key))


# ─────────────────────────── 多轴传感器（通用）───────────────────────────


@operator("apply_mask", in_arity=2, doc="按布尔掩码筛选序列（如只保留 armed 段样本），返回新序列")
def op_apply_mask(values, mask, **kw):
    import numpy as np

    if values is None or mask is None:
        return None
    v = np.asarray(values, dtype=float)
    m = np.asarray(mask, dtype=bool)
    if v.size != m.size:
        return None
    return v[m]


@operator("range_of", doc="有限样本的极差 max-min（样本 < 2 个时 None）")
def op_range_of(values, **kw):
    if values is None:
        return None
    a = _finite(values)
    return float(a.max() - a.min()) if a.size > 1 else None


@operator(
    "worst_named",
    in_arity=3,
    out_arity=2,
    out_names=["value", "name"],
    doc="三路序列各做一次归约（reduce: absmax | range | max | min | mean），"
    "回传归约值最大的一路及名称（labels 由经验文件给出）；"
    "样本数 < min_count 或归约值不超过 min_value 的路不参与（严格大于）",
)
def op_worst_named(a, b, c, reduce="absmax", labels=None, min_value=0.0, min_count=10, **kw):
    import numpy as np

    names = list(labels or [])
    best = None
    for i, s in enumerate((a, b, c)):
        if s is None:
            continue
        arr = _finite(s)
        if arr.size < int(min_count):
            continue
        if reduce == "absmax":
            val = float(np.max(np.abs(arr)))
        elif reduce == "range":
            val = float(arr.max() - arr.min())
        else:
            val = float(getattr(np, reduce)(arr))
        if val <= float(min_value):
            continue
        if best is None or val > best[0]:
            best = (val, names[i] if i < len(names) else str(i))
    return best


@operator(
    "label_if",
    doc="cond 为真取 label_true，否则取 label_false（文案以节点选项给出；缺省 None，便于 coalesce 串联）。"
    "注意参数名不用 yes/no：YAML 1.1 会把裸 yes/no 解析成布尔，PyYAML 与浏览器侧 yaml 库行为不一致。",
)
def op_label_if(cond, label_true=None, label_false=None, **kw):
    return label_true if cond else label_false


# ─────────────────────────── 逐样本数组运算（通用）───────────────────────────


@operator("either", in_arity=2, doc="逻辑或（None 视作假）")
def op_either(a, b, **kw):
    return bool(a) or bool(b)


@operator("abs_diff", in_arity=2, doc="逐样本 |a - b|（长度取较短者）")
def op_abs_diff(a, b, **kw):
    import numpy as np

    if a is None or b is None:
        return None
    x, y = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    n = min(x.size, y.size)
    return np.abs(x[:n] - y[:n])


@operator("sum_abs", in_arity=2, doc="逐样本 |a| + |b|")
def op_sum_abs(a, b, **kw):
    import numpy as np

    if a is None or b is None:
        return None
    x, y = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    n = min(x.size, y.size)
    return np.abs(x[:n]) + np.abs(y[:n])


@operator("greater", in_arity=2, doc="逐样本 a > b，返回布尔掩码")
def op_greater(a, b, **kw):
    import numpy as np

    if a is None or b is None:
        return None
    x = np.asarray(a, dtype=float)
    if np.isscalar(b):
        return x > float(b)
    y = np.asarray(b, dtype=float)
    n = min(x.size, y.size)
    return x[:n] > y[:n]


@operator("degrees", doc="弧度序列 → 角度序列")
def op_degrees(values, **kw):
    import numpy as np

    if values is None:
        return None
    return np.degrees(np.asarray(values, dtype=float))


@operator("head", in_arity=2, doc="取序列前 count 个样本（用于按最短长度对齐多条时间序列）")
def op_head(values, count, **kw):
    import numpy as np

    if values is None or count is None:
        return None
    a = np.asarray(values)
    return a[: max(int(count), 0)]


@operator("length_of", doc="序列长度（标量）")
def op_length_of(values, **kw):
    if values is None:
        return None
    try:
        return int(len(values))
    except TypeError:
        return None


@operator("smaller", in_arity=2, doc="两值取较小者")
def op_smaller(a, b, **kw):
    if a is None or b is None:
        return None
    return float(a) if float(a) <= float(b) else float(b)


@operator(
    "zero_cross_hz",
    doc="相对中位数符号翻转频率（Hz）：翻转次数 / 2 / (样本数 / sample_rate)；样本 < 3 时 None。用于判定“误差高频振荡”",
)
def op_zero_cross_hz(values, sample_rate=50.0, **kw):
    import numpy as np

    if values is None:
        return None
    a = _finite(values)
    if a.size < 3:
        return None
    sign = np.sign(a - np.median(a))
    sign = sign[sign != 0]
    if sign.size < 2:
        return 0.0
    flips = int(np.count_nonzero(np.diff(sign) != 0))
    dur = float(a.size) / float(sample_rate)
    return flips / 2.0 / max(dur, 1e-3)


# ─────────────────────────── 复合算子：整段分析（多入多出）───────────────────────────
# 说明：多个小节点串起来的链条读起来太长（姿态那条曾是 30 个节点）。这类「取数 → 对齐 →
# 掩码 → 统计」的固定套路可以收成一个算子：输入仍是 YAML 里写明的字段引用（算子不认识
# 具体 topic/字段），参数（阈值/最少样本/采样率）也来自 YAML。


@operator(
    "att_tracking_stats",
    in_arity=7,
    out_arity=3,
    out_names=["p99", "osc_hz", "seg_n"],
    doc="姿态跟踪统计：把姿态与姿态指令在时间轴上对齐（取较短长度、指令线性插值到姿态时间轴），"
    "只在 armed 且非悬停（指令倾角 > tilt_min_deg）样本上算跟踪误差，输出 p99（度）、"
    "误差过零频率（Hz）、参与统计的样本数。指令源**有 q_d 就用 q_d**（新版只记它），"
    "没有才回退 roll/pitch_body（旧版口径，弧度）——**算子不认识固件版本**，规则把两路都"
    "递给它、顺序在这里定。核心数据缺失返回 None。",
)
def op_att_tracking_stats(
    att_q,
    sp_q,
    sp_roll,
    sp_pitch,
    att_ts,
    sp_ts,
    intervals,
    tilt_min_deg=10.0,
    min_samples=50,
    sample_rate=50.0,
    **kw,
):
    import numpy as np

    q = _as_columns(att_q)
    if att_ts is None or len(q) < 4 or sp_ts is None or not intervals:
        return None
    ts = np.asarray(att_ts, dtype=np.int64)
    sp_ts = np.asarray(sp_ts, dtype=np.int64)

    w, x, y, z = (np.asarray(c, dtype=float) for c in q[:4])
    n_q = min(len(w), len(x), len(y), len(z))
    w, x, y, z = w[:n_q], x[:n_q], y[:n_q], z[:n_q]
    roll = np.arctan2(2 * (w * x + y * z), 1 - 2 * (x**2 + y**2))  # 弧度
    pitch = np.arcsin(np.clip(2 * (w * y - z * x), -1, 1))

    # 指令源：**有 q_d 就用 q_d**（新版只记它），没有才用 roll/pitch_body（旧版口径，弧度）。
    # 两路都给了也优先 q_d——顺序写在算子里，规则只管把存在的递进来。
    qd = _as_columns(sp_q)
    has_qd = len(qd) >= 4
    use_q = has_qd
    if use_q:
        d0, d1, d2, d3 = (np.asarray(c, dtype=float) for c in qd[:4])
        ns = min(len(d0), len(d1), len(d2), len(d3))
        d0, d1, d2, d3 = d0[:ns], d1[:ns], d2[:ns], d3[:ns]
        r_sp_raw = np.arctan2(2 * (d0 * d1 + d2 * d3), 1 - 2 * (d1**2 + d2**2))
        p_sp_raw = np.arcsin(np.clip(2 * (d0 * d2 - d3 * d1), -1, 1))
    else:
        if sp_roll is None:
            return None
        r_sp_raw = np.asarray(sp_roll, dtype=float)
        p_sp_raw = np.asarray(sp_pitch, dtype=float) if sp_pitch is not None else np.zeros(len(r_sp_raw))

    n = min(n_q, len(r_sp_raw), len(p_sp_raw))
    if n < 1:
        return None
    ts_n = ts[:n]
    r_sp = np.interp(ts_n, sp_ts[: len(r_sp_raw)], r_sp_raw)
    p_sp = np.interp(ts_n, sp_ts[: len(p_sp_raw)], p_sp_raw)
    err = np.degrees(np.maximum(np.abs(roll[:n] - r_sp), np.abs(pitch[:n] - p_sp)))

    amask = np.zeros(n, dtype=bool)
    for s, e in intervals:
        lo = int(np.searchsorted(ts_n, int(s)))
        hi = n if e is None else int(np.searchsorted(ts_n, int(e)))
        amask[lo:hi] = True
    active = amask & (np.degrees(np.abs(r_sp)) + np.degrees(np.abs(p_sp)) > float(tilt_min_deg))
    seg = err[active] if int(np.count_nonzero(active)) > int(min_samples) else err[amask]
    if seg.size <= int(min_samples):
        return (None, None, int(seg.size))  # 样本不足：不出结论，但把样本数带出去

    p99 = float(np.percentile(seg, 99))
    sign = np.sign(seg - np.median(seg))
    sign = sign[sign != 0]
    flips = int(np.count_nonzero(np.diff(sign) != 0)) if sign.size >= 2 else 0
    osc = flips / 2.0 / max(float(seg.size) / float(sample_rate), 1e-3)
    return (p99, float(osc), int(seg.size))


@operator(
    "gyro_bias_series",
    in_arity=6,
    out_arity=5,
    out_names=["bx", "by", "bz", "bts", "src_text"],
    doc="零偏取源：**谁有数据用谁**（直读列 → 状态槽 A → 状态槽 B），输入都是「数组字段的多列」"
    "或 None。**算子不认识固件版本**——挑来源只看数据本身：样本数 >= min_count、且至少一处非零"
    "（字段存在但没被填过的情形：实测 1.11 的直读列只有 7 个样本，状态槽才有值）。"
    "返回 三轴序列 + 时间戳 + 数据来源说明（用于 evidence.field）；全都没有返回 None。"
    "来源说明是**展示文案**，由调用方用 sources=[直读, 槽A, 槽B] 给出——算子不认识字段名。",
)
def op_gyro_bias_series(
    new_cols,
    new_ts,
    states_a_cols,
    states_a_ts,
    states_b_cols,
    states_b_ts,
    slot=10,
    min_count=10,
    sources=None,
    **kw,
):
    import numpy as np

    nb = _as_columns(new_cols)
    la = _as_columns(states_a_cols)
    lb = _as_columns(states_b_cols)
    s = int(slot)
    need = int(min_count)
    # 三个来源的展示名（经验文件给；没给就用中性说法，反正算子不认识具体字段）
    names = list(sources or []) + ["零偏直读列", "状态槽（优先）", "状态槽（兜底）"]

    def pick3(cols):
        return [cols[s], cols[s + 1], cols[s + 2]] if len(cols) >= s + 3 else None

    def usable3(cols):
        """够样本、且至少一处非零才算"有数据"。

        "字段存在但没被填过"有两种表现，都要挡住：整段全零（真正的 0 不可能三轴同时
        恒为 0），以及只有零星几个样本（实测 1.11 的直读列 7 个 vs 状态槽 636 个）——
        这种放过去，下游 \`gyro_bias_worst\` 会因样本不足判成"没有零偏数据"，
        指标就凭空消失了。
        """
        if cols is None:
            return None
        for c in cols:
            a = np.asarray(c, dtype=float)
            if a.size < need:
                return None
            if bool(np.any(np.isfinite(a) & (np.abs(a) > 0))):
                return cols
        return None

    if new_ts is not None and len(nb) >= 3 and usable3(nb[:3]) is not None:
        return (nb[0], nb[1], nb[2], new_ts, names[0])
    leg_a = usable3(pick3(la))
    leg_b = usable3(pick3(lb))
    if leg_a is not None and states_a_ts is not None:
        return (leg_a[0], leg_a[1], leg_a[2], states_a_ts, names[1])
    if leg_b is not None and states_b_ts is not None:
        return (leg_b[0], leg_b[1], leg_b[2], states_b_ts, names[2])
    return None


@operator(
    "gyro_bias_worst",
    in_arity=5,
    out_arity=4,
    out_names=["abs_max", "abs_axis", "drift", "drift_axis"],
    doc="三轴零偏在 armed 区间内逐轴取 |最大值| 与极差（漂移），回传各自最差的轴名。"
    "样本 < min_count 的轴不参与；|零偏| 严格 > 0 才算有效；轴名由经验文件给出。",
)
def op_gyro_bias_worst(bx, by, bz, bts, intervals, labels=None, min_count=10, **kw):
    import numpy as np

    names = list(labels or ["X", "Y", "Z"])
    if bts is None or not intervals:
        return None
    ts = np.asarray(bts, dtype=np.int64)
    mask = np.zeros(ts.size, dtype=bool)
    for s, e in intervals:
        lo = int(np.searchsorted(ts, int(s)))
        hi = ts.size if e is None else int(np.searchsorted(ts, int(e)))
        mask[lo:hi] = True

    worst_abs, worst_axis, worst_drift, drift_axis = 0.0, None, 0.0, None
    for i, series in enumerate((bx, by, bz)):
        if series is None:
            continue
        v = np.asarray(series, dtype=float)
        if v.size == ts.size:
            v = v[mask]
        v = v[np.isfinite(v)]
        if v.size < int(min_count):
            continue
        a_max = float(np.max(np.abs(v)))
        rng = float(v.max() - v.min())
        if a_max > worst_abs:
            worst_abs, worst_axis = a_max, names[i] if i < len(names) else str(i)
        if rng > worst_drift:
            worst_drift, drift_axis = rng, names[i] if i < len(names) else str(i)
    return (worst_abs if worst_axis else None, worst_axis, worst_drift, drift_axis)


@operator(
    "max_temp_range",
    in_arity=2,
    doc="两个温度来源各自取极差（样本 < 2 的来源忽略），返回较大者；都不可用则 None",
)
def op_max_temp_range(t_a, t_b, **kw):
    best = None
    for t in (t_a, t_b):
        if t is None:
            continue
        a = _finite(t)
        if a.size > 1:
            rng = float(a.max() - a.min())
            best = rng if best is None else max(best, rng)
    return best


@operator(
    "active_window_mask",
    in_arity=4,
    doc="活动窗口掩码：armed 区间 ∩ 状态取值落在 codes 内的样本；若交集样本 <= min_active，"
    "退回整个 armed 区间（原实现“悬停样本太少就退用 armed 段”）。任意状态字段通用。",
)
def op_active_window_mask(ts_us, intervals, values, values_ts, codes=None, min_active=20, **kw):
    import numpy as np

    if ts_us is None or not intervals:
        return None
    ts = np.asarray(ts_us, dtype=np.int64)
    mask = np.zeros(ts.size, dtype=bool)
    for s, e in intervals:
        lo = int(np.searchsorted(ts, int(s)))
        hi = ts.size if e is None else int(np.searchsorted(ts, int(e)))
        mask[lo:hi] = True
    if values is None or values_ts is None or not codes:
        return mask
    vs = np.asarray(values)
    vts = np.asarray(values_ts, dtype=np.int64)
    if not vs.size or not vts.size:
        return mask
    idx = np.clip(np.searchsorted(vts, ts), 0, vs.size - 1)
    narrow = mask & np.isin(vs[idx], list(codes))
    return narrow if int(np.count_nonzero(narrow)) > int(min_active) else mask


@operator(
    "column_spread_stats",
    in_arity=2,
    out_arity=4,
    out_names=["spread", "busiest", "idlest", "n_active"],
    doc="多通道均值极差：掩码内逐通道求均值，只保留均值 > min_mean 的通道（排除未接/未用），"
    "活跃通道数不足 min_channels 时返回 None；回传 极差 / 最大通道号 / 最小通道号 / 活跃数。",
)
def op_column_spread_stats(matrix, mask, min_mean=0.01, min_channels=4, **kw):
    means = op_active_column_means(matrix, mask, min_mean=min_mean)
    if means is None or len(means) < int(min_channels):
        return None
    best = worst = means[0]
    for it in means[1:]:
        if it["mean"] > best["mean"]:
            best = it
        if it["mean"] < worst["mean"]:
            worst = it
    return (float(best["mean"] - worst["mean"]), best["index"], worst["index"], len(means))


@operator(
    "cell_voltage_min",
    in_arity=4,
    out_arity=6,
    out_names=["vmin", "cell_min", "cells", "have_measured", "have_fallback", "no_cell"],
    doc="单电芯最低电压：优先 voltage_cell_v[] 实测（各列 > 0 的最小值中的最小值），"
    "缺失时回退 总压最小值 / 电芯数（两者都 > 0 才成立）；两者都没有但有总压 → no_cell 为真。"
    "cells 只在回退路径给出（与迁移前一致）。",
)
def op_cell_voltage_min(cell_cols, volt_v, volt_filtered, cell_count, **kw):
    import numpy as np

    volt = volt_v if volt_v is not None else volt_filtered
    vmin = None
    if volt is not None:
        a = _finite(volt)
        vmin = float(a.min()) if a.size else None

    measured = None
    for col in _as_columns(cell_cols):
        pos = col[col > 0]
        if pos.size:
            m = float(pos.min())
            measured = m if measured is None else min(measured, m)

    cells = None
    fallback = None
    if measured is None and cell_count is not None and len(cell_count):
        c = int(np.max(np.asarray(cell_count)))
        if c > 0 and vmin is not None and vmin > 0:
            fallback = vmin / c
            cells = c

    have_measured = measured is not None
    have_fallback = fallback is not None
    cell_min = measured if have_measured else fallback
    no_cell = not have_measured and not have_fallback and vmin is not None
    return (vmin, cell_min, cells, have_measured, have_fallback, no_cell)

# 日志适配器（provider）契约 —— 引擎唯一认识的"日志"长相
#
# 为什么是这份常量表，而不是 typing.Protocol：
#   · 构建期**不执行** Python（web/scripts/build-knowledge.mjs 只把源码当文本搬运），
#     Pyodide 里也没有 mypy —— 两端都没有类型检查器，写 Protocol 只是"看着有约束、实际没人管"。
#   · 所以契约做成**可执行的**：这份表既是文档，也是三道机器检查的输入。
#
# 三道检查（分工是"构建期挡住漏写、运行期挡住类型与缺席、测试挡住语义"）：
#   1. 构建期：web/scripts/build-knowledge.mjs 用 ast 解析 providers/*.py，
#      查 REQUIRED 的方法有没有定义、builtin_variables() 返回的字典字面量键齐不齐
#   2. 运行期：下面的 check_provider()，引擎建好 provider 之后立刻跑一次
#   3. 契约测试：tools/calibrate/guard-px4log-provider.py，对每个 provider 跑同一套断言
#      （失败语义、get_topic_meta() 与 get_series() 自洽、armed_intervals 的形状……）
#
# 加一个适配器（如 ardupilot.py）要做的事：实现 REQUIRED，按需实现 OPTIONAL，
# 把工厂追加进 FORMATS，然后跑通 guard-px4log-provider.py —— 引擎一行都不用改。

# ---------------- 必需能力：规则与曲线会直接依赖 ----------------
REQUIRED = {
    "log_type": {
        "kind": "attr",
        "doc": "格式标识（如 px4-ulog），进报告与错误信息",
    },
    "parser_version": {
        "kind": "method",
        "sig": "() -> str",
        "doc": "解析这一份日志用的解析器版本串（如 pyulog/1.1.0），进报告头的 parserVersion。"
        "**为什么由 provider 给而不是引擎写死**：引擎不认识任何一种日志的解析器，"
        "写死就等于把某个格式的名字钉进了格式无关层。"
        "浏览器里解析器版本不受本站控制（PyPI 当时的最新版），所以它必须如实记录",
    },
    "get_topic_meta": {
        "kind": "method",
        "sig": "() -> list[dict]",
        "doc": "有哪些消息/话题：[{name, instance, n, fields:[{name, dtype}]}]。"
        "驱动 np_manifest（曲线可用性）与契约测试的自洽校验",
    },
    "get_topic_data": {
        "kind": "method",
        "sig": "(topic, instance=0) -> dict|None",
        "doc": "某个 topic 某实例的**原样列** {列名: 数组}（含 'field[0]' 这种数组列）。"
        "报告页抽时序、概览指标兜底取数用它。取不到返回 None",
    },
    "get_first_existing_column": {
        "kind": "method",
        "sig": "(topic, names) -> array|None",
        "doc": "只取第一个实例、按候选名取第一个存在的原样列（概览指标兜底取数）—— 取不到返回 None",
    },
    "get_series": {
        "kind": "method",
        "sig": "(ref, instance=slice(None), alias=None)",
        "doc": "按 'topic.field' 取一条序列（1-D 数组 / 每实例一组 / 定长数组按列）。"
        "**取不到一律返回 None，不抛异常**——引擎按'数据不足'处理",
    },
    "has_topic": {
        "kind": "method",
        "sig": "(name) -> bool",
        "doc": "有没有这个消息/话题。表达式里的 has_topic('x') 直接指向它",
    },
    "match_version": {
        "kind": "method",
        "sig": "(spec) -> bool",
        "doc": "固件约束串是否满足（规则级 conditions.firmware 用）。约束串的语法由格式自己定，引擎不解释",
    },
    "get_logged_information": {
        "kind": "method",
        "sig": "() -> dict",
        "doc": "日志自带的键值信息（PX4 是 Information Message）。没有就返回 {}",
    },
    "get_initial_parameters": {
        "kind": "method",
        "sig": "() -> dict",
        "doc": "初始参数表。没有就返回 {}",
    },
    "get_logged_messages": {
        "kind": "method",
        "sig": "() -> list[dict]",
        "doc": "[{tSec, message, level, level_name}]：日志消息条目（tSec 是相对日志起点的秒数）",
    },
    "builtin_variables": {
        "kind": "method",
        "sig": "() -> dict",
        "doc": "内置变量表，**每次调用返回一个新 dict**（引擎会往里写 compute 的输出）。键必须覆盖下面的 BUILTIN_VARIABLES",
    },
    "get_report_facts": {
        "kind": "method",
        "sig": "() -> dict",
        "doc": "报告头的离散事实：机型 / 固件 / 时长 / 模式 / 载具身份……键名见各 provider",
    },
}

# ---------------- 可选能力：缺席时报告页对应 tab 自动隐藏 ----------------
# 不同格式能给的东西本来就不一样（PX4 的 ULog 有事件解码与逐字节消息统计，
# ArduPilot 的 .bin 是另一套消息流），所以可选能力由格式自己决定。
OPTIONAL = {
    "get_flight_phases": {
        "sig": "() -> list[dict]",
        "doc": "连续飞行阶段（报告页阶段条）。缺席则该条不显示",
    },
    "get_logged_dropouts": {"sig": "() -> list[dict]", "doc": "[{tSec, durationMs}] 丢包记录"},
    "get_message_type_counts": {
        "sig": "() -> dict | None",
        "doc": "逐字节的消息类型统计（**只对能按帧走的格式有意义**）+ 走到文件末尾没有",
    },
    "get_decoded_events": {
        "sig": "() -> list[dict] | None",
        "doc": "事件解码（PX4 靠日志自带的 metadata_events）。None = 这份日志解不出",
    },
    "report_materials": {
        "sig": "() -> dict",
        "doc": "报告页要的几块原料的打包——**不是某一个 tab 的 payload**："
        "infoDict/msgTypeStats 给「系统消息」、messages/messagesMulti 给「事件消息」、"
        "params/defaultParams/changedParams 给「飞控参数」、phases 给阶段条，"
        "四个 tab 各取所需。边界是「该格式能提供哪些原料」，"
        "而原料的形态是格式专有的（合并事件与文本、多值信息怎么拼……），"
        "换格式就是另一套，所以由格式提供而不是数据层拼",
    },
    "get_flight_track": {
        "sig": "(...) -> dict | None",
        "doc": "地图轨迹（取数字段候选与量纲也是格式专有）",
    },
}

# ---------------- builtin_variables() 必须给的键（= 规则与 plot 能引用的内置变量）----------------
# 这份表就是"作者能引用什么"的权威清单，站内指南的内置变量表由 build-knowledge.mjs
# 从这里生成。加名字 = 改契约；删名字 = 破坏兼容（老规则会构建失败，这是有意的）。
# **名字一律大写**：规则里自己赋的变量是小写，一眼就能分出"这个数是引擎给的还是自己算的"。
BUILTIN_VARIABLES = {
    "FW_MINOR": {
        "type": "int|None",
        "doc": "固件次版本号。**版本分支唯一常用的量**；None = 这份日志没写版本号",
    },
    "AIRFRAME": {
        "type": "str",
        "doc": "机型：rotary_wing / fixed_wing / rover / airship / unknown",
    },
    "IS_FIXED_WING": {"type": "bool", "doc": "机型别名（比 AIRFRAME == 'fixed_wing' 好读）"},
    "DURATION_S": {"type": "float", "doc": "日志总时长（秒）"},
    "ARMED_S": {"type": "float", "doc": "armed 总时长（秒）"},
    "ARMED_INTERVALS": {
        "type": "list[(us,us)]",
        "doc": "armed 区间，升序不重叠；end=None 表示持续到日志结束。时序算子按它切窗",
    },
    "T0_US": {"type": "int", "doc": "日志起点时间戳（us），事件类算子算相对时刻的基准"},
    "HAS_ARMED": {"type": "bool", "doc": "是否存在 armed 段"},
    "RESTART_DETECTED": {"type": "bool", "doc": "是否有 topic 时间戳回退（疑似中途重启）"},
    "DROPOUT_MS": {"type": "int", "doc": "全日志丢包累计（毫秒）"},
    "MESSAGES": {"type": "list[dict]", "doc": "日志消息条目（供消息类经验按级别筛选）"},
}

# 框架自己往 env 里补的名字（**不属于** provider）：
#   has_topic() —— 表达式里唯一放行的函数调用，指向 provider.has_topic


# ---------------- 格式注册表 ----------------
# 各 providers/<格式>.py 在文件末尾把 (探测器, 工厂, 说明) 追加进来。探测靠文件头 magic，
# 不靠扩展名（用户上传的文件名不可信）。
#   探测器  detect(raw) -> bool
#   工厂    make(raw, facts_cfg) -> provider（facts_cfg 是那一份数据 YAML，由引擎传进来；
#           之所以显式传而不是读全局，是为了让"这个 provider 用哪份数据"一目了然）
FORMATS = []

_VALUE_TYPES = {
    "int": (int,),
    "float": (int, float),
    "bool": (bool,),
    "str": (str,),
    "list": (list, tuple),
    "dict": (dict,),
}


def open_log(raw, facts_cfg=None):
    """按文件头挑一个适配器打开日志，并立刻做一次契约自检；挑不出来就报人话错误。"""
    for detect, make, label in FORMATS:
        if detect(raw):
            return check_provider(make(raw, facts_cfg), label)
    known = "、".join(label for _, _, label in FORMATS) or "（无）"
    raise ValueError("不认识的日志格式：本站目前只支持 %s。扩展名不作数，判据是文件头 magic" % known)


def _type_matches_spec(value, spec):
    want = spec.get("type")
    if want is None:
        return True
    if value is None:
        return "None" in want  # 只有写明允许 None 的才接受 None
    for part in want.replace("|None", "").split("|"):
        part = part.strip()
        base = part.split("[")[0]
        if isinstance(value, _VALUE_TYPES.get(base, ())):
            return True
    return False


def check_provider(provider, where="provider"):
    """运行期自检：契约里要求的东西，这个 provider 真的给了吗、类型对吗。

    为什么还要这一道（构建期不是已经查过 AST 了吗）：AST 只看"有没有定义"，
    看不了"跑起来给的是什么"——比如 builtin_variables() 少返回一个键、FW_MINOR 给了字符串。
    这类问题如果放过，表现是**静默失效**（规则算不出数据 → 不发射 finding），很难查。
    """
    for name, spec in REQUIRED.items():
        if not hasattr(provider, name):
            raise ValueError("%s 缺少契约要求的能力：%s（%s）" % (where, name, spec["doc"]))

    sem = provider.builtin_variables()
    if not isinstance(sem, dict):
        raise ValueError("%s.semantics() 必须返回 dict" % where)
    for key, spec in BUILTIN_VARIABLES.items():
        if key not in sem:
            raise ValueError("%s.semantics() 缺少内置变量 %s（%s）—— 规则里引用它会静默算不出数据" % (where, key, spec["doc"]))
        if not _type_matches_spec(sem[key], spec):
            raise ValueError("%s.semantics()[%s] 类型不对：期望 %s，得到 %r" % (where, key, spec["type"], sem[key]))
    # 每个 provider 都要能独立喂给多个规则：返回的必须是新 dict（引擎会往里写 compute 输出）
    sem2 = provider.builtin_variables()
    if sem2 is sem:
        raise ValueError("%s.semantics() 每次都必须返回新的 dict（引擎会往里写变量）" % where)

    if not isinstance(provider.get_report_facts(), dict):
        raise ValueError("%s.facts() 必须返回 dict" % where)
    if not isinstance(provider.get_topic_meta(), list):
        raise ValueError("%s.messages() 必须返回 list" % where)
    if not isinstance(provider.parser_version(), str):
        raise ValueError("%s.parser_version() 必须返回 str" % where)
    return provider

# PX4 .ulg（ULog）适配器 —— **本项目唯一认识 PX4 的地方**
#
# 契约见 providers/api.py。引擎（rule_engine.py / operators.py / report_data.py）不认识
# topic 名、字段名、info 键名、码值，只认这份契约给的东西；要加一种日志格式（ArduPilot .bin）
# 就是再加一个这样的文件，引擎一行不改。
#
# 分工（别混）：
#   · 本文件：怎么从 PX4 日志里把数据取出来——字段名、位解码、版本候选、异常回退、载具身份……
#   · knowledge/px4/facts.yaml：随上游变的**纯数据**（码表、文案、展示口径、规则元数据）
#   · engine/*.py：与格式无关的机制
#
# 注意本文件是**文本拼接**进产物里的（没有 import 机制）：直接用 api.py 的
# FORMATS / check_provider，以及 rule_engine.py 注入的那份数据配置（FACTS，由 open_log 传进来）。
# 这里**别写出构建期那四个哨兵名**（两下划线夹的名字，如 rules/facts/单位表/KB 的占位符原文）：
# 拼接后 JS 的 replace 只换第一处，注释里先出现一次就会把真正的赋值漏掉、浏览器直接报 NameError
# （构建期有"每个哨兵恰好一次"的护栏，写进去就构建失败）。

import io as _io
import re as _re

import numpy as np
import pyulog
from pyulog import ULog

# 解锁判定的码值：PX4 vehicle_status.arming_state 的 ARMING_STATE_ARMED
# （0=init 1=standby 2=armed 3=standby_error 4=shutdown）
_ARMING_STATE_ARMED = 2

# ULog 文件头：magic 'ULog' + 版本字节。用 magic 判格式，不用扩展名（上传的文件名不可信）
_MAGIC = b"ULog"

# 软件版本展示的类型码后缀（对齐 Flight Review 的 \`_format_sw_version\`）。
# **别凭直觉改**：只有类型码 0（未打标签的开发版）才附 git 短哈希，alpha/beta/RC 不附。
_RELEASE_TYPE_SUFFIX = {64: "-alpha", 128: "-beta", 192: "-rc", 255: ""}

# 地图轨迹的取数**声明**（读哪个 topic 的哪几列、各按什么量纲换算）在
# knowledge/px4/plot/track.yml —— 它按「要画什么、从哪几列画」归在 plot/ 下，
# 构建期并进引擎内联的那份数据配置（FACTS，见 rule_engine.py），这里从 \`self._cfg["track"]\` 读。
# **解析逻辑留在本文件**（get_flight_track()）：按顺序取第一个存在的候选、剔未定位点、等距抽样——
# 这些是分支，写进 YAML 只能再造一门小语言（见 track.yml 的说明）。

# 列名里像经纬度／高度的：**关键词必须独立成段**（\`^\` / \`.\` / \`_\` 起，\`.\` / \`_\` / \`$\` 止）。
# 不能用裸子串——\`relative_test_ratio\`、\`accelerometer_timestamp_relative\` 里都含 "lat"，
# 于是 \`estimator_selector_status\` / \`sensor_combined\` 会被列成"带经纬度字段的 topic"，
# 而它们跟坐标毫无关系。\`alt\` 同理：\`mode_req_local_alt\`、\`fd_alt\` 是**布尔标志**，不是高度。
# 这类"听起来合理但是错的"输出正是本节要消灭的东西（见 CLAUDE.md §6.8）。
# 分隔符带上 \`.\`：嵌套字段写成 \`previous.lat\` / \`current.lon\`（position_setpoint_triplet）。
_LATLON_FIELD_RE = _re.compile(r"(^|[._])(latitude|longitude|lng|lat|lon)([._]|$)")
_ALT_FIELD_RE = _re.compile(r"(^|[._])(altitude|alt)([._]|$)")


def _latlon_fields(columns):
    """列名里像**经纬度**的。

    「这份日志到底有没有坐标」只该看经纬度：高度到处都有（气压计、EKF、失效保护标志位），
    把它们算进来会让对照物里混进一堆与轨迹无关的 topic，反而看不出真答案。
    """
    return [c for c in columns if _LATLON_FIELD_RE.search(str(c).lower())]


def _coord_like_fields(columns):
    """经纬度或高度——「这个 topic 能不能给出坐标」的宽判据（\`_one_track\` 的缺字段文案用）。

    那里说的是"这个 topic 的坐标相关字段实际叫什么"，高度是轨迹三轴之一，该算。
    """
    return [c for c in columns if _LATLON_FIELD_RE.search(str(c).lower()) or _ALT_FIELD_RE.search(str(c).lower())]


class Px4Provider:
    """PX4 .ulg 适配器。契约见 providers/api.py。"""

    log_type = "px4-ulog"

    def __init__(self, raw, facts_cfg):
        self._cfg = facts_cfg or {}
        self.raw = bytes(raw)
        self.ulog = ULog(_io.BytesIO(self.raw))

        self._level_names = {int(k): v for k, v in (self._cfg.get("log_levels") or {}).items()}
        self._nav_names = {int(k): v for k, v in (self._cfg.get("nav_state_names") or {}).items()}
        self._nav_groups = [(g["phase"], set(int(c) for c in g["codes"])) for g in (self._cfg.get("nav_state_groups") or [])]
        self._vehicle_types = {int(k): v for k, v in (self._cfg.get("vehicle_types") or {}).items()}

        # 本日志实际录到的 topic 名集合
        self._topics = set(d.name for d in self.ulog.data_list)

        # 按 pyulog 的**数据来源**分组读：各段只读自己那一种来源，都只往 self 上放结果、
        # 不碰 facts。顺序有一处硬约束——\`_read_logged_messages()\` 要用 \`_read_data_list()\` 算出的
        # \`t0_us\` 把消息时间换成**相对日志起点**的秒数，所以它必须排最后；其余互不依赖。
        #   ulog.msg_info_dict      → \`_read_msg_info_dict()\`：版本、载具身份
        #   ulog.initial_parameters → \`_read_initial_parameters()\`：参数里的事实（累计飞行、机架编号）
        #   ulog.data_list          → \`_read_data_list()\`：基准 topic（机型/模式/armed/阶段）
        #                             与全量扫描（时长、轨迹起点、重启、丢包）
        #   ulog.logged_messages    → \`_read_logged_messages()\`：日志消息（含警告/错误级别）
        self._read_msg_info_dict()
        self._read_initial_parameters()
        self._read_data_list()
        self._read_logged_messages()

    # ================= 数据访问层 =================

    def parser_version(self):
        """解析这份日志用的解析器版本（见 \`_read_versions\`）。"""
        return self.parser_version_str

    def get_topic_meta(self):
        """[{name, instance, n, fields:[{name, dtype}]}]（驱动 np_manifest 与曲线可用性）"""
        out = []
        for d in self.ulog.data_list:
            out.append(
                {
                    "topic": d.name,
                    "instance": int(d.multi_id),
                    "n": int(len(d.data["timestamp"])),
                    "fields": [
                        {"name": k, "dtype": str(getattr(v, "dtype", type(v).__name__))}
                        for k, v in d.data.items()
                        if k != "timestamp"
                    ],
                }
            )
        return out

    def get_topic_data(self, topic, instance=0):
        """某个 topic 某个实例的**原样列**：{列名: 数组}（含 'field[0]' 这种数组列）。

        取不到返回 None（不抛异常——契约要求）。
        """
        d = self._find_topic(topic, instance)
        return d.data if d is not None else None

    def get_series(self, ref, instance=slice(None, None), alias=None):
        """按 \`"topic.field"\` 取一条序列（与规则里写的引用形一致）。

        **取不到或字段不存在一律返回 None，不抛异常。** 形态：
          · instance=slice（规则里写 \`topic[:].field\`，**不写下标也一样**）—— 所有实例。
            多实例时返回「每实例一组」的列表；**只有一个实例时返回那一条序列本身**
            （否则单实例字段就得处处写 \`[0]\`，而且 \`q\` 这种"每元素一列"的数组字段会被
            多包一层而读不出来）
          · instance=N（规则里写 \`topic[N].field\`，N 可为负，按 Python 语义从末尾数）
            —— 只取第 N 个实例
          · alias —— 该字段的备用命名（旧固件改过名），可给字符串或字符串列表
        定长数组字段（如 float32[3] accel_clipping）：pyulog 按 'field[i]' 暴露，
        这里返回**每元素一列的列表**，缺的元素位置为 None。

        **没有"把所有实例拼成一条"这个形态**（曾经有，默认就是它）：一条曲线里混着几个
        传感器的数据，读的人看不出来。要哪个实例就写哪个；多实例归约用 \`[:]\`
        交给会分组的算子。
        """
        aliases = None
        if alias is not None:
            aliases = [alias] if isinstance(alias, str) else list(alias)
        if instance is None:
            instance = slice(None, None)
        groups = self._read_grouped(ref, aliases)
        if not groups:
            return None
        try:
            picked = groups[instance]
        except (IndexError, TypeError):
            return None
        if isinstance(instance, slice):
            # 单实例：直接给那一条（与 \`[0]\` 同形），别让调用方无谓地拆一层
            return picked[0] if len(picked) == 1 else picked
        return picked

    def get_first_existing_column(self, topic, names):
        """只取第一个实例、按候选名取第一个存在的**原样列**（概览指标兜底取数用）。"""
        cols = self.get_topic_data(topic, 0)
        if not cols:
            return None
        for n in names if isinstance(names, (list, tuple)) else [names]:
            if n in cols:
                return cols[n]
        return None

    def has_topic(self, name):
        """日志里有没有这个 topic（表达式里写成 has_topic('x')）。"""
        return name in self._topics

    def match_version(self, spec):
        """固件约束串：any / ">=1.15" / "<1.15" / ">=1.14,<1.15"（逗号=与）。

        规则级的适用范围轴与节点级 \`ref(..., when_fw=)\` **共用这一个**（同一个概念、
        同一套语法）；写错了先抛出来，别被下面"版本未知就放行"盖过去。
        版本未知（老日志没写版本号）时不因版本排除——与迁移前"按字段存在性判定"一致。
        """
        if not spec or spec == "any":
            return True
        # 先把约束串解析完：写得不对是**作者的笔误**，与这份日志有没有版本号无关，
        # 所以先抛出来，而不是被"版本未知就放行"盖过去。
        conds = []
        for part in str(spec).split(","):
            m = _re.match(r"^\s*(>=|<=|==|>|<)?\s*(\d+)\.?(\d+)?\s*$", part)
            if not m:
                raise ValueError("无法解析 firmware 约束：%r" % spec)
            conds.append((m.group(1) or ">=", (int(m.group(2)), int(m.group(3) or 0))))
        if self.fw_minor is None:
            return True
        cur = (self.fw["major"] if self.fw["major"] is not None else 0, self.fw_minor)
        for op, want in conds:
            if not {
                ">=": cur >= want,
                "<=": cur <= want,
                "==": cur == want,
                ">": cur > want,
                "<": cur < want,
            }[op]:
                return False
        return True

    def get_logged_information(self):
        return dict(self.ulog.msg_info_dict)

    def get_initial_parameters(self):
        return getattr(self.ulog, "initial_parameters", {}) or {}

    def get_logged_messages(self):
        """[{tSec, message, level, level_name}]（tSec = 相对日志起点的秒数）。

        内容在构造时由 \`_read_logged_messages()\` 算好一次——\`builtin_variables()\` 每条规则都要它，
        每次重建纯属白干。这里返回逐条复制的新 dict：调用方拿到的不能是内部状态。
        """
        return [dict(m) for m in self._logged_messages]

    def builtin_variables(self):
        """内置变量表。**每次返回新 dict**（引擎会往里写 compute 的输出）。

        键一律大写（见 api.py 的 BUILTIN_VARIABLES）：规则里自己赋的变量是小写。
        """
        return {
            "FW_MINOR": self.fw_minor,
            "AIRFRAME": self.vehicle_type,
            "IS_FIXED_WING": self.vehicle_type == "fixed_wing",
            "DURATION_S": self.duration_s if self.duration_s is not None else 0,
            "ARMED_S": self.armed_duration_s,
            # 时序算子（如 head_tail_median_drop）按 armed 区间切窗用
            "ARMED_INTERVALS": list(self.armed_intervals),
            # 事件类算子的相对时间（t=xx.x s）基准
            "T0_US": self.t0_us,
            "HAS_ARMED": bool(self.armed_intervals),
            # 数据质量事实（guards 类经验用）
            "RESTART_DETECTED": self.restart_topics > 0,
            "DROPOUT_MS": self.dropout_total_ms,
            # 日志消息：供「日志消息聚合」类经验按级别筛选
            "MESSAGES": self.get_logged_messages(),
        }

    def get_report_facts(self):
        """报告头的离散事实（机型 / 固件 / 时长 / 模式 / 载具身份……）。"""
        return self._collect_facts()

    # ================= 可选能力 =================

    def get_flight_phases(self):
        """连续的飞行阶段区间（报告页阶段条用）：按 nav_state 变化切段。

        数据在 \`_read_data_list()\` 里就一起算好了（同一批数组），这里只交出去。
        返回逐段复制的新 dict：调用方拿到的不能是 provider 的内部状态。
        """
        return [dict(seg) for seg in self.phase_intervals]

    def get_logged_dropouts(self):
        return [
            {"tSec": round(int(d.timestamp) / 1e6, 2), "durationMs": int(d.duration)}
            for d in getattr(self.ulog, "dropouts", [])
        ]

    def get_message_type_counts(self):
        """逐条走 ULog 的 [uint16 消息长度][uint8 消息类型] 序列，统计每类消息的条数。

        刻意不走 pyulog 的解析结果：pyulog 只留它认得的东西（把 M 的续行并进同一组、
        按话题聚合 D…），这里要回答的是"文件里究竟有多少条"，顺带当"文件是否被截断"的旁证
        ——走到尾部长度对不上就停下并标记，不硬猜。
        """
        raw, n = self.raw, len(self.raw)
        counts = {}
        off = 16  # 16 字节文件头：magic 'ULog' + 版本号 + 起始时间戳
        while off + 3 <= n:
            size = raw[off] | (raw[off + 1] << 8)
            if off + 3 + size > n:
                return counts, False, off, n
            code = chr(raw[off + 2])
            counts[code] = counts.get(code, 0) + 1
            off += 3 + size
        return counts, off == n, off, n

    def get_decoded_events(self):
        """PX4 事件（\`event\` topic）解码。解不出返回 None。

        pyulog 的 PX4Events 用**日志自带**的 metadata_events（那个 xz blob 就是这份固件的
        事件定义），所以不联网、与固件版本严格对应；定义里没有的 ID 显示
        [Unknown event with ID N]。Flight Review 的 Logged Messages 表就是
        "解码事件 + 文本消息"两路合并，这里对齐它。
        """
        try:
            from pyulog.px4_events import PX4Events

            event_parser = PX4Events()
            # 不外网兜底：日志没带事件定义时宁可不解码，也不去悄悄下载一份"最新的"定义
            event_parser.set_default_json_definitions_cb(lambda _already_has_default: None)
            name_to_lvl = {v: k for k, v in self._level_names.items()}
            out = []
            for t_us, level_str, text in event_parser.get_logged_events(self.ulog):
                out.append(
                    {
                        "tSec": round(int(t_us) / 1e6, 2),
                        "level": name_to_lvl.get(str(level_str), 6),
                        "levelStr": str(level_str),
                        "kind": "event",
                        "message": str(text).strip(),
                    }
                )
            return out
        except Exception:
            return None

    def get_flight_track(self, max_points=None):
        """地图轨迹（**可以多条**）：每条轨道按声明取数、换算、剔除未定位采样、等距抽样。

        声明来自 \`knowledge/px4/plot/\` 里 \`container: map\` 的那个预设（构建期编译进数据配置）：

            children:
              - label: gps                 # 图例名
                max_points: 1500
                lat: {cands: ["sensor_gps[0].latitude_deg", …], unit: "deg"}
                lon / alt 同形

        坐标取数走引擎的 \`_pick_ref\`（候选组按存在性挑、单位换算）——与规则、曲线**同一套**。
        单条轨道取不到就跳过它；一条都没有才返回 \`error\`（保留 \`tracks: []\`，形状稳定）。

        **取不到时必须说清"缺什么"**（\`errorReasons\` 逐条列出：哪个 topic 不在、缺哪个字段、
        还是"有采样但全程未定位"）。以前这里只给一句"声明里的坐标候选都不在日志里"，
        而那只对应其中一种原因——日志里有 \`vehicle_gps_position\` 但全程没拿到 3D 定位时，
        这句话是**错的**，用户还拿不到任何能自己判断的线索。见 CLAUDE.md §6.8。
        """
        cfg = self._cfg.get("track")
        if not cfg or not cfg.get("children"):
            return {"error": "这份格式没有声明轨迹取数来源（knowledge/px4/plot/track.yml）"}
        # ① 先过声明里的闸门（\`conditions.topics\`，构建期从预设搬到 facts.track）：一个都不在
        #    日志里时，这份预设**本就不适用**，该说的是"缺哪个 topic"而不是"坐标候选取不到"。
        #    文案复用 \`rule_engine._missing_topics\`——规则与绘图预设共用这一处，别在这儿再写
        #    第二份（它给的正是缺什么：\`sensor_gps / vehicle_gps_position not in log\`）。
        missing = _missing_topics((cfg.get("conditions") or {}).get("topics"))
        if missing:
            return self._track_failure(cfg, ["轨迹声明要的 topic 不在日志里：%s" % missing])
        # ② 闸门过了（至少一个候选 topic 在）却还是取不到，再逐候选说清为什么。这些原因
        #    \`conditions.topics\` 看不出来：字段改了名，或者有 GPS 采样但全程没拿到 3D 定位。
        tracks = []
        reasons = []
        for child in cfg["children"]:
            one, why = self._one_track(child, max_points)
            if one is not None:
                tracks.append(one)
            else:
                reasons.extend(why)
        if not tracks:
            return self._track_failure(cfg, reasons or ["声明里的候选一条都没取到坐标"])
        return {
            "title": cfg.get("title") or "轨迹",
            "legend": cfg.get("legend", True),
            "tracks": tracks,
        }

    def _track_failure(self, cfg, reasons):
        """轨迹取不到的返回体。

        \`error\` 带上**最后一条**原因（给"只看一行"的消费方：日志、非界面接口），完整清单在
        \`errorReasons\`（界面按列表渲染）。为什么是最后一条：候选按优先级依次试，**最后试的
        那个才是把整串试完的那一个**，它前面几条只是"为什么跳过了它"——把第一条当结论，
        会指着"日志里没有 sensor_gps"去解释"有 GPS 但全程没定位"。
        """
        headline = reasons[-1]
        declared = {
            _split_ref(c)[0].partition(".")[0]
            for ch in cfg["children"]
            for ax in ("lat", "lon", "alt")
            for c in (ch.get(ax) or {}).get("cands", [])
        }
        # 声明的 topic 一个都不在日志里时，补一句"日志里实际有什么"：只说"缺了东西"用户
        # 无从下手——有对照物才看得出是固件版本不同，还是字段改了名
        if declared and not any(self.has_topic(t) for t in declared):
            reasons = reasons + [self._coord_field_topics_note()]
        return {
            "title": cfg.get("title") or "轨迹",
            "legend": cfg.get("legend", True),
            "tracks": [],
            "error": "这段日志里没有可用的定位轨迹——" + headline,
            "errorReasons": reasons,
        }

    def _coord_field_topics_note(self):
        """日志里"带经纬度字段"的 topic 一句话清单（给 \`errorReasons\` 当对照物）。

        挑判据用**字段**而不是 topic 名：用户真正要问的是"这份日志里到底有没有坐标"，
        只列 \`vehicle_local_position\` 这种名字看不出它只有参考原点 \`ref_lat/ref_lon\`、
        没有逐点经纬度——而那恰恰是"为什么画不出轨迹"的答案。

        判据见 \`_latlon_fields\`（关键词独立成段、只看经纬度不看高度）。**写成裸子串 \`"lat" in name\`
        会让 \`relative_test_ratio\` 里的 "lat" 混进来**，列出 \`estimator_selector_status\` 这种
        与坐标无关的 topic——比不给对照物更糟，因为它听起来很具体。
        """
        hits = []
        for m in self.get_topic_meta():
            coord = _latlon_fields([f["name"] for f in m["fields"]])
            if coord:
                hits.append("%s[%d]（%s）" % (m["topic"], int(m["instance"]), ", ".join(coord[:4])))
        if not hits:
            return "这份日志里没有任何带经纬度字段的 topic"
        more = "，另有 %d 个" % (len(hits) - 6) if len(hits) > 6 else ""
        return "这份日志里带经纬度字段的 topic 有：" + "；".join(hits[:6]) + more

    def _one_track(self, child, max_points=None):
        """一条轨道 → \`(轨道, [])\`；取不到返回 \`(None, [原因…])\`。

        **三个坐标与时间戳必须来自同一个 topic 的同一个实例**：候选顺序即优先级，取第一个
        "lat / lon / alt 三样都能给齐"的 topic 生效。不这么定的话，三路的采样率不同、数组
        长度不同，\`lat[i]\` 与 \`alt[i]\` 根本不是同一时刻，画出来是错的。

        失败原因是要**给用户看**的，所以每一句都得落到具体的 topic / 字段上：
        "缺字段"要说缺哪个、这个 topic 的坐标字段实际叫什么；"全是未定位"要说清几个采样、
        几个有效——用户据此才能判断是固件版本不同、字段改了名，还是这次飞行压根没上星。
        """
        limit = int(max_points or child.get("max_points") or 1500)
        why = []
        for cand in child["lat"]["cands"]:
            bare, inst = _split_ref(cand)
            topic = bare.partition(".")[0]
            if isinstance(inst, slice):
                continue  # 构建期就要求写死实例；这里防御性跳过
            cols = self.get_topic_data(topic, inst)
            if not cols:
                why.append("%s[%s]：日志里没有这个 topic" % (topic, inst))
                continue
            axes, ok, missing = {}, True, {}
            for name in ("lat", "lon", "alt"):
                spec = child.get(name) or {}
                same = [c for c in spec.get("cands", []) if _split_ref(c)[0].partition(".")[0] == topic]
                fields = [c.partition(".")[2] for c in same]
                hit = next((f for f in fields if f in cols), None)
                if hit is None:
                    missing[name] = fields
                    ok = False
                else:
                    axes[name] = (same[fields.index(hit)], spec.get("unit"))
            if not ok:
                coordish = _coord_like_fields(cols)
                why.append(
                    "%s[%s]：缺 %s 字段——声明找的是 %s，该 topic 的坐标相关字段是 %s（共 %d 列）"
                    % (
                        topic,
                        inst,
                        "/".join(missing),
                        "、".join("%s→%s" % (k, "/".join(v) or "（声明里没有同 topic 的候选）") for k, v in missing.items()),
                        ", ".join(coordish) if coordish else "（一个都没有）",
                        len(cols),
                    )
                )
                continue

            series, ok = {}, True
            for name, (cand_str, unit) in axes.items():
                got, _bare = _pick_ref(cand_str, unit=unit)
                if got is None:
                    why.append("%s[%s]：%s 取不出值（候选 %s，unit=%s）" % (topic, inst, name, cand_str, unit))
                    ok = False
                    break
                series[name] = np.asarray(got, dtype=float)
            if not ok:
                continue
            ts = self.get_series("%s.timestamp" % topic, instance=inst)
            if ts is None:
                why.append("%s[%s]：没有 timestamp 字段（轨迹点的时间轴取自它）" % (topic, inst))
                continue
            ts = np.asarray(ts, dtype=np.int64)
            n = len(ts)
            if any(len(series[k]) != n for k in ("lat", "lon", "alt")):
                why.append(
                    "%s[%s]：采样数对不上——timestamp %d 个，lat/lon/alt 分别 %d/%d/%d 个"
                    % (topic, inst, n, len(series["lat"]), len(series["lon"]), len(series["alt"]))
                )
                continue  # 同 topic 同实例却长度不同：宁可这条不画，也不硬凑坐标

            lat, lon, alt = series["lat"], series["lon"], series["alt"]
            # GPS 没定位时的采样必须剔掉：PX4 在拿到定位前会连着记 lat=lon=0（几内亚湾那个"空岛"），
            # 一条直线就从那儿连到真正的航迹上——地图上看着完全不对（实测用户日志就是这样）。
            # 判据：坐标在合法范围、不是 (0,0)、且（有 fix_type 时）fix_type ≥ 3 才算 3D 定位。
            valid = np.isfinite(lat) & np.isfinite(lon) & np.isfinite(alt)
            valid &= (np.abs(lat) <= 90.0) & (np.abs(lon) <= 180.0)
            valid &= ~((np.abs(lat) < 1e-7) & (np.abs(lon) < 1e-7))
            fix = self.get_series("%s.fix_type" % topic, instance=inst)
            fix_note = ""
            if fix is not None:
                fx = np.asarray(fix)
                valid &= fx >= 3
                kinds = {}
                for v in fx:
                    kinds[int(v)] = kinds.get(int(v), 0) + 1
                fix_note = "，fix_type 分布 %s" % " ".join("%d×%d" % (k, v) for k, v in sorted(kinds.items()))
            idx_valid = np.nonzero(valid)[0]
            if len(idx_valid) < 2:
                # "字段都在、但整段没定位"是另一回事：不说清的话用户会以为日志里没这个字段，
                # 而真相是这次飞行没上星（或飞控没进 3D fix）
                why.append(
                    "%s[%s]：%d 个采样里只有 %d 个有效定位（要 fix_type≥3、坐标非 0 非 NaN）%s"
                    % (topic, inst, n, len(idx_valid), fix_note)
                )
                continue

            # 轨迹用等距抽样：路径形状比峰值更需要均匀（在有效点里抽，别把 invalid 又抽回来）
            step = max(1, int(np.ceil(len(idx_valid) / limit)))
            idx = [int(i) for i in idx_valid[::step]]
            clean = _json_clean
            return {
                "label": child.get("label") or topic,
                "t": [round(int(ts[i]) / 1e6, 2) for i in idx],
                "lat": [clean(lat[i]) for i in idx],
                "lon": [clean(lon[i]) for i in idx],
                "alt": [clean(alt[i]) for i in idx],
                "fullCount": len(idx_valid),
                # 剔掉了多少未定位采样：界面据此说明"点数为什么比采样数少"
                "dropped": int(n - len(idx_valid)),
            }, []
        return None, why

    def report_materials(self):
        """报告页要的几块原料（**不是某一个 tab 的 payload**，四个 tab 各取所需）。

        系统消息取 infoDict / msgTypeStats / msgTypeWalkOk；事件消息取 messages / messagesMulti；
        飞控参数取 params / defaultParams / changedParams；阶段条取 phases。

        所以这个方法的边界是「该格式能提供哪些原料」，由前端按 tab 取用。为什么不由数据层拼：
        原料的形态是格式专有的——'I' 信息字典、'L' 文本消息与 event 解码结果合并成一条时间轴、
        'M' 多值信息怎么拼回文本、'Q' 默认值怎么推、逐字节的消息类型统计……换一种日志格式
        就是另一套。
        """
        info = self.get_logged_information()  # 走契约能力取，别再直读 self.ulog（同一份数据两处知识）
        cfgsys = self._cfg.get("sys_info_keys") or []
        info_types = getattr(self.ulog, "_msg_info_dict_types", None) or {}
        info_docs = self._cfg.get("info_key_docs") or {}
        clean = _json_clean

        def boot(t_us):
            return round(int(t_us) / 1e6, 2)

        sys_info = {k: str(info[k]) for k in cfgsys if k in info}
        info_dict = []
        for k, v in sorted(info.items()):
            doc = info_docs.get(k) or {}
            info_dict.append(
                {
                    "key": str(k),
                    "name": str(doc.get("name", "")),
                    "type": str(info_types.get(k, "")),
                    "value": str(v),
                    "desc": str(doc.get("desc", "")),
                }
            )

        # Logged String Message（'L'）。PX4 对**事件**会同时写两样：一条事件（二进制，进
        # \`event\` topic）和一条等价的旧格式文本（以 \t 结尾）。先分开收，等解码出事件后再决定
        # 要不要留那份重复文本。
        messages, legacy_dupes = [], []
        for m in getattr(self.ulog, "logged_messages", []):
            lvl = int(getattr(m, "log_level", 6))
            text = str(m.message)
            item = {
                "tSec": boot(m.timestamp),
                "level": lvl,
                "levelStr": self._level_str(m, lvl),
                "kind": "log",
                "message": text.strip(),
            }
            (legacy_dupes if text.endswith("\t") else messages).append(item)

        events = self.get_decoded_events() or []

        # Tagged Logged String（'C'）：与 'L' 同形，多一个 tag = 消息来源（进程/线程/类），
        # 由机载系统自己定义含义（PX4 主线固件一般不写）。按时间并入同一时间轴，tag 原样带上。
        tagged_src = getattr(self.ulog, "logged_messages_tagged", None) or {}
        messages_tagged = []
        for tag, msgs in tagged_src.items():
            for m in msgs:
                lvl = int(getattr(m, "log_level", 6))
                messages_tagged.append(
                    {
                        "tSec": boot(m.timestamp),
                        "level": lvl,
                        "levelStr": self._level_str(m, lvl),
                        "kind": "log",
                        "tag": int(tag),
                        "message": str(m.message).strip(),
                    }
                )
        messages_tagged.sort(key=lambda m: m["tSec"])

        # 解码出事件了：那些 \t 结尾的旧格式文本就是同一件事的另一种说法，丢掉（FR 也如此）。
        # 没有解码结果（固件没带事件定义）就保留——否则 armed / takeoff 这类关键节点会凭空消失。
        if not events:
            messages += legacy_dupes
        all_messages = sorted(messages + events + messages_tagged, key=lambda m: m["tSec"])

        # Multi Information：键 → 多组值，没有时间戳。组内怎么拼回文本要看**形态**：
        #   · 逐行型（perf_counter / perf_top…）：每段是一行完整文本，PX4 不给行尾换行
        #     —— 段之间补 \n，否则所有行黏成一行；
        #   · 流式型（boot_console_output）：一整段控制台文本按定长切片，换行在段**内部**，
        #     一行还可能跨段 —— 只能直接拼接，补 \n 会凭空断行。
        # 判据：任一段自带换行 → 流式；否则逐行。实机日志两种键都出现过，别按一种写死。
        multi_src = getattr(self.ulog, "msg_info_multiple_dict", None) or {}
        multi_types = getattr(self.ulog, "msg_info_multiple_dict_types", None) or {}

        def _fmt(v):
            # metadata_events 之类是原始字节，别把 b'ý7zXZ...' 当文本铺出来
            if isinstance(v, (bytes, bytearray)):
                return "（二进制数据 %d 字节）" % len(v)
            return str(v)

        def _fmt_group(grp):
            if not isinstance(grp, list):
                return _fmt(grp)
            # 整组都是原始字节（metadata_events 就是）：只报总字节数，不铺十几行同样的提示
            if grp and all(isinstance(x, (bytes, bytearray)) for x in grp):
                return "（二进制数据 %d 字节，已省略）" % sum(len(x) for x in grp)
            texts = [_fmt(x) for x in grp]
            return "".join(texts) if any("\n" in t for t in texts) else "\n".join(texts)

        messages_multi = [
            {
                "key": str(k),
                "type": str(multi_types.get(k, "")),
                "values": [_fmt_group(g) for g in (multi_src[k] or [])],
            }
            for k in sorted(multi_src)
        ]

        params = {
            str(k): (clean(np.asarray(v).reshape(-1)[0]) if hasattr(v, "reshape") else clean(v))
            for k, v in self.get_initial_parameters().items()
        }

        # Parameter Default（ULog 的 'Q' 消息）。PX4 的 logger 逐参数比较「当前值 / 机架默认 /
        # 固件默认」三者，**只写与当前值不同的那个**（logger.cpp: write_parameter_defaults）
        # —— 于是「有记录」等价于「该参数被改过」，且记录里的默认值必然与当前值不同；
        # 反过来「没记录」表示当前值与两个默认都相同。
        # 位含义见 ulog_parameter_default_type_t：bit0 = system（固件出厂默认），
        # bit1 = current_setup（机架配置 + 自定义默认文件）。
        default_params = {}
        get_defaults = getattr(self.ulog, "get_default_parameters", None)
        if get_defaults is not None:
            for bit, field in ((0, "system"), (1, "setup")):
                for key, val in (get_defaults(bit) or {}).items():
                    default_params.setdefault(str(key), {})[field] = clean(val)

        changed = []
        cp = getattr(self.ulog, "changed_parameters", None)
        if cp is None:
            cp = getattr(self.ulog, "_changed_parameters", [])
        for p in cp:
            changed.append(
                {
                    "tSec": boot(getattr(p, "timestamp", 0) or 0),
                    "name": str(getattr(p, "name", "")),
                    "value": clean(getattr(p, "value", None)),
                }
            )

        # ULog 消息类型统计：顺序与名字来自 facts.yaml 的 ulog_msg_types，没出现过的类型计 0
        counts, walked_to_end, walked_off, file_size = self.get_message_type_counts()
        msg_types = self._cfg.get("ulog_msg_types") or []
        known = {str(t["code"]) for t in msg_types}
        msg_type_stats = [
            {
                "code": str(t["code"]),
                "name": str(t.get("name", "")),
                "en": str(t.get("en", "")),
                "desc": str(t.get("desc", "")),
                "count": int(counts.get(str(t["code"]), 0)),
            }
            for t in msg_types
        ]
        unknown = sum(c for k, c in counts.items() if k not in known)
        if unknown:
            msg_type_stats.append(
                {
                    "code": "?",
                    "name": "不在码表里的类型",
                    "en": "Unknown",
                    "count": int(unknown),
                    "desc": "固件比本站的码表新，或文件被改过",
                }
            )

        return {
            "sysInfo": sys_info,
            "infoDict": info_dict,
            "msgTypeStats": msg_type_stats,
            # 逐字节统计有没有正好走到文件末尾：false = 尾部有截断/追加段
            "msgTypeWalkOk": bool(walked_to_end),
            "msgTypeWalkedBytes": int(walked_off),
            "fileSizeBytes": int(file_size),
            # 事件解码结果、文本消息、带 tag 的消息已经并成一条时间轴（按 kind 区分来源）
            "messages": all_messages,
            "messagesMulti": messages_multi,
            "dropouts": self.get_logged_dropouts(),
            "params": params,
            "defaultParams": default_params,
            # 老固件没设 DEFAULT_PARAMETERS compat flag 时整段缺失：此时「没记录」不能当成
            # 「与默认一致」，前端要区别对待，不能替它下结论。
            "defaultParamsKnown": bool(getattr(self.ulog, "has_default_parameters", False)),
            "changedParams": changed,
            "phases": self.get_flight_phases(),
        }

    # ================= 内部：解析与事实 =================

    def _find_topic(self, topic, instance):
        """该 topic 该实例那份数据；没有就 None。"""
        for d in self.ulog.data_list:
            if d.name == topic and d.multi_id == instance:
                return d
        return None

    def _find_topic_all(self, topic):
        """该 topic 的**全部实例**（多实例拼接用）。"""
        return [d for d in self.ulog.data_list if d.name == topic]

    @staticmethod
    def _first_field(ds, *names):
        """按 names 的顺序取**第一个存在**的字段（旧固件改过名时靠它回退）。

        取不到（名字不在这份日志里）返回 None，不抛异常——契约要求"取不到一律 None"，
        引擎按"数据不足"处理。**只咽 KeyError**：静默留给"数据缺失"，不留给编程错误
        （传了个 None 的 dataset 之类该当场炸，否则表现成"这条经验静默不生效"，最难查）。
        """
        for n in names:
            try:
                v = ds.data[n]
            except KeyError:
                continue
            if v is not None:
                return v
        return None

    def _read_grouped(self, ref, aliases):
        """'topic.field' → 「每个 topic 实例一组」的列表；topic 不存在返回 None。

        实例顺序 = \`_find_topic_all()\` 的顺序（与 topic meta 一致），所以 \`instance=N\` 的
        N 就是标题里那个实例序号。缺字段的实例留一个 None 占位，**不剔除**——剔了会让
        后面的实例序号整体前移。
        """
        topic, _, field = ref.partition(".")
        ds = self._find_topic_all(topic)
        if not ds:
            return None
        aliases = list(aliases or [])
        groups = []
        for d in ds:
            direct = self._first_field(d, field, *aliases)
            if direct is not None and len(direct):
                groups.append(np.asarray(direct, dtype=float))
                continue
            cols = []
            for idx in range(32):
                col = None
                for stem in [field] + aliases:
                    v = self._first_field(d, f"{stem}[{idx}]", f"{stem}_{idx}")
                    if v is not None and len(v):
                        col = np.asarray(v, dtype=float)
                        break
                cols.append(col)
            while cols and cols[-1] is None:
                cols.pop()
            groups.append(cols if cols else None)
        return groups

    def _level_str(self, m, lvl):
        try:
            return str(m.log_level_str())
        except Exception:
            return self._level_names.get(lvl, "LEVEL %d" % lvl)

    def _read_msg_info_dict(self):
        """从 \`ulog.msg_info_dict\`（PX4 的 Information Message）读版本与载具身份。

        ver_sw_release 的打包：major<<24 | minor<<16 | patch<<8 | 类型。
        """
        self.parser_version_str = "pyulog/%s" % getattr(pyulog, "__version__", "unknown")

        info = self.ulog.msg_info_dict
        rel = info.get("ver_sw_release")
        fw = {
            "release": None,
            "major": None,
            "minor": None,
            "patch": None,
            "git": str(info.get("ver_sw", ""))[:12],
            "hw": str(info.get("ver_hw", "")),
        }
        if rel is not None:
            try:
                v = int(rel)
                fw.update(
                    {
                        "release": v,
                        "major": (v >> 24) & 0xFF,
                        "minor": (v >> 16) & 0xFF,
                        "patch": (v >> 8) & 0xFF,
                    }
                )
            except Exception:
                pass
        self.fw = fw
        self.fw_minor = fw["minor"]
        self.fw_label = (
            "%d.%d.%d" % (fw["major"], fw["minor"], fw["patch"]) if fw["minor"] is not None else "未知（旧固件或无版本号）"
        )

        self.hw_subtype = str(info.get("ver_hw_subtype", ""))

        # 软件版本的展示串：对齐 Flight Review 的 \`_format_sw_version\`（见 _RELEASE_TYPE_SUFFIX
        # 的注释：只有未打标签的开发版才附 git 短哈希）。类型码另存一份，前端能凭它重算。
        # 用 fw["release"]（已 int 化）而不是 info 里的原值：解析不出数字时它才是 None。
        self.ver_sw = str(info.get("ver_sw", ""))
        short_sw = self.ver_sw[:6] if len(self.ver_sw) > 10 else self.ver_sw
        rel = fw["release"]
        self.fw_release_type = None if rel is None else int(rel) & 0xFF
        if rel is None:
            self.fw_display = short_sw
        else:
            rtype = int(rel) & 0xFF
            disp = "v%d.%d.%d%s" % (
                fw["major"],
                fw["minor"],
                fw["patch"],
                _RELEASE_TYPE_SUFFIX.get(rtype, ""),
            )
            if rtype not in _RELEASE_TYPE_SUFFIX and self.ver_sw:  # 未打标签的开发版：附短哈希
                disp += " (%s)" % short_sw
            self.fw_display = disp

        # 载具身份：与判定无关，但历史卡片与报告概况要用，且必须**随 report 存档**
        # （派生数据 info 不进存档）。用**分支/标签**（如 damiao_dm-fc01_v1.15.0）比 commit
        # 号可读；新固件才有这个键
        self.uuid = str(info.get("sys_uuid", ""))
        self.ver_sw_branch = str(info.get("ver_sw_branch", ""))

    def _read_initial_parameters(self):
        """从 \`ulog.initial_parameters\` 读参数里的事实。"""
        p = getattr(self.ulog, "initial_parameters", {}) or {}
        # 载具累计飞行时长：LND_FLIGHT_T_HI/LO 拼成的 64 位 µs 计数器
        # （两个都是 int32，可能读成负数）
        hi, lo = p.get("LND_FLIGHT_T_HI"), p.get("LND_FLIGHT_T_LO")
        self.vehicle_life_s = (
            round((((int(hi) & 0xFFFFFFFF) << 32) | (int(lo) & 0xFFFFFFFF)) / 1e6, 1)
            if hi is not None and lo is not None
            else None
        )
        # 机架编号（SYS_AUTOSTART，如 4040）——机型之外再给一个可查的标识
        af = p.get("SYS_AUTOSTART")
        self.airframe_id = int(af) if af is not None else None

    def _read_data_list(self):
        """读 \`ulog.data_list\`（各 topic 的时序）与 \`ulog.dropouts\`，得出报告头的离散量。

        分两部分：先读**基准 topic** \`vehicle_status\`（机型 / 模式 / armed 区间 / 飞行阶段），
        再**扫全局**（总时长与时间基准、记录起始 UTC、数据质量）。这个 topic 只读这一处，
        需要切段的都在同一批数组上算完——原先 \`get_flight_phases()\` 要为此把整份 dataset 留到运行期再切。
        条件值（这份日志没有的）统一用 None / "" 表示，由 \`_collect_facts()\` 决定给不给键。
        """
        ulog = self.ulog

        # ---- 基准 topic：vehicle_status ----
        vs = self._find_topic("vehicle_status", 0)

        # ---- 机型识别 ----
        vehicle_type = "unknown"
        if vs is not None:
            vt = self._first_field(vs, "vehicle_type")
            if vt is not None and len(vt) > 0:
                vehicle_type = self._vehicle_types.get(int(vt[-1]), "unknown(%d)" % int(vt[-1]))
            else:
                rw = self._first_field(vs, "is_rotary_wing")
                if rw is not None and len(rw) > 0:
                    vehicle_type = "rotary_wing" if int(rw[-1]) else "fixed_wing"
        self.vehicle_type = vehicle_type

        # ---- 飞行模式 ----
        # 这次日志里出现过的 nav_state 模式，按占样本数从多到少（名字取 facts.yaml 的
        # nav_state_names）——列表的"飞行模式"列按 Flight Review 的口径列出**全部**模式。
        self.modes = None
        if vs is not None:
            nav = self._first_field(vs, "nav_state")
            if nav is not None and len(nav) > 0:
                counts = {}
                for code in nav:
                    counts[int(code)] = counts.get(int(code), 0) + 1
                ordered = sorted(counts, key=lambda c: -counts[c])
                self.modes = [str(self._nav_names.get(c, "Mode %d" % c)) for c in ordered]

        # ---- armed 区间与飞行阶段 ----
        # 三样东西都从同一批数组切出来：armed 区间（时序算子按它切窗）、这次日志出现过的
        # 阶段集合（喂故障库）、连续阶段区间（报告页阶段条）。一起算，同一批数据不必切两遍。
        armed_intervals, phases_present, phase_intervals = [], set(), []
        armed_duration_s = 0.0
        if vs is not None:
            nav = self._first_field(vs, "nav_state")
            nav_arr = np.asarray(nav) if nav is not None else None
            arm = self._first_field(vs, "arming_state")
            arm_arr = np.asarray(arm) if arm is not None else None
            vts = np.asarray(self._first_field(vs, "timestamp"), dtype=np.int64)

            # armed 区间（failsafe 失联只在 armed 区间内才报）
            if arm_arr is not None:
                start_i = None
                for i in range(len(arm_arr)):
                    if int(arm_arr[i]) == _ARMING_STATE_ARMED and start_i is None:
                        start_i = i
                    elif int(arm_arr[i]) != _ARMING_STATE_ARMED and start_i is not None:
                        armed_intervals.append((int(vts[start_i]), int(vts[i])))
                        start_i = None
                if start_i is not None:
                    armed_intervals.append((int(vts[start_i]), None))
                total_us = sum(((e if e is not None else int(vts[-1])) - s) for s, e in armed_intervals)
                armed_duration_s = round(total_us / 1e6, 1)

            if nav_arr is not None:
                # 只统计 armed 段内的状态；未解锁的地面操作不产生飞行阶段
                if armed_intervals:
                    amask = np.zeros(len(nav_arr), dtype=bool)
                    for s, e in armed_intervals:
                        lo = int(np.searchsorted(vts, s))
                        hi = len(vts) if e is None else int(np.searchsorted(vts, e))
                        amask[lo:hi] = True
                    codes = set(int(c) for c in nav_arr[amask])
                    for phase, phase_codes in self._nav_groups:
                        if codes & phase_codes:
                            phases_present.add(phase)

                # 连续阶段区间：按 nav_state 变化切段，每段取段内 arming_state 的中位数
                # 判"这段算不算在飞"。与上面那个集合不是一回事：那个答"出现过哪些阶段"，
                # 这个答"几点到几点在哪个阶段"。
                runs, run_start = [], 0
                for i in range(1, len(nav_arr)):
                    if int(nav_arr[i]) != int(nav_arr[run_start]):
                        runs.append((run_start, i - 1))
                        run_start = i
                runs.append((run_start, len(nav_arr) - 1))
                for lo_i, hi_i in runs:
                    code = int(nav_arr[lo_i])
                    seg_arm = int(np.median(arm_arr[lo_i : hi_i + 1])) if arm_arr is not None else None
                    phase_intervals.append(
                        {
                            "startSec": round(int(vts[lo_i]) / 1e6, 2),
                            "endSec": round(int(vts[hi_i]) / 1e6, 2),
                            "navState": code,
                            "mode": self._nav_names.get(code, "Mode %d" % code),
                            "armed": seg_arm == _ARMING_STATE_ARMED,
                        }
                    )

            trans_mode = self._first_field(vs, "vtol_in_trans_mode")
            if trans_mode is not None and int(np.max(np.asarray(trans_mode))) > 0:
                phases_present.add("vtol_transition")

        self.armed_intervals = armed_intervals
        self.armed_duration_s = armed_duration_s
        self.phases_present = phases_present
        self.phase_intervals = phase_intervals

        # ---- 扫全局：总时长与时间基准 ----
        # 时间基准是**开机以来的秒数**（PX4 时间戳本身就是开机起的微秒），这里不换算，
        # 只记录起点供事件类算子算相对时刻。
        t_min, t_max = None, None
        for d in ulog.data_list:
            t = self._first_field(d, "timestamp")
            if t is not None and len(t) > 1:
                a, b = float(t[0]), float(t[-1])
                t_min = a if t_min is None else min(t_min, a)
                t_max = b if t_max is None else max(t_max, b)
        self.t0_us = int(getattr(ulog, "start_timestamp", 0) or (t_min or 0))
        self.duration_s = round((t_max - t_min) / 1e6, 1) if t_min is not None else None

        # ---- 扫全局：记录起始的 UTC 时刻 ----
        # 取 GPS 首次给出有效时间的那一刻（比 boot_time_utc_us 可靠，后者要飞控对过时）。
        # topic 按 plot/ 里地图声明的**候选顺序**取第一个存在的（构建期已按声明编译好 topics），
        # 与 get_flight_track() 同一优先级——两处别各挑各的。
        self.start_utc = None
        for topic, inst in (self._cfg.get("track") or {}).get("children", [{}])[0].get("topics", []):
            gps = self._find_topic(topic, int(inst))
            if gps is None or "time_utc_usec" not in gps.data:
                continue
            t = np.asarray(gps.data["time_utc_usec"], dtype=np.int64)
            nz = np.nonzero(t > 0)[0]
            if len(nz):
                self.start_utc = int(t[nz[0]] // 1000000)
                break

        # ---- 扫全局：数据质量事实 ----
        # 中途重启：同一 topic 时间戳出现回退（样本 > 10 才算）
        restart = 0
        for d in ulog.data_list:
            t = self._first_field(d, "timestamp")
            if t is not None and len(t) > 10:
                a = np.asarray(t, dtype=np.int64)
                if int(np.count_nonzero(np.diff(a) < 0)) > 0:
                    restart += 1
        self.restart_topics = restart
        # 丢包累计
        self.dropout_total_ms = int(sum(getattr(d, "duration", 0) for d in getattr(ulog, "dropouts", [])))

    def _read_logged_messages(self):
        """读 \`ulog.logged_messages\`：日志消息（PX4 的 \`[模块] 文案\`，含警告 / 错误级别）。

        **必须排在 \`_read_data_list()\` 之后**：tSec 是相对日志起点的秒数，要用它算出的 \`t0_us\`。
        为什么在构造期算而不是每次现算：\`builtin_variables()\` 里就有 \`messages\`，而 \`builtin_variables()\`
        被 \`_rule_env()\` **每条规则各调一次**——不缓存就是每条规则重建一遍同一份列表。

        level 是 ULog 里的原始字节，PX4 填的是 **ASCII 数字**（'3'=51 才是 ERROR），
        与 pyulog 的 Message.log_level_str() 一致；因此经验文件按 level_name 判定，
        不要直接和 3/4 这种数字比（迁移前就是这么比错的，导致消息类经验从不命中）。
        """
        out = []
        for m in getattr(self.ulog, "logged_messages", []):
            try:
                ts_s = round((int(m.timestamp) - self.t0_us) / 1e6, 2)
            except (AttributeError, TypeError, ValueError):
                # 这条消息没有可用的 timestamp（pyulog 各版本给的东西不一致）：只丢相对时刻，
                # 消息本身照留。**不写 except Exception**——\`t0_us\` 要是设错了，那是 bug，
                # 应该炸出来，而不是让全部消息悄悄变成 tSec=None。
                ts_s = None
            lvl = int(getattr(m, "log_level", ord("6")))
            out.append(
                {
                    "tSec": ts_s,
                    "message": str(m.message).strip(),
                    "level": lvl,
                    "level_name": self._level_names.get(lvl, "UNKNOWN"),
                }
            )
        self._logged_messages = out

    def _collect_facts(self):
        """把三段读到的量汇成报告头的离散事实。

        **facts 的键名只在这一个地方出现**：三段各管"从日志里读什么"（只往 self 上放），
        这里管"报告头叫什么名字"（含"有才给"的条件键）。分开的好处是改键名不必翻三段代码，
        也能一眼看全报告头到底有哪些字段。
        """
        facts = {
            "durationSec": self.duration_s if self.duration_s is not None else 0,
            "vehicleType": self.vehicle_type,
            "firmware": self.fw_label,
            "firmwareProfile": ("px4-1.15+" if (self.fw_minor is not None and self.fw_minor >= 15) else "px4-legacy"),
            "firmwareDisplay": self.fw_display,
            "fwReleaseType": self.fw_release_type,
            "armedDurationSec": self.armed_duration_s,
            "phases": sorted(self.phases_present),
            "dropoutTotalMs": self.dropout_total_ms,
        }
        # 条件键：这份日志没有的就不给（前端按"缺哪项不显示哪行"处理）
        if self.fw["hw"]:
            facts["hardware"] = self.fw["hw"]
        if self.hw_subtype:
            facts["hardwareSubtype"] = self.hw_subtype
        if self.ver_sw:
            facts["verSw"] = self.ver_sw
        if self.modes:
            facts["modes"] = list(self.modes)
            facts["mainMode"] = self.modes[0]  # 已按占样本数排序，第一个就是主模式
        if self.uuid:
            facts["uuid"] = self.uuid
        if self.ver_sw_branch:
            facts["verSwBranch"] = self.ver_sw_branch
        if self.vehicle_life_s is not None:
            facts["vehicleLifeS"] = self.vehicle_life_s
        if self.airframe_id is not None:
            facts["airframeId"] = self.airframe_id
        if self.start_utc is not None:
            facts["startUtc"] = self.start_utc
        return facts


def _json_clean(v):
    """numpy / NaN / Inf → JSON 安全的 Python 原生结构（NaN 转 None）。"""
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, float) and not np.isfinite(v):
        return None
    return v


def _is_ulog(raw):
    return bytes(raw[:4]) == _MAGIC


def _make_px4(raw, facts_cfg):
    return Px4Provider(raw, facts_cfg)


FORMATS.append((_is_ulog, _make_px4, "PX4 ULog（.ulg）"))

# ============================================================================
# 规则框架 —— **与日志格式无关**
#
# 这里只做四件事：调度规则、求值表达式、调算子、发射 finding。
# 它不认识任何 topic 名 / 字段名 / 码值 —— 那些全在 providers/<格式>.py 与
# knowledge/<格式>/facts.yaml 里。判据：本文件里 grep 不到 \`vehicle_\` / \`ver_sw\` / \`cpuload\`
# 之类的名字（tools/calibrate/lint_rules.py 有一条检查盯着）。
#
# 数据从哪来：providers/api.py 的契约。provider 由 open_log() 按文件头挑出来，
# 本文件只调它的 get_topic_meta/get_topic_data/get_series/has_topic/match_version/
# get_logged_information/get_initial_parameters/get_logged_messages/
# builtin_variables/get_report_facts 与可选能力，不碰 pyulog 对象。
# ============================================================================

import json
import ast
import math
import re
import numpy as np


# 故障知识库（构建期内联，第三层检索用）
FAULT_KB = __FAULT_KB__

# ---------------- 经验规则（rules/*.yaml 编译而来）----------------
RULES = json.loads(r"""__RULES__""")

# ---------------- 那一份数据文件（knowledge/<格式>/facts.yaml 编译而来）----------------
# 码表、文案、展示口径、规则元数据、执行顺序都在里面；引擎只提供机制。
# 它同时也是 provider 的数据源（随 open_log 一起传进去）。
# **按 JSON 解析**（与 RULES 同款）：它里面可能有 true / false / null（绘图预设的开关），
# 那些不是合法的 Python 字面量——当字面量注入会直接 NameError。
FACTS = json.loads(r"""__FACTS__""")

# ---------------- 字段单位表（构建期查好的，只含写了 unit= 的引用涉及的字段）----------------
# 源单位从 meta/<tag>.json 查（经 meta/topic-map.yaml 换字典键）、meta/topic-overrides.yaml
# 可补/纠。查不到的构建期会告警并在产物里留空——这里拿不到就**不换算**。
# 键是 \`topic.field\`（日志里的名字，不是字典键），值是规范化后的单位名（见 _UNIT_FACTORS）。
FIELD_UNITS = __FIELD_UNITS__

# 同一 group 内多条规则按 order 字段排序（缺省 100000，再按 id 兜底）。
# **跨 group 的顺序不在这里决定**：由 facts.yaml 的 group_order 决定（见文件末尾的执行循环），
# 而 finding 的 id（F01、F02…）按发射顺序生成，所以改 group_order 会改报告里的编号。
RULES.sort(key=lambda r: (r.get("order", 100000), r.get("id", "")))

# 阈值不再集中存放：每条经验的判定阈值都写在它自己的 rules/*.yaml 里
# （px4-thresholds.toml 已退场）。本文件只保留引擎级格式常量。

# ---------------- 打开日志（挑适配器 + 契约自检）----------------
provider = open_log(bytes(ulog_bytes), FACTS)

# 下面这批累加器由 run_all()（文件末尾）在入口**重置**。声明留在模块级是因为
# add / add_tag / ran / skipped / _run_rules 都直接往它们里追加（靠模块名字找）——
# 入口只重绑，不改变这些辅助函数的写法。
findings = []
checks_run = []
checks_skipped = []
tags = []  # 第二层异常标签（喂给第三层故障库匹配）
guard_tags = []  # 数据质量/边界标签
_fid = [0]
# 阶段集合来自 provider（故障库按 flight_phase 匹配用它）——在 run_all() 里填充
phases_present = set()
# 规则顺带产出的实测值（概览指标优先用它们，见 run_all 里的指标组装）
metrics = {}


def add_tag(t):
    if t not in tags:
        tags.append(t)


def add(
    severity,
    rule_id,
    tag,
    title,
    field,
    value,
    threshold=None,
    unit=None,
    doc=None,
    suggestion=None,
    tags_extra=None,
):
    _fid[0] += 1
    ev = {"field": field, "value": value}
    if threshold is not None:
        ev["threshold"] = threshold
    if unit is not None:
        ev["unit"] = unit
    f = {
        "id": "F%02d" % _fid[0],
        "severity": severity,
        "ruleId": rule_id,
        "tag": tag,
        "title": title,
        "evidence": ev,
    }
    if doc:
        f["docUrl"] = doc
    if suggestion:
        f["suggestion"] = suggestion
    findings.append(f)
    if tag:
        add_tag(tag)
    for te in tags_extra or []:
        add_tag(te)


def skipped(check, reason):
    item = {"check": check, "reason": reason}
    if item not in checks_skipped:
        checks_skipped.append(item)


def ran(check):
    if check not in checks_run:
        checks_run.append(check)


# ---------------- 受限表达式求值 ----------------
_ALLOWED_NODES = (
    ast.Expression,
    ast.BoolOp,
    ast.And,
    ast.Or,
    ast.UnaryOp,
    ast.Not,
    ast.USub,
    ast.Compare,
    ast.Lt,
    ast.LtE,
    ast.Gt,
    ast.GtE,
    ast.Eq,
    ast.NotEq,
    ast.In,
    ast.NotIn,
    ast.Is,
    ast.IsNot,
    ast.BinOp,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.Mod,
    ast.Name,
    ast.Load,
    ast.Constant,
    ast.List,
    ast.Tuple,
    ast.Set,
    # f-string（证据值用：\`value: f"{vibe_mean:.3f}"\`）。它的占位符里还是普通表达式，
    # 求值仍在同一个空 __builtins__ 环境下，没有新能力。
    ast.JoinedStr,
    ast.FormattedValue,
)

# 表达式里**唯一**放行的函数调用。\`has_topic('x')\` 比 \`'x' in topics\` 直白，
# 但把它做成函数就意味着要开"允许调用"这个口子，所以白名单只此一项、
# 且要求实参是字符串字面量。其余能力（属性/下标/推导式）一律不给。
_EXPR_CALLABLE = {"has_topic"}


def _eval_expr(expr, env):
    """受限表达式求值：先按白名单遍历 AST，再在空 __builtins__ 下求值。

    绝不 eval 用户可控代码：不允许属性访问、下标、推导式；函数调用只放行
    \`_EXPR_CALLABLE\` 里的那几个，且实参必须是字符串字面量。
    """
    tree = ast.parse(expr, mode="eval")
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            ok = isinstance(node.func, ast.Name) and node.func.id in _EXPR_CALLABLE
            arg_ok = len(node.args) == 1 and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str)
            if not (ok and arg_ok and not node.keywords):
                raise ValueError("表达式里只允许 %s('字符串')：%s" % ("/".join(sorted(_EXPR_CALLABLE)), expr))
            continue
        if not isinstance(node, _ALLOWED_NODES):
            raise ValueError("表达式含不允许的语法 %s：%s" % (type(node).__name__, expr))
    return eval(compile(tree, "<rule>", "eval"), {"__builtins__": {}}, env)


def _precheck_hit(spec, env):
    """\`conditions.precheck\`：一串先决条件，命中任意一条就不跑本条。

    与 \`topics\` 的分工：\`topics\` 只回答"日志里有没有这个 topic"，这里放**要算一遍才知道的
    适用范围**——如 \`not HAS_ARMED\`（没有 armed 段就谈不上零偏判定、机动段统计）。
    在 compute **之前**求值，所以只认内置变量与 \`has_topic()\`，拿不到 compute 的输出。

    **返回命中的那条表达式原文**（没命中返回 None）——它就是 skipped 的原因文案：作者写的
    本来就是一句可读的判据，不必再翻译一遍。表达式本身出错（名字写错、取值缺失）当作
    **未命中**：宁可多跑一条，也别把整条误杀。

    注意这里**没有**"数据不足"这条：compute 算不出来本来就会留痕，见 \`_run_rules\`。
    """
    for when in spec or []:
        try:
            if _eval_expr(when, env):
                return when
        except Exception:
            continue
    return None


def _airframe_label(spec):
    """机架约束的展示写法（只用于 skipped 文案）：列表用 \` / \` 连接。"""
    if isinstance(spec, list):
        return " / ".join(str(s).strip() for s in spec)
    return str(spec).strip()


def _match_airframe(spec, env):
    """机架适用范围：\`any\` ｜ 单个机架名 ｜ 列表（如 \`[fixed_wing, unknown]\`）。

    **只做字符串精确比对，不解释语义**：拿 provider 在 \`builtin_variables()\` 里报的
    \`AIRFRAME\` 值去比（PX4 报 rotary_wing / fixed_wing / vtol / rover / unknown）。
    所以换一种日志格式不用改这里——它的机架词表由它自己的适配器定义。

    写成 \`IS_FIXED_WING or AIRFRAME == 'unknown'\` 那种表达式是旧写法，构建期已拦。
    """
    if isinstance(spec, str):
        name = spec.strip()
        if name == "any":
            return True
        wanted = [name]
    elif isinstance(spec, list):
        if not spec:
            raise ValueError("airframe 列表为空（不限就写 any）")
        wanted = [str(s).strip() for s in spec]
    else:
        raise ValueError("airframe 必须是 any / 机架名 / 列表，收到 %r" % (spec,))
    current = (env or {}).get("AIRFRAME")
    return current is not None and str(current) in wanted


def _missing_topics(spec):
    """\`conditions.topics\` 的判定：每项是「候选 topic」，项间是「都要有」。

    一项里有多个候选（YAML 里写成 \`vehicle_gps_position || sensor_gps\`）时，
    **其中任意一个在日志里就算满足**；两个都不在才跳过。命中第一项即中止——
    与过去 skip 列表命中第一条的语义相同。

    返回缺失项的原因文案（\`"a / b not in log"\`），全都有则返回 None。
    文案只在这里生成一处：构建期只负责把 \`a || b\` 拆成候选列表，不认识语义。
    """
    for candidates in spec or []:
        if not any(provider.has_topic(t) for t in candidates):
            return " / ".join(candidates) + " not in log"
    return None


def _pick_ref(name, *more, alias=None, unit=None, instance=None):
    """候选组按顺序取第一个存在的 → \`(序列, 命中的 bare "topic.field")\`；都没有 → \`(None, None)\`。

    与 \`_ref\` 是同一件事，区别只在**回传命中的是哪个字段**——地图轨迹要用它去同一 topic 上
    取时间戳与定位类型（\`fix_type\`），图上的时间轴也要。\`instance\` 非 None 时**覆盖**引用里
    写的实例切片（图上"每实例一个面板"用：声明里写 \`[:]\`，具体画第几个由这一层定）；
    写死的 \`[N]\` 不受它影响。
    """
    for cand in (name, *more):
        bare, inst = _split_ref(cand)
        if instance is not None and isinstance(inst, slice):
            inst = instance
        series = provider.get_series(bare, instance=inst, alias=alias)
        if series is None:
            continue
        if unit is not None:
            scale = _unit_scale(FIELD_UNITS.get(bare), unit)
            if scale is not None:
                series = _scale_series(series, scale)
        return series, bare
    return None, None


def _ref(name, *more, alias=None, unit=None):
    """字段取数：表达式里的 \`ref("topic.field", ...)\` 与裸写的 \`topic.field\` 都走这里。

    字段名有两种下标，别混：
      \`topic.field\` / \`topic[:].field\` —— **所有实例**（两种写法等效）。多实例时给
                          「每实例一组」的列表，交给需要分组的算子；**只有一个实例时
                          就是那一条序列**（与写 \`[0]\` 同形），所以单实例字段照旧直接算
      \`topic[N].field\` —— 只取第 N 个实例（N 可为负）
      \`topic.field[N]\` —— 数组字段的元素下标（如 \`vehicle_attitude.q[0]\`）

    **位置参数可以给多个**：\`ref("新名", "旧名")\` 是候选组——按顺序取第一个在日志里
    存在的；都没有返回 None，由数据流自己中止。改名的场合一律用它，**没有"这个引用只
    适用于某版本"这种写法**（升级换代就是"老名字没了、新名字在"，按存在性挑就够——
    真需要按版本分流的语义差异，交给算子或拆成两条规则）。

    修饰：
      alias    —— 字段的备用命名（旧固件改过名），等价于放进候选组
      unit     —— **期望输出的单位**：源单位由构建期从 meta/override 查好，这里只做一次
                  乘法。不写就是不换算（无量纲字段）。源单位查不到时构建期已告警，这里
                  按原样给——宁可不换算，也别悄悄乘错系数。

    取数本身由 provider 实现（契约：取不到返回 None，不抛异常）——存在性判据就是它。
    **要回传"命中的是哪个字段"用 \`_pick_ref\`**（图与地图用），这里只是它的薄壳。
    """
    return _pick_ref(name, *more, alias=alias, unit=unit)[0]


def _split_ref(ref):
    """\`"topic[:].field"\` → ("topic.field", slice(None, None))；\`[N]\` → int；**不写也是 slice**。

    实例说明交给 provider 直接用下标取（Python 的 int/切片语义），这里只负责拆开。
    """
    m = re.match(r"^([a-z][a-z0-9_]*)(?:\[([-]?\d*(?::-?\d*)?)\])?\.(.+)$", str(ref))
    if not m:
        return str(ref), 0
    return "%s.%s" % (m.group(1), m.group(3)), _parse_inst(m.group(2))


def _parse_inst(txt):
    """\`[2]\` → int；\`[:]\` / \`[1:3]\` / **不写** → slice（不写就是"所有实例"）。形状由构建期保证。"""
    if txt is None or txt == "":
        return slice(None, None)
    if ":" in txt:
        a, _, b = txt.partition(":")
        return slice(int(a) if a else None, int(b) if b else None)
    return int(txt)


# ---------------- 单位换算 ----------------
# 只服务 \`ref(..., unit="期望单位")\`。按「到族基准单位的因子」定义：族内可换、跨族不行
# （跨族在构建期就报错了）。键是**规范化后**的单位名——构建期把 meta 里那些自由文本
# （"metres" / "radians" / "us"…）统一成这一套，运行期不再认别名的拼法。
_UNIT_FACTORS = {
    # 长度（基准 m）
    "m": ("len", 1.0),
    "mm": ("len", 1e-3),
    "cm": ("len", 1e-2),
    # 角度（基准 rad）。degE7 = 度 × 1e7，PX4 经纬度的老口径
    "rad": ("angle", 1.0),
    "deg": ("angle", math.pi / 180),
    "dege7": ("angle", 1e-7 * math.pi / 180),
    # 时间（基准 s）
    "s": ("time", 1.0),
    "ms": ("time", 1e-3),
    "us": ("time", 1e-6),
}


def _unit_scale(src, dst):
    """从 src 换到 dst 的乘数；任一边认不出、或跨族 → None（构建期已经查过一遍）。"""
    a = _UNIT_FACTORS.get(str(src or "").strip().lower())
    b = _UNIT_FACTORS.get(str(dst or "").strip().lower())
    if not a or not b or a[0] != b[0]:
        return None
    return a[1] / b[1]


def _scale_series(x, scale):
    """按因子缩放一条序列。数组字段是「每元素一列」，分组取数是「每实例一组」——都递归下去。"""
    if x is None:
        return None
    if isinstance(x, list):
        return [_scale_series(v, scale) for v in x]
    return np.asarray(x, dtype=float) * scale


# ---------------- compute 表达式求值 ----------------
# 产物里存的**就是作者写的原文**：
#   vibe_mean, vibe_p95, ..., imu_idx = worst_mean_stats(ref("...[:]"), min_mean=0)
#   pct = frac * 100
#   p99_stat = p99 if seg_n > 50 else None
#
# 求值用 Python 自带的 ast，**不 eval 作者原文**：先按白名单遍历、把 topic.field 重写成
# 取数调用，再在空 __builtins__ 下 exec。构建期（web/scripts/lib/rule-expr.mjs）已经把
# 算子名/入参/变量声明校验过一遍，这里再查一遍是为了防"构建期放行、运行期能执行任意代码"
# 这类缝——两道关卡的判据不同，不能只留一道。

# 比 _ALLOWED_NODES 多出：赋值语句、调用、属性（字段引用）、三元、字典（算子选项）
_ALLOWED_COMPUTE = _ALLOWED_NODES + (
    ast.Module,
    ast.Assign,
    ast.Expr,
    ast.Store,
    ast.Call,
    ast.Attribute,
    ast.keyword,
    ast.IfExp,
    ast.Dict,
)


class _ComputeRefs(ast.NodeTransformer):
    """把表达式里裸写的 \`topic.field\` 重写成 \`ref("topic.field")\`。

    只接受 \`Name.attr\` 形态，且这个 Name **不能是已声明的变量**——否则 \`变量.属性\` 会去
    访问对象属性（那是任意能力，白名单不给）。构建期已经拦过一遍，这里是运行期的那道。
    """

    def __init__(self, env_keys):
        self.env_keys = env_keys

    def visit_Attribute(self, node):
        if not isinstance(node.value, ast.Name):
            raise ValueError("字段引用必须是 topic.field 形式")
        if node.value.id in self.env_keys:
            raise ValueError("%s 是变量名，不能当 topic 用" % node.value.id)
        return ast.copy_location(
            ast.Call(
                func=ast.Name(id="ref", ctx=ast.Load()),
                args=[ast.Constant(value="%s.%s" % (node.value.id, node.attr))],
                keywords=[],
            ),
            node,
        )


def _compile_compute(stmt, env_keys):
    """一条 compute 表达式 → (code, guarded, targets)。校验不通过就抛异常。"""
    try:
        tree = ast.parse(stmt, mode="exec")
    except SyntaxError as err:
        raise ValueError("compute 表达式语法错误：%s" % err)
    if len(tree.body) != 1 or not isinstance(tree.body[0], ast.Assign):
        raise ValueError("compute 必须是一条赋值")
    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_COMPUTE):
            raise ValueError("compute 表达式含不允许的语法 %s" % type(node).__name__)
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise ValueError("compute 只允许直接调用算子")
            if node.func.id not in OPERATORS and node.func.id not in ("ref", "_try", "has_topic"):
                raise ValueError("compute 调用了未注册的算子 %s" % node.func.id)

    assign = tree.body[0]
    if not isinstance(assign.targets[0], ast.Tuple):
        if not isinstance(assign.targets[0], ast.Name):
            raise ValueError("compute 的赋值目标只能是变量名")
        targets = [assign.targets[0].id]
    else:
        if not all(isinstance(e, ast.Name) for e in assign.targets[0].elts):
            raise ValueError("compute 的赋值目标只能是变量名")
        targets = [e.id for e in assign.targets[0].elts]

    # _try(...)：容错求值，等价于老节点的 optional: true——内层出错就整个赋 None，
    # 而不是中止整条规则。
    guarded = False
    val = assign.value
    if isinstance(val, ast.Call) and isinstance(val.func, ast.Name) and val.func.id == "_try":
        if len(val.args) != 1 or val.keywords:
            raise ValueError("_try() 只接受一个参数")
        guarded = True
        assign.value = val.args[0]

    tree = _ComputeRefs(set(env_keys)).visit(tree)
    ast.fix_missing_locations(tree)
    return compile(tree, "<compute>", "exec"), guarded, targets


# 表达式求值的名字表：算子按注册名直接可调用，另加 ref（取数）与 has_topic。
# __builtins__ 置空——表达式里不该有任何 Python 内置能力。
_COMPUTE_GLOBALS = {"__builtins__": {}, "ref": None}
_COMPUTE_GLOBALS.update(OPERATORS)


def _eval_compute(stmt, env, ref_fn=None):
    """求值一条 compute 表达式，结果写进 env。

    ref_fn：把表达式里的 \`ref(...)\` 换成别的实现（图上"每实例一个面板"要覆盖实例切片，
    见 \`_pick_ref\` 的 instance）。不传就是规则那套 \`_ref\`。

    空值语义（与老节点链的唯一差别，**有意为之**）：
      老写法里 \`optional: false\` 的节点拿到 None 就整条规则中止，\`optional: true\` 的才允许
      None 继续传播。表达式写法里只有一条规则：**None 是值，照常传播**；要中止就让异常发生
      （拿 None 去比较/四则会抛 TypeError）。老写法靠 \`_try(...)\` 保留"允许 None"的那半边，
      另一半（无谓的中止）不保留——因为它只是让同样的结论晚一步消失，而"None 传播"更好读。

      实际影响面很窄：只有当某个表达式产出 None、而**下游又把这个 None 变成了别的值**
      （coalesce / choose / 三元）时才会看到差别；现有规则里这类位置都带 _try 守卫
      （6 条日志的冻结基线逐字段比对可证）。新写规则时若真的依赖"缺失即中止"，
      就显式写 \`require_true(is_not_none(x))\`——那正是它的用途。
    """
    code, guarded, targets = _compile_compute(stmt, env)
    glb = _COMPUTE_GLOBALS if ref_fn is None else {**_COMPUTE_GLOBALS, "ref": ref_fn}
    try:
        exec(code, glb, env)
    except Exception:
        if not guarded:
            raise
        for name in targets:
            env[name] = None


_COMPUTE_GLOBALS["ref"] = _ref
_COMPUTE_GLOBALS["has_topic"] = provider.has_topic


def _rule_env():
    """一条规则求值时的名字空间：内置变量（provider 给）+ 框架补的一个。

    每次都要新的一份：compute 的输出直接写进这个 dict。
      has_topic() —— 表达式里唯一放行的函数调用，指向 provider.has_topic
    """
    env = provider.builtin_variables()
    env["has_topic"] = provider.has_topic
    return env


def _run_rules(group):
    """执行声明了该 group 的经验规则。

    finding 的 id 是按发射顺序（F01、F02…）生成的，所以每条规则的 group **必须与
    它所替换的原过程式检查的位置一致**；同一 group 内按 order / id 排序执行。
    """
    for _rule in RULES:
        if _rule.get("group") != group:
            continue
        _rid = _rule["id"]
        _checks = (_rule.get("outputs") or {}).get("check")
        if _checks is None:
            _checks = []  # guards 类经验没有 check 名（不记 ran/skipped）
        elif not isinstance(_checks, list):
            _checks = [_checks]
        _env = _rule_env()
        # 适用范围（\`conditions\`）依次判：固件 / 机架 / 先决条件 / 依赖的 topic。
        # 固件那轴与 provider.match_version 同一套语法（any / ">=1.15" / ">=1.14,<1.15"），
        # 机架那轴是 \`any\` / 机架名 / 列表。
        # **不满足一律记一条 skipped 并带上自动文案**：报告里要能看出"这条为什么没跑"，
        # 而不是让读者以为它跑过了、或者根本没人写过这条经验。
        # （轴约束写成了解析不了的串时静默退出——那是规则的笔误，构建期本来就会拦。）
        _not_applicable = None
        try:
            if not provider.match_version(_rule["firmware"]):
                _not_applicable = "固件不满足 %s" % _rule["firmware"]
            elif not _match_airframe(_rule["airframe"], _env):
                _not_applicable = "机架不适用 %s" % _airframe_label(_rule["airframe"])
        except Exception:
            _not_applicable = None
        if _not_applicable:
            for _check in _checks:
                skipped(_check, _not_applicable)
            continue
        # 依赖的 topic：缺了记一条（文案自动生成，见 _missing_topics）
        _missing = _missing_topics(_rule.get("topics"))
        if _missing:
            for _check in _checks:
                skipped(_check, _missing)
            continue
        # 先决条件：命中的那条条件原文就是原因（它本来就是作者写的一句判据）
        _pre = _precheck_hit(_rule.get("precheck"), _env)
        if _pre:
            for _check in _checks:
                skipped(_check, "先决条件命中：%s" % _pre)
            continue
        # ── 三步里的第二步：算 ──
        # 算不出来就记一条 skipped（"数据不足"），所以 ran() 只能放在 compute **成功之后**——
        # 同一条 check 不能既是 ran 又是 skipped。原先靠 \`ran_on_success\` 表达的那半边
        # （原实现把 ran() 放在数据判定之后）现在成了默认，那个字段已删。
        _ok = True
        for _stmt in _rule.get("compute") or []:
            # compute 是**表达式**，求值出来的名字进 _env，供后面的表达式与 triggers / outputs 引用。
            try:
                _eval_compute(_stmt, _env)
            except Exception:
                _ok = False
                break
        if not _ok:
            for _check in _checks:
                skipped(_check, "数据不足，本条没算出结论")
            continue
        # ran_when：算出来了、但还不算"跑过"（如姿态那条要有足够的机动段样本）。
        # 不满足就静默——它跟"数据不足"不是一回事。
        _ran_ok = True
        if _rule.get("ran_when") is not None:
            try:
                _ran_ok = bool(_eval_expr(_rule["ran_when"], _env))
            except Exception:
                _ran_ok = False
        if _ran_ok:
            for _check in _checks:
                ran(_check)

        _out = _rule["outputs"]
        # outputs.guard_tags：按条件产生的数据质量标签（等价于原过程式的 guard_tags.append，
        # 不依赖是否发出 finding——如陀螺零偏的“温度变化大”）
        for _gspec in _out.get("guard_tags") or []:
            try:
                _g_hit = _eval_expr(_gspec["when"], _env)
            except Exception:
                _g_hit = False
            if _g_hit and _gspec.get("tag") and _gspec["tag"] not in guard_tags:
                guard_tags.append(_gspec["tag"])
        for _key, _spec in (_out.get("stats") or {}).items():
            _v = _env.get(_spec["var"])
            if _v is None:
                continue
            metrics[_key] = round(float(_v), int(_spec["round"])) if "round" in _spec else _v

        # foreach: 把一条规则算出的「事件列表」展开成多条 finding（如 failsafe 的每次边沿）。
        # 事件 dict 的键会叠加进模板环境，所以文案仍写在经验文件里；
        # 每个事件最多命中一条 trigger（自上而下第一条），与单事件规则一致。
        # foreach 支持两种写法：\`foreach: events\` 或
        # \`foreach: {var: events, keys: [t_s]}\`（后者让构建期能校验事件键的占位符）
        _for_spec = _rule.get("foreach")
        _for_key = _for_spec.get("var") if isinstance(_for_spec, dict) else _for_spec
        if _for_key:
            _items = _env.get(_for_key) or []
        else:
            _items = [None]
        for _item in _items:
            _tenv = _env
            if _item is not None:
                if not isinstance(_item, dict):
                    continue
                _tenv = dict(_env)
                _tenv.update(_item)
            for _trig in _rule.get("triggers") or []:
                # 单条触发条件出错（例如表达式把缺失值 None 与数值比较）不应让整份日志
                # 的分析崩掉：视为未命中，继续下一条。这类错误应当在基线回归里暴露。
                try:
                    _hit = _eval_expr(_trig["when"], _tenv)
                except Exception:
                    _hit = False
                if not _hit:
                    continue
                # 证据值就是一个**表达式**：写变量得原值、写 f"{x:.3f}" 得格式化后的串、
                # 写常量就得到常量。
                _val = None
                if _trig.get("value") is not None:
                    try:
                        _val = _eval_expr(str(_trig["value"]), _tenv)
                    except Exception:
                        _val = None
                _field = _trig["field"]
                if "{" in _field:
                    _field = _field.format_map(_tenv)
                # suggestion 同样允许占位符（如 "涉及：{names}。"），与 title 一致
                _sugg = _trig.get("suggestion")
                if _sugg and "{" in _sugg:
                    _sugg = _sugg.format_map(_tenv)
                add(
                    _trig["severity"],
                    _rid,
                    _trig.get("tag", _out.get("tag")),
                    _trig["title"].format_map(_tenv),
                    _field,
                    _val,
                    _trig.get("threshold"),
                    _trig.get("unit"),
                    _rule.get("doc"),
                    _sugg,
                )
                # evidence_extra: {evidence 键: 变量名}，把额外证据挂到刚发出的 finding 上
                # （如日志消息的 samples 原文列表）
                for _ek, _evn in (_trig.get("evidence_extra") or {}).items():
                    _evv = _tenv.get(_evn)
                    if _evv is not None:
                        findings[-1]["evidence"][_ek] = _evv
                break


# ---------------- 概览指标（knowledge/<格式>/facts.yaml 的 metrics）----------------
# 规则顺带产出的实测值优先（更贴合判定口径）；规则没跑（缺字段 / 机型不适用）时按声明兜底现算，
# 这样用户在「关键数据」里始终看得到数，不会因为某条规则 skip 就凭空少几项。
# （累加器 metrics 在文件开头声明，由 run_all() 重置。）
_M_RESERVED = {"key", "label", "unit", "topic", "field", "fields", "op", "pick", "scale", "round"}


def _metric_fallback(m):
    """按声明现算一个概览指标；任何一步缺失都返回 None（这一项就不显示）"""
    try:
        topic = m.get("topic")
        if not topic:
            return None
        fields = m.get("fields") or ([m["field"]] if m.get("field") is not None else [])
        if not isinstance(fields, list):
            fields = [fields]
        args = []
        for cand in fields:
            names = cand if isinstance(cand, list) else [cand]  # 候选字段名：取第一个存在的
            col = provider.get_first_existing_column(topic, names)
            if col is None:
                return None
            args.append(np.asarray(col, dtype=float))
        name = m.get("op")
        if name not in OPERATORS:
            return None
        res = OPERATORS[name](*args, **{k: v for k, v in m.items() if k not in _M_RESERVED})
        if res is None:
            return None
        pick = m.get("pick")
        if pick:
            outs = list(res) if isinstance(res, tuple) else [res]
            out_names = SIGNATURES.get(name, {}).get("out_names") or []
            if pick not in out_names:
                return None
            res = outs[out_names.index(pick)]
        val = float(res)
        if m.get("scale") is not None:
            val = val * float(m["scale"])
        if "round" in m:
            _r = int(m["round"])
            val = round(val, _r)
            return int(val) if _r == 0 else val  # round(x, 0) 仍是 float，整数量要转回 int
        return val
    except Exception:
        return None


# ---------------- 第三层：故障知识库确定性匹配 ----------------
def match_fault_kb():
    phases = phases_present
    active_tags = set(tags)
    matched = []
    for e in FAULT_KB:
        trig = e.get("trigger_tags", [])
        e_phases = e.get("flight_phase", ["all"])
        excl = e.get("exclude_tags", [])
        if not any(t in active_tags for t in trig):
            continue
        if any(x in guard_tags or x in active_tags for x in excl):
            continue
        if "all" not in e_phases:
            if not any(p in phases for p in e_phases):
                continue
        matched.append(
            {
                "faultId": e["fault_id"],
                "faultTag": e["fault_tag"],
                "riskLevel": e.get("risk_level", ""),
                "possibleRootCause": e.get("possible_root_cause", []),
                "troubleshootingSteps": e.get("troubleshooting_steps", []),
                "note": e.get("note", ""),
                "matchedPhases": [p for p in e_phases if p == "all" or p in phases],
            }
        )
    return matched


def run_all():
    """跑完全部规则，返回报告头的判定产物（= 交给前端的 report）。

    为什么是具名入口而不是模块级代码：原先它靠"执行脚本的副作用"——谁去读全局 \`__result\`
    谁就顺手把规则跑了，调用顺序还被隐式约束着（\`__result\` 是同一个全局，读 report 必须早于
    读 manifest）。现在交付边界有具名用例，由 \`report_data.np_report()\` 调这个函数。

    **入口先重置累加器**：\`add\` / \`add_tag\` / \`ran\` / \`skipped\` / \`_run_rules\` 都是往模块级的
    它们里追加的，不重置就会二次调用时累加。
    """
    global findings, checks_run, checks_skipped, tags, guard_tags, _fid, phases_present, metrics
    findings = []
    checks_run = []
    checks_skipped = []
    tags = []
    guard_tags = []
    _fid = [0]
    metrics = {}
    # 阶段集合来自 provider（故障库按 flight_phase 匹配用它）
    phases_present = set(provider.get_report_facts().get("phases") or [])

    # guards_early：必须在其它规则之前跑，保证 insufficient_data 是第一个 guard 标签
    # ---------------- 按 group_order 顺序执行各 group ----------------
    # 顺序即 finding 编号（F01、F02…）的生成顺序，也决定 guard 标签的先后
    # （guards_early 排第一，insufficient_data 才会是第一个 guard 标签）。
    # 新增经验只需把 group 写进 facts.yaml 的 group_order（或复用已有 group）
    # 并让经验里的 group 对上——**不用改这个文件**；构建期会校验 group 是否都已登记。
    for _group in FACTS["group_order"]:
        _run_rules(_group)

    # 短日志由 guard 标签派生（阈值的唯一来源是 guard-short-log.yaml）
    short_log = "insufficient_data" in guard_tags
    matched_faults = [] if short_log else match_fault_kb()

    _metric_entries = []
    _declared = set()
    for _m in FACTS.get("metrics", []):
        _key = _m.get("key")
        if not _key:
            continue
        _declared.add(_key)
        _val = metrics.get(_key)
        if _val is None:
            _val = _metric_fallback(_m)
        if _val is None:
            continue
        _entry = {"key": _key, "label": _m.get("label", _key), "value": _val}
        if _m.get("unit"):
            _entry["unit"] = _m["unit"]
        _metric_entries.append(_entry)
    # 规则产出、但没在 facts.yaml 里声明的（别丢，直接用键名当名字）
    for _key, _val in metrics.items():
        if _key not in _declared:
            _metric_entries.append({"key": _key, "label": _key, "value": _val})

    order = {"critical": 0, "warning": 1, "info": 2}
    findings.sort(key=lambda f: order.get(f["severity"], 9))

    return {
        "platform": "PX4",
        "parserVersion": provider.parser_version(),
        # 事实层产出：facts=日志是什么（离散，驱动判定）；metrics=关键数字（有序，带中文名与单位）
        "facts": provider.get_report_facts(),
        "metrics": _metric_entries,
        # 判定层产出（规则与故障库）
        "tags": tags,
        "guardTags": guard_tags,
        "checksRun": checks_run,
        "checksSkipped": checks_skipped,
        "matchedFaults": matched_faults,
        "findings": findings,
    }
`
  .replace("__FAULT_KB__", JSON.stringify(faultKbJson.entries))
  .replace("__RULES__", JSON.stringify(rules))
  .replace("__FACTS__", JSON.stringify(facts))
  .replace("__FIELD_UNITS__", JSON.stringify(fieldUnits));
