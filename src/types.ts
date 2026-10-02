export type FindingLevel = 'strong' | 'limited' | 'none';

export interface Source {
  label: string;
  url: string;
}

export interface Finding {
  skill: string;
  level: FindingLevel;
  reason: string;
  sources: Source[];
}

export interface Analysis {
  repository: string;
  repositoryUrl: string;
  analyzedAt: string;
  findings: Finding[];
  inspectedFiles: number;
  note: string;
}

export interface ProofCheck {
  label: string;
  status: 'passed' | 'needs-work' | 'unverified';
  detail: string;
  url?: string;
}

export interface Submission {
  id: string;
  url: string;
  submittedAt: string;
  checks: ProofCheck[];
}

export interface Evidence {
  id: string;
  kind: 'github' | 'project' | 'certificate';
  label: string;
  url?: string;
  status: 'confirmed' | 'student submitted';
  addedAt: string;
}

export interface Profile {
  name: string;
  role: string;
  background: string;
  githubUsername: string;
}

export interface ExamPage { document: string; page: number; text: string }
export interface ExamTopic { title: string; reason: string; references: { document: string; page: number }[]; priority: 'High' | 'Medium' }
export interface ExamQuestion { question: string; answer: string; reference: { document: string; page: number } }
export interface ExamPrep {
  documents: { name: string; kind: 'syllabus' | 'past paper'; pages: number }[];
  pages: ExamPage[];
  topics: ExamTopic[];
  questions: ExamQuestion[];
  plan: { day: number; focus: string; task: string }[];
  updatedAt: string;
}

export interface AppState {
  profile: Profile;
  evidence: Evidence[];
  analyses: Analysis[];
  submissions: Submission[];
  exam?: ExamPrep;
}

export const initialState: AppState = {
  profile: { name: '', role: 'Junior Backend Engineer', background: '', githubUsername: '' },
  evidence: [], analyses: [], submissions: [],
};
