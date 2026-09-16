// ⚠️ 自动生成，请勿手改。源文件在 engine/ 与 knowledge/px4/，改完跑 `pnpm build:kb`（dev/build 自动执行）。
import faultKbJson from "./fault-kb.generated.json";

const rules = [{"id":"px4-airspeed-invalid","slot":"airspeed","order":1,"name":"空速健康","version":"1.0.0","category":"airspeed","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"fixed_wing","not_applicable":{"when":"airframe == 'unknown'","skip_reason":"机型未知，无法判定固定翼巡航段"},"silent_when":"'vehicle_attitude_setpoint' not in topics","requires":{"any_of":["airspeed_validated"]},"skip_reason":"无固定翼巡航段或未记录 airspeed_validated","skip_reason_no_data":"无固定翼巡航段或未记录 airspeed_validated","compute":[{"out":"fw_cruise","in":["vehicle_status.nav_state","vehicle_status.timestamp","armed_intervals"],"op":"masked_any_in","codes":[3,8]},{"out":"cruise_ok","in":["fw_cruise"],"op":"require_true"},{"out":"invalid_frac","from":"airspeed_validated.airspeed_sensor_measurement_valid","op":"ratio_equal","value":0,"optional":true},{"out":"has_invalid","in":["invalid_frac"],"op":"is_not_none","optional":true},{"out":"tas_min","from":"airspeed_validated.true_airspeed_m_s","op":"min","optional":true}],"triggers":[{"expr":"has_invalid and invalid_frac >= 0.50","severity":"critical","tag":"low_airspeed","threshold":0.5,"value":"invalid_frac","round":3,"field":"airspeed_validated.airspeed_sensor_measurement_valid","title":"空速传感器在固定翼段大部分时间无效（{invalid_frac:.0%} 样本）","suggestion":"结合故障库 F009：空速失效极易引发失速，检查空速管堵塞/积水、管路漏气与校准。"},{"expr":"has_invalid and invalid_frac >= 0.10","severity":"warning","tag":"low_airspeed","threshold":0.1,"value":"invalid_frac","round":3,"field":"airspeed_validated.airspeed_sensor_measurement_valid","title":"空速传感器间歇无效（{invalid_frac:.0%} 样本）","suggestion":"结合故障库 F009 检查空速管与管路密封。"}],"emit":{"check":"airspeed","tag":"low_airspeed","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html","stats":{"airspeedInvalidRatio":{"var":"invalid_frac","round":3},"airspeedMinM":{"var":"tas_min","round":1}}}},{"id":"px4-attitude-oscillation","slot":"attitude_tracking","order":2,"name":"姿态误差高频振荡","version":"1.1.0","category":"attitude","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出（原与超调同块，拆为独立经验）"},{"version":"1.1.0","date":"2026-09-15","note":"30 个节点收成一个复合算子 att_tracking_stats"}],"firmware":"any","airframe":"any","requires":{"all_of":["vehicle_attitude","vehicle_attitude_setpoint"]},"skip_reason":"vehicle_attitude(_setpoint) 或 armed 段缺失","not_applicable":{"when":"not has_armed","skip_reason":"vehicle_attitude(_setpoint) 或 armed 段缺失"},"ran_when":"seg_ok","compute":[{"out":["p99","osc_hz","seg_n"],"in":["vehicle_attitude.q","vehicle_attitude_setpoint.q_d","vehicle_attitude_setpoint.roll_body","vehicle_attitude_setpoint.pitch_body","vehicle_attitude.timestamp","vehicle_attitude_setpoint.timestamp","armed_intervals","fw_minor"],"op":"att_tracking_stats","optional":true,"tilt_min_deg":10,"min_samples":50,"sample_rate":50},{"out":"seg_ok","in":["seg_n",50],"op":"gt","optional":true},{"out":"p99_stat","in":["seg_ok","p99"],"op":"value_if","optional":true},{"out":"osc_stat","in":["seg_ok","osc_hz"],"op":"value_if","optional":true}],"triggers":[{"expr":"osc_stat >= 4.0 and p99_stat >= 25.0 and is_fixed_wing","severity":"warning","tag":"attitude_overshoot","threshold":4,"value":"osc_stat","round":2,"unit":"Hz","field":"姿态跟踪误差符号翻转频率","title":"姿态误差高频振荡（约 {osc_stat:.1f} Hz）","suggestion":"振荡多与控制增益/机架共振相关，禁用大幅调参，先做频响检查。"},{"expr":"osc_stat >= 4.0 and p99_stat >= 15.0 and not is_fixed_wing","severity":"warning","tag":"attitude_overshoot","threshold":4,"value":"osc_stat","round":2,"unit":"Hz","field":"姿态跟踪误差符号翻转频率","title":"姿态误差高频振荡（约 {osc_stat:.1f} Hz）","suggestion":"振荡多与控制增益/机架共振相关，禁用大幅调参，先做频响检查。"}],"emit":{"check":"attitude_tracking","tag":"attitude_overshoot","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html","stats":{"attitudeErrDegP99":{"var":"p99_stat","round":1},"attitudeOscHz":{"var":"osc_stat","round":2}}}},{"id":"px4-attitude-overshoot","slot":"attitude_tracking","order":1,"name":"姿态跟踪超调","version":"1.1.0","category":"attitude","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"},{"version":"1.1.0","date":"2026-09-15","note":"30 个节点收成一个复合算子 att_tracking_stats"}],"firmware":"any","airframe":"any","requires":{"all_of":["vehicle_attitude","vehicle_attitude_setpoint"]},"skip_reason":"vehicle_attitude(_setpoint) 或 armed 段缺失","not_applicable":{"when":"not has_armed","skip_reason":"vehicle_attitude(_setpoint) 或 armed 段缺失"},"ran_when":"seg_ok","compute":[{"out":["p99","osc_hz","seg_n"],"in":["vehicle_attitude.q","vehicle_attitude_setpoint.q_d","vehicle_attitude_setpoint.roll_body","vehicle_attitude_setpoint.pitch_body","vehicle_attitude.timestamp","vehicle_attitude_setpoint.timestamp","armed_intervals","fw_minor"],"op":"att_tracking_stats","optional":true,"tilt_min_deg":10,"min_samples":50,"sample_rate":50},{"out":"seg_ok","in":["seg_n",50],"op":"gt","optional":true},{"out":"p99_stat","in":["seg_ok","p99"],"op":"value_if","optional":true},{"out":"osc_stat","in":["seg_ok","osc_hz"],"op":"value_if","optional":true}],"triggers":[{"expr":"p99_stat >= 40.0 and is_fixed_wing","severity":"critical","tag":"attitude_overshoot","threshold":25,"value":"p99_stat","round":1,"unit":"°","field":"vehicle_attitude vs vehicle_attitude_setpoint（机动段）","title":"姿态跟踪误差过大（p99 {p99_stat:.1f}°）","suggestion":"结合故障库 F006：检查姿态环增益、机架共振；避免直接大幅降 PID。"},{"expr":"p99_stat >= 25.0 and is_fixed_wing","severity":"warning","tag":"attitude_overshoot","threshold":25,"value":"p99_stat","round":1,"unit":"°","field":"vehicle_attitude vs vehicle_attitude_setpoint（机动段）","title":"姿态跟踪误差偏大（p99 {p99_stat:.1f}°）","suggestion":"结合故障库 F006 排查；大风环境下优先归因环境扰动。"},{"expr":"p99_stat >= 30.0 and not is_fixed_wing","severity":"critical","tag":"attitude_overshoot","threshold":15,"value":"p99_stat","round":1,"unit":"°","field":"vehicle_attitude vs vehicle_attitude_setpoint（机动段）","title":"姿态跟踪误差过大（p99 {p99_stat:.1f}°）","suggestion":"结合故障库 F006：检查姿态环增益、机架共振；避免直接大幅降 PID。"},{"expr":"p99_stat >= 15.0 and not is_fixed_wing","severity":"warning","tag":"attitude_overshoot","threshold":15,"value":"p99_stat","round":1,"unit":"°","field":"vehicle_attitude vs vehicle_attitude_setpoint（机动段）","title":"姿态跟踪误差偏大（p99 {p99_stat:.1f}°）","suggestion":"结合故障库 F006 排查；大风环境下优先归因环境扰动。"}],"emit":{"check":"attitude_tracking","tag":"attitude_overshoot","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html","stats":{"attitudeErrDegP99":{"var":"p99_stat","round":1},"attitudeOscHz":{"var":"osc_stat","round":2}}}},{"id":"px4-cpu-load","slot":"cpu","name":"CPU 负载","version":"1.0.0","category":"system","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["cpuload"]},"skip_reason":"cpuload not in log","compute":[{"out":"cpu_max","from":"cpuload.load","op":"max"}],"triggers":[{"expr":"cpu_max >= 0.95","severity":"critical","threshold":0.95,"value":"cpu_max","round":3,"field":"cpuload.load(max)","title":"CPU 负载峰值 {cpu_max:.0%} 超阈值","suggestion":"CPU 长期接近满载会导致控制环丢步；检查高耗率模块与日志流配置。"},{"expr":"cpu_max >= 0.90","severity":"warning","threshold":0.9,"value":"cpu_max","round":3,"field":"cpuload.load(max)","title":"CPU 负载峰值 {cpu_max:.0%} 偏高","suggestion":"关注 CPU 余量，必要时降低消息发布率。"}],"emit":{"check":"cpu_load","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html","stats":{"cpuLoadMax":{"var":"cpu_max","round":3}}}},{"id":"px4-ekf-fault","slot":"ekf_faults","order":1,"name":"EKF 融合硬故障","version":"1.0.0","category":"ekf","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["estimator_status"]},"skip_reason":"estimator_status not in log","known_legacy":["estimator_status.nan_flags"],"compute":[{"out":"fault_raw","from":"estimator_status.filter_fault_flags","op":"bit_or_max","per_instance":true,"optional":true},{"out":"nan_raw","from":"estimator_status.nan_flags","op":"max_of_max","per_instance":true,"optional":true},{"out":"fault_union","in":["fault_raw",0],"op":"coalesce","optional":true},{"out":"nan_v","in":["nan_raw",0],"op":"coalesce","optional":true},{"out":"nan_max","in":["nan_v"],"op":"to_int","optional":true},{"out":"crit_bits","in":["fault_union",63],"op":"has_bits","optional":true}],"triggers":[{"expr":"nan_max > 0 or crit_bits","severity":"critical","threshold":0,"value_text":"fault={fault_union},nan={nan_max}","field":"estimator_status.filter_fault_flags/nan_flags","title":"EKF 报告核心融合硬故障（filter_fault_flags={fault_union}, nan_flags={nan_max}）","suggestion":"估计器出现硬故障/NaN，建议停飞排查传感器与振动后重新标定。"},{"expr":"fault_union > 0 and not crit_bits and nan_max == 0","severity":"info","tag":null,"threshold":0,"value":"fault_union","field":"estimator_status.filter_fault_flags","title":"EKF 报告非核心辅助传感器融合拒绝（filter_fault_flags={fault_union}，常见为未使用视觉/光流）","suggestion":"若该机确实未启用视觉/光流定位，此位可忽略；否则检查对应传感器。"}],"emit":{"check":"ekf_faults","tag":"ekf_innovation_failure","doc":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"}},{"id":"px4-ekf-innovation","slot":"ekf_innovations","order":1,"name":"EKF 创新检验","version":"1.0.0","category":"ekf","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["estimator_status"]},"skip_reason":"estimator_status not in log","compute":[{"out":["frac","names","inst"],"in":["estimator_status.innovation_check_flags","estimator_status.vel_test_ratio","estimator_status.pos_test_ratio","estimator_status.hgt_test_ratio","estimator_status.hdg_test_ratio","estimator_status.mag_test_ratio","estimator_status.tas_test_ratio","estimator_status.hagl_test_ratio","estimator_status.beta_test_ratio"],"op":"worst_reject_ratio","per_instance":true,"primary_min":3,"primary_names":["速度","水平位置","垂直位置","磁罗盘 X","磁罗盘 Y","磁罗盘 Z","航向","空速","侧滑","离地高度","光流 X","光流 Y"],"ge":1,"channel_min":3,"channel_labels":["速度","水平位置","垂直高度","航向","磁罗盘","空速","离地高度","侧滑"],"fallback_label":"未知通道"},{"out":"pct","in":["frac"],"op":"scale","factor":100}],"triggers":[{"expr":"pct >= 5.0","severity":"critical","threshold":5,"value":"pct","round":2,"unit":"%","field":"estimator_status 创新检验拒绝样本占比","title":"EKF 创新检验持续失败（estimator #{inst}：{names}）","suggestion":"涉及：{names}。检查对应传感器健康度、安装与校准。"},{"expr":"pct >= 1.0","severity":"warning","threshold":1,"value":"pct","round":2,"unit":"%","field":"estimator_status 创新检验拒绝样本占比","title":"EKF 创新检验偶发失败（estimator #{inst}：{names}）","suggestion":"涉及：{names}。关注 GPS 卫星数、磁罗盘干扰、振动与气压计异常。"}],"emit":{"check":"ekf_innovations","tag":"ekf_innovation_failure","doc":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html","stats":{"ekfRejectRatioPct":{"var":"pct","round":2}}}},{"id":"px4-failsafe-failsafe","slot":"failsafe","order":1,"name":"失效保护触发","version":"1.0.0","category":"failsafe","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["vehicle_status"]},"skip_reason":"vehicle_status not in log","compute":[{"out":"events","in":["vehicle_status.failsafe","vehicle_status.timestamp","armed_intervals","t0_us"],"op":"rising_edge_events"}],"foreach":{"var":"events","keys":["t_s"]},"triggers":[{"expr":"True","severity":"critical","tag":"failsafe","value_text":"set at {t_s:.1f}s","field":"vehicle_status.failsafe","title":"触发失效保护（飞行中，t={t_s:.1f}s）","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。"}],"emit":{"check":"failsafe","doc":"https://docs.px4.io/main/en/config/safety.html"}},{"id":"px4-failsafe-rc_signal_lost","slot":"failsafe","order":2,"name":"遥控信号丢失","version":"1.0.0","category":"failsafe","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["vehicle_status"]},"skip_reason":"vehicle_status not in log","compute":[{"out":"events","in":["vehicle_status.rc_signal_lost","vehicle_status.timestamp","armed_intervals","t0_us"],"op":"rising_edge_events"}],"foreach":{"var":"events","keys":["t_s"]},"triggers":[{"expr":"True","severity":"warning","tag":"rc_lost","value_text":"set at {t_s:.1f}s","field":"vehicle_status.rc_signal_lost","title":"遥控信号丢失（飞行中，t={t_s:.1f}s）","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。"}],"emit":{"check":"failsafe","doc":"https://docs.px4.io/main/en/config/safety.html"}},{"id":"px4-failsafe-data_link_lost","slot":"failsafe","order":3,"name":"数据链路丢失","version":"1.0.0","category":"failsafe","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["vehicle_status"]},"skip_reason":"vehicle_status not in log","compute":[{"out":"events","in":["vehicle_status.data_link_lost","vehicle_status.timestamp","armed_intervals","t0_us"],"op":"rising_edge_events"}],"foreach":{"var":"events","keys":["t_s"]},"triggers":[{"expr":"True","severity":"warning","tag":null,"value_text":"set at {t_s:.1f}s","field":"vehicle_status.data_link_lost","title":"数据链路丢失（飞行中，t={t_s:.1f}s）","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。"}],"emit":{"check":"failsafe","doc":"https://docs.px4.io/main/en/config/safety.html"}},{"id":"px4-failsafe-engine_failure","slot":"failsafe","order":4,"name":"动力故障保护","version":"1.0.0","category":"failsafe","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["vehicle_status"]},"skip_reason":"vehicle_status not in log","compute":[{"out":"events","in":["vehicle_status.engine_failure","vehicle_status.timestamp","armed_intervals","t0_us"],"op":"rising_edge_events"}],"foreach":{"var":"events","keys":["t_s"]},"triggers":[{"expr":"True","severity":"critical","tag":null,"value_text":"set at {t_s:.1f}s","field":"vehicle_status.engine_failure","title":"发动机/动力故障保护（飞行中，t={t_s:.1f}s）","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。"}],"emit":{"check":"failsafe","doc":"https://docs.px4.io/main/en/config/safety.html"}},{"id":"px4-failsafe-mission_failure","slot":"failsafe","order":5,"name":"任务失效保护","version":"1.0.0","category":"failsafe","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["vehicle_status"]},"skip_reason":"vehicle_status not in log","compute":[{"out":"events","in":["vehicle_status.mission_failure","vehicle_status.timestamp","armed_intervals","t0_us"],"op":"rising_edge_events"}],"foreach":{"var":"events","keys":["t_s"]},"triggers":[{"expr":"True","severity":"critical","tag":null,"value_text":"set at {t_s:.1f}s","field":"vehicle_status.mission_failure","title":"任务失效保护（飞行中，t={t_s:.1f}s）","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。"}],"emit":{"check":"failsafe","doc":"https://docs.px4.io/main/en/config/safety.html"}},{"id":"px4-failsafe-nav","slot":"failsafe","order":6,"name":"失效保护导航状态","version":"1.0.0","category":"failsafe","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["vehicle_status"]},"skip_reason":"vehicle_status not in log","compute":[{"out":"events","in":["vehicle_status.nav_state","vehicle_status.timestamp","armed_intervals","t0_us"],"op":"step_into_events","codes":{"5":"AUTO_RTL","12":"DESCEND","13":"TERMINATION","18":"LAND"}}],"foreach":{"var":"events","keys":["t_s","code","name"]},"triggers":[{"expr":"True","severity":"critical","tag":"failsafe","value":"name","field":"vehicle_status.nav_state","title":"飞行中导航状态切换为 {name}（t={t_s:.1f}s）","suggestion":"说明飞控进入失效保护状态，需结合前文事件定位触发原因。"}],"emit":{"check":"failsafe","doc":"https://docs.px4.io/main/en/config/safety.html"}},{"id":"px4-gps-eph","slot":"gps_health","order":1,"name":"GPS 水平位置误差","version":"1.0.0","category":"gps","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["vehicle_gps_position"]},"skip_reason":"vehicle_gps_position not in log","compute":[{"out":"eph_pos","from":"vehicle_gps_position.eph","op":"keep_gt","gt":0},{"out":"eph_m","in":["eph_pos"],"op":"scale_series","factor":0.001},{"out":"e_p95","in":["eph_m"],"op":"percentile","p":95},{"out":"e_max","in":["eph_m"],"op":"max"}],"triggers":[{"expr":"e_p95 >= 10.0","severity":"warning","tag":"gps_eph_high","threshold":10,"value":"e_p95","round":2,"unit":"m","field":"vehicle_gps_position.eph(armed p95)","title":"GPS 水平位置误差持续偏大（p95 {e_p95:.1f} m）","suggestion":"结合故障库 F002：排查天线电磁干扰/遮挡/馈线虚接/多路径。"},{"expr":"e_p95 >= 5.0","severity":"info","tag":"gps_eph_high","threshold":5,"value":"e_p95","round":2,"unit":"m","field":"vehicle_gps_position.eph(armed p95)","title":"GPS 水平位置误差偶发偏大（p95 {e_p95:.1f} m）","suggestion":"关注天线安装位置与遮挡。"}],"emit":{"check":"gps_health","tag":"gps_eph_high","doc":"https://docs.px4.io/main/en/gps_compass/","stats":{"gpsEphP95M":{"var":"e_p95","round":2},"gpsEphMaxM":{"var":"e_max","round":2}}}},{"id":"px4-gps-jump","slot":"gps_health","order":3,"name":"GPS 位置跳变","version":"1.0.0","category":"gps","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["vehicle_gps_position"]},"skip_reason":"vehicle_gps_position not in log","compute":[{"out":"step_new","in":["vehicle_gps_position.latitude_deg","vehicle_gps_position.longitude_deg","vehicle_gps_position.timestamp"],"op":"adjacent_speed_mps","unit":"deg","when_fw":">=1.15","optional":true},{"out":"step_old","in":["vehicle_gps_position.lat","vehicle_gps_position.lon","vehicle_gps_position.timestamp"],"op":"adjacent_speed_mps","unit":"degE7","when_fw":"<1.15","optional":true},{"out":"step","in":["step_new","step_old"],"op":"coalesce","optional":true},{"out":"njump_raw","in":["step"],"op":"count_above","gt":50,"optional":true},{"out":"njump","in":["njump_raw"],"op":"to_int","optional":true}],"triggers":[{"expr":"njump >= 3","severity":"warning","tag":"gps_jump","threshold":3,"value":"njump","unit":"次","field":"vehicle_gps_position lat/lon 相邻差分","title":"GPS 位置出现 {njump} 次异常跳变（>50 m/s）","suggestion":"结合故障库 F002：排查多路径、馈线与电磁干扰；室内跳变为正常现象。"}],"emit":{"check":"gps_health","tag":"gps_jump","doc":"https://docs.px4.io/main/en/gps_compass/","stats":{"gpsJumpCount":{"var":"njump"}}}},{"id":"px4-gps-sats","slot":"gps_health","order":2,"name":"GPS 卫星数","version":"1.0.0","category":"gps","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["vehicle_gps_position"]},"skip_reason":"vehicle_gps_position not in log","compute":[{"out":"s_min_raw","from":"vehicle_gps_position.satellites_used","op":"min"},{"out":"s_min","in":["s_min_raw"],"op":"to_int"}],"triggers":[{"expr":"s_min <= 6","severity":"warning","tag":"gps_eph_high","threshold":8,"value":"s_min","unit":"颗","field":"vehicle_gps_position.satellites_used(min)","title":"GPS 卫星数最少仅 {s_min} 颗","suggestion":"卫星数不足时定位易跳变；排查遮挡与天线。"}],"emit":{"check":"gps_health","tag":"gps_eph_high","doc":"https://docs.px4.io/main/en/gps_compass/","stats":{"gpsSatellitesMin":{"var":"s_min"}}}},{"id":"px4-guard-log-dropouts","slot":"guards","order":3,"name":"数据质量-日志丢包","version":"1.0.0","category":"guard","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑不变"}],"firmware":"any","airframe":"any","emit":{"guard_tags":[{"when":"dropout_ms > 1000","tag":"log_dropouts_high"}]}},{"id":"px4-guard-restart","slot":"guards","order":1,"name":"数据质量-中途重启","version":"1.0.0","category":"guard","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑不变"}],"firmware":"any","airframe":"any","emit":{"guard_tags":[{"when":"restart_detected","tag":"restart_detected"}]}},{"id":"px4-guard-short-log","slot":"guards_early","order":1,"name":"数据质量-短日志","version":"1.0.0","category":"guard","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出；阈值随经验内联，TOML 退场"}],"firmware":"any","airframe":"any","emit":{"guard_tags":[{"when":"armed_s > 0 and armed_s < 60","tag":"insufficient_data"},{"when":"armed_s == 0 and duration_s < 60","tag":"insufficient_data"}]}},{"id":"px4-guard-topic-missing","slot":"guards","order":2,"name":"数据质量-关键 topic 缺失","version":"1.0.0","category":"guard","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑不变"}],"firmware":"any","airframe":"any","emit":{"guard_tags":[{"when":"'vehicle_status' not in topics","tag":"topic_missing:vehicle_status"},{"when":"'battery_status' not in topics","tag":"topic_missing:battery_status"},{"when":"'estimator_status' not in topics","tag":"topic_missing:estimator_status"}]}},{"id":"px4-imu-bias-drift","slot":"imu_bias","order":1,"name":"陀螺零偏漂移","version":"1.1.0","category":"imu","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"},{"version":"1.1.0","date":"2026-09-15","note":"41 个节点收成三个复合算子"}],"firmware":"any","airframe":"any","not_applicable":{"when":"not has_armed","skip_reason":"无 armed 段，不做零偏判定"},"skip_reason_no_data":"无陀螺零偏数据（无 estimator_sensor_bias / estimator_status.states）","known_legacy":["estimator_status.states"],"compute":[{"out":["bx","by","bz","bts","src_text"],"in":["estimator_sensor_bias.gyro_bias","estimator_sensor_bias.timestamp","estimator_states.states","estimator_states.timestamp","estimator_status.states","estimator_status.timestamp","fw_minor"],"op":"gyro_bias_series","instance":0,"slot":10,"optional":true},{"out":["worst_abs","worst_axis","worst_drift","drift_axis"],"in":["bx","by","bz","bts","armed_intervals"],"op":"gyro_bias_worst","labels":["X","Y","Z"],"min_count":10,"optional":true},{"out":"abs_ready","in":["worst_axis"],"op":"is_not_none"},{"out":"abs_gate","in":["abs_ready"],"op":"require_true"},{"out":"temp_range","in":["vehicle_imu_status.temperature_gyro","vehicle_air_data.ambient_temperature"],"op":"max_temp_range","instance":0,"optional":true},{"out":"bias_stat","in":["worst_abs","worst_drift"],"op":"larger","optional":true}],"triggers":[{"expr":"worst_abs >= 0.05 or worst_drift >= 0.05","severity":"critical","tag":"imu_bias_drift","threshold":0.02,"value":"bias_stat","round":4,"unit":"rad/s","field":"{src_text}","title":"陀螺零偏异常（轴 {worst_axis}：绝对值 {worst_abs:.4f} rad/s，漂移 {worst_drift:.4f} rad/s）","suggestion":"结合故障库 F005：检查 IMU 安装紧固、执行陀螺/加计标定；若温度跨度大，优先按温度漂移解释。"},{"expr":"worst_abs >= 0.02 or worst_drift >= 0.02","severity":"warning","tag":"imu_bias_drift","threshold":0.02,"value":"bias_stat","round":4,"unit":"rad/s","field":"{src_text}","title":"陀螺零偏异常（轴 {worst_axis}：绝对值 {worst_abs:.4f} rad/s，漂移 {worst_drift:.4f} rad/s）","suggestion":"结合故障库 F005：检查 IMU 安装紧固、执行陀螺/加计标定；若温度跨度大，优先按温度漂移解释。"}],"emit":{"check":"imu_bias","tag":"imu_bias_drift","doc":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html","stats":{"gyroBiasMaxRadS":{"var":"worst_abs","round":4},"gyroBiasDriftRadS":{"var":"worst_drift","round":4},"gyroBiasSource":{"var":"src_text"},"imuTempRangeC":{"var":"temp_range","round":1}},"guard_tags":[{"when":"temp_range >= 15","tag":"temperature_change_large"}]}},{"id":"px4-imu-clipping","slot":"vibration","order":3,"name":"加速度计削波","version":"1.0.0","category":"vibration","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["vehicle_imu_status"]},"skip_reason":"vehicle_imu_status not in log","compute":[{"out":["clip","clip_idx","clip_axis"],"from":"vehicle_imu_status.accel_clipping","op":"worst_column_delta","per_instance":true,"aliases":{"vehicle_imu_status.accel_clipping":["clipping"]}},{"out":"clip_hit","in":["clip",0],"op":"gt","optional":true},{"out":"clip_stat","in":["clip_hit","clip"],"op":"value_if","optional":true}],"triggers":[{"expr":"clip >= 1000","severity":"critical","threshold":1000,"value":"clip","unit":"count","field":"vehicle_imu_status.accel_clipping[{clip_axis}](末值-首值)","title":"加速度计削波严重：IMU #{clip_idx} 轴 {clip_axis} 全日志累计削波 {clip} 次（理想值为 0）","suggestion":"持续削波会破坏 EKF 估计，请优先排除机械振动源。"},{"expr":"clip >= 100","severity":"warning","threshold":100,"value":"clip","unit":"count","field":"vehicle_imu_status.accel_clipping[{clip_axis}](末值-首值)","title":"检测到明显加速度计削波：IMU #{clip_idx} 轴 {clip_axis} 全日志累计削波 {clip} 次（理想值为 0）","suggestion":"削波表明振动峰值已超出传感器量程，建议排查机械振动源。"},{"expr":"clip > 0","severity":"info","tag":null,"threshold":0,"value":"clip","unit":"count","field":"vehicle_imu_status.accel_clipping[{clip_axis}](末值-首值)","title":"偶发加速度计削波：IMU #{clip_idx} 轴 {clip_axis} 全日志累计削波 {clip} 次（理想值为 0）","suggestion":"少量削波可先观察；频次升高或伴随振动告警需排查机械问题。"}],"emit":{"check":"vibration","tag":"high_vibration","doc":"https://docs.px4.io/main/en/assembly/vibration_isolation.html","stats":{"imuAccelClippingCountMax":{"var":"clip_stat"}}}},{"id":"px4-log-errors","slot":"logged_messages","order":1,"name":"日志错误消息","version":"1.0.1","category":"messages","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"},{"version":"1.0.1","date":"2026-09-15","note":"修正级别判据：按 pyulog 语义用 ASCII 级别名（原 <=3 永不命中）"}],"firmware":"any","airframe":"any","compute":[{"out":"n","in":["messages"],"op":"count_items","key":"level_name","in_list":["EMERGENCY","ALERT","CRITICAL","ERROR"]},{"out":"samples","in":["messages"],"op":"take_items","key":"level_name","in_list":["EMERGENCY","ALERT","CRITICAL","ERROR"],"limit":5,"clip":{"message":200},"drop":["level","level_name"]}],"triggers":[{"expr":"n > 0","severity":"critical","tag":null,"threshold":0,"value":"n","unit":"条","field":"ulog.logged_messages(log_level<=3)","title":"日志中出现 {n} 条 ERROR 及以上消息","suggestion":"按时间顺序核对错误原文，这通常是定位根因最直接的证据。","evidence_extra":{"samples":"samples"}}],"emit":{"check":"logged_messages","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"}},{"id":"px4-log-warnings","slot":"logged_messages","order":2,"name":"日志警告消息","version":"1.0.1","category":"messages","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"},{"version":"1.0.1","date":"2026-09-15","note":"修正级别判据：按 pyulog 语义用 ASCII 级别名（原 ==4 永不命中）"}],"firmware":"any","airframe":"any","compute":[{"out":"n","in":["messages"],"op":"count_items","key":"level_name","eq":"WARNING"},{"out":"samples","in":["messages"],"op":"take_items","key":"level_name","eq":"WARNING","limit":5,"clip":{"message":200},"drop":["level","level_name"]}],"triggers":[{"expr":"n > 0","severity":"warning","tag":null,"threshold":0,"value":"n","unit":"条","field":"ulog.logged_messages(log_level=4)","title":"日志中出现 {n} 条 WARNING 消息","evidence_extra":{"samples":"samples"}}],"emit":{"check":"logged_messages","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"}},{"id":"px4-mode-thrash","slot":"mode_thrash","order":1,"name":"飞行模式抖动","version":"1.0.0","category":"mode","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["vehicle_status"]},"skip_reason":"vehicle_status not in log","compute":[{"out":"n_changes_raw","from":"vehicle_status.nav_state","op":"edges_count"},{"out":"n_changes","in":["n_changes_raw"],"op":"to_int"}],"triggers":[{"expr":"n_changes > 12","severity":"warning","tag":null,"threshold":12,"value":"n_changes","unit":"次","field":"vehicle_status.nav_state 变化次数","title":"飞行模式切换 {n_changes} 次（>12），可能存在模式抖动","suggestion":"频繁切模式易诱发操纵混乱；检查遥控器开关与失效保护反复触发。"}],"emit":{"check":"mode_thrash","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html","stats":{"navStateChanges":{"var":"n_changes"}}}},{"id":"px4-motor-unbalance","slot":"motor_balance","order":1,"name":"电机输出不平衡","version":"1.1.0","category":"motor","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"},{"version":"1.1.0","date":"2026-09-15","note":"17 个节点收成两个复合算子"}],"firmware":"any","airframe":"any","requires":{"any_of":["actuator_motors"]},"skip_reason":"actuator_motors not in log","skip_reason_no_data":"active motor channels < 4 (非多旋翼或未记录全部电机)","ran_on_success":true,"compute":[{"out":"mts","from":"actuator_motors.timestamp","op":"read"},{"out":"cols","from":"actuator_motors.control","op":"read"},{"out":"seg","in":["mts","armed_intervals","vehicle_status.nav_state","vehicle_status.timestamp"],"op":"active_window_mask","codes":[2,4,6,14,21],"min_active":20},{"out":["spread","busiest","idlest","n_active"],"in":["cols","seg"],"op":"column_spread_stats","min_mean":0.01,"min_channels":4}],"triggers":[{"expr":"spread >= 0.15","severity":"critical","tag":"motor_output_unbalance","threshold":0.15,"value":"spread","round":3,"field":"actuator_motors.control[](悬停段均值极差)","title":"电机输出不平衡（悬停段通道 {busiest} 与 {idlest} 差 {spread:.3f}）","suggestion":"结合故障库 F008：检查桨叶型号/正反桨是否一致、单电机效率、机架形变。"},{"expr":"spread >= 0.08","severity":"warning","tag":"motor_output_unbalance","threshold":0.08,"value":"spread","round":3,"field":"actuator_motors.control[](悬停段均值极差)","title":"电机输出差异偏大（通道 {busiest} 与 {idlest} 差 {spread:.3f}）","suggestion":"结合故障库 F008 排查动力一致性；偶发差异可先观察。"}],"emit":{"check":"motor_balance","tag":"motor_output_unbalance","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html","stats":{"motorControlSpread":{"var":"spread","round":3},"motorCountActive":{"var":"n_active"}}}},{"id":"px4-power-cell-voltage","slot":"battery","order":1,"name":"单电芯电压","version":"1.1.0","category":"power","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"},{"version":"1.1.0","date":"2026-09-15","note":"16 个节点收成一个复合算子 cell_voltage_min"}],"firmware":"any","airframe":"any","requires":{"any_of":["battery_status"]},"skip_reason":"battery_status not in log","compute":[{"out":["vmin","cell_min","cells","have_measured","have_fallback","no_cell"],"in":["battery_status.voltage_cell_v","battery_status.voltage_v","battery_status.voltage_filtered_v","battery_status.cell_count"],"op":"cell_voltage_min","optional":true}],"triggers":[{"expr":"have_measured and cell_min < 3.55","severity":"critical","threshold":3.55,"value":"cell_min","round":3,"unit":"V/cell","field":"battery_status.voltage_cell_v[](实测最小值)","title":"电芯电压严重过低","suggestion":"存在过放风险，检查电池老化、放电倍率匹配与低压告警阈值。"},{"expr":"have_fallback and not have_measured and cell_min < 3.55","severity":"critical","threshold":3.55,"value":"cell_min","round":3,"unit":"V/cell","field":"battery_status.voltage_v(min)/cell_count","title":"电芯电压严重过低","suggestion":"存在过放风险，检查电池老化、放电倍率匹配与低压告警阈值。"},{"expr":"have_measured and cell_min < 3.70","severity":"warning","threshold":3.7,"value":"cell_min","round":3,"unit":"V/cell","field":"battery_status.voltage_cell_v[](实测最小值)","title":"电芯电压偏低","suggestion":"建议核对剩余容量估计与返航电压裕度。"},{"expr":"have_fallback and not have_measured and cell_min < 3.70","severity":"warning","threshold":3.7,"value":"cell_min","round":3,"unit":"V/cell","field":"battery_status.voltage_v(min)/cell_count","title":"电芯电压偏低","suggestion":"建议核对剩余容量估计与返航电压裕度。"},{"expr":"no_cell","severity":"info","tag":null,"value_const":"missing","field":"battery_status.voltage_cell_v / cell_count","title":"日志缺少电芯电压与 cell_count，未做单电芯判断"}],"emit":{"check":"battery","tag":"battery_voltage_drop","doc":"https://docs.px4.io/main/en/config/battery.html","stats":{"batteryVoltageMin":{"var":"vmin","round":2},"batteryCellCount":{"var":"cells"},"batteryCellVoltageMin":{"var":"cell_min","round":3}}}},{"id":"px4-power-remaining","slot":"battery","order":3,"name":"电池剩余电量","version":"1.0.0","category":"power","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["battery_status"]},"skip_reason":"battery_status not in log","compute":[{"out":"rem","from":"battery_status.remaining","op":"min_ge","ge":0},{"out":"rem_pct","in":["rem"],"op":"scale","factor":100}],"triggers":[{"expr":"rem <= 0.10","severity":"critical","threshold":0.1,"value":"rem","round":3,"field":"battery_status.remaining(min)","title":"电池剩余电量极低（{rem_pct:.0f}%）","suggestion":"剩余电量低于 10%，应立即返航；检查电量估算与电池健康。"},{"expr":"rem <= 0.20","severity":"warning","threshold":0.2,"value":"rem","round":3,"field":"battery_status.remaining(min)","title":"电池剩余电量偏低（{rem_pct:.0f}%）","suggestion":"剩余电量低于 20%，注意返航裕度。"}],"emit":{"check":"battery","tag":"battery_voltage_drop","doc":"https://docs.px4.io/main/en/config/battery.html","stats":{"batteryRemainingMin":{"var":"rem","round":3}}}},{"id":"px4-power-sag","slot":"battery","order":2,"name":"飞行中持续压降","version":"1.0.0","category":"power","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["battery_status"]},"skip_reason":"battery_status not in log","compute":[{"out":"cell_min_t","from":"battery_status.voltage_cell_v","op":"rows_aggregate","agg":"min","gt":0},{"out":["drop","tail"],"in":["cell_min_t","battery_status.timestamp","armed_intervals"],"op":"head_tail_median_drop","skip_first_s":5,"min_seg":20}],"triggers":[{"expr":"drop >= 0.30 and tail < 3.70","severity":"warning","threshold":0.3,"value":"drop","round":3,"unit":"V","field":"battery_status.voltage_cell_v[] armed 段趋势","title":"飞行中单电芯持续压降 {drop:.2f} V（尾段中位 {tail:.2f} V）","suggestion":"持续压降区别于大机动瞬时压降：排查电芯老化内阻、插头虚接、线缆线径与负载匹配。"}],"emit":{"check":"battery","tag":"battery_voltage_drop","doc":"https://docs.px4.io/main/en/config/battery.html","stats":{"batteryCellSagFlight":{"var":"drop","round":3}}}},{"id":"px4-vibration-stddev","slot":"vibration","order":2,"name":"IMU 加速度标准差","version":"1.0.0","category":"vibration","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["vehicle_imu_status"]},"skip_reason":"vehicle_imu_status not in log","compute":[{"out":["stddev_rss","stddev_idx"],"in":["vehicle_imu_status.stddev_accel_x_m_s2","vehicle_imu_status.stddev_accel_y_m_s2","vehicle_imu_status.stddev_accel_z_m_s2"],"op":"worst_rss_mean","per_instance":true,"min_mean":0,"aliases":{"vehicle_imu_status.stddev_accel_x_m_s2":["stddev_accel_x"],"vehicle_imu_status.stddev_accel_y_m_s2":["stddev_accel_y"],"vehicle_imu_status.stddev_accel_z_m_s2":["stddev_accel_z"]}}],"triggers":[{"expr":"stddev_rss >= 1.0","severity":"critical","threshold":1,"value":"stddev_rss","round":3,"unit":"m/s^2","field":"vehicle_imu_status.stddev_accel_*_m_s2(RSS 均值)","title":"IMU 加速度标准差严重超标（IMU #{stddev_idx}）","suggestion":"结合故障库条目排查桨叶/电机轴承/机架紧固/减震。"},{"expr":"stddev_rss >= 0.5","severity":"warning","threshold":0.5,"value":"stddev_rss","round":3,"unit":"m/s^2","field":"vehicle_imu_status.stddev_accel_*_m_s2(RSS 均值)","title":"IMU 加速度标准差偏大（IMU #{stddev_idx}）","suggestion":"关注桨叶损伤、电机动平衡与 IMU 减震。"}],"emit":{"check":"vibration","tag":"high_vibration","doc":"https://docs.px4.io/main/en/assembly/vibration_isolation.html","stats":{"imuStddevAccelRssMax":{"var":"stddev_rss","round":3}}}},{"id":"px4-vibration","slot":"vibration","order":1,"name":"高频振动","version":"1.0.0","category":"vibration","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["vehicle_imu_status"]},"skip_reason":"vehicle_imu_status not in log","compute":[{"out":["vibe_mean","vibe_p95","vibe_max","imu_idx"],"from":"vehicle_imu_status.accel_vibration_metric","op":"worst_mean_stats","per_instance":true,"min_mean":0}],"triggers":[{"expr":"vibe_mean >= 9.81","severity":"critical","threshold":9.81,"value":"vibe_mean","round":3,"unit":"m/s^2","field":"vehicle_imu_status.accel_vibration_metric(均值)","title":"高频振动严重超标（IMU #{imu_idx}）","suggestion":"Flight Review 红色区间（>9.81 m/s^2）。结合故障库条目排查桨叶/电机/机架/减震。"},{"expr":"vibe_mean >= 4.905","severity":"warning","threshold":4.905,"value":"vibe_mean","round":3,"unit":"m/s^2","field":"vehicle_imu_status.accel_vibration_metric(均值)","title":"高频振动偏大（IMU #{imu_idx}）","suggestion":"Flight Review 橙色区间（4.905~9.81 m/s^2）。结合故障库条目排查桨叶动平衡/电机/IMU 减震。"}],"emit":{"check":"vibration","tag":"high_vibration","doc":"https://docs.px4.io/main/en/assembly/vibration_isolation.html","stats":{"imuAccelVibrationMean":{"var":"vibe_mean","round":3},"imuAccelVibrationP95":{"var":"vibe_p95","round":3},"imuAccelVibrationMax":{"var":"vibe_max","round":3}}}},{"id":"px4-vtol-transition-attitude","slot":"vtol_transition","order":1,"name":"VTOL 转换姿态越限","version":"1.0.0","category":"vtol","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","silent_when":"not has_armed or 'vehicle_status' not in topics","requires":{"any_of":["vtol_vehicle_status"]},"skip_reason":"vtol_vehicle_status not in log","compute":[{"out":"trans_n","from":"vtol_vehicle_status.vtol_in_trans_mode","op":"count_above","gt":0,"optional":true},{"out":"trans_n_i","in":["trans_n"],"op":"to_int","optional":true},{"out":"trans_mask","in":["vtol_vehicle_status.vtol_in_trans_mode","vtol_vehicle_status.timestamp","vehicle_attitude.timestamp"],"op":"fill_to","optional":true},{"out":["roll","pitch","yaw"],"in":["vehicle_attitude.q[0]","vehicle_attitude.q[1]","vehicle_attitude.q[2]","vehicle_attitude.q[3]"],"op":"quat_to_euler","optional":true},{"out":"tilt_r","in":["roll"],"op":"abs_values","optional":true},{"out":"tilt_p","in":["pitch"],"op":"abs_values","optional":true},{"out":"tilt_pt","in":["tilt_r","tilt_p"],"op":"larger","optional":true},{"out":"tilt_max","in":["tilt_pt","trans_mask"],"op":"masked_absmax","optional":true},{"out":"trans_cnt","in":["trans_mask"],"op":"count_true","optional":true},{"out":"enough","in":["trans_cnt",5],"op":"gt","optional":true},{"out":"has_tilt","in":["tilt_max"],"op":"is_not_none","optional":true},{"out":"tilt_stat","in":["enough","tilt_max"],"op":"value_if","optional":true}],"triggers":[{"expr":"has_tilt and enough and tilt_max > 8.0","severity":"warning","tag":"vtol_convert_attitude_over","threshold":8,"value":"tilt_max","round":1,"unit":"°","field":"vehicle_attitude（vtol_in_trans_mode 段）","title":"VTOL 转换阶段姿态越限（最大 {tilt_max:.1f}°，限值 8°）","suggestion":"结合故障库 F003：复盘转换时序与推力匹配，强风环境优先归因环境扰动。"}],"emit":{"check":"vtol_transition","tag":"vtol_convert_attitude_over","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html","stats":{"vtolTransitionSamples":{"var":"trans_n_i"},"vtolTransitionMaxTiltDeg":{"var":"tilt_stat","round":1}}}},{"id":"px4-wind-estimate","slot":"wind_estimate","order":1,"name":"风扰估计","version":"1.0.0","category":"wind","status":"stable","author":{"name":"NextPilot 内置"},"license":"CC-BY-4.0","changelog":[{"version":"1.0.0","date":"2026-09-15","note":"从 ulog_checks.py 迁出，逻辑与阈值不变"}],"firmware":"any","airframe":"any","requires":{"any_of":["estimator_wind","wind_estimate"]},"skip_reason":"estimator_wind / wind_estimate not in log","compute":[{"out":"n_new","from":"estimator_wind.windspeed_north","op":"read","when_fw":">=1.15","optional":true},{"out":"e_new","from":"estimator_wind.windspeed_east","op":"read","when_fw":">=1.15","optional":true},{"out":"n_old","from":"wind_estimate.windspeed_north","op":"read","when_fw":"<1.15","optional":true},{"out":"e_old","from":"wind_estimate.windspeed_east","op":"read","when_fw":"<1.15","optional":true},{"out":"wn","in":["n_new","n_old"],"op":"coalesce","optional":true},{"out":"we","in":["e_new","e_old"],"op":"coalesce","optional":true},{"out":"w","in":["wn","we"],"op":"hypot"},{"out":"w_p95","in":["w"],"op":"percentile","p":95}],"triggers":[{"expr":"w_p95 >= 12.0","severity":"warning","tag":"wind_disturb","guard_tag":"wind_strong","threshold":8,"value":"w_p95","round":1,"unit":"m/s","field":"estimator_wind.windspeed_north/east","title":"估计风速较大（p95 {w_p95:.1f} m/s）","suggestion":"结合故障库 F010：强风属环境扰动，姿态超调/转换越限优先归因风，不要直接改 PID。"},{"expr":"w_p95 >= 8.0","severity":"info","tag":"wind_disturb","guard_tag":"wind_strong","threshold":8,"value":"w_p95","round":1,"unit":"m/s","field":"estimator_wind.windspeed_north/east","title":"估计风速偏大（p95 {w_p95:.1f} m/s）","suggestion":"解释姿态类异常时需考虑风扰因素。"}],"emit":{"check":"wind_estimate","tag":"wind_disturb","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html","stats":{"windSpeedP95M":{"var":"w_p95","round":1}}}}];
const facts = {"slot_order":["guards_early","vibration","ekf_innovations","ekf_faults","battery","cpu","gps_health","failsafe","mode_thrash","motor_balance","imu_bias","attitude_tracking","airspeed","vtol_transition","wind_estimate","logged_messages","guards"],"bindings":{"vehicle_status":{"topic":"vehicle_status","timestamp":"timestamp","nav_state":"nav_state","arming_state":"arming_state","vehicle_type":"vehicle_type","is_rotary_wing":"is_rotary_wing","vtol_in_trans_mode":"vtol_in_trans_mode","armed_value":2}},"log_levels":{"48":"EMERGENCY","49":"ALERT","50":"CRITICAL","51":"ERROR","52":"WARNING","53":"NOTICE","54":"INFO","55":"DEBUG"},"vehicle_types":{"1":"rotary_wing","2":"fixed_wing","3":"rover","4":"airship"},"nav_state_names":{"0":"Manual","1":"Altitude","2":"Position","3":"Mission","4":"Hold","5":"Return","6":"Position Slow","7":"Free5","8":"Free4","10":"Acro","11":"Free3","12":"Descend","13":"Termination","14":"Offboard","15":"Stabilized","16":"Free2","17":"Takeoff","18":"Land","19":"Free1","20":"Follow","21":"Orbit","22":"VTOL Takeoff"},"nav_groups":[{"phase":"takeoff","codes":[17,22]},{"phase":"hover","codes":[2,4,6,14,21]},{"phase":"maneuver","codes":[0,1,10,15]},{"phase":"fw_cruise","codes":[3,8]},{"phase":"landing","codes":[18,20,5,12,13]}],"sys_info_keys":["sys_name","ver_sw","ver_sw_release","ver_vendor_sw_release","ver_hw","ver_hw_subtype","sys_os_name","sys_os_ver","sys_toolchain","sys_toolchain_ver","sys_mcu","time_start_utc","duration","git_branch"],"ulog_msg_types":[{"code":"B","name":"标志位","en":"Flag Bits","desc":"兼容性标志，只在文件开头出现"},{"code":"I","name":"信息","en":"Information","desc":"键 → 值，系统信息字典"},{"code":"M","name":"多值信息","en":"Multi Information","desc":"键 → 多组值，无时间戳（一条长消息会拆成多行续写，故条数多于键数）"},{"code":"F","name":"消息格式","en":"Format","desc":"每个订阅话题的字段定义"},{"code":"P","name":"参数","en":"Parameter","desc":"日志开头的参数值；飞行中改参数也用它"},{"code":"Q","name":"参数默认值","en":"Default Parameter","desc":"只记与当前值不同的默认值（一个参数可能写两条）"},{"code":"A","name":"订阅话题","en":"Add Logged","desc":"每个话题实例一条"},{"code":"R","name":"取消订阅","en":"Remove Logged","desc":"运行中停止记录某话题"},{"code":"D","name":"数据","en":"Data","desc":"日志主体：订阅话题的每一次采样"},{"code":"L","name":"日志消息","en":"Logging","desc":"带时间戳的日志行"},{"code":"C","name":"带标签日志消息","en":"Tagged Logging","desc":"同上，另有来源 tag"},{"code":"O","name":"丢包","en":"Dropout","desc":"记录线程来不及时丢掉的时长"},{"code":"S","name":"同步标记","en":"Sync","desc":"每约 4 KB 一个，损坏后靠它重新对齐"}],"info_key_docs":{"ver_sw":{"name":"固件提交号","desc":"固件构建时的 git 提交，用来对上游源码"},"ver_sw_branch":{"name":"固件分支","desc":"构建所在的分支 / 标签"},"ver_sw_release":{"name":"固件版本号","desc":"打包成 major<<24 | minor<<16 | patch<<8 | 类型（1=release 等）"},"ver_vendor_sw_release":{"name":"厂商版本号","desc":"厂商自定义版本；255 表示厂商未使用"},"ver_hw":{"name":"硬件型号","desc":"飞控板型号，判断引脚 / 传感器配置的入口"},"ver_hw_subtype":{"name":"硬件子型号","desc":"同型号的不同批次 / 变体"},"ver_data_format":{"name":"数据格式版本","desc":"ULog 数据格式版本，与本站解析器看到的格式对应"},"sys_name":{"name":"系统名","desc":"固定为 PX4"},"sys_os_name":{"name":"操作系统","desc":"NuttX（飞控本机）或 Linux（机载计算机）"},"sys_os_ver":{"name":"OS 提交号","desc":"操作系统的 git 提交"},"sys_os_ver_release":{"name":"OS 版本号","desc":"打包方式同固件版本号"},"sys_toolchain":{"name":"工具链","desc":"编译固件用的工具链"},"sys_toolchain_ver":{"name":"工具链版本","desc":"工具链的具体版本，排查\"换个编译器行为就不一样\"时用"},"sys_mcu":{"name":"MCU","desc":"主控芯片型号与硅版本"},"sys_uuid":{"name":"飞控唯一 ID","desc":"PX4GUID，出厂烧录；同型号不同板子也不同，可用来区分设备"},"time_ref_utc":{"name":"UTC 时间参考","desc":"相对启动的偏移（秒）；0 表示这次飞行没对时"},"time_start_utc":{"name":"起始 UTC 时间","desc":"日志起始时刻（旧固件记录）"},"boot_time_utc_us":{"name":"启动时刻","desc":"UTC 微秒；只有对过时才有意义"},"duration":{"name":"日志时长","desc":"秒（旧固件记录）"},"git_branch":{"name":"固件分支","desc":"旧固件的分支名字段"},"metadata_events_sha256":{"name":"事件元数据哈希","desc":"事件定义文件的 SHA-256，用来校验事件定义是否被改动"}},"metrics":[{"key":"imuAccelVibrationMax","label":"最大振动","unit":"m/s²","topic":"vehicle_imu_status","field":"accel_vibration_metric","op":"max","round":2},{"key":"batteryVoltageMin","label":"最低电压","unit":"V","topic":"battery_status","field":"voltage_v","op":"min","round":2},{"key":"batteryCellVoltageMin","label":"最低电芯电压","unit":"V","topic":"battery_status","fields":["voltage_cell_v","voltage_v","voltage_filtered_v","cell_count"],"op":"cell_voltage_min","pick":"vmin","round":3},{"key":"currentMax","label":"最大电流","unit":"A","topic":"battery_status","field":"current_a","op":"max","round":2},{"key":"batteryRemainingMin","label":"最低剩余电量","unit":"0..1","topic":"battery_status","field":"remaining","op":"min_ge","ge":0,"round":3},{"key":"gpsSatellitesMin","label":"最少搜星","unit":"颗","topic":"vehicle_gps_position","field":["satellites_used","satellites_visible"],"op":"min","round":0},{"key":"gpsEphMaxM","label":"最大定位误差","unit":"m","topic":"vehicle_gps_position","field":"eph","op":"max","scale":0.001,"round":2},{"key":"cpuLoadMax","label":"CPU 峰值","unit":"0..1","topic":"cpuload","field":"load","op":"max","round":3},{"key":"imuAccelClippingCountMax","label":"加速度计削波计数","unit":"次"},{"key":"imuTempRangeC","label":"IMU 温度跨度","unit":"°C"},{"key":"ekfRejectRatioPct","label":"EKF 拒绝占比","unit":"比例"},{"key":"attitudeErrDegP99","label":"姿态误差 p99","unit":"°"},{"key":"attitudeOscHz","label":"姿态振荡频率","unit":"Hz"},{"key":"motorControlSpread","label":"电机输出离散度"},{"key":"motorCountActive","label":"活跃电机数","unit":"个"},{"key":"gyroBiasMaxRadS","label":"陀螺零偏最大","unit":"rad/s"},{"key":"gyroBiasDriftRadS","label":"陀螺零偏漂移","unit":"rad/s"},{"key":"windSpeedP95M","label":"风速 p95","unit":"m/s"},{"key":"airspeedMinM","label":"最低空速","unit":"m/s"},{"key":"airspeedInvalidRatio","label":"空速无效占比","unit":"比例"},{"key":"gpsJumpCount","label":"GPS 跳变次数","unit":"次"},{"key":"navStateChanges","label":"模式切换次数","unit":"次"},{"key":"vtolTransitionSamples","label":"VTOL 转换样本数","unit":"个"},{"key":"batteryCellCount","label":"电芯数","unit":"个"}],"track":{"topic":"vehicle_gps_position","instance":0,"lat":[{"field":"latitude_deg","scale":1},{"field":"lat","scale":1e-7}],"lon":[{"field":"longitude_deg","scale":1},{"field":"lon","scale":1e-7}],"alt":[{"field":"altitude_msl_m","scale":1},{"field":"alt","scale":0.001}],"max_points":1500}};

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
_NAV_GROUPS = [(g["phase"], set(int(c) for c in g["codes"])) for g in FACTS["nav_groups"]]

# 同一 slot 内多条规则按 order 字段排序（缺省 100000，再按 id 兜底）。
# **跨 slot 的顺序不在这里决定**：由 facts.yaml 的 slot_order 决定（见文件末尾的执行循环），
# 而 finding 的 id（F01、F02…）按发射顺序生成，所以改 slot_order 会改报告里的编号。
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
)


