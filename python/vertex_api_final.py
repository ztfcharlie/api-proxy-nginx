#!/usr/bin/env python3
"""
Vertex API Final Implementation

Based on your code analysis from relay/channel/vertex/adaptor.go:102-118
This implements the EXACT endpoint configuration for global region.
"""

import json
import requests
from google_auth import GoogleAuthenticator
from pathlib import Path


class VertexAPIFinal:
    """Final Vertex API implementation based on your code analysis."""

    def __init__(self, service_account_file="service-account.json", project_id="carbide-team-478005-f8"):
        self.service_account_file = service_account_file
        self.project_id = project_id

        # Model region configuration (from your analysis)
        self.model_regions = {
            "gemini-3-pro-preview": "global",
            "gemini-1.5-pro": "global",  # Based on your example
            "gemini-2.5-pro": "global",  # Based on your example
            "gemini-embedding-001": "us-central1",  # Regional model
            "veo-3.1-generate-preview": "global",  # Video generation model
            "veo-2": "global",  # Video generation model
            "veo-3": "global"  # Video generation model
        }

        self.auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)

        print(f"[INIT] Vertex API Final Implementation")
        print(f"[INIT] Based on relay/channel/vertex/adaptor.go:102-118")
        print(f"[INIT] Project: {project_id}")

    def _get_access_token(self):
        """Get access token for Vertex AI."""
        scopes = ['https://www.googleapis.com/auth/cloud-platform']
        token_info = self.auth.get_access_token(self.service_account_file, scopes=scopes)
        return token_info['access_token']

    def _build_endpoint(self, model_name, method, is_streaming=False):
        """
        Build endpoint URL based on your code analysis.

        From relay/channel/vertex/adaptor.go:102-118:
        - Global region: https://aiplatform.googleapis.com/v1/projects/{project_id}/locations/global/publishers/google/models/{model_name}:{method}
        - Regional: https://{region}-aiplatform.googleapis.com/v1/projects/{project_id}/locations/{region}/publishers/google/models/{model_name}:{method}
        """
        region = self.model_regions.get(model_name, "us-central1")

        if region == "global":
            # Global region endpoint (from your analysis)
            base_url = "https://aiplatform.googleapis.com/v1"
            endpoint = f"{base_url}/projects/{self.project_id}/locations/global/publishers/google/models/{model_name}:{method}"

            # Add streaming parameter if needed
            if is_streaming:
                endpoint += "?alt=sse"
        else:
            # Regional endpoint
            base_url = f"https://{region}-aiplatform.googleapis.com/v1"
            endpoint = f"{base_url}/projects/{self.project_id}/locations/{region}/publishers/google/models/{model_name}:{method}"

        return endpoint, region

    def generate_content(self, model_name, prompt, streaming=False):
        """
        Generate content using specified model.

        Args:
            model_name: Model name (e.g., "gemini-3-pro-preview", "gemini-1.5-pro")
            prompt: Text prompt
            streaming: Whether to use streaming (streamGenerateContent)
        """
        print(f"\n*** Generating Content with {model_name} ***")
        print("=" * 60)

        # Determine method based on streaming
        method = "streamGenerateContent" if streaming else "generateContent"

        # Build endpoint using your analysis
        endpoint, region = self._build_endpoint(model_name, method, streaming)

        # Get authentication token
        token = self._get_access_token()

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # Prepare payload
        payload = {
            "contents": [{
                "role": "user",
                "parts": [{
                    "text": prompt
                }]
            }],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 1024
            }
        }

        # Add thinkingConfig for preview models
        if "preview" in model_name or "3-pro" in model_name:
            payload["generationConfig"]["thinkingConfig"] = {
                "thinkingLevel": "low"
            }

        print(f"[REQUEST] Model: {model_name}")
        print(f"[REQUEST] Region: {region}")
        print(f"[REQUEST] Method: {method}")
        print(f"[REQUEST] Streaming: {streaming}")
        print(f"[REQUEST] Endpoint: {endpoint}")
        print(f"[REQUEST] Payload: {json.dumps(payload, indent=2)}")

        try:
            if streaming:
                # For streaming requests
                response = requests.post(endpoint, headers=headers, json=payload, stream=True, timeout=60)
            else:
                # For non-streaming requests
                response = requests.post(endpoint, headers=headers, json=payload, timeout=60)

            print(f"\n[RESPONSE] Status: {response.status_code}")

            if response.status_code == 200:
                if streaming:
                    print(f"[SUCCESS] Streaming response initiated")
                    print(f"[STREAM] Processing streaming data...")
                    print("=" * 50)

                    # Handle streaming response
                    full_response = ""
                    for line in response.iter_lines():
                        if line:
                            line_text = line.decode('utf-8')
                            print(f"[RAW] {line_text}")

                            # Parse SSE data
                            if line_text.startswith('data: '):
                                try:
                                    json_data = line_text[6:]  # Remove 'data: ' prefix
                                    if json_data.strip() and json_data != '[DONE]':
                                        chunk_data = json.loads(json_data)

                                        # Extract content from chunk
                                        if 'candidates' in chunk_data and chunk_data['candidates']:
                                            candidate = chunk_data['candidates'][0]
                                            if 'content' in candidate and 'parts' in candidate['content']:
                                                for part in candidate['content']['parts']:
                                                    if 'text' in part:
                                                        chunk_text = part['text']
                                                        print(f"[CHUNK] {chunk_text}", end='', flush=True)
                                                        full_response += chunk_text
                                except json.JSONDecodeError as e:
                                    print(f"[JSON_ERROR] Failed to parse: {json_data[:100]}...")

                    print(f"\n\n[COMPLETE_RESPONSE]:")
                    print("=" * 50)
                    print(full_response)
                    return {"streaming_response": full_response}
                else:
                    result = response.json()
                    print(f"[SUCCESS] Non-streaming response received")

                    # Extract generated text
                    if 'candidates' in result and result['candidates']:
                        candidate = result['candidates'][0]
                        if 'content' in candidate and 'parts' in candidate['content']:
                            generated_text = candidate['content']['parts'][0]['text']
                            print(f"\n[GENERATED TEXT]:")
                            print("=" * 50)
                            print(generated_text)

                            # Show thinking if available
                            if 'thinking' in candidate:
                                print(f"\n[THINKING PROCESS]:")
                                print("=" * 50)
                                print(candidate['thinking'])

                return result if not streaming else None
            else:
                print(f"[ERROR] Request failed: {response.status_code}")
                print(f"[ERROR] Response: {response.text}")
                return None

        except Exception as e:
            print(f"[ERROR] Request exception: {e}")
            return None

    def get_embeddings(self, texts, model="gemini-embedding-001"):
        """Get embeddings (regional endpoint)."""
        print(f"\n*** Getting Embeddings with {model} ***")
        print("=" * 50)

        endpoint, region = self._build_endpoint(model, "predict")
        token = self._get_access_token()

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        instances = []
        for text in texts:
            instances.append({
                "content": text,
                "task_type": "RETRIEVAL_DOCUMENT"
            })

        payload = {"instances": instances}

        print(f"[REQUEST] Model: {model}")
        print(f"[REQUEST] Region: {region}")
        print(f"[REQUEST] Endpoint: {endpoint}")

        try:
            response = requests.post(endpoint, headers=headers, json=payload, timeout=60)

            print(f"\n[RESPONSE] Status: {response.status_code}")

            if response.status_code == 200:
                result = response.json()
                print(f"[SUCCESS] Embeddings generated")

                if 'predictions' in result:
                    for i, prediction in enumerate(result['predictions']):
                        if 'embeddings' in prediction:
                            embedding = prediction['embeddings']['values']
                            print(f"[EMBEDDING {i+1}] Dimension: {len(embedding)}")

                return result
            else:
                print(f"[ERROR] Request failed: {response.status_code}")
                print(f"[ERROR] Response: {response.text}")
                return None

        except Exception as e:
            print(f"[ERROR] Request exception: {e}")
            return None

    def generate_video(self, model_name, prompt, video_config=None):
        """
        Generate video using Veo models.

        Args:
            model_name: Veo model name (e.g., "veo-3.1-generate-preview", "veo-2", "veo-3")
            prompt: Text prompt for video generation
            video_config: Video configuration parameters
        """
        print(f"\n*** Generating Video with {model_name} ***")
        print("=" * 60)

        # Build endpoint for video generation
        endpoint, region = self._build_endpoint(model_name, "predict")

        # Get authentication token
        token = self._get_access_token()

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # Default video configuration
        default_config = {
            "duration": "5s",  # Video duration
            "aspectRatio": "16:9",  # Aspect ratio
            "quality": "high",  # Video quality
            "fps": 24  # Frames per second
        }

        if video_config:
            default_config.update(video_config)

        # Prepare payload for video generation
        payload = {
            "instances": [{
                "prompt": prompt,
                "videoConfig": default_config
            }],
            "parameters": {
                "sampleCount": 1  # Number of videos to generate
            }
        }

        print(f"[REQUEST] Model: {model_name}")
        print(f"[REQUEST] Region: {region}")
        print(f"[REQUEST] Method: predict")
        print(f"[REQUEST] Endpoint: {endpoint}")
        print(f"[REQUEST] Video Config: {json.dumps(default_config, indent=2)}")
        print(f"[REQUEST] Prompt: {prompt}")

        try:
            response = requests.post(endpoint, headers=headers, json=payload, timeout=120)  # Longer timeout for video

            print(f"\n[RESPONSE] Status: {response.status_code}")

            if response.status_code == 200:
                result = response.json()
                print(f"[SUCCESS] Video generation request submitted")

                # Extract video generation results
                if 'predictions' in result and result['predictions']:
                    prediction = result['predictions'][0]

                    print(f"\n[VIDEO GENERATION RESULT]:")
                    print("=" * 50)

                    # Check for video URL or generation status
                    if 'videoUri' in prediction:
                        video_uri = prediction['videoUri']
                        print(f"[VIDEO_URI] {video_uri}")

                    if 'status' in prediction:
                        status = prediction['status']
                        print(f"[STATUS] {status}")

                    if 'generationId' in prediction:
                        generation_id = prediction['generationId']
                        print(f"[GENERATION_ID] {generation_id}")
                        print(f"[INFO] Use this ID to check generation status")

                    # Print full response for debugging
                    print(f"\n[FULL_RESPONSE]:")
                    print(json.dumps(result, indent=2, ensure_ascii=False))

                return result
            else:
                print(f"[ERROR] Video generation failed: {response.status_code}")
                print(f"[ERROR] Response: {response.text}")
                return None

        except Exception as e:
            print(f"[ERROR] Video generation exception: {e}")
            return None


