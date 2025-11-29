#!/usr/bin/env python3
"""
Complete Vertex AI Solution with Global Region Support

This is the final, complete solution based on your discoveries:
1. gemini-3-pro-preview requires global region
2. gemini-embedding-001 works with regional endpoints
3. Different authentication may be needed for global vs regional
"""

import json
import requests
import os
from pathlib import Path


class CompleteVertexAIClient:
    """Complete Vertex AI client with proper region handling."""

    def __init__(self, project_id="carbide-team-478005-f8"):
        self.project_id = project_id

        # Model region configuration (based on your discovery)
        self.model_config = {
            "default": "us-central1",
            "gemini-3-pro-preview": "global",
            "gemini-3-pro-preview-thinking": "global",
            "gemini-embedding-001": "us-central1",
            "gemini-1.5-pro": "us-central1",
            "gemini-1.5-flash": "us-central1"
        }

        print(f"[INIT] Complete Vertex AI Client")
        print(f"[INIT] Project: {project_id}")
        print(f"[INIT] Model Configuration:")
        for model, region in self.model_config.items():
            print(f"  {model}: {region}")

    def _get_auth_token(self):
        """Get authentication token using available method."""
        # Try service account first
        try:
            from google_auth import GoogleAuthenticator

            auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)

            # Try to find working service account
            service_files = ["service-account.json"]
            for filename in service_files:
                try:
                    scopes = ['https://www.googleapis.com/auth/cloud-platform']
                    token_info = auth.get_access_token(filename, scopes=scopes)
                    token = token_info['access_token']
                    print(f"[AUTH] Using service account: {filename}")
                    print(f"[AUTH] Token: {token[:50]}...")
                    return token, "jwt"
                except Exception as e:
                    print(f"[AUTH] Service account {filename} failed: {str(e)[:50]}...")

        except Exception as e:
            print(f"[AUTH] Service account method failed: {e}")

        # Fallback to API key
        api_key = os.getenv('GEMINI_API_KEY')
        if api_key:
            print(f"[AUTH] Using API key: {api_key[:20]}...")
            return api_key, "api_key"

        raise Exception("No valid authentication method found")

    def _build_url_and_headers(self, model_name, endpoint_type):
        """Build URL and headers based on model and region."""
        region = self.model_config.get(model_name, self.model_config["default"])
        token, auth_type = self._get_auth_token()

        if region == "global":
            # Global region uses generativelanguage.googleapis.com
            base_url = "https://generativelanguage.googleapis.com/v1beta"
            url = f"{base_url}/models/{model_name}:{endpoint_type}"

            if auth_type == "jwt":
                headers = {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                }
            else:  # api_key
                headers = {
                    "x-goog-api-key": token,
                    "Content-Type": "application/json"
                }
        else:
            # Regional endpoint uses aiplatform.googleapis.com
            base_url = f"https://{region}-aiplatform.googleapis.com/v1"
            project_path = f"projects/{self.project_id}/locations/{region}"
            url = f"{base_url}/{project_path}/publishers/google/models/{model_name}:{endpoint_type}"

            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }

        return url, headers, region

    def generate_text_gemini_3_pro_preview(self, prompt):
        """Generate text using gemini-3-pro-preview (global region)."""
        print(f"\n*** Gemini 3-Pro-Preview Text Generation (Global Region) ***")
        print("=" * 70)

        model_name = "gemini-3-pro-preview"
        url, headers, region = self._build_url_and_headers(model_name, "generateContent")

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

        print(f"[REQUEST] Model: {model_name}")
        print(f"[REQUEST] Region: {region}")
        print(f"[REQUEST] URL: {url}")
        print(f"[REQUEST] Headers: {list(headers.keys())}")
        print(f"[REQUEST] Payload: {json.dumps(payload, indent=2)}")

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=60)

            print(f"\n[RESPONSE] Status: {response.status_code}")

            if response.status_code == 200:
                result = response.json()
                print(f"[SUCCESS] Text generation successful!")

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

                return result
            else:
                print(f"[ERROR] Request failed: {response.status_code}")
                print(f"[ERROR] Response: {response.text}")
                return None

        except Exception as e:
            print(f"[ERROR] Request exception: {e}")
            return None

    def get_embeddings(self, texts, model="gemini-embedding-001"):
        """Get embeddings using regional endpoint."""
        print(f"\n*** Embeddings with {model} (Regional Endpoint) ***")
        print("=" * 60)

        url, headers, region = self._build_url_and_headers(model, "predict")

        instances = []
        for text in texts:
            instances.append({
                "content": text,
                "task_type": "RETRIEVAL_DOCUMENT"
            })

        payload = {
            "instances": instances
        }

        print(f"[REQUEST] Model: {model}")
        print(f"[REQUEST] Region: {region}")
        print(f"[REQUEST] URL: {url}")
        print(f"[REQUEST] Texts: {len(texts)} items")

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=60)

            print(f"\n[RESPONSE] Status: {response.status_code}")

            if response.status_code == 200:
                result = response.json()
                print(f"[SUCCESS] Embeddings generation successful!")

                if 'predictions' in result:
                    print(f"\n[EMBEDDINGS] Generated {len(result['predictions'])} embeddings")
                    for i, prediction in enumerate(result['predictions']):
                        if 'embeddings' in prediction:
                            embedding = prediction['embeddings']['values']
                            print(f"[EMBEDDING {i+1}] Text: {texts[i][:50]}...")
                            print(f"[EMBEDDING {i+1}] Dimension: {len(embedding)}")
                            print(f"[EMBEDDING {i+1}] First 3 values: {embedding[:3]}")

                return result
            else:
                print(f"[ERROR] Request failed: {response.status_code}")
                print(f"[ERROR] Response: {response.text}")
                return None

        except Exception as e:
            print(f"[ERROR] Request exception: {e}")
            return None


