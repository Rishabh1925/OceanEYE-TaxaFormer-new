import { useState, useEffect } from 'react';
import { ArrowLeft, Download, Share2, TrendingUp, Database, Search, Filter, FileDown } from 'lucide-react';
import { ChartTaxaAbundance } from './charts/ChartTaxaAbundance';
import { ChartTaxonomyComposition } from './charts/ChartTaxonomyComposition';
import { ChartTaxonomySankey } from './charts/ChartTaxonomySankey';
import { ChartTaxonomyRainbow } from './charts/ChartTaxonomyRainbow';
import { ChartRadarDots } from './charts/ChartRadarDots';
import { ChartBarDefault } from './charts/ChartBarDefault';
import { ChartPieInteractive } from './charts/ChartPieInteractive';
import ChartAreaInteractive from './ui/chart-area-interactive.tsx';

interface CSVRow {
  Sequence_ID: string;
  Predicted_Taxonomy: string;
  Novelty_Score: number;
  Status: string;
  Nearest_Neighbor_Taxonomy: string;
  Nearest_Neighbor_Dist: number;
}

interface ResultsPageProps {
  isDarkMode: boolean;
  onNavigate: (page: string) => void;
}

export default function ResultsPage({ isDarkMode, onNavigate }: ResultsPageProps) {
  const [loading, setLoading] = useState(true);
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showFilterDropdown) {
        setShowFilterDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilterDropdown]);

  useEffect(() => {
    // Load real analysis data from localStorage
    const loadAnalysisData = () => {
      try {
        const storedData = localStorage.getItem('analysisResults');
        if (!storedData) {
          throw new Error('No analysis results found. Please analyze a file first.');
        }

        const analysisResults = JSON.parse(storedData);
        console.log('Loading analysis results for charts:', analysisResults);

        // Convert analysis results to CSV format for charts
        const sequences = analysisResults.sequences || [];
        const parsedData: CSVRow[] = sequences.map((seq: any) => ({
          Sequence_ID: seq.accession || seq.sequence_id || 'Unknown',
          Predicted_Taxonomy: seq.taxonomy || 'Unknown',
          Novelty_Score: seq.novelty_score || 0,
          Status: seq.status || 'Unknown',
          Nearest_Neighbor_Taxonomy: seq.taxonomy || 'Unknown',
          Nearest_Neighbor_Dist: 1 - (seq.confidence || 0), // Convert confidence to distance
        }));

        console.log(`Loaded ${parsedData.length} sequences for analysis charts`);
        setCsvData(parsedData);
        setLoading(false);
      } catch (err) {
        console.error('Error loading analysis data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load analysis data');
        setLoading(false);
      }
    };

    loadAnalysisData();
  }, []);

  // Filter and search data
  const filteredData = csvData.filter(row => {
    const matchesSearch = searchTerm === '' || 
      row.Sequence_ID.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.Predicted_Taxonomy.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterStatus === 'all' || 
      row.Status.toLowerCase() === filterStatus.toLowerCase();
    
    return matchesSearch && matchesFilter;
  });

  // Calculate summary stats from filtered data
  const stats = {
    total: filteredData.length,
    totalOriginal: csvData.length,
    avgNoveltyScore: filteredData.length > 0 
      ? (filteredData.reduce((sum, row) => sum + row.Novelty_Score, 0) / filteredData.length).toFixed(4)
      : '0.0000',
    uniqueTaxa: new Set(filteredData.map(row => row.Predicted_Taxonomy)).size,
    potentiallyNovel: filteredData.filter(row => row.Novelty_Score > 0.15).length,
  };

  // Get unique statuses for filter dropdown
  const uniqueStatuses = Array.from(new Set(csvData.map(row => row.Status).filter(status => status && status.trim().length > 0)));

  // Prepare data for novelty score bar chart (using same ranges as histogram)
  const noveltyBins = [
    { min: 0.15, max: 0.17, label: '0.15-0.17' },
    { min: 0.17, max: 0.19, label: '0.17-0.19' },
    { min: 0.19, max: 0.21, label: '0.19-0.21' },
    { min: 0.21, max: 0.23, label: '0.21-0.23' },
    { min: 0.23, max: 0.25, label: '0.23-0.25' },
    { min: 0.25, max: 0.31, label: '0.25+' },
  ];

  const noveltyBarData: { category: string; value: number }[] = noveltyBins.map(bin => ({
    category: bin.label,
    value: filteredData.filter(row => {
      const score = row.Novelty_Score;
      // Last bin is open-ended on the upper side
      if (bin.label === '0.25+') {
        return score >= bin.min;
      }
      return score >= bin.min && score < bin.max;
    }).length,
  }));

  // Prepare data for sequence status composition pie chart
  const statusCounts: Record<string, number> = filteredData.reduce((acc, row) => {
    const key = row.Status && row.Status.trim().length > 0 ? row.Status.trim() : 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieColors = ['#A855F7', '#22C55E', '#EAB308', '#3B82F6', '#F97316', '#EC4899'];
  const totalSequences = filteredData.length || 1;

  const statusPieData: { name: string; value: number; color: string }[] = Object.entries(statusCounts).map(
    ([status, count], index) => ({
      name: `${status} (${((count / totalSequences) * 100).toFixed(1)}%)`,
      value: count,
      color: pieColors[index % pieColors.length],
    })
  );

  // Prepare data for taxonomy radar chart (top phyla by sequence count)
  const radarLevelCounts = new Map<string, number>();
  filteredData.forEach(row => {
    const parts = row.Predicted_Taxonomy.split(';');
    const firstPart = parts[0]?.trim() || '';
    const secondPart = parts[1]?.trim() || '';

    // CSV format: "ACCESSION Eukaryota;Amorphea;Obazoa;..."
    // Use the second taxonomy token if available, otherwise fall back to the
    // domain name from the first part (after removing the accession prefix).
    let phylumPart = secondPart;
    if (!phylumPart && firstPart) {
      const tokens = firstPart.split(' ');
      phylumPart = tokens.slice(1).join(' ').trim() || firstPart;
    }

    if (phylumPart) {
      radarLevelCounts.set(phylumPart, (radarLevelCounts.get(phylumPart) || 0) + 1);
    }
  });

  const taxonomyRadarData: { category: string; value: number }[] = Array.from(radarLevelCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([name, value]) => ({
      category: name.length > 18 ? name.substring(0, 18) + '...' : name,
      value,
    }));

  const taxonomyRainbowData: { label: string; value: number }[] = Array.from(
    radarLevelCounts.entries()
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value }));

  const handleExport = () => {
    const dataStr = JSON.stringify(csvData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `taxaformer-results-${Date.now()}.json`;
    link.click();
  };

  const handleExportCSV = () => {
    console.log('Export CSV function called!');
    console.log('Filtered data length:', filteredData.length);
    
    const headers = ['Sequence_ID', 'Predicted_Taxonomy', 'Novelty_Score', 'Status', 'Nearest_Neighbor_Taxonomy', 'Nearest_Neighbor_Dist'];
    const csvContent = [
      headers.join(','),
      ...filteredData.map(row => [
        `"${row.Sequence_ID}"`,
        `"${row.Predicted_Taxonomy}"`,
        row.Novelty_Score,
        `"${row.Status}"`,
        `"${row.Nearest_Neighbor_Taxonomy}"`,
        row.Nearest_Neighbor_Dist
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

  console.log('ResultsPage render state:', { loading, error, csvDataLength: csvData.length, filteredDataLength: filteredData.length });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className={`text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
          Loading Results...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <h2 className={`text-2xl font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
          No Analysis Results Found
        </h2>
        <p className={`mb-6 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          {error}
        </p>
        <div className="flex gap-4">
          <button
            onClick={() => onNavigate('upload')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Upload & Analyze File
          </button>
          <button
            onClick={() => onNavigate('output')}
            className={`px-6 py-3 rounded-lg transition-colors ${
              isDarkMode 
                ? 'bg-slate-700 text-white hover:bg-slate-600' 
                : 'bg-slate-200 text-slate-900 hover:bg-slate-300'
            }`}
          >
            View Results
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <button
                onClick={() => onNavigate('output')}
                className={`flex items-center gap-2 mb-4 text-sm font-semibold transition-colors ${
                  isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <ArrowLeft className="w-4 h-4" /> Back to Output
              </button>
              <h1 className={`text-3xl md:text-4xl mb-2 font-bold ${
                isDarkMode ? 'text-white' : 'text-slate-900'
              }`}>
                Taxonomic Analysis Results
              </h1>
              <p className={`text-base ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Comprehensive visualization of novel candidates and taxonomy distribution
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: 'Taxaformer Results',
                      text: `Analysis complete: ${stats.total} sequences analyzed`
                    });
                  }
                }}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                  isDarkMode
                    ? 'bg-slate-700 hover:bg-slate-600 text-white'
                    : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
                }`}
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
              <button
                onClick={handleExport}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                  isDarkMode
                    ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>
        </div>

        {/* Taxonomy Results Header with Search, Filter, Export CSV */}
        <div className={`mb-6 p-4 rounded-xl ${
          isDarkMode ? 'bg-slate-800/50' : 'bg-white/50'
        } backdrop-blur-md border ${
          isDarkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className={`text-xl font-bold mb-1 ${
                isDarkMode ? 'text-white' : 'text-slate-900'
              }`}>
                Taxonomy Results
              </h2>
              <div className="flex items-center gap-3">
                <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {stats.total === stats.totalOriginal 
                    ? `Showing all ${stats.total} sequences`
                    : `Showing ${stats.total} of ${stats.totalOriginal} sequences`}
                </p>
                {(searchTerm || filterStatus !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setFilterStatus('all');
                    }}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      isDarkMode 
                        ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' 
                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                    }`}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search Input */}
              <div className="relative">
                <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-500'
                }`} />
                <input
                  type="text"
                  placeholder="Search sequences..."
                  value={searchTerm}
                  onChange={(e) => {
                    console.log('Search input changed:', e.target.value);
                    setSearchTerm(e.target.value);
                  }}
                  className={`pl-10 pr-4 py-2 rounded-lg border text-sm min-w-[200px] ${
                    isDarkMode 
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500' 
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500 focus:border-blue-500'
                  } focus:outline-none focus:ring-2 focus:ring-opacity-50 ${
                    isDarkMode ? 'focus:ring-cyan-500' : 'focus:ring-blue-500'
                  }`}
                  style={{ zIndex: 10 }}
                />
              </div>

              {/* Filter Dropdown */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    console.log('Filter button clicked!', e);
                    setShowFilterDropdown(!showFilterDropdown);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm cursor-pointer ${
                    isDarkMode
                      ? 'bg-slate-700 border-slate-600 text-white hover:bg-slate-600'
                      : 'bg-white border-slate-300 text-slate-900 hover:bg-slate-50'
                  } transition-colors`}
                  style={{ zIndex: 10 }}
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
                
                {showFilterDropdown && (
                  <div className={`absolute top-full left-0 mt-1 w-48 rounded-lg border shadow-lg z-10 ${
                    isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                  }`}>
                    <div className="p-2">
                      <button
                        onClick={() => {
                          setFilterStatus('all');
                          setShowFilterDropdown(false);
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
                            setShowFilterDropdown(false);
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

              {/* Export CSV Button */}
              <button
                onClick={(e) => {
                  console.log('Export CSV clicked!', e);
                  handleExportCSV();
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  isDarkMode
                    ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
                style={{ zIndex: 10 }}
              >
                <FileDown className="w-4 h-4" />
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[
            { 
              label: 'Total Sequences', 
              value: stats.total.toString(), 
              change: 'Analyzed', 
              icon: Database,
              color: isDarkMode ? 'text-cyan-400' : 'text-blue-500'
            },
            { 
              label: 'Unique Taxa', 
              value: stats.uniqueTaxa.toString(), 
              change: 'Identified', 
              icon: TrendingUp,
              color: isDarkMode ? 'text-emerald-400' : 'text-green-500'
            },
            { 
              label: 'Avg Novelty Score', 
              value: stats.avgNoveltyScore, 
              change: 'Score', 
              icon: TrendingUp,
              color: isDarkMode ? 'text-purple-400' : 'text-purple-500'
            },
            { 
              label: 'Potentially Novel', 
              value: stats.potentiallyNovel.toString(), 
              change: 'Candidates', 
              icon: Database,
              color: isDarkMode ? 'text-amber-400' : 'text-orange-500'
            }
          ].map((stat, idx) => (
            <div
              key={idx}
              className={`rounded-xl p-6 ${
                isDarkMode ? 'bg-slate-800/50' : 'bg-white/50'
              } backdrop-blur-md border ${
                isDarkMode ? 'border-slate-700' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <stat.icon className={`w-8 h-8 ${stat.color}`} />
                <span className={`text-xs px-2 py-1 rounded ${
                  isDarkMode ? 'bg-cyan-500/20 text-cyan-400' : 'bg-blue-100 text-blue-700'
                }`}>
                  {stat.change}
                </span>
              </div>
              <div className={`text-2xl font-bold mb-1 ${
                isDarkMode ? 'text-white' : 'text-slate-900'
              }`}>
                {stat.value}
              </div>
              <div className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Charts Section */}
        <div className="space-y-8">
          {/* Interactive Area Chart (3 months/30 days/7 days line graph) */}
          <div>
            <ChartAreaInteractive />
          </div>

          {/* Sequence Status Composition Pie & Novelty Score Bar Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <ChartPieInteractive
              data={statusPieData}
              title="Sequence Status Composition"
              description="Percentage of sequences by status (all identified sequences)"
              isDarkMode={isDarkMode}
            />
            <ChartBarDefault
              data={noveltyBarData}
              title="Novelty Score"
              description="Counts of sequences in each novelty score range"
              isDarkMode={isDarkMode}
            />
          </div>


          {/* Taxonomy Classification Flow (full width) */}
          <div>
            <ChartTaxonomySankey data={filteredData} isDarkMode={isDarkMode} />
          </div>

          {/* Rainbow Taxonomy Plot & Radar Composition */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <ChartTaxonomyRainbow
              data={taxonomyRainbowData}
              title="Taxonomic Rainbow Plot"
              description="Radial composition of top phyla across all sequences"
              isDarkMode={isDarkMode}
            />
            <ChartRadarDots
              data={taxonomyRadarData}
              title="Taxonomic Composition Plots"
              description="Radar view of top phyla across all sequences"
              isDarkMode={isDarkMode}
            />
          </div>
        </div>

        {/* Data Table */}
        <div className={`mt-8 rounded-xl p-6 ${
          isDarkMode ? 'bg-slate-800/50' : 'bg-white/50'
        } backdrop-blur-md border ${
          isDarkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <h3 className={`text-lg mb-6 font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            Sample Data (First 10 of {filteredData.length} {searchTerm || filterStatus !== 'all' ? 'Filtered ' : ''}Sequences)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`border-b ${
                  isDarkMode ? 'border-slate-700' : 'border-slate-200'
                }`}>
                  <th className={`text-left py-3 px-4 text-sm ${
                    isDarkMode ? 'text-slate-300' : 'text-slate-700'
                  }`}>
                    Sequence ID
                  </th>
                  <th className={`text-left py-3 px-4 text-sm ${
                    isDarkMode ? 'text-slate-300' : 'text-slate-700'
                  }`}>
                    Taxonomy (Last Level)
                  </th>
                  <th className={`text-left py-3 px-4 text-sm ${
                    isDarkMode ? 'text-slate-300' : 'text-slate-700'
                  }`}>
                    Novelty Score
                  </th>
                  <th className={`text-left py-3 px-4 text-sm ${
                    isDarkMode ? 'text-slate-300' : 'text-slate-700'
                  }`}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredData.slice(0, 10).map((row, idx) => {
                  const taxParts = row.Predicted_Taxonomy.split(';');
                  const lastTax = taxParts[taxParts.length - 1]?.split(' ').slice(1).join(' ') || 'Unknown';
                  
                  return (
                    <tr
                      key={idx}
                      className={`border-b ${
                        isDarkMode ? 'border-slate-700 hover:bg-slate-700/30' : 'border-slate-200 hover:bg-slate-100/50'
                      }`}
                    >
                      <td className={`py-3 px-4 font-mono text-sm ${
                        isDarkMode ? 'text-cyan-400' : 'text-blue-600'
                      }`}>
                        {row.Sequence_ID}
                      </td>
                      <td className={`py-3 px-4 text-sm ${
                        isDarkMode ? 'text-slate-300' : 'text-slate-700'
                      }`}>
                        {lastTax.length > 50 ? lastTax.substring(0, 50) + '...' : lastTax}
                      </td>
                      <td className={`py-3 px-4 text-sm ${
                        isDarkMode ? 'text-slate-300' : 'text-slate-700'
                      }`}>
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                          row.Novelty_Score > 0.15
                            ? isDarkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700'
                            : isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                        }`}>
                          {row.Novelty_Score.toFixed(4)}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-sm ${
                        isDarkMode ? 'text-slate-300' : 'text-slate-700'
                      }`}>
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs ${
                          isDarkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {row.Status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
