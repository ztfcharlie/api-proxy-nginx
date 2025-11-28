"""
Test script for Gemini Embedding API with persistent JWT caching.
"""

import json
from gemini_client import GeminiClient, create_gemini_client, quick_embed
from google_auth import GoogleAuthenticator


def test_jwt_caching():
    """Test JWT persistent caching functionality."""
    print("=== Testing JWT Persistent Caching ===")

    try:
        # Initialize authenticator with persistent cache enabled
        auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)
        print("✅ GoogleAuthenticator initialized with persistent caching")

        # Get list of available keys
        available_keys = auth.get_available_keys()
        print(f"Available keys: {available_keys}")

        if available_keys:
            key_file = available_keys[0]
            print(f"\nTesting with key file: {key_file}")

            # Get access token (will be cached)
            print("\n--- First token request (should hit API) ---")
            token_info1 = auth.get_access_token(key_file, use_cache=True)
            print(f"✅ First token obtained")
            print(f"Token length: {len(token_info1['access_token'])}")
            print(f"Expires at: {token_info1.get('expires_at', 'N/A')}")

            # Get access token again (should use cache)
            print("\n--- Second token request (should use cache) ---")
            token_info2 = auth.get_access_token(key_file, use_cache=True)
            print(f"✅ Second token obtained from cache")
            print(f"Same token as first: {token_info1['access_token'] == token_info2['access_token']}")

            # Test cache info
            cached_tokens = auth.get_cached_tokens_list()
            print(f"\n--- Cache Information ---")
            print(f"Total cached tokens: {len(cached_tokens)}")
            for token in cached_tokens:
                print(f"  - Key: {token.get('key_filename', 'N/A')}")
                print(f"    Valid: {token.get('is_valid', 'N/A')}")
                print(f"    Expires in minutes: {token.get('expires_in_minutes', 'N/A')}")

        return True

    except Exception as e:
        print(f"❌ Error in JWT caching test: {e}")
        return False


def test_gemini_client():
    """Test Gemini client functionality."""
    print("\n=== Testing Gemini Client ===")

    try:
        # Initialize client
        client = create_gemini_client("service-account.json")
        print("✅ Gemini client created successfully")

        # Test connection
        test_results = client.test_connection()
        print(f"✅ Connection test:")
        print(f"  Success: {test_results['success']}")
        print(f"  Token valid: {test_results['token_valid']}")
        print(f"  API reachable: {test_results['api_reachable']}")

        if not test_results['success']:
            print("❌ Connection test failed, skipping embedding tests")
            return False

        return True

    except Exception as e:
        print(f"❌ Error in Gemini client test: {e}")
        return False


def test_embedding_generation():
    """Test embedding generation with the same text as the curl example."""
    print("\n=== Testing Embedding Generation ===")

    try:
        # Initialize client
        client = create_gemini_client("service-account.json")
        print("✅ Gemini client ready for embedding generation")

        # Test text from curl example
        test_text = "What is the meaning of life?"
        print(f"\nGenerating embedding for: '{test_text}'")

        # Generate embedding
        embedding_values = client.get_embedding_values(test_text)
        print(f"✅ Embedding generated successfully!")
        print(f"  Dimensions: {len(embedding_values)}")
        print(f"  First 10 values: {embedding_values[:10]}")
        print(f"  Last 5 values: {embedding_values[-5:]}")

        # Test full API response
        print(f"\n--- Full API Response ---")
        embedding_response = client.embed_content(test_text)
        print(f"Response keys: {list(embedding_response.keys())}")

        if 'embedding' in embedding_response:
            embedding = embedding_response['embedding']
            print(f"Embedding object keys: {list(embedding.keys())}")
            print(f"Embedding dimensions: {embedding.get('dimensions', 'N/A')}")
            print(f"Embedding values count: {len(embedding.get('values', []))}")

        return True

    except Exception as e:
        print(f"❌ Error in embedding generation test: {e}")
        return False


def test_batch_embeddings():
    """Test batch embedding generation."""
    print("\n=== Testing Batch Embeddings ===")

    try:
        # Initialize client
        client = create_gemini_client("service-account.json")
        print("✅ Gemini client ready for batch embeddings")

        # Test texts
        test_texts = [
            "What is the meaning of life?",
            "How does machine learning work?",
            "Explain quantum computing in simple terms.",
            "What are the benefits of renewable energy?"
        ]

        print(f"\nGenerating embeddings for {len(test_texts)} texts:")

        # Generate batch embeddings
        results = client.batch_embed_content(test_texts, batch_size=2)
        print(f"✅ Batch embedding processing completed!")

        successful = [r for r in results if r['success']]
        failed = [r for r in results if not r['success']]

        print(f"  Successful embeddings: {len(successful)}")
        print(f"  Failed embeddings: {len(failed)}")

        if successful:
            print(f"  First successful embedding dimensions: {len(successful[0]['embedding']['embedding']['values'])}")

        if failed:
            print(f"  First error: {failed[0]['error']}")

        return len(failed) == 0

    except Exception as e:
        print(f"❌ Error in batch embeddings test: {e}")
        return False


