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
    print("🌟 Gemini 3-pro-preview Text Generation with Native API")
    print("=" * 70)

    try:
        # Initialize authenticator
        auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)
        print("✅ Google authenticator initialized")

        # Get JWT token
        token = auth.get_token("service-account.json")
        print(f"✅ JWT token obtained: {token[:50]}...")

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

        print(f"\n📝 Original curl command equivalent:")
        print('curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent" \\')
        print('  -H "Authorization: Bearer $JWT_TOKEN" \\')
        print('  -H "Content-Type: application/json" \\')
        print('  -X POST \\')
        print('  -d \'{"contents":[{"parts":[{"text":"How does AI work?"}]}],"generationConfig":{"thinkingConfig":{"thinkingLevel":"low"}}}\'')

        print(f"\n🔍 DEBUG: Request Details")
        print("=" * 50)
        print(f"🌐 API URL: {api_url}")
        print(f"📋 Request Headers:")
        for key, value in headers.items():
            if key == "Authorization":
                print(f"  {key}: Bearer {value[7:57]}...")  # Show first 50 chars of token
            else:
                print(f"  {key}: {value}")

        print(f"\n📦 Request Payload (JSON):")
        payload_json = json.dumps(payload, indent=2, ensure_ascii=False)
        print(payload_json)

        print(f"\n📏 Payload size: {len(payload_json)} bytes")

        # Make the API request
        print(f"\n🚀 Making API request...")
        start_time = time.time()

        try:
            response = requests.post(
                api_url,
                headers=headers,
                json=payload,
                timeout=30
            )

            request_time = time.time() - start_time
            print(f"⏱️ Request completed in {request_time:.2f} seconds")

            print(f"\n📊 Response Details:")
            print("=" * 50)
            print(f"🔢 Status Code: {response.status_code}")
            print(f"📋 Response Headers:")
            for key, value in response.headers.items():
                print(f"  {key}: {value}")

            print(f"\n📦 Response Content:")
            if response.status_code == 200:
                try:
                    response_json = response.json()
                    print("✅ JSON Response:")
                    print(json.dumps(response_json, indent=2, ensure_ascii=False))

                    # Extract and display the generated text
                    if 'candidates' in response_json and response_json['candidates']:
                        candidate = response_json['candidates'][0]
                        if 'content' in candidate and 'parts' in candidate['content']:
                            generated_text = candidate['content']['parts'][0]['text']
                            print(f"\n🤖 Generated Text:")
                            print("=" * 50)
                            print(generated_text)

                            # Check for thinking content if available
                            if 'thinking' in candidate:
                                print(f"\n🧠 Thinking Process:")
                                print("=" * 50)
                                print(candidate['thinking'])

                    return True

                except json.JSONDecodeError as e:
                    print(f"❌ Failed to parse JSON response: {e}")
                    print(f"Raw response: {response.text}")
                    return False
            else:
                print(f"❌ API request failed with status {response.status_code}")
                print(f"Response text: {response.text}")
                return False

        except requests.exceptions.RequestException as e:
            print(f"❌ Request failed: {e}")
            return False

    except Exception as e:
        print(f"❌ Error in generate_text_with_native_api: {e}")
        import traceback
        traceback.print_exc()
        return False


def demonstrate_multiple_prompts():
    """Demonstrate multiple text generation scenarios with Gemini 3-pro-preview."""
    print("\n🎨 Multiple Text Generation Examples with Gemini 3-pro-preview")
    print("=" * 70)

    # Initialize authenticator once for all requests
    try:
        auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)
        token = auth.get_token("service-account.json")
        print(f"✅ Authentication ready for multiple requests")
    except Exception as e:
        print(f"❌ Authentication failed: {e}")
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

            print(f"\n🔍 Request {i} Details:")
            print(f"  URL: {api_url}")
            print(f"  Payload: {json.dumps(payload, indent=2)}")

            # Make request
            response = requests.post(api_url, headers=headers, json=payload, timeout=30)

            print(f"\n📊 Response {i}:")
            print(f"  Status: {response.status_code}")

            if response.status_code == 200:
                response_json = response.json()

                if 'candidates' in response_json and response_json['candidates']:
                    candidate = response_json['candidates'][0]
                    if 'content' in candidate and 'parts' in candidate['content']:
                        generated_text = candidate['content']['parts'][0]['text']
                        print(f"✅ Generated Text:")
                        print(f"  {generated_text[:200]}...")

                        # Show thinking if available
                        if 'thinking' in candidate:
                            thinking = candidate['thinking']
                            print(f"🧠 Thinking Process:")
                            print(f"  {thinking[:200]}...")

                        successful_requests += 1
                    else:
                        print(f"❌ No content in response")
                else:
                    print(f"❌ No candidates in response")
            else:
                print(f"❌ Request failed: {response.status_code} - {response.text}")

        except Exception as e:
            print(f"❌ Error in example {i}: {e}")

    return successful_requests



def main():
    """Main demonstration function."""
    print("🌟 Gemini 3-pro-preview Native API Demo with Request Debugging")
    print("=" * 80)
    print("This demo shows native API calls to Gemini 3-pro-preview with detailed")
    print("request/response debugging to help identify any issues.")
    print("\n📋 Features demonstrated:")
    print("1. ✅ Native API calls to Gemini 3-pro-preview")
    print("2. 🔍 Detailed request headers and payload debugging")
    print("3. 📊 Complete response analysis")
    print("4. 🧠 ThinkingConfig with low thinking level")
    print("5. 🛡️ Comprehensive error handling")

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
            status = "✅ SUCCESS" if result else "❌ FAILED"
            print(f"\n{demo_name}: {status}")
        except Exception as e:
            print(f"❌ {demo_name}: {e}")
            import traceback
            traceback.print_exc()
            results.append((demo_name, False))

    print("\n" + "=" * 80)
    print("📊 DEMO RESULTS SUMMARY:")
    passed = 0
    for demo_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"  {demo_name}: {status}")
        if result:
            passed += 1

    total = len(demonstrations)
    print(f"\n🎉 Overall: {passed}/{total} demos completed successfully!")

    if passed == total:
        print("\n🚀 USAGE EXAMPLES:")
        print("\n# Native Gemini 3-pro-preview API call:")
        print("import requests")
        print("from google_auth import GoogleAuthenticator")
        print("")
        print("# Get JWT token")
        print('auth = GoogleAuthenticator("geminiJson")')
        print('token = auth.get_token("service-account.json")')
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
        print("\n⚠️  Some demos failed. Check the error messages above.")
        print("\n🔧 TROUBLESHOOTING:")
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
        print("\n\n👋 Demo interrupted by user.")
        exit(1)
    except Exception as e:
        print(f"\n\n❌ Unexpected error during demo: {e}")
        exit(1)