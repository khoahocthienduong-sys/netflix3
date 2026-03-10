export interface NetfetchUser {
  id: string;
  username: string;
  isAdmin: boolean;
  createdAt: string;
  hasImapConfigured: boolean;
}

export interface ImapConfigData {
  email: string;
  host: string;
  port: number;
  allowedSenders: string;
  isShared?: boolean;
}

export interface NetflixCodeResult {
  code: string | null;
  subject: string;
  from: string;
  date: string;
  rawBody?: string;
}
