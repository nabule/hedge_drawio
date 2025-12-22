# HedgeDoc + DrawIO v1.0.1 部署说明

## 包含文件
- hedgedoc.tar: HedgeDoc 镜像
- docker-compose.yml: 容器编排配置
- deploy.sh: 部署脚本 (也可用于构建)

## 部署步骤
1. 加载镜像: docker load -i hedgedoc.tar
2. 启动服务: docker compose up -d
