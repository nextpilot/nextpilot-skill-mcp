---
title: 知识引擎api接口
date: 2026-09-24T02:27:39+08:00
lastmod: 2026-09-24T03:19:49+08:00
---

‍

## 函数接口

<table>
<colgroup><col style="min-width: 60px;" /><col style="width: 329px;" /><col style="min-width: 60px;" /><col style="min-width: 60px;" /><col style="min-width: 60px;" /></colgroup><thead><tr>
<th>分类</th>
<th></th>
<th>px4</th>
<th>apm</th>
<th>说明</th>
</tr>
</thead><tbody>
<tr>
<td rowspan="3">timestamp</td>
<td>get_start_timestamp()</td>
<td>start_timestamp</td>
<td></td>
<td>日志第一条消息的时间戳（µs）</td>
</tr>
<tr>
<td>get_last_timestamp()</td>
<td>last_timestamp</td>
<td></td>
<td>日志最后一条消息的时间戳（µs）</td>
</tr>
<tr>
<td>get_time_bounds()</td>
<td></td>
<td></td>
<td>时间边界：{start_us, end_us, duration_s, has_wraparound}</td>
</tr>
<tr>
<td colspan="1" rowspan="2">position</td>
<td>get_home_position</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr>
<td>get_ref_position</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr>
<td rowspan="8">dataset</td>
<td>has_topic(topic)</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr>
<td>​has_data_appended​</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr>
<td>get_dataset(topic, instance=0)</td>
<td>data_list[topic]</td>
<td></td>
<td>所有 topic 的数据对象列表</td>
</tr>
<tr>
<td>get_serials(topic, field, instance=0)</td>
<td>data_list[topic][field]</td>
<td></td>
<td></td>
</tr>
<tr>
<td>get_dataset_description(topic=None)</td>
<td>​message_formats​</td>
<td></td>
<td>消息格式定义 {name: MessageFormat}</td>
</tr>
<tr>
<td>​get_field_dtype(topic, field)​ </td>
<td></td>
<td></td>
<td></td>
</tr>
<tr>
<td>​get_field_sizeof(topic, field)​ </td>
<td></td>
<td></td>
<td></td>
</tr>
<tr>
<td>get_field_unit(topic, field)</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr>
<td rowspan="5">param</td>
<td>​has_default_parameters()​ </td>
<td>​has_default_parameters​</td>
<td></td>
<td>日志里带了默认参数表</td>
</tr>
<tr>
<td>get_default_parameters()</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr>
<td>get_inital_parameters()</td>
<td>​initial_parameters​</td>
<td></td>
<td>初始参数表 {param: value}</td>
</tr>
<tr>
<td>get_changed_parameters()</td>
<td>​changed_parameters​</td>
<td></td>
<td>运行中变更的参数 {param: [values]}</td>
</tr>
<tr>
<td>get_params_decription(name=None)</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr>
<td rowspan="7">info</td>
<td>info, multi_info = get_info_dict()</td>
<td>​msg_info_dict​，<br />​msg_info_multiple_dict​<br /></td>
<td></td>
<td>Information Message 键值对 {ver_sw, ver_hw, ...}<br />多值信息字典（'M' 消息，如多组件版本）<br /></td>
</tr>
<tr>
<td>get_firmwre_version()</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr>
<td>major, minor, path, type = get_version_info()</td>
<td></td>
<td></td>
<td>返回 (major, minor, patch, type)</td>
</tr>
<tr>
<td>get_version_info_str()</td>
<td></td>
<td></td>
<td>版本号的展示字符串</td>
</tr>
<tr>
<td>get_vehicle_identity</td>
<td></td>
<td></td>
<td>{frame_type, vehicle_type, uid, hardware, ...}</td>
</tr>
<tr>
<td>get_log_type()</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr>
<td></td>
<td></td>
<td></td>
<td></td>
</tr>
<tr>
<td rowspan="4">event</td>
<td>get_logged_events(t_start=None, t_end=None, level=None, pattern=None)<br /></td>
<td rowspan="2">​logged_messages​<br />​logged_messages_tagged​</td>
<td>STATUSTEXT</td>
<td>日志消息条目（警告/错误文本）</td>
</tr>
<tr>
<td>get_decoded_events(t_start=None, t_end=None, level=None, pattern=None)</td>
<td></td>
<td></td>
</tr>
<tr>
<td>get_mode_changed</td>
<td></td>
<td></td>
<td>连续飞行阶段：[{t_start_us, t_end_us, phase, ...}]</td>
</tr>
<tr>
<td>get_armed_changed</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr>
<td colspan="1" rowspan="3">​dropouts​</td>
<td>get_log_integrity</td>
<td></td>
<td></td>
<td>日志完整性检查：{total_dropout_ms, n_gaps, gaps: [{t_us, duration_us}], end_reached}</td>
</tr>
<tr>
<td>get_logged_dropouts()</td>
<td>​dropouts​</td>
<td></td>
<td>丢包记录 [MessageDropout]</td>
</tr>
<tr>
<td>​has_file_corruption​</td>
<td>​file_corruption​</td>
<td></td>
<td>文件内疑似有 corruption 标记</td>
</tr>
</tbody>
</table>

## 内置变量

- SYS_UUID，系统唯一ID

- AIRFAME_ID，机架
- VEHICLE_TYPE，飞机类型：mc，fw，vtol
- HOME_LAT、HOME_LON、HOME_ALT
- SW_VER，软件版本
- SW_VER_HASH，软件版本HASH
- HW_VER，硬件版本
- HW_VER_SUBTYPE，硬件版本子型号
- 累计飞行时长
