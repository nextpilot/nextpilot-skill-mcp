"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import type { SeriesRequest } from "@/lib/panel-resolver";
import type { SeriesResponse, TrackData } from "@/lib/types";
import { FileUp, Loader2, Move3d, Pause, Play } from "lucide-react";
import { SERIES_COLORS_DARK, SERIES_COLORS_LIGHT } from "@/lib/chart-presets";
import { log } from "@/lib/log";

/**
 * 3D 视图：GPS 轨迹的三维回放（three.js）。与「飞行轨迹」地图同一份 loadTrack 数据，
 * 补两件地图给不了的东西——高度变化的立体感、姿态四元数驱动的机体指向。
 *
 * three 只动态 import（本体数百 KB，不进首屏，与 leaflet 同一策略）；没有 CSS 要静态引，
 * 全部视觉是 canvas 与内联。轨迹坐标用等距柱面投影转成局部米坐标（单条轨迹跨度远小于
 * 投影误差可感的量级），Y 轴是相对最低点的海拔差——真实 1:1 比例，不做垂直夸张，距离感可信。
 *
 * 回放时钟不进 React 状态：60fps 的标记位置/时刻文字由场景循环直写 DOM，React 只管
 * 播放按钮的图标。时间轴 slider 是非受控的，场景每帧按当前进度回写它的 value。
 */

/** 姿态四元数的取数声明。`vehicle_attitude.q` 是「每元素一列」的数组字段，
 *  `topic.field[N]` 逐元素取（engine._ref 的下标语义）；q 是 [w, x, y, z]（body→NED）。
 *  APM 等没有四元数 topic 的格式这四列全取不到 → 界面降级成纯位置标记，不给按钮。 */
const ATT_Q_FIELDS = [
    "vehicle_attitude.q[0]",
    "vehicle_attitude.q[1]",
    "vehicle_attitude.q[2]",
    "vehicle_attitude.q[3]",
];

function attitudeRequest(): SeriesRequest {
    return {
        instance: 0,
        xdata: null,
        ydata: ATT_Q_FIELDS.map((f) => ({ kind: "field" as const, fields: [f] })),
        compute: [],
        series: ATT_Q_FIELDS.map((f) => ({ label: f, style: null, color: null })),
    };
}

/** 二分找时间轴上离 t 最近的采样下标（arr 升序）。轨迹与姿态都按它取"同时刻最近邻"：
 *  GPS 5~10Hz、姿态 100Hz+，最近邻的偏差远小于一个轨迹点间距，不值得做插值。 */
function nearestIndex(arr: Float64Array, t: number): number {
    const last = arr.length - 1;
    if (t <= arr[0]) return 0;
    if (t >= arr[last]) return last;
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] <= t) lo = mid;
        else hi = mid;
    }
    return t - arr[lo] <= arr[hi] - t ? lo : hi;
}

/** 一条准备好的轨迹：局部米坐标（交错 xyz）+ 时间轴（开机秒）+ 顶点色 */
interface PreparedTrack {
    label: string;
    pos: Float32Array; // n*3，x 东 / y 上 / z 南
    ts: Float64Array; // n，开机秒（与 SeriesResponse.t 同基准，px4 provider 按 us/1e6 出）
    colors: Float32Array; // n*3 顶点色
}

/** 姿态样本：过滤掉任一分量缺失的行后的四元数序列（w,x,y,z 交错，已归一化） */
interface AttSamples {
    t: Float64Array;
    q: Float32Array; // n*4
}

function buildAttitude(resp: SeriesResponse): AttSamples | null {
    const cols = resp.series ?? [];
    if (cols.length < 4 || !resp.t?.length) return null;
    const t: number[] = [];
    const q: number[] = [];
    for (let i = 0; i < resp.t.length; i++) {
        const w = cols[0]?.[i];
        const x = cols[1]?.[i];
        const y = cols[2]?.[i];
        const z = cols[3]?.[i];
        if (w == null || x == null || y == null || z == null) continue;
        // 四元数有微小非归一（浮点日志常态），归一化一次；模长异常的行丢弃
        const m = Math.sqrt(w * w + x * x + y * y + z * z);
        if (!isFinite(m) || m < 1e-6) continue;
        t.push(resp.t[i]);
        q.push(w / m, x / m, y / m, z / m);
    }
    if (t.length < 2) return null;
    return { t: Float64Array.from(t), q: Float32Array.from(q) };
}

