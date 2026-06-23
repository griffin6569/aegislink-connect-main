import { offlineDB } from './offline-db';
import {
  IncidentCategory,
  IncidentOrigin,
  IncidentReport,
  IncidentStatus,
  IncidentVerificationStatus,
  SeverityLevel,
} from './types';

type IncidentRecord = Record<string, any>;

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function normalizeIncidentRecord(record: IncidentRecord): IncidentReport | null {
  const id = record.display_id ?? record.id;
  const category = record.category as IncidentCategory | undefined;
  const severity = record.severity as SeverityLevel | undefined;
  const status = (record.status ?? 'pending') as IncidentStatus;
  const timestamp = record.created_at ?? record.timestamp;
  const sourceOrigin = (record.report_origin ?? record.source?.origin ?? 'volunteer_upload') as IncidentOrigin;
  const verificationStatus = (
    record.source_verification_status ??
    record.source?.verificationStatus ??
    (sourceOrigin === 'verified_external' ? 'verified' : 'submitted')
  ) as IncidentVerificationStatus;

  if (!id || !category || !severity || !timestamp) {
    return null;
  }

  const lat = toNumber(record.detected_lat ?? record.submitted_lat ?? record.location?.lat);
  const lng = toNumber(record.detected_lng ?? record.submitted_lng ?? record.location?.lng);
  const confidence = toNumber(record.location_confidence ?? record.location?.confidence) ?? 0;
  const source = record.location_source ?? record.location?.source;

  return {
    id: String(id),
    category,
    subcategory: record.subcategory ?? 'Unspecified',
    description: record.description ?? '',
    severity,
    status,
    timestamp: String(timestamp),
    location: {
      lat,
      lng,
      address: record.location_address ?? record.location?.address ?? undefined,
      confidence,
      source: source ?? undefined,
      mode: source === 'gps_approximate' ? 'approximate' : source ? 'accurate' : record.location?.mode,
    },
    evidence: Array.isArray(record.evidence) ? record.evidence : [],
    anonymous: Boolean(record.anonymous),
    userId: record.user_id ?? record.userId ?? undefined,
    source: {
      origin: sourceOrigin,
      verificationStatus: verificationStatus,
      platform: record.source_platform ?? record.source?.platform ?? undefined,
      publisher: record.source_publisher ?? record.source?.publisher ?? undefined,
      url: record.source_url ?? record.source?.url ?? undefined,
    },
  };
}

export function dedupeIncidents(incidents: IncidentReport[]): IncidentReport[] {
  const seen = new Map<string, IncidentReport>();

  incidents.forEach((incident) => {
    const existing = seen.get(incident.id);
    if (!existing) {
      seen.set(incident.id, incident);
      return;
    }

    const existingTime = new Date(existing.timestamp).getTime();
    const nextTime = new Date(incident.timestamp).getTime();
    if (nextTime >= existingTime) {
      seen.set(incident.id, incident);
    }
  });

  return Array.from(seen.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export async function getCachedIncidents(): Promise<IncidentReport[]> {
  const cached = await offlineDB.getIncidents();
  return dedupeIncidents(
    cached
      .map((record) => normalizeIncidentRecord(record))
      .filter((record): record is IncidentReport => Boolean(record)),
  );
}

export async function cacheRemoteIncidents(records: IncidentRecord[]) {
  await Promise.all(
    records.map((record) =>
      offlineDB.saveIncident({
        ...record,
        id: record.display_id ?? record.id,
      }),
    ),
  );
}
