#!/usr/bin/env python3
"""
Veo-3.1-Generate-Preview 视频生成示例
演示如何使用 Vertex API 调用 Veo-3.1 模型生成视频
"""

from vertex_api_final import VertexAPIFinal
from pathlib import Path
import json


def test_veo_video_generation():
    """测试 Veo-3.1-Generate-Preview 视频生成功能"""
    print("*** Veo-3.1-Generate-Preview 视频生成示例 ***")
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

        # 示例1: 基础视频生成
        print(f"\n{'='*70}")
        print("示例1: 基础视频生成")
        print('='*70)

        basic_prompt = "一只可爱的小猫在花园里玩耍，阳光明媚，画面温馨"

        result1 = client.generate_video(
            model_name="veo-3.1-generate-preview",
            prompt=basic_prompt
        )

        # 示例2: 自定义配置的视频生成
        print(f"\n{'='*70}")
        print("示例2: 自定义配置视频生成")
        print('='*70)

        custom_config = {
            "duration": "10s",  # 10秒视频
            "aspectRatio": "9:16",  # 竖屏比例
            "quality": "ultra",  # 超高质量
            "fps": 30  # 30帧每秒
        }

        advanced_prompt = """一个未来科技城市的鸟瞰图，有飞行汽车在空中穿梭，
摩天大楼闪烁着霓虹灯，夜晚场景，充满科幻感"""

        result2 = client.generate_video(
            model_name="veo-3.1-generate-preview",
            prompt=advanced_prompt,
            video_config=custom_config
        )

        # 示例3: 自然风景视频
        print(f"\n{'='*70}")
        print("示例3: 自然风景视频生成")
        print('='*70)

        nature_config = {
            "duration": "8s",
            "aspectRatio": "16:9",
            "quality": "high",
            "fps": 24
        }

        nature_prompt = """壮观的瀑布从高山上倾泻而下，
周围是茂密的绿色森林，彩虹在水雾中若隐若现，
镜头缓慢推进，展现大自然的壮美"""

        result3 = client.generate_video(
            model_name="veo-3.1-generate-preview",
            prompt=nature_prompt,
            video_config=nature_config
        )

        # 示例4: 动作场景视频
        print(f"\n{'='*70}")
        print("示例4: 动作场景视频生成")
        print('='*70)

        action_config = {
            "duration": "6s",
            "aspectRatio": "21:9",  # 电影宽屏比例
            "quality": "ultra",
            "fps": 60  # 高帧率适合动作场景
        }

        action_prompt = """一位滑板手在城市街道上表演技巧，
跳跃过台阶和栏杆，动作流畅，背景是现代都市建筑，
黄昏时分，光影效果丰富"""

        result4 = client.generate_video(
            model_name="veo-3.1-generate-preview",
            prompt=action_prompt,
            video_config=action_config
        )

        print(f"\n{'='*70}")
        print("视频生成测试完成")
        print('='*70)

        # 统计结果
        results = [result1, result2, result3, result4]
        successful = sum(1 for r in results if r is not None)

        print(f"[总结] 成功生成: {successful}/4 个视频")

        if successful > 0:
            print(f"[成功] Veo-3.1-Generate-Preview 模型测试通过!")
            print(f"[提示] 视频生成通常需要一些时间，请检查返回的 generation_id 来跟踪状态")
        else:
            print(f"[信息] 需要有效的服务账户和正确的模型访问权限")

    except Exception as e:
        print(f"[错误] 视频生成测试失败: {e}")
        import traceback
        traceback.print_exc()


def show_veo_model_info():
    """显示 Veo 模型信息"""
    print(f"\n{'='*70}")
    print("Veo 视频生成模型信息")
    print('='*70)

    models_info = {
        "veo-3.1-generate-preview": {
            "description": "最新的 Veo 3.1 预览版本，支持高质量视频生成",
            "features": ["文本到视频", "高分辨率输出", "多种宽高比", "可调节时长"],
            "max_duration": "30s",
            "supported_ratios": ["16:9", "9:16", "1:1", "21:9"]
        },
        "veo-3": {
            "description": "Veo 3.0 稳定版本",
            "features": ["文本到视频", "图像到视频", "视频编辑"],
            "max_duration": "20s",
            "supported_ratios": ["16:9", "9:16", "1:1"]
        },
        "veo-2": {
            "description": "Veo 2.0 版本",
            "features": ["基础视频生成", "文本提示"],
            "max_duration": "10s",
            "supported_ratios": ["16:9", "1:1"]
        }
    }

    for model, info in models_info.items():
        print(f"\n[{model}]")
        print(f"  描述: {info['description']}")
        print(f"  功能: {', '.join(info['features'])}")
        print(f"  最大时长: {info['max_duration']}")
        print(f"  支持比例: {', '.join(info['supported_ratios'])}")

    print(f"\n[API 端点格式]")
    print("https://aiplatform.googleapis.com/v1/projects/{project_id}/locations/global/publishers/google/models/{model_name}:predict")

    print(f"\n[请求格式示例]")
    example_payload = {
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
    print(json.dumps(example_payload, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    show_veo_model_info()
    test_veo_video_generation()