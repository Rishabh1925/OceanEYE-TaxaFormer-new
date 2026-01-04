"""
Analytics API for TaxaFormer
Privacy-friendly user behavior tracking
"""
import os
import sys
import hashlib
import json
from datetime import datetime, date
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid

# Add parent directory to path for db imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Feature flag for analytics
USE_ANALYTICS = os.getenv("USE_ANALYTICS", "true").lower() == "true"

# Initialize database (optional - analytics works without it)
analytics_db = None
if USE_ANALYTICS:
    try:
        # Use the same Supabase connection as main app
        from supabase import create_client
        SUPABASE_URL = os.getenv("SUPABASE_URL", "https://nbnyhdwbnxbheombbhtv.supabase.co")
        SUPABASE_KEY = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ibnloZHdibnhiaGVvbWJiaHR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MDIyNDksImV4cCI6MjA4MDk3ODI0OX0.u5DxN1eX-K85WepTNCEs5sJw9M13YLmGm5pVe1WKy34")
        
        analytics_db = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[OK] Analytics database connected")
    except Exception as e:
        print(f"[WARN] Analytics database not available: {e}")
        print("[WARN] Analytics will be disabled")
        USE_ANALYTICS = False

# Pydantic models for request validation
class SessionCreate(BaseModel):
    deviceType: str
    browserName: str
    referrer: str
    userAgent: str
    screenResolution: str
    timezone: str
    language: str

class SessionUpdate(BaseModel):
    lastActivity: str
    pageCount: int

class PageView(BaseModel):
    sessionId: str
    pagePath: str
    pageTitle: str
    timestamp: str

class Interaction(BaseModel):
    sessionId: str
    pagePath: str
    interactionType: str
    elementId: Optional[str] = None
    elementText: Optional[str] = None
    interactionData: Dict[str, Any] = {}
    timestamp: str

class PageExit(BaseModel):
    sessionId: str
    pagePath: str
    timeOnPage: int
    scrollDepth: int
    timestamp: str

class PopularContent(BaseModel):
    contentType: str
    contentId: str
    contentTitle: str
    timestamp: str

