# HedgeDoc + DrawIO 离线部署包

版本: v1.0.0
构建时间: 2025-12-17

## 包含内容

- `docker-compose.yml` - Docker Compose 配置文件
- `deploy.sh` - 一键部署脚本
- `hedgedoc.tar` - HedgeDoc 镜像 (含 DrawIO 集成)
- `drawio.tar` - DrawIO 编辑器镜像
- `postgres.tar` - PostgreSQL 数据库镜像

## 使用方法

### 前置要求

- Docker 已安装
- docker compose 已安装

### 部署步骤

1. 将整个目录复制到目标机器
2. 运行部署脚本:

```bash
chmod +x deploy.sh
./deploy.sh
```

### 服务访问

部署完成后，可通过以下地址访问：

- **HedgeDoc**: http://localhost:3000
- **DrawIO**: http://localhost:8180

## 常用命令

```bash
# 查看日志
docker compose logs -f

# 停止服务
docker compose down

# 重启服务
docker compose restart

# 查看运行状态
docker compose ps
```

## 功能特性

- ✅ HedgeDoc 协作 Markdown 编辑器
- ✅ DrawIO 图形编辑器集成
- ✅ 支持在 HedgeDoc 中插入和编辑 DrawIO 图形
- ✅ DrawIO 弹窗支持调整大小和最大化
