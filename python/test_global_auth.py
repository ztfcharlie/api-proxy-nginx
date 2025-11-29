#!/usr/bin/env python3
"""
Test Global Region Authentication

For global region, we might need to use different authentication.
Let's test both approaches.
"""

import json
import requests
from google_auth import GoogleAuthenticator
import os


def test_global_region_auth():
    """Test different authentication methods for global region."""
    print("*** Testing Global Region Authentication Methods ***")
    print("=" * 60)

    PROJECT_ID = "carbide-team-478005-f8"

    # Method 1: Try with service account (like regional)
    print("\n[METHOD 1] Service Account JWT for Global Region")
    print("-" * 50)

    try:
        auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)

        # Try to find a working service account file
        service_files = ["service-account.json", "service-account-aaa.json"]
        working_file = None

        for filename in service_files:
            try:
                # Test if we can load and get token
                token_info = auth.get_access_token(filename)
                working_file = filename
                print(f"[OK] Found working service account: {filename}")
                break
            except Exception as e:
                print(f"[SKIP] {filename} failed: {str(e)[:50]}...")

        if not working_file:
            print("[ERROR] No working service account files found")
            print("[INFO] You need a valid service account JSON with complete private key")
            return False

        token = token_info['access_token']
        print(f"[OK] JWT Token: {token[:50]}...")

        # Test global endpoint with JWT
        global_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent"

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        payload = {
            "contents": [{
                "parts": [{
                    "text": "Hello! Test message for global region."
                }]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 50,
                "thinkingConfig": {
                    "thinkingLevel": "low"
                }
            }
        }

        print(f"\n[TEST] Global endpoint with JWT...")
        print(f"[URL] {global_url}")

        response = requests.post(global_url, headers=headers, json=payload, timeout=30)

        print(f"[RESPONSE] Status: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            print(f"[SUCCESS] Global region with JWT works!")

            if 'candidates' in result and result['candidates']:
                candidate = result['candidates'][0]
                if 'content' in candidate and 'parts' in candidate['content']:
                    generated_text = candidate['content']['parts'][0]['text']
                    print(f"\n[AI RESPONSE]:")
                    print("=" * 30)
                    print(generated_text)

            return True
        else:
            print(f"[ERROR] Global JWT failed: {response.status_code}")
            print(f"[ERROR] Response: {response.text}")

    except Exception as e:
        print(f"[ERROR] Method 1 failed: {e}")

    # Method 2: Check if API Key is needed for global
    print(f"\n[METHOD 2] API Key for Global Region")
    print("-" * 50)

    api_key = os.getenv('GEMINI_API_KEY')
    if api_key:
        print(f"[INFO] Found API key: {api_key[:20]}...")

        headers = {
            "x-goog-api-key": api_key,
            "Content-Type": "application/json"
        }

        payload = {
            "contents": [{
                "parts": [{
                    "text": "Hello! Test with API key."
                }]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 50,
                "thinkingConfig": {
                    "thinkingLevel": "low"
                }
            }
        }

        global_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent"

        print(f"[TEST] Global endpoint with API key...")
        response = requests.post(global_url, headers=headers, json=payload, timeout=30)

        print(f"[RESPONSE] Status: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            print(f"[SUCCESS] Global region with API key works!")

            if 'candidates' in result and result['candidates']:
                candidate = result['candidates'][0]
                if 'content' in candidate and 'parts' in candidate['content']:
                    generated_text = candidate['content']['parts'][0]['text']
                    print(f"\n[AI RESPONSE]:")
                    print("=" * 30)
                    print(generated_text)

            return True
        else:
            print(f"[ERROR] Global API key failed: {response.status_code}")
            print(f"[ERROR] Response: {response.text}")

    else:
        print(f"[SKIP] No GEMINI_API_KEY environment variable found")

    return False


def show_instructions():
    """Show setup instructions."""
    print(f"\n" + "=" * 60)
    print("[SETUP INSTRUCTIONS]")
    print("=" * 60)

    print(f"\n[OPTION 1] Fix Service Account Authentication:")
    print("1. Get your complete service account JSON from Google Cloud Console")
    print("2. Ensure the private_key field contains the FULL private key")
    print("3. Save as geminiJson/service-account.json")
    print("4. Make sure your service account has these permissions:")
    print("   - Vertex AI User")
    print("   - Generative AI Administrator")

    print(f"\n[OPTION 2] Use API Key (Alternative):")
    print("1. Go to Google AI Studio: https://aistudio.google.com/app/apikey")
    print("2. Create an API key")
    print("3. Set environment variable: export GEMINI_API_KEY='your-key'")
    print("4. Run this script again")

    print(f"\n[REGION CONFIGURATION]:")
    print("For gemini-3-pro-preview, you MUST use:")
    print("- Region: global")
    print("- Endpoint: generativelanguage.googleapis.com")
    print("- NOT aiplatform.googleapis.com")


if __name__ == "__main__":
    success = test_global_region_auth()

    if success:
        print(f"\n[SUCCESS] Global region authentication working!")
    else:
        print(f"\n[FAILED] Global region authentication failed")
        show_instructions()

    exit(0 if success else 1)