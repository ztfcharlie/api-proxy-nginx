#!/usr/bin/env python3
"""
Gemini-3-Pro-Preview 流式请求示例
演示如何使用流式方式请求 Gemini-3-Pro-Preview 模型
"""

from vertex_api_final import VertexAPIFinal
from pathlib import Path


def main():
    """主函数 - 演示流式请求"""
    print("*** Gemini-3-Pro-Preview 流式请求演示 ***")
    print("=" * 60)

    # 查找服务账户文件
    service_account_file = None
    gemini_dir = Path("geminiJson")

    for filename in ["service-account.json", "service-account-aaa.json"]:
        if (gemini_dir / filename).exists():
            service_account_file = filename
            break

    if not service_account_file:
        print("[ERROR] 未找到服务账户文件")
        print("请确保在 geminiJson/ 目录下有以下文件之一:")
        print("- service-account.json")
        print("- service-account-aaa.json")
        return

    print(f"[INFO] 使用服务账户: {service_account_file}")

    try:
        # 创建 Vertex API 客户端
        client = VertexAPIFinal(
            service_account_file=service_account_file,
            project_id="carbide-team-478005-f8"
        )

        # 流式请求示例
        print(f"\n{'='*70}")
        print("开始流式请求 Gemini-3-Pro-Preview")
        print('='*70)

        # 测试提示词
        prompt = """请用中文写一个关于Python编程的简短教程，包括：
1. Python的特点
2. 基本语法示例
3. 常用数据类型
4. 简单的函数定义

请详细说明每个部分，大约300-400字。"""

        print(f"[提示词]")
        print(prompt)
        print(f"\n[开始流式响应] 模型: gemini-3-pro-preview")
        print("=" * 50)

        # 执行流式请求
        result = client.generate_content(
            model_name="gemini-3-pro-preview",
            prompt=prompt,
            streaming=True  # 启用流式响应
        )

        if result:
            print(f"\n{'='*50}")
            print("[流式请求完成]")
            print('='*50)
            print("✅ 成功接收并处理了流式响应")
        else:
            print(f"\n[失败] 流式请求未能成功完成")

    except Exception as e:
        print(f"[错误] 执行流式请求时发生异常: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()