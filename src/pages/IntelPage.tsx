import { StatusBar } from '@/components/StatusBar';
import { BottomNav } from '@/components/BottomNav';
import { StatsCard } from '@/components/StatsCard';
import { useIncidents } from '@/lib/store';
import { CATEGORY_LABELS, IncidentCategory, SeverityLevel } from '@/lib/types';
import { BarChart3, TrendingUp, MapPin, Clock, Shield, AlertTriangle, Flame, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMemo } from 'react';

export default function IntelPage() {
  const { incidents } = useIncidents();

  const analytics = useMemo(() => {
    const byCategory = Object.keys(CATEGORY_LABELS).map((cat) => ({
      category: CATEGORY_LABELS[cat as IncidentCategory],
      count: incidents.filter((i) => i.category === cat).length,
    }));

    const bySeverity = (['low', 'medium', 'high', 'critical'] as SeverityLevel[]).map((sev) => ({
      severity: sev,
      count: incidents.filter((i) => i.severity === sev).length,
    }));

    const maxCategoryCt = Math.max(...byCategory.map((c) => c.count), 1);
    const maxSeverityCt = Math.max(...bySeverity.map((s) => s.count), 1);

    return { byCategory, bySeverity, maxCategoryCt, maxSeverityCt };
  }, [incidents]);

  const severityBarColors: Record<SeverityLevel, string> = {
    low: 'bg-severity-low',
    medium: 'bg-severity-medium',
    high: 'bg-severity-high',
    critical: 'bg-severity-critical',
  };

  return (
    <div className="min-h-screen bg-background bg-grid">
      <StatusBar />

      <main className="px-4 pt-4 pb-24 max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">AegisIntel</h1>
          </div>
          <p className="text-xs text-muted-foreground">Security intelligence & pattern analysis</p>
        </motion.div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <StatsCard label="Total Incidents" value={incidents.length} icon={Shield} />
          <StatsCard label="Critical Alerts" value={incidents.filter((i) => i.severity === 'critical').length} icon={AlertTriangle} className="border-severity-critical/20" />
          <StatsCard label="Hotspots" value={3} icon={MapPin} />
          <StatsCard label="Avg Response" value="4m" icon={Clock} trend="↓ 12% this week" />
        </div>

        {/* By Category */}
        <div className="p-4 bg-card border border-border rounded-lg mb-4">
          <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">By Category</h3>
          <div className="space-y-3">
            {analytics.byCategory.map((cat) => (
              <div key={cat.category}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-foreground">{cat.category}</span>
                  <span className="text-xs font-mono text-muted-foreground">{cat.count}</span>
                </div>
                <div className="h-2 bg-border rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(cat.count / analytics.maxCategoryCt) * 100}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="h-full bg-primary rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* By Severity */}
        <div className="p-4 bg-card border border-border rounded-lg mb-4">
          <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">By Severity</h3>
          <div className="space-y-3">
            {analytics.bySeverity.map((sev) => (
              <div key={sev.severity}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-foreground capitalize">{sev.severity}</span>
                  <span className="text-xs font-mono text-muted-foreground">{sev.count}</span>
                </div>
                <div className="h-2 bg-border rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(sev.count / analytics.maxSeverityCt) * 100}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className={`h-full rounded-full ${severityBarColors[sev.severity]}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Assessment */}
        <div className="p-4 bg-card border border-border rounded-lg">
          <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">Threat Assessment</h3>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-severity-medium/15 border border-severity-medium/30 flex items-center justify-center">
              <span className="text-lg font-bold font-mono text-severity-medium">B+</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Moderate Risk</p>
              <p className="text-[10px] text-muted-foreground">Based on {incidents.length} reports in this area</p>
            </div>
          </div>
          <div className="space-y-1.5 text-[10px] text-muted-foreground">
            <p>• Peak incident hours: 18:00 – 22:00</p>
            <p>• Most reported: Suspicious Activity</p>
            <p>• Trend: ↑ 8% increase from last period</p>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
