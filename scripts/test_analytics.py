"""
Simple test to check if analytics is working
"""
import requests
import json

API_URL = "http://localhost:8000"

def test_analytics():
    print("Testing Analytics System...")
    
    print("\n1. Testing session creation...")
    session_data = {
        "deviceType": "desktop",
        "browserName": "chrome",
        "referrer": "direct",
        "userAgent": "test-agent",
        "screenResolution": "1920x1080",
        "timezone": "UTC",
        "language": "en-US"
    }
    
    try:
        response = requests.post(f"{API_URL}/api/analytics/session", json=session_data)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            result = response.json()
            session_id = result.get("sessionId")
            print(f"Session created: {session_id}")
            
            print("\n2. Testing page view tracking...")
            page_data = {
                "sessionId": session_id,
                "pagePath": "/test",
                "pageTitle": "Test Page",
                "timestamp": "2024-12-11T12:00:00Z"
            }
            
            response = requests.post(f"{API_URL}/api/analytics/page-view", json=page_data)
            print(f"Status: {response.status_code}")
            print(f"Response: {response.json()}")
            
            print("\n3. Testing interaction tracking...")
            interaction_data = {
                "sessionId": session_id,
                "pagePath": "/test",
                "interactionType": "click",
                "elementId": "test-button",
                "elementText": "Test Button",
                "interactionData": {"test": True},
                "timestamp": "2024-12-11T12:01:00Z"
            }
            
            response = requests.post(f"{API_URL}/api/analytics/interaction", json=interaction_data)
            print(f"Status: {response.status_code}")
            print(f"Response: {response.json()}")
            
            print("\n4. Testing stats retrieval...")
            response = requests.get(f"{API_URL}/api/analytics/stats")
            print(f"Status: {response.status_code}")
            print(f"Response: {response.json()}")
            
        else:
            print(f"Session creation failed: {response.text}")
            
    except Exception as e:
        print(f"Error: {e}")
        print("Make sure your backend is running!")

if __name__ == "__main__":
    test_analytics()
