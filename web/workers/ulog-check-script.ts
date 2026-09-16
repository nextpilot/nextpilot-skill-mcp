// ⚠️ 自动生成，请勿手改。源文件在 engine/ 与 knowledge/px4/，改完跑 `pnpm build:kb`（dev/build 自动执行）。
import faultKbJson from "./fault-kb.generated.json";

const rules = [{"id":"px4-airspeed-invalid","name":"空速健康","group":"airspeed","order":1,"firmware":"True","airframe":"is_fixed_wing or airframe == 'unknown'","skip":[{"when":"airframe == 'unknown'","reason":"机型未知，无法判定固定翼巡航段"},{"when":"not has_topic('vehicle_attitude_setpoint')"},{"when":"no_data","reason":"无固定翼巡航段或未记录 airspeed_validated"},{"when":"not has_topic('airspeed_validated')","reason":"无固定翼巡航段或未记录 airspeed_validated"}],"compute":["cruise_ok = require_true(masked_any_in(vehicle_status.nav_state, vehicle_status.timestamp, armed_intervals, codes=[3, 8]))","invalid_frac = _try(ratio_equal( ref(\"airspeed_validated.airspeed_sensor_measurement_valid\"), value=0))","has_invalid = invalid_frac is not None","tas_min = _try(min(airspeed_validated.true_airspeed_m_s))"],"triggers":[{"when":"has_invalid and invalid_frac >= 0.50","severity":"critical","tag":"low_airspeed","threshold":0.5,"value":"f\"{invalid_frac:.3f}\"","field":"airspeed_validated.airspeed_sensor_measurement_valid","title":"空速传感器在固定翼段大部分时间无效（{invalid_frac:.0%} 样本）","suggestion":"结合故障库 F009：空速失效极易引发失速，检查空速管堵塞/积水、管路漏气与校准。"},{"when":"has_invalid and invalid_frac >= 0.10","severity":"warning","tag":"low_airspeed","threshold":0.1,"value":"f\"{invalid_frac:.3f}\"","field":"airspeed_validated.airspeed_sensor_measurement_valid","title":"空速传感器间歇无效（{invalid_frac:.0%} 样本）","suggestion":"结合故障库 F009 检查空速管与管路密封。"}],"emit":{"tag":"low_airspeed","stats":{"airspeedInvalidRatio":{"var":"invalid_frac","round":3},"airspeedMinM":{"var":"tas_min","round":1}},"check":"airspeed","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"airspeed"},{"id":"px4-attitude-oscillation","name":"姿态误差高频振荡","group":"attitude_tracking","order":2,"version":"1.1.0","firmware":"True","airframe":"True","skip":[{"when":"not has_armed","reason":"vehicle_attitude(_setpoint) 或 armed 段缺失"},{"when":"not has_topic('vehicle_attitude') or not has_topic('vehicle_attitude_setpoint')","reason":"vehicle_attitude(_setpoint) 或 armed 段缺失"}],"ran_when":"seg_ok","compute":["p99, osc_hz, seg_n = _try(att_tracking_stats(\n  att_q=vehicle_attitude.q,\n  sp_q=vehicle_attitude_setpoint.q_d,\n  sp_roll=vehicle_attitude_setpoint.roll_body,\n  sp_pitch=vehicle_attitude_setpoint.pitch_body,\n  att_ts=vehicle_attitude.timestamp,\n  sp_ts=vehicle_attitude_setpoint.timestamp,\n  intervals=armed_intervals,\n  fw_minor=fw_minor,\n  tilt_min_deg=10.0, min_samples=50, sample_rate=50))","seg_ok = seg_n > 50 if seg_n else False","p99_stat = p99 if seg_ok else None","osc_stat = osc_hz if seg_ok else None"],"triggers":[{"when":"osc_stat >= 4.0 and p99_stat >= 25.0 and is_fixed_wing","severity":"warning","tag":"attitude_overshoot","threshold":4,"value":"f\"{osc_stat:.2f}\"","unit":"Hz","field":"姿态跟踪误差符号翻转频率","title":"姿态误差高频振荡（约 {osc_stat:.1f} Hz）","suggestion":"振荡多与控制增益/机架共振相关，禁用大幅调参，先做频响检查。"},{"when":"osc_stat >= 4.0 and p99_stat >= 15.0 and not is_fixed_wing","severity":"warning","tag":"attitude_overshoot","threshold":4,"value":"f\"{osc_stat:.2f}\"","unit":"Hz","field":"姿态跟踪误差符号翻转频率","title":"姿态误差高频振荡（约 {osc_stat:.1f} Hz）","suggestion":"振荡多与控制增益/机架共振相关，禁用大幅调参，先做频响检查。"}],"emit":{"tag":"attitude_overshoot","stats":{"attitudeErrDegP99":{"var":"p99_stat","round":1},"attitudeOscHz":{"var":"osc_stat","round":2}},"check":"attitude_tracking","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"attitude"},{"id":"px4-attitude-overshoot","name":"姿态跟踪超调","group":"attitude_tracking","order":1,"version":"1.1.0","firmware":"True","airframe":"True","skip":[{"when":"not has_armed","reason":"vehicle_attitude(_setpoint) 或 armed 段缺失"},{"when":"not has_topic('vehicle_attitude') or not has_topic('vehicle_attitude_setpoint')","reason":"vehicle_attitude(_setpoint) 或 armed 段缺失"}],"ran_when":"seg_ok","compute":["p99, osc_hz, seg_n = _try(att_tracking_stats(\n  att_q=vehicle_attitude.q,\n  sp_q=vehicle_attitude_setpoint.q_d,\n  sp_roll=vehicle_attitude_setpoint.roll_body,\n  sp_pitch=vehicle_attitude_setpoint.pitch_body,\n  att_ts=vehicle_attitude.timestamp,\n  sp_ts=vehicle_attitude_setpoint.timestamp,\n  intervals=armed_intervals,\n  fw_minor=fw_minor,\n  tilt_min_deg=10.0, min_samples=50, sample_rate=50))","seg_ok = seg_n > 50 if seg_n else False","p99_stat = p99 if seg_ok else None","osc_stat = osc_hz if seg_ok else None"],"triggers":[{"when":"p99_stat >= 40.0 and is_fixed_wing","severity":"critical","tag":"attitude_overshoot","threshold":25,"value":"f\"{p99_stat:.1f}\"","unit":"°","field":"vehicle_attitude vs vehicle_attitude_setpoint（机动段）","title":"姿态跟踪误差过大（p99 {p99_stat:.1f}°）","suggestion":"结合故障库 F006：检查姿态环增益、机架共振；避免直接大幅降 PID。"},{"when":"p99_stat >= 25.0 and is_fixed_wing","severity":"warning","tag":"attitude_overshoot","threshold":25,"value":"f\"{p99_stat:.1f}\"","unit":"°","field":"vehicle_attitude vs vehicle_attitude_setpoint（机动段）","title":"姿态跟踪误差偏大（p99 {p99_stat:.1f}°）","suggestion":"结合故障库 F006 排查；大风环境下优先归因环境扰动。"},{"when":"p99_stat >= 30.0 and not is_fixed_wing","severity":"critical","tag":"attitude_overshoot","threshold":15,"value":"f\"{p99_stat:.1f}\"","unit":"°","field":"vehicle_attitude vs vehicle_attitude_setpoint（机动段）","title":"姿态跟踪误差过大（p99 {p99_stat:.1f}°）","suggestion":"结合故障库 F006：检查姿态环增益、机架共振；避免直接大幅降 PID。"},{"when":"p99_stat >= 15.0 and not is_fixed_wing","severity":"warning","tag":"attitude_overshoot","threshold":15,"value":"f\"{p99_stat:.1f}\"","unit":"°","field":"vehicle_attitude vs vehicle_attitude_setpoint（机动段）","title":"姿态跟踪误差偏大（p99 {p99_stat:.1f}°）","suggestion":"结合故障库 F006 排查；大风环境下优先归因环境扰动。"}],"emit":{"tag":"attitude_overshoot","stats":{"attitudeErrDegP99":{"var":"p99_stat","round":1},"attitudeOscHz":{"var":"osc_stat","round":2}},"check":"attitude_tracking","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"attitude"},{"id":"px4-cpu-load","group":"cpu","name":"CPU 负载","firmware":"True","airframe":"True","skip":[{"when":"not has_topic('cpuload')","reason":"cpuload not in log"}],"compute":["cpu_max = max(cpuload.load)"],"triggers":[{"when":"cpu_max >= 0.95","severity":"critical","threshold":0.95,"value":"f\"{cpu_max:.3f}\"","field":"cpuload.load(max)","title":"CPU 负载峰值 {cpu_max:.0%} 超阈值","suggestion":"CPU 长期接近满载会导致控制环丢步；检查高耗率模块与日志流配置。"},{"when":"cpu_max >= 0.90","severity":"warning","threshold":0.9,"value":"f\"{cpu_max:.3f}\"","field":"cpuload.load(max)","title":"CPU 负载峰值 {cpu_max:.0%} 偏高","suggestion":"关注 CPU 余量，必要时降低消息发布率。"}],"emit":{"check":"cpu_load","stats":{"cpuLoadMax":{"var":"cpu_max","round":3}},"doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"system"},{"id":"px4-ekf-fault","name":"EKF 融合硬故障","group":"ekf_faults","order":1,"firmware":"True","airframe":"True","skip":[{"when":"not has_topic('estimator_status')","reason":"estimator_status not in log"}],"known_legacy":["estimator_status.nan_flags"],"compute":["fault_raw = _try(bit_or_max( ref(\"estimator_status.filter_fault_flags\", per_instance=True)))","nan_raw = _try(max_of_max( ref(\"estimator_status.nan_flags\", per_instance=True)))","fault_union = _try(coalesce(fault_raw, 0))","nan_max = _try(to_int(coalesce(nan_raw, 0)))","crit_bits = _try(has_bits(fault_union, 63))"],"triggers":[{"when":"nan_max > 0 or crit_bits","severity":"critical","threshold":0,"value":"f\"fault={fault_union},nan={nan_max}\"","field":"estimator_status.filter_fault_flags/nan_flags","title":"EKF 报告核心融合硬故障（filter_fault_flags={fault_union}, nan_flags={nan_max}）","suggestion":"估计器出现硬故障/NaN，建议停飞排查传感器与振动后重新标定。"},{"when":"fault_union > 0 and not crit_bits and nan_max == 0","severity":"info","tag":null,"threshold":0,"value":"fault_union","field":"estimator_status.filter_fault_flags","title":"EKF 报告非核心辅助传感器融合拒绝（filter_fault_flags={fault_union}，常见为未使用视觉/光流）","suggestion":"若该机确实未启用视觉/光流定位，此位可忽略；否则检查对应传感器。"}],"emit":{"tag":"ekf_innovation_failure","check":"ekf_faults","doc":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"ekf"},{"id":"px4-ekf-innovation","name":"EKF 创新检验","group":"ekf_innovations","order":1,"firmware":"True","airframe":"True","skip":[{"when":"not has_topic('estimator_status')","reason":"estimator_status not in log"}],"compute":["frac, names, inst = worst_reject_ratio(\n  ref(\"estimator_status.innovation_check_flags\", per_instance=True),\n  ref(\"estimator_status.vel_test_ratio\", per_instance=True),\n  ref(\"estimator_status.pos_test_ratio\", per_instance=True),\n  ref(\"estimator_status.hgt_test_ratio\", per_instance=True),\n  ref(\"estimator_status.hdg_test_ratio\", per_instance=True),\n  ref(\"estimator_status.mag_test_ratio\", per_instance=True),\n  ref(\"estimator_status.tas_test_ratio\", per_instance=True),\n  ref(\"estimator_status.hagl_test_ratio\", per_instance=True),\n  ref(\"estimator_status.beta_test_ratio\", per_instance=True),\n  primary_min=3,\n  primary_names=[\"速度\", \"水平位置\", \"垂直位置\", \"磁罗盘 X\", \"磁罗盘 Y\", \"磁罗盘 Z\",\n                 \"航向\", \"空速\", \"侧滑\", \"离地高度\", \"光流 X\", \"光流 Y\"],\n  ge=1.0,                    # 通道判拒阈值：ratio >= 1 即该路观测被 EKF 拒绝\n  channel_min=3,             # 通道最少被拒样本数，去偶发尖峰毛刺\n  channel_labels=[\"速度\", \"水平位置\", \"垂直高度\", \"航向\", \"磁罗盘\", \"空速\", \"离地高度\", \"侧滑\"],\n  fallback_label=\"未知通道\")","pct = frac * 100"],"triggers":[{"when":"pct >= 5.0","severity":"critical","threshold":5,"value":"f\"{pct:.2f}\"","unit":"%","field":"estimator_status 创新检验拒绝样本占比","title":"EKF 创新检验持续失败（estimator #{inst}：{names}）","suggestion":"涉及：{names}。检查对应传感器健康度、安装与校准。"},{"when":"pct >= 1.0","severity":"warning","threshold":1,"value":"f\"{pct:.2f}\"","unit":"%","field":"estimator_status 创新检验拒绝样本占比","title":"EKF 创新检验偶发失败（estimator #{inst}：{names}）","suggestion":"涉及：{names}。关注 GPS 卫星数、磁罗盘干扰、振动与气压计异常。"}],"emit":{"tag":"ekf_innovation_failure","stats":{"ekfRejectRatioPct":{"var":"pct","round":2}},"check":"ekf_innovations","doc":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"ekf"},{"id":"px4-failsafe-failsafe","name":"失效保护触发","group":"failsafe","order":1,"firmware":"True","airframe":"True","compute":["events = rising_edge_events(vehicle_status.failsafe, vehicle_status.timestamp, armed_intervals, t0_us)"],"foreach":{"var":"events","keys":["t_s"]},"triggers":[{"when":"True","severity":"critical","tag":"failsafe","value":"f\"set at {t_s:.1f}s\"","field":"vehicle_status.failsafe","title":"触发失效保护（飞行中，t={t_s:.1f}s）","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。"}],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"failsafe","emit":{"check":"failsafe","doc":"https://docs.px4.io/main/en/config/safety.html"}},{"id":"px4-failsafe-rc_signal_lost","name":"遥控信号丢失","group":"failsafe","order":2,"firmware":"True","airframe":"True","compute":["events = rising_edge_events(vehicle_status.rc_signal_lost, vehicle_status.timestamp, armed_intervals, t0_us)"],"foreach":{"var":"events","keys":["t_s"]},"triggers":[{"when":"True","severity":"warning","tag":"rc_lost","value":"f\"set at {t_s:.1f}s\"","field":"vehicle_status.rc_signal_lost","title":"遥控信号丢失（飞行中，t={t_s:.1f}s）","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。"}],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"failsafe","emit":{"check":"failsafe","doc":"https://docs.px4.io/main/en/config/safety.html"}},{"id":"px4-failsafe-data_link_lost","name":"数据链路丢失","group":"failsafe","order":3,"firmware":"True","airframe":"True","compute":["events = rising_edge_events(vehicle_status.data_link_lost, vehicle_status.timestamp, armed_intervals, t0_us)"],"foreach":{"var":"events","keys":["t_s"]},"triggers":[{"when":"True","severity":"warning","tag":null,"value":"f\"set at {t_s:.1f}s\"","field":"vehicle_status.data_link_lost","title":"数据链路丢失（飞行中，t={t_s:.1f}s）","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。"}],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"failsafe","emit":{"check":"failsafe","doc":"https://docs.px4.io/main/en/config/safety.html"}},{"id":"px4-failsafe-engine_failure","name":"动力故障保护","group":"failsafe","order":4,"firmware":"True","airframe":"True","compute":["events = rising_edge_events(vehicle_status.engine_failure, vehicle_status.timestamp, armed_intervals, t0_us)"],"foreach":{"var":"events","keys":["t_s"]},"triggers":[{"when":"True","severity":"critical","tag":null,"value":"f\"set at {t_s:.1f}s\"","field":"vehicle_status.engine_failure","title":"发动机/动力故障保护（飞行中，t={t_s:.1f}s）","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。"}],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"failsafe","emit":{"check":"failsafe","doc":"https://docs.px4.io/main/en/config/safety.html"}},{"id":"px4-failsafe-mission_failure","name":"任务失效保护","group":"failsafe","order":5,"firmware":"True","airframe":"True","compute":["events = rising_edge_events(vehicle_status.mission_failure, vehicle_status.timestamp, armed_intervals, t0_us)"],"foreach":{"var":"events","keys":["t_s"]},"triggers":[{"when":"True","severity":"critical","tag":null,"value":"f\"set at {t_s:.1f}s\"","field":"vehicle_status.mission_failure","title":"任务失效保护（飞行中，t={t_s:.1f}s）","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。"}],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"failsafe","emit":{"check":"failsafe","doc":"https://docs.px4.io/main/en/config/safety.html"}},{"id":"px4-failsafe-nav","name":"失效保护导航状态","group":"failsafe","order":6,"firmware":"True","airframe":"True","skip":[{"when":"not has_topic('vehicle_status')","reason":"vehicle_status not in log"}],"compute":["events = step_into_events(vehicle_status.nav_state, vehicle_status.timestamp, armed_intervals, t0_us, codes={5: \"AUTO_RTL\", 12: \"DESCEND\", 13: \"TERMINATION\", 18: \"LAND\"})"],"foreach":{"var":"events","keys":["t_s","code","name"]},"triggers":[{"when":"True","severity":"critical","tag":"failsafe","value":"name","field":"vehicle_status.nav_state","title":"飞行中导航状态切换为 {name}（t={t_s:.1f}s）","suggestion":"说明飞控进入失效保护状态，需结合前文事件定位触发原因。"}],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"failsafe","emit":{"check":"failsafe","doc":"https://docs.px4.io/main/en/config/safety.html"}},{"id":"px4-gps-eph","name":"GPS 水平位置误差","group":"gps_health","order":1,"firmware":"True","airframe":"True","skip":[{"when":"not has_topic('vehicle_gps_position')","reason":"vehicle_gps_position not in log"}],"compute":["eph_pos = keep_gt(vehicle_gps_position.eph, gt=0)","eph_m = eph_pos * 0.001","e_p95 = percentile(eph_m, p=95)","e_max = max(eph_m)"],"triggers":[{"when":"e_p95 >= 10.0","severity":"warning","tag":"gps_eph_high","threshold":10,"value":"f\"{e_p95:.2f}\"","unit":"m","field":"vehicle_gps_position.eph(armed p95)","title":"GPS 水平位置误差持续偏大（p95 {e_p95:.1f} m）","suggestion":"结合故障库 F002：排查天线电磁干扰/遮挡/馈线虚接/多路径。"},{"when":"e_p95 >= 5.0","severity":"info","tag":"gps_eph_high","threshold":5,"value":"f\"{e_p95:.2f}\"","unit":"m","field":"vehicle_gps_position.eph(armed p95)","title":"GPS 水平位置误差偶发偏大（p95 {e_p95:.1f} m）","suggestion":"关注天线安装位置与遮挡。"}],"emit":{"tag":"gps_eph_high","stats":{"gpsEphP95M":{"var":"e_p95","round":2},"gpsEphMaxM":{"var":"e_max","round":2}},"check":"gps_health","doc":"https://docs.px4.io/main/en/gps_compass/"},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"gps"},{"id":"px4-gps-jump","name":"GPS 位置跳变","group":"gps_health","order":3,"firmware":"True","airframe":"True","skip":[{"when":"not has_topic('vehicle_gps_position')","reason":"vehicle_gps_position not in log"}],"compute":["step_new = _try(adjacent_speed_mps( ref(\"vehicle_gps_position.latitude_deg\", when_fw=\">=1.15\"), ref(\"vehicle_gps_position.longitude_deg\", when_fw=\">=1.15\"), ref(\"vehicle_gps_position.timestamp\", when_fw=\">=1.15\"), unit=\"deg\"))","step_old = _try(adjacent_speed_mps( ref(\"vehicle_gps_position.lat\", when_fw=\"<1.15\"), ref(\"vehicle_gps_position.lon\", when_fw=\"<1.15\"), ref(\"vehicle_gps_position.timestamp\", when_fw=\"<1.15\"), unit=\"degE7\"))","step = _try(coalesce(step_new, step_old))","njump = _try(to_int(count_above(step, gt=50.0)))"],"triggers":[{"when":"njump >= 3","severity":"warning","tag":"gps_jump","threshold":3,"value":"njump","unit":"次","field":"vehicle_gps_position lat/lon 相邻差分","title":"GPS 位置出现 {njump} 次异常跳变（>50 m/s）","suggestion":"结合故障库 F002：排查多路径、馈线与电磁干扰；室内跳变为正常现象。"}],"emit":{"tag":"gps_jump","stats":{"gpsJumpCount":{"var":"njump"}},"check":"gps_health","doc":"https://docs.px4.io/main/en/gps_compass/"},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"gps"},{"id":"px4-gps-sats","name":"GPS 卫星数","group":"gps_health","order":2,"firmware":"True","airframe":"True","skip":[{"when":"not has_topic('vehicle_gps_position')","reason":"vehicle_gps_position not in log"}],"compute":["s_min_raw = min(vehicle_gps_position.satellites_used)","s_min = to_int(s_min_raw)"],"triggers":[{"when":"s_min <= 6","severity":"warning","tag":"gps_eph_high","threshold":8,"value":"s_min","unit":"颗","field":"vehicle_gps_position.satellites_used(min)","title":"GPS 卫星数最少仅 {s_min} 颗","suggestion":"卫星数不足时定位易跳变；排查遮挡与天线。"}],"emit":{"tag":"gps_eph_high","stats":{"gpsSatellitesMin":{"var":"s_min"}},"check":"gps_health","doc":"https://docs.px4.io/main/en/gps_compass/"},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"gps"},{"id":"px4-guard-log-dropouts","name":"数据质量-日志丢包","group":"guards","order":3,"firmware":"True","airframe":"True","emit":{"guard_tags":[{"when":"dropout_ms > 1000","tag":"log_dropouts_high"}]},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"guard","compute":[]},{"id":"px4-guard-restart","name":"数据质量-中途重启","group":"guards","order":1,"firmware":"True","airframe":"True","emit":{"guard_tags":[{"when":"restart_detected","tag":"restart_detected"}]},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"guard","compute":[]},{"id":"px4-guard-short-log","name":"数据质量-短日志","group":"guards_early","order":1,"firmware":"True","airframe":"True","emit":{"guard_tags":[{"when":"armed_s > 0 and armed_s < 60","tag":"insufficient_data"},{"when":"armed_s == 0 and duration_s < 60","tag":"insufficient_data"}]},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"guard","compute":[]},{"id":"px4-guard-topic-missing","name":"数据质量-关键 topic 缺失","group":"guards","order":2,"firmware":"True","airframe":"True","emit":{"guard_tags":[{"when":"not has_topic('vehicle_status')","tag":"topic_missing:vehicle_status"},{"when":"not has_topic('battery_status')","tag":"topic_missing:battery_status"},{"when":"not has_topic('estimator_status')","tag":"topic_missing:estimator_status"}]},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"guard","compute":[]},{"id":"px4-imu-bias-drift","name":"陀螺零偏漂移","group":"imu_bias","order":1,"version":"1.1.0","firmware":"True","airframe":"True","skip":[{"when":"not has_armed","reason":"无 armed 段，不做零偏判定"},{"when":"no_data","reason":"无陀螺零偏数据（无 estimator_sensor_bias / estimator_status.states）"}],"known_legacy":["estimator_status.states"],"compute":["bx, by, bz, bts, src_text = _try(gyro_bias_series( ref(\"estimator_sensor_bias.gyro_bias\", instance=0), ref(\"estimator_sensor_bias.timestamp\", instance=0), ref(\"estimator_states.states\", instance=0), ref(\"estimator_states.timestamp\", instance=0), ref(\"estimator_status.states\", instance=0), ref(\"estimator_status.timestamp\", instance=0), fw_minor, slot=10))","worst_abs, worst_axis, worst_drift, drift_axis = _try(gyro_bias_worst( bx, by, bz, bts, armed_intervals, labels=[\"X\", \"Y\", \"Z\"], min_count=10))","abs_gate = require_true(worst_axis is not None)","temp_range = _try(max_temp_range(ref(\"vehicle_imu_status.temperature_gyro\", instance=0), ref(\"vehicle_air_data.ambient_temperature\", instance=0)))","bias_stat = _try(larger(worst_abs, worst_drift))"],"triggers":[{"when":"worst_abs >= 0.05 or worst_drift >= 0.05","severity":"critical","tag":"imu_bias_drift","threshold":0.02,"value":"f\"{bias_stat:.4f}\"","unit":"rad/s","field":"{src_text}","title":"陀螺零偏异常（轴 {worst_axis}：绝对值 {worst_abs:.4f} rad/s，漂移 {worst_drift:.4f} rad/s）","suggestion":"结合故障库 F005：检查 IMU 安装紧固、执行陀螺/加计标定；若温度跨度大，优先按温度漂移解释。"},{"when":"worst_abs >= 0.02 or worst_drift >= 0.02","severity":"warning","tag":"imu_bias_drift","threshold":0.02,"value":"f\"{bias_stat:.4f}\"","unit":"rad/s","field":"{src_text}","title":"陀螺零偏异常（轴 {worst_axis}：绝对值 {worst_abs:.4f} rad/s，漂移 {worst_drift:.4f} rad/s）","suggestion":"结合故障库 F005：检查 IMU 安装紧固、执行陀螺/加计标定；若温度跨度大，优先按温度漂移解释。"}],"emit":{"tag":"imu_bias_drift","stats":{"gyroBiasMaxRadS":{"var":"worst_abs","round":4},"gyroBiasDriftRadS":{"var":"worst_drift","round":4},"gyroBiasSource":{"var":"src_text"},"imuTempRangeC":{"var":"temp_range","round":1}},"guard_tags":[{"when":"temp_range >= 15","tag":"temperature_change_large"}],"check":"imu_bias","doc":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"},"status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"imu"},{"id":"px4-imu-clipping","name":"加速度计削波","group":"vibration","order":3,"firmware":"True","airframe":"True","skip":[{"when":"not has_topic('vehicle_imu_status')","reason":"vehicle_imu_status not in log"}],"compute":["clip, clip_idx, clip_axis = worst_column_delta(\n  ref(\"vehicle_imu_status.accel_clipping\", per_instance=True, alias=\"clipping\"))","clip_stat = clip if clip > 0 else None"],"triggers":[{"when":"clip >= 1000","severity":"critical","threshold":1000,"value":"clip","unit":"count","field":"vehicle_imu_status.accel_clipping[{clip_axis}](末值-首值)","title":"加速度计削波严重：IMU #{clip_idx} 轴 {clip_axis} 全日志累计削波 {clip} 次（理想值为 0）","suggestion":"持续削波会破坏 EKF 估计，请优先排除机械振动源。"},{"when":"clip >= 100","severity":"warning","threshold":100,"value":"clip","unit":"count","field":"vehicle_imu_status.accel_clipping[{clip_axis}](末值-首值)","title":"检测到明显加速度计削波：IMU #{clip_idx} 轴 {clip_axis} 全日志累计削波 {clip} 次（理想值为 0）","suggestion":"削波表明振动峰值已超出传感器量程，建议排查机械振动源。"},{"when":"clip > 0","severity":"info","tag":null,"threshold":0,"value":"clip","unit":"count","field":"vehicle_imu_status.accel_clipping[{clip_axis}](末值-首值)","title":"偶发加速度计削波：IMU #{clip_idx} 轴 {clip_axis} 全日志累计削波 {clip} 次（理想值为 0）","suggestion":"少量削波可先观察；频次升高或伴随振动告警需排查机械问题。"}],"emit":{"tag":"high_vibration","stats":{"imuAccelClippingCountMax":{"var":"clip_stat"}},"check":"vibration","doc":"https://docs.px4.io/main/en/assembly/vibration_isolation.html"},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"vibration"},{"id":"px4-log-errors","name":"日志错误消息","group":"logged_messages","order":1,"version":"1.0.1","firmware":"True","airframe":"True","compute":["n = count_items(messages, key=\"level_name\", in_list=[\"EMERGENCY\", \"ALERT\", \"CRITICAL\", \"ERROR\"])","samples = take_items(messages, key=\"level_name\", in_list=[\"EMERGENCY\", \"ALERT\", \"CRITICAL\", \"ERROR\"], limit=5, clip={\"message\": 200}, drop=[\"level\", \"level_name\"])"],"triggers":[{"when":"n > 0","severity":"critical","tag":null,"threshold":0,"value":"n","unit":"条","field":"ulog.logged_messages(log_level<=3)","title":"日志中出现 {n} 条 ERROR 及以上消息","suggestion":"按时间顺序核对错误原文，这通常是定位根因最直接的证据。","evidence_extra":{"samples":"samples"}}],"status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"messages","emit":{"check":"logged_messages","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"}},{"id":"px4-log-warnings","name":"日志警告消息","group":"logged_messages","order":2,"version":"1.0.1","firmware":"True","airframe":"True","compute":["n = count_items(messages, key=\"level_name\", eq=\"WARNING\")","samples = take_items(messages, key=\"level_name\", eq=\"WARNING\", limit=5, clip={\"message\": 200}, drop=[\"level\", \"level_name\"])"],"triggers":[{"when":"n > 0","severity":"warning","tag":null,"threshold":0,"value":"n","unit":"条","field":"ulog.logged_messages(log_level=4)","title":"日志中出现 {n} 条 WARNING 消息","evidence_extra":{"samples":"samples"}}],"status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"messages","emit":{"check":"logged_messages","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"}},{"id":"px4-mode-thrash","name":"飞行模式抖动","group":"mode_thrash","order":1,"firmware":"True","airframe":"True","skip":[{"when":"not has_topic('vehicle_status')","reason":"vehicle_status not in log"}],"compute":["n_changes_raw = edges_count(vehicle_status.nav_state)","n_changes = to_int(n_changes_raw)"],"triggers":[{"when":"n_changes > 12","severity":"warning","tag":null,"threshold":12,"value":"n_changes","unit":"次","field":"vehicle_status.nav_state 变化次数","title":"飞行模式切换 {n_changes} 次（>12），可能存在模式抖动","suggestion":"频繁切模式易诱发操纵混乱；检查遥控器开关与失效保护反复触发。"}],"emit":{"stats":{"navStateChanges":{"var":"n_changes"}},"check":"mode_thrash","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"mode"},{"id":"px4-motor-unbalance","name":"电机输出不平衡","group":"motor_balance","order":1,"version":"1.1.0","firmware":"True","airframe":"True","skip":[{"when":"no_data","reason":"active motor channels < 4 (非多旋翼或未记录全部电机)"},{"when":"not has_topic('actuator_motors')","reason":"actuator_motors not in log"}],"ran_on_success":true,"compute":["mts = actuator_motors.timestamp","cols = actuator_motors.control","seg = active_window_mask(mts, armed_intervals, vehicle_status.nav_state, vehicle_status.timestamp, codes=[2, 4, 6, 14, 21], min_active=20)","spread, busiest, idlest, n_active = column_spread_stats( cols, seg, min_mean=0.01, min_channels=4)"],"triggers":[{"when":"spread >= 0.15","severity":"critical","tag":"motor_output_unbalance","threshold":0.15,"value":"f\"{spread:.3f}\"","field":"actuator_motors.control[](悬停段均值极差)","title":"电机输出不平衡（悬停段通道 {busiest} 与 {idlest} 差 {spread:.3f}）","suggestion":"结合故障库 F008：检查桨叶型号/正反桨是否一致、单电机效率、机架形变。"},{"when":"spread >= 0.08","severity":"warning","tag":"motor_output_unbalance","threshold":0.08,"value":"f\"{spread:.3f}\"","field":"actuator_motors.control[](悬停段均值极差)","title":"电机输出差异偏大（通道 {busiest} 与 {idlest} 差 {spread:.3f}）","suggestion":"结合故障库 F008 排查动力一致性；偶发差异可先观察。"}],"emit":{"tag":"motor_output_unbalance","stats":{"motorControlSpread":{"var":"spread","round":3},"motorCountActive":{"var":"n_active"}},"check":"motor_balance","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"motor"},{"id":"px4-power-cell-voltage","name":"单电芯电压","group":"battery","order":1,"version":"1.1.0","firmware":"True","airframe":"True","skip":[{"when":"not has_topic('battery_status')","reason":"battery_status not in log"}],"compute":["vmin, cell_min, cells, have_measured, have_fallback, no_cell = _try(cell_voltage_min( battery_status.voltage_cell_v, battery_status.voltage_v, battery_status.voltage_filtered_v, battery_status.cell_count))"],"triggers":[{"when":"have_measured and cell_min < 3.55","severity":"critical","threshold":3.55,"value":"f\"{cell_min:.3f}\"","unit":"V/cell","field":"battery_status.voltage_cell_v[](实测最小值)","title":"电芯电压严重过低","suggestion":"存在过放风险，检查电池老化、放电倍率匹配与低压告警阈值。"},{"when":"have_fallback and not have_measured and cell_min < 3.55","severity":"critical","threshold":3.55,"value":"f\"{cell_min:.3f}\"","unit":"V/cell","field":"battery_status.voltage_v(min)/cell_count","title":"电芯电压严重过低","suggestion":"存在过放风险，检查电池老化、放电倍率匹配与低压告警阈值。"},{"when":"have_measured and cell_min < 3.70","severity":"warning","threshold":3.7,"value":"f\"{cell_min:.3f}\"","unit":"V/cell","field":"battery_status.voltage_cell_v[](实测最小值)","title":"电芯电压偏低","suggestion":"建议核对剩余容量估计与返航电压裕度。"},{"when":"have_fallback and not have_measured and cell_min < 3.70","severity":"warning","threshold":3.7,"value":"f\"{cell_min:.3f}\"","unit":"V/cell","field":"battery_status.voltage_v(min)/cell_count","title":"电芯电压偏低","suggestion":"建议核对剩余容量估计与返航电压裕度。"},{"when":"no_cell","severity":"info","tag":null,"value":"f\"missing\"","field":"battery_status.voltage_cell_v / cell_count","title":"日志缺少电芯电压与 cell_count，未做单电芯判断"}],"emit":{"tag":"battery_voltage_drop","stats":{"batteryVoltageMin":{"var":"vmin","round":2},"batteryCellCount":{"var":"cells"},"batteryCellVoltageMin":{"var":"cell_min","round":3}},"check":"battery","doc":"https://docs.px4.io/main/en/config/battery.html"},"status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"power"},{"id":"px4-power-remaining","name":"电池剩余电量","group":"battery","order":3,"firmware":"True","airframe":"True","skip":[{"when":"not has_topic('battery_status')","reason":"battery_status not in log"}],"compute":["rem = min_ge(battery_status.remaining, ge=0)","rem_pct = rem * 100"],"triggers":[{"when":"rem <= 0.10","severity":"critical","threshold":0.1,"value":"f\"{rem:.3f}\"","field":"battery_status.remaining(min)","title":"电池剩余电量极低（{rem_pct:.0f}%）","suggestion":"剩余电量低于 10%，应立即返航；检查电量估算与电池健康。"},{"when":"rem <= 0.20","severity":"warning","threshold":0.2,"value":"f\"{rem:.3f}\"","field":"battery_status.remaining(min)","title":"电池剩余电量偏低（{rem_pct:.0f}%）","suggestion":"剩余电量低于 20%，注意返航裕度。"}],"emit":{"tag":"battery_voltage_drop","stats":{"batteryRemainingMin":{"var":"rem","round":3}},"check":"battery","doc":"https://docs.px4.io/main/en/config/battery.html"},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"power"},{"id":"px4-power-sag","name":"飞行中持续压降","group":"battery","order":2,"firmware":"True","airframe":"True","skip":[{"when":"not has_topic('battery_status')","reason":"battery_status not in log"}],"compute":["cell_min_t = rows_aggregate(battery_status.voltage_cell_v, agg=\"min\", gt=0)","drop, tail = head_tail_median_drop(cell_min_t, battery_status.timestamp, armed_intervals, skip_first_s=5, min_seg=20)"],"triggers":[{"when":"drop >= 0.30 and tail < 3.70","severity":"warning","threshold":0.3,"value":"f\"{drop:.3f}\"","unit":"V","field":"battery_status.voltage_cell_v[] armed 段趋势","title":"飞行中单电芯持续压降 {drop:.2f} V（尾段中位 {tail:.2f} V）","suggestion":"持续压降区别于大机动瞬时压降：排查电芯老化内阻、插头虚接、线缆线径与负载匹配。"}],"emit":{"tag":"battery_voltage_drop","stats":{"batteryCellSagFlight":{"var":"drop","round":3}},"check":"battery","doc":"https://docs.px4.io/main/en/config/battery.html"},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"power"},{"id":"px4-vibration-stddev","name":"IMU 加速度标准差","group":"vibration","order":2,"firmware":"True","airframe":"True","skip":[{"when":"not has_topic('vehicle_imu_status')","reason":"vehicle_imu_status not in log"}],"compute":["stddev_rss, stddev_idx = worst_rss_mean( ref(\"vehicle_imu_status.stddev_accel_x_m_s2\", per_instance=True, alias=\"stddev_accel_x\"), ref(\"vehicle_imu_status.stddev_accel_y_m_s2\", per_instance=True, alias=\"stddev_accel_y\"), ref(\"vehicle_imu_status.stddev_accel_z_m_s2\", per_instance=True, alias=\"stddev_accel_z\"), min_mean=0)"],"triggers":[{"when":"stddev_rss >= 1.0","severity":"critical","threshold":1,"value":"f\"{stddev_rss:.3f}\"","unit":"m/s^2","field":"vehicle_imu_status.stddev_accel_*_m_s2(RSS 均值)","title":"IMU 加速度标准差严重超标（IMU #{stddev_idx}）","suggestion":"结合故障库条目排查桨叶/电机轴承/机架紧固/减震。"},{"when":"stddev_rss >= 0.5","severity":"warning","threshold":0.5,"value":"f\"{stddev_rss:.3f}\"","unit":"m/s^2","field":"vehicle_imu_status.stddev_accel_*_m_s2(RSS 均值)","title":"IMU 加速度标准差偏大（IMU #{stddev_idx}）","suggestion":"关注桨叶损伤、电机动平衡与 IMU 减震。"}],"emit":{"tag":"high_vibration","stats":{"imuStddevAccelRssMax":{"var":"stddev_rss","round":3}},"check":"vibration","doc":"https://docs.px4.io/main/en/assembly/vibration_isolation.html"},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"vibration"},{"id":"px4-vibration","name":"高频振动","group":"vibration","order":1,"firmware":"True","airframe":"True","skip":[{"when":"not has_topic('vehicle_imu_status')","reason":"vehicle_imu_status not in log"}],"compute":["vibe_mean, vibe_p95, vibe_max, imu_idx = worst_mean_stats(\n  ref(\"vehicle_imu_status.accel_vibration_metric\", per_instance=True), min_mean=0)"],"triggers":[{"when":"vibe_mean >= 9.81","severity":"critical","threshold":9.81,"value":"f\"{vibe_mean:.3f}\"","unit":"m/s^2","field":"vehicle_imu_status.accel_vibration_metric(均值)","title":"高频振动严重超标（IMU #{imu_idx}）","suggestion":"Flight Review 红色区间（>9.81 m/s^2）。结合故障库条目排查桨叶/电机/机架/减震。"},{"when":"vibe_mean >= 4.905","severity":"warning","threshold":4.905,"value":"f\"{vibe_mean:.3f}\"","unit":"m/s^2","field":"vehicle_imu_status.accel_vibration_metric(均值)","title":"高频振动偏大（IMU #{imu_idx}）","suggestion":"Flight Review 橙色区间（4.905~9.81 m/s^2）。结合故障库条目排查桨叶动平衡/电机/IMU 减震。"}],"emit":{"tag":"high_vibration","stats":{"imuAccelVibrationMean":{"var":"vibe_mean","round":3},"imuAccelVibrationP95":{"var":"vibe_p95","round":3},"imuAccelVibrationMax":{"var":"vibe_max","round":3}},"check":"vibration","doc":"https://docs.px4.io/main/en/assembly/vibration_isolation.html"},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"vibration"},{"id":"px4-vtol-transition-attitude","name":"VTOL 转换姿态越限","group":"vtol_transition","order":1,"firmware":"True","airframe":"True","skip":[{"when":"not has_armed or not has_topic('vehicle_status')"},{"when":"not has_topic('vtol_vehicle_status')","reason":"vtol_vehicle_status not in log"}],"compute":["trans_n = _try(count_above(vtol_vehicle_status.vtol_in_trans_mode, gt=0))","trans_n_i = _try(to_int(trans_n))","trans_mask = _try(fill_to(ref(\"vtol_vehicle_status.vtol_in_trans_mode\"), ref(\"vtol_vehicle_status.timestamp\"), ref(\"vehicle_attitude.timestamp\")))","roll, pitch, yaw = _try(quat_to_euler(ref(\"vehicle_attitude.q[0]\"), ref(\"vehicle_attitude.q[1]\"), ref(\"vehicle_attitude.q[2]\"), ref(\"vehicle_attitude.q[3]\")))","tilt_max = _try(masked_absmax(larger(abs_values(roll), abs_values(pitch)), trans_mask))","trans_cnt = _try(count_true(trans_mask))","enough = _try(trans_cnt > 5)","has_tilt = tilt_max is not None","tilt_stat = _try(tilt_max if enough else None)"],"triggers":[{"when":"has_tilt and enough and tilt_max > 8.0","severity":"warning","tag":"vtol_convert_attitude_over","threshold":8,"value":"f\"{tilt_max:.1f}\"","unit":"°","field":"vehicle_attitude（vtol_in_trans_mode 段）","title":"VTOL 转换阶段姿态越限（最大 {tilt_max:.1f}°，限值 8°）","suggestion":"结合故障库 F003：复盘转换时序与推力匹配，强风环境优先归因环境扰动。"}],"emit":{"tag":"vtol_convert_attitude_over","stats":{"vtolTransitionSamples":{"var":"trans_n_i"},"vtolTransitionMaxTiltDeg":{"var":"tilt_stat","round":1}},"check":"vtol_transition","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"vtol"},{"id":"px4-wind-estimate","name":"风扰估计","group":"wind_estimate","order":1,"firmware":"True","airframe":"True","skip":[{"when":"not has_topic('estimator_wind') and not has_topic('wind_estimate')","reason":"estimator_wind / wind_estimate not in log"}],"compute":["w_p95 = percentile(\n  hypot(coalesce(ref(\"estimator_wind.windspeed_north\", when_fw=\">=1.15\"),\n                 ref(\"wind_estimate.windspeed_north\", when_fw=\"<1.15\")),\n        coalesce(ref(\"estimator_wind.windspeed_east\", when_fw=\">=1.15\"),\n                 ref(\"wind_estimate.windspeed_east\", when_fw=\"<1.15\"))),\n  p=95)"],"triggers":[{"when":"w_p95 >= 12.0","severity":"warning","tag":"wind_disturb","threshold":8,"value":"f\"{w_p95:.1f}\"","unit":"m/s","field":"estimator_wind.windspeed_north/east","title":"估计风速较大（p95 {w_p95:.1f} m/s）","suggestion":"结合故障库 F010：强风属环境扰动，姿态超调/转换越限优先归因风，不要直接改 PID。"},{"when":"w_p95 >= 8.0","severity":"info","tag":"wind_disturb","threshold":8,"value":"f\"{w_p95:.1f}\"","unit":"m/s","field":"estimator_wind.windspeed_north/east","title":"估计风速偏大（p95 {w_p95:.1f} m/s）","suggestion":"解释姿态类异常时需考虑风扰因素。"}],"emit":{"tag":"wind_disturb","guard_tags":[{"when":"w_p95 >= 8.0","tag":"wind_strong"}],"stats":{"windSpeedP95M":{"var":"w_p95","round":1}},"check":"wind_estimate","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"wind"}];
const facts = {"group_order":["guards_early","vibration","ekf_innovations","ekf_faults","battery","cpu","gps_health","failsafe","mode_thrash","motor_balance","imu_bias","attitude_tracking","airspeed","vtol_transition","wind_estimate","logged_messages","guards"],"rule_meta":{"defaults":{"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"}},"by_group":{"airspeed":{"category":"airspeed","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"attitude_tracking":{"category":"attitude","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"battery":{"category":"power","doc":"https://docs.px4.io/main/en/config/battery.html"},"cpu":{"category":"system","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"ekf_faults":{"category":"ekf","doc":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"},"ekf_innovations":{"category":"ekf","doc":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"},"failsafe":{"category":"failsafe","doc":"https://docs.px4.io/main/en/config/safety.html"},"gps_health":{"category":"gps","doc":"https://docs.px4.io/main/en/gps_compass/"},"guards":{"category":"guard"},"guards_early":{"category":"guard"},"imu_bias":{"category":"imu","doc":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"},"logged_messages":{"category":"messages","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"mode_thrash":{"category":"mode","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"motor_balance":{"category":"motor","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"vibration":{"category":"vibration","doc":"https://docs.px4.io/main/en/assembly/vibration_isolation.html"},"vtol_transition":{"category":"vtol","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"wind_estimate":{"category":"wind","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"}}},"bindings":{"vehicle_status":{"topic":"vehicle_status","timestamp":"timestamp","nav_state":"nav_state","arming_state":"arming_state","vehicle_type":"vehicle_type","is_rotary_wing":"is_rotary_wing","vtol_in_trans_mode":"vtol_in_trans_mode","armed_value":2}},"log_levels":{"48":"EMERGENCY","49":"ALERT","50":"CRITICAL","51":"ERROR","52":"WARNING","53":"NOTICE","54":"INFO","55":"DEBUG"},"vehicle_types":{"1":"rotary_wing","2":"fixed_wing","3":"rover","4":"airship"},"nav_state_names":{"0":"Manual","1":"Altitude","2":"Position","3":"Mission","4":"Hold","5":"Return","6":"Position Slow","7":"Free5","8":"Free4","10":"Acro","11":"Free3","12":"Descend","13":"Termination","14":"Offboard","15":"Stabilized","16":"Free2","17":"Takeoff","18":"Land","19":"Free1","20":"Follow","21":"Orbit","22":"VTOL Takeoff"},"nav_state_groups":[{"phase":"takeoff","codes":[17,22]},{"phase":"hover","codes":[2,4,6,14,21]},{"phase":"maneuver","codes":[0,1,10,15]},{"phase":"fw_cruise","codes":[3,8]},{"phase":"landing","codes":[18,20,5,12,13]}],"sys_info_keys":["sys_name","ver_sw","ver_sw_release","ver_vendor_sw_release","ver_hw","ver_hw_subtype","sys_os_name","sys_os_ver","sys_toolchain","sys_toolchain_ver","sys_mcu","time_start_utc","duration","git_branch"],"ulog_msg_types":[{"code":"B","name":"标志位","en":"Flag Bits","desc":"兼容性标志，只在文件开头出现"},{"code":"I","name":"信息","en":"Information","desc":"键 → 值，系统信息字典"},{"code":"M","name":"多值信息","en":"Multi Information","desc":"键 → 多组值，无时间戳（一条长消息会拆成多行续写，故条数多于键数）"},{"code":"F","name":"消息格式","en":"Format","desc":"每个订阅话题的字段定义"},{"code":"P","name":"参数","en":"Parameter","desc":"日志开头的参数值；飞行中改参数也用它"},{"code":"Q","name":"参数默认值","en":"Default Parameter","desc":"只记与当前值不同的默认值（一个参数可能写两条）"},{"code":"A","name":"订阅话题","en":"Add Logged","desc":"每个话题实例一条"},{"code":"R","name":"取消订阅","en":"Remove Logged","desc":"运行中停止记录某话题"},{"code":"D","name":"数据","en":"Data","desc":"日志主体：订阅话题的每一次采样"},{"code":"L","name":"日志消息","en":"Logging","desc":"带时间戳的日志行"},{"code":"C","name":"带标签日志消息","en":"Tagged Logging","desc":"同上，另有来源 tag"},{"code":"O","name":"丢包","en":"Dropout","desc":"记录线程来不及时丢掉的时长"},{"code":"S","name":"同步标记","en":"Sync","desc":"每约 4 KB 一个，损坏后靠它重新对齐"}],"info_key_docs":{"ver_sw":{"name":"固件提交号","desc":"固件构建时的 git 提交，用来对上游源码"},"ver_sw_branch":{"name":"固件分支","desc":"构建所在的分支 / 标签"},"ver_sw_release":{"name":"固件版本号","desc":"打包成 major<<24 | minor<<16 | patch<<8 | 类型（1=release 等）"},"ver_vendor_sw_release":{"name":"厂商版本号","desc":"厂商自定义版本；255 表示厂商未使用"},"ver_hw":{"name":"硬件型号","desc":"飞控板型号，判断引脚 / 传感器配置的入口"},"ver_hw_subtype":{"name":"硬件子型号","desc":"同型号的不同批次 / 变体"},"ver_data_format":{"name":"数据格式版本","desc":"ULog 数据格式版本，与本站解析器看到的格式对应"},"sys_name":{"name":"系统名","desc":"固定为 PX4"},"sys_os_name":{"name":"操作系统","desc":"NuttX（飞控本机）或 Linux（机载计算机）"},"sys_os_ver":{"name":"OS 提交号","desc":"操作系统的 git 提交"},"sys_os_ver_release":{"name":"OS 版本号","desc":"打包方式同固件版本号"},"sys_toolchain":{"name":"工具链","desc":"编译固件用的工具链"},"sys_toolchain_ver":{"name":"工具链版本","desc":"工具链的具体版本，排查\"换个编译器行为就不一样\"时用"},"sys_mcu":{"name":"MCU","desc":"主控芯片型号与硅版本"},"sys_uuid":{"name":"飞控唯一 ID","desc":"PX4GUID，出厂烧录；同型号不同板子也不同，可用来区分设备"},"time_ref_utc":{"name":"UTC 时间参考","desc":"相对启动的偏移（秒）；0 表示这次飞行没对时"},"time_start_utc":{"name":"起始 UTC 时间","desc":"日志起始时刻（旧固件记录）"},"boot_time_utc_us":{"name":"启动时刻","desc":"UTC 微秒；只有对过时才有意义"},"duration":{"name":"日志时长","desc":"秒（旧固件记录）"},"git_branch":{"name":"固件分支","desc":"旧固件的分支名字段"},"metadata_events_sha256":{"name":"事件元数据哈希","desc":"事件定义文件的 SHA-256，用来校验事件定义是否被改动"}},"metrics":[{"key":"imuAccelVibrationMax","label":"最大振动","unit":"m/s²","topic":"vehicle_imu_status","field":"accel_vibration_metric","op":"max","round":2},{"key":"batteryVoltageMin","label":"最低电压","unit":"V","topic":"battery_status","field":"voltage_v","op":"min","round":2},{"key":"batteryCellVoltageMin","label":"最低电芯电压","unit":"V","topic":"battery_status","fields":["voltage_cell_v","voltage_v","voltage_filtered_v","cell_count"],"op":"cell_voltage_min","pick":"vmin","round":3},{"key":"currentMax","label":"最大电流","unit":"A","topic":"battery_status","field":"current_a","op":"max","round":2},{"key":"batteryRemainingMin","label":"最低剩余电量","unit":"0..1","topic":"battery_status","field":"remaining","op":"min_ge","ge":0,"round":3},{"key":"gpsSatellitesMin","label":"最少搜星","unit":"颗","topic":"vehicle_gps_position","field":["satellites_used","satellites_visible"],"op":"min","round":0},{"key":"gpsEphMaxM","label":"最大定位误差","unit":"m","topic":"vehicle_gps_position","field":"eph","op":"max","scale":0.001,"round":2},{"key":"cpuLoadMax","label":"CPU 峰值","unit":"0..1","topic":"cpuload","field":"load","op":"max","round":3},{"key":"imuAccelClippingCountMax","label":"加速度计削波计数","unit":"次"},{"key":"imuTempRangeC","label":"IMU 温度跨度","unit":"°C"},{"key":"ekfRejectRatioPct","label":"EKF 拒绝占比","unit":"比例"},{"key":"attitudeErrDegP99","label":"姿态误差 p99","unit":"°"},{"key":"attitudeOscHz","label":"姿态振荡频率","unit":"Hz"},{"key":"motorControlSpread","label":"电机输出离散度"},{"key":"motorCountActive","label":"活跃电机数","unit":"个"},{"key":"gyroBiasMaxRadS","label":"陀螺零偏最大","unit":"rad/s"},{"key":"gyroBiasDriftRadS","label":"陀螺零偏漂移","unit":"rad/s"},{"key":"windSpeedP95M","label":"风速 p95","unit":"m/s"},{"key":"airspeedMinM","label":"最低空速","unit":"m/s"},{"key":"airspeedInvalidRatio","label":"空速无效占比","unit":"比例"},{"key":"gpsJumpCount","label":"GPS 跳变次数","unit":"次"},{"key":"navStateChanges","label":"模式切换次数","unit":"次"},{"key":"vtolTransitionSamples","label":"VTOL 转换样本数","unit":"个"},{"key":"batteryCellCount","label":"电芯数","unit":"个"}],"track":{"topic":"vehicle_gps_position","instance":0,"lat":[{"field":"latitude_deg","scale":1},{"field":"lat","scale":1e-7}],"lon":[{"field":"longitude_deg","scale":1},{"field":"lon","scale":1e-7}],"alt":[{"field":"altitude_msl_m","scale":1},{"field":"alt","scale":0.001}],"max_points":1500}};

export const PY_ULG_CHECKS = String.raw`"""预定函数（算子）注册表 —— 经验文件里的 \`op:\` 只能引用这里注册的算子。

约定：
- 算子签名用 @operator 声明 in_arity / out_arity / out_names，
  构建期按签名校验规则文件里 in/out 的数量（多输入/多输出不靠约定，靠校验）。
- 调用形式 fn(*args, **opts)：args 是按 \`in\` 顺序取到的值（numpy 数组或标量），
  opts 是节点上的其他键（unit / per_instance / scope 等），算子用 **kw 吸收不关心的项。
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
    if values is None: return None
    a = _finite(values)
    return float(a.max()) if a.size else None


@operator("min", doc="最小值（忽略 NaN）")
def op_min(values, **kw):
    if values is None: return None
    a = _finite(values)
    return float(a.min()) if a.size else None


@operator("min_ge", doc="有限且 >= ge 的最小值（排除无效值，如 remaining=-1 表示未知）")
def op_min_ge(values, ge=None, **kw):
    if values is None: return None
    a = _finite(values)
    if ge is not None:
        a = a[a >= float(ge)]
    return float(a.min()) if a.size else None


@operator("scale", in_arity=1, out_arity=1, doc="标量乘以系数（如比例 → 百分比）")
def op_scale(x, factor=1.0, **kw):
    return float(x) * float(factor) if x is not None else None


@operator("mean", doc="均值（忽略 NaN）")
def op_mean(values, **kw):
    if values is None: return None
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
def op_head_tail_median_drop(x, vts, intervals, skip_first_s=5, min_seg=20,
                             head_frac=0.1, tail_frac=0.2, **kw):
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
    tail = float(np.median(seg[-max(5, int(len(seg) * float(tail_frac))):]))
    head = float(np.median(seg[: max(5, int(len(seg) * float(head_frac)))]))
    return float(head - tail), tail


# ─────────────────────────── 多实例传感器（per-instance）───────────────────────────
# 这类算子的输入是「每个传感器实例一组数据」的列表（框架对 per_instance 节点按
# topic dataset 分组喂入）。数组字段（如 float32[3]）每组是「每元素一列」的列表。
# 全部通用：不认识任何具体 topic/字段，只做跨实例归约，取「最差实例」并回传其序号。

def _groups(groups):
    return [g for g in (groups or []) if g is not None]


def _as_group_list(x):
    """per_instance 分组 → 列表，**保留 None 占位**。

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
        if best is None or m > best[0]:      # 严格大于：并列时保留首个实例
            best = (m, float(np.percentile(a, 95)), float(a.max()), i)
    return best                                # 无有效实例时返回 None


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
        rss = float(np.mean(np.sqrt(
            np.asarray(x, float) ** 2 + np.asarray(y, float) ** 2 + np.asarray(z, float) ** 2)))
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
def op_worst_reject_ratio(primary, ch0, ch1, ch2, ch3, ch4, ch5, ch6, ch7,
                          primary_min=3, primary_names=None, ge=1.0, channel_min=3,
                          channel_labels=None, fallback_label="未知通道", **kw):
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
            for v in np.asarray(g):          # 不转 float：位掩码必须按位精确
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
    import numpy as np

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
        "unit 说明经纬度口径：degE7（旧字段 lat/lon 的 1e7 度）或 deg（新字段 latitude_deg），"
        "由经验文件按固件版本给出",
)
def op_adjacent_speed_mps(lat_in, lon_in, ts_us, unit="degE7", **kw):
    import numpy as np

    if lat_in is None or lon_in is None or ts_us is None:
        return None
    div = 1e7 if str(unit).lower() in ("dege7", "1e7") else 1.0
    lat = np.radians(np.asarray(lat_in, dtype=float) / div)
    lon = np.radians(np.asarray(lon_in, dtype=float) / div)
    if lat.size < 3 or lat.size != lon.size or lat.size != len(ts_us):
        return None
    dt = np.diff(np.asarray(ts_us, dtype=float)) / 1e6
    dlat = np.diff(lat) * 6371000.0
    dlon = np.diff(lon) * 6371000.0 * np.cos(lat[:-1])
    return np.sqrt(dlat ** 2 + dlon ** 2) / np.maximum(dt, 1e-3)


@operator("read", doc="显式取数/透传：把字段原样放进环境（供 coalesce 等后续节点使用）")
def op_read(values, **kw):
    return values


@operator("hypot", in_arity=2, doc="逐样本 sqrt(a^2 + b^2)（如由北/东风分量合成风速）")
def op_hypot(a, b, **kw):
    import numpy as np

    if a is None or b is None:
        return None
    return np.sqrt(np.asarray(a, dtype=float) ** 2 + np.asarray(b, dtype=float) ** 2)


@operator(
    "quat_to_euler",
    in_arity=4,
    out_arity=3,
    out_names=["roll", "pitch", "yaw"],
    doc="四元数四列（w, x, y, z）→ 欧拉角（度）；图上的姿态换算走这个，别在前端写",
)
def op_quat_to_euler(w, x, y, z, **kw):
    import numpy as np

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
        return True                      # 无条件 = 全选（可当计数器用）
    v = it.get(key)
    if v is None:
        return False
    if in_list is not None:
        return v in list(in_list)
    return (eq is not None and v == eq) or (lte is not None and v <= lte) \
        or (gte is not None and v >= gte)


@operator("count_items", doc="条目列表里满足条件的条数：按 key 字段判定，in_list / eq / lte / gte")
def op_count_items(items, key="level", eq=None, lte=None, gte=None, in_list=None, **kw):
    if not items:
        return 0
    return sum(1 for it in items if _item_hit(it, key, eq, lte, gte, in_list))


@operator("take_items", doc="条目列表里满足条件的前 limit 条（drop 可去掉辅助键；clip 可按字段截断文本）")
def op_take_items(items, key="level", eq=None, lte=None, gte=None, in_list=None,
                  limit=5, drop=None, clip=None, **kw):
    out = []
    clips = {str(k): int(v) for k, v in dict(clip or {}).items()}
    for it in (items or []):
        if not _item_hit(it, key, eq, lte, gte, in_list):
            continue
        item = dict(it)
        for k in (drop if isinstance(drop, (list, tuple)) else [drop] if drop else []):
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
    "quat_to_euler",
    in_arity=4,
    out_arity=3,
    out_names=["roll", "pitch", "yaw"],
    doc="四元数 (w,x,y,z) 三路序列 → 欧拉角序列；degrees 为真输出角度制。"
        "对应设计文档里“4 进 3 出”的多输入多输出算子示例",
)
def op_quat_to_euler(q0, q1, q2, q3, degrees=True, **kw):
    import numpy as np

    if q0 is None or q1 is None or q2 is None or q3 is None:
        return None
    w = np.asarray(q0, dtype=float)
    x = np.asarray(q1, dtype=float)
    y = np.asarray(q2, dtype=float)
    z = np.asarray(q3, dtype=float)
    n = min(len(w), len(x), len(y), len(z))
    w, x, y, z = w[:n], x[:n], y[:n], z[:n]
    roll = np.arctan2(2 * (w * x + y * z), 1 - 2 * (x ** 2 + y ** 2))
    pitch = np.arcsin(np.clip(2 * (w * y - z * x), -1, 1))
    yaw = np.arctan2(2 * (w * z + x * y), 1 - 2 * (y ** 2 + z ** 2))
    if degrees:
        roll, pitch, yaw = np.degrees(roll), np.degrees(pitch), np.degrees(yaw)
    return roll, pitch, yaw


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
    return np.interp(d, s[:v.size], v)


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
            v = v[:n_on]                 # 与原实现一致：长度不匹配时取前 N 个
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
    import numpy as np

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
    doc="相对中位数符号翻转频率（Hz）：翻转次数 / 2 / (样本数 / sample_rate)；"
        "样本 < 3 时 None。用于判定“误差高频振荡”",
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
    in_arity=8,
    out_arity=3,
    out_names=["p99", "osc_hz", "seg_n"],
    doc="姿态跟踪统计：把姿态与姿态指令在时间轴上对齐（取较短长度、指令线性插值到姿态时间轴），"
        "只在 armed 且非悬停（指令倾角 > tilt_min_deg）样本上算跟踪误差，输出 p99（度）、"
        "误差过零频率（Hz）、参与统计的样本数。指令源在 q_d 四元数与 roll/pitch_body 之间自动选择"
        "（fw_minor >= 15 或有四元数而无 body 字段时用四元数）。核心数据缺失返回 None。",
)
def op_att_tracking_stats(att_q, sp_q, sp_roll, sp_pitch, att_ts, sp_ts, intervals,
                          fw_minor=None, tilt_min_deg=10.0, min_samples=50,
                          sample_rate=50.0, **kw):
    import numpy as np

    q = _as_columns(att_q)
    if att_ts is None or len(q) < 4 or sp_ts is None or not intervals:
        return None
    ts = np.asarray(att_ts, dtype=np.int64)
    sp_ts = np.asarray(sp_ts, dtype=np.int64)

    w, x, y, z = (np.asarray(c, dtype=float) for c in q[:4])
    n_q = min(len(w), len(x), len(y), len(z))
    w, x, y, z = w[:n_q], x[:n_q], y[:n_q], z[:n_q]
    roll = np.arctan2(2 * (w * x + y * z), 1 - 2 * (x ** 2 + y ** 2))          # 弧度
    pitch = np.arcsin(np.clip(2 * (w * y - z * x), -1, 1))

    # 指令源：1.15+ 只记四元数；旧固件记 roll/pitch_body（弧度）
    qd = _as_columns(sp_q)
    has_qd = len(qd) >= 4
    use_q = has_qd and (sp_roll is None or fw_minor is None or int(fw_minor) >= 15)
    if not use_q and sp_roll is None and has_qd:
        use_q = True                       # 定制固件容错
    if use_q:
        d0, d1, d2, d3 = (np.asarray(c, dtype=float) for c in qd[:4])
        ns = min(len(d0), len(d1), len(d2), len(d3))
        d0, d1, d2, d3 = d0[:ns], d1[:ns], d2[:ns], d3[:ns]
        r_sp_raw = np.arctan2(2 * (d0 * d1 + d2 * d3), 1 - 2 * (d1 ** 2 + d2 ** 2))
        p_sp_raw = np.arcsin(np.clip(2 * (d0 * d2 - d3 * d1), -1, 1))
    else:
        if sp_roll is None:
            return None
        r_sp_raw = np.asarray(sp_roll, dtype=float)
        p_sp_raw = (np.asarray(sp_pitch, dtype=float) if sp_pitch is not None
                    else np.zeros(len(r_sp_raw)))

    n = min(n_q, len(r_sp_raw), len(p_sp_raw))
    if n < 1:
        return None
    ts_n = ts[:n]
    r_sp = np.interp(ts_n, sp_ts[:len(r_sp_raw)], r_sp_raw)
    p_sp = np.interp(ts_n, sp_ts[:len(p_sp_raw)], p_sp_raw)
    err = np.degrees(np.maximum(np.abs(roll[:n] - r_sp), np.abs(pitch[:n] - p_sp)))

    amask = np.zeros(n, dtype=bool)
    for s, e in intervals:
        lo = int(np.searchsorted(ts_n, int(s)))
        hi = n if e is None else int(np.searchsorted(ts_n, int(e)))
        amask[lo:hi] = True
    active = amask & (np.degrees(np.abs(r_sp)) + np.degrees(np.abs(p_sp)) > float(tilt_min_deg))
    seg = err[active] if int(np.count_nonzero(active)) > int(min_samples) else err[amask]
    if seg.size <= int(min_samples):
        return (None, None, int(seg.size))      # 样本不足：不出结论，但把样本数带出去

    p99 = float(np.percentile(seg, 99))
    sign = np.sign(seg - np.median(seg))
    sign = sign[sign != 0]
    flips = int(np.count_nonzero(np.diff(sign) != 0)) if sign.size >= 2 else 0
    osc = flips / 2.0 / max(float(seg.size) / float(sample_rate), 1e-3)
    return (p99, float(osc), int(seg.size))


@operator(
    "gyro_bias_series",
    in_arity=7,
    out_arity=5,
    out_names=["bx", "by", "bz", "bts", "src_text"],
    doc="陀螺零偏取源：1.15+ 直读零偏列（fw_minor >= 15 时优先），否则用 EKF 状态槽 10..12"
        "（estimator_states 优先、estimator_status 兜底）。输入都是「数组字段的多列」或 None。"
        "返回 三轴序列 + 时间戳 + 数据来源说明（用于 evidence.field）；主数据缺失返回 None。",
)
def op_gyro_bias_series(new_cols, new_ts, states_a_cols, states_a_ts,
                        states_b_cols, states_b_ts, fw_minor, slot=10, **kw):
    nb = _as_columns(new_cols)
    la = _as_columns(states_a_cols)
    lb = _as_columns(states_b_cols)
    s = int(slot)

    def pick3(cols):
        return [cols[s], cols[s + 1], cols[s + 2]] if len(cols) >= s + 3 else None

    leg_a, leg_b = pick3(la), pick3(lb)
    use_new = len(nb) >= 3 and new_ts is not None and (fw_minor is None or int(fw_minor) >= 15)
    if not use_new and leg_a is None and leg_b is None and len(nb) >= 3:
        use_new = True                       # 定制固件容错：没有旧槽就用直读
    if use_new:
        return (nb[0], nb[1], nb[2], new_ts, "estimator_sensor_bias.gyro_bias[]")
    if leg_a is not None and states_a_ts is not None:
        return (leg_a[0], leg_a[1], leg_a[2], states_a_ts, "estimator_states.states[10..12]")
    if leg_b is not None and states_b_ts is not None:
        return (leg_b[0], leg_b[1], leg_b[2], states_b_ts, "estimator_status.states[10..12]")
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
    import numpy as np

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
    no_cell = (not have_measured and not have_fallback and vmin is not None)
    return (vmin, cell_min, cells, have_measured, have_fallback, no_cell)


import json, io, ast, re
import numpy as np
from pyulog import ULog


# 故障知识库（构建期内联，第三层检索用）
FAULT_KB = __FAULT_KB__

# ---------------- 经验规则（rules/*.yaml 编译而来）----------------
RULES = json.loads(r'''__RULES__''')

# ---------------- 事实层的数据绑定与码表（knowledge/px4/facts.yaml 编译而来）----------------
# 引擎只提供机制：字段名、码值、执行顺序都在 YAML 里，改数据不用碰 Python。
FACTS = __FACTS__
_VS = FACTS["bindings"]["vehicle_status"]
_NAV_GROUPS = [(g["phase"], set(int(c) for c in g["codes"])) for g in FACTS["nav_state_groups"]]

# 同一 group 内多条规则按 order 字段排序（缺省 100000，再按 id 兜底）。
# **跨 group 的顺序不在这里决定**：由 facts.yaml 的 group_order 决定（见文件末尾的执行循环），
# 而 finding 的 id（F01、F02…）按发射顺序生成，所以改 group_order 会改报告里的编号。
RULES.sort(key=lambda r: (r.get("order", 100000), r.get("id", "")))

# 阈值不再集中存放：每条经验的判定阈值都写在它自己的 rules/*.yaml 里
# （px4-thresholds.toml 已退场）。本文件只保留引擎级格式常量。

# ULog 日志级别：PX4 在 log_level 里填 ASCII 数字，映射与 pyulog Message.log_level_str() 一致
# （见 pyulog/core.py）。经验文件按 level_name 判定，避免再犯“拿 3/4 去比 51/52”的错。
_LOG_LEVEL_NAMES = {int(k): v for k, v in FACTS["log_levels"].items()}

findings = []
checks_run = []
checks_skipped = []
tags = []          # 第二层异常标签（喂给第三层故障库匹配）
guard_tags = []    # 数据质量/边界标签
_fid = [0]

def add_tag(t):
    if t not in tags:
        tags.append(t)

def add(severity, rule_id, tag, title, field, value, threshold=None, unit=None,
        doc=None, suggestion=None, tags_extra=None):
    _fid[0] += 1
    ev = {"field": field, "value": value}
    if threshold is not None: ev["threshold"] = threshold
    if unit is not None: ev["unit"] = unit
    f = {"id": "F%02d" % _fid[0], "severity": severity, "ruleId": rule_id,
         "tag": tag, "title": title, "evidence": ev}
    if doc: f["docUrl"] = doc
    if suggestion: f["suggestion"] = suggestion
    findings.append(f)
    if tag: add_tag(tag)
    for te in (tags_extra or []):
        add_tag(te)

def skipped(check, reason):
    item = {"check": check, "reason": reason}
    if item not in checks_skipped:
        checks_skipped.append(item)

def ran(check):
    if check not in checks_run:
        checks_run.append(check)

def find_all(ulog, name):
    return [d for d in ulog.data_list if d.name == name]

def getf(ds, *names):
    for n in names:
        try:
            v = ds.data[n]
            if v is not None: return v
        except Exception:
            pass
    return None

def pick(ds, *names):
    for n in names:
        try:
            v = ds.data[n]
            if v is not None: return n, v
        except Exception:
            pass
    return None, None

def edge_indices(arr):
    """值发生变化的索引列表（边沿检测，避免扫全数组判断状态）。"""
    a = np.asarray(arr)
    if len(a) < 2: return []
    return [i for i in range(1, len(a)) if int(a[i]) != int(a[i - 1])]

buf = io.BytesIO(bytes(ulog_bytes))
ulog = ULog(buf)

# 本日志实际录到的 topic 名集合（\`_rule_env\` 的 \`topics\` 与 \`has_topic()\` 共用一份）
_TOPIC_NAMES = set(d.name for d in ulog.data_list)


def has_topic(name):
    """日志里有没有这个 topic。经验里写 \`not has_topic('cpuload')\`，比 \`'cpuload' not in topics\`
    直白——读的人不必知道 \`topics\` 是个集合。"""
    return name in _TOPIC_NAMES

# ---------------- 固件版本识别（PX4 1.15 起 topic 与字段名有破坏性变化）----------------
# ver_sw_release 打包格式：major<<24 | minor<<16 | patch<<8 | type
def detect_firmware(ulog):
    info = getattr(ulog, "msg_info_dict", {}) or {}
    rel = info.get("ver_sw_release")
    fw = {"release": None, "major": None, "minor": None, "patch": None,
          "git": str(info.get("ver_sw", ""))[:12], "hw": str(info.get("ver_hw", ""))}
    if rel is not None:
        try:
            v = int(rel)
            fw.update({"release": v, "major": (v >> 24) & 0xFF,
                       "minor": (v >> 16) & 0xFF, "patch": (v >> 8) & 0xFF})
        except Exception:
            pass
    return fw

FW = detect_firmware(ulog)
FW_MINOR = FW["minor"]
FW_LABEL = ("%d.%d.%d" % (FW["major"], FW["minor"], FW["patch"])) if FW_MINOR is not None else "未知（旧固件或无版本号）"
FW_PROFILE = "px4-1.15+" if (FW_MINOR is not None and FW_MINOR >= 15) else "px4-legacy"
_info = getattr(ulog, "msg_info_dict", {})

def pick_versioned(*candidates):
    """按固件版本优先取字段来源；版本未知时退化为“字段存在性”判定。
    candidates 形如 (最低 minor 版本或 None, 值)。"""
    known = FW_MINOR is not None
    ordered = sorted(candidates, key=lambda c: (c[0] is None, -(c[0] or 0)))
    for mm, val in ordered:
        if val is None:
            continue
        if mm is None or not known or FW_MINOR >= mm:
            return val
    for _mm, val in candidates:   # 定制固件容错
        if val is not None:
            return val
    return None

# ---------------- 总时长 / 时间基准 ----------------
t_min, t_max = None, None
for d in ulog.data_list:
    t = getf(d, "timestamp")
    if t is not None and len(t) > 1:
        a, b = float(t[0]), float(t[-1])
        t_min = a if t_min is None else min(t_min, a)
        t_max = b if t_max is None else max(t_max, b)
t0 = int(getattr(ulog, "start_timestamp", 0) or (t_min or 0))
duration_s = round((t_max - t_min) / 1e6, 1) if t_min is not None else None
# 事实层的产出分两块（都进 report，见文件末尾）：
#   facts   —— 日志客观"是什么"：机型 / 固件 / 时长 / armed / 阶段 / 丢包。离散、驱动判定
#   metrics —— 给人和 AI 看的**数字**：事实层的概览指标（facts.yaml 的 metrics）+ 各经验的 emit.stats
facts = {"durationSec": duration_s if duration_s is not None else 0}
metrics = {}

# ---------------- 机型识别 ----------------
VEHICLE_TYPES = {int(k): v for k, v in FACTS["vehicle_types"].items()}
vehicle_type = "unknown"
vs_list = find_all(ulog, _VS["topic"])
vs = vs_list[0] if vs_list else None
if vs is not None:
    vt = getf(vs, _VS["vehicle_type"])
    if vt is not None and len(vt) > 0:
        vehicle_type = VEHICLE_TYPES.get(int(vt[-1]), "unknown(%d)" % int(vt[-1]))
    else:
        rw = getf(vs, _VS["is_rotary_wing"])
        if rw is not None and len(rw) > 0:
            vehicle_type = "rotary_wing" if int(rw[-1]) else "fixed_wing"
facts["vehicleType"] = vehicle_type
facts["firmware"] = FW_LABEL
facts["firmwareProfile"] = FW_PROFILE
if FW["hw"]:
    facts["hardware"] = FW["hw"]
# 硬件子型号（同型号的不同批次 / 变体，不是每块板都有）：报告页「硬件版本」与 ver_hw 一起显示
_hw_sub = str(_info.get("ver_hw_subtype", ""))
if _hw_sub:
    facts["hardwareSubtype"] = _hw_sub

# ---------------- 飞行模式 ----------------
# 这次日志里出现过的 nav_state 模式，按占样本数从多到少（名字取 facts.yaml 的 nav_state_names）——
# 列表的"飞行模式"列按 Flight Review 的口径把**全部**模式列出来（它 browse 页就是逗号分隔的全量）
_NAV_NAMES = {int(k): v for k, v in FACTS.get("nav_state_names", {}).items()}
_vs_first = find_all(ulog, _VS["topic"])
if _vs_first:
    _nav = getf(_vs_first[0], _VS["nav_state"])
    if _nav is not None and len(_nav) > 0:
        _counts = {}
        for _code in _nav:
            _c = int(_code)
            _counts[_c] = _counts.get(_c, 0) + 1
        _ordered = sorted(_counts, key=lambda c: -_counts[c])
        facts["modes"] = [str(_NAV_NAMES.get(c, "Mode %d" % c)) for c in _ordered]
        facts["mainMode"] = facts["modes"][0]

# 软件版本的展示串（对齐 Flight Review 的 \`_format_sw_version\`，app/tornado_handlers/browse.py）。
# 规则（**别凭直觉改**，2026-09-16 踩过一次：拿 2024 年的旧 checkout 对齐，把 \`v1.15.0 (479ee0)\`
# 改成了裸哈希，看着"更 FR"其实正好相反）：
#   有 ver_sw_release 时按类型码出串，类型码 = ver_sw_release & 0xFF：
#     64 → \`v1.17.0-alpha\`、128 → \`-beta\`、192 → \`-rc\`、255 → \`v1.16.0\`（正式版无后缀）；
#     **只有 0（未打标签的开发版）才在版本号后面括注 git 短哈希** → \`v1.14.3 (08310a)\`；
#   没有 ver_sw_release（老固件）→ 直接给 git 短哈希（\`> 10\` 位才截 6 位）。
# alpha/beta/RC **不带**哈希，开发版**带**——这是 FR 的原样逻辑，实测 review.px4.io 上
# 一份开发版日志显示的就是 \`v1.14.3 (08310a)\` 两行。
# ver_sw_release 的打包：major<<24 | minor<<16 | patch<<8 | 类型。
_RELEASE_TYPE_SUFFIX = {64: "-alpha", 128: "-beta", 192: "-rc", 255: ""}
_sw = str(_info.get("ver_sw", ""))
_short_sw = _sw[:6] if len(_sw) > 10 else _sw
_rel = FW["release"]
if _rel is None:
    facts["firmwareDisplay"] = _short_sw
else:
    _rtype = int(_rel) & 0xFF
    _disp = "v%d.%d.%d%s" % (FW["major"], FW["minor"], FW["patch"],
                             _RELEASE_TYPE_SUFFIX.get(_rtype, ""))
    if _rtype not in _RELEASE_TYPE_SUFFIX and _sw:   # 未打标签的开发版：附短哈希便于对上游
        _disp += " (%s)" % _short_sw
    facts["firmwareDisplay"] = _disp
# 类型码另存一份：以后要再调口径，前端能凭它重算，不必重新解析日志
facts["fwReleaseType"] = None if _rel is None else int(_rel) & 0xFF
# 原始 git 提交（ver_sw）也留一份：报告页「软件版本」要显示 \`分支（提交）\`，
# 不能只靠 report.verSw——那份是前端存摘要时截过的（20 字符）
if _sw:
    facts["verSw"] = _sw

# ---------------- 载具身份与记录起始时刻 ----------------
# 这几项与判定无关，但历史卡片与报告概况要用，且必须**随 report 存档**（派生数据 info 不进存档）。

uuid = str(_info.get("sys_uuid", ""))
if uuid:
    facts["uuid"] = uuid
# 软件版本用**分支/标签**（如 damiao_dm-fc01_v1.15.0）比 commit 号可读；新固件才有这个键
_branch = str(_info.get("ver_sw_branch", ""))
if _branch:
    facts["verSwBranch"] = _branch

# 载具累计飞行时长：参数 LND_FLIGHT_T_HI/LO 拼成的 64 位 µs 计数器（两个都是 int32，可能读成负数）
_p = ulog.initial_parameters
_hi, _lo = _p.get("LND_FLIGHT_T_HI"), _p.get("LND_FLIGHT_T_LO")
if _hi is not None and _lo is not None:
    facts["vehicleLifeS"] = round((((int(_hi) & 0xFFFFFFFF) << 32) | (int(_lo) & 0xFFFFFFFF)) / 1e6, 1)

# 机架编号（SYS_AUTOSTART，如 4040）——机型之外再给一个可查的标识
_af = _p.get("SYS_AUTOSTART")
if _af is not None:
    facts["airframeId"] = int(_af)

# 记录起始的 UTC 时刻：取 GPS 首次给出有效时间的那一刻（比 boot_time_utc_us 可靠，后者要飞控对过时）
_gps_topic = str((FACTS.get("track") or {}).get("topic", ""))
_gps_list = find_all(ulog, _gps_topic) if _gps_topic else []
if _gps_list and "time_utc_usec" in _gps_list[0].data:
    _t = np.asarray(_gps_list[0].data["time_utc_usec"], dtype=np.int64)
    _nz = np.nonzero(_t > 0)[0]
    if len(_nz):
        facts["startUtc"] = int(_t[_nz[0]] // 1000000)

# ---------------- 飞行阶段识别（第二层，用于故障库 phase 匹配）----------------
# nav_state 码值 → 飞行阶段的分组写在 facts.yaml 的 nav_groups（_NAV_GROUPS 已按它构建）

phases_present = set()
armed_intervals = []      # (start_us, end_us)，end=None 表示持续到日志结束
armed_duration_s = 0.0

if vs is not None:
    nav = getf(vs, _VS["nav_state"])
    arm = getf(vs, _VS["arming_state"])
    vts = np.asarray(getf(vs, _VS["timestamp"]), dtype=np.int64)

    # armed 区间（failsafe 失联只在 armed 区间内才报）
    if arm is not None:
        a = np.asarray(arm)
        start_i = None
        for i in range(len(a)):
            if int(a[i]) == _VS["armed_value"] and start_i is None:
                start_i = i
            elif int(a[i]) != _VS["armed_value"] and start_i is not None:
                armed_intervals.append((int(vts[start_i]), int(vts[i])))
                start_i = None
        if start_i is not None:
            armed_intervals.append((int(vts[start_i]), None))
        total_us = 0
        for s, e in armed_intervals:
            total_us += ((e if e is not None else int(vts[-1])) - s)
        armed_duration_s = round(total_us / 1e6, 1)

    trans_mode = getf(vs, _VS["vtol_in_trans_mode"])
    if nav is not None:
        nav_arr = np.asarray(nav)
        # 只统计 armed 段内的状态；未解锁的地面操作不产生飞行阶段
        if armed_intervals:
            amask = np.zeros(len(nav_arr), dtype=bool)
            for s, e in armed_intervals:
                lo = int(np.searchsorted(vts, s))
                hi = len(vts) if e is None else int(np.searchsorted(vts, e))
                amask[lo:hi] = True
            codes = set(int(c) for c in nav_arr[amask])
            for _phase, _codes in _NAV_GROUPS:
                if codes & _codes:
                    phases_present.add(_phase)
if vs is not None and trans_mode is not None:
    if int(np.max(np.asarray(trans_mode))) > 0:
        phases_present.add("vtol_transition")
# 无 armed 段时，短日志 guard 之外不做任何故障库匹配
facts["armedDurationSec"] = armed_duration_s
facts["phases"] = sorted(phases_present)

# 短日志 guard 的标签由 rules/guard-short-log.yaml 给出；调用放在框架定义之后
# （见下方 _run_rules("guards_early")），以保证它是第一个 guard 标签。

# ---------------- 数据质量事实（供 guards 类经验判定）----------------
# 中途重启：同一 topic 时间戳出现回退（样本 > 10 才算）
restart_topics = 0
for _d in ulog.data_list:
    _t = getf(_d, "timestamp")
    if _t is not None and len(_t) > 10:
        _a = np.asarray(_t, dtype=np.int64)
        if int(np.count_nonzero(np.diff(_a) < 0)) > 0:
            restart_topics += 1
# 日志丢包累计
dropout_total_ms = int(sum(getattr(d, "duration", 0) for d in getattr(ulog, "dropouts", [])))
facts["dropoutTotalMs"] = dropout_total_ms

def in_armed(ts_us):
    for s, e in armed_intervals:
        if ts_us >= s and (e is None or ts_us <= e):
            return True
    return False

# ---------------- 经验规则框架（rules/*.yaml 驱动）----------------
# 位置说明：本段位于原「规则 4：CPU 负载」处。迁移期的顺序约束——规则按 RULES 顺序
# 在此执行，而 finding.id（F01、F02…）按发射顺序生成，所以**必须按与原检查相同的次序
# 迁移**（vibration → ekf → power → cpu → gps → failsafe …），否则 id 会与冻结基线错位。
_ALLOWED_NODES = (
    ast.Expression, ast.BoolOp, ast.And, ast.Or, ast.UnaryOp, ast.Not, ast.USub,
    ast.Compare, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.Eq, ast.NotEq, ast.In, ast.NotIn,
    ast.Is, ast.IsNot,
    ast.BinOp, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod,
    ast.Name, ast.Load, ast.Constant, ast.List, ast.Tuple, ast.Set,
    # f-string（证据值用：\`value: f"{vibe_mean:.3f}"\`）。它的占位符里还是普通表达式，
    # 求值仍在同一个空 __builtins__ 环境下，没有新能力。
    ast.JoinedStr, ast.FormattedValue,
)

# 表达式里**唯一**放行的函数调用。\`has_topic('x')\` 比 \`'x' in topics\` 直白
# （读的人不必知道 topics 是个集合），但把它做成函数就意味着要开"允许调用"这个口子，
# 所以白名单只此一项、且要求实参是字符串字面量。其余能力（属性/下标/推导式）一律不给。
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
            arg_ok = len(node.args) == 1 and isinstance(node.args[0], ast.Constant) \
                and isinstance(node.args[0].value, str)
            if not (ok and arg_ok and not node.keywords):
                raise ValueError(
                    "表达式里只允许 %s('字符串')：%s"
                    % ("/".join(sorted(_EXPR_CALLABLE)), expr))
            continue
        if not isinstance(node, _ALLOWED_NODES):
            raise ValueError("表达式含不允许的语法 %s：%s" % (type(node).__name__, expr))
    return eval(compile(tree, "<rule>", "eval"), {"__builtins__": {}}, env)


def _read_field_ref(ref, aliases=None):
    """'topic.field' → 该字段在各实例上的值（多实例拼接）；topic/字段缺失返回 None。

    数组字段（如 float32[14] voltage_cell_v）pyulog 按 'field[i]' 暴露，
    直接 getf(field) 拿不到，这里尝试下标 0..31，返回**每元素一列的列表**；
    缺的元素位置为 None。

    aliases 是该字段的备用命名（旧固件改过名，如 stddev_accel_x ↔ stddev_accel_x_m_s2）。
    """
    topic, _, field = ref.partition(".")
    ds = find_all(ulog, topic)
    if not ds:
        return None
    aliases = list(aliases or [])

    def gather(get_one):
        vals = []
        for d in ds:
            v = get_one(d)
            if v is not None and len(v):
                vals.append(np.asarray(v, dtype=float))
        if not vals:
            return None
        return np.concatenate(vals) if len(vals) > 1 else vals[0]

    direct = gather(lambda d: getf(d, field, *aliases))
    if direct is not None:
        return direct
    def gather_cell(idx):
        # pyulog 对定长数组通常暴露为 'field[0]'，个别构建为 'field_0'
        return gather(lambda d: next(
            (v for v in (getf(d, f"{stem}[{idx}]", f"{stem}_{idx}") for stem in [field] + aliases)
             if v is not None), None))

    col0 = gather_cell(0)
    if col0 is None:
        return None
    columns = []
    for i in range(32):
        columns.append(gather_cell(i))
    while columns and columns[-1] is None:
        columns.pop()
    return columns


def _read_field_ref_grouped(ref, aliases=None):
    """per_instance 取数：返回「每个 topic 实例一组」的列表（不跨实例拼接）。

    每组是：标量字段 → 一维数组；定长数组字段 → 每元素一列的列表；缺失 → None。
    aliases 为该字段的备用命名（pyulog 字段改名/旧固件）：标量按整名回退，
    数组字段按 'stem[i]' / 'stem_i' 两种形态按下标展开。
    """
    topic, _, field = ref.partition(".")
    ds = find_all(ulog, topic)
    if not ds:
        return None
    aliases = list(aliases or [])
    groups = []
    for d in ds:
        direct = getf(d, field, *aliases)
        if direct is not None and len(direct):
            groups.append(np.asarray(direct, dtype=float))
            continue
        stems = [field] + aliases
        cols = []
        for idx in range(32):
            col = None
            for stem in stems:
                v = getf(d, f"{stem}[{idx}]", f"{stem}_{idx}")
                if v is not None and len(v):
                    col = np.asarray(v, dtype=float)
                    break
            cols.append(col)
        while cols and cols[-1] is None:
            cols.pop()
        groups.append(cols if cols else None)
    return groups


# ---------------- compute 表达式求值（rules/*.yaml 的 compute 是表达式，不再是节点链）----------------
# 产物里存的**就是作者写的原文**（老写法在构建期被 rule-expr.mjs 编译成等价表达式）：
#   vibe_mean, vibe_p95, ..., imu_idx = worst_mean_stats(ref("...", per_instance=True), min_mean=0)
#   pct = frac * 100
#   p99_stat = p99 if seg_n > 50 else None
#   w_p95 = percentile(hypot(coalesce(ref("estimator_wind.windspeed_north", when_fw=">=1.15"), ...), p=95)
#
# 求值用 Python 自带的 ast，**不 eval 作者原文**：先按白名单遍历、把 topic.field 重写成
# 取数调用，再在空 __builtins__ 下 exec。构建期（web/scripts/lib/rule-expr.mjs）已经把
# 算子名/入参/变量声明校验过一遍，这里再查一遍是为了防"构建期放行、运行期能执行任意代码"
# 这类缝——两道关卡的判据不同，不能只留一道。

# 比 _ALLOWED_NODES 多出：赋值语句、调用、属性（字段引用）、三元、字典（算子选项）
_ALLOWED_COMPUTE = _ALLOWED_NODES + (
    ast.Module, ast.Assign, ast.Expr, ast.Store,
    ast.Call, ast.Attribute, ast.keyword, ast.IfExp, ast.Dict,
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
            ast.Call(func=ast.Name(id="ref", ctx=ast.Load()),
                     args=[ast.Constant(value="%s.%s" % (node.value.id, node.attr))],
                     keywords=[]),
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


# 表达式求值的名字表：算子按注册名直接可调用，另加 ref（取数）。
# __builtins__ 置空——表达式里不该有任何 Python 内置能力。
_COMPUTE_GLOBALS = {"__builtins__": {}, "ref": None}
_COMPUTE_GLOBALS.update(OPERATORS)


def _eval_compute(stmt, env):
    """求值一条 compute 表达式，结果写进 env。

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
    try:
        exec(code, _COMPUTE_GLOBALS, env)
    except Exception:
        if not guarded:
            raise
        for name in targets:
            env[name] = None


def _ref(name, per_instance=False, instance=None, alias=None, when_fw=None):
    """字段取数：表达式里的 \`ref("topic.field", ...)\` 与裸写的 \`topic.field\` 都走这里。

    修饰与老节点上的同名选项一一对应，只是作用域从「整个节点」收窄到「这一个引用」：
      per_instance —— 按实例分组读（每实例一组），交给需要分组的算子
      instance     —— 只取第 N 个实例
      alias        —— 字段的备用命名（旧固件改过名）
      when_fw      —— 固件版本不满足就返回 None（交给 coalesce 选另一个分支）
    """
    if when_fw is not None and not _match_firmware(when_fw):
        return None
    aliases = None
    if alias is not None:
        aliases = [alias] if isinstance(alias, str) else list(alias)
    if per_instance or instance is not None:
        groups = _read_field_ref_grouped(name, aliases)
        if instance is not None:
            return groups[instance] if groups and len(groups) > instance else None
        return groups
    return _read_field_ref(name, aliases)


_COMPUTE_GLOBALS["ref"] = _ref
_COMPUTE_GLOBALS["has_topic"] = has_topic


def _collect_log_messages():
    """ulog.logged_messages → [{tSec, message, level, level_name}]。

    level 是 ULog 里的原始字节，PX4 填的是 **ASCII 数字**（'3'=51 才是 ERROR），
    与 pyulog 的 Message.log_level_str() 一致；因此经验文件按 level_name 判定，
    不要直接和 3/4 这种数字比（迁移前就是这么比错的，导致消息类经验从不命中）。
    """
    out = []
    for m in getattr(ulog, "logged_messages", []):
        try:
            ts_s = round((int(m.timestamp) - t0) / 1e6, 2)
        except Exception:
            ts_s = None
        lvl = int(getattr(m, "log_level", ord("6")))
        out.append({
            "tSec": ts_s,
            "message": str(m.message).strip(),
            "level": lvl,
            "level_name": _LOG_LEVEL_NAMES.get(lvl, "UNKNOWN"),
        })
    return out


def _rule_env():
    """日志级内置变量：经验里可直接引用，无需在 compute 里声明。"""
    return {
        "firmware": FW_LABEL,
        "fw_major": FW["major"], "fw_minor": FW["minor"], "fw_profile": FW_PROFILE,
        "airframe": vehicle_type,
        "is_rotary_wing": vehicle_type == "rotary_wing",
        "is_fixed_wing": vehicle_type == "fixed_wing",
        "is_vtol": "vtol" in vehicle_type,
        "is_rover": vehicle_type == "rover",
        "duration_s": duration_s if duration_s is not None else 0,
        "armed_s": armed_duration_s,
        "phases": phases_present,
        "tags": set(tags),
        "guard_tags": set(guard_tags),
        # 时序算子（如 head_tail_median_drop）按 armed 区间切窗用
        "armed_intervals": armed_intervals,
        # 事件类算子的相对时间（t=xx.x s）基准
        "t0_us": t0,
        # 是否有 armed 段（原过程式大量用 \`if armed_intervals:\` 做外层门控）
        "has_armed": bool(armed_intervals),
        # 本日志实际存在的 topic 名集合（表达式里可写 "'xxx' in topics"）
        "topics": _TOPIC_NAMES,
        # 同一件事的函数写法（更直白，见 has_topic 的定义）
        "has_topic": has_topic,
        # 数据质量事实（guards 类经验用）
        "restart_detected": restart_topics > 0,
        "dropout_ms": dropout_total_ms,
        # 日志消息（ulog.logged_messages）：供「日志消息聚合」类经验按级别筛选
        "messages": _collect_log_messages(),
        # compute 是否算不出来。初值 False；compute 失败后置真，再判一轮 \`skip\` 列表。
        # 于是"数据不足要记一条 skipped"不必再单设一个字段——它就是 skip 里的一条普通条件。
        "no_data": False,
    }


def _match_firmware(spec):
    """固件版本约束串：any / ">=1.15" / "<1.15" / ">=1.14,<1.15"（逗号=与）。

    只给 \`ref(..., when_fw=)\` 用（规则级的适用范围轴已经改成表达式了）。
    """
    if not spec or spec == "any":
        return True
    if FW_MINOR is None:
        return True          # 版本未知不因版本排除（与迁移前“按字段存在性判定”一致）
    cur = (FW["major"] if FW["major"] is not None else 0, FW_MINOR)
    for part in str(spec).split(","):
        m = re.match(r"^\s*(>=|<=|==|>|<)?\s*(\d+)\.?(\d+)?\s*$", part)
        if not m:
            raise ValueError("无法解析 firmware 约束：%r" % spec)
        op, maj, mi = m.group(1) or "==", int(m.group(2)), int(m.group(3) or 0)
        want = (maj, mi)
        ok = {">=": cur >= want, "<=": cur <= want, ">": cur > want,
              "<": cur < want, "==": cur == want}[op]
        if not ok:
            return False
    return True


def _rule_skipped(rule, checks, env):
    """按顺序走规则的 \`skip\` 列表；命中第一条就返回 True（并视情况记一条 skipped）。

    每一项是 \`{when: <Python 表达式>, reason?: <文案>}\`——表达式与 \`compute\` / \`triggers\`
    同一套语法。写了 \`reason\` 就记一条 skipped（报告里能看到"为什么没跑"），**不写则静默**
    跳过（既不 ran 也不 skipped，用于"这本来就跟我无关"的场合）。

    会被调**两轮**：compute 之前一轮（此时 \`no_data\` 为假），compute 失败后再一轮
    （\`env["no_data"]\` 已置真）。所以"数据不足"也只是列表里的一条普通条件，
    不必再单设一个字段。
    """
    for spec in (rule.get("skip") or []):
        when = spec.get("when")
        if when is None:
            raise ValueError("规则 %s 的 skip 项缺少 when" % rule.get("id"))
        try:
            hit = bool(_eval_expr(when, env))
        except Exception:
            hit = False
        if not hit:
            continue
        if spec.get("reason"):
            for check in checks:
                skipped(check, spec["reason"])
        return True
    return False


def _run_rules(group):
    """执行声明了该 group 的经验规则。

    finding 的 id 是按发射顺序（F01、F02…）生成的，所以每条规则的 group **必须与
    它所替换的原过程式检查的位置一致**（vibration → ekf → power → cpu → gps →
    failsafe → mode_thrash …）；同一 group 内按 order / id 排序执行。
    """
    for _rule in RULES:
        if _rule.get("group") != group:
            continue
        _rid = _rule["id"]
        _checks = (_rule.get("emit") or {}).get("check")
        if _checks is None:
            _checks = []            # guards 类经验没有 check 名（不记 ran/skipped）
        elif not isinstance(_checks, list):
            _checks = [_checks]
        _env = _rule_env()
        # 适用范围两轴先判：固件 / 机架。**写成表达式**（不限就写 True），与 compute /
        # triggers 同一套语法——不再另设 "any" / ">=1.15" 这类小语言。
        # 不匹配则静默：既不 ran 也不 skipped（这是最外层的门，"这条经验根本不属于本机"
        # 不值得在报告里刷一条）。要留痕就把它写进 skip 映射。
        try:
            _axis_ok = bool(_eval_expr(_rule["firmware"], _env)) and \
                       bool(_eval_expr(_rule["airframe"], _env))
        except Exception:
            _axis_ok = False
        if not _axis_ok:
            continue
        # 再判「不适用」声明（机型未知、无 armed 段、缺某 topic …）：命中即跳过本条。
        # 写了文案的记一条 skipped——报告里能看到"为什么没跑"；写 null 的静默。
        if _rule_skipped(_rule, _checks, _env):
            continue
        # requires.any_of / all_of：分别表示“任一存在即可”与“必须都存在”的依赖 topic
        # （多版本同义 topic 用 any_of，如 estimator_wind / wind_estimate）。缺则 skipped。
        _req = _rule.get("requires") or {}
        _need_any = _req.get("any_of") or []
        _need_all = _req.get("all_of") or []
        _missing = (bool(_need_any) and not any(find_all(ulog, t) for t in _need_any)) or \
                   (bool(_need_all) and not all(find_all(ulog, t) for t in _need_all))
        if _missing:
            _need_txt = list(_need_any) + list(_need_all)
            for _check in _checks:
                skipped(_check, _req.get("reason") or ("缺少依赖 topic：%s" % ", ".join(_need_txt)))
            continue
        # topic 在就 ran（与原过程式块一致：ran() 在块首，数据不足只代表不发射 finding）。
        # ran_on_success：原实现把 ran() 放在数据判定**之后**（如 motor_balance 只在
        # 活跃通道 >= 4 时才算“跑过”），这类规则改为 compute 成功后再记 ran。
        _ran_late = bool(_rule.get("ran_on_success")) or _rule.get("ran_when") is not None
        if not _ran_late:
            for _check in _checks:
                ran(_check)

        _ok = True
        for _stmt in (_rule.get("compute") or []):
            # compute 是**表达式**（构建期把老节点写法编译成等价表达式，产物里只有这一种形态）。
            # 求值出来的名字进 _env，供后面的表达式与 triggers / emit 引用。
            try:
                _eval_compute(_stmt, _env)
            except Exception:
                # 数据不足（或该表达式在这份日志上求不出来）：按"数据不足"中止本条规则，
                # 与原节点链一致——不发射 finding
                _ok = False
                break
        if not _ok:
            # 数据不足也要能留痕：把 no_data 置真再判一轮 skip（原 skip_reason_no_data 的职责）
            _env["no_data"] = True
            _rule_skipped(_rule, _checks, _env)
            continue
        if _ran_late:
            # 原实现把 ran() 放在数据判定**之后**（如 motor_balance 只在活跃通道 >= 4 时
            # 才算“跑过”、attitude 只在机动段样本足够时才算）。ran_when 可再给条件。
            _ran_ok = True
            if _rule.get("ran_when") is not None:
                try:
                    _ran_ok = bool(_eval_expr(_rule["ran_when"], _env))
                except Exception:
                    _ran_ok = False
            if _ran_ok:
                for _check in _checks:
                    ran(_check)

        _emit = _rule["emit"]
        # emit.guard_tags：按条件产生的数据质量标签（等价于原过程式的 guard_tags.append，
        # 不依赖是否发出 finding——如陀螺零偏的“温度变化大”）
        for _gspec in (_emit.get("guard_tags") or []):
            try:
                _g_hit = _eval_expr(_gspec["when"], _env)
            except Exception:
                _g_hit = False
            if _g_hit and _gspec.get("tag") and _gspec["tag"] not in guard_tags:
                guard_tags.append(_gspec["tag"])
        for _key, _spec in (_emit.get("stats") or {}).items():
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
            for _trig in (_rule.get("triggers") or []):
                # 单条触发条件出错（例如表达式把缺失值 None 与数值比较）不应让整份日志
                # 的分析崩掉：视为未命中，继续下一条。这类错误应当在基线回归里暴露。
                try:
                    _hit = _eval_expr(_trig["when"], _tenv)
                except Exception:
                    _hit = False
                if not _hit:
                    continue
                # 证据值就是一个**表达式**：写变量得原值、写 f"{x:.3f}" 得格式化后的串、
                # 写常量就得到常量。原先的 value / value_const / value_text 三个字段
                # 加一个 round 开关，收成了这一个。
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
                add(_trig["severity"], _rid, _trig.get("tag", _emit.get("tag")),
                    _trig["title"].format_map(_tenv), _field, _val,
                    _trig.get("threshold"), _trig.get("unit"),
                    _emit.get("doc"), _sugg)
                # evidence_extra: {evidence 键: 变量名}，把额外证据挂到刚发出的 finding 上
                # （如日志消息的 samples 原文列表）
                for _ek, _evn in (_trig.get("evidence_extra") or {}).items():
                    _evv = _tenv.get(_evn)
                    if _evv is not None:
                        findings[-1]["evidence"][_ek] = _evv
                break


# guards_early：必须在其它规则之前跑，保证 insufficient_data 是第一个 guard 标签
# ---------------- 按 facts.yaml 的 group_order 顺序执行各 group ----------------
# 顺序即 finding 编号（F01、F02…）的生成顺序，也决定 guard 标签的先后
# （guards_early 排第一，insufficient_data 才会是第一个 guard 标签）。
# 新增经验只需把 group 写进 knowledge/px4/facts.yaml 的 group_order（或复用已有 group）
# 并让经验里的 group 对上——**不用改这个文件**；构建期会校验 group 是否都已登记。
for _group in FACTS["group_order"]:
    _run_rules(_group)

# ---------------- 第三层：故障知识库确定性匹配 ----------------
def match_fault_kb():
    active_tags = set(tags)
    matched = []
    for e in FAULT_KB:
        trig = e.get("trigger_tags", [])
        phases = e.get("flight_phase", ["all"])
        excl = e.get("exclude_tags", [])
        if not any(t in active_tags for t in trig):
            continue
        if any(x in guard_tags or x in active_tags for x in excl):
            continue
        if "all" not in phases:
            if not any(p in phases_present for p in phases):
                continue
        matched.append({
            "faultId": e["fault_id"],
            "faultTag": e["fault_tag"],
            "riskLevel": e.get("risk_level", ""),
            "possibleRootCause": e.get("possible_root_cause", []),
            "troubleshootingSteps": e.get("troubleshooting_steps", []),
            "note": e.get("note", ""),
            "matchedPhases": [p for p in phases if p == "all" or p in phases_present],
        })
    return matched

# 短日志由 guard 标签派生（阈值的唯一来源是 guard-short-log.yaml）
short_log = "insufficient_data" in guard_tags
matched_faults = [] if short_log else match_fault_kb()

# ---------------- 概览指标（knowledge/px4/facts.yaml 的 metrics）----------------
# 规则顺带产出的实测值优先（更贴合判定口径）；规则没跑（缺字段 / 机型不适用）时按声明兜底现算，
# 这样用户在「关键数据」里始终看得到数，不会因为某条规则 skip 就凭空少几项。
_M_RESERVED = {"key", "label", "unit", "topic", "field", "fields", "op", "pick", "scale", "round"}


def _metric_fallback(m):
    """按声明现算一个概览指标；任何一步缺失都返回 None（这一项就不显示）"""
    try:
        topic = m.get("topic")
        if not topic:
            return None
        d_list = find_all(ulog, topic)
        if not d_list:
            return None
        fields = m.get("fields") or ([m["field"]] if m.get("field") is not None else [])
        if not isinstance(fields, list):
            fields = [fields]
        args = []
        for cand in fields:
            names = cand if isinstance(cand, list) else [cand]   # 候选字段名：取第一个存在的
            col = None
            for n in names:
                col = getf(d_list[0], n)
                if col is not None:
                    break
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
            return int(val) if _r == 0 else val   # round(x, 0) 仍是 float，整数量要转回 int
        return val
    except Exception:
        return None


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

__result = json.dumps({
    "platform": "PX4",
    "parserVersion": "pyulog/pyodide-0.3.0",
    # 事实层产出：facts=日志是什么（离散，驱动判定）；metrics=关键数字（有序，带中文名与单位）
    "facts": facts,
    "metrics": _metric_entries,
    # 判定层产出（规则与故障库）
    "tags": tags,
    "guardTags": guard_tags,
    "checksRun": checks_run,
    "checksSkipped": checks_skipped,
    "matchedFaults": matched_faults,
    "findings": findings,
}, ensure_ascii=False)
`
  .replace("__FAULT_KB__", JSON.stringify(faultKbJson.entries))
  .replace("__RULES__", JSON.stringify(rules))
  .replace("__FACTS__", JSON.stringify(facts));
