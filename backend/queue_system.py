"""
Queue System for TaxaFormer
Prevents multiple users from processing files simultaneously
"""
import asyncio
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from dataclasses import dataclass
from enum import Enum

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
    estimated_time: int = 0  # seconds
    progress: int = 0  # 0-100

class ProcessingQueue:
    """
    Simple queue system for file processing
    Only allows one file to be processed at a time
    """
    
    def __init__(self):
        self.queue: List[QueueJob] = []
        self.current_job: Optional[QueueJob] = None
        self.processing_lock = asyncio.Lock()
        self.max_queue_size = 10
        self.job_timeout = 300  # 5 minutes timeout
    
    def add_job(self, job_id: str, filename: str, file_size: int, user_session: str) -> QueueJob:
        """Add a new job to the queue"""
        
        # Check if queue is full
        if len(self.queue) >= self.max_queue_size:
            raise Exception("Queue is full. Please try again later.")
        
        # Check if user already has a job in queue
        existing_job = self.get_user_job(user_session)
        if existing_job and existing_job.status in [JobStatus.QUEUED, JobStatus.PROCESSING]:
            raise Exception("You already have a job in the queue. Please wait for it to complete.")
        
        # Estimate processing time based on file size
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
        print(f"Job added to queue: {filename} (Position: {len(self.queue)})")
        
        return job
    
    def get_queue_status(self, user_session: str) -> Dict:
        """Get queue status for a specific user"""
        
        # Clean up old jobs first
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
        """Get the next job to process (if any)"""
        
        async with self.processing_lock:
            # Clean up first
            self.cleanup_old_jobs()
            
            # Check if already processing
            if self.current_job and self.current_job.status == JobStatus.PROCESSING:
                # Check for timeout
                if self.current_job.started_at and \
                   (datetime.now() - self.current_job.started_at).total_seconds() > self.job_timeout:
                    print(f"[TIMEOUT] Job timed out: {self.current_job.filename}")
                    self.current_job.status = JobStatus.FAILED
                    self.current_job = None
                else:
                    return None  # Still processing
            
            # Get next job from queue
            if self.queue:
                next_job = self.queue.pop(0)
                next_job.status = JobStatus.PROCESSING
                next_job.started_at = datetime.now()
                self.current_job = next_job
                
                print(f"Processing job: {next_job.filename}")
                return next_job
            
            return None
    
    def update_job_progress(self, job_id: str, progress: int):
        """Update job progress"""
        if self.current_job and self.current_job.job_id == job_id:
            self.current_job.progress = min(100, max(0, progress))
    
    def complete_job(self, job_id: str, success: bool = True):
        """Mark job as completed"""
        if self.current_job and self.current_job.job_id == job_id:
            self.current_job.status = JobStatus.COMPLETED if success else JobStatus.FAILED
            self.current_job.completed_at = datetime.now()
            self.current_job.progress = 100 if success else 0
            
            print(f"Job completed: {self.current_job.filename} ({'success' if success else 'failed'})")
            
            # Clear current job after a delay to allow status check
            asyncio.create_task(self.clear_completed_job_after_delay())
    
    async def clear_completed_job_after_delay(self):
        """Clear completed job after 30 seconds"""
        await asyncio.sleep(30)
        if self.current_job and self.current_job.status in [JobStatus.COMPLETED, JobStatus.FAILED]:
            self.current_job = None
    
    def get_user_job(self, user_session: str) -> Optional[QueueJob]:
        """Find user's job in queue or current processing"""
        
        # Check current job
        if self.current_job and self.current_job.user_session == user_session:
            return self.current_job
        
        # Check queue
        for job in self.queue:
            if job.user_session == user_session:
                return job
        
        return None
    
    def get_job_position(self, job_id: str) -> int:
        """Get position of job in queue (1-indexed)"""
        for i, job in enumerate(self.queue):
            if job.job_id == job_id:
                return i + 1
        return 0
    
    def estimate_processing_time(self, file_size: int) -> int:
        """Estimate processing time based on file size"""
        # Base time: 30 seconds
        # Additional time: 1 second per 100KB
        base_time = 30
        size_factor = max(0, (file_size - 1024) // (100 * 1024))  # Per 100KB after first 1KB
        return base_time + size_factor
    
    def estimate_wait_time_for_position(self, position: int) -> int:
        """Estimate wait time for a position in queue"""
        if position <= 0:
            return 0
        
        # Current job remaining time
        current_remaining = 0
        if self.current_job and self.current_job.status == JobStatus.PROCESSING:
            elapsed = (datetime.now() - self.current_job.started_at).total_seconds()
            current_remaining = max(0, self.current_job.estimated_time - elapsed)
        
        # Jobs ahead in queue
        jobs_ahead_time = sum(job.estimated_time for job in self.queue[:position-1])
        
        return int(current_remaining + jobs_ahead_time)
    
    def estimate_total_wait_time(self) -> int:
        """Estimate total wait time if joining queue now"""
        return self.estimate_wait_time_for_position(len(self.queue) + 1)
    
    def cleanup_old_jobs(self):
        """Remove old completed/failed jobs from memory"""
        cutoff_time = datetime.now() - timedelta(hours=1)
        
        # Remove old jobs from queue
        self.queue = [job for job in self.queue if job.created_at > cutoff_time]
        
        # Clear old current job
        if self.current_job and \
           self.current_job.status in [JobStatus.COMPLETED, JobStatus.FAILED] and \
           self.current_job.completed_at and \
           self.current_job.completed_at < cutoff_time:
            self.current_job = None
    
    def get_queue_stats(self) -> Dict:
        """Get overall queue statistics"""
        self.cleanup_old_jobs()
        
        return {
            "queue_length": len(self.queue),
            "currently_processing": self.current_job is not None,
            "current_job": {
                "filename": self.current_job.filename,
                "progress": self.current_job.progress,
                "elapsed_time": int((datetime.now() - self.current_job.started_at).total_seconds())
            } if self.current_job else None,
            "estimated_wait_for_new_job": self.estimate_total_wait_time()
        }

# Global queue instance
processing_queue = ProcessingQueue()