"""
Taxaformer Backend API with Database Caching
FastAPI server with file hash-based idempotency and Supabase storage
"""
import os
import sys
import shutil
import json
import hashlib
import uuid
from datetime import datetime
from typing import Dict, Any, Optional
import uvicorn
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pyngrok import ngrok
from pipeline import TaxonomyPipeline

# Add parent directory to path for db imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import analytics
try:
    # Try importing from same directory first
    from .analytics_api import add_analytics_to_app
    ANALYTICS_AVAILABLE = True
    print("[OK] Analytics module loaded")
except ImportError:
    try:
        # Fallback to direct import
        import analytics_api
        add_analytics_to_app = analytics_api.add_analytics_to_app
        ANALYTICS_AVAILABLE = True
        print("[OK] Analytics module loaded (fallback)")
    except ImportError:
        ANALYTICS_AVAILABLE = False
        print("[WARN] Analytics module not available")

# Import queue system
try:
    # Try importing from same directory first
    from .queue_system import processing_queue, QueueJob
    QUEUE_AVAILABLE = True
    print("[OK] Queue system loaded")
except ImportError:
    try:
        # Fallback to direct import
        import queue_system
        processing_queue = queue_system.processing_queue
        QueueJob = queue_system.QueueJob
        QUEUE_AVAILABLE = True
        print("[OK] Queue system loaded (fallback)")
    except ImportError:
        QUEUE_AVAILABLE = False
        print("[WARN] Queue system not available")

# Feature flag for database usage
USE_DATABASE = os.getenv("USE_DATABASE", "true").lower() == "true"

# Initialize database (optional - backend works without it)
db = None
if USE_DATABASE:
    try:
        from db.supabase_db import TaxaformerDB
        db = TaxaformerDB()
        print("[OK] Supabase database connected")
    except Exception as e:
        print(f"[WARN] Database not available: {e}")
        print("[WARN] Backend will work without database (no data persistence)")
        USE_DATABASE = False

# Initialize FastAPI app
app = FastAPI(
    title="Taxaformer API",
    description="Taxonomic analysis pipeline for DNA sequences with caching",
    version="1.1.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize pipeline
pipeline = TaxonomyPipeline()

# Directory for temporary files
TEMP_DIR = "temp_uploads"
os.makedirs(TEMP_DIR, exist_ok=True)

# Add analytics to the app
if ANALYTICS_AVAILABLE:
    add_analytics_to_app(app)
    print("[OK] Analytics endpoints added to main API")

# Add simple analytics as backup
try:
    from simple_analytics import add_simple_analytics
    add_simple_analytics(app)
    print("[OK] Simple Analytics endpoints added")
except ImportError:
    print("[WARN] Simple Analytics not available")

# Add queue endpoints
@app.get("/queue/status")
async def get_queue_status(session_id: str = "anonymous"):
    """Get queue status for user"""
    if not QUEUE_AVAILABLE:
        return {"status": "disabled"}
    
    return processing_queue.get_queue_status(session_id)

@app.get("/queue/stats")
async def get_queue_stats():
    """Get overall queue statistics"""
    if not QUEUE_AVAILABLE:
        return {"status": "disabled"}
    
    return processing_queue.get_queue_stats()


def compute_file_hash(file_bytes: bytes) -> str:
    """
    Compute SHA-256 hash of file bytes for idempotency
    
    Args:
        file_bytes: Raw file content
        
    Returns:
        Hex string of file hash
    """
    return hashlib.sha256(file_bytes).hexdigest()


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "online",
        "service": "Taxaformer API",
        "version": "1.1.0",
        "database": "connected" if db else "disabled",
        "caching": USE_DATABASE,
        "timestamp": datetime.utcnow().isoformat()
    }


