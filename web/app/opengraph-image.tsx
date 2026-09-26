import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export const alt = "NextPilot Skill — 飞控 AI Skill 与 MCP 平台";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
    return new ImageResponse(
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg, #0a1f16 0%, #0d3323 40%, #0a2818 100%)",
                fontFamily: '"Inter", "Noto Sans SC", sans-serif',
                padding: 60,
            }}
        >
            {/* 点阵背景 */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                }}
            >
                {Array.from({ length: 48 }).map((_, i) =>
                    Array.from({ length: 24 }).map((_, j) => (
                        <div
                            key={`${i}-${j}`}
                            style={{
                                position: "absolute",
                                left: 26 * i,
                                top: 26 * j,
                                width: 1,
                                height: 1,
                                borderRadius: "50%",
                                background: "rgba(24,121,78,0.08)",
                            }}
                        />
                    )),
                )}
            </div>

            {/* Logo 区 */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    marginBottom: 24,
                }}
            >
                <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                    <circle cx="26" cy="26" r="24" stroke="#18794e" strokeWidth="2.5" />
                    <path
                        d="M26 8 L38 38 L14 38 Z"
                        fill="#18794e"
                        style={{ transform: "rotate(180deg)", transformOrigin: "26px 23px" }}
                    />
                    <line x1="26" y1="38" x2="26" y2="46" stroke="#18794e" strokeWidth="2.5" />
                    <line x1="18" y1="46" x2="34" y2="46" stroke="#18794e" strokeWidth="2" />
                </svg>
                <span
                    style={{
                        fontSize: 48,
                        fontWeight: 800,
                        color: "#e8f5e9",
                        letterSpacing: "-0.02em",
                    }}
                >
                    NextPilot
                    <span style={{ color: "#4ade80" }}> Skill</span>
                </span>
            </div>

            {/* 描述 */}
            <p
                style={{
                    fontSize: 24,
                    color: "rgba(255,255,255,0.6)",
                    maxWidth: 700,
                    textAlign: "center",
                    lineHeight: 1.5,
                    marginTop: 0,
                    marginBottom: 32,
                }}
            >
                专为飞行控制优化的 AI Skill 与 MCP 平台
            </p>

            {/* 底部标签 */}
            <div
                style={{
                    display: "flex",
                    gap: 12,
                    marginTop: 8,
                }}
            >
                {["感知", "决策", "控制", "工具链"].map((tag) => (
                    <span
                        key={tag}
                        style={{
                            padding: "6px 18px",
                            borderRadius: 20,
                            background: "rgba(24,121,78,0.15)",
                            color: "#4ade80",
                            fontSize: 16,
                            fontWeight: 500,
                        }}
                    >
                        {tag}
                    </span>
                ))}
            </div>

            {/* 底部 URL */}
            <p
                style={{
                    position: "absolute",
                    bottom: 32,
                    fontSize: 14,
                    color: "rgba(255,255,255,0.25)",
                }}
            >
                skill.nextpilot.org
            </p>
        </div>,
        { width: 1200, height: 630 },
    );
}
