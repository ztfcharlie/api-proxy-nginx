"""
Vertex AI Authentication Module

This module provides a high-level interface for Google Vertex AI authentication
that can be easily imported and used by other applications.
"""

from typing import Optional, Union, Dict, Any
import os
from google_auth import GoogleAuthenticator


class VertexAIAuth:
    """
    High-level authentication interface for Google Vertex AI APIs.
    """

    # Default scopes for Vertex AI
    DEFAULT_SCOPES = [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/aiplatform'
    ]

    def __init__(self,
                 key_filename: str,
                 keys_directory: str = "geminiJson",
                 auto_refresh: bool = True):
        """
        Initialize Vertex AI authentication.

        Args:
            key_filename (str): Name of the service account JSON key file
            keys_directory (str): Directory containing the key files
            auto_refresh (bool): Whether to automatically refresh tokens when they expire
        """
        self.auth = GoogleAuthenticator(keys_directory)
        self.key_filename = key_filename
        self.auto_refresh = auto_refresh
        self._current_token = None

    def get_token(self, scopes: Optional[list] = None) -> str:
        """
        Get a valid OAuth2 access token for Vertex AI APIs.

        Args:
            scopes (list, optional): Custom OAuth2 scopes. Defaults to Vertex AI scopes.

        Returns:
            str: Valid access token
        """
        if scopes is None:
            scopes = self.DEFAULT_SCOPES

        try:
            token_info = self.auth.get_access_token(
                self.key_filename,
                scopes=scopes,
                use_cache=self.auto_refresh
            )
            self._current_token = token_info
            return token_info['access_token']
        except Exception as e:
            raise RuntimeError(f"Failed to get access token: {e}")

    def get_token_info(self, scopes: Optional[list] = None) -> Dict[str, Any]:
        """
        Get detailed token information including expiration.

        Args:
            scopes (list, optional): Custom OAuth2 scopes

        Returns:
            Dict[str, Any]: Token information including access_token, expires_in, etc.
        """
        if scopes is None:
            scopes = self.DEFAULT_SCOPES

        try:
            token_info = self.auth.get_access_token(
                self.key_filename,
                scopes=scopes,
                use_cache=self.auto_refresh
            )
            self._current_token = token_info
            return token_info
        except Exception as e:
            raise RuntimeError(f"Failed to get token info: {e}")

    def is_token_valid(self, buffer_seconds: int = 300) -> bool:
        """
        Check if the current token is still valid.

        Args:
            buffer_seconds (int): Time buffer in seconds before expiration

        Returns:
            bool: True if token is valid, False otherwise
        """
        if not self._current_token:
            return False

        expires_at = self._current_token.get('expires_at', 0)
        current_time = os.time() if hasattr(os, 'time') else __import__('time').time()

        return expires_at > current_time + buffer_seconds

    def get_auth_headers(self, scopes: Optional[list] = None) -> Dict[str, str]:
        """
        Get authentication headers for API requests.

        Args:
            scopes (list, optional): Custom OAuth2 scopes

        Returns:
            Dict[str, str]: Headers including Authorization bearer token
        """
        token = self.get_token(scopes)
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    def get_service_account_info(self) -> Dict[str, Any]:
        """
        Get information about the service account.

        Returns:
            Dict[str, Any]: Service account information
        """
        return self.auth.load_service_account_key(self.key_filename)

    def clear_token_cache(self):
        """Clear the token cache for this service account."""
        self.auth.clear_cache()
        self._current_token = None


# Factory function for easy instantiation
def create_vertex_auth(key_filename: str,
                      keys_directory: str = "geminiJson") -> VertexAIAuth:
    """
    Factory function to create a VertexAIAuth instance.

    Args:
        key_filename (str): Name of the service account JSON key file
        keys_directory (str): Directory containing the key files

    Returns:
        VertexAIAuth: Configured authentication instance
    """
    return VertexAIAuth(key_filename, keys_directory)


# Global auth manager for single-key scenarios
class GlobalAuthManager:
    """
    Global authentication manager for applications using a single service account.
    """

    _instance = None
    _auth = None

    @classmethod
    def initialize(cls, key_filename: str, keys_directory: str = "geminiJson"):
        """
        Initialize the global authentication.

        Args:
            key_filename (str): Name of the service account JSON key file
            keys_directory (str): Directory containing the key files
        """
        cls._auth = VertexAIAuth(key_filename, keys_directory)
        cls._instance = cls()

    @classmethod
    def get_instance(cls):
        """
        Get the global authentication manager instance.

        Returns:
            GlobalAuthManager: The singleton instance
        """
        if cls._instance is None:
            raise RuntimeError("GlobalAuthManager not initialized. Call initialize() first.")
        return cls._instance

    @classmethod
    def get_token(cls, scopes: Optional[list] = None) -> str:
        """Get access token from global auth."""
        return cls._auth.get_token(scopes)

    @classmethod
    def get_auth_headers(cls, scopes: Optional[list] = None) -> Dict[str, str]:
        """Get auth headers from global auth."""
        return cls._auth.get_auth_headers(scopes)

    @classmethod
    def is_token_valid(cls) -> bool:
        """Check if global token is valid."""
        return cls._auth.is_token_valid()


# Quick setup function
def setup_auth(key_filename: str, keys_directory: str = "geminiJson") -> VertexAIAuth:
    """
    Quick setup function for authentication.

    Args:
        key_filename (str): Name of the service account JSON key file
        keys_directory (str): Directory containing the key files

    Returns:
        VertexAIAuth: Configured authentication instance
    """
    return create_vertex_auth(key_filename, keys_directory)


if __name__ == "__main__":
    # Example usage
    try:
        # Example 1: Basic usage
        print("=== Example 1: Basic Authentication ===")
        auth = setup_auth("your-service-account-key.json")  # Replace with actual key file
        token = auth.get_token()
        print(f"Access token: {token[:50]}...")

        # Example 2: With headers for API calls
        print("\n=== Example 2: Authentication Headers ===")
        headers = auth.get_auth_headers()
        print(f"Headers: {headers}")

        # Example 3: Service account info
        print("\n=== Example 3: Service Account Info ===")
        service_info = auth.get_service_account_info()
        print(f"Client email: {service_info.get('client_email', 'N/A')}")
        print(f"Project ID: {service_info.get('project_id', 'N/A')}")

        # Example 4: Global auth manager
        print("\n=== Example 4: Global Auth Manager ===")
        GlobalAuthManager.initialize("your-service-account-key.json")  # Replace with actual
        global_token = GlobalAuthManager.get_token()
        print(f"Global token: {global_token[:50]}...")

    except Exception as e:
        print(f"Error in examples: {e}")
        print("\nNote: Make sure to place your Google service account JSON key files in the 'geminiJson' directory")
        print("and update the key filename in the examples above.")