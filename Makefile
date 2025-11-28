.PHONY: help up down restart logs status clean backup

# 默认目标
help:
	@echo "Gemini API Proxy Docker 部署工具"
	@echo ""
	@echo "可用命令："
	@echo "  make up       启动服务"
	@echo "  make down     停止服务"
	@echo "  make restart  重启服务"
	@echo "  make logs     查看日志"
	@echo "  make status   查看状态"
	@echo "  make clean    清理资源"
	@echo "  make backup   备份配置"
	@echo "  make test     测试服务"

# 启动服务
up:
	@echo "🚀 启动 Gemini API 代理服务..."
	docker-compose up -d
	@echo "✅ 服务启动完成"
	@echo "📊 服务状态："
	docker-compose ps

# 启动完整服务（包含日志）
up-full:
	@echo "🚀 启动完整服务（包含日志收集）..."
	docker-compose --profile logging up -d
	@echo "✅ 服务启动完成"
	@echo "📊 服务状态："
	docker-compose ps

# 停止服务
down:
	@echo "🛑 停止服务..."
	docker-compose down
	@echo "✅ 服务已停止"

# 重启服务
restart:
	@echo "🔄 重启服务..."
	docker-compose restart nginx
	@echo "✅ 服务重启完成"

# 查看日志
logs:
	@echo "📋 查看服务日志..."
	docker-compose logs -f api-proxy-nginx

# 查看完整日志
logs-full:
	@echo "📋 查看所有服务日志..."
	docker-compose logs -f

# 查看状态
status:
	@echo "📊 服务状态："
	docker-compose ps
	@echo ""
	@echo "🏥 健康检查："
	@curl -s http://localhost:8080/health || echo "❌ 健康检查失败"

# 清理资源
clean:
	@echo "🧹 清理 Docker 资源..."
	docker-compose down -v
	docker system prune -f
	@echo "✅ 清理完成"

# 备份配置
backup:
	@echo "💾 备份配置文件..."
	mkdir -p backups
	tar -czf backups/gemini-proxy-config-$(shell date +%Y%m%d_%H%M%S).tar.gz nginx.conf conf.d/ lua/ html/ docker-compose.yaml docker-deploy.md
	@echo "✅ 配置备份完成"

# 测试服务
test:
	@echo "🧪 测试服务..."
	@echo "1. 健康检查..."
	@curl -s http://localhost:8080/health || (echo "❌ 健康检查失败" && exit 1)
	@echo "2. 状态检查..."
	@curl -s http://localhost:8080/status || (echo "❌ 状态检查失败" && exit 1)
	@echo "3. 页面访问..."
	@curl -s http://localhost:8080/ > /dev/null || (echo "❌ 页面访问失败" && exit 1)
	@echo "✅ 所有测试通过"

# 进入容器
shell:
	@echo "🐚 进入 Nginx 容器..."
	docker-compose exec api-proxy-nginx /bin/bash

# 重新加载配置
reload:
	@echo "🔄 重新加载 Nginx 配置..."
	docker-compose exec api-proxy-nginx nginx -s reload
	@echo "✅ 配置重新加载完成"

# 查看配置
config:
	@echo "⚙️ 检查 Nginx 配置..."
	docker-compose exec api-proxy-nginx nginx -t

# 安装依赖（首次部署）
init:
	@echo "🔧 初始化项目..."
	@echo "1. 创建必要的目录..."
	mkdir -p logs ssl backups
	@echo "2. 复制环境配置文件..."
	cp .env.example .env 2>/dev/null || echo "环境配置文件已存在"
	@echo "3. 设置权限..."
	chmod +x Makefile
	@echo "✅ 初始化完成"
	@echo "📝 请编辑 .env 文件配置您的 API Key"

# 开发模式（热重载）
dev:
	@echo "🔥 启动开发模式（监控文件变化）..."
	docker-compose up --build

# 生产部署
deploy:
	@echo "🚀 生产部署..."
	@echo "1. 检查配置..."
	docker-compose config
	@echo "2. 启动服务..."
	docker-compose up -d --force-recreate
	@echo "3. 运行测试..."
	@$(MAKE) test
	@echo "✅ 生产部署完成"