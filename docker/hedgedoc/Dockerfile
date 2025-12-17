# HedgeDoc 多阶段编译 Dockerfile
# 第二阶段：从本地源码编译 HedgeDoc 镜像

# ================================
# 第一阶段：安装依赖并构建前端资源
# ================================
FROM node:18-alpine AS builder

# 安装构建依赖
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# 启用 corepack 以获取 yarn
RUN corepack enable

# 从本地复制源码（使用子模块中的 hedgedoc 源码）
WORKDIR /app
COPY hedgedoc/ .

# 安装依赖
RUN yarn install

# 构建前端资源
RUN yarn build

# 清理开发依赖，只保留生产依赖
RUN yarn workspaces focus --production

# ================================
# 第二阶段：创建精简的运行时镜像
# ================================
FROM node:18-alpine

# 安装运行时依赖（tini 作为 init 进程）
RUN apk add --no-cache tini

# 创建应用目录
WORKDIR /hedgedoc

# 创建非 root 用户
RUN addgroup -S hedgedoc && adduser -S hedgedoc -G hedgedoc

# 从构建阶段复制必要文件
COPY --from=builder --chown=hedgedoc:hedgedoc /app/app.js ./
COPY --from=builder --chown=hedgedoc:hedgedoc /app/package.json ./
COPY --from=builder --chown=hedgedoc:hedgedoc /app/lib ./lib
COPY --from=builder --chown=hedgedoc:hedgedoc /app/locales ./locales
COPY --from=builder --chown=hedgedoc:hedgedoc /app/public ./public
COPY --from=builder --chown=hedgedoc:hedgedoc /app/node_modules ./node_modules

# 创建上传目录（包含 drawio 子目录）
RUN mkdir -p /hedgedoc/public/uploads/drawio && \
    chown -R hedgedoc:hedgedoc /hedgedoc/public/uploads

# 复制启动脚本
COPY --chown=hedgedoc:hedgedoc docker/hedgedoc/entrypoint.sh /hedgedoc/entrypoint.sh
RUN chmod +x /hedgedoc/entrypoint.sh

# 切换到非 root 用户
USER hedgedoc

# 设置环境变量
ENV NODE_ENV=production
ENV CMD_PORT=3000

# 暴露端口
EXPOSE 3000

# 使用 tini 作为 init 进程
ENTRYPOINT ["/sbin/tini", "--"]

# 使用启动脚本（确保目录存在）
CMD ["/hedgedoc/entrypoint.sh"]
