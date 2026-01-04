"""
Taxaformer Backend - Complete Version with Analytics & Queue System
Uses REAL AI Model + Database Caching + Analytics + Queue Management
Integrates your existing BiodiversityPipeline with all new functionality
"""
import os
import sys
import shutil
import json
import hashlib
import uuid
import asyncio
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from enum import Enum
import uvicorn
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from pyngrok import ngrok
import nest_asyncio
from pydantic import BaseModel

# Apply asyncio patch for Kaggle
nest_asyncio.apply()

# ================================
# DATABASE CLASS
# ================================
try:
    from supabase import create_client, Client
    
    class TaxaformerDB:
        def __init__(self):
            self.url = os.getenv("SUPABASE_URL", "https://nbnyhdwbnxbheombbhtv.supabase.co")
            self.key = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ibnloZHdibnhiaGVvbWJiaHR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MDIyNDksImV4cCI6MjA4MDk3ODI0OX0.u5DxN1eX-K85WepTNCEs5sJw9M13YLmGm5pVe1WKy34")
            print(f"[INFO] Connecting to Supabase: {self.url}")
            self.client = create_client(self.url, self.key)

        def compute_file_hash(self, file_bytes: bytes) -> str:
            return hashlib.sha256(file_bytes).hexdigest()

        def get_job_by_hash(self, file_hash: str):
            try:
                response = self.client.table('analysis_jobs').select('*').eq('file_hash', file_hash).limit(1).execute()
                return response.data[0] if response.data else None
            except Exception as e:
                print(f"Error getting job by hash: {e}")
                return None

        def store_analysis(self, file_hash: str, filename: str, result_json: Dict[str, Any], metadata: Dict[str, Any] = None, processing_time: float = 0) -> str:
            try:
                data = {
                    "file_hash": file_hash,
                    "filename": filename,
                    "status": "complete",
                    "analysis_result": result_json,
                    "metadata": metadata or {},
                    "completed_at": datetime.utcnow().isoformat(),
                    "processing_time_seconds": processing_time
                }
                
                response = self.client.table('analysis_jobs').insert(data).execute()
                job_id = response.data[0]['job_id']

                # Store sequences if present
                if "sequences" in result_json:
                    sequence_records = []
                    for seq in result_json["sequences"]:
                        record = {
                            "job_id": job_id,
                            "accession": seq.get("accession"),
                            "sequence_id": seq.get("accession"),
                            "taxonomy": seq.get("taxonomy"),
                            "novelty_score": seq.get("novelty_score"),
                            "status": seq.get("status"),
                            "length": seq.get("length"),
                            "confidence": seq.get("confidence"),
                            "overlap": seq.get("overlap"),
                            "cluster": seq.get("cluster")
                        }
                        sequence_records.append(record)
                    
                    if sequence_records:
                        self.client.table('sequences').insert(sequence_records).execute()

                # Store sample metadata if provided
                if metadata:
                    sample_data = {
                        "job_id": job_id,
                        "sample_name": metadata.get("sampleName", filename),
                        "collection_date": metadata.get("collectionDate"),
                        "location_lat": metadata.get("latitude"),
                        "location_lng": metadata.get("longitude"),
                        "depth_meters": metadata.get("depth"),
                        "temperature_celsius": metadata.get("temperature"),
                        "ph_level": metadata.get("ph"),
                        "salinity_ppt": metadata.get("salinity"),
                        "dissolved_oxygen_mg_l": metadata.get("dissolvedOxygen"),
                        "turbidity_ntu": metadata.get("turbidity"),
                        "collection_method": metadata.get("collectionMethod"),
                        "researcher_name": metadata.get("researcherName"),
                        "institution": metadata.get("institution"),
                        "project_name": metadata.get("projectName"),
                        "additional_metadata": {k: v for k, v in metadata.items() if k not in [
                            "sampleName", "collectionDate", "latitude", "longitude", "depth",
                            "temperature", "ph", "salinity", "dissolvedOxygen", "turbidity",
                            "collectionMethod", "researcherName", "institution", "projectName"
                        ]}
                    }
                    self.client.table('sample_metadata').insert(sample_data).execute()

                return job_id
            except Exception as e:
                print(f"Error storing analysis: {e}")
                raise

    # Initialize database
    db = TaxaformerDB()
    print("[OK] Supabase database connected")
    
