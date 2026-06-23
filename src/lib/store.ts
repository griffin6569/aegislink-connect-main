import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { IncidentReport } from './types';
import { cacheRemoteIncidents, dedupeIncidents, getCachedIncidents, normalizeIncidentRecord } from './incident-cache';

export function useIncidents() {
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCachedIncidents()
      .then((cached) => {
        if (cached.length > 0) {
          setIncidents(cached);
        }
      })
      .catch((err) => {
        console.error('Cached incident load error:', err);
      });

    fetchIncidents();
  }, []);

  async function fetchIncidents() {
    setLoading(true);
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Incident fetch error:', error);
      const cached = await getCachedIncidents();
      setIncidents(cached);
      setLoading(false);
      return;
    }

    if (data && data.length > 0) {
      await cacheRemoteIncidents(data);
      const remote = data
        .map((record) => normalizeIncidentRecord(record))
        .filter((record): record is IncidentReport => Boolean(record));
      const cached = await getCachedIncidents();
      setIncidents(dedupeIncidents([...remote, ...cached]));
    } else {
      const cached = await getCachedIncidents();
      setIncidents(cached);
    }
    setLoading(false);
  }

  const addIncident = useCallback((report: IncidentReport) => {
    setIncidents((prev) => [report, ...prev]);
  }, []);

  return { incidents, loading, addIncident, refetch: fetchIncidents };
}

export function useConnectionStatus() {
  const [status, setStatus] = useState<'online' | 'offline'>(
    navigator.onLine ? 'online' : 'offline'
  );

  useEffect(() => {
    const handleOnline = () => setStatus('online');
    const handleOffline = () => setStatus('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return status;
}
