"""
Google OAuth2 JWT Token Generator Module

This module provides functionality to generate OAuth2 JWT tokens
for Google Vertex AI APIs using service account JSON keys.
"""

import json
import os
import time
import jwt
import requests
import hashlib
from typing import Optional, Dict, Any
from pathlib import Path


class GoogleAuthenticator:
    """
    A class to handle Google OAuth2 authentication using service account keys.
    """

    def __init__(self, keys_directory: str = "geminiJson", enable_persistent_cache: bool = True):
        """
        Initialize the authenticator with a directory containing JSON key files.

        Args:
            keys_directory (str): Path to directory containing Google service account JSON keys
            enable_persistent_cache (bool): Whether to use file-based persistent caching
        """
        self.keys_directory = Path(keys_directory)
        self.keys_directory.mkdir(exist_ok=True)
        self.enable_persistent_cache = enable_persistent_cache
        self._credentials_cache = {}

        # Cache directory for persistent token storage
        if self.enable_persistent_cache:
            self.cache_directory = self.keys_directory / ".cache"
            self.cache_directory.mkdir(exist_ok=True)
            self._load_cached_tokens()

    def load_service_account_key(self, key_filename: str) -> Dict[str, Any]:
        """
        Load a service account key from JSON file.

        Args:
            key_filename (str): Name of the JSON key file in the keys directory

        Returns:
            Dict[str, Any]: Service account key data

        Raises:
            FileNotFoundError: If the key file doesn't exist
            json.JSONDecodeError: If the key file is not valid JSON
        """
        key_path = self.keys_directory / key_filename

        if not key_path.exists():
            raise FileNotFoundError(f"Service account key file not found: {key_path}")

        try:
            with open(key_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            raise json.JSONDecodeError(f"Invalid JSON in key file {key_path}: {e.msg}", e.doc, e.pos)

    def _get_cache_key(self, key_filename: str, scopes: Optional[list] = None) -> str:
        """
        Generate a unique cache key for a specific key file and scopes.

        Args:
            key_filename (str): Name of the service account key file
            scopes (list, optional): List of OAuth2 scopes

        Returns:
            str: Unique cache key
        """
        scopes_str = ','.join(scopes or ['default'])
        cache_key = f"{key_filename}:{scopes_str}"
        return hashlib.md5(cache_key.encode()).hexdigest()

    def _get_cache_file_path(self, cache_key: str) -> Path:
        """
        Get the file path for a cached token.

        Args:
            cache_key (str): Unique cache key

        Returns:
            Path: File path for the cached token
        """
        return self.cache_directory / f"token_{cache_key}.json"

    def _load_cached_tokens(self):
        """Load all cached tokens from files."""
        if not self.enable_persistent_cache:
            return

        try:
            for cache_file in self.cache_directory.glob("token_*.json"):
                try:
                    with open(cache_file, 'r', encoding='utf-8') as f:
                        token_data = json.load(f)

                    # Check if token is still valid (with 5-minute buffer)
                    if token_data.get('expires_at', 0) > time.time() + 300:
                        cache_key = cache_file.stem.replace('token_', '')
                        self._credentials_cache[cache_key] = token_data
                    else:
                        # Remove expired token file
                        cache_file.unlink()
                except (json.JSONDecodeError, KeyError, ValueError):
                    # Remove corrupted cache file
                    cache_file.unlink()
        except Exception:
            # If cache directory doesn't exist or other issues, ignore
            pass

    def _save_token_to_cache(self, cache_key: str, token_data: Dict[str, Any]):
        """
        Save token data to persistent cache file.

        Args:
            cache_key (str): Unique cache key
            token_data (Dict[str, Any]): Token data to cache
        """
        if not self.enable_persistent_cache:
            return

        try:
            cache_file = self._get_cache_file_path(cache_key)
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(token_data, f, indent=2)
        except Exception:
            # If saving fails, continue without persistent cache
            pass

    def _remove_token_from_cache(self, cache_key: str):
        """
        Remove token from persistent cache.

        Args:
            cache_key (str): Unique cache key
        """
        if not self.enable_persistent_cache:
            return

        try:
            cache_file = self._get_cache_file_path(cache_key)
            if cache_file.exists():
                cache_file.unlink()
        except Exception:
            pass

    def get_available_keys(self) -> list:
        """
        Get a list of available JSON key files in the keys directory.

        Returns:
            list: List of key filenames
        """
        return [f.name for f in self.keys_directory.glob("*.json") if f.is_file()]

    def create_jwt_assertion(self, service_account_key: Dict[str, Any],
                           scopes: Optional[list] = None) -> str:
        """
        Create a JWT assertion for Google OAuth2.

        Args:
            service_account_key (Dict[str, Any]): Service account key data
            scopes (list, optional): List of OAuth2 scopes. Defaults to cloud-platform scope.

        Returns:
            str: JWT assertion string
        """
        if scopes is None:
            scopes = ['https://www.googleapis.com/auth/cloud-platform']

        # JWT payload
        now = int(time.time())
        payload = {
            'iss': service_account_key['client_email'],
            'scope': ' '.join(scopes),
            'aud': 'https://oauth2.googleapis.com/token',
            'exp': now + 3600,  # 1 hour expiration
            'iat': now
        }

        # Sign the JWT with the private key
        private_key = service_account_key['private_key']
        signed_jwt = jwt.encode(payload, private_key, algorithm='RS256')

        return signed_jwt

    def exchange_jwt_for_token(self, jwt_assertion: str) -> Dict[str, Any]:
        """
        Exchange JWT assertion for OAuth2 access token.

        Args:
            jwt_assertion (str): JWT assertion string

        Returns:
            Dict[str, Any]: Token response containing access_token, expires_in, etc.

        Raises:
            requests.RequestException: If the token request fails
        """
        token_url = 'https://oauth2.googleapis.com/token'

        data = {
            'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion': jwt_assertion
        }

        headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        }

        response = requests.post(token_url, data=data, headers=headers)
        response.raise_for_status()

        return response.json()

    def get_access_token(self, key_filename: str,
                        scopes: Optional[list] = None,
                        use_cache: bool = True,
                        force_refresh: bool = False) -> Dict[str, Any]:
        """
        Get OAuth2 access token using service account key.

        Args:
            key_filename (str): Name of the JSON key file
            scopes (list, optional): List of OAuth2 scopes
            use_cache (bool): Whether to cache and reuse tokens when possible
            force_refresh (bool): Force token refresh even if cached token exists

        Returns:
            Dict[str, Any]: Token information including access_token and expires_in
        """
        cache_key = self._get_cache_key(key_filename, scopes)

        # Check cache if enabled
        if use_cache and not force_refresh:
            # Check in-memory cache first
            if cache_key in self._credentials_cache:
                cached_token = self._credentials_cache[cache_key]
                # Check if token is still valid (with 5-minute buffer)
                if cached_token.get('expires_at', 0) > time.time() + 300:
                    return cached_token

        # Load service account key
        service_account_key = self.load_service_account_key(key_filename)

        # Create JWT assertion
        jwt_assertion = self.create_jwt_assertion(service_account_key, scopes)

        # Exchange for access token
        token_response = self.exchange_jwt_for_token(jwt_assertion)

        # Add expiration timestamp to response
        token_response['expires_at'] = time.time() + token_response.get('expires_in', 3600)

        # Add cache metadata
        token_response['cache_key'] = cache_key
        token_response['key_filename'] = key_filename
        token_response['scopes'] = scopes

        # Cache the token
        if use_cache:
            self._credentials_cache[cache_key] = token_response
            # Save to persistent cache
            self._save_token_to_cache(cache_key, token_response)

        return token_response

    def clear_cache(self, clear_persistent: bool = False):
        """
        Clear the token cache.

        Args:
            clear_persistent (bool): Whether to clear persistent cache files as well
        """
        self._credentials_cache.clear()

        if clear_persistent and self.enable_persistent_cache:
            try:
                # Clear persistent cache files
                for cache_file in self.cache_directory.glob("token_*.json"):
                    cache_file.unlink()
            except Exception:
                pass

    def get_cached_token_info(self, key_filename: str,
                             scopes: Optional[list] = None) -> Optional[Dict[str, Any]]:
        """
        Get cached token information without making API calls.

        Args:
            key_filename (str): Name of the JSON key file
            scopes (list, optional): List of OAuth2 scopes

        Returns:
            Optional[Dict[str, Any]]: Cached token info if available and valid, None otherwise
        """
        cache_key = self._get_cache_key(key_filename, scopes)

        if cache_key in self._credentials_cache:
            cached_token = self._credentials_cache[cache_key]
            if cached_token.get('expires_at', 0) > time.time() + 300:
                return cached_token

        return None

    def get_cached_tokens_list(self) -> list:
        """
        Get list of all cached tokens with their metadata.

        Returns:
            list: List of cached token information
        """
        cached_tokens = []
        current_time = time.time()

        for cache_key, token_data in self._credentials_cache.items():
            expires_at = token_data.get('expires_at', 0)
            is_valid = expires_at > current_time + 300

            cached_tokens.append({
                'cache_key': cache_key,
                'key_filename': token_data.get('key_filename', 'unknown'),
                'scopes': token_data.get('scopes', 'default'),
                'expires_at': expires_at,
                'expires_in_minutes': int((expires_at - current_time) / 60),
                'is_valid': is_valid
            })

        return cached_tokens


# Convenience function for simple usage
def get_vertex_ai_token(key_filename: str, keys_directory: str = "geminiJson") -> str:
    """
    Simple function to get a Vertex AI access token.

    Args:
        key_filename (str): Name of the JSON key file
        keys_directory (str): Directory containing the key files

    Returns:
        str: Access token string
    """
    auth = GoogleAuthenticator(keys_directory)
    token_info = auth.get_access_token(key_filename)
    return token_info['access_token']


if __name__ == "__main__":
    # Example usage
    try:
        # Initialize authenticator
        auth = GoogleAuthenticator("geminiJson")

        # List available keys
        available_keys = auth.get_available_keys()
        print(f"Available service account keys: {available_keys}")

        if available_keys:
            # Get access token using first available key
            key_file = available_keys[0]
            print(f"Using key file: {key_file}")

            token_info = auth.get_access_token(key_file)
            print(f"Access token: {token_info['access_token'][:50]}...")
            print(f"Expires in: {token_info['expires_in']} seconds")
        else:
            print("No service account key files found in geminiJson directory")

    except Exception as e:
        print(f"Error: {e}")