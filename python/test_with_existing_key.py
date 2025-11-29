#!/usr/bin/env python3
"""
Test Vertex AI with existing service account file

This script will use whatever service account file is available.
"""

import json
import requests
from google_auth import GoogleAuthenticator
from pathlib import Path


def find_service_account_file():
    """Find available service account files."""
    gemini_dir = Path("geminiJson")
    json_files = list(gemini_dir.glob("*.json"))

    print(f"[INFO] Found JSON files: {[f.name for f in json_files]}")

    # Prefer service-account.json, then any other JSON file
    for filename in ["service-account.json", "service-account-aaa.json"]:
        file_path = gemini_dir / filename
        if file_path.exists():
            return filename

    if json_files:
        return json_files[0].name

    return None


def test_vertex_ai_simple():
    """Simple test with available service account."""
    print("*** Test Vertex AI with Available Service Account ***")
    print("=" * 60)

    # Find service account file
    service_account_file = find_service_account_file()

    if not service_account_file:
        print("[ERROR] No service account JSON files found in geminiJson/")
        return False

    print(f"[INFO] Using service account file: {service_account_file}")

    # Configuration
    PROJECT_ID = "carbide-team-478005-f8"
    LOCATION = "us-central1"

    try:
        # Initialize authenticator
        auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)

        # Check if file is valid
        try:
            key_data = auth.load_service_account_key(service_account_file)
            print(f"[OK] Service account loaded")
            print(f"[INFO] Project ID: {key_data.get('project_id', 'unknown')}")
            print(f"[INFO] Client Email: {key_data.get('client_email', 'unknown')}")

            # Check private key format
            private_key = key_data.get('private_key', '')
            if '[REPLACE_WITH_YOUR_FULL_PRIVATE_KEY]' in private_key:
                print(f"[ERROR] This is a template file - private key needs to be replaced")
                print(f"[ERROR] Please get your real service account JSON from Google Cloud Console")
                return False

        except Exception as e:
            print(f"[ERROR] Failed to load service account: {e}")
            return False

        # Get access token
        print(f"\n[AUTH] Getting access token...")
        scopes = ['https://www.googleapis.com/auth/cloud-platform']

        try:
            token_info = auth.get_access_token(service_account_file, scopes=scopes)
            token = token_info['access_token']
            print(f"[OK] Token obtained: {token[:50]}...")
        except Exception as e:
            print(f"[ERROR] Failed to get access token: {e}")
            print(f"[HINT] This usually means the private key is invalid or incomplete")
            return False

        # Test Vertex AI API call
        print(f"\n[TEST] Testing Vertex AI API call...")

        url = f"https://{LOCATION}-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{LOCATION}/publishers/google/models/gemini-3-pro-preview:generateContent"

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        payload = {
            "contents": [{
                "role": "user",
                "parts": [{
                    "text": "Hello! Please respond with 'API test successful' if you can see this message."
                }]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 100
            }
        }

        print(f"[REQUEST] Making API call to Vertex AI...")
        print(f"[URL] {url}")

        response = requests.post(url, headers=headers, json=payload, timeout=30)

        print(f"[RESPONSE] Status Code: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            print(f"[SUCCESS] Vertex AI API call successful!")

            if 'candidates' in result and result['candidates']:
                candidate = result['candidates'][0]
                if 'content' in candidate and 'parts' in candidate['content']:
                    generated_text = candidate['content']['parts'][0]['text']
                    print(f"\n[AI RESPONSE]:")
                    print("=" * 30)
                    print(generated_text)

            return True

        else:
            print(f"[ERROR] API call failed: {response.status_code}")
            print(f"[ERROR] Response: {response.text}")

            # Analyze common errors
            if response.status_code == 403:
                print(f"\n[ANALYSIS] 403 Forbidden - Possible causes:")
                print(f"- Service account doesn't have Vertex AI permissions")
                print(f"- Vertex AI API is not enabled in your project")
                print(f"- Wrong project ID or location")

            elif response.status_code == 401:
                print(f"\n[ANALYSIS] 401 Unauthorized - Possible causes:")
                print(f"- Invalid or expired access token")
                print(f"- Incorrect service account credentials")

            return False

    except Exception as e:
        print(f"[ERROR] Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_vertex_ai_simple()

    if success:
        print(f"\n[SUCCESS] Vertex AI test completed successfully!")
        print(f"\n[NEXT] You can now use the full vertex_ai_gemini_client.py script")
    else:
        print(f"\n[FAILED] Test failed")
        print(f"\n[TROUBLESHOOTING]:")
        print(f"1. Ensure you have a valid service account JSON file")
        print(f"2. The private key must be complete and untruncated")
        print(f"3. Enable Vertex AI API in Google Cloud Console")
        print(f"4. Grant your service account Vertex AI permissions")
        print(f"5. Verify your project ID is correct")

    exit(0 if success else 1)