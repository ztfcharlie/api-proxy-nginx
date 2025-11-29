#!/usr/bin/env python3
"""
Check Available Vertex AI Models

This script checks what Gemini models are available in your project/region.
"""

import json
import requests
from google_auth import GoogleAuthenticator


def check_available_models():
    """Check available Vertex AI models."""
    print("*** Checking Available Vertex AI Models ***")
    print("=" * 60)

    # Configuration
    PROJECT_ID = "carbide-team-478005-f8"
    LOCATION = "us-central1"
    SERVICE_ACCOUNT_FILE = "service-account.json"

    try:
        # Get access token
        auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)
        scopes = ['https://www.googleapis.com/auth/cloud-platform']
        token_info = auth.get_access_token(SERVICE_ACCOUNT_FILE, scopes=scopes)
        token = token_info['access_token']
        print(f"[OK] Token obtained: {token[:50]}...")

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # Test different Gemini model names that might be available
        models_to_test = [
            "gemini-1.5-pro",
            "gemini-1.5-flash",
            "gemini-1.0-pro",
            "gemini-pro",
            "gemini-3-pro-preview",
            "gemini-2.0-flash-exp",
            "gemini-exp-1206"
        ]

        print(f"\n[TEST] Testing model availability...")
        print("-" * 50)

        available_models = []

        for model in models_to_test:
            print(f"\n[TESTING] {model}")

            url = f"https://{LOCATION}-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{LOCATION}/publishers/google/models/{model}:generateContent"

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
                response = requests.post(url, headers=headers, json=payload, timeout=30)

                if response.status_code == 200:
                    print(f"  ✅ {model} - AVAILABLE")
                    available_models.append(model)
                elif response.status_code == 404:
                    print(f"  ❌ {model} - NOT FOUND")
                elif response.status_code == 403:
                    print(f"  🔒 {model} - PERMISSION DENIED")
                else:
                    print(f"  ⚠️  {model} - ERROR {response.status_code}")

            except Exception as e:
                print(f"  💥 {model} - EXCEPTION: {e}")

        print(f"\n" + "=" * 60)
        print(f"[SUMMARY] Available Models:")
        if available_models:
            for model in available_models:
                print(f"  ✅ {model}")
        else:
            print(f"  ❌ No models found")

        return available_models

    except Exception as e:
        print(f"[ERROR] Failed to check models: {e}")
        return []


def test_working_model():
    """Test with a working model."""
    print(f"\n*** Testing with Working Model ***")
    print("=" * 50)

    available_models = check_available_models()

    if not available_models:
        print(f"[ERROR] No available models found")
        return False

    # Use the first available model
    model = available_models[0]
    print(f"\n[TEST] Using model: {model}")

    PROJECT_ID = "carbide-team-478005-f8"
    LOCATION = "us-central1"
    SERVICE_ACCOUNT_FILE = "service-account.json"

    try:
        # Get access token
        auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)
        scopes = ['https://www.googleapis.com/auth/cloud-platform']
        token_info = auth.get_access_token(SERVICE_ACCOUNT_FILE, scopes=scopes)
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
                    "text": "Hello! Please explain what artificial intelligence is in one sentence."
                }]
            }],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 100
            }
        }

        print(f"[REQUEST] URL: {url}")
        print(f"[REQUEST] Payload: {json.dumps(payload, indent=2)}")

        response = requests.post(url, headers=headers, json=payload, timeout=30)

        print(f"\n[RESPONSE] Status: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            print(f"[SUCCESS] Text generation successful with {model}!")

            if 'candidates' in result and result['candidates']:
                candidate = result['candidates'][0]
                if 'content' in candidate and 'parts' in candidate['content']:
                    generated_text = candidate['content']['parts'][0]['text']
                    print(f"\n[AI RESPONSE]:")
                    print("=" * 40)
                    print(generated_text)

            return True
        else:
            print(f"[ERROR] Request failed: {response.status_code}")
            print(f"[ERROR] Response: {response.text}")
            return False

    except Exception as e:
        print(f"[ERROR] Test failed: {e}")
        return False


if __name__ == "__main__":
    success = test_working_model()

    if success:
        print(f"\n[SUCCESS] Found working Gemini model!")
    else:
        print(f"\n[INFO] Check the available models list above")
        print(f"[INFO] You may need to:")
        print(f"1. Use a different region (try us-east1, europe-west1)")
        print(f"2. Enable additional APIs in Google Cloud Console")
        print(f"3. Request access to preview models")

    exit(0 if success else 1)