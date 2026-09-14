/**
 * 日志内容指纹：同一份日志重复上传时直接命中历史结果，不重复解析、不重复计费。
 * 用 SHA-256（crypto.subtle 只在安全上下文可用：https 或 localhost）。
 * 非安全上下文（如局域网 http 调试）退化为「大小 + 修改时间 + 文件名」指纹，
 * 只在同一台设备同一浏览器内用于去重，不参与跨设备判断。
 */
export async function hashLogBytes(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return "";
  try {
    const digest = await subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

/** 无法计算内容哈希时的兜底指纹（非加密强度，仅本机去重可用） */
export function fallbackLogKey(name: string, size: number, lastModified: number): string {
  return `fp_${size}_${lastModified}_${name}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 120);
}
