"""
Quick verification script for Google OAuth2 JWT functionality.
"""

def test_imports():
    """Test that all modules can be imported successfully."""
    print("Testing module imports...")

    try:
        from google_auth import GoogleAuthenticator, get_vertex_ai_token
        print("✓ google_auth module imported successfully")
    except Exception as e:
        print(f"✗ Failed to import google_auth: {e}")
        return False

    try:
        from vertex_ai_auth import VertexAIAuth, create_vertex_auth, GlobalAuthManager, setup_auth
        print("✓ vertex_ai_auth module imported successfully")
    except Exception as e:
        print(f"✗ Failed to import vertex_ai_auth: {e}")
        return False

    return True

def test_basic_structure():
    """Test basic structure and functionality."""
    print("\nTesting basic structure...")

    try:
        from google_auth import GoogleAuthenticator
        from vertex_ai_auth import create_vertex_auth

        # Test GoogleAuthenticator initialization
        auth = GoogleAuthenticator("geminiJson")
        print("✓ GoogleAuthenticator initialized")

        # Test listing keys
        available_keys = auth.get_available_keys()
        print(f"✓ Available keys: {len(available_keys)} files found")

        # Test VertexAIAuth creation
        if available_keys:
            key_file = available_keys[0]
            vertex_auth = create_vertex_auth(key_file, "geminiJson")
            print("✓ VertexAIAuth instance created")

            # Test service account info loading
            service_info = vertex_auth.get_service_account_info()
            print(f"✓ Service account loaded: {service_info.get('client_email', 'N/A')}")

        return True

    except Exception as e:
        print(f"✗ Structure test failed: {e}")
        return False

def test_dependencies():
    """Test that all required dependencies are available."""
    print("\nTesting dependencies...")

    required_packages = {
        'jwt': 'PyJWT',
        'requests': 'requests',
        'cryptography': 'cryptography'
    }

    all_good = True
    for module, package_name in required_packages.items():
        try:
            __import__(module)
            print(f"PASS: {package_name} is available")
        except ImportError:
            print(f"FAIL: {package_name} is missing")
            all_good = False

    return all_good

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
            print(f"PASS: {file} exists")
        else:
            print(f"FAIL: {file} missing")
            all_good = False

    for dir in required_dirs:
        if os.path.isdir(dir):
            print(f"✓ {dir}/ directory exists")
        else:
            print(f"✗ {dir}/ directory missing")
            all_good = False

    return all_good

def main():
    """Run all verification tests."""
    print("Google OAuth2 JWT Project Verification")
    print("=" * 50)

    tests = [
        ("Dependencies", test_dependencies),
        ("Module Imports", test_imports),
        ("File Structure", test_file_structure),
        ("Basic Structure", test_basic_structure)
    ]

    results = []

    for test_name, test_func in tests:
        print(f"\n--- {test_name} ---")
        try:
            result = test_func()
            results.append((test_name, result))
            status = "PASSED" if result else "FAILED"
            print(f"{test_name}: {status}")
        except Exception as e:
            print(f"✗ {test_name} failed with exception: {e}")
            results.append((test_name, False))

    print("\n" + "=" * 50)
    print("Verification Results:")
    passed = 0
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"  {test_name}: {status}")
        if result:
            passed += 1

    total = len(results)
    print(f"\nOverall: {passed}/{total} tests passed")

    if passed == total:
        print("\n🎉 All tests passed! The project is ready to use.")
        print("\nNext steps:")
        print("1. Add your Google service account JSON files to the 'geminiJson/' directory")
        print("2. Run 'python simple_test.py' to test with real keys")
        print("3. Import the modules in your other Python applications")
    else:
        print("\n⚠️  Some tests failed. Please check the output above.")

    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)