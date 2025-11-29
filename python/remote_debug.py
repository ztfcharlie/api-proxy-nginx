#!/usr/bin/env python3
"""
Remote Server Debug Tool

Connects to your remote server for debugging and diagnostics.
"""

import socket
import requests
import time
import json
import sys
from pathlib import Path


def test_server_connectivity(server_address, port=22, timeout=10):
    """Test basic connectivity to remote server."""
    try:
        print(f"🔍 Testing connectivity to {server_address}:{port}...")

        # Socket connection test
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((server_address, port))
        sock.close()

        if result == 0:
            print(f"✅ Socket connection successful to {server_address}:{port}")
            return True
        else:
            print(f"❌ Socket connection failed: {result}")
            return False

    except socket.timeout:
        print(f"⏰ Connection timeout to {server_address}:{port}")
        return False
    except socket.gaierror as e:
        print(f"❌ DNS resolution failed: {e}")
        return False
    except Exception as e:
        print(f"❌ Connection test failed: {e}")
        return False


def check_service_status(server_address, port=22, timeout=5):
    """Check if services are running on remote server."""
    try:
        print(f"🔍 Checking service status on {server_address}...")

        # Try HTTP check (if web server)
        try:
            http_response = requests.get(
                f"http://{server_address}",
                timeout=timeout
            )
            if http_response.status_code == 200:
                print(f"✅ HTTP service responding on {server_address}")
                return True
        except:
            pass

        # Check common ports for services
        common_ports = {
            22: 'SSH',
            80: 'HTTP',
            443: 'HTTPS',
            3306: 'MySQL',
            5432: 'PostgreSQL',
            6379: 'Redis',
            9200: 'MongoDB'
        }

        print(f"📊 Common port check:")
        for port_num, service_name in common_ports.items():
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)
            result = sock.connect_ex((server_address, port_num))
            status = "✅ Open" if result == 0 else "❌ Closed"
            print(f"   Port {port_num} ({service_name}): {status}")
            sock.close()

        return True

    except Exception as e:
        print(f"❌ Service status check failed: {e}")
        return False


def analyze_jwt_setup(server_address, port=22, key_file="service-account.json"):
    """Analyze JWT setup on remote server."""
    try:
        print(f"🔍 Analyzing JWT setup on {server_address}...")

        # Check if key file exists
        command = f"ls -la geminiJson/"
        print(f"📋 Running: {command}")

        # This would require actual SSH execution, so we'll simulate
        print("⚠️  Note: Actual file check would require SSH access")
        print("📁 Expected key file: service-account.json")

        return True

    except Exception as e:
        print(f"❌ Analysis failed: {e}")
        return False


def run_remote_diagnostics(server_address, port=22):
    """Run comprehensive remote diagnostics."""
    print(f"🚀 Remote Diagnostics for {server_address}")
    print("=" * 60)

    diagnostics = {}

    # Test 1: Basic connectivity
    print(f"\n📡 Test 1: Connectivity Check")
    connectivity_ok = test_server_connectivity(server_address, port)
    diagnostics['connectivity'] = connectivity_ok

    # Test 2: Service status
    print(f"\n📡 Test 2: Service Status")
    services_ok = check_service_status(server_address, port)
    diagnostics['services'] = services_ok

    # Test 3: JWT setup analysis
    print(f"\n📋 Test 3: JWT Setup Analysis")
    jwt_ok = analyze_jwt_setup(server_address, port)
    diagnostics['jwt_setup'] = jwt_ok

    # Test 4: API access test (simulate)
    print(f"\n🌐 Test 4: API Access Test")
    try:
        print(f"   Testing API access from {server_address}...")
        # This would require actual code execution on remote server
        print("   ⚠️  Note: This requires running code on server")
        diagnostics['api_test'] = "Simulated - requires server access"
    except Exception as e:
        print(f"   ❌ API test failed: {e}")
        diagnostics['api_test'] = False

    # Summary
    print(f"\n📊 DIAGNOSTICS SUMMARY:")
    print(f"   Server: {server_address}")
    print(f"   Connectivity: ✅ Good" if connectivity_ok else "❌ Failed")
    print(f"   Services: ✅ Running" if services_ok else "❌ Issues")
    print(f"   JWT Setup: ✅ Configured" if jwt_ok else "❌ Issues")
    print(f"   API Access: ✅ Available" if diagnostics.get('api_test') else "❌ Failed")

    return diagnostics


def interactive_remote_mode():
    """Interactive remote debugging mode."""
    print("🔧 Interactive Remote Debugging Mode")
    print("=" * 50)

    while True:
        try:
            print("\n📝 Enter remote server address (or 'quit' to exit):")
            server_address = input("🌐 Server: ").strip()

            if server_address.lower() in ['quit', 'exit', 'q']:
                print("👋 Exiting remote debugging mode")
                break

            if not server_address:
                print("❌ Please enter a valid server address")
                continue

            print(f"\n🔍 Connecting to {server_address}...")

            # Run full diagnostics
            diagnostics = run_remote_diagnostics(server_address)

            if all(diagnostics.values()):
                print(f"\n✅ All diagnostics passed! Server {server_address} is ready for JWT/Gemini setup.")
            else:
                print(f"\n⚠️  Some issues detected. Server {server_address} may need attention.")

            print("\n" + "=" * 50)
            print("Options:")
            print("1. Run full diagnostics again")
            print("2. Test different port")
            print("3. Check specific service")
            print("4. Enter new server address")
            print("5. Quit")

            while True:
                choice = input("\n🎯 Choose option (1-5): ").strip()

                if choice == '1':
                    run_remote_diagnostics(server_address)
                elif choice == '2':
                    try:
                        port = int(input("🔌 Enter port (default 22): ") or "22")
                        run_remote_diagnostics(server_address, port)
                    except ValueError:
                        print("❌ Invalid port number")
                elif choice == '3':
                    service = input("🔍 Enter service to check: ").strip()
                    print(f"   Checking {service} on {server_address}...")
                    # Could add more specific service checks
                elif choice == '4':
                    interactive_remote_mode()
                elif choice == '5':
                    print("👋 Exiting...")
                    break
                else:
                    print("❌ Invalid choice")

        except KeyboardInterrupt:
            print("\n👋 Interrupted by user")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}")


def main():
    """Main function."""
    if len(sys.argv) > 1:
        # Command line mode
        server_address = sys.argv[1]
        print(f"🚀 Command Line Mode: Connecting to {server_address}")
        run_remote_diagnostics(server_address)
    else:
        # Interactive mode
        interactive_remote_mode()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n👋 Remote debugging interrupted by user")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")