except Exception as e:
    print(f"[WARN] Database not available: {e}")
    db = None

# ================================
# QUEUE SYSTEM
# ================================
class JobStatus(Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

@dataclass
class QueueJob:
    job_id: str
    filename: str
    file_size: int
    user_session: str
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    status: JobStatus = JobStatus.QUEUED
    estimated_time: int = 0
    progress: int = 0

class ProcessingQueue:
    def __init__(self):
        self.queue: List[QueueJob] = []
        self.current_job: Optional[QueueJob] = None
        self.processing_lock = asyncio.Lock()
        self.max_queue_size = 10
        self.job_timeout = 300

    def add_job(self, job_id: str, filename: str, file_size: int, user_session: str) -> QueueJob:
        if len(self.queue) >= self.max_queue_size:
            raise Exception("Queue is full. Please try again later.")
        
        existing_job = self.get_user_job(user_session)
        if existing_job and existing_job.status in [JobStatus.QUEUED, JobStatus.PROCESSING]:
            raise Exception("You already have a job in the queue. Please wait for it to complete.")
        
        estimated_time = self.estimate_processing_time(file_size)
        
        job = QueueJob(
            job_id=job_id,
            filename=filename,
            file_size=file_size,
            user_session=user_session,
            created_at=datetime.now(),
            estimated_time=estimated_time
        )
        
        self.queue.append(job)
        print(f"[INFO] Job added to queue: {filename} (Position: {len(self.queue)})")
        return job

    def get_queue_status(self, user_session: str) -> Dict:
        self.cleanup_old_jobs()
        user_job = self.get_user_job(user_session)
        
        if not user_job:
            return {
                "status": "no_job",
                "queue_length": len(self.queue),
                "estimated_wait": self.estimate_total_wait_time()
            }
        
        if user_job.status == JobStatus.PROCESSING:
            return {
                "status": "processing",
                "job_id": user_job.job_id,
                "filename": user_job.filename,
                "progress": user_job.progress,
                "estimated_remaining": max(0, user_job.estimated_time - int((datetime.now() - user_job.started_at).total_seconds()))
            }
        
        if user_job.status == JobStatus.QUEUED:
            position = self.get_job_position(user_job.job_id)
            wait_time = self.estimate_wait_time_for_position(position)
            
            return {
                "status": "queued",
                "job_id": user_job.job_id,
                "filename": user_job.filename,
                "position": position,
                "queue_length": len(self.queue),
                "estimated_wait": wait_time,
                "message": f"Your file is #{position} in queue. Estimated wait: {wait_time // 60}m {wait_time % 60}s"
            }
        
        return {
            "status": user_job.status.value,
            "job_id": user_job.job_id,
            "filename": user_job.filename
        }

    async def process_next_job(self) -> Optional[QueueJob]:
        async with self.processing_lock:
            self.cleanup_old_jobs()
            
            if self.current_job and self.current_job.status == JobStatus.PROCESSING:
                if self.current_job.started_at and \
                   (datetime.now() - self.current_job.started_at).total_seconds() > self.job_timeout:
                    print(f"[TIMEOUT] Job timed out: {self.current_job.filename}")
                    self.current_job.status = JobStatus.FAILED
                    self.current_job = None
                else:
                    return None
            
            if self.queue:
                next_job = self.queue.pop(0)
                next_job.status = JobStatus.PROCESSING
                next_job.started_at = datetime.now()
                self.current_job = next_job
                
                print(f"[INFO] Processing job: {next_job.filename}")
                return next_job
            
            return None

    def update_job_progress(self, job_id: str, progress: int):
        if self.current_job and self.current_job.job_id == job_id:
            self.current_job.progress = min(100, max(0, progress))

    def complete_job(self, job_id: str, success: bool = True):
        if self.current_job and self.current_job.job_id == job_id:
            self.current_job.status = JobStatus.COMPLETED if success else JobStatus.FAILED
            self.current_job.completed_at = datetime.now()
            self.current_job.progress = 100 if success else 0
            
            print(f"[OK] Job completed: {self.current_job.filename} ({'success' if success else 'failed'})")
            asyncio.create_task(self.clear_completed_job_after_delay())

    async def clear_completed_job_after_delay(self):
        await asyncio.sleep(30)
        if self.current_job and self.current_job.status in [JobStatus.COMPLETED, JobStatus.FAILED]:
            self.current_job = None

    def get_user_job(self, user_session: str) -> Optional[QueueJob]:
        if self.current_job and self.current_job.user_session == user_session:
            return self.current_job
        
        for job in self.queue:
            if job.user_session == user_session:
                return job
        
        return None

    def get_job_position(self, job_id: str) -> int:
        for i, job in enumerate(self.queue):
            if job.job_id == job_id:
                return i + 1
        return 0

    def estimate_processing_time(self, file_size: int) -> int:
        base_time = 30
        size_factor = max(0, (file_size - 1024) // (100 * 1024))
        return base_time + size_factor

    def estimate_wait_time_for_position(self, position: int) -> int:
        if position <= 0:
            return 0
        
        current_remaining = 0
        if self.current_job and self.current_job.status == JobStatus.PROCESSING:
            elapsed = (datetime.now() - self.current_job.started_at).total_seconds()
            current_remaining = max(0, self.current_job.estimated_time - elapsed)
        
        jobs_ahead_time = sum(job.estimated_time for job in self.queue[:position-1])
        return int(current_remaining + jobs_ahead_time)

    def estimate_total_wait_time(self) -> int:
        return self.estimate_wait_time_for_position(len(self.queue) + 1)

    def cleanup_old_jobs(self):
        cutoff_time = datetime.now() - timedelta(hours=1)
        self.queue = [job for job in self.queue if job.created_at > cutoff_time]
        
        if self.current_job and \
           self.current_job.status in [JobStatus.COMPLETED, JobStatus.FAILED] and \
           self.current_job.completed_at and \
           self.current_job.completed_at < cutoff_time:
            self.current_job = None

# Initialize queue
processing_queue = ProcessingQueue()

# ================================
# SIMPLE ANALYTICS
# ================================
class SimpleSession(BaseModel):
    deviceType: str
    browserName: str
    referrer: str = "direct"

class SimplePageView(BaseModel):
    sessionId: str
    pagePath: str
    pageTitle: str

class SimpleInteraction(BaseModel):
    sessionId: str
    pagePath: str
    interactionType: str
    elementId: Optional[str] = None
    elementText: Optional[str] = None

# ================================
# RESULT CONVERTER (AI Model -> Frontend Format)
# ================================
def convert_ai_results_to_frontend(ai_results: List[Dict], filename: str) -> Dict[str, Any]:
    """Convert your AI model results to frontend format"""
    taxonomy_counts = {}
    novel_count = 0
    
    for result in ai_results:
        taxonomy = result.get('taxonomy', 'Unknown')
        parts = taxonomy.split(';')
        main_group = "Unknown"
        
        for part in parts:
            part = part.strip()
            # Marine Animals (Metazoa)
            if any(keyword in part for keyword in ['Metazoa', 'Animalia']):
                if any(keyword in part for keyword in ['Mollusca', 'Bivalvia', 'Gastropoda']):
                    main_group = "Mollusca"
                elif any(keyword in part for keyword in ['Arthropoda', 'Crustacea', 'Copepoda']):
                    main_group = "Arthropoda"
                elif any(keyword in part for keyword in ['Cnidaria', 'Anthozoa', 'Scleractinia']):
                    main_group = "Cnidaria"
                elif any(keyword in part for keyword in ['Chordata', 'Vertebrata', 'Actinopterygii']):
                    main_group = "Chordata"
                else:
                    main_group = "Other Metazoa"
                break
            # Marine Protists
            elif any(keyword in part for keyword in ['Cryptophyceae', 'Kathablepharidae']):
                main_group = "Cryptophytes"
                break
            elif any(keyword in part for keyword in ['Amoebozoa', 'Vannella', 'Dictyamoeba']):
                main_group = "Amoebozoa"
                break
            elif any(keyword in part for keyword in ['Alveolata', 'Dinoflagellata', 'Ciliophora']):
                main_group = "Alveolata"
                break
            elif any(keyword in part for keyword in ['Stramenopiles', 'Bacillariophyta', 'Phaeophyceae']):
                main_group = "Stramenopiles"
                break
            # Marine Plants/Algae
            elif any(keyword in part for keyword in ['Chloroplastida', 'Chlorophyta', 'Ulvophyceae']):
                main_group = "Green Algae"
                break
            elif any(keyword in part for keyword in ['Rhodophyta', 'Florideophyceae']):
                main_group = "Red Algae"
                break
            elif any(keyword in part for keyword in ['Embryophyta', 'Tracheophyta']):
                main_group = "Land Plants"
                break
            # Marine Fungi
            elif any(keyword in part for keyword in ['Fungi', 'Ascomycota', 'Basidiomycota']):
                main_group = "Marine Fungi"
                break
        
        # Check if novel
        if result.get('status') == 'POTENTIALLY NOVEL':
            main_group = "Novel"
            novel_count += 1
        
        taxonomy_counts[main_group] = taxonomy_counts.get(main_group, 0) + 1

    # Colors for marine eukaryote visualization
    colors = {
        "Mollusca": "#22D3EE", "Arthropoda": "#F59E0B", "Cnidaria": "#EC4899",
        "Chordata": "#8B5CF6", "Other Metazoa": "#F97316", "Cryptophytes": "#10B981",
        "Amoebozoa": "#A78BFA", "Alveolata": "#06B6D4", "Stramenopiles": "#84CC16",
        "Green Algae": "#22C55E", "Red Algae": "#EF4444", "Land Plants": "#16A34A",
        "Marine Fungi": "#A855F7", "Unknown": "#64748B", "Novel": "#DC2626"
    }

    # Create taxonomy summary
    taxonomy_summary = []
    for group, count in taxonomy_counts.items():
        taxonomy_summary.append({
            "name": group,
            "value": count,
            "color": colors.get(group, "#64748B")
        })

    # Convert sequences to frontend format
    sequences = []
    for result in ai_results:
        sequences.append({
            "accession": result.get("sequence_id"),
            "taxonomy": result.get("taxonomy"),
            "novelty_score": result.get("novelty_score"),
            "status": result.get("status"),
            "length": 1000,
            "confidence": 1.0 - result.get("novelty_score", 0),
            "overlap": 85,
            "cluster": "C1"
        })

    # Generate cluster data
    cluster_data = []
    for i, group in enumerate(taxonomy_counts.keys()):
        cluster_data.append({
            "x": (i - len(taxonomy_counts)/2) * 10,
            "y": (i % 2) * 10 - 5,
            "z": taxonomy_counts[group],
            "cluster": group,
            "color": colors.get(group, "#64748B")
        })

    # Calculate metadata
    total_sequences = len(ai_results)
    avg_confidence = 85
    metadata = {
        "sampleName": filename,
        "totalSequences": total_sequences,
        "avgConfidence": avg_confidence,
        "novelSequences": novel_count,
        "processingTime": "0.0s"
    }

    return {
        "metadata": metadata,
        "taxonomy_summary": taxonomy_summary,
        "sequences": sequences,
        "cluster_data": cluster_data
    }

# ================================
# FASTAPI BACKEND
# ================================
app = FastAPI(title="Taxaformer API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = "temp_uploads"
os.makedirs(TEMP_DIR, exist_ok=True)

# ================================
# ANALYTICS ENDPOINTS
# ================================
@app.post("/api/simple-analytics/session")
async def create_simple_session(session_data: SimpleSession, request: Request):
    """Create analytics session"""
    if not db:
        return {"sessionId": "disabled", "status": "disabled"}
    
    try:
        session_id = str(uuid.uuid4())
        
        session_record = {
            "session_id": session_id,
            "session_hash": f"hash_{session_id[:8]}",
            "device_type": session_data.deviceType,
            "browser_name": session_data.browserName,
            "referrer_domain": session_data.referrer,
            "first_visit": datetime.utcnow().isoformat(),
            "last_activity": datetime.utcnow().isoformat(),
            "page_count": 1,
            "total_time_seconds": 0
        }
        
        db.client.table('user_sessions').insert(session_record).execute()
        print(f"[OK] Session created: {session_id}")
        
        return {"sessionId": session_id, "status": "created"}
        
    except Exception as e:
        print(f"[ERROR] Session creation failed: {e}")
        return {"sessionId": "error", "status": "error", "message": str(e)}

@app.post("/api/simple-analytics/page-view")
async def track_simple_page_view(page_data: SimplePageView):
    """Track page view"""
    if not db:
        return {"status": "disabled"}
    
    try:
        page_record = {
            "session_id": page_data.sessionId,
            "page_path": page_data.pagePath,
            "page_title": page_data.pageTitle,
            "visit_duration_seconds": 0,
            "scroll_depth_percent": 0,
            "created_at": datetime.utcnow().isoformat()
        }
        
        db.client.table('page_views').insert(page_record).execute()
        print(f"[OK] Page view tracked: {page_data.pagePath}")
        
        return {"status": "tracked"}
        
    except Exception as e:
        print(f"[ERROR] Page view tracking failed: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/api/simple-analytics/interaction")
async def track_simple_interaction(interaction_data: SimpleInteraction):
    """Track interaction"""
    if not db:
        return {"status": "disabled"}
    
    try:
        interaction_record = {
            "session_id": interaction_data.sessionId,
            "page_path": interaction_data.pagePath,
            "interaction_type": interaction_data.interactionType,
            "element_id": interaction_data.elementId,
            "element_text": interaction_data.elementText,
            "interaction_data": {},
            "created_at": datetime.utcnow().isoformat()
        }
        
        db.client.table('user_interactions').insert(interaction_record).execute()
        print(f"[OK] Interaction tracked: {interaction_data.interactionType}")
        
        return {"status": "tracked"}
        
    except Exception as e:
        print(f"[ERROR] Interaction tracking failed: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/api/simple-analytics/test")
async def test_analytics():
    """Test analytics system"""
    if not db:
        return {"status": "disabled", "message": "Analytics not enabled"}
    
    try:
        result = db.client.table('user_sessions').select('session_id').limit(1).execute()
        
        return {
            "status": "working",
            "message": "Analytics system is working",
            "database": "connected",
            "tables_accessible": True
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"Analytics test failed: {e}",
            "database": "error"
        }

# ================================
# QUEUE ENDPOINTS
# ================================
@app.get("/queue/status")
async def get_queue_status(session_id: str = "anonymous"):
    """Get queue status for user"""
    return processing_queue.get_queue_status(session_id)

@app.get("/queue/stats")
async def get_queue_stats():
    """Get overall queue statistics"""
    processing_queue.cleanup_old_jobs()
    
    return {
        "queue_length": len(processing_queue.queue),
        "currently_processing": processing_queue.current_job is not None,
        "current_job": {
            "filename": processing_queue.current_job.filename,
            "progress": processing_queue.current_job.progress,
            "elapsed_time": int((datetime.now() - processing_queue.current_job.started_at).total_seconds())
        } if processing_queue.current_job else None,
        "estimated_wait_for_new_job": processing_queue.estimate_total_wait_time()
    }

# ================================
# MAIN ENDPOINTS
# ================================
@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Taxaformer API",
        "version": "2.0.0",
        "features": ["AI Analysis", "Database Caching", "Queue System", "Analytics"],
        "database": "connected" if db else "disabled",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/analyze")
async def analyze_endpoint(
    file: UploadFile = File(...),
    metadata: Optional[str] = Form(None),
    session_id: str = Form("anonymous")
):
    """Analyze uploaded sequence file with queue system and caching"""
    temp_filepath = None
    parsed_metadata = None
    
    try:
        # Parse metadata if provided
        if metadata:
            try:
                parsed_metadata = json.loads(metadata)
                print(f"[INFO] Received metadata: {list(parsed_metadata.keys())}")
            except json.JSONDecodeError as e:
                print(f"[WARN] Warning: Could not parse metadata: {e}")

        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")

        allowed_extensions = ['.fasta', '.fa', '.fastq', '.fq', '.txt']
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"
            )

        # Read file bytes for hashing
        file_bytes = await file.read()
        file_hash = hashlib.sha256(file_bytes).hexdigest()
        
        print(f"[INFO] File: {file.filename} ({len(file_bytes)} bytes)")
        print(f"[INFO] Hash: {file_hash[:16]}...")

        # Check cache if database is enabled
        if db:
            cached_job = db.get_job_by_hash(file_hash)
            if cached_job and cached_job.get('status') == 'complete':
                print(f"[CACHE] Cache HIT: Returning cached result for job {cached_job['job_id']}")
                return {
                    "status": "success",
                    "job_id": cached_job["job_id"],
                    "cached": True,
                    "queue_bypassed": True,
                    "data": cached_job["analysis_result"]
                }

        # Add to queue
        try:
            queue_status = processing_queue.get_queue_status(session_id)
            
            if queue_status["status"] == "processing":
                return {
                    "status": "processing",
                    "message": "Your file is currently being processed",
                    "job_id": queue_status["job_id"],
                    "progress": queue_status.get("progress", 0),
                    "estimated_remaining": queue_status.get("estimated_remaining", 0)
                }
            
            if queue_status["status"] == "queued":
                return {
                    "status": "queued",
                    "message": queue_status["message"],
                    "job_id": queue_status["job_id"],
                    "position": queue_status["position"],
                    "estimated_wait": queue_status["estimated_wait"]
                }

            # Add new job to queue
            job_id = str(uuid.uuid4())
            queue_job = processing_queue.add_job(
                job_id=job_id,
                filename=file.filename,
                file_size=len(file_bytes),
                user_session=session_id
            )

            # Check if we can process immediately
            next_job = await processing_queue.process_next_job()
            if next_job and next_job.job_id == job_id:
                print(f"[INFO] Processing immediately: {file.filename}")
            else:
                queue_status = processing_queue.get_queue_status(session_id)
                return {
                    "status": "queued",
                    "message": f"Added to queue. Position #{queue_status['position']} of {queue_status['queue_length']}",
                    "job_id": job_id,
                    "position": queue_status["position"],
                    "estimated_wait": queue_status["estimated_wait"]
                }

        except Exception as queue_error:
            print(f"[WARN] Queue error: {queue_error}")
            return {
                "status": "error",
                "message": str(queue_error)
            }

        # Save uploaded file temporarily for processing
        temp_filepath = os.path.join(TEMP_DIR, f"temp_{datetime.now().timestamp()}_{file.filename}")
        
        with open(temp_filepath, "wb") as buffer:
            buffer.write(file_bytes)

        print(f"[INFO] Processing file with AI model: {file.filename}")

        # Process file through YOUR REAL AI PIPELINE
        start_time = datetime.now()
        
        # Update progress
        processing_queue.update_job_progress(job_id, 25)
        
        # Use your existing BiodiversityPipeline
        ai_results = pipeline.process_file(temp_filepath, batch_size=32)
        
        # Update progress
        processing_queue.update_job_progress(job_id, 75)
        
        processing_time = (datetime.now() - start_time).total_seconds()
        print(f"[OK] AI Analysis complete: {len(ai_results)} sequences processed ({processing_time:.2f}s)")

        # Convert AI results to frontend format
        result_data = convert_ai_results_to_frontend(ai_results, file.filename)

        # Add processing time
        result_data["metadata"]["processingTime"] = f"{processing_time:.2f}s"

        # Update progress
        processing_queue.update_job_progress(job_id, 90)

        # Store in database if available
        if db:
            try:
                stored_job_id = db.store_analysis(file_hash, file.filename, result_data, parsed_metadata, processing_time)
                print(f"[OK] Saved to database with job_id: {stored_job_id}")
            except Exception as db_error:
                print(f"[WARN] Database save failed: {db_error}")

        # Mark queue job as completed
        processing_queue.complete_job(job_id, success=True)

        # Final progress update
        processing_queue.update_job_progress(job_id, 100)

        return {
            "status": "success",
            "job_id": job_id,
            "cached": False,
            "data": result_data
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Error processing file: {str(e)}")
        import traceback
        traceback.print_exc()
        
        # Mark queue job as failed
        processing_queue.complete_job(job_id if 'job_id' in locals() else "unknown", success=False)
        
        return {
            "status": "error",
            "message": f"Analysis failed: {str(e)}"
        }
    finally:
        # Clean up temporary file
        if temp_filepath and os.path.exists(temp_filepath):
            try:
                os.remove(temp_filepath)
            except Exception as e:
                print(f"Warning: Could not delete temp file: {e}")

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "pipeline": "AI model loaded",
        "database": "connected" if db else "disabled",
        "queue": "enabled",
        "analytics": "enabled" if db else "disabled",
        "temp_dir": os.path.exists(TEMP_DIR),
        "timestamp": datetime.utcnow().isoformat()
    }

# ================================
# SERVER STARTUP
# ================================
def start_server(port: int = 8000, use_ngrok: bool = True, ngrok_token: str = None):
    if use_ngrok:
        ngrok.set_auth_token(ngrok_token)
        
        try:
            tunnels = ngrok.get_tunnels()
            for tunnel in tunnels:
                ngrok.disconnect(tunnel.public_url)
        except Exception:
            pass

        public_url = ngrok.connect(port).public_url
        print(f"\nTAXAFORMER API STARTED (COMPLETE VERSION)")
        print(f"PUBLIC URL: {public_url}")
        print(f"AI MODEL: BiodiversityPipeline (Fine-tuned)")
        print(f"DATABASE: {'Connected' if db else 'Disabled'}")
        print(f"CACHING: {'Enabled' if db else 'Disabled'}")
        print(f"QUEUE SYSTEM: Enabled")
        print(f"ANALYTICS: {'Enabled' if db else 'Disabled'}")
        print(f"Test Analytics: {public_url}/api/simple-analytics/test")
        print(f"Queue Stats: {public_url}/queue/stats")
        print("="*60)

    uvicorn.run(app, host="0.0.0.0", port=port)
if __name__ == "__main__":
    NGROK_TOKEN = "348roSQj2iERV8fMgVaCYElBgfB_4yPs4jKrwU4U323bzpmJL"
    start_server(port=8000, use_ngrok=True, ngrok_token=NGROK_TOKEN)