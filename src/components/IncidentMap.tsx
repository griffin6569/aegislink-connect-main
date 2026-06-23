import { useEffect, useRef, useState, memo, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Circle, Marker } from 'react-leaflet';
import { IncidentReport, CATEGORY_LABELS, SeverityLevel } from '@/lib/types';
import { SeverityBadge } from './SeverityBadge';
import { formatDistanceToNow } from 'date-fns';
import { Search, Locate, X, Loader2, Filter } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const severityColors: Record<SeverityLevel, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

const severityRadius: Record<SeverityLevel, number> = {
  low: 6,
  medium: 8,
  high: 10,
  critical: 14,
};

// Blue pulsing dot for user location
const userIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;background:hsl(217,91%,60%);border:3px solid white;border-radius:50%;box-shadow:0 0 10px rgba(59,130,246,0.6);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  importance?: number;
}

function UserLocationMarker({ position }: { position: { lat: number; lng: number; accuracy: number } | null }) {
  if (!position) return null;
  return (
    <>
      <Circle
        center={[position.lat, position.lng]}
        radius={position.accuracy}
        pathOptions={{ color: 'hsl(217,91%,60%)', fillColor: 'hsl(217,91%,60%)', fillOpacity: 0.08, weight: 1 }}
      />
      <Marker position={[position.lat, position.lng]} icon={userIcon} />
    </>
  );
}

function MapController({ userPosition, searchPosition }: { userPosition: { lat: number; lng: number } | null; searchPosition: { lat: number; lng: number } | null }) {
  const map = useMap();
  const initialCentered = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [map]);

  // Center on user location on first load
  useEffect(() => {
    if (userPosition && !initialCentered.current) {
      map.setView([userPosition.lat, userPosition.lng], 14, { animate: true });
      initialCentered.current = true;
    }
  }, [userPosition, map]);

  // Fly to search result
  useEffect(() => {
    if (searchPosition) {
      map.flyTo([searchPosition.lat, searchPosition.lng], 15, { duration: 1.5 });
    }
  }, [searchPosition, map]);

  return null;
}

function MapSearchBar({ onSelect, isAdmin }: { onSelect: (lat: number, lng: number) => void; isAdmin?: boolean }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (q: string) => {
    if (q.length < 3) { setResults([]); setOpen(false); return; }
    setSearching(true);
    try {
      const params = new URLSearchParams({
        q,
        format: 'json',
        limit: isAdmin ? '10' : '5',
        addressdetails: '1',
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'Accept-Language': 'en' },
      });
      const data: SearchResult[] = await res.json();
      setResults(data);
      setOpen(data.length > 0);
    } catch {
      setResults([]);
    }
    setSearching(false);
  }, [isAdmin]);

  const handleInput = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 400);
  };

  const selectResult = (r: SearchResult) => {
    onSelect(parseFloat(r.lat), parseFloat(r.lon));
    setQuery(r.display_name.split(',').slice(0, 2).join(','));
    setOpen(false);
  };

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-1.5 bg-card/90 backdrop-blur-xl border border-border rounded-lg px-3 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          placeholder={isAdmin ? 'Search any location, address, or coordinates...' : 'Search a place...'}
          className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
        />
        {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); setOpen(false); }}>
            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-xl z-[2000] max-h-60 overflow-auto">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => selectResult(r)}
              className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors border-b border-border last:border-0"
            >
              <p className="text-xs text-foreground truncate">{r.display_name}</p>
              <p className="text-[10px] text-muted-foreground font-mono">
                {parseFloat(r.lat).toFixed(4)}, {parseFloat(r.lon).toFixed(4)}
                {r.type && ` · ${r.type}`}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const IncidentMap = memo(function IncidentMap({
  incidents,
  className,
  isAdmin,
  style,
}: {
  incidents: IncidentReport[];
  className?: string;
  isAdmin?: boolean;
  style?: React.CSSProperties;
}) {
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [searchPosition, setSearchPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  // Auto-detect location on mount
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => {}, // fail silently, fallback to default
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  // Watch position for real-time updates
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const recenter = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setSearchPosition({ ...p }); // triggers flyTo
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  const defaultCenter: [number, number] = userPosition
    ? [userPosition.lat, userPosition.lng]
    : [-1.2921, 36.8219];

  return (
    <div className={`relative ${className || ''}`} style={style}>
      <MapContainer
        center={defaultCenter}
        zoom={14}
        className="h-full w-full rounded-lg"
        style={{ background: 'hsl(222, 47%, 6%)' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <MapController userPosition={userPosition} searchPosition={searchPosition} />
        <UserLocationMarker position={userPosition} />

        {incidents.map((incident) => {
          if (incident.location.lat == null || incident.location.lng == null) {
            return null;
          }

          return (
            <CircleMarker
              key={incident.id}
              center={[incident.location.lat, incident.location.lng]}
              radius={severityRadius[incident.severity]}
              pathOptions={{
                color: severityColors[incident.severity],
                fillColor: severityColors[incident.severity],
                fillOpacity: 0.4,
                weight: 2,
              }}
            >
              <Popup className="aegis-popup">
                <div className="p-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs">{incident.id}</span>
                    <SeverityBadge severity={incident.severity} />
                  </div>
                  <p className="text-sm font-medium">{incident.subcategory}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {CATEGORY_LABELS[incident.category]} · {formatDistanceToNow(new Date(incident.timestamp), { addSuffix: true })}
                  </p>
                  {incident.location.address && (
                    <p className="text-xs text-muted-foreground mt-0.5">{incident.location.address}</p>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Search overlay */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex items-start gap-2">
        <div className="flex-1">
          <MapSearchBar
            onSelect={(lat, lng) => setSearchPosition({ lat, lng })}
            isAdmin={isAdmin}
          />
        </div>
        <button
          onClick={recenter}
          disabled={locating}
          className="shrink-0 bg-card/90 backdrop-blur-xl border border-border rounded-lg p-2 text-muted-foreground hover:text-primary transition-colors"
          title="Center on my location"
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Locate className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
});
