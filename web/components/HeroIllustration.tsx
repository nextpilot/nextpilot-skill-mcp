/**
 * 首页 Hero 右侧的插画（纯 SVG，无外部图片、无位图）。
 *
 * 画面讲的是本站的一件事：一架飞行器沿航迹飞过，航迹与传感器波形被记录下来，
 * 下面是判读出来的检查结论。雷达环是"探测/判读"的意象（与 favicon 同源），
 * 波形上的琥珀色虚线借自查表里的阈值参考线，底部那张卡就是报告里的检查结论。
 *
 * 颜色走 CSS 变量 / currentColor，深浅色主题都跟得上；整块在 lg 以下隐藏（移动端省地方）。
 */
export function HeroIllustration({ className }: { className?: string }) {
    const mono = "PingFang SC, Microsoft YaHei, sans-serif";
    return (
        <svg
            viewBox="0 0 340 388"
            className={className}
            fill="none"
            role="img"
            aria-label="飞行器沿航迹飞行，日志波形与检查结论"
        >
            {/* 雷达环 + 十字线：中心落在飞行器上 */}
            <g stroke="currentColor" opacity="0.28">
                <circle cx="248" cy="92" r="26" strokeWidth="0.8" strokeDasharray="3 4" />
                <circle cx="248" cy="92" r="50" strokeWidth="0.8" strokeDasharray="3 4" />
                <circle cx="248" cy="92" r="74" strokeWidth="0.8" strokeDasharray="3 4" opacity="0.6" />
                <line x1="248" y1="8" x2="248" y2="176" strokeWidth="0.6" opacity="0.5" />
                <line x1="164" y1="92" x2="332" y2="92" strokeWidth="0.6" opacity="0.5" />
            </g>

            {/* 航迹：从左下爬升到飞行器，沿途留航点 */}
            <path d="M28 246 C110 244 176 148 244 100" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="28" cy="246" r="4" fill="currentColor" />
            <circle cx="118" cy="222" r="2.5" fill="currentColor" opacity="0.75" />
            <circle cx="184" cy="162" r="2.5" fill="currentColor" opacity="0.75" />
            <circle cx="244" cy="100" r="3.5" fill="currentColor" />

            {/* 四旋翼：机身 + 4 根臂 + 4 个桨盘 */}
            <g stroke="currentColor" strokeWidth="1.6" opacity="0.9">
                <line x1="248" y1="92" x2="222" y2="76" />
                <line x1="248" y1="92" x2="274" y2="76" />
                <line x1="248" y1="92" x2="222" y2="108" />
                <line x1="248" y1="92" x2="274" y2="108" />
            </g>
            <g stroke="currentColor" strokeWidth="1.2" opacity="0.55">
                <circle cx="222" cy="76" r="8" />
                <circle cx="274" cy="76" r="8" />
                <circle cx="222" cy="108" r="8" />
                <circle cx="274" cy="108" r="8" />
            </g>
            <rect x="239" y="85" width="18" height="14" rx="4" fill="currentColor" />

            {/* 传感器波形 + 阈值参考线（借自查表的参考线样式） */}
            <path
                d="M20 316 h36 l8-22 10 40 9-28 8 10 h34 l8-20 9 34 9-24 8 10 h36 l8-18 9 32 9-26 8 12 h36 l7-16 8 28 8-22 8 10 h22"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.85"
            />
            <line
                x1="20"
                y1="300"
                x2="320"
                y2="300"
                stroke="#915930"
                strokeWidth="1"
                strokeDasharray="5 4"
                opacity="0.85"
            />

            {/* 检查结论卡：一行标题 + 三条结论（严重/警告/提示各一） */}
            <g>
                <rect
                    x="20"
                    y="330"
                    width="300"
                    height="52"
                    rx="10"
                    stroke="currentColor"
                    strokeWidth="1"
                    opacity="0.35"
                />
                <rect x="34" y="342" width="58" height="6" rx="3" fill="currentColor" opacity="0.55" />
                <g fontFamily={mono} fontSize="10">
                    <circle cx="38" cy="362" r="3.5" fill="#b8272c" />
                    <text x="48" y="365.5" fill="currentColor" opacity="0.85">
                        振动超标 · 4
                    </text>
                    <circle cx="150" cy="362" r="3.5" fill="#915930" />
                    <text x="160" y="365.5" fill="currentColor" opacity="0.85">
                        电压跌落 · 1
                    </text>
                    <circle cx="252" cy="362" r="3.5" fill="#18794e" />
                    <text x="262" y="365.5" fill="currentColor" opacity="0.85">
                        正常 · 2
                    </text>
                </g>
            </g>
        </svg>
    );
}
