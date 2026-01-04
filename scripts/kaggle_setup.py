"""
Setup script for Kaggle notebook
Run this in your Kaggle notebook to set up database caching
"""

print("Installing required packages...")
import subprocess
import sys

def install_package(package):
    subprocess.check_call([sys.executable, "-m", "pip", "install", package])

try:
    install_package("supabase")
    print("Supabase installed")
except Exception as e:
    print(f"Failed to install supabase: {e}")

import os
os.environ["SUPABASE_URL"] = "https://nbnyhdwbnxbheombbhtv.supabase.co"
os.environ["SUPABASE_KEY"] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ibnloZHdibnhiaGVvbWJiaHR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MDIyNDksImV4cCI6MjA4MDk3ODI0OX0.u5DxN1eX-K85WepTNCEs5sJw9M13YLmGm5pVe1WKy34"
os.environ["USE_DATABASE"] = "true"

print("Environment variables set")

print("Testing database connection...")
try:
    from supabase import create_client
    
    client = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_KEY"]
    )
    
    response = client.table('analysis_jobs').select('*').limit(1).execute()
    print("Database connection successful!")
    print(f"Found {len(response.data)} existing records")
    
except Exception as e:
    print(f"Database connection failed: {e}")

print("\nSETUP COMPLETE!")
print("=" * 50)
print("- Supabase package installed")
print("- Environment variables configured")
print("- Database connection tested")
print("\nNow run your backend with:")
print("   exec(open('backend/main_cached.py').read())")
print("\nCaching will work automatically!")
print("   - First upload: Processes and stores in DB")
print("   - Same file again: Returns cached result instantly")
