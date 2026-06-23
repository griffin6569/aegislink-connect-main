import { IncidentCategory, SeverityLevel } from './types';

interface IncidentAssessmentInput {
  category: IncidentCategory;
  subcategory?: string;
  severity: SeverityLevel;
  description: string;
  locationMode?: 'accurate' | 'approximate';
}

const categoryAdvice: Record<IncidentCategory, string> = {
  crime: 'Prioritize witness safety, avoid confrontation, and keep identifiers or vehicle details when possible.',
  safety_hazard: 'Mark the hazard clearly, keep people away from the area, and escalate if it threatens movement or visibility.',
  emergency: 'Treat this as time-sensitive, relay immediately, and keep a direct route open for responders.',
  community_violation: 'Capture consistent evidence, note repeat patterns, and flag escalation if the behavior is becoming unsafe.',
};

export function generateIncidentAssessment(input: IncidentAssessmentInput) {
  const normalized = input.description.toLowerCase();
  const flags: string[] = [];

  if (/(weapon|gun|knife|armed|explosive)/.test(normalized)) {
    flags.push('Potential weapon mention detected.');
  }

  if (/(fire|smoke|burn|flame)/.test(normalized)) {
    flags.push('Fire-related cues suggest rapid escalation risk.');
  }

  if (/(injury|bleeding|unconscious|medical)/.test(normalized)) {
    flags.push('Medical harm indicators are present.');
  }

  if (/(crowd|group|mob|many people)/.test(normalized)) {
    flags.push('Crowd dynamics may increase the chance of spread or panic.');
  }

  const priority =
    input.severity === 'critical' || flags.length >= 2
      ? 'Immediate relay recommended.'
      : input.severity === 'high'
        ? 'High-priority review recommended.'
        : 'Standard review is appropriate unless the situation changes quickly.';

  const locationLine =
    input.locationMode === 'approximate'
      ? 'Approximate location is attached, so responders may need an extra confirmation step.'
      : 'Accurate location is attached, which strengthens routing and hotspot confidence.';

  return [
    `Local assessment for ${input.subcategory || input.category}: ${priority}`,
    categoryAdvice[input.category],
    locationLine,
    ...(flags.length > 0 ? flags : ['No major escalation keywords were detected in the description.']),
  ].join('\n');
}
