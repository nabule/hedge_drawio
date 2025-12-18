#!/bin/bash
# HedgeDoc + DrawIO 编译脚本 (Linux/macOS)
#
# 用法:
#   ./build.sh [tag]
#
# 参数:
#   tag     镜像标签 (默认: local)
#
# 示例:
#   ./build.sh
#   ./build.sh v1.0.0

set -e

# 获取脚本所在目录作为项目根目录
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

# 参数默认值
TARGET="${1:-hedgedoc}"
TAG="${2:-local}"

echo "====================================="
echo "HedgeDoc 镜像构建脚本"
echo "====================================="
echo ""
echo "项目目录: $PROJECT_ROOT"
echo "构建目标: $TARGET"
echo "镜像标签: $TAG"
echo ""

build_hedgedoc() {
    echo ">>> 开始构建 HedgeDoc 镜像..."
    
    IMAGE_NAME="hedge_drawio/hedgedoc:$TAG"
    
    # 构建镜像
    docker build -t "$IMAGE_NAME" -f "$PROJECT_ROOT/docker/hedgedoc/Dockerfile" "$PROJECT_ROOT"
    
    echo ">>> HedgeDoc 镜像构建成功: $IMAGE_NAME"
}

# 执行构建
if [ "$TARGET" = "hedgedoc" ]; then
    build_hedgedoc
else
    echo "错误: 无效的构建目标 '$TARGET'"
    echo "有效的目标: hedgedoc"
    exit 1
fi

echo ""
echo "====================================="
echo "构建完成!"
echo "====================================="
echo ""
echo "已构建的镜像:"
docker images | grep "hedge_drawio"
