# Veo-3.1-Generate-Preview 视频生成使用指南

本文档说明如何使用 `vertex_api_final.py` 中的 Veo 视频生成功能来调用 Google 的 Veo 视频生成模型。

## 快速开始

### 1. 运行完整示例
```bash
python vertex_api_final.py
```
这将运行所有测试，包括 Veo 视频生成示例。

### 2. 运行专门的 Veo 示例
```bash
python veo_video_example.py
```
这是一个专门的 Veo 视频生成演示脚本。

### 3. 在代码中使用

```python
from vertex_api_final import VertexAPIFinal

# 创建客户端
client = VertexAPIFinal(
    service_account_file="service-account.json",
    project_id="your-project-id"
)

# 视频生成
result = client.generate_video(
    model_name="veo-3.1-generate-preview",
    prompt="你的视频描述",
    video_config={
        "duration": "5s",
        "aspectRatio": "16:9",
        "quality": "high",
        "fps": 24
    }
)
```

## 支持的 Veo 模型

### 1. veo-3.1-generate-preview
- **描述**: 最新的 Veo 3.1 预览版本
- **功能**: 高质量文本到视频生成
- **最大时长**: 30秒
- **支持比例**: 16:9, 9:16, 1:1, 21:9

### 2. veo-3
- **描述**: Veo 3.0 稳定版本
- **功能**: 文本到视频、图像到视频、视频编辑
- **最大时长**: 20秒
- **支持比例**: 16:9, 9:16, 1:1

### 3. veo-2
- **描述**: Veo 2.0 版本
- **功能**: 基础视频生成
- **最大时长**: 10秒
- **支持比例**: 16:9, 1:1

## API 接口详情

### 端点格式
```
https://aiplatform.googleapis.com/v1/projects/{project_id}/locations/global/publishers/google/models/{model_name}:predict
```

### 请求格式
```json
{
  "instances": [{
    "prompt": "视频描述文本",
    "videoConfig": {
      "duration": "5s",
      "aspectRatio": "16:9",
      "quality": "high",
      "fps": 24
    }
  }],
  "parameters": {
    "sampleCount": 1
  }
}
```

### 响应格式
```json
{
  "predictions": [{
    "videoUri": "gs://bucket/path/to/video.mp4",
    "status": "COMPLETED",
    "generationId": "unique-generation-id",
    "metadata": {
      "duration": "5s",
      "resolution": "1920x1080",
      "fps": 24
    }
  }]
}
```

## 视频配置参数

### duration (时长)
- **格式**: 字符串，如 "5s", "10s"
- **范围**: 1s - 30s (取决于模型)
- **默认**: "5s"

### aspectRatio (宽高比)
- **选项**:
  - "16:9" - 标准宽屏
  - "9:16" - 竖屏/手机屏幕
  - "1:1" - 正方形
  - "21:9" - 电影宽屏
- **默认**: "16:9"

### quality (质量)
- **选项**:
  - "low" - 低质量，快速生成
  - "medium" - 中等质量
  - "high" - 高质量
  - "ultra" - 超高质量 (仅部分模型支持)
- **默认**: "high"

### fps (帧率)
- **选项**: 24, 30, 60
- **默认**: 24
- **注意**: 高帧率适合动作场景

## 使用示例

### 示例1: 基础视频生成
```python
result = client.generate_video(
    model_name="veo-3.1-generate-preview",
    prompt="一只可爱的小猫在花园里玩耍，阳光明媚"
)
```

### 示例2: 自定义配置
```python
custom_config = {
    "duration": "10s",
    "aspectRatio": "9:16",
    "quality": "ultra",
    "fps": 30
}

result = client.generate_video(
    model_name="veo-3.1-generate-preview",
    prompt="未来科技城市的鸟瞰图，飞行汽车穿梭",
    video_config=custom_config
)
```

### 示例3: 高帧率动作场景
```python
action_config = {
    "duration": "6s",
    "aspectRatio": "21:9",
    "quality": "ultra",
    "fps": 60
}

result = client.generate_video(
    model_name="veo-3.1-generate-preview",
    prompt="滑板手在城市街道表演技巧，动作流畅",
    video_config=action_config
)
```

## 提示词最佳实践

### 1. 描述要具体
❌ 不好: "一个人在走路"
✅ 好: "一位年轻女性穿着红色连衣裙在公园小径上悠闲漫步"

### 2. 包含视觉细节
- 光照条件: "阳光明媚", "夜晚霓虹灯", "黄昏时分"
- 色彩: "鲜艳的色彩", "温暖的色调", "冷色调"
- 氛围: "温馨", "神秘", "充满活力"

### 3. 指定镜头运动
- "镜头缓慢推进"
- "鸟瞰视角"
- "跟随拍摄"
- "固定镜头"

### 4. 避免复杂场景
- 人物数量不要太多
- 避免过于复杂的动作
- 场景转换要自然

## 错误处理

### 常见错误及解决方案

#### 1. 认证失败 (401)
```
[ERROR] Video generation failed: 401
```
**解决方案**: 检查服务账户文件和权限

#### 2. 模型不可用 (404)
```
[ERROR] Video generation failed: 404
```
**解决方案**: 检查模型名称是否正确，确认模型在你的区域可用

#### 3. 配置参数错误 (400)
```
[ERROR] Video generation failed: 400
```
**解决方案**: 检查视频配置参数是否在支持范围内

#### 4. 超时错误
```
[ERROR] Video generation exception: timeout
```
**解决方案**: 视频生成需要较长时间，可以增加超时时间

## 性能优化建议

### 1. 合理设置参数
- 较短的视频生成更快
- 较低的质量设置生成更快
- 标准宽高比 (16:9) 通常更稳定

### 2. 批量处理
- 可以同时提交多个视频生成请求
- 使用 `sampleCount` 参数生成多个变体

### 3. 异步处理
- 视频生成是异步过程
- 使用返回的 `generationId` 跟踪状态
- 实现轮询机制检查完成状态

## 注意事项

1. **计费**: 视频生成按时长和质量计费
2. **配额**: 注意 API 调用配额限制
3. **存储**: 生成的视频存储在 Google Cloud Storage
4. **时效**: 生成的视频链接有时效性
5. **内容政策**: 遵守 Google 的内容使用政策

## 故障排除

### 检查清单
- [ ] 服务账户文件是否存在且有效
- [ ] 项目 ID 是否正确
- [ ] 模型名称是否正确
- [ ] 视频配置参数是否在支持范围内
- [ ] 网络连接是否稳定
- [ ] API 配额是否充足

### 调试技巧
1. 启用详细日志输出
2. 检查完整的错误响应
3. 验证请求 payload 格式
4. 测试简单的配置参数

## 完整示例

参考以下文件获取完整示例：
- `veo_video_example.py` - 专门的 Veo 示例
- `vertex_api_final.py` - 集成的完整实现