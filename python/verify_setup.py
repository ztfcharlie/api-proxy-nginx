#!/usr/bin/env python3
"""
Setup verification script for Google OAuth2 JWT Project.
"""

def test_dependencies():
    """Test that all required dependencies are available."""
    print("Testing dependencies...")

    required_packages = {
        'jwt': 'PyJWT',
        'requests': 'requests',
        'cryptography': 'cryptography'
    }

    all_good = True
    for module, package_name in required_packages.items():
        try:
            __import__(module)
            print(f"  PASS: {package_name} is available")
        except ImportError:
            print(f"  FAIL: {package_name} is missing")
            all_good = False

    return all_good

def test_imports():
    """Test that all modules can be imported successfully."""
    print("\nTesting module imports...")

    try:
        from google_auth import GoogleAuthenticator, get_vertex_ai_token
        print("  PASS: google_auth module imported successfully")
    except Exception as e:
        print(f"  FAIL: Failed to import google_auth: {e}")
        return False

    try:
        from vertex_ai_auth import VertexAIAuth, create_vertex_auth, GlobalAuthManager, setup_auth
        print("  PASS: vertex_ai_auth module imported successfully")
    except Exception as e:
        print(f"  FAIL: Failed to import vertex_ai_auth: {e}")
        return False

    return True

def test_file_structure():
    """Test that all required files exist."""
    print("\nTesting file structure...")

    import os

    required_files = [
        'google_auth.py',
        'vertex_ai_auth.py',
        'requirements.txt',
        'README.md',
        'CLAUDE.md'
    ]

    required_dirs = [
        'geminiJson'
    ]

    all_good = True

    for file in required_files:
        if os.path.exists(file):
            print(f"  PASS: {file} exists")
        else:
            print(f"  FAIL: {file} missing")
            all_good = False

    for dir in required_dirs:
        if os.path.isdir(dir):
            print(f"  PASS: {dir}/ directory exists")
        else:
            print(f"  FAIL: {dir}/ directory missing")
            all_good = False

    return all_good

def test_basic_functionality():
    """Test basic functionality."""
    print("\nTesting basic functionality...")

    try:
        from google_auth import GoogleAuthenticator
        from vertex_ai_auth import create_vertex_auth

        # Test GoogleAuthenticator initialization
        auth = GoogleAuthenticator("geminiJson")
        print("  PASS: GoogleAuthenticator initialized")

        # Test listing keys
        available_keys = auth.get_available_keys()
        print(f"  PASS: Found {len(available_keys)} key files")

        # Test VertexAIAuth creation
        if available_keys:
            key_file = available_keys[0]
            vertex_auth = create_vertex_auth(key_file, "geminiJson")
            print("  PASS: VertexAIAuth instance created")

            # Test service account info loading
            service_info = vertex_auth.get_service_account_info()
            print(f"  PASS: Service account loaded: {service_info.get('client_email', 'N/A')}")
        else:
            print("  INFO: No key files found - this is normal for initial setup")

        return True

    except Exception as e:
        print(f"  FAIL: Basic functionality test failed: {e}")
        return False

def main():
    """Run all verification tests."""
    print("Google OAuth2 JWT Project Verification")
    print("=" * 50)

    tests = [
        ("Dependencies", test_dependencies),
        ("Module Imports", test_imports),
        ("File Structure", test_file_structure),
        ("Basic Functionality", test_basic_functionality)
    ]

    results = []

    for test_name, test_func in tests:
        print(f"\n--- {test_name} ---")
        try:
            result = test_func()
            results.append((test_name, result))
            status = "PASSED" if result else "FAILED"
            print(f"Result: {test_name}: {status}")
        except Exception as e:
            print(f"Exception in {test_name}: {e}")
            results.append((test_name, False))

    print("\n" + "=" * 50)
    print("Verification Summary:")
    passed = 0
    for test_name, result in results:
        status = "PASSED" if result else "FAILED"
        print(f"  {test_name}: {status}")
        if result:
            passed += 1

    total = len(results)
    print(f"\nOverall: {passed}/{total} tests passed")

    if passed == total:
        print("\nSUCCESS: All tests passed! The project is ready to use.")
        print("\nNext steps:")
        print("1. Add your Google service account JSON files to 'geminiJson/' directory")
        print("2. Run 'python simple_test.py' to test with real keys")
        print("3. Import modules in your other Python applications")
        print("\nExample usage:")
        print("  from vertex_ai_auth import setup_auth")
        print("  auth = setup_auth('your-key.json', 'geminiJson')")
        print("  token = auth.get_token()")
    else:
        print("\nWARNING: Some tests failed. Please check the output above.")

    return passed == total

if __name__ == "__main__":
    try:
        success = main()
        exit_code = 0 if success else 1
        exit(exit_code)
    except KeyboardInterrupt:
        print("\n\nVerification interrupted by user.")
        exit(1)
    except Exception as e:
        print(f"\n\nUnexpected error during verification: {e}")
        exit(1)