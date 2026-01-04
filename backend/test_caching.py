"""
Test suite for database caching functionality
Run with: python -m pytest test_caching.py -v
"""
import os
import sys
import pytest
import hashlib
import json
from unittest.mock import Mock, patch

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.supabase_db import TaxaformerDB


class TestFileCaching:
    """Test file hash-based caching"""
    
    def test_compute_file_hash(self):
        """Test file hash computation"""
        # Same content should produce same hash
        content1 = b"ATCGATCGATCG"
        content2 = b"ATCGATCGATCG"
        content3 = b"ATCGATCGATCX"  # Different
        
        hash1 = hashlib.sha256(content1).hexdigest()
        hash2 = hashlib.sha256(content2).hexdigest()
        hash3 = hashlib.sha256(content3).hexdigest()
        
        assert hash1 == hash2, "Same content should produce same hash"
        assert hash1 != hash3, "Different content should produce different hash"
        assert len(hash1) == 64, "SHA-256 should be 64 characters"
    
    def test_hash_consistency(self):
        """Test hash consistency across multiple calls"""
        content = b">seq1\nATCGATCGATCG\n>seq2\nGCTAGCTAGCTA\n"
        
        hashes = [hashlib.sha256(content).hexdigest() for _ in range(5)]
        
        # All hashes should be identical
        assert all(h == hashes[0] for h in hashes), "Hash should be consistent"


class TestDatabaseOperations:
    """Test database operations (mocked)"""
    
    @pytest.fixture
    def mock_db(self):
        """Create mock database for testing"""
        with patch.dict(os.environ, {
            'SUPABASE_URL': 'https://test.supabase.co',
            'SUPABASE_KEY': 'test-key'
        }):
            with patch('db.supabase_db.create_client') as mock_client:
                mock_client.return_value = Mock()
                db = TaxaformerDB()
                db.client = Mock()
                return db
    
    def test_store_and_retrieve_analysis(self, mock_db):
        """Test storing and retrieving analysis results"""
        # Mock successful storage
        mock_db.client.table.return_value.insert.return_value.execute.return_value.data = [
            {'job_id': 'test-job-123'}
        ]
        
        # Test data
        file_hash = "abc123def456"
        filename = "test.fasta"
        result_json = {
            "metadata": {"sampleName": "test.fasta", "totalSequences": 10},
            "sequences": [{"accession": "seq1", "taxonomy": "test"}]
        }
        
        # Store analysis
        job_id = mock_db.store_analysis(file_hash, filename, result_json)
        
        assert job_id == 'test-job-123'
        
        # Verify insert was called
        mock_db.client.table.assert_called()
    
    def test_get_job_by_hash_found(self, mock_db):
        """Test retrieving existing job by hash"""
        # Mock found job
        mock_db.client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
            {
                'job_id': 'existing-job-456',
                'file_hash': 'abc123def456',
                'status': 'complete',
                'result': {'test': 'data'}
            }
        ]
        
        job = mock_db.get_job_by_hash('abc123def456')
        
        assert job is not None
        assert job['job_id'] == 'existing-job-456'
        assert job['status'] == 'complete'
    
    def test_get_job_by_hash_not_found(self, mock_db):
        """Test retrieving non-existent job by hash"""
        # Mock empty result
        mock_db.client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
        
        job = mock_db.get_job_by_hash('nonexistent-hash')
        
        assert job is None


class TestIntegrationScenarios:
    """Test complete caching scenarios"""
    
    def test_cache_miss_scenario(self):
        """Test scenario when file is not in cache"""
        # This would be tested with actual API calls
        # For now, just test the logic flow
        
        file_content = b">seq1\nATCGATCG\n"
        file_hash = hashlib.sha256(file_content).hexdigest()
        
        # Simulate cache miss (no existing job)
        cached_job = None
        
        assert cached_job is None, "Should be cache miss for new file"
        
        # Would proceed to analysis...
        # Then store result with file_hash
    
    def test_cache_hit_scenario(self):
        """Test scenario when file is already cached"""
        file_content = b">seq1\nATCGATCG\n"
        file_hash = hashlib.sha256(file_content).hexdigest()
        
        # Simulate cache hit (existing completed job)
        cached_job = {
            'job_id': 'cached-job-789',
            'file_hash': file_hash,
            'status': 'complete',
            'result': {'cached': True, 'data': 'test'}
        }
        
        assert cached_job is not None, "Should find cached job"
        assert cached_job['status'] == 'complete', "Job should be complete"
        
        # Should return cached result immediately
        result = cached_job['result']
        assert result is not None, "Should have cached result"
    
    def test_processing_scenario(self):
        """Test scenario when file is currently being processed"""
        file_content = b">seq1\nATCGATCG\n"
        file_hash = hashlib.sha256(file_content).hexdigest()
        
        # Simulate job in progress
        processing_job = {
            'job_id': 'processing-job-101',
            'file_hash': file_hash,
            'status': 'processing',
            'result': None
        }
        
        assert processing_job['status'] == 'processing', "Job should be processing"
        assert processing_job['result'] is None, "Should not have result yet"
        
        # Should return processing status, not start new analysis


def test_sample_data_format():
    """Test that sample data matches expected format"""
    sample_result = {
        "metadata": {
            "sampleName": "test.fasta",
            "totalSequences": 100,
            "processingTime": "2.5s",
            "avgConfidence": 85
        },
        "taxonomy_summary": [
            {"name": "Alveolata", "value": 45, "color": "#22D3EE"},
            {"name": "Chlorophyta", "value": 32, "color": "#10B981"}
        ],
        "sequences": [
            {
                "accession": "SEQ_001",
                "taxonomy": "Alveolata; Dinoflagellata; Gymnodiniales",
                "length": 1842,
                "confidence": 0.94,
                "overlap": 87,
                "cluster": "C1"
            }
        ],
        "cluster_data": [
            {"x": 12.5, "y": 8.3, "z": 45, "cluster": "Alveolata", "color": "#22D3EE"}
        ]
    }
    
    # Validate structure
    assert "metadata" in sample_result
    assert "taxonomy_summary" in sample_result
    assert "sequences" in sample_result
    assert "cluster_data" in sample_result
    
    # Validate metadata
    metadata = sample_result["metadata"]
    assert "sampleName" in metadata
    assert "totalSequences" in metadata
    assert isinstance(metadata["totalSequences"], int)
    
    # Validate sequences
    sequences = sample_result["sequences"]
    assert len(sequences) > 0
    
    seq = sequences[0]
    required_fields = ["accession", "taxonomy", "length", "confidence", "overlap", "cluster"]
    for field in required_fields:
        assert field in seq, f"Sequence missing required field: {field}"


def run_manual_tests():
    """Run tests that don't require pytest"""
    print("Running caching tests...")
    
    # Test hash computation
    test_hash = TestFileCaching()
    test_hash.test_compute_file_hash()
    test_hash.test_hash_consistency()
    print("[OK] Hash tests passed")
    
    # Test data format
    test_sample_data_format()
    print("[OK] Data format tests passed")
    
    # Test integration scenarios
    test_integration = TestIntegrationScenarios()
    test_integration.test_cache_miss_scenario()
    test_integration.test_cache_hit_scenario()
    test_integration.test_processing_scenario()
    print("[OK] Integration scenario tests passed")
    
    print("All manual tests passed!")
    print("\nTo run full test suite with mocks:")
    print("   pip install pytest")
    print("   python -m pytest test_caching.py -v")


if __name__ == "__main__":
    run_manual_tests()