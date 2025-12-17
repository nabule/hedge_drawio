#!/bin/sh
# HedgeDoc 启动脚本
# 确保必要的目录存在

# 创建 DrawIO 目录（如果不存在）
mkdir -p /hedgedoc/public/uploads/drawio

# 启动 HedgeDoc
exec node app.js
