"""
Simple test to verify database connection and insert test data
"""
import hashlib
import json
from datetime import datetime

def test_database_connection():
    """Test database connection and insert sample data"""
    print("Testing Supabase Database Connection...")
    
    try:
        # Try to import supabase
        from supabase import create_client
        
        # Your credentials
        url = "https://nbnyhdwbnxbheombbhtv.supabase.co"
        key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ibnloZHdibnhiaGVvbWJiaHR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MDIyNDksImV4cCI6MjA4MDk3ODI0OX0.u5DxN1eX-K85WepTNCEs5sJw9M13YLmGm5pVe1WKy34"
        
        # Create client
        client = create_client(url, key)
        print("Connected to Supabase successfully!")
        
        # Test inserting a sample record
        test_file_content = b">test_seq\nATCGATCGATCG\n"
        file_hash = hashlib.sha256(test_file_content).hexdigest()
        
        test_data = {
            "file_hash": file_hash,
            "filename": "test_sample.fasta",
            "status": "complete",
            "result": {
                "metadata": {
                    "sampleName": "test_sample.fasta",
                    "totalSequences": 1,
                    "processingTime": "0.1s"
                },
                "sequences": [
                    {
                        "accession": "test_seq",
                        "taxonomy": "Test;Sample;Data",
                        "length": 12,
                        "confidence": 0.95
                    }
                ]
            }
        }
        
        print("Inserting test record...")
        response = client.table('analysis_jobs').insert(test_data).execute()
        
        if response.data:
            job_id = response.data[0]['job_id']
            print(f"Test record inserted with job_id: {job_id}")
            
            # Test retrieving the record
            print("Testing retrieval by file hash...")
            retrieve_response = client.table('analysis_jobs').select('*').eq('file_hash', file_hash).execute()
            
            if retrieve_response.data:
                print("Record retrieved successfully!")
                print(f"   Filename: {retrieve_response.data[0]['filename']}")
                print(f"   Status: {retrieve_response.data[0]['status']}")
                
                # Clean up test record
                print("Cleaning up test record...")
                client.table('analysis_jobs').delete().eq('job_id', job_id).execute()
                print("Test record cleaned up")
                
                print("\nDATABASE CONNECTION TEST PASSED!")
                print("- Connection works")
                print("- Insert works")
                print("- Retrieve works")
                print("- Delete works")
                
                return True
            else:
                print("Failed to retrieve test record")
                return False
        else:
            print("Failed to insert test record")
            return False
            
    except ImportError:
        print("Supabase package not installed")
        print("Install with: pip install supabase")
        return False
    except Exception as e:
        print(f"Database test failed: {e}")
        return False

if __name__ == "__main__":
    success = test_database_connection()
    if success:
        print("\nReady to use database caching!")
    else:
        print("\nDatabase setup needs attention")
