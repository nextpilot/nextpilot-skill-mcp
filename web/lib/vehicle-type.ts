/**
 * 机型分类的中文名（引擎侧的取值来自 `vehicle_status.vehicle_type`，见 facts.yaml 的
 * `vehicle_types` 码表：`rotary_wing` / `fixed_wing` / `rover` / `airship` / `unknown`，
 * 认不出的码值引擎会给 `unknown(N)`）。
 *
 * 报告页「飞行概况」与历史列表「机型」列共用这一份——各写一张表迟早会对不上
 * （飞行阶段的配色就吃过这个亏，所以才挪进 lib/）。
 */
export const VEHICLE_TYPE_LABELS: Record<string, string> = {
  rotary_wing: "旋翼",
  fixed_wing: "固定翼",
  rover: "Rover",
  airship: "飞艇",
  unknown: "未知机型",
};

/** 取中文名；码表里没有的（如 `unknown(7)`）原样返回，不猜 */
export function vehicleTypeLabel(vehicleType?: string): string {
  if (!vehicleType) return "—";
  return VEHICLE_TYPE_LABELS[vehicleType] ?? vehicleType;
}