class AnalyticsAPI:
    """Analytics API handler"""
    
    def __init__(self, app: FastAPI):
        self.app = app
        self.setup_routes()
    
    def setup_routes(self):
        """Setup analytics API routes"""
        
        @self.app.post("/api/analytics/session")
        async def create_session(session_data: SessionCreate, request: Request):
            """Create new analytics session"""
            if not USE_ANALYTICS or not analytics_db:
                return {"sessionId": str(uuid.uuid4()), "status": "disabled"}
            
            try:
                # Generate anonymous session hash
                client_ip = request.client.host if request.client else "unknown"
                session_hash = self.generate_session_hash(client_ip, session_data.userAgent)
                
                # Check if session exists today
                existing_session = self.get_session_by_hash(session_hash)
                if existing_session:
                    return {"sessionId": existing_session["session_id"], "status": "existing"}
                
                # Create new session
                session_id = str(uuid.uuid4())
                
                session_record = {
                    "session_id": session_id,
                    "session_hash": session_hash,
                    "device_type": session_data.deviceType,
                    "browser_name": session_data.browserName,
                    "referrer_domain": session_data.referrer,
                    "country_code": self.get_country_from_ip(client_ip),
                    "first_visit": datetime.utcnow().isoformat(),
                    "last_activity": datetime.utcnow().isoformat(),
                    "page_count": 1,
                    "total_time_seconds": 0
                }
                
                # Insert into database
                analytics_db.table('user_sessions').insert(session_record).execute()
                
                print(f"[OK] New analytics session created: {session_id}")
                return {"sessionId": session_id, "status": "created"}
                
            except Exception as e:
                print(f"[ERROR] Failed to create analytics session: {e}")
                return {"sessionId": str(uuid.uuid4()), "status": "error"}
        
        @self.app.put("/api/analytics/session/{session_id}")
        async def update_session(session_id: str, session_data: SessionUpdate):
            """Update existing session"""
            if not USE_ANALYTICS or not analytics_db:
                return {"status": "disabled"}
            
            try:
                update_data = {
                    "last_activity": session_data.lastActivity,
                    "page_count": session_data.pageCount
                }
                
                analytics_db.table('user_sessions').update(update_data).eq('session_id', session_id).execute()
                return {"status": "updated"}
                
            except Exception as e:
                print(f"[ERROR] Failed to update session: {e}")
                return {"status": "error"}
        
        @self.app.post("/api/analytics/page-view")
        async def track_page_view(page_data: PageView):
            """Track page view"""
            if not USE_ANALYTICS or not analytics_db:
                return {"status": "disabled"}
            
            try:
                page_record = {
                    "session_id": page_data.sessionId,
                    "page_path": page_data.pagePath,
                    "page_title": page_data.pageTitle,
                    "visit_duration_seconds": 0,
                    "scroll_depth_percent": 0,
                    "created_at": page_data.timestamp
                }
                
                analytics_db.table('page_views').insert(page_record).execute()
                print(f"[OK] Page view tracked: {page_data.pagePath}")
                return {"status": "tracked"}
                
            except Exception as e:
                print(f"[ERROR] Failed to track page view: {e}")
                return {"status": "error"}
        
        @self.app.post("/api/analytics/interaction")
        async def track_interaction(interaction_data: Interaction):
            """Track user interaction"""
            if not USE_ANALYTICS or not db:
                return {"status": "disabled"}
            
            try:
                interaction_record = {
                    "session_id": interaction_data.sessionId,
                    "page_path": interaction_data.pagePath,
                    "interaction_type": interaction_data.interactionType,
                    "element_id": interaction_data.elementId,
                    "element_text": interaction_data.elementText,
                    "interaction_data": interaction_data.interactionData,
                    "created_at": interaction_data.timestamp
                }
                
                db.client.table('user_interactions').insert(interaction_record).execute()
                print(f"[OK] Interaction tracked: {interaction_data.interactionType}")
                return {"status": "tracked"}
                
            except Exception as e:
                print(f"[ERROR] Failed to track interaction: {e}")
                return {"status": "error"}
        
        @self.app.post("/api/analytics/page-exit")
        async def track_page_exit(exit_data: PageExit):
            """Track page exit with time and scroll data"""
            if not USE_ANALYTICS or not db:
                return {"status": "disabled"}
            
            try:
                # Update the most recent page view with exit data
                db.client.table('page_views').update({
                    "visit_duration_seconds": exit_data.timeOnPage,
                    "scroll_depth_percent": exit_data.scrollDepth
                }).eq('session_id', exit_data.sessionId).eq('page_path', exit_data.pagePath).execute()
                
                # Update session total time
                db.client.rpc('update_session_time', {
                    'session_id': exit_data.sessionId,
                    'additional_time': exit_data.timeOnPage
                }).execute()
                
                return {"status": "tracked"}
                
            except Exception as e:
                print(f"[ERROR] Failed to track page exit: {e}")
                return {"status": "error"}
        
        @self.app.post("/api/analytics/popular-content")
        async def track_popular_content(content_data: PopularContent):
            """Track popular content interactions"""
            if not USE_ANALYTICS or not db:
                return {"status": "disabled"}
            
            try:
                # Use upsert to increment interaction count
                db.client.table('popular_content').upsert({
                    "content_type": content_data.contentType,
                    "content_identifier": content_data.contentId,
                    "content_title": content_data.contentTitle,
                    "interaction_count": 1,
                    "last_interaction": content_data.timestamp
                }, on_conflict="content_type,content_identifier").execute()
                
                return {"status": "tracked"}
                
            except Exception as e:
                print(f"[ERROR] Failed to track popular content: {e}")
                return {"status": "error"}
        
        @self.app.get("/api/analytics/stats")
        async def get_analytics_stats():
            """Get basic analytics statistics"""
            if not USE_ANALYTICS or not db:
                return {"status": "disabled"}
            
            try:
                # Get today's stats
                today = date.today()
                
                # Get session count for today
                sessions_response = db.client.table('user_sessions').select('session_id').gte('created_at', today.isoformat()).execute()
                sessions_count = len(sessions_response.data) if sessions_response.data else 0
                
                # Get page views for today
                page_views_response = db.client.table('page_views').select('id').gte('created_at', today.isoformat()).execute()
                page_views_count = len(page_views_response.data) if page_views_response.data else 0
                
                # Get popular pages
                popular_pages_response = db.client.table('page_views').select('page_path').gte('created_at', today.isoformat()).execute()
                page_counts = {}
                if popular_pages_response.data:
                    for page in popular_pages_response.data:
                        path = page['page_path']
                        page_counts[path] = page_counts.get(path, 0) + 1
                
                popular_pages = sorted(page_counts.items(), key=lambda x: x[1], reverse=True)[:5]
                
                return {
                    "status": "success",
                    "date": today.isoformat(),
                    "stats": {
                        "sessions_today": sessions_count,
                        "page_views_today": page_views_count,
                        "popular_pages": popular_pages
                    }
                }
                
            except Exception as e:
                print(f"[ERROR] Failed to get analytics stats: {e}")
                return {"status": "error", "message": str(e)}
    
    def generate_session_hash(self, ip_address: str, user_agent: str) -> str:
        """Generate anonymous session hash that changes daily"""
        today = date.today().isoformat()
        hash_input = f"{ip_address}{user_agent}{today}taxaformer_salt"
        return hashlib.sha256(hash_input.encode()).hexdigest()
    
    def get_session_by_hash(self, session_hash: str) -> Optional[Dict]:
        """Get existing session by hash"""
        try:
            today = date.today()
            response = db.client.table('user_sessions').select('*').eq('session_hash', session_hash).gte('created_at', today.isoformat()).limit(1).execute()
            return response.data[0] if response.data else None
        except Exception:
            return None
    
    def get_country_from_ip(self, ip_address: str) -> str:
        """Get country code from IP address (simplified)"""
        # In production, you might want to use a GeoIP service
        # For now, return 'unknown'
        return 'unknown'

# Function to add analytics to existing FastAPI app
def add_analytics_to_app(app: FastAPI):
    """Add analytics endpoints to existing FastAPI app"""
    analytics_api = AnalyticsAPI(app)
    print("[OK] Analytics API endpoints added")
    return analytics_api

# SQL function for updating session time (add to database)
UPDATE_SESSION_TIME_SQL = """
CREATE OR REPLACE FUNCTION update_session_time(session_id uuid, additional_time integer)
RETURNS void AS $$
BEGIN
    UPDATE user_sessions 
    SET total_time_seconds = COALESCE(total_time_seconds, 0) + additional_time,
        last_activity = NOW()
    WHERE user_sessions.session_id = update_session_time.session_id;
END;
$$ LANGUAGE plpgsql;
"""