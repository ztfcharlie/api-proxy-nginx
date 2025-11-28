#!/bin/bash

# 日志查看脚本

echo "=== API Proxy 日志查看工具 ==="
echo ""

# 检查日志目录
if [ ! -d "logs" ]; then
    echo "日志目录不存在，创建中..."
    mkdir -p logs
fi

# 显示菜单
show_menu() {
    echo "请选择要查看的日志："
    echo "1. 实时查看所有 access 日志"
    echo "2. 实时查看 API 请求日志 (JSON格式)"
    echo "3. 实时查看错误日志"
    echo "4. 实时查看自定义请求日志"
    echo "5. 查看容器日志"
    echo "6. 查看最近的 access 日志 (最后50行)"
    echo "7. 查看最近的错误日志 (最后50行)"
    echo "8. 查看所有日志文件状态"
    echo "9. 清理日志文件"
    echo "0. 退出"
    echo ""
}

# 主循环
while true; do
    show_menu
    read -p "请输入选项 (0-9): " choice

    case $choice in
        1)
            echo "实时查看 access 日志 (Ctrl+C 退出)..."
            tail -f logs/access.log logs/proxy_access.log 2>/dev/null || echo "日志文件不存在"
            ;;
        2)
            echo "实时查看 API 请求日志 (JSON格式, Ctrl+C 退出)..."
            tail -f logs/api_requests.log 2>/dev/null || echo "API 请求日志文件不存在"
            ;;
        3)
            echo "实时查看错误日志 (Ctrl+C 退出)..."
            tail -f logs/error.log logs/proxy_error.log 2>/dev/null || echo "错误日志文件不存在"
            ;;
        4)
            echo "实时查看自定义请求日志 (Ctrl+C 退出)..."
            tail -f logs/requests.log 2>/dev/null || echo "自定义请求日志文件不存在"
            ;;
        5)
            echo "查看容器日志 (Ctrl+C 退出)..."
            docker logs -f api-proxy-nginx 2>/dev/null || echo "容器未运行"
            ;;
        6)
            echo "=== 最近的 Access 日志 (最后50行) ==="
            tail -50 logs/access.log logs/proxy_access.log 2>/dev/null || echo "Access 日志文件不存在"
            echo ""
            ;;
        7)
            echo "=== 最近的错误日志 (最后50行) ==="
            tail -50 logs/error.log logs/proxy_error.log 2>/dev/null || echo "错误日志文件不存在"
            echo ""
            ;;
        8)
            echo "=== 日志文件状态 ==="
            echo "日志目录: $(pwd)/logs"
            echo ""
            if [ -d "logs" ]; then
                ls -la logs/ 2>/dev/null || echo "日志目录为空"
            else
                echo "日志目录不存在"
            fi
            echo ""
            echo "容器状态:"
            docker ps | grep api-proxy-nginx || echo "容器未运行"
            echo ""
            ;;
        9)
            echo "清理日志文件..."
            read -p "确定要清理所有日志文件吗? (y/N): " confirm
            if [[ $confirm == [yY] ]]; then
                rm -f logs/*.log
                echo "日志文件已清理"
            else
                echo "取消清理"
            fi
            echo ""
            ;;
        0)
            echo "退出日志查看工具"
            exit 0
            ;;
        *)
            echo "无效选项，请重新选择"
            echo ""
            ;;
    esac
done