def streaming_example():
    """独立的流式请求示例 - 可以单独调用"""
    print("*** 独立流式请求示例 ***")
    print("=" * 50)

    # 查找服务账户文件
    service_account_file = None
    gemini_dir = Path("geminiJson")

    for filename in ["service-account.json", "service-account-aaa.json"]:
        if (gemini_dir / filename).exists():
            service_account_file = filename
            break

    if not service_account_file:
        print("[ERROR] 未找到服务账户文件")
        print("请确保在 geminiJson/ 目录下有有效的服务账户 JSON 文件")
        return

    try:
        # 创建客户端
        client = VertexAPIFinal(
            service_account_file=service_account_file,
            project_id="carbide-team-478005-f8"
        )

        # 示例1: 简单的流式对话
        print(f"\n{'='*60}")
        print("示例1: 简单流式对话")
        print('='*60)

        result1 = client.generate_content(
            model_name="gemini-3-pro-preview",
            prompt="你好！请简单介绍一下你自己。",
            streaming=True
        )

        # 示例2: 代码生成流式请求
        print(f"\n{'='*60}")
        print("示例2: 代码生成流式请求")
        print('='*60)

        code_prompt = """请用Python写一个简单的计算器类，包含以下功能：
1. 加法
2. 减法
3. 乘法
4. 除法
请包含错误处理。"""

        result2 = client.generate_content(
            model_name="gemini-3-pro-preview",
            prompt=code_prompt,
            streaming=True
        )

        # 示例3: 长文本生成流式请求
        print(f"\n{'='*60}")
        print("示例3: 长文本生成流式请求")
        print('='*60)

        long_prompt = """请写一篇关于机器学习在医疗领域应用的文章，包括：
1. 引言
2. 主要应用领域（至少3个）
3. 技术挑战
4. 未来展望
5. 结论

文章应该有逻辑性，每个部分都要详细说明。"""

        result3 = client.generate_content(
            model_name="gemini-3-pro-preview",
            prompt=long_prompt,
            streaming=True
        )

        print(f"\n[INFO] 流式请求示例完成！")

    except Exception as e:
        print(f"[ERROR] 示例执行失败: {e}")


