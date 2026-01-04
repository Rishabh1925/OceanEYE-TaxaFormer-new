"""
Taxaformer Backend API
FastAPI server with ngrok tunneling for Kaggle hosting
"""
import os
import shutil
import json
from datetime import datetime
from typing import Dict, Any
import uvicorn
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pyngrok import ngrok
from pipeline import TaxonomyPipeline

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
        "timestamp": datetime.utcnow().isoformat()
    }


@app.post("/analyze")
async def analyze_endpoint(file: UploadFile = File(...)):
    """
    Analyze uploaded sequence file
    
    Args:
        file: Uploaded FASTA/FASTQ file
        
    Returns:
        JSON with analysis results in frontend-compatible format
    """
    temp_filepath = None
    
    try:
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
        
        # Add processing time to metadata
        if "metadata" in result_data:
            result_data["metadata"]["processingTime"] = f"{processing_time:.2f}s"
        
        print(f"Analysis complete: {file.filename} ({processing_time:.2f}s)")
        
        return {
            "status": "success",
            "data": result_data
        }
        
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
        "temp_dir": os.path.exists(TEMP_DIR),
        "timestamp": datetime.utcnow().isoformat()
    }


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
            print("="*60)
            print("\nCopy the PUBLIC URL to your frontend configuration!")
            print(f"   Update API_URL in your frontend to: {public_url}")
            print("\nExample fetch usage:")
            print(f'   fetch("{public_url}/analyze", {{ method: "POST", body: formData }})')
            print("\n" + "="*60 + "\n")
        except Exception as e:
            print(f"\nFailed to create ngrok tunnel: {e}")
            print("\nTry these solutions:")
            print("1. Check if ngrok is already running elsewhere")
            print("2. Get a new auth token from: https://dashboard.ngrok.com/")
            print("3. Run without ngrok: Set USE_NGROK = False in main.py")
            raise
    else:
        print(f"\nServer starting on http://localhost:{port}")
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
