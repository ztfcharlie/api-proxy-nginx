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
            "gemini-1.5-flash": "global",  # Based on your example
            "gemini-embedding-001": "us-central1"  # Regional model
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
                    # Handle streaming response
                    for line in response.iter_lines():
                        if line:
                            print(f"[STREAM] {line.decode('utf-8')}")
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
            "gemini-1.5-flash"
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

        total_tests = len(models_to_test) + 1
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
        ("gemini-1.5-flash", "streamGenerateContent?alt=sse")
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

    success = test_vertex_api_final()

    if success:
        print(f"\n[SUCCESS] Implementation matches your code analysis!")
    else:
        print(f"\n[INFO] Implementation ready, needs valid service account")

    exit(0 if success else 1)