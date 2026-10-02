import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from 'aws-amplify/auth';
import type { Analysis, AppState, Submission } from './types';

export interface RuntimeConfig {
  apiUrl: string;
  userPoolId: string;
  userPoolClientId: string;
  region: string;
}

let config: RuntimeConfig = { apiUrl: '', userPoolId: '', userPoolClientId: '', region: '' };

export async function loadConfig(): Promise<RuntimeConfig> {
  try {
    const response = await fetch('/config.json', { cache: 'no-store' });
    if (response.ok) config = await response.json() as RuntimeConfig;
  } catch { /* Local demo can run without AWS configuration. */ }
  if (!config.apiUrl && ['localhost', '127.0.0.1'].includes(location.hostname)) config.apiUrl = 'http://localhost:8788';
  if (config.userPoolId && config.userPoolClientId) {
    Amplify.configure({ Auth: { Cognito: {
      userPoolId: config.userPoolId,
      userPoolClientId: config.userPoolClientId,
    } } });
  }
  return config;
}

export function isConfigured() { return Boolean(config.apiUrl); }
export function authConfigured() { return Boolean(config.userPoolId && config.userPoolClientId); }

async function request<T>(path: string, method = 'GET', body?: unknown, authenticated = false): Promise<T> {
  if (!config.apiUrl) throw new Error('The AWS API is not configured for this build.');
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authenticated) {
    const session = await fetchAuthSession();
    const token = session.tokens?.accessToken?.toString();
    if (!token) throw new Error('Please sign in again.');
    headers.Authorization = `Bearer ${token}`;
  }
  let response: Response;
  try { response = await fetch(`${config.apiUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new Error('SkillBridge could not reach its API. Check your connection and try again.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}

export const api = {
  analyze: (url: string) => request<Analysis>('/public/analyze', 'POST', { url }),
  checkProof: (url: string, repositoryUrl: string) => request<Submission>('/public/check-proof', 'POST', { url, repositoryUrl }),
  repositories: (username: string) => request<{ repos: { name: string; html_url: string; description: string | null }[] }>(`/public/repos?username=${encodeURIComponent(username)}`),
  chat: (message: string, state: AppState, history: { role: 'user' | 'assistant'; text: string }[]) => request<{ reply: string; mode: 'bedrock' | 'guided' }>('/public/chat', 'POST', { message, history: history.slice(-8), context: {
    profile: state.profile,
    analyses: state.analyses.slice(0, 2),
    evidence: state.evidence.slice(0, 8),
    exam: state.exam ? { documents: state.exam.documents, topics: state.exam.topics, pages: state.exam.pages.slice(0, 40).map(page => ({ ...page, text: page.text.slice(0, 1500) })) } : undefined,
  } }),
  getState: () => request<AppState>('/me/state', 'GET', undefined, true),
  putState: (state: AppState) => request<AppState>('/me/state', 'PUT', state, true),
  upload: (name: string, type: string, base64: string) => request<{ key: string }>('/me/upload', 'POST', { name, type, base64 }, true),
};
