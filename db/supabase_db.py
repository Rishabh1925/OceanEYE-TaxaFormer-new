"""
Supabase Database Wrapper for Taxaformer
Handles all database operations with caching and idempotency
"""
import os
import json
import hashlib
from typing import Dict, List, Any, Optional
from datetime import datetime

try:
    from supabase import create_client, Client
except ImportError:
    raise ImportError("supabase package not installed. Run: pip install supabase")


class TaxaformerDB:
    """Database wrapper for Taxaformer analysis results"""
    
    def __init__(self):
        """Initialize Supabase client"""
        self.url = os.getenv("SUPABASE_URL", "https://nbnyhdwbnxbheombbhtv.supabase.co")
        self.key = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ibnloZHdibnhiaGVvbWJiaHR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MDIyNDksImV4cCI6MjA4MDk3ODI0OX0.u5DxN1eX-K85WepTNCEs5sJw9M13YLmGm5pVe1WKy34")
        
        if not self.url or not self.key:
            raise ValueError(
                "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_KEY environment variables."
            )
        
        print(f"Connecting to Supabase: {self.url}")
        self.client: Client = create_client(self.url, self.key)
    
    def compute_file_hash(self, file_bytes: bytes) -> str:
        """
        Compute SHA-256 hash of file bytes for idempotency
        
        Args:
            file_bytes: Raw file content
            
        Returns:
            Hex string of file hash
        """
        return hashlib.sha256(file_bytes).hexdigest()
    
    def get_job_by_hash(self, file_hash: str) -> Optional[Dict[str, Any]]:
        """
        Get existing job by file hash for cache lookup
        
        Args:
            file_hash: SHA-256 hash of file content
            
        Returns:
            Job record if found, None otherwise
        """
        try:
            response = self.client.table('analysis_jobs').select('*').eq('file_hash', file_hash).limit(1).execute()
            
            if response.data:
                return response.data[0]
            return None
            
        except Exception as e:
            print(f"Error getting job by hash: {e}")
            return None
    
    def create_job(self, file_hash: str, filename: str, status: str = "processing", 
                   result: Optional[Dict] = None, uploader: Optional[str] = None) -> str:
        """
        Create a new analysis job record
        
        Args:
            file_hash: SHA-256 hash of file content
            filename: Original filename
            status: Job status ('processing', 'complete', 'failed')
            result: Analysis result JSON (optional)
            uploader: User identifier (optional)
            
        Returns:
            job_id of created record
        """
        try:
            data = {
                "file_hash": file_hash,
                "filename": filename,
                "status": status,
                "uploader": uploader
            }
            
            if result:
                data["result"] = result
                data["completed_at"] = datetime.utcnow().isoformat()
            
            response = self.client.table('analysis_jobs').insert(data).execute()
            
            if response.data:
                return response.data[0]['job_id']
            else:
                raise Exception("Failed to create job record")
                
        except Exception as e:
            print(f"Error creating job: {e}")
            raise
    
    def store_analysis(self, file_hash: str, filename: str, result_json: Dict[str, Any], 
                      status: str = "complete", uploader: Optional[str] = None) -> str:
        """
        Store complete analysis results
        
        Args:
            file_hash: SHA-256 hash of file content
            filename: Original filename
            result_json: Complete analysis result
            status: Job status
            uploader: User identifier (optional)
            
        Returns:
            job_id of stored record
        """
        try:
            # Create main job record
            job_id = self.create_job(file_hash, filename, status, result_json, uploader)
            
            # Store individual sequences if present
            if "sequences" in result_json:
                self._store_sequences(job_id, result_json["sequences"])
            
            # Store sample metadata if present
            if "metadata" in result_json:
                self._store_sample_metadata(job_id, result_json["metadata"])
            
            return job_id
            
        except Exception as e:
            print(f"Error storing analysis: {e}")
            raise
    
    def _store_sequences(self, job_id: str, sequences: List[Dict[str, Any]]):
        """Store individual sequence records"""
        try:
            sequence_records = []
            
            for seq in sequences:
                record = {
                    "job_id": job_id,
                    "accession": seq.get("accession"),
                    "taxonomy": seq.get("taxonomy"),
                    "length": seq.get("length"),
                    "confidence": seq.get("confidence"),
                    "overlap": seq.get("overlap"),
                    "cluster": seq.get("cluster"),
                    "novelty_score": seq.get("novelty_score"),
                    "status": seq.get("status")
                }
                sequence_records.append(record)
            
            if sequence_records:
                self.client.table('sequences').insert(sequence_records).execute()
                
        except Exception as e:
            print(f"Error storing sequences: {e}")
            # Don't raise - sequences are supplementary data
    
    def _store_sample_metadata(self, job_id: str, metadata: Dict[str, Any]):
        """Store sample metadata"""
        try:
            sample_record = {
                "job_id": job_id,
                "sample_name": metadata.get("sampleName"),
                "total_sequences": metadata.get("totalSequences"),
                "processing_time": metadata.get("processingTime"),
                "avg_confidence": metadata.get("avgConfidence")
            }
            
            self.client.table('samples').insert(sample_record).execute()
            
        except Exception as e:
            print(f"Error storing sample metadata: {e}")
            # Don't raise - metadata is supplementary
    
    def get_job_by_id(self, job_id: str) -> Optional[Dict[str, Any]]:
        """
        Get job by ID
        
        Args:
            job_id: Job UUID
            
        Returns:
            Job record if found, None otherwise
        """
        try:
            response = self.client.table('analysis_jobs').select('*').eq('job_id', job_id).limit(1).execute()
            
            if response.data:
                return response.data[0]
            return None
            
        except Exception as e:
            print(f"Error getting job by ID: {e}")
            return None
    
    def get_all_jobs(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Get all jobs (most recent first)
        
        Args:
            limit: Maximum number of jobs to return
            
        Returns:
            List of job records
        """
        try:
            response = (self.client.table('analysis_jobs')
                       .select('job_id, filename, status, created_at, completed_at')
                       .order('created_at', desc=True)
                       .limit(limit)
                       .execute())
            
            return response.data or []
            
        except Exception as e:
            print(f"Error getting all jobs: {e}")
            return []
    
    def get_taxonomic_composition(self, job_id: str, rank: str = "phylum") -> Dict[str, Any]:
        """
        Get taxonomic composition data for visualization
        
        Args:
            job_id: Job UUID
            rank: Taxonomic rank to aggregate by
            
        Returns:
            Composition data for charts
        """
        try:
            # Get sequences for this job
            response = (self.client.table('sequences')
                       .select('taxonomy')
                       .eq('job_id', job_id)
                       .execute())
            
            if not response.data:
                return {"composition": [], "total": 0}
            
            # Count by taxonomic rank
            rank_counts = {}
            
            for seq in response.data:
                taxonomy = seq.get('taxonomy', '')
                parts = taxonomy.split(';')
                
                # Extract rank (simplified logic)
                rank_name = "Unknown"
                if len(parts) > 1:
                    rank_name = parts[1].strip()  # Use second level as default
                
                rank_counts[rank_name] = rank_counts.get(rank_name, 0) + 1
            
            # Format for frontend
            composition = [
                {"name": name, "value": count}
                for name, count in sorted(rank_counts.items(), key=lambda x: x[1], reverse=True)
            ]
            
            return {
                "composition": composition,
                "total": len(response.data),
                "rank": rank
            }
            
        except Exception as e:
            print(f"Error getting taxonomic composition: {e}")
            return {"composition": [], "total": 0}
    
    def get_hierarchical_data(self, job_id: str) -> Dict[str, Any]:
        """Get hierarchical taxonomy data for Krona/Sunburst plots"""
        try:
            response = (self.client.table('sequences')
                       .select('taxonomy')
                       .eq('job_id', job_id)
                       .execute())
            
            if not response.data:
                return {"hierarchy": []}
            
            # Build hierarchy tree (simplified)
            hierarchy = {}
            
            for seq in response.data:
                taxonomy = seq.get('taxonomy', '')
                parts = [p.strip() for p in taxonomy.split(';') if p.strip()]
                
                current = hierarchy
                for part in parts:
                    if part not in current:
                        current[part] = {"count": 0, "children": {}}
                    current[part]["count"] += 1
                    current = current[part]["children"]
            
            return {"hierarchy": hierarchy}
            
        except Exception as e:
            print(f"Error getting hierarchical data: {e}")
            return {"hierarchy": []}
    
    def get_sankey_data(self, job_id: str) -> Dict[str, Any]:
        """Get Sankey diagram data for taxonomy flow"""
        try:
            response = (self.client.table('sequences')
                       .select('taxonomy')
                       .eq('job_id', job_id)
                       .execute())
            
            if not response.data:
                return {"nodes": [], "links": []}
            
            # Build Sankey nodes and links (simplified)
            nodes = set()
            links = {}
            
            for seq in response.data:
                taxonomy = seq.get('taxonomy', '')
                parts = [p.strip() for p in taxonomy.split(';') if p.strip()]
                
                for i in range(len(parts) - 1):
                    source = parts[i]
                    target = parts[i + 1]
                    
                    nodes.add(source)
                    nodes.add(target)
                    
                    link_key = f"{source} -> {target}"
                    links[link_key] = links.get(link_key, 0) + 1
            
            sankey_nodes = [{"name": node} for node in nodes]
            sankey_links = [
                {"source": link.split(" -> ")[0], "target": link.split(" -> ")[1], "value": count}
                for link, count in links.items()
            ]
            
            return {"nodes": sankey_nodes, "links": sankey_links}
            
        except Exception as e:
            print(f"Error getting Sankey data: {e}")
            return {"nodes": [], "links": []}
    
    def get_heatmap_data(self, job_ids: List[str], rank: str = "class") -> Dict[str, Any]:
        """Get heatmap data for multiple samples comparison"""
        try:
            # This would require more complex queries for multi-sample analysis
            # Simplified implementation
            return {"samples": [], "taxa": [], "matrix": []}
            
        except Exception as e:
            print(f"Error getting heatmap data: {e}")
            return {"samples": [], "taxa": [], "matrix": []}
    
    def calculate_beta_diversity(self, job_ids: List[str]) -> Dict[str, Any]:
        """Calculate beta diversity between samples"""
        try:
            # This would require complex statistical calculations
            # Simplified implementation
            return {"diversity_matrix": [], "job_ids": job_ids}
            
        except Exception as e:
            print(f"Error calculating beta diversity: {e}")
            return {"diversity_matrix": [], "job_ids": job_ids}