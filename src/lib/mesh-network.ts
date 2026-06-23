import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { aegisMesh, MeshDevice, MeshMessage } from './bluetooth-mesh';

interface PeerPresence {
  deviceId: string;
  userId: string | null;
  label: string;
  joinedAt: string;
  lastSeen: string;
}

class AegisMeshNetwork {
  private channel: RealtimeChannel | null = null;
  private connectionPromise: Promise<void> | null = null;
  private relaySweepPromise: Promise<number> | null = null;
  private relaySweepTimer: ReturnType<typeof setTimeout> | null = null;
  private peers: MeshDevice[] = [];
  private connected = false;
  private peerListeners: Set<(peers: MeshDevice[]) => void> = new Set();
  private messageListeners: Set<(message: MeshMessage) => void> = new Set();
  private latestPresence: PeerPresence | null = null;

  get isConnected() {
    return this.connected;
  }

  get currentPeers() {
    return this.peers;
  }

  onPeersChanged(listener: (peers: MeshDevice[]) => void) {
    this.peerListeners.add(listener);
    listener([...this.peers]);
    return () => this.peerListeners.delete(listener);
  }

  onMessage(listener: (message: MeshMessage) => void) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private emitPeers() {
    this.peerListeners.forEach((listener) => listener([...this.peers]));
  }

  private emitMessage(message: MeshMessage) {
    this.messageListeners.forEach((listener) => listener(message));
  }

  private toMeshDevice(presence: PeerPresence): MeshDevice {
    return {
      id: presence.deviceId,
      name: presence.label,
      connected: true,
      lastSeen: presence.lastSeen,
    };
  }

