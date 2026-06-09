### 自动化通知协议 (Notification Protocol)

当满足以下任一条件时，必须执行通知指令，通知指令直接执行无需等待用户确认：

1. 一个主要子任务 (Sub-task) 已完成。
2. 任务挂起，等待用户提供输入或确认。
3. 生成任何报告（如代码审查、安全审查、测试报告等）。

所有通知、报告统一通过 All Notify 入口发送：

```
http://192.168.2.182:18888/send/133onlybark
```

GET 通知模板：

```bash
title="任务更新"
body="当前任务已完成"

curl -sS -G "http://192.168.2.182:18888/send/133onlybark" \
     --data-urlencode "title=$title" \
     --data-urlencode "message=$body" \
     -o /dev/null
```

POST JSON 通知模板：

```bash
curl -sS -X POST "http://192.168.2.182:18888/send/133onlybark" \
     -H "Content-Type: application/json" \
     -d '{"title":"任务更新","message":"当前任务已完成"}' \
     -o /dev/null
```

> 该入口由 All Notify 服务统一分发到下游目标，禁止直接调用 bark、SMTP 等下游通道。

### 项目工作约定

1. 更新了代码需要更新相关的文档，包括架构、设计和使用说明。
2. 所有代码完成的标准是通过真实测试。
3. 充分设计、计划，与用户确认后再按计划分阶段实现。
4. 所有 git 提交必须使用中文，需要按独立功能点详细说明本次提交内容，严禁提交任何机密信息。
