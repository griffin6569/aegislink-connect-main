import { useEffect, useMemo, useState } from 'react';
import { StatusBar } from '@/components/StatusBar';
import { IncidentCard } from '@/components/IncidentCard';
import { IncidentMap } from '@/components/IncidentMap';
import { StatsCard } from '@/components/StatsCard';
import { useAuth } from '@/hooks/useAuth';
import { useIncidents } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import { IncidentReport, IncidentStatus } from '@/lib/types';
import { offlineDB } from '@/lib/offline-db';
import { aegisMesh, MeshMessage } from '@/lib/bluetooth-mesh';
import { buildAdminAnalytics } from '@/lib/admin-analytics';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Clock,
  Loader2,
  LogOut,
  MapPin,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Users,
  WifiOff,
  Radio,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type AppRole = 'admin' | 'moderator' | 'user' | 'authority';

interface UserWithRole {
  user_id: string;
  display_name: string | null;
  email?: string;
  role: AppRole;
  created_at: string;
}

type AdminTab = 'overview' | 'analytics' | 'incidents' | 'map' | 'users';

function MetricBar({
  label,
  value,
  width,
  tone = 'bg-primary',
}: {
  label: string;
  value: string | number;
  width: number;
  tone?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-foreground">{label}</span>
        <span className="text-[10px] font-mono text-muted-foreground">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(width, 0)}%` }} />
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user, hasRole, signOut } = useAuth();
  const navigate = useNavigate();
  const { incidents: sharedIncidents, loading, refetch } = useIncidents();

  const [tab, setTab] = useState<AdminTab>('overview');
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [queueBacklog, setQueueBacklog] = useState(0);
  const [meshMessages, setMeshMessages] = useState<MeshMessage[]>([]);
  const [dashboardRefreshing, setDashboardRefreshing] = useState(false);

  useEffect(() => {
    setIncidents(sharedIncidents);
  }, [sharedIncidents]);

  useEffect(() => {
    loadLocalAdminState().catch((err) => {
      console.error('Admin local state load error:', err);
    });
  }, [sharedIncidents]);

  useEffect(() => {
    if (tab === 'users') {
      fetchUsers();
    }
  }, [tab]);

  async function loadLocalAdminState() {
    const [queue, messages] = await Promise.all([
      offlineDB.getSyncQueue(),
      aegisMesh.getQueuedMessages(),
    ]);

    const pendingQueue = queue.filter((item) => item.status === 'pending' || item.status === 'failed').length;
    setQueueBacklog(pendingQueue);
    setMeshMessages(messages);
  }

  async function fetchUsers() {
    setUsersLoading(true);

    const { data: profiles, error: profilesErr } = await supabase
      .from('profiles')
      .select('user_id, display_name, created_at');

    const { data: roles, error: rolesErr } = await supabase
      .from('user_roles')
      .select('user_id, role');

    if (profilesErr || rolesErr) {
      toast.error('Failed to load users');
      setUsersLoading(false);
      return;
    }

    const roleMap = new Map<string, AppRole>();
    roles?.forEach((role) => roleMap.set(role.user_id, role.role as AppRole));

    const mapped: UserWithRole[] = (profiles || []).map((profile) => ({
      user_id: profile.user_id,
      display_name: profile.display_name,
      role: roleMap.get(profile.user_id) || 'user',
      created_at: profile.created_at,
    }));

    setUsers(mapped);
    setUsersLoading(false);
  }

  async function updateUserRole(targetUserId: string, newRole: AppRole) {
    setUpdatingUserId(targetUserId);

    const { error: deleteError } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', targetUserId);

    if (deleteError) {
      toast.error('Failed to update role');
      setUpdatingUserId(null);
      return;
    }

    const { error: insertError } = await supabase
      .from('user_roles')
      .insert({ user_id: targetUserId, role: newRole });

    if (insertError) {
      toast.error('Failed to assign new role');
    } else {
      toast.success(`Role updated to ${newRole}`);
      setUsers((previous) =>
        previous.map((entry) => (entry.user_id === targetUserId ? { ...entry, role: newRole } : entry)),
      );
    }

    setUpdatingUserId(null);
  }

  async function refreshDashboard() {
    setDashboardRefreshing(true);

    try {
      await refetch();
      await loadLocalAdminState();

      if (tab === 'users') {
        await fetchUsers();
      }

      toast.success(navigator.onLine ? 'Dashboard refreshed' : 'Showing cached dashboard data');
    } catch (err) {
      console.error('Dashboard refresh error:', err);
      toast.error('Failed to refresh dashboard');
    } finally {
      setDashboardRefreshing(false);
    }
  }

  function handleStatusChange(displayId: string, newStatus: IncidentStatus) {
    setIncidents((previous) =>
      previous.map((incident) => (incident.id === displayId ? { ...incident, status: newStatus } : incident)),
    );
  }

  const analytics = useMemo(
    () => buildAdminAnalytics(incidents, meshMessages, queueBacklog),
    [incidents, meshMessages, queueBacklog],
  );

  const tabs: Array<{ id: AdminTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'incidents', label: 'Incidents' },
    { id: 'map', label: 'Map' },
    { id: 'users', label: 'Users' },
  ];

  const topHourCount = Math.max(...analytics.byHour.map((entry) => entry.count), 1);
  const topCategoryCount = Math.max(...analytics.byCategory.map((entry) => entry.count), 1);
  const topSeverityCount = Math.max(...analytics.bySeverity.map((entry) => entry.count), 1);

  return (
    <div className="min-h-screen bg-background bg-grid">
      <StatusBar />

      <main className="mx-auto max-w-6xl px-4 pb-8 pt-4">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="rounded-lg border border-border bg-card p-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-foreground">Admin Dashboard</h1>
              <p className="text-[10px] font-mono text-muted-foreground">
                {user?.email} · {hasRole('admin') ? 'ADMIN' : 'AUTHORITY'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!navigator.onLine && (
              <div className="flex items-center gap-1.5 rounded-full border border-status-offline/30 bg-status-offline/10 px-2 py-1">
                <WifiOff className="h-3 w-3 text-status-offline" />
                <span className="text-[10px] font-mono text-status-offline">OFFLINE CACHE</span>
              </div>
            )}
            <button
              onClick={refreshDashboard}
              className="rounded-lg border border-border bg-card p-2 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`h-4 w-4 ${dashboardRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => {
                signOut();
                navigate('/auth');
              }}
              className="rounded-lg border border-border bg-card p-2 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mb-6 flex gap-1 rounded-lg border border-border bg-card p-1">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setTab(entry.id)}
              className={`flex-1 rounded py-2 text-xs font-medium transition-colors ${
                tab === entry.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatsCard label="Total Reports" value={analytics.totalReports} icon={Shield} />
              <StatsCard
                label="Critical"
                value={analytics.criticalReports}
                icon={AlertTriangle}
                className={analytics.criticalReports > 0 ? 'border-severity-critical/30' : ''}
              />
              <StatsCard label="Queue Backlog" value={analytics.queueBacklog} icon={RefreshCw} />
              <StatsCard label="GPS Confidence" value={`${analytics.averageConfidence}%`} icon={MapPin} />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
              <div>
                <h3 className="mb-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Recent Incidents
                </h3>
                <div className="space-y-2">
                  {incidents.slice(0, 6).map((incident, index) => (
                    <IncidentCard
                      key={incident.id}
                      incident={incident}
                      index={index}
                      isAdmin
                      onStatusChange={handleStatusChange}
                    />
                  ))}
                  {!loading && incidents.length === 0 && (
                    <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                      No incidents available yet
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="mb-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Local Intelligence
                  </h3>
                  <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-border bg-background/80 p-3">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          Top Cluster
                        </p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{analytics.topCategory}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-background/80 p-3">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          Peak Hour
                        </p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{analytics.peakHourLabel}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {analytics.insights.map((insight) => (
                        <div
                          key={insight}
                          className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground"
                        >
                          {insight}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Hotspot Map
                  </h3>
                  <IncidentMap incidents={incidents} className="h-[360px] overflow-hidden rounded-lg" isAdmin />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {tab === 'analytics' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatsCard label="Active Cases" value={analytics.activeReports} icon={AlertTriangle} />
              <StatsCard label="Resolved" value={analytics.resolvedReports} icon={ShieldCheck} />
              <StatsCard
                label="Accurate GPS"
                value={`${analytics.accurateLocations}/${analytics.totalReports || 0}`}
                icon={MapPin}
              />
              <StatsCard label="Mesh Delivered" value={analytics.meshDelivered} icon={Radio} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-4 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Incident Mix
                  </h3>
                </div>
                <div className="space-y-3">
                  {analytics.byCategory.map((entry) => (
                    <MetricBar
                      key={entry.key}
                      label={entry.label}
                      value={`${entry.count} · ${entry.share}%`}
                      width={(entry.count / topCategoryCount) * 100}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Severity Profile
                  </h3>
                </div>
                <div className="space-y-3">
                  {analytics.bySeverity.map((entry) => (
                    <MetricBar
                      key={entry.key}
                      label={entry.key.toUpperCase()}
                      value={`${entry.count} · ${entry.share}%`}
                      width={(entry.count / topSeverityCount) * 100}
                      tone={
                        entry.key === 'critical'
                          ? 'bg-severity-critical'
                          : entry.key === 'high'
                            ? 'bg-severity-high'
                            : entry.key === 'medium'
                              ? 'bg-severity-medium'
                              : 'bg-severity-low'
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Reporting Rhythm
                  </h3>
                </div>
                <div className="space-y-3">
                  {analytics.byHour
                    .slice()
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 6)
                    .map((entry) => (
                      <MetricBar
                        key={entry.label}
                        label={entry.label}
                        value={entry.count}
                        width={(entry.count / topHourCount) * 100}
                        tone="bg-cyan-500"
                      />
                    ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-4 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-primary" />
                  <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Delivery Health
                  </h3>
                </div>
                <div className="space-y-3">
                  <MetricBar label="Sync Queue" value={analytics.queueBacklog} width={Math.min(analytics.queueBacklog * 15, 100)} tone="bg-amber-500" />
                  <MetricBar label="Mesh Pending" value={analytics.meshPending} width={Math.min(analytics.meshPending * 15, 100)} tone="bg-rose-500" />
                  <MetricBar label="Mesh Delivered" value={analytics.meshDelivered} width={Math.min(analytics.meshDelivered * 15, 100)} tone="bg-emerald-500" />
                  <MetricBar
                    label="Approximate GPS"
                    value={`${analytics.approximateLocations} report(s)`}
                    width={analytics.totalReports === 0 ? 0 : (analytics.approximateLocations / analytics.totalReports) * 100}
                    tone="bg-blue-500"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Status Distribution
                  </h3>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {analytics.byStatus.map((entry) => (
                    <div key={entry.key} className="rounded-lg border border-border bg-background/80 p-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        {entry.key}
                      </p>
                      <p className="mt-2 text-xl font-bold text-foreground">{entry.count}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">{entry.share}% of reports</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {tab === 'incidents' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="space-y-2">
              {loading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
              ) : incidents.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">No incidents yet</div>
              ) : (
                incidents.map((incident, index) => (
                  <IncidentCard
                    key={incident.id}
                    incident={incident}
                    index={index}
                    isAdmin
                    onStatusChange={handleStatusChange}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}

        {tab === 'map' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <IncidentMap incidents={incidents} className="h-[600px] overflow-hidden rounded-lg" isAdmin />
          </motion.div>
        )}

        {tab === 'users' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {usersLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : users.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                <p>No users found</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-3">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    {users.length} Registered Users
                  </h3>
                  <Button variant="outline" size="sm" onClick={fetchUsers} className="h-7 text-xs">
                    <RefreshCw className="mr-1 h-3 w-3" /> Refresh
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">User</TableHead>
                      <TableHead className="text-xs">Role</TableHead>
                      <TableHead className="text-xs">Joined</TableHead>
                      <TableHead className="text-right text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((entry) => (
                      <TableRow key={entry.user_id}>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium text-foreground">{entry.display_name || 'Unknown'}</p>
                            <p className="text-[10px] font-mono text-muted-foreground">
                              {entry.user_id.slice(0, 8)}...
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={entry.role === 'admin' ? 'destructive' : entry.role === 'authority' ? 'default' : 'secondary'}
                            className="text-[10px]"
                          >
                            {entry.role === 'admin' && <ShieldCheck className="mr-1 h-3 w-3" />}
                            {entry.role === 'authority' && <ShieldAlert className="mr-1 h-3 w-3" />}
                            {entry.role.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(entry.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.user_id === user?.id ? (
                            <span className="text-[10px] italic text-muted-foreground">You</span>
                          ) : (
                            <Select
                              value={entry.role}
                              onValueChange={(value) => updateUserRole(entry.user_id, value as AppRole)}
                              disabled={updatingUserId === entry.user_id}
                            >
                              <SelectTrigger className="h-7 w-[120px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">User</SelectItem>
                                <SelectItem value="moderator">Moderator</SelectItem>
                                <SelectItem value="authority">Authority</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </motion.div>
        )}
      </main>
    </div>
  );
}
