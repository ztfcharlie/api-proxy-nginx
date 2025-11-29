#!/usr/bin/env python3
"""
Gemini Text Generation Demo with JWT Caching

This script demonstrates text generation using Gemini 3-pro-preview model
with native API calls and request debugging output.
"""

import json
import time
import requests
import os
from google_auth import GoogleAuthenticator


def generate_text_with_native_api():
    """Generate text using native Gemini 3-pro-preview API with debugging output."""
    print("*** Gemini 3-pro-preview Text Generation with Native API ***")
    print("=" * 70)

    try:
        # Initialize authenticator
        auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)
        print("[OK] Google authenticator initialized")

        # Check available keys first
        available_keys = auth.get_available_keys()
        print(f"[INFO] Available service account keys: {available_keys}")

        if not available_keys:
            print("[ERROR] No service account JSON files found in geminiJson/ directory")
            return False

        # Use the real service account file, not the template
        if "service-account.json" in available_keys:
            key_filename = "service-account.json"
        else:
            key_filename = available_keys[0]
        print(f"[KEY] Using key file: {key_filename}")

        # Get JWT token
        token_info = auth.get_access_token(key_filename)
        token = token_info['access_token']
        print(f"[OK] JWT token obtained: {token[:50]}...")
        print(f"[OK] Token expires in: {token_info.get('expires_in', 'unknown')} seconds")
        print(f"[OK] Token type: {token_info.get('token_type', 'unknown')}")
        print(f"[OK] Cache key: {token_info.get('cache_key', 'unknown')}")

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
        print(f"[ERROR] Error in generate_text_with_native_api: {e}")
        import traceback
        traceback.print_exc()
        return False


def demonstrate_multiple_prompts():
    """Demonstrate multiple text generation scenarios with Gemini 3-pro-preview."""
    print("\n*** Multiple Text Generation Examples with Gemini 3-pro-preview ***")
    print("=" * 70)

    # Initialize authenticator once for all requests
    try:
        auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)

        # Check available keys
        available_keys = auth.get_available_keys()
        print(f"[INFO] Available keys: {available_keys}")

        if not available_keys:
            print("[ERROR] No service account JSON files found")
            return 0

        # Use the real service account file, not the template
        if "service-account.json" in available_keys:
            key_filename = "service-account.json"
        else:
            key_filename = available_keys[0]
        print(f"[KEY] Using key: {key_filename}")

        token_info = auth.get_access_token(key_filename)
        token = token_info['access_token']
        print(f"[OK] Authentication ready for multiple requests")
        print(f"[OK] Token expires in: {token_info.get('expires_in', 'unknown')} seconds")
    except Exception as e:
        print(f"[ERROR] Authentication failed: {e}")
        import traceback
        traceback.print_exc()
        return 0

    examples = [
        {
            "name": "AI Explanation",
            "prompt": "How does artificial intelligence work?",
            "description": "Technical explanation with thinking"
        },
        {
            "name": "Creative Writing",
            "prompt": "Write a short poem about the future of technology",
            "description": "Creative task with low thinking level"
        },
        {
            "name": "Problem Solving",
            "prompt": "Explain how to solve a Rubik's cube step by step",
            "description": "Complex problem solving"
        }
    ]

    successful_requests = 0

    for i, example in enumerate(examples, 1):
        print(f"\n{'='*20} Example {i}: {example['name']} {'='*20}")
        print(f"Description: {example['description']}")
        print(f"Prompt: {example['prompt']}")

        try:
            # API endpoint
            api_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent"

            # Headers
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }

            # Payload with thinking config
            payload = {
                "contents": [{
                    "parts": [{"text": example['prompt']}]
                }],
                "generationConfig": {
                    "thinkingConfig": {
                        "thinkingLevel": "low"
                    }
                }
            }

            print(f"\n[DEBUG] Request {i} Details:")
            print(f"  URL: {api_url}")
            print(f"  Payload: {json.dumps(payload, indent=2)}")

            # Make request
            response = requests.post(api_url, headers=headers, json=payload, timeout=30)

            print(f"\n[RESPONSE] Response {i}:")
            print(f"  Status: {response.status_code}")

            if response.status_code == 200:
                response_json = response.json()

                if 'candidates' in response_json and response_json['candidates']:
                    candidate = response_json['candidates'][0]
                    if 'content' in candidate and 'parts' in candidate['content']:
                        generated_text = candidate['content']['parts'][0]['text']
                        print(f"[OK] Generated Text:")
                        print(f"  {generated_text[:200]}...")

                        # Show thinking if available
                        if 'thinking' in candidate:
                            thinking = candidate['thinking']
                            print(f"[THINKING] Thinking Process:")
                            print(f"  {thinking[:200]}...")

                        successful_requests += 1
                    else:
                        print(f"[ERROR] No content in response")
                else:
                    print(f"[ERROR] No candidates in response")
            else:
                print(f"[ERROR] Request failed: {response.status_code} - {response.text}")

        except Exception as e:
            print(f"[ERROR] Error in example {i}: {e}")

    return successful_requests



