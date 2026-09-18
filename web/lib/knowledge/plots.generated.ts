// ⚠️ 自动生成，请勿手改。源文件在 engine/ 与 knowledge/px4/，改完跑 `pnpm build:kb`（dev/build 自动执行）。
// 源：knowledge/px4/plot/*.yml（改图请改那边）
export const PLOT_PRESETS = [
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
