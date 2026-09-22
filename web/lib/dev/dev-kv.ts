/**
 * 仅本地开发使用的内存版 KV，模拟 EdgeOne Pages KV 绑定（put/get/delete/list）。
 * 数据存在 globalThis 上，dev server 不重启就一直在；生产环境从不加载本文件。
 */

export interface DevKvListResult {
    keys: { key: string }[];
    complete: boolean;
    cursor: string | null;
}

class DevKv {
    private store(): Map<string, string> {
        const g = globalThis as unknown as { __nextpilotDevKv?: Map<string, string> };
        if (!g.__nextpilotDevKv) g.__nextpilotDevKv = new Map();
        return g.__nextpilotDevKv;
    }

    async put(key: string, value: string): Promise<void> {
        this.store().set(key, value);
    }

    async get(key: string, options?: { type?: string } | string): Promise<unknown> {
        const raw = this.store().get(key);
        if (raw === undefined) return null;
        const type = typeof options === "string" ? options : (options?.type ?? "text");
        if (type === "json") return JSON.parse(raw) as unknown;
        if (type === "arrayBuffer") return new TextEncoder().encode(raw).buffer;
        return raw;
    }

    async delete(key: string): Promise<void> {
        this.store().delete(key);
    }

    async list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<DevKvListResult> {
        const prefix = options?.prefix ?? "";
        const limit = options?.limit ?? 256;
        const all = [...this.store().keys()].sort();
        let filtered = all.filter((k) => k.startsWith(prefix));
        if (options?.cursor) {
            filtered = filtered.filter((k) => k > options!.cursor!);
        }
        const page = filtered.slice(0, limit);
        return {
            keys: page.map((key) => ({ key })),
            complete: page.length === filtered.length,
            cursor: page.length === filtered.length ? null : page[page.length - 1],
        };
    }
}

export function installDevKv(): DevKv {
    const g = globalThis as unknown as { NEXTPILOT_KV?: unknown };
    if (!g.NEXTPILOT_KV) g.NEXTPILOT_KV = new DevKv();
    return g.NEXTPILOT_KV as DevKv;
}
