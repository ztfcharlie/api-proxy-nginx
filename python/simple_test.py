"""
Simple test for Google OAuth2 JWT functionality without emoji characters.
"""

import json
import os
from pathlib import Path

# Import our modules
from google_auth import GoogleAuthenticator, get_vertex_ai_token
from vertex_ai_auth import VertexAIAuth, create_vertex_auth, GlobalAuthManager, setup_auth


def test_basic_functionality():
    """Test basic functionality of the authentication modules."""
    print("=== Testing Basic Authentication Functionality ===")

    try:
        # Initialize authenticator
        auth = GoogleAuthenticator("geminiJson")

        # List available keys
        available_keys = auth.get_available_keys()
        print(f"Available keys: {available_keys}")

        if not available_keys:
            print("No keys found. Creating sample key file...")
            create_sample_key()
            available_keys = auth.get_available_keys()

        if available_keys:
            key_file = available_keys[0]
            print(f"\nTesting with key file: {key_file}")

            # Load service account key
            service_account = auth.load_service_account_key(key_file)
            print(f"Service account email: {service_account.get('client_email', 'N/A')}")
            print(f"Project ID: {service_account.get('project_id', 'N/A')}")

            # Test JWT assertion creation
            jwt_assertion = auth.create_jwt_assertion(service_account)
            print(f"JWT assertion created successfully: {jwt_assertion[:50]}...")

            return True
        else:
            print("No service account keys available")
            return False

    except Exception as e:
        print(f"Error in basic test: {e}")
        return False


def test_high_level_interface():
    """Test the high-level interface."""
    print("\n=== Testing High-Level Interface ===")

    try:
        auth = GoogleAuthenticator("geminiJson")
        available_keys = auth.get_available_keys()

        if available_keys:
            key_file = available_keys[0]

            # Create VertexAIAuth instance
            vertex_auth = create_vertex_auth(key_file, "geminiJson")
            print("SUCCESS: VertexAIAuth instance created")

            # Get service account info
            service_info = vertex_auth.get_service_account_info()
            print(f"Service account: {service_info.get('client_email', 'N/A')}")
            print(f"Project ID: {service_info.get('project_id', 'N/A')}")

            return True
        else:
            print("No keys available for high-level interface test")
            return False

    except Exception as e:
        print(f"Error in high-level interface test: {e}")
        return False


def test_token_management():
    """Test token management functionality."""
    print("\n=== Testing Token Management ===")

    try:
        auth = GoogleAuthenticator("geminiJson")
        available_keys = auth.get_available_keys()

        if available_keys:
            key_file = available_keys[0]

            # Test with custom scopes
            scopes = ['https://www.googleapis.com/auth/cloud-platform']

            # Test JWT creation
            service_account = auth.load_service_account_key(key_file)
            jwt_assertion = auth.create_jwt_assertion(service_account, scopes)
            print(f"JWT with custom scopes: {jwt_assertion[:50]}...")

            # Test cache functionality
            print(f"Cache before: {len(auth._credentials_cache)} items")

            # Clear cache
            auth.clear_cache()
            print(f"Cache after clear: {len(auth._credentials_cache)} items")

            return True
        else:
            print("No keys available for token management test")
            return False

    except Exception as e:
        print(f"Error in token management test: {e}")
        return False


def create_sample_key():
    """Create a sample service account key file."""
    sample_key = {
        "type": "service_account",
        "project_id": "your-project-id",
        "private_key_id": "sample-key-id",
        "private_key": "-----BEGIN PRIVATE KEY-----\nSAMPLE_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n",
        "client_email": "your-service-account@your-project-id.iam.gserviceaccount.com",
        "client_id": "your-client-id",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token"
    }

    gemini_dir = Path("geminiJson")
    gemini_dir.mkdir(exist_ok=True)

    sample_key_path = gemini_dir / "sample_service_account.json"
    with open(sample_key_path, 'w', encoding='utf-8') as f:
        json.dump(sample_key, f, indent=2)

    print(f"Created sample key file: {sample_key_path}")
    print("NOTE: This is a template. Replace with real Google service account credentials.")


def test_error_handling():
    """Test error handling scenarios."""
    print("\n=== Testing Error Handling ===")

    try:
        # Test with non-existent key file
        auth = GoogleAuthenticator("geminiJson")
        try:
            token_info = auth.get_access_token("non-existent.json")
            print("ERROR: Should have failed with non-existent file")
            return False
        except FileNotFoundError:
            print("SUCCESS: FileNotFoundError correctly handled")
            return True
        except Exception as e:
            print(f"SUCCESS: Other error handled: {e}")
            return True

    except Exception as e:
        print(f"Error in error handling test: {e}")
        return False


def main():
    """Run all tests."""
    print("Starting Google OAuth2 JWT Authentication Tests")
    print("=" * 50)

    tests = [
        ("Basic Functionality", test_basic_functionality),
        ("High-Level Interface", test_high_level_interface),
        ("Token Management", test_token_management),
        ("Error Handling", test_error_handling)
    ]

    results = []
    for test_name, test_func in tests:
        print(f"\nRunning {test_name} test...")
        try:
            result = test_func()
            results.append((test_name, result))
            print(f"{test_name}: {'PASSED' if result else 'FAILED'}")
        except Exception as e:
            print(f"{test_name}: FAILED with exception: {e}")
            results.append((test_name, False))

    print("\n" + "=" * 50)
    print("Test Results:")
    for test_name, result in results:
        status = "PASSED" if result else "FAILED"
        print(f"  {test_name}: {status}")

    passed = sum(1 for _, result in results if result)
    total = len(results)
    print(f"\nSummary: {passed}/{total} tests passed")

    print("\nNotes:")
    print("1. Place your real Google service account JSON keys in the 'geminiJson' directory")
    print("2. Tests will work with real keys, but some may fail with sample keys")
    print("3. Make sure your service account has necessary Vertex AI permissions")
    print("4. Install required packages: pip install pyjwt requests cryptography")


if __name__ == "__main__":
    main()