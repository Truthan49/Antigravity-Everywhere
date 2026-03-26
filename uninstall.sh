#!/usr/bin/env bash

# Antigravity Mobility CLI - 一键卸载程序

echo "================================================"
echo "🗑️ 准备卸载 Antigravity Mobility CLI..."
echo "================================================"

# 这里由于用户可能会通过 curl | bash 运行，我们需要定向从 /dev/tty 获取键盘输入
if [ -t 0 ] || [ -c /dev/tty ]; then
    read -p "⚠️ 这将删除全部相关代码和文件，确认完全卸载吗? [y/N]: " confirm_uninstall < /dev/tty
else
    # 兼容部分无法接收键盘输入的环境，提供静默执行方式
    confirm_uninstall="y"
    echo "🤖 静默模式自动确认卸载"
fi

if [[ ! "$confirm_uninstall" =~ ^[Yy]$ ]]; then
    echo "已取消卸载。"
    exit 0
fi

# 1. 删除项目主文件夹
DEST_DIR="$HOME/Antigravity-Everywhere"
if [ -d "$DEST_DIR" ]; then
    echo "📦 正在删除项目代码文件: $DEST_DIR"
    rm -rf "$DEST_DIR"
else
    echo "ℹ️  未找到默认安装目录: $DEST_DIR (可能已被手动删除)"
fi

# 2. 询问是否删除用户配置和工作区数据
if [ -t 0 ] || [ -c /dev/tty ]; then
    read -p "❓ 是否同时清理所有本地知识库、插件缓存和全局配置文件？(如果您想未来恢复数据，请按 N) [y/N]: " confirm_data < /dev/tty
else
    confirm_data="y"
fi

if [[ "$confirm_data" =~ ^[Yy]$ ]]; then
    echo "📂 正在深度清理全局缓存和数据..."
    rm -rf "$HOME/.agents"
    rm -rf "$HOME/.gemini/antigravity"
    echo "✅ 所有数据和工作流缓存清理完毕。"
else
    echo "💡 您的《知识文件》和《环境配置数据》已被安全保留。未来重新安装即可快速恢复。"
fi

echo "================================================"
echo "✨ 卸载大功告成！随时欢迎您再次回归 Antigravity。"
echo "================================================"

