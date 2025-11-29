#!/usr/bin/env python3
"""
Simple Vertex AI Gemini Test Script

Quick test for:
1. gemini-3-pro-preview text generation
2. gemini-embedding-001 embeddings
"""

import json
import requests
from google_auth import GoogleAuthenticator


def test_vertex_ai_gemini():
    """Simple test of Vertex AI Gemini models."""
    print("*** Simple Vertex AI Gemini Test ***")
    print("=" * 50)

    # Configuration
    PROJECT_ID = "carbide-team-478005-f8"  # Your project ID
    LOCATION = "us-central1"
    SERVICE_ACCOUNT_FILE = "service-account.json"

    # Initialize authenticator
    auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)

    try:
        # Get access token
        print("[AUTH] Getting access token...")
        scopes = ['https://www.googleapis.com/auth/cloud-platform']
        token_info = auth.get_access_token(SERVICE_ACCOUNT_FILE, scopes=scopes)
        token = token_info['access_token']
        print(f"[OK] Token obtained: {token[:50]}...")

        # Test 1: Text Generation with gemini-3-pro-preview
        print(f"\n[TEST 1] Testing gemini-3-pro-preview text generation")
        print("-" * 60)

        text_url = f"https://{LOCATION}-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{LOCATION}/publishers/google/models/gemini-3-pro-preview:generateContent"

        text_headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        text_payload = {
            "contents": [{
                "role": "user",
                "parts": [{
                    "text": "Hello! How does AI work?"
                }]
            }],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 1024,
                "thinkingConfig": {
                    "thinkingLevel": "low"
                }
            }
        }

        print(f"[REQUEST] URL: {text_url}")
        print(f"[REQUEST] Payload: {json.dumps(text_payload, indent=2)}")

        response = requests.post(text_url, headers=text_headers, json=text_payload, timeout=60)

        print(f"[RESPONSE] Status: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print(f"[SUCCESS] Text generation successful")

            if 'candidates' in result and result['candidates']:
                candidate = result['candidates'][0]
                if 'content' in candidate and 'parts' in candidate['content']:
                    generated_text = candidate['content']['parts'][0]['text']
                    print(f"\n[GENERATED TEXT]:")
                    print("=" * 40)
                    print(generated_text)

                    if 'thinking' in candidate:
                        print(f"\n[THINKING PROCESS]:")
                        print("=" * 40)
                        print(candidate['thinking'])
        else:
            print(f"[ERROR] Text generation failed: {response.status_code}")
            print(f"[ERROR] Response: {response.text}")

        # Test 2: Embeddings with gemini-embedding-001
        print(f"\n[TEST 2] Testing gemini-embedding-001 embeddings")
        print("-" * 60)

        embed_url = f"https://{LOCATION}-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{LOCATION}/publishers/google/models/gemini-embedding-001:predict"

        embed_payload = {
            "instances": [
                {
                    "content": "Artificial intelligence is transforming technology",
                    "task_type": "RETRIEVAL_DOCUMENT"
                },
                {
                    "content": "Machine learning enables computers to learn from data",
                    "task_type": "RETRIEVAL_DOCUMENT"
                }
            ]
        }

        print(f"[REQUEST] URL: {embed_url}")
        print(f"[REQUEST] Payload: {json.dumps(embed_payload, indent=2)}")

        response = requests.post(embed_url, headers=text_headers, json=embed_payload, timeout=60)

        print(f"[RESPONSE] Status: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print(f"[SUCCESS] Embeddings generation successful")

            if 'predictions' in result:
                print(f"\n[EMBEDDINGS RESULTS]:")
                print("=" * 40)
                for i, prediction in enumerate(result['predictions']):
                    if 'embeddings' in prediction:
                        embedding = prediction['embeddings']['values']
                        print(f"Embedding {i+1}: Dimension {len(embedding)}")
                        print(f"First 5 values: {embedding[:5]}")
        else:
            print(f"[ERROR] Embeddings generation failed: {response.status_code}")
            print(f"[ERROR] Response: {response.text}")

        return True

    except Exception as e:
        print(f"[ERROR] Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_vertex_ai_gemini()

    if success:
        print(f"\n[SUCCESS] Vertex AI Gemini test completed!")
    else:
        print(f"\n[FAILED] Test failed - check errors above")

    exit(0 if success else 1)