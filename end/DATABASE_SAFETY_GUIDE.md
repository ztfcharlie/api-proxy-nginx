# MySQL数据库安全初始化指南

## 🔒 数据安全机制

### Docker MySQL初始化机制
Docker MySQL容器有一个重要的安全特性：**初始化脚本只会在数据目录为空时执行一次**

```yaml
volumes:
  - ../mysql-data:/var/lib/mysql  # 数据持久化目录
  - ../database:/docker-entrypoint-initdb.d:ro  # 初始化脚本目录
```

### 🛡️ 多重安全保障

#### 1. **Docker层面保护**
- MySQL容器启动时检查`/var/lib/mysql`目录
- **如果目录为空** → 执行`/docker-entrypoint-initdb.d/`中的所有SQL脚本
- **如果目录不为空** → **跳过所有初始化脚本**，直接启动MySQL服务
- 这确保了初始化脚本只在首次启动时执行

#### 2. **SQL脚本层面保护**
```sql
-- ✅ 安全的表创建语法
CREATE TABLE IF NOT EXISTS `clients` (...)

-- ✅ 安全的数据插入语法
INSERT IGNORE INTO `clients` (...) VALUES (...)

-- ✅ 安全的外键约束
ALTER TABLE `access_tokens` ADD CONSTRAINT IF NOT EXISTS ...
```

#### 3. **数据持久化保护**
```yaml
# 数据目录挂载确保数据持久化
volumes:
  - ../mysql-data:/var/lib/mysql
```

## 🧪 验证安全机制

### 验证步骤1：检查数据目录
```bash
# 查看MySQL数据目录
ls -la mysql-data/

# 如果目录包含ibdata1, ib_logfile0等文件，说明数据库已初始化
# 目录为空时才会执行初始化脚本
```

### 验证步骤2：检查容器日志
```bash
# 查看MySQL容器启动日志
docker-compose logs api-proxy-mysql | grep -E "(entrypoint|init|database)"

# 首次启动会看到：
# "MySQL init process in progress..."
# "MySQL init process done. Ready for start up."

# 后续启动不会有这些信息
```

### 验证步骤3：检查数据库表
```bash
# 连接数据库检查表是否存在
docker-compose exec api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SHOW TABLES;"

# 检查初始数据是否存在
docker-compose exec api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SELECT * FROM clients;"
```

## 🔧 安全操作指南

### ✅ 安全的操作
```bash
# 安全：正常重启容器（数据不会丢失）
docker-compose restart api-proxy-mysql
docker-compose down && docker-compose up -d

# 安全：重新构建镜像（数据不会丢失）
docker-compose build && docker-compose up -d

# 安全：升级MySQL版本（数据不会丢失）
# 修改镜像版本后 docker-compose up -d
```

### ⚠️ 危险的操作（会删除数据）
```bash
# 危险：删除数据目录
rm -rf mysql-data/*

# 危险：使用 -v 参数重新创建容器
docker-compose down -v  # 这会删除所有卷数据

# 危险：强制删除容器
docker rm -f api-proxy-mysql
```

## 🔄 常见场景分析

### 场景1：正常重启服务
```bash
docker-compose down
docker-compose up -d
```
**结果**: ✅ 数据保留，不会重复执行初始化

### 场景2：重新构建镜像
```bash
docker-compose build --no-cache
docker-compose up -d
```
**结果**: ✅ 数据保留，不会重复执行初始化

### 场景3：清理并完全重建
```bash
docker-compose down
docker system prune -f
docker-compose up -d
```
**结果**: ✅ 数据保留，不会重复执行初始化

### 场景4：数据损坏需要重建
```bash
docker-compose down
rm -rf mysql-data/  # 只有这一步会触发重新初始化
docker-compose up -d
```
**结果**: ✅ 重新执行初始化，创建全新数据库

## 📋 数据备份建议

### 定期备份
```bash
# 备份整个数据库
docker-compose exec api-proxy-mysql mysqldump -u oauth2_user -poauth2_password_123456 --single-transaction --routines --triggers oauth2_mock > backup_$(date +%Y%m%d_%H%M%S).sql

# 备份特定表
docker-compose exec api-proxy-mysql mysqldump -u oauth2_user -poauth2_password_123456 oauth2_mock token_mappings clients service_accounts > critical_tables_backup.sql
```

### 恢复数据
```bash
# 恢复整个数据库
docker-compose exec -i api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock < backup_20241203_120000.sql

# 恢复特定表
docker-compose exec -i api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock < critical_tables_backup.sql
```

## 🎯 关键要点

### ✅ 为什么是安全的？

1. **Docker MySQL官方机制**: 只在数据目录为空时执行初始化
2. **数据持久化挂载**: `mysql-data`目录确保数据持续存在
3. **安全的SQL语法**: `IF NOT EXISTS` 和 `INSERT IGNORE`
4. **容器重启不影响数据**: 数据存储在宿主机目录中

### ⚠️ 唯一的风险情况

只有当您**手动删除**`mysql-data`目录时，才会重新执行初始化脚本：

```bash
# ⚠️ 这会删除所有数据并重新初始化
rm -rf mysql-data/
docker-compose up -d
```

## 🔍 监控脚本

创建一个监控脚本来验证数据库安全：
```bash
#!/bin/bash
# check-db-safety.sh

echo "🔍 检查数据库安全状态..."

# 检查数据目录
if [ -d "mysql-data" ] && [ "$(ls -A mysql-data)" ]; then
    echo "✅ MySQL数据目录存在且不为空"
else
    echo "⚠️  MySQL数据目录为空，将会执行初始化"
fi

# 检查数据库表
if docker-compose exec api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema='oauth2_mock';" 2>/dev/null | grep -q "8"; then
    echo "✅ 数据库表结构完整 (8个表)"
else
    echo "❌ 数据库表结构不完整"
fi

# 检查初始数据
client_count=$(docker-compose exec -T api-proxy-mysql mysql -u oauth2_user -poauth2_password_123456 oauth2_mock -e "SELECT COUNT(*) FROM clients;" 2>/dev/null | tail -1)
echo "📊 客户端记录数: $client_count"

echo "✅ 数据库安全检查完成"
```

---

**总结**: 您的数据是安全的！Docker MySQL的初始化机制确保了初始化脚本只在首次启动时执行，后续重启都不会重新初始化数据库。您的数据会一直保留在`mysql-data`目录中。