"""
Test script for Google OAuth2 JWT functionality.

This script tests the authentication modules with sample service account keys.
"""

import json
import os
from pathlib import Path

# Import our modules
from google_auth import GoogleAuthenticator, get_vertex_ai_token
from vertex_ai_auth import VertexAIAuth, create_vertex_auth, GlobalAuthManager, setup_auth


def create_sample_key_file():
    """
    Create a sample service account key file for testing purposes.
    This is just an example structure - you'll need to provide real keys.
    """
    sample_key = {
        "type": "service_account",
        "project_id": "your-project-id",
        "private_key_id": "sample-key-id",
        "private_key": "-----BEGIN PRIVATE KEY-----\n[Your actual private key here]\n-----END PRIVATE KEY-----\n",
        "client_email": "your-service-account@your-project-id.iam.gserviceaccount.com",
        "client_id": "your-client-id",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project-id.iam.gserviceaccount.com"
    }

    # Create geminiJson directory if it doesn't exist
    gemini_dir = Path("geminiJson")
    gemini_dir.mkdir(exist_ok=True)

    # Write sample key file
    sample_key_path = gemini_dir / "sample_service_account.json"
    with open(sample_key_path, 'w', encoding='utf-8') as f:
        json.dump(sample_key, f, indent=2)

    print(f"Created sample key file: {sample_key_path}")
    print("NOTE: This is just a template. You need to replace with actual Google service account credentials.")
    return str(sample_key_path)


def test_google_authenticator():
    """Test the basic GoogleAuthenticator class."""
    print("\n=== Testing GoogleAuthenticator ===")

    try:
        # Initialize authenticator
        auth = GoogleAuthenticator("geminiJson")

        # Test getting available keys
        available_keys = auth.get_available_keys()
        print(f"Available keys: {available_keys}")

        if not available_keys:
            print("No key files found. Creating a sample template...")
            create_sample_key_file()
            available_keys = auth.get_available_keys()

        if available_keys:
            # Test with first available key
            key_file = available_keys[0]
            print(f"\nTesting with key file: {key_file}")

            # Load the key
            service_account = auth.load_service_account_key(key_file)
            print(f"Service account email: {service_account.get('client_email', 'N/A')}")
            print(f"Project ID: {service_account.get('project_id', 'N/A')}")

            # Try to get access token (will fail if sample key is not real)
            try:
                token_info = auth.get_access_token(key_file)
                print(f"SUCCESS: Successfully got access token!")
                print(f"Token length: {len(token_info['access_token'])}")
                print(f"Expires in: {token_info['expires_in']} seconds")
                print(f"Token type: {token_info.get('token_type', 'N/A')}")

                # Test cache
                print(f"\n--- Testing Cache ---")
                cached_info = auth.get_cached_token_info(key_file)
                if cached_info:
                    print("SUCCESS: Token caching is working")
                    print(f"Cached token expires at: {cached_info.get('expires_at', 'N/A')}")

            except Exception as e:
                print(f"ERROR: Failed to get access token (expected with sample key): {e}")
                print("This is expected if using the sample key template.")

        else:
            print("ERROR: No key files available for testing")

    except Exception as e:
        print(f"ERROR: Error in GoogleAuthenticator test: {e}")


def test_vertex_ai_auth():
    """Test the VertexAIAuth high-level interface."""
    print("\n=== Testing VertexAIAuth ===")

    try:
        # List available keys
        auth = GoogleAuthenticator("geminiJson")
        available_keys = auth.get_available_keys()

        if available_keys:
            key_file = available_keys[0]
            print(f"Testing VertexAIAuth with key: {key_file}")

            # Create VertexAIAuth instance
            vertex_auth = create_vertex_auth(key_file, "geminiJson")
            print("✅ VertexAIAuth instance created successfully")

            # Test service account info
            service_info = vertex_auth.get_service_account_info()
            print(f"Service account: {service_info.get('client_email', 'N/A')}")
            print(f"Project ID: {service_info.get('project_id', 'N/A')}")

            # Try to get token
            try:
                token = vertex_auth.get_token()
                print(f"✅ Got Vertex AI token: {token[:50]}...")

                # Test auth headers
                headers = vertex_auth.get_auth_headers()
                print(f"✅ Auth headers generated")
                print(f"Authorization header: {headers.get('Authorization', 'N/A')[:30]}...")

                # Test token validity
                is_valid = vertex_auth.is_token_valid()
                print(f"✅ Token validity check: {is_valid}")

            except Exception as e:
                print(f"❌ Failed to get Vertex AI token (expected with sample key): {e}")

        else:
            print("❌ No key files available for VertexAIAuth testing")

    except Exception as e:
        print(f"❌ Error in VertexAIAuth test: {e}")


def test_global_auth_manager():
    """Test the GlobalAuthManager."""
    print("\n=== Testing GlobalAuthManager ===")

    try:
        auth = GoogleAuthenticator("geminiJson")
        available_keys = auth.get_available_keys()

        if available_keys:
            key_file = available_keys[0]

            # Initialize global auth
            GlobalAuthManager.initialize(key_file, "geminiJson")
            print("✅ GlobalAuthManager initialized successfully")

            # Get global instance
            global_auth = GlobalAuthManager.get_instance()
            print("✅ GlobalAuthManager instance retrieved")

            # Test global token
            try:
                global_token = GlobalAuthManager.get_token()
                print(f"✅ Global token obtained: {global_token[:50]}...")

                # Test global headers
                global_headers = GlobalAuthManager.get_auth_headers()
                print(f"✅ Global auth headers generated")

                # Test token validity
                is_valid = GlobalAuthManager.is_token_valid()
                print(f"✅ Global token validity: {is_valid}")

            except Exception as e:
                print(f"❌ Failed to get global token (expected with sample key): {e}")

        else:
            print("❌ No key files available for GlobalAuthManager testing")

    except Exception as e:
        print(f"❌ Error in GlobalAuthManager test: {e}")


def test_convenience_functions():
    """Test convenience functions."""
    print("\n=== Testing Convenience Functions ===")

    try:
        auth = GoogleAuthenticator("geminiJson")
        available_keys = auth.get_available_keys()

        if available_keys:
            key_file = available_keys[0]

            # Test setup_auth function
            auth_instance = setup_auth(key_file, "geminiJson")
            print("✅ setup_auth function worked")

            # Test get_vertex_ai_token function
            try:
                token = get_vertex_ai_token(key_file, "geminiJson")
                print(f"✅ get_vertex_ai_token worked: {token[:50]}...")
            except Exception as e:
                print(f"❌ get_vertex_ai_token failed (expected with sample key): {e}")

        else:
            print("❌ No key files available for convenience function testing")

    except Exception as e:
        print(f"❌ Error in convenience functions test: {e}")


def main():
    """Run all tests."""
    print("Starting Google OAuth2 JWT Authentication Tests")
    print("=" * 50)

    # Test all components
    test_google_authenticator()
    test_vertex_ai_auth()
    test_global_auth_manager()
    test_convenience_functions()

    print("\n" + "=" * 50)
    print("Testing completed!")
    print("\nNotes:")
    print("1. Place your real Google service account JSON keys in the 'geminiJson' directory")
    print("2. The tests will work with real keys, but fail with the sample template")
    print("3. Make sure your service account has the necessary permissions for Vertex AI")
    print("4. Required Python packages: PyJWT, requests, cryptography")
    print("\nInstall required packages:")
    print("pip install pyjwt requests cryptography")


if __name__ == "__main__":
    main()