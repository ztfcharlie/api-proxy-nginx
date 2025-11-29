#!/usr/bin/env python3
"""
Test Gemini 3-pro-preview API using cached token directly
"""

import json
import time
import requests
from pathlib import Path

def test_with_cached_token():
    """Test API using the cached token directly."""
    print("*** Testing Gemini 3-pro-preview with Cached Token ***")
    print("=" * 60)

    # Read cached token
    cache_dir = Path("geminiJson/.cache")
    cache_files = list(cache_dir.glob("token_*.json"))

    if not cache_files:
        print("[ERROR] No cached token files found")
        return False

    cache_file = cache_files[0]
    print(f"[INFO] Using cached token file: {cache_file.name}")

    try:
        with open(cache_file, 'r') as f:
            token_data = json.load(f)

        # Check if token is still valid
        expires_at = token_data.get('expires_at', 0)
        current_time = time.time()

        if expires_at <= current_time:
            print(f"[WARNING] Token expired at {expires_at}, current time: {current_time}")
            print("[WARNING] Token may not work, but let's try anyway...")
        else:
            remaining_time = int((expires_at - current_time) / 60)
            print(f"[OK] Token is valid for {remaining_time} more minutes")

        token = token_data['access_token']
        print(f"[OK] Token loaded: {token[:50]}...")

        # API endpoint for Gemini 3-pro-preview
        api_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent"

        # Prepare request headers
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "Python-Gemini-Client/1.0"
        }

        # Prepare request payload matching your curl command
        payload = {
            "contents": [{
                "parts": [{"text": "How does AI work?"}]
            }],
            "generationConfig": {
                "thinkingConfig": {
                    "thinkingLevel": "low"
                }
            }
        }

        print(f"\n[CURL] Original curl command equivalent:")
        print('curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent" \\')
        print('  -H "Authorization: Bearer $JWT_TOKEN" \\')
        print('  -H "Content-Type: application/json" \\')
        print('  -X POST \\')
        print('  -d \'{"contents":[{"parts":[{"text":"How does AI work?"}]}],"generationConfig":{"thinkingConfig":{"thinkingLevel":"low"}}}\'')

        print(f"\n[DEBUG] Request Details")
        print("=" * 50)
        print(f"[URL] API URL: {api_url}")
        print(f"[HEADERS] Request Headers:")
        for key, value in headers.items():
            if key == "Authorization":
                print(f"  {key}: Bearer {value[7:57]}...")  # Show first 50 chars of token
            else:
                print(f"  {key}: {value}")

        print(f"\n[PAYLOAD] Request Payload (JSON):")
        payload_json = json.dumps(payload, indent=2, ensure_ascii=False)
        print(payload_json)

        print(f"\n[SIZE] Payload size: {len(payload_json)} bytes")

        # Make the API request
        print(f"\n[REQUEST] Making API request...")
        start_time = time.time()

        try:
            response = requests.post(
                api_url,
                headers=headers,
                json=payload,
                timeout=30
            )

            request_time = time.time() - start_time
            print(f"[TIME] Request completed in {request_time:.2f} seconds")

            print(f"\n[RESPONSE] Response Details:")
            print("=" * 50)
            print(f"[STATUS] Status Code: {response.status_code}")
            print(f"[HEADERS] Response Headers:")
            for key, value in response.headers.items():
                print(f"  {key}: {value}")

            print(f"\n[CONTENT] Response Content:")
            if response.status_code == 200:
                try:
                    response_json = response.json()
                    print("[OK] JSON Response:")
                    print(json.dumps(response_json, indent=2, ensure_ascii=False))

                    # Extract and display the generated text
                    if 'candidates' in response_json and response_json['candidates']:
                        candidate = response_json['candidates'][0]
                        if 'content' in candidate and 'parts' in candidate['content']:
                            generated_text = candidate['content']['parts'][0]['text']
                            print(f"\n[AI] Generated Text:")
                            print("=" * 50)
                            print(generated_text)

                            # Check for thinking content if available
                            if 'thinking' in candidate:
                                print(f"\n[THINKING] Thinking Process:")
                                print("=" * 50)
                                print(candidate['thinking'])

                    return True

                except json.JSONDecodeError as e:
                    print(f"[ERROR] Failed to parse JSON response: {e}")
                    print(f"Raw response: {response.text}")
                    return False
            else:
                print(f"[ERROR] API request failed with status {response.status_code}")
                print(f"Response text: {response.text}")
                return False

        except requests.exceptions.RequestException as e:
            print(f"[ERROR] Request failed: {e}")
            return False

    except Exception as e:
        print(f"[ERROR] Error reading cached token: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_with_cached_token()
    if success:
        print("\n[SUCCESS] Test completed successfully!")
    else:
        print("\n[FAILED] Test failed!")
    exit(0 if success else 1)