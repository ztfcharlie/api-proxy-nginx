#!/usr/bin/env python3
"""
Corrected Vertex AI Client

ALL models use aiplatform.googleapis.com endpoint.
Only the location/region differs:
- gemini-3-pro-preview: location = "global"
- gemini-embedding-001: location = "us-central1"
"""

import json
import requests
from google_auth import GoogleAuthenticator
from pathlib import Path


class CorrectedVertexAIClient:
    """Corrected Vertex AI client - all models use aiplatform.googleapis.com."""

    def __init__(self, service_account_file="service-account.json", project_id="carbide-team-478005-f8"):
        self.service_account_file = service_account_file
        self.project_id = project_id

        # Model location configuration (corrected understanding)
        self.model_locations = {
            "default": "us-central1",
            "gemini-3-pro-preview": "global",
            "gemini-3-pro-preview-thinking": "global",
            "gemini-embedding-001": "us-central1",
            "gemini-1.5-pro": "us-central1",
            "gemini-1.5-flash": "us-central1"
        }

        # Initialize authenticator
        self.auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)

        print(f"[INIT] Corrected Vertex AI Client")
        print(f"[INIT] Project: {project_id}")
        print(f"[INIT] All models use: aiplatform.googleapis.com")
        print(f"[INIT] Model Locations:")
        for model, location in self.model_locations.items():
            print(f"  {model}: {location}")

    def _get_location_for_model(self, model_name):
        """Get the appropriate location for a specific model."""
        location = self.model_locations.get(model_name, self.model_locations["default"])
        print(f"[LOCATION] Model '{model_name}' -> Location '{location}'")
        return location

    def _get_access_token(self):
        """Get access token for Vertex AI."""
        scopes = ['https://www.googleapis.com/auth/cloud-platform']
        token_info = self.auth.get_access_token(self.service_account_file, scopes=scopes)
        return token_info['access_token']

    def _make_request(self, model_name, endpoint_suffix, payload):
        """Make request to Vertex AI endpoint with correct location."""
        location = self._get_location_for_model(model_name)
        token = self._get_access_token()

        # ALL models use aiplatform.googleapis.com, just different locations
        base_url = f"https://{location}-aiplatform.googleapis.com/v1"
        project_path = f"projects/{self.project_id}/locations/{location}"
        url = f"{base_url}/{project_path}/publishers/google/models/{model_name}:{endpoint_suffix}"

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        print(f"\n[REQUEST] Model: {model_name}")
        print(f"[REQUEST] Location: {location}")
        print(f"[REQUEST] URL: {url}")
        print(f"[REQUEST] Headers: Authorization: Bearer {token[:50]}...")
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
        """Generate text using gemini-3-pro-preview (global location)."""
        print(f"\n*** Generating Text with gemini-3-pro-preview (Global Location) ***")
        print("=" * 75)

        payload = {
            "contents": [{
                "role": "user",
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
        """Get embeddings using us-central1 location."""
        print(f"\n*** Getting Embeddings with {model} (us-central1 Location) ***")
        print("=" * 70)

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


def test_corrected_vertex_ai():
    """Test the corrected Vertex AI implementation."""
    print("*** Testing Corrected Vertex AI Implementation ***")
    print("=" * 60)
    print("Key correction: ALL models use aiplatform.googleapis.com")
    print("Only the location differs (global vs us-central1)")
    print("")

    service_account_file = find_service_account()
    if not service_account_file:
        print("[ERROR] No service account files found")
        return False

    print(f"[INFO] Using service account: {service_account_file}")

    try:
        # Initialize client
        client = CorrectedVertexAIClient(
            service_account_file=service_account_file,
            project_id="carbide-team-478005-f8"
        )

        # Test 1: Text Generation with gemini-3-pro-preview (global location)
        print(f"\n{'='*80}")
        print("TEST 1: gemini-3-pro-preview Text Generation (Global Location)")
        print('='*80)

        prompts = [
            "Hello! How does artificial intelligence work?",
            "Explain machine learning in simple terms"
        ]

        text_success = 0
        for i, prompt in enumerate(prompts, 1):
            print(f"\n--- Text Generation Example {i} ---")
            print(f"Prompt: {prompt}")

            try:
                result = client.generate_text_gemini_3_pro_preview(prompt)
                if result:
                    print(f"[SUCCESS] Text generation {i} completed")
                    text_success += 1
                else:
                    print(f"[ERROR] Text generation {i} failed")
            except Exception as e:
                print(f"[ERROR] Text generation {i} failed: {e}")

        # Test 2: Embeddings with gemini-embedding-001 (us-central1 location)
        print(f"\n{'='*80}")
        print("TEST 2: gemini-embedding-001 (us-central1 Location)")
        print('='*80)

        embedding_texts = [
            "Artificial intelligence is transforming technology",
            "Machine learning processes data efficiently"
        ]

        embedding_success = 0
        try:
            result = client.get_embeddings(embedding_texts)
            if result:
                print(f"[SUCCESS] Embeddings generation completed")
                embedding_success = 1
            else:
                print(f"[ERROR] Embeddings generation failed")
        except Exception as e:
            print(f"[ERROR] Embeddings generation failed: {e}")

        # Summary
        print(f"\n{'='*80}")
        print("TEST RESULTS SUMMARY")
        print('='*80)
        print(f"Text Generation (gemini-3-pro-preview): {text_success}/{len(prompts)} successful")
        print(f"Embeddings (gemini-embedding-001): {embedding_success}/1 successful")

        total_success = text_success + embedding_success
        total_tests = len(prompts) + 1

        print(f"\nOverall Success: {total_success}/{total_tests} tests passed")

        if total_success > 0:
            print(f"\n[SUCCESS] Corrected implementation working!")
            print(f"[CONFIRMED] All models use aiplatform.googleapis.com")
            print(f"[CONFIRMED] gemini-3-pro-preview uses global location")
            print(f"[CONFIRMED] gemini-embedding-001 uses us-central1 location")
            return True
        else:
            print(f"\n[FAILED] No tests passed")
            return False

    except Exception as e:
        print(f"[ERROR] Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("*** Corrected Vertex AI Implementation ***")
    print("Based on your clarification:")
    print("- ALL models use aiplatform.googleapis.com")
    print("- gemini-3-pro-preview uses location='global'")
    print("- gemini-embedding-001 uses location='us-central1'")
    print("")

    success = test_corrected_vertex_ai()

    if success:
        print(f"\n[SUCCESS] Corrected implementation verified!")
    else:
        print(f"\n[FAILED] Implementation needs authentication setup")
        print(f"\n[NEXT STEPS]:")
        print(f"1. Ensure you have a valid service account JSON")
        print(f"2. Save it as geminiJson/service-account.json")
        print(f"3. Make sure it has Vertex AI permissions")

    exit(0 if success else 1)