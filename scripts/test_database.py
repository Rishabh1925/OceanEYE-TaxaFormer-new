"""
Quick Test Script for Supabase Database
Run this to verify everything is working
"""

import os
import sys

# Add parent directory to path for db imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

print("Testing Supabase Database Connection...\n")

try:
    from db.supabase_db import TaxaformerDB
    
    db = TaxaformerDB()
    print("Database module imported successfully")
    
    test_metadata = {
        "sampleId": "TEST_001",
        "depth": 3500,
        "location": {"lat": 22.1, "lon": 71.9},
        "notes": "Test run from setup script"
    }
    
    test_result = {
        "metadata": {
            "sampleName": "test_sample.fasta",
            "totalSequences": 5,
            "status": "completed"
        },
        "sequences": [
            {"taxonomy": "Eukaryota; Alveolata; Dinoflagellata; Gymnodiniales", "accession": "SEQ_001", "confidence": 0.95},
            {"taxonomy": "Eukaryota; Chlorophyta; Chlorophyceae; Chlamydomonadales", "accession": "SEQ_002", "confidence": 0.89},
            {"taxonomy": "Eukaryota; Metazoa; Arthropoda; Copepoda", "accession": "SEQ_003", "confidence": 0.92},
            {"taxonomy": "Eukaryota; Rhodophyta; Florideophyceae; Ceramiales", "accession": "SEQ_004", "confidence": 0.88},
            {"taxonomy": "Eukaryota; Fungi; Ascomycota; Saccharomycetales", "accession": "SEQ_005", "confidence": 0.91}
        ],
        "taxonomy_summary": [
            {"name": "Alveolata", "value": 1},
            {"name": "Chlorophyta", "value": 1},
            {"name": "Metazoa", "value": 1},
            {"name": "Rhodophyta", "value": 1},
            {"name": "Fungi", "value": 1}
        ]
    }
    
    print("\nStoring test analysis...")
    job_id = db.store_analysis(
        filename="test_sample.fasta",
        metadata=test_metadata,
        analysis_result=test_result
    )
    
    print(f"Stored successfully!")
    print(f"   Job ID: {job_id}")
    
    print("\nTesting visualization data generation...")
    
    composition = db.get_taxonomic_composition(job_id, rank="phylum")
    print(f"Taxonomic composition: {len(composition)} taxa found")
    for taxon in composition[:3]:
        print(f"   - {taxon['name']}: {taxon['value']} ({taxon['percentage']}%)")
    
    hierarchy = db.get_hierarchical_data(job_id)
    print(f"\nHierarchical data: {len(hierarchy.get('children', []))} top-level groups")
    
    sankey = db.get_sankey_data(job_id)
    print(f"Sankey data: {len(sankey['nodes'])} nodes, {len(sankey['links'])} links")
    
    print("\nRetrieving stored job...")
    retrieved = db.get_job_by_id(job_id)
    if retrieved:
        print(f"Retrieved job: {retrieved['filename']}")
        print(f"   Created: {retrieved['created_at']}")
    
    print("\n" + "="*60)
    print("ALL TESTS PASSED!")
    print("="*60)
    print("\nDatabase is ready to use!")
    print(f"Test job stored with ID: {job_id}")
    print("\nNext steps:")
    print("   1. Check Supabase dashboard to see your test data")
    print("   2. Start your backend: python backend/main_with_db.py")
    print("   3. Start your frontend: npm run dev")
    print("\n" + "="*60 + "\n")

except ImportError as e:
    print(f"Import Error: {e}")
    print("\nSolution:")
    print("   pip install -r db/db_requirements.txt")

except Exception as e:
    print(f"\nError: {e}")
    print("\nPossible issues:")
    print("   1. Run SQL schema in Supabase Dashboard first")
    print("   2. Check Supabase credentials in db/supabase_db.py")
    print("   3. Verify internet connection")
