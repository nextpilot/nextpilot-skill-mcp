export const STAGE_TEXT: Record<string, string> = {
    "loading-runtime": "正在加载 Pyodide 运行时",
    "installing-parser": "正在安装 pyulog 解析器",
    "reading-log": "正在读取日志文件",
    "parsing-log": "正在解析日志数据",
    "running-checks": "正在执行检查规则",
    done: "完成",
};

export const STAGE_PROGRESS: Record<string, number> = {
    "loading-runtime": 5,
    "installing-parser": 35,
    "reading-log": 60,
    "parsing-log": 85,
    "running-checks": 92,
    done: 100,
};
