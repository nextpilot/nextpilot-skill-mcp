"""`python -m nextpilot_mcp` 的入口：启动 stdio 传输，阻塞到对端断开。

只做两件事：构造 server、run。所有工具注册都在 server.py 的 import 副作用里完成。
"""

from nextpilot_mcp.server import mcp


def main() -> None:
    mcp.run()  # 默认 transport="stdio"


if __name__ == "__main__":
    main()
