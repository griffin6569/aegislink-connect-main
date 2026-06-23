import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { offlineDB, SyncQueueItem } from './offline-db';
import { aegisMesh } from './bluetooth-mesh';
import { meshNetwork } from './mesh-network';
import { toast } from 'sonner';
import { cacheRemoteIncidents } from './incident-cache';

export type ConnectionStatus = 'online' | 'offline' | 'syncing';

export function useSyncEngine() {
  const [status, setStatus] = useState<ConnectionStatus>(
    navigator.onLine ? 'online' : 'offline'
  );
  const [pendingCount, setPendingCount] = useState(0);
  const syncingRef = useRef(false);

  useEffect(() => {
    meshNetwork.ensureConnected().catch((err) => {
      console.error('Mesh network connection error:', err);
    });
  }, []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setStatus('online');
      processQueue();
    };
    const handleOffline = () => setStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Count pending items
  useEffect(() => {
    const interval = setInterval(async () => {
      const [queue, relayMessages] = await Promise.all([
        offlineDB.getSyncQueue(),
        aegisMesh.getQueuedMessages(),
      ]);

      const syncPending = queue.filter((i) => i.status === 'pending' || i.status === 'failed').length;
      const relayPending = relayMessages.filter((msg) => msg.relay_status !== 'delivered').length;
      setPendingCount(syncPending + relayPending);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const processQueue = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setStatus('syncing');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      await aegisMesh.pruneExpiredMessages();
      const queue = await offlineDB.getSyncQueue();
      const pending = queue.filter((i) => i.status === 'pending' || (i.status === 'failed' && i.retries < 3));

      for (const item of pending) {
        try {
          item.status = 'syncing';
          await offlineDB.updateSyncItem(item);

          if (item.type === 'incident' && item.action === 'create') {
            const { data, error } = await supabase
              .from('incidents')
              .insert(item.data)
              .select();
            if (error) throw error;
            if (data?.length) {
              await cacheRemoteIncidents(data);
            }
          }

          // Success - remove from queue
          if (item.id !== undefined) {
            await offlineDB.removeSyncItem(item.id);
          }
        } catch (err: any) {
          item.status = 'failed';
          item.retries += 1;
          item.error = err.message;
          await offlineDB.updateSyncItem(item);
        }
      }

      const relayMessages = await aegisMesh.getQueuedMessages();
      const pendingRelays = relayMessages.filter((msg) => msg.relay_status !== 'delivered');

      for (const message of pendingRelays) {
        if (!user?.id) {
          break;
        }

        try {
          await aegisMesh.recordRelayAttempt(message.message_id);

          const { error } = await supabase.from('mesh_messages').upsert({
            message_id: message.message_id,
            user_id: user.id,
            sender_device_id: message.sender_device_id,
            receiver_device_id: message.receiver_device_id ?? null,
            payload: message.payload,
            relay_status: message.relay_status === 'pending' ? 'relayed' : message.relay_status,
            expiry_time: message.expiry_time,
            relay_count: Math.min(message.relay_count + 1, message.max_hops),
          });

          if (error) throw error;

          await aegisMesh.markDelivered(message.message_id);
        } catch (err) {
          console.error('Mesh relay sync error:', err);
        }
      }

      await meshNetwork.relayQueuedMessages();

      if (pending.length > 0 || pendingRelays.length > 0) {
        toast.success(`Synced ${pending.length} reports and ${pendingRelays.length} relay packets`);
      }
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      syncingRef.current = false;
      setStatus(navigator.onLine ? 'online' : 'offline');
    }
  }, []);

  const queueIncident = useCallback(async (incidentData: any, options?: { locationMode?: 'accurate' | 'approximate' }) => {
    // Save locally
    const localId = crypto.randomUUID();
    const incident = { ...incidentData, id: localId };
    await offlineDB.saveIncident(incident);
    const relayMessage = aegisMesh.createIncidentRelayMessage(incidentData, {
      locationMode: options?.locationMode,
    });
    await aegisMesh.queueForRelay(relayMessage);

    if (navigator.onLine) {
      // Try immediate sync
      try {
        const { data, error } = await supabase.from('incidents').insert(incidentData).select().single();
        if (error) throw error;
        await offlineDB.removeIncident(localId);
        await cacheRemoteIncidents([data]);
        await meshNetwork.relayMessage(relayMessage);
        return data;
      } catch {
        // Fall back to queue
        await offlineDB.addToSyncQueue({
          type: 'incident',
          action: 'create',
          data: incidentData,
          status: 'pending',
          retries: 0,
          createdAt: new Date().toISOString(),
        });
        return incident;
      }
    } else {
      // Queue for later
      await offlineDB.addToSyncQueue({
        type: 'incident',
        action: 'create',
        data: incidentData,
        status: 'pending',
        retries: 0,
        createdAt: new Date().toISOString(),
      });
      toast.info('Report saved offline. Will sync when online.');
      return incident;
    }
  }, []);

  return { status, pendingCount, processQueue, queueIncident };
}
