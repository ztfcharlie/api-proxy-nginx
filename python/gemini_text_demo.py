#!/usr/bin/env python3
"""
Gemini Text Generation Demo with JWT Caching

This script demonstrates text generation using Gemini API
with persistent JWT authentication.
"""

import json
import time
from gemini_client import create_gemini_client


def demonstrate_text_generation():
    """Demonstrate text generation with JWT caching."""
    print("Gemini Text Generation with JWT Caching")
    print("=" * 50)

    try:
        # Initialize client
        client = create_gemini_client("service-account.json")
        print("Gemini client initialized with JWT caching")

        # Test connection
        print("Testing connection...")
        test_results = client.test_connection()
        print(f"Success: {test_results['success']}")
        print(f"Token valid: {test_results['token_valid']}")

        if not test_results['success']:
            print("Connection failed!")
            return False

        # Your original curl equivalent
        print(f"\nYour curl command:")
        print('curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \\')
        print('-H "x-goog-api-key: $GEMINI_API_KEY" \\')
        print('-H "Content-Type: application/json" \\')
        print('-X POST \\')
        print('-d \'{"contents":[{"parts":[{"text":"What is the meaning of life?"}]}]\'')
        print("")

        print(f"\nPython equivalent (with JWT caching):")
        print("from gemini_client import create_gemini_client")
        print("")
        print("# Initialize client")
        print('client = create_gemini_client("service-account.json")')
        print("")
        print("# Generate text")
        print('response = client.generate_content("What is the meaning of life?")')
        print("print(response)")

        # Test generation
        print(f"\nGenerating text...")
        response = client.generate_content("What is the meaning of life?")

        if 'candidates' in response:
            candidate = response['candidates'][0]
            if 'content' in candidate:
                if 'parts' in candidate['content']:
                    text = candidate['content']['parts'][0]['text']
                    print(f"Generated text: {text}")
                    return True
        else:
            print("No content in response!")
            return False

    except Exception as e:
        print(f"Error: {e}")
        return False


def main():
    """Main demonstration."""
    try:
        success = demonstrate_text_generation()
        if success:
            print("\nText generation completed successfully!")
            print("\nThe JWT caching system is working perfectly!")
        else:
            print("\nText generation failed!")
    except Exception as e:
        print(f"Demonstration failed: {e}")


if __name__ == "__main__":
    main()