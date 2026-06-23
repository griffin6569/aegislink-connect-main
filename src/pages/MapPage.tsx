import { StatusBar } from '@/components/StatusBar';
import { BottomNav } from '@/components/BottomNav';
import { IncidentMap } from '@/components/IncidentMap';
import { useIncidents } from '@/lib/store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_LABELS } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, MapPin, Radar } from 'lucide-react';

export default function MapPage() {
  const { incidents } = useIncidents();
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapHeight, setMapHeight] = useState<number>(0);

  useEffect(() => {
    function calcHeight() {
      if (containerRef.current) {
        setMapHeight(containerRef.current.clientHeight);
      }
    }
    calcHeight();
    window.addEventListener('resize', calcHeight);
    return () => window.removeEventListener('resize', calcHeight);
  }, []);

  const mappedIncidents = useMemo(
    () => incidents.filter((incident) => incident.location.lat != null && incident.location.lng != null),
    [incidents],
  );

  const stats = useMemo(() => ({
    total: mappedIncidents.length,
    critical: mappedIncidents.filter((incident) => incident.severity === 'critical').length,
    high: mappedIncidents.filter((incident) => incident.severity === 'high').length,
    sources: new Set(mappedIncidents.map((incident) => incident.source.origin)).size,
  }), [mappedIncidents]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <StatusBar />
      <main className="flex-1 px-4 pt-4 pb-24 max-w-lg mx-auto w-full">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-foreground">Incident Map</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Live report locations, hotspot signals, and mapped incident activity.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-foreground">Mapped Reports</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-[10px] font-mono text-muted-foreground">incidents with usable coordinates</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-severity-critical" />
              <span className="text-xs font-medium text-foreground">Priority Load</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.critical + stats.high}</p>
            <p className="text-[10px] font-mono text-muted-foreground">
              {stats.critical} critical · {stats.high} high
            </p>
          </div>
        </div>

        <div
          ref={containerRef}
          className="mb-4 overflow-hidden rounded-xl border border-border bg-card"
          style={{ height: '52vh', minHeight: 360 }}
        >
          {mapHeight > 0 && (
            <IncidentMap
              incidents={mappedIncidents}
              style={{ width: '100%', height: `${mapHeight}px` }}
            />
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Incidents On Map</h2>
              <p className="text-[10px] font-mono text-muted-foreground">
                {stats.total} located reports · {stats.sources} source channel{stats.sources === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2 py-1">
              <Radar className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-mono text-primary">LIVE MAP</span>
            </div>
          </div>

          {mappedIncidents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No mapped incidents yet. Reports with location data will appear here.
            </div>
          ) : (
            <div className="space-y-3">
              {mappedIncidents.slice(0, 8).map((incident) => (
                <div key={incident.id} className="rounded-lg border border-border bg-background/70 p-3">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{incident.subcategory}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">
                        {incident.id} · {CATEGORY_LABELS[incident.category]}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono uppercase text-primary">{incident.severity}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{incident.description}</p>
                  <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
                    <span className="truncate">
                      {incident.location.address || `${incident.location.lat?.toFixed(4)}, ${incident.location.lng?.toFixed(4)}`}
                    </span>
                    <span className="shrink-0">
                      {formatDistanceToNow(new Date(incident.timestamp), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