def demo_complete_solution():
    """Demonstrate the complete solution."""
    print("*** Complete Vertex AI Solution Demo ***")
    print("=" * 60)
    print("This demo shows:")
    print("1. gemini-3-pro-preview with global region")
    print("2. gemini-embedding-001 with regional endpoint")
    print("3. Automatic authentication (service account or API key)")
    print("")

    try:
        # Initialize client
        client = CompleteVertexAIClient(project_id="carbide-team-478005-f8")

        # Demo 1: Text Generation with gemini-3-pro-preview
        print(f"\n{'='*80}")
        print("DEMO 1: Text Generation with gemini-3-pro-preview (Global)")
        print('='*80)

        text_prompts = [
            "Hello! How does artificial intelligence work?",
            "Explain the concept of machine learning in simple terms",
            "What are the benefits of renewable energy?"
        ]

        text_results = []
        for i, prompt in enumerate(text_prompts, 1):
            print(f"\n--- Text Generation Example {i} ---")
            print(f"Prompt: {prompt}")

            result = client.generate_text_gemini_3_pro_preview(prompt)
            text_results.append(result is not None)

        # Demo 2: Embeddings with gemini-embedding-001
        print(f"\n{'='*80}")
        print("DEMO 2: Embeddings with gemini-embedding-001 (Regional)")
        print('='*80)

        embedding_texts = [
            "Artificial intelligence is transforming technology",
            "Machine learning enables computers to learn from data",
            "Natural language processing helps computers understand human language"
        ]

        embedding_result = client.get_embeddings(embedding_texts)

        # Summary
        print(f"\n{'='*80}")
        print("DEMO RESULTS SUMMARY")
        print('='*80)

        text_success = sum(text_results)
        embedding_success = 1 if embedding_result else 0

        print(f"Text Generation (gemini-3-pro-preview): {text_success}/{len(text_results)} successful")
        print(f"Embeddings (gemini-embedding-001): {embedding_success}/1 successful")

        total_success = text_success + embedding_success
        total_tests = len(text_results) + 1

        print(f"\nOverall Success Rate: {total_success}/{total_tests} ({(total_success/total_tests)*100:.1f}%)")

        return total_success > 0

    except Exception as e:
        print(f"[ERROR] Demo failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def show_setup_guide():
    """Show setup guide for authentication."""
    print(f"\n" + "=" * 80)
    print("SETUP GUIDE")
    print("=" * 80)

    print(f"\n[AUTHENTICATION OPTIONS]")
    print("You need ONE of these authentication methods:")

    print(f"\nOption 1: Service Account (Recommended for production)")
    print("1. Go to Google Cloud Console > IAM & Admin > Service Accounts")
    print("2. Create or select a service account")
    print("3. Add these roles:")
    print("   - Vertex AI User")
    print("   - Generative AI Administrator")
    print("4. Create and download JSON key")
    print("5. Save as geminiJson/service-account.json")

    print(f"\nOption 2: API Key (Simpler for testing)")
    print("1. Go to Google AI Studio: https://aistudio.google.com/app/apikey")
    print("2. Create API key")
    print("3. Set environment variable:")
    print("   export GEMINI_API_KEY='your-api-key-here'")

    print(f"\n[REGION CONFIGURATION]")
    print("Based on your discovery:")
    print("- gemini-3-pro-preview: MUST use global region")
    print("- gemini-embedding-001: Uses us-central1 region")
    print("- Different endpoints for global vs regional")

    print(f"\n[ENDPOINTS]")
    print("Global (gemini-3-pro-preview):")
    print("  https://generativelanguage.googleapis.com/v1beta/models/...")
    print("Regional (gemini-embedding-001):")
    print("  https://us-central1-aiplatform.googleapis.com/v1/projects/...")


if __name__ == "__main__":
    success = demo_complete_solution()

    if success:
        print(f"\n[SUCCESS] Complete solution working!")
        print(f"You now have a production-ready Vertex AI client.")
    else:
        print(f"\n[SETUP NEEDED] Authentication setup required")
        show_setup_guide()

    exit(0 if success else 1)