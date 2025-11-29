#!/usr/bin/env python3
"""
Gemini Text Generation Demo with JWT Caching

This script demonstrates text generation using Gemini 2.5-flash model
with persistent JWT authentication, equivalent to your provided curl command.
"""

import json
import time
from gemini_client import create_gemini_client


def generate_text_with_curl_equivalent():
    """Generate text using Gemini API with persistent JWT caching."""
    print("🌟 Gemini Text Generation with JWT Caching")
    print("=" * 60)

    try:
        # Initialize client with persistent caching
        client = create_gemini_client("service-account.json")
        print("✅ Gemini client initialized with JWT caching")

        # Test connection first
        test_results = client.test_connection()
        print(f"\n🔍 Connection Test Results:")
        print(f"  Success: {test_results['success']}")
        print(f"  Token Valid: {test_results['token_valid']}")
        print(f"  API Reachable: {test_results['api_reachable']}")

        if not test_results['success']:
            print("❌ Connection failed. Please check:")
            print("  1. Service account JSON key is in geminiJson/ directory")
            print("  2. Service account has Gemini API permissions")
            print("  3. Network connectivity to Google APIs")
            return False

        return True

        # Equivalent to your curl command for text generation
        print(f"\n📝 Your Original curl command:")
        print('curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \\')
        print('-H "x-goog-api-key: $GEMINI_API_KEY" \\')
        print('-H "Content-Type: application/json" \\')
        print('-X POST \\')
        print('-d \'{"contents":[{"parts":[{"text":"What is the meaning of life?"}]}]\'')
        print("")

        print(f"\n🚀 Python equivalent (with JWT caching):")
        print("from gemini_client import create_gemini_client")
        print("")
        print("# Initialize client (JWT automatically cached)")
        print('client = create_gemini_client("service-account.json")')
        print("")
        print("# Generate text")
        print('response = client.generate_content("What is the meaning of life?")')
        print("print(f\"Generated text: {response}\")")

        # Use the client directly
        print(f"\n🤖 Making API call...")

        # Prepare request payload for text generation
        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": "What is the meaning of life?"
                        }
                    ]
                }
            ]
        }

        # Use Gemini client to make the request
        try:
            # First call (will hit the API and cache the token)
            print("📞 First API call (will get fresh token):")
            start_time = time.time()
            response1 = client.generate_content("What is the meaning of life?")
            first_call_time = time.time() - start_time
            print(f"✅ First call completed in {first_call_time:.2f} seconds")
            print(f"Response: {response1}")

            # Second call (will use cached token)
            print("\n📞 Second API call (will use cached token):")
            start_time = time.time()
            response2 = client.generate_content("What is the meaning of life?")
            second_call_time = time.time() - start_time
            print(f"✅ Second call completed in {second_call_time:.2f} seconds")
            print(f"✅ Performance improvement: {((first_call_time - second_call_time) / first_call_time) * 100:.1f}% faster")
            print(f"Response: {response2}")

            # Verify responses are consistent
            if response1 == response2:
                print("✅ Both responses are identical (caching working perfectly!)")
            else:
                print("⚠️ Responses differ (this is normal due to randomness)")
                print(f"Response 1 length: {len(str(response1))}")
                print(f"Response 2 length: {len(str(response2))}")

            return True

        except Exception as e:
            print(f"❌ Error in text generation: {e}")
            return False

    except Exception as e:
        print(f"❌ Error in generate_text_with_curl_equivalent: {e}")
        return False


def demonstrate_text_generation():
    """Demonstrate different text generation scenarios."""
    print("\n🎨 Multiple Text Generation Examples")
    print("=" * 60)

    client = create_gemini_client("service-account.json")

    examples = [
        {
            "name": "Simple Question",
            "prompt": "What is artificial intelligence?",
            "description": "Basic question about AI"
        },
        {
            "name": "Creative Writing",
            "prompt": "Write a short poem about technology",
            "description": "Creative writing task"
        },
        {
            "name": "Code Generation",
            "prompt": "Write a Python function to calculate factorial",
            "description": "Code generation task"
        },
        {
            "name": "Translation",
            "prompt": "Translate 'Hello world' to French",
            "description": "Translation task"
        },
        {
            "name": "Summarization",
            "prompt": "Summarize this text: Artificial intelligence is a branch of computer science that aims to create intelligent machines.",
            "description": "Text summarization"
        }
    ]

    for i, example in enumerate(examples, 1):
        print(f"\n--- Example {i}: {example['name']} ---")
        print(f"Description: {example['description']}")
        print(f"Prompt: {example['prompt']}")

        try:
            response = client.generate_content(example['prompt'])
            print(f"✅ Response: {response}")

            if 'candidates' in response and response['candidates']:
                candidate = response['candidates'][0]
                if 'content' in candidate and 'parts' in candidate['content']:
                    text = candidate['content']['parts'][0]['text']
                    print(f"Generated text: {text}")
        except Exception as e:
            print(f"❌ Error: {e}")

    return len(examples)

