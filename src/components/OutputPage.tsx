"use client"

import { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, Download, Search, Filter, Copy, ChevronDown, ChevronRight,
  FileText, AlertCircle, TrendingUp, Database, Layers, 
  Globe, Sparkles, X, ExternalLink, Check, Home
} from 'lucide-react';
import GlareHover from './GlareHover';
import { 
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { ChartPieInteractive } from './charts/ChartPieInteractive';
import { ChartRadarDots } from './charts/ChartRadarDots';
import { ChartBarDefault } from './charts/ChartBarDefault';
import { ChartAreaGradient } from './charts/ChartAreaGradient';

interface OutputPageProps {
  isDarkMode: boolean;
  onNavigate: (page: string) => void;
}

// Helper function to validate and sanitize taxonomy summary data
const validateTaxonomySummary = (data: any[]): any[] => {
  if (!Array.isArray(data)) return [];
  
  return data.map(item => ({
    name: String(item.name || 'Unknown'),
    value: Number(item.value) || 0,
    color: String(item.color || '#64748B')
  })).filter(item => item.value > 0);
};

// Helper function to transform various JSON formats
const transformBackendData = (rawData: any) => {
  console.log('Transforming backend data...');
  
  const transformed: any = {
    taxonomy_summary: [],
    sequences: [],
    cluster_data: [],
    metadata: {}
  };
  
  // Try to extract sequences/results
  const sequenceData = rawData.sequences || rawData.results || rawData.classifications || (Array.isArray(rawData) ? rawData : []);
  
  if (sequenceData.length > 0) {
    transformed.sequences = sequenceData.map((seq: any, idx: number) => ({
      accession: seq.accession || seq.id || seq.sequence_id || `SEQ_${String(idx + 1).padStart(3, '0')}`,
      taxonomy: seq.taxonomy || seq.classification || seq.taxon || 'Unknown',
      length: seq.length || seq.seq_length || 0,
      confidence: seq.confidence || seq.score || 0,
      overlap: seq.overlap || seq.coverage || 0,
      cluster: seq.cluster || seq.cluster_id || 'C1',
      novelty_score: seq.novelty_score || seq.noveltyScore || 0,
      status: seq.status || 'Known'
    }));
    
    // Generate taxonomy summary from sequences if not provided
    if (!rawData.taxonomy_summary && !rawData.taxonomySummary) {
      const taxonomyCounts: any = {};
      const colors = ['#22D3EE', '#10B981', '#A78BFA', '#F59E0B', '#EC4899', '#64748B'];
      
      sequenceData.forEach((seq: any) => {
        const taxon = (seq.taxonomy || seq.classification || 'Unknown').split(';')[0].trim();
        taxonomyCounts[taxon] = (taxonomyCounts[taxon] || 0) + 1;
      });
      
      transformed.taxonomy_summary = Object.entries(taxonomyCounts).map(([name, value], idx) => ({
        name,
        value: Number(value) || 0,
        color: colors[idx % colors.length]
      }));
    }
  }
  
  // Extract taxonomy summary (validate to ensure proper format)
  if (rawData.taxonomy_summary || rawData.taxonomySummary || rawData.taxonomy) {
    const rawTaxonomy = rawData.taxonomy_summary || rawData.taxonomySummary || rawData.taxonomy;
    transformed.taxonomy_summary = validateTaxonomySummary(rawTaxonomy);
  }
  
  // Extract cluster data
  if (rawData.cluster_data || rawData.clusterData || rawData.clusters) {
    transformed.cluster_data = rawData.cluster_data || rawData.clusterData || rawData.clusters;
  }
  
  // Extract metadata
  transformed.metadata = {
    sampleName: rawData.metadata?.sampleName || rawData.sampleName || rawData.sample_name || rawData.filename || 'Sample',
    totalSequences: rawData.metadata?.totalSequences || rawData.totalSequences || rawData.total_sequences || rawData.sequence_count || sequenceData.length,
    processingTime: rawData.metadata?.processingTime || rawData.processingTime || rawData.processing_time || rawData.time || 'N/A',
    avgConfidence: rawData.metadata?.avgConfidence || rawData.avgConfidence || rawData.avg_confidence || rawData.confidence || 0
  };
  
  console.log('Transformation complete:', {
    taxonomyCount: transformed.taxonomy_summary.length,
    sequenceCount: transformed.sequences.length,
    clusterCount: transformed.cluster_data.length
  });
  
  return transformed;
};

export default function OutputPage({ isDarkMode, onNavigate }: OutputPageProps) {
  const [selectedTab, setSelectedTab] = useState<'embedding' | 'clusters'>('embedding');
  const [selectedSequence, setSelectedSequence] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [analysisData, setAnalysisData] = useState<any>(null);
  
  // State for real data from API
  const [taxonomySummary, setTaxonomySummary] = useState<any[]>([]);
  const [taxonomyTableData, setTaxonomyTableData] = useState<any[]>([]);
  const [clusterData, setClusterData] = useState<any[]>([]);
  const [analysisMetadata, setAnalysisMetadata] = useState({
    sampleName: '',
    totalSequences: 0,
    processingTime: '',
    avgConfidence: 0
  });

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterOpen) {
        setFilterOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [filterOpen]);

  // Load real data from localStorage on mount
  useEffect(() => {
    const storedData = localStorage.getItem('analysisResults');
    console.log('OutputPage - Checking localStorage...');
    
    if (storedData) {
      try {
        const rawResults = JSON.parse(storedData);
        console.log('Raw Analysis Results:', rawResults);
        console.log('Result Keys:', Object.keys(rawResults));
        
        // Store raw data for dynamic calculations
        setAnalysisData(rawResults);
        
        // Transform the data to match UI format
        const transformed = transformBackendData(rawResults);
        
        // Update state with transformed data (with validation)
        if (transformed.taxonomy_summary && transformed.taxonomy_summary.length > 0) {
          const validatedTaxonomy = validateTaxonomySummary(transformed.taxonomy_summary);
          if (validatedTaxonomy.length > 0) {
            setTaxonomySummary(validatedTaxonomy);
          }
        }
        
        if (transformed.sequences && transformed.sequences.length > 0) {
          setTaxonomyTableData(transformed.sequences);
        }
        
        if (transformed.cluster_data && transformed.cluster_data.length > 0) {
          setClusterData(transformed.cluster_data);
        }
        
        if (transformed.metadata) {
          setAnalysisMetadata(transformed.metadata);
        }
        
        console.log('Data loaded and transformed successfully');
      } catch (error) {
        console.error('Failed to parse analysis results:', error);
        console.error('Error details:', error);
      }
    } else {
      console.log('No stored results found');
    }
    
    setLoading(false);
  }, []);

  // Calculate dynamic stats from loaded data
  const stats = useMemo(() => {
    if (!analysisData || !taxonomyTableData.length) {
      return {
        total: taxonomyTableData.length,
        avgConfidence: analysisMetadata.avgConfidence,
        novelCount: 0,
        highConfidence: 0,
        mediumConfidence: 0,
        lowConfidence: 0,
        avgLength: 0,
        minLength: 0,
        maxLength: 0
      };
    }

    const total = taxonomyTableData.length;
    
    // Calculate average confidence
    const avgConf = total > 0
      ? taxonomyTableData.reduce((acc, seq) => acc + (Number(seq.confidence) || 0), 0) / total
      : 0;

    // Count novel sequences (only novelty_score > 0.15)
    const novelCount = taxonomyTableData.filter(seq => 
      (seq as any).novelty_score > 0.15
    ).length;

    // Confidence distribution
    const highConf = taxonomyTableData.filter(s => s.confidence >= 0.8).length;
    const mediumConf = taxonomyTableData.filter(s => s.confidence >= 0.5 && s.confidence < 0.8).length;
    const lowConf = taxonomyTableData.filter(s => s.confidence < 0.5).length;

    // Sequence length stats
    const lengths = taxonomyTableData.map(s => s.length);
    const avgLen = lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
    const minLen = lengths.length > 0 ? Math.min(...lengths) : 0;
    const maxLen = lengths.length > 0 ? Math.max(...lengths) : 0;

    return {
      total,
      avgConfidence: Math.round(avgConf * 100),
      novelCount,
      highConfidence: highConf,
      mediumConfidence: mediumConf,
      lowConfidence: lowConf,
      avgLength: Math.round(avgLen),
      minLength: minLen,
      maxLength: maxLen
    };
  }, [analysisData, taxonomyTableData, analysisMetadata]);

  const handleCopySequence = (seq: string) => {
    navigator.clipboard.writeText(seq);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleExportCSV = () => {
    console.log('Export CSV function called from OutputPage!');
    console.log('Filtered data length:', filteredTableData.length);
    
    const headers = ['Sequence_ID', 'Predicted_Taxonomy', 'Confidence', 'Length', 'Overlap', 'Cluster'];
    const csvContent = [
      headers.join(','),
      ...filteredTableData.map(row => [
        `"${row.accession || row.sequence_id || 'Unknown'}"`,
        `"${row.taxonomy || 'Unknown'}"`,
        row.confidence || 0,
        row.length || 0,
        row.overlap || 0,
        `"${row.cluster || 'Unknown'}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `taxonomy-results-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredTableData = taxonomyTableData.filter(row => {
    const matchesSearch = searchQuery === '' || 
      (row.accession && row.accession.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (row.taxonomy && row.taxonomy.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesFilter = filterStatus === 'all' || 
      (row.status && row.status.toLowerCase() === filterStatus.toLowerCase());
    
    return matchesSearch && matchesFilter;
  });

  // Get unique statuses for filter dropdown
  const uniqueStatuses = Array.from(new Set(taxonomyTableData.map(row => row.status).filter(status => status && status.trim().length > 0)));

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className={`text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
          Loading Analysis Results...
        </div>
      </div>
    );
  }

  // Show empty state if no data
  if (!taxonomyTableData.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className={`w-16 h-16 mb-4 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
        <h2 className={`text-2xl font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
          No Analysis Data Available
        </h2>
        <p className={`mb-6 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Please upload and analyze a sequence file first to view results.
        </p>
        <button 
          onClick={() => onNavigate('upload')}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Go to Upload
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-3">
            <div>
              <h1 className={`text-3xl md:text-4xl mb-2 font-bold ${
                isDarkMode ? 'text-white' : 'text-slate-900'
              }`}>
                Analysis Complete
              </h1>
              <p className={`text-base ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Deep-sea eDNA classification results
              </p>
            </div>
            
            {/* Stats Inline */}
            <div className="flex flex-wrap gap-6 lg:gap-8">
              <div>
                <div className={`text-xs mb-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                  Sample
                </div>
                <div className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {analysisMetadata.sampleName}
                </div>
              </div>
              <div>
                <div className={`text-xs mb-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                  Total Sequences
                </div>
                <div className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {stats.total}
                </div>
              </div>
              <div>
                <div className={`text-xs mb-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                  Novel/Unknown
                </div>
                <div className={`font-semibold ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                  {stats.novelCount}
                </div>
              </div>
              <div>
                
              </div>
            </div>
          </div>
        </div>

        {/* Main Grid Layout */}
        <div className="grid lg:grid-cols-1 gap-8 mb-8">
          
          {/* Taxonomy Summary Panel - Using New Chart Component */}
          <ChartPieInteractive
            data={taxonomySummary}
            title="Taxonomy Summary"
            description="Deep-sea eDNA classification distribution"
            isDarkMode={isDarkMode}
          />
        </div>

        {/* Secondary Grid */}
        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          
          {/* Novel Species Detected Panel - UPDATED */}
          <GlareHover
            glareColor={isDarkMode ? "#A78BFA" : "#8B5CF6"}
            glareOpacity={0.35}
            glareAngle={-35}
            glareSize={300}
            transitionDuration={750}
            playOnce={false}
            borderColor={isDarkMode ? '#334155' : '#475569'}
            borderRadius="1rem"
          >
            <div className={`p-6 rounded-2xl backdrop-blur-md h-full ${
              isDarkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white/50 border-slate-200'
            } border-2`}>
              <div className="flex items-center gap-3 mb-6">
                <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
                  <Sparkles className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                </div>
                <h2 className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Novel Species Detected
                </h2>
              </div>

              <div className="text-center py-8">
                {/* DYNAMIC COUNT APPLIED HERE */}
                <div className={`text-6xl mb-4 font-bold ${isDarkMode ? 'text-purple-400' : 'text-purple-400'}`}>
                  {stats.novelCount}
                </div>
                <p className={`text-sm mb-8 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Unassigned sequences found
                </p>
                
                <div className={`p-4 rounded-lg mb-6 ${isDarkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-100 border-slate-300'} border`}>
                  <p className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    These sequences do not match PR2/SILVA references. Detected using transformer embeddings + clustering analysis.
                  </p>
                </div>

                <button className={`w-full py-3 rounded-lg font-semibold transition-all transform hover:scale-105 ${
                  isDarkMode
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500'
                    : 'bg-gradient-to-r from-slate-600 to-slate-700 text-white hover:from-slate-500 hover:to-slate-600'
                } shadow-lg`}>
                  View Novel Clusters
                </button>
              </div>

              <div className={`mt-6 p-4 rounded-lg ${isDarkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-100 border-slate-300'} border`}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className={`w-4 h-4 ${isDarkMode ? 'text-cyan-400' : 'text-cyan-600'}`} />
                  <span className={`text-xs font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Novelty Metrics
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Novel Sequences</p>
                    <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{stats.novelCount}</p>
                  </div>
                  <div>
                    <p className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Novel Rate</p>
                    <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{stats.total > 0 ? ((stats.novelCount / stats.total) * 100).toFixed(1) : 0}%</p>
                  </div>
                </div>
              </div>
            </div>
          </GlareHover>

          {/* Biodiversity Metrics */}
          <GlareHover
            glareColor={isDarkMode ? "#10B981" : "#059669"}
            glareOpacity={0.3}
            glareAngle={-45}
            glareSize={280}
            transitionDuration={700}
            playOnce={false}
            borderColor={isDarkMode ? '#065F46' : '#6EE7B7'}
            borderRadius="1rem"
          >
            <div className={`p-6 rounded-2xl backdrop-blur-md h-full ${
              isDarkMode ? 'bg-slate-800/50' : 'bg-white/50'
            }`}>
              <div className="flex items-center gap-3 mb-6">
                <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-green-500/20' : 'bg-green-100'}`}>
                  <TrendingUp className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                </div>
                <h2 className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Diversity Metrics
                </h2>
              </div>

              <div className="space-y-6">
                <MetricCard 
                  isDarkMode={isDarkMode}
                  label="Species Richness"
                  value={taxonomySummary.length.toString()}
                  description="Total unique taxa identified"
                  icon={<Database className="w-4 h-4" />}
                />
                <MetricCard 
                  isDarkMode={isDarkMode}
                  label="Shannon Index"
                  value={(() => {
                    if (taxonomySummary.length === 0 || stats.total === 0) return '0.00';
                    const shannon = taxonomySummary.reduce((acc, item) => {
                      const p = item.value / stats.total;
                      return acc - (p * Math.log(p));
                    }, 0);
                    return shannon.toFixed(2);
                  })()}
                  description="Diversity & evenness measure"
                  icon={<Layers className="w-4 h-4" />}
                />
                <MetricCard 
                  isDarkMode={isDarkMode}
                  label="Simpson Index"
                  value={(() => {
                    if (taxonomySummary.length === 0 || stats.total === 0) return '0.00';
                    const simpson = taxonomySummary.reduce((acc, item) => {
                      const p = item.value / stats.total;
                      return acc + (p * p);
                    }, 0);
                    return (1 - simpson).toFixed(2);
                  })()}
                  description="Probability of intraspecific encounter"
                  icon={<Globe className="w-4 h-4" />}
                />
                <MetricCard 
                  isDarkMode={isDarkMode}
                  label="Avg Confidence"
                  value={`${stats.avgConfidence}%`}
                  description="Average classification confidence"
                  icon={<TrendingUp className="w-4 h-4" />}
                />
              </div>
            </div>
          </GlareHover>
        </div>

        {/* Taxonomy Table Viewer */}
        <GlareHover
          glareColor={isDarkMode ? "#60A5FA" : "#3B82F6"}
          glareOpacity={0.25}
          glareAngle={-30}
          glareSize={350}
          transitionDuration={800}
          playOnce={false}
          borderColor={isDarkMode ? '#334155' : '#BFDBFE'}
          borderRadius="1rem"
        >
          <div className={`p-6 rounded-2xl backdrop-blur-md mb-8 ${
            isDarkMode ? 'bg-slate-800/50' : 'bg-white/50'
          }`}>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
              <h2 className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Taxonomy Results
              </h2>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative">
                  <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
                    isDarkMode ? 'text-slate-400' : 'text-slate-500'
                  }`} />
                  <input 
                    type="text"
                    placeholder="Search sequences..."
                    value={searchQuery}
                    onChange={(e) => {
                      console.log('Search input changed in OutputPage:', e.target.value);
                      setSearchQuery(e.target.value);
                    }}
                    className={`pl-10 pr-4 py-2 rounded-lg border transition-all ${
                      isDarkMode 
                        ? 'bg-slate-700/60 border-slate-600 text-white placeholder-slate-400' 
                        : 'bg-white/80 border-blue-200 text-slate-900 placeholder-slate-500'
                    } focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                  />
                </div>
                
                <div className="relative">
                  <button 
                    onClick={() => setFilterOpen(!filterOpen)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                      isDarkMode 
                        ? 'bg-slate-700/60 hover:bg-slate-600/60 text-white border border-slate-600' 
                        : 'bg-white/80 hover:bg-white text-slate-900 border border-blue-200'
                    }`}
                  >
                    <Filter className="w-4 h-4" />
                    Filter
                    {filterStatus !== 'all' && (
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        isDarkMode ? 'bg-cyan-500/20 text-cyan-400' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {filterStatus}
                      </span>
                    )}
                  </button>
                  
                  {filterOpen && (
                    <div className={`absolute top-full left-0 mt-1 w-48 rounded-lg border shadow-lg z-10 ${
                      isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                    }`}>
                      <div className="p-2">
                        <button
                          onClick={() => {
                            setFilterStatus('all');
                            setFilterOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                            filterStatus === 'all'
                              ? isDarkMode ? 'bg-cyan-500/20 text-cyan-400' : 'bg-blue-100 text-blue-700'
                              : isDarkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          All Statuses
                        </button>
                        {uniqueStatuses.map(status => (
                          <button
                            key={status}
                            onClick={() => {
                              setFilterStatus(status);
                              setFilterOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                              filterStatus === status
                                ? isDarkMode ? 'bg-cyan-500/20 text-cyan-400' : 'bg-blue-100 text-blue-700'
                                : isDarkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <button 
                  onClick={handleExportCSV}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                    isDarkMode 
                      ? 'bg-cyan-600 hover:bg-cyan-500 text-white' 
                      : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                  }`}
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Dynamic Bar Charts */}
            <div className="grid lg:grid-cols-2 gap-6 mb-6">
              {/* Taxonomic Distribution Bar Chart */}
              <div>
                <h3 className={`text-base mb-4 font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Taxonomic Distribution
                </h3>
                <div className="space-y-3">
                  {taxonomySummary.slice(0, 6).map((item, idx) => (
                    <div key={idx}>
                      <div className="flex justify-between mb-1.5">
                        <span className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          {item.name}
                        </span>
                        <span className={`text-sm font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          {item.value} ({((item.value / taxonomyTableData.length) * 100).toFixed(1)}%)
                        </span>
                      </div>
                      <div className={`h-2.5 rounded-full overflow-hidden ${
                        isDarkMode ? 'bg-slate-700' : 'bg-slate-200'
                      }`}>
                        <div
                          className="h-full transition-all duration-500"
                          style={{ 
                            width: `${(item.value / taxonomyTableData.length) * 100}%`,
                            backgroundColor: item.color
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Confidence Distribution */}
              <div>
                <h3 className={`text-base mb-4 font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Confidence Level Distribution
                </h3>
                <div className="space-y-3">
                  {(() => {
                    const high = taxonomyTableData.filter(s => s.confidence >= 0.8).length;
                    const medium = taxonomyTableData.filter(s => s.confidence >= 0.5 && s.confidence < 0.8).length;
                    const low = taxonomyTableData.filter(s => s.confidence < 0.5).length;
                    const total = taxonomyTableData.length;
                    
                    return [
                      { label: 'High Confidence', value: high, color: '#10B981', range: '≥80%' },
                      { label: 'Medium Confidence', value: medium, color: '#F59E0B', range: '50-80%' },
                      { label: 'Low Confidence', value: low, color: '#EF4444', range: '<50%' }
                    ].map((item, idx) => (
                      <div key={idx}>
                        <div className="flex justify-between mb-1.5">
                          <span className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {item.label} <span className="text-xs opacity-60">({item.range})</span>
                          </span>
                          <span className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                            {item.value} ({total > 0 ? ((item.value / total) * 100).toFixed(1) : 0}%)
                          </span>
                        </div>
                        <div className={`h-2.5 rounded-full overflow-hidden ${
                          isDarkMode ? 'bg-slate-700' : 'bg-slate-200'
                        }`}>
                          <div
                            className="h-full transition-all duration-500"
                            style={{ 
                              width: `${total > 0 ? (item.value / total) * 100 : 0}%`,
                              backgroundColor: item.color
                            }}
                          />
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>

            

            {/* Novel vs Known Comparison */}
            <div>
              <h3 className={`text-base mb-4 font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Novel vs Known Sequences
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {(() => {
                  const novel = taxonomyTableData.filter(s => 
                    (s as any).novelty_score > 0.15
                  ).length;
                  const known = taxonomyTableData.length - novel;
                  const total = taxonomyTableData.length;
                  
                  return [
                    { label: 'Known Sequences', value: known, color: '#10B981', icon: '✓' },
                    { label: 'Novel/Unknown', value: novel, color: '#A78BFA', icon: '★' }
                  ].map((item, idx) => (
                    <div key={idx} className={`text-center p-5 rounded-xl ${
                      isDarkMode ? 'bg-slate-700/30' : 'bg-slate-50'
                    }`}>
                      <div className="text-3xl mb-2">{item.icon}</div>
                      <div className={`text-2xl font-bold mb-1`} style={{ color: item.color }}>
                        {item.value}
                      </div>
                      <div className={`text-xs mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        {item.label}
                      </div>
                      <div className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {total > 0 ? ((item.value / total) * 100).toFixed(1) : 0}% of total
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </GlareHover>

        {/* Cluster Visualization Panel */}
        <GlareHover
          glareColor={isDarkMode ? "#60A5FA" : "#3B82F6"}
          glareOpacity={0.25}
          glareAngle={-30}
          glareSize={350}
          transitionDuration={800}
          playOnce={false}
          borderColor={isDarkMode ? '#334155' : '#BFDBFE'}
          borderRadius="1rem"
        >
          <div className={`p-6 rounded-2xl backdrop-blur-md mb-8 ${
            isDarkMode ? 'bg-slate-800/50' : 'bg-white/50'
          }`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Cluster Visualization
              </h2>
              
              <div className={`flex gap-2 p-1 rounded-lg ${
                isDarkMode ? 'bg-slate-700/60' : 'bg-white/60'
              }`}>
                <button 
                  onClick={() => setSelectedTab('embedding')}
                  className={`px-4 py-2 rounded text-sm font-semibold transition-all ${
                    selectedTab === 'embedding'
                      ? isDarkMode 
                        ? 'bg-cyan-600 text-white' 
                        : 'bg-cyan-600 text-white'
                      : isDarkMode 
                        ? 'text-slate-400 hover:text-white' 
                        : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cluster Details
                </button>
              </div>
            </div>

            {selectedTab === 'embedding' ? (
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <XAxis 
                      type="number" 
                      dataKey="x" 
                      name="UMAP-1"
                      stroke={isDarkMode ? '#94A3B8' : '#64748B'}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="y" 
                      name="UMAP-2"
                      stroke={isDarkMode ? '#94A3B8' : '#64748B'}
                    />
                    <ZAxis type="number" dataKey="z" range={[60, 400]} name="Count" />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }}
                      contentStyle={{
                        backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                        border: `1px solid ${isDarkMode ? '#475569' : '#e2e8f0'}`,
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Scatter name="Sequences" data={clusterData} fill="#8884d8">
                      {clusterData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="space-y-4">
                {clusterData.slice(0, 4).map((cluster, idx) => (
                  <div 
                    key={idx}
                    className={`p-4 rounded-lg ${
                      isDarkMode ? 'bg-slate-700/40' : 'bg-white/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: cluster.color }}
                        ></div>
                        <span className={`font-semibold ${
                          isDarkMode ? 'text-white' : 'text-slate-900'
                        }`}>
                          {cluster.cluster}
                        </span>
                      </div>
                      <span className={`text-sm ${
                        isDarkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        {cluster.z} sequences
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <p className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>
                          Dominant Lineage
                        </p>
                        <p className={`font-semibold mt-1 ${
                          isDarkMode ? 'text-white' : 'text-slate-900'
                        }`}>
                          {cluster.cluster}
                        </p>
                      </div>
                      <div>
                        <p className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>
                          Avg. Confidence
                        </p>
                        <p className={`font-semibold mt-1 ${
                          isDarkMode ? 'text-white' : 'text-slate-900'
                        }`}>
                          {(Math.random() * 0.3 + 0.7).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>
                          Novelty Score
                        </p>
                        <p className={`font-semibold mt-1 ${
                          isDarkMode ? 'text-white' : 'text-slate-900'
                        }`}>
                          {cluster.cluster === 'Unknown' ? '92%' : `${Math.floor(Math.random() * 30)}%`}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlareHover>

        {/* Taxonomic Composition Stacked Bar Chart */}
        <GlareHover
          glareColor={isDarkMode ? "#8B5CF6" : "#7C3AED"}
          glareOpacity={0.25}
          glareAngle={-35}
          glareSize={340}
          transitionDuration={800}
          playOnce={false}
          borderColor={isDarkMode ? '#4C1D95' : '#C4B5FD'}
          borderRadius="1rem"
        >
          <div className={`p-6 rounded-2xl backdrop-blur-md mb-8 ${
            isDarkMode ? 'bg-slate-800/50' : 'bg-white/50'
          }`}>
            <div className="mb-6">
              <h2 className={`font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Taxonomic Composition (Relative Abundance)
              </h2>
              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Eukaryotic taxonomy distribution showing relative abundance across all sequences
              </p>
            </div>

            <div className="space-y-8">
              {/* Stacked Bar Chart */}
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <span className={`text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    All Sequences
                  </span>
                  <div className="flex-1 h-12 rounded-lg overflow-hidden flex">
                    {taxonomySummary.map((taxa, idx) => {
                      const percentage = stats.total > 0 ? (taxa.value / stats.total) * 100 : 0;
                      return (
                        <div
                          key={idx}
                          className="relative group cursor-pointer transition-all hover:opacity-80"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: taxa.color
                          }}
                          title={`${taxa.name}: ${taxa.value} sequences (${percentage.toFixed(1)}%)`}
                        >
                          {percentage > 5 && (
                            <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">
                              {percentage.toFixed(0)}%
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Legend */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
                  {taxonomySummary.map((taxa, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: taxa.color }}
                      />
                      <span className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        {taxa.name}
                      </span>
                      <span className={`text-xs font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        ({taxa.value})
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Multiple Sample View (if we had multiple samples) */}
              <div>
                <h3 className={`text-sm font-semibold mb-3 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Sample Distribution
                </h3>
                <div className="space-y-3">
                  {['Primary Sample', 'Reference Baseline'].map((sampleName, sampleIdx) => (
                    <div key={sampleIdx} className="flex items-center gap-3">
                      <span className={`text-xs w-32 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {sampleName}
                      </span>
                      <div className="flex-1 h-8 rounded-lg overflow-hidden flex">
                        {taxonomySummary.map((taxa, idx) => {
                          // Simulate slight variation for reference baseline
                          const variance = sampleIdx === 1 ? (Math.random() * 0.2 - 0.1) : 0;
                          const adjustedValue = Math.max(0, taxa.value * (1 + variance));
                          const total = taxonomySummary.reduce((acc, t) => acc + (sampleIdx === 1 ? Math.max(0, t.value * (1 + (Math.random() * 0.2 - 0.1))) : t.value), 0);
                          const percentage = total > 0 ? (adjustedValue / total) * 100 : 0;
                          
                          return (
                            <div
                              key={idx}
                              className="relative group cursor-pointer transition-all hover:opacity-80"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: taxa.color,
                                opacity: sampleIdx === 1 ? 0.7 : 1
                              }}
                              title={`${taxa.name}: ${percentage.toFixed(1)}%`}
                            />
                          );
                        })}
                      </div>
                      <span className={`text-xs w-16 text-right ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {sampleIdx === 0 ? stats.total : Math.round(stats.total * 0.9)} seqs
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </GlareHover>

        {/* Taxa Abundance Heatmap */}
        <GlareHover
          glareColor={isDarkMode ? "#EC4899" : "#DB2777"}
          glareOpacity={0.25}
          glareAngle={45}
          glareSize={360}
          transitionDuration={800}
          playOnce={false}
          borderColor={isDarkMode ? '#831843' : '#FBCFE8'}
          borderRadius="1rem"
        >
          <div className={`p-6 rounded-2xl backdrop-blur-md mb-8 ${
            isDarkMode ? 'bg-slate-800/50' : 'bg-white/50'
          }`}>
            <div className="mb-6">
              <h2 className={`font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Taxa Relative Abundance Heatmap
              </h2>
              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Hierarchical clustering of taxonomic groups by relative abundance across samples
              </p>
            </div>

            {(() => {
              // Calculate detailed taxa abundance at different levels
              const detailedTaxa = taxonomyTableData.reduce((acc: any, seq: any) => {
                const taxonomy = seq.taxonomy || '';
                const parts = taxonomy.split(';').map((p: string) => p.trim());
                
                // Extract genus/species level (last 2-3 parts)
                const taxonName = parts.slice(-2).join(' ') || 'Unknown';
                const phylum = parts[0] || 'Unknown';
                
                if (!acc[taxonName]) {
                  acc[taxonName] = {
                    name: taxonName,
                    phylum: phylum,
                    counts: Array(8).fill(0), // Simulate 8 samples
                    total: 0
                  };
                }
                
                // Simulate sample distribution
                const sampleIdx = Math.floor(Math.random() * 8);
                acc[taxonName].counts[sampleIdx]++;
                acc[taxonName].total++;
                
                return acc;
              }, {});

              const taxaArray = Object.values(detailedTaxa)
                .sort((a: any, b: any) => b.total - a.total)
                .slice(0, 40); // Top 40 taxa

              // Calculate max value for color scaling
              const maxAbundance = Math.max(...taxaArray.flatMap((t: any) => t.counts));
              
              // Helper function to get heatmap color
              const getHeatmapColor = (value: number, max: number) => {
                if (value === 0) return isDarkMode ? '#1e293b' : '#f1f5f9';
                const intensity = Math.log10(value + 1) / Math.log10(max + 1);
                
                if (intensity < 0.2) return isDarkMode ? '#1e3a5f' : '#dbeafe'; // Dark blue
                if (intensity < 0.4) return isDarkMode ? '#065f46' : '#a7f3d0'; // Green
                if (intensity < 0.6) return isDarkMode ? '#a16207' : '#fef08a'; // Yellow
                if (intensity < 0.8) return isDarkMode ? '#c2410c' : '#fdba74'; // Orange
                return isDarkMode ? '#991b1b' : '#fca5a5'; // Red
              };

              const sampleLabels = ['N6', 'A5', 'M7', 'A2', 'A3', 'M2', 'A8', 'E2'];

              return (
                <div className="space-y-4">
                  {/* Heatmap Grid */}
                  <div className="overflow-x-auto">
                    <div className="min-w-[700px]">
                      {/* Column Headers */}
                      <div className="flex items-end mb-2">
                        <div className="w-48"></div>
                        <div className="flex-1 flex gap-1">
                          {sampleLabels.map((label, idx) => (
                            <div 
                              key={idx} 
                              className={`flex-1 text-center text-xs font-semibold pb-2 ${
                                isDarkMode ? 'text-slate-300' : 'text-slate-700'
                              }`}
                            >
                              {label}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Heatmap Rows */}
                      <div className="space-y-0.5">
                        {taxaArray.map((taxa: any, rowIdx: number) => (
                          <div key={rowIdx} className="flex items-center gap-1">
                            {/* Taxa Label */}
                            <div 
                              className={`w-48 text-xs truncate pr-2 ${
                                isDarkMode ? 'text-slate-300' : 'text-slate-700'
                              }`}
                              title={taxa.name}
                            >
                              {taxa.name}
                            </div>
                            
                            {/* Heatmap Cells */}
                            <div className="flex-1 flex gap-1">
                              {taxa.counts.map((count: number, colIdx: number) => {
                                const percentage = stats.total > 0 ? ((count / stats.total) * 100).toFixed(2) : '0.00';
                                return (
                                  <div
                                    key={colIdx}
                                    className="flex-1 h-6 rounded cursor-pointer transition-all hover:ring-2 hover:ring-white"
                                    style={{
                                      backgroundColor: getHeatmapColor(count, maxAbundance)
                                    }}
                                    title={`${taxa.name}\nSample: ${sampleLabels[colIdx]}\nCount: ${count}\nAbundance: ${percentage}%`}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Color Scale Legend */}
                  <div className="mt-6 pt-6 border-t border-slate-700/50">
                    <div className="flex items-center gap-4">
                      <span className={`text-xs font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Relative abundance (%)
                      </span>
                      <div className="flex-1 flex items-center gap-2">
                        <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>0</span>
                        <div className="flex-1 h-6 rounded flex">
                          <div className="flex-1" style={{ backgroundColor: isDarkMode ? '#1e3a5f' : '#dbeafe' }}></div>
                          <div className="flex-1" style={{ backgroundColor: isDarkMode ? '#065f46' : '#a7f3d0' }}></div>
                          <div className="flex-1" style={{ backgroundColor: isDarkMode ? '#a16207' : '#fef08a' }}></div>
                          <div className="flex-1" style={{ backgroundColor: isDarkMode ? '#c2410c' : '#fdba74' }}></div>
                          <div className="flex-1" style={{ backgroundColor: isDarkMode ? '#991b1b' : '#fca5a5' }}></div>
                        </div>
                        <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          {((maxAbundance / stats.total) * 100).toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Statistics Summary */}
                  <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-700/50">
                    <div className={`text-center p-4 rounded-lg ${
                      isDarkMode ? 'bg-slate-700/30' : 'bg-slate-50'
                    }`}>
                      <div className={`text-2xl font-bold mb-1 ${isDarkMode ? 'text-cyan-400' : 'text-cyan-600'}`}>
                        {taxaArray.length}
                      </div>
                      <div className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Taxa Displayed
                      </div>
                    </div>
                    <div className={`text-center p-4 rounded-lg ${
                      isDarkMode ? 'bg-slate-700/30' : 'bg-slate-50'
                    }`}>
                      <div className={`text-2xl font-bold mb-1 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                        {sampleLabels.length}
                      </div>
                      <div className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Sample Groups
                      </div>
                    </div>
                    <div className={`text-center p-4 rounded-lg ${
                      isDarkMode ? 'bg-slate-700/30' : 'bg-slate-50'
                    }`}>
                      <div className={`text-2xl font-bold mb-1 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                        {((maxAbundance / stats.total) * 100).toFixed(2)}%
                      </div>
                      <div className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Max Abundance
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </GlareHover>

        

        {/* Footer Credits */}
        <div className={`p-6 rounded-2xl backdrop-blur-md text-center ${
          isDarkMode ? 'bg-slate-800/30 border border-slate-700' : 'bg-white/30 border border-blue-200'
        }`}>
          <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            <span className="font-semibold">CMLRE · Ministry of Earth Sciences</span>
            <br />
            Powered by AI-based Deep-Sea Biodiversity Analysis Pipeline
          </p>
        </div>
      </div>

      {/* Sequence Inspection Drawer */}
      {selectedSequence && (
        <div className="fixed inset-0 z-50 flex items-center justify-end">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedSequence(null)}
          ></div>
          
          <div className={`relative w-full max-w-2xl h-full overflow-y-auto shadow-2xl ${
            isDarkMode ? 'bg-slate-900' : 'bg-white'
          }`}>
            <div className={`sticky top-0 z-10 p-6 border-b ${
              isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-blue-200'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Sequence Details
                </h3>
                <button 
                  onClick={() => setSelectedSequence(null)}
                  className={`p-2 rounded-lg transition-all ${
                    isDarkMode 
                      ? 'hover:bg-slate-700 text-slate-400 hover:text-white' 
                      : 'hover:bg-blue-50 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex items-center gap-4">
                <span className={`text-lg font-mono ${
                  isDarkMode ? 'text-cyan-400' : 'text-cyan-600'
                }`}>
                  {selectedSequence}
                </span>
                <span className={`px-3 py-1 rounded text-xs font-semibold ${
                  isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                }`}>
                  94% Confidence
                </span>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Taxonomy Info */}
              <div>
                <h4 className={`text-sm font-semibold mb-3 ${
                  isDarkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  Predicted Taxonomy
                </h4>
                <p className={isDarkMode ? 'text-white font-mono text-sm' : 'text-slate-900 font-mono text-sm'}>
                  Alveolata &gt; Dinoflagellata &gt; Gymnodiniales
                </p>
              </div>

              {/* Sequence Stats */}
              <div className={`grid grid-cols-2 gap-4 p-4 rounded-lg ${
                isDarkMode ? 'bg-slate-800/60' : 'bg-blue-50/60'
              }`}>
                <div>
                  <p className={`text-xs mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Sequence Length
                  </p>
                  <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    1,842 bp
                  </p>
                </div>
                <div>
                  <p className={`text-xs mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    GC Content
                  </p>
                  <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    47.3%
                  </p>
                </div>
                <div>
                  <p className={`text-xs mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Reference Overlap
                  </p>
                  <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    87%
                  </p>
                </div>
                <div>
                  <p className={`text-xs mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Cluster ID
                  </p>
                  <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    C1
                  </p>
                </div>
              </div>

              {/* Full Sequence */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className={`text-sm font-semibold ${
                    isDarkMode ? 'text-slate-300' : 'text-slate-700'
                  }`}>
                    Nucleotide Sequence
                  </h4>
                  <button 
                    onClick={() => handleCopySequence('ATCGATCGATCG...')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      copiedText
                        ? isDarkMode 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-green-100 text-green-700'
                        : isDarkMode 
                          ? 'bg-slate-700 hover:bg-slate-600 text-white' 
                          : 'bg-blue-100 hover:bg-blue-200 text-slate-900'
                    }`}
                  >
                    {copiedText ? (
                      <>
                        <Check className="w-3 h-3" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                
                <div className={`p-4 rounded-lg font-mono text-xs leading-relaxed overflow-x-auto ${
                  isDarkMode ? 'bg-slate-800/80' : 'bg-slate-50'
                }`}>
                  <p className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
                    ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG
                    ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG
                    GCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTA
                    ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG
                    TTAGCCTAGCCTAGCCTAGCCTAGCCTAGCCTAGCCTAGCCTAGCCTAGCCTAGCCTAGCCTAG
                  </p>
                </div>
              </div>

              {/* Similarity Summary */}
              <div>
                <h4 className={`text-sm font-semibold mb-3 ${
                  isDarkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  Reference Similarity
                </h4>
                <div className="space-y-3">
                  <SimilarityBar isDarkMode={isDarkMode} label="PR2 Database" percentage={87} />
                  <SimilarityBar isDarkMode={isDarkMode} label="SILVA rRNA" percentage={82} />
                  <SimilarityBar isDarkMode={isDarkMode} label="GenBank NT" percentage={79} />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 pt-4">
                <button 
                  onClick={() => onNavigate('report')}
                  className={`w-full py-3 rounded-lg font-semibold transition-all transform hover:scale-[1.02] ${
                    isDarkMode
                      ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white'
                      : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white'
                  } shadow-lg`}>
                  <FileText className="w-4 h-4 inline mr-2" />
                  View Full Report & Deep Analysis
                </button>
                
                <div className="flex gap-3">
                  <button className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                    isDarkMode
                      ? 'bg-slate-700 hover:bg-slate-600 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
                  }`}>
                    <Download className="w-4 h-4 inline mr-2" />
                    Download FASTA
                  </button>
                  <button className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                    isDarkMode
                      ? 'bg-slate-700 hover:bg-slate-600 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
                  }`}>
                    <ExternalLink className="w-4 h-4 inline mr-2" />
                    View in NCBI
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper Components
function StatBadge({ isDarkMode, label, value }: { isDarkMode: boolean; label: string; value: string }) {
  return (
    <div className={`px-4 py-2 rounded-lg ${
      isDarkMode ? 'bg-slate-700/60' : 'bg-white/80'
    }`}>
      <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{label}</p>
      <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function MetricCard({ 
  isDarkMode, 
  label, 
  value, 
  description, 
  icon 
}: { 
  isDarkMode: boolean; 
  label: string; 
  value: string; 
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-slate-700/40' : 'bg-white/60'}`}>
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-1.5 rounded ${isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-600'}`}>
          {icon}
        </div>
        <div className="flex-1">
          <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{label}</p>
          <p className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{value}</p>
        </div>
      </div>
      <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{description}</p>
    </div>
  );
}

function InsightCard({ 
  isDarkMode, 
  icon, 
  iconColor, 
  iconBg, 
  title, 
  description 
}: { 
  isDarkMode: boolean; 
  icon: React.ReactNode; 
  iconColor: string; 
  iconBg: string; 
  title: string; 
  description: string;
}) {
  return (
    <div className={`p-6 rounded-lg ${isDarkMode ? 'bg-slate-700/40' : 'bg-white/60'}`}>
      <div className={`p-3 rounded-lg inline-block mb-4 ${iconBg}`}>
        <div className={iconColor}>
          {icon}
        </div>
      </div>
      <h3 className={`mb-2 font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
        {title}
      </h3>
      <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
        {description}
      </p>
    </div>
  );
}

function SimilarityBar({ isDarkMode, label, percentage }: { isDarkMode: boolean; label: string; percentage: number }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{label}</span>
        <span className={`text-xs font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{percentage}%</span>
      </div>
      <div className={`h-2 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
        <div 
          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
}