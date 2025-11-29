#!/usr/bin/env python3
"""
Direct test using the token you showed earlier
"""

import json
import requests

def test_direct_token():
    """Test API using the token you provided earlier."""
    print("*** Direct Token Test for Gemini 3-pro-preview ***")
    print("=" * 60)

    # Use the token you showed earlier (first part)
    # Note: This is just the beginning of your token for testing
    token_start = "ya29.c.c0AYnqXlilwFuYbEOeHz2qeTG_ifD1KI8rL583SkKEKxo5HXUlLil-I_bjK2z1XcAYZFCIdt4aOHaZwvkUeciIK7cYQZlgQRCo7E8XM0udJJaA5BbGOWEiqif8fbPDIgORgDHHG1J-v-U4SvdIiOasTKVtDU-65l9J4n_lh4vMErvDKynjF9DW9BOQ_-ObM_IywWKqHaM9370fp93usTY8pq3uM8y-IYRqF0lu2x9RezaQT9nd9eLmlfXazpw2rK1eaxQQ64sJynkayOcPUdK1S3j-Ynsm0F6oX6wbRJUb0-sb8yM_2-SnmlqENyqYLpdyjjfFLhuwTQmtCaDFseq9cfYFktrglRO0U2w783mrUt3Vq85X7kihsoKGmQN387PojXZmo2y4Zy1q03bleqBOp505edeVawuzzlw8RkrJ3iUhxiedrJUpzMRpv7pcUe8161dfIsOXoWX6rZfSxfzcmrt7hyJF2mIi9eiZaRseMknJgkS9Wxo2vXBbz6atnn5oeSc-tQxB7SVO1JsRSVw8i-cmldZkeBjcaSgBdkbzlxkxYBm0Fpg38ictseSm1vUSjYvjQov-u6bmUzvj3v--w395Vwgj-1oSOFU3Ra4MO80JieFx6WszciY482zcR8pSOfS_W5rxfXkSZpmeYjoy9ugy2wzaiJQbuvj9Vr-066of4M-9uwF91wB34ujjFkiS1Y_lQd6B3mdcrQy7BkB5pOJzSyafSaJ3eUsI7_rsVoae5geV_ZhrW7Rqirm-3dibnosdfnVx8_x3kwI93ihb2B9JZJYbzFa5U7htXj-9roynIaFnpdatum3vpglo1-qR6oguvrd_s9j1n8ua39Xne_bBROSXpMihiWlggF7Y0yQtocW3zgJ_Uq9eswUqSkqRlZbrIh5v0m9oR_c7npMQSm-2uzRi9-hehUY95od6Fmu1BdwSg_9Bmn3aB9BvicYlcyapWlF7IYIB0Q9BdzOc7VsaasgphMiz558FdVb82vQjj93s61qSrqx"

    print(f"[INFO] Using token (truncated): {token_start[:50]}...")
    print(f"[WARNING] This token may be expired - check the expires_at timestamp")

    # API endpoint for Gemini 3-pro-preview
    api_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent"

    # Prepare request headers
    headers = {
        "Authorization": f"Bearer {token_start}",
        "Content-Type": "application/json",
        "User-Agent": "Python-Gemini-Client/1.0"
    }

    # Prepare request payload matching your curl command
    payload = {
        "contents": [{
            "parts": [{"text": "How does AI work?"}]
        }],
        "generationConfig": {
            "thinkingConfig": {
                "thinkingLevel": "low"
            }
        }
    }

    print(f"\n[CURL] Your original curl command:")
    print('curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent" \\')
    print('  -H "Authorization: Bearer $JWT_TOKEN" \\')
    print('  -H "Content-Type: application/json" \\')
    print('  -X POST \\')
    print('  -d \'{"contents":[{"parts":[{"text":"How does AI work?"}]}],"generationConfig":{"thinkingConfig":{"thinkingLevel":"low"}}}\'')

    print(f"\n[DEBUG] Request Details")
    print("=" * 50)
    print(f"[URL] API URL: {api_url}")
    print(f"[HEADERS] Request Headers:")
    for key, value in headers.items():
        if key == "Authorization":
            print(f"  {key}: Bearer {value[7:57]}...")
        else:
            print(f"  {key}: {value}")

    print(f"\n[PAYLOAD] Request Payload (JSON):")
    payload_json = json.dumps(payload, indent=2, ensure_ascii=False)
    print(payload_json)

    print(f"\n[SIZE] Payload size: {len(payload_json)} bytes")

    # Make the API request
    print(f"\n[REQUEST] Making API request...")

    try:
        response = requests.post(
            api_url,
            headers=headers,
            json=payload,
            timeout=30
        )

        print(f"\n[RESPONSE] Response Details:")
        print("=" * 50)
        print(f"[STATUS] Status Code: {response.status_code}")
        print(f"[HEADERS] Response Headers:")
        for key, value in response.headers.items():
            print(f"  {key}: {value}")

        print(f"\n[CONTENT] Response Content:")
        print(f"Raw response text: {response.text}")

        if response.status_code == 200:
            try:
                response_json = response.json()
                print("[OK] JSON Response:")
                print(json.dumps(response_json, indent=2, ensure_ascii=False))

                # Extract and display the generated text
                if 'candidates' in response_json and response_json['candidates']:
                    candidate = response_json['candidates'][0]
                    if 'content' in candidate and 'parts' in candidate['content']:
                        generated_text = candidate['content']['parts'][0]['text']
                        print(f"\n[AI] Generated Text:")
                        print("=" * 50)
                        print(generated_text)

                        # Check for thinking content if available
                        if 'thinking' in candidate:
                            print(f"\n[THINKING] Thinking Process:")
                            print("=" * 50)
                            print(candidate['thinking'])

                return True

            except json.JSONDecodeError as e:
                print(f"[ERROR] Failed to parse JSON response: {e}")
                return False
        else:
            print(f"[ERROR] API request failed with status {response.status_code}")
            return False

    except requests.exceptions.RequestException as e:
        print(f"[ERROR] Request failed: {e}")
        return False

if __name__ == "__main__":
    print("[NOTE] You need to replace the token with your complete, valid token")
    print("[NOTE] The token shown in your cache file should be used instead")
    print("")
    success = test_direct_token()
    if success:
        print("\n[SUCCESS] Test completed successfully!")
    else:
        print("\n[FAILED] Test failed - likely due to expired/invalid token")
    exit(0 if success else 1)