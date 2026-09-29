// ⚠️ 自动生成，请勿手改。源文件在 knowledge/（按固件族分目录）与 knowledge/engine/，改完跑 `pnpm build:kb`（dev/build 自动执行）。
import faultKbJson from "./fault-kb.generated.json";

const rules = {"ardupilot-bin":[{"id":"apm-attitude-roll","name":"横滚跟踪误差","group":"attitude_tracking","order":1,"tag":"apm_attitude_tracking_error","compute":["ats = ATT.timestamp","err_roll = abs(ATT.DesRoll - ATT.Roll)","peak_roll = max(err_roll)","worst_roll = excursion_events(err_roll, ats, T0_US, threshold=15.0, limit=1)"],"foreach":{"var":"worst_roll","keys":["dur_s","peak","start_s","end_s"]},"trigger":[{"when":"dur_s >= 1.0 and peak > 25.0","severity":"critical","suggestion":"持续超过 1 s 且误差大于 25°，说明机体达不到指令姿态：失控、机械故障（电机/电调/桨、舵面连杆）或动力不足/超重。查机体机械与动力余量，并复核是否超重。","description":"横滚跟踪失败，持续 {dur_s:.1f} s、误差峰值 {peak:.0f}°（t={start_s:.1f}s）","evidence":{"source":"ATT.DesRoll - ATT.Roll","value":"f\"{peak:.1f}\"","threshold":25,"unit":"deg"}},{"when":"dur_s >= 1.0","severity":"warning","suggestion":"误差持续在 15° 以上说明机体明显跟不上指令。复核 PID 整定与控制权限，并确认没有部分机械失效。","description":"横滚持续偏离指令 {dur_s:.1f} s，误差峰值 {peak:.0f}°（t={start_s:.1f}s）","evidence":{"source":"ATT.DesRoll - ATT.Roll","value":"f\"{peak:.1f}\"","threshold":15,"unit":"deg"}},{"when":"peak_roll > 30.0","severity":"warning","suggestion":"未达 1 s 持续，多为阵风或粗猛打杆造成的瞬时偏差；若多次飞行反复出现再深究。","description":"横滚跟踪误差瞬时尖峰 {peak_roll:.0f}°","evidence":{"source":"ATT.DesRoll - ATT.Roll(峰值)","value":"f\"{peak_roll:.1f}\"","threshold":30,"unit":"deg"}}],"firmware":"any","vehicle":"any","message":[["ATT"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"attitude","docurl":"https://ardupilot.org/copter/docs/common-tuning.html"},{"id":"apm-attitude-pitch","name":"俯仰跟踪误差","group":"attitude_tracking","order":2,"tag":"apm_attitude_tracking_error","compute":["ats = ATT.timestamp","err_pitch = abs(ATT.DesPitch - ATT.Pitch)","peak_pitch = max(err_pitch)","worst_pitch = excursion_events(err_pitch, ats, T0_US, threshold=15.0, limit=1)"],"foreach":{"var":"worst_pitch","keys":["dur_s","peak","start_s","end_s"]},"trigger":[{"when":"dur_s >= 1.0 and peak > 25.0","severity":"critical","suggestion":"持续超过 1 s 且误差大于 25°，说明机体达不到指令姿态：失控、舵面/连杆故障或动力不足/超重。查重心、舵面连杆与动力余量。","description":"俯仰跟踪失败，持续 {dur_s:.1f} s、误差峰值 {peak:.0f}°（t={start_s:.1f}s）","evidence":{"source":"ATT.DesPitch - ATT.Pitch","value":"f\"{peak:.1f}\"","threshold":25,"unit":"deg"}},{"when":"dur_s >= 1.0","severity":"warning","suggestion":"误差持续在 15° 以上说明机体明显跟不上指令。复核 PID 整定与控制权限，并确认没有部分机械失效。","description":"俯仰持续偏离指令 {dur_s:.1f} s，误差峰值 {peak:.0f}°（t={start_s:.1f}s）","evidence":{"source":"ATT.DesPitch - ATT.Pitch","value":"f\"{peak:.1f}\"","threshold":15,"unit":"deg"}},{"when":"peak_pitch > 30.0","severity":"warning","suggestion":"未达 1 s 持续，多为阵风或粗猛打杆造成的瞬时偏差；若多次飞行反复出现再深究。","description":"俯仰跟踪误差瞬时尖峰 {peak_pitch:.0f}°","evidence":{"source":"ATT.DesPitch - ATT.Pitch(峰值)","value":"f\"{peak_pitch:.1f}\"","threshold":30,"unit":"deg"}}],"firmware":"any","vehicle":"any","message":[["ATT"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"attitude","docurl":"https://ardupilot.org/copter/docs/common-tuning.html"},{"id":"apm-attitude-yaw","name":"航向跟踪误差","group":"attitude_tracking","order":3,"tag":"apm_attitude_tracking_error","compute":["ats = ATT.timestamp","err_yaw = abs(wrap_degrees(ATT.Yaw - ATT.DesYaw))","peak_yaw = max(err_yaw)","worst_yaw = excursion_events(err_yaw, ats, T0_US, threshold=15.0, limit=1)"],"foreach":{"var":"worst_yaw","keys":["dur_s","peak","start_s","end_s"]},"trigger":[{"when":"dur_s >= 1.0 and peak > 25.0","severity":"critical","suggestion":"持续超过 1 s 且误差大于 25°，说明机体达不到指令航向：罗盘干扰、偏航通道机械问题或电机失衡。查罗盘（见 apm-compass-interference）与偏航方向的一致性。","description":"航向跟踪失败，持续 {dur_s:.1f} s、误差峰值 {peak:.0f}°（t={start_s:.1f}s）","evidence":{"source":"ATT.DesYaw - ATT.Yaw(绕回 ±180°)","value":"f\"{peak:.1f}\"","threshold":25,"unit":"deg"}},{"when":"dur_s >= 1.0","severity":"warning","suggestion":"误差持续在 15° 以上，常见于罗盘干扰、偏航通道机械问题或电机失衡。复核罗盘与偏航控制权限。","description":"航向持续偏离指令 {dur_s:.1f} s，误差峰值 {peak:.0f}°（t={start_s:.1f}s）","evidence":{"source":"ATT.DesYaw - ATT.Yaw(绕回 ±180°)","value":"f\"{peak:.1f}\"","threshold":15,"unit":"deg"}},{"when":"peak_yaw > 30.0","severity":"warning","suggestion":"未达 1 s 持续，多为阵风或粗猛打杆造成的瞬时偏差；若多次飞行反复出现再深究。","description":"航向跟踪误差瞬时尖峰 {peak_yaw:.0f}°","evidence":{"source":"ATT.DesYaw - ATT.Yaw(绕回 ±180°, 峰值)","value":"f\"{peak_yaw:.1f}\"","threshold":30,"unit":"deg"}}],"firmware":"any","vehicle":"any","message":[["ATT"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"attitude","docurl":"https://ardupilot.org/copter/docs/common-tuning.html"},{"id":"apm-calibration-compass-offset","name":"罗盘校准偏移","group":"calibration","order":1,"tag":"apm_calibration_compass_large_offset","compute":["ofs_x = _cfg(\"COMPASS_OFS_X\", 0.0)","ofs_y = _cfg(\"COMPASS_OFS_Y\", 0.0)","ofs_z = _cfg(\"COMPASS_OFS_Z\", 0.0)","offset_mag = np.hypot(np.hypot(ofs_x, ofs_y), ofs_z)"],"trigger":[{"when":"offset_mag > 600.0","severity":"critical","suggestion":"罗盘硬铁偏移 {offset_mag:.0f} mGauss 远超正常范围（<300 mGauss），校准质量差或安装环境有强磁干扰。重新做一次罗盘校准（Mission Planner 的 Compass 页），确保没有金属物体在附近。","description":"罗盘硬铁偏移 {offset_mag:.0f} mGauss，校准质量差","evidence":{"source":"COMPASS_OFS_X/Y/Z(模长)","value":"f\"{offset_mag:.0f}\"","threshold":600,"unit":"mGauss"}},{"when":"offset_mag > 300.0","severity":"warning","suggestion":"罗盘硬铁偏移 {offset_mag:.0f} mGauss 偏高（健康范围通常 <300 mGauss）。如果飞行中出现 EKF 航向重置或偏航漂移，重做一次罗盘校准。","description":"罗盘硬铁偏移 {offset_mag:.0f} mGauss，偏大","evidence":{"source":"COMPASS_OFS_X/Y/Z(模长)","value":"f\"{offset_mag:.0f}\"","threshold":300,"unit":"mGauss"}}],"firmware":"any","vehicle":"any","message":[["PARM"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"calibration","docurl":"https://ardupilot.org/copter/docs/common-compass-calibration-in-mission-planner.html"},{"id":"apm-compass-interference","name":"罗盘场强稳定性","group":"compass","order":1,"tag":"apm_compass_interference","compute":["mag = np.hypot(np.hypot(MAG.MagX, MAG.MagY), MAG.MagZ)","mean_mag = mean(mag)","cv_mag = np.std(mag) / np.mean(mag)","range_ratio = np.ptp(mag) / mean_mag","n_mag = len(mag)"],"trigger":[{"when":"cv_mag > 0.60 and n_mag >= 10","severity":"critical","suggestion":"场强波动这么大，几乎必然是电机/电流干扰耦合进了罗盘，会污染 EKF 航向估计（马桶圈、飞丢）。把罗盘挪开供电线与电调、重新校准，开启 COMPASS_MOT 电流补偿，或改用外置罗盘。","description":"罗盘场强极不稳定，变异系数 {cv_mag:.2f}（{mean_mag:.0f} mGauss 均值上摆动）","evidence":{"source":"MAG.MagX/Y/Z 合成场强(变异系数)","value":"f\"{cv_mag:.2f}\"","threshold":0.6,"unit":""}},{"when":"(cv_mag > 0.30 or range_ratio > 0.60) and n_mag >= 10","severity":"warning","suggestion":"场强随油门摆动通常意味着电机/电流干扰串进了罗盘。检查罗盘与供电线走线的距离，做 COMPASS_MOT 补偿，或改用外置罗盘。","description":"罗盘场强摆动偏大，变异系数 {cv_mag:.2f}、极差比 {range_ratio:.2f}（均值 {mean_mag:.0f} mGauss）","evidence":{"source":"MAG.MagX/Y/Z 合成场强(变异系数 / 极差比)","value":"f\"{cv_mag:.2f}\"","threshold":0.3,"unit":""}}],"firmware":"any","vehicle":"any","message":[["MAG"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"compass","docurl":"https://ardupilot.org/copter/docs/common-compass-setup-advanced.html"},{"id":"apm-config-arming-check","name":"预解锁检查被禁用","group":"config_safety","order":1,"tag":"apm_config_arming_check_disabled","compute":["arming_check = ARMING_CHECK"],"trigger":[{"when":"arming_check == 0","severity":"warning","suggestion":"ARMING_CHECK=0 会关掉所有预解锁检查：坏传感器、未校准、无 GPS 都不再阻止解锁，地面看一切正常、起飞后才暴露。除非在台架上调试，否则把该开的位重新打开。","description":"预解锁检查被整体禁用（ARMING_CHECK=0）","evidence":{"source":"ARMING_CHECK(=0)","value":"arming_check","threshold":0,"unit":""}}],"firmware":"any","vehicle":"any","message":[["PARM"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"config","docurl":"https://ardupilot.org/copter/docs/common-prearm-safety-checks.html"},{"id":"apm-config-batt-monitor","name":"未配置电池监控","group":"config_safety","order":2,"tag":"apm_config_no_battery_monitor","compute":["batt_monitor = BATT_MONITOR"],"trigger":[{"when":"batt_monitor == 0","severity":"info","suggestion":"BATT_MONITOR=0 意味着没有电压电流采样：低电压/低电量失效保护无从谈起，报告里的电量曲线也是空的。接上电流计或启用模拟电压采样后再飞。","description":"未配置电池监控（BATT_MONITOR=0）","evidence":{"source":"BATT_MONITOR(=0)","value":"batt_monitor","threshold":0,"unit":""}}],"firmware":"any","vehicle":"any","message":[["PARM"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"config","docurl":"https://ardupilot.org/copter/docs/common-prearm-safety-checks.html"},{"id":"apm-config-fs-thr","name":"油门失效保护被禁用","group":"config_safety","order":3,"tag":"apm_config_thr_failsafe_disabled","compute":["fs_thr_enable = FS_THR_ENABLE"],"trigger":[{"when":"fs_thr_enable == 0","severity":"info","suggestion":"FS_THR_ENABLE=0（Copter/Heli；Plane 对应 THR_FAILSAFE）会让飞控在遥控失联时不动作——不返航、不降落，直到电量耗尽。设成 1（RTL）或 2（降落）再飞。","description":"油门失效保护被禁用（FS_THR_ENABLE=0）","evidence":{"source":"FS_THR_ENABLE(=0)","value":"fs_thr_enable","threshold":0,"unit":""}}],"firmware":"any","vehicle":"any","message":[["PARM"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"config","docurl":"https://ardupilot.org/copter/docs/common-prearm-safety-checks.html"},{"id":"apm-ekf-velocity","name":"EKF 速度检验比","group":"ekf_variance","order":1,"tag":"apm_ekf_variance_high","compute":["sv_max = max(_ref(\"XKF4.SV\", \"NKF4.SV\"))"],"trigger":[{"when":"sv_max > 1.0","severity":"critical","suggestion":"超过 1.0 说明 EKF 在拒绝速度数据。结合振动、GPS 的结论找根因：振动会让加速度计失真，进而污染速度新息。","description":"EKF 速度检验比超拒绝线，峰值 {sv_max:.2f}","evidence":{"source":"XKF4/NKF4.SV(峰值)","value":"f\"{sv_max:.2f}\"","threshold":1,"unit":""}},{"when":"sv_max > 0.8","severity":"warning","suggestion":"逼近 1.0 的拒绝边界，估计器已经在勉强信任速度数据。若复现需检查相关传感器。","description":"EKF 速度检验比偏高，峰值 {sv_max:.2f}","evidence":{"source":"XKF4/NKF4.SV(峰值)","value":"f\"{sv_max:.2f}\"","threshold":0.8,"unit":""}}],"firmware":"any","vehicle":"any","message":[["XKF4","NKF4"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"ekf","docurl":"https://ardupilot.org/copter/docs/ekf-inav-failsafe.html"},{"id":"apm-ekf-position","name":"EKF 位置检验比","group":"ekf_variance","order":2,"tag":"apm_ekf_variance_high","compute":["sp_max = max(_ref(\"XKF4.SP\", \"NKF4.SP\"))"],"trigger":[{"when":"sp_max > 1.0","severity":"critical","suggestion":"超过 1.0 说明 EKF 在拒绝位置数据，是定点漂移的直接前兆。优先查 GPS（搜星/HDOP/跳变）。","description":"EKF 位置检验比超拒绝线，峰值 {sp_max:.2f}","evidence":{"source":"XKF4/NKF4.SP(峰值)","value":"f\"{sp_max:.2f}\"","threshold":1,"unit":""}},{"when":"sp_max > 0.8","severity":"warning","suggestion":"逼近 1.0 的拒绝边界。若复现需检查 GPS 与罗盘。","description":"EKF 位置检验比偏高，峰值 {sp_max:.2f}","evidence":{"source":"XKF4/NKF4.SP(峰值)","value":"f\"{sp_max:.2f}\"","threshold":0.8,"unit":""}}],"firmware":"any","vehicle":"any","message":[["XKF4","NKF4"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"ekf","docurl":"https://ardupilot.org/copter/docs/ekf-inav-failsafe.html"},{"id":"apm-ekf-height","name":"EKF 高度检验比","group":"ekf_variance","order":3,"tag":"apm_ekf_variance_high","compute":["sh_max = max(_ref(\"XKF4.SH\", \"NKF4.SH\"))"],"trigger":[{"when":"sh_max > 1.0","severity":"critical","suggestion":"超过 1.0 说明 EKF 在拒绝高度数据。常见根因：振动（尤其 Z 轴）、气压计受桨流扰动、减震球老化。","description":"EKF 高度检验比超拒绝线，峰值 {sh_max:.2f}","evidence":{"source":"XKF4/NKF4.SH(峰值)","value":"f\"{sh_max:.2f}\"","threshold":1,"unit":""}},{"when":"sh_max > 0.8","severity":"warning","suggestion":"逼近 1.0 的拒绝边界。若复现需检查气压计与 Z 轴振动。","description":"EKF 高度检验比偏高，峰值 {sh_max:.2f}","evidence":{"source":"XKF4/NKF4.SH(峰值)","value":"f\"{sh_max:.2f}\"","threshold":0.8,"unit":""}}],"firmware":"any","vehicle":"any","message":[["XKF4","NKF4"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"ekf","docurl":"https://ardupilot.org/copter/docs/ekf-inav-failsafe.html"},{"id":"apm-ekf-magnetometer","name":"EKF 磁罗盘检验比","group":"ekf_variance","order":4,"tag":"apm_ekf_variance_high","compute":["sm_max = max(_ref(\"XKF4.SM\", \"NKF4.SM\"))"],"trigger":[{"when":"sm_max > 1.0","severity":"critical","suggestion":"超过 1.0 说明 EKF 在拒绝磁罗盘数据，航向会漂。查罗盘干扰（供电线走线、GPS/罗盘支架高度）与校准。","description":"EKF 磁罗盘检验比超拒绝线，峰值 {sm_max:.2f}","evidence":{"source":"XKF4/NKF4.SM(峰值)","value":"f\"{sm_max:.2f}\"","threshold":1,"unit":""}},{"when":"sm_max > 0.8","severity":"warning","suggestion":"逼近 1.0 的拒绝边界。若复现需重新校准罗盘并检查干扰源。","description":"EKF 磁罗盘检验比偏高，峰值 {sm_max:.2f}","evidence":{"source":"XKF4/NKF4.SM(峰值)","value":"f\"{sm_max:.2f}\"","threshold":0.8,"unit":""}}],"firmware":"any","vehicle":"any","message":[["XKF4","NKF4"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"ekf","docurl":"https://ardupilot.org/copter/docs/ekf-inav-failsafe.html"},{"id":"apm-err-subsystem","name":"子系统错误（ERR）","group":"events","order":1,"tag":"apm_subsystem_error","compute":["err_subsys = ERR.Subsys[ERR.ECode > 0.5]","err_count = len(err_subsys)","crit_count = sum(np.isin(err_subsys, [5, 6, 7, 9, 12, 16, 17, 25, 29, 30]))"],"trigger":[{"when":"crit_count > 0","severity":"critical","suggestion":"涉及失效保护类子系统（电池/GPS/EKF/崩机/振动/推力丧失/内部错误），是直接影响飞行安全的硬故障。先查清根因再飞。","description":"发生 {crit_count} 条安全关键子系统错误（ERR）","evidence":{"source":"ERR.Subsys(安全关键子系统，ECode!=0)","value":"crit_count","threshold":0,"unit":"条"}},{"when":"err_count > 0","severity":"warning","suggestion":"结合周边遥测定位根因，检查对应子系统（传感器/无线电）为何报错。","description":"发生 {err_count} 条子系统错误（ERR）","evidence":{"source":"ERR.Subsys(ECode!=0)","value":"err_count","threshold":0,"unit":"条"}}],"firmware":"any","vehicle":"any","message":[["ERR"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"events","docurl":"https://ardupilot.org/copter/docs/common-diagnosing-problems-using-logs.html"},{"id":"apm-ev-events","name":"关键事件（EV）","group":"events","order":2,"tag":"apm_critical_event_logged","compute":["ev_id = EV.Id","ev_count = len(ev_id)","key_count = sum(np.isin(ev_id, [19, 54, 59, 60, 62]))"],"trigger":[{"when":"key_count > 0","severity":"warning","suggestion":"丢 GPS、EKF 高度或航向重置、电机紧急停转、旋翼转速不足都属于明确的异常。按事件类型查对应子系统（GPS/罗盘/动力）。","description":"日志含 {key_count} 条关键异常事件（EV）","evidence":{"source":"EV.Id(丢GPS / EKF重置 / 电机急停 / 旋翼转速不足)","value":"key_count","threshold":0,"unit":"条"}},{"when":"ev_count > 0","severity":"info","suggestion":"事件码对照 facts.yaml 的 ev_ids 查看，用于还原飞行过程。","description":"日志共记录 {ev_count} 条事件（EV）","evidence":{"source":"EV.Id(全部事件)","value":"ev_count","threshold":0,"unit":"条"}}],"firmware":"any","vehicle":"any","message":[["EV"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"events","docurl":"https://ardupilot.org/copter/docs/common-diagnosing-problems-using-logs.html"},{"id":"apm-mode-timeline","name":"模式时间线","group":"events","order":3,"compute":["mode_num = MODE.ModeNum","mode_name = MODE.Mode","ts = MODE.timestamp","changed = np.diff(mode_num) != 0","change_count = sum(changed)","n_modes = len(mode_num)"],"trigger":[{"when":"change_count > 0","severity":"info","suggestion":"模式切换序列用于还原飞行过程与定位失控时点。全部模式名见 MODE.Mode 列。","description":"共 {change_count} 次模式切换（{n_modes} 条 MODE 消息，日志全程 {DURATION_S:.0f}s）","evidence":{"source":"MODE.Mode(时间线)","value":"change_count","threshold":0,"unit":"次切换"}}],"firmware":"any","vehicle":"any","message":[["MODE"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"events","docurl":"https://ardupilot.org/copter/docs/common-diagnosing-problems-using-logs.html"},{"id":"apm-gps-fix","name":"GPS 定位状态","group":"gps_health","order":1,"tag":"apm_gps_no_fix","compute":["status = GPS.Status","smax = max(status)","status_armed = status[interval_mask(GPS.timestamp, ARMED_INTERVALS)]","smin_armed = min(status_armed)"],"trigger":[{"when":"smax < 3.0","severity":"warning","suggestion":"没有 3D 定位 GPS 就无法给 EKF 提供可用位置。检查天线布置与干扰，起飞前留出更充裕的搜星时间。","description":"全程未达 3D 定位，最高状态 {smax:.0f}","evidence":{"source":"GPS.Status(最高)","value":"f\"{smax:.0f}\"","threshold":3,"unit":""}},{"when":"smin_armed < 3.0","severity":"critical","suggestion":"armed 段内出现过低于 3D 的定位，位置辅助会被撤掉，可能触发 EKF 失效或漂移。查天线、供电与干扰源。","description":"飞行中丢过 3D 定位，armed 段最低状态 {smin_armed:.0f}","evidence":{"source":"GPS.Status(armed 段最低)","value":"f\"{smin_armed:.0f}\"","threshold":3,"unit":""}}],"firmware":"any","vehicle":"any","message":[["GPS"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"gps","docurl":"https://ardupilot.org/copter/docs/gps-failsafe-glitch-protection.html"},{"id":"apm-gps-sats","name":"GPS 搜星数","group":"gps_health","order":2,"tag":"apm_gps_low_sats","compute":["nmin = min(GPS.NSats[interval_mask(GPS.timestamp, ARMED_INTERVALS)])"],"trigger":[{"when":"nmin < 4","severity":"critical","suggestion":"低于 4 颗时接收机无法维持 3D 定位，位置不可信。查天线视野、遮挡与干扰，解决前不要用依赖 GPS 的模式。","description":"飞行中搜星数最低仅 {nmin} 颗","evidence":{"source":"GPS.NSats(armed 段最少)","value":"nmin","threshold":4,"unit":"颗"}},{"when":"nmin < 6","severity":"warning","suggestion":"ArduPilot 期望 6 颗以上解算才稳定。改善天线布置与视野，解锁前等搜星数上来。","description":"飞行中搜星数偏低，最低 {nmin} 颗","evidence":{"source":"GPS.NSats(armed 段最少)","value":"nmin","threshold":6,"unit":"颗"}}],"firmware":"any","vehicle":"any","message":[["GPS"]],"armed":true,"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"gps","docurl":"https://ardupilot.org/copter/docs/gps-failsafe-glitch-protection.html"},{"id":"apm-gps-hdop","name":"GPS 水平精度因子","group":"gps_health","order":3,"tag":"apm_gps_high_hdop","compute":["hmax = max(GPS.HDop[interval_mask(GPS.timestamp, ARMED_INTERVALS) & (GPS.Status > 2.5)])"],"trigger":[{"when":"hmax > 5.0","severity":"critical","suggestion":"HDOP 超过 5 时水平位置基本不可用。先解决成因（视野、干扰、多径），再飞依赖 GPS 的模式。","description":"飞行中 HDOP 峰值 {hmax:.1f}，水平位置不可用","evidence":{"source":"GPS.HDop(armed 段最大)","value":"f\"{hmax:.1f}\"","threshold":5,"unit":""}},{"when":"hmax > 2.0","severity":"warning","suggestion":"良好 HDOP 在 1.5 以下。改善天线布置与视野，解锁前争取 HDOP 低于 1.5。","description":"飞行中 HDOP 峰值 {hmax:.1f}，卫星几何偏弱","evidence":{"source":"GPS.HDop(armed 段最大)","value":"f\"{hmax:.1f}\"","threshold":2,"unit":""}}],"firmware":"any","vehicle":"any","message":[["GPS"]],"armed":true,"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"gps","docurl":"https://ardupilot.org/copter/docs/gps-failsafe-glitch-protection.html"},{"id":"apm-guard-integrity","name":"数据质量-日志完整性","group":"guards_early","order":1,"tag":"apm_guard_log_incomplete","trigger":[{"when":"not log_ok()","label":"log_incomplete","severity":"guard","description":"Data quality: log_incomplete","evidence":{"source":""}}],"firmware":"any","vehicle":"any","version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"guard","compute":[]},{"id":"apm-motor-imbalance","name":"电机输出不平衡","group":"motor_balance","order":1,"tag":"apm_motor_output_unbalance","compute":["cols = [RCOU.C1, RCOU.C2, RCOU.C3, RCOU.C4, RCOU.C5, RCOU.C6, RCOU.C7, RCOU.C8]","spread, hot, cold, n_active = column_spread_stats(cols, None, min_mean=1100.0, min_channels=2)","hot_ch = hot + 1","cold_ch = cold + 1"],"trigger":[{"when":"spread > 300.0","severity":"critical","suggestion":"最热的是 {hot_ch} 号通道、最冷的是 {cold_ch} 号通道。飞控在持续对抗某个不对称（重心偏移、机架扭转、电机/桨不一致或某个电机偏弱），重点查这几项与电调校准。","description":"电机输出严重不平衡，极差 {spread:.0f} us（{n_active} 个活跃通道）","evidence":{"source":"RCOU.C1..C8(活跃通道均值极差)","value":"f\"{spread:.0f}\"","threshold":300,"unit":"us"}},{"when":"spread > 150.0","severity":"warning","suggestion":"最热的是 {hot_ch} 号通道、最冷的是 {cold_ch} 号通道。通道均值极差大意味着飞控在对抗不对称（重心偏移、机架扭转、电机/桨不一致）。","description":"电机输出不平衡，极差 {spread:.0f} us（{n_active} 个活跃通道）","evidence":{"source":"RCOU.C1..C8(活跃通道均值极差)","value":"f\"{spread:.0f}\"","threshold":150,"unit":"us"}}],"firmware":"any","vehicle":"any","message":[["RCOU"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"motor","docurl":"https://ardupilot.org/copter/docs/thrust_loss_yaw_imbalance.html"},{"id":"apm-motor-saturation","name":"电机输出饱和","group":"motor_balance","order":2,"tag":"apm_motor_output_saturated","compute":["cols = [RCOU.C1, RCOU.C2, RCOU.C3, RCOU.C4, RCOU.C5, RCOU.C6, RCOU.C7, RCOU.C8]","sats = column_ratio_events(cols, 1950.0, min_frac=0.20, min_mean=1100.0)"],"foreach":{"var":"sats","keys":["channel","frac","mean"]},"trigger":[{"when":"frac > 0.50","severity":"critical","suggestion":"超过一半时间贴着满舵，说明动力余量严重不足（超重或动力偏弱），已接近失去姿态控制权。减轻起飞重量或换更大推力的电机/桨。","description":"电机 {channel} 号通道长时间满舵（均值 {mean:.0f} us）","evidence":{"source":"RCOU.C{channel}(>=1950us 样本占比)","value":"f\"{frac*100:.0f}\"","threshold":0.5,"unit":"%"}},{"when":"True","severity":"warning","suggestion":"长时间接近满舵说明动力余量不足（超重或动力偏弱），会失去姿态控制权。减轻起飞重量或换更大推力的电机/桨。","description":"电机 {channel} 号通道接近满舵（均值 {mean:.0f} us）","evidence":{"source":"RCOU.C{channel}(>=1950us 样本占比)","value":"f\"{frac*100:.0f}\"","threshold":0.2,"unit":"%"}}],"firmware":"any","vehicle":"any","message":[["RCOU"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"motor","docurl":"https://ardupilot.org/copter/docs/thrust_loss_yaw_imbalance.html"},{"id":"apm-param-audit-rate-p","name":"Rate P 增益异常","group":"param_audit","order":1,"tag":"apm_param_rate_p_anomaly","compute":["rp_r = _cfg(\"ATC_RAT_RLL_P\", 0.0)","rp_p = _cfg(\"ATC_RAT_PIT_P\", 0.0)","rp_y = _cfg(\"ATC_RAT_YAW_P\", 0.0)","low_count = int(rp_r < 0.04) + int(rp_p < 0.04) + int(rp_y < 0.04)","high_count = int(rp_r > 0.5) + int(rp_p > 0.5) + int(rp_y > 0.5)"],"trigger":[{"when":"low_count > 0","severity":"critical","suggestion":"ATC_RAT_RLL_P/PIT_P/YAW_P 过低（Copter 默认 ~0.135，<0.04 几乎不吃误差）。飞行会严重迟钝甚至不可控。在 AutoTune 或调参助手上调高到合理范围。","description":"{low_count} 个轴的 Rate P 增益低于 0.04（R:{rp_r:.3f} P:{rp_p:.3f} Y:{rp_y:.3f}），可能不可控","evidence":{"source":"ATC_RAT_RLL_P/PIT_P/YAW_P","value":"low_count","threshold":0,"unit":"轴"}},{"when":"high_count > 0","severity":"warning","suggestion":"ATC_RAT_RLL_P/PIT_P/YAW_P 偏高（Copter 默认 ~0.135，>0.5 远超正常范围）。太高会产生高频振荡、电机过热甚至炸机。","description":"{high_count} 个轴的 Rate P 增益高于 0.5（R:{rp_r:.3f} P:{rp_p:.3f} Y:{rp_y:.3f}），可能振荡","evidence":{"source":"ATC_RAT_RLL_P/PIT_P/YAW_P","value":"high_count","threshold":0,"unit":"轴"}}],"firmware":"any","vehicle":"any","message":[["PARM"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"config","docurl":"https://ardupilot.org/copter/docs/parameters.html"},{"id":"apm-param-audit-accel-max","name":"角加速度限制被禁用","group":"param_audit","order":2,"tag":"apm_param_accel_limit_disabled","compute":["acc_r = _cfg(\"ATC_ACCEL_R_MAX\", 110000.0)","acc_p = _cfg(\"ATC_ACCEL_P_MAX\", 110000.0)","acc_y = _cfg(\"ATC_ACCEL_Y_MAX\", 27000.0)","zero_count = int(acc_r == 0) + int(acc_p == 0) + int(acc_y == 0)"],"trigger":[{"when":"zero_count > 0","severity":"critical","suggestion":"ATC_ACCEL_R/P/Y_MAX=0 会关掉角加速度限制（Copter 默认 ~110000），飞控可以不受限地请求最猛烈的角加速度——在你做了激烈打杆或陷进振荡时，不再有最后一道保护墙，可能导致炸机。恢复成固件默认值。","description":"{zero_count} 个轴的角加速度限制被置零（R:{acc_r:.0f} P:{acc_p:.0f} Y:{acc_y:.0f}），无上限","evidence":{"source":"ATC_ACCEL_R/P/Y_MAX","value":"zero_count","threshold":0,"unit":"轴"}}],"firmware":"any","vehicle":"any","message":[["PARM"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"config","docurl":"https://ardupilot.org/copter/docs/parameters.html"},{"id":"apm-param-audit-batt-crt","name":"电池失效保护阈值倒挂","group":"param_audit","order":3,"tag":"apm_param_batt_crt_inverted","compute":["batt_crt = _cfg(\"BATT_CRT_VOLT\", 0.0)","batt_low = _cfg(\"BATT_LOW_VOLT\", 0.0)"],"trigger":[{"when":"batt_crt >= batt_low and batt_low > 0.0","severity":"warning","suggestion":"BATT_CRT_VOLT ({batt_crt:.1f}V) >= BATT_LOW_VOLT ({batt_low:.1f}V) 会导致分级保护失效：本应先告警后急救，现在要么同时触发，要么低电压告警还没报就进入临界动作。设 BATT_CRT_VOLT 比 BATT_LOW_VOLT 低约 0.2V/节。","description":"电池失效保护阈值倒挂（CRT:{batt_crt:.1f}V >= LOW:{batt_low:.1f}V）","evidence":{"source":"BATT_CRT_VOLT/BATT_LOW_VOLT","value":"f\"CRT={batt_crt:.1f} LOW={batt_low:.1f}\"","threshold":"CRT<LOW","unit":"V"}}],"firmware":"any","vehicle":"any","message":[["PARM"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"config","docurl":"https://ardupilot.org/copter/docs/parameters.html"},{"id":"apm-param-audit-spin-arm","name":"MOT_SPIN_ARM 高于 MOT_SPIN_MIN","group":"param_audit","order":4,"tag":"apm_param_spin_arm_gt_min","compute":["spin_arm = _cfg(\"MOT_SPIN_ARM\", 0.0)","spin_min = _cfg(\"MOT_SPIN_MIN\", 0.0)"],"trigger":[{"when":"spin_arm > spin_min and spin_min > 0.0","severity":"warning","suggestion":"MOT_SPIN_ARM ({spin_arm:.4f}) > MOT_SPIN_MIN ({spin_min:.4f}) 意味着解锁时空载怠速比空中最小油门还高——推力控制反过来了，降落后可能弹跳甚至无法正常降落。把它调低到 <= MOT_SPIN_MIN。","description":"MOT_SPIN_ARM ({spin_arm:.4f}) 高于 MOT_SPIN_MIN ({spin_min:.4f})，推力控制反转","evidence":{"source":"MOT_SPIN_ARM/MOT_SPIN_MIN","value":"f\"ARM={spin_arm:.4f} MIN={spin_min:.4f}\"","threshold":"ARM<=MIN","unit":""}}],"firmware":"any","vehicle":"any","message":[["PARM"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"config","docurl":"https://ardupilot.org/copter/docs/parameters.html"},{"id":"apm-param-audit-pwm-inverted","name":"MOT_PWM 区间异常","group":"param_audit","order":5,"tag":"apm_param_pwm_inverted","compute":["pwm_min = _cfg(\"MOT_PWM_MIN\", 0)","pwm_max = _cfg(\"MOT_PWM_MAX\", 0)"],"trigger":[{"when":"pwm_min >= pwm_max and not (pwm_min == 0 and pwm_max == 0)","severity":"critical","suggestion":"MOT_PWM_MIN ({pwm_min}) >= MOT_PWM_MAX ({pwm_max}) 意味着 PWM 输出区间为空或反转——电机输出完全失控。立即修正（参考值：MIN~1000、MAX~2000）。","description":"MOT_PWM 区间异常（MIN:{pwm_min} >= MAX:{pwm_max}）","evidence":{"source":"MOT_PWM_MIN/MOT_PWM_MAX","value":"f\"MIN={pwm_min} MAX={pwm_max}\"","threshold":"MIN<MAX","unit":"us"}}],"firmware":"any","vehicle":"any","message":[["PARM"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"config","docurl":"https://ardupilot.org/copter/docs/parameters.html"},{"id":"apm-param-audit-fence-empty","name":"围栏启用但无边界","group":"param_audit","order":6,"tag":"apm_param_fence_empty","compute":["fence_enable = _cfg(\"FENCE_ENABLE\", 0)","fence_alt = _cfg(\"FENCE_ALT_MAX\", 0.0)","fence_radius = _cfg(\"FENCE_RADIUS\", 0.0)"],"trigger":[{"when":"fence_enable == 1 and fence_alt <= 0.0 and fence_radius <= 0.0","severity":"warning","suggestion":"FENCE_ENABLE=1 但 FENCE_ALT_MAX=0 且 FENCE_RADIUS=0：围栏已启用却没有实际高度或半径边界。飞出去不会触发任何动作。设 FENCE_ALT_MAX 与 FENCE_RADIUS 为合理的值，或者关闭围栏。","description":"围栏已启用但没有高度或半径边界","evidence":{"source":"FENCE_ENABLE/FENCE_ALT_MAX/FENCE_RADIUS","value":"fence_enable","threshold":"非空边界","unit":""}}],"firmware":"any","vehicle":"any","message":[["PARM"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"config","docurl":"https://ardupilot.org/copter/docs/parameters.html"},{"id":"apm-battery-low","name":"电池最低电压","group":"battery","order":1,"tag":"apm_battery_low_voltage","compute":["volts = _ref(\"BAT.Volt\", \"CURR.Volt\")","vmin = min(volts)","vmax = max(volts)","cells_raw = int(vmax / 4.2 + 0.5)","per_cell = vmax / cells_raw","cells = cells_raw if (vmax > 4.0 and 70.0 > vmax and per_cell > 3.3 and 4.4 > per_cell) else None","crit_v = cells * 3.3","low_v = cells * 3.5"],"trigger":[{"when":"vmin <= crit_v and vmax <= 70.0","severity":"critical","suggestion":"已到临界电压动作点（估算 {cells:.0f}S × 3.3 V = {crit_v:.2f} V）。应就地降落/回收，继续飞有空中断电风险。","description":"电池电压触及临界线，最低 {vmin:.2f} V","evidence":{"source":"BAT/CURR.Volt(最低)","value":"f\"{vmin:.2f}\"","threshold":3.3,"unit":"V"}},{"when":"vmin <= low_v and vmax <= 70.0","severity":"warning","suggestion":"已到低电压告警点（估算 {cells:.0f}S × 3.5 V = {low_v:.2f} V）。缩短航时或更早返航，并核对电池健康度。","description":"电池电压触及低电压告警线，最低 {vmin:.2f} V","evidence":{"source":"BAT/CURR.Volt(最低)","value":"f\"{vmin:.2f}\"","threshold":3.5,"unit":"V"}}],"firmware":"any","vehicle":"any","message":[["BAT","CURR"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"power","docurl":"https://ardupilot.org/copter/docs/failsafe-battery.html"},{"id":"apm-battery-sag","name":"电池负载压降","group":"battery","order":2,"tag":"apm_battery_sag","compute":["volts = _ref(\"BAT.Volt\", \"CURR.Volt\")","curr = _ref(\"BAT.Curr\", \"CURR.Curr\")","peak_curr = max(curr)","sag = np.ptp(volts[curr > 20.0])"],"trigger":[{"when":"sag >= 1.0","severity":"info","suggestion":"带载压降一部分是正常的，但跨度偏大通常意味着电池老化、内阻升高，值得关注。","description":"大电流下压降 {sag:.2f} V（峰值电流 {peak_curr:.1f} A）","evidence":{"source":"BAT/CURR.Volt(>=20A 段极差)","value":"f\"{sag:.2f}\"","threshold":1,"unit":"V"}}],"firmware":"any","vehicle":"any","message":[["BAT","CURR"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"power","docurl":"https://ardupilot.org/copter/docs/failsafe-battery.html"},{"id":"apm-battery-sudden-drop","name":"电池电压突降","group":"battery","order":3,"tag":"apm_battery_sudden_drop","compute":["volts = _ref(\"BAT.Volt\", \"CURR.Volt\")","vts = _ref(\"BAT.timestamp\", \"CURR.timestamp\")","vmed = median(volts)","drops = step_drop_events(volts, vts, T0_US) if (vmed > 4.0 and 70.0 > vmed) else None"],"foreach":{"var":"drops","keys":["drop","dt_s","start_s","end_s","recovered"]},"trigger":[{"when":"not recovered and drop > 4.0","severity":"critical","suggestion":"跌完没有回升，指向电池插头虚接、单节失效或瞬时掉电。检查电池插头与线缆、电池健康度；掉电会复位外设甚至飞控。","description":"电池电压在 {dt_s:.3f} s 内跌落 {drop:.2f} V（t={start_s:.2f}s）","evidence":{"source":"BAT/CURR.Volt(快速跌落)","value":"f\"{drop:.2f}\"","threshold":4,"unit":"V"}},{"when":"not recovered","severity":"warning","suggestion":"这么快的跌落不是正常放电（正常放电不会一步掉这么多），指向插头虚接、单节失效或瞬时掉电。检查电池插头与线缆、电池健康度。","description":"电池电压在 {dt_s:.3f} s 内跌落 {drop:.2f} V（t={start_s:.2f}s）","evidence":{"source":"BAT/CURR.Volt(快速跌落)","value":"f\"{drop:.2f}\"","threshold":2,"unit":"V"}}],"firmware":"any","vehicle":"any","message":[["BAT","CURR"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"power","docurl":"https://ardupilot.org/copter/docs/failsafe-battery.html"},{"id":"apm-prearm-warnings","name":"预解锁/启动消息扫描","group":"prearm_messages","order":1,"tag":"apm_prearm_warnings","compute":["msg_lines = _try(_ref(\"MSG.Message\")) or []","statustext_lines = _try(_ref(\"STATUSTEXT.Text\")) or []","n_prearm = count_items(msg_lines, contains=\"prearm\")","n_arm = count_items(msg_lines, contains=\"arm:\")","n_not_calibrated = count_items(msg_lines, contains=\"not calibrated\")","n_unhealthy = count_items(msg_lines, contains=\"unhealthy\")","n_inconsistent = count_items(msg_lines, contains=\"inconsistent\")","n_error = count_items(msg_lines, contains=\"error\")","n_failed = count_items(msg_lines, contains=\"failed\")","n_bad = count_items(msg_lines, contains=\"bad \")","n_denied = count_items(msg_lines, contains=\"denied\")","n_st_prearm = count_items(statustext_lines, contains=\"prearm\")","n_st_error = count_items(statustext_lines, contains=\"error\")","n_st_failed = count_items(statustext_lines, contains=\"failed\")","n_st_denied = count_items(statustext_lines, contains=\"denied\")","total_warn = n_prearm + n_arm + n_not_calibrated + n_unhealthy + n_inconsistent + n_error + n_failed + n_bad + n_denied + n_st_prearm + n_st_error + n_st_failed + n_st_denied","samples = take_items(msg_lines, contains=\"prearm\", limit=6, clip={\"text\": 120})"],"trigger":[{"when":"total_warn >= 2","severity":"critical","suggestion":"启动阶段出现多条预解锁告警/错误消息（{total_warn} 条）。逐条检查 raw log 里的 MSG/STATUSTEXT 文本，解决所列问题后再飞。","description":"启动阶段 {total_warn} 条预解锁/错误消息","evidence":{"source":"MSG.Message/STATUSTEXT.Text(启动阶段)","value":"total_warn","threshold":1,"unit":"条"}},{"when":"total_warn > 0","severity":"warning","suggestion":"启动阶段出现预解锁或错误消息。检查 raw log 里的 MSG/STATUSTEXT 定位问题。","description":"启动阶段 {total_warn} 条预解锁/错误消息","evidence":{"source":"MSG.Message/STATUSTEXT.Text(启动阶段)","value":"total_warn","threshold":0,"unit":"条"}}],"firmware":"any","vehicle":"any","message":[["MSG","STATUSTEXT"]],"armed":false,"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"config","docurl":"https://ardupilot.org/copter/docs/common-prearm-safety-checks.html"},{"id":"apm-rcin-link-loss","name":"遥控输入链路","group":"rc_input","order":1,"tag":"apm_rc_link_loss","compute":["low1 = -RCIN.C1 > -1000","low2 = -RCIN.C2 > -1000","low3 = -RCIN.C3 > -1000","low4 = -RCIN.C4 > -1000","all_low = low1 & low2 & low3 & low4","lost_samples = sum(all_low)","ts = RCIN.timestamp","runs = excursion_events(all_low, ts, T0_US, min_duration_s=1.0)"],"foreach":{"var":"runs","keys":["duration_s","start_s","end_s"]},"trigger":[{"when":"duration_s >= 2.0 or end_s >= DURATION_S - 1.0","severity":"critical","suggestion":"四个主通道持续低于 1000us 达 {duration_s:.1f}s，说明遥控链路确实断开且未恢复。检查接收机供电、天线接触、失效保护设置（FS_THR_ENABLE）。","description":"四个主通道持续低于 1000us，持续 {duration_s:.1f}s（t={start_s:.1f}s 起）","evidence":{"source":"RCIN.C1..C4(持续低于 1000us)","value":"f\"{duration_s:.1f}s\"","threshold":1000,"unit":"us"}},{"when":"True","severity":"warning","suggestion":"正常飞行中四杆不会同时处于低位，这通常意味着遥控链路掉线或接收机保持失效值。","description":"四个主通道同时低于 1000us，持续 {duration_s:.1f}s（t={start_s:.1f}s 起，共 {lost_samples} 个样本）","evidence":{"source":"RCIN.C1..C4(同时低于 1000us 的样本数)","value":"f\"{lost_samples}样本/{duration_s:.1f}s\"","threshold":1000,"unit":"us"}}],"firmware":"any","vehicle":"any","message":[["RCIN"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"rc","docurl":"https://ardupilot.org/copter/docs/radio-failsafe.html"},{"id":"apm-sensor-rangefinder","name":"测距仪配置但无数据","group":"sensor_health","order":1,"tag":"apm_sensor_configured_but_silent","compute":["rng_type = _cfg(\"RNGFND_TYPE\", 0.0)","rng1_type = _cfg(\"RNGFND1_TYPE\", 0.0)"],"trigger":[{"when":"(rng_type > 0 or rng1_type > 0) and not has_topic('RFND') and not has_topic('RNGFND')","severity":"warning","suggestion":"参数声明了测距仪（RNGFND_TYPE/RNGFND1_TYPE > 0）却一条数据都没有：通常是接线松动、插错串口，或驱动没探测到设备。先确认日志里有 RFND（新）/ RNGFND（旧）消息。","description":"测距仪已配置但日志无数据","evidence":{"source":"RNGFND_TYPE(>0) 但无 RFND/RNGFND 消息","threshold":0,"unit":""}}],"firmware":"any","vehicle":"any","message":[["PARM"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"sensors","docurl":"https://ardupilot.org/copter/docs/common-prearm-safety-checks.html"},{"id":"apm-sensor-gps","name":"GPS 配置但无数据","group":"sensor_health","order":2,"tag":"apm_sensor_configured_but_silent","compute":["gps_type = _cfg(\"GPS_TYPE\", 0.0)"],"trigger":[{"when":"gps_type > 0 and not has_topic('GPS')","severity":"warning","suggestion":"参数声明了 GPS 接收机（GPS_TYPE > 0）却完全没有 GPS 消息：查接线、串口与驱动探测；没有 GPS 就无法定位与返航。","description":"GPS 已配置但日志无数据","evidence":{"source":"GPS_TYPE(>0) 但无 GPS 消息","threshold":0,"unit":""}}],"firmware":"any","vehicle":"any","message":[["PARM"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"sensors","docurl":"https://ardupilot.org/copter/docs/common-prearm-safety-checks.html"},{"id":"apm-sensor-compass-health","name":"罗盘健康标志","group":"sensor_health","order":3,"tag":"apm_compass_unhealthy","compute":["unhealthy_ratio = np.mean(MAG.Health == 0.0)"],"trigger":[{"when":"unhealthy_ratio > 0.20","severity":"warning","suggestion":"健康罗盘的 Health 标志几乎恒为 1。占比这么高说明磁罗盘在失效或掉线，航向会受影响；查接线、供电与干扰，必要时换罗盘。","description":"罗盘不健康样本占比 {unhealthy_ratio:.0%}","evidence":{"source":"MAG.Health(=0 的样本占比)","value":"f\"{unhealthy_ratio:.2f}\"","threshold":0.2,"unit":""}}],"firmware":"any","vehicle":"any","message":[["MAG"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"sensors","docurl":"https://ardupilot.org/copter/docs/common-prearm-safety-checks.html"},{"id":"apm-timing-gaps","name":"日志间隙","group":"timing","order":1,"tag":"apm_logging_gap","compute":["gts = _ref(\"IMU.timestamp\", \"ATT.timestamp\", \"VIBE.timestamp\")","gaps = gap_events(gts, T0_US)"],"foreach":{"var":"gaps","keys":["gap_s","start_s","end_s","nominal_dt_s","threshold_s"]},"trigger":[{"when":"True","severity":"warning","suggestion":"名义间隔 {nominal_dt_s:.3f} s，本次阈值 {threshold_s:.2f} s（绝对下限 0.5 s 与名义间隔 10 倍取大者）。该窗口的数据缺失，会影响所有其它结论；排查 SD 卡写入性能与 CPU 负载。","description":"日志间隙 {gap_s:.2f} s（t={start_s:.2f}s 起，{end_s:.2f}s 恢复）","evidence":{"source":"IMU/ATT/VIBE.timestamp(相邻间隔)","value":"f\"{gap_s:.2f}\"","threshold":0.5,"unit":"s"}}],"firmware":"any","vehicle":"any","message":[["IMU","ATT","VIBE"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"system","docurl":"https://ardupilot.org/copter/docs/common-diagnosing-problems-using-logs.html"},{"id":"apm-timing-long-loops","name":"调度长循环","group":"timing","order":2,"tag":"apm_scheduler_long_loops","compute":["long_loops = sum(PM.NLon)"],"trigger":[{"when":"long_loops > 0","severity":"warning","suggestion":"主循环曾跑超时间预算，说明飞控一度 CPU 饥饿，会拖慢控制更新并劣化估计与控制。降低负载：调低日志/陷波/EKF 速率、关掉用不到的功能，或检查循环速率是否设得超出板子能力。","description":"调度记录到 {long_loops:.0f} 次长循环","evidence":{"source":"PM.NLon(长循环累计数)","value":"f\"{long_loops:.0f}\"","threshold":0,"unit":"次"}}],"firmware":"any","vehicle":"any","message":[["PM"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"system","docurl":"https://ardupilot.org/copter/docs/common-diagnosing-problems-using-logs.html"},{"id":"apm-vibration-x","name":"X 轴振动","group":"vibration","order":1,"tag":"apm_high_vibration","compute":["vx = VIBE.VibeX","vx_max = max(vx)","frac_warn = np.sum(vx > 30.0) / len(vx)","frac_crit = np.sum(vx > 60.0) / len(vx)"],"trigger":[{"when":"vx_max > 60.0 or frac_crit > 0.0","severity":"critical","suggestion":"超过 60 m/s^2 会让加速度计数据失真并可能触发 EKF 失效。改善飞控减震与桨/电机动平衡后再飞。","description":"X 轴振动严重超标，峰值 {vx_max:.0f} m/s^2","evidence":{"source":"VIBE.VibeX(峰值)","value":"f\"{vx_max:.1f}\"","threshold":60,"unit":"m/s^2"}},{"when":"frac_warn >= 0.10","severity":"warning","suggestion":"全程有 10% 以上样本超过 30 m/s^2。检查安装与动平衡，考虑启用谐波陷波滤波器。","description":"X 轴振动持续偏大，峰值 {vx_max:.0f} m/s^2","evidence":{"source":"VIBE.VibeX(峰值)","value":"f\"{vx_max:.1f}\"","threshold":30,"unit":"m/s^2"}},{"when":"vx_max > 30.0","severity":"info","suggestion":"仅个别时刻超过 30 m/s^2，整体可接受；若伴随定位漂移再排查。","description":"X 轴振动偶有冒尖，峰值 {vx_max:.0f} m/s^2","evidence":{"source":"VIBE.VibeX(峰值)","value":"f\"{vx_max:.1f}\"","threshold":30,"unit":"m/s^2"}}],"firmware":"any","vehicle":"any","message":[["VIBE"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"vibration","docurl":"https://ardupilot.org/copter/docs/common-measuring-vibration.html"},{"id":"apm-vibration-y","name":"Y 轴振动","group":"vibration","order":2,"tag":"apm_high_vibration","compute":["vy = VIBE.VibeY","vy_max = max(vy)","frac_warn = np.sum(vy > 30.0) / len(vy)","frac_crit = np.sum(vy > 60.0) / len(vy)"],"trigger":[{"when":"vy_max > 60.0 or frac_crit > 0.0","severity":"critical","suggestion":"超过 60 m/s^2 会让加速度计数据失真并可能触发 EKF 失效。改善飞控减震与桨/电机动平衡后再飞。","description":"Y 轴振动严重超标，峰值 {vy_max:.0f} m/s^2","evidence":{"source":"VIBE.VibeY(峰值)","value":"f\"{vy_max:.1f}\"","threshold":60,"unit":"m/s^2"}},{"when":"frac_warn >= 0.10","severity":"warning","suggestion":"全程有 10% 以上样本超过 30 m/s^2。检查安装与动平衡，考虑启用谐波陷波滤波器。","description":"Y 轴振动持续偏大，峰值 {vy_max:.0f} m/s^2","evidence":{"source":"VIBE.VibeY(峰值)","value":"f\"{vy_max:.1f}\"","threshold":30,"unit":"m/s^2"}},{"when":"vy_max > 30.0","severity":"info","suggestion":"仅个别时刻超过 30 m/s^2，整体可接受；若伴随定位漂移再排查。","description":"Y 轴振动偶有冒尖，峰值 {vy_max:.0f} m/s^2","evidence":{"source":"VIBE.VibeY(峰值)","value":"f\"{vy_max:.1f}\"","threshold":30,"unit":"m/s^2"}}],"firmware":"any","vehicle":"any","message":[["VIBE"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"vibration","docurl":"https://ardupilot.org/copter/docs/common-measuring-vibration.html"},{"id":"apm-vibration-z","name":"Z 轴振动","group":"vibration","order":3,"tag":"apm_high_vibration","compute":["vz = VIBE.VibeZ","vz_max = max(vz)","frac_warn = np.sum(vz > 30.0) / len(vz)","frac_crit = np.sum(vz > 60.0) / len(vz)"],"trigger":[{"when":"vz_max > 60.0 or frac_crit > 0.0","severity":"critical","suggestion":"Z 轴超标最常来自桨叶/机架共振与减震球老化，会直接影响定高。优先查这一轴。","description":"Z 轴振动严重超标，峰值 {vz_max:.0f} m/s^2","evidence":{"source":"VIBE.VibeZ(峰值)","value":"f\"{vz_max:.1f}\"","threshold":60,"unit":"m/s^2"}},{"when":"frac_warn >= 0.10","severity":"warning","suggestion":"全程有 10% 以上样本超过 30 m/s^2。检查安装与动平衡，考虑启用谐波陷波滤波器。","description":"Z 轴振动持续偏大，峰值 {vz_max:.0f} m/s^2","evidence":{"source":"VIBE.VibeZ(峰值)","value":"f\"{vz_max:.1f}\"","threshold":30,"unit":"m/s^2"}},{"when":"vz_max > 30.0","severity":"info","suggestion":"仅个别时刻超过 30 m/s^2，整体可接受；若伴随定高漂移再排查。","description":"Z 轴振动偶有冒尖，峰值 {vz_max:.0f} m/s^2","evidence":{"source":"VIBE.VibeZ(峰值)","value":"f\"{vz_max:.1f}\"","threshold":30,"unit":"m/s^2"}}],"firmware":"any","vehicle":"any","message":[["VIBE"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"vibration","docurl":"https://ardupilot.org/copter/docs/common-measuring-vibration.html"},{"id":"apm-clip-0","name":"加速度计削波（IMU0）","group":"vibration","order":4,"tag":"apm_accel_clipping","compute":["clip0_total = np.ptp(VIBE.Clip0)"],"trigger":[{"when":"clip0_total >= 100.0","severity":"critical","suggestion":"削波期间该 IMU 数据完全不可用。必须从源头降振动：桨动平衡、飞控软安装、检查机架共振。","description":"IMU0 削波 {clip0_total:.0f} 次","evidence":{"source":"VIBE.Clip0(累计)","value":"f\"{clip0_total:.0f}\"","threshold":100,"unit":"次"}},{"when":"clip0_total > 0.0","severity":"warning","suggestion":"少量削波在硬着陆附近常见；若计数持续上升则说明 IMU 在饱和，需降振动。","description":"IMU0 削波 {clip0_total:.0f} 次","evidence":{"source":"VIBE.Clip0(累计)","value":"f\"{clip0_total:.0f}\"","threshold":0,"unit":"次"}}],"firmware":"any","vehicle":"any","message":[["VIBE"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"vibration","docurl":"https://ardupilot.org/copter/docs/common-measuring-vibration.html"},{"id":"apm-clip-1","name":"加速度计削波（IMU1）","group":"vibration","order":5,"tag":"apm_accel_clipping","compute":["clip1_total = np.ptp(VIBE.Clip1)"],"trigger":[{"when":"clip1_total >= 100.0","severity":"critical","suggestion":"削波期间该 IMU 数据完全不可用。必须从源头降振动：桨动平衡、飞控软安装、检查机架共振。","description":"IMU1 削波 {clip1_total:.0f} 次","evidence":{"source":"VIBE.Clip1(累计)","value":"f\"{clip1_total:.0f}\"","threshold":100,"unit":"次"}},{"when":"clip1_total > 0.0","severity":"warning","suggestion":"少量削波在硬着陆附近常见；若计数持续上升则说明 IMU 在饱和，需降振动。","description":"IMU1 削波 {clip1_total:.0f} 次","evidence":{"source":"VIBE.Clip1(累计)","value":"f\"{clip1_total:.0f}\"","threshold":0,"unit":"次"}}],"firmware":"any","vehicle":"any","message":[["VIBE"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"vibration","docurl":"https://ardupilot.org/copter/docs/common-measuring-vibration.html"},{"id":"apm-clip-2","name":"加速度计削波（IMU2）","group":"vibration","order":6,"tag":"apm_accel_clipping","compute":["clip2_total = np.ptp(VIBE.Clip2)"],"trigger":[{"when":"clip2_total >= 100.0","severity":"critical","suggestion":"削波期间该 IMU 数据完全不可用。必须从源头降振动：桨动平衡、飞控软安装、检查机架共振。","description":"IMU2 削波 {clip2_total:.0f} 次","evidence":{"source":"VIBE.Clip2(累计)","value":"f\"{clip2_total:.0f}\"","threshold":100,"unit":"次"}},{"when":"clip2_total > 0.0","severity":"warning","suggestion":"少量削波在硬着陆附近常见；若计数持续上升则说明 IMU 在饱和，需降振动。","description":"IMU2 削波 {clip2_total:.0f} 次","evidence":{"source":"VIBE.Clip2(累计)","value":"f\"{clip2_total:.0f}\"","threshold":0,"unit":"次"}}],"firmware":"any","vehicle":"any","message":[["VIBE"]],"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"},"category":"vibration","docurl":"https://ardupilot.org/copter/docs/common-measuring-vibration.html"}],"px4-ulog":[{"id":"px4-airspeed-invalid","name":"空速健康","group":"airspeed","order":1,"tag":"low_airspeed","compute":["cruise_ok = require_true(masked_any_in(vehicle_status.nav_state, vehicle_status.timestamp, ARMED_INTERVALS, codes=[3, 8]))","invalid_frac = _try(np.mean( _ref(\"airspeed_validated.airspeed_sensor_measurement_valid\") == 0))","has_invalid = invalid_frac is not None","tas_min = _try(min(airspeed_validated.true_airspeed_m_s))"],"output":[{"name":"airspeedInvalidRatio","value":"invalid_frac","round":3},{"name":"airspeedMinM","value":"tas_min","round":1}],"trigger":[{"when":"has_invalid and invalid_frac >= 0.50","label":"low_airspeed","severity":"critical","suggestion":"结合故障库 F009：空速失效极易引发失速，检查空速管堵塞/积水、管路漏气与校准。","description":"空速传感器在固定翼段大部分时间无效（{invalid_frac:.0%} 样本）","evidence":{"source":"airspeed_validated.airspeed_sensor_measurement_valid","value":"f\"{invalid_frac:.3f}\"","threshold":0.5}},{"when":"has_invalid and invalid_frac >= 0.10","label":"low_airspeed","severity":"warning","suggestion":"结合故障库 F009 检查空速管与管路密封。","description":"空速传感器间歇无效（{invalid_frac:.0%} 样本）","evidence":{"source":"airspeed_validated.airspeed_sensor_measurement_valid","value":"f\"{invalid_frac:.3f}\"","threshold":0.1}}],"firmware":"any","vehicle":"fixed_wing","message":[["airspeed_validated"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"airspeed","docurl":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},{"id":"px4-attitude-oscillation","name":"姿态误差高频振荡","group":"attitude_tracking","order":2,"tag":"attitude_overshoot","version":"1.1.0","ran_when":"seg_ok","compute":["p99, osc_hz, seg_n = _try(att_tracking_stats(\n  att_q=vehicle_attitude.q,\n  # 指令源：两路都给，**有 q_d 就用 q_d**（新版只记它），没有才回退 roll/pitch_body。\n  # 顺序由算子定，规则不用管版本——按存在性挑，不按版本号挑。\n  sp_q=_ref(\"vehicle_attitude_setpoint.q_d\"),\n  sp_roll=_ref(\"vehicle_attitude_setpoint.roll_body\"),\n  sp_pitch=_ref(\"vehicle_attitude_setpoint.pitch_body\"),\n  att_ts=vehicle_attitude.timestamp,\n  sp_ts=vehicle_attitude_setpoint.timestamp,\n  intervals=ARMED_INTERVALS,\n  tilt_min_deg=10.0, min_samples=50, sample_rate=50))","seg_ok = seg_n > 50 if seg_n else False","p99_stat = p99 if seg_ok else None","osc_stat = osc_hz if seg_ok else None"],"output":[{"name":"attitudeErrDegP99","value":"p99_stat","round":1},{"name":"attitudeOscHz","value":"osc_stat","round":2}],"trigger":[{"when":"osc_stat >= 4.0 and p99_stat >= 25.0 and IS_FIXED_WING","label":"attitude_overshoot","severity":"warning","suggestion":"振荡多与控制增益/机架共振相关，禁用大幅调参，先做频响检查。","description":"姿态误差高频振荡（约 {osc_stat:.1f} Hz）","evidence":{"source":"姿态跟踪误差符号翻转频率","value":"f\"{osc_stat:.2f}\"","threshold":4,"unit":"Hz"}},{"when":"osc_stat >= 4.0 and p99_stat >= 15.0 and not IS_FIXED_WING","label":"attitude_overshoot","severity":"warning","suggestion":"振荡多与控制增益/机架共振相关，禁用大幅调参，先做频响检查。","description":"姿态误差高频振荡（约 {osc_stat:.1f} Hz）","evidence":{"source":"姿态跟踪误差符号翻转频率","value":"f\"{osc_stat:.2f}\"","threshold":4,"unit":"Hz"}}],"firmware":"any","vehicle":"any","message":[["vehicle_attitude"],["vehicle_attitude_setpoint"]],"status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"attitude","docurl":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},{"id":"px4-attitude-overshoot","name":"姿态跟踪超调","group":"attitude_tracking","order":1,"tag":"attitude_overshoot","version":"1.1.0","ran_when":"seg_ok","compute":["p99, osc_hz, seg_n = _try(att_tracking_stats(\n  att_q=vehicle_attitude.q,\n  # 指令源：两路都给，**有 q_d 就用 q_d**（新版只记它），没有才回退 roll/pitch_body。\n  # 顺序由算子定，规则不用管版本——按存在性挑，不按版本号挑。\n  sp_q=_ref(\"vehicle_attitude_setpoint.q_d\"),\n  sp_roll=_ref(\"vehicle_attitude_setpoint.roll_body\"),\n  sp_pitch=_ref(\"vehicle_attitude_setpoint.pitch_body\"),\n  att_ts=vehicle_attitude.timestamp,\n  sp_ts=vehicle_attitude_setpoint.timestamp,\n  intervals=ARMED_INTERVALS,\n  tilt_min_deg=10.0, min_samples=50, sample_rate=50))","seg_ok = seg_n > 50 if seg_n else False","p99_stat = p99 if seg_ok else None","osc_stat = osc_hz if seg_ok else None"],"output":[{"name":"attitudeErrDegP99","value":"p99_stat","round":1},{"name":"attitudeOscHz","value":"osc_stat","round":2}],"trigger":[{"when":"p99_stat >= 40.0 and IS_FIXED_WING","label":"attitude_overshoot","severity":"critical","suggestion":"结合故障库 F006：检查姿态环增益、机架共振；避免直接大幅降 PID。","description":"姿态跟踪误差过大（p99 {p99_stat:.1f}°）","evidence":{"source":"vehicle_attitude vs vehicle_attitude_setpoint（机动段）","value":"f\"{p99_stat:.1f}\"","threshold":25,"unit":"°"}},{"when":"p99_stat >= 25.0 and IS_FIXED_WING","label":"attitude_overshoot","severity":"warning","suggestion":"结合故障库 F006 排查；大风环境下优先归因环境扰动。","description":"姿态跟踪误差偏大（p99 {p99_stat:.1f}°）","evidence":{"source":"vehicle_attitude vs vehicle_attitude_setpoint（机动段）","value":"f\"{p99_stat:.1f}\"","threshold":25,"unit":"°"}},{"when":"p99_stat >= 30.0 and not IS_FIXED_WING","label":"attitude_overshoot","severity":"critical","suggestion":"结合故障库 F006：检查姿态环增益、机架共振；避免直接大幅降 PID。","description":"姿态跟踪误差过大（p99 {p99_stat:.1f}°）","evidence":{"source":"vehicle_attitude vs vehicle_attitude_setpoint（机动段）","value":"f\"{p99_stat:.1f}\"","threshold":15,"unit":"°"}},{"when":"p99_stat >= 15.0 and not IS_FIXED_WING","label":"attitude_overshoot","severity":"warning","suggestion":"结合故障库 F006 排查；大风环境下优先归因环境扰动。","description":"姿态跟踪误差偏大（p99 {p99_stat:.1f}°）","evidence":{"source":"vehicle_attitude vs vehicle_attitude_setpoint（机动段）","value":"f\"{p99_stat:.1f}\"","threshold":15,"unit":"°"}}],"firmware":"any","vehicle":"any","message":[["vehicle_attitude"],["vehicle_attitude_setpoint"]],"status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"attitude","docurl":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},{"id":"px4-cpu-load","name":"CPU 负载","group":"cpu","compute":["cpu_max = max(cpuload.load)"],"output":[{"name":"cpuLoadMax","value":"cpu_max","round":3}],"trigger":[{"when":"cpu_max >= 0.95","severity":"critical","suggestion":"CPU 长期接近满载会导致控制环丢步；检查高耗率模块与日志流配置。","description":"CPU 负载峰值 {cpu_max:.0%} 超阈值","evidence":{"source":"cpuload.load(max)","value":"f\"{cpu_max:.3f}\"","threshold":0.95}},{"when":"cpu_max >= 0.90","severity":"warning","suggestion":"关注 CPU 余量，必要时降低消息发布率。","description":"CPU 负载峰值 {cpu_max:.0%} 偏高","evidence":{"source":"cpuload.load(max)","value":"f\"{cpu_max:.3f}\"","threshold":0.9}}],"firmware":"any","vehicle":"any","message":[["cpuload"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"system","docurl":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},{"id":"px4-ekf-fault","name":"EKF 融合硬故障","group":"ekf_faults","order":1,"tag":"ekf_innovation_failure","compute":["fault_raw = _try(bit_or_max( estimator_status[:].filter_fault_flags))","fault_union = _try(coalesce(fault_raw, 0))","crit_bits = _try(has_bits(fault_union, 63))"],"trigger":[{"when":"crit_bits","severity":"critical","suggestion":"估计器出现硬故障，建议停飞排查传感器与振动后重新标定。","description":"EKF 报告核心融合硬故障（filter_fault_flags={fault_union}）","evidence":{"source":"estimator_status.filter_fault_flags","value":"f\"fault={fault_union}\"","threshold":0}},{"when":"fault_union > 0 and not crit_bits","label":null,"severity":"info","suggestion":"若该机确实未启用视觉/光流定位，此位可忽略；否则检查对应传感器。","description":"EKF 报告非核心辅助传感器融合拒绝（filter_fault_flags={fault_union}，常见为未使用视觉/光流）","evidence":{"source":"estimator_status.filter_fault_flags","value":"fault_union","threshold":0}}],"firmware":"any","vehicle":"any","message":[["estimator_status"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"ekf","docurl":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"},{"id":"px4-ekf-innovation","name":"EKF 创新检验","group":"ekf_innovations","order":1,"tag":"ekf_innovation_failure","compute":["frac, names, inst = worst_reject_ratio(\n  _ref(\"estimator_status[:].innovation_check_flags\"),\n  _ref(\"estimator_status[:].vel_test_ratio\"),\n  _ref(\"estimator_status[:].pos_test_ratio\"),\n  _ref(\"estimator_status[:].hgt_test_ratio\"),\n  _ref(\"estimator_status[:].hdg_test_ratio\"),\n  _ref(\"estimator_status[:].mag_test_ratio\"),\n  _ref(\"estimator_status[:].tas_test_ratio\"),\n  _ref(\"estimator_status[:].hagl_test_ratio\"),\n  _ref(\"estimator_status[:].beta_test_ratio\"),\n  primary_min=3,\n  primary_names=[\"速度\", \"水平位置\", \"垂直位置\", \"磁罗盘 X\", \"磁罗盘 Y\", \"磁罗盘 Z\",\n                 \"航向\", \"空速\", \"侧滑\", \"离地高度\", \"光流 X\", \"光流 Y\"],\n  ge=1.0,                    # 通道判拒阈值：ratio >= 1 即该路观测被 EKF 拒绝\n  channel_min=3,             # 通道最少被拒样本数，去偶发尖峰毛刺\n  channel_labels=[\"速度\", \"水平位置\", \"垂直高度\", \"航向\", \"磁罗盘\", \"空速\", \"离地高度\", \"侧滑\"],\n  fallback_label=\"未知通道\")","pct = frac * 100"],"output":[{"name":"ekfRejectRatioPct","value":"pct","round":2}],"trigger":[{"when":"pct >= 5.0","severity":"critical","suggestion":"涉及：{names}。检查对应传感器健康度、安装与校准。","description":"EKF 创新检验持续失败（estimator #{inst}：{names}）","evidence":{"source":"estimator_status 创新检验拒绝样本占比","value":"f\"{pct:.2f}\"","threshold":5,"unit":"%"}},{"when":"pct >= 1.0","severity":"warning","suggestion":"涉及：{names}。关注 GPS 卫星数、磁罗盘干扰、振动与气压计异常。","description":"EKF 创新检验偶发失败（estimator #{inst}：{names}）","evidence":{"source":"estimator_status 创新检验拒绝样本占比","value":"f\"{pct:.2f}\"","threshold":1,"unit":"%"}}],"firmware":"any","vehicle":"any","message":[["estimator_status"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"ekf","docurl":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"},{"id":"px4-failsafe-failsafe","name":"失效保护触发","group":"failsafe","order":1,"compute":["events = rising_edge_events(vehicle_status.failsafe, vehicle_status.timestamp, ARMED_INTERVALS, T0_US)"],"foreach":{"var":"events","keys":["t_s"]},"trigger":[{"when":"True","label":"failsafe","severity":"critical","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。","description":"触发失效保护（飞行中，t={t_s:.1f}s）","evidence":{"source":"vehicle_status.failsafe","value":"f\"set at {t_s:.1f}s\""}}],"firmware":"any","vehicle":"any","version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"failsafe","docurl":"https://docs.px4.io/main/en/config/safety.html"},{"id":"px4-failsafe-rc_signal_lost","name":"遥控信号丢失","group":"failsafe","order":2,"compute":["events = rising_edge_events(vehicle_status.rc_signal_lost, vehicle_status.timestamp, ARMED_INTERVALS, T0_US)"],"foreach":{"var":"events","keys":["t_s"]},"trigger":[{"when":"True","label":"rc_lost","severity":"warning","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。","description":"遥控信号丢失（飞行中，t={t_s:.1f}s）","evidence":{"source":"vehicle_status.rc_signal_lost","value":"f\"set at {t_s:.1f}s\""}}],"firmware":"any","vehicle":"any","version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"failsafe","docurl":"https://docs.px4.io/main/en/config/safety.html"},{"id":"px4-failsafe-data_link_lost","name":"数据链路丢失","group":"failsafe","order":3,"compute":["events = rising_edge_events(vehicle_status.data_link_lost, vehicle_status.timestamp, ARMED_INTERVALS, T0_US)"],"foreach":{"var":"events","keys":["t_s"]},"trigger":[{"when":"True","severity":"warning","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。","description":"数据链路丢失（飞行中，t={t_s:.1f}s）","evidence":{"source":"vehicle_status.data_link_lost","value":"f\"set at {t_s:.1f}s\""}}],"firmware":"any","vehicle":"any","version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"failsafe","docurl":"https://docs.px4.io/main/en/config/safety.html"},{"id":"px4-failsafe-engine_failure","name":"动力故障保护","group":"failsafe","order":4,"compute":["events = rising_edge_events(vehicle_status.engine_failure, vehicle_status.timestamp, ARMED_INTERVALS, T0_US)"],"foreach":{"var":"events","keys":["t_s"]},"trigger":[{"when":"True","severity":"critical","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。","description":"发动机/动力故障保护（飞行中，t={t_s:.1f}s）","evidence":{"source":"vehicle_status.engine_failure","value":"f\"set at {t_s:.1f}s\""}}],"firmware":"any","vehicle":"any","version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"failsafe","docurl":"https://docs.px4.io/main/en/config/safety.html"},{"id":"px4-failsafe-mission_failure","name":"任务失效保护","group":"failsafe","order":5,"compute":["events = rising_edge_events(vehicle_status.mission_failure, vehicle_status.timestamp, ARMED_INTERVALS, T0_US)"],"foreach":{"var":"events","keys":["t_s"]},"trigger":[{"when":"True","severity":"critical","suggestion":"结合故障库与失效保护配置确认返航/降落行为；RC 丢失见 F007。","description":"任务失效保护（飞行中，t={t_s:.1f}s）","evidence":{"source":"vehicle_status.mission_failure","value":"f\"set at {t_s:.1f}s\""}}],"firmware":"any","vehicle":"any","version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"failsafe","docurl":"https://docs.px4.io/main/en/config/safety.html"},{"id":"px4-failsafe-nav","name":"失效保护导航状态","group":"failsafe","order":6,"compute":["events = step_into_events(vehicle_status.nav_state, vehicle_status.timestamp, ARMED_INTERVALS, T0_US, codes={5: \"AUTO_RTL\", 12: \"DESCEND\", 13: \"TERMINATION\", 18: \"LAND\"})"],"foreach":{"var":"events","keys":["t_s","code","name"]},"trigger":[{"when":"True","label":"failsafe","severity":"critical","suggestion":"说明飞控进入失效保护状态，需结合前文事件定位触发原因。","description":"飞行中导航状态切换为 {name}（t={t_s:.1f}s）","evidence":{"source":"vehicle_status.nav_state","value":"name"}}],"firmware":"any","vehicle":"any","message":[["vehicle_status"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"failsafe","docurl":"https://docs.px4.io/main/en/config/safety.html"},{"id":"px4-gps-eph","name":"GPS 水平位置误差","group":"gps_health","order":1,"tag":"gps_eph_high","compute":["eph_pos = vehicle_gps_position.eph[vehicle_gps_position.eph > 0]","eph_m = eph_pos * 0.001","e_p95 = percentile(eph_m, p=95)","e_max = max(eph_m)"],"output":[{"name":"gpsEphP95M","value":"e_p95","round":2},{"name":"gpsEphMaxM","value":"e_max","round":2}],"trigger":[{"when":"e_p95 >= 10.0","label":"gps_eph_high","severity":"warning","suggestion":"结合故障库 F002：排查天线电磁干扰/遮挡/馈线虚接/多路径。","description":"GPS 水平位置误差持续偏大（p95 {e_p95:.1f} m）","evidence":{"source":"vehicle_gps_position.eph(armed p95)","value":"f\"{e_p95:.2f}\"","threshold":10,"unit":"m"}},{"when":"e_p95 >= 5.0","label":"gps_eph_high","severity":"info","suggestion":"关注天线安装位置与遮挡。","description":"GPS 水平位置误差偶发偏大（p95 {e_p95:.1f} m）","evidence":{"source":"vehicle_gps_position.eph(armed p95)","value":"f\"{e_p95:.2f}\"","threshold":5,"unit":"m"}}],"firmware":"any","vehicle":"any","message":[["vehicle_gps_position"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"gps","docurl":"https://docs.px4.io/main/en/gps_compass/"},{"id":"px4-gps-jump","name":"GPS 位置跳变","group":"gps_health","order":3,"tag":"gps_jump","compute":["step = _try(adjacent_speed_mps( _ref(\"vehicle_gps_position.latitude_deg\", \"vehicle_gps_position.lat\", unit=\"deg\"), _ref(\"vehicle_gps_position.longitude_deg\", \"vehicle_gps_position.lon\", unit=\"deg\"), _ref(\"vehicle_gps_position.timestamp\")))","njump = _try(np.sum(step > 50.0))"],"output":[{"name":"gpsJumpCount","value":"njump"}],"trigger":[{"when":"njump >= 3","label":"gps_jump","severity":"warning","suggestion":"结合故障库 F002：排查多路径、馈线与电磁干扰；室内跳变为正常现象。","description":"GPS 位置出现 {njump} 次异常跳变（>50 m/s）","evidence":{"source":"vehicle_gps_position lat/lon 相邻差分","value":"njump","threshold":3,"unit":"次"}}],"firmware":"any","vehicle":"any","message":[["vehicle_gps_position"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"gps","docurl":"https://docs.px4.io/main/en/gps_compass/"},{"id":"px4-gps-sats","name":"GPS 卫星数","group":"gps_health","order":2,"tag":"gps_eph_high","compute":["s_min = min(vehicle_gps_position.satellites_used)"],"output":[{"name":"gpsSatellitesMin","value":"s_min"}],"trigger":[{"when":"s_min <= 6","label":"gps_eph_high","severity":"warning","suggestion":"卫星数不足时定位易跳变；排查遮挡与天线。","description":"GPS 卫星数最少仅 {s_min} 颗","evidence":{"source":"vehicle_gps_position.satellites_used(min)","value":"s_min","threshold":8,"unit":"颗"}}],"firmware":"any","vehicle":"any","message":[["vehicle_gps_position"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"gps","docurl":"https://docs.px4.io/main/en/gps_compass/"},{"id":"px4-guard-log-dropouts","name":"数据质量-日志丢包","group":"guards","order":3,"trigger":[{"when":"DROPOUT_MS > 1000","label":"log_dropouts_high","severity":"guard","description":"Data quality: log_dropouts_high","evidence":{"source":""}}],"firmware":"any","vehicle":"any","version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"guard","compute":[]},{"id":"px4-guard-restart","name":"数据质量-中途重启","group":"guards","order":1,"trigger":[{"when":"RESTART_DETECTED","label":"restart_detected","severity":"guard","description":"Data quality: restart_detected","evidence":{"source":""}}],"firmware":"any","vehicle":"any","version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"guard","compute":[]},{"id":"px4-guard-short-log","name":"数据质量-短日志","group":"guards_early","order":1,"trigger":[{"when":"ARMED_S > 0 and ARMED_S < 60","label":"insufficient_data","severity":"guard","description":"Data quality: insufficient_data","evidence":{"source":""}},{"when":"ARMED_S == 0 and DURATION_S < 60","label":"insufficient_data","severity":"guard","description":"Data quality: insufficient_data","evidence":{"source":""}}],"firmware":"any","vehicle":"any","version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"guard","compute":[]},{"id":"px4-guard-topic-missing","name":"数据质量-关键 topic 缺失","group":"guards","order":2,"trigger":[{"when":"not has_topic('vehicle_status')","label":"topic_missing:vehicle_status","severity":"guard","description":"Data quality: topic_missing:vehicle_status","evidence":{"source":""}},{"when":"not has_topic('battery_status')","label":"topic_missing:battery_status","severity":"guard","description":"Data quality: topic_missing:battery_status","evidence":{"source":""}},{"when":"not has_topic('estimator_status')","label":"topic_missing:estimator_status","severity":"guard","description":"Data quality: topic_missing:estimator_status","evidence":{"source":""}}],"firmware":"any","vehicle":"any","version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"guard","compute":[]},{"id":"px4-imu-bias-drift","name":"陀螺零偏漂移","group":"imu_bias","order":1,"tag":"imu_bias_drift","version":"1.1.0","compute":["bx, by, bz, bts, src_text = _try(gyro_bias_series( estimator_sensor_bias.gyro_bias, estimator_sensor_bias.timestamp, estimator_states.states, estimator_states.timestamp, estimator_status.states, estimator_status.timestamp, slot=10, sources=[\"estimator_sensor_bias.gyro_bias[]\",\n         \"estimator_states.states[10..12]\",\n         \"estimator_status.states[10..12]\"]))","worst_abs, worst_axis, worst_drift, drift_axis = gyro_bias_worst( bx, by, bz, bts, ARMED_INTERVALS, labels=[\"X\", \"Y\", \"Z\"], min_count=10)","temp_range = _try(max_temp_range(vehicle_imu_status.temperature_gyro, vehicle_air_data.ambient_temperature))","bias_stat = _try(np.maximum(worst_abs, worst_drift))"],"output":[{"name":"gyroBiasMaxRadS","value":"worst_abs","round":4},{"name":"gyroBiasDriftRadS","value":"worst_drift","round":4},{"name":"gyroBiasSource","value":"src_text"},{"name":"imuTempRangeC","value":"temp_range","round":1}],"trigger":[{"when":"worst_abs >= 0.05 or worst_drift >= 0.05","label":"imu_bias_drift","severity":"critical","suggestion":"结合故障库 F005：检查 IMU 安装紧固、执行陀螺/加计标定；若温度跨度大，优先按温度漂移解释。","description":"陀螺零偏异常（轴 {worst_axis}：绝对值 {worst_abs:.4f} rad/s，漂移 {worst_drift:.4f} rad/s）","evidence":{"source":"{src_text}","value":"f\"{bias_stat:.4f}\"","threshold":0.02,"unit":"rad/s"}},{"when":"worst_abs >= 0.02 or worst_drift >= 0.02","label":"imu_bias_drift","severity":"warning","suggestion":"结合故障库 F005：检查 IMU 安装紧固、执行陀螺/加计标定；若温度跨度大，优先按温度漂移解释。","description":"陀螺零偏异常（轴 {worst_axis}：绝对值 {worst_abs:.4f} rad/s，漂移 {worst_drift:.4f} rad/s）","evidence":{"source":"{src_text}","value":"f\"{bias_stat:.4f}\"","threshold":0.02,"unit":"rad/s"}},{"when":"temp_range >= 15","label":"temperature_change_large","severity":"guard","description":"Data quality: temperature_change_large","evidence":{"source":""}}],"firmware":"any","vehicle":"any","armed":true,"status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"imu","docurl":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"},{"id":"px4-imu-clipping","name":"加速度计削波","group":"vibration","order":3,"tag":"high_vibration","compute":["clip, clip_idx, clip_axis = worst_column_delta(\n  _ref(\"vehicle_imu_status[:].accel_clipping\", alias=\"clipping\"))","clip_stat = clip if clip > 0 else None"],"output":[{"name":"imuAccelClippingCountMax","value":"clip_stat"}],"trigger":[{"when":"clip >= 1000","severity":"critical","suggestion":"持续削波会破坏 EKF 估计，请优先排除机械振动源。","description":"加速度计削波严重：IMU #{clip_idx} 轴 {clip_axis} 全日志累计削波 {clip} 次（理想值为 0）","evidence":{"source":"vehicle_imu_status.accel_clipping[{clip_axis}](末值-首值)","value":"clip","threshold":1000,"unit":"count"}},{"when":"clip >= 100","severity":"warning","suggestion":"削波表明振动峰值已超出传感器量程，建议排查机械振动源。","description":"检测到明显加速度计削波：IMU #{clip_idx} 轴 {clip_axis} 全日志累计削波 {clip} 次（理想值为 0）","evidence":{"source":"vehicle_imu_status.accel_clipping[{clip_axis}](末值-首值)","value":"clip","threshold":100,"unit":"count"}},{"when":"clip > 0","label":null,"severity":"info","suggestion":"少量削波可先观察；频次升高或伴随振动告警需排查机械问题。","description":"偶发加速度计削波：IMU #{clip_idx} 轴 {clip_axis} 全日志累计削波 {clip} 次（理想值为 0）","evidence":{"source":"vehicle_imu_status.accel_clipping[{clip_axis}](末值-首值)","value":"clip","threshold":0,"unit":"count"}}],"firmware":"any","vehicle":"any","message":[["vehicle_imu_status"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"vibration","docurl":"https://docs.px4.io/main/en/assembly/vibration_isolation.html"},{"id":"px4-log-errors","name":"日志错误消息","group":"logged_messages","order":1,"version":"1.0.1","compute":["n = count_items(MESSAGES, key=\"level_name\", in_list=[\"EMERGENCY\", \"ALERT\", \"CRITICAL\", \"ERROR\"])","samples = take_items(MESSAGES, key=\"level_name\", in_list=[\"EMERGENCY\", \"ALERT\", \"CRITICAL\", \"ERROR\"], limit=5, clip={\"message\": 200}, drop=[\"level\", \"level_name\"])"],"trigger":[{"when":"n > 0","label":null,"severity":"critical","suggestion":"按时间顺序核对错误原文，这通常是定位根因最直接的证据。","evidence_extra":{"samples":"samples"},"description":"日志中出现 {n} 条 ERROR 及以上消息","evidence":{"source":"ulog.logged_messages(log_level<=3)","value":"n","threshold":0,"unit":"条"}}],"firmware":"any","vehicle":"any","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"messages","docurl":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},{"id":"px4-log-warnings","name":"日志警告消息","group":"logged_messages","order":2,"version":"1.0.1","compute":["n = count_items(MESSAGES, key=\"level_name\", eq=\"WARNING\")","samples = take_items(MESSAGES, key=\"level_name\", eq=\"WARNING\", limit=5, clip={\"message\": 200}, drop=[\"level\", \"level_name\"])"],"trigger":[{"when":"n > 0","label":null,"severity":"warning","evidence_extra":{"samples":"samples"},"description":"日志中出现 {n} 条 WARNING 消息","evidence":{"source":"ulog.logged_messages(log_level=4)","value":"n","threshold":0,"unit":"条"}}],"firmware":"any","vehicle":"any","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"messages","docurl":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},{"id":"px4-mode-thrash","name":"飞行模式抖动","group":"mode_thrash","order":1,"compute":["n_changes = edges_count(vehicle_status.nav_state)"],"output":[{"name":"navStateChanges","value":"n_changes"}],"trigger":[{"when":"n_changes > 12","label":null,"severity":"warning","suggestion":"频繁切模式易诱发操纵混乱；检查遥控器开关与失效保护反复触发。","description":"飞行模式切换 {n_changes} 次（>12），可能存在模式抖动","evidence":{"source":"vehicle_status.nav_state 变化次数","value":"n_changes","threshold":12,"unit":"次"}}],"firmware":"any","vehicle":"any","message":[["vehicle_status"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"mode","docurl":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},{"id":"px4-motor-unbalance","name":"电机输出不平衡","group":"motor_balance","order":1,"tag":"motor_output_unbalance","version":"1.1.0","compute":["mts = actuator_motors.timestamp","cols = actuator_motors.control","seg = active_window_mask(mts, ARMED_INTERVALS, vehicle_status.nav_state, vehicle_status.timestamp, codes=[2, 4, 6, 14, 21], min_active=20)","spread, busiest, idlest, n_active = column_spread_stats( cols, seg, min_mean=0.01, min_channels=4)"],"output":[{"name":"motorControlSpread","value":"spread","round":3},{"name":"motorCountActive","value":"n_active"}],"trigger":[{"when":"spread >= 0.15","label":"motor_output_unbalance","severity":"critical","suggestion":"结合故障库 F008：检查桨叶型号/正反桨是否一致、单电机效率、机架形变。","description":"电机输出不平衡（悬停段通道 {busiest} 与 {idlest} 差 {spread:.3f}）","evidence":{"source":"actuator_motors.control[](悬停段均值极差)","value":"f\"{spread:.3f}\"","threshold":0.15}},{"when":"spread >= 0.08","label":"motor_output_unbalance","severity":"warning","suggestion":"结合故障库 F008 排查动力一致性；偶发差异可先观察。","description":"电机输出差异偏大（通道 {busiest} 与 {idlest} 差 {spread:.3f}）","evidence":{"source":"actuator_motors.control[](悬停段均值极差)","value":"f\"{spread:.3f}\"","threshold":0.08}}],"firmware":"any","vehicle":"any","message":[["actuator_motors"]],"status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"motor","docurl":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},{"id":"px4-power-cell-voltage","name":"单电芯电压","group":"battery","order":1,"tag":"battery_voltage_drop","version":"1.1.0","compute":["vmin, cell_min, cells, have_measured, have_fallback, no_cell = _try(cell_voltage_min( battery_status.voltage_cell_v, battery_status.voltage_v, battery_status.voltage_filtered_v, battery_status.cell_count))"],"output":[{"name":"batteryVoltageMin","value":"vmin","round":2},{"name":"batteryCellCount","value":"cells"},{"name":"batteryCellVoltageMin","value":"cell_min","round":3}],"trigger":[{"when":"have_measured and cell_min < 3.55","severity":"critical","suggestion":"存在过放风险，检查电池老化、放电倍率匹配与低压告警阈值。","description":"电芯电压严重过低","evidence":{"source":"battery_status.voltage_cell_v[](实测最小值)","value":"f\"{cell_min:.3f}\"","threshold":3.55,"unit":"V/cell"}},{"when":"have_fallback and not have_measured and cell_min < 3.55","severity":"critical","suggestion":"存在过放风险，检查电池老化、放电倍率匹配与低压告警阈值。","description":"电芯电压严重过低","evidence":{"source":"battery_status.voltage_v(min)/cell_count","value":"f\"{cell_min:.3f}\"","threshold":3.55,"unit":"V/cell"}},{"when":"have_measured and cell_min < 3.70","severity":"warning","suggestion":"建议核对剩余容量估计与返航电压裕度。","description":"电芯电压偏低","evidence":{"source":"battery_status.voltage_cell_v[](实测最小值)","value":"f\"{cell_min:.3f}\"","threshold":3.7,"unit":"V/cell"}},{"when":"have_fallback and not have_measured and cell_min < 3.70","severity":"warning","suggestion":"建议核对剩余容量估计与返航电压裕度。","description":"电芯电压偏低","evidence":{"source":"battery_status.voltage_v(min)/cell_count","value":"f\"{cell_min:.3f}\"","threshold":3.7,"unit":"V/cell"}},{"when":"no_cell","label":null,"severity":"info","description":"日志缺少电芯电压与 cell_count，未做单电芯判断","evidence":{"source":"battery_status.voltage_cell_v / cell_count","value":"f\"missing\""}}],"firmware":"any","vehicle":"any","message":[["battery_status"]],"status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"power","docurl":"https://docs.px4.io/main/en/config/battery.html"},{"id":"px4-power-remaining","name":"电池剩余电量","group":"battery","order":3,"tag":"battery_voltage_drop","compute":["rem = min_ge(battery_status.remaining, ge=0)","rem_pct = rem * 100"],"output":[{"name":"batteryRemainingMin","value":"rem","round":3}],"trigger":[{"when":"rem <= 0.10","severity":"critical","suggestion":"剩余电量低于 10%，应立即返航；检查电量估算与电池健康。","description":"电池剩余电量极低（{rem_pct:.0f}%）","evidence":{"source":"battery_status.remaining(min)","value":"f\"{rem:.3f}\"","threshold":0.1}},{"when":"rem <= 0.20","severity":"warning","suggestion":"剩余电量低于 20%，注意返航裕度。","description":"电池剩余电量偏低（{rem_pct:.0f}%）","evidence":{"source":"battery_status.remaining(min)","value":"f\"{rem:.3f}\"","threshold":0.2}}],"firmware":"any","vehicle":"any","message":[["battery_status"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"power","docurl":"https://docs.px4.io/main/en/config/battery.html"},{"id":"px4-power-sag","name":"飞行中持续压降","group":"battery","order":2,"tag":"battery_voltage_drop","compute":["cell_min_t = rows_aggregate(battery_status.voltage_cell_v, agg=\"min\", gt=0)","drop, tail = head_tail_median_drop(cell_min_t, battery_status.timestamp, ARMED_INTERVALS, skip_first_s=5, min_seg=20)"],"output":[{"name":"batteryCellSagFlight","value":"drop","round":3}],"trigger":[{"when":"drop >= 0.30 and tail < 3.70","severity":"warning","suggestion":"持续压降区别于大机动瞬时压降：排查电芯老化内阻、插头虚接、线缆线径与负载匹配。","description":"飞行中单电芯持续压降 {drop:.2f} V（尾段中位 {tail:.2f} V）","evidence":{"source":"battery_status.voltage_cell_v[] armed 段趋势","value":"f\"{drop:.3f}\"","threshold":0.3,"unit":"V"}}],"firmware":"any","vehicle":"any","message":[["battery_status"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"power","docurl":"https://docs.px4.io/main/en/config/battery.html"},{"id":"px4-vibration","name":"高频振动","group":"vibration","order":1,"tag":"high_vibration","compute":["vibe_mean, vibe_p95, vibe_max, imu_idx = worst_mean_stats(\n  _ref(\"vehicle_imu_status[:].accel_vibration_metric\"), min_mean=0)"],"output":[{"name":"imuAccelVibrationMean","value":"vibe_mean","round":3},{"name":"imuAccelVibrationP95","value":"vibe_p95","round":3},{"name":"imuAccelVibrationMax","value":"vibe_max","round":3}],"trigger":[{"when":"vibe_mean >= 9.81","severity":"critical","suggestion":"Flight Review 红色区间（>9.81 m/s^2）。结合故障库条目排查桨叶/电机/机架/减震。","description":"高频振动严重超标（IMU #{imu_idx}）","evidence":{"source":"vehicle_imu_status.accel_vibration_metric(均值)","value":"f\"{vibe_mean:.3f}\"","threshold":9.81,"unit":"m/s^2"}},{"when":"vibe_mean >= 4.905","severity":"warning","suggestion":"Flight Review 橙色区间（4.905~9.81 m/s^2）。结合故障库条目排查桨叶动平衡/电机/IMU 减震。","description":"高频振动偏大（IMU #{imu_idx}）","evidence":{"source":"vehicle_imu_status.accel_vibration_metric(均值)","value":"f\"{vibe_mean:.3f}\"","threshold":4.905,"unit":"m/s^2"}}],"firmware":"any","vehicle":"any","message":[["vehicle_imu_status"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"vibration","docurl":"https://docs.px4.io/main/en/assembly/vibration_isolation.html"},{"id":"px4-vtol-transition-attitude","name":"VTOL 转换姿态越限","group":"vtol_transition","order":1,"tag":"vtol_convert_attitude_over","compute":["trans_n = _try(np.sum(vtol_vehicle_status.vtol_in_trans_mode > 0))","trans_mask = _try(fill_to(_ref(\"vtol_vehicle_status.vtol_in_trans_mode\"), _ref(\"vtol_vehicle_status.timestamp\"), _ref(\"vehicle_attitude.timestamp\")))","roll, pitch, yaw = _try(quat_to_euler(_ref(\"vehicle_attitude.q\")))","tilt_max = _try(masked_absmax(np.maximum(abs(roll), abs(pitch)), trans_mask))","trans_cnt = _try(sum(trans_mask))","enough = _try(trans_cnt > 5)","has_tilt = tilt_max is not None","tilt_stat = _try(tilt_max if enough else None)"],"output":[{"name":"vtolTransitionSamples","value":"trans_n"},{"name":"vtolTransitionMaxTiltDeg","value":"tilt_stat","round":1}],"trigger":[{"when":"has_tilt and enough and tilt_max > 8.0","label":"vtol_convert_attitude_over","severity":"warning","suggestion":"结合故障库 F003：复盘转换时序与推力匹配，强风环境优先归因环境扰动。","description":"VTOL 转换阶段姿态越限（最大 {tilt_max:.1f}°，限值 8°）","evidence":{"source":"vehicle_attitude（vtol_in_trans_mode 段）","value":"f\"{tilt_max:.1f}\"","threshold":8,"unit":"°"}}],"firmware":"any","vehicle":"any","message":[["vtol_vehicle_status"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"vtol","docurl":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},{"id":"px4-wind-estimate","name":"风扰估计","group":"wind_estimate","order":1,"tag":"wind_disturb","compute":["w_p95 = percentile(\n  np.hypot(coalesce(estimator_wind.windspeed_north,\n                 wind_estimate.windspeed_north),\n        coalesce(estimator_wind.windspeed_east,\n                 wind_estimate.windspeed_east)),\n  p=95)"],"output":[{"name":"windSpeedP95M","value":"w_p95","round":1}],"trigger":[{"when":"w_p95 >= 12.0","label":"wind_disturb","severity":"warning","suggestion":"结合故障库 F010：强风属环境扰动，姿态超调/转换越限优先归因风，不要直接改 PID。","description":"估计风速较大（p95 {w_p95:.1f} m/s）","evidence":{"source":"estimator_wind.windspeed_north/east","value":"f\"{w_p95:.1f}\"","threshold":8,"unit":"m/s"}},{"when":"w_p95 >= 8.0","label":"wind_disturb","severity":"info","suggestion":"解释姿态类异常时需考虑风扰因素。","description":"估计风速偏大（p95 {w_p95:.1f} m/s）","evidence":{"source":"estimator_wind.windspeed_north/east","value":"f\"{w_p95:.1f}\"","threshold":8,"unit":"m/s"}},{"when":"w_p95 >= 8.0","label":"wind_strong","severity":"guard","description":"Data quality: wind_strong","evidence":{"source":""}}],"firmware":"any","vehicle":"any","message":[["estimator_wind","wind_estimate"]],"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"},"category":"wind","docurl":"https://docs.px4.io/main/en/log/flight_log_analysis.html"}]};
const facts = {"ardupilot-bin":{"group_order":["guards_early","integrity","events","ekf_variance","vibration","battery","gps_health","compass","attitude_tracking","motor_balance","rc_input","timing","config_safety","calibration","sensor_health","prearm_messages","param_audit","guards"],"rule_meta":{"defaults":{"version":"0.1.0","status":"draft","license":"MIT","author":{"name":"NextPilot 内置（源自 ardupilot-mcp，见 ATTRIBUTION.md）"}},"by_group":{"integrity":{"category":"integrity","doc":"https://ardupilot.org/copter/docs/common-diagnosing-problems-using-logs.html"},"events":{"category":"events","doc":"https://ardupilot.org/copter/docs/common-diagnosing-problems-using-logs.html"},"ekf_variance":{"category":"ekf","doc":"https://ardupilot.org/copter/docs/ekf-inav-failsafe.html"},"vibration":{"category":"vibration","doc":"https://ardupilot.org/copter/docs/common-measuring-vibration.html"},"battery":{"category":"power","doc":"https://ardupilot.org/copter/docs/failsafe-battery.html"},"gps_health":{"category":"gps","doc":"https://ardupilot.org/copter/docs/gps-failsafe-glitch-protection.html"},"compass":{"category":"compass","doc":"https://ardupilot.org/copter/docs/common-compass-setup-advanced.html"},"attitude_tracking":{"category":"attitude","doc":"https://ardupilot.org/copter/docs/common-tuning.html"},"motor_balance":{"category":"motor","doc":"https://ardupilot.org/copter/docs/thrust_loss_yaw_imbalance.html"},"rc_input":{"category":"rc","doc":"https://ardupilot.org/copter/docs/radio-failsafe.html"},"timing":{"category":"system","doc":"https://ardupilot.org/copter/docs/common-diagnosing-problems-using-logs.html"},"config_safety":{"category":"config","doc":"https://ardupilot.org/copter/docs/common-prearm-safety-checks.html"},"calibration":{"category":"calibration","doc":"https://ardupilot.org/copter/docs/common-compass-calibration-in-mission-planner.html"},"sensor_health":{"category":"sensors","doc":"https://ardupilot.org/copter/docs/common-prearm-safety-checks.html"},"prearm_messages":{"category":"config","doc":"https://ardupilot.org/copter/docs/common-prearm-safety-checks.html"},"param_audit":{"category":"config","doc":"https://ardupilot.org/copter/docs/parameters.html"},"guards_early":{"category":"guard"},"guards":{"category":"guard"}}},"log_levels":{"3":"ERROR","4":"WARNING","6":"INFO"},"vehicle_types":["copter","plane","rover","quad","hexa","octa","tri","coax","y6","heli","heli_dual","octa_quad","single","dodeca","deca","undefined","unknown"],"flight_modes":{"0":"STABILIZE","1":"ACRO","2":"ALT_HOLD","3":"AUTO","4":"GUIDED","5":"LOITER","6":"RTL","7":"CIRCLE","9":"LAND","11":"DRIFT","13":"SPORT","14":"FLIP","15":"AUTOTUNE","16":"POSHOLD","17":"BRAKE","18":"THROW","19":"AVOID_ADSB","20":"GUIDED_NOGPS","21":"SMART_RTL","22":"FLOWHOLD","23":"FOLLOW","24":"ZIGZAG","25":"SYSTEMID","26":"AUTOROTATE","27":"AUTO_RTL"},"err_subsystems":{"1":"MAIN","2":"RADIO","3":"COMPASS","4":"OPTFLOW","5":"FAILSAFE_RADIO","6":"FAILSAFE_BATT","7":"FAILSAFE_GPS","8":"FAILSAFE_GCS","9":"FAILSAFE_FENCE","10":"FLIGHT_MODE","11":"GPS","12":"CRASH_CHECK","13":"FLIP","14":"AUTOTUNE","15":"PARACHUTE","16":"EKFCHECK","17":"FAILSAFE_EKFINAV","18":"BARO","19":"CPU","20":"FAILSAFE_ADSB","21":"TERRAIN","22":"NAVIGATION","23":"FAILSAFE_TERRAIN","24":"EKF_PRIMARY","25":"THRUST_LOSS_CHECK","26":"FAILSAFE_SENSORS","27":"FAILSAFE_LEAK","28":"PILOT_INPUT","29":"FAILSAFE_VIBE","30":"INTERNAL_ERROR","31":"FAILSAFE_DEADRECKON"},"critical_err_subsystems":[5,6,7,9,12,16,17,25,29,30],"ev_ids":{"10":"ARMED","11":"DISARMED","15":"AUTO_ARMED","17":"LAND_COMPLETE_MAYBE","18":"LAND_COMPLETE","19":"LOST_GPS","21":"FLIP_START","22":"FLIP_END","25":"SET_HOME","26":"SET_SIMPLE_ON","27":"SET_SIMPLE_OFF","28":"NOT_LANDED","29":"SET_SUPERSIMPLE_ON","30":"AUTOTUNE_INITIALISED","31":"AUTOTUNE_OFF","33":"AUTOTUNE_SUCCESS","34":"AUTOTUNE_FAILED","41":"FENCE_ENABLE","42":"FENCE_DISABLE","49":"PARACHUTE_DISABLED","51":"PARACHUTE_RELEASED","54":"MOTORS_EMERGENCY_STOPPED","58":"ROTOR_RUNUP_COMPLETE","59":"ROTOR_SPEED_BELOW_CRITICAL","60":"EKF_ALT_RESET","61":"LAND_CANCELLED_BY_PILOT","62":"EKF_YAW_RESET","67":"GPS_PRIMARY_CHANGED","71":"ZIGZAG_STORE_A","80":"FENCE_FLOOR_ENABLE"},"frame_classes":{"1":{"name":"Quad","lift_motors":4},"2":{"name":"Hexa","lift_motors":6},"3":{"name":"Octo","lift_motors":8},"4":{"name":"OctoQuad","lift_motors":8},"5":{"name":"Y6","lift_motors":6},"6":{"name":"Heli","lift_motors":null},"7":{"name":"Tri","lift_motors":3},"8":{"name":"Single","lift_motors":1},"9":{"name":"Coax","lift_motors":2},"10":{"name":"BiCopter","lift_motors":2},"11":{"name":"Heli_Dual","lift_motors":null},"12":{"name":"DodecaHexa","lift_motors":12},"13":{"name":"HeliQuad","lift_motors":null},"14":{"name":"Deca","lift_motors":10}},"heli_frame_classes":[6,11,13],"frame_types":{"0":"Plus","1":"X","2":"V","3":"H","4":"V-Tail","5":"A-Tail","10":"Y6B","11":"Y6F","12":"BetaFlightX","13":"DJIX","14":"ClockwiseX","15":"I","18":"BetaFlightXReversed","19":"Y4"},"vehicle_prefix_map":{"ArduCopter":"ArduCopter","APM:Copter":"ArduCopter","ArduPlane":"ArduPlane","APM:Plane":"ArduPlane","ArduRover":"Rover","APM:Rover":"Rover","Rover":"Rover","ArduSub":"ArduSub","APM:Sub":"ArduSub","Blimp":"Blimp","AntennaTracker":"AntennaTracker","APM:Tracker":"AntennaTracker"},"field_units":{"VIBE":{"VibeX":"m/s^2","VibeY":"m/s^2","VibeZ":"m/s^2","Clip0":"次","Clip1":"次","Clip2":"次"},"MAG":{"MagX":"mGauss","MagY":"mGauss","MagZ":"mGauss","Health":"0/1"},"ATT":{"DesRoll":"deg","Roll":"deg","DesPitch":"deg","Pitch":"deg","DesYaw":"deg","Yaw":"deg","ErrRP":"deg","ErrYaw":"deg"},"BAT":{"Volt":"V","Curr":"A","CurrTot":"mAh","EnrgTot":"Wh","Temp":"degC","Res":"ohm"},"CURR":{"Volt":"V","Curr":"A","CurrTot":"mAh"},"GPS":{"Status":"枚举","NSats":"颗","HDop":""},"RCOU":{"C1":"us","C2":"us","C3":"us","C4":"us","C5":"us","C6":"us","C7":"us","C8":"us"},"RCIN":{"C1":"us","C2":"us","C3":"us","C4":"us"},"PM":{"NLon":"次","NLoop":"次","MaxT":"us"},"XKF4":{"SV":"","SP":"","SH":"","SM":""},"NKF4":{"SV":"","SP":"","SH":"","SM":""},"ERR":{"Subsys":"枚举","ECode":"枚举"},"EV":{"Id":"枚举"}},"doc_urls":{"log_diagnosis_general":"https://ardupilot.org/copter/docs/common-diagnosing-problems-using-logs.html","vibration":"https://ardupilot.org/copter/docs/common-measuring-vibration.html","vibration_damping":"https://ardupilot.org/copter/docs/common-vibration-damping.html","ekf_failsafe":"https://ardupilot.org/copter/docs/ekf-inav-failsafe.html","ekf_overview":"https://ardupilot.org/copter/docs/common-apm-navigation-extended-kalman-filter-overview.html","gps_failsafe":"https://ardupilot.org/copter/docs/gps-failsafe-glitch-protection.html","compass_calibration":"https://ardupilot.org/copter/docs/common-compass-calibration-in-mission-planner.html","compass_interference":"https://ardupilot.org/copter/docs/common-compass-setup-advanced.html","battery_failsafe":"https://ardupilot.org/copter/docs/failsafe-battery.html","power_monitor":"https://ardupilot.org/copter/docs/common-powermodule-landingpage.html","radio_failsafe":"https://ardupilot.org/copter/docs/radio-failsafe.html","tuning":"https://ardupilot.org/copter/docs/common-tuning.html","tuning_process":"https://ardupilot.org/copter/docs/tuning-process-instructions.html","autotune":"https://ardupilot.org/copter/docs/autotune.html","harmonic_notch":"https://ardupilot.org/copter/docs/common-imu-notch-filtering.html","prearm_checks":"https://ardupilot.org/copter/docs/common-prearm-safety-checks.html","esc_calibration":"https://ardupilot.org/copter/docs/esc-calibration.html","thrust_loss":"https://ardupilot.org/copter/docs/thrust_loss_yaw_imbalance.html","motor_order":"https://ardupilot.org/copter/docs/connect-escs-and-motors.html","parameters_reference":"https://ardupilot.org/copter/docs/parameters.html"},"metrics":[{"key":"vibrationMaxX","label":"最大振动(X)","unit":"m/s^2","topic":"VIBE","field":"VibeX","op":"max","round":2},{"key":"vibrationMaxY","label":"最大振动(Y)","unit":"m/s^2","topic":"VIBE","field":"VibeY","op":"max","round":2},{"key":"vibrationMaxZ","label":"最大振动(Z)","unit":"m/s^2","topic":"VIBE","field":"VibeZ","op":"max","round":2},{"key":"accelClip0","label":"削波累计(IMU0)","unit":"次","topic":"VIBE","field":"Clip0","op":"range_of","round":0},{"key":"accelClip1","label":"削波累计(IMU1)","unit":"次","topic":"VIBE","field":"Clip1","op":"range_of","round":0},{"key":"accelClip2","label":"削波累计(IMU2)","unit":"次","topic":"VIBE","field":"Clip2","op":"range_of","round":0},{"key":"batteryVoltageMin","label":"最低电压(BAT)","unit":"V","topic":"BAT","field":"Volt","op":"min","round":2},{"key":"batteryVoltageMinLegacy","label":"最低电压(CURR)","unit":"V","topic":"CURR","field":"Volt","op":"min","round":2},{"key":"currentMax","label":"最大电流","unit":"A","topic":"BAT","field":"Curr","op":"max","round":2},{"key":"gpsSatellitesMin","label":"最少搜星","unit":"颗","topic":"GPS","field":"NSats","op":"min","round":0},{"key":"gpsHdopMax","label":"最大 HDOP","unit":"","topic":"GPS","field":"HDop","op":"max","round":2},{"key":"ekfVarianceMax","label":"EKF 最大检验比(XKF4)","unit":"","topic":"XKF4","field":"SV","op":"max","round":3},{"key":"ekfVarianceMaxLegacy","label":"EKF 最大检验比(NKF4)","unit":"","topic":"NKF4","field":"SV","op":"max","round":3},{"key":"longLoopCount","label":"长循环数","unit":"次","topic":"PM","field":"NLon","op":"max","round":0}],"track":{}},"px4-ulog":{"group_order":["guards_early","vibration","ekf_innovations","ekf_faults","battery","cpu","gps_health","failsafe","mode_thrash","motor_balance","imu_bias","attitude_tracking","airspeed","vtol_transition","wind_estimate","logged_messages","guards"],"rule_meta":{"defaults":{"version":"1.0.0","status":"stable","license":"CC-BY-4.0","author":{"name":"NextPilot 内置"}},"by_group":{"airspeed":{"category":"airspeed","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"attitude_tracking":{"category":"attitude","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"battery":{"category":"power","doc":"https://docs.px4.io/main/en/config/battery.html"},"cpu":{"category":"system","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"ekf_faults":{"category":"ekf","doc":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"},"ekf_innovations":{"category":"ekf","doc":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"},"failsafe":{"category":"failsafe","doc":"https://docs.px4.io/main/en/config/safety.html"},"gps_health":{"category":"gps","doc":"https://docs.px4.io/main/en/gps_compass/"},"guards":{"category":"guard"},"guards_early":{"category":"guard"},"imu_bias":{"category":"imu","doc":"https://docs.px4.io/main/en/advanced_config/tuning_the_ecl_ekf.html"},"logged_messages":{"category":"messages","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"mode_thrash":{"category":"mode","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"motor_balance":{"category":"motor","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"vibration":{"category":"vibration","doc":"https://docs.px4.io/main/en/assembly/vibration_isolation.html"},"vtol_transition":{"category":"vtol","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"},"wind_estimate":{"category":"wind","doc":"https://docs.px4.io/main/en/log/flight_log_analysis.html"}}},"log_levels":{"48":"EMERGENCY","49":"ALERT","50":"CRITICAL","51":"ERROR","52":"WARNING","53":"NOTICE","54":"INFO","55":"DEBUG"},"vehicle_types":{"1":"rotary_wing","2":"fixed_wing","3":"rover","4":"airship"},"vehicle_aliases":{"mc":"rotary_wing","fw":"fixed_wing"},"nav_state_names":{"0":"Manual","1":"Altitude","2":"Position","3":"Mission","4":"Hold","5":"Return","6":"Position Slow","7":"Free5","8":"Free4","10":"Acro","11":"Free3","12":"Descend","13":"Termination","14":"Offboard","15":"Stabilized","16":"Free2","17":"Takeoff","18":"Land","19":"Free1","20":"Follow","21":"Orbit","22":"VTOL Takeoff"},"nav_state_groups":[{"phase":"takeoff","codes":[17,22]},{"phase":"hover","codes":[2,4,6,14,21]},{"phase":"maneuver","codes":[0,1,10,15]},{"phase":"fw_cruise","codes":[3,8]},{"phase":"landing","codes":[18,20,5,12,13]}],"sys_info_keys":["sys_name","ver_sw","ver_sw_release","ver_vendor_sw_release","ver_hw","ver_hw_subtype","sys_os_name","sys_os_ver","sys_toolchain","sys_toolchain_ver","sys_mcu","time_start_utc","duration","git_branch"],"ulog_msg_types":[{"code":"B","name":"标志位","en":"Flag Bits","desc":"兼容性标志，只在文件开头出现"},{"code":"I","name":"信息","en":"Information","desc":"键 → 值，系统信息字典"},{"code":"M","name":"多值信息","en":"Multi Information","desc":"键 → 多组值，无时间戳（一条长消息会拆成多行续写，故条数多于键数）"},{"code":"F","name":"消息格式","en":"Format","desc":"每个订阅话题的字段定义"},{"code":"P","name":"参数","en":"Parameter","desc":"日志开头的参数值；飞行中改参数也用它"},{"code":"Q","name":"参数默认值","en":"Default Parameter","desc":"只记与当前值不同的默认值（一个参数可能写两条）"},{"code":"A","name":"订阅话题","en":"Add Logged","desc":"每个话题实例一条"},{"code":"R","name":"取消订阅","en":"Remove Logged","desc":"运行中停止记录某话题"},{"code":"D","name":"数据","en":"Data","desc":"日志主体：订阅话题的每一次采样"},{"code":"L","name":"日志消息","en":"Logging","desc":"带时间戳的日志行"},{"code":"C","name":"带标签日志消息","en":"Tagged Logging","desc":"同上，另有来源 tag"},{"code":"O","name":"丢包","en":"Dropout","desc":"记录线程来不及时丢掉的时长"},{"code":"S","name":"同步标记","en":"Sync","desc":"每约 4 KB 一个，损坏后靠它重新对齐"}],"info_key_docs":{"ver_sw":{"name":"固件提交号","desc":"固件构建时的 git 提交，用来对上游源码"},"ver_sw_branch":{"name":"固件分支","desc":"构建所在的分支 / 标签"},"ver_sw_release":{"name":"固件版本号","desc":"打包成 major<<24 | minor<<16 | patch<<8 | 类型（1=release 等）"},"ver_vendor_sw_release":{"name":"厂商版本号","desc":"厂商自定义版本；255 表示厂商未使用"},"ver_hw":{"name":"硬件型号","desc":"飞控板型号，判断引脚 / 传感器配置的入口"},"ver_hw_subtype":{"name":"硬件子型号","desc":"同型号的不同批次 / 变体"},"ver_data_format":{"name":"数据格式版本","desc":"ULog 数据格式版本，与本站解析器看到的格式对应"},"sys_name":{"name":"系统名","desc":"固定为 PX4"},"sys_os_name":{"name":"操作系统","desc":"NuttX（飞控本机）或 Linux（机载计算机）"},"sys_os_ver":{"name":"OS 提交号","desc":"操作系统的 git 提交"},"sys_os_ver_release":{"name":"OS 版本号","desc":"打包方式同固件版本号"},"sys_toolchain":{"name":"工具链","desc":"编译固件用的工具链"},"sys_toolchain_ver":{"name":"工具链版本","desc":"工具链的具体版本，排查\"换个编译器行为就不一样\"时用"},"sys_mcu":{"name":"MCU","desc":"主控芯片型号与硅版本"},"sys_uuid":{"name":"飞控唯一 ID","desc":"PX4GUID，出厂烧录；同型号不同板子也不同，可用来区分设备"},"time_ref_utc":{"name":"UTC 时间参考","desc":"相对启动的偏移（秒）；0 表示这次飞行没对时"},"time_start_utc":{"name":"起始 UTC 时间","desc":"日志起始时刻（旧固件记录）"},"boot_time_utc_us":{"name":"启动时刻","desc":"UTC 微秒；只有对过时才有意义"},"duration":{"name":"日志时长","desc":"秒（旧固件记录）"},"git_branch":{"name":"固件分支","desc":"旧固件的分支名字段"},"metadata_events_sha256":{"name":"事件元数据哈希","desc":"事件定义文件的 SHA-256，用来校验事件定义是否被改动"}},"metrics":[{"key":"imuAccelVibrationMax","label":"最大振动","unit":"m/s²","topic":"vehicle_imu_status","field":"accel_vibration_metric","op":"max","round":2},{"key":"batteryVoltageMin","label":"最低电压","unit":"V","topic":"battery_status","field":"voltage_v","op":"min","round":2},{"key":"batteryCellVoltageMin","label":"最低电芯电压","unit":"V","topic":"battery_status","fields":["voltage_cell_v","voltage_v","voltage_filtered_v","cell_count"],"op":"cell_voltage_min","pick":"vmin","round":3},{"key":"currentMax","label":"最大电流","unit":"A","topic":"battery_status","field":"current_a","op":"max","round":2},{"key":"batteryRemainingMin","label":"最低剩余电量","unit":"0..1","topic":"battery_status","field":"remaining","op":"min_ge","ge":0,"round":3},{"key":"gpsSatellitesMin","label":"最少搜星","unit":"颗","topic":"vehicle_gps_position","field":["satellites_used","satellites_visible"],"op":"min","round":0},{"key":"gpsEphMaxM","label":"最大定位误差","unit":"m","topic":"vehicle_gps_position","field":"eph","op":"max","scale":0.001,"round":2},{"key":"cpuLoadMax","label":"CPU 峰值","unit":"0..1","topic":"cpuload","field":"load","op":"max","round":3},{"key":"imuAccelClippingCountMax","label":"加速度计削波计数","unit":"次"},{"key":"imuTempRangeC","label":"IMU 温度跨度","unit":"°C"},{"key":"ekfRejectRatioPct","label":"EKF 拒绝占比","unit":"比例"},{"key":"attitudeErrDegP99","label":"姿态误差 p99","unit":"°"},{"key":"attitudeOscHz","label":"姿态振荡频率","unit":"Hz"},{"key":"motorControlSpread","label":"电机输出离散度"},{"key":"motorCountActive","label":"活跃电机数","unit":"个"},{"key":"gyroBiasMaxRadS","label":"陀螺零偏最大","unit":"rad/s"},{"key":"gyroBiasDriftRadS","label":"陀螺零偏漂移","unit":"rad/s"},{"key":"windSpeedP95M","label":"风速 p95","unit":"m/s"},{"key":"airspeedMinM","label":"最低空速","unit":"m/s"},{"key":"airspeedInvalidRatio","label":"空速无效占比","unit":"比例"},{"key":"gpsJumpCount","label":"GPS 跳变次数","unit":"次"},{"key":"navStateChanges","label":"模式切换次数","unit":"次"},{"key":"vtolTransitionSamples","label":"VTOL 转换样本数","unit":"个"},{"key":"batteryCellCount","label":"电芯数","unit":"个"}],"track":{"container":"map","title":"轨迹","legend":true,"children":[{"label":"gps","max_points":1500,"lat":{"cands":["sensor_gps.latitude_deg","vehicle_gps_position.latitude_deg","vehicle_gps_position.lat"],"unit":"deg"},"lon":{"cands":["sensor_gps.longitude_deg","vehicle_gps_position.longitude_deg","vehicle_gps_position.lon"],"unit":"deg"},"alt":{"cands":["sensor_gps.altitude_msl_m","vehicle_gps_position.altitude_msl_m","vehicle_gps_position.alt"],"unit":"m"},"topics":[["sensor_gps",0],["vehicle_gps_position",0]]}],"conditions":{"topics":[["sensor_gps","vehicle_gps_position"]]}}}};

const fieldUnits = {"ardupilot-bin":{},"px4-ulog":{"sensor_gps.altitude_msl_m":"m","sensor_gps.latitude_deg":"deg","sensor_gps.longitude_deg":"deg","vehicle_gps_position.alt":"mm","vehicle_gps_position.altitude_msl_m":"m","vehicle_gps_position.lat":"degE7","vehicle_gps_position.latitude_deg":"deg","vehicle_gps_position.lon":"degE7","vehicle_gps_position.longitude_deg":"deg"}};

export const PY_ULG_ENGINE = String.raw`"""预定函数（算子）注册表：经验文件里的 \`op:\` 只能引用这里注册的算子。

约定：
- 算子签名用 @operator 声明 in_arity / out_arity / out_names，
  构建期按签名校验规则文件里 in/out 的数量（多输入/多输出不靠约定，靠校验）。
  \`in_arity\` 也可以给列表（如 \`[1, 4]\`），表示同一种运算接受两种写法，
  目前只有 \`quat_to_euler\`（收一组四列，或收 w/x/y/z 四列）这么用。
- 调用形式 fn(*args, **opts)：args 是按 \`in\` 顺序取到的值（numpy 数组或标量），
  opts 是节点上的其他键（unit / instance 等），算子用 **kw 吸收不关心的项。
- 返回：out_arity==1 时返回标量；>1 时返回与 out_names 等长的元组。
- 数据不足时返回 None，框架据此跳过该规则（不产出 finding）。
"""

import numpy as np
from types import SimpleNamespace

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


@operator("std", doc="有限值的标准差（忽略 NaN；ddof 与 numpy 同义，默认 0 即总体标准差）")
def op_std(values, ddof=0, **kw):
    if values is None:
        return None
    a = _finite(values)
    d = int(ddof)
    if a.size <= d:
        return None
    return float(a.std(ddof=d))


@operator("cv", doc="变异系数 std / mean：衡量序列的相对波动（如罗盘场强稳定性）；均值非正时 None")
def op_cv(values, ddof=0, **kw):
    import numpy as np

    m = op_mean(values)
    if m is None or not np.isfinite(m) or float(m) <= 0:
        return None
    s = op_std(values, ddof=ddof)
    return None if s is None else float(s) / float(m)


@operator("median", doc="中位数（第 50 百分位，省掉每次写 p=50）")
def op_median(values, **kw):
    return op_percentile(values, p=50)


@operator("sum", doc="有限值求和（忽略 NaN；无有效值则 None）")
def op_sum(values, **kw):
    if values is None:
        return None
    a = _finite(values)
    return float(a.sum()) if a.size else None


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


def _align_pair(a, b):
    """两个输入对齐成等长序列（标量先升维再截断），缺失返回 None。

    有了它，加减取模这类运算不必区分“标量还是序列”两套写法：两个标量进、两个标量出，
    否则按较短长度逐样本。"""
    import numpy as np

    if a is None or b is None:
        return None
    x = np.atleast_1d(np.asarray(a, dtype=float))
    y = np.atleast_1d(np.asarray(b, dtype=float))
    n = min(x.size, y.size)
    if n == 0:
        return None
    return x[:n], y[:n]


@operator("add", in_arity=2, doc="a + b：两个标量相加得标量，否则按较短长度逐样本相加")
def op_add(a, b, **kw):
    import numpy as np

    if a is None or b is None:
        return None
    if np.asarray(a).ndim == 0 and np.asarray(b).ndim == 0:
        return float(a) + float(b)
    p = _align_pair(a, b)
    return None if p is None else p[0] + p[1]


@operator("sub", in_arity=2, doc="a - b：两个标量相减得标量，否则按较短长度逐样本相减（如实测减期望）")
def op_sub(a, b, **kw):
    import numpy as np

    if a is None or b is None:
        return None
    if np.asarray(a).ndim == 0 and np.asarray(b).ndim == 0:
        return float(a) - float(b)
    p = _align_pair(a, b)
    return None if p is None else p[0] - p[1]


@operator("abs", doc="绝对值：标量进标量出，序列则逐样本（与只吃序列的 abs_values 互补）")
def op_abs(x, **kw):
    import numpy as np

    if x is None:
        return None
    a = np.asarray(x, dtype=float)
    return float(np.abs(a)) if a.ndim == 0 else np.abs(a)


@operator("mod", in_arity=2, doc="取模 a % b：标量或逐样本；b 里出现 0 则 None")
def op_mod(a, b, **kw):
    import numpy as np

    if a is None or b is None:
        return None
    yb = np.asarray(b, dtype=float)
    if np.any(yb == 0):
        return None
    if np.asarray(a).ndim == 0 and yb.ndim == 0:
        return float(a) % float(yb)
    p = _align_pair(a, b)
    return None if p is None else p[0] % p[1]


@operator("len", doc="序列长度：返回数据点数，输入缺失则 None")
def op_len(values, **kw):
    if values is None:
        return None
    import numpy as np

    return len(np.asarray(values))


@operator("int", doc="取整：将标量转为 int，输入缺失则 None")
def op_int(x, **kw):
    if x is None:
        return None
    import numpy as np

    a = np.asarray(x)
    return int(a) if a.ndim == 0 else a.astype(int)


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
    "stack_columns",
    in_arity=[2, 3, 4, 5, 6, 7, 8],
    doc="把 2 到 8 个独立字段拼成矩阵（每字段一列，缺失的列跳过），供 column_spread_stats 等"
    "矩阵算子使用。DataFlash 里 RCOU 的 C1 至 C8 就是八个独立字段而非数组字段，靠它才能进矩阵算子",
)
def op_stack_columns(c1, c2, c3=None, c4=None, c5=None, c6=None, c7=None, c8=None, **kw):
    import numpy as np

    cols = [np.asarray(c, dtype=float) for c in (c1, c2, c3, c4, c5, c6, c7, c8) if c is not None]
    return cols or None


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
    """分组取数（instance=-1）→ 列表，保留 None 占位。

    实例序号（标题里的 “IMU #1”、estimator #2）要与原始 dataset 顺序一致，
    所以这里不能过滤 None，过滤会让后面的实例序号整体前移。
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
            for v in np.asarray(g):  # 不转 float：位掩码要按位精确
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


@operator("diff", doc="相邻后向差分，返回 n-1 个样本（电压逐样本变化量、时间戳间隔等）；n=2 时是二阶差分")
def op_diff(values, n=1, **kw):
    import numpy as np

    if values is None:
        return None
    a = np.asarray(values, dtype=float)
    k = int(n)
    if k < 1 or a.size <= k:
        return None
    return np.diff(a, n=k)


@operator(
    "wrap_degrees",
    doc="角度绕回到 -period/2 到 period/2（默认 ±180 度）：航向误差跨 ±180 度时不会给出约 360 度的假误差",
)
def op_wrap_degrees(values, period=360.0, **kw):
    import numpy as np

    if values is None:
        return None
    p = float(period) if period else 360.0
    if p <= 0:
        return None
    a = np.asarray(values, dtype=float)
    return ((a + p / 2.0) % p) - p / 2.0


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
    '入参是度（口径由规则在 ref(..., unit="deg") 上统一好），算子不认识固件版本、'
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


# 四元数先归一化再转欧拉角：日志里的四元数可能因插值/截断略偏离单位长度，
# 不归一化会放大 atan2 误差。2026-09-17 之前这里有一个同名的第二个定义（不归一化、带
# 一个从未被调用方用过的 degrees 开关）静默覆盖了本实现，两个消费者（plot/attitude.yml
# 的图表换算与 vtol-transition 规则）实际拿到的都是那个不归一化的版本，已删除。
# 教训：OPERATORS[name] = fn 是赋值，算子名重复注册不报错、后者静默胜出；
# 用 ruff 的 F811 在提交前拦住（见仓库根 pyproject.toml）。
@operator(
    "quat_to_euler",
    in_arity=[1, 4],  # 两种写法都认：一个四列数组，或四列分开给
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


def _runs(mask):
    """布尔掩码里连续为真的段：返回 [(i0, i1), ...]，索引含两端。"""
    import numpy as np

    idx = np.nonzero(np.asarray(mask, dtype=bool))[0]
    if idx.size == 0:
        return []
    out = []
    start = prev = int(idx[0])
    for i in idx[1:]:
        i = int(i)
        if i != prev + 1:
            out.append((start, prev))
            start = i
        prev = i
    out.append((start, prev))
    return out


@operator(
    "excursion_events",
    in_arity=3,
    doc="超出阈值的持续段事件（run-length）：mode 取 above / below / abs_above，"
    "min_duration_s 丢掉短于该时长的段；返回 [{start_s, end_s, dur_s, peak, t_peak_s}, ...] 按超出幅度降序，"
    "最多 limit 条（0 表示不限）。ts_us 与 t0_us 同 rising_edge_events：微秒",
)
def op_excursion_events(values, ts_us, t0_us, threshold=0.0, mode="above", min_duration_s=0.0, limit=0, **kw):
    import numpy as np

    if values is None or ts_us is None:
        return None
    v = np.asarray(values, dtype=float)
    ts = np.asarray(ts_us, dtype=np.int64)
    n = min(v.size, ts.size)
    if n < 2:
        return None
    v, ts = v[:n], ts[:n]
    thr = float(threshold or 0.0)
    how = str(mode or "above")
    dev = np.abs(v) if how == "abs_above" else (-v if how == "below" else v)
    cut = -thr if how == "below" else thr
    ok = np.isfinite(dev) & (dev > cut)
    t0 = int(t0_us or 0)
    out = []
    for i0, i1 in _runs(ok):
        dur_s = float(int(ts[i1]) - int(ts[i0])) / 1e6
        if dur_s < float(min_duration_s):
            continue
        seg = v[i0 : i1 + 1]
        if how == "below":
            peak, rel = float(seg.min()), float(seg.min())
        elif how == "abs_above":
            peak, rel = float(np.abs(seg).max()), float(np.abs(seg).max())
        else:
            peak, rel = float(seg.max()), float(seg.max())
        j = i0 + int(np.argmax(np.abs(seg))) if how == "abs_above" else i0 + int(np.argmax(seg))
        if how == "below":
            j = i0 + int(np.argmin(seg))
        out.append(
            {
                "start_s": (int(ts[i0]) - t0) / 1e6,
                "end_s": (int(ts[i1]) - t0) / 1e6,
                "dur_s": dur_s,
                "peak": peak,
                "over": abs(float(rel) - thr),
                "t_peak_s": (int(ts[j]) - t0) / 1e6,
            }
        )
    if not out:
        return None
    out.sort(key=lambda e: (e["over"], e["dur_s"]), reverse=True)
    return out[: int(limit)] if int(limit) > 0 else out


@operator(
    "longest_true_run",
    in_arity=2,
    doc="布尔掩码里连续为真的最长时长（秒）：把「持续了多久」变成一个标量判据。"
    "掩码全假返回 0，那是有结论（从未满足），不是数据缺失",
)
def op_longest_true_run(mask, ts_us, **kw):
    import numpy as np

    if mask is None or ts_us is None:
        return None
    m = np.asarray(mask, dtype=bool)
    ts = np.asarray(ts_us, dtype=np.int64)
    n = min(m.size, ts.size)
    if n < 2:
        return None
    ts = ts[:n]
    best = 0.0
    for i0, i1 in _runs(m[:n]):
        best = max(best, float(int(ts[i1]) - int(ts[i0])) / 1e6)
    return best


@operator(
    "gap_events",
    in_arity=2,
    doc="时间序列的间隙事件：相邻间隔超过阈值即算一处，阈值取 abs_floor_s 与"
    "「名义间隔（正间隔的中位数）× rel_factor」里的较大者；"
    "返回 [{gap_s, start_s, end_s, nominal_dt_s, threshold_s}, ...] 按间隔降序，最多 limit 条",
)
def op_gap_events(ts_us, t0_us, abs_floor_s=0.5, rel_factor=10.0, limit=3, **kw):
    import numpy as np

    if ts_us is None:
        return None
    ts = np.asarray(ts_us, dtype=np.int64)
    if ts.size < 3:
        return None
    dt = np.diff(ts).astype(float) / 1e6
    pos = dt[dt > 0.0]
    if pos.size == 0:
        return None
    nominal = float(np.median(pos))
    if nominal <= 0.0:
        return None
    thr = max(float(abs_floor_s), float(rel_factor) * nominal)
    t0 = int(t0_us or 0)
    out = []
    for i, d in enumerate(dt):
        if d <= thr:
            continue
        out.append(
            {
                "gap_s": float(d),
                "start_s": (int(ts[i]) - t0) / 1e6,
                "end_s": (int(ts[i + 1]) - t0) / 1e6,
                "nominal_dt_s": nominal,
                "threshold_s": thr,
            }
        )
    if not out:
        return None
    out.sort(key=lambda e: e["gap_s"], reverse=True)
    return out[: max(int(limit), 1)]


@operator(
    "step_drop_events",
    in_arity=3,
    doc="相邻样本之间的快速跌落事件：间隔在 0 到 max_dt_s 之间、且跌幅超过 min_drop 才算一处；"
    "每处再判恢复：跌后 recovery_s 秒内若回升到「跌前值 - 跌幅 × recovery_frac」以上，recovered 为真"
    "（瞬时毛刺会自己弹回，真掉电不会）。返回 [{drop, dt_s, start_s, end_s, recovered}, ...] 按跌幅降序，"
    "最多 limit 条（默认 1，只报最严重那处）",
)
def op_step_drop_events(
    values,
    ts_us,
    t0_us,
    min_drop=2.0,
    max_dt_s=0.5,
    recovery_s=1.0,
    recovery_frac=0.5,
    limit=1,
    **kw,
):
    import numpy as np

    if values is None or ts_us is None:
        return None
    v = np.asarray(values, dtype=float)
    ts = np.asarray(ts_us, dtype=np.int64)
    n = min(v.size, ts.size)
    if n < 2:
        return None
    v, ts = v[:n], ts[:n]
    t0 = int(t0_us or 0)
    out = []
    for i in range(1, n):
        dt_s = float(int(ts[i]) - int(ts[i - 1])) / 1e6
        if dt_s <= 0.0 or dt_s >= float(max_dt_s):
            continue
        drop = float(v[i - 1] - v[i])
        if drop <= float(min_drop):
            continue
        end_t = int(ts[i])
        post = (ts > end_t) & (ts <= end_t + float(recovery_s) * 1e6)
        recovered = False
        if bool(np.any(post)):
            seg = v[post]
            seg = seg[np.isfinite(seg)]
            if seg.size and float(seg.max()) >= float(v[i - 1]) - drop * float(recovery_frac):
                recovered = True
        out.append(
            {
                "drop": drop,
                "dt_s": dt_s,
                "start_s": (int(ts[i - 1]) - t0) / 1e6,
                "end_s": (end_t - t0) / 1e6,
                "recovered": recovered,
            }
        )
    if not out:
        return None
    out.sort(key=lambda e: e["drop"], reverse=True)
    return out[: max(int(limit), 1)]


# ─────────────────────────── 结构化条目列表（日志消息等）───────────────────────────


def _item_hit(it, key, eq, lte, gte, in_list, contains=None):
    if not isinstance(it, dict):
        return False
    if eq is None and lte is None and gte is None and in_list is None and contains is None:
        return True  # 无条件 = 全选（可当计数器用）
    v = it.get(key)
    if v is None:
        return False
    if in_list is not None:
        return v in list(in_list)
    if contains is not None:
        # 文本子串匹配：日志消息/参数名没有统一的拼写，故大小写不敏感
        return str(contains).lower() in str(v).lower()
    return (eq is not None and v == eq) or (lte is not None and v <= lte) or (gte is not None and v >= gte)


@operator(
    "count_items",
    doc="条目列表里满足条件的条数：按 key 字段判定，in_list / eq / lte / gte / contains（文本子串，大小写不敏感）",
)
def op_count_items(items, key="level", eq=None, lte=None, gte=None, in_list=None, contains=None, **kw):
    if not items:
        return 0
    return sum(1 for it in items if _item_hit(it, key, eq, lte, gte, in_list, contains))


@operator("take_items", doc="条目列表里满足条件的前 limit 条（drop 可去掉辅助键；clip 可按字段截断文本）")
def op_take_items(
    items,
    key="level",
    eq=None,
    lte=None,
    gte=None,
    in_list=None,
    contains=None,
    limit=5,
    drop=None,
    clip=None,
    **kw,
):
    out = []
    clips = {str(k): int(v) for k, v in dict(clip or {}).items()}
    for it in items or []:
        if not _item_hit(it, key, eq, lte, gte, in_list, contains):
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
    "返回 [{index, mean}, ...]；列长与掩码不一致时退化为前 N 个样本。"
    "mask 传 None 表示不筛时段（整条序列都算，如电机平衡看的是全程均值）",
)
def op_active_column_means(matrix, mask, min_mean=0.01, **kw):
    import numpy as np

    if matrix is None:
        return None
    m = None if mask is None else np.asarray(mask, dtype=bool)
    n_on = 0 if m is None else int(np.count_nonzero(m))
    out = []
    for i, col in enumerate(matrix if isinstance(matrix, (list, tuple)) else [matrix]):
        if col is None:
            continue
        v = np.asarray(col, dtype=float)
        if m is not None:
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


@operator("abs_diff", in_arity=2, doc="逐样本 |a - b|（长度取较短者）；两个标量则得标量")
def op_abs_diff(a, b, **kw):
    import numpy as np

    if a is None or b is None:
        return None
    if np.asarray(a).ndim == 0 and np.asarray(b).ndim == 0:
        return abs(float(a) - float(b))
    p = _align_pair(a, b)
    return None if p is None else np.abs(p[0] - p[1])


@operator("sum_abs", in_arity=2, doc="逐样本 |a| + |b|（长度取较短者）；两个标量则得标量")
def op_sum_abs(a, b, **kw):
    import numpy as np

    if a is None or b is None:
        return None
    if np.asarray(a).ndim == 0 and np.asarray(b).ndim == 0:
        return abs(float(a)) + abs(float(b))
    p = _align_pair(a, b)
    return None if p is None else np.abs(p[0]) + np.abs(p[1])


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
    "误差过零频率（Hz）、参与统计的样本数。指令源有 q_d 就用 q_d（新版只记它），"
    "没有才回退 roll/pitch_body（旧版口径，弧度），算子不认识固件版本，规则把两路都"
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

    # 指令源：有 q_d 就用 q_d（新版只记它），没有才用 roll/pitch_body（旧版口径，弧度）。
    # 两路都给了也优先 q_d，顺序写在算子里，规则只管把存在的递进来。
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
    doc="零偏取源：谁有数据用谁（直读列 → 状态槽 A → 状态槽 B），输入都是「数组字段的多列」"
    "或 None。算子不认识固件版本，挑来源只看数据本身：样本数 >= min_count、且至少一处非零"
    "（字段存在但没被填过的情形：实测 1.11 的直读列只有 7 个样本，状态槽才有值）。"
    "返回 三轴序列 + 时间戳 + 数据来源说明（用于 evidence.field）；全都没有返回 None。"
    "来源说明是展示文案，由调用方用 sources=[直读, 槽A, 槽B] 给出，算子不认识字段名。",
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

        "字段存在但没被填过"有两种表现，都要挡住：整段全零（真实的 0 不可能三轴同时
        恒为 0），以及只有零星几个样本（实测 1.11 的直读列 7 个 vs 状态槽 636 个）。
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
    "column_ratio_events",
    in_arity=[2, 3],
    doc="逐通道统计 大于 threshold 的样本占比，只回传占比不低于 min_frac 的通道："
    "返回 [{channel, frac, mean}, ...] 按占比降序，最多 limit 条，channel 从 1 起算。"
    "可选第三个输入 mask 把统计限制在某段时间；min_mean 可先过滤掉未接/未用的通道",
)
def op_column_ratio_events(matrix, threshold, mask=None, min_frac=0.0, min_mean=0.0, limit=8, **kw):
    import numpy as np

    if threshold is None:
        return None
    cols = _as_columns(matrix)
    if not cols:
        return None
    m = None if mask is None else np.asarray(mask, dtype=bool)
    out = []
    for i, col in enumerate(cols):
        v = np.asarray(col, dtype=float)
        if m is not None:
            v = v[m] if v.size == m.size else v[: int(np.count_nonzero(m))]
        v = v[np.isfinite(v)]
        if not v.size:
            continue
        col_mean = float(np.mean(v))
        if col_mean <= float(min_mean):
            continue
        frac = float(np.count_nonzero(v > float(threshold))) / float(v.size)
        if frac < float(min_frac):
            continue
        out.append({"channel": i + 1, "frac": frac, "mean": float(np.mean(v))})
    if not out:
        return None
    out.sort(key=lambda d: d["frac"], reverse=True)
    return out[: max(int(limit), 1)]


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


# ---- compute 表达式全局名字空间 ----
# 所有注册的算子 + np 数学函数子集。_ref 由引擎补。
COMPUTE_GLOBALS: dict = {"__builtins__": {}}
COMPUTE_GLOBALS.update(OPERATORS)
COMPUTE_GLOBALS["np"] = SimpleNamespace(
    abs=np.abs,
    sum=np.sum,
    mean=np.mean,
    std=np.std,
    median=np.median,
    min=np.min,
    max=np.max,
    ptp=np.ptp,
    percentile=np.percentile,
    diff=np.diff,
    count_nonzero=np.count_nonzero,
    nanmean=np.nanmean,
    nanstd=np.nanstd,
    nanmedian=np.nanmedian,
    nanmin=np.nanmin,
    nanmax=np.nanmax,
    nansum=np.nansum,
    isin=np.isin,
    hypot=np.hypot,
    degrees=np.degrees,
    radians=np.radians,
    arctan2=np.arctan2,
    maximum=np.maximum,
    minimum=np.minimum,
    clip=np.clip,
    sign=np.sign,
    isfinite=np.isfinite,
    asarray=np.asarray,
    where=np.where,
    concatenate=np.concatenate,
)

# 日志适配器（provider）契约：引擎唯一认识的"日志"长相
#
# 为什么是这份常量表，而不是 typing.Protocol：
#   · 构建期不执行 Python（web/scripts/build-knowledge.mjs 只把源码当文本搬运），
#     Pyodide 里也没有 mypy，两端都没有类型检查器，写 Protocol 只是"看着有约束、实际没人管"。
#   · 所以契约做成可执行的：这份表既是文档，也是三道机器检查的输入。
#
# 三道检查（分工是"构建期挡住漏写、运行期挡住类型与缺席、测试挡住语义"）：
#   1. 构建期：web/scripts/build-knowledge.mjs 用 ast 解析 providers/*.py，
#      查 REQUIRED 的方法有没有定义、builtin_variables() 返回的字典字面量键齐不齐
#   2. 运行期：下面的 check_provider()，引擎建好 provider 之后立刻跑一次
#   3. 契约测试：tools/engine/guard_provider_contract.py，对每个 provider 跑同一套断言
#      （失败语义、get_topic_meta() 与 get_series() 自洽、armed_intervals 的形状……）
#
# 加一个适配器（如 ardupilot.py）要做的事：实现 REQUIRED，按需实现 OPTIONAL，
# 把工厂追加进 FORMATS，然后跑通 guard_provider_contract.py，引擎一行都不用改。

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
        "为什么由 provider 给而不是引擎写死：引擎不认识任何一种日志的解析器，"
        "写死就等于把某个格式的名字钉进了格式无关层。"
        "浏览器里解析器版本不受本站控制（PyPI 当时的最新版），所以它要如实记录",
    },
    "get_topic_meta": {
        "kind": "method",
        "sig": "() -> list[dict]",
        "doc": "有哪些消息/话题：[{name, instance, n, fields:[{name, dtype}]}]。"
        "驱动 np_manifest（曲线可用性）与契约测试的自洽校验",
    },
    "get_first_existing_column": {
        "kind": "method",
        "sig": "(topic, names) -> array|None",
        "doc": "只取第一个实例、按候选名取第一个存在的原样列（概览指标兜底取数），取不到返回 None",
    },
    "get_series": {
        "kind": "method",
        "sig": "(ref, instance=slice(None), alias=None)",
        "doc": "按 'topic.field' 取一条序列（1-D 数组 / 每实例一组 / 定长数组按列）。"
        "取不到一律返回 None，不抛异常，引擎按'数据不足'处理",
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
    "get_info_dict": {
        "kind": "method",
        "sig": "() -> (dict, dict)",
        "doc": "日志自带的键值信息：\`(info, info_multi)\` 二元组。"
        "第一样是键值对（PX4 是 Information Message，如 ver_sw），第二样是多值信息（'M' 消息，如多组件版本）。"
        "没有就返回 ({}, {})",
    },
    "get_initial_parameters": {
        "kind": "method",
        "sig": "() -> dict",
        "doc": "初始参数表。没有就返回 {}",
    },
    "builtin_variables": {
        "kind": "method",
        "sig": "() -> dict",
        "doc": "内置变量表，每次调用返回一个新 dict（引擎会往里写 compute 的输出）。键要覆盖下面的 BUILTIN_VARIABLES",
    },
    "get_report_facts": {
        "kind": "method",
        "sig": "() -> dict",
        "doc": "报告头的离散事实：机型 / 固件 / 时长 / 模式 / 载具身份……键名见各 provider",
    },
    # ---- 知识引擎查询 API（docs/develop/engine-api-rework.md 并入契约）----
    # 这组方法就是 provider 的正式名字（2026-09-24 迁移：get_topic_data→get_dataset、
    # get_logged_information→get_info_dict、get_logged_messages→get_logged_events、
    # get_flight_phases→get_mode_changed，旧名一律退场，不搞双轨）。
    # 取不到一律返回 None / [] / {}（不抛异常），与上面同一套失败语义。
    "get_start_timestamp": {
        "kind": "method",
        "sig": "() -> int|None",
        "doc": "日志第一条消息的时间戳（µs，格式各自的时基：PX4 是开机起，APM 是 TimeUS）",
    },
    "get_last_timestamp": {
        "kind": "method",
        "sig": "() -> int|None",
        "doc": "日志最后一条消息的时间戳（µs）",
    },
    "get_time_bounds": {
        "kind": "method",
        "sig": "() -> dict",
        "doc": "时间边界 {start_us, end_us, duration_s, has_wraparound}；has_wraparound=有 topic 时间戳回退（疑似中途重启）",
    },
    "get_dataset": {
        "kind": "method",
        "sig": "(topic, instance=0) -> dict|None",
        "doc": "某个 topic 某实例的原样列 {列名: 数组}（含 'field[0]' 这种数组列）。"
        "报告页抽时序、概览指标兜底取数用它。取不到返回 None（原 get_topic_data 迁移到此名）",
    },
    "get_dataset_description": {
        "kind": "method",
        "sig": "(topic=None) -> dict|None",
        "doc": "消息格式定义 {name: {name, fields:[{name, type}]}}，是格式声明（含这份日志没录到的消息）；topic 给了就只回那一个。取不到返回 None",
    },
    "get_field_dtype": {
        "kind": "method",
        "sig": "(topic, field) -> str|None",
        "doc": "字段的 dtype 名（如 float32 / uint8）。取不到返回 None",
    },
    "get_field_sizeof": {
        "kind": "method",
        "sig": "(topic, field) -> int|None",
        "doc": "字段的单元素字节数（数组字段是每元素的大小，不是整列）。取不到返回 None",
    },
    "get_field_unit": {
        "kind": "method",
        "sig": "(topic, field) -> str|None",
        "doc": "字段的源单位（规范名）。查不到返回 None，单位表只含构建期收录的字段，不许编一个空的糊弄",
    },
    "get_changed_parameters": {
        "kind": "method",
        "sig": "() -> list[dict]",
        "doc": "运行中变更的参数 [{tSec, name, value}]。没有就返回 []",
    },
    "get_home_position": {
        "kind": "method",
        "sig": "() -> dict|None",
        "doc": "Home 点 {lat, lon, alt, ...}。这份日志给不出（没定位）就返回 None",
    },
    "get_ref_position": {
        "kind": "method",
        "sig": "() -> dict|None",
        "doc": "参考原点（局部 NED 原点，与 Home 不是一回事）{lat, lon, alt}。给不出返回 None",
    },
    "get_logged_events": {
        "kind": "method",
        "sig": "(t_start=None, t_end=None, level=None, pattern=None) -> list[dict]",
        "doc": "[{tSec, message, level, level_name}]：日志消息条目（tSec 是相对日志起点的秒数）；"
        "四个过滤参数都可省，省了就是全量。原 get_logged_messages 迁移到此名",
    },
    "get_mode_changed": {
        "kind": "method",
        "sig": "() -> list[dict]",
        "doc": "模式变化的连续区间 [{t_start_us, t_end_us, mode, ...}]（µs，格式各自时基）",
    },
    "get_armed_changed": {
        "kind": "method",
        "sig": "() -> list[dict]",
        "doc": "解锁/上锁的连续区间 [{t_start_us, t_end_us}]（µs；end 不会是 None，日志截止就用最后时间戳封口）",
    },
    "get_firmware_version": {
        "kind": "method",
        "sig": "() -> str",
        "doc": "固件版本号串（如 1.15.4 / 4.5.7）。这份日志没写版本号要如实说（返回带「未知」字样的串）",
    },
    "get_version_info": {
        "kind": "method",
        "sig": "() -> tuple|None",
        "doc": "(major, minor, patch, release_type)。解析不出返回 None",
    },
    "get_version_info_str": {
        "kind": "method",
        "sig": "() -> str",
        "doc": "版本号的展示串（含 alpha/beta/rc 后缀的完整写法）",
    },
    "get_vehicle_identity": {
        "kind": "method",
        "sig": "() -> dict",
        "doc": "载具身份 {vehicle_type, uid, hardware, ...}。没有的键给空串，不给省略，形态稳定",
    },
    "get_log_integrity": {
        "kind": "method",
        "sig": "() -> dict",
        "doc": "日志完整性 {total_dropout_ms, n_gaps, gaps, end_reached, ...}。没有丢包概念的格式给 0/[]，别装作查过",
    },
    "has_file_corruption": {
        "kind": "method",
        "sig": "() -> bool",
        "doc": "文件里有没有解析器认不出的字节段（截断/损坏旁证）",
    },
}

# ---------------- 可选能力：缺席时报告页对应 tab 自动隐藏 ----------------
# 不同格式能给的东西本来就不一样（PX4 的 ULog 有事件解码与逐字节消息统计，
# ArduPilot 的 .bin 是另一套消息流），所以可选能力由格式自己决定。
OPTIONAL = {
    # get_flight_phases 已并入 get_mode_changed（REQUIRED，µs 形态），旧键名退场，勿再添加
    "get_logged_dropouts": {"sig": "() -> list[dict]", "doc": "[{tSec, durationMs}] 丢包记录"},
    "get_message_type_counts": {
        "sig": "() -> dict | None",
        "doc": "逐字节的消息类型统计（只对能按帧走的格式有意义）+ 走到文件末尾没有",
    },
    "get_decoded_events": {
        "sig": "(t_start=None, t_end=None, level=None, pattern=None) -> list[dict] | None",
        "doc": "事件解码（PX4 靠日志自带的 metadata_events；过滤参数与 get_logged_events 同义）。None = 这份日志解不出",
    },
    "has_default_parameters": {
        "sig": "() -> bool",
        "doc": "日志里带不带默认参数表（ULog 的 'Q' 消息机制）。没有这个概念的格式不必实现",
    },
    "get_default_parameters": {
        "sig": "() -> dict | None",
        "doc": "默认参数表 {param: value}。没有就返回 None（「没记录」与「没这机制」是两回事，前端要能区分）",
    },
    "report_materials": {
        "sig": "() -> dict",
        "doc": "报告页要的几块原料的打包，不是某一个 tab 的 payload："
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
    # ---- 知识引擎查询 API（可选部分：格式间差异大，缺席就隐藏对应能力）----
    "has_data_appended": {
        "sig": "() -> bool",
        "doc": "日志是否带追加数据段（ULog 的 append 机制；没有这个概念的格式不必实现）",
    },
    "get_parameter_description": {
        "sig": "(name=None) -> dict|None",
        "doc": "参数说明 {param: {min, max, desc}}。v1 无数据源（参数字典是前端按需拉的静态 JSON）→ 返回 None",
    },
    "platform_label": {
        "sig": "() -> str",
        "doc": "报告头里的固件族名（如 PX4 / ArduPilot）：给读者看的名字，不是 \`log_type\` 那种机器标识。"
        "没有这个方法就退回 log_type，引擎不替任何格式猜它该叫什么",
    },
}

# ---------------- builtin_variables() 要给的键（= 规则与 plot 能引用的内置变量）----------------
# 这份表就是"作者能引用什么"的权威清单，站内指南的内置变量表由 build-knowledge.mjs
# 从这里生成。加名字 = 改契约；删名字 = 破坏兼容（老规则会构建失败，这是有意的）。
# 名字一律大写：规则里自己赋的变量是小写，一眼就能分出"这个数是引擎给的还是自己算的"。
BUILTIN_VARIABLES = {
    "VEHICLE": {
        "type": "str",
        "doc": "机型：rotary_wing / fixed_wing / rover / airship / unknown",
    },
    "DURATION_S": {"type": "float", "doc": "日志总时长（秒）"},
    "ARMED_S": {"type": "float", "doc": "armed 总时长（秒）"},
    "T0_US": {"type": "int", "doc": "日志起点时间戳（us），事件类算子算相对时刻的基准"},
    "DROPOUT_MS": {"type": "int", "doc": "全日志丢包累计（毫秒）"},
    # ---- 知识引擎内置变量（docs/develop/engine-api-rework.md 并入）----
    # 缺什么给 None / ""（类型里写明 |None 或直接给空串），不许编值。
    "SYS_UUID": {"type": "str", "doc": "系统唯一 ID。这份日志没写就给空串"},
    "AIRFRAME_ID": {
        "type": "int|None",
        "doc": "机架编号（PX4: SYS_AUTOSTART；APM: FRAME_CLASS）。没有就 None，与 AIRFRAME（机型字符串）是两个东西",
    },
    "HOME_LAT": {"type": "float|None", "doc": "Home 点纬度（度）。给不出定位就 None"},
    "HOME_LON": {"type": "float|None", "doc": "Home 点经度（度）"},
    "HOME_ALT": {"type": "float|None", "doc": "Home 点高度（米）"},
    "SW_VER": {"type": "str", "doc": "软件版本号串（如 1.15.4）。没写版本号给「未知」字样的串"},
    "SW_VER_HASH": {"type": "str", "doc": "软件版本 git 哈希。没写就空串"},
    "HW_VER": {"type": "str", "doc": "硬件版本名。没写就空串"},
    "HW_VER_SUBTYPE": {"type": "str", "doc": "硬件版本子型号。没写就空串"},
    "FLIGHT_TIME_S": {"type": "float|None", "doc": "载具累计飞行时长（秒，参数里的计数器）。没有就 None"},
}

# 框架提供的函数（engine.py 注入 _COMPUTE_GLOBALS + env）：
#   has_topic()  消息存在判定，指向 provider.has_topic
#   _cfg()       读飞控参数，查 provider.get_initial_parameters()
#   log_ok()     日志完整性，指向 provider.is_log_ok


# ---------------- 格式注册表 ----------------
# 各 providers/<格式>.py 在文件末尾把 (探测器, 工厂, 说明, log_type) 追加进来。探测靠文件头
# magic，不靠扩展名（用户上传的文件名不可信）。
#   探测器  detect(raw) -> bool
#   工厂    make(raw, facts_cfg) -> provider（facts_cfg 是那一份数据 YAML，由引擎传进来；
#           之所以显式传而不是读全局，是为了让"这个 provider 用哪份数据"一目了然）
#   log_type  格式标识（如 px4-ulog），与适配器类上的 \`log_type\` 是同一个串。
#
# 为什么把它塞进注册表而不是"引擎从 provider 实例上读"：引擎同时装着好几套知识
# （knowledge/px4 与 knowledge/ardupilot 各自的规则 / 数据 / 故障库），而挑知识要先
# 知道格式、挑格式又发生在打开日志之前，探测器是唯一能在"还没构造 provider"时就回答
# 这一步的东西。有了它 \`open_log()\` 一行都不用改。
FORMATS = []

_VALUE_TYPES = {
    "int": (int,),
    "float": (int, float),
    "bool": (bool,),
    "str": (str,),
    "list": (list, tuple),
    "dict": (dict,),
}


def match_version_spec(cur, spec):
    """固件约束串的共享解释器（各 provider 的 match_version 都走这里，别各写一份）。

    语法：any / ">=1.15" / "<1.15" / ">=1.14,<1.15"（逗号=与）。cur 是 (major, minor)
    二元组；None = 版本未知。
    解析失败一律抛 ValueError，那是规则作者的笔误，与这份日志有没有版本号无关，
    不能被"版本未知就放行"盖过去；版本未知时按"不因版本排除"处理（返回 True）。
    """
    import re as _re

    if not spec or spec == "any":
        return True
    conds = []
    for part in str(spec).split(","):
        m = _re.match(r"^\s*(>=|<=|==|>|<)?\s*(\d+)\.?(\d+)?\s*$", part)
        if not m:
            raise ValueError("无法解析 firmware 约束：%r" % spec)
        conds.append((m.group(1) or ">=", (int(m.group(2)), int(m.group(3) or 0))))
    if cur is None:
        return True
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


def detect_log_type(raw):
    """按文件头认出这是哪种日志，不构造 provider（只跑探测器）。

    引擎拿它当"该用哪一套知识"的开关：规则 / 数据 / 故障库 / 单位表在产物里都是
    \`{log_type: ...}\` 的形状，先认格式才能取出对应那一套。认不出来返回 None。
    """
    for detect, _make, _label, log_type in FORMATS:
        if detect(raw):
            return log_type
    return None


def open_log(raw, facts_cfg=None):
    """按文件头挑一个适配器打开日志，并立刻做一次契约自检；挑不出来就报人话错误。

    facts_cfg 是已经挑好的那一份数据（多格式时代由引擎按 \`detect_log_type()\` 挑，
    见 engine.py），这里不做挑选，因为挑知识要先知道格式，而格式是探测器说了算。
    """
    for detect, make, label, _log_type in FORMATS:
        if detect(raw):
            return check_provider(make(raw, facts_cfg), label)
    known = "、".join(label for _, _, label, _ in FORMATS) or "（无）"
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
    看不了"跑起来给的是什么"，比如 builtin_variables() 少返回一个键、FW_MINOR 给了字符串。
    这类问题如果放过，表现是静默失效（规则算不出数据 → 不发射 finding），很难查。
    """
    for name, spec in REQUIRED.items():
        if not hasattr(provider, name):
            raise ValueError("%s 缺少契约要求的能力：%s（%s）" % (where, name, spec["doc"]))

    sem = provider.builtin_variables()
    if not isinstance(sem, dict):
        raise ValueError("%s.semantics() 必须返回 dict" % where)
    for key, spec in BUILTIN_VARIABLES.items():
        if key not in sem:
            raise ValueError("%s.semantics() 缺少内置变量 %s（%s），规则里引用它会静默算不出数据" % (where, key, spec["doc"]))
        if not _type_matches_spec(sem[key], spec):
            raise ValueError("%s.semantics()[%s] 类型不对：期望 %s，得到 %r" % (where, key, spec["type"], sem[key]))
    # 每个 provider 都要能独立喂给多个规则：返回的要是新 dict（引擎会往里写 compute 输出）
    sem2 = provider.builtin_variables()
    if sem2 is sem:
        raise ValueError("%s.semantics() 每次都必须返回新的 dict（引擎会往里写变量）" % where)

    if not isinstance(provider.get_report_facts(), dict):
        raise ValueError("%s.facts() 必须返回 dict" % where)
    if not isinstance(provider.get_topic_meta(), list):
        raise ValueError("%s.messages() 必须返回 list" % where)
    if not isinstance(provider.parser_version(), str):
        raise ValueError("%s.parser_version() 必须返回 str" % where)
    # 时间边界是这批查询 API 里唯一被其他断言拿来做基准的聚合（guard 用它核对 duration），
    # 形状错了要让所有下游跟着错，在这里先拦住
    tb = provider.get_time_bounds()
    if not isinstance(tb, dict) or not {"start_us", "end_us", "duration_s", "has_wraparound"} <= set(tb):
        raise ValueError("%s.get_time_bounds() 必须返回含 start_us/end_us/duration_s/has_wraparound 的 dict" % where)
    return provider

# ArduPilot .bin（AP_Logger）适配器，本项目唯一认识 ArduPilot 的地方
#
# 契约见 providers/api.py。格式是自描述的：文件开头是一串 FMT 消息，声明每种消息的
# 名字、长度、字段与格式字符，所以解析器按 FMT 表通解，不逐消息类型硬编码；
# MSG/PARM/EV/MODE/GPS 一律按 FMT 名字查表，不写死消息 ID（不同固件版本的 ID 会变）。
#
# 分工（与 px4.py 同一条纪律）：
#   · 本文件：怎么从 AP_Logger 字节流里把数据取出来，FMT 解析、格式字符缩放、消息名定位
#   · engine/*.py：与格式无关的机制；契约常量在 api.py
#
# 与 PX4 适配器的两个约定差异（消费方要知情）：
#   · 时基：TimeUS 是开机以来的 µs（与 PX4 同为"开机起"，但两者不共享同一块表）
#   · 列名：TimeUS 在 get_dataset() 里改名为 timestamp（规则与曲线统一写 timestamp；
#     get_dataset_description() 仍给日志原始字段名，那是格式声明）
#
# 数据源核对情况（2026-09-24，36 份 autotest SITL 日志对账，Copter/Plane/Rover）：
#   · EV 事件码 10=ARMED / 11=DISARMED：经 AP_Logger.h 官方源码核对无误
#     （真实 Copter 日志里的 [25, 62] = SET_HOME / EKF_YAW_RESET）；但 autotest Copter
#     日志不写 ARMED/DISARMED 事件且无 ARM topic，所以 armed 还要回退 STAT.Armed 状态沿
#   · FORMAT_VERSION 参数是 DataFlash 日志格式版本（Copter 120 / Plane 13），
#     不是固件版本，不能当固件版本回退（踩过，已删）；固件版本从 MSG 横幅 / VER 消息取
#   · 仍未逐字段验证（v1 只解析不应用，应用了才是猜数）：
#     格式字符缩放、FRAME_CLASS 全表（且 Copter/Rover 语境同码不同义）、FMTU 乘子
#   · 消息 Length 字段是否含 3 字节头，已做自校准（见 _calibrate_len_hdr），但兜底逻辑本身要样本验

import struct as _struct

import numpy as np

# 文件头 magic 与 FMT 消息（保留 ID：所有版本都一样，这两个可以写死）。
# 命名带 _APM_ 前缀：构建期各 provider 拼进同一个命名空间，顶层名字撞了就是
# 静默互踩（_MAGIC 曾被 px4.py 的同名常量覆盖，探测一直 False），有守卫拦同名。
_APM_MAGIC = b"\xa3\x95"
_FMT_TYPE = 128
# FMT 消息自身的 payload 恒为 86 字节：Type(1) + Length(1) + Name(4) + Format(16) + Columns(64)
_FMT_PAYLOAD = 86

# 格式字符 → (struct 格式, 字节数)。缩放另见 _SCALED。
# n/N/Z 是定长文本（char[4]/[16]/[64]），用 s 格式整体取，解出来再剥 \x00。
_FMT_CHARS = {
    "b": ("<b", 1),
    "B": ("<B", 1),
    "M": ("<B", 1),  # 飞行模式（uint8）
    "h": ("<h", 2),
    "H": ("<H", 2),
    "i": ("<i", 4),
    "I": ("<I", 4),
    "f": ("<f", 4),
    "d": ("<d", 8),
    "q": ("<q", 8),
    "Q": ("<Q", 8),
    "n": ("4s", 4),
    "N": ("16s", 16),
    "Z": ("64s", 64),
    "c": ("<h", 2),  # int16 × 0.01
    "C": ("<H", 2),  # uint16 × 0.01
    "e": ("<H", 2),  # uint16 × 0.01
    "E": ("<I", 4),  # uint32 × 0.01
    "L": ("<i", 4),  # int32 × 1e-7（经纬度）
}
_SCALED = {"c": 0.01, "C": 0.01, "e": 0.01, "E": 0.01, "L": 1e-7}

# 格式字符 → dtype 名（get_field_dtype 用；文本给 str）
_FMT_DTYPES = {
    "b": "int8",
    "B": "uint8",
    "M": "uint8",
    "h": "int16",
    "H": "uint16",
    "i": "int32",
    "I": "uint32",
    "f": "float32",
    "d": "float64",
    "q": "int64",
    "Q": "uint64",
    "c": "int16",
    "C": "uint16",
    "e": "uint16",
    "E": "uint32",
    "L": "int32",
    "n": "str",
    "N": "str",
    "Z": "str",
}

# 日志级别的数字语义与 PX4 对齐（3=ERROR 4=WARNING 6=INFO），名字给固定的英文串：
# PX4 的 level_name 来自 facts.yaml（那份码表是 PX4 的），APM 不借用别人的码表
_LEVEL_NAMES = {3: "ERROR", 4: "WARNING", 6: "INFO"}

# FRAME_CLASS → 机型。上游权威源码（AP_Motors / AP_Parameters）：
#  1=Quad 2=Tri 3=Octa 4=Coax 5=Hexa 6=Y6 7=Heli 8=OctaQuad
#  9=Single 10=HeliDual 11=Dodeca 12=Deca
# Plane / Rover 没有 FRAME_CLASS 参数，由 _read_vehicle_type() 按固件名识别。
_FRAME_CLASS_MAP = {
    1: "quad",
    2: "tri",
    3: "octa",
    4: "coax",
    5: "hexa",
    6: "y6",
    7: "heli",
    8: "octa_quad",
    9: "single",
    10: "heli_dual",
    11: "dodeca",
    12: "deca",
}

# 类别名 → 精确名集合。规则写 vehicle: [copter] 时引擎展开匹配。
_VEHICLE_CATEGORIES = {
    "copter": {"quad", "hexa", "octa", "tri", "coax", "y6", "heli", "heli_dual", "octa_quad", "single", "dodeca", "deca"},
    "plane": {"plane"},
    "rover": {"rover"},
    "sub": {"sub"},
}

# EV 事件码 → 解锁/上锁（待真实样本核对，见文件头）
_EV_ARMED = 10
_EV_DISARMED = 11


def _text(raw):
    """定长 char[N] → 去掉 \x00 与首尾空白的文本。"""
    return raw.decode("ascii", "replace").rstrip("\x00").strip()


class ApmProvider:
    """ArduPilot .bin 适配器。契约见 providers/api.py。"""

    log_type = "ardupilot-bin"
    vehicle_categories = _VEHICLE_CATEGORIES

    def __init__(self, raw, facts_cfg):
        # facts_cfg 是 PX4 的数据配置（构建期只有一份 facts.yaml），本适配器不读它，
        # 码表都在本文件里（待迁 knowledge/ardupilot/）。参数保留只为与工厂签名一致。
        # 迁移未完成的原因不是懒：动这里的任何一条常量都会让
        # tools/engine/guard_apm_parser_version.py 的 AST 指纹变红，得同步升
        # parser_version() 并重冻基线。等接线改动一起做，别单独动。
        self._cfg = facts_cfg or {}
        self.raw = bytes(raw)
        self._parse_errors = 0  # 认不出的字节段数（has_file_corruption 的判据）
        self._parse()

    # ================= 解析 =================

    def _parse(self):
        """两遍扫描：先收 FMT 声明，再按格式解码。都从文件头顺序走，认不出就重同步到下一个 magic。"""
        raw, n = self.raw, len(self.raw)
        by_id, by_name = {}, {}
        self._len_hdr = 3  # 消息 Length 字段是否含 3 字节头：第一条 FMT 解出来后校准

        # ---- 第一遍：FMT 声明（payload 恒 86 字节，不依赖长度约定）----
        off = 0
        while off + 3 <= n:
            if raw[off] != _APM_MAGIC[0] or raw[off + 1] != _APM_MAGIC[1]:
                nxt = raw.find(_APM_MAGIC, off + 1)
                if nxt == -1:
                    break
                off = nxt
                continue
            mtype = raw[off + 2]
            if mtype == _FMT_TYPE:
                if off + 3 + _FMT_PAYLOAD > n:
                    self._parse_errors += 1
                    break
                f = self._parse_fmt_row(raw[off + 3 : off + 3 + _FMT_PAYLOAD])
                if f is not None:
                    by_id[f["id"]] = f
                    by_name[f["name"]] = f
                    if f["name"] == "FMT":
                        # 自校准：FMT 自己的 Length 字段值 - 86 = 头部长度（89 → 含头；86 → 不含）
                        self._len_hdr = 3 if f["len"] > _FMT_PAYLOAD else 0
                off += 3 + _FMT_PAYLOAD
                continue
            f = by_id.get(mtype)
            if f is None or f.get("unsupported"):
                # 还没见到定义（或解不了的消息）：只能按字节找下一个头
                nxt = raw.find(_APM_MAGIC, off + 3)
                if nxt == -1:
                    break
                off = nxt
                continue
            plen = f["len"] - self._len_hdr
            if plen <= 0 or off + 3 + plen > n:
                self._parse_errors += 1
                break
            off += 3 + plen

        self._fmt_by_id, self._fmt_by_name = by_id, by_name

        # ---- 第二遍：按格式解码数据消息 ----
        rows = {}  # name → list[tuple]（顺序 = fmt["fields"]）
        walked_ok = True
        off = 0
        while off + 3 <= n:
            if raw[off] != _APM_MAGIC[0] or raw[off + 1] != _APM_MAGIC[1]:
                nxt = raw.find(_APM_MAGIC, off + 1)
                if nxt == -1:
                    walked_ok = False
                    break
                off = nxt
                continue
            mtype = raw[off + 2]
            f = by_id.get(mtype)
            if f is None or f.get("unsupported"):
                if f is None:
                    self._parse_errors += 1
                nxt = raw.find(_APM_MAGIC, off + 3)
                if nxt == -1:
                    walked_ok = False
                    break
                off = nxt
                continue
            plen = f["len"] - self._len_hdr
            if plen <= 0 or off + 3 + plen > n:
                self._parse_errors += 1
                walked_ok = False
                break
            payload = raw[off + 3 : off + 3 + plen]
            off += 3 + plen
            if mtype in (_FMT_TYPE, 129):  # FMT 已收；FMTU 只解析不应用（见文件头）
                continue
            row = self._decode_row(f, payload)
            if row is None:
                self._parse_errors += 1
                continue
            rows.setdefault(f["name"], []).append(row)
        self._rows = rows
        self._walked_ok = walked_ok

        # ---- 行 → 列（TimeUS 改名 timestamp；见文件头的约定差异说明）----
        self._cols = {}
        for name, fmt in by_name.items():
            rws = rows.get(name)
            if not rws:
                continue
            cols = {}
            for i, fld in enumerate(fmt["fields"]):
                key = "timestamp" if fld == "TimeUS" else fld
                cols[key] = np.array([r[i] for r in rws])
            self._cols[name] = cols

        # ---- 时间基准与数据质量 ----
        t_min, t_max = None, None
        restart = 0
        for cols in self._cols.values():
            ts = cols.get("timestamp")
            if ts is None or len(ts) == 0:
                continue
            a = np.asarray(ts, dtype=np.int64)
            t_min = int(a[0]) if t_min is None else min(t_min, int(a[0]))
            t_max = int(a[-1]) if t_max is None else max(t_max, int(a[-1]))
            if len(a) > 10 and int(np.count_nonzero(np.diff(a) < 0)) > 0:
                restart += 1
        self.t0_us = t_min or 0
        self.t_max_us = t_max if t_max is not None else self.t0_us
        self.duration_s = round((self.t_max_us - self.t0_us) / 1e6, 1) if t_min is not None else None
        self.restart_topics = restart

        self._read_params()
        self._read_version()
        self._read_vehicle_type()
        self._read_armed()
        self._read_home()

    def _parse_fmt_row(self, payload):
        """FMT payload（86B）→ 声明 {id, len, name, format, fields}。格式字符解不了标记 unsupported。"""
        try:
            mtype = payload[0]
            length = payload[1]
            name = _text(payload[2:6])
            fstr = _text(payload[6:22])
            fields = [_text(c) for c in payload[22:86].split(b",")]
            fields = [f for f in fields if f]
        except Exception:
            self._parse_errors += 1
            return None
        if not name or len(fstr) != len(fields):
            # 格式串与列数对不上：这份 FMT 没法可靠解码，标记后跳过它的消息（不硬猜）
            self._parse_errors += 1
            return None
        unsupported = any(ch not in _FMT_CHARS for ch in fstr)
        return {
            "id": int(mtype),
            "len": int(length),
            "name": name,
            "format": fstr,
            "fields": fields,
            "unsupported": unsupported,
        }

    def _decode_row(self, fmt, payload):
        """按格式声明解一行 → tuple（顺序与 fmt["fields"] 一致）。解不了返回 None。"""
        out = []
        off = 0
        try:
            for ch, fld in zip(fmt["format"], fmt["fields"]):
                sf, size = _FMT_CHARS[ch]
                chunk = payload[off : off + size]
                if len(chunk) < size:
                    return None
                # _FMT_CHARS 的 sf 已带字节序前缀（"<Q"）；字符串格式（"16s"）无需前缀。
                # 别再拼一个 "<"，会变成 "<<Q"，struct 直接报 bad char（静默吞掉后整行解不出）
                (v,) = _struct.unpack(sf, chunk)
                off += size
                if sf.endswith("s"):
                    out.append(_text(v))
                elif ch in _SCALED:
                    out.append(float(v) * _SCALED[ch])
                else:
                    out.append(v)
        except Exception:
            return None
        return tuple(out)

    def _read_params(self):
        """PARM 消息：首现值 = 初始参数，后续不同值 = 运行中变更。"""
        params, changed = {}, []
        for row in self._iter_named("PARM"):
            rec = dict(zip(self._fmt_by_name.get("PARM", {}).get("fields", []), row))
            name = str(rec.get("Name") or "")
            if not name:
                continue
            value = rec.get("Value")
            t_us = rec.get("TimeUS")
            if name not in params:
                params[name] = value
            elif params[name] != value:
                t_sec = round((int(t_us) - self.t0_us) / 1e6, 2) if t_us is not None else None
                changed.append({"tSec": t_sec, "name": name, "value": value})
                params[name] = value
        self._params = params
        self._changed = changed

    def _read_version(self):
        """固件版本：MSG 横幅 / VER 消息。

        真实横幅长这样：\`ArduCopter V4.8.0-dev (665c0dee)\`，正则要兼容 \`-dev\` 之类的
        后缀与可选哈希。别回退 FORMAT_VERSION 参数：那是 DataFlash 日志格式版本
        （Copter 120 / Plane 13），不是固件版本，拿它当版本号是把"容器格式"读成"固件"。
        """
        import re as _re

        self.fw = {"major": None, "minor": None, "patch": None, "git": "", "vehicle": ""}
        texts = [
            str(dict(zip(self._fmt_by_name.get("MSG", {}).get("fields", []), r)).get("Message") or "")
            for r in self._iter_named("MSG")
        ]
        if self._fmt_by_name.get("VER"):
            texts += [
                " ".join(str(v) for v in dict(zip(self._fmt_by_name["VER"].get("fields", []), r)).values())
                for r in self._iter_named("VER")
            ]
        for text in texts:
            # 车型名后的 \`V<major>.<minor>.<patch>\`；后缀（-dev 等）与 (hash) 都可选
            m = _re.search(r"\bV(\d+)\.(\d+)\.(\d+)(?:[-.\w]*)?(?:\s*\((\w+)\))?", text)
            if m:
                self.fw = {
                    "major": int(m.group(1)),
                    "minor": int(m.group(2)),
                    "patch": int(m.group(3)),
                    "git": m.group(4) or "",
                    "vehicle": text.split(" ")[0],
                }
                break
        self.fw_minor = self.fw["minor"]
        self.fw_label = (
            "%d.%d.%d" % (self.fw["major"], self.fw["minor"], self.fw["patch"])
            if self.fw["minor"] is not None
            else "未知（未解析到版本）"
        )
        self.fw_display = self.fw_label if self.fw["minor"] is not None else "未知"

    def _read_vehicle_type(self):
        """机型：固件名优先（Plane/Rover 无 FRAME_CLASS），再回退 FRAME_CLASS 映射。"""
        fw_name = self.fw.get("vehicle", "")
        if "Plane" in fw_name:
            self.vehicle_type = "plane"
            self.airframe_id = None
            return
        if "Rover" in fw_name:
            self.vehicle_type = "rover"
            self.airframe_id = None
            return
        if "Sub" in fw_name:
            self.vehicle_type = "sub"
            self.airframe_id = None
            return
        fc = self._params.get("FRAME_CLASS")
        try:
            fc = int(fc)
        except (TypeError, ValueError):
            fc = None
        self.airframe_id = fc
        if fc is None:
            self.vehicle_type = "unknown"
        elif fc in _FRAME_CLASS_MAP:
            self.vehicle_type = _FRAME_CLASS_MAP[fc]
        else:
            self.vehicle_type = "unknown(%d)" % fc

    def _read_armed(self):
        """armed 区间：EV 事件的 10/11（码值经 AP_Logger.h 核对）→ STAT.Armed 状态沿回退。

        autotest Copter 日志不写 ARMED/DISARMED 事件、也无 ARM/STAT，那就如实给空，
        不编造；Plane 有低频 STAT.Armed（0/1 状态量），取跳变沿切区间。
        """
        intervals = []
        start = None
        for row in self._iter_named("EV"):
            rec = dict(zip(self._fmt_by_name.get("EV", {}).get("fields", []), row))
            t_us = rec.get("TimeUS")
            if t_us is None:
                continue
            code = rec.get("Id")
            if code == _EV_ARMED and start is None:
                start = int(t_us)
            elif code == _EV_DISARMED and start is not None:
                intervals.append((start, int(t_us)))
                start = None
        if start is not None:
            intervals.append((start, None))
        if not intervals:
            # EV 没给：STAT.Armed 状态沿（前值 0 → 1 是解锁，1 → 0 是上锁）
            stat = self._fmt_by_name.get("STAT")
            if stat and "Armed" in stat.get("fields", []):
                prev = None
                seg_start = None
                for row in self._iter_named("STAT"):
                    rec = dict(zip(stat.get("fields", []), row))
                    t_us = rec.get("TimeUS")
                    if t_us is None:
                        continue
                    cur = 1 if rec.get("Armed") else 0
                    if prev is not None and cur != prev:
                        if cur == 1:
                            seg_start = int(t_us)
                        elif seg_start is not None:
                            intervals.append((seg_start, int(t_us)))
                            seg_start = None
                    prev = cur
                if seg_start is not None:
                    intervals.append((seg_start, None))
        self.armed_intervals = intervals
        total = sum(((e if e is not None else self.t_max_us) - s) for s, e in intervals)
        self.armed_duration_s = round(total / 1e6, 1)

    def _read_home(self):
        """Home 点：GPS 首个有效定位（Status>=3、坐标合法非零）。APM 没有 ref 原点概念，ref 给 None。"""
        self.home_position = None
        for row in self._iter_named("GPS"):
            rec = dict(zip(self._fmt_by_name.get("GPS", {}).get("fields", []), row))
            lat, lon = rec.get("Lat"), rec.get("Lng")
            alt = rec.get("Alt")
            status = rec.get("Status")
            if None in (lat, lon, alt) or (status is not None and int(status) < 3):
                continue
            if abs(lat) <= 90 and abs(lon) <= 180 and not (abs(lat) < 1e-7 and abs(lon) < 1e-7):
                self.home_position = {"lat": float(lat), "lon": float(lon), "alt": float(alt), "source": "GPS"}
                break

    def _iter_named(self, name):
        return self._rows.get(name, [])

    # ================= 数据访问层 =================

    def platform_label(self):
        """报告头里的固件族名（人读的名字，与 \`log_type\` 那个机器标识不是一个东西）。"""
        return "ArduPilot"

    def parser_version(self):
        """自研解析器（不依赖 pymavlink）：版本号在这里维护，进报告头的 parserVersion。"""
        return "apm-bin-parser/1.5.0"  # 1.5.0：report_materials 填充 sysInfo；支持 ArduSub + sub vehicle_category；基线新增 APM .BIN 样本

    def get_topic_meta(self):
        out = []
        for name, fmt in sorted(self._fmt_by_name.items()):
            cols = self._cols.get(name)
            if not cols:
                continue  # 声明了但一条都没录到（或解不了）：不进 meta
            ts = cols.get("timestamp")
            out.append(
                {
                    "topic": name,
                    "instance": 0,
                    "n": int(len(ts)) if ts is not None else 0,
                    "fields": [{"name": k, "dtype": str(v.dtype)} for k, v in cols.items() if k != "timestamp"],
                }
            )
        return out

    def get_dataset(self, topic, instance=0):
        """某消息类型的原样列（TimeUS 已改名 timestamp，见文件头）。APM 无多实例：instance≠0 给 None。"""
        if instance not in (0, slice(None, None), None):
            return None
        cols = self._cols.get(topic)
        return dict(cols) if cols else None

    def get_series(self, ref, instance=slice(None, None), alias=None):
        """按 'topic.field' 取一条序列；取不到一律返回 None。APM 单实例，instance 只认 0 / 全部。

        FMT 声明为文本列（n/N/Z）的字段直接返回原始字符串序列，不做 float 转换；
        数值列仍走 np.asarray(v, dtype=float)。"""
        if isinstance(instance, int) and instance != 0:
            return None
        topic, _, field = ref.partition(".")
        cols = self._cols.get(topic)
        if not cols:
            return None
        aliases = [alias] if isinstance(alias, str) else list(alias or [])
        for name in [field] + aliases:
            v = cols.get(name)
            if v is None or len(v) == 0:
                continue
            dtype = self.get_field_dtype(topic, name)
            if dtype == "str":
                return v  # 文本列：直接返回，不做 float 转换
            try:
                return np.asarray(v, dtype=float)
            except (TypeError, ValueError):
                return None
        return None

    def get_first_existing_column(self, topic, names):
        cols = self.get_dataset(topic, 0)
        if not cols:
            return None
        for nm in names if isinstance(names, (list, tuple)) else [names]:
            if nm in cols:
                return cols[nm]
        return None

    def has_topic(self, name):
        return name in self._cols

    def match_version(self, spec):
        cur = None
        if self.fw_minor is not None:
            cur = (self.fw["major"] if self.fw["major"] is not None else 0, self.fw_minor)
        return match_version_spec(cur, spec)

    def get_info_dict(self):
        """APM 日志没有键值信息消息：如实给空二元组（版本/身份走 get_report_facts 与专用方法）。"""
        return ({}, {})

    def get_initial_parameters(self):
        return dict(self._params)

    def get_logged_events(self, t_start=None, t_end=None, level=None, pattern=None):
        """MSG 文本 + ERR 错误合成的时间轴。MSG 无级别给 INFO；ERR 给 ERROR（子系统和码值原样进文本）。

        TimeUS 缺失的消息 tSec 给 None，如实说"不知道几点"，不编 0。
        """
        out = []
        for row in self._iter_named("MSG"):
            rec = dict(zip(self._fmt_by_name.get("MSG", {}).get("fields", []), row))
            t_us = rec.get("TimeUS")
            out.append(
                {
                    "tSec": round((int(t_us) - self.t0_us) / 1e6, 2) if t_us is not None else None,
                    "message": str(rec.get("Message") or "").strip(),
                    "level": 6,
                    "level_name": _LEVEL_NAMES[6],
                }
            )
        err_fields = self._fmt_by_name.get("ERR", {}).get("fields", [])
        for row in self._iter_named("ERR"):
            rec = dict(zip(err_fields, row))
            t_us = rec.get("TimeUS")
            out.append(
                {
                    "tSec": round((int(t_us) - self.t0_us) / 1e6, 2) if t_us is not None else None,
                    "message": "ERR subsys=%s code=%s" % (rec.get("Subsys"), rec.get("ECode")),
                    "level": 3,
                    "level_name": _LEVEL_NAMES[3],
                }
            )
        out.sort(key=lambda m: (m["tSec"] is None, m["tSec"] if m["tSec"] is not None else 0))
        if t_start is not None:
            out = [m for m in out if m["tSec"] is not None and m["tSec"] >= t_start]
        if t_end is not None:
            out = [m for m in out if m["tSec"] is not None and m["tSec"] <= t_end]
        if level is not None:
            lv = set(level) if isinstance(level, (list, tuple)) else {level}
            out = [m for m in out if m["level"] in lv]
        if pattern:
            out = [m for m in out if str(pattern).lower() in m["message"].lower()]
        return out

    def builtin_variables(self):
        """内置变量表。每次返回新 dict（引擎会往里写 compute 的输出）。

        键一律大写；APM 给不出的值给 None / 空串（不编值）。"""
        home = self.home_position or {}
        return {
            "VEHICLE": self.vehicle_type,
            "DURATION_S": self.duration_s if self.duration_s is not None else 0,
            "ARMED_S": self.armed_duration_s,
            "T0_US": self.t0_us,
            "DROPOUT_MS": 0,  # .bin 没有丢包记录的概念：给 0，不装作查过
            # ---- 知识引擎内置变量 ----
            "SYS_UUID": "",  # v1 无来源（APM 的 UID 在 INFO 多值消息里，解析待真实样本）
            "AIRFRAME_ID": self.airframe_id,
            "HOME_LAT": home.get("lat"),
            "HOME_LON": home.get("lon"),
            "HOME_ALT": home.get("alt"),
            "SW_VER": self.fw_label,
            "SW_VER_HASH": self.fw["git"],
            "HW_VER": "",  # 板名在 MSG "Frame: ..." 文本里，格式不保证，v1 不猜
            "HW_VER_SUBTYPE": "",
            "FLIGHT_TIME_S": None,  # 累计飞行时长 v1 无对应参数
        }

    def get_report_facts(self):
        """报告头的离散事实。键与 PX4 版本保持同一套（前端按同一张表渲染）。"""
        facts = {
            "durationSec": self.duration_s if self.duration_s is not None else 0,
            "vehicleType": self.vehicle_type,
            "firmware": self.fw_label,
            "firmwareDisplay": self.fw_display,
            "armedDurationSec": self.armed_duration_s,
            "phases": [],
            "dropoutTotalMs": 0,
        }
        if self.fw["git"]:
            facts["verSw"] = self.fw["git"]
        if self.airframe_id is not None:
            facts["airframeId"] = self.airframe_id
        return facts

    # ================= 知识引擎查询 API =================

    def get_start_timestamp(self):
        return int(self.t0_us)

    def get_last_timestamp(self):
        return int(self.t_max_us)

    def get_time_bounds(self):
        return {
            "start_us": int(self.t0_us),
            "end_us": int(self.t_max_us),
            "duration_s": self.duration_s,
            "has_wraparound": self.restart_topics > 0,
        }

    def get_dataset_description(self, topic=None):
        """FMT 表就是格式声明：含这份日志没录到的消息（声明在、数据没来）。"""

        def one(fmt):
            return {
                "name": fmt["name"],
                "fields": [{"name": fn, "type": ch} for ch, fn in zip(fmt["format"], fmt["fields"])],
            }

        if topic is not None:
            fmt = self._fmt_by_name.get(topic)
            return one(fmt) if fmt is not None else None
        return {name: one(fmt) for name, fmt in self._fmt_by_name.items()}

    def get_field_dtype(self, topic, field):
        fmt = self._fmt_by_name.get(topic)
        if fmt is None:
            return None
        for ch, fn in zip(fmt["format"], fmt["fields"]):
            if fn == field:
                return _FMT_DTYPES.get(ch)
        return None

    def get_field_sizeof(self, topic, field):
        fmt = self._fmt_by_name.get(topic)
        if fmt is None:
            return None
        for ch, fn in zip(fmt["format"], fmt["fields"]):
            if fn == field:
                size = _FMT_CHARS.get(ch)
                return int(size[1]) if size is not None else None
        return None

    def get_field_unit(self, topic, field):
        """FMTU 里有单位声明但乘子/单位表没核对（文件头）：给 None，不用猜的数冒充。"""
        return None

    def get_changed_parameters(self):
        return list(self._changed)

    def get_home_position(self):
        return dict(self.home_position) if self.home_position else None

    def get_ref_position(self):
        """APM 日志没有局部 NED 参考原点的等价物：如实 None。"""
        return None

    def get_mode_changed(self):
        """MODE 消息切段（µs）。APM 没有 nav_state 数值轴：nav_state 给 -1，mode 用日志原文。"""
        segs = []
        last_mode, seg_start, seg_end = None, None, None
        for row in self._iter_named("MODE"):
            rec = dict(zip(self._fmt_by_name.get("MODE", {}).get("fields", []), row))
            t_us = rec.get("TimeUS")
            mode = str(rec.get("Mode") or rec.get("CMode") or rec.get("ModeNum") or "")
            if t_us is None or not mode:
                continue
            t_us = int(t_us)
            if mode != last_mode:
                if last_mode is not None:
                    segs.append(
                        {
                            "t_start_us": seg_start,
                            "t_end_us": t_us,
                            "nav_state": -1,
                            "mode": last_mode,
                            "armed": self._armed_at(seg_start),
                        }
                    )
                last_mode, seg_start = mode, t_us
            seg_end = t_us
        if last_mode is not None:
            segs.append(
                {
                    "t_start_us": seg_start,
                    "t_end_us": seg_end or seg_start,
                    "nav_state": -1,
                    "mode": last_mode,
                    "armed": self._armed_at(seg_start),
                }
            )
        return segs

    def get_mode_present(self):
        """日志里出现过的所有模式名（用于 conditions.mode 匹配）。"""
        modes = set()
        for row in self._iter_named("MODE"):
            rec = dict(zip(self._fmt_by_name.get("MODE", {}).get("fields", []), row))
            mode = str(rec.get("Mode") or rec.get("CMode") or rec.get("ModeNum") or "")
            if mode:
                modes.add(mode)
        return sorted(modes)

    def _armed_at(self, t_us):
        """时刻是否落在 armed 区间内（MODE 段没有 armed 字段，用区间折算）。"""
        for s, e in self.armed_intervals:
            if s <= t_us and (e is None or t_us < e):
                return True
        return False

    def get_armed_changed(self):
        """解锁/上锁区间（µs）。end 不会是 None：日志截止就用最后时间戳封口。"""
        return [{"t_start_us": int(s), "t_end_us": int(e if e is not None else self.t_max_us)} for s, e in self.armed_intervals]

    def get_firmware_version(self):
        return self.fw_label

    def get_version_info(self):
        if self.fw["minor"] is None:
            return None
        return (self.fw["major"], self.fw["minor"], self.fw["patch"], None)

    def get_version_info_str(self):
        return self.fw_display

    def get_vehicle_identity(self):
        return {
            "vehicle_type": self.vehicle_type,
            "uid": None,
            "hardware": None,
            "hardware_subtype": None,
            "airframe_id": self.airframe_id,
            "ver_sw_branch": None,
        }

    def get_log_integrity(self):
        """.bin 没有丢包记录：n_gaps/total 给 0；完整性看"有没有走到文件尾"与解析错误数。"""
        return {
            "total_dropout_ms": 0,
            "n_gaps": 0,
            "gaps": [],
            "end_reached": bool(self._walked_ok),
            "restart_topics": self.restart_topics,
            "has_file_corruption": self._parse_errors > 0,
        }

    def has_file_corruption(self):
        return self._parse_errors > 0

    def is_log_ok(self):
        """日志完整性：文件无损坏 且 解析走到文件尾。"""
        return not self.has_file_corruption() and self._walked_ok

    # ================= 可选能力 ================

    def get_message_type_counts(self):
        """按 FMT 名计数（.bin 按帧走，天然自描述）。走到尾 = walked_ok。"""
        counts = {name: len(rows) for name, rows in self._rows.items()}
        return counts, self._walked_ok, 0, len(self.raw)

    def get_flight_track(self, max_points=None):
        """地图轨迹：GPS 消息（Status>=3、坐标合法非零），等距抽样。取不到给 error + 原因。"""
        cols = self._cols.get("GPS")
        if not cols:
            return {
                "title": "轨迹",
                "legend": True,
                "tracks": [],
                "error": "这份日志里没有 GPS 消息",
                "errorReasons": ["日志里没有名为 GPS 的消息类型"],
            }
        lat, lon = cols.get("Lat"), cols.get("Lng")
        alt, status = cols.get("Alt"), cols.get("Status")
        ts = cols.get("timestamp")
        if lat is None or lon is None or alt is None or ts is None:
            missing = "/".join(nm for nm, v in (("Lat", lat), ("Lng", lon), ("Alt", alt), ("timestamp", ts)) if v is None)
            return {
                "title": "轨迹",
                "legend": True,
                "tracks": [],
                "error": "GPS 消息缺坐标字段（%s）" % missing,
                "errorReasons": ["GPS 缺 %s 列" % missing],
            }
        lat = np.asarray(lat, dtype=float)
        lon = np.asarray(lon, dtype=float)
        alt = np.asarray(alt, dtype=float)
        ts = np.asarray(ts, dtype=np.int64)
        valid = np.isfinite(lat) & np.isfinite(lon) & np.isfinite(alt)
        valid &= (np.abs(lat) <= 90.0) & (np.abs(lon) <= 180.0)
        valid &= ~((np.abs(lat) < 1e-7) & (np.abs(lon) < 1e-7))
        if status is not None:
            valid &= np.asarray(status, dtype=float) >= 3  # 3 = 3D fix（MAVLink GPS_FIX_TYPE）
        idx_valid = np.nonzero(valid)[0]
        if len(idx_valid) < 2:
            return {
                "title": "轨迹",
                "legend": True,
                "tracks": [],
                "error": "GPS %d 个采样里只有 %d 个有效定位（要 Status>=3、坐标非 0 非 NaN）" % (len(ts), len(idx_valid)),
                "errorReasons": ["有效定位不足"],
            }
        limit = int(max_points or 1500)
        step = max(1, int(np.ceil(len(idx_valid) / limit)))
        idx = [int(i) for i in idx_valid[::step]]
        return {
            "title": "轨迹",
            "legend": True,
            "tracks": [
                {
                    "label": "gps",
                    "t": [round(int(ts[i]) / 1e6, 2) for i in idx],
                    "lat": [float(lat[i]) for i in idx],
                    "lon": [float(lon[i]) for i in idx],
                    "alt": [float(alt[i]) for i in idx],
                    "fullCount": int(len(idx_valid)),
                    "dropped": int(len(ts) - len(idx_valid)),
                }
            ],
        }

    def report_materials(self):
        """报告页原料。形态与 PX4 版本对齐（前端同一张表渲染）：能给的给，给不了给空。"""
        counts, walked_ok, _off, file_size = self.get_message_type_counts()
        sys_info = {
            "ver_sw": self.fw_label or "ArduPilot",
            "ver_hw": "",
            "sys_name": self.fw.get("vehicle", "") or "",
            "replay": "false",
        }
        return {
            "sysInfo": sys_info,
            "infoDict": [],
            "msgTypeStats": [
                {"code": name, "name": name, "en": "", "desc": "", "count": n} for name, n in sorted(counts.items())
            ],
            "msgTypeWalkOk": bool(walked_ok),
            "msgTypeWalkedBytes": 0,
            "fileSizeBytes": int(file_size),
            "messages": self.get_logged_events(),
            "messagesMulti": [],
            "dropouts": [],
            "params": {str(k): v for k, v in self._params.items()},
            "defaultParams": {},
            # PARM 没有"默认值"机制：前端要按 False 处理（「没记录」≠「与默认一致」）
            "defaultParamsKnown": False,
            "changedParams": self.get_changed_parameters(),
            "phases": [
                {
                    "startSec": round(seg["t_start_us"] / 1e6, 2),
                    "endSec": round(seg["t_end_us"] / 1e6, 2),
                    "navState": seg["nav_state"],
                    "mode": seg["mode"],
                    "armed": seg["armed"],
                }
                for seg in self.get_mode_changed()
            ],
        }


def _is_apm(raw):
    return bytes(raw[:2]) == _APM_MAGIC


def _make_apm(raw, facts_cfg):
    return ApmProvider(raw, facts_cfg)


FORMATS.append((_is_apm, _make_apm, "ArduPilot .bin（AP_Logger）", ApmProvider.log_type))

# PX4 .ulg（ULog）适配器：本项目唯一认识 PX4 的地方
#
# 契约见 providers/api.py。引擎（engine.py / operators.py）不认识
# topic 名、字段名、info 键名、码值，只认这份契约给的东西；要加一种日志格式（ArduPilot .bin）
# 就是再加一个这样的文件，引擎一行不改。
#
# 分工（别混）：
#   · 本文件：怎么从 PX4 日志里把数据取出来，字段名、位解码、版本候选、异常回退、载具身份……
#   · knowledge/px4/facts.yaml：随上游变的纯数据（码表、文案、展示口径、规则元数据）
#   · engine/*.py：与格式无关的机制
#
# 注意本文件是文本拼接进产物里的（没有 import 机制）：直接用 api.py 的
# FORMATS / check_provider，以及 engine.py 注入的那份数据配置（FACTS，由 open_log 传进来）。
# 这里别写出构建期那四个哨兵名（两下划线夹的名字，如 rules/facts/单位表/KB 的占位符原文）：
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
# 别凭直觉改：只有类型码 0（未打标签的开发版）才附 git 短哈希，alpha/beta/RC 不附。
_RELEASE_TYPE_SUFFIX = {64: "-alpha", 128: "-beta", 192: "-rc", 255: ""}

# 地图轨迹的取数声明（读哪个 topic 的哪几列、各按什么量纲换算）在
# knowledge/px4/plot/track.yml，它按「要画什么、从哪几列画」归在 plot/ 下，
# 构建期并进引擎内联的那份数据配置（FACTS，见 engine.py），这里从 \`self._cfg["track"]\` 读。
# 解析逻辑留在本文件（get_flight_track()）：按顺序取第一个存在的候选、剔未定位点、等距抽样，
# 这些是分支，写进 YAML 只能再造一门小语言（见 track.yml 的说明）。

# 列名里像经纬度／高度的：关键词要独立成段（\`^\` / \`.\` / \`_\` 起，\`.\` / \`_\` / \`$\` 止）。
# 不能用裸子串：\`relative_test_ratio\`、\`accelerometer_timestamp_relative\` 里都含 "lat"，
# 于是 \`estimator_selector_status\` / \`sensor_combined\` 会被列成"带经纬度字段的 topic"，
# 而它们跟坐标毫无关系。\`alt\` 同理：\`mode_req_local_alt\`、\`fd_alt\` 是布尔标志，不是高度。
# 这类"听起来合理但是错的"输出正是本节要消灭的东西（见 CLAUDE.md §6.8）。
# 分隔符带上 \`.\`：嵌套字段写成 \`previous.lat\` / \`current.lon\`（position_setpoint_triplet）。
_LATLON_FIELD_RE = _re.compile(r"(^|[._])(latitude|longitude|lng|lat|lon)([._]|$)")
_ALT_FIELD_RE = _re.compile(r"(^|[._])(altitude|alt)([._]|$)")


def _latlon_fields(columns):
    """列名里像经纬度的。

    「这份日志到底有没有坐标」只该看经纬度：高度到处都有（气压计、EKF、失效保护标志位），
    把它们算进来会让对照物里混进一堆与轨迹无关的 topic，反而看不出真答案。
    """
    return [c for c in columns if _LATLON_FIELD_RE.search(str(c).lower())]


def _coord_like_fields(columns):
    """经纬度或高度：「这个 topic 能不能给出坐标」的宽判据（\`_one_track\` 的缺字段文案用）。

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

        # 取数时"要的实例超出日志里有的"这类说明，由 \`take_inst_notes()\` 取走（见 get_series）
        self.inst_notes = []

        # 按 pyulog 的数据来源分组读：各段只读自己那一种来源，都只往 self 上放结果、
        # 不碰 facts。顺序有一处硬约束：\`_read_logged_messages()\` 要用 \`_read_data_list()\` 算出的
        # \`t0_us\` 把消息时间换成相对日志起点的秒数，所以它要排最后；其余互不依赖。
        #   ulog.msg_info_dict      → \`_read_msg_info_dict()\`：版本、载具身份
        #   ulog.initial_parameters → \`_read_initial_parameters()\`：参数里的事实（累计飞行、机架编号）
        #   ulog.data_list          → \`_read_data_list()\`：基准 topic（机型/模式/armed/阶段）
        #                             与全量扫描（时长、轨迹起点、重启、丢包）
        #   ulog.logged_messages    → \`_read_logged_messages()\`：日志消息（含警告/错误级别）
        self._read_msg_info_dict()
        self._read_initial_parameters()
        self._read_data_list()
        self._read_positions()
        self._read_logged_messages()

    # ================= 数据访问层 =================

    def parser_version(self):
        """解析这份日志用的解析器版本（见 \`_read_versions\`）。"""
        return self.parser_version_str

    def platform_label(self):
        """报告头里的固件族名（人读的名字，与 \`log_type\` 那个机器标识不是一个东西）。"""
        return "PX4"

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

    def get_dataset(self, topic, instance=0):
        """某个 topic 某个实例的原样列：{列名: 数组}（含 'field[0]' 这种数组列）。

        原 get_topic_data（2026-09-24 迁移到文档 API 名）。取不到返回 None（不抛异常，契约要求）。
        """
        d = self._find_topic(topic, instance)
        return d.data if d is not None else None

    def get_series(self, ref, instance=slice(None, None), alias=None):
        """按 \`"topic.field"\` 取一条序列（与规则里写的引用形一致）。

        取不到或字段不存在一律返回 None，不抛异常。形态：
          · instance=slice（规则里写 \`topic[:].field\` / \`topic[a:b].field\`，区间含两端）
            区间内的实例。多实例时返回「每实例一组」的列表；只有一个实例时返回那
            一条序列本身（否则单实例字段就得处处写 \`[0]\`，而且 \`q\` 这种"每元素一列"
            的数组字段会被多包一层而读不出来）
          · instance=N（规则里写 \`topic[N].field\`，不写下标就是 0，N 可为负，
            按 Python 语义从末尾数），只取第 N 个实例
          · alias：该字段的备用命名（旧固件改过名），可给字符串或字符串列表
        定长数组字段（如 float32[3] accel_clipping）：pyulog 按 'field[i]' 暴露，
        这里返回每元素一列的列表，缺的元素位置为 None。

        没有"把所有实例拼成一条"这个形态（曾经有，默认就是它）：一条曲线里混着几个
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
        if isinstance(instance, slice):
            self._note_inst_range(ref, instance, len(groups))
        try:
            picked = groups[instance]
        except (IndexError, TypeError):
            return None
        if isinstance(instance, slice):
            # 单实例：直接给那一条（与 \`[0]\` 同形），别让调用方无谓地拆一层
            return picked[0] if len(picked) == 1 else picked
        return picked

    def _note_inst_range(self, ref, instance, n):
        """区间要的实例超出了日志里实际有的 → 记一条说明（取数照截断走，不报错）。

        只提示不报错：区间写宽了通常是作者对这份日志有几路传感器估错了，按能取到的
        画出来仍然是对的结论，但得让人看见"少了几路"，否则会当成全部实例都查过了。
        """
        last = n - 1
        # 文案里报作者写的那个数（可能是负的，表示从末尾数），判越界才换算成非负下标
        lo_w = 0 if instance.start is None else instance.start
        # slice 的上界是闭区间 +1（见 _parse_inst），减回来才是作者写的那个数；None = 到末尾
        hi_w = last if instance.stop is None else instance.stop - 1
        lo = n + lo_w if lo_w < 0 else lo_w
        hi = n + hi_w if hi_w < 0 else hi_w
        if lo >= 0 and hi <= last and lo <= hi:
            return
        self.inst_notes.append(
            "%s 要实例 %d~%d，这份日志只有 0~%d —— 按 %d~%d 取"
            % (ref.partition(".")[0], lo_w, hi_w, last, max(lo, 0), min(hi, last))
        )

    def take_inst_notes(self):
        """取走并清空上面那些越界说明（图取完数统一带出，别串到下一次请求）。"""
        notes = list(self.inst_notes)
        self.inst_notes.clear()
        return notes

    def get_first_existing_column(self, topic, names):
        """只取第一个实例、按候选名取第一个存在的原样列（概览指标兜底取数用）。"""
        cols = self.get_dataset(topic, 0)
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
        """固件约束串：any / ">=1.15" / "<1.15" / ">=1.15,<=1.16"（逗号=与）。

        语法解释在 \`match_version_spec\`（api.py，与 ArduPilot 适配器共用同一份）：
        规则级的适用范围轴与节点级 \`ref(..., when_fw=)\` 共用这一个（同一个概念、
        同一套语法）。版本未知（老日志没写版本号）时不因版本排除，与迁移前
        "按字段存在性判定"一致；写错的约束串先抛出来，不被"版本未知"盖过去。
        """
        if self.fw_minor is None:
            cur = None
        else:
            cur = (self.fw["major"] if self.fw["major"] is not None else 0, self.fw_minor)
        return match_version_spec(cur, spec)

    def get_info_dict(self):
        """(info, info_multi) 二元组：Information Message 键值对 + 多值信息（'M' 消息）。

        原 get_logged_information（迁移到文档 API 名，并把多值信息一起交出：
        报告页的 messagesMulti 从这里取，不再直读 self.ulog，同一份数据不写两条路）。
        """
        return (
            dict(self.ulog.msg_info_dict),
            dict(getattr(self.ulog, "msg_info_multiple_dict", None) or {}),
        )

    def get_initial_parameters(self):
        return getattr(self.ulog, "initial_parameters", {}) or {}

    def get_logged_events(self, t_start=None, t_end=None, level=None, pattern=None):
        """[{tSec, message, level, level_name}]（tSec = 相对日志起点的秒数）。

        原 get_logged_messages（2026-09-24 迁移到文档 API 名），并按契约补四个可选过滤：
        t_start/t_end 是相对秒，level 给单个值或列表，pattern 是大小写不敏感的子串；
        全省 = 全量。过滤条件自相矛盾时返回空列表，"没有满足条件的消息"是个正常答案。

        内容在构造时由 \`_read_logged_messages()\` 算好一次，\`builtin_variables()\` 每条规则都要它，
        每次重建纯属白干。这里返回逐条复制的新 dict：调用方拿到的不能是内部状态。
        """
        out = [dict(m) for m in self._logged_messages]
        if t_start is not None:
            out = [m for m in out if m["tSec"] is not None and m["tSec"] >= t_start]
        if t_end is not None:
            out = [m for m in out if m["tSec"] is not None and m["tSec"] <= t_end]
        if level is not None:
            lv = set(level) if isinstance(level, (list, tuple)) else {level}
            out = [m for m in out if m["level"] in lv]
        if pattern:
            out = [m for m in out if str(pattern).lower() in m["message"].lower()]
        return out

    # ================= 知识引擎查询 API =================
    # 契约见 api.py 的 REQUIRED（docs/develop/engine-api-rework.md 并入）。
    # 取数尽量委托上面已有的方法（同一份数据不写两条路）；新聚合只在没有现成入口时才算。

    def get_start_timestamp(self):
        return int(self.t0_us)

    def get_last_timestamp(self):
        return int(self.t_max_us)

    def get_time_bounds(self):
        return {
            "start_us": int(self.t0_us),
            "end_us": int(self.t_max_us),
            # 从返回的 bounds 推导，不用 self.duration_s：那是显示口径（数据首末、0.1s 精度），
            # 而这里 start_us 是日志头部起点（数据开始前），两个口径差可以超过 0.3s，
            # 查询 API 内部要自洽（guard step 9 就是这条）
            "duration_s": round((int(self.t_max_us) - int(self.t0_us)) / 1e6, 3),
            # 与 RESTART_DETECTED 同一判据（_read_data_list 扫全局数出来的回退 topic 数）
            "has_wraparound": self.restart_topics > 0,
        }

    def get_dataset_description(self, topic=None):
        """消息格式声明（pyulog 的 message_formats）：含这份日志没录到的消息。
        它答"这种格式长什么样"，与 get_topic_meta() 答"这份日志录到了什么"互补。"""
        formats = getattr(self.ulog, "message_formats", None) or {}

        def one(fmt):
            return {
                "name": str(fmt.name),
                "fields": [
                    {
                        "name": str(fn),
                        # 数组字段带上长度（float32[3]），与日志里的写法一致
                        "type": ("%s[%d]" % (t, arr)) if arr else str(t),
                    }
                    for (t, arr, fn) in fmt.fields
                ],
            }

        if topic is not None:
            fmt = formats.get(topic)
            return one(fmt) if fmt is not None else None
        return {str(name): one(fmt) for name, fmt in formats.items()}

    def get_field_dtype(self, topic, field):
        """字段 dtype 名。列名优先直接匹配（含 'q[0]' 这种数组列），取不到再试裸字段名。"""
        for d in self._find_topic_all(topic):
            for name in (field, "%s[0]" % field):
                v = d.data.get(name)
                if v is not None and len(v):
                    return str(getattr(v, "dtype", type(v).__name__))
        return None

    def get_field_sizeof(self, topic, field):
        """单元素字节数（数组字段是每元素的大小）。从格式声明里查基础类型，查不到返回 None。"""
        fmt = (getattr(self.ulog, "message_formats", None) or {}).get(topic)
        if fmt is None:
            return None
        for t, _arr, fn in fmt.fields:
            if fn != field:
                continue
            base = str(t).split("[")[0]
            try:
                return int(ULog.get_field_size(base))
            except Exception:
                return None  # 嵌套复合类型没有定长：如实给 None，不猜
        return None

    def get_field_unit(self, topic, field):
        """源单位（规范名）。表是构建期按"规则/图里写了 unit= 的引用"收录的，
        只含收录过的字段，没收录的返回 None（不是没有单位，是本站不知道）。"""
        return (FIELD_UNITS or {}).get("%s.%s" % (topic, field))

    def get_changed_parameters(self):
        """运行中变更的参数 [{tSec, name, value}]。report_materials 与查询 API 共用这一份。"""
        changed = []
        cp = getattr(self.ulog, "changed_parameters", None)
        if cp is None:
            cp = getattr(self.ulog, "_changed_parameters", [])
        for p in cp:
            changed.append(
                {
                    "tSec": round(int(getattr(p, "timestamp", 0) or 0) / 1e6, 2),
                    "name": str(getattr(p, "name", "")),
                    "value": _json_clean(getattr(p, "value", None)),
                }
            )
        return changed

    def get_home_position(self):
        return dict(self.home_position) if self.home_position else None

    def get_ref_position(self):
        return dict(self.ref_position) if self.ref_position else None

    def get_mode_changed(self):
        """模式变化的连续区间（µs）。切段只在 \`_read_data_list()\` 做一次：
        这里给查询 API 的 µs 形态；报告页阶段条的秒形态由 report_materials 从它换算。"""
        return [dict(seg) for seg in self.mode_runs_us]

    def get_mode_present(self):
        """日志里出现过的所有模式名（用于 conditions.mode 匹配）。"""
        return list(self.modes) if self.modes else []

    def get_armed_changed(self):
        """解锁/上锁的连续区间（µs）。end 不会是 None：日志截止就用最后时间戳封口，
        时序算子用的 ARMED_INTERVALS 才保留 None 的开口语义，两份形态各按各的用途来。"""
        return [{"t_start_us": int(s), "t_end_us": int(e if e is not None else self.t_max_us)} for s, e in self.armed_intervals]

    def get_firmware_version(self):
        return self.fw_label

    def get_version_info(self):
        if self.fw["minor"] is None:
            return None
        return (self.fw["major"], self.fw["minor"], self.fw["patch"], self.fw_release_type)

    def get_version_info_str(self):
        return self.fw_display

    def get_vehicle_identity(self):
        """载具身份。形态稳定：没有的键给空串（None），让消费方按键取而不用探键。"""
        return {
            "vehicle_type": self.vehicle_type,
            "uid": self.uuid or None,
            "hardware": self.fw["hw"] or None,
            "hardware_subtype": self.hw_subtype or None,
            "airframe_id": self.airframe_id,
            "ver_sw_branch": self.ver_sw_branch or None,
        }

    def get_log_integrity(self):
        """完整性聚合：丢包 + 有没有走到文件尾 + 重启 + 损坏标记。
        逐字节统计在这里重跑一次（它还顺带给 msgTypeStats 用；计算很便宜）。"""
        _counts, walked_to_end, _off, _n = self.get_message_type_counts()
        drops = getattr(self.ulog, "dropouts", [])
        return {
            "total_dropout_ms": self.dropout_total_ms,
            "n_gaps": len(drops),
            "gaps": [{"t_us": int(d.timestamp), "duration_us": int(d.duration)} for d in drops],
            "end_reached": bool(walked_to_end),
            "restart_topics": self.restart_topics,
            "has_file_corruption": bool(getattr(self.ulog, "file_corruption", False)),
        }

    def has_file_corruption(self):
        return bool(getattr(self.ulog, "file_corruption", False))

    def is_log_ok(self):
        """日志完整性：文件无损坏 且 解析走到文件尾。"""
        _, walked_to_end, _, _ = self.get_message_type_counts()
        return not self.has_file_corruption() and bool(walked_to_end)

    def builtin_variables(self):
        """内置变量表。每次返回新 dict（引擎会往里写 compute 的输出）。

        键一律大写（见 api.py 的 BUILTIN_VARIABLES）：规则里自己赋的变量是小写。
        """
        return {
            "VEHICLE": self.vehicle_type,
            "DURATION_S": self.duration_s if self.duration_s is not None else 0,
            "ARMED_S": self.armed_duration_s,
            "T0_US": self.t0_us,
            "DROPOUT_MS": self.dropout_total_ms,
            # ---- 知识引擎内置变量（api.py 的 BUILTIN_VARIABLES；缺的给 None/空串，不编值）----
            "SYS_UUID": self.uuid,
            "AIRFRAME_ID": self.airframe_id,
            "HOME_LAT": self.home_position["lat"] if self.home_position else None,
            "HOME_LON": self.home_position["lon"] if self.home_position else None,
            "HOME_ALT": self.home_position["alt"] if self.home_position else None,
            "SW_VER": self.fw_label,
            "SW_VER_HASH": self.ver_sw,
            "HW_VER": self.fw["hw"],
            "HW_VER_SUBTYPE": self.hw_subtype,
            "FLIGHT_TIME_S": self.vehicle_life_s,
        }

    def get_report_facts(self):
        """报告头的离散事实（机型 / 固件 / 时长 / 模式 / 载具身份……）。"""
        return self._collect_facts()

    # ================= 可选能力 =================

    def has_data_appended(self):
        """日志是否带追加数据段（pyulog 的同名 property，读 ULog 头部的追加偏移表）。"""
        return bool(getattr(self.ulog, "has_data_appended", False))

    def get_parameter_description(self, name=None):
        """参数说明。v1 返回 None：参数字典（min/max/desc）是构建期从 meta 摘出来的
        静态 JSON，由前端在「飞控参数」tab 按需拉取，没进引擎，这里没有数据源，
        返回 None 如实说"给不出"，不冒充查过。"""
        return None

    def get_logged_dropouts(self):
        return [
            {"tSec": round(int(d.timestamp) / 1e6, 2), "durationMs": int(d.duration)}
            for d in getattr(self.ulog, "dropouts", [])
        ]

    def get_message_type_counts(self):
        """逐条走 ULog 的 [uint16 消息长度][uint8 消息类型] 序列，统计每类消息的条数。

        刻意不走 pyulog 的解析结果：pyulog 只留它认得的东西（把 M 的续行并进同一组、
        按话题聚合 D…），这里要回答的是"文件里究竟有多少条"，顺带当"文件是否被截断"的旁证。
        走到尾部长度对不上就停下并标记，不硬猜。
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

    def get_decoded_events(self, t_start=None, t_end=None, level=None, pattern=None):
        """PX4 事件（\`event\` topic）解码。解不出返回 None。

        pyulog 的 PX4Events 用日志自带的 metadata_events（那个 xz blob 就是这份固件的
        事件定义），所以不联网、与固件版本严格对应；定义里没有的 ID 显示
        [Unknown event with ID N]。Flight Review 的 Logged Messages 表就是
        "解码事件 + 文本消息"两路合并，这里对齐它。过滤参数与 get_logged_events 同义
        （t_start/t_end 相对秒、level 数值、pattern 子串）。
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
            return self._filter_event_list(out, t_start, t_end, level, pattern)
        except Exception:
            return None

    def _filter_event_list(self, out, t_start, t_end, level, pattern):
        """get_decoded_events 的过滤（与 get_logged_events 同一套语义，事件条目也带 tSec/level/message）。"""
        if t_start is not None:
            out = [m for m in out if m["tSec"] is not None and m["tSec"] >= t_start]
        if t_end is not None:
            out = [m for m in out if m["tSec"] is not None and m["tSec"] <= t_end]
        if level is not None:
            lv = set(level) if isinstance(level, (list, tuple)) else {level}
            out = [m for m in out if m["level"] in lv]
        if pattern:
            out = [m for m in out if str(pattern).lower() in m["message"].lower()]
        return out

    def get_flight_track(self, max_points=None):
        """地图轨迹（可以多条）：每条轨道按声明取数、换算、剔除未定位采样、等距抽样。

        声明来自 \`knowledge/px4/plot/\` 里 \`container: map\` 的那个预设（构建期编译进数据配置）：

            children:
              - label: gps                 # 图例名
                max_points: 1500
                lat: {cands: ["sensor_gps[0].latitude_deg", …], unit: "deg"}
                lon / alt 同形

        坐标取数走引擎的 \`_pick_ref\`（候选组按存在性挑、单位换算），与规则、曲线同一套。
        单条轨道取不到就跳过它；一条都没有才返回 \`error\`（保留 \`tracks: []\`，形状稳定）。

        取不到时要说清"缺什么"（\`errorReasons\` 逐条列出：哪个 topic 不在、缺哪个字段、
        还是"有采样但全程未定位"）。以前这里只给一句"声明里的坐标候选都不在日志里"，
        而那只对应其中一种原因，日志里有 \`vehicle_gps_position\` 但全程没拿到 3D 定位时，
        这句话是错的，用户还拿不到任何能自己判断的线索。见 CLAUDE.md §6.8。
        """
        cfg = self._cfg.get("track")
        if not cfg or not cfg.get("children"):
            return {"error": "这份格式没有声明轨迹取数来源（knowledge/px4/plot/track.yml）"}
        # ① 先过声明里的闸门（\`conditions.topics\`，构建期从预设搬到 facts.track）：一个都不在
        #    日志里时，这份预设本就不适用，该说的是"缺哪个 topic"而不是"坐标候选取不到"。
        #    文案复用 \`engine._missing_topics\`，规则与绘图预设共用这一处，别在这儿再写
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

        \`error\` 带上最后一条原因（给"只看一行"的消费方：日志、非界面接口），完整清单在
        \`errorReasons\`（界面按列表渲染）。为什么是最后一条：候选按优先级依次试，最后试的
        那个才是把整串试完的那一个，它前面几条只是"为什么跳过了它"。把第一条当结论，
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
        # 无从下手，有对照物才看得出是固件版本不同，还是字段改了名
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

        挑判据用字段而不是 topic 名：用户真正要问的是"这份日志里到底有没有坐标"，
        只列 \`vehicle_local_position\` 这种名字看不出它只有参考原点 \`ref_lat/ref_lon\`、
        没有逐点经纬度，而那恰恰是"为什么画不出轨迹"的答案。

        判据见 \`_latlon_fields\`（关键词独立成段、只看经纬度不看高度）。写成裸子串 \`"lat" in name\`
        会让 \`relative_test_ratio\` 里的 "lat" 混进来，列出 \`estimator_selector_status\` 这种
        与坐标无关的 topic，比不给对照物更糟，因为它听起来很具体。
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

        三个坐标与时间戳得来自同一个 topic 的同一个实例：候选顺序即优先级，取第一个
        "lat / lon / alt 三样都能给齐"的 topic 生效。不这么定的话，三路的采样率不同、数组
        长度不同，\`lat[i]\` 与 \`alt[i]\` 根本不是同一时刻，画出来是错的。

        失败原因是要给用户看的，所以每一句都得落到具体的 topic / 字段上：
        "缺字段"要说缺哪个、这个 topic 的坐标字段实际叫什么；"全是未定位"要说清几个采样、
        几个有效，用户据此才能判断是固件版本不同、字段改了名，还是这次飞行压根没上星。
        """
        limit = int(max_points or child.get("max_points") or 1500)
        why = []
        for cand in child["lat"]["cands"]:
            bare, inst = _split_ref(cand)
            topic = bare.partition(".")[0]
            if isinstance(inst, slice):
                continue  # 构建期就要求写死实例；这里防御性跳过
            cols = self.get_dataset(topic, inst)
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
            # GPS 没定位时的采样要剔掉：PX4 在拿到定位前会连着记 lat=lon=0（几内亚湾那个"空岛"），
            # 一条直线就从那儿连到真正的航迹上，地图上看着完全不对（实测用户日志就是这样）。
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
        """报告页要的几块原料（不是某一个 tab 的 payload，四个 tab 各取所需）。

        系统消息取 infoDict / msgTypeStats / msgTypeWalkOk；事件消息取 messages / messagesMulti；
        飞控参数取 params / defaultParams / changedParams；阶段条取 phases。

        所以这个方法的边界是「该格式能提供哪些原料」，由前端按 tab 取用。为什么不由数据层拼：
        原料的形态是格式专有的：'I' 信息字典、'L' 文本消息与 event 解码结果合并成一条时间轴、
        'M' 多值信息怎么拼回文本、'Q' 默认值怎么推、逐字节的消息类型统计……换一种日志格式
        就是另一套。
        """
        info, info_multi = self.get_info_dict()  # 走契约能力取，别再直读 self.ulog（同一份数据两处知识）
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

        # Logged String Message（'L'）。PX4 对事件会同时写两样：一条事件（二进制，进
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
        # 没有解码结果（固件没带事件定义）就保留，否则 armed / takeoff 这类关键节点会凭空消失。
        if not events:
            messages += legacy_dupes
        all_messages = sorted(messages + events + messages_tagged, key=lambda m: m["tSec"])

        # Multi Information：键 → 多组值，没有时间戳。组内怎么拼回文本要看形态：
        #   · 逐行型（perf_counter / perf_top…）：每段是一行完整文本，PX4 不给行尾换行，
        #     段之间补 \n，否则所有行黏成一行；
        #   · 流式型（boot_console_output）：一整段控制台文本按定长切片，换行在段内部，
        #     一行还可能跨段，只能直接拼接，补 \n 会凭空断行。
        # 判据：任一段自带换行 → 流式；否则逐行。实机日志两种键都出现过，别按一种写死。
        multi_src = info_multi
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
        # 固件默认」三者，只写与当前值不同的那个（logger.cpp: write_parameter_defaults），
        # 于是「有记录」等价于「该参数被改过」，且记录里的默认值必然与当前值不同；
        # 反过来「没记录」表示当前值与两个默认都相同。
        # 位含义见 ulog_parameter_default_type_t：bit0 = system（固件出厂默认），
        # bit1 = current_setup（机架配置 + 自定义默认文件）。
        default_params = {}
        get_defaults = getattr(self.ulog, "get_default_parameters", None)
        if get_defaults is not None:
            for bit, field in ((0, "system"), (1, "setup")):
                for key, val in (get_defaults(bit) or {}).items():
                    default_params.setdefault(str(key), {})[field] = clean(val)

        changed = self.get_changed_parameters()

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
            # 阶段条：从 get_mode_changed() 的 µs 形态换算成秒，切段只有 _read_data_list 一处
            "phases": [
                {
                    "startSec": round(seg["t_start_us"] / 1e6, 2),
                    "endSec": round(seg["t_end_us"] / 1e6, 2),
                    "navState": seg["nav_state"],
                    "mode": seg["mode"],
                    "armed": seg["armed"],
                }
                for seg in self.get_mode_changed()
            ],
        }

    # ================= 内部：解析与事实 =================

    def _find_topic(self, topic, instance):
        """该 topic 该实例那份数据；没有就 None。"""
        for d in self.ulog.data_list:
            if d.name == topic and d.multi_id == instance:
                return d
        return None

    def _find_topic_all(self, topic):
        """该 topic 的全部实例（多实例拼接用）。"""
        return [d for d in self.ulog.data_list if d.name == topic]

    @staticmethod
    def _first_field(ds, *names):
        """按 names 的顺序取第一个存在的字段（旧固件改过名时靠它回退）。

        取不到（名字不在这份日志里）返回 None，不抛异常，契约要求"取不到一律 None"，
        引擎按"数据不足"处理。只咽 KeyError：静默留给"数据缺失"，不留给编程错误
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
        N 就是标题里那个实例序号。缺字段的实例留一个 None 占位，不剔除，剔了会让
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
            # \`field[K]\` 且日志里没有 \`field[K]\` 这一列 → 这是标量序列取第 K 个采样
            # （数组字段走上面的 direct：\`q[0]\` 是 pyulog 的 'q[0]' 列，一整条序列）
            elem = self._element_at(d, field, *aliases)
            if elem is not None:
                groups.append(elem)
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

    @staticmethod
    def _element_at(ds, field, *aliases):
        """\`name[K]\` / \`name[i,j]\` 取不出来 → None（K 越界、列不存在、name 根本不存在都算）。

        \`topic.field[K]\` 是"取第 K 个元素"，元素是什么取决于字段本身：
          · 数组字段（\`q\`、\`accel_clipping\`）：pyulog 直接给了 \`q[K]\` 这一列，是一整条
            序列，走不到这里（\`_read_grouped\` 前面的 direct 就命中了）
          · 标量序列（\`ref_alt\`、\`z\`）：日志里没有 \`ref_alt[K]\` 列，这里按第 K 个采样
            取一个标量。相对高度那类"拿首值当基准"的算式靠它：\`ref_alt[0] - ref_alt\`

        \`field[i,j]\` 是二维下标：i 是行、j 是列。数组字段在 pyulog 里存成"每列一条序列"
        （\`q[0]\`、\`q[1]\`…），所以行 = 第几个采样（随时间递进）、列 = 第几路信号，
        \`q[10,2]\` 就是"第 10 个采样时刻、第 2 列"那个值。
        """
        m2 = _re.match(r"^(.+)\[(\d+),(\d+)\]$", field)
        if m2:
            stem, i, j = m2.group(1), int(m2.group(2)), int(m2.group(3))
            for name in ["%s[%d]" % (stem, j)] + ["%s[%d]" % (a, j) for a in aliases]:
                try:
                    v = ds.data[name]
                except KeyError:
                    continue
                if v is None:
                    continue
                return float(v[i]) if i < len(v) else None
            return None
        m = _re.match(r"^(.+)\[(\d+)\]$", field)
        if not m:
            return None
        stem, k = m.group(1), int(m.group(2))
        for name in [stem] + list(aliases):
            try:
                v = ds.data[name]
            except KeyError:
                continue
            if v is None:
                continue
            return float(v[k]) if k < len(v) else None
        return None

    def _level_str(self, m, lvl):
        try:
            return str(m.log_level_str())
        except Exception:
            return self._level_names.get(lvl, "LEVEL %d" % lvl)

    def _read_msg_info_dict(self):
        """从 \`ulog.msg_info_dict\`（PX4 的 Information Message）读版本与载具身份。

        ver_sw_release 的打包：major<<24 | minor<<16 | patch<<8 | 类型。
        """
        # pyulog 1.2 起不再暴露 \`__version__\` 属性（迁到分发元数据），只查属性会把整个
        # 1.2.x 一律报成 \`unknown\`。这个串是给人判断"这份日志是哪版解析器读的"用的，
        # 报 unknown 等于把信息丢掉，所以再兜一层 importlib.metadata。
        # 兜底失败仍回 unknown：Pyodide 里未必装得出分发元数据，不能因此让报告生成失败。
        _pv = getattr(pyulog, "__version__", None)
        if not _pv:
            try:
                from importlib.metadata import version as _dist_version

                _pv = _dist_version("pyulog")
            except Exception:
                _pv = "unknown"
        self.parser_version_str = "pyulog/%s" % _pv

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

        # 载具身份：与判定无关，但历史卡片与报告概况要用，且得随 report 存档
        # （派生数据 info 不进存档）。用分支/标签（如 damiao_dm-fc01_v1.15.0）比 commit
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
        # 机架编号（SYS_AUTOSTART，如 4040），机型之外再给一个可查的标识
        af = p.get("SYS_AUTOSTART")
        self.airframe_id = int(af) if af is not None else None

    def _read_data_list(self):
        """读 \`ulog.data_list\`（各 topic 的时序）与 \`ulog.dropouts\`，得出报告头的离散量。

        分两部分：先读基准 topic \`vehicle_status\`（机型 / 模式 / armed 区间 / 飞行阶段），
        再扫全局（总时长与时间基准、记录起始 UTC、数据质量）。这个 topic 只读这一处，
        需要切段的都在同一批数组上算完，模式切段（\`get_mode_changed()\` 与报告页阶段条同源）在这里一次做完。
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
        # nav_state_names），列表的"飞行模式"列按 Flight Review 的口径列出全部模式。
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
        armed_intervals, phases_present, mode_runs_us = [], set(), []
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
                    mode_name = self._nav_names.get(code, "Mode %d" % code)
                    # get_mode_changed() 的 µs 形态（查询 API，单一切段器）；
                    # 报告页阶段条的秒形态由 report_materials 从它换算，别再写第二个切段器
                    mode_runs_us.append(
                        {
                            "t_start_us": int(vts[lo_i]),
                            "t_end_us": int(vts[hi_i]),
                            "nav_state": code,
                            "mode": mode_name,
                            "armed": seg_arm == _ARMING_STATE_ARMED,
                        }
                    )

            trans_mode = self._first_field(vs, "vtol_in_trans_mode")
            if trans_mode is not None and int(np.max(np.asarray(trans_mode))) > 0:
                phases_present.add("vtol_transition")

        self.armed_intervals = armed_intervals
        self.armed_duration_s = armed_duration_s
        self.phases_present = phases_present
        self.mode_runs_us = mode_runs_us

        # ---- 扫全局：总时长与时间基准 ----
        # 时间基准是开机以来的秒数（PX4 时间戳本身就是开机起的微秒），这里不换算，
        # 只记录起点供事件类算子算相对时刻。
        t_min, t_max = None, None
        for d in ulog.data_list:
            t = self._first_field(d, "timestamp")
            if t is not None and len(t) > 1:
                a, b = float(t[0]), float(t[-1])
                t_min = a if t_min is None else min(t_min, a)
                t_max = b if t_max is None else max(t_max, b)
        self.t0_us = int(getattr(ulog, "start_timestamp", 0) or (t_min or 0))
        # 最后一条消息的时间戳：get_time_bounds() / get_armed_changed() 封口用
        self.t_max_us = int(t_max) if t_max is not None else self.t0_us
        self.duration_s = round((t_max - t_min) / 1e6, 1) if t_min is not None else None

        # ---- 扫全局：记录起始的 UTC 时刻 ----
        # 取 GPS 首次给出有效时间的那一刻（比 boot_time_utc_us 可靠，后者要飞控对过时）。
        # topic 按 plot/ 里地图声明的候选顺序取第一个存在的（构建期已按声明编译好 topics），
        # 与 get_flight_track() 同一优先级，两处别各挑各的。
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

    def _read_positions(self):
        """读 Home 点与参考原点。两个不同概念，别混：

          · ref（参考原点）：局部 NED 坐标的原点，\`vehicle_local_position\` 的
            \`ref_lat/ref_lon/ref_alt\`（EKF 对齐后的第一组非零值）。
          · home（Home 点）：解锁/起飞的位置，取 \`vehicle_global_position\` 的首个有效
            定位，armed 起点之后的第一个优先，全程没解锁就退回全程第一个。
            与轨迹取数同一套合法性判据（非 0 非 NaN、范围合法），没有 fix_type 可看。

        两份结果都缓存（builtin_variables 每条规则都取 HOME_*），构造期算一次。
        """
        self.home_position = None
        self.ref_position = None

        vgp = self._find_topic("vehicle_global_position", 0)
        if vgp is not None:
            lat = self._first_field(vgp, "latitude", "lat")
            lon = self._first_field(vgp, "longitude", "lon", "lng")
            alt = self._first_field(vgp, "altitude", "alt")
            if lat is not None and lon is not None and alt is not None and len(lat):
                a_lat = np.asarray(lat, dtype=float)
                a_lon = np.asarray(lon, dtype=float)
                a_alt = np.asarray(alt, dtype=float)
                valid = np.isfinite(a_lat) & np.isfinite(a_lon) & np.isfinite(a_alt)
                valid &= (np.abs(a_lat) <= 90.0) & (np.abs(a_lon) <= 180.0)
                valid &= ~((np.abs(a_lat) < 1e-7) & (np.abs(a_lon) < 1e-7))
                idx = np.nonzero(valid)[0]
                if len(idx):
                    # armed 起点之后的第一个有效点更接近"Home"；没有 armed 段就取全程第一个
                    pick = int(idx[0])
                    if self.armed_intervals and self.armed_intervals[0][0] is not None:
                        vts = np.asarray(self._first_field(vgp, "timestamp"), dtype=np.int64)
                        after = idx[vts[idx] >= self.armed_intervals[0][0]]
                        if len(after):
                            pick = int(after[0])
                    self.home_position = {
                        "lat": float(a_lat[pick]),
                        "lon": float(a_lon[pick]),
                        "alt": float(a_alt[pick]),
                        "source": "vehicle_global_position",
                    }

        vlp = self._find_topic("vehicle_local_position", 0)
        if vlp is not None:
            r_lat = self._first_field(vlp, "ref_lat")
            r_lon = self._first_field(vlp, "ref_lon")
            r_alt = self._first_field(vlp, "ref_alt")
            if r_lat is not None and r_lon is not None and r_alt is not None and len(r_lat):
                a_lat = np.asarray(r_lat, dtype=float)
                a_lon = np.asarray(r_lon, dtype=float)
                a_alt = np.asarray(r_alt, dtype=float)
                idx = np.nonzero((a_lat != 0) & (a_lon != 0) & np.isfinite(a_lat) & np.isfinite(a_lon))[0]
                if len(idx):
                    pick = int(idx[0])
                    self.ref_position = {
                        "lat": float(a_lat[pick]),
                        "lon": float(a_lon[pick]),
                        "alt": float(a_alt[pick]),
                        "source": "vehicle_local_position.ref_*",
                    }

    def _read_logged_messages(self):
        """读 \`ulog.logged_messages\`：日志消息（PX4 的 \`[模块] 文案\`，含警告 / 错误级别）。

        得排在 \`_read_data_list()\` 之后：tSec 是相对日志起点的秒数，要用它算出的 \`t0_us\`。
        为什么在构造期算而不是每次现算：\`builtin_variables()\` 里就有 \`messages\`，而 \`builtin_variables()\`
        被 \`_rule_env()\` 每条规则各调一次，不缓存就是每条规则重建一遍同一份列表。

        level 是 ULog 里的原始字节，PX4 填的是 ASCII 数字（'3'=51 才是 ERROR），
        与 pyulog 的 Message.log_level_str() 一致；因此经验文件按 level_name 判定，
        不要直接和 3/4 这种数字比（迁移前就是这么比错的，导致消息类经验从不命中）。
        """
        out = []
        for m in getattr(self.ulog, "logged_messages", []):
            try:
                ts_s = round((int(m.timestamp) - self.t0_us) / 1e6, 2)
            except (AttributeError, TypeError, ValueError):
                # 这条消息没有可用的 timestamp（pyulog 各版本给的东西不一致）：只丢相对时刻，
                # 消息本身照留。不写 except Exception：\`t0_us\` 要是设错了，那是 bug，
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

        facts 的键名只在这一个地方出现：三段各管"从日志里读什么"（只往 self 上放），
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


FORMATS.append((_is_ulog, _make_px4, "PX4 ULog（.ulg）", Px4Provider.log_type))

# ============================================================================
# 引擎本体：规则框架 + 报告页数据层，与日志格式无关
#
# 第一部分（规则框架）做四件事：调度规则、求值表达式、调算子、发射 finding。
# 第二部分（报告页数据层）做三件事：按需抽时序（+ LTTB 降采样）、交给前端、
# 把格式专有的整块内容转出去。两部分都不认识任何 topic 名 / 字段名 / 码值，
# 那些全在 providers/<格式>.py 与 knowledge/<格式>/facts.yaml 里。判据：本文件里
# grep 不到 \`vehicle_\` / \`ver_sw\` / \`cpuload\` 之类的名字
# （tools/engine/check_rules_fields.py 有一条检查盯着）。
#
# 数据从哪来：providers/api.py 的契约。provider 由 open_log() 按文件头挑出来，
# 本文件只调它的 get_topic_meta/get_dataset/get_series/has_topic/match_version/
# get_info_dict/get_initial_parameters/get_logged_events/
# builtin_variables/get_report_facts 与可选能力，不碰 pyulog 对象。
#
# 装载方式：本文件与 operators/providers 跑在同一个 __main__ globals 里。
# 浏览器由 analysis-worker.ts 整段执行拼接产物，本地由 loader.py 同序拼接，
# 所以直接用那边建好的 \`provider\`。
# ============================================================================

import json
import ast
import math
import re
import numpy as np

# ============================================================================
# 第一部分：规则框架
# ============================================================================

# ---------------- 这一份日志该用哪一套知识 ----------------
# 知识是按固件族分开的：knowledge/px4/ 与 knowledge/ardupilot/ 各有自己的规则、
# 数据文件、故障库与单位表，构建期把它们内联成 \`{log_type: ...}\` 的形状。
# 而"用哪一套"取决于这份日志是什么格式，所以先看文件头（detect_log_type），再取下标。
# 顺序不能倒：open_log() 要拿 FACTS 去构造 provider，而 FACTS 又得先知道格式。
_LOG_TYPE = detect_log_type(bytes(ulog_bytes))
if _LOG_TYPE is None:
    raise ValueError("不认识的日志格式（连探测器都没认出来），见 providers/api.py 的 FORMATS")

_LOG_TYPE_KNOWLEDGE = {
    "fault_kb": __FAULT_KB__,
    "rules": json.loads(r"""__RULES__"""),
    "facts": json.loads(r"""__FACTS__"""),
    "field_units": __FIELD_UNITS__,
}

# 故障知识库（构建期内联，第三层检索用）
FAULT_KB = _LOG_TYPE_KNOWLEDGE["fault_kb"].get(_LOG_TYPE, [])

# ---------------- 经验规则（rules/*.yaml 编译而来）----------------
RULES = _LOG_TYPE_KNOWLEDGE["rules"].get(_LOG_TYPE, [])

# ---------------- 那一份数据文件（knowledge/<格式>/facts.yaml 编译而来）----------------
# 码表、文案、展示口径、规则元数据、执行顺序都在里面；引擎只提供机制。
# 它同时也是 provider 的数据源（随 open_log 一起传进去）。
# 按 JSON 解析（与 RULES 同款）：它里面可能有 true / false / null（绘图预设的开关），
# 那些不是合法的 Python 字面量，当字面量注入会直接 NameError。
FACTS = _LOG_TYPE_KNOWLEDGE["facts"].get(_LOG_TYPE, {})

# ---------------- 字段单位表（构建期查好的，只含写了 unit= 的引用涉及的字段）----------------
# 源单位从 meta/<tag>.json 查（经 meta/topic-map.yaml 换字典键）、meta/topic-overrides.yaml
# 可补/纠。查不到的构建期会告警并在产物里留空，这里拿不到就不换算。
# 键是 \`topic.field\`（日志里的名字，不是字典键），值是规范化后的单位名（见 _UNIT_FACTORS）。
# 换算是"声明了才做"：APM 那份是空的（它的单位声明在 FMTU 里、没核对过），
# 于是 APM 规则取到什么就是什么，不换算比换算错好。
FIELD_UNITS = _LOG_TYPE_KNOWLEDGE["field_units"].get(_LOG_TYPE, {})

# 同一 group 内多条规则按 order 字段排序（缺省 100000，再按 id 兜底）。
# 跨 group 的顺序不在这里决定：由 facts.yaml 的 group_order 决定（见文件末尾的执行循环），
# 而 finding 的 id（F01、F02…）按发射顺序生成，所以改 group_order 会改报告里的编号。
RULES.sort(key=lambda r: (r.get("order", 100000), r.get("id", "")))

# 预分组：避免 _run_rules 每次遍历全部 RULES（O(n×m) → O(n)）
_RULES_BY_GROUP = {}
for _rule in RULES:
    _g = _rule.get("group")
    if _g not in _RULES_BY_GROUP:
        _RULES_BY_GROUP[_g] = []
    _RULES_BY_GROUP[_g].append(_rule)

# 阈值不再集中存放：每条经验的判定阈值都写在它自己的 rules/*.yaml 里
# （px4-thresholds.toml 已退场）。本文件只保留引擎级格式常量。

# ---------------- 打开日志（挑适配器 + 契约自检）----------------
provider = open_log(bytes(ulog_bytes), FACTS)

# 下面这批累加器由 run_all()（文件末尾）在入口重置。声明留在模块级是因为
# add / add_tag / ran / skipped / _run_rules 都直接往它们里追加（靠模块名字找），
# 入口只重绑，不改变这些辅助函数的写法。
findings = []
checks_run = []
checks_skipped = []
tags = []  # 第二层异常标签（喂给第三层故障库匹配）
guard_tags = []  # 数据质量/边界标签
_fid = [0]
# 阶段集合来自 provider（规则层 phase 判定用），在 run_all() 里填充
phases_present = set()
# 规则顺带产出的实测值（概览指标优先用它们，见 run_all 里的指标组装）
metrics = {}


def add_tag(t):
    if t not in tags:
        tags.append(t)


def add(rule_id, severity, label, description, evidence, suggestion=None, docurl=None):
    _fid[0] += 1
    f = {
        "id": "F%02d" % _fid[0],
        "severity": severity,
        "ruleId": rule_id,
        "label": label,
        "description": description,
        "evidence": evidence,
    }
    if docurl:
        f["docUrl"] = docurl
    if suggestion:
        f["suggestion"] = suggestion
    findings.append(f)
    if label:
        add_tag(label)


def skipped(rule_id, reason):
    item = {"ruleId": rule_id, "reason": reason}
    if item not in checks_skipped:
        checks_skipped.append(item)


def ran(rule_id):
    if rule_id not in checks_run:
        checks_run.append(rule_id)


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
    ast.BitAnd,
    ast.BitOr,
    # 下标：arr[mask]（布尔索引替换 apply_mask）、arr[0] / arr[-1]（单元素）、arr[:] 等
    ast.Subscript,
    ast.Slice,
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

# 表达式里唯一放行的函数调用。\`has_topic('x')\` 比 \`'x' in topics\` 直白，
# 但把它做成函数就意味着要开"允许调用"这个口子，所以白名单只此一项、
# 且要求实参是字符串字面量。其余能力（属性/下标/推导式）一律不给。
_EXPR_CALLABLE = {"has_topic", "log_ok"}


def _eval_expr(expr, env):
    """受限表达式求值：先按白名单遍历 AST，再在空 __builtins__ 下求值。

    不会 eval 用户可控代码：不允许属性访问、下标、推导式；函数调用只放行
    \`_EXPR_CALLABLE\` 里的那几个。\`has_topic\` 实参需要是字符串字面量；\`log_ok\` 无参。
    """
    tree = ast.parse(expr, mode="eval")
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise ValueError("表达式含不允许的语法 Call.unknown_func：%s" % expr)
            ok = node.func.id in _EXPR_CALLABLE
            if node.func.id == "log_ok":
                arg_ok = len(node.args) == 0
            else:
                arg_ok = len(node.args) == 1 and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str)
            if not (ok and arg_ok and not node.keywords):
                raise ValueError("表达式里只允许 %s：%s" % ("/".join(sorted(_EXPR_CALLABLE)), expr))
            continue
        if not isinstance(node, _ALLOWED_NODES):
            raise ValueError("表达式含不允许的语法 %s：%s" % (type(node).__name__, expr))
    return eval(compile(tree, "<rule>", "eval"), {"__builtins__": {}}, env)


def _placeholder_reason(spec):
    """\`conditions.placeholder\`：这条经验还没实现，引擎别跑它。

    为什么要有这个一等字段：2026-09 之前占位是把一句字符串字面量塞进 \`precheck\`
    （构建期剥引号放行、运行期恒真），能工作，但把"未实现"伪装成"先决条件命中"，
    报告里那句原因看着像判据，其实是施工告示。\`precheck\` 退役后占位单独成字段，
    语义和文案都对得上了。

    写法就是一个字符串（原因文案），\`true\` 给一句缺省文案。没写 → None。
    """
    if isinstance(spec, str) and spec.strip():
        return spec.strip()
    if spec is True:
        return "本条尚未实现"
    return None


def _match_mode(spec):
    """conditions.mode：要求日志里出现过某模式（名）。

    一项里写 \`AUTO || LOITER\` 表示任一出现过即满足；写成两项就要求都出现过。
    匹配的是"日志里出现过"（\`provider.get_mode_present()\`），不是"当前处于"，规则看的是
    整段日志，不是一个时刻。

    返回缺失项的原因文案（\`"AUTO / LOITER 未在日志中出现"\`），满足则返回 None。
    注意：日志没有模式段时 \`get_mode_present()\` 返回空列表，写了 mode 约束就会跳过，
    这是故意的：拿不到模式就去跑只适用于某模式的阈值，只会误报。
    """
    present = set(provider.get_mode_present() or [])
    for candidates in spec or []:
        if isinstance(candidates, str):
            candidates = [t.strip() for t in candidates.split("||")]
        if not any(m in present for m in candidates):
            return " / ".join(str(c) for c in candidates) + " 未在日志中出现"
    return None


def _match_armed(spec, env):
    """\`conditions.armed\`：解锁条件（取代原先写在 \`precheck\` 里的 \`HAS_ARMED\` 那半）。

    - 不写 / \`any\`：不限（缺省）
    - \`true\`：要有 armed 段；\`false\`：要全程未解锁
    - \`">12"\` / \`">=12"\` 这类带比较符的串：对 \`ARMED_S\`（解锁总时长，秒）求值
    - 写数字 \`12\`：等价 \`>= 12\`

    判据算不出来（语法写错、\`ARMED_S\` 是 None）当作不满足并跳过，这里与当初
    \`precheck\` 的取向相反（那边是"宁可多跑一条"）：门槛是作者明确写的，拿不到数还跑，
    等于在没解锁的日志上套用只适用于飞行段的阈值，会误报。

    返回原因文案，满足则返回 None。
    """
    if spec is None:
        return None
    # 布尔与字符串 "true"/"false" 同义（YAML 里两种写法都会出现，别让作者猜）
    want = None
    if isinstance(spec, bool):
        want = spec
    elif isinstance(spec, str) and spec.strip().lower() in ("true", "false"):
        want = spec.strip().lower() == "true"
    if want is not None:
        if want == bool(env.get("HAS_ARMED")):
            return None
        return "本条只在有解锁段时适用" if want else "本条只在全程未解锁时适用"
    txt = str(spec).strip()
    if txt == "" or txt.lower() == "any":
        return None
    expr = "ARMED_S %s" % txt if txt[0] in "<>=!" else "ARMED_S >= %s" % txt
    try:
        if _eval_expr(expr, env):
            return None
    except Exception:
        return "解锁时长判据算不出来：%s" % txt
    return "解锁时长不满足 %s（实际 %s s）" % (txt, env.get("ARMED_S"))


def _vehicle_label(spec):
    """机架约束的展示写法（只用于 skipped 文案）：列表用 \` / \` 连接。"""
    if isinstance(spec, list):
        return " / ".join(str(s).strip() for s in spec)
    return str(spec).strip()


def _match_vehicle(spec, env):
    """机架适用范围：\`any\` ｜ 单个机架名 ｜ 列表（如 \`[quad, hexa]\`）。

    支持类别简写（如 \`copter\`、\`plane\`、\`rover\`）：取 provider 的
    \`vehicle_categories\` 属性把类别名映射到精确名集合。
    """
    if isinstance(spec, str):
        name = spec.strip()
        if name == "any":
            return True
        wanted = [name]
    elif isinstance(spec, list):
        if not spec:
            raise ValueError("vehicle 列表为空（不限就写 any）")
        wanted = [str(s).strip() for s in spec]
    else:
        raise ValueError("vehicle 只能是 any / 机架名 / 列表，收到 %r" % (spec,))
    current = (env or {}).get("VEHICLE")
    if current is None:
        return False
    current = str(current)
    categories = getattr(provider, "vehicle_categories", {})
    for w in wanted:
        if w in categories:
            if current in categories[w]:
                return True
        elif current == w:
            return True
    return False


def _missing_topics(spec):
    """\`conditions.topics\` 的判定：每项是「候选 topic」，项间是「都要有」。

    一项里有多个候选（YAML 里写成 \`vehicle_gps_position || sensor_gps\`）时，
    其中任意一个在日志里就算满足；两个都不在才跳过。命中第一项即中止，
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

    与 \`_ref\` 是同一件事，区别只在回传命中的是哪个字段：地图轨迹要用它去同一 topic 上
    取时间戳与定位类型（\`fix_type\`），图上的时间轴也要。\`instance\` 非 None 时覆盖引用里
    写的实例切片（图上"每实例一个面板"用：声明里写 \`[:]\`，具体画第几个由这一层定）；
    写死的 \`[N]\`、以及不写下标（= 实例 0）都不受它影响。
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
      \`topic.field\`     只取第 0 个实例（与 \`topic[0].field\` 同义）。要别的实例
                          就写明；要"所有实例"得写 \`[:]\`
      \`topic[:].field\`  所有实例。多实例时给「每实例一组」的列表，交给需要分组
                          的算子；只有一个实例时就是那一条序列（与写 \`[0]\` 同形）
      \`topic[a:b].field\` 闭区间，实例 a~b（含 b），如 \`[1:3]\` = 1、2、3
      \`topic[N].field\`  只取第 N 个实例（N 可为负，按 Python 语义从末尾数）
      \`topic.field[N]\`  数组字段的元素下标（如 \`vehicle_attitude.q[0]\`）

    位置参数可以给多个：\`ref("新名", "旧名")\` 是候选组，按顺序取第一个在日志里
    存在的；都没有返回 None，由数据流自己中止。改名的场合一律用它，没有"这个引用只
    适用于某版本"这种写法（升级换代就是"老名字没了、新名字在"，按存在性挑就够；
    真需要按版本分流的语义差异，交给算子或拆成两条规则）。

    修饰：
      alias    字段的备用命名（旧固件改过名），等价于放进候选组
      unit     期望输出的单位：源单位由构建期从 meta/override 查好，这里只做一次
                  乘法。不写就是不换算（无量纲字段）。源单位查不到时构建期已告警，这里
                  按原样给，宁可不换算，也别悄悄乘错系数。

    取数本身由 provider 实现（契约：取不到返回 None，不抛异常），存在性判据就是它。
    要回传"命中的是哪个字段"用 \`_pick_ref\`（图与地图用），这里只是它的薄壳。
    """
    return _pick_ref(name, *more, alias=alias, unit=unit)[0]


def _split_ref(ref):
    """\`"topic[:].field"\` → ("topic.field", 所有实例)；\`[N]\` → int；不写下标 → 0。

    实例说明交给 provider 直接用下标取（Python 的 int/切片语义），这里只负责拆开。
    """
    m = re.match(r"^([a-z][a-z0-9_]*)(?:\[([-]?\d*(?::-?\d*)?)\])?\.(.+)$", str(ref))
    if not m:
        return str(ref), 0
    return "%s.%s" % (m.group(1), m.group(3)), _parse_inst(m.group(2))


def _parse_inst(txt):
    """\`[2]\` → int；\`[1:3]\` → slice（闭区间，含 3）；不写 → 0（只取第 0 个实例）。

    区间按闭区间算（\`[1:3]\` = 实例 1、2、3），这是知识库的写法约定，与 Python 切片
    "含头不含尾"相反，所以转 Python slice 时上界要 +1：这里返回的 slice 打印出来
    比写的多 1，别照着它的数字读实例号（报错文案里也不打 slice，只打闭区间）。
    """
    if txt is None or txt == "":
        return 0
    if ":" in txt:
        a, _, b = txt.partition(":")
        start = int(a) if a else None
        stop = int(b) if b else None
        if stop is not None:
            # 闭区间 → 半开：上界 +1。\`[:-1]\` 那一端 +1 得 0（取空），改用 None（到末尾）
            stop = None if stop + 1 == 0 else stop + 1
        return slice(start, stop)
    return int(txt)


# ---------------- 单位换算 ----------------
# 只服务 \`ref(..., unit="期望单位")\`。按「到族基准单位的因子」定义：族内可换、跨族不行
# （跨族在构建期就报错了）。键是规范化后的单位名：构建期把 meta 里那些自由文本
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
    """按因子缩放一条序列。数组字段是「每元素一列」，分组取数是「每实例一组」，都递归下去。"""
    if x is None:
        return None
    if isinstance(x, list):
        return [_scale_series(v, scale) for v in x]
    return np.asarray(x, dtype=float) * scale


# ---------------- compute 表达式求值 ----------------
# 产物里存的就是作者写的原文：
#   vibe_mean, vibe_p95, ..., imu_idx = worst_mean_stats(ref("...[:]"), min_mean=0)
#   pct = frac * 100
#   p99_stat = p99 if seg_n > 50 else None
#
# 求值用 Python 自带的 ast，不 eval 作者原文：先按白名单遍历、把 topic.field 重写成
# 取数调用，再在空 __builtins__ 下 exec。构建期（web/scripts/lib/rule-expr.mjs）已经把
# 算子名/入参/变量声明校验过一遍，这里再查一遍是为了防"构建期放行、运行期能执行任意代码"
# 这类缝，两道关卡的判据不同，不能只留一道。

# compute 里放行的直接调用：注册过的算子 + 这四个框架函数。
#   _ref("topic.field")   取一列（也支持多候选 + alias/unit 修饰）
#   _try(expr)            容错：内层出错时整条赋值结果为 None
#   has_topic("name")    这个消息在不在（与 when 里同一个函数，语义一致）
#   _cfg("NAME")          读飞控参数（不是算子，见下面 \`_param_fn\` 的说明）
#   log_ok()             日志文件完整性（有无损坏/截断）
_COMPUTE_CALLABLE = ("_ref", "_try", "has_topic", "_cfg", "log_ok", "len", "int")

# compute 里允许的模块名：裸 Name.attr 碰到这些名字不重写为 ref()，
# 而是保留为模块.函数 调用（如 np.ptp / np.hypot / np.isin）。
_COMPUTE_MODULES = {"np"}

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
    """把表达式里裸写的 \`topic.field\` / \`topic[N].field\` / \`topic[i].field[j]\`
    重写成 \`ref("topic.field")\` / \`ref("topic[N].field")\` / \`ref("topic[i].field[j]")\`。

    只接受 \`Name.attr\` / \`Name[N].attr\` / \`Name[N].attr[M]\` 形态，且这个 Name
    不能是已声明的变量，否则 \`变量.属性\` 会去访问对象属性（那是任意能力，白名单不给）。
    """

    def __init__(self, env_keys):
        self.env_keys = env_keys

    # ---- helpers ----

    def _is_topic_name(self, name):
        if name in _COMPUTE_MODULES:
            return False
        if name in self.env_keys:
            raise ValueError("%s 是变量名，不能当 topic 用" % name)
        return True

    def _format_slice(self, slc):
        """ast 下标节点 → ref 字符串里的下标片段（如 \`\`i\`\` / \`\`0\`\` / \`\`:\`\`）"""
        if isinstance(slc, ast.Constant):
            return str(slc.value)
        if isinstance(slc, ast.Name):
            return slc.id
        if isinstance(slc, ast.Slice):

            def _fmt(s):
                if s is None:
                    return ""
                if isinstance(s, ast.Constant):
                    return str(s.value)
                if isinstance(s, ast.Name):
                    return s.id
                if isinstance(s, ast.UnaryOp) and isinstance(s.op, ast.USub) and isinstance(s.operand, ast.Constant):
                    return "-" + str(s.operand.value)
                return "..."

            return "%s:%s" % (_fmt(slc.lower), _fmt(slc.upper))
        return "..."

    def _build_ref(self, node, prefix):
        """构造 _ref("prefix.attr") 调用节点"""
        key = "%s.%s" % (prefix, node.attr)
        return ast.copy_location(
            ast.Call(
                func=ast.Name(id="_ref", ctx=ast.Load()),
                args=[ast.Constant(value=key)],
                keywords=[],
            ),
            node,
        )

    # ---- visitors ----

    def visit_Attribute(self, node):
        self.generic_visit(node)

        # 情况 1：topic.field（当前支持）
        if isinstance(node.value, ast.Name):
            if self._is_topic_name(node.value.id):
                return self._build_ref(node, node.value.id)
            return node

        # 情况 2：topic[N].field（新增，下标在属性左边）
        if isinstance(node.value, ast.Subscript) and isinstance(node.value.value, ast.Name):
            name = node.value.value.id
            if self._is_topic_name(name):
                idx = self._format_slice(node.value.slice)
                return self._build_ref(node, "%s[%s]" % (name, idx))
            return node

        return node

    def _is_simple_slice(self, slc):
        """下标是否为简单索引（常数/变量/切片），可安全并入 ref 字符串。"""
        return isinstance(slc, (ast.Constant, ast.Name, ast.Slice, ast.Tuple))

    def visit_Name(self, node):
        """ALL_CAPS 内置变量 → _cfg("NAME") 调用（不在 env 声明过的才转）。
        小写/混名保持原样，算 compute 变量。"""
        if re.match(r"^[A-Z][A-Z0-9_]*$", node.id) and node.id not in self.env_keys:
            return ast.copy_location(
                ast.Call(
                    func=ast.Name(id="_cfg", ctx=ast.Load()),
                    args=[ast.Constant(value=node.id)],
                    keywords=[],
                ),
                node,
            )
        return node

    def visit_Subscript(self, node):
        self.generic_visit(node)

        # 情况 3：ref(...) 被 visit_Attribute 转换后又被下标：topic.field[j]
        # 但只对简单下标合并；布尔掩码等复杂表达式留给 Python 运行时评估
        if (
            isinstance(node.value, ast.Call)
            and isinstance(node.value.func, ast.Name)
            and node.value.func.id == "_ref"
            and node.value.args
            and self._is_simple_slice(node.slice)
        ):
            if not isinstance(node.value.args[0], ast.Constant) or not isinstance(node.value.args[0].value, str):
                return node
            old_key = node.value.args[0].value
            idx = self._format_slice(node.slice)
            new_key = "%s[%s]" % (old_key, idx)
            return ast.copy_location(
                ast.Call(
                    func=ast.Name(id="_ref", ctx=ast.Load()),
                    args=[ast.Constant(value=new_key)],
                    keywords=[],
                ),
                node,
            )

        return node


def _compile_compute(stmt, env_keys):
    """一条 compute 表达式 → (code, guarded, targets)。校验不通过就抛异常。"""
    try:
        tree = ast.parse(stmt, mode="exec")
    except SyntaxError as err:
        raise ValueError("compute 表达式语法错误：%s" % err)
    if len(tree.body) != 1 or not isinstance(tree.body[0], ast.Assign):
        raise ValueError("compute 只能是一条赋值")
    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_COMPUTE):
            raise ValueError("compute 表达式含不允许的语法 %s" % type(node).__name__)
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute):
                if not isinstance(node.func.value, ast.Name) or node.func.value.id not in _COMPUTE_MODULES:
                    raise ValueError("compute 只允许 %s.函数名(...) 或直接调用算子" % "/".join(sorted(_COMPUTE_MODULES)))
            elif isinstance(node.func, ast.Name):
                if node.func.id not in OPERATORS and node.func.id not in _COMPUTE_CALLABLE:
                    raise ValueError("compute 调用了未注册的算子 %s" % node.func.id)
            else:
                raise ValueError("compute 只允许直接调用算子或模块方法")

    assign = tree.body[0]
    if not isinstance(assign.targets[0], ast.Tuple):
        if not isinstance(assign.targets[0], ast.Name):
            raise ValueError("compute 的赋值目标只能是变量名")
        targets = [assign.targets[0].id]
    else:
        if not all(isinstance(e, ast.Name) for e in assign.targets[0].elts):
            raise ValueError("compute 的赋值目标只能是变量名")
        targets = [e.id for e in assign.targets[0].elts]

    # _try(...)：容错求值，等价于老节点的 optional: true。内层出错就整个赋 None，
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


# 表达式求值的名字表：算子本体从 operators.py 的 COMPUTE_GLOBALS 来，
# 这里只补引擎负责的 _ref（需要 provider 上下文）。
_COMPUTE_GLOBALS = COMPUTE_GLOBALS


def _eval_compute(stmt, env, ref_fn=None):
    """求值一条 compute 表达式，结果写进 env。

    # _ref_fn：把表达式里的 \`_ref(...)\` 换成别的实现（图上"每实例一个面板"要覆盖实例切片，
    # 见 \`_pick_ref\` 的 instance）。不传就是规则那套 \`_ref\`。

    空值语义（与老节点链的唯一差别，有意为之）：
      老写法里 \`optional: false\` 的节点拿到 None 就整条规则中止，\`optional: true\` 的才允许
      None 继续传播。表达式写法里只有一条规则：None 是值，照常传播；要中止就让异常发生
      （拿 None 去比较/四则会抛 TypeError）。老写法靠 \`_try(...)\` 保留"允许 None"的那半边，
      另一半（无谓的中止）不保留，因为它只是让同样的结论晚一步消失，而"None 传播"更好读。

      实际影响面很窄：只有当某个表达式产出 None、而下游又把这个 None 变成了别的值
      （coalesce / choose / 三元）时才会看到差别；现有规则里这类位置都带 _try 守卫
      （6 条日志的冻结基线逐字段比对可证）。新写规则时若真的依赖"缺失即中止"，
      就显式写 \`require_true(is_not_none(x))\`，那正是它的用途。
    """
    code, guarded, targets = _compile_compute(stmt, env)
    glb = _COMPUTE_GLOBALS if ref_fn is None else {**_COMPUTE_GLOBALS, "_ref": ref_fn}
    try:
        exec(code, glb, env)
    except Exception:
        if not guarded:
            raise
        for name in targets:
            env[name] = None


def _cfg(name, default=None):
    """读飞控参数。全大写裸名自动走这个函数。

    参数缺失（这份日志没录 / 名字写错）返回 \`default\`（默认 None）而不抛异常：
    "没这个参数"与"参数等于 0"是两件事，挑哪个由规则自己说，要兜底就把 default 写上
    （\`_cfg('RNGFND_TYPE', 0.0)\` 的语义是"没声明就等于没配"，正是这类检查想要的）。
    """
    params = provider.get_initial_parameters()
    val = (params or {}).get(str(name))
    return default if val is None else val


_COMPUTE_GLOBALS["_ref"] = _ref
_COMPUTE_GLOBALS["_cfg"] = _cfg
_COMPUTE_GLOBALS["has_topic"] = provider.has_topic
_COMPUTE_GLOBALS["log_ok"] = provider.is_log_ok


def _rule_env():
    """一条规则求值时的名字空间：内置变量（provider 给）+ compute 输出存储。

    每次都要新的一份：compute 的输出直接写进这个 dict。

    has_topic/log_ok 同时出现在 env 和 _COMPUTE_GLOBALS：
    - _eval_expr（when 条件）只走 env，不走 _COMPUTE_GLOBALS
    - exec（compute）都可见，但没有影响（globals 优先）

    provider 提供原始数据；engine 提供翻译层（_ref / _cfg）；operators 提供算法。
    """
    env = provider.builtin_variables()
    env["has_topic"] = provider.has_topic
    env["log_ok"] = provider.is_log_ok
    env["ARMED_INTERVALS"] = provider.armed_intervals
    return env


def _run_rules(group):
    """执行声明了该 group 的经验规则。

    finding 的 id 是按发射顺序（F01、F02…）生成的，所以每条规则的 group 要与
    它所替换的原过程式检查的位置一致；同一 group 内按 order / id 排序执行。
    """
    for _rule in _RULES_BY_GROUP.get(group, ()):
        _rid = _rule["id"]
        _env = _rule_env()
        _not_applicable = None
        _ph = _placeholder_reason(_rule.get("placeholder"))
        if _ph:
            _not_applicable = "未实现：%s" % _ph
        else:
            try:
                if not provider.match_version(_rule["firmware"]):
                    _not_applicable = "固件不满足 %s" % _rule["firmware"]
                elif not _match_vehicle(_rule["vehicle"], _env):
                    _not_applicable = "机架不适用 %s" % _vehicle_label(_rule["vehicle"])
            except Exception as _spec_exc:
                # 规格解析失败（firmware/vehicle 写错类型等）要跳过并说明原因，
                # 不能吞掉当成"适用"，api.py 的 match_version 契约就是要求这类错误抛
                # ValueError。吞成 None 的话，错误规则会在所有日志上照跑：误报且无提示。
                _not_applicable = "规则规格解析失败：%s" % _spec_exc
        if _not_applicable:
            skipped(_rid, _not_applicable)
            continue
        _missing = _missing_topics(_rule.get("topics"))
        if _missing:
            skipped(_rid, _missing)
            continue
        _mode_miss = _match_mode(_rule.get("mode"))
        if _mode_miss:
            skipped(_rid, _mode_miss)
            continue
        _armed_miss = _match_armed(_rule.get("armed"), _env)
        if _armed_miss:
            skipped(_rid, _armed_miss)
            continue
        _ok = True
        for _stmt in _rule.get("compute") or []:
            try:
                _eval_compute(_stmt, _env)
            except Exception:
                _ok = False
                break
        if not _ok:
            skipped(_rid, "数据不足，本条没算出结论")
            continue
        _ran_ok = True
        if _rule.get("ran_when") is not None:
            try:
                _ran_ok = bool(_eval_expr(_rule["ran_when"], _env))
            except Exception:
                _ran_ok = False
        if _ran_ok:
            ran(_rid)

        # outputs：指标输出（纯数据，数组）
        for _out_item in _rule.get("output") or []:
            _v = _env.get(_out_item.get("value"))
            if _v is not None:
                metrics[_out_item["name"]] = _v

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

        _rule_tag = _rule.get("tag")
        _rule_docurl = _rule.get("docurl")

        for _item in _items:
            _tenv = _env
            if _item is not None:
                if not isinstance(_item, dict):
                    continue
                _tenv = dict(_env)
                _tenv.update(_item)

            for _trig in _rule.get("trigger") or []:
                # when 缺省 = True；单值/数组归一化成列表
                _when_raw = _trig.get("when", "True")
                _when_list = _when_raw if isinstance(_when_raw, list) else [_when_raw]

                _sev_raw = _trig.get("severity")
                if _sev_raw is None:
                    continue
                _sev_list = _sev_raw if isinstance(_sev_raw, list) else [_sev_raw]

                _n = len(_when_list)

                def _expand(val, n):
                    if val is None:
                        return [None] * n
                    if isinstance(val, list):
                        return val
                    return [val] * n

                _desc_list = _expand(_trig.get("description"), _n)
                _label_list = _expand(_trig.get("label", _rule_tag), _n)
                _sugg_list = _expand(_trig.get("suggestion"), _n)

                # evidence sub-object
                _ev_spec = _trig.get("evidence") or {}
                _ev_thr_raw = _ev_spec.get("threshold")
                if _ev_thr_raw is None:
                    _ev_thr_list = [None] * _n
                elif isinstance(_ev_thr_raw, list):
                    _ev_thr_list = _ev_thr_raw
                else:
                    _ev_thr_list = [_ev_thr_raw] * _n

                # when[] 内部短路：命中第一条即停
                for _i in range(_n):
                    try:
                        _hit = _eval_expr(_when_list[_i], _tenv)
                    except Exception:
                        _hit = False
                    if not _hit:
                        continue

                    _sev = _sev_list[_i] if _i < len(_sev_list) else _sev_list[-1]
                    _label = _label_list[_i] if _i < len(_label_list) else _label_list[-1]
                    _desc = _desc_list[_i] if _i < len(_desc_list) else _desc_list[-1]
                    _sugg = _sugg_list[_i] if _i < len(_sugg_list) else _sugg_list[-1]

                    # construct evidence dict
                    _ev = {}
                    _src = _ev_spec.get("source", "")
                    if _src and "{" in _src:
                        _src = _src.format_map(_tenv)
                    _ev["source"] = _src

                    _val_raw = _ev_spec.get("value")
                    if _val_raw is not None:
                        try:
                            _ev["value"] = _eval_expr(str(_val_raw), _tenv)
                        except Exception:
                            _ev["value"] = None
                    else:
                        _ev["value"] = None

                    _thr = _ev_thr_list[_i] if _i < len(_ev_thr_list) else _ev_thr_list[-1]
                    if _thr is not None:
                        _ev["threshold"] = _thr

                    # copy remaining evidence keys (unit, docurl, custom)
                    for _ek in _ev_spec:
                        if _ek in ("source", "value", "threshold"):
                            continue
                        _ev[_ek] = _ev_spec[_ek]

                    _docurl = _ev.get("docurl") or _rule_docurl

                    # format description/suggestion with template vars
                    if _desc and "{" in _desc:
                        _desc = _desc.format_map(_tenv)
                    if _sugg and "{" in _sugg:
                        _sugg = _sugg.format_map(_tenv)

                    if _sev == "guard":
                        # guard: label -> guard_tags[], still emit finding
                        if _label and _label not in guard_tags:
                            guard_tags.append(_label)
                        _fid[0] += 1
                        _f = {
                            "id": "F%02d" % _fid[0],
                            "severity": "guard",
                            "ruleId": _rid,
                            "label": _label,
                            "description": _desc,
                            "evidence": _ev,
                        }
                        if _docurl:
                            _f["docUrl"] = _docurl
                        if _sugg:
                            _f["suggestion"] = _sugg
                        findings.append(_f)
                    else:
                        add(_rid, _sev, _label, _desc, _ev, _sugg, _docurl)
                    break  # when[] short-circuit


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
    """按 active_tags / guard_tags 匹配故障知识库，返回命中的故障条目。

    匹配规则（两层关卡）：
    1. trigger: 至少一个命中 active_tags → 进入下一关
    2. exclude: 任一命中 guard_tags 或 active_tags → 本条失效

    飞行阶段判定已上移到规则层（rules/*.yaml），故障库不再重复判断。
    """
    active_tags = set(tags)
    matched = []
    for e in FAULT_KB:
        trig = e.get("trigger", [])
        excl = e.get("exclude", [])
        if not any(t in active_tags for t in trig):
            continue
        if any(x in guard_tags or x in active_tags for x in excl):
            continue
        matched.append(
            {
                "id": e["id"],
                "name": e["name"],
                "description": e.get("description", ""),
                "riskLevel": e.get("risk_level", ""),
                "possibleRootCause": e.get("possible_root_cause", []),
                "troubleshootingSteps": e.get("troubleshooting_steps", []),
                "docUrls": e.get("doc_urls", []),
                "excludeNotes": e.get("exclude_notes", {}),
            }
        )
    return matched


def run_all():
    """跑完全部规则，返回报告头的判定产物（= 交给前端的 report）。

    为什么是具名入口而不是模块级代码：原先它靠"执行脚本的副作用"，谁去读全局 \`__result\`
    谁就顺手把规则跑了，调用顺序还被隐式约束着（\`__result\` 是同一个全局，读 report 得早于
    读 manifest）。现在交付边界有具名用例，由第二部分数据层的 \`np_report()\` 调这个函数。

    入口先重置累加器：\`add\` / \`add_tag\` / \`ran\` / \`skipped\` / \`_run_rules\` 都是往模块级的
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

    # guards_early：要在其它规则之前跑，保证 insufficient_data 是第一个 guard 标签
    # ---------------- 按 group_order 顺序执行各 group ----------------
    # 顺序即 finding 编号（F01、F02…）的生成顺序，也决定 guard 标签的先后
    # （guards_early 排第一，insufficient_data 才会是第一个 guard 标签）。
    # 新增经验只需把 group 写进 facts.yaml 的 group_order（或复用已有 group）
    # 并让经验里的 group 对上，不用改这个文件；构建期会校验 group 是否都已登记。
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
        # 固件族名问 provider：引擎不认识任何一种固件，写死一个就是把"本站只支持 PX4"
        # 这个结论钉进了格式无关层（ArduPilot 日志会顶着 PX4 的名义出报告）。
        # 没有 platform_label() 的格式退回 log_type，至少那是真的、只是不好读。
        "platform": provider.platform_label() if hasattr(provider, "platform_label") else provider.log_type,
        "logType": provider.log_type,
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


# ============================================================================
# 第二部分：报告页数据层（np_* 具名入口是对前端的门面）
# ============================================================================


# ============ 通用工具 ============
# 时间基准：开机以来的秒数。PX4 的时间戳本身就是"开机起的微秒"，直接用即可；
# 之前减过 ulog.start_timestamp（那是"日志开始记录的时刻"，通常比开机晚几秒到几分钟），
# 于是同一份日志在本站与 Flight Review 上差出那一段：FR 的 Logged Messages 与曲线横轴
# 用的都是开机时间（plotted_tables.time_str 直接除 timestamp）。这里对齐它。
def _since_boot(t_us, digits=2):
    return round(int(t_us) / 1e6, digits)


def _clean(v):
    """numpy / NaN / Inf -> JSON 安全的 Python 原生结构（NaN 转 None）。"""
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, float) and not np.isfinite(v):
        return None
    return v


def _lttb_indices(n, max_points, ref=None):
    """LTTB 降采样索引（含首尾）。ref 为参考信号（NaN 安全，仅用于选点）。"""
    if n <= max_points or max_points < 3:
        return list(range(n))
    if ref is None:
        ref = np.zeros(n)
    r = np.asarray(ref, dtype=float)
    finite = np.isfinite(r)
    if finite.any():
        r = np.where(finite, r, np.nanmean(r[finite]))
    else:
        r = np.zeros(n)
    bucket = n / (max_points - 2)
    idx = [0]
    a = 0
    for i in range(max_points - 2):
        ts = int(np.floor((i + 1) * bucket))
        te = int(np.floor((i + 2) * bucket))
        ts = min(ts, n - 1)
        te = min(te, n)
        if te <= ts:
            te = ts + 1
        # 下一桶均值点
        nx = np.mean(np.arange(ts, te))
        ny = float(np.mean(r[ts:te])) if te > ts else float(r[ts])
        best, best_d = ts, -1.0
        for j in range(ts, te):
            area = abs((a - nx) * (float(r[j]) - float(r[a])) - (a - j) * (ny - float(r[a])))
            if area > best_d:
                best, best_d = j, area
        idx.append(best)
        a = best
    idx.append(n - 1)
    return idx


# ============ np_report：判定产物（跑规则 + 组装报告头）============
def np_report():
    """跑完全部规则，把判定产物摆到 \`__result\`（= 前端那份 report）。

    跑规则是第一部分 \`run_all()\` 的活，这里只负责把结果交出去；
    np_report 与 np_manifest / np_series / np_track / np_materials 同一形状，
    前端面对的 Python 面因此是 5 个对称的具名入口，没有"谁先读 __result"的隐含顺序。

    取数过程中"要的实例超出日志里有的"这类说明在这里一并带出（规则侧没人取走会攒着，
    跑完统一收）；图侧由 \`np_series\` 自己带。
    """
    global __result
    take_notes = getattr(provider, "take_inst_notes", None)
    if take_notes:
        take_notes()  # 别把上一次的带进来
    report = run_all()
    if take_notes:
        notes = take_notes()
        if notes:
            report["instanceNotes"] = notes
    __result = json.dumps(report, ensure_ascii=False, default=_json_default)


class _NumpyEncoder(json.JSONEncoder):
    """把 numpy 数值转成 Python 原生类型，使得 json.dumps 不抛 TypeError。

    引擎产出的 _metric_entries 可能含有 np.int64 / np.float64 等类型：一旦规则
    用 np.sum/max/mean 之类归约，返回值就是 numpy 标量，而标准 json 模块不认识它们。
    """

    def default(self, o):
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            return float(o)
        if isinstance(o, (np.ndarray,)):
            return o.tolist()
        return super().default(o)


def _json_default(o):
    """json.dumps 的 default 回调：借用 _NumpyEncoder 的逻辑。"""
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, (np.ndarray,)):
        return o.tolist()
    raise TypeError("Object of type %s is not JSON serializable" % o.__class__.__name__)


# ============ np_manifest：话题清单（驱动前端预设可用性）============
def np_manifest():
    global __result
    items = provider.get_topic_meta()
    __result = json.dumps({"topics": items}, ensure_ascii=False)


# ============ np_series：按需抽取 + LTTB 降采样 ============
def np_series(request_json, max_points=3000):
    """按需抽取时序并降采样。要哪几条线由构建期编译好的预设声明决定（本函数只执行）。

    request（前端从预设拼出来，JSON）：

      instance  面板要第几个实例，声明里写 \`[:]\` 的引用按它取（"每实例一个面板"用）
      ydata     每条线一项：\`{"kind":"field","fields":[…],"unit":…}\`（字段引用，含候选组与单位）
                            \`{"kind":"var","name":…}\`（预设 compute 节点的输出）
      xdata     可选：\`mode: xyplot\` 的横轴。不给就用命中字段那个 topic 的 timestamp
      compute   可选：预设的换算节点（与规则 compute 同一套表达式与算子），在取 ydata 之前求值

    返回 \`{t, x, series:[…], fullCount, warnings:[…]}\`：\`series\` 与 ydata 同序等长
    （取不到的那条是 \`null\`），前端按预设里的 label/color 逐项对齐即可；\`x\` 为 null 表示
    横轴就是 \`t\`；\`warnings\` 是取数过程中的提示（如"要实例 1~5，日志里只有 0~2"）。
    一条都取不到、或区间引用没在前端展开成单条，给 \`{"error": …}\`。

    换算（四元数→欧拉角、单位、多字段合成）都在这里做，前端只画，"前端不写数学"。
    """
    global __result
    req = json.loads(request_json)
    # 上一条请求留下的越界说明不能串到这条（规则侧没人取走，会一直攒着）
    take_notes = getattr(provider, "take_inst_notes", None)
    if take_notes:
        take_notes()
    inst = int(req.get("instance") or 0)
    yspec = req.get("ydata") or []
    if not yspec:
        __result = json.dumps({"error": "这张图没有声明任何一条数据（ydata 为空）"}, ensure_ascii=False)
        return

    # 1) 换算节点：与规则同一套求值器，只把 ref 换成"按本面板的实例取"
    env = _rule_env()
    if req.get("compute"):

        def panel_ref(*args, **kwargs):
            return _pick_ref(*args, instance=inst, **kwargs)[0]

        try:
            for stmt in req["compute"]:
                _eval_compute(stmt, env, ref_fn=panel_ref)
        except Exception as exc:
            __result = json.dumps({"error": "换算节点算不出来：%s" % exc}, ensure_ascii=False)
            return

    # 2) 逐条取数（字段引用 / 换算节点的输出）
    hit_bare = None
    values = []
    try:
        for spec in yspec:
            got, bare = _panel_series(spec, env, inst)
            if bare and hit_bare is None:
                hit_bare = bare
            values.append(got)
        if req.get("xdata"):
            x_vals, bare_x = _panel_series(req["xdata"], env, inst)
            if bare_x and hit_bare is None:
                hit_bare = bare_x
            if x_vals is None:
                __result = json.dumps({"error": "横轴那个字段在日志里没有"}, ensure_ascii=False)
                return
        else:
            x_vals = None
    except Exception as exc:
        __result = json.dumps({"error": str(exc)}, ensure_ascii=False)
        return
    if all(v is None for v in values):
        __result = json.dumps({"error": "这张图的数据在日志里都没有"}, ensure_ascii=False)
        return

    # 3) 横轴：显式给了就用它，否则用命中字段那个 topic 的时间戳（阶段底色、tooltip 都要）。
    #    整张图都靠换算节点算出来时，命中字段要从节点里的 ref 反推（只定 topic，不求值）。
    if hit_bare is None and req.get("compute"):
        hit_bare = _first_ref_bare(req["compute"])
    ts = None
    if hit_bare:
        topic = hit_bare.partition(".")[0]
        _, inst_hit = _split_ref(hit_bare)
        ts = provider.get_series(
            "%s.timestamp" % topic,
            instance=inst if isinstance(inst_hit, slice) else inst_hit,
        )
    if ts is None:
        __result = json.dumps(
            {"error": "取不到时间戳（%s 里没有 timestamp 列）" % (hit_bare or "任何命中的字段")},
            ensure_ascii=False,
        )
        return

    n = len(np.asarray(ts, dtype=np.int64))
    arrs = []
    for v in values:
        if v is None:
            arrs.append(None)
        elif np.ndim(v) == 0:
            arrs.append(np.full(n, float(v)))  # 换算出的是标量：铺成常量线（门限线是正当用法）
        else:
            arrs.append(np.asarray(v, dtype=float))
    # 横轴与曲线要来自同一份采样：一张图的 compute 若横跨了两个话题（采样率不同），
    # 降采样按横轴长度走，索引到较短的那条会越界，给一句能照着改的话，别抛 numpy 的 IndexError
    for a in arrs:
        if a is not None and len(a) < n:
            __result = json.dumps(
                {
                    "error": "横轴与某条线的采样数对不上（横轴 %d 点、那条线 %d 点），"
                    "一张图的 compute 横跨了多个话题时，请显式写 xdata，"
                    "或用 fill_to / head 把序列对齐" % (n, len(a))
                },
                ensure_ascii=False,
            )
            return
    ref = next((a for a in arrs if a is not None), None)
    idx = _lttb_indices(n, int(max_points), ref)
    __result = json.dumps(
        {
            "t": [_since_boot(ts[i], 3) for i in idx],
            "x": None if x_vals is None else [_clean(np.asarray(x_vals, dtype=float)[i]) for i in idx],
            "series": [None if a is None else [_clean(a[i]) for i in idx] for a in arrs],
            "fullCount": n,
            "warnings": take_notes() if take_notes else [],
        },
        ensure_ascii=False,
    )


def _panel_series(spec, env, inst):
    """一条线 → (序列, 命中的 bare 字段名)。

    · \`{"kind":"var"}\` 取换算节点的输出（标量由调用方铺成常量线）
    · \`{"kind":"field"}\` 走 \`_pick_ref\`（候选组 + 单位换算 + 实例覆盖）

    区间引用（\`[:]\` / \`[a:b]\`）有两种去向，都由前端决定，这里只见到结果：
      · 容器 \`split_by_instance: true\` → 按实例拆成多张图，每张图把实例号放在 \`instance=\` 里
        发过来，\`_pick_ref\` 用它盖掉引用里的区间，拿到单条序列
      · 容器不拆 → 前端自己把 \`a[:].b\` 展开成 \`a[0].b\`、\`a[1].b\`… 再发过来，也是单条
    所以这里只会见到单条序列。万一见到一组，那不是预设写错了，是解析器漏了展开。
    """
    if spec.get("kind") == "var":
        return env.get(spec.get("name")), None
    if spec.get("kind") != "field":
        raise ValueError("不认识的取数声明：%s" % json.dumps(spec, ensure_ascii=False))
    series, bare = _pick_ref(*spec.get("fields") or [], unit=spec.get("unit"), instance=inst)
    if series is None:
        return None, None
    if isinstance(series, list) and series and isinstance(series[0], (list, tuple)):
        raise ValueError(
            "%s 取到的是一组实例（%d 条），区间引用应该在前端就展开成每条一个实例，"
            "这里是解析器的问题，不是预设写错了" % (bare, len(series))
        )
    return series, bare


def _first_ref_bare(stmts):
    """换算节点里第一个"topic 在日志里存在"的字段引用（只用来定时间戳的 topic，不求值）。

    两种写法都要认：\`_ref("topic.field")\`，以及裸写的 \`topic.field\`。后者在
    \`_compile_compute\` 里才会被改写成 _ref（见第一部分的 \`_ComputeRefs\`），这里看的是
    原文，所以得自己认一遍（踩过：\`quat_to_euler(vehicle_attitude.q)\` 因为只认 ref，
    整张图报"取不到时间戳"）。
    """
    for stmt in stmts:
        try:
            tree = ast.parse(stmt)
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "_ref":
                for arg in node.args:
                    if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                        bare, _ = _split_ref(arg.value)
                        if provider.has_topic(bare.partition(".")[0]):
                            return bare
            elif isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
                bare = "%s.%s" % (node.value.id, node.attr)
                if provider.has_topic(bare.partition(".")[0]):
                    return bare
    return None


# ============ np_track：GPS 轨迹 ============
# 取哪些字段、怎么按固件版本挑候选、量纲怎么换算，全是格式专有知识，
# 由 provider 提供（见 providers/api.py 的可选能力表）。
def np_track(max_points=None):
    global __result
    data = provider.get_flight_track(max_points)
    __result = json.dumps(data, ensure_ascii=False)


# ============ np_materials：系统信息 / 事件 / 丢包 / 参数 / 阶段 ============
# 这一块全是"某种日志的消息形态"的展示（'I' 信息字典、事件与文本消息合并、
# 'M' 多值信息怎么拼、'Q' 默认值怎么推、逐字节的消息类型统计），换格式就是另一套，
# 所以整块由 provider 的 report_materials() 提供（可选能力）。
def np_materials():
    global __result
    __result = json.dumps(provider.report_materials(), ensure_ascii=False)
`
  .replace("__FAULT_KB__", JSON.stringify(faultKbJson.entries))
  .replace("__RULES__", JSON.stringify(rules))
  .replace("__FACTS__", JSON.stringify(facts))
  .replace("__FIELD_UNITS__", JSON.stringify(fieldUnits));
