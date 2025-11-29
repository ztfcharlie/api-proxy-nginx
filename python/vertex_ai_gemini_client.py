#!/usr/bin/env python3
"""
Vertex AI Gemini Client for Text Generation and Embeddings

This script demonstrates how to use Google Vertex AI service account JSON
to call Gemini models:
1. gemini-3-pro-preview for text generation
2. gemini-embedding-001 for embeddings
"""

import json
import requests
import time
from google_auth import GoogleAuthenticator
from typing import List, Dict, Any, Optional


class VertexAIGeminiClient:
    """Client for Vertex AI Gemini models using service account authentication."""

    def __init__(self, service_account_file: str, project_id: str, location: str = "us-central1"):
        """
        Initialize the Vertex AI Gemini client.

        Args:
            service_account_file: Path to service account JSON file
            project_id: Google Cloud project ID
            location: Vertex AI location (default: us-central1)
        """
        self.service_account_file = service_account_file
        self.project_id = project_id
        self.location = location

        # Initialize authenticator with Vertex AI scopes
        self.auth = GoogleAuthenticator("geminiJson", enable_persistent_cache=True)

        # Vertex AI endpoints
        self.base_url = f"https://{location}-aiplatform.googleapis.com/v1"
        self.project_path = f"projects/{project_id}/locations/{location}"

        print(f"[INIT] Vertex AI Gemini Client initialized")
        print(f"[INIT] Project: {project_id}")
        print(f"[INIT] Location: {location}")
        print(f"[INIT] Base URL: {self.base_url}")

    def _get_access_token(self) -> str:
        """Get access token for Vertex AI API."""
        # Use Vertex AI specific scopes
        scopes = [
            'https://www.googleapis.com/auth/cloud-platform',
            'https://www.googleapis.com/auth/generative-language'
        ]

        token_info = self.auth.get_access_token(
            self.service_account_file,
            scopes=scopes
        )
        return token_info['access_token']

    def _make_request(self, endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Make authenticated request to Vertex AI API."""
        token = self._get_access_token()

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        url = f"{self.base_url}/{endpoint}"

        print(f"\n[REQUEST] Making request to: {url}")
        print(f"[HEADERS] Authorization: Bearer {token[:50]}...")
        print(f"[PAYLOAD] {json.dumps(payload, indent=2)}")

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=60)

            print(f"\n[RESPONSE] Status: {response.status_code}")
            print(f"[RESPONSE] Headers: {dict(response.headers)}")

            if response.status_code == 200:
                result = response.json()
                print(f"[SUCCESS] Response received")
                return result
            else:
                print(f"[ERROR] Request failed: {response.status_code}")
                print(f"[ERROR] Response: {response.text}")
                response.raise_for_status()

        except requests.exceptions.RequestException as e:
            print(f"[ERROR] Request exception: {e}")
            raise

    def generate_text(self, prompt: str, model: str = "gemini-3-pro-preview") -> Dict[str, Any]:
        """
        Generate text using Gemini model.

        Args:
            prompt: Input text prompt
            model: Model name (default: gemini-3-pro-preview)

        Returns:
            Generated text response
        """
        print(f"\n*** Generating Text with {model} ***")
        print("=" * 60)

        endpoint = f"{self.project_path}/publishers/google/models/{model}:generateContent"

        payload = {
            "contents": [{
                "role": "user",
                "parts": [{
                    "text": prompt
                }]
            }],
            "generationConfig": {
                "temperature": 0.7,
                "topP": 0.8,
                "topK": 40,
                "maxOutputTokens": 2048
            }
        }

        # Add thinking config for gemini-3-pro-preview
        if "3-pro-preview" in model:
            payload["generationConfig"]["thinkingConfig"] = {
                "thinkingLevel": "low"
            }

        result = self._make_request(endpoint, payload)

        # Extract generated text
        if 'candidates' in result and result['candidates']:
            candidate = result['candidates'][0]
            if 'content' in candidate and 'parts' in candidate['content']:
                generated_text = candidate['content']['parts'][0]['text']
                print(f"\n[GENERATED] Text:")
                print("=" * 40)
                print(generated_text)

                # Show thinking process if available
                if 'thinking' in candidate:
                    print(f"\n[THINKING] Process:")
                    print("=" * 40)
                    print(candidate['thinking'])

        return result

    def get_embeddings(self, texts: List[str], model: str = "gemini-embedding-001") -> Dict[str, Any]:
        """
        Get embeddings for text using Gemini embedding model.

        Args:
            texts: List of texts to embed
            model: Embedding model name (default: gemini-embedding-001)

        Returns:
            Embeddings response
        """
        print(f"\n*** Getting Embeddings with {model} ***")
        print("=" * 60)

        endpoint = f"{self.project_path}/publishers/google/models/{model}:predict"

        # Prepare instances for embedding
        instances = []
        for text in texts:
            instances.append({
                "content": text,
                "task_type": "RETRIEVAL_DOCUMENT"  # or RETRIEVAL_QUERY, SEMANTIC_SIMILARITY, etc.
            })

        payload = {
            "instances": instances
        }

        result = self._make_request(endpoint, payload)

        # Extract embeddings
        if 'predictions' in result:
            print(f"\n[EMBEDDINGS] Generated {len(result['predictions'])} embeddings")
            for i, prediction in enumerate(result['predictions']):
                if 'embeddings' in prediction:
                    embedding = prediction['embeddings']['values']
                    print(f"[EMBEDDING {i+1}] Text: {texts[i][:50]}...")
                    print(f"[EMBEDDING {i+1}] Dimension: {len(embedding)}")
                    print(f"[EMBEDDING {i+1}] First 5 values: {embedding[:5]}")

        return result

    def test_connection(self) -> bool:
        """Test connection to Vertex AI."""
        print("\n*** Testing Vertex AI Connection ***")
        print("=" * 50)

        try:
            token = self._get_access_token()
            print(f"[OK] Access token obtained: {token[:50]}...")

            # Test with a simple text generation
            result = self.generate_text("Hello, how are you?")

            if 'candidates' in result:
                print(f"[OK] Connection test successful")
                return True
            else:
                print(f"[ERROR] Unexpected response format")
                return False

        except Exception as e:
            print(f"[ERROR] Connection test failed: {e}")
            return False


def demo_vertex_ai_gemini():
    """Demonstrate Vertex AI Gemini usage."""
    print("*** Vertex AI Gemini Demo ***")
    print("=" * 50)

    # You need to set your project ID here
    PROJECT_ID = "carbide-team-478005-f8"  # Replace with your project ID
    SERVICE_ACCOUNT_FILE = "service-account.json"

    try:
        # Initialize client
        client = VertexAIGeminiClient(
            service_account_file=SERVICE_ACCOUNT_FILE,
            project_id=PROJECT_ID,
            location="us-central1"
        )

        # Test connection
        if not client.test_connection():
            print("[ERROR] Connection test failed, stopping demo")
            return False

        # Demo 1: Text Generation with gemini-3-pro-preview
        print("\n" + "="*80)
        print("DEMO 1: Text Generation with gemini-3-pro-preview")
        print("="*80)

        prompts = [
            "Explain how artificial intelligence works in simple terms",
            "Write a short poem about technology",
            "What are the benefits of renewable energy?"
        ]

        for i, prompt in enumerate(prompts, 1):
            print(f"\n--- Text Generation Example {i} ---")
            print(f"Prompt: {prompt}")

            try:
                result = client.generate_text(prompt, "gemini-3-pro-preview")
                print(f"[SUCCESS] Text generation {i} completed")
            except Exception as e:
                print(f"[ERROR] Text generation {i} failed: {e}")

        # Demo 2: Embeddings with gemini-embedding-001
        print("\n" + "="*80)
        print("DEMO 2: Embeddings with gemini-embedding-001")
        print("="*80)

        embedding_texts = [
            "Artificial intelligence is transforming the world",
            "Machine learning algorithms can process vast amounts of data",
            "Natural language processing enables computers to understand human language",
            "Computer vision allows machines to interpret visual information"
        ]

        try:
            result = client.get_embeddings(embedding_texts, "gemini-embedding-001")
            print(f"[SUCCESS] Embeddings generation completed")
        except Exception as e:
            print(f"[ERROR] Embeddings generation failed: {e}")

        return True

    except Exception as e:
        print(f"[ERROR] Demo failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("*** Vertex AI Gemini Client Demo ***")
    print("This script demonstrates:")
    print("1. Text generation with gemini-3-pro-preview")
    print("2. Embeddings with gemini-embedding-001")
    print("3. Using service account JSON authentication")
    print("")

    success = demo_vertex_ai_gemini()

    if success:
        print("\n[SUCCESS] All demos completed successfully!")
    else:
        print("\n[FAILED] Some demos failed - check error messages above")
        print("\n[TROUBLESHOOTING]:")
        print("1. Ensure your service account JSON is in geminiJson/")
        print("2. Verify your project ID is correct")
        print("3. Check that Vertex AI API is enabled in your project")
        print("4. Ensure your service account has Vertex AI permissions")
        print("5. Verify the models are available in your region")

    exit(0 if success else 1)