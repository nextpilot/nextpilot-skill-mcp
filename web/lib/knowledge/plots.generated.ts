// ⚠️ 自动生成，请勿手改。源文件在 engine/ 与 knowledge/px4/，改完跑 `pnpm build:kb`（dev/build 自动执行）。
// 源：knowledge/px4/plot/*.yml（改图请改那边）
export const PLOT_PRESETS = [
  {
    "id": "actuator",
    "title": "执行机构",
    "description": "归一化控制量（-1..1）与 PWM 输出；控制量来自混控器，输出量是最终发给电调/舵机的信号。",
    "conditions": {
      "firmware": "any",
      "airframe": "any",
      "topics": [
        [
          "actuator_controls_0",
          "actuator_motors",
          "actuator_outputs"
        ]
      ]
    },
    "compute": [],
    "outputs": [
      {
        "container": "axes",
        "title": "控制量",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": null,
        "per_instance": false,
        "ylabel": "归一化 [-1,1]",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "actuator_controls_0[0].control[0]"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "actuator_controls_0[0].control[1]"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "actuator_controls_0[0].control[2]"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "actuator_controls_0[0].control[3]"
                ]
              }
            ],
            "labels": [
              "Roll",
              "Pitch",
              "Yaw",
              "Thrust"
            ],
            "styles": [],
            "colors": []
          }
        ]
      },
      {
        "container": "axes",
        "title": "PWM 输出",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": null,
        "per_instance": false,
        "ylabel": "us",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "actuator_outputs[0].output[0]"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "actuator_outputs[0].output[1]"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "actuator_outputs[0].output[2]"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "actuator_outputs[0].output[3]"
                ]
              }
            ],
            "labels": [
              "输出1",
              "输出2",
              "输出3",
              "输出4"
            ],
            "styles": [],
            "colors": []
          }
        ]
      }
    ]
  },
  {
    "id": "power",
    "title": "电源",
    "description": "电压 / 电流 / 剩余电量，多面板共享时间轴。",
    "conditions": {
      "firmware": "any",
      "airframe": "any",
      "topics": [
        [
          "battery_status"
        ]
      ]
    },
    "compute": [],
    "outputs": [
      {
        "container": "axes",
        "title": "电压",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": null,
        "per_instance": false,
        "ylabel": "V",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "battery_status[0].voltage_v"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "battery_status[0].voltage_filtered_v"
                ]
              }
            ],
            "labels": [
              "voltage_v",
              "voltage_filtered_v"
            ],
            "styles": [],
            "colors": []
          }
        ]
      },
      {
        "container": "axes",
        "title": "电流",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": null,
        "per_instance": false,
        "ylabel": "A",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "battery_status[0].current_a"
                ]
              }
            ],
            "labels": [
              "current_a"
            ],
            "styles": [],
            "colors": []
          }
        ]
      },
      {
        "container": "axes",
        "title": "剩余电量",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": null,
        "per_instance": false,
        "ylabel": "%",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "battery_status[0].remaining"
                ]
              }
            ],
            "labels": [
              "remaining"
            ],
            "styles": [],
            "colors": []
          }
        ]
      }
    ]
  },
  {
    "id": "distance",
    "title": "测距",
    "description": "距离传感器读数与信号质量；部分固件未开启该传感器。",
    "conditions": {
      "firmware": "any",
      "airframe": "any",
      "topics": [
        [
          "distance_sensor"
        ]
      ]
    },
    "compute": [],
    "outputs": [
      {
        "container": "axes",
        "title": "距离",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": null,
        "per_instance": false,
        "ylabel": "m",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "distance_sensor[0].current_distance"
                ]
              }
            ],
            "labels": [
              "当前距离"
            ],
            "styles": [],
            "colors": []
          }
        ]
      },
      {
        "container": "axes",
        "title": "信号质量",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": null,
        "per_instance": false,
        "ylabel": "%",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "distance_sensor[0].signal_quality"
                ]
              }
            ],
            "labels": [
              "信号质量"
            ],
            "styles": [],
            "colors": []
          }
        ]
      }
    ]
  },
  {
    "id": "gps",
    "title": "GPS",
    "description": "卫星数与定位精度（HDOP/EPH/EPV）。",
    "conditions": {
      "firmware": "any",
      "airframe": "any",
      "topics": [
        [
          "vehicle_gps_position",
          "sensor_gps"
        ]
      ]
    },
    "compute": [],
    "outputs": [
      {
        "container": "axes",
        "title": "卫星数",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": null,
        "per_instance": false,
        "ylabel": "count",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "vehicle_gps_position[0].satellites_used",
                  "sensor_gps[0].satellites_used"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "vehicle_gps_position[0].satellites_visible",
                  "sensor_gps[0].satellites_visible"
                ]
              }
            ],
            "labels": [
              "satellites_used",
              "satellites_visible"
            ],
            "styles": [],
            "colors": []
          }
        ]
      },
      {
        "container": "axes",
        "title": "定位精度",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": null,
        "per_instance": false,
        "ylabel": "m",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "vehicle_gps_position[0].eph",
                  "sensor_gps[0].eph"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "vehicle_gps_position[0].epv",
                  "sensor_gps[0].epv"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "vehicle_gps_position[0].hdop",
                  "sensor_gps[0].hdop"
                ]
              }
            ],
            "labels": [
              "eph",
              "epv",
              "hdop"
            ],
            "styles": [],
            "colors": []
          }
        ]
      }
    ]
  },
  {
    "id": "ekf",
    "title": "EKF 创新检验",
    "description": "创新值与检验门限之比（≥1 表示该路观测被 EKF 拒绝），参考线 1.0。",
    "conditions": {
      "firmware": "any",
      "airframe": "any",
      "topics": [
        [
          "estimator_status"
        ]
      ]
    },
    "compute": [],
    "outputs": [
      {
        "container": "axes",
        "title": "estimator_status #{instance}",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": [
          {
            "value": 1,
            "level": "critical",
            "label": "1.0（拒绝）"
          }
        ],
        "per_instance": false,
        "ylabel": "ratio",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "estimator_status[0].vel_test_ratio"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "estimator_status[0].pos_test_ratio"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "estimator_status[0].hgt_test_ratio"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "estimator_status[0].hdg_test_ratio"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "estimator_status[0].mag_test_ratio"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "estimator_status[0].tas_test_ratio"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "estimator_status[0].hagl_test_ratio"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "estimator_status[0].beta_test_ratio"
                ]
              }
            ],
            "labels": [
              "速度",
              "水平位置",
              "垂直高度",
              "航向",
              "磁罗盘",
              "空速",
              "离地高度",
              "侧滑"
            ],
            "styles": [],
            "colors": []
          }
        ]
      }
    ]
  },
  {
    "id": "local-position",
    "title": "本地位置",
    "description": "本地 NED 坐标系下的位置与速度估计（m / m/s）。",
    "conditions": {
      "firmware": "any",
      "airframe": "any",
      "topics": [
        [
          "vehicle_local_position"
        ]
      ]
    },
    "compute": [],
    "outputs": [
      {
        "container": "axes",
        "title": "位置 (NED)",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": null,
        "per_instance": false,
        "ylabel": "m",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "vehicle_local_position[0].x"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "vehicle_local_position[0].y"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "vehicle_local_position[0].z"
                ]
              }
            ],
            "labels": [
              "X (北)",
              "Y (东)",
              "Z (下)"
            ],
            "styles": [],
            "colors": []
          }
        ]
      },
      {
        "container": "axes",
        "title": "速度 (NED)",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": null,
        "per_instance": false,
        "ylabel": "m/s",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "vehicle_local_position[0].vx"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "vehicle_local_position[0].vy"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "vehicle_local_position[0].vz"
                ]
              }
            ],
            "labels": [
              "VX (北)",
              "VY (东)",
              "VZ (下)"
            ],
            "styles": [],
            "colors": []
          }
        ]
      }
    ]
  },
  {
    "id": "mag",
    "title": "磁罗盘",
    "description": "磁场强度三轴分量（Gauss），用于航向估计。",
    "conditions": {
      "firmware": "any",
      "airframe": "any",
      "topics": [
        [
          "sensor_mag"
        ]
      ]
    },
    "compute": [],
    "outputs": [
      {
        "container": "axes",
        "title": "磁场强度",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": null,
        "per_instance": false,
        "ylabel": "Gauss",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "sensor_mag[0].x"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "sensor_mag[0].y"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "sensor_mag[0].z"
                ]
              }
            ],
            "labels": [
              "X",
              "Y",
              "Z"
            ],
            "styles": [],
            "colors": []
          }
        ]
      }
    ]
  },
  {
    "id": "rc",
    "title": "遥控输入",
    "description": "手动遥控器摇杆输入（归一化 -1..1）。",
    "conditions": {
      "firmware": "any",
      "airframe": "any",
      "topics": [
        [
          "manual_control_setpoint"
        ]
      ]
    },
    "compute": [],
    "outputs": [
      {
        "container": "axes",
        "title": "摇杆输入",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": null,
        "per_instance": false,
        "ylabel": "归一化 [-1,1]",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "manual_control_setpoint[0].roll"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "manual_control_setpoint[0].pitch"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "manual_control_setpoint[0].yaw"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "manual_control_setpoint[0].throttle"
                ]
              }
            ],
            "labels": [
              "Roll",
              "Pitch",
              "Yaw",
              "Throttle"
            ],
            "styles": [],
            "colors": []
          }
        ]
      }
    ]
  },
  {
    "id": "rates",
    "title": "角速度",
    "description": "三轴角速度（rad/s）：原始陀螺 + 滤波后估计值，两面板共享时间轴。",
    "conditions": {
      "firmware": "any",
      "airframe": "any",
      "topics": [
        [
          "sensor_gyro",
          "vehicle_angular_velocity"
        ]
      ]
    },
    "compute": [],
    "outputs": [
      {
        "container": "axes",
        "title": "原始角速度（陀螺）",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": null,
        "per_instance": false,
        "ylabel": "rad/s",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "sensor_gyro[0].x"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "sensor_gyro[0].y"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "sensor_gyro[0].z"
                ]
              }
            ],
            "labels": [
              "X",
              "Y",
              "Z"
            ],
            "styles": [],
            "colors": []
          }
        ]
      },
      {
        "container": "axes",
        "title": "滤波后角速度",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": null,
        "per_instance": false,
        "ylabel": "rad/s",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "vehicle_angular_velocity[0].xyz[0]"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "vehicle_angular_velocity[0].xyz[1]"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "vehicle_angular_velocity[0].xyz[2]"
                ]
              }
            ],
            "labels": [
              "X",
              "Y",
              "Z"
            ],
            "styles": [],
            "colors": []
          }
        ]
      }
    ]
  },
  {
    "id": "imu-accel",
    "title": "IMU 原始加速度",
    "description": "三轴加速度（m/s²）。旧固件可能未记录该话题。",
    "conditions": {
      "firmware": "any",
      "airframe": "any",
      "topics": [
        [
          "sensor_combined",
          "sensor_accel"
        ]
      ]
    },
    "compute": [],
    "outputs": [
      {
        "container": "axes",
        "title": "IMU 加速度",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": null,
        "per_instance": false,
        "ylabel": "m/s²",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "sensor_combined[0].accelerometer_m_s2[0]",
                  "sensor_accel[0].accelerometer_m_s2[0]"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "sensor_combined[0].accelerometer_m_s2[1]",
                  "sensor_accel[0].accelerometer_m_s2[1]"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "sensor_combined[0].accelerometer_m_s2[2]",
                  "sensor_accel[0].accelerometer_m_s2[2]"
                ]
              }
            ],
            "labels": [
              "accelerometer_m_s2",
              "accelerometer_m_s2",
              "accelerometer_m_s2"
            ],
            "styles": [],
            "colors": []
          }
        ]
      }
    ]
  },
  {
    "id": "attitude",
    "title": "姿态",
    "description": "四元数经 quat_to_euler 转欧拉角（Roll / Pitch / Yaw，度）；换算在引擎侧做，前端只画。",
    "conditions": {
      "firmware": "any",
      "airframe": "any",
      "topics": [
        [
          "vehicle_attitude"
        ]
      ]
    },
    "compute": [
      "roll, pitch, yaw = quat_to_euler(vehicle_attitude.q)"
    ],
    "outputs": [
      {
        "container": "axes",
        "title": "欧拉角",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": null,
        "per_instance": false,
        "ylabel": "deg",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "var",
                "name": "roll"
              },
              {
                "kind": "var",
                "name": "pitch"
              },
              {
                "kind": "var",
                "name": "yaw"
              }
            ],
            "labels": [
              "Roll",
              "Pitch",
              "Yaw"
            ],
            "styles": [],
            "colors": []
          }
        ]
      }
    ]
  },
  {
    "id": "vibration",
    "title": "振动",
    "description": "每个 IMU 的高频振动指标（accel_vibration_metric，m/s²），参考线 4.905 / 9.81。",
    "conditions": {
      "firmware": "any",
      "airframe": "any",
      "topics": [
        [
          "vehicle_imu_status"
        ]
      ]
    },
    "compute": [],
    "outputs": [
      {
        "container": "axes",
        "title": "IMU #{instance}",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": [
          {
            "value": 4.905,
            "level": "warning",
            "label": "4.905（警告）"
          },
          {
            "value": 9.81,
            "level": "critical",
            "label": "9.81（严重）"
          }
        ],
        "per_instance": true,
        "ylabel": "m/s²",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "vehicle_imu_status[:].accel_vibration_metric"
                ]
              }
            ],
            "labels": [
              "振动"
            ],
            "styles": [],
            "colors": []
          }
        ]
      }
    ]
  },
  {
    "id": "wind",
    "title": "风速估计",
    "description": "估计器输出的北向/东向风速分量（m/s）。旧固件用 wind_estimate，1.15+ 用 estimator_wind。",
    "conditions": {
      "firmware": "any",
      "airframe": "any",
      "topics": [
        [
          "estimator_wind",
          "wind_estimate"
        ]
      ]
    },
    "compute": [],
    "outputs": [
      {
        "container": "axes",
        "title": "风速",
        "legend": true,
        "grid": true,
        "flipx": false,
        "flipy": false,
        "range": null,
        "hlines": null,
        "per_instance": false,
        "ylabel": "m/s",
        "xlabel": "秒（相对日志开始）",
        "children": [
          {
            "mode": "TimeSeries",
            "xdata": null,
            "ydata": [
              {
                "kind": "field",
                "fields": [
                  "estimator_wind[0].windspeed_north"
                ]
              },
              {
                "kind": "field",
                "fields": [
                  "estimator_wind[0].windspeed_east"
                ]
              }
            ],
            "labels": [
              "北向风速",
              "东向风速"
            ],
            "styles": [],
            "colors": []
          }
        ]
      }
    ]
  },
  {
    "id": "track",
    "title": "轨迹",
    "description": "地图上的飞行轨迹（原始 GNSS），多条轨道叠画、可点选隐藏。",
    "conditions": {
      "firmware": "any",
      "airframe": "any",
      "topics": [
        [
          "sensor_gps",
          "vehicle_gps_position"
        ]
      ]
    },
    "compute": [],
    "outputs": [
      {
        "container": "map",
        "title": "轨迹",
        "legend": true,
        "children": [
          {
            "label": "gps",
            "max_points": 1500,
            "lat": {
              "cands": [
                "sensor_gps[0].latitude_deg",
                "vehicle_gps_position[0].latitude_deg",
                "vehicle_gps_position[0].lat"
              ],
              "unit": "deg"
            },
            "lon": {
              "cands": [
                "sensor_gps[0].longitude_deg",
                "vehicle_gps_position[0].longitude_deg",
                "vehicle_gps_position[0].lon"
              ],
              "unit": "deg"
            },
            "alt": {
              "cands": [
                "sensor_gps[0].altitude_msl_m",
                "vehicle_gps_position[0].altitude_msl_m",
                "vehicle_gps_position[0].alt"
              ],
              "unit": "m"
            },
            "topics": [
              [
                "sensor_gps",
                0
              ],
              [
                "vehicle_gps_position",
                0
              ]
            ]
          }
        ]
      }
    ]
  }
] as const;
