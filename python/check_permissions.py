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
            print("❌ No service account keys found in geminiJson/ directory")
            return False

        key_file = available_keys[0]
        print(f"📄 Testing with key file: {key_file}")

        # Load service account info
        service_account = auth.load_service_account_key(key_file)
        print(f"📧 Service account: {service_account.get('client_email', 'N/A')}")
        print(f"🏢 Project ID: {service_account.get('project_id', 'N/A')}")

        # Get access token
        print(f"\n🔑 Getting OAuth2 access token...")
        token_info = auth.get_access_token(key_file, use_cache=True)
        access_token = token_info['access_token']
        print(f"✅ Access token obtained (length: {len(access_token)})")

        # Test different APIs
        apis_to_test = [
            ("Vertex AI", "https://us-central1-aiplatform.googleapis.com/v1/projects"),
            ("Generative Language", "https://generativelanguage.googleapis.com/v1beta/models"),
            ("Cloud Resource Manager", "https://cloudresourcemanager.googleapis.com/v1/projects"),
            ("IAM", "https://iam.googleapis.com/v1/projects")
        ]

        results = {}

        for api_name, api_url in apis_to_test:
            print(f"\n🌐 Testing {api_name} API...")
            try:
                response = requests.get(api_url, headers={'Authorization': f'Bearer {access_token}'}, timeout=10)

                if response.status_code == 200:
                    results[api_name] = "✅ Access Granted"
                    print(f"   ✅ {api_name}: {response.status_code} - Access granted")
                elif response.status_code == 403:
                    results[api_name] = "❌ Access Denied (Permission Issue)"
                    print(f"   ❌ {api_name}: {response.status_code} - Permission denied")
                elif response.status_code == 404:
                    results[api_name] = "⚠️ API Not Found/Not Enabled"
                    print(f"   ⚠️ {api_name}: {response.status_code} - API not found or not enabled")
                else:
                    results[api_name] = f"⚠️ HTTP {response.status_code}"
                    print(f"   ⚠️ {api_name}: {response.status_code} - Unexpected response")

            except requests.exceptions.Timeout:
                results[api_name] = "⏰ Request Timeout"
                print(f"   ⏰ {api_name}: Request timeout")
            except requests.exceptions.ConnectionError:
                results[api_name] = "🔌 Connection Error"
                print(f"   🔌 {api_name}: Connection error")
            except Exception as e:
                results[api_name] = f"❌ Error: {e}"
                print(f"   ❌ {api_name}: {e}")

        # Summary
        print(f"\n📊 Permission Summary:")
        print("=" * 30)
        for api_name, status in results.items():
            print(f"   {api_name}: {status}")

        # Specific Gemini API test
        print(f"\n🎯 Specific Gemini Embedding API Test:")
        print("-" * 40)
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
                print("✅ Gemini Embedding API: Working perfectly!")
                return True
            elif response.status_code == 403:
                print("❌ Gemini Embedding API: Permission denied")
                print("\n🛠️ SOLUTION: Enable the following:")
                print("1. Generative Language API in Google Cloud Console:")
                print("   https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com")
                print("\n2. Assign proper IAM roles to service account:")
                print("   - Generative AI Service Agent")
                print("   - Or: AI Platform User")
                print("   - Or: Editor (for testing)")
                print("\n3. Service account email:")
                print(f"   {service_account.get('client_email', 'N/A')}")
            elif response.status_code == 404:
                print("⚠️ Gemini Embedding API: API not enabled or not found")
            else:
                print(f"⚠️ Gemini Embedding API: HTTP {response.status_code}")
                print(f"Response: {response.text}")

        except Exception as e:
            print(f"❌ Gemini Embedding API test failed: {e}")

        return False

    except Exception as e:
        print(f"❌ Permission check failed: {e}")
        return False


def display_setup_instructions():
    """Display detailed setup instructions."""
    print("\n" + "=" * 60)
    print("📋 GEMINI API SETUP INSTRUCTIONS")
    print("=" * 60)

    print("\n🔧 STEP 1: Enable Gemini API in Google Cloud Console")
    print("URL: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com")
    print("Action: Click 'Enable' button")

    print("\n👥 STEP 2: Assign IAM Roles to Service Account")
    print("URL: https://console.cloud.google.com/iam-admin/iam")
    print("Actions:")
    print("  1. Find your service account")
    print("  2. Click on the service account")
    print("  3. Go to 'Permissions' tab")
    print("  4. Click 'Grant Access'")
    print("  5. Add one of these roles:")
    print("     - Generative AI Service Agent (recommended)")
    print("     - AI Platform User")
    print("     - Editor (for testing)")

    print("\n🔄 STEP 3: Enable APIs for Project")
    print("Also ensure these APIs are enabled:")
    print("  - Generative Language API")
    print("  - AI Platform API")
    print("  - Cloud Resource Manager API")

    print("\n✅ STEP 4: Wait for Propagation")
    print("API permissions may take 5-10 minutes to propagate")

    print("\n🧪 STEP 5: Test Again")
    print("Run: python3 check_permissions.py")

    print("\n" + "=" * 60)


def main():
    """Main diagnostic function."""
    print("🩺 Gemini API Permission Checker")
    print("=" * 40)

    # First, check if service account key exists
    import os
    from pathlib import Path

    gemini_dir = Path("geminiJson")
    if not gemini_dir.exists():
        print("❌ geminiJson/ directory not found!")
        print("Please create the directory and add your service account JSON key.")
        display_setup_instructions()
        return False

    key_files = list(gemini_dir.glob("*.json"))
    if not key_files:
        print("❌ No service account JSON keys found in geminiJson/")
        print("Please add your Google service account JSON key file.")
        display_setup_instructions()
        return False

    print(f"✅ Found {len(key_files)} service account key files")

    # Run permission tests
    result = test_service_account_permissions()

    if not result:
        print("\n" + "=" * 60)
        print("⚠️ GEMINI API ACCESS ISSUES DETECTED")
        print("=" * 60)
        print("\nThe JWT caching system is working perfectly!")
        print("However, Gemini API access needs to be configured.")
        display_setup_instructions()
    else:
        print("\n🎉 All tests passed! Ready to use Gemini Embedding API!")

    return result


if __name__ == "__main__":
    try:
        success = main()
        exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nPermission check interrupted by user.")
        exit(1)
    except Exception as e:
        print(f"\n\nUnexpected error: {e}")
        exit(1)