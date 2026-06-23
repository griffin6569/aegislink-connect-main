import { useState, useMemo } from 'react';
import { StatusBar } from '@/components/StatusBar';
import { BottomNav } from '@/components/BottomNav';
import { IncidentCard } from '@/components/IncidentCard';
import { StatsCard } from '@/components/StatsCard';
import { useIncidents } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { SeverityLevel } from '@/lib/types';
import { AlertTriangle, Shield, Clock, Activity, Filter, Search, Settings, LogIn, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export default function FeedPage() {
  const { incidents } = useIncidents();
  const { user, hasRole, signOut } = useAuth();
  const navigate = useNavigate();
  const [severityFilter, setSeverityFilter] = useState<SeverityLevel | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    return incidents.filter((inc) => {
      if (severityFilter !== 'all' && inc.severity !== severityFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          inc.description.toLowerCase().includes(q) ||
          inc.subcategory.toLowerCase().includes(q) ||
          inc.id.toLowerCase().includes(q) ||
          inc.source.publisher?.toLowerCase().includes(q) ||
          inc.source.platform?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [incidents, severityFilter, searchQuery]);

  const stats = useMemo(() => ({
    total: incidents.length,
    critical: incidents.filter((i) => i.severity === 'critical').length,
    active: incidents.filter((i) => ['pending', 'acknowledged', 'investigating'].includes(i.status)).length,
    avgConfidence: incidents.length > 0
      ? Math.round(incidents.reduce((acc, i) => acc + i.location.confidence, 0) / incidents.length * 100)
      : 0,
  }), [incidents]);

  const severities: Array<SeverityLevel | 'all'> = ['all', 'critical', 'high', 'medium', 'low'];

  return (
    <div className="min-h-screen bg-background bg-grid">
      <StatusBar />

      <main className="px-4 pt-4 pb-24 max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground">Incident Feed</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {hasRole('admin') ? 'Admin' : hasRole('authority') ? 'Authority' : 'Citizen'} · {incidents.length} real reports
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(hasRole('admin') || hasRole('authority')) && (
                <button
                  onClick={() => navigate('/admin')}
                  className="p-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-primary transition-colors"
                >
                  <Settings className="h-4 w-4" />
                </button>
              )}
              {user ? (
                <button
                  onClick={() => signOut()}
                  className="p-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={() => navigate('/auth')}
                  className="p-2 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors"
                >
                  <LogIn className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <StatsCard label="Total Reports" value={stats.total} icon={Shield} />
          <StatsCard label="Critical" value={stats.critical} icon={AlertTriangle} className={stats.critical > 0 ? 'border-severity-critical/30' : ''} />
          <StatsCard label="Active" value={stats.active} icon={Activity} />
          <StatsCard label="GPS Accuracy" value={`${stats.avgConfidence}%`} icon={Clock} />
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search incidents, publishers, or platforms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 font-mono"
          />
        </div>

        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
          <Filter className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          {severities.map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-3 py-1 rounded-full text-[10px] font-mono font-semibold tracking-wider border transition-colors flex-shrink-0 ${
                severityFilter === sev
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : 'bg-card text-muted-foreground border-border hover:border-primary/20'
              }`}
            >
              {sev.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {filtered.map((incident, i) => (
            <IncidentCard key={incident.id} incident={incident} index={i} />
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {incidents.length === 0
                ? 'No real incident sources yet. Volunteer uploads and verified external sources will appear here.'
                : 'No incidents match your filters'}
            </div>
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
