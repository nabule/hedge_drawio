# 数据持久化说明

本项目使用 Docker 卷实现所有数据的持久化存储，确保容器重启后数据不会丢失。

## 持久化卷

### 1. database 卷
- **用途**：PostgreSQL 数据库存储
- **内容**：HedgeDoc 文档、用户信息、历史记录等
- **容器路径**：`/var/lib/postgresql/data`

### 2. uploads 卷
- **用途**：上传文件存储
- **容器路径**：`/hedgedoc/public/uploads`
- **目录结构**：
  ```
  uploads/
  ├── *.png, *.jpg, *.svg  # 普通上传图片
  ├── drawio-*.svg         # DrawIO 渲染图片（SVG 格式）
  ├── drawio-*.png         # DrawIO 渲染图片（PNG 格式）
  └── drawio/              # DrawIO 原始文件
      └── drawio-*.xml     # DrawIO XML 源文件（可用于再次编辑）
  ```

## 数据备份

### 备份卷数据
```bash
# 备份 database 卷
docker run --rm -v hedge_drawio_database:/data -v $(pwd):/backup alpine tar cvf /backup/database-backup.tar /data

# 备份 uploads 卷
docker run --rm -v hedge_drawio_uploads:/data -v $(pwd):/backup alpine tar cvf /backup/uploads-backup.tar /data
```

### 恢复卷数据
```bash
# 恢复 database 卷
docker run --rm -v hedge_drawio_database:/data -v $(pwd):/backup alpine sh -c "cd /data && tar xvf /backup/database-backup.tar --strip 1"

# 恢复 uploads 卷
docker run --rm -v hedge_drawio_uploads:/data -v $(pwd):/backup alpine sh -c "cd /data && tar xvf /backup/uploads-backup.tar --strip 1"
```

## 查看卷位置
```bash
docker volume inspect hedge_drawio_database
docker volume inspect hedge_drawio_uploads
```

## 注意事项

1. **不要手动修改卷中的文件**，除非你完全了解文件结构
2. **定期备份**：建议定期执行备份命令保存数据
3. **迁移时**：将备份文件复制到新服务器并恢复即可