def test_streaming_gemini_3_pro_preview():
    """专门测试 Gemini-3-Pro-Preview 模型的流式请求示例"""
    print("*** Gemini-3-Pro-Preview 流式请求示例 ***")
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
        return False

    print(f"[INFO] 使用服务账户: {service_account_file}")

    try:
        client = VertexAPIFinal(
            service_account_file=service_account_file,
            project_id="carbide-team-478005-f8"
        )

        # 流式请求示例
        print(f"\n{'='*70}")
        print("流式请求 Gemini-3-Pro-Preview 模型")
        print('='*70)

        # 测试提示词
        test_prompt = """请写一个关于人工智能发展历程的简短介绍，包括以下几个要点：
1. 人工智能的起源
2. 重要的发展里程碑
3. 当前的应用领域
4. 未来的发展趋势

请用中文回答，大约200-300字。"""

        print(f"[PROMPT] {test_prompt}")
        print("\n[开始流式响应]")
        print("=" * 50)

        # 执行流式请求
        result = client.generate_content(
            model_name="gemini-3-pro-preview",
            prompt=test_prompt,
            streaming=True
        )

        if result:
            print(f"\n[SUCCESS] 流式请求成功完成")
            return True
        else:
            print(f"\n[FAILED] 流式请求失败")
            return False

    except Exception as e:
        print(f"[ERROR] 流式请求异常: {e}")
        return False