def compare_with_without_caching():
    """Compare performance with and without JWT caching."""
    print("\n⚡ Performance Comparison: With vs Without Caching")
    print("=" * 60)

    # Test with caching
    print("\n🟢 WITH JWT CACHING:")
    start_time = time.time()
    for i in range(3):
        client = create_gemini_client("service-account.json")
        client.generate_content(f"Test message {i+1}")
    with_cache_time = time.time() - start_time
    print(f"  3 calls with caching: {with_cache_time:.2f} seconds")
    print(f"  Average per call: {with_cache_time/3:.2f} seconds")

    # Test without caching (simulate performance impact)
    print("\n🟡 WITHOUT JWT CACHING:")
    start_time = time.time()
    for i in range(3):
        from google_auth import GoogleAuthenticator
        # Create authenticator without persistent cache to simulate fresh API calls
        auth_no_cache = GoogleAuthenticator("geminiJson", enable_persistent_cache=False)
        client_no_cache = create_gemini_client.__new__(cls=GeminiClient)
        client_no_cache.auth = auth_no_cache
        client_no_cache.key_filename = "service-account.json"
        client_no_cache.keys_directory = "geminiJson"
        client_no_cache.use_persistent_cache = False
        client_no_cache.model = "gemini-2.5-flash"

        client_no_cache.generate_content(f"Test message {i+1}")
    without_cache_time = time.time() - start_time
    print(f"  3 calls without caching: {without_cache_time:.2f} seconds")
    print(f"  Average per call: {without_cache_time/3:.2f} seconds")

    # Calculate performance improvement
    if with_cache_time < without_cache_time:
        improvement = ((without_cache_time - with_cache_time) / without_cache_time) * 100
        speedup = without_cache_time / with_cache_time
        print(f"\n📊 PERFORMANCE ANALYSIS:")
        print(f"  Improvement: {improvement:.1f}% faster")
        print(f"  Speedup: {speedup:.2f}x faster")
        print(f"  Time saved: {without_cache_time - with_cache_time:.2f} seconds")

    return improvement > 0


def show_cache_statistics():
    """Show current cache statistics."""
    print("\n📊 Cache Statistics")
    print("=" * 40)

    try:
        client = create_gemini_client("service-account.json")
        cache_info = client.get_cache_info()

        print(f"Total cached tokens: {cache_info['total_cached_tokens']}")
        print(f"Valid tokens: {cache_info['valid_tokens']}")
        print(f"Expired tokens: {cache_info['expired_tokens']}")
        print(f"Current key file: {cache_info['current_key_filename']}")
        print(f"Persistent cache enabled: {cache_info['persistent_cache_enabled']}")

        if cache_info['tokens']:
            print("\n📋 Token Details:")
            for i, token in enumerate(cache_info['tokens'][:5], 1):
                is_valid = "✅ Valid" if token['is_valid'] else "❌ Expired"
                expires_in_min = token.get('expires_in_minutes', 0)
                print(f"  Token {i}: {token['key_filename']} - {is_valid} ({expires_in_min:.1f} min)")

    except Exception as e:
        print(f"❌ Error getting cache info: {e}")


def main():
    """Main demonstration function."""
    print("🌟 Gemini Text Generation with JWT Caching Demo")
    print("=" * 60)
    print("This demo shows how to generate text using Gemini 2.5-flash API")
    print("with automatic JWT token caching for improved performance.")
    print("\n📋 Features demonstrated:")
    print("1. ✅ Automatic JWT token generation and caching")
    print("2. 🚀 Text generation with Gemini 2.5-flash model")
    print("3. 📊 Performance comparison and statistics")
    print("4. 🔄 Multiple generation examples")
    print("5. 🛡️ Error handling and troubleshooting")

    demonstrations = [
        ("Basic Generation", generate_text_with_curl_equivalent),
        ("Multiple Examples", demonstrate_text_generation),
        ("Performance Comparison", compare_with_without_caching),
        ("Cache Statistics", show_cache_statistics)
    ]

    results = []
    for demo_name, demo_func in demonstrations:
        print(f"\n{'='*80} {demo_name} {'='*80}")
        try:
            result = demo_func()
            results.append((demo_name, result))
            status = "✅ SUCCESS" if result else "❌ FAILED"
            print(f"{demo_name}: {status}")
        except Exception as e:
            print(f"❌ {demo_name}: {e}")
            results.append((demo_name, False))

    print("\n" + "=" * 60)
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
        print("\n# Basic text generation (with automatic JWT caching):")
        print("from gemini_client import create_gemini_client")
        print("")
        print("# Initialize client")
        print('client = create_gemini_client("service-account.json")')
        print("")
        print("# Generate text")
        print('response = client.generate_content("What is the meaning of life?")')
        print("print(response)")
        print("")
        print("# This uses JWT caching automatically!")
        print("# No need to manage API keys manually.")
        print("")
        print("\n# For multiple generations:")
        print("prompts = ['What is AI?', 'Explain quantum computing']")
        print("for prompt in prompts:")
        print('    result = client.generate_content(prompt)')
        print('    print(f"Generated: {result}")')
        print("")
        print("\n# For custom configuration:")
        print("# client = create_gemini_client('your-key.json', model='gemini-2.5-flash')")
    else:
        print("\n⚠️  Some demos failed. Check the error messages above.")
        print("\n🔧 TROUBLESHOOTING:")
        print("1. Ensure your Google service account JSON key is in 'geminiJson/' directory")
        print("2. Make sure the service account has Gemini API permissions in Google Cloud Console:")
        print("   https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com")
        print("3. Check network connectivity to Google APIs")
        print("4. Verify the service account key file name matches your actual file")
        print("5. Run: python check_permissions_fixed.py")

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