// Direct Supabase client for fetching sample data
const SUPABASE_URL = "https://nbnyhdwbnxbheombbhtv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ibnloZHdibnhiaGVvbWJiaHR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MDIyNDksImV4cCI6MjA4MDk3ODI0OX0.u5DxN1eX-K85WepTNCEs5sJw9M13YLmGm5pVe1WKy34";

export interface SampleFile {
  job_id: string;
  filename: string;
  total_sequences: number;
  created_at: string;
  file_size_mb: number;
  avg_confidence: number;
  novel_species_count: number;
  recommended?: boolean;
}

export async function fetchSampleFilesFromSupabase(): Promise<SampleFile[]> {
  try {
    console.log("Fetching sample files directly from Supabase...");
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/analysis_jobs?order=created_at.desc&limit=20`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Supabase API Error:", response.status, errorText);
      throw new Error(`Supabase API returned ${response.status}: ${errorText}`);
    }

    const jobs = await response.json();
    console.log("Successfully fetched from Supabase:", jobs.length, "jobs");
    console.log("Sample job data:", jobs[0]);
    
    if (jobs.length === 0) {
      console.log("No jobs found in database");
      throw new Error("No analysis jobs found in database");
    }
    
    const samples: SampleFile[] = jobs
      .filter((job: any) => job.status === 'complete' || job.status === 'success')
      .map((job: any) => {
        const result = job.result || job.analysis_result || {};
        const metadata = result.metadata || {};
        
        let novelCount = 0;
        if (result.sequences && Array.isArray(result.sequences)) {
          novelCount = result.sequences.filter((seq: any) => {
            return seq.status === 'Novel' || 
                   seq.novelty_score > 0.5 || 
                   (seq.confidence && seq.confidence < 0.5) ||
                   (seq.taxonomy && seq.taxonomy.toLowerCase().includes('unknown')) ||
                   (seq.taxonomy && seq.taxonomy.toLowerCase().includes('novel'));
          }).length;
        }

        const filename = job.filename || 'Unknown File';
        const totalSeqs = metadata.totalSequences || (result.sequences ? result.sequences.length : 150);
        const avgConfidence = metadata.avgConfidence || 85;
        
        const estimatedFileSize = Math.round(totalSeqs * 0.002 + Math.random() * 5 + 3);

        return {
          job_id: job.job_id,
          filename: filename,
          total_sequences: totalSeqs,
          created_at: job.created_at,
          file_size_mb: estimatedFileSize,
          avg_confidence: avgConfidence / 100,
          novel_species_count: novelCount,
          recommended: filename.toLowerCase().includes('sara') && filename.toLowerCase().includes('phaeo')
        };
      });
    
    console.log("Processed", samples.length, "completed jobs");
    return samples;
  } catch (error) {
    // Log as info instead of error since fallback will handle it
    console.log("Supabase unavailable, will use fallback data:", error instanceof Error ? error.message : "Network error");
    throw error;
  }
}

export async function fetchSampleDataFromSupabase(jobId: string): Promise<any> {
  try {
    console.log("Fetching sample data for job:", jobId);
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/analysis_jobs?job_id=eq.${jobId}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Supabase API Error:", response.status, errorText);
      throw new Error(`Supabase API returned ${response.status}: ${errorText}`);
    }

    const jobs = await response.json();
    
    if (jobs.length === 0) {
      throw new Error("Sample not found");
    }

    const job = jobs[0];
    console.log("Successfully fetched sample data from Supabase");
    
    const result = job.result || job.analysis_result || {};
    
    return result;
  } catch (error) {
    console.log("Supabase unavailable for sample data:", error instanceof Error ? error.message : "Network error");
    throw error;
  }
}
