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
                    "vehicle_torque_setpoint.xyz"
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
                    "vehicle_torque_setpoint.xyz"
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
                    "vehicle_torque_setpoint.xyz"
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
                    "actuator_motors.control"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_motors.control"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_motors.control"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_motors.control"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_motors.control"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_motors.control"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_motors.control"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_motors.control"
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
                    "actuator_servos.control"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_servos.control"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_servos.control"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_servos.control"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_servos.control"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_servos.control"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_servos.control"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_servos.control"
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
                    "actuator_outputs.output"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output"
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
                    "actuator_outputs.output"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "actuator_outputs.output"
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
                    "sensor_combined.accelerometer_m_s2"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "sensor_combined.accelerometer_m_s2"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "sensor_combined.accelerometer_m_s2"
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
                    "sensor_combined.gyro_rad"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "sensor_combined.gyro_rad"
                  ]
                },
                {
                  "kind": "field",
                  "fields": [
                    "sensor_combined.gyro_rad"
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
                    "system_power.sensors3v3"
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
      "description": "sensor_combined 采样间隔与 estimator_status time_slip。",
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
                  "kind": "field",
                  "fields": [
                    "estimator_status.time_slip"
                  ]
                }
              ],
              "labels": [
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
    }
  ]
} as const;
