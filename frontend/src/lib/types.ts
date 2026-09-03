export type Category = 'King' | 'Queen' | 'Smart' | 'Style' | 'Mr. Popular' | 'Ms. Popular';

export interface Candidate {
  id: string;
  name: string;
  category: Category;
  department: string;
  year: string;
  photoUrl: string;
  bio: string;
  votes: number;
  number?: string;
}

export interface VotingSettings {
  enabledCategories: Category[];
  votingEndDate: string;
  votingActive: boolean;
}

export interface VotingEvent {
  title: string;
  boyTitle: string;
  girlTitle: string;
  endDate: string;
  isActive: boolean;
}

export interface AdminUser {
  email: string;
  name: string;
  role: string;
}

export const ALL_CATEGORIES: Category[] = ['King', 'Queen', 'Smart', 'Style', 'Mr. Popular', 'Ms. Popular'];
export const DEFAULT_CATEGORIES: Category[] = ['King', 'Queen', 'Smart', 'Style'];
export const OPTIONAL_CATEGORIES: Category[] = ['Mr. Popular', 'Ms. Popular'];