#!/bin/bash
# HedgeDoc + DrawIO 离线一键部署脚本
# 版本: v1.0.0
#
# 使用方法:
#   1. 将整个 release 目录复制到目标机器
#   2. 运行: ./deploy.sh
#
# 注意: 需要 Docker 和 docker compose 已安装

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================"
echo "HedgeDoc + DrawIO 离线部署脚本"
echo "======================================"
echo ""

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "错误: 未找到 Docker，请先安装 Docker"
    exit 1
fi

echo ">>> 步骤 0/3: 准备本地目录和权限..."
mkdir -p data/database data/uploads/drawio
# 设置权限（生产环境安全版：归属给容器内用户 10000）
sudo chown -R 10000:10000 data/uploads
echo "  - 已创建 data 目录并设置所有权"
echo ""

echo ">>> 步骤 1/3: 加载 Docker 镜像..."

echo "  - 加载 PostgreSQL 镜像..."
docker load -i postgres.tar

echo "  - 加载 DrawIO 镜像..."
docker load -i drawio.tar

echo "  - 加载 HedgeDoc 镜像..."
docker load -i hedgedoc.tar

echo ""
echo ">>> 步骤 2/3: 验证镜像..."
docker images | grep -E "(hedge_drawio/hedgedoc|jgraph/drawio|postgres)" | head -5

echo ""
echo ">>> 步骤 3/3: 启动服务..."
docker compose up -d

echo ""
echo "======================================"
echo "部署完成!"
echo "======================================"
echo ""
echo "服务访问地址:"
echo "  - HedgeDoc:  http://localhost:3000"
echo "  - DrawIO:    http://localhost:8180"
echo ""
echo "常用命令:"
echo "  - 查看日志:  docker compose logs -f"
echo "  - 停止服务:  docker compose down"
echo "  - 重启服务:  docker compose restart"
