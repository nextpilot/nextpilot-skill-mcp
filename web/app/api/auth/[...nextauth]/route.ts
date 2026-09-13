import { handlers } from "@/auth";

// Credentials authorize 与 GitHub OAuth 回调需要 Node 运行时（边缘函数不支持）。
export const runtime = "nodejs";

export const { GET, POST } = handlers;
