"""
Taxaformer Backend API with Supabase Integration
FastAPI server with ngrok tunneling for Kaggle hosting
"""
import os
import sys
import shutil
import json
from datetime import datetime
from typing import Dict, Any, Optional
import uvicorn
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pyngrok import ngrok
from pipeline import TaxonomyPipeline

# Add parent directory to path for db imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Initialize database (optional - backend works without it)
try:
    from db.supabase_db import TaxaformerDB
    db = TaxaformerDB()
    print("[OK] Supabase database connected")
except Exception as e:
    print(f"[WARN] Database not available: {e}")
    print("[WARN] Backend will work without database (no data persistence)")
    db = None

# Initialize FastAPI app
app = FastAPI(
    title="Taxaformer API",
    description="Taxonomic analysis pipeline for DNA sequences",
    version="1.0.0"
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


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "online",
        "service": "Taxaformer API",
        "version": "1.0.0",
        "database": "connected" if db else "disabled",
        "timestamp": datetime.utcnow().isoformat()
    }


@app.post("/analyze")
async def analyze_endpoint(
    file: UploadFile = File(...),
    metadata: Optional[str] = Form(None)
):
    """
    Analyze uploaded sequence file with optional metadata
    
    Args:
        file: Uploaded FASTA/FASTQ file
        metadata: Optional JSON string with sample metadata
        
    Returns:
        JSON with analysis results and job_id (if database enabled)
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
        
        # Save uploaded file temporarily
        temp_filepath = os.path.join(TEMP_DIR, f"temp_{datetime.now().timestamp()}_{file.filename}")
        
        with open(temp_filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        print(f"Processing file: {file.filename} ({os.path.getsize(temp_filepath)} bytes)")
        
        # Process file through pipeline
        start_time = datetime.now()
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
        
        print(f"Analysis complete: {file.filename} ({processing_time:.2f}s)")
        
        # Store in database if available
        job_id = None
        if db is not None:
            try:
                job_id = db.store_analysis(
                    filename=file.filename,
                    metadata=parsed_metadata,
                    analysis_result=result_data
                )
                print(f"[OK] Saved to database with job_id: {job_id}")
            except Exception as db_error:
                print(f"[WARN] Database save failed: {db_error}")
                # Continue without database - analysis still succeeds
        
        # Return response
        response = {
            "status": "success",
            "data": result_data
        }
        
        if job_id:
            response["job_id"] = job_id
        
        return response
        
    except HTTPException:
        raise
        
    except Exception as e:
        print(f"Error processing file: {str(e)}")
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
        "temp_dir": os.path.exists(TEMP_DIR),
        "timestamp": datetime.utcnow().isoformat()
    }


# ================================
# VISUALIZATION ENDPOINTS
# ================================

@app.get("/visualizations/composition/{job_id}")
async def get_composition(job_id: str, rank: str = "phylum"):
    """Get taxonomic composition data for charts"""
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        return db.get_taxonomic_composition(job_id, rank)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/visualizations/hierarchy/{job_id}")
async def get_hierarchy(job_id: str):
    """Get hierarchical data for Krona/Sunburst plot"""
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        return db.get_hierarchical_data(job_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/visualizations/sankey/{job_id}")
async def get_sankey(job_id: str):
    """Get Sankey diagram data"""
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        return db.get_sankey_data(job_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/visualizations/heatmap")
async def get_heatmap(job_ids: str, rank: str = "class"):
    """Get heatmap data for multiple samples"""
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        ids = job_ids.split(",")
        return db.get_heatmap_data(ids, rank)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/visualizations/diversity")
async def get_diversity(job_ids: str):
    """Calculate beta diversity between samples"""
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        ids = job_ids.split(",")
        return db.calculate_beta_diversity(ids)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ================================
# JOB MANAGEMENT ENDPOINTS
# ================================

@app.get("/jobs")
async def list_jobs(limit: int = 50):
    """List all analysis jobs"""
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        return db.get_all_jobs(limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    """Get specific job by ID"""
    if db is None:
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
            print("TAXAFORMER API STARTED")
            print("="*60)
            print(f"PUBLIC URL: {public_url}")
            print(f"LOCAL URL:  http://localhost:{port}")
            print(f"DATABASE:   {'Connected' if db else 'Disabled'}")
            print("="*60)
            print("\nCopy the PUBLIC URL to your frontend configuration!")
            print(f"   Update API_URL in your frontend to: {public_url}")
            print("\nExample fetch usage:")
            print(f'   fetch("{public_url}/analyze", {{ method: "POST", body: formData }})')
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
        print("No ngrok tunnel - local access only\n")
    
    # Run server
    uvicorn.run(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    # Configuration
    NGROK_TOKEN = "348roSQj2iERV8fMgVaCYElBgfB_4yPs4jKrwU4U323bzpmJL"
    PORT = 8000
    USE_NGROK = True  # Set to False for local testing
    
    # Start server
    start_server(port=PORT, use_ngrok=USE_NGROK, ngrok_token=NGROK_TOKEN)
