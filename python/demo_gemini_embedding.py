"""
Demonstration of Gemini Embedding API with persistent JWT caching.

This script shows how to use the enhanced authentication with persistent caching
to call Gemini Embedding API, equivalent to the curl command you provided.
"""

import json
from gemini_client import GeminiClient, create_gemini_client, quick_embed, quick_batch_embed


def demo_basic_embedding():
    """Demonstrate basic embedding generation."""
    print("🚀 Demo 1: Basic Embedding Generation")
    print("=" * 50)

    # Method 1: Using convenience function (easiest)
    print("\nMethod 1: Using quick_embed() convenience function")
    text = "What is the meaning of life?"
    print(f"Text: '{text}'")

    try:
        embedding = quick_embed(text, "service-account.json")
        print(f"✅ Embedding generated!")
        print(f"   Dimensions: {len(embedding)}")
        print(f"   First 5 values: {embedding[:5]}")
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

    return True


def demo_client_usage():
    """Demonstrate using the Gemini client directly."""
    print("\n🔧 Demo 2: Using GeminiClient")
    print("=" * 50)

    try:
        # Initialize client with persistent caching
        client = create_gemini_client("service-account.json")
        print("✅ Gemini client initialized with persistent JWT caching")

        # Test the API equivalent to your curl command
        print(f"\nMaking API call equivalent to your curl command:")
        print('curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent" \\')
        print('-H "x-goog-api-key: $GEMINI_API_KEY" \\')
        print('-H \'Content-Type: application/json\' \\')
        print('-d \'{"model": "models/gemini-embedding-001",')
        print('     "content": {"parts":[{"text": "What is the meaning of life?"}]}')
        print('    }\'')

        # Generate embedding
        text = "What is the meaning of life?"
        response = client.embed_content(text)

        print(f"\n✅ API call successful!")
        print(f"Response structure:")
        print(json.dumps(response, indent=2))

        # Extract just the embedding values
        embedding_values = client.get_embedding_values(text)
        print(f"\n📊 Embedding Details:")
        print(f"   Text: '{text}'")
        print(f"   Dimensions: {len(embedding_values)}")
        print(f"   Sample values: {embedding_values[:3]} ... {embedding_values[-3:]}")

    except Exception as e:
        print(f"❌ Error: {e}")
        return False

    return True


def demo_batch_embeddings():
    """Demonstrate batch embedding generation."""
    print("\n📚 Demo 3: Batch Embedding Generation")
    print("=" * 50)

    try:
        client = create_gemini_client("service-account.json")
        print("✅ Client ready for batch processing")

        # Multiple texts to embed
        texts = [
            "What is artificial intelligence?",
            "How do neural networks learn?",
            "Explain quantum entanglement.",
            "What are renewable energy sources?",
            "How does photosynthesis work?"
        ]

        print(f"\nProcessing {len(texts)} texts in batches...")

        # Generate batch embeddings
        results = quick_batch_embed(texts, "service-account.json")

        print(f"\n✅ Batch processing completed!")
        print(f"Results summary:")

        successful = [r for r in results if r['success']]
        failed = [r for r in results if not r['success']]

        print(f"   Successful: {len(successful)}/{len(texts)}")
        print(f"   Failed: {len(failed)}/{len(texts)}")

        if successful:
            print(f"\n   Successful embeddings:")
            for i, result in enumerate(successful, 1):
                text_preview = result['text'][:50] + "..." if len(result['text']) > 50 else result['text']
                embedding = result['embedding']['embedding']['values']
                print(f"   {i}. '{text_preview}' -> {len(embedding)} dimensions")

        if failed:
            print(f"\n   Failed embeddings:")
            for i, result in enumerate(failed, 1):
                print(f"   {i}. '{result['text']}' -> Error: {result['error']}")

    except Exception as e:
        print(f"❌ Error: {e}")
        return False

    return True


def demo_document_embedding():
    """Demonstrate document embedding with title."""
    print("\n📄 Demo 4: Document Embedding with Title")
    print("=" * 50)

    try:
        client = create_gemini_client("service-account.json")

        # Document with title for better context
        document_text = """
        Artificial Intelligence (AI) is a branch of computer science that aims to create
        intelligent machines that can perform tasks that typically require human intelligence.
        This includes learning, reasoning, problem-solving, perception, and language understanding.
        """

        title = "Introduction to Artificial Intelligence"
        print(f"Document title: '{title}'")
        print(f"Document text preview: '{document_text[:100]}...'")

        # Generate document embedding with title
        response = client.embed_content(
            text=document_text.strip(),
            task_type="RETRIEVAL_DOCUMENT",
            title=title,
            title_lang="en",
            text_lang="en"
        )

        print(f"\n✅ Document embedding generated!")

        if 'embedding' in response:
            embedding = response['embedding']
            values = embedding.get('values', [])
            print(f"   Dimensions: {len(values)}")
            print(f"   Embedding type: {embedding.get('type', 'N/A')}")
            print(f"   Sample values: {values[:5]}")

    except Exception as e:
        print(f"❌ Error: {e}")
        return False

    return True


