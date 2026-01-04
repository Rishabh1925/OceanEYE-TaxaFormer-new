// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Globe, MapPin, Layers, Satellite, Navigation, X, Plus, Crosshair, Anchor, Waves, Fish, Compass, RefreshCw } from 'lucide-react';

interface MapPageProps {
  isDarkMode: boolean;
  onNavigate: (page: string) => void;
}

interface UserMarker {
  id: string;
  lat: number;
  lon: number;
  locationName: string; // Where the species was found (e.g., "Pacific Ocean", "Near reef")
  speciesName: string;
  dnaInfo: string;
  timestamp: Date;
}

// Fix for default marker icon issue in Leaflet with bundlers
const fixLeafletIcon = () => {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  });
};

// Inject Leaflet CSS
const injectLeafletCSS = () => {
  if (typeof document === 'undefined') return;
  
  const existingLink = document.getElementById('leaflet-css');
  if (existingLink) return;
  
  const link = document.createElement('link');
  link.id = 'leaflet-css';
  link.rel = 'stylesheet';
  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
  link.integrity = 'sha512-h9FcoyWjHcOcmEVkxOfTLnmZFWIH0iZhZT1H2TbOq55xssQGEJHEaIm+PgoUaZbRvQTNTluNOEfb1ZRy6D3BOw==';
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
};

