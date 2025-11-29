#!/usr/bin/env python3
"""
Test Gemini 3-pro-preview API using API Key (correct method)
"""

import json
import requests
import os

def test_with_api_key():
    """Test API using API Key instead of JWT token."""
    print("*** Gemini 3-pro-preview API Key Test (Correct Method) ***")
    print("=" * 70)

    # You need to get your Gemini API Key from Google AI Studio
    # https://aistudio.google.com/app/apikey

    # Check for API key in environment variable
    api_key = os.getenv('GEMINI_API_KEY')

    if not api_key:
        print("[ERROR] GEMINI_API_KEY environment variable not set")
        print("[INFO] Please get your API key from: https://aistudio.google.com/app/apikey")
        print("[INFO] Then set it: export GEMINI_API_KEY='your-api-key-here'")
        return False

    print(f"[OK] API Key found: {api_key[:20]}...")

    # API endpoint for Gemini 3-pro-preview
    api_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent"

    # Prepare request headers - CORRECT METHOD
    headers = {
        "x-goog-api-key": api_key,  # This is the correct header!
        "Content-Type": "application/json"
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

    print(f"\n[CURL] Correct curl command:")
    print('curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent" \\')
    print('  -H "x-goog-api-key: $GEMINI_API_KEY" \\')
    print('  -H "Content-Type: application/json" \\')
    print('  -X POST \\')
    print('  -d \'{"contents":[{"parts":[{"text":"How does AI work?"}]}],"generationConfig":{"thinkingConfig":{"thinkingLevel":"low"}}}\'')

    print(f"\n[DEBUG] Request Details")
    print("=" * 50)
    print(f"[URL] API URL: {api_url}")
    print(f"[HEADERS] Request Headers:")
    for key, value in headers.items():
        if key == "x-goog-api-key":
            print(f"  {key}: {value[:20]}...")  # Show first 20 chars of API key
        else:
            print(f"  {key}: {value}")

    print(f"\n[PAYLOAD] Request Payload (JSON):")
    payload_json = json.dumps(payload, indent=2, ensure_ascii=False)
    print(payload_json)

    print(f"\n[SIZE] Payload size: {len(payload_json)} bytes")

    # Make the API request
    print(f"\n[REQUEST] Making API request...")

    try:
        response = requests.post(
            api_url,
            headers=headers,
            json=payload,
            timeout=30
        )

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

def show_setup_instructions():
    """Show instructions for getting API key."""
    print("\n" + "=" * 70)
    print("[SETUP] How to get your Gemini API Key:")
    print("=" * 70)
    print("1. Go to Google AI Studio: https://aistudio.google.com/app/apikey")
    print("2. Sign in with your Google account")
    print("3. Click 'Create API Key'")
    print("4. Copy the generated API key")
    print("5. Set environment variable:")
    print("   Linux/Mac: export GEMINI_API_KEY='your-api-key-here'")
    print("   Windows: set GEMINI_API_KEY=your-api-key-here")
    print("6. Run this script again")
    print("")
    print("[NOTE] This is different from service account JSON keys!")
    print("[NOTE] Gemini API uses simple API keys, not OAuth2 JWT tokens")

if __name__ == "__main__":
    success = test_with_api_key()

    if not success:
        show_setup_instructions()

    if success:
        print("\n[SUCCESS] Test completed successfully!")
        print("\n[CONCLUSION] Your suspicion was 100% correct!")
        print("- Gemini API uses 'x-goog-api-key' header, not 'Authorization: Bearer'")
        print("- JWT tokens are for Vertex AI, not Gemini API")
        print("- API keys are obtained from Google AI Studio, not service accounts")
    else:
        print("\n[FAILED] Test failed - need to set up API key")

    exit(0 if success else 1)