def demo_jwt_caching():
    """Demonstrate JWT token caching."""
    print("\n💾 Demo 5: JWT Token Caching")
    print("=" * 50)

    try:
        from google_auth import GoogleAuthenticator

        # Initialize with persistent caching
        auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)
        print("✅ Authenticator initialized with persistent caching")
        print("   Cache directory: geminiJson/.cache/")

        # First token request (hits API)
        print(f"\n--- First token request (will hit Google OAuth API) ---")
        token_info1 = auth.get_access_token("service-account.json")
        print(f"✅ Token obtained from Google")
        print(f"   Token length: {len(token_info1['access_token'])}")
        print(f"   Expires in: {token_info1.get('expires_in', 'N/A')} seconds")

        # Second token request (uses cache)
        print(f"\n--- Second token request (will use cache) ---")
        token_info2 = auth.get_access_token("service-account.json")
        print(f"✅ Token obtained from cache")
        print(f"   Same token as first: {token_info1['access_token'] == token_info2['access_token']}")
        print(f"   Time saved: No API call needed!")

        # Show cache information
        cached_tokens = auth.get_cached_tokens_list()
        print(f"\n--- Cache Information ---")
        print(f"   Total cached tokens: {len(cached_tokens)}")
        for token in cached_tokens:
            is_valid = "✅ Valid" if token['is_valid'] else "❌ Expired"
            expires_min = token.get('expires_in_minutes', 0)
            print(f"   - {token['key_filename']}: {is_valid} ({expires_min:.1f} min remaining)")

        print(f"\n💡 Benefits of persistent caching:")
        print(f"   - Tokens saved to files in geminiJson/.cache/")
        print(f"   - No need to request new tokens until expiration")
        print(f"   - Faster application startup")
        print(f"   - Reduced API quota usage")

    except Exception as e:
        print(f"❌ Error: {e}")
        return False

    return True


def demo_performance_comparison():
    """Compare performance with and without caching."""
    print("\n⚡ Demo 6: Performance Comparison")
    print("=" * 50)

    try:
        import time

        # Without caching
        print("\n--- Without caching ---")
        start_time = time.time()
        for i in range(3):
            from google_auth import GoogleAuthenticator
            auth_no_cache = GoogleAuthenticator("geminiJson", enable_persistent_cache=False)
            auth_no_cache.get_access_token("service-account.json", use_cache=False)
        no_cache_time = time.time() - start_time
        print(f"   3 token requests without caching: {no_cache_time:.2f} seconds")

        # With caching
        print("\n--- With caching ---")
        start_time = time.time()
        for i in range(3):
            from google_auth import GoogleAuthenticator
            auth_with_cache = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)
            auth_with_cache.get_access_token("service-account.json", use_cache=True)
        with_cache_time = time.time() - start_time
        print(f"   3 token requests with caching: {with_cache_time:.2f} seconds")

        # Performance improvement
        if with_cache_time < no_cache_time:
            improvement = ((no_cache_time - with_cache_time) / no_cache_time) * 100
            print(f"\n🚀 Performance improvement: {improvement:.1f}% faster")
            print(f"   Time saved: {no_cache_time - with_cache_time:.2f} seconds")

    except Exception as e:
        print(f"❌ Error: {e}")
        return False

    return True


def main():
    """Run all demonstrations."""
    print("🌟 Gemini Embedding API with Persistent JWT Caching")
    print("=" * 60)
    print("This demo shows how to use the enhanced authentication system")
    print("to call Gemini Embedding API, equivalent to your curl command.")
    print("\nThe provided curl command:")
    print('curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent" \\')
    print('-H "x-goog-api-key: $GEMINI_API_KEY" \\')
    print('-H \'Content-Type: application/json\' \\')
    print('-d \'{"model": "models/gemini-embedding-001",')
    print('     "content": {"parts":[{"text": "What is the meaning of life?"}]}')
    print('    }\'')
    print("\nNow let's see how to do this with our Python client!")

    demos = [
        ("Basic Embedding", demo_basic_embedding),
        ("Client Usage", demo_client_usage),
        ("Batch Embeddings", demo_batch_embeddings),
        ("Document Embedding", demo_document_embedding),
        ("JWT Caching", demo_jwt_caching),
        ("Performance", demo_performance_comparison)
    ]

    results = []
    for demo_name, demo_func in demos:
        try:
            result = demo_func()
            results.append((demo_name, result))
            status = "✅ SUCCESS" if result else "❌ FAILED"
            print(f"\n{demo_name}: {status}")
        except Exception as e:
            print(f"\n❌ {demo_name} failed with exception: {e}")
            results.append((demo_name, False))

    print("\n" + "=" * 60)
    print("📋 Demo Results Summary:")
    passed = 0
    for demo_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"   {demo_name}: {status}")
        if result:
            passed += 1

    total = len(demos)
    print(f"\nOverall: {passed}/{total} demos completed successfully")

    if passed == total:
        print("\n🎉 All demonstrations completed successfully!")
        print("\n📚 Next Steps:")
        print("1. Import the modules in your own projects:")
        print("   from gemini_client import create_gemini_client, quick_embed")
        print("   from google_auth import GoogleAuthenticator")
        print("")
        print("2. Use persistent JWT caching for better performance:")
        print("   auth = GoogleAuthenticator('geminiJson', enable_persistent_cache=True)")
        print("")
        print("3. Call Gemini Embedding API:")
        print("   client = create_gemini_client('your-key.json')")
        print("   embedding = client.get_embedding_values('Your text here')")
        print("")
        print("💡 The JWT tokens are automatically cached to 'geminiJson/.cache/'")
        print("   and reused until expiration, providing significant performance benefits!")

    else:
        print("\n⚠️  Some demonstrations failed.")
        print("🔧 Please check:")
        print("1. Your Google service account JSON key is in 'geminiJson/' directory")
        print("2. The service account has Gemini API permissions")
        print("3. Network connectivity to Google APIs")

    return passed == total


if __name__ == "__main__":
    try:
        success = main()
        exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nDemo interrupted by user.")
        exit(1)
    except Exception as e:
        print(f"\n\nUnexpected error during demo: {e}")
        exit(1)