# Gemini-3-Pro-Preview 流式请求使用指南

本文档说明如何使用 `vertex_api_final.py` 中的流式请求功能来调用 Gemini-3-Pro-Preview 模型。

## 快速开始

### 1. 运行完整示例
```bash
python vertex_api_final.py
```
这将运行所有测试，包括流式请求示例。

### 2. 运行独立流式示例
```bash
python streaming_example.py
```
这是一个专门的流式请求演示脚本。

### 3. 在代码中使用

```python
from vertex_api_final import VertexAPIFinal

# 创建客户端
client = VertexAPIFinal(
    service_account_file="service-account.json",
    project_id="your-project-id"
)

# 流式请求
result = client.generate_content(
    model_name="gemini-3-pro-preview",
    prompt="你的提示词",
    streaming=True  # 启用流式响应
)
```

## 流式响应特点

### 1. 实时输出
流式响应会实时显示模型生成的内容，而不是等待完整响应后再显示。

### 2. 响应格式
流式响应使用 Server-Sent Events (SSE) 格式：
```
data: {"candidates":[{"content":{"parts":[{"text":"响应内容"}]}}]}
data: [DONE]
```

### 3. 输出示例
```
[RAW] data: {"candidates":[{"content":{"parts":[{"text":"你好！"}]}}]}
[CHUNK] 你好！
[RAW] data: {"candidates":[{"content":{"parts":[{"text":"我是"}]}}]}
[CHUNK] 我是
[RAW] data: [DONE]

[COMPLETE_RESPONSE]:
==================================================
你好！我是...
```

## 代码解析

### 1. 流式请求配置
```python
# 构建流式端点
method = "streamGenerateContent"
endpoint = f"https://aiplatform.googleapis.com/v1/projects/{project_id}/locations/global/publishers/google/models/gemini-3-pro-preview:streamGenerateContent?alt=sse"
```

### 2. 流式响应处理
```python
# 处理流式数据
for line in response.iter_lines():
    if line:
        line_text = line.decode('utf-8')
        if line_text.startswith('data: '):
            json_data = line_text[6:]  # 移除 'data: ' 前缀
            if json_data.strip() and json_data != '[DONE]':
                chunk_data = json.loads(json_data)
                # 提取文本内容
                if 'candidates' in chunk_data:
                    # 处理文本块...
```

### 3. 错误处理
代码包含完整的错误处理：
- JSON 解析错误
- 网络请求异常
- 认证失败
- 超时处理

## 配置要求

### 1. 服务账户文件
确保在 `geminiJson/` 目录下有有效的 Google Cloud 服务账户 JSON 文件：
- `service-account.json`
- `service-account-aaa.json`

### 2. 项目配置
- 项目 ID: `carbide-team-478005-f8`
- 模型区域: `global`
- 认证范围: `https://www.googleapis.com/auth/cloud-platform`

### 3. 依赖包
```bash
pip install requests google-auth
```

## 使用场景

### 1. 实时对话
适合需要实时显示响应的聊天应用。

### 2. 长文本生成
适合生成长文章、代码等需要实时反馈的场景。

### 3. 代码生成
适合实时显示代码生成过程的开发工具。

## 注意事项

1. **网络稳定性**: 流式请求对网络稳定性要求较高
2. **超时设置**: 默认超时 60 秒，可根据需要调整
3. **错误重试**: 建议实现重试机制处理网络异常
4. **资源管理**: 及时关闭流式连接避免资源泄露

## 故障排除

### 1. 认证失败
```
[ERROR] Request failed: 401
```
检查服务账户文件是否有效，权限是否正确。

### 2. 模型不可用
```
[ERROR] Request failed: 404
```
检查模型名称和区域配置是否正确。

### 3. 流式解析错误
```
[JSON_ERROR] Failed to parse: ...
```
这通常是网络问题导致的数据不完整，可以忽略或实现重试。

## 完整示例

参考 `streaming_example.py` 文件获取完整的使用示例。