import { MeshMessage } from './bluetooth-mesh';
import { CATEGORY_LABELS, IncidentCategory, IncidentReport, SeverityLevel } from './types';

const severityOrder: SeverityLevel[] = ['critical', 'high', 'medium', 'low'];

export interface AdminAnalyticsSnapshot {
  totalReports: number;
  criticalReports: number;
  activeReports: number;
  resolvedReports: number;
  accurateLocations: number;
  approximateLocations: number;
  averageConfidence: number;
  topCategory: string;
  topSeverity: SeverityLevel;
  peakHourLabel: string;
  queueBacklog: number;
  meshPending: number;
  meshDelivered: number;
  byCategory: Array<{ key: IncidentCategory; label: string; count: number; share: number }>;
  bySeverity: Array<{ key: SeverityLevel; count: number; share: number }>;
  byStatus: Array<{ key: string; count: number; share: number }>;
  byHour: Array<{ hour: number; label: string; count: number }>;
  insights: string[];
}

function percent(count: number, total: number) {
  if (total === 0) {
    return 0;
  }

  return Math.round((count / total) * 100);
}

export function buildAdminAnalytics(
  incidents: IncidentReport[],
  meshMessages: MeshMessage[],
  queueBacklog: number,
): AdminAnalyticsSnapshot {
  const totalReports = incidents.length;
  const criticalReports = incidents.filter((incident) => incident.severity === 'critical').length;
  const activeReports = incidents.filter((incident) =>
    ['pending', 'acknowledged', 'investigating'].includes(incident.status),
  ).length;
  const resolvedReports = incidents.filter((incident) =>
    ['resolved', 'closed'].includes(incident.status),
  ).length;
  const accurateLocations = incidents.filter((incident) => incident.location.mode !== 'approximate').length;
  const approximateLocations = incidents.filter((incident) => incident.location.mode === 'approximate').length;
  const averageConfidence = totalReports === 0
    ? 0
    : Math.round(
        incidents.reduce((sum, incident) => sum + (incident.location.confidence ?? 0), 0) /
          totalReports *
          100,
      );

  const byCategory = (Object.keys(CATEGORY_LABELS) as IncidentCategory[]).map((key) => {
    const count = incidents.filter((incident) => incident.category === key).length;
    return {
      key,
      label: CATEGORY_LABELS[key],
      count,
      share: percent(count, totalReports),
    };
  });

  const bySeverity = severityOrder.map((key) => {
    const count = incidents.filter((incident) => incident.severity === key).length;
    return {
      key,
      count,
      share: percent(count, totalReports),
    };
  });

  const byStatus = ['pending', 'acknowledged', 'investigating', 'resolved', 'closed'].map((key) => {
    const count = incidents.filter((incident) => incident.status === key).length;
    return {
      key,
      count,
      share: percent(count, totalReports),
    };
  });

  const byHour = Array.from({ length: 24 }, (_, hour) => {
    const count = incidents.filter(
      (incident) => new Date(incident.timestamp).getHours() === hour,
    ).length;
    return {
      hour,
      label: `${hour.toString().padStart(2, '0')}:00`,
      count,
    };
  });

  const topCategory = byCategory.slice().sort((a, b) => b.count - a.count)[0]?.label ?? 'No data';
  const topSeverity = bySeverity.slice().sort((a, b) => b.count - a.count)[0]?.key ?? 'low';
  const peakHour = byHour.slice().sort((a, b) => b.count - a.count)[0];
  const peakHourLabel = peakHour ? peakHour.label : 'No data';

  const meshPending = meshMessages.filter((message) => message.relay_status !== 'delivered').length;
  const meshDelivered = meshMessages.filter((message) => message.relay_status === 'delivered').length;

  const insights: string[] = [];

  if (criticalReports > 0) {
    insights.push(`${criticalReports} critical report(s) need the fastest relay path and admin attention.`);
  }

  if (approximateLocations > accurateLocations && totalReports > 0) {
    insights.push('Approximate location usage is overtaking accurate GPS, so field guidance should encourage precise fixes where safe.');
  } else if (accurateLocations > 0) {
    insights.push(`${accurateLocations} report(s) are using accurate GPS, which improves hotspot confidence.`);
  }

  if (queueBacklog > 0 || meshPending > 0) {
    insights.push(`There are ${queueBacklog} sync item(s) and ${meshPending} mesh packet(s) waiting, which signals degraded connectivity in the field.`);
  } else {
    insights.push('The local queue is clear, which means the device fleet is currently keeping up with delivery.');
  }

  if (totalReports > 0) {
    insights.push(`${topCategory} is the top incident cluster, with the busiest reporting window around ${peakHourLabel}.`);
  }

  return {
    totalReports,
    criticalReports,
    activeReports,
    resolvedReports,
    accurateLocations,
    approximateLocations,
    averageConfidence,
    topCategory,
    topSeverity,
    peakHourLabel,
    queueBacklog,
    meshPending,
    meshDelivered,
    byCategory,
    bySeverity,
    byStatus,
    byHour,
    insights,
  };
}
