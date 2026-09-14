"use client";

/**
 * 匿名设备 ID：冲刺 2 免费试用配额的计量维度之一（另一个维度是服务端 IP）。
 * localStorage 持久化，清掉会重置但服务端仍有 IP 日上限兜底。
 */
const KEY = "nextpilot:device-id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}
