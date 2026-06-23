export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export type IncidentCategory = 'crime' | 'safety_hazard' | 'emergency' | 'community_violation';

export const INCIDENT_SUBCATEGORIES: Record<IncidentCategory, string[]> = {
  crime: ['Theft', 'Vandalism', 'Suspicious Activity', 'Assault', 'Robbery', 'Fraud'],
  safety_hazard: ['Broken Lights', 'Unsafe Zone', 'Road Damage', 'Structural Damage', 'Flooding'],
  emergency: ['Fire', 'Flood', 'Violence', 'Medical Emergency', 'Natural Disaster'],
  community_violation: ['Noise Complaint', 'Illegal Dumping', 'Trespassing', 'Harassment'],
};

export const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  crime: 'Crime',
  safety_hazard: 'Safety Hazard',
  emergency: 'Emergency',
  community_violation: 'Community Violation',
};

export type IncidentStatus = 'pending' | 'acknowledged' | 'investigating' | 'resolved' | 'closed';
export type IncidentOrigin = 'volunteer_upload' | 'verified_external';
export type IncidentVerificationStatus = 'submitted' | 'verified';

export interface IncidentSource {
  origin: IncidentOrigin;
  verificationStatus: IncidentVerificationStatus;
  platform?: string;
  publisher?: string;
  url?: string;
}

export interface IncidentReport {
  id: string;
  category: IncidentCategory;
  subcategory: string;
  description: string;
  severity: SeverityLevel;
  status: IncidentStatus;
  timestamp: string;
  location: {
    lat: number | null;
    lng: number | null;
    address?: string;
    confidence: number;
    source?: string;
    mode?: 'accurate' | 'approximate';
  };
  evidence: EvidenceFile[];
  anonymous: boolean;
  userId?: string;
  source: IncidentSource;
}

export interface EvidenceFile {
  id: string;
  name: string;
  type: 'photo' | 'video' | 'audio' | 'document' | 'text';
  url: string;
  size: number;
  timestamp: string;
}

export type ConnectionStatus = 'online' | 'offline' | 'syncing';

export interface SyncQueueItem {
  id: string;
  report: IncidentReport;
  status: 'pending' | 'syncing' | 'failed';
  retries: number;
  createdAt: string;
}
