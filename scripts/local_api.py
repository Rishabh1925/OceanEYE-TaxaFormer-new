"""
LOCAL Visualization Data API
Runs locally, fetches from Supabase, formats for charts
Kaggle backend stores data -> This serves visualization endpoints
"""

import os
import sys

# Add parent directory to path for db imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from db.supabase_db import TaxaformerDB

# Initialize
app = FastAPI(
    title="Taxaformer Local Visualization API",
    description="Fetches data from Supabase and formats for charts",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection
db = TaxaformerDB()


@app.get("/")
async def root():
    """Health check"""
    return {
        "status": "online",
        "service": "Taxaformer Local Visualization API",
        "mode": "Read-Only (Fetch & Format)",
        "backend": "Kaggle (stores data)",
        "database": "Supabase"
    }


# ================================
# VISUALIZATION ENDPOINTS
# ================================

@app.get("/visualizations/composition/{job_id}")
async def get_composition(job_id: str, rank: str = "phylum"):
    """
    Get taxonomic composition for pie/bar charts
    
    Query params:
        rank: domain, phylum, class, order, family, genus, species
    """
    try:
        return db.get_taxonomic_composition(job_id, rank)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/visualizations/hierarchy/{job_id}")
async def get_hierarchy(job_id: str):
    """Get hierarchical data for Krona/Sunburst plot"""
    try:
        return db.get_hierarchical_data(job_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/visualizations/sankey/{job_id}")
async def get_sankey(job_id: str):
    """Get Sankey/Ribbon flow diagram data"""
    try:
        return db.get_sankey_data(job_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/visualizations/heatmap")
async def get_heatmap(job_ids: str, rank: str = "class"):
    """
    Get heatmap data for multiple samples
    
    Query params:
        job_ids: Comma-separated job IDs (e.g., "id1,id2,id3")
        rank: Taxonomic rank to compare
    """
    try:
        ids = job_ids.split(",")
        return db.get_heatmap_data(ids, rank)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/visualizations/diversity")
async def get_diversity(job_ids: str):
    """
    Calculate beta diversity between samples
    
    Query params:
        job_ids: Comma-separated job IDs
    """
    try:
        ids = job_ids.split(",")
        return db.calculate_beta_diversity(ids)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ================================
# JOB RETRIEVAL ENDPOINTS
# ================================

@app.get("/jobs")
async def list_jobs(limit: int = 50):
    """List all analysis jobs from database"""
    try:
        return db.get_all_jobs(limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    """Get specific job data by ID"""
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
# START SERVER
# ================================

if __name__ == "__main__":
    print("\n" + "="*70)
    print("TAXAFORMER LOCAL VISUALIZATION API")
    print("="*70)
    print("Purpose: Fetch data from Supabase & format for charts")
    print("Database: Supabase (data stored by Kaggle backend)")
    print("Running: http://localhost:3001")
    print("="*70)
    print("\nAvailable Endpoints:")
    print("  GET /jobs                           - List all jobs")
    print("  GET /jobs/{job_id}                  - Get specific job")
    print("  GET /visualizations/composition/{job_id}?rank=phylum")
    print("  GET /visualizations/hierarchy/{job_id}")
    print("  GET /visualizations/sankey/{job_id}")
    print("  GET /visualizations/heatmap?job_ids=id1,id2&rank=class")
    print("  GET /visualizations/diversity?job_ids=id1,id2,id3")
    print("\n" + "="*70 + "\n")
    
    uvicorn.run(app, host="0.0.0.0", port=3001)
