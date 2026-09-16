// ⚠️ 自动生成，请勿手改。源文件在 engine/ 与 knowledge/px4/，改完跑 `pnpm build:kb`（dev/build 自动执行）。
// 源：knowledge/px4/plot/*.yml（改图请改那边）
export const PLOT_PRESETS = [
  {
    "id": "vibration",
    "title": "振动",
    "description": "每个 IMU 的高频振动指标（accel_vibration_metric，m/s²），参考线 4.905 / 9.81。",
    "panels": [
      {
        "title": "IMU #{instance}",
        "yLabel": "m/s²",
        "topic": "vehicle_imu_status",
        "instance": "all",
        "fields": [
          "accel_vibration_metric"
        ],
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
        ]
      }
    ]
  },
  {
    "id": "imu-accel",
    "title": "IMU 原始加速度",
    "description": "三轴加速度（m/s²）。旧固件可能未记录该话题。",
    "panels": [
      {
        "title": "IMU 加速度（{topic}#{instance}）",
        "yLabel": "m/s²",
        "topics": [
          "sensor_combined",
          "sensor_accel"
        ],
        "instance": "first",
        "fields": [
          "accelerometer_m_s2[0]",
          "accelerometer_m_s2[1]",
          "accelerometer_m_s2[2]"
        ]
      }
    ]
  },
  {
    "id": "ekf",
    "title": "EKF 创新检验",
    "description": "创新值与检验门限之比（≥1 表示该路观测被 EKF 拒绝），参考线 1.0。",
    "panels": [
      {
        "title": "estimator_status #{instance}",
        "yLabel": "ratio",
        "topic": "estimator_status",
        "instance": "first",
        "fields": [
          {
            "label": "速度",
            "fields": [
              "vel_test_ratio"
            ]
          },
          {
            "label": "水平位置",
            "fields": [
              "pos_test_ratio"
            ]
          },
          {
            "label": "垂直高度",
            "fields": [
              "hgt_test_ratio"
            ]
          },
          {
            "label": "航向",
            "fields": [
              "hdg_test_ratio"
            ]
          },
          {
            "label": "磁罗盘",
            "fields": [
              "mag_test_ratio"
            ],
            "only_when_missing": "hdg_test_ratio"
          },
          {
            "label": "空速",
            "fields": [
              "tas_test_ratio"
            ]
          },
          {
            "label": "离地高度",
            "fields": [
              "hagl_test_ratio"
            ]
          },
          {
            "label": "侧滑",
            "fields": [
              "beta_test_ratio"
            ]
          }
        ],
        "hlines": [
          {
            "value": 1,
            "level": "critical",
            "label": "1.0 (拒绝)"
          }
        ]
      }
    ]
  },
  {
    "id": "power",
    "title": "电源",
    "description": "电压 / 电流 / 剩余电量，多面板共享时间轴。",
    "panels": [
      {
        "title": "电压",
        "yLabel": "V",
        "topic": "battery_status",
        "instance": "first",
        "fields": [
          "voltage_v",
          "voltage_filtered_v"
        ]
      },
      {
        "title": "电流",
        "yLabel": "A",
        "topic": "battery_status",
        "instance": "first",
        "fields": [
          "current_a"
        ]
      },
      {
        "title": "剩余电量",
        "yLabel": "%",
        "topic": "battery_status",
        "instance": "first",
        "fields": [
          "remaining"
        ]
      }
    ]
  },
  {
    "id": "gps",
    "title": "GPS",
    "description": "卫星数与定位精度（HDOP/EPH/EPV）。",
    "panels": [
      {
        "title": "卫星数",
        "yLabel": "count",
        "topic": "vehicle_gps_position",
        "instance": "first",
        "fields": [
          {
            "fields": [
              "satellites_used",
              "satellites_visible"
            ]
          }
        ]
      },
      {
        "title": "定位精度",
        "yLabel": "m",
        "topic": "vehicle_gps_position",
        "instance": "first",
        "fields": [
          "eph",
          "epv",
          "hdop"
        ]
      }
    ]
  },
  {
    "id": "attitude",
    "title": "姿态",
    "description": "四元数经算子转欧拉角（Roll / Pitch / Yaw，度）。换算在引擎侧做（op 算子），前端只画。",
    "panels": [
      {
        "title": "欧拉角",
        "yLabel": "deg",
        "topic": "vehicle_attitude",
        "instance": "first",
        "fields": [
          "q[0]",
          "q[1]",
          "q[2]",
          "q[3]"
        ],
        "op": {
          "name": "quat_to_euler",
          "labels": [
            "Roll",
            "Pitch",
            "Yaw"
          ]
        }
      }
    ]
  }
] as const;
