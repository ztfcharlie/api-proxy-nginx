"""
Gemini API Client Module

This module provides a client for Google Gemini APIs using OAuth2 JWT tokens
generated from service account keys. Supports embedding generation and other Gemini API calls.
"""

import json
import requests
import time
from typing import Dict, Any, Optional, List
from google_auth import GoogleAuthenticator, get_vertex_ai_token
from vertex_ai_auth import setup_auth


class GeminiClient:
    """
    A client for Google Gemini APIs with automatic authentication.
    """

    # Gemini API base URLs
    GEMINI_API_BASE = "https://generativelanguage.googleapis.com"
    AISTUDIO_API_BASE = "https://aistudio.googleapis.com"

    def __init__(self,
                 key_filename: str,
                 keys_directory: str = "geminiJson",
                 use_persistent_cache: bool = True,
                 model: str = "gemini-embedding-001"):
        """
        Initialize Gemini API client.

        Args:
            key_filename (str): Name of the Google service account JSON key file
            keys_directory (str): Directory containing the key files
            use_persistent_cache (bool): Whether to use persistent token caching
            model (str): Default Gemini model to use
        """
        self.key_filename = key_filename
        self.keys_directory = keys_directory
        self.model = model

        # Initialize authentication
        self.auth = GoogleAuthenticator(
            keys_directory=keys_directory,
            enable_persistent_cache=use_persistent_cache
        )

        # API endpoints
        self.endpoints = {
            'embed_content': f"{self.GEMINI_API_BASE}/v1beta/models/{model}:embedContent",
            'models': f"{self.GEMINI_API_BASE}/v1beta/models",
            'text': f"{self.GEMINI_API_BASE}/v1beta/models/{model}:generateContent",
            'chat': f"{self.GEMINI_API_BASE}/v1beta/models/{model}:generateContent"
        }

    def get_access_token(self, scopes: Optional[List[str]] = None) -> str:
        """
        Get a valid access token for Gemini API calls.

        Args:
            scopes (List[str], optional): Custom OAuth2 scopes

        Returns:
            str: Valid access token
        """
        if scopes is None:
            scopes = ['https://www.googleapis.com/auth/cloud-platform']

        token_info = self.auth.get_access_token(
            self.key_filename,
            scopes=scopes,
            use_cache=True
        )

        return token_info['access_token']

    def get_auth_headers(self, scopes: Optional[List[str]] = None) -> Dict[str, str]:
        """
        Get authentication headers for API requests.

        Args:
            scopes (List[str], optional): Custom OAuth2 scopes

        Returns:
            Dict[str, str]: Headers with Authorization
        """
        token = self.get_access_token(scopes)
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    def embed_content(self,
                    text: str,
                    task_type: str = "RETRIEVAL_DOCUMENT",
                    title: Optional[str] = None,
                    title_lang: str = "en",
                    text_lang: str = "en") -> Dict[str, Any]:
        """
        Generate embeddings for text content.

        Args:
            text (str): Text to generate embeddings for
            task_type (str): Type of embedding task (RETRIEVAL_DOCUMENT, RETRIEVAL_QUERY, etc.)
            title (str, optional): Title for document embedding
            title_lang (str): Language code for title
            text_lang (str): Language code for text

        Returns:
            Dict[str, Any]: Embedding response from Gemini API

        Raises:
            requests.RequestException: If API request fails
        """
        # Prepare request payload
        payload = {
            "model": f"models/{self.model}",
            "content": {
                "parts": [{"text": text}]
            }
        }

        # Add optional parameters for document embeddings
        if task_type == "RETRIEVAL_DOCUMENT" and title:
            payload["content"]["parts"][0]["title"] = title
            payload["content"]["parts"][0]["title_lang"] = title_lang
            payload["content"]["parts"][0]["text_lang"] = text_lang

        try:
            headers = self.get_auth_headers()
            response = requests.post(
                self.endpoints['embed_content'],
                headers=headers,
                json=payload,
                timeout=30
            )

            response.raise_for_status()
            return response.json()

        except requests.exceptions.RequestException as e:
            if e.response:
                error_data = e.response.json() if e.response.headers.get('content-type', '').startswith('application/json') else e.response.text
                raise requests.exceptions.RequestException(
                    f"Gemini Embedding API error: {e.response.status_code} - {error_data}"
                ) from e
            raise requests.exceptions.RequestException(f"Gemini Embedding API network error: {e}") from e

    def get_embedding_values(self,
                          text: str,
                          task_type: str = "RETRIEVAL_DOCUMENT",
                          **kwargs) -> List[float]:
        """
        Get embedding values as a list of floats.

        Args:
            text (str): Text to generate embeddings for
            task_type (str): Type of embedding task
            **kwargs: Additional parameters for embed_content

        Returns:
            List[float]: Embedding vector values

        Raises:
            ValueError: If embedding generation fails
        """
        try:
            response = self.embed_content(text, task_type, **kwargs)

            # Extract embedding values from response
            embedding = response.get('embedding', {})
            values = embedding.get('values', [])

            if not values:
                raise ValueError("No embedding values found in API response")

            return values

        except Exception as e:
            raise ValueError(f"Failed to generate embeddings: {e}") from e

    def batch_embed_content(self,
                         texts: List[str],
                         task_type: str = "RETRIEVAL_DOCUMENT",
                         batch_size: int = 10) -> List[Dict[str, Any]]:
        """
        Generate embeddings for multiple texts in batches.

        Args:
            texts (List[str]): List of texts to generate embeddings for
            task_type (str): Type of embedding task
            batch_size (int): Number of texts to process in each batch

        Returns:
            List[Dict[str, Any]]: List of embedding responses
        """
        results = []

        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i:i + batch_size]

            for text in batch_texts:
                try:
                    result = self.embed_content(text, task_type)
                    results.append({
                        'text': text,
                        'embedding': result,
                        'success': True,
                        'error': None
                    })
                except Exception as e:
                    results.append({
                        'text': text,
                        'embedding': None,
                        'success': False,
                        'error': str(e)
                    })

        return results

    def get_model_info(self, model: Optional[str] = None) -> Dict[str, Any]:
        """
        Get information about available Gemini models.

        Args:
            model (str, optional): Specific model to get info for

        Returns:
            Dict[str, Any]: Model information
        """
        try:
            headers = self.get_auth_headers()

            if model:
                # Get specific model info
                url = f"{self.GEMINI_API_BASE}/v1beta/models/{model}"
            else:
                # Get list of all models
                url = f"{self.GEMINI_API_BASE}/v1beta/models"

            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            return response.json()

        except requests.exceptions.RequestException as e:
            if e.response:
                error_data = e.response.json() if e.response.headers.get('content-type', '').startswith('application/json') else e.response.text
                raise requests.exceptions.RequestException(
                    f"Gemini Model API error: {e.response.status_code} - {error_data}"
                ) from e
            raise requests.exceptions.RequestException(f"Gemini Model API network error: {e}") from e

    def get_available_models(self) -> List[str]:
        """
        Get list of available Gemini models.

        Returns:
            List[str]: List of model names
        """
        models_info = self.get_model_info()
        models = []

        if 'models' in models_info:
            for model in models_info['models']:
                models.append(model.get('name', '').split('/')[-1])

        return models

    def test_connection(self) -> Dict[str, Any]:
        """
        Test connection to Gemini API with current authentication.

        Returns:
            Dict[str, Any]: Test results including token info
        """
        test_results = {
            'timestamp': time.time(),
            'success': False,
            'token_valid': False,
            'api_reachable': False,
            'errors': []
        }

        try:
            # Test token
            token_info = self.auth.get_access_token(self.key_filename)
            test_results['token_valid'] = True
            test_results['token_expires_at'] = token_info.get('expires_at', 'unknown')

            # Test API connection
            try:
                models_info = self.get_model_info()
                test_results['api_reachable'] = True
                test_results['available_models_count'] = len(models_info.get('models', []))
                test_results['success'] = True
            except Exception as e:
                test_results['errors'].append(f"API connection failed: {e}")

        except Exception as e:
            test_results['errors'].append(f"Authentication failed: {e}")

        return test_results

    def get_cache_info(self) -> Dict[str, Any]:
        """
        Get information about cached tokens.

        Returns:
            Dict[str, Any]: Cache information
        """
        cached_tokens = self.auth.get_cached_tokens_list()
        current_time = time.time()

        valid_tokens = [t for t in cached_tokens if t['is_valid']]
        expired_tokens = [t for t in cached_tokens if not t['is_valid']]

        cache_info = {
            'total_cached_tokens': len(cached_tokens),
            'valid_tokens': len(valid_tokens),
            'expired_tokens': len(expired_tokens),
            'current_key_filename': self.key_filename,
            'persistent_cache_enabled': self.auth.enable_persistent_cache,
            'tokens': cached_tokens
        }

        return cache_info

    def clear_cache(self, clear_persistent: bool = False):
        """
        Clear the authentication cache.

        Args:
            clear_persistent (bool): Whether to clear persistent cache files as well
        """
        self.auth.clear_cache(clear_persistent)


