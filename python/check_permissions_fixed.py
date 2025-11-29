#!/usr/bin/env python3
"""
Permission checker and diagnostic script for Gemini API access.
"""

import json
import requests
from google_auth import GoogleAuthenticator
from vertex_ai_auth import setup_auth


def test_service_account_permissions():
    """Test various Google API permissions."""
    print("Testing Service Account Permissions")
    print("=" * 50)

    try:
        # Initialize authentication
        auth = GoogleAuthenticator("geminiJson")
        available_keys = auth.get_available_keys()

        if not available_keys:
            print("No service account keys found in geminiJson/ directory")
            return False

        key_file = available_keys[0]
        print(f"Testing with key file: {key_file}")

        # Load service account info
        service_account = auth.load_service_account_key(key_file)
        print(f"Service account: {service_account.get('client_email', 'N/A')}")
        print(f"Project ID: {service_account.get('project_id', 'N/A')}")

        # Get access token
        print(f"\nGetting OAuth2 access token...")
        token_info = auth.get_access_token(key_file, use_cache=True)
        access_token = token_info['access_token']
        print(f"Access token obtained (length: {len(access_token)})")

        # Test different APIs
        apis_to_test = [
            ("Vertex AI", "https://us-central1-aiplatform.googleapis.com/v1/projects"),
            ("Generative Language", "https://generativelanguage.googleapis.com/v1beta/models"),
            ("Cloud Resource Manager", "https://cloudresourcemanager.googleapis.com/v1/projects"),
            ("IAM", "https://iam.googleapis.com/v1/projects")
        ]

        results = {}

        for api_name, api_url in apis_to_test:
            print(f"\nTesting {api_name} API...")
            try:
                response = requests.get(api_url, headers={'Authorization': f'Bearer {access_token}'}, timeout=10)

                if response.status_code == 200:
                    results[api_name] = "Access Granted"
                    print(f"   SUCCESS: {api_name}: {response.status_code} - Access granted")
                elif response.status_code == 403:
                    results[api_name] = "Access Denied"
                    print(f"   FAILED: {api_name}: {response.status_code} - Permission denied")
                elif response.status_code == 404:
                    results[api_name] = "API Not Found/Not Enabled"
                    print(f"   FAILED: {api_name}: {response.status_code} - API not found or not enabled")
                else:
                    results[api_name] = f"HTTP {response.status_code}"
                    print(f"   FAILED: {api_name}: {response.status_code} - Unexpected response")

            except requests.exceptions.Timeout:
                results[api_name] = "Request Timeout"
                print(f"   FAILED: {api_name}: Request timeout")
            except requests.exceptions.ConnectionError:
                results[api_name] = "Connection Error"
                print(f"   FAILED: {api_name}: Connection error")
            except Exception as e:
                results[api_name] = f"Error: {e}"
                print(f"   FAILED: {api_name}: {e}")

        # Specific Gemini API test
        print(f"\nTesting Gemini Embedding API specifically...")
        gemini_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent"
        payload = {
            "model": "models/gemini-embedding-001",
            "content": {
                "parts": [{"text": "test"}]
            }
        }

        try:
            response = requests.post(
                gemini_url,
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'Content-Type': 'application/json'
                },
                json=payload,
                timeout=10
            )

            if response.status_code == 200:
                results["Gemini Embedding"] = "Working"
                print("   SUCCESS: Gemini Embedding API: 200 - Working perfectly!")
                print("   Response sample:")
                print(f"     {json.dumps(response.json(), indent=6)}")
            elif response.status_code == 403:
                results["Gemini Embedding"] = "Permission Denied"
                print("   FAILED: Gemini Embedding API: 403 - Permission denied")
                print("\n   SOLUTION: Enable Gemini API in Google Cloud Console:")
                print("   1. Go to: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com")
                print("   2. Click 'Enable' button")
                print("   3. Wait 5-10 minutes for permissions to propagate")
                print("   4. Try running this script again")
            elif response.status_code == 404:
                results["Gemini Embedding"] = "API Not Enabled"
                print("   FAILED: Gemini Embedding API: 404 - API not enabled")
                print("\n   SOLUTION: Enable Gemini API in Google Cloud Console")
            else:
                results["Gemini Embedding"] = f"HTTP {response.status_code}"
                print(f"   FAILED: Gemini Embedding API: {response.status_code}")

        except Exception as e:
            results["Gemini Embedding"] = f"Error: {e}"
            print(f"   FAILED: Gemini Embedding API: {e}")

        # Summary
        print(f"\nPermission Summary:")
        print("=" * 30)
        for api_name, result in results.items():
            status_symbol = "✓" if "Granted" in result or "Working" in result else "✗"
            print(f"   {status_symbol} {api_name}: {result}")

        return all("Granted" in result or "Working" in result for result in results.values())

    except Exception as e:
        print(f"Permission check failed: {e}")
        return False


def display_setup_instructions():
    """Display detailed setup instructions."""
    print("\n" + "=" * 60)
    print("GEMINI API SETUP INSTRUCTIONS")
    print("=" * 60)

    print("\nSTEP 1: Enable Gemini API in Google Cloud Console")
    print("URL: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com")
    print("Action: Click 'Enable' button")

    print("\nSTEP 2: Assign IAM Roles to Service Account")
    print("URL: https://console.cloud.google.com/iam-admin/iam")
    print("Actions:")
    print("  1. Find your service account")
    print("  2. Click on the service account name")
    print("  3. Go to 'Permissions' tab")
    print("  4. Click 'Grant Access'")
    print("  5. Add one of these roles:")
    print("     - Generative AI Service Agent (recommended)")
    print("     - AI Platform User")
    print("     - Editor (for testing)")

    print("\nSTEP 3: Enable APIs for Project")
    print("Also ensure these APIs are enabled:")
    print("  - Generative Language API")
    print("  - AI Platform API")
    print("  - Cloud Resource Manager API")

    print("\nSTEP 4: Wait for Propagation")
    print("API permissions may take 5-10 minutes to propagate")
    print("After waiting, run: python check_permissions_fixed.py")

    print("\nSTEP 5: Test Again")
    print("Run this script again to verify access")
    print("If successful, you can use: python demo_gemini_embedding.py")

    print("\n" + "=" * 60)


def main():
    """Main diagnostic function."""
    print("Gemini API Permission Checker")
    print("=" * 60)

    # First, check if service account key exists
    import os
    from pathlib import Path

    gemini_dir = Path("geminiJson")
    if not gemini_dir.exists():
        print("ERROR: geminiJson/ directory not found!")
        print("Please create directory and add your Google service account JSON key.")
        display_setup_instructions()
        return False

    key_files = list(gemini_dir.glob("*.json"))
    if not key_files:
        print("ERROR: No service account JSON keys found in geminiJson/")
        print("Please add your Google service account JSON key file.")
        display_setup_instructions()
        return False

    print(f"Found {len(key_files)} service account key files")

    # Run permission tests
    success = test_service_account_permissions()

    if not success:
        display_setup_instructions()

    return success


if __name__ == "__main__":
    try:
        success = main()
        exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nPermission check interrupted by user.")
        exit(1)
    except Exception as e:
        print(f"\n\nUnexpected error during permission check: {e}")
        exit(1)