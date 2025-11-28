# Google OAuth2 JWT Token Generator for Vertex AI

这是一个用于生成Google Vertex AI API OAuth2 JWT令牌的Python模块。该模块提供了一种简便的方式来使用Google服务账户JSON密钥文件获取有效的访问令牌。

## 功能特性

- ✅ 使用Google服务账户JSON密钥文件生成OAuth2 JWT令牌
- ✅ 支持Vertex AI API的默认权限范围
- ✅ 模块化设计，可被其他程序导入使用
- ✅ 支持令牌缓存和自动刷新
- ✅ 提供高级接口和便利函数
- ✅ 完整的错误处理
- ✅ 支持自定义权限范围

## 项目结构

```
.
├── doc.txt                    # 项目需求文档
├── CLAUDE.md                  # Claude代码助手指导文档
├── README.md                  # 项目说明文档
├── requirements.txt           # Python依赖包
├── google_auth.py            # 核心认证模块
├── vertex_ai_auth.py         # 高级接口模块
├── example_usage.py          # 使用示例
├── simple_test.py            # 简化测试脚本
├── test_auth.py              # 完整测试脚本
└── geminiJson/               # 存放Google服务账户JSON密钥文件的目录
```

## 安装依赖

```bash
pip install -r requirements.txt
```

主要依赖包：
- PyJWT >= 2.8.0
- requests >= 2.31.0
- cryptography >= 41.0.0

## 使用方法

### 1. 基本用法

```python
from google_auth import GoogleAuthenticator

# 初始化认证器
auth = GoogleAuthenticator("geminiJson")

# 列出可用的密钥文件
available_keys = auth.get_available_keys()
print(f"可用密钥: {available_keys}")

# 获取访问令牌
if available_keys:
    key_file = available_keys[0]
    token_info = auth.get_access_token(key_file)
    access_token = token_info['access_token']
    print(f"访问令牌: {access_token[:50]}...")
```

### 2. 高级接口

```python
from vertex_ai_auth import create_vertex_auth

# 创建认证实例
auth = create_vertex_auth("your-service-account-key.json", "geminiJson")

# 获取访问令牌
token = auth.get_token()

# 获取API请求头
headers = auth.get_auth_headers()
# headers包含: {'Authorization': 'Bearer <token>', 'Content-Type': 'application/json'}
```

### 3. 全局认证管理器

```python
from vertex_ai_auth import GlobalAuthManager

# 初始化全局认证（通常在应用启动时）
GlobalAuthManager.initialize("your-service-account-key.json", "geminiJson")

# 在应用任何地方获取令牌
token = GlobalAuthManager.get_token()
headers = GlobalAuthManager.get_auth_headers()
```

### 4. 便利函数

```python
from google_auth import get_vertex_ai_token

# 一行获取令牌
token = get_vertex_ai_token("your-service-account-key.json", "geminiJson")
```

### 5. Vertex AI API调用示例

```python
import requests
from vertex_ai_auth import setup_auth

# 设置认证
auth = setup_auth("your-service-account-key.json", "geminiJson")
headers = auth.get_auth_headers()

# 调用Vertex AI API
project_id = "your-project-id"
location = "us-central1"

api_url = f"https://{location}-aiplatform.googleapis.com/v1/projects/{project_id}/locations/{location}/endpoints"

response = requests.get(api_url, headers=headers)
if response.status_code == 200:
    print("API调用成功!")
    print(response.json())
```

## 设置Google服务账户

1. 在Google Cloud Console中创建服务账户
2. 为服务账户启用Vertex AI API权限
3. 下载服务账户的JSON密钥文件
4. 将JSON密钥文件放置在`geminiJson/`目录下

## 测试

运行测试来验证功能：

```bash
# 运行简化测试
python simple_test.py

# 运行完整测试
python test_auth.py

# 查看使用示例
python example_usage.py
```

## API参考

### GoogleAuthenticator类

主要方法：
- `get_available_keys()` - 获取可用的密钥文件列表
- `load_service_account_key(key_filename)` - 加载服务账户密钥
- `get_access_token(key_filename, scopes=None)` - 获取访问令牌
- `clear_cache()` - 清除令牌缓存

### VertexAIAuth类

主要方法：
- `get_token(scopes=None)` - 获取访问令牌
- `get_auth_headers(scopes=None)` - 获取认证头
- `is_token_valid()` - 检查令牌是否有效
- `get_service_account_info()` - 获取服务账户信息

## 注意事项

1. **安全**：JSON密钥文件包含敏感信息，请妥善保管
2. **权限**：确保服务账户具有Vertex AI相关权限
3. **缓存**：令牌会被缓存以避免重复请求
4. **刷新**：令牌会在过期前自动刷新（如果启用了自动刷新）

## 错误处理

模块包含完整的错误处理：
- 文件不存在错误
- JSON解析错误
- 网络请求错误
- 令牌获取失败

## 许可证

本项目用于学习和内部使用。请确保遵守Google Cloud的使用条款和服务协议。