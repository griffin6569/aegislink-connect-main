// AegisMesh - Bluetooth Mesh Relay for offline incident reporting
// Note: Web Bluetooth API has limited mesh capabilities. This provides the 
// foundation structure and works with compatible browsers.

import { offlineDB } from './offline-db';

declare global {
  interface Navigator {
    bluetooth?: any;
  }
}

export type MeshPriority = 'normal' | 'high' | 'urgent';

export interface MeshMessage {
  message_id: string;
  payload: any;
  sender_device_id: string;
  receiver_device_id?: string;
  relay_status: 'pending' | 'relayed' | 'delivered';
  expiry_time: string;
  relay_count: number;
  retry_count: number;
  max_hops: number;
  ack_required: boolean;
  priority: MeshPriority;
  last_attempt_at?: string;
  created_at: string;
}

export interface MeshDevice {
  id: string;
  name: string;
  rssi?: number;
  connected: boolean;
  lastSeen: string;
}

const AEGIS_SERVICE_UUID = '12345678-1234-5678-1234-567812345678';
const DEFAULT_MESH_TTL_HOURS = 24;

class AegisMesh {
  private deviceId: string;
  private discoveredDevices: MeshDevice[] = [];
  private messageCache: Set<string> = new Set();
  private listeners: Set<(devices: MeshDevice[]) => void> = new Set();
  private messageListeners: Set<(msg: MeshMessage) => void> = new Set();

  constructor() {
    this.deviceId = this.getOrCreateDeviceId();
  }

  private getOrCreateDeviceId(): string {
    let id = localStorage.getItem('aegis_device_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('aegis_device_id', id);
    }
    return id;
  }

  get currentDeviceId() {
    return this.deviceId;
  }

  get devices() {
    return this.discoveredDevices;
  }

  isSupported(): boolean {
    return 'bluetooth' in navigator;
  }

  async getAvailability(): Promise<boolean | null> {
    if (!this.isSupported()) {
      return false;
    }

    if (typeof navigator.bluetooth?.getAvailability !== 'function') {
      return null;
    }

    return navigator.bluetooth.getAvailability();
  }

