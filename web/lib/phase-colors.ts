/**
 * 飞行模式（PX4 `vehicle_status.nav_state`）的配色与中文名，报告页两处都用它：
 * 「飞行阶段条」（LogPhaseStrip）与「数据图表」里每条曲线的阶段底色（LogCharts）。
 *
 * 为什么是模式而不是阶段：模式的取值就是引擎 `np_materials().phases[].mode` 给的
 * PX4 原始模式名（Manual / Position / Mission…），而 facts.yaml 里的 `nav_groups` 是
 * 给规则用的固定翼口径分组（`fw_cruise = [Mission, AltitudeCruise]`，多旋翼在 Mission
 * 下并不算"固巡"）。界面要的是"这段在干嘛"的直观区分，所以按模式上色、另配中文名。
 *
 * 曾经的坑：PhaseStrip 用阶段名（hover/landing）当键去查颜色，而引擎给的是模式名，
 * 交集为空，整条都是兜底灰。加模式时要同时加进这张表（颜色 + 中文名）。
 */
export interface ModeStyle {
    /** 色带/方块的颜色（浅色主题） */
    color: string;
    /** 深色主题下的颜色（色相不变、提亮） */
    colorDark: string;
    /** 中文名（标签用；查不到就退回 PX4 模式名） */
    label: string;
}

export const MODE_STYLES: Record<string, ModeStyle> = {
    Manual: { color: "#3987e5", colorDark: "#5b9df0", label: "手动" },
    Altitude: { color: "#d95926", colorDark: "#e8743f", label: "定高" },
    Position: { color: "#199e70", colorDark: "#2fbb8a", label: "定点" },
    PositionSlow: { color: "#199e70", colorDark: "#2fbb8a", label: "慢速定点" },
    Mission: { color: "#c98500", colorDark: "#e09a1a", label: "任务" },
    Hold: { color: "#d55181", colorDark: "#e96d99", label: "悬停" },
    Return: { color: "#008300", colorDark: "#1aa31a", label: "返航" },
    Offboard: { color: "#9085e9", colorDark: "#a89ff0", label: "外部控制" },
    Takeoff: { color: "#e66767", colorDark: "#ef8585", label: "起飞" },
    Land: { color: "#5b8fb9", colorDark: "#77a8cd", label: "降落" },
    Stabilized: { color: "#b08050", colorDark: "#c99a6d", label: "增稳" },
    Acro: { color: "#7f8ea3", colorDark: "#98a6ba", label: "特技" },
    Descend: { color: "#a06cd5", colorDark: "#b587e3", label: "下降" },
    Termination: { color: "#c0392b", colorDark: "#e05a4a", label: "终止" },
};

/** 查不到的模式（Free1/Free2… 与厂商自定义）统一用灰，不编颜色 */
export const MODE_OTHER = { color: "#6b7280", colorDark: "#8b95a3" };

export function modeStyle(mode: string, dark = false): { color: string; label: string } {
    const s = MODE_STYLES[mode] ?? MODE_OTHER;
    return { color: dark ? s.colorDark : s.color, label: MODE_STYLES[mode]?.label ?? mode };
}

/** 当前是否暗色主题（`<html data-theme="dark">`）。阶段条、飞行概况的模式色都要按它挑深浅 */
export function isDarkTheme(): boolean {
    if (typeof document === "undefined") return false;
    return document.documentElement.getAttribute("data-theme") === "dark";
}