/** hsl 串 → three 顶点色要的 RGB（0..1）。 */
function hslToRgb(hue: number, s: number, l: number): [number, number, number] {
    const h = (((hue % 360) + 360) % 360) / 360;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const k = (n + h * 12) % 12;
        return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)];
}

/** "#rrggbb" → [r,g,b]（0..1）。SERIES_COLORS 全是 6 位十六进制。 */
function hexToRgb(hex: string): [number, number, number] {
    const v = parseInt(hex.slice(1), 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/** 经纬度 → 局部米坐标（等距柱面投影，原点取第一条轨迹首点）。
 *  three 世界取 ENU：x 东、y 上、z 南——与姿态的 NED→three 旋转共用一套约定。 */
function prepareTracks(tracks: NonNullable<TrackData["tracks"]>, single: boolean, palette: string[]): PreparedTrack[] {
    if (!tracks.length) return [];
    const R = 6371000;
    const lat0 = tracks[0].lat[0];
    const lon0 = tracks[0].lon[0];
    const kLon = (Math.PI / 180) * R * Math.cos((lat0 * Math.PI) / 180);
    const kLat = (Math.PI / 180) * R;
    // 高度基准取全部轨迹的最低点：轨迹整体贴着 y=0 的地面网格，场景不悬空
    let altMin = Infinity;
    for (const tk of tracks) {
        for (const a of tk.alt) {
            if (typeof a === "number" && a < altMin) altMin = a;
        }
    }
    if (!isFinite(altMin)) altMin = 0;

    return tracks.map((tk, ti) => {
        const n = tk.lat.length;
        const alts: number[] = [];
        for (let i = 0; i < n; i++) {
            alts.push(typeof tk.alt[i] === "number" ? (tk.alt[i] as number) : 0);
        }
        const aMin = Math.min(...alts);
        const aMax = Math.max(...alts);
        const pos = new Float32Array(n * 3);
        const colors = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            pos[i * 3] = (tk.lon[i] - lon0) * kLon;
            pos[i * 3 + 1] = alts[i] - altMin;
            pos[i * 3 + 2] = -(tk.lat[i] - lat0) * kLat;
            const rgb = single
                ? // 单条：海拔渐变（与地图色带同一支：hue 220→0）
                  hslToRgb(aMax <= aMin ? 220 : 220 * (1 - (alts[i] - aMin) / (aMax - aMin)), 0.7, 0.48)
                : // 多条：一条一纯色（与地图图例同口径）
                  hexToRgb(palette[ti % palette.length]);
            colors[i * 3] = rgb[0];
            colors[i * 3 + 1] = rgb[1];
            colors[i * 3 + 2] = rgb[2];
        }
        return { label: tk.label || `轨道 ${ti + 1}`, pos, ts: Float64Array.from(tk.t), colors };
    });
}

interface SceneHandle {
    applyFrac: (f: number) => void;
    setPlaying: (p: boolean) => void;
    dispose: () => void;
}

type ThreeModule = typeof import("three");
/** 类引用要用 typeof 取构造器：不带 typeof 的 `import(...).OrbitControls` 是实例类型 */
type OrbitControlsCtor = typeof import("three/examples/jsm/controls/OrbitControls.js").OrbitControls;

function isDark(): boolean {
    return document.documentElement.dataset.theme === "dark";
}

/** 回放 UI 的 DOM 通道：slider/label 由 React 条件渲染（ready 后才挂载），
 *  场景每帧从这里现取；拿不到就跳过（初始 applyFrac(0) 那次还没挂，正常）。 */
interface ReplayDom {
    slider: HTMLInputElement | null;
    label: HTMLSpanElement | null;
}

async function getThree(): Promise<{ THREE: ThreeModule; OrbitControls: OrbitControlsCtor }> {
    const [THREE, { OrbitControls }] = await Promise.all([
        import("three"),
        import("three/examples/jsm/controls/OrbitControls.js"),
    ]);
    return { THREE, OrbitControls };
}

/** WebGL 上下文探测：headless/无 GPU 环境下 WebGLRenderer 的报错是一句含混的
 *  "Error creating WebGL context"，先探一次把"环境不支持"说成用户看得懂的话。 */
function assertWebgl(container: HTMLElement): void {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
    if (!gl) {
        throw new Error("当前浏览器/环境不支持 WebGL，无法渲染 3D 视图（轨迹请看「飞行轨迹」地图）");
    }
    void container;
}

export function LogTrack3D({
    loadTrack,
    requestSeries,
    onRestore,
}: {
    /** 取轨迹：存档里有就直接给（打开历史时不必解析），否则问 Worker 要（与地图同一入口） */
    loadTrack: () => Promise<TrackData>;
    /** 取姿态四元数（vehicle_attitude.q[0..3]）；取不到时降级成位置标记 */
    requestSeries: (req: SeriesRequest) => Promise<SeriesResponse>;
    /** 「重新选择该日志文件」：轨迹取不到且是"Worker 没装着这份日志"时给入口 */
    onRestore?: () => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const replayDomRef = useRef<ReplayDom>({ slider: null, label: null });
    const sceneRef = useRef<SceneHandle | null>(null);
    const [state, setState] = useState<"loading" | "ready" | "error">("loading");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [errorReasons, setErrorReasons] = useState<string[]>([]);
    const [errorCode, setErrorCode] = useState<TrackData["code"]>(undefined);
    const [pointCount, setPointCount] = useState(0);
    const [trackCount, setTrackCount] = useState(0);
    const [playing, setPlaying] = useState(false);
    /** 姿态四元数取不到的原因（null = 可用，画机体标记） */
    const [attNote, setAttNote] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        let handle: SceneHandle | null = null;

        async function load() {
            setState("loading");
            setErrorMsg(null);
            setErrorReasons([]);
            setErrorCode(undefined);
            setAttNote(null);
            setPlaying(false);
            try {
                const { THREE, OrbitControls } = await getThree();
                const track = await loadTrack();
                if (cancelled) return;
                const list = track.tracks ?? [];
                if (track.error || list.length === 0) {
                    // 与地图同一口径：`track.error` 必带原因；走到 ?? 那支是引擎违约，别伪装成"没轨迹"
                    setErrorMsg(track.error ?? "引擎没有返回任何轨道，也没给出原因（解析器缺陷，请反馈）");
                    setErrorReasons(track.errorReasons ?? []);
                    setErrorCode(track.code);
                    setState("error");
                    return;
                }

                // 姿态与轨迹并行拉：姿态只是锦上添花，失败不拦轨迹
                const attResp = await requestSeries(attitudeRequest()).catch(() => null);
                if (cancelled) return;
                let att: AttSamples | null = null;
                if (!attResp || attResp.error) {
                    setAttNote(attResp?.error ? `姿态取数失败：${attResp.error}` : "姿态取数失败");
                } else {
                    att = buildAttitude(attResp);
                    if (!att) {
                        setAttNote(
                            "这份日志取不到姿态四元数（vehicle_attitude.q，APM 等格式没有该 topic）——只显示位置标记",
                        );
                    }
                }

                if (!containerRef.current) return;
                assertWebgl(containerRef.current);
                const dark = isDark();
                const single = list.length === 1;
                const palette = dark ? SERIES_COLORS_DARK : SERIES_COLORS_LIGHT;
                const prepared = prepareTracks(list, single, palette);
                handle = buildScene(
                    THREE,
                    OrbitControls,
                    containerRef.current,
                    prepared,
                    att,
                    dark,
                    replayDomRef.current,
                );
                if (cancelled) {
                    handle.dispose();
                    return;
                }
                sceneRef.current = handle;
                setPointCount(prepared.reduce((s, t) => s + t.ts.length, 0));
                setTrackCount(prepared.length);
                handle.applyFrac(0);
                setState("ready");
            } catch (err) {
                log.err("LogTrack3D 加载失败:", err);
                if (!cancelled) {
                    // 错误必须落成文案：只 setState("error") 的话界面只剩兜底话，
                    // 是 WebGL 缺失还是取数失败无从分辨（e2e 踩过）
                    setErrorMsg(err instanceof Error ? err.message : String(err));
                    setState("error");
                }
            }
        }

        load();
        return () => {
            cancelled = true;
            handle?.dispose();
            sceneRef.current = null;
        };
    }, [loadTrack, requestSeries]);

    const onScrub = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        sceneRef.current?.applyFrac(Number(e.target.value) / 1000);
    }, []);

    const togglePlay = useCallback(() => {
        setPlaying((p) => {
            sceneRef.current?.setPlaying(!p);
            return !p;
        });
    }, []);

    return (
        <div className="mt-3">
            <h4 className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted">
                <Move3d className="h-3.5 w-3.5" />
                3D 轨迹 · {pointCount > 0 ? `${pointCount} 点` : ""}
                {trackCount > 1 ? ` · ${trackCount} 条轨道` : ""}
                <span className="text-faint">（拖拽旋转 · 滚轮缩放 · 右键平移；高度相对最低点，1:1 真实比例）</span>
            </h4>

            {/* 容器始终渲染：loading/error 时 canvas 还没挂，overlay 盖在上面说清状态
                （同 LogFlightMap 的结构——不用条件挂载，省得首次量尺寸拿到 0） */}
            <div className="relative" data-testid="track3d-container">
                <div ref={containerRef} className="h-[420px] w-full overflow-hidden rounded-lg sm:h-[560px]" />
                {state !== "ready" && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-surface-2 p-4 text-center text-xs text-critical">
                        {state === "loading" ? (
                            <span className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                加载 3D 轨迹…
                            </span>
                        ) : (
                            <div className="flex max-w-2xl flex-col items-center gap-2">
                                <span>{errorMsg ?? "无法加载 3D 轨迹数据"}</span>
                                {errorReasons.length > 1 && (
                                    <ul className="w-full list-disc space-y-0.5 pl-5 text-left">
                                        {errorReasons.map((r) => (
                                            <li key={r}>{r}</li>
                                        ))}
                                    </ul>
                                )}
                                {errorCode === "log-not-loaded" && onRestore && (
                                    <button
                                        type="button"
                                        onClick={onRestore}
                                        className="btn-ghost gap-1.5 px-2.5 py-1 text-xs"
                                    >
                                        <FileUp className="h-3.5 w-3.5" />
                                        重新选择该日志文件
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {state === "ready" && (
                <div className="mt-2 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={togglePlay}
                        className="btn-ghost gap-1 px-2 py-1 text-xs"
                        title={playing ? "暂停回放" : "播放回放（全程约 30 秒，循环）"}
                    >
                        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        {playing ? "暂停" : "回放"}
                    </button>
                    <input
                        ref={(el) => {
                            replayDomRef.current.slider = el;
                        }}
                        type="range"
                        min={0}
                        max={1000}
                        defaultValue={0}
                        onChange={onScrub}
                        className="h-1 flex-1 cursor-pointer"
                        aria-label="回放时间轴"
                        data-testid="track3d-scrub"
                    />
                    <span
                        ref={(el) => {
                            replayDomRef.current.label = el;
                        }}
                        className="w-20 text-right font-mono text-[11px] text-muted"
                        data-testid="track3d-time"
                    />
                </div>
            )}

            {state === "ready" && attNote && <p className="mt-1.5 text-[11px] text-warning">{attNote}</p>}
        </div>
    );
}

/**
 * 搭 three 场景：轨迹线（顶点色）+ 地面网格 + 起/终点 + 回放标记，带 OrbitControls 与
 * 尺寸自适应。返回句柄把「拖时间轴 / 播放」从 React 里隔离——标记位置不经过 setState。
 */
function buildScene(
    THREE: ThreeModule,
    OrbitControls: OrbitControlsCtor,
    container: HTMLElement,
    tracks: PreparedTrack[],
    att: AttSamples | null,
    dark: boolean,
    replayDom: ReplayDom,
): SceneHandle {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(dark ? 0x17171c : 0xeef1f5);

    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 1e7);

    // 包围盒：网格、相机与标记尺寸都按它定标
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const tk of tracks) {
        for (let i = 0; i < tk.pos.length; i += 3) {
            if (tk.pos[i] < minX) minX = tk.pos[i];
            if (tk.pos[i] > maxX) maxX = tk.pos[i];
            if (tk.pos[i + 1] < minY) minY = tk.pos[i + 1];
            if (tk.pos[i + 1] > maxY) maxY = tk.pos[i + 1];
            if (tk.pos[i + 2] < minZ) minZ = tk.pos[i + 2];
            if (tk.pos[i + 2] > maxZ) maxZ = tk.pos[i + 2];
        }
    }
    const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;

    // 地面网格贴在 y=0（= 全轨迹最低高度）上，给空间一个"地"的参照
    const grid = new THREE.GridHelper(extent * 1.6, 12, dark ? 0x3a3a44 : 0xb9c0cc, dark ? 0x26262e : 0xdde2ea);
    grid.position.set(cx, 0, cz);
    scene.add(grid);

    scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x333340 : 0x888888, 1.5));

    const disposables: { dispose: () => void }[] = [renderer];

    // 轨迹线：一条一个 Line，顶点色逐点写入（单条按海拔渐变、多条每条纯色，prepare 时已定）
    for (const tk of tracks) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(tk.pos, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(tk.colors, 3));
        const mat = new THREE.LineBasicMaterial({ vertexColors: true });
        scene.add(new THREE.Line(geo, mat));
        disposables.push(geo, mat);
    }

    // 起/终点小球（只标第一条：与地图同口径，多条时颜色已能分清）
    const first = tracks[0];
    const n0 = first.ts.length;
    const ballGeo = new THREE.SphereGeometry(Math.max(extent * 0.012, 0.4), 16, 12);
    const startMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const endMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const startBall = new THREE.Mesh(ballGeo, startMat);
    startBall.position.set(first.pos[0], first.pos[1], first.pos[2]);
    const endBall = new THREE.Mesh(ballGeo, endMat);
    endBall.position.set(first.pos[(n0 - 1) * 3], first.pos[(n0 - 1) * 3 + 1], first.pos[(n0 - 1) * 3 + 2]);
    scene.add(startBall, endBall);
    disposables.push(ballGeo, startMat, endMat);

    // 回放标记：有姿态画小飞机（机头 = 机体 +x），没有就一个球沿轨迹走
    const marker = new THREE.Group();
    if (att) {
        const mat = new THREE.MeshLambertMaterial({ color: 0xef4444 });
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 10), mat);
        body.rotation.z = -Math.PI / 2; // 锥体默认尖朝 +y，转到机体 +x（机头）
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.3, 0.07), mat);
        wing.position.x = 0.05;
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.4), mat);
        tail.position.set(-0.38, 0, -0.16);
        marker.add(body, wing, tail);
        disposables.push(mat, body.geometry, wing.geometry, tail.geometry);
    } else {
        const mat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        marker.add(new THREE.Mesh(ballGeo, mat));
        disposables.push(mat);
    }
    marker.scale.setScalar(Math.max(extent * 0.06, 0.8));
    scene.add(marker);

    // PX4 四元数是 body→NED（x 北、y 东、z 下）；three 世界是 ENU（x 东、y 上、z 南）。
    // 姿态要左乘一个 NED→three 的固定旋转：它的列是 NED 三根轴在 three 里的像——
    // 北→-z、东→+x、下→-y（行列式 +1，纯旋转）。位置映射 prepareTracks 里已是同一约定。
    const R = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().set(
            0,
            1,
            0,
            0, //
            0,
            0,
            -1,
            0, //
            -1,
            0,
            0,
            0, //
            0,
            0,
            0,
            1,
        ),
    );
    const qTmp = new THREE.Quaternion();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, cy, cz);
    camera.position.set(cx + extent * 0.8, cy + extent * 0.9, cz + extent * 0.9);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = extent * 0.05;
    controls.maxDistance = extent * 12;
    controls.update();
    disposables.push(controls);

    // 回放时钟：标记沿第一条轨迹，姿态取同时刻最近邻。全程固定 30 秒循环。
    const ts = first.ts;
    const tMin = ts[0];
    const tMax = ts[n0 - 1];
    const PLAYBACK_SEC = 30;
    let frac = 0;
    let playing = false;
    let raf = 0;
    let lastFrame = performance.now();

    function applyFrac(f: number) {
        frac = Math.max(0, Math.min(1, f));
        const tCur = tMin + frac * (tMax - tMin);
        const i = nearestIndex(ts, tCur);
        marker.position.set(first.pos[i * 3], first.pos[i * 3 + 1], first.pos[i * 3 + 2]);
        if (att) {
            const qi = nearestIndex(att.t, tCur) * 4;
            // att.q 存的是 [w,x,y,z]；three 的 Quaternion.set 按 (x,y,z,w) 收参
            qTmp.set(att.q[qi + 1], att.q[qi + 2], att.q[qi + 3], att.q[qi]);
            marker.quaternion.copy(R).multiply(qTmp);
        }
        const slider = replayDom.slider;
        if (slider) slider.value = String(Math.round(frac * 1000));
        const label = replayDom.label;
        if (label) label.textContent = `${tCur.toFixed(1)} s`;
    }

    function frame(now: number) {
        raf = requestAnimationFrame(frame);
        const dt = Math.min((now - lastFrame) / 1000, 0.1); // 后台标签页回来时 dt 会巨大，封顶
        lastFrame = now;
        if (playing) {
            const next = frac + dt / PLAYBACK_SEC;
            applyFrac(next >= 1 ? 0 : next); // 循环回放
        }
        controls.update();
        renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);

    const ro = new ResizeObserver(() => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });
    ro.observe(container);

    return {
        applyFrac,
        setPlaying(p) {
            playing = p;
        },
        dispose() {
            cancelAnimationFrame(raf);
            ro.disconnect();
            disposables.forEach((d) => d.dispose());
            renderer.domElement.remove();
        },
    };
}