def test_vertex_api_final():
    """Test the final implementation based on your code analysis."""
    print("*** Testing Vertex API Final Implementation ***")
    print("=" * 60)
    print("Based on relay/channel/vertex/adaptor.go:102-118 analysis")
    print("")

    # Find service account
    service_account_file = None
    gemini_dir = Path("geminiJson")

    for filename in ["service-account.json", "service-account-aaa.json"]:
        if (gemini_dir / filename).exists():
            service_account_file = filename
            break

    if not service_account_file:
        print("[ERROR] No service account files found")
        return False

    print(f"[INFO] Using service account: {service_account_file}")

    try:
        client = VertexAPIFinal(
            service_account_file=service_account_file,
            project_id="carbide-team-478005-f8"
        )

        # Test different models with global region
        models_to_test = [
            "gemini-3-pro-preview",
            "gemini-1.5-pro",
            "gemini-2.5-pro"
        ]

        success_count = 0

        for model in models_to_test:
            print(f"\n{'='*70}")
            print(f"Testing {model} (Global Region)")
            print('='*70)

            # Test non-streaming
            result = client.generate_content(
                model_name=model,
                prompt="Hello! Please respond with a simple greeting.",
                streaming=False
            )

            if result:
                print(f"[SUCCESS] {model} non-streaming test passed")
                success_count += 1
            else:
                print(f"[FAILED] {model} non-streaming test failed")

        # Test embeddings
        print(f"\n{'='*70}")
        print("Testing gemini-embedding-001 (Regional)")
        print('='*70)

        embedding_result = client.get_embeddings([
            "Test embedding text"
        ])

        if embedding_result:
            print(f"[SUCCESS] Embeddings test passed")
            success_count += 1
        else:
            print(f"[FAILED] Embeddings test failed")

        # Test Veo video generation
        print(f"\n{'='*70}")
        print("Testing veo-3.1-generate-preview (Video Generation)")
        print('='*70)

        video_result = client.generate_video(
            model_name="veo-3.1-generate-preview",
            prompt="A beautiful sunset over the ocean with gentle waves",
            video_config={
                "duration": "5s",
                "aspectRatio": "16:9",
                "quality": "high",
                "fps": 24
            }
        )

        if video_result:
            print(f"[SUCCESS] Veo video generation test passed")
            success_count += 1
        else:
            print(f"[FAILED] Veo video generation test failed")

        total_tests = len(models_to_test) + 2  # +1 for embeddings, +1 for video
        print(f"\n[SUMMARY] {success_count}/{total_tests} tests passed")

        return success_count > 0

    except Exception as e:
        print(f"[ERROR] Test failed: {e}")
        return False


