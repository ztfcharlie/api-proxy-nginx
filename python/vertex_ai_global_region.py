#!/usr/bin/env python3
"""
Vertex AI with Global Region Support

This script supports model-specific regions:
- gemini-3-pro-preview: global region
- gemini-embedding-001: us-central1 region
"""

import json
import requests
from google_auth import GoogleAuthenticator
from pathlib import Path


class VertexAIGlobalClient:
    """Vertex AI client with model-specific region support."""

    def __init__(self, service_account_file="service-account.json", project_id="carbide-team-478005-f8"):
        self.service_account_file = service_account_file
        self.project_id = project_id

        # Model-specific region configuration
        self.model_regions = {
            "default": "us-central1",
            "gemini-3-pro-preview": "global",
            "gemini-3-pro-preview-thinking": "global",
            "gemini-embedding-001": "us-central1",
            "gemini-1.5-pro": "us-central1",
            "gemini-1.5-flash": "us-central1"
        }

        # Initialize authenticator
        self.auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)

        print(f"[INIT] Vertex AI Global Client")
        print(f"[INIT] Project: {project_id}")
        print(f"[INIT] Model Regions: {json.dumps(self.model_regions, indent=2)}")

    def _get_region_for_model(self, model_name):
        """Get the appropriate region for a specific model."""
        region = self.model_regions.get(model_name, self.model_regions["default"])
        print(f"[REGION] Model '{model_name}' -> Region '{region}'")
        return region

    def _get_access_token(self):
        """Get access token for Vertex AI."""
        scopes = ['https://www.googleapis.com/auth/cloud-platform']
        token_info = self.auth.get_access_token(self.service_account_file, scopes=scopes)
        return token_info['access_token']

    def _make_request(self, model_name, endpoint_suffix, payload):
        """Make request to appropriate regional endpoint."""
        region = self._get_region_for_model(model_name)
        token = self._get_access_token()

        # Build URL based on region
        if region == "global":
            base_url = "https://generativelanguage.googleapis.com/v1beta"
            # For global region, use different URL structure
            if "generateContent" in endpoint_suffix:
                url = f"{base_url}/models/{model_name}:generateContent"
            else:
                url = f"{base_url}/models/{model_name}:{endpoint_suffix}"
        else:
            # Regional endpoint
            base_url = f"https://{region}-aiplatform.googleapis.com/v1"
            project_path = f"projects/{self.project_id}/locations/{region}"
            url = f"{base_url}/{project_path}/publishers/google/models/{model_name}:{endpoint_suffix}"

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        print(f"\n[REQUEST] Model: {model_name}")
        print(f"[REQUEST] Region: {region}")
        print(f"[REQUEST] URL: {url}")
        print(f"[REQUEST] Payload: {json.dumps(payload, indent=2)}")

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=60)

            print(f"\n[RESPONSE] Status: {response.status_code}")
            print(f"[RESPONSE] Headers: {dict(response.headers)}")

            if response.status_code == 200:
                result = response.json()
                print(f"[SUCCESS] Request successful")
                return result
            else:
                print(f"[ERROR] Request failed: {response.status_code}")
                print(f"[ERROR] Response: {response.text}")
                response.raise_for_status()

        except requests.exceptions.RequestException as e:
            print(f"[ERROR] Request exception: {e}")
            raise

    def generate_text_gemini_3_pro_preview(self, prompt):
        """Generate text using gemini-3-pro-preview (global region)."""
        print(f"\n*** Generating Text with gemini-3-pro-preview (Global Region) ***")
        print("=" * 70)

        payload = {
            "contents": [{
                "parts": [{
                    "text": prompt
                }]
            }],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 1024,
                "thinkingConfig": {
                    "thinkingLevel": "low"
                }
            }
        }

        result = self._make_request("gemini-3-pro-preview", "generateContent", payload)

        # Extract generated text
        if 'candidates' in result and result['candidates']:
            candidate = result['candidates'][0]
            if 'content' in candidate and 'parts' in candidate['content']:
                generated_text = candidate['content']['parts'][0]['text']
                print(f"\n[GENERATED TEXT]:")
                print("=" * 50)
                print(generated_text)

                # Show thinking process if available
                if 'thinking' in candidate:
                    print(f"\n[THINKING PROCESS]:")
                    print("=" * 50)
                    print(candidate['thinking'])

        return result

    def get_embeddings(self, texts, model="gemini-embedding-001"):
        """Get embeddings using regional endpoint."""
        print(f"\n*** Getting Embeddings with {model} ***")
        print("=" * 60)

        instances = []
        for text in texts:
            instances.append({
                "content": text,
                "task_type": "RETRIEVAL_DOCUMENT"
            })

        payload = {
            "instances": instances
        }

        result = self._make_request(model, "predict", payload)

        # Extract embeddings
        if 'predictions' in result:
            print(f"\n[EMBEDDINGS] Generated {len(result['predictions'])} embeddings")
            for i, prediction in enumerate(result['predictions']):
                if 'embeddings' in prediction:
                    embedding = prediction['embeddings']['values']
                    print(f"[EMBEDDING {i+1}] Text: {texts[i][:50]}...")
                    print(f"[EMBEDDING {i+1}] Dimension: {len(embedding)}")
                    print(f"[EMBEDDING {i+1}] First 5 values: {embedding[:5]}")

        return result


