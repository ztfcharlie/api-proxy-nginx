"""
Example usage of the Google OAuth2 JWT authentication modules.

This file demonstrates how to use the authentication modules in different scenarios.
"""

from google_auth import GoogleAuthenticator, get_vertex_ai_token
from vertex_ai_auth import VertexAIAuth, create_vertex_auth, GlobalAuthManager, setup_auth
import requests


def example_1_basic_usage():
    """
    Example 1: Basic token retrieval using GoogleAuthenticator
    """
    print("=== Example 1: Basic Token Retrieval ===")

    # Initialize the authenticator
    auth = GoogleAuthenticator("geminiJson")

    # List available service account keys
    available_keys = auth.get_available_keys()
    print(f"Available keys: {available_keys}")

    if not available_keys:
        print("No service account keys found in geminiJson directory!")
        return

    # Get access token using the first available key
    key_file = available_keys[0]
    print(f"\nUsing key file: {key_file}")

    try:
        token_info = auth.get_access_token(key_file)
        print(f"✅ Access token obtained successfully!")
        print(f"Token (first 50 chars): {token_info['access_token'][:50]}...")
        print(f"Expires in: {token_info['expires_in']} seconds")
        print(f"Token type: {token_info.get('token_type', 'Bearer')}")
    except Exception as e:
        print(f"❌ Failed to get token: {e}")


def example_2_high_level_interface():
    """
    Example 2: Using the high-level VertexAIAuth interface
    """
    print("\n=== Example 2: High-Level Interface ===")

    # Assume we have a service account key file
    key_filename = "your-service-account-key.json"  # Replace with actual key file

    # Create authentication instance
    auth = create_vertex_auth(key_filename, "geminiJson")
    print("✅ VertexAIAuth instance created")

    try:
        # Get service account information
        service_info = auth.get_service_account_info()
        print(f"Service account: {service_info.get('client_email', 'N/A')}")
        print(f"Project ID: {service_info.get('project_id', 'N/A')}")

        # Get access token
        token = auth.get_token()
        print(f"✅ Token obtained: {token[:50]}...")

        # Get authentication headers for API calls
        headers = auth.get_auth_headers()
        print(f"✅ Auth headers ready: {list(headers.keys())}")

        # Check token validity
        is_valid = auth.is_token_valid()
        print(f"Token valid: {is_valid}")

    except Exception as e:
        print(f"❌ Error: {e}")


def example_3_global_auth_manager():
    """
    Example 3: Using GlobalAuthManager for applications with single service account
    """
    print("\n=== Example 3: Global Auth Manager ===")

    key_filename = "your-service-account-key.json"  # Replace with actual key file

    try:
        # Initialize global authentication (typically done at app startup)
        GlobalAuthManager.initialize(key_filename, "geminiJson")
        print("✅ Global auth manager initialized")

        # Anywhere in the app, get the global instance
        global_auth = GlobalAuthManager.get_instance()
        print("✅ Global auth manager retrieved")

        # Get token anywhere in the app
        token = GlobalAuthManager.get_token()
        print(f"✅ Global token: {token[:50]}...")

        # Get auth headers for API calls
        headers = GlobalAuthManager.get_auth_headers()
        print(f"✅ Global auth headers: {headers['Authorization'][:30]}...")

        # Check token validity
        is_valid = GlobalAuthManager.is_token_valid()
        print(f"Global token valid: {is_valid}")

    except Exception as e:
        print(f"❌ Error: {e}")


def example_4_quick_setup():
    """
    Example 4: Quick setup for simple use cases
    """
    print("\n=== Example 4: Quick Setup ===")

    key_filename = "your-service-account-key.json"  # Replace with actual key file

    try:
        # Quick setup - one line initialization
        auth = setup_auth(key_filename, "geminiJson")
        print("✅ Quick setup completed")

        # Get token
        token = auth.get_token()
        print(f"✅ Token: {token[:50]}...")

    except Exception as e:
        print(f"❌ Error: {e}")


def example_5_convenience_function():
    """
    Example 5: Using convenience function for simple token retrieval
    """
    print("\n=== Example 5: Convenience Function ===")

    key_filename = "your-service-account-key.json"  # Replace with actual key file

    try:
        # Simple one-liner token retrieval
        token = get_vertex_ai_token(key_filename, "geminiJson")
        print(f"✅ Token via convenience function: {token[:50]}...")

    except Exception as e:
        print(f"❌ Error: {e}")