  onDevicesChanged(listener: (devices: MeshDevice[]) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onMessageReceived(listener: (msg: MeshMessage) => void) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private notifyDeviceListeners() {
    this.listeners.forEach((l) => l([...this.discoveredDevices]));
  }

  async startDiscovery(): Promise<MeshDevice[]> {
    if (!this.isSupported()) {
      throw new Error('Bluetooth not supported in this browser');
    }

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [AEGIS_SERVICE_UUID] }],
        optionalServices: [AEGIS_SERVICE_UUID],
      });

      if (device) {
        const meshDevice: MeshDevice = {
          id: device.id,
          name: device.name || 'Unknown Device',
          connected: false,
          lastSeen: new Date().toISOString(),
        };

        const existing = this.discoveredDevices.findIndex((d) => d.id === device.id);
        if (existing >= 0) {
          this.discoveredDevices[existing] = meshDevice;
        } else {
          this.discoveredDevices.push(meshDevice);
        }

        this.notifyDeviceListeners();
      }

      return this.discoveredDevices;
    } catch (err) {
      console.error('BLE Discovery error:', err);
      throw err;
    }
  }

  createMessage(
    payload: any,
    receiverDeviceId?: string,
    options: {
      ackRequired?: boolean;
      maxHops?: number;
      priority?: MeshPriority;
      ttlHours?: number;
    } = {}
  ): MeshMessage {
    return {
      message_id: crypto.randomUUID(),
      payload,
      sender_device_id: this.deviceId,
      receiver_device_id: receiverDeviceId,
      relay_status: 'pending',
      expiry_time: new Date(Date.now() + (options.ttlHours ?? DEFAULT_MESH_TTL_HOURS) * 60 * 60 * 1000).toISOString(),
      relay_count: 0,
      retry_count: 0,
      max_hops: options.maxHops ?? 7,
      ack_required: options.ackRequired ?? true,
      priority: options.priority ?? 'normal',
      created_at: new Date().toISOString(),
    };
  }

  severityToPriority(severity?: string): MeshPriority {
    if (severity === 'critical' || severity === 'high') {
      return 'urgent';
    }

    if (severity === 'medium') {
      return 'high';
    }

    return 'normal';
  }

  createIncidentRelayMessage(incidentData: any, metadata?: { locationMode?: 'accurate' | 'approximate' }): MeshMessage {
    const compactPayload = {
      type: 'incident',
      version: 1,
      category: incidentData.category,
      subcategory: incidentData.subcategory,
      description: incidentData.description,
      severity: incidentData.severity,
      anonymous: incidentData.anonymous,
      location: {
        lat: incidentData.detected_lat,
        lng: incidentData.detected_lng,
        confidence: incidentData.location_confidence ?? 0,
        source: incidentData.location_source,
        mode: metadata?.locationMode ?? 'accurate',
      },
      created_at: new Date().toISOString(),
    };

    return this.createMessage(compactPayload, undefined, {
      ackRequired: incidentData.severity === 'critical',
      maxHops: incidentData.severity === 'critical' ? 10 : 7,
      priority: this.severityToPriority(incidentData.severity),
      ttlHours: incidentData.severity === 'critical' ? 36 : DEFAULT_MESH_TTL_HOURS,
    });
  }

  async queueForRelay(message: MeshMessage) {
    this.markMessageSeen(message.message_id);
    await offlineDB.saveMeshMessage(message);
    return message;
  }

  async getQueuedMessages(): Promise<MeshMessage[]> {
    const messages = await offlineDB.getMeshMessages() as MeshMessage[];
    return messages
      .filter((message) => !this.isExpired(message))
      .sort((a, b) => {
        const priorityRank: Record<MeshPriority, number> = { urgent: 0, high: 1, normal: 2 };
        const byPriority = priorityRank[a.priority] - priorityRank[b.priority];
        if (byPriority !== 0) return byPriority;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
  }

  async updateMessage(message: MeshMessage) {
    await offlineDB.updateMeshMessage(message);
    return message;
  }

  async recordRelayAttempt(messageId: string) {
    const messages = await this.getQueuedMessages();
    const existing = messages.find((message) => message.message_id === messageId);
    if (!existing) return null;

    const updated: MeshMessage = {
      ...existing,
      retry_count: existing.retry_count + 1,
      last_attempt_at: new Date().toISOString(),
    };

    await this.updateMessage(updated);
    return updated;
  }

  async markRelayed(messageId: string) {
    const messages = await this.getQueuedMessages();
    const existing = messages.find((message) => message.message_id === messageId);
    if (!existing) return null;

    const updated: MeshMessage = {
      ...existing,
      relay_status: 'relayed',
      relay_count: Math.min(existing.relay_count + 1, existing.max_hops),
      last_attempt_at: new Date().toISOString(),
    };

    await this.updateMessage(updated);
    return updated;
  }

  async markDelivered(messageId: string) {
    const messages = await this.getQueuedMessages();
    const existing = messages.find((message) => message.message_id === messageId);
    if (!existing) return null;

    const updated: MeshMessage = {
      ...existing,
      relay_status: 'delivered',
      relay_count: Math.min(Math.max(existing.relay_count, 1), existing.max_hops),
      last_attempt_at: new Date().toISOString(),
    };

    await this.updateMessage(updated);
    return updated;
  }

  async pruneExpiredMessages() {
    const messages = await offlineDB.getMeshMessages() as MeshMessage[];
    const expired = messages.filter((message) => this.isExpired(message));
    await Promise.all(expired.map((message) => offlineDB.removeMeshMessage(message.message_id)));
    return expired.length;
  }

  // Deduplication check
  isMessageSeen(messageId: string): boolean {
    return this.messageCache.has(messageId);
  }

  markMessageSeen(messageId: string) {
    this.messageCache.add(messageId);
    // Clean old entries (keep last 1000)
    if (this.messageCache.size > 1000) {
      const arr = Array.from(this.messageCache);
      this.messageCache = new Set(arr.slice(-500));
    }
  }

  // Check if message is expired
  isExpired(msg: MeshMessage): boolean {
    return new Date(msg.expiry_time) < new Date();
  }
}

export const aegisMesh = new AegisMesh();
