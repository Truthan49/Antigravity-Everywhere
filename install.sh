#!/usr/bin/env bash

# Antigravity Mobility CLI - One-Click Installer

set -e

REPO_URL="https://github.com/Truthan49/Antigravity-Everywhere.git"
DEST_DIR="$HOME/Antigravity-Everywhere"

echo "================================================"
echo "🚀 欢迎使用 Antigravity Mobility CLI 一键安装程序"
echo "================================================"

# Check for Git
if ! command -v git &> /dev/null; then
    echo "❌ 错误: 未安装 Git。请先安装 Git。"
    exit 1
fi

# Check for Node.js (npm)
if ! command -v npm &> /dev/null; then
    echo "❌ 错误: 未安装 Node.js (npm)。请先安装 Node.js (>= 18)。"
    exit 1
fi

# Clone the repository
if [ -d "$DEST_DIR" ]; then
    echo "ℹ️  目标文件夹 $DEST_DIR 已存在。正在拉取最新代码..."
    cd "$DEST_DIR"
    git pull origin main
else
    echo "📦 正在克隆仓库到 $DEST_DIR..."
    git clone "$REPO_URL" "$DEST_DIR"
    cd "$DEST_DIR"
fi

# Install dependencies
echo "⚙️  正在安装依赖 (npm install)..."
npm install --silent

# Ensure .agents required directories exist
echo "📂 初始化全局工作区配置..."
mkdir -p "$HOME/.agents/skills"
mkdir -p "$HOME/.gemini/antigravity/knowledge"

echo "================================================"
echo "✅ 安装成功！"
echo "👉 启动服务，请执行以下命令："
echo ""
echo "   cd $DEST_DIR && npm run dev"
echo ""
echo "然后在浏览器中访问: http://localhost:3000"
echo "================================================"

# Optionally ask to start right away
read -p "是否现在启动 Antigravity? (y/N): " start_now
if [[ "$start_now" =~ ^[Yy]$ ]]; then
    echo "🚀 正在启动..."
    npm run dev
fi