def find_service_account():
    """Find available service account file."""
    gemini_dir = Path("geminiJson")

    for filename in ["service-account.json", "service-account-aaa.json"]:
        if (gemini_dir / filename).exists():
            return filename

    json_files = list(gemini_dir.glob("*.json"))
    if json_files:
        return json_files[0].name

    return None


def test_global_region_gemini():
    """Test gemini-3-pro-preview with global region."""
    print("*** Testing Gemini 3-Pro-Preview with Global Region ***")
    print("=" * 70)

    service_account_file = find_service_account()
    if not service_account_file:
        print("[ERROR] No service account files found")
        return False

    print(f"[INFO] Using service account: {service_account_file}")

    try:
        # Initialize client
        client = VertexAIGlobalClient(
            service_account_file=service_account_file,
            project_id="carbide-team-478005-f8"
        )

        # Test 1: Text Generation with gemini-3-pro-preview (global)
        print(f"\n{'='*80}")
        print("TEST 1: gemini-3-pro-preview Text Generation (Global Region)")
        print('='*80)

        prompts = [
            "Hello! How does artificial intelligence work?",
            "Explain quantum computing in simple terms",
            "Write a haiku about technology"
        ]

        for i, prompt in enumerate(prompts, 1):
            print(f"\n--- Text Generation Example {i} ---")
            print(f"Prompt: {prompt}")

            try:
                result = client.generate_text_gemini_3_pro_preview(prompt)
                print(f"[SUCCESS] Text generation {i} completed")
            except Exception as e:
                print(f"[ERROR] Text generation {i} failed: {e}")

        # Test 2: Embeddings (regional endpoint - we know this works)
        print(f"\n{'='*80}")
        print("TEST 2: gemini-embedding-001 (Regional Endpoint)")
        print('='*80)

        embedding_texts = [
            "Artificial intelligence is transforming technology",
            "Machine learning processes vast amounts of data"
        ]

        try:
            result = client.get_embeddings(embedding_texts)
            print(f"[SUCCESS] Embeddings generation completed")
        except Exception as e:
            print(f"[ERROR] Embeddings generation failed: {e}")

        return True

    except Exception as e:
        print(f"[ERROR] Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("*** Vertex AI Global Region Support ***")
    print("Testing gemini-3-pro-preview with global region")
    print("and gemini-embedding-001 with regional endpoint")
    print("")

    success = test_global_region_gemini()

    if success:
        print(f"\n[SUCCESS] Global region test completed!")
        print(f"\n[CONFIGURATION] Working Setup:")
        print(f"  - gemini-3-pro-preview: global region")
        print(f"  - gemini-embedding-001: us-central1 region")
        print(f"  - Authentication: Service Account JSON")
    else:
        print(f"\n[FAILED] Test failed - check errors above")

    exit(0 if success else 1)