def example_6_vertex_ai_api_call():
    """
    Example 6: Making actual API calls to Vertex AI
    """
    print("\n=== Example 6: Vertex AI API Call Example ===")

    key_filename = "your-service-account-key.json"  # Replace with actual key file

    try:
        # Setup authentication
        auth = setup_auth(key_filename, "geminiJson")
        headers = auth.get_auth_headers()

        # Example: List Vertex AI endpoints (you'll need to adjust the URL for your project)
        project_id = "your-project-id"  # Replace with actual project ID
        location = "us-central1"  # Replace with your location

        # Note: This is a sample URL - adjust based on actual Vertex AI endpoints you want to call
        sample_api_url = f"https://{location}-aiplatform.googleapis.com/v1/projects/{project_id}/locations/{location}/endpoints"

        print(f"Sample API URL: {sample_api_url}")
        print("Headers prepared for API call")
        print(f"Authorization: {headers['Authorization'][:30]}...")

        # Uncomment the following lines to make actual API calls
        # response = requests.get(sample_api_url, headers=headers)
        # if response.status_code == 200:
        #     print("✅ API call successful!")
        #     print(f"Response: {response.json()}")
        # else:
        #     print(f"❌ API call failed: {response.status_code}")
        #     print(f"Error: {response.text}")

        print("📝 Note: Uncomment the API call code above with your actual project details")

    except Exception as e:
        print(f"❌ Error: {e}")


def example_7_token_management():
    """
    Example 7: Advanced token management
    """
    print("\n=== Example 7: Advanced Token Management ===")

    auth = GoogleAuthenticator("geminiJson")
    available_keys = auth.get_available_keys()

    if not available_keys:
        print("No keys available for token management example")
        return

    key_file = available_keys[0]

    try:
        # Get token with custom scopes
        custom_scopes = [
            'https://www.googleapis.com/auth/cloud-platform',
            'https://www.googleapis.com/auth/aiplatform'
        ]

        token_info = auth.get_access_token(key_file, scopes=custom_scopes)
        print(f"✅ Token with custom scopes obtained")
        print(f"Token info keys: {list(token_info.keys())}")

        # Check cached token
        cached_info = auth.get_cached_token_info(key_file, custom_scopes)
        if cached_info:
            print("✅ Token is cached")
            print(f"Expires at: {cached_info.get('expires_at', 'N/A')}")

        # Clear cache
        auth.clear_cache()
        print("✅ Token cache cleared")

        # Check cache after clearing
        cached_info = auth.get_cached_token_info(key_file, custom_scopes)
        if not cached_info:
            print("✅ Cache cleared successfully")

    except Exception as e:
        print(f"❌ Error: {e}")


def example_8_error_handling():
    """
    Example 8: Proper error handling
    """
    print("\n=== Example 8: Error Handling ===")

    try:
        # Try to use a non-existent key file
        auth = GoogleAuthenticator("geminiJson")
        token_info = auth.get_access_token("non-existent-key.json")
        print("❌ This should not work!")
    except FileNotFoundError as e:
        print(f"✅ Expected FileNotFoundError handled: {e}")
    except Exception as e:
        print(f"✅ Other error handled: {e}")

    try:
        # Try to initialize with invalid directory
        auth = GoogleAuthenticator("non-existent-directory")
        available_keys = auth.get_available_keys()
        print(f"Available keys in non-existent dir: {available_keys}")
    except Exception as e:
        print(f"✅ Directory error handled: {e}")


def main():
    """Run all examples"""
    print("🚀 Google OAuth2 JWT Authentication Examples")
    print("=" * 60)

    print("\n📋 Available Examples:")
    print("1. Basic token retrieval")
    print("2. High-level interface")
    print("3. Global auth manager")
    print("4. Quick setup")
    print("5. Convenience function")
    print("6. Vertex AI API call")
    print("7. Advanced token management")
    print("8. Error handling")

    print("\n⚠️  Important Notes:")
    print("- Replace 'your-service-account-key.json' with your actual Google service account JSON key file")
    print("- Place your key files in the 'geminiJson' directory")
    print("- Make sure your service account has necessary Vertex AI permissions")
    print("- Install required packages: pip install -r requirements.txt")

    # Run examples (commented out to avoid errors with placeholder keys)
    # Uncomment the examples you want to run after adding real key files

    # example_1_basic_usage()
    # example_2_high_level_interface()
    # example_3_global_auth_manager()
    # example_4_quick_setup()
    # example_5_convenience_function()
    # example_6_vertex_ai_api_call()
    # example_7_token_management()
    example_8_error_handling()

    print("\n✅ Examples completed!")
    print("🔧 To run with real data:")
    print("1. Add your Google service account JSON keys to the 'geminiJson' directory")
    print("2. Update the key filenames in the examples")
    print("3. Uncomment the example calls you want to test")


if __name__ == "__main__":
    main()