def main():
    """Main demonstration function."""
    print("*** Gemini 3-pro-preview Native API Demo with Request Debugging ***")
    print("=" * 80)
    print("This demo shows native API calls to Gemini 3-pro-preview with detailed")
    print("request/response debugging to help identify any issues.")
    print("\n[FEATURES] Features demonstrated:")
    print("1. [OK] Native API calls to Gemini 3-pro-preview")
    print("2. [DEBUG] Detailed request headers and payload debugging")
    print("3. [ANALYSIS] Complete response analysis")
    print("4. [THINKING] ThinkingConfig with low thinking level")
    print("5. [ERROR] Comprehensive error handling")

    demonstrations = [
        ("Native API Call", generate_text_with_native_api),
        ("Multiple Prompts", demonstrate_multiple_prompts)
    ]

    results = []
    for demo_name, demo_func in demonstrations:
        print(f"\n{'='*30} {demo_name} {'='*30}")
        try:
            result = demo_func()
            results.append((demo_name, result))
            status = "[OK] SUCCESS" if result else "[ERROR] FAILED"
            print(f"\n{demo_name}: {status}")
        except Exception as e:
            print(f"[ERROR] {demo_name}: {e}")
            import traceback
            traceback.print_exc()
            results.append((demo_name, False))

    print("\n" + "=" * 80)
    print("[SUMMARY] DEMO RESULTS SUMMARY:")
    passed = 0
    for demo_name, result in results:
        status = "[OK] PASSED" if result else "[ERROR] FAILED"
        print(f"  {demo_name}: {status}")
        if result:
            passed += 1

    total = len(demonstrations)
    print(f"\n[RESULT] Overall: {passed}/{total} demos completed successfully!")

    if passed == total:
        print("\n[USAGE] USAGE EXAMPLES:")
        print("\n# Native Gemini 3-pro-preview API call:")
        print("import requests")
        print("from google_auth import GoogleAuthenticator")
        print("")
        print("# Get JWT token")
        print('auth = GoogleAuthenticator("geminiJson")')
        print('token_info = auth.get_access_token("service-account-aaa.json")')
        print('token = token_info["access_token"]')
        print("")
        print("# Make API request")
        print('url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent"')
        print('headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}')
        print('payload = {')
        print('    "contents": [{"parts": [{"text": "Your question here"}]}],')
        print('    "generationConfig": {"thinkingConfig": {"thinkingLevel": "low"}}')
        print('}')
        print('response = requests.post(url, headers=headers, json=payload)')
        print("")
        print("# This matches your curl command exactly!")
    else:
        print("\n[WARNING] Some demos failed. Check the error messages above.")
        print("\n[TROUBLESHOOTING] TROUBLESHOOTING:")
        print("1. Ensure your Google service account JSON key is in 'geminiJson/' directory")
        print("2. Make sure the service account has Gemini API permissions")
        print("3. Check that Gemini 3-pro-preview is available in your region")
        print("4. Verify network connectivity to Google APIs")
        print("5. Check the request debugging output for specific error details")

    return passed == total


if __name__ == "__main__":
    try:
        success = main()
        exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n[INTERRUPT] Demo interrupted by user.")
        exit(1)
    except Exception as e:
        print(f"\n\n[ERROR] Unexpected error during demo: {e}")
        exit(1)