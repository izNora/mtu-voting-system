export interface VerifiedVoterSession {
  voterId: string;
  festival?: string;
  festivalTargetId?: number;
  verifiedAt: number;
}

const REGISTRY_KEY = "verified_voter_sessions";
const ACTIVE_KEY = "active_verified_voter_id";

export function getVerifiedSessions(): VerifiedVoterSession[] {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => x && x.voterId) : [];
  } catch {
    return [];
  }
}

export function saveVerifiedSession(session: VerifiedVoterSession) {
  const sessions = getVerifiedSessions().filter((x) => x.voterId !== session.voterId);
  sessions.push(session);
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(sessions));
  sessionStorage.setItem(ACTIVE_KEY, session.voterId);
}

export function removeVerifiedSession(voterId: string) {
  const sessions = getVerifiedSessions().filter((x) => x.voterId !== voterId);
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(sessions));
  if (sessionStorage.getItem(ACTIVE_KEY) === voterId) sessionStorage.removeItem(ACTIVE_KEY);
}

export function getSession(voterId: string | null | undefined) {
  if (!voterId) return undefined;
  return getVerifiedSessions().find((x) => x.voterId === voterId);
}

export function getActiveVoterId() {
  return sessionStorage.getItem(ACTIVE_KEY);
}

export function setActiveVoterId(voterId: string) {
  sessionStorage.setItem(ACTIVE_KEY, voterId);
}
