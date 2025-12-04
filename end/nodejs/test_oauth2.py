#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests
import json
import base64
import secrets
import hashlib
import time

class OAuth2Tester:
    def __init__(self, base_url="http://47.239.10.174:8889"):
        self.base_url = base_url
        self.session = requests.Session()

    def test_health(self):
        """测试服务健康状态"""
        print("1️⃣ 测试服务健康状态")
        try:
            response = self.session.get(f"{self.base_url}/health")
            print(f"状态码: {response.status_code}")
            print(f"响应: {response.json()}")
            return True
        except Exception as e:
            print(f"❌ 健康检查失败: {e}")
            return False

    def test_get_certs(self):
        """测试获取Google OAuth2公钥证书"""
        print("\n2️⃣ 测试获取Google OAuth2公钥证书")
        try:
            response = self.session.get(f"{self.base_url}/accounts.google.com/oauth2/v1/certs")
            print(f"状态码: {response.status_code}")
            print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
            return True
        except Exception as e:
            print(f"❌ 获取证书失败: {e}")
            return False

    def test_client_credentials(self):
        """测试Client Credentials授权类型"""
        print("\n3️⃣ 测试Client Credentials授权类型")
        try:
            data = {
                "grant_type": "client_credentials",
                "client_id": "test-client-id",
                "client_secret": "test-client-secret",
                "scope": "https://www.googleapis.com/auth/cloud-platform"
            }
            response = self.session.post(
                f"{self.base_url}/accounts.google.com/oauth2/token",
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            print(f"状态码: {response.status_code}")
            print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
            return True
        except Exception as e:
            print(f"❌ Client Credentials测试失败: {e}")
            return False

    def test_authorization_code(self):
        """测试Authorization Code授权类型"""
        print("\n4️⃣ 测试Authorization Code授权类型")
        try:
            # 生成PKCE code verifier和challenge
            code_verifier = secrets.token_urlsafe(64)
            code_challenge = base64.urlsafe_b64encode(
                hashlib.sha256(code_verifier.encode()).digest()
            ).decode().rstrip("=")

            data = {
                "grant_type": "authorization_code",
                "code": "mock-auth-code",
                "redirect_uri": "http://localhost:8080/callback",
                "client_id": "test-client-id",
                "code_verifier": code_verifier
            }
            response = self.session.post(
                f"{self.base_url}/accounts.google.com/oauth2/token",
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            print(f"状态码: {response.status_code}")
            print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
            return True
        except Exception as e:
            print(f"❌ Authorization Code测试失败: {e}")
            return False

    def test_refresh_token(self):
        """测试Refresh Token授权类型"""
        print("\n5️⃣ 测试Refresh Token授权类型")
        try:
            data = {
                "grant_type": "refresh_token",
                "refresh_token": "mock-refresh-token",
                "client_id": "test-client-id",
                "client_secret": "test-client-secret"
            }
            response = self.session.post(
                f"{self.base_url}/accounts.google.com/oauth2/token",
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            print(f"状态码: {response.status_code}")
            print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
            return True
        except Exception as e:
            print(f"❌ Refresh Token测试失败: {e}")
            return False

    def test_jwt_bearer(self):
        """测试JWT Bearer授权类型"""
        print("\n6️⃣ 测试JWT Bearer授权类型")
        try:
            data = {
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": "mock-jwt-assertion",
                "scope": "https://www.googleapis.com/auth/cloud-platform"
            }
            response = self.session.post(
                f"{self.base_url}/accounts.google.com/oauth2/token",
                data=data,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Authorization": "Bearer mock-jwt-token"
                }
            )
            print(f"状态码: {response.status_code}")
            print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
            return True
        except Exception as e:
            print(f"❌ JWT Bearer测试失败: {e}")
            return False

    def test_invalid_grant(self):
        """测试无效的授权类型"""
        print("\n7️⃣ 测试无效的授权类型")
        try:
            data = {
                "grant_type": "invalid_grant",
                "client_id": "test-client-id"
            }
            response = self.session.post(
                f"{self.base_url}/accounts.google.com/oauth2/token",
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            print(f"状态码: {response.status_code}")
            print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
            return True
        except Exception as e:
            print(f"❌ 无效授权类型测试失败: {e}")
            return False

    def run_all_tests(self):
        """运行所有测试"""
        print("🔐 OAuth2 模拟服务测试")
        print("=====================")
        print(f"服务地址: {self.base_url}")
        print("")

        tests = [
            self.test_health,
            self.test_get_certs,
            self.test_client_credentials,
            self.test_authorization_code,
            self.test_refresh_token,
            self.test_jwt_bearer,
            self.test_invalid_grant
        ]

        passed = 0
        total = len(tests)

        for test in tests:
            if test():
                passed += 1
            time.sleep(1)  # 避免请求过快

        print("\n✅ 测试完成！")
        print("=====================")
        print(f"📊 测试结果: {passed}/{total} 通过")

if __name__ == "__main__":
    tester = OAuth2Tester()
    tester.run_all_tests()