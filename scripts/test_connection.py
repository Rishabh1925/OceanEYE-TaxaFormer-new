"""
Test Supabase connection and setup
"""
import os

# Set your Supabase credentials here
SUPABASE_URL = "https://nbnyhdwbnxbheombbhtv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ibnloZHdibnhiaGVvbWJiaHR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MDIyNDksImV4cCI6MjA4MDk3ODI0OX0.u5DxN1eX-K85WepTNCEs5sJw9M13YLmGm5pVe1WKy34"

def test_connection():
    """Test connection to Supabase"""
    print("Testing Supabase connection...")
    
    try:
        from supabase import create_client
        
        # Set environment variables
        os.environ["SUPABASE_URL"] = SUPABASE_URL
        os.environ["SUPABASE_KEY"] = SUPABASE_KEY
        
        # Test connection
        client = create_client(SUPABASE_URL, SUPABASE_KEY)
        
        # Try to query tables
        response = client.table('analysis_jobs').select('*').limit(1).execute()
        print("Connection successful!")
        print(f"Found {len(response.data)} records in analysis_jobs table")
        
        return True
        
    except Exception as e:
        print(f"Connection failed: {e}")
        print("\nSetup steps:")
        print("1. Get your anon key from Supabase dashboard > Settings > API")
        print("2. Replace YOUR_ANON_KEY_HERE in this file")
        print("3. Run the SQL migration in Supabase SQL Editor")
        return False

if __name__ == "__main__":
    test_connection()