@app.post("/analyze")
async def analyze_endpoint(
    file: UploadFile = File(...),
    metadata: Optional[str] = Form(None),
    session_id: str = Form("anonymous")
):
    """
    Analyze uploaded sequence file with queue system and caching support
    
    Args:
        file: Uploaded FASTA/FASTQ file
        metadata: Optional JSON string with sample metadata
        session_id: User session ID for queue management
        
    Returns:
        JSON with analysis results, job_id, queue status, and cache status
    """
    temp_filepath = None
    parsed_metadata = None
    
    try:
        # Parse metadata if provided
        if metadata:
            try:
                parsed_metadata = json.loads(metadata)
                print(f"[INFO] Received metadata: {parsed_metadata}")
            except json.JSONDecodeError as e:
                print(f"[WARN] Warning: Could not parse metadata: {e}")
        
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")
        
        # Check file extension
        allowed_extensions = ['.fasta', '.fa', '.fastq', '.fq', '.txt']
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"
            )
        
        # Read file bytes for hashing
        file_bytes = await file.read()
        file_hash = compute_file_hash(file_bytes)
        
        print(f"[INFO] File: {file.filename} ({len(file_bytes)} bytes)")
        print(f"[INFO] Hash: {file_hash[:16]}...")
        
        # Check cache if database is enabled
        if USE_DATABASE and db:
            cached_job = db.get_job_by_hash(file_hash)
            if cached_job and cached_job.get('status') == 'complete':
                print(f"[CACHE] Cache HIT: Returning cached result for job {cached_job['job_id']}")
                return {
                    "status": "success",
                    "job_id": cached_job["job_id"],
                    "cached": True,
                    "queue_bypassed": True,
                    "data": cached_job["result"]
                }
        
        # Add to queue if queue system is available
        if QUEUE_AVAILABLE:
            try:
                # Check current queue status for user
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
                job_id = str(uuid.uuid4()) if 'uuid' in globals() else f"job_{datetime.now().timestamp()}"
                queue_job = processing_queue.add_job(
                    job_id=job_id,
                    filename=file.filename,
                    file_size=len(file_bytes),
                    user_session=session_id
                )
                
                # Check if we can process immediately
                next_job = await processing_queue.process_next_job()
                if next_job and next_job.job_id == job_id:
                    # Process immediately
                    print(f"[INFO] Processing immediately: {file.filename}")
                else:
                    # Return queue status
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
        
        # Check for existing processing/failed jobs
        if USE_DATABASE and db:
            cached_job = db.get_job_by_hash(file_hash)
            if cached_job and cached_job.get('status') == 'processing':
                # Job is still processing - return processing status
                return {
                    "status": "processing",
                    "job_id": cached_job["job_id"],
                    "message": "Analysis in progress. Please check back later."
                }
            elif cached_job and cached_job.get('status') == 'failed':
                print(f"[WARN] Previous analysis failed, retrying...")
        
        # Create processing job record if database enabled
        job_id = None
        if USE_DATABASE and db:
            try:
                job_id = db.create_job(
                    file_hash=file_hash,
                    filename=file.filename,
                    status="processing"
                )
                print(f"[INFO] Created processing job: {job_id}")
            except Exception as db_error:
                print(f"[WARN] Failed to create job record: {db_error}")
                # Continue without database
        
        # Save uploaded file temporarily for processing
        temp_filepath = os.path.join(TEMP_DIR, f"temp_{datetime.now().timestamp()}_{file.filename}")
        
        with open(temp_filepath, "wb") as buffer:
            buffer.write(file_bytes)
        
        print(f"[INFO] Processing file: {file.filename}")
        
        # Process file through pipeline
        start_time = datetime.now()
        try:
            result_data = pipeline.process_file(temp_filepath, file.filename)
            processing_time = (datetime.now() - start_time).total_seconds()
            
            # Add processing time and metadata to result
            if "metadata" in result_data:
                result_data["metadata"]["processingTime"] = f"{processing_time:.2f}s"
                if parsed_metadata:
                    result_data["metadata"]["userMetadata"] = parsed_metadata
            elif parsed_metadata:
                result_data["metadata"] = {
                    "processingTime": f"{processing_time:.2f}s",
                    "userMetadata": parsed_metadata
                }
            
            print(f"[OK] Analysis complete: {file.filename} ({processing_time:.2f}s)")
            
            # Update job with results if database enabled
            if USE_DATABASE and db and job_id:
                try:
                    # Update existing job record
                    update_data = {
                        "status": "complete",
                        "result": result_data,
                        "completed_at": datetime.utcnow().isoformat()
                    }
                    
                    db.client.table('analysis_jobs').update(update_data).eq('job_id', job_id).execute()
                    
                    # Store sequences and metadata
                    if "sequences" in result_data:
                        db._store_sequences(job_id, result_data["sequences"])
                    if "metadata" in result_data:
                        db._store_sample_metadata(job_id, result_data["metadata"])
                    
                    print(f"[OK] Updated job record: {job_id}")
                    
                except Exception as db_error:
                    print(f"[WARN] Database update failed: {db_error}")
                    # Continue - analysis succeeded even if storage failed
            
            # Mark queue job as completed
            if QUEUE_AVAILABLE:
                processing_queue.complete_job(job_id or "unknown", success=True)
            
            # Return response
            response = {
                "status": "success",
                "cached": False,
                "data": result_data
            }
            
            if job_id:
                response["job_id"] = job_id
            
            return response
            
        except Exception as pipeline_error:
            # Mark job as failed if database enabled
            if USE_DATABASE and db and job_id:
                try:
                    update_data = {
                        "status": "failed",
                        "completed_at": datetime.utcnow().isoformat()
                    }
                    db.client.table('analysis_jobs').update(update_data).eq('job_id', job_id).execute()
                except Exception:
                    pass  # Ignore database errors during failure handling
            
            # Mark queue job as failed
            if QUEUE_AVAILABLE:
                processing_queue.complete_job(job_id or "unknown", success=False)
            
            raise pipeline_error
        
    except HTTPException:
        raise
        
    except Exception as e:
        print(f"[ERROR] Error processing file: {str(e)}")
        import traceback
        traceback.print_exc()
        
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
    """Detailed health check"""
    return {
        "status": "healthy",
        "pipeline": "initialized",
        "database": "connected" if db else "disabled",
        "caching": USE_DATABASE,
        "temp_dir": os.path.exists(TEMP_DIR),
        "timestamp": datetime.utcnow().isoformat()
    }