def test_convenience_functions():
    """Test convenience functions."""
    print("\n=== Testing Convenience Functions ===")

    try:
        # Test quick_embed function
        test_text = "Test quick embedding function"
        print(f"Testing quick_embed with: '{test_text}'")

        embedding = quick_embed(test_text, "service-account.json")
        print(f"✅ Quick embedding generated!")
        print(f"  Dimensions: {len(embedding)}")
        print(f"  First 5 values: {embedding[:5]}")

        return True

    except Exception as e:
        print(f"❌ Error in convenience functions test: {e}")
        return False


def test_cache_management():
    """Test cache management functionality."""
    print("\n=== Testing Cache Management ===")

    try:
        # Initialize client
        client = create_gemini_client("service-account.json")
        print("✅ Gemini client ready for cache testing")

        # Get initial cache info
        cache_info = client.get_cache_info()
        print(f"Initial cache info:")
        print(f"  Total tokens: {cache_info['total_cached_tokens']}")
        print(f"  Valid tokens: {cache_info['valid_tokens']}")
        print(f"  Expired tokens: {cache_info['expired_tokens']}")
        print(f"  Persistent cache enabled: {cache_info['persistent_cache_enabled']}")

        # Generate an embedding to ensure caching
        client.get_embedding_values("Test for caching")

        # Get updated cache info
        updated_cache_info = client.get_cache_info()
        print(f"\nAfter embedding generation:")
        print(f"  Total tokens: {updated_cache_info['total_cached_tokens']}")
        print(f"  Valid tokens: {updated_cache_info['valid_tokens']}")

        # Test cache clearing (memory only)
        client.clear_cache(clear_persistent=False)
        print(f"\n✅ Memory cache cleared")

        # Test cache clearing (including persistent)
        client.clear_cache(clear_persistent=True)
        print(f"✅ Persistent cache cleared")

        return True

    except Exception as e:
        print(f"❌ Error in cache management test: {e}")
        return False


def test_api_equivalent():
    """Test equivalent to the provided curl command."""
    print("\n=== Testing API Equivalent to curl ===")

    try:
        # Initialize client
        client = create_gemini_client("service-account.json")

        # Replicate the exact curl request
        payload = {
            "model": "models/gemini-embedding-001",
            "content": {
                "parts": [{"text": "What is the meaning of life?"}]
            }
        }

        print("Making API request equivalent to:")
        print('curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent" \\')
        print('-H "x-goog-api-key: $GEMINI_API_KEY" \\')
        print('-H \'Content-Type: application/json\' \\')
        print('-d \'{"model": "models/gemini-embedding-001",')
        print('     "content": {"parts":[{"text": "What is the meaning of life?"}]}')
        print('    }\'')

        # Make the request
        headers = client.get_auth_headers()
        response = client.embed_content("What is the meaning of life?")

        print(f"\n✅ API request successful!")
        print(f"Response structure:")
        print(json.dumps(response, indent=2))

        return True

    except Exception as e:
        print(f"❌ Error in API equivalent test: {e}")
        return False


def main():
    """Run all tests for Gemini embedding functionality."""
    print("🧪 Gemini Embedding API with JWT Caching Tests")
    print("=" * 60)

    tests = [
        ("JWT Persistent Caching", test_jwt_caching),
        ("Gemini Client", test_gemini_client),
        ("Embedding Generation", test_embedding_generation),
        ("Batch Embeddings", test_batch_embeddings),
        ("Convenience Functions", test_convenience_functions),
        ("Cache Management", test_cache_management),
        ("API Equivalent to curl", test_api_equivalent)
    ]

    results = []
    for test_name, test_func in tests:
        print(f"\n--- {test_name} ---")
        try:
            result = test_func()
            results.append((test_name, result))
            status = "✅ PASSED" if result else "❌ FAILED"
            print(f"{test_name}: {status}")
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {e}")
            results.append((test_name, False))

    print("\n" + "=" * 60)
    print("Test Results Summary:")
    passed = 0
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"  {test_name}: {status}")
        if result:
            passed += 1

    total = len(results)
    print(f"\nOverall: {passed}/{total} tests passed")

    if passed == total:
        print("\n🎉 All tests passed! The Gemini Embedding API with JWT caching is working perfectly!")
        print("\n📝 Usage Examples:")
        print("# 1. Simple embedding generation:")
        print("from gemini_client import quick_embed")
        print("embedding = quick_embed('Your text here', 'service-account.json')")
        print("")
        print("# 2. Batch embeddings:")
        print("from gemini_client import create_gemini_client")
        print("client = create_gemini_client('service-account.json')")
        print("results = client.batch_embed_content(['text1', 'text2', 'text3'])")
        print("")
        print("# 3. With persistent JWT caching:")
        print("# Tokens are automatically cached to files in geminiJson/.cache/")
        print("# Subsequent runs use cached tokens until expiration")
    else:
        print("\n⚠️  Some tests failed. Check the error messages above.")
        print("\n🔧 Troubleshooting:")
        print("1. Ensure your Google service account JSON key is in 'geminiJson/' directory")
        print("2. Make sure the service account has Gemini API permissions")
        print("3. Check network connectivity to Google APIs")
        print("4. Verify the key filename in the examples matches your actual file")

    return passed == total


if __name__ == "__main__":
    try:
        success = main()
        exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nTests interrupted by user.")
        exit(1)
    except Exception as e:
        print(f"\n\nUnexpected error during testing: {e}")
        exit(1)