#!/bin/bash
set -e

echo ">>> 开始构建 Release v6..."

# 1. 创建目录结构
mkdir -p release_v6/images

# 2. 复制文件
echo ">>> 复制配置文件..."
cp docker-compose.yml release_v6/
cp PERSISTENCE.md release_v6/

# 3. 创建部署脚本
echo ">>> 创建 deploy.sh..."
cat > release_v6/deploy.sh << 'EOF'
#!/bin/bash
# HedgeDoc + DrawIO (v6) 部署脚本

echo ">>> 开始加载 Docker 镜像..."
if [ -f images/hedgedoc-local.tar.gz ]; then
    docker load < images/hedgedoc-local.tar.gz
else
    echo "错误: 未找到 images/hedgedoc-local.tar.gz"
    exit 1
fi

if [ -f images/drawio.tar.gz ]; then
    docker load < images/drawio.tar.gz
else
    echo "错误: 未找到 images/drawio.tar.gz"
    exit 1
fi

echo ">>> 启动服务..."
docker compose up -d

echo ">>> 服务启动成功！"
echo "访问地址: http://localhost:3000"
echo "DrawIO 管理页面: http://localhost:3000/drawio-manager"
EOF
chmod +x release_v6/deploy.sh

# 4. 创建安装说明
echo ">>> 创建安装说明..."
cat > release_v6/README.txt << 'EOF'
HedgeDoc + DrawIO (v6) 安装说明
===============================

1. 确保系统已安装 Docker 和 Docker Compose。
2. 运行 install.sh 或 deploy.sh 脚本：
   ./deploy.sh
3. 访问 http://localhost:3000

功能更新 (v6):
- 新增 DrawIO 文件管理页面 (/drawio-manager)
- 支持清理孤立的 DrawIO 文件
- 支持下载 DrawIO 原始 XML 和渲染图片
EOF

# 5. 导出镜像
echo ">>> 导出 Docker 镜像 (这可能需要几分钟)..."
docker save hedge_drawio/hedgedoc:local | gzip > release_v6/images/hedgedoc-local.tar.gz
echo ">>> 已导出 hedge_drawio/hedgedoc:local"

docker save hedge_drawio/drawio:local | gzip > release_v6/images/drawio.tar.gz
echo ">>> 已导出 hedge_drawio/drawio:local"

# 6. 打包 Release
echo ">>> 打包 Release 包..."
tar -czf hedge_drawio_v6_release.tar.gz release_v6/

echo ">>> Release v6 构建完成！"
ls -lh hedge_drawio_v6_release.tar.gz
