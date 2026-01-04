"""
Simple Analytics for TaxaFormer - Minimal Working Version
"""
import os
from datetime import datetime
from fastapi import FastAPI, Request
from pydantic import BaseModel
from typing import Dict, Any, Optional

# Supabase connection
try:
    from supabase import create_client
    SUPABASE_URL = os.getenv("SUPABASE_URL", "https://nbnyhdwbnxbheombbhtv.supabase.co")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ibnloZHdibnhiaGVvbWJiaHR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MDIyNDksImV4cCI6MjA4MDk3ODI0OX0.u5DxN1eX-K85WepTNCEs5sJw9M13YLmGm5pVe1WKy34")
    
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    ANALYTICS_ENABLED = True
    print("Simple Analytics: Supabase connected")
except Exception as e:
    print(f"Simple Analytics: Supabase not available: {e}")
    supabase = None
    ANALYTICS_ENABLED = False

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

def add_simple_analytics(app: FastAPI):
    """Add simple analytics endpoints to FastAPI app"""
    
    @app.post("/api/simple-analytics/session")
    async def create_simple_session(session_data: SimpleSession, request: Request):
        """Create analytics session"""
        if not ANALYTICS_ENABLED:
            return {"sessionId": "disabled", "status": "disabled"}
        
        try:
            import uuid
            session_id = str(uuid.uuid4())
            
            # Insert session
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
            
            result = supabase.table('user_sessions').insert(session_record).execute()
            print(f"Session created: {session_id}")
            
            return {"sessionId": session_id, "status": "created"}
            
        except Exception as e:
            print(f"Session creation failed: {e}")
            return {"sessionId": "error", "status": "error", "message": str(e)}
    
    @app.post("/api/simple-analytics/page-view")
    async def track_simple_page_view(page_data: SimplePageView):
        """Track page view"""
        if not ANALYTICS_ENABLED:
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
            
            result = supabase.table('page_views').insert(page_record).execute()
            print(f"Page view tracked: {page_data.pagePath}")
            
            return {"status": "tracked"}
            
        except Exception as e:
            print(f"Page view tracking failed: {e}")
            return {"status": "error", "message": str(e)}
    
    @app.post("/api/simple-analytics/interaction")
    async def track_simple_interaction(interaction_data: SimpleInteraction):
        """Track interaction"""
        if not ANALYTICS_ENABLED:
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
            
            result = supabase.table('user_interactions').insert(interaction_record).execute()
            print(f"Interaction tracked: {interaction_data.interactionType}")
            
            return {"status": "tracked"}
            
        except Exception as e:
            print(f"Interaction tracking failed: {e}")
            return {"status": "error", "message": str(e)}
    
    @app.get("/api/simple-analytics/test")
    async def test_analytics():
        """Test analytics system"""
        if not ANALYTICS_ENABLED:
            return {"status": "disabled", "message": "Analytics not enabled"}
        
        try:
            # Test database connection
            result = supabase.table('user_sessions').select('session_id').limit(1).execute()
            
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
    
    print("Simple Analytics endpoints added")
    return True