  private rebuildPeers() {
    if (!this.channel) {
      this.peers = [];
      this.emitPeers();
      return;
    }

    const presenceState = this.channel.presenceState<PeerPresence>();
    const peers = Object.values(presenceState)
      .flat()
      .filter((presence) => presence.deviceId !== aegisMesh.currentDeviceId)
      .map((presence) => this.toMeshDevice(presence));

    const deduped = new Map<string, MeshDevice>();
    peers.forEach((peer) => deduped.set(peer.id, peer));
    const nextPeers = Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name));
    const previousPeerIds = this.peers.map((peer) => peer.id).join('|');
    const nextPeerIds = nextPeers.map((peer) => peer.id).join('|');
    this.peers = nextPeers;
    this.emitPeers();

    if (nextPeers.length > 0 && previousPeerIds !== nextPeerIds) {
      this.scheduleRelaySweep(250);
    }
  }

  private async updatePresence() {
    if (!this.channel || !this.connected || !this.latestPresence) {
      return;
    }

    this.latestPresence = {
      ...this.latestPresence,
      lastSeen: new Date().toISOString(),
    };

    await this.channel.track(this.latestPresence);
  }

  async ensureConnected() {
    if (this.connected) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const label = user?.email?.split('@')[0] || `Device ${aegisMesh.currentDeviceId.slice(0, 6)}`;

      this.latestPresence = {
        deviceId: aegisMesh.currentDeviceId,
        userId: user?.id ?? null,
        label,
        joinedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      };

      this.channel = supabase.channel('aegis-mesh-network', {
        config: {
          presence: {
            key: aegisMesh.currentDeviceId,
          },
          broadcast: {
            self: false,
          },
        },
      });

      this.channel
        .on('presence', { event: 'sync' }, () => {
          this.rebuildPeers();
        })
        .on('presence', { event: 'join' }, () => {
          this.rebuildPeers();
        })
        .on('presence', { event: 'leave' }, () => {
          this.rebuildPeers();
        })
        .on('broadcast', { event: 'mesh-message' }, async ({ payload }) => {
          const message = payload as MeshMessage;
          if (!message || message.sender_device_id === aegisMesh.currentDeviceId) {
            return;
          }

          if (aegisMesh.isMessageSeen(message.message_id) || aegisMesh.isExpired(message)) {
            return;
          }

          aegisMesh.markMessageSeen(message.message_id);
          await aegisMesh.queueForRelay({
            ...message,
            relay_status: message.ack_required ? 'relayed' : message.relay_status,
            relay_count: Math.min(message.relay_count + 1, message.max_hops),
            last_attempt_at: new Date().toISOString(),
          });

          if (message.ack_required) {
            await this.sendAck(message.message_id, message.sender_device_id);
          }

          this.emitMessage(message);

          if (message.relay_count < message.max_hops) {
            this.scheduleRelaySweep(200);
          }
        })
        .on('broadcast', { event: 'mesh-ack' }, async ({ payload }) => {
          const ack = payload as { message_id: string; target_device_id: string };
          if (!ack || ack.target_device_id !== aegisMesh.currentDeviceId) {
            return;
          }

          const delivered = await aegisMesh.markDelivered(ack.message_id);
          if (delivered) {
            this.emitMessage(delivered);
          }
        });

      await new Promise<void>((resolve, reject) => {
        this.channel?.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            this.connected = true;
            await this.channel?.track(this.latestPresence!);
            this.rebuildPeers();
            resolve();
            return;
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            this.connected = false;
            this.channel = null;
            reject(new Error(`Mesh channel status: ${status}`));
          }
        });
      });
    })();

    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  async relayMessage(message: MeshMessage) {
    await this.ensureConnected();
    await this.updatePresence();

    if (
      !this.channel ||
      !this.connected ||
      this.peers.length === 0 ||
      message.relay_status === 'delivered' ||
      message.relay_count >= message.max_hops
    ) {
      return false;
    }

    const relayAttempt = await aegisMesh.recordRelayAttempt(message.message_id);
    const outbound = relayAttempt ?? message;

    const result = await this.channel.send({
      type: 'broadcast',
      event: 'mesh-message',
      payload: outbound,
    });

    if (result === 'ok') {
      if (outbound.ack_required) {
        const relayed = await aegisMesh.markRelayed(message.message_id);
        if (relayed) {
          this.emitMessage(relayed);
        }
      } else {
        const delivered = await aegisMesh.markDelivered(message.message_id);
        if (delivered) {
          this.emitMessage(delivered);
        }
      }
      return true;
    }

    return false;
  }

  async relayQueuedMessages() {
    if (this.relaySweepPromise) {
      return this.relaySweepPromise;
    }

    await this.ensureConnected();

    if (!this.connected || this.peers.length === 0) {
      return 0;
    }

    this.relaySweepPromise = (async () => {
      const messages = await aegisMesh.getQueuedMessages();
      const pending = messages.filter(
        (message) => message.relay_status !== 'delivered' && message.relay_count < message.max_hops,
      );
      let relayed = 0;

      for (const message of pending) {
        const success = await this.relayMessage(message);
        if (success) {
          relayed += 1;
        }
      }

      return relayed;
    })();

    try {
      return await this.relaySweepPromise;
    } finally {
      this.relaySweepPromise = null;
    }
  }

  private async sendAck(messageId: string, targetDeviceId: string) {
    await this.ensureConnected();

    if (!this.channel || !this.connected) {
      return;
    }

    await this.channel.send({
      type: 'broadcast',
      event: 'mesh-ack',
      payload: {
        message_id: messageId,
        target_device_id: targetDeviceId,
        from_device_id: aegisMesh.currentDeviceId,
        acked_at: new Date().toISOString(),
      },
    });
  }

  private scheduleRelaySweep(delayMs = 300) {
    if (this.relaySweepTimer) {
      clearTimeout(this.relaySweepTimer);
    }

    this.relaySweepTimer = setTimeout(() => {
      this.relaySweepTimer = null;
      this.relayQueuedMessages().catch((err) => {
        console.error('Mesh relay sweep error:', err);
      });
    }, delayMs);
  }
}

export const meshNetwork = new AegisMeshNetwork();
