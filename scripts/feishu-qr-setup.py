"""飞书扫码一键创建机器人并写入 Antigravity-Everywhere 配置 (~/.gemini/antigravity/feishu-config.json)。"""

import asyncio
import io
import json
import sys
from pathlib import Path

import lark_oapi as lark
import qrcode

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CONFIG_PATH = Path.home() / ".gemini" / "antigravity" / "feishu-config.json"


def render_qr(url: str) -> str:
    qr = qrcode.QRCode(border=1)
    qr.add_data(url)
    qr.make(fit=True)
    buf = io.StringIO()
    qr.print_ascii(out=buf, invert=True)
    return buf.getvalue()


async def main() -> None:
    def on_qr_code(info: dict) -> None:
        url = info["url"]
        mins = max(1, int(info.get("expire_in", 600)) // 60)
        print("\n" + "=" * 60)
        print("请使用手机【飞书 / Lark】扫描下方二维码，一键创建并授权机器人：")
        print("=" * 60)
        print(render_qr(url))
        print(f"有效期约 {mins} 分钟，等待扫码确认中...")
        print(f"备用链接：\n{url}\n")

    def on_status_change(info: dict) -> None:
        if info.get("status") == "domain_switched":
            print("[INFO] 检测到 Lark 国际版账号，已自动切换域名。")

    result = await lark.aregister_app(
        on_qr_code=on_qr_code,
        on_status_change=on_status_change,
        source="antigravity-everywhere",
        app_preset={
            "name": "Antigravity Gateway",
            "desc": "连接本机 Antigravity 桌面端与多工作区的飞书助手",
        },
    )

    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(
        json.dumps(
            {
                "appId": result["client_id"],
                "appSecret": result["client_secret"],
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    print("\n" + "=" * 60)
    print("[SUCCESS] 飞书机器人创建并配置成功！")
    print(f"  - App ID:   {result['client_id']}")
    print(f"  - 配置文件: {CONFIG_PATH}")
    print("  - 下一步:   在 WebUI (http://localhost:3000) 左下角点击 ⚙️ → 保存并重启飞书连接，或重启 Gateway。")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
