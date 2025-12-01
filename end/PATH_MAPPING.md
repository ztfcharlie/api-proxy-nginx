# OpenResty 路径映射说明

## 重要路径更正

根据 OpenResty 官方镜像的实际路径结构，所有配置路径已从 `/etc/nginx/` 更正为 `/usr/local/openresty/nginx/`。

## 路径映射表

| 宿主机路径 | 容器内路径 | 说明 |
|-----------|-----------|------|
| `./nginx/nginx.conf` | `/usr/local/openresty/nginx/conf/nginx.conf` | 主配置文件 |
| `./nginx/conf.d/` | `/usr/local/openresty/nginx/conf/conf.d/` | 站点配置目录 |
| `./lua/` | `/usr/local/openresty/nginx/lua/` | Lua 模块目录 |
| `./config/` | `/usr/local/openresty/nginx/config/` | 应用配置目录 |
| `./data/` | `/usr/local/openresty/nginx/data/` | 数据文件目录 |
| `./data/json/` | `/usr/local/openresty/nginx/data/json/` | 服务账号凭证 |
| `./data/jwt/` | `/usr/local/openresty/nginx/data/jwt/` | JWT 令牌缓存 |
| `./data/map/` | `/usr/local/openresty/nginx/data/map/` | 配置映射文件 |
| `./logs/` | `/var/log/nginx/` | 日志文件目录 |
| `./ssl/` | `/usr/local/openresty/nginx/ssl/` | SSL 证书目录 |
| `./html/` | `/usr/local/openresty/nginx/html/` | 静态文件目录 |

## 配置文件中的路径引用

### nginx.conf
```nginx
# Lua 包路径
lua_package_path "/usr/local/openresty/nginx/lua/?.lua;/usr/local/share/lua/5.1/?.lua;;";

# 包含站点配置
include /usr/local/openresty/nginx/conf/conf.d/*.conf;
```

### config.lua
```lua
local paths = {
    app_config = "/usr/local/openresty/nginx/config/app_config.json",
    map_config = "/usr/local/openresty/nginx/data/map/map-config.json",
    json_dir = "/usr/local/openresty/nginx/data/json/",
    jwt_dir = "/usr/local/openresty/nginx/data/jwt/"
}
```

### docker-compose.yml
```yaml
volumes:
  - ./config:/usr/local/openresty/nginx/config:ro
  - ./data:/usr/local/openresty/nginx/data
  - ./logs:/var/log/nginx
  - ./ssl:/usr/local/openresty/nginx/ssl:ro
  - ./html:/usr/local/openresty/nginx/html:ro
```

## 启动命令

OpenResty 的启动命令：
```bash
/usr/local/openresty/bin/openresty -g "daemon off;"
```

配置测试命令：
```bash
/usr/local/openresty/bin/openresty -t
```

## 重要注意事项

1. **OpenResty 默认路径**: OpenResty 使用 `/usr/local/openresty/nginx/` 作为基础路径，而不是标准 Nginx 的 `/etc/nginx/`

2. **配置文件位置**: 主配置文件位于 `/usr/local/openresty/nginx/conf/nginx.conf`

3. **Lua 模块路径**: Lua 模块应放在 `/usr/local/openresty/nginx/lua/` 目录

4. **日志路径**: 日志文件仍然使用标准的 `/var/log/nginx/` 路径

5. **挂载卷映射**: Docker Compose 中的挂载卷已相应更新

## 验证路径

在容器内可以使用以下命令验证路径：

```bash
# 检查 OpenResty 配置路径
ls -la /usr/local/openresty/nginx/conf/

# 检查 Lua 模块
ls -la /usr/local/openresty/nginx/lua/

# 检查数据目录
ls -la /usr/local/openresty/nginx/data/

# 测试配置文件
/usr/local/openresty/bin/openresty -t
```