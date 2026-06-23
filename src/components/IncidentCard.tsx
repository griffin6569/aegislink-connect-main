import { IncidentReport, IncidentStatus, CATEGORY_LABELS } from '@/lib/types';
import { SeverityBadge } from './SeverityBadge';
import { MapPin, Clock, Shield, Eye, Loader2, Link2, BadgeCheck, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

const statusColors: Record<string, string> = {
  pending: 'text-muted-foreground',
  acknowledged: 'text-severity-medium',
  investigating: 'text-primary',
  resolved: 'text-severity-low',
  closed: 'text-muted-foreground',
};

const STATUS_OPTIONS: { value: IncidentStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

interface IncidentCardProps {
  incident: IncidentReport;
  index?: number;
  isAdmin?: boolean;
  onStatusChange?: (id: string, newStatus: IncidentStatus) => void;
}

export function IncidentCard({ incident, index = 0, isAdmin = false, onStatusChange }: IncidentCardProps) {
  const [updating, setUpdating] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<IncidentStatus>(incident.status);
  const isExternalSource = incident.source.origin === 'verified_external';
  const sourceLabel = isExternalSource
    ? incident.source.publisher || incident.source.platform || 'Verified Source'
    : 'Volunteer Upload';

  async function handleStatusChange(newStatus: IncidentStatus) {
    if (newStatus === currentStatus) return;
    setUpdating(true);

    // We need the internal UUID — query by display_id
    const { data: rows, error: fetchErr } = await supabase
      .from('incidents')
      .select('id')
      .eq('display_id', incident.id)
      .limit(1);

    if (fetchErr || !rows?.length) {
      toast.error('Failed to find incident');
      setUpdating(false);
      return;
    }

    const { error } = await supabase
      .from('incidents')
      .update({ status: newStatus })
      .eq('id', rows[0].id);

    if (error) {
      toast.error('Failed to update status');
    } else {
      setCurrentStatus(newStatus);
      toast.success(`Status → ${newStatus}`);
      onStatusChange?.(incident.id, newStatus);
    }
    setUpdating(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="group relative p-4 bg-card border border-border rounded-lg hover:border-primary/30 hover:glow-primary transition-all duration-300 cursor-pointer"
    >
      {incident.severity === 'critical' && (
        <div className="absolute inset-0 rounded-lg border border-severity-critical/20 animate-pulse-glow pointer-events-none" />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-mono text-[10px] text-muted-foreground">{incident.id}</span>
            <SeverityBadge severity={incident.severity} />
            <span className="text-[10px] font-mono text-muted-foreground capitalize">
              {CATEGORY_LABELS[incident.category]}
            </span>
            <Badge variant="outline" className="gap-1 px-2 py-0 text-[9px] font-mono uppercase tracking-wide">
              {isExternalSource ? <BadgeCheck className="h-2.5 w-2.5" /> : <Users className="h-2.5 w-2.5" />}
              {sourceLabel}
            </Badge>
          </div>

          <h3 className="text-sm font-medium text-foreground mb-1 truncate">
            {incident.subcategory}
          </h3>

          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
            {incident.description}
          </p>

          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {incident.location.address ||
                (incident.location.lat != null && incident.location.lng != null
                  ? `${incident.location.lat.toFixed(4)}, ${incident.location.lng.toFixed(4)}`
                  : 'Location not shared')}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(incident.timestamp), { addSuffix: true })}
            </span>
            {incident.source.url && (
              <a
                href={incident.source.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                <Link2 className="h-3 w-3" />
                Source
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1">
            {incident.anonymous ? (
              <Eye className="h-3 w-3 text-muted-foreground" />
            ) : (
              <Shield className="h-3 w-3 text-primary/60" />
            )}
          </div>

          {isAdmin ? (
            <Select
              value={currentStatus}
              onValueChange={(v) => handleStatusChange(v as IncidentStatus)}
              disabled={updating}
            >
              <SelectTrigger className="h-6 w-[115px] text-[10px] font-mono uppercase px-2 py-0">
                {updating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <SelectValue />
                )}
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="text-xs">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className={`text-[10px] font-mono uppercase ${statusColors[currentStatus]}`}>
              {currentStatus}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