# Convenience functions for common use cases
def create_gemini_client(key_filename: str,
                       keys_directory: str = "geminiJson",
                       model: str = "gemini-embedding-001") -> GeminiClient:
    """
    Convenience function to create a Gemini client.

    Args:
        key_filename (str): Name of the service account key file
        keys_directory (str): Directory containing key files
        model (str): Gemini model to use

    Returns:
        GeminiClient: Configured Gemini API client
    """
    return GeminiClient(
        key_filename=key_filename,
        keys_directory=keys_directory,
        model=model
    )


def quick_embed(text: str,
               key_filename: str,
               model: str = "gemini-embedding-001") -> List[float]:
    """
    Quick function to generate embeddings for a single text.

    Args:
        text (str): Text to generate embeddings for
        key_filename (str): Name of the service account key file
        model (str): Gemini model to use

    Returns:
        List[float]: Embedding vector
    """
    client = create_gemini_client(key_filename, model=model)
    return client.get_embedding_values(text)


def quick_batch_embed(texts: List[str],
                    key_filename: str,
                    model: str = "gemini-embedding-001") -> List[Dict[str, Any]]:
    """
    Quick function to generate embeddings for multiple texts.

    Args:
        texts (List[str]): List of texts to generate embeddings for
        key_filename (str): Name of the service account key file
        model (str): Gemini model to use

    Returns:
        List[Dict[str, Any]]: List of embedding results
    """
    client = create_gemini_client(key_filename, model=model)
    return client.batch_embed_content(texts)


