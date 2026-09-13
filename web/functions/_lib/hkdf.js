// HKDF-SHA256（RFC 5869），复刻 @panva/hkdf 的简单用法，边缘运行时零依赖。
// next-auth / @auth/core 用它从 AUTH_SECRET 派生 JWT 加密密钥。
const encoder = new TextEncoder();

function toBytes(input) {
  return typeof input === "string" ? encoder.encode(input) : new Uint8Array(input);
}

/**
 * @param {string|Uint8Array} ikmInput 初始密钥材料（AUTH_SECRET）
 * @param {string} salt HKDF salt（Auth.js 传 session cookie 名）
 * @param {string} info HKDF info（Auth.js 固定文案）
 * @param {number} length 输出字节数（A256CBC-HS512 为 64）
 * @returns {Promise<Uint8Array>}
 */
export async function hkdf(ikmInput, salt, info, length = 64) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    toBytes(ikmInput),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toBytes(salt ?? ""),
      info: toBytes(info ?? ""),
    },
    baseKey,
    length * 8,
  );
  return new Uint8Array(bits);
}