def _eval_expr(expr, env):
    """受限表达式求值：先按白名单遍历 AST，再在空 __builtins__ 下求值。

    绝不 eval 用户可控代码：不允许属性访问、下标、函数调用、推导式等。
    """
    tree = ast.parse(expr, mode="eval")
    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_NODES):
            raise ValueError("表达式含不允许的语法 %s：%s" % (type(node).__name__, expr))
    return eval(compile(tree, "<rule>", "eval"), {"__builtins__": {}}, env)


def _read_field_ref(ref):
    """'topic.field' → 该字段在各实例上的值（多实例拼接）；topic/字段缺失返回 None。

    数组字段（如 float32[14] voltage_cell_v）pyulog 按 'field[i]' 暴露，
    直接 getf(field) 拿不到，这里尝试下标 0..31，返回**每元素一列的列表**；
    缺的元素位置为 None。
    """
    topic, _, field = ref.partition(".")
    ds = find_all(ulog, topic)
    if not ds:
        return None

    def gather(get_one):
        vals = []
        for d in ds:
            v = get_one(d)
            if v is not None and len(v):
                vals.append(np.asarray(v, dtype=float))
        if not vals:
            return None
        return np.concatenate(vals) if len(vals) > 1 else vals[0]

    direct = gather(lambda d: getf(d, field))
    if direct is not None:
        return direct
    def gather_cell(idx):
        # pyulog 对定长数组通常暴露为 'field[0]'，个别构建为 'field_0'
        return gather(lambda d: getf(d, f"{field}[{idx}]", f"{field}_{idx}"))

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
        "topics": set(d.name for d in ulog.data_list),
        # 数据质量事实（guards 类经验用）
        "restart_detected": restart_topics > 0,
        "dropout_ms": dropout_total_ms,
        # 日志消息（ulog.logged_messages）：供「日志消息聚合」类经验按级别筛选
        "messages": _collect_log_messages(),
    }


