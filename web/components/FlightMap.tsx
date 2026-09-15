"use client";

import { useEffect, useRef, useState } from "react";
import type { TopicManifest, SeriesResponse } from "@/lib/types";
import type { SeriesRequest } from "@/lib/chart-presets";
import { Loader2, MapPin } from "lucide-react";

interface GpsPoint {
  lat: number;
  lon: number;
  alt: number;
}

function findGpsInstance(manifest: TopicManifest): number | null {
  const topic = manifest.topics.find((t) => t.topic === "vehicle_gps_position");
  return topic !== undefined ? topic.instance : null;
}

function altitudeColor(alt: number, minAlt: number, maxAlt: number): string {
  if (maxAlt <= minAlt) return "#4a8cf7";
  const t = Math.max(0, Math.min(1, (alt - minAlt) / (maxAlt - minAlt)));
  const hue = Math.round(220 * (1 - t));
  return `hsl(${hue}, 70%, 48%)`;
}

type LeafletModule = typeof import("leaflet");

async function getLeaflet(): Promise<LeafletModule> {
  const mod = await import("leaflet");
  const L: LeafletModule = (mod as unknown as { default: LeafletModule }).default ?? mod;
  await import("leaflet/dist/leaflet.css");
  return L;
}

export function FlightMap({
  manifest,
  requestSeries,
}: {
  manifest: TopicManifest;
  requestSeries: (req: SeriesRequest) => Promise<SeriesResponse>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [altRange, setAltRange] = useState<[number, number] | null>(null);
  const [pointCount, setPointCount] = useState(0);

  const gpsInstance = findGpsInstance(manifest);

  useEffect(() => {
    if (gpsInstance === null) {
      setState("error");
      return;
    }

    let cancelled = false;
    let LModule: LeafletModule | null = null;

    async function load() {
      try {
        LModule = await getLeaflet();

        const resp = await requestSeries({
          topic: "vehicle_gps_position",
          instance: gpsInstance!,
          fields: ["lat", "lon", "alt"],
          panel: -1,
        });

        if (cancelled) return;

        const latArr = resp.series["lat"];
        const lonArr = resp.series["lon"];
        const altArr = resp.series["alt"];

        if (!latArr || !lonArr) {
          setState("error");
          return;
        }

        const points: GpsPoint[] = [];
        for (let i = 0; i < latArr.length; i++) {
          const lat = latArr[i];
          const lon = lonArr[i];
          if (lat !== null && lon !== null) {
            const altVal = altArr?.[i];
            points.push({
              lat: lat / 1e7,
              lon: lon / 1e7,
              alt: altVal !== null && altVal !== undefined ? altVal / 1000 : 0,
            });
          }
        }

        if (points.length < 2) {
          setState("error");
          return;
        }

        const alts = points.map((p) => p.alt);
        setAltRange([Math.min(...alts), Math.max(...alts)]);
        setPointCount(points.length);
        buildMap(LModule, points);
        setState("ready");
      } catch (err) {
        console.error("FlightMap 加载失败:", err);
        if (!cancelled) setState("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [gpsInstance, requestSeries]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (state === "ready" && mapRef.current) {
      const timer = setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [state]);

  function buildMap(L: LeafletModule, points: GpsPoint[]) {
    if (!containerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
      attributionControl: false,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);

    const alts = points.map((p) => p.alt);
    const minAlt = Math.min(...alts);
    const maxAlt = Math.max(...alts);

    const segCount = Math.min(150, points.length);
    const segSize = Math.max(1, Math.floor((points.length - 1) / segCount));

    for (let i = 0; i < points.length - 1; i += segSize) {
      const end = Math.min(i + segSize + 1, points.length);
      const seg = points.slice(i, end);
      const segAlt = seg.reduce((s, p) => s + p.alt, 0) / seg.length;
      const color = altitudeColor(segAlt, minAlt, maxAlt);

      L.polyline(
        seg.map((p) => [p.lat, p.lon] as [number, number]),
        { color, weight: 3, opacity: 0.85 },
      ).addTo(map);
    }

    const startIcon = L.divIcon({
      className: "",
      html: '<div style="background:#22c55e;width:10px;height:10px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    const endIcon = L.divIcon({
      className: "",
      html: '<div style="background:#ef4444;width:10px;height:10px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    L.marker([points[0].lat, points[0].lon], { icon: startIcon })
      .bindTooltip(`起点 · ${points[0].alt.toFixed(1)} m`)
      .addTo(map);
    L.marker([points[points.length - 1].lat, points[points.length - 1].lon], { icon: endIcon })
      .bindTooltip(`终点 · ${points[points.length - 1].alt.toFixed(1)} m`)
      .addTo(map);

    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [20, 20] });
  }

  if (gpsInstance === null) {
    return null;
  }

  return (
    <div className="mt-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
        <MapPin className="h-3.5 w-3.5" />
        GPS 轨迹 · {pointCount > 0 ? `${pointCount} 点` : ""}
      </h4>

      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 rounded-lg py-10 text-xs text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载 GPS 轨迹…
        </div>
      )}

      {state === "error" && (
        <p className="rounded-lg py-6 text-center text-xs text-muted">
          无法加载 GPS 轨迹数据
        </p>
      )}

      <div
        ref={containerRef}
        className="h-[320px] w-full overflow-hidden rounded-lg"
        style={{ display: state === "ready" ? "block" : "none" }}
      />

      {state === "ready" && altRange && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
          <span>高度</span>
          <span
            className="inline-block h-3 w-full max-w-[160px] rounded-sm"
            style={{
              background:
                "linear-gradient(to right, hsl(220,70%,48%), hsl(180,70%,48%), hsl(120,70%,48%), hsl(60,70%,48%), hsl(0,70%,48%))",
            }}
          />
          <span>{altRange[0].toFixed(1)} m</span>
          <span>–</span>
          <span>{altRange[1].toFixed(1)} m</span>
        </div>
      )}
    </div>
  );
}