import type { SessionZone } from './types';

export function classifySession(date: Date, sessions: SessionZone[]): SessionZone | null {
  const hour = date.getUTCHours();
  return sessions.find((session) => hour >= session.startHour && hour < session.endHour) ?? null;
}
