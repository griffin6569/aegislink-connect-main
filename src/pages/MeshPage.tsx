import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Radio, RefreshCw, Smartphone, Users, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { BottomNav } from '@/components/BottomNav';
import { ClientMessagingPanel } from '@/components/ClientMessagingPanel';
import { StatusBar } from '@/components/StatusBar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { aegisMesh, MeshDevice, MeshMessage } from '@/lib/bluetooth-mesh';
import { meshNetwork } from '@/lib/mesh-network';
import { useSyncEngine } from '@/lib/sync-engine';

export default function MeshPage() {
  const [devices, setDevices] = useState<MeshDevice[]>([]);
  const [messages, setMessages] = useState<MeshMessage[]>([]);
  const [connecting, setConnecting] = useState(false);
  const { status, pendingCount } = useSyncEngine();

  useEffect(() => {
    let active = true;

    setConnecting(true);
    meshNetwork.ensureConnected()
      .catch((err) => {
        console.error('Mesh connection error:', err);
        toast.error('Unable to join the realtime mesh');
      })
      .finally(() => {
        if (active) {
          setConnecting(false);
        }
      });

    const unsubscribe = meshNetwork.onPeersChanged((peers) => {
      if (active) {
        setDevices(peers);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadMessages = async () => {
      const queued = await aegisMesh.getQueuedMessages();
      if (active) {
        setMessages(queued);
      }
    };

    const unsubscribe = meshNetwork.onMessage(() => {
      loadMessages().catch((err) => console.error('Mesh message refresh error:', err));
    });

    loadMessages().catch((err) => console.error('Mesh queue load error:', err));
    const interval = setInterval(() => {
      loadMessages().catch((err) => console.error('Mesh queue poll error:', err));
    }, 3000);

    return () => {
      active = false;
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleJoinMesh = async () => {
    setConnecting(true);

    try {
      await meshNetwork.ensureConnected();
      const relayed = await meshNetwork.relayQueuedMessages();
      toast.success(relayed > 0 ? `Relayed ${relayed} packet(s)` : 'Connected to the realtime mesh');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to join the mesh';
      toast.error(message);
    } finally {
      setConnecting(false);
    }
  };

  const pendingMessages = messages.filter((message) => message.relay_status !== 'delivered');

  return (
    <div className="min-h-screen bg-background bg-grid">
      <StatusBar />

      <main className="mx-auto max-w-lg px-4 pb-24 pt-4">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="mb-1 flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">AegisMesh</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Realtime relay plus direct in-app messaging between signed-in clients
          </p>
        </motion.div>

        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              {status === 'online' ? (
                <Wifi className="h-4 w-4 text-status-online" />
              ) : (
                <WifiOff className="h-4 w-4 text-status-offline" />
              )}
              <span className="text-[10px] font-mono uppercase text-muted-foreground">Internet</span>
            </div>
            <span className={`text-sm font-semibold capitalize ${
              status === 'online' ? 'text-status-online' : status === 'syncing' ? 'text-status-syncing' : 'text-status-offline'
            }`}>
              {status}
            </span>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-mono uppercase text-muted-foreground">Mesh Link</span>
            </div>
            <span className="text-sm font-semibold text-foreground">
              {meshNetwork.isConnected ? 'Connected' : connecting ? 'Joining...' : 'Idle'}
            </span>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-mono uppercase text-muted-foreground">Online Peers</span>
            </div>
            <span className="text-sm font-semibold text-foreground">{devices.length} detected</span>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-mono uppercase text-muted-foreground">Relay Queue</span>
            </div>
            <span className="text-sm font-semibold text-foreground">{pendingMessages.length} packets</span>
          </div>
        </div>

        <Tabs defaultValue="relay" className="w-full">
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="relay">Mesh Relay</TabsTrigger>
            <TabsTrigger value="messages">Client Messages</TabsTrigger>
          </TabsList>

          <TabsContent value="relay" className="mt-0 space-y-4">
            {pendingCount > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-severity-medium/30 bg-severity-medium/10 p-3">
                <RefreshCw className="h-4 w-4 text-severity-medium" />
                <div>
                  <p className="text-xs font-medium text-foreground">{pendingCount} items pending sync</p>
                  <p className="text-[10px] text-muted-foreground">
                    {status === 'online' ? 'Syncing now...' : 'Will sync when online'}
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border bg-card p-4">
              <span className="mb-1 block text-[10px] font-mono uppercase text-muted-foreground">Your Device ID</span>
              <span className="break-all text-xs font-mono text-primary">{aegisMesh.currentDeviceId}</span>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-medium text-foreground">Browser-friendly mesh discovery is active</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Open AegisLink on the other phone or laptop, sign in, and visit this Mesh tab. Devices are discovered through the shared AegisLink realtime channel instead of BLE advertising.
              </p>
            </div>

            <button
              onClick={handleJoinMesh}
              disabled={connecting}
              className="glow-primary flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {connecting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  Joining...
                </>
              ) : (
                <>
                  <Radio className="h-4 w-4" />
                  {devices.length === 0 ? 'Join Realtime Mesh' : 'Refresh Mesh Peers'}
                </>
              )}
            </button>

            <div>
              <h3 className="mb-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Detected Devices</h3>
              {devices.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No peer devices detected yet. Keep this page open on both devices while they are online.
                </div>
              ) : (
                <div className="space-y-2">
                  {devices.map((device) => (
                    <div key={device.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                      <Smartphone className="h-4 w-4 text-primary" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-foreground">{device.name}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">{device.id.slice(0, 16)}...</p>
                      </div>
                      <span className="rounded border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-mono text-primary">
                        ONLINE
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Relay Packets</h3>
              {messages.length === 0 ? (
                <div className="rounded-lg border border-border bg-card py-6 text-center text-xs text-muted-foreground">
                  No relay packets queued yet. Submitted incident reports will appear here until they are acknowledged or synced.
                </div>
              ) : (
                <div className="space-y-2">
                  {messages.slice(0, 5).map((message) => (
                    <div key={message.message_id} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium capitalize text-foreground">
                            {message.priority} priority · {message.payload?.severity || 'unknown'} severity
                          </p>
                          <p className="text-[10px] font-mono text-muted-foreground">
                            {message.message_id.slice(0, 16)}... · {message.relay_status.toUpperCase()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-mono text-muted-foreground">
                            hops {message.relay_count}/{message.max_hops}
                          </p>
                          <p className="text-[10px] font-mono text-muted-foreground">
                            retries {message.retry_count}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-2 text-xs font-semibold text-foreground">How AegisMesh Works</h3>
              <div className="space-y-2 text-[10px] text-muted-foreground">
                <p>1. Each browser joins the shared AegisLink realtime mesh channel</p>
                <p>2. Reports become relay packets with priority, retries, and hop limits</p>
                <p>3. Online peers receive packets immediately and acknowledge delivery</p>
                <p>4. Packets stay queued locally until they are relayed or synced</p>
                <p>5. Deduplication and expiry reduce duplicate or stale traffic</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="messages" className="mt-0">
            <ClientMessagingPanel />
          </TabsContent>
        </Tabs>
      </main>

      <BottomNav />
    </div>
  );
}
