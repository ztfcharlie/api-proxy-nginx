#!/usr/bin/env python3
"""
Find Working Gemini Model

Based on your successful embedding test, let's find which text generation models work.
"""

import json
import requests
from google_auth import GoogleAuthenticator
from pathlib import Path


def find_service_account():
    """Find available service account file."""
    gemini_dir = Path("geminiJson")

    # Try different filenames
    for filename in ["service-account.json", "service-account-aaa.json"]:
        if (gemini_dir / filename).exists():
            return filename

    # Try any JSON file
    json_files = list(gemini_dir.glob("*.json"))
    if json_files:
        return json_files[0].name

    return None


def test_gemini_models():
    """Test different Gemini models to find working ones."""
    print("*** Finding Working Gemini Models ***")
    print("=" * 50)

    # Find service account
    service_account_file = find_service_account()
    if not service_account_file:
        print("[ERROR] No service account files found")
        return []

    print(f"[INFO] Using: {service_account_file}")

    # Configuration
    PROJECT_ID = "carbide-team-478005-f8"
    LOCATION = "us-central1"

    try:
        # Get access token (we know this works from your embedding test)
        auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)
        scopes = ['https://www.googleapis.com/auth/cloud-platform']
        token_info = auth.get_access_token(service_account_file, scopes=scopes)
        token = token_info['access_token']
        print(f"[OK] Token obtained: {token[:50]}...")

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # Test common Gemini models
        models_to_test = [
            "gemini-1.5-pro",
            "gemini-1.5-flash",
            "gemini-1.0-pro",
            "gemini-pro",
            "gemini-1.5-pro-002",
            "gemini-1.5-flash-002"
        ]

        print(f"\n[TESTING] Checking model availability...")
        print("-" * 40)

        working_models = []

        for model in models_to_test:
            print(f"\n[TEST] {model}")

            url = f"https://{LOCATION}-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{LOCATION}/publishers/google/models/{model}:generateContent"

            payload = {
                "contents": [{
                    "role": "user",
                    "parts": [{
                        "text": "Say 'Hello' if you can see this."
                    }]
                }],
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 20
                }
            }

            try:
                response = requests.post(url, headers=headers, json=payload, timeout=20)

                print(f"  Status: {response.status_code}")

                if response.status_code == 200:
                    result = response.json()
                    if 'candidates' in result and result['candidates']:
                        candidate = result['candidates'][0]
                        if 'content' in candidate:
                            print(f"  ✅ WORKING - {model}")
                            working_models.append(model)
                        else:
                            print(f"  ⚠️  Response format issue - {model}")
                    else:
                        print(f"  ⚠️  No candidates - {model}")

                elif response.status_code == 404:
                    print(f"  ❌ NOT FOUND - {model}")
                elif response.status_code == 403:
                    print(f"  🔒 PERMISSION DENIED - {model}")
                else:
                    print(f"  ❌ ERROR {response.status_code} - {model}")
                    error_response = response.text
                    if len(error_response) < 200:
                        print(f"     {error_response}")

            except Exception as e:
                print(f"  💥 EXCEPTION - {model}: {str(e)[:100]}")

        print(f"\n" + "=" * 50)
        print(f"[RESULTS] Working Models:")
        if working_models:
            for model in working_models:
                print(f"  ✅ {model}")
        else:
            print(f"  ❌ No working text generation models found")

        return working_models

    except Exception as e:
        print(f"[ERROR] Test failed: {e}")
        return []


def demo_working_model(model):
    """Demo with a working model."""
    print(f"\n*** Demo with {model} ***")
    print("=" * 50)

    service_account_file = find_service_account()
    PROJECT_ID = "carbide-team-478005-f8"
    LOCATION = "us-central1"

    try:
        # Get token
        auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)
        scopes = ['https://www.googleapis.com/auth/cloud-platform']
        token_info = auth.get_access_token(service_account_file, scopes=scopes)
        token = token_info['access_token']

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        url = f"https://{LOCATION}-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{LOCATION}/publishers/google/models/{model}:generateContent"

        payload = {
            "contents": [{
                "role": "user",
                "parts": [{
                    "text": "Explain artificial intelligence in one simple sentence."
                }]
            }],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 100
            }
        }

        print(f"[REQUEST] Testing {model} with real prompt...")

        response = requests.post(url, headers=headers, json=payload, timeout=30)

        if response.status_code == 200:
            result = response.json()

            if 'candidates' in result and result['candidates']:
                candidate = result['candidates'][0]
                if 'content' in candidate and 'parts' in candidate['content']:
                    generated_text = candidate['content']['parts'][0]['text']
                    print(f"\n[SUCCESS] {model} Response:")
                    print("=" * 30)
                    print(generated_text)
                    return True

        print(f"[ERROR] Demo failed with {model}")
        return False

    except Exception as e:
        print(f"[ERROR] Demo exception: {e}")
        return False


if __name__ == "__main__":
    working_models = test_gemini_models()

    if working_models:
        print(f"\n[SUCCESS] Found {len(working_models)} working model(s)!")

        # Demo with the first working model
        demo_working_model(working_models[0])

        print(f"\n[USAGE] You can now update your scripts to use:")
        for model in working_models:
            print(f"  - {model}")

    else:
        print(f"\n[INFO] No text generation models found, but embeddings work!")
        print(f"[INFO] You can still use gemini-embedding-001 for embeddings")
        print(f"[INFO] For text generation, you might need to:")
        print(f"  1. Try different regions (us-east1, europe-west1)")
        print(f"  2. Enable Vertex AI Generative AI API")
        print(f"  3. Request access to specific models")

    exit(0 if working_models else 1)