# ================================
# JOB MANAGEMENT ENDPOINTS
# ================================

@app.get("/jobs")
async def list_jobs(limit: int = 50):
    """List all analysis jobs"""
    if not USE_DATABASE or not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        return {"jobs": db.get_all_jobs(limit)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    """Get specific job by ID"""
    if not USE_DATABASE or not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        job = db.get_job_by_id(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        return job
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ================================
# SAMPLE FILES ENDPOINTS
# ================================

@app.get("/samples")
async def get_sample_files(limit: int = 10, sort_by: str = "latest"):
    """Get list of sample files for exploration"""
    if not USE_DATABASE or not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        # Get completed jobs with their metadata
        jobs = db.get_all_jobs(limit=50)  # Get more to filter and sort
        
        # Filter only completed jobs and transform to sample format
        samples = []
        for job in jobs:
            if job.get('status') == 'complete' and job.get('result'):
                result = job['result']
                metadata = result.get('metadata', {})
                
                sample = {
                    "job_id": job['job_id'],
                    "filename": job['filename'],
                    "total_sequences": metadata.get('totalSequences', 0),
                    "created_at": job['created_at'],
                    "file_size_mb": round(len(job.get('file_hash', '')) / 1024 / 1024 * 100, 1),  # Estimate
                    "avg_confidence": metadata.get('avgConfidence', 0) / 100 if metadata.get('avgConfidence') else 0,
                    "novel_species_count": len([seq for seq in result.get('sequences', []) if seq.get('status') == 'Novel'])
                }
                samples.append(sample)
        
        # Sort samples
        if sort_by == "latest":
            samples.sort(key=lambda x: x['created_at'], reverse=True)
        elif sort_by == "heavy":
            samples.sort(key=lambda x: x['file_size_mb'], reverse=True)
        elif sort_by == "sequences":
            samples.sort(key=lambda x: x['total_sequences'], reverse=True)
        elif sort_by == "confidence":
            samples.sort(key=lambda x: x['avg_confidence'], reverse=True)
        
        return {"samples": samples[:limit]}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/samples/{job_id}")
async def get_sample_data(job_id: str):
    """Get analysis data for a specific sample"""
    if not USE_DATABASE or not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        job = db.get_job_by_id(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Sample not found")
        
        if job.get('status') != 'complete':
            raise HTTPException(status_code=400, detail="Sample analysis not complete")
        
        return job.get('result', {})
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ================================
# VISUALIZATION ENDPOINTS
# ================================

@app.get("/visualizations/composition/{job_id}")
async def get_composition(job_id: str, rank: str = "phylum"):
    """Get taxonomic composition data for charts"""
    if not USE_DATABASE or not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        return db.get_taxonomic_composition(job_id, rank)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/visualizations/hierarchy/{job_id}")
async def get_hierarchy(job_id: str):
    """Get hierarchical data for Krona/Sunburst plot"""
    if not USE_DATABASE or not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        return db.get_hierarchical_data(job_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/visualizations/sankey/{job_id}")
async def get_sankey(job_id: str):
    """Get Sankey diagram data"""
    if not USE_DATABASE or not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        return db.get_sankey_data(job_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ================================
# SERVER STARTUP
# ================================

def start_server(port: int = 8000, use_ngrok: bool = True, ngrok_token: str = None):
    """
    Start the FastAPI server with optional ngrok tunneling
    
    Args:
        port: Port to run the server on
        use_ngrok: Whether to create ngrok tunnel
        ngrok_token: Ngrok authentication token
    """
    if use_ngrok:
        if not ngrok_token:
            raise ValueError("ngrok_token is required when use_ngrok=True")
        
        # Set ngrok auth token
        ngrok.set_auth_token(ngrok_token)
        
        # Kill any existing tunnels first
        try:
            tunnels = ngrok.get_tunnels()
            for tunnel in tunnels:
                print(f"Closing existing tunnel: {tunnel.public_url}")
                ngrok.disconnect(tunnel.public_url)
        except Exception as e:
            print(f"Note: {e}")
        
        # Create tunnel
        try:
            public_url = ngrok.connect(port).public_url
            print("\n" + "="*60)
            print("TAXAFORMER API STARTED (WITH CACHING)")
            print("="*60)
            print(f"PUBLIC URL: {public_url}")
            print(f"LOCAL URL:  http://localhost:{port}")
            print(f"DATABASE:   {'Connected' if db else 'Disabled'}")
            print(f"CACHING:    {'Enabled' if USE_DATABASE else 'Disabled'}")
            print("="*60)
            print("\nCopy the PUBLIC URL to your frontend configuration!")
            print(f"   Update API_URL in your frontend to: {public_url}")
            print("\nExample fetch usage:")
            print(f'   fetch("{public_url}/analyze", {{ method: "POST", body: formData }})')
            
            if USE_DATABASE:
                print("\nCaching Features:")
                print("   - Identical files return cached results instantly")
                print("   - All results stored permanently in Supabase")
                print("   - Job tracking with unique job_id")
            
            print("\n" + "="*60 + "\n")
        except Exception as e:
            print(f"\n[ERROR] Failed to create ngrok tunnel: {e}")
            print("\nTry these solutions:")
            print("1. Check if ngrok is already running elsewhere")
            print("2. Get a new auth token from: https://dashboard.ngrok.com/")
            print("3. Run without ngrok: Set USE_NGROK = False in main.py")
            raise
    else:
        print(f"\nServer starting on http://localhost:{port}")
        print(f"DATABASE: {'Connected' if db else 'Disabled'}")
        print(f"CACHING: {'Enabled' if USE_DATABASE else 'Disabled'}")
        print("No ngrok tunnel - local access only\n")
    
    # Run server
    uvicorn.run(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    # Configuration
    NGROK_TOKEN = "348roSQj2iERV8fMgVaCYElBgfB_4yPs4jKrwU4U323bzpmJL"
    PORT = 8000
    USE_NGROK = False  # Set to False for local testing
    
    # Start server
    start_server(port=PORT, use_ngrok=USE_NGROK, ngrok_token=NGROK_TOKEN)