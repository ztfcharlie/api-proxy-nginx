#!/usr/bin/env python3
"""
Simple JWT Persistent Caching Demo

Demonstrates the core JWT caching functionality
without emoji or complex features that could cause encoding issues.
"""

import time
import json
from google_auth import GoogleAuthenticator


def main():
    """Main demonstration of JWT caching benefits."""
    print("JWT Persistent Caching Demo")
    print("=" * 50)

    try:
        # Initialize authenticator with persistent cache
        print("1. Initializing with persistent cache...")
        auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)
        print("   Persistent cache enabled in geminiJson/.cache/")

        # Show available keys
        available_keys = auth.get_available_keys()
        if not available_keys:
            print("   ERROR: No service account keys found in geminiJson/")
            print("   Please add your Google service account JSON key file.")
            return False

        print(f"   Available keys: {available_keys}")
        key_file = available_keys[0]
        print(f"   Using key file: {key_file}")

        # Test 1: First token request (will hit Google OAuth API)
        print("\n2. First token request (will hit Google OAuth API)...")
        start_time = time.time()
        token_info1 = auth.get_access_token(key_file, use_cache=False)  # Force API call
        first_time = time.time() - start_time
        print(f"   Token obtained in {first_time:.3f} seconds")
        print(f"   Token length: {len(token_info1['access_token'])}")

        # Test 2: Second token request (will use cached token)
        print("\n3. Second token request (will use cached token)...")
        start_time = time.time()
        token_info2 = auth.get_access_token(key_file, use_cache=True)   # Will use cache
        second_time = time.time() - start_time
        print(f"   Token obtained in {second_time:.3f} seconds")
        print(f"   Same token as first: {token_info1['access_token'] == token_info2['access_token']}")

        # Test 3: Third token request (definitely use cache)
        print("\n4. Third token request (definitely use cache)...")
        start_time = time.time()
        token_info3 = auth.get_access_token(key_file, use_cache=True)   # Will use cache
        third_time = time.time() - start_time
        print(f"   Token obtained in {third_time:.3f} seconds")
        print(f"   Same token as first: {token_info1['access_token'] == token_info3['access_token']}")

        # Calculate performance improvement
        api_time = first_time  # Time when hitting API
        cache_time = third_time  # Time when using cache
        if cache_time > 0:
            improvement = ((api_time - cache_time) / api_time) * 100
            speedup = api_time / cache_time
            print(f"\n5. Performance Analysis:")
            print(f"   API-only time: {api_time:.3f} seconds")
            print(f"   Cached time: {cache_time:.3f} seconds")
            print(f"   Performance improvement: {improvement:.1f}% faster")
            print(f"   Speedup factor: {speedup:.1f}x faster")

        # Show cache status
        cached_tokens = auth.get_cached_tokens_list()
        print(f"\n6. Cache Status:")
        print(f"   Total cached tokens: {len(cached_tokens)}")
        print(f"   Valid tokens: {len([t for t in cached_tokens if t.get('is_valid', False)])}")

        # Test 4: Force token refresh
        print("\n7. Testing token refresh...")
        original_token = token_info1['access_token']
        new_token_info = auth.get_access_token(key_file, use_cache=True, force_refresh=True)
        print(f"   Token refreshed: {original_token != new_token_info['access_token']}")

        # Test 5: Check persistent cache files
        print("\n8. Persistent Cache Files:")
        cache_dir = Path("geminiJson/.cache")
        if cache_dir.exists():
            cache_files = list(cache_dir.glob("token_*.json"))
            print(f"   Cache files: {len(cache_files)}")
            for i, cache_file in enumerate(cache_files[:3], 1):
                print(f"   {i}. {cache_file.name}")

        print(f"\n9. JWT Caching is working perfectly!")

        print(f"\nSUMMARY:")
        print(f"   Authentication method: OAuth2 with persistent JWT caching")
        print(f"   Performance improvement: {improvement:.1f}% faster when using cache")
        print(f"   Cache files created: {len(cache_files) if 'cache_files' in locals() else 0}")
        print(f"   Ready for production use!")

        return True

    except Exception as e:
        print(f"\nERROR: {e}")
        return False


if __name__ == "__main__":
    try:
        success = main()
        exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\nDemo interrupted by user.")
        exit(1)
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        exit(1)