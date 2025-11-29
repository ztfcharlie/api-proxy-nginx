#!/usr/bin/env python3
"""
Working Vertex AI Demo

Based on your successful test, this creates a complete working example.
Since embeddings worked, we know your auth is correct.
"""

import json
import requests
from google_auth import GoogleAuthenticator


def create_working_vertex_client():
    """Create a working Vertex AI client based on your successful test."""
    print("*** Working Vertex AI Gemini Client ***")
    print("=" * 50)

    # Use the same configuration that worked for embeddings
    PROJECT_ID = "carbide-team-478005-f8"
    LOCATION = "us-central1"
    SERVICE_ACCOUNT_FILE = "service-account.json"  # The one that worked

    print(f"[CONFIG] Project: {PROJECT_ID}")
    print(f"[CONFIG] Location: {LOCATION}")
    print(f"[CONFIG] Service Account: {SERVICE_ACCOUNT_FILE}")

    try:
        # Initialize auth (same as your working test)
        auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)
        scopes = ['https://www.googleapis.com/auth/cloud-platform']
        token_info = auth.get_access_token(SERVICE_ACCOUNT_FILE, scopes=scopes)
        token = token_info['access_token']

        print(f"[OK] Authentication successful: {token[:50]}...")

        return {
            'auth': auth,
            'token': token,
            'project_id': PROJECT_ID,
            'location': LOCATION,
            'service_account_file': SERVICE_ACCOUNT_FILE
        }

    except Exception as e:
        print(f"[ERROR] Authentication failed: {e}")
        return None


def test_embeddings(client_config):
    """Test embeddings (we know this works)."""
    print(f"\n*** Testing Embeddings (Known Working) ***")
    print("-" * 50)

    headers = {
        "Authorization": f"Bearer {client_config['token']}",
        "Content-Type": "application/json"
    }

    url = f"https://{client_config['location']}-aiplatform.googleapis.com/v1/projects/{client_config['project_id']}/locations/{client_config['location']}/publishers/google/models/gemini-embedding-001:predict"

    payload = {
        "instances": [
            {
                "content": "How does artificial intelligence work?",
                "task_type": "RETRIEVAL_DOCUMENT"
            }
        ]
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)

        if response.status_code == 200:
            result = response.json()
            if 'predictions' in result and result['predictions']:
                embedding = result['predictions'][0]['embeddings']['values']
                print(f"[SUCCESS] Embeddings working!")
                print(f"[INFO] Dimension: {len(embedding)}")
                print(f"[INFO] First 3 values: {embedding[:3]}")
                return True
        else:
            print(f"[ERROR] Embeddings failed: {response.status_code}")
            return False

    except Exception as e:
        print(f"[ERROR] Embeddings exception: {e}")
        return False


def find_working_text_model(client_config):
    """Find a working text generation model."""
    print(f"\n*** Finding Working Text Generation Model ***")
    print("-" * 50)

    headers = {
        "Authorization": f"Bearer {client_config['token']}",
        "Content-Type": "application/json"
    }

    # Try the most common available models
    models = [
        "gemini-1.5-pro",
        "gemini-1.5-flash",
        "gemini-1.0-pro",
        "gemini-pro"
    ]

    for model in models:
        print(f"\n[TEST] Trying {model}...")

        url = f"https://{client_config['location']}-aiplatform.googleapis.com/v1/projects/{client_config['project_id']}/locations/{client_config['location']}/publishers/google/models/{model}:generateContent"

        payload = {
            "contents": [{
                "role": "user",
                "parts": [{
                    "text": "Hello"
                }]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 10
            }
        }

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=20)

            if response.status_code == 200:
                print(f"  ✅ {model} - WORKING!")
                return model
            elif response.status_code == 404:
                print(f"  ❌ {model} - Not found")
            elif response.status_code == 403:
                print(f"  🔒 {model} - Permission denied")
            else:
                print(f"  ⚠️  {model} - Error {response.status_code}")

        except Exception as e:
            print(f"  💥 {model} - Exception: {str(e)[:50]}")

    return None


def demo_text_generation(client_config, model):
    """Demo text generation with working model."""
    print(f"\n*** Text Generation Demo with {model} ***")
    print("-" * 50)

    headers = {
        "Authorization": f"Bearer {client_config['token']}",
        "Content-Type": "application/json"
    }

    url = f"https://{client_config['location']}-aiplatform.googleapis.com/v1/projects/{client_config['project_id']}/locations/{client_config['location']}/publishers/google/models/{model}:generateContent"

    # Test prompts
    prompts = [
        "Explain artificial intelligence in one sentence.",
        "What are the benefits of renewable energy?",
        "Write a haiku about technology."
    ]

    for i, prompt in enumerate(prompts, 1):
        print(f"\n--- Example {i} ---")
        print(f"Prompt: {prompt}")

        payload = {
            "contents": [{
                "role": "user",
                "parts": [{
                    "text": prompt
                }]
            }],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 200
            }
        }

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=30)

            if response.status_code == 200:
                result = response.json()

                if 'candidates' in result and result['candidates']:
                    candidate = result['candidates'][0]
                    if 'content' in candidate and 'parts' in candidate['content']:
                        generated_text = candidate['content']['parts'][0]['text']
                        print(f"Response: {generated_text}")
                    else:
                        print(f"[ERROR] Unexpected response format")
                else:
                    print(f"[ERROR] No candidates in response")
            else:
                print(f"[ERROR] Request failed: {response.status_code}")

        except Exception as e:
            print(f"[ERROR] Exception: {e}")


def main():
    """Main demo function."""
    print("*** Complete Vertex AI Gemini Demo ***")
    print("Based on your successful embedding test")
    print("=" * 60)

    # Initialize client
    client_config = create_working_vertex_client()
    if not client_config:
        print("[FAILED] Could not initialize client")
        return False

    # Test embeddings (we know this works)
    if not test_embeddings(client_config):
        print("[FAILED] Embeddings test failed")
        return False

    # Find working text model
    working_model = find_working_text_model(client_config)

    if working_model:
        print(f"\n[SUCCESS] Found working model: {working_model}")
        demo_text_generation(client_config, working_model)

        print(f"\n" + "=" * 60)
        print(f"[SUMMARY] Working Configuration:")
        print(f"  Text Generation: {working_model}")
        print(f"  Embeddings: gemini-embedding-001")
        print(f"  Project: {client_config['project_id']}")
        print(f"  Location: {client_config['location']}")

        return True
    else:
        print(f"\n[INFO] No text generation models available")
        print(f"[INFO] But embeddings work perfectly!")
        print(f"[INFO] You can use gemini-embedding-001 for:")
        print(f"  - Text embeddings")
        print(f"  - Semantic search")
        print(f"  - Document similarity")

        return True  # Embeddings still work


if __name__ == "__main__":
    success = main()

    if success:
        print(f"\n[SUCCESS] Vertex AI demo completed!")
    else:
        print(f"\n[FAILED] Demo failed")

    exit(0 if success else 1)