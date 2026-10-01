// ⚠️ 自动生成，请勿手改。源文件在 knowledge/（按固件族分目录）与 knowledge/engine/，改完跑 `pnpm build:kb`（dev/build 自动执行）。
// 源：knowledge/<族>/plot/*.yml（改图请改那边）
export const PLOT_PRESETS = {
  "ardupilot-bin": [],
  "px4-ulog": [
    {
      "id": "position",
      "title": "Position",
      "description": "2D 位置轨迹（vehicle_local_position y vs x），及 setpoint、GPS setpoint。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_local_position"
          ],
          [
            "vehicle_local_position_setpoint"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "位置 2D 轨迹",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[m]",
          "xlabel": "[m]",
          "children": [
            {
              "mode": "xyplot",
              "xdata": {
                "kind": "field",
                "fields": [
                  "vehicle_local_position.x"
                ]
              },
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_local_position.y"
                  ]
                }
              ],
              "labels": [
                "Estimated"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "xyplot",
              "xdata": {
                "kind": "field",
                "fields": [
                  "vehicle_local_position_setpoint.x"
                ]
              },
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_local_position_setpoint.y"
                  ]
                }
              ],
              "labels": [
                "Setpoint"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "altitude",
      "title": "Altitude Estimate",
      "description": "GPS / 气压计 / 融合高度估计值与 setpoint。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
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
          "title": "高度估计",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[m]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_gps_position.altitude_msl_m",
                    "vehicle_gps_position.alt"
                  ],
                  "unit": "m"
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_air_data.baro_alt_meter",
                    "sensor_combined.baro_alt_meter"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_global_position.alt"
                  ]
                }
              ],
              "labels": [
                "GPS Altitude (MSL)",
                "Barometer Altitude",
                "Fused Altitude Estimation"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "roll-angle",
      "title": "Roll Angle",
      "description": "Roll 欧拉角估计值与 setpoint、groundtruth。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_attitude"
          ]
        ]
      },
      "compute": [
        "roll, pitch, yaw = quat_to_euler(vehicle_attitude.q)",
        "roll_d, pitch_d, yaw_d = quat_to_euler(vehicle_attitude_setpoint.q_d)"
      ],
      "outputs": [
        {
          "container": "axes",
          "title": "Roll Angle",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
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
                  "name": "roll_d"
                }
              ],
              "labels": [
                "Roll Estimated",
                "Roll Setpoint"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "roll-rate",
      "title": "Roll Angular Rate",
      "description": "Roll 角速度估计值与 setpoint、积分。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_attitude"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Roll Angular Rate",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "deg/s",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_angular_velocity.xyz[0]",
                    "vehicle_attitude.rollspeed"
                  ]
                }
              ],
              "labels": [
                "Roll Rate Estimated"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_rates_setpoint.roll"
                  ]
                }
              ],
              "labels": [
                "Roll Rate Setpoint"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "rate_ctrl_status.rollspeed_integ"
                  ]
                }
              ],
              "labels": [
                "Roll Rate Integral"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "pitch-angle",
      "title": "Pitch Angle",
      "description": "Pitch 欧拉角估计值与 setpoint、groundtruth。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
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
          "title": "Pitch Angle",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "deg",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "var",
                  "name": "pitch"
                }
              ],
              "labels": [
                "Pitch Estimated"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_attitude_setpoint.pitch_d"
                  ]
                }
              ],
              "labels": [
                "Pitch Setpoint"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "pitch-rate",
      "title": "Pitch Angular Rate",
      "description": "Pitch 角速度估计值与 setpoint、积分。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_attitude"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Pitch Angular Rate",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "deg/s",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_angular_velocity.xyz[1]",
                    "vehicle_attitude.pitchspeed"
                  ]
                }
              ],
              "labels": [
                "Pitch Rate Estimated"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_rates_setpoint.pitch"
                  ]
                }
              ],
              "labels": [
                "Pitch Rate Setpoint"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "rate_ctrl_status.pitchspeed_integ"
                  ]
                }
              ],
              "labels": [
                "Pitch Rate Integral"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "yaw-angle",
      "title": "Yaw Angle",
      "description": "Yaw 欧拉角估计值与 setpoint、FF。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
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
          "title": "Yaw Angle",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "deg",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "var",
                  "name": "yaw"
                }
              ],
              "labels": [
                "Yaw Estimated"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_attitude_setpoint.yaw_d"
                  ]
                }
              ],
              "labels": [
                "Yaw Setpoint"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_attitude_setpoint.yaw_sp_move_rate"
                  ]
                }
              ],
              "labels": [
                "Yaw FF Setpoint [deg/s]"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "yaw-rate",
      "title": "Yaw Angular Rate",
      "description": "Yaw 角速度估计值与 setpoint、积分。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_attitude"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Yaw Angular Rate",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "deg/s",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_angular_velocity.xyz[2]",
                    "vehicle_attitude.yawspeed"
                  ]
                }
              ],
              "labels": [
                "Yaw Rate Estimated"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_rates_setpoint.yaw"
                  ]
                }
              ],
              "labels": [
                "Yaw Rate Setpoint"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "rate_ctrl_status.yawspeed_integ"
                  ]
                }
              ],
              "labels": [
                "Yaw Rate Integral"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "local-x",
      "title": "Local Position X",
      "description": "局部位置 X 轴估计值与 setpoint。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_local_position"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Local Position X",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[m]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_local_position.x"
                  ]
                }
              ],
              "labels": [
                "X Estimated"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_local_position_setpoint.x"
                  ]
                }
              ],
              "labels": [
                "X Setpoint"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "local-y",
      "title": "Local Position Y",
      "description": "局部位置 Y 轴估计值与 setpoint。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_local_position"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Local Position Y",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[m]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_local_position.y"
                  ]
                }
              ],
              "labels": [
                "Y Estimated"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_local_position_setpoint.y"
                  ]
                }
              ],
              "labels": [
                "Y Setpoint"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "local-z",
      "title": "Local Position Z",
      "description": "局部位置 Z 轴估计值与 setpoint（向上为正）。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_local_position"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Local Position Z",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[m]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_local_position.z"
                  ]
                }
              ],
              "labels": [
                "Z Estimated"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_local_position_setpoint.z"
                  ]
                }
              ],
              "labels": [
                "Z Setpoint"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "velocity",
      "title": "Velocity",
      "description": "三轴速度估计值与 setpoint（vx/vy/vz）。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_local_position"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Velocity",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[m/s]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_local_position.vx"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_local_position.vy"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_local_position.vz"
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
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_local_position_setpoint.vx"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_local_position_setpoint.vy"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_local_position_setpoint.vz"
                  ]
                }
              ],
              "labels": [
                "X Setpoint",
                "Y Setpoint",
                "Z Setpoint"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "visual-odom-pos",
      "title": "Visual Odometry Position",
      "description": "视觉里程计位置（仅当 topic 存在时显示）。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_visual_odometry"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Visual Odometry Position",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[m]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_visual_odometry.x"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_visual_odometry.y"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_visual_odometry.z"
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
      "id": "visual-odom-vel",
      "title": "Visual Odometry Velocity",
      "description": "视觉里程计速度（仅当 topic 存在时显示）。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_visual_odometry"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Visual Odometry Velocity",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[m]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_visual_odometry.vx"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_visual_odometry.vy"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_visual_odometry.vz"
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
      "id": "visual-odom-att",
      "title": "Visual Odometry Attitude",
      "description": "视觉里程计姿态角（仅当 topic 存在时显示）。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_visual_odometry"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Visual Odometry Attitude",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[deg]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_visual_odometry.roll"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_visual_odometry.pitch"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_visual_odometry.yaw"
                  ]
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
      "id": "visual-odom-rate",
      "title": "Visual Odometry Attitude Rate",
      "description": "视觉里程计角速率（仅当 topic 存在时显示）。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_visual_odometry"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Visual Odometry Attitude Rate",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[deg]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_visual_odometry.rollspeed"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_visual_odometry.pitchspeed"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_visual_odometry.yawspeed"
                  ]
                }
              ],
              "labels": [
                "Roll Rate",
                "Pitch Rate",
                "Yaw Rate"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "visual-odom-latency",
      "title": "Visual Odometry Latency",
      "description": "视觉里程计延迟（仅当 topic 存在时显示）。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_visual_odometry"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Visual Odometry Latency",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[ms]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_visual_odometry.latency"
                  ]
                }
              ],
              "labels": [
                "VIO Latency"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "airspeed",
      "title": "Airspeed",
      "description": "地速 / 真空速 / 指示空速与 GPS 地速、空速 setpoint。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "airspeed",
            "airspeed_validated",
            "vehicle_global_position"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Airspeed",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[m/s]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "airspeed_validated.true_airspeed_m_s",
                    "airspeed.indicated_airspeed_m_s"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "airspeed.indicated_airspeed_m_s"
                  ]
                }
              ],
              "labels": [
                "True Airspeed",
                "Indicated Airspeed"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_gps_position.vel_m_m_s",
                    "vehicle_gps_position.vel_m_s"
                  ]
                }
              ],
              "labels": [
                "Ground Speed (from GPS)"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "tecs",
      "title": "TECS",
      "description": "TECS 高度变化率与 setpoint（固定翼/VTOL）。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "tecs_status"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "TECS",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[m/s]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "tecs_status.height_rate"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "tecs_status.height_rate_setpoint"
                  ]
                }
              ],
              "labels": [
                "Height Rate",
                "Height Rate Setpoint"
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
      "title": "Manual Control Inputs",
      "description": "手动控制输入（遥控器/手柄）：Roll/Pitch/Yaw/Throttle + Aux + Flight Mode + Kill Switch。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "manual_control_setpoint"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Manual Control Inputs (Radio or Joystick)",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[-1, 1]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "manual_control_setpoint.roll"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "manual_control_setpoint.pitch"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "manual_control_setpoint.yaw"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "manual_control_setpoint.throttle"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "manual_control_setpoint.aux1"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "manual_control_setpoint.aux2"
                  ]
                }
              ],
              "labels": [
                "Y / Roll",
                "X / Pitch",
                "Yaw",
                "Throttle [-1, 1]",
                "Aux1",
                "Aux2"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "manual_control_switches.mode_slot",
                    "manual_control_setpoint.mode_slot"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "manual_control_switches.kill_switch",
                    "manual_control_setpoint.kill_switch"
                  ]
                }
              ],
              "labels": [
                "Flight Mode",
                "Kill Switch"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "actuator-controls-0",
      "title": "Actuator Controls",
      "description": "Actuator Controls 0：扭矩轴（Roll/Pitch/Yaw）+ 推力。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_torque_setpoint",
            "actuator_controls_0"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Actuator Controls",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "normalized",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_torque_setpoint.xyz[0]",
                    "actuator_controls_0.control[0]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_torque_setpoint.xyz[1]",
                    "actuator_controls_0.control[1]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_torque_setpoint.xyz[2]",
                    "actuator_controls_0.control[2]"
                  ]
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
      "id": "actuator-controls-1",
      "title": "Actuator Controls 1 (VTOL in Fixed-Wing mode)",
      "description": "第二组 Actuator Controls（仅 VTOL/固定翼配置时存在）。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_torque_setpoint",
            "actuator_controls_1"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Actuator Controls 1 (VTOL in Fixed-Wing mode)",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "normalized",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_torque_setpoint[1].xyz[0]"
                  ]
                }
              ],
              "labels": [
                "Roll"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_torque_setpoint[1].xyz[1]"
                  ]
                }
              ],
              "labels": [
                "Pitch"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_torque_setpoint[1].xyz[2]"
                  ]
                }
              ],
              "labels": [
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
      "id": "actuator-outputs",
      "title": "Actuator Outputs",
      "description": "执行机构输出（Motor/Servo 或 Main/AUX/EXTRA），取决于 dynamic_control_alloc。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "actuator_motors",
            "actuator_servos",
            "actuator_outputs"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Motor Outputs",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[-1, 1]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "actuator_motors.control[0]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_motors.control[1]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_motors.control[2]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_motors.control[3]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_motors.control[4]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_motors.control[5]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_motors.control[6]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_motors.control[7]"
                  ]
                }
              ],
              "labels": [
                "Motor 1",
                "Motor 2",
                "Motor 3",
                "Motor 4",
                "Motor 5",
                "Motor 6",
                "Motor 7",
                "Motor 8"
              ],
              "styles": [],
              "colors": []
            }
          ]
        },
        {
          "container": "axes",
          "title": "Servo Outputs",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[-1, 1]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "actuator_servos.control[0]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_servos.control[1]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_servos.control[2]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_servos.control[3]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_servos.control[4]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_servos.control[5]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_servos.control[6]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_servos.control[7]"
                  ]
                }
              ],
              "labels": [
                "Servo 1",
                "Servo 2",
                "Servo 3",
                "Servo 4",
                "Servo 5",
                "Servo 6",
                "Servo 7",
                "Servo 8"
              ],
              "styles": [],
              "colors": []
            }
          ]
        },
        {
          "container": "axes",
          "title": "Actuator Outputs (Main)",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
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
                    "actuator_outputs.output[0]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output[1]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output[2]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output[3]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output[4]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output[5]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output[6]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output[7]"
                  ]
                }
              ],
              "labels": [
                "Output 0",
                "Output 1",
                "Output 2",
                "Output 3",
                "Output 4",
                "Output 5",
                "Output 6",
                "Output 7"
              ],
              "styles": [],
              "colors": []
            }
          ]
        },
        {
          "container": "axes",
          "title": "Actuator Outputs (AUX)",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
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
                    "actuator_outputs[1].output[0]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs[1].output[1]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs[1].output[2]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs[1].output[3]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs[1].output[4]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs[1].output[5]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs[1].output[6]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs[1].output[7]"
                  ]
                }
              ],
              "labels": [
                "Output 0",
                "Output 1",
                "Output 2",
                "Output 3",
                "Output 4",
                "Output 5",
                "Output 6",
                "Output 7"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "motor-rpm",
      "title": "Motor RPM",
      "description": "电调转速（esc_status.esc_rpm，每个电调一条线）。日志里没有 esc_status 话题时 这张图自动隐藏；缺哪个 ESC 下标就少哪条线。\n",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "esc_status"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Motor RPM",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "rpm",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "esc_status.esc[0].esc_rpm"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "esc_status.esc[1].esc_rpm"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "esc_status.esc[2].esc_rpm"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "esc_status.esc[3].esc_rpm"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "esc_status.esc[4].esc_rpm"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "esc_status.esc[5].esc_rpm"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "esc_status.esc[6].esc_rpm"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "esc_status.esc[7].esc_rpm"
                  ]
                }
              ],
              "labels": [
                "ESC 0",
                "ESC 1",
                "ESC 2",
                "ESC 3",
                "ESC 4",
                "ESC 5",
                "ESC 6",
                "ESC 7"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "raw-accel",
      "title": "Raw Acceleration",
      "description": "传感器原始加速度（sensor_combined.accelerometer_m_s2）。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "sensor_combined"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Raw Acceleration",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[m/s^2]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "sensor_combined.accelerometer_m_s2[0]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "sensor_combined.accelerometer_m_s2[1]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "sensor_combined.accelerometer_m_s2[2]"
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
      "id": "vibration",
      "title": "Vibration Metrics",
      "description": "每个 IMU 的高频振动指标 IMU0-3 合在一张图上，参考线 4.905 / 9.81。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_imu_status"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Vibration Metrics",
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
          "split_by_instance": false,
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
                    "vehicle_imu_status.accel_vibration_metric"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_imu_status[1].accel_vibration_metric"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_imu_status[2].accel_vibration_metric"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_imu_status[3].accel_vibration_metric"
                  ]
                }
              ],
              "labels": [
                "Accel 0 Vibration Level [m/s^2]",
                "Accel 1 Vibration Level [m/s^2]",
                "Accel 2 Vibration Level [m/s^2]",
                "Accel 3 Vibration Level [m/s^2]"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "raw-gyro",
      "title": "Raw Angular Speed (Gyroscope)",
      "description": "传感器原始角速度（sensor_combined.gyro_rad）。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "sensor_combined"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Raw Angular Speed (Gyroscope)",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[rad/s]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "sensor_combined.gyro_rad[0]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "sensor_combined.gyro_rad[1]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "sensor_combined.gyro_rad[2]"
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
      "id": "fifo-accel",
      "title": "Raw Acceleration (FIFO)",
      "description": "FIFO 加速度计原始数据（每 IMU 一张），仅当 sensor_accel_fifo 存在时显示。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "sensor_accel_fifo"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Raw Acceleration (FIFO, IMU{instance})",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": true,
          "ylabel": "[m/s^2]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "sensor_accel_fifo[:].x"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "sensor_accel_fifo[:].y"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "sensor_accel_fifo[:].z"
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
      "id": "fifo-gyro",
      "title": "Raw Gyro (FIFO)",
      "description": "FIFO 陀螺仪原始数据（每 IMU 一张），仅当 sensor_gyro_fifo 存在时显示。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "sensor_gyro_fifo"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Raw Gyro (FIFO, IMU{instance})",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": true,
          "ylabel": "[deg/s]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "sensor_gyro_fifo[:].x"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "sensor_gyro_fifo[:].y"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "sensor_gyro_fifo[:].z"
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
      "id": "mag",
      "title": "Raw Magnetic Field Strength",
      "description": "传感器原始磁场强度（magnetometer_ga），兼容 vehicle_magnetometer / sensor_combined。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_magnetometer",
            "sensor_combined"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Raw Magnetic Field Strength",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[gauss]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_magnetometer.magnetometer_ga[0]",
                    "sensor_combined.magnetometer_ga[0]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_magnetometer.magnetometer_ga[1]",
                    "sensor_combined.magnetometer_ga[1]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_magnetometer.magnetometer_ga[2]",
                    "sensor_combined.magnetometer_ga[2]"
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
      "id": "distance",
      "title": "Distance Sensor",
      "description": "距离传感器读数（current_distance / variance / dist_bottom）。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "distance_sensor"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Distance Sensor",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[m]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "distance_sensor.current_distance"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "distance_sensor.variance"
                  ]
                }
              ],
              "labels": [
                "Distance",
                "Variance"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_local_position.dist_bottom"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_local_position.dist_bottom_valid"
                  ]
                }
              ],
              "labels": [
                "Estimated Distance Bottom [m]",
                "Dist Bottom Valid"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "gps-uncertainty",
      "title": "GPS Uncertainty",
      "description": "GPS 不确定度：eph / epv / hdop / vdop / s_variance_m_s / satellites_used / fix_type。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
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
          "title": "GPS Uncertainty",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "value",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_gps_position.eph",
                    "sensor_gps.eph"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_gps_position.epv",
                    "sensor_gps.epv"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_gps_position.hdop",
                    "sensor_gps.hdop"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_gps_position.vdop",
                    "sensor_gps.vdop"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_gps_position.s_variance_m_s",
                    "sensor_gps.s_variance_m_s"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_gps_position.satellites_used",
                    "sensor_gps.satellites_used"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_gps_position.fix_type",
                    "sensor_gps.fix_type"
                  ]
                }
              ],
              "labels": [
                "Horizontal position accuracy [m]",
                "Vertical position accuracy [m]",
                "Horizontal dilution of precision [m]",
                "Vertical dilution of precision [m]",
                "Speed accuracy [m/s]",
                "Num Satellites used",
                "GPS Fix"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "gps-noise",
      "title": "GPS Noise & Jamming",
      "description": "GPS 噪声与干扰指示器。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
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
          "title": "GPS Noise & Jamming",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "value",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_gps_position.noise_per_ms",
                    "sensor_gps.noise_per_ms"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_gps_position.jamming_indicator",
                    "sensor_gps.jamming_indicator"
                  ]
                }
              ],
              "labels": [
                "Noise per ms",
                "Jamming Indicator"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "thrust-mag",
      "title": "Thrust and Magnetic Field",
      "description": "推力与磁场强度范数对比。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_magnetometer",
            "sensor_combined"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Thrust and Magnetic Field",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "value",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_magnetometer.magnetometer_ga[0]",
                    "sensor_combined.magnetometer_ga[0]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_magnetometer.magnetometer_ga[1]",
                    "sensor_combined.magnetometer_ga[1]"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_magnetometer.magnetometer_ga[2]",
                    "sensor_combined.magnetometer_ga[2]"
                  ]
                }
              ],
              "labels": [
                "Mag X",
                "Mag Y",
                "Mag Z"
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
      "title": "Power",
      "description": "电池电压 / 电流 / 放电量 / 剩余电量 / OCV / 内阻 / 5V / 3.3V。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "battery_status"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Power",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "mixed",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "battery_status.voltage_v"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "battery_status.current_a"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "battery_status.discharged_mah"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "battery_status.remaining"
                  ]
                }
              ],
              "labels": [
                "Battery Voltage [V]",
                "Battery Current [A]",
                "Discharged Amount [mAh / 100]",
                "Battery remaining [0=empty, 10=full]"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "battery_status.ocv_estimate"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "battery_status.internal_resistance_estimate"
                  ]
                }
              ],
              "labels": [
                "OCV Estimate [V]",
                "Internal Resistance Estimate [mOhm]"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "system_power.voltage5v_v"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "system_power.sensors3v3[0]"
                  ]
                }
              ],
              "labels": [
                "5 V",
                "3.3 V"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "temperature",
      "title": "Temperature",
      "description": "传感器温度：Baro / Accel / Airspeed / Battery / ESC。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "sensor_baro"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Temperature",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[C]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "sensor_baro.temperature"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "sensor_accel.temperature"
                  ]
                }
              ],
              "labels": [
                "Baro temperature",
                "Accel temperature"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "airspeed.air_temperature_celsius"
                  ]
                }
              ],
              "labels": [
                "Airspeed temperature"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "battery_status.temperature"
                  ]
                }
              ],
              "labels": [
                "Battery temperature"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "estimator-flags",
      "title": "Estimator Flags",
      "description": "EKF 健康/超时/创新检验标志位。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "estimator_status"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Estimator Flags",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "flag / ratio",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "estimator_status.health_flags"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "estimator_status.timeout_flags"
                  ]
                }
              ],
              "labels": [
                "Health Flags (vel, pos, hgt)",
                "Timeout Flags (vel, pos, hgt)"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "estimator_status.vel_test_ratio"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "estimator_status.pos_test_ratio"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "estimator_status.hgt_test_ratio"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "estimator_status.hdg_test_ratio"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "estimator_status.mag_test_ratio"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "estimator_status.tas_test_ratio"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "estimator_status.hagl_test_ratio"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "estimator_status.beta_test_ratio"
                  ]
                }
              ],
              "labels": [
                "Velocity Test Ratio",
                "Position Test Ratio",
                "Height Test Ratio",
                "Heading Test Ratio",
                "Mag Test Ratio",
                "TAS Test Ratio",
                "HAGL Test Ratio",
                "Beta Test Ratio"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "failsafe-flags",
      "title": "Failsafe Flags",
      "description": "失效保护标志：failsafe / user_took_over / failsafe_flags。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_status"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "Failsafe Flags",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "flag",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_status.failsafe"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "vehicle_status.failsafe_and_user_took_over"
                  ]
                }
              ],
              "labels": [
                "In Failsafe",
                "User Took Over"
              ],
              "styles": [],
              "colors": []
            },
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.auto_mission_missing"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.geofence_breached"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.local_position_accuracy_low"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.local_position_required"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.local_position_invalid"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.local_velocity_invalid"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.local_altitude_invalid"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.global_position_accuracy_low"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.global_position_required"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.global_position_invalid"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.global_velocity_invalid"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.home_position_invalid"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.manual_control_available"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.gcs_connection_available"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.offboard_control_signal_lost"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.rc_signal_found"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.battery_warning"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.vtol_fixed_wing_system_failure"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.engine_failure"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.mission_failure"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "failsafe_flags.avoidance_failure"
                  ]
                }
              ],
              "labels": [
                "auto_mission_missing",
                "geofence_breached",
                "local_position_accuracy_low",
                "local_position_required",
                "local_position_invalid",
                "local_velocity_invalid",
                "local_altitude_invalid",
                "global_position_accuracy_low",
                "global_position_required",
                "global_position_invalid",
                "global_velocity_invalid",
                "home_position_invalid",
                "manual_control_available",
                "gcs_connection_available",
                "offboard_control_signal_lost",
                "rc_signal_found",
                "battery_warning",
                "vtol_fixed_wing_system_failure",
                "engine_failure",
                "mission_failure",
                "avoidance_failure"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "cpu-ram",
      "title": "CPU & RAM",
      "description": "CPU 负载与 RAM 使用率。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "cpuload"
          ]
        ]
      },
      "compute": [],
      "outputs": [
        {
          "container": "axes",
          "title": "CPU & RAM",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[0, 1]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "field",
                  "fields": [
                    "cpuload.ram_usage"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "cpuload.load"
                  ]
                }
              ],
              "labels": [
                "RAM Usage",
                "CPU Load"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "sampling",
      "title": "Sampling Regularity",
      "description": "sensor_combined 采样间隔（相邻 timestamp 差，diff 短一位由 pad_end 补齐）、 estimator_status time_slip。采样间隔抖动大或出现离群值说明日志记录不稳。\n",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "sensor_combined"
          ]
        ]
      },
      "compute": [
        "dt = diff(sensor_combined.timestamp)",
        "dt_full = pad_end(dt, count=1)"
      ],
      "outputs": [
        {
          "container": "axes",
          "title": "Sampling Regularity of Sensor Data",
          "legend": true,
          "grid": true,
          "flipx": false,
          "flipy": false,
          "range": null,
          "hlines": null,
          "split_by_instance": false,
          "ylabel": "[us]",
          "xlabel": "秒（相对日志开始）",
          "children": [
            {
              "mode": "TimeSeries",
              "xdata": null,
              "ydata": [
                {
                  "kind": "var",
                  "name": "dt_full"
                },
                {
                  "kind": "field",
                  "fields": [
                    "estimator_status.time_slip"
                  ]
                }
              ],
              "labels": [
                "delta t (between 2 logged samples)",
                "Estimator time slip (cumulative)"
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
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
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
                  "sensor_gps.latitude_deg",
                  "vehicle_gps_position.latitude_deg",
                  "vehicle_gps_position.lat"
                ],
                "unit": "deg"
              },
              "lon": {
                "cands": [
                  "sensor_gps.longitude_deg",
                  "vehicle_gps_position.longitude_deg",
                  "vehicle_gps_position.lon"
                ],
                "unit": "deg"
              },
              "alt": {
                "cands": [
                  "sensor_gps.altitude_msl_m",
                  "vehicle_gps_position.altitude_msl_m",
                  "vehicle_gps_position.alt"
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
    },
    {
      "id": "spectrum-gyro",
      "title": "Gyro Spectrum (X)",
      "description": "sensor_combined 陀螺 X 轴的单边幅度谱（字段无关频谱算子；采样率由该话题 timestamp 自推）。",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "sensor_combined"
          ]
        ]
      },
      "compute": [
        "gx = sensor_combined.gyro_rad[0]",
        "f, px = spectrum(gx, norm=\"amplitude\")"
      ],
      "outputs": [
        {
          "container": "spectrum",
          "title": "Gyro X 幅度谱",
          "legend": true,
          "grid": true,
          "fmax": null,
          "ymax": null,
          "vlines": [],
          "ylabel": "幅度 [rad/s]",
          "xlabel": "Hz",
          "children": [
            {
              "mode": "spectrum",
              "xdata": null,
              "ydata": [
                {
                  "kind": "var",
                  "name": "px"
                }
              ],
              "freqs": [
                "f"
              ],
              "labels": [
                "Gyro X"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "spectrum-actuator-controls",
      "title": "Actuator Controls FFT",
      "description": "作动器扭矩轴控制的幅度谱（上游 DataPlotFFT 口径：无窗、2/N 归一、fs<100Hz 不画）。 对照 MC_DTERM_CUTOFF / IMU_DGYRO_CUTOFF / IMU_GYRO_CUTOFF 参数线看输出噪声有没有被滤波器压住。\n",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "actuator_controls_0"
          ]
        ]
      },
      "compute": [
        "roll = actuator_controls_0.control[0]",
        "pitch = actuator_controls_0.control[1]",
        "yaw = actuator_controls_0.control[2]",
        "f, pr = spectrum(roll, norm=\"amplitude\", window=\"none\", min_fs=100)",
        "f, pp = spectrum(pitch, norm=\"amplitude\", window=\"none\", min_fs=100)",
        "f, py = spectrum(yaw, norm=\"amplitude\", window=\"none\", min_fs=100)"
      ],
      "outputs": [
        {
          "container": "spectrum",
          "title": "Actuator Controls FFT",
          "legend": true,
          "grid": true,
          "fmax": null,
          "ymax": 0.01,
          "vlines": [
            {
              "param": "MC_DTERM_CUTOFF",
              "label": "MC_DTERM_CUTOFF"
            },
            {
              "param": "IMU_DGYRO_CUTOFF",
              "label": "IMU_DGYRO_CUTOFF"
            },
            {
              "param": "IMU_GYRO_CUTOFF",
              "label": "IMU_GYRO_CUTOFF"
            }
          ],
          "ylabel": "Amplitude",
          "xlabel": "Hz",
          "children": [
            {
              "mode": "spectrum",
              "xdata": null,
              "ydata": [
                {
                  "kind": "var",
                  "name": "pr"
                },
                {
                  "kind": "var",
                  "name": "pp"
                },
                {
                  "kind": "var",
                  "name": "py"
                }
              ],
              "freqs": [
                "f",
                "f",
                "f"
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
      "id": "spectrum-angular-velocity",
      "title": "Angular Velocity FFT",
      "description": "角速度三轴的幅度谱（上游 DataPlotFFT 口径：无窗、2/N 归一、fs<100Hz 不画）。 对照 IMU_GYRO_CUTOFF / IMU_GYRO_NF_FREQ 参数线看陀螺滤波器与陷波器实际落点。\n",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_angular_velocity"
          ]
        ]
      },
      "compute": [
        "wx = vehicle_angular_velocity.xyz[0]",
        "wy = vehicle_angular_velocity.xyz[1]",
        "wz = vehicle_angular_velocity.xyz[2]",
        "f, px = spectrum(wx, norm=\"amplitude\", window=\"none\", min_fs=100)",
        "f, py = spectrum(wy, norm=\"amplitude\", window=\"none\", min_fs=100)",
        "f, pz = spectrum(wz, norm=\"amplitude\", window=\"none\", min_fs=100)"
      ],
      "outputs": [
        {
          "container": "spectrum",
          "title": "Angular Velocity FFT",
          "legend": true,
          "grid": true,
          "fmax": null,
          "ymax": 0.01,
          "vlines": [
            {
              "param": "IMU_GYRO_CUTOFF",
              "label": "IMU_GYRO_CUTOFF"
            },
            {
              "param": "IMU_GYRO_NF_FREQ",
              "label": "IMU_GYRO_NF_FREQ"
            }
          ],
          "ylabel": "Amplitude",
          "xlabel": "Hz",
          "children": [
            {
              "mode": "spectrum",
              "xdata": null,
              "ydata": [
                {
                  "kind": "var",
                  "name": "px"
                },
                {
                  "kind": "var",
                  "name": "py"
                },
                {
                  "kind": "var",
                  "name": "pz"
                }
              ],
              "freqs": [
                "f",
                "f",
                "f"
              ],
              "labels": [
                "Rollspeed",
                "Pitchspeed",
                "Yawspeed"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "spectrum-angular-acceleration",
      "title": "Angular Acceleration FFT",
      "description": "角加速度三轴的幅度谱（上游 DataPlotFFT 口径：无窗、2/N 归一、fs<100Hz 不画，不设 y 上限）。 对照 IMU_DGYRO_CUTOFF / IMU_GYRO_NF_FREQ 参数线看微分链路的噪声与陷波效果。\n",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_angular_acceleration"
          ]
        ]
      },
      "compute": [
        "ax = vehicle_angular_acceleration.xyz[0]",
        "ay = vehicle_angular_acceleration.xyz[1]",
        "az = vehicle_angular_acceleration.xyz[2]",
        "f, px = spectrum(ax, norm=\"amplitude\", window=\"none\", min_fs=100)",
        "f, py = spectrum(ay, norm=\"amplitude\", window=\"none\", min_fs=100)",
        "f, pz = spectrum(az, norm=\"amplitude\", window=\"none\", min_fs=100)"
      ],
      "outputs": [
        {
          "container": "spectrum",
          "title": "Angular Acceleration FFT",
          "legend": true,
          "grid": true,
          "fmax": null,
          "ymax": null,
          "vlines": [
            {
              "param": "IMU_DGYRO_CUTOFF",
              "label": "IMU_DGYRO_CUTOFF"
            },
            {
              "param": "IMU_GYRO_NF_FREQ",
              "label": "IMU_GYRO_NF_FREQ"
            }
          ],
          "ylabel": "Amplitude",
          "xlabel": "Hz",
          "children": [
            {
              "mode": "spectrum",
              "xdata": null,
              "ydata": [
                {
                  "kind": "var",
                  "name": "px"
                },
                {
                  "kind": "var",
                  "name": "py"
                },
                {
                  "kind": "var",
                  "name": "pz"
                }
              ],
              "freqs": [
                "f",
                "f",
                "f"
              ],
              "labels": [
                "Roll accel",
                "Pitch accel",
                "Yaw accel"
              ],
              "styles": [],
              "colors": []
            }
          ]
        }
      ]
    },
    {
      "id": "spectrogram-acceleration",
      "title": "Acceleration Power Spectral Density",
      "description": "加速度三轴的时频热图（上游 DataPlotSpec 口径：hann 256/128、帧内去均值、三轴 PSD 求和、10*log10 dB、fs<100Hz 不画）。上游叫它 \"Power Spectral Density\" 但不是折线图—— 颜色深浅是 dB 强弱，横轴时间、纵轴频率，看振动能量随时间/频率的分布（机架共振、桨叶不平衡）。\n",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "sensor_combined"
          ]
        ]
      },
      "compute": [
        "ax = sensor_combined.accelerometer_m_s2[0]",
        "ay = sensor_combined.accelerometer_m_s2[1]",
        "az = sensor_combined.accelerometer_m_s2[2]",
        "f, t, S = stft(ax, ay, az, min_fs=100)"
      ],
      "outputs": [
        {
          "container": "spectrogram",
          "title": "Acceleration Power Spectral Density",
          "legend": false,
          "grid": true,
          "ylabel": "Hz",
          "xlabel": "s",
          "children": [
            {
              "mode": "stft",
              "freq": "f",
              "times": "t",
              "z": "S",
              "labels": [
                "X",
                "Y",
                "Z"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "spectrogram-angular-velocity",
      "title": "Angular velocity Power Spectral Density",
      "description": "角速度三轴的时频热图（上游 DataPlotSpec 口径：hann 256/128、帧内去均值、三轴 PSD 求和、10*log10 dB、fs<100Hz 不画）。看陀螺频段能量随时间的分布：滤波器截止频率 以上的残留噪声、机架共振峰在什么时刻被激起。\n",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_angular_velocity"
          ]
        ]
      },
      "compute": [
        "wx = vehicle_angular_velocity.xyz[0]",
        "wy = vehicle_angular_velocity.xyz[1]",
        "wz = vehicle_angular_velocity.xyz[2]",
        "f, t, S = stft(wx, wy, wz, min_fs=100)"
      ],
      "outputs": [
        {
          "container": "spectrogram",
          "title": "Angular velocity Power Spectral Density",
          "legend": false,
          "grid": true,
          "ylabel": "Hz",
          "xlabel": "s",
          "children": [
            {
              "mode": "stft",
              "freq": "f",
              "times": "t",
              "z": "S",
              "labels": [
                "rollspeed",
                "pitchspeed",
                "yawspeed"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "spectrogram-angular-acceleration",
      "title": "Angular acceleration Power Spectral Density",
      "description": "角加速度三轴的时频热图（上游 DataPlotSpec 口径：hann 256/128、帧内去均值、三轴 PSD 求和、10*log10 dB、fs<100Hz 不画）。角加速度比角速度对高频更敏感，是看控制链路 噪声/陷波器效果最直接的量。\n",
      "condition": {
        "firmware": "any",
        "vehicle": "any",
        "message": [
          [
            "vehicle_angular_acceleration"
          ]
        ]
      },
      "compute": [
        "jx = vehicle_angular_acceleration.xyz[0]",
        "jy = vehicle_angular_acceleration.xyz[1]",
        "jz = vehicle_angular_acceleration.xyz[2]",
        "f, t, S = stft(jx, jy, jz, min_fs=100)"
      ],
      "outputs": [
        {
          "container": "spectrogram",
          "title": "Angular acceleration Power Spectral Density",
          "legend": false,
          "grid": true,
          "ylabel": "Hz",
          "xlabel": "s",
          "children": [
            {
              "mode": "stft",
              "freq": "f",
              "times": "t",
              "z": "S",
              "labels": [
                "roll accel",
                "pitch accel",
                "yaw accel"
              ]
            }
          ]
        }
      ]
    }
  ]
} as const;