export default function MapPage({ isDarkMode, onNavigate }: MapPageProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapSectionRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());
  const [activeLayer, setActiveLayer] = useState<'satellite' | 'ocean'>('satellite');
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [userMarkers, setUserMarkers] = useState<UserMarker[]>([]);
  const [realLocations, setRealLocations] = useState<any[]>([]);
  const [hasMetadata, setHasMetadata] = useState(false);
  
  // Icon and color mapping for each location
  const getLocationStyle = (locationName: string) => {
    const styles: Record<string, { icon: any, gradient: string }> = {
      'Pacific Deep Sea': { icon: Compass, gradient: 'linear-gradient(135deg, #0E7490 0%, #164E63 100%)' },
      'Coral Triangle': { icon: Fish, gradient: 'linear-gradient(135deg, #0891B2 0%, #06B6D4 100%)' },
      'Mediterranean Basin': { icon: Globe, gradient: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)' },
      'Great Barrier Reef': { icon: Waves, gradient: 'linear-gradient(135deg, #0284C7 0%, #0891B2 100%)' },
      'Caribbean Sea': { icon: Anchor, gradient: 'linear-gradient(135deg, #0369A1 0%, #0284C7 100%)' },
      'Red Sea': { icon: Satellite, gradient: 'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)' }
    };
    return styles[locationName] || { icon: MapPin, gradient: 'linear-gradient(135deg, #0891B2 0%, #06B6D4 100%)' };
  };
  
  // Load real metadata from analysis results
  const loadRealMetadata = () => {
    try {
      const storedData = localStorage.getItem('analysisResults');
      if (!storedData) {
        setHasMetadata(false);
        return;
      }

      const analysisResults = JSON.parse(storedData);
      const metadata = analysisResults.metadata;

      // Check if user provided location metadata
      if (metadata && metadata.userMetadata) {
        const userMeta = metadata.userMetadata;
        
        // Handle nested structure from UploadPage
        const lat = parseFloat(userMeta.location?.latitude || userMeta.latitude);
        const lon = parseFloat(userMeta.location?.longitude || userMeta.longitude);
        
        if (!isNaN(lat) && !isNaN(lon)) {
          const realLocation = {
            id: 1,
            name: userMeta.sampleId || userMeta.location?.site || 'User Sample Location',
            lat: lat,
            lon: lon,
            samples: metadata.totalSequences || 0,
            diversity: metadata.novelSequences > 10 ? 'High' : metadata.novelSequences > 5 ? 'Medium' : 'Low',
            depth: parseFloat(userMeta.location?.depth) || 0,
            temperature: parseFloat(userMeta.environmental?.temperature) || null,
            ph: parseFloat(userMeta.environmental?.pH) || null,
            salinity: parseFloat(userMeta.environmental?.salinity) || null,
            collectionDate: userMeta.datetime?.date || null,
            researcher: userMeta.researcherName || null,
            institution: userMeta.institution || null
          };
          
          setRealLocations([realLocation]);
          setHasMetadata(true);
          console.log('Real metadata loaded for map:', realLocation);
          return;
        }
      }
      
      setHasMetadata(false);
    } catch (error) {
      console.error('Error loading metadata:', error);
      setHasMetadata(false);
    }
  };

  // Fallback sample locations (used when no real metadata)
  const sampleLocations = [
    { id: 1, name: 'Pacific Deep Sea', lat: 35.6, lon: -125.3, samples: 142, diversity: 'High', depth: 4200 },
    { id: 2, name: 'Coral Triangle', lat: -5.5, lon: 122.8, samples: 198, diversity: 'Very High', depth: 850 },
    { id: 3, name: 'Mediterranean Basin', lat: 36.2, lon: 14.5, samples: 87, diversity: 'Medium', depth: 1200 },
    { id: 4, name: 'Great Barrier Reef', lat: -18.2, lon: 147.7, samples: 234, diversity: 'Very High', depth: 320 },
    { id: 5, name: 'Caribbean Sea', lat: 18.5, lon: -78.3, samples: 156, diversity: 'High', depth: 2100 },
    { id: 6, name: 'Red Sea', lat: 22.0, lon: 38.5, samples: 103, diversity: 'High', depth: 1800 },
  ];

  // Use real locations if available, otherwise use sample locations
  const displayLocations = hasMetadata ? realLocations : sampleLocations;

  // Generate species data from real analysis results
  const getSpeciesData = () => {
    try {
      const storedData = localStorage.getItem('analysisResults');
      if (!storedData) return null;

      const analysisResults = JSON.parse(storedData);
      const sequences = analysisResults.sequences || [];
      const taxonomySummary = analysisResults.taxonomy_summary || [];

      if (sequences.length === 0) return null;

      // Extract top species from sequences
      const speciesCount: Record<string, { count: number; phylum: string; location: string }> = {};
      
      sequences.forEach((seq: any) => {
        if (seq.taxonomy) {
          // Extract species name from taxonomy string
          const taxonomyParts = seq.taxonomy.split(';');
          const species = taxonomyParts[taxonomyParts.length - 1]?.trim() || 'Unknown species';
          const phylum = taxonomyParts[0]?.trim() || 'Unknown';
          
          if (!speciesCount[species]) {
            speciesCount[species] = { 
              count: 0, 
              phylum: phylum,
              location: hasMetadata && realLocations.length > 0 ? realLocations[0].name : 'Sample Location'
            };
          }
          speciesCount[species].count++;
        }
      });

      // Convert to array and sort by count
      const sortedSpecies = Object.entries(speciesCount)
        .map(([species, data]) => ({
          species: species,
          count: data.count,
          phylum: data.phylum,
          location: data.location
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6); // Top 6 species

      return sortedSpecies;
    } catch (error) {
      console.error('Error generating species data:', error);
      return null;
    }
  };

  const realSpeciesData = getSpeciesData();

  // Fallback species data when no real analysis is available
  const fallbackSpeciesData = [
    { location: 'Great Barrier Reef', species: 'Acropora cervicornis', count: 234, phylum: 'Cnidaria' },
    { location: 'Coral Triangle', species: 'Tridacna gigas', count: 198, phylum: 'Mollusca' },
    { location: 'Caribbean Sea', species: 'Octopus vulgaris', count: 156, phylum: 'Mollusca' },
    { location: 'Pacific Deep Sea', species: 'Bathynomus giganteus', count: 142, phylum: 'Arthropoda' },
    { location: 'Red Sea', species: 'Acanthurus sohal', count: 103, phylum: 'Chordata' },
    { location: 'Mediterranean Basin', species: 'Posidonia oceanica', count: 87, phylum: 'Tracheophyta' }
  ];

  const displaySpeciesData = realSpeciesData || fallbackSpeciesData;

  // Function to get color based on depth
  const getDepthColor = (depth: number) => {
    if (depth < 500) {
      return { gradient: 'linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%)', border: '#06b6d4', label: 'Shallow', rgb: '6, 182, 212' }; // Bright cyan
    } else if (depth < 1500) {
      return { gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: '#2563eb', label: 'Medium Shallow', rgb: '37, 99, 235' }; // Vibrant blue
    } else if (depth < 3000) {
      return { gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', border: '#7c3aed', label: 'Medium', rgb: '124, 58, 237' }; // Purple
    } else if (depth < 5000) {
      return { gradient: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)', border: '#db2777', label: 'Deep', rgb: '219, 39, 119' }; // Magenta/Pink
    } else {
      return { gradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', border: '#ea580c', label: 'Very Deep', rgb: '234, 88, 12' }; // Orange-red
    }
  };
  
  const featureCards = [
    {
      title: 'DNA Sequencing',
      icon: X,
      description: 'Advanced eDNA extraction and sequencing from environmental samples',
      stats: [
        { label: 'Sequences', value: '1.2M+' },
        { label: 'Accuracy', value: '99.8%' },
        { label: 'Processing', value: '< 24h' }
      ],
      color: 'from-cyan-500 to-blue-600'
    },
    {
      title: 'Ocean Mapping',
      icon: Crosshair,
      description: 'Real-time biodiversity mapping across global marine ecosystems',
      stats: [
        { label: 'Locations', value: '47' },
        { label: 'Coverage', value: '2.3M km²' },
        { label: 'Depth', value: '0-6000m' }
      ],
      color: 'from-blue-500 to-indigo-600'
    },
    {
      title: 'Species Detection',
      icon: Plus,
      description: 'AI-powered taxonomic classification using Nucleotide Transformer',
      stats: [
        { label: 'Species', value: '1,284' },
        { label: 'Phyla', value: '23' },
        { label: 'Database', value: 'PR2+SILVA' }
      ],
      color: 'from-indigo-500 to-purple-600'
    },
    {
      title: 'Analysis Tools',
      icon: X,
      description: 'Comprehensive biodiversity analysis and pattern recognition',
      stats: [
        { label: 'Samples', value: '661' },
        { label: 'Countries', value: '23' },
        { label: 'Projects', value: '18' }
      ],
      color: 'from-purple-500 to-pink-600'
    }
  ];

  // Separate useEffect for metadata loading
  useEffect(() => {
    // Load real metadata from localStorage
    loadRealMetadata();
    
    // Listen for localStorage changes to update data dynamically
    const handleStorageChange = () => {
      loadRealMetadata();
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Also check for changes when the component becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadRealMetadata();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Separate useEffect for map initialization
  useEffect(() => {
    // Inject Leaflet CSS
    injectLeafletCSS();
    
    // Add custom popup styles with glassmorphism - Taxaformer theme
    const style = document.createElement('style');
    style.textContent = `
      .leaflet-popup-content-wrapper {
        background: rgba(255, 255, 255, 0.18) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
        border-radius: 18px !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25), 0 0 30px rgba(40, 199, 225, 0.15) !important;
        border: 1px solid rgba(255, 255, 255, 0.25) !important;
        padding: 0 !important;
        transition: all 0.15s ease;
      }
      .leaflet-popup-content-wrapper:hover {
        transform: scale(1.02);
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3), 0 0 40px rgba(40, 199, 225, 0.25) !important;
      }
      .leaflet-popup-tip {
        background: rgba(255, 255, 255, 0.18) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
      }
      .leaflet-popup-content {
        margin: 0 !important;
      }
      .leaflet-container {
        background: #0B1C2E !important;
      }
      .leaflet-tile-pane {
        opacity: 1 !important;
      }
      .marker-pulse {
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }
      @keyframes pulse {
        0%, 100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.8;
          transform: scale(1.05);
        }
      }
      @keyframes fadeInScale {
        from {
          opacity: 0;
          transform: scale(0.95);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
      .leaflet-popup {
        animation: fadeInScale 0.15s ease-out;
      }
      .leaflet-control-zoom {
        border: none !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25) !important;
      }
      .leaflet-control-zoom a {
        background: rgba(255, 255, 255, 0.18) !important;
        backdrop-filter: blur(12px) !important;
        color: #FFFFFF !important;
        border: 1px solid rgba(255, 255, 255, 0.25) !important;
        transition: all 0.2s ease;
      }
      .leaflet-control-zoom a:hover {
        background: rgba(40, 199, 225, 0.25) !important;
        border-color: #28C7E1 !important;
        box-shadow: 0 0 15px rgba(40, 199, 225, 0.4) !important;
      }
      
      @keyframes shimmer {
        0% {
          background-position: -1000px 0;
        }
        100% {
          background-position: 1000px 0;
        }
      }
      
      @keyframes progressFill {
        from {
          width: 0;
        }
      }
      
      @keyframes float {
        0%, 100% {
          transform: translateY(0px);
        }
        50% {
          transform: translateY(-4px);
        }
      }
      
      .underwater-shimmer {
        position: relative;
        overflow: hidden;
      }
      
      .underwater-shimmer::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0) 0%,
          rgba(40, 199, 225, 0.1) 50%,
          rgba(255, 255, 255, 0) 100%
        );
        background-size: 1000px 100%;
        animation: shimmer 8s infinite linear;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
    
    if (!mapContainerRef.current || mapRef.current) return;

    // Fix marker icons
    fixLeafletIcon();

    // Set max bounds to prevent showing empty world edges
    const southWest = L.latLng(-85, -180);
    const northEast = L.latLng(85, 180);
    const bounds = L.latLngBounds(southWest, northEast);

    // Initialize map with default global view
    const initialCenter = [20, 0] as [number, number];
    const initialZoom = 2.5;

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: true,
      attributionControl: true,
      maxBounds: bounds,
      maxBoundsViscosity: 1.0,
      worldCopyJump: false,
    });

    mapRef.current = map;

    // Add satellite tile layer
    const satelliteLayer = L.tileLayer(
      `https://api.maptiler.com/maps/satellite/{z}/{x}/{y}.jpg?key=QsZKOKkMJ38YEDyWChsA`,
      {
        tileSize: 512,
        zoomOffset: -1,
        minZoom: 1,
        maxZoom: 18,
        attribution: '&copy; <a href=\"https://www.maptiler.com/copyright/\" target=\"_blank\">MapTiler</a> &copy; <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\">OpenStreetMap contributors</a>',
        crossOrigin: true,
      }
    ).addTo(map);

    // Add markers for each location and store references
    displayLocations.forEach((location) => {
      // Get depth-based color for this location
      const depthColor = getDepthColor(location.depth);
      
      // Custom marker icon for biodiversity samples - depth colored
      const biodiversityIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="
          background: ${depthColor.gradient};
          width: 30px;
          height: 30px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          border: 3px solid ${depthColor.border};
          box-shadow: 0 4px 12px rgba(0,0,0,0.3), 0 0 20px ${depthColor.border}80;
        "></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      });
      
      const marker = L.marker([location.lat, location.lon], {
        icon: biodiversityIcon,
      }).addTo(map);

      // Store marker reference
      markersRef.current.set(location.id, marker);

      // Create improved glassmorphism popup content with real metadata
      const popupContent = `
        <div style="
          font-family: system-ui;
          min-width: 240px;
          padding: 18px;
          background: transparent;
        ">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.15);">
            <div style="
              width: 8px;
              height: 8px;
              border-radius: 50%;
              background: ${depthColor.border};
              box-shadow: 0 0 12px ${depthColor.border};
            "></div>
            <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #000000; letter-spacing: 0.3px;">
              ${location.name}
            </h3>
          </div>
          
          <div style="margin-bottom: 12px;">
            <div style="font-size: 11px; color: rgba(0, 0, 0, 0.6); margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px;">
              Coordinates
            </div>
            <div style="font-family: 'Courier New', monospace; font-size: 13px; color: #28C7E1; font-weight: 600;">
              ${location.lat.toFixed(4)}° N, ${location.lon.toFixed(4)}° E
            </div>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
            <div style="padding: 10px; background: rgba(255, 255, 255, 0.08); border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.12);">
              <div style="font-size: 10px; color: rgba(0, 0, 0, 0.6); margin-bottom: 4px; text-transform: uppercase;">Sequences</div>
              <div style="font-size: 20px; font-weight: 700; color: #000000;">${location.samples}</div>
            </div>
            <div style="padding: 10px; background: rgba(255, 255, 255, 0.08); border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.12);">
              <div style="font-size: 10px; color: rgba(0, 0, 0, 0.6); margin-bottom: 4px; text-transform: uppercase;">Depth</div>
              <div style="font-size: 20px; font-weight: 700; color: #000000;">${location.depth}m</div>
            </div>
          </div>
          
          ${hasMetadata && location.temperature !== null ? `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
            <div style="padding: 8px; background: rgba(255, 255, 255, 0.08); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.12);">
              <div style="font-size: 9px; color: rgba(0, 0, 0, 0.6); margin-bottom: 2px; text-transform: uppercase;">Temperature</div>
              <div style="font-size: 14px; font-weight: 600; color: #000000;">${location.temperature}°C</div>
            </div>
            ${location.ph !== null ? `
            <div style="padding: 8px; background: rgba(255, 255, 255, 0.08); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.12);">
              <div style="font-size: 9px; color: rgba(0, 0, 0, 0.6); margin-bottom: 2px; text-transform: uppercase;">pH Level</div>
              <div style="font-size: 14px; font-weight: 600; color: #000000;">${location.ph}</div>
            </div>
            ` : ''}
          </div>
          ` : ''}
          
          ${hasMetadata && location.salinity !== null ? `
          <div style="margin-bottom: 12px;">
            <div style="padding: 8px; background: rgba(255, 255, 255, 0.08); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.12); display: inline-block;">
              <div style="font-size: 9px; color: rgba(0, 0, 0, 0.6); margin-bottom: 2px; text-transform: uppercase;">Salinity</div>
              <div style="font-size: 14px; font-weight: 600; color: #000000;">${location.salinity} ppt</div>
            </div>
          </div>
          ` : ''}
          
          ${hasMetadata && location.researcher ? `
          <div style="margin-bottom: 8px; padding: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 8px;">
            <div style="font-size: 9px; color: rgba(0, 0, 0, 0.6); margin-bottom: 2px; text-transform: uppercase;">Researcher</div>
            <div style="font-size: 12px; color: #000000;">${location.researcher}</div>
            ${location.institution ? `<div style="font-size: 10px; color: rgba(0, 0, 0, 0.7);">${location.institution}</div>` : ''}
          </div>
          ` : ''}
          
          ${hasMetadata && location.collectionDate ? `
          <div style="margin-bottom: 12px; padding: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 8px;">
            <div style="font-size: 9px; color: rgba(0, 0, 0, 0.6); margin-bottom: 2px; text-transform: uppercase;">Collection Date</div>
            <div style="font-size: 12px; color: #000000;">${new Date(location.collectionDate).toLocaleDateString()}</div>
          </div>
          ` : ''}
          
          <div style="margin-bottom: 12px;">
            <div style="
              display: inline-flex;
              align-items: center;
              justify-content: center;
              padding: 6px 12px;
              border-radius: 12px;
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              background: rgba(${depthColor.rgb}, 0.2);
              color: ${depthColor.border};
              border: 1px solid ${depthColor.border}40;
              box-shadow: 0 0 8px ${depthColor.border}40;
            ">
              ${depthColor.label} Water
            </div>
          </div>
          
          <div style="
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 5px 10px;
            border-radius: 12px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            ${
              location.diversity === 'Very High'
                ? 'background: rgba(34, 197, 94, 0.2); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.4); box-shadow: 0 0 8px rgba(34, 197, 94, 0.3);'
                : location.diversity === 'High'
                ? 'background: rgba(40, 199, 225, 0.2); color: #28C7E1; border: 1px solid rgba(40, 199, 225, 0.4); box-shadow: 0 0 8px rgba(40, 199, 225, 0.3);'
                : 'background: rgba(234, 179, 8, 0.2); color: #eab308; border: 1px solid rgba(234, 179, 8, 0.4); box-shadow: 0 0 8px rgba(234, 179, 8, 0.3);'
            }
          ">
            ${location.diversity} Biodiversity
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'custom-popup'
      });

      // Add hover effect
      marker.on('mouseover', function (this: any) {
        this.openPopup();
      });
    });

    // Add circle overlays to show sample coverage areas
    displayLocations.forEach((location) => {
      L.circle([location.lat, location.lon], {
        color: '#06b6d4',
        fillColor: '#06b6d4',
        fillOpacity: 0.1,
        radius: 500000, // 500km radius
        weight: 2,
      }).addTo(map);
    });

    setIsMapLoaded(true);

    // Cleanup
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // Empty dependency array - map should only initialize once

  // Separate useEffect to update map view when metadata changes
  useEffect(() => {
    if (mapRef.current && hasMetadata && realLocations.length > 0) {
      // Fly to user's location when real metadata is loaded
      const userLocation = realLocations[0];
      mapRef.current.flyTo([userLocation.lat, userLocation.lon], 6, {
        duration: 1.5,
        easeLinearity: 0.25
      });
    }
  }, [hasMetadata, realLocations]);

  const handleLayerChange = (layer: 'satellite' | 'ocean') => {
    setActiveLayer(layer);
    
    if (mapRef.current) {
      mapRef.current.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) {
          mapRef.current?.removeLayer(layer);
        }
      });

      const tileUrl = layer === 'satellite'
        ? `https://api.maptiler.com/maps/satellite/{z}/{x}/{y}.jpg?key=QsZKOKkMJ38YEDyWChsA`
        : `https://api.maptiler.com/maps/ocean/{z}/{x}/{y}.png?key=QsZKOKkMJ38YEDyWChsA`;

      L.tileLayer(tileUrl, {
        tileSize: 512,
        zoomOffset: -1,
        minZoom: 1,
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        crossOrigin: true,
      }).addTo(mapRef.current);
    }
  };

  const flyToLocation = (lat: number, lon: number) => {
    // Find the location ID from coordinates
    const location = displayLocations.find(loc => loc.lat === lat && loc.lon === lon);
    
    // Scroll to map section
    if (mapSectionRef.current) {
      mapSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    // Fly to location on map and open popup after a short delay
    setTimeout(() => {
      if (mapRef.current && location) {
        // First fly to the location with smooth animation
        mapRef.current.flyTo([lat, lon], 8, {
          duration: 0.5,
          easeLinearity: 0.25
        });
        
        // Then open the popup after the flight animation
        setTimeout(() => {
          const marker = markersRef.current.get(location.id);
          if (marker) {
            marker.openPopup();
          }
        }, 600);
      }
    }, 500);
  };



  const addUserMarker = (lat: number, lon: number) => {
    const newMarker: UserMarker = {
      id: Date.now().toString(),
      lat,
      lon,
      locationName: 'Unknown Location', // Add a default location name
      speciesName: 'Unknown',
      dnaInfo: 'N/A',
      timestamp: new Date(),
    };

    setUserMarkers([...userMarkers, newMarker]);

    const marker = L.marker([lat, lon], {
      icon: L.icon({
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        shadowSize: [41, 41],
        shadowAnchor: [12, 41],
      }),
    }).addTo(mapRef.current!);

    marker.bindPopup(`
      <div style="font-family: system-ui; min-width: 200px;">
        <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #1e293b;">
          User Marker
        </h3>
        <div style="font-size: 14px; color: #475569; margin-bottom: 4px;">
          <strong>Coordinates:</strong> ${lat.toFixed(2)}°, ${lon.toFixed(2)}°
        </div>
        <div style="font-size: 14px; color: #475569; margin-bottom: 4px;">
          <strong>Species:</strong> ${newMarker.speciesName}
        </div>
        <div style="font-size: 14px; color: #475569; margin-bottom: 4px;">
          <strong>DNA Info:</strong> ${newMarker.dnaInfo}
        </div>
        <div style="font-size: 14px; color: #475569; margin-bottom: 4px;">
          <strong>Timestamp:</strong> ${newMarker.timestamp.toLocaleString()}
        </div>
        <button
          onClick={() => removeUserMarker(newMarker.id)}
          className="px-3 py-1.5 rounded-lg text-sm transition-all bg-red-500 text-white"
        >
          <X className="w-4 h-4" />
          Remove
        </button>
      </div>
    `);

    marker.on('mouseover', function () {
      this.openPopup();
    });
  };

  const removeUserMarker = (id: string) => {
    setUserMarkers(userMarkers.filter(marker => marker.id !== id));
    if (mapRef.current) {
      mapRef.current.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
          const marker = layer as L.Marker;
          const popupContent = marker.getPopup()?.getContent() as string;
          if (popupContent.includes(id)) {
            mapRef.current?.removeLayer(marker);
          }
        }
      });
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-full mx-auto">
        {/* Page Header */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-6">
          <h1 className={`text-3xl md:text-4xl mb-3 font-bold ${
            isDarkMode ? 'text-white' : 'text-slate-900'
          }`} style={{ letterSpacing: '-0.5px' }}>
            Global Biodiversity Map
          </h1>
          <p className={`text-base ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} style={{ letterSpacing: '0.2px' }}>
            Real-time visualization of eDNA samples and biodiversity patterns across the globe
          </p>
        </div>

        {/* Map Container with Border */}
        <div ref={mapSectionRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <div className={`rounded-2xl overflow-hidden border-4 ${
            isDarkMode 
              ? 'border-cyan-500/30 shadow-2xl shadow-cyan-500/20' 
              : 'border-blue-400/30 shadow-2xl shadow-blue-400/20'
          } relative`}>
            {/* Leaflet Map */}
            <div 
              ref={mapContainerRef}
              className="w-full h-[600px] md:h-[700px]"
              style={{ background: isDarkMode ? '#1e293b' : '#f1f5f9' }}
            />

            {/* Map Legend - Bottom Left - Darker Glassmorphism */}
            <div style={{
              position: 'absolute',
              bottom: '24px',
              left: '24px',
              zIndex: 1000,
              background: isDarkMode 
                ? 'rgba(15, 23, 42, 0.85)' 
                : 'rgba(30, 41, 59, 0.85)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderRadius: '12px',
              padding: '18px 20px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              transition: 'all 0.3s ease',
              minWidth: '220px'
            }}>
              <h4 style={{ 
                margin: '0 0 16px 0', 
                fontSize: '12px', 
                fontWeight: '600', 
                color: 'rgba(255, 255, 255, 0.6)',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                Legend
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50% 50% 50% 0',
                    transform: 'rotate(-45deg)',
                    background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                    border: '1.5px solid rgba(6, 182, 212, 0.5)',
                    boxShadow: '0 0 16px rgba(6, 182, 212, 0.6), inset 0 1px 2px rgba(255, 255, 255, 0.2)'
                  }}></div>
                  <span style={{ 
                    fontSize: '13px', 
                    color: 'rgba(255, 255, 255, 0.95)', 
                    fontWeight: '500',
                    letterSpacing: '0.2px'
                  }}>Sample Sites</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    border: '2px solid #06b6d4',
                    background: 'rgba(6, 182, 212, 0.15)',
                    boxShadow: '0 0 12px rgba(6, 182, 212, 0.4)'
                  }}></div>
                  <span style={{ 
                    fontSize: '13px', 
                    color: 'rgba(255, 255, 255, 0.95)', 
                    fontWeight: '500',
                    letterSpacing: '0.2px'
                  }}>Coverage Area</span>
                </div>
              </div>
            </div>

            {/* Depth Legend - Bottom Right */}
            <div style={{
              position: 'absolute',
              bottom: '24px',
              right: '24px',
              zIndex: 1000,
              background: isDarkMode 
                ? 'rgba(15, 23, 42, 0.85)' 
                : 'rgba(30, 41, 59, 0.85)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderRadius: '12px',
              padding: '18px 20px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              transition: 'all 0.3s ease',
              minWidth: '200px'
            }}>
              <h4 style={{ 
                margin: '0 0 14px 0', 
                fontSize: '12px', 
                fontWeight: '600', 
                color: 'rgba(255, 255, 255, 0.6)',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                Water Depth
              </h4>
              
              {/* Depth Gradient Bar */}
              <div style={{
                height: '12px',
                borderRadius: '8px',
                background: 'linear-gradient(90deg, #22d3ee 0%, #3b82f6 20%, #8b5cf6 40%, #ec4899 70%, #f97316 100%)',
                marginBottom: '16px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.1)'
              }}></div>
              
              {/* Depth Labels */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { label: 'Shallow', range: '< 500m', color: '#22d3ee' },
                  { label: 'Medium Shallow', range: '500-1500m', color: '#3b82f6' },
                  { label: 'Medium', range: '1500-3000m', color: '#8b5cf6' },
                  { label: 'Deep', range: '3000-5000m', color: '#ec4899' },
                  { label: 'Very Deep', range: '> 5000m', color: '#f97316' }
                ].map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '3px',
                      background: item.color,
                      boxShadow: `0 0 10px ${item.color}60`,
                      border: '1px solid rgba(255, 255, 255, 0.2)'
                    }}></div>
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ 
                        fontSize: '11px', 
                        color: 'rgba(255, 255, 255, 0.9)', 
                        fontWeight: '500',
                        letterSpacing: '0.2px'
                      }}>{item.label}</span>
                      <span style={{ 
                        fontSize: '10px', 
                        color: 'rgba(255, 255, 255, 0.6)', 
                        fontFamily: "'Courier New', monospace",
                        fontWeight: '600'
                      }}>{item.range}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Depth Heat Map Toggle - Top Right */}
            <div style={{
              position: 'absolute',
              top: '24px',
              right: '24px',
              zIndex: 1000,
            }}>
              <button
                onClick={() => handleLayerChange(activeLayer === 'ocean' ? 'satellite' : 'ocean')}
                style={{
                  background: activeLayer === 'ocean'
                    ? 'linear-gradient(135deg, #0891B2 0%, #06B6D4 100%)'
                    : isDarkMode 
                      ? 'rgba(15, 23, 42, 0.85)' 
                      : 'rgba(30, 41, 59, 0.85)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  borderRadius: '10px',
                  padding: '12px 20px',
                  boxShadow: activeLayer === 'ocean'
                    ? '0 8px 32px rgba(8, 145, 178, 0.5), 0 0 20px rgba(6, 182, 212, 0.4)' 
                    : '0 8px 32px rgba(0, 0, 0, 0.4)',
                  border: activeLayer === 'ocean'
                    ? '1px solid rgba(6, 182, 212, 0.5)' 
                    : '1px solid rgba(148, 163, 184, 0.2)',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  fontWeight: '600',
                  letterSpacing: '0.3px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => {
                  if (activeLayer !== 'ocean') {
                    e.currentTarget.style.background = 'rgba(15, 23, 42, 0.95)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.5)';
                  } else {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeLayer !== 'ocean') {
                    e.currentTarget.style.background = isDarkMode 
                      ? 'rgba(15, 23, 42, 0.85)' 
                      : 'rgba(30, 41, 59, 0.85)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4)';
                  } else {
                    e.currentTarget.style.transform = 'translateY(0)';
                  }
                }}
              >
                <Layers style={{ width: '18px', height: '18px' }} />
                {activeLayer === 'ocean' ? 'Hide Depth Heat Map' : 'Show Depth Heat Map'}
              </button>
            </div>
          </div>
        </div>

        {/* Detailed Comparison Sections Below Map */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Section Header */}
          <div className="mb-8">
            <h2 className={`text-2xl md:text-3xl mb-3 font-bold ${
              isDarkMode ? 'text-white' : 'text-slate-900'
            }`} style={{ letterSpacing: '-0.5px' }}>
              Location-Based Analysis
            </h2>
            <p className={`text-base ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} style={{ letterSpacing: '0.2px' }}>
              Detailed comparison of biodiversity data across sampling locations
            </p>
          </div>

          {/* No Metadata Message */}
          {!hasMetadata && (
            <div className={`mb-8 p-6 rounded-xl border-2 border-dashed ${
              isDarkMode ? 'border-slate-600 bg-slate-800/30' : 'border-slate-300 bg-slate-100/50'
            } text-center`}>
              <MapPin className={`w-12 h-12 mx-auto mb-4 ${
                isDarkMode ? 'text-slate-400' : 'text-slate-500'
              }`} />
              <h3 className={`text-lg font-semibold mb-2 ${
                isDarkMode ? 'text-white' : 'text-slate-900'
              }`}>
                No Location Data Available
              </h3>
              <p className={`mb-4 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                To see your sample locations on the map, please provide metadata (latitude, longitude) when uploading files.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => onNavigate('upload')}
                  className={`px-6 py-2 rounded-lg transition-colors ${
                    isDarkMode
                      ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  Upload with Metadata
                </button>
                <button
                  onClick={loadRealMetadata}
                  className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                    isDarkMode
                      ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                      : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                  }`}
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>
            </div>
          )}

          {/* Data Status Messages */}
          {hasMetadata && realSpeciesData ? (
            <div className={`mb-8 p-4 rounded-lg ${
              isDarkMode ? 'bg-green-900/20 border border-green-700' : 'bg-green-100 border border-green-300'
            }`}>
              <div className="flex items-center gap-3">
                <MapPin className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                <span className={`font-medium ${isDarkMode ? 'text-green-400' : 'text-green-700'}`}>
                  Showing your real analysis data and sample location from uploaded file
                </span>
              </div>
            </div>
          ) : hasMetadata && !realSpeciesData ? (
            <div className={`mb-8 p-4 rounded-lg ${
              isDarkMode ? 'bg-blue-900/20 border border-blue-700' : 'bg-blue-100 border border-blue-300'
            }`}>
              <div className="flex items-center gap-3">
                <MapPin className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                <span className={`font-medium ${isDarkMode ? 'text-blue-400' : 'text-blue-700'}`}>
                  Showing your real sample location with example species data
                </span>
              </div>
            </div>
          ) : (
            <div className={`mb-8 p-4 rounded-lg ${
              isDarkMode ? 'bg-slate-700/50 border border-slate-600' : 'bg-slate-100 border border-slate-300'
            }`}>
              <div className="flex items-center gap-3">
                <Globe className={`w-5 h-5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                <span className={`font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  Showing example locations and species data - upload a file to see your real data
                </span>
              </div>
            </div>
          )}

          {/* Location Comparison Grid - Microsoft Style */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
            {displayLocations.map((location, index) => (
              <div
                key={location.id}
                style={{
                  background: isDarkMode
                    ? 'rgba(15, 23, 42, 0.95)'
                    : 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  borderRadius: '12px',
                  padding: '32px',
                  border: isDarkMode 
                    ? '1px solid rgba(148, 163, 184, 0.08)' 
                    : '1px solid rgba(226, 232, 240, 0.6)',
                  boxShadow: isDarkMode
                    ? '0 2px 8px rgba(0, 0, 0, 0.2)'
                    : '0 2px 8px rgba(0, 0, 0, 0.06)',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = isDarkMode
                    ? '0 8px 24px rgba(0, 0, 0, 0.3)'
                    : '0 8px 24px rgba(0, 0, 0, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = isDarkMode
                    ? '0 2px 8px rgba(0, 0, 0, 0.2)'
                    : '0 2px 8px rgba(0, 0, 0, 0.06)';
                }}
              >

                {/* Location Title - Clean and simple */}
                <h3 
                  style={{
                    fontSize: '22px',
                    fontWeight: '600',
                    color: isDarkMode ? '#F1F5F9' : '#0F172A',
                    letterSpacing: '-0.3px',
                    lineHeight: '1.3',
                    marginBottom: '12px'
                  }}
                >
                  {location.name}
                </h3>

                {/* Coordinates subtitle */}
                <div style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: '13px',
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(100, 116, 139, 0.8)',
                  marginBottom: '24px',
                  fontWeight: '500'
                }}>
                  {location.lat.toFixed(4)}°, {location.lon.toFixed(4)}°
                </div>

                {/* Stats Grid - Microsoft style */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '24px',
                  marginBottom: '24px'
                }}>
                  {/* Samples */}
                  <div>
                    <div style={{
                      fontSize: '32px',
                      fontWeight: '600',
                      color: isDarkMode ? '#F1F5F9' : '#0F172A',
                      lineHeight: '1.2',
                      marginBottom: '6px',
                      letterSpacing: '-1px'
                    }}>
                      {location.samples}
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(100, 116, 139, 0.9)',
                      letterSpacing: '0.2px',
                      lineHeight: '1.4'
                    }}>
                      DNA samples
                    </div>
                  </div>

                  {/* Depth */}
                  <div>
                    <div style={{
                      fontSize: '32px',
                      fontWeight: '600',
                      color: isDarkMode ? '#F1F5F9' : '#0F172A',
                      lineHeight: '1.2',
                      marginBottom: '6px',
                      letterSpacing: '-1px'
                    }}>
                      {Math.floor((location.samples / 234) * 3000) + 500}m
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(100, 116, 139, 0.9)',
                      letterSpacing: '0.2px',
                      lineHeight: '1.4'
                    }}>
                      Average depth
                    </div>
                  </div>
                </div>

                {/* Diversity Badge */}
                <div style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600',
                  letterSpacing: '0.3px',
                  display: 'inline-block',
                  marginBottom: '24px',
                  ...(location.diversity === 'Very High'
                    ? {
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: '#10B981'
                      }
                    : location.diversity === 'High'
                    ? {
                        background: 'rgba(8, 145, 178, 0.12)',
                        color: '#0891B2'
                      }
                    : {
                        background: 'rgba(245, 158, 11, 0.12)',
                        color: '#F59E0B'
                      })
                }}>
                  {location.diversity} biodiversity
                </div>

                {/* Action Button - Microsoft style with arrow */}
                <button
                  onClick={() => flyToLocation(location.lat, location.lon)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '6px',
                    background: '#0891B2',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    fontWeight: '600',
                    letterSpacing: '0.2px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#0E7490';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#0891B2';
                  }}
                >
                  View on map
                  <Navigation style={{ width: '16px', height: '16px' }} />
                </button>
              </div>
            ))}
          </div>

          {/* Temporal Analysis */}
          <div className={`rounded-2xl p-6 md:p-8 mb-12 border-2 ${
            isDarkMode 
              ? 'bg-slate-800/50 border-cyan-500/20 shadow-lg shadow-cyan-500/10' 
              : 'bg-white/50 border-blue-400/20 shadow-lg shadow-blue-400/10'
          } backdrop-blur-md`}>
            <div className="mb-6">
              <h3 className={`text-2xl md:text-3xl mb-2 font-bold ${
                isDarkMode ? 'text-white' : 'text-slate-900'
              }`} style={{ letterSpacing: '-0.5px' }}>
                Temporal Analysis
              </h3>
              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} style={{ letterSpacing: '0.2px' }}>
                Quarterly sample collection trends for 2024
              </p>
            </div>
            
            <div className="grid md:grid-cols-4 gap-4">
              {[
                { period: 'Jan-Mar 2024', samples: 178, trend: '+12%', growth: true },
                { period: 'Apr-Jun 2024', samples: 194, trend: '+9%', growth: true },
                { period: 'Jul-Sep 2024', samples: 156, trend: '-19%', growth: false },
                { period: 'Oct-Dec 2024', samples: 133, trend: '-14%', growth: false }
              ].map((period, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl p-5 border ${
                    isDarkMode 
                      ? 'bg-slate-700/50 border-slate-600' 
                      : 'bg-slate-100/50 border-slate-200'
                  }`}
                >
                  <div className={`text-xs mb-3 font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    {period.period}
                  </div>
                  <div className={`text-3xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    {period.samples}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`text-sm font-bold px-2 py-1 rounded-lg ${
                      period.growth 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {period.trend}
                    </div>
                    <span className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                      vs prev quarter
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Species Distribution - Microsoft Style */}
          <div 
            style={{
              background: isDarkMode
                ? 'rgba(15, 23, 42, 0.95)'
                : 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderRadius: '12px',
              padding: '32px 36px',
              border: isDarkMode 
                ? '1px solid rgba(148, 163, 184, 0.08)' 
                : '1px solid rgba(226, 232, 240, 0.6)',
              boxShadow: isDarkMode
                ? '0 2px 8px rgba(0, 0, 0, 0.2)'
                : '0 2px 8px rgba(0, 0, 0, 0.06)'
            }}
          >

            <div style={{ marginBottom: '32px' }}>
              <h3 style={{
                fontSize: '28px',
                fontWeight: '600',
                color: isDarkMode ? '#F1F5F9' : '#0F172A',
                letterSpacing: '-0.5px',
                marginBottom: '8px',
                lineHeight: '1.2'
              }}>
                {realSpeciesData ? 'Top Species from Your Analysis' : 'Top Species by Location'}
              </h3>
              <p style={{
                fontSize: '14px',
                color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(100, 116, 139, 0.9)',
                letterSpacing: '0.2px',
                lineHeight: '1.5'
              }}>
                {realSpeciesData 
                  ? 'Most abundant species detected in your uploaded sample' 
                  : 'Most abundant species detected across sample sites'}
              </p>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {displaySpeciesData.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: isDarkMode ? 'rgba(30, 41, 59, 0.4)' : 'rgba(248, 250, 252, 0.7)',
                    borderRadius: '10px',
                    padding: '20px 24px',
                    border: isDarkMode ? '1px solid rgba(148, 163, 184, 0.08)' : '1px solid rgba(226, 232, 240, 0.5)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateX(4px)';
                    e.currentTarget.style.border = isDarkMode ? '1px solid rgba(8, 145, 178, 0.3)' : '1px solid rgba(8, 145, 178, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateX(0)';
                    e.currentTarget.style.border = isDarkMode ? '1px solid rgba(148, 163, 184, 0.08)' : '1px solid rgba(226, 232, 240, 0.5)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{
                        fontSize: '18px',
                        fontWeight: '600',
                        color: isDarkMode ? '#F1F5F9' : '#0F172A',
                        fontStyle: 'italic',
                        marginBottom: '8px',
                        letterSpacing: '0px',
                        lineHeight: '1.3'
                      }}>
                        {item.species}
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Clean Location Badge */}
                        <span style={{
                          padding: '5px 12px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '600',
                          letterSpacing: '0.2px',
                          background: 'rgba(8, 145, 178, 0.12)',
                          color: '#0891B2',
                          border: '1px solid rgba(8, 145, 178, 0.25)'
                        }}>
                          {item.location}
                        </span>
                        <span style={{ 
                          color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(100, 116, 139, 0.8)', 
                          fontSize: '12px', 
                          letterSpacing: '0.2px' 
                        }}>
                          {item.phylum}
                        </span>
                      </div>
                    </div>
                    {/* Clean count display - Microsoft style */}
                    <div style={{
                      fontSize: '36px',
                      fontWeight: '600',
                      color: isDarkMode ? '#F1F5F9' : '#0F172A',
                      letterSpacing: '-1px',
                      minWidth: '80px',
                      textAlign: 'right',
                      lineHeight: '1.1'
                    }}>
                      {item.count}
                    </div>
                  </div>
                  
                  {/* Clean progress bar */}
                  <div style={{
                    height: '4px',
                    borderRadius: '4px',
                    background: isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'rgba(226, 232, 240, 0.8)',
                    overflow: 'hidden'
                  }}>
                    <div 
                      style={{
                        height: '100%',
                        borderRadius: '4px',
                        background: '#0891B2',
                        width: `${(item.count / Math.max(...displaySpeciesData.map(s => s.count))) * 100}%`,
                        transition: 'width 1s ease-out'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}