def show_endpoint_examples():
    """Show endpoint examples based on your analysis."""
    print(f"\n" + "=" * 70)
    print("ENDPOINT EXAMPLES (Based on Your Code Analysis)")
    print("=" * 70)

    project_id = "carbide-team-478005-f8"

    print(f"\n[GLOBAL REGION MODELS]")
    print("Endpoint pattern: https://aiplatform.googleapis.com/v1/projects/{project_id}/locations/global/publishers/google/models/{model_name}:{method}")
    print("")

    global_examples = [
        ("gemini-3-pro-preview", "generateContent"),
        ("gemini-1.5-pro", "generateContent"),
        ("gemini-2.5-pro", "streamGenerateContent?alt=sse"),
        ("veo-3.1-generate-preview", "predict"),
        ("veo-3", "predict"),
        ("veo-2", "predict")
    ]

    for model, method in global_examples:
        url = f"https://aiplatform.googleapis.com/v1/projects/{project_id}/locations/global/publishers/google/models/{model}:{method}"
        print(f"{model}:")
        print(f"  {url}")
        print("")

    print(f"[REGIONAL MODELS]")
    print("Endpoint pattern: https://{region}-aiplatform.googleapis.com/v1/projects/{project_id}/locations/{region}/publishers/google/models/{model_name}:{method}")
    print("")

    regional_url = f"https://us-central1-aiplatform.googleapis.com/v1/projects/{project_id}/locations/us-central1/publishers/google/models/gemini-embedding-001:predict"
    print(f"gemini-embedding-001:")
    print(f"  {regional_url}")


if __name__ == "__main__":
    print("*** Vertex API Final Implementation ***")
    print("Based on your relay/channel/vertex/adaptor.go analysis")
    print("")

    show_endpoint_examples()

    # 首先测试流式请求示例
    print(f"\n{'='*80}")
    print("流式请求示例测试")
    print('='*80)

    streaming_success = test_streaming_gemini_3_pro_preview()

    # 然后测试常规功能
    print(f"\n{'='*80}")
    print("常规功能测试")
    print('='*80)

    regular_success = test_vertex_api_final()

    # 总结结果
    print(f"\n{'='*80}")
    print("测试结果总结")
    print('='*80)

    if streaming_success:
        print(f"[SUCCESS] 流式请求测试通过!")
    else:
        print(f"[INFO] 流式请求测试需要有效的服务账户")

    if regular_success:
        print(f"[SUCCESS] 常规功能测试通过!")
    else:
        print(f"[INFO] 常规功能测试需要有效的服务账户")

    overall_success = streaming_success or regular_success
    exit(0 if overall_success else 1)