if __name__ == "__main__":
    # Example usage
    try:
        # Initialize client
        client = create_gemini_client("service-account.json")
        print("Gemini client initialized successfully")

        # Test connection
        test_results = client.test_connection()
        print(f"Connection test results:")
        print(f"  Success: {test_results['success']}")
        print(f"  Token valid: {test_results['token_valid']}")
        print(f"  API reachable: {test_results['api_reachable']}")

        if test_results['success']:
            # Test embedding generation
            test_text = "What is the meaning of life?"
            print(f"\nTesting embedding generation for: '{test_text}'")

            # Generate embedding
            embedding_values = client.get_embedding_values(test_text)
            print(f"Embedding generated successfully!")
            print(f"  Dimensions: {len(embedding_values)}")
            print(f"  First 5 values: {embedding_values[:5]}")

            # Test full API response
            embedding_response = client.embed_content(test_text)
            print(f"\nFull API response structure:")
            print(json.dumps(embedding_response, indent=2))

        # Show cache info
        cache_info = client.get_cache_info()
        print(f"\nCache information:")
        print(f"  Total cached tokens: {cache_info['total_cached_tokens']}")
        print(f"  Valid tokens: {cache_info['valid_tokens']}")
        print(f"  Expired tokens: {cache_info['expired_tokens']}")

    except Exception as e:
        print(f"Error: {e}")
        print("\nNote: Make sure to:")
        print("1. Place your Google service account JSON key in 'geminiJson/' directory")
        print("2. The service account has necessary permissions for Gemini APIs")
        print("3. The API key file name is correct in example")