def _match_firmware(spec):
    """适用范围轴①：固件版本。any / ">=1.15" / "<1.15" / ">=1.14,<1.15"（逗号=与）。"""
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


def _match_airframe(spec):
    """适用范围轴②：机架。any / rotary_wing / [fixed_wing, vtol]；vtol 按子串匹配。"""
    if not spec or spec == "any":
        return True
    wanted = spec if isinstance(spec, (list, tuple)) else [spec]
    for w in wanted:
        w = str(w)
        if w == "vtol" and "vtol" in vehicle_type:
            return True
        if w == vehicle_type:
            return True
    return False


def _run_rules(slot):
    """执行声明了该 slot 的经验规则。

    finding 的 id 是按发射顺序（F01、F02…）生成的，所以每条规则的 slot **必须与
    它所替换的原过程式检查的位置一致**（vibration → ekf → power → cpu → gps →
    failsafe → mode_thrash …）；同一 slot 内按 rules/*.yaml 的文件名顺序执行。
    """
    for _rule in RULES:
        if _rule.get("slot") != slot:
            continue
        _rid = _rule["id"]
        _checks = (_rule.get("emit") or {}).get("check")
        if _checks is None:
            _checks = []            # guards 类经验没有 check 名（不记 ran/skipped）
        elif not isinstance(_checks, list):
            _checks = [_checks]
        # not_applicable.when：声明式表达“该经验对本日志不适用”（如机型未知）。
        # 必须在 firmware/airframe 轴判定**之前**：轴不匹配是静默的，而这里要留下
        # skip 记录（如机型未知要写明原因，机型是旋翼却什么都不记——与原实现一致）。
        _na = _rule.get("not_applicable") or {}
        if _na.get("when") and _eval_expr(_na["when"], _rule_env()):
            for _check in _checks:
                skipped(_check, _na.get("skip_reason") or "不适用")
            continue
        # silent_when：静默不适用——既不 ran 也不 skipped（对应原过程式“外层 if 不成立”）
        _sw = _rule.get("silent_when")
        if _sw and _eval_expr(_sw, _rule_env()):
            continue
        # 适用范围三轴：固件 / 机架（不适用则默认静默——既不 ran 也不 skipped，
        # 与原过程式“外层 if 不成立”一致；确需留痕时用 skip_reason_axis 单独声明，
        # 不要复用 not_applicable.skip_reason：那是给 not_applicable.when 用的，
        # 两者混用会让“机型不匹配”也带上“机型未知”的原因。）
        if not _match_firmware(_rule.get("firmware")) or not _match_airframe(_rule.get("airframe")):
            if _rule.get("skip_reason_axis"):
                for _check in _checks:
                    skipped(_check, _rule["skip_reason_axis"])
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
                skipped(_check, _rule.get("skip_reason") or ("缺少依赖 topic：%s" % ", ".join(_need_txt)))
            continue
        # topic 在就 ran（与原过程式块一致：ran() 在块首，数据不足只代表不发射 finding）。
        # ran_on_success：原实现把 ran() 放在数据判定**之后**（如 motor_balance 只在
        # 活跃通道 >= 4 时才算“跑过”），这类规则改为 compute 成功后再记 ran。
        _ran_late = bool(_rule.get("ran_on_success")) or _rule.get("ran_when") is not None
        if not _ran_late:
            for _check in _checks:
                ran(_check)

        _env = _rule_env()
        _ok = True
        for _node in (_rule.get("compute") or []):
            # 归一化：单输入可用短写法 from:（字符串或列表），单输出可直接写 out: 名字
            _ins = _node.get("in")
            if _ins is None:
                _ins = _node["from"] if isinstance(_node["from"], list) else [_node["from"]]
            _outs = _node["out"] if isinstance(_node["out"], list) else [_node["out"]]
            # when_fw：节点级版本条件（如 when_fw: ">=1.15"）。不满足就跳过该节点、
            # 输出置 None，交给后续 coalesce/choose 选另一版本的分支 —— 于是"同一字段
            # 在不同固件里换了名字/topic"这件事在经验文件里是显式可读、可校验的。
            _wf = _node.get("when_fw")
            if _wf is not None and not _match_firmware(_wf):
                for _name in _outs:
                    _env[_name] = None
                continue
            _args = []
            _per_inst = bool(_node.get("per_instance"))
            _node_aliases = _node.get("aliases") or {}
            for _ref in _ins:
                if not isinstance(_ref, str):
                    _args.append(_ref)          # YAML 字面量（数字/布尔），直接作为算子入参
                elif _ref in _env:
                    _args.append(_env[_ref])
                elif _node.get("instance") is not None:
                    # instance: N —— 只取第 N 个实例（对应原过程式的 xxx_list[0]；
                    # 多实例 topic（如每 IMU 一个 estimator_sensor_bias）必须显式指定，
                    # 否则默认读取会把各实例拼接起来，语义就变了
                    _grp = _read_field_ref_grouped(_ref, _node_aliases.get(_ref))
                    _idx = int(_node["instance"])
                    _args.append(_grp[_idx] if _grp and len(_grp) > _idx else None)
                elif _per_inst:
                    _args.append(_read_field_ref_grouped(_ref, _node_aliases.get(_ref)))
                else:
                    _args.append(_read_field_ref(_ref))
            # optional: true 的节点允许 None 输入与 None 输出（缺失沿数据流显式传播）
            if any(_a is None for _a in _args) and not _node.get("optional"):
                _ok = False
                break
            try:
                _res = OPERATORS[_node["op"]](*_args, **_node)
            except Exception:
                # 算子内部异常（脏数据/字段形态意外）不该中断整份日志：按“数据不足”中止本条规则
                _ok = False
                break
            if _res is None and not _node.get("optional"):
                _ok = False
                break
            if _res is None:
                for _name in _outs:
                    _env[_name] = None
                continue
            if not isinstance(_res, tuple):
                _res = (_res,)
            for _name, _v in zip(_outs, _res):
                _env[_name] = _v
        if not _ok:
            # 数据不足：默认不发射、不补 skipped（与原过程式语义一致）；规则显式声明
            # skip_reason_no_data 时额外记一条（如 airspeed 的“无固定翼巡航段”）
            if _rule.get("skip_reason_no_data"):
                for _check in _checks:
                    skipped(_check, _rule["skip_reason_no_data"])
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
                    _hit = _eval_expr(_trig["expr"], _tenv)
                except Exception:
                    _hit = False
                if not _hit:
                    continue
                # 数据质量标签副作用（如强风 wind_strong）：必须在 add() 之前追加，
                # 顺序与原过程式代码一致（guardTags 数组顺序也参与基线比对）
                _gt = _trig.get("guard_tag", _emit.get("guard_tag"))
                if _gt and _gt not in guard_tags:
                    guard_tags.append(_gt)
                if "value_const" in _trig:
                    _val = _trig["value_const"]
                elif "value_text" in _trig:
                    # 证据值本身是带占位符的文案（如 "fault=1024,nan=0"、"set at 25.6s"）
                    _val = _trig["value_text"].format_map(_tenv)
                else:
                    _val = _tenv.get(_trig["value"]) if _trig.get("value") else None
                    if _val is not None and _trig.get("round") is not None:
                        _val = round(float(_val), int(_trig["round"]))
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
# ---------------- 按 facts.yaml 的 slot_order 顺序执行各 slot ----------------
# 顺序即 finding 编号（F01、F02…）的生成顺序，也决定 guard 标签的先后
# （guards_early 排第一，insufficient_data 才会是第一个 guard 标签）。
# 新增经验只需把 slot 写进 knowledge/px4/facts.yaml 的 slot_order（或复用已有 slot）
# 并让经验里的 slot 对上——**不用改这个文件**；构建期会校验 slot 是否都已登记。
for _slot in FACTS["slot_order"]:
    _run_rules(_slot)

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
