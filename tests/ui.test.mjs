import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';

test('local auth gate and ASUR conversation work in guest demo', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost:5173' });
  for (const key of ['window', 'document', 'navigator', 'location', 'localStorage', 'HTMLElement']) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'HTMLElement' ? dom.window.HTMLElement : dom.window[key] });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  const requests = [];
  const analysis = {
    repository: 'fastapi/fastapi', repositoryUrl: 'https://github.com/fastapi/fastapi', analyzedAt: new Date().toISOString(), inspectedFiles: 10,
    note: 'Deterministic file path checks only.',
    findings: [
      { skill: 'API design', level: 'strong', reason: 'Two route files found.', sources: [{ label: 'src/routes/tasks.py', url: 'https://github.com/fastapi/fastapi/blob/main/src/routes/tasks.py' }] },
      { skill: 'Testing', level: 'limited', reason: 'One test file found.', sources: [{ label: 'tests/api.py', url: 'https://github.com/fastapi/fastapi/blob/main/tests/api.py' }] },
    ],
  };
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.endsWith('/config.json')) return { ok: false, json: async () => ({}) };
    const body = options.body ? JSON.parse(options.body) : {};
    requests.push({ target, body });
    if (target.endsWith('/public/analyze')) return body.url === 'https://github.com/nobody/not-a-repo'
      ? { ok: false, status: 400, json: async () => ({ error: 'Use a public GitHub repository URL.' }) }
      : { ok: true, json: async () => analysis };
    if (target.endsWith('/public/check-proof')) return { ok: true, json: async () => ({ id: 'proof-1', url: body.url, submittedAt: new Date().toISOString(), checks: [
      { label: 'Public pull request', status: 'passed', detail: 'Publicly accessible.' },
      { label: 'Tests pass and behavior is correct', status: 'unverified', detail: 'Code was not run.' },
    ] }) };
    if (target.endsWith('/public/chat')) return { ok: true, json: async () => ({ mode: 'guided', reply: body.context.analyses.length
      ? body.message.includes('next') ? 'Add integration tests for your API.' : 'Testing has limited evidence in fastapi/fastapi. Source: tests/api.py.'
      : 'No confirmed public repository evidence yet. Missing evidence does not mean missing skill.' }) };
    throw new Error(`Unexpected request: ${target}`);
  };
  await mkdir('tests/.generated', { recursive: true });
  await build({ entryPoints: ['src/App.tsx'], outfile: 'tests/.generated/App.mjs', bundle: true, format: 'esm', platform: 'node', packages: 'external', loader: { '.tsx': 'tsx', '.ts': 'ts' } });
  const { default: App } = await import(pathToFileURL(`${process.cwd()}/tests/.generated/App.mjs`).href);
  const root = createRoot(document.getElementById('root'));
  try {
  await act(async () => { root.render(React.createElement(App)); });
  const byText = text => [...document.querySelectorAll('button')].find(button => button.textContent.includes(text));
  async function fill(element, value) {
    const type = element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement : dom.window.HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(type.prototype, 'value').set.call(element, value);
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
  }
  await act(async () => { byText('Sign in').click(); });
  assert.match(document.querySelector('[role="dialog"]').textContent, /unavailable until Cognito is configured/);
  assert.equal(document.querySelector('.sidebar'), null, 'Sign in must not reveal the guest dashboard');
  await act(async () => { document.querySelector('button[aria-label="Close dialog"]').click(); });
  assert.ok(document.querySelector('.landing'));
  await act(async () => { byText('Create student account').click(); });
  assert.match(document.querySelector('[role="dialog"]').textContent, /sign-up are unavailable/);
  assert.equal(document.querySelector('.sidebar'), null);
  await act(async () => { document.querySelector('button[aria-label="Close dialog"]').click(); });
  await act(async () => { byText('Explore Guest demo').click(); });
  await act(async () => { document.querySelector('button[aria-label="Close dialog"]').click(); });
  assert.match(document.querySelector('.demo-strip').textContent, /Guest demo/);
  assert.match(document.querySelector('.sidebar-footer').textContent, /Guest demo/);
  await act(async () => { document.querySelector('button[aria-label="Profile menu"]').click(); });
  assert.match(document.querySelector('.dropdown').textContent, /Sign in/);
  assert.doesNotMatch(document.querySelector('.dropdown').textContent, /Sign out/);
  await act(async () => { document.querySelector('button[aria-label="Profile menu"]').click(); });
  await act(async () => { document.querySelector('button[aria-label="Open ASUR"]')?.click(); });
  assert.ok(document.querySelector('.asur-panel'));
  await act(async () => { byText('Explain this insight').click(); });
  assert.match(document.querySelector('.asur-panel').textContent, /No confirmed public repository evidence/);
  await act(async () => { document.querySelector('button[aria-label="Minimize ASUR"]').click(); });
  assert.equal(document.querySelector('.asur-panel'), null);
  await act(async () => { document.querySelector('button[aria-label="Open ASUR"]').click(); });
  assert.match(document.querySelector('.asur-panel').textContent, /No confirmed public repository evidence/);
  await act(async () => { byText('Set up profile').click(); });
  async function answer(value) {
    const input = document.querySelector('.composer input');
    await fill(input, value);
    await act(async () => { document.querySelector('.composer').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
  }
  await answer('Junior Backend Engineer');
  await answer('Built a REST API with Node and PostgreSQL.');
  assert.equal(JSON.parse(localStorage.getItem('skillbridge-guest')).profile.background, 'Built a REST API with Node and PostgreSQL.');
  await act(async () => { document.querySelector('.add-button').click(); });
  assert.equal(document.querySelector('button:disabled')?.textContent.includes('Upload PDF or image') || [...document.querySelectorAll('button:disabled')].some(button => button.textContent.includes('Upload PDF or image')), true);
  await act(async () => { byText('Review source').click(); });
  await act(async () => { byText('Confirm and analyze').click(); });
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.match(document.querySelector('[role="status"]').textContent, /fastapi\/fastapi analyzed/);
  await act(async () => { byText('Explain this insight').click(); });
  assert.match(document.querySelector('.asur-panel').textContent, /Testing has limited evidence/);
  await answer('What should I do next about that?');
  assert.match(document.querySelector('.asur-panel').textContent, /Add integration tests for your API/);
  assert.ok(requests.filter(request => request.target.endsWith('/public/chat')).at(-1).body.history.some(item => item.text.includes('Explain my latest skill insight')));
  await act(async () => { document.querySelector('button[aria-label="Minimize ASUR"]').click(); });
  await act(async () => { document.querySelector('button[aria-label="Open ASUR"]').click(); });
  assert.match(document.querySelector('.asur-panel').textContent, /Add integration tests for your API/);
  await act(async () => { [...document.querySelectorAll('.nav-item')].find(button => button.textContent.includes('Skill Map')).click(); });
  assert.match(document.querySelector('.skill-grid').textContent, /One test file found/);
  assert.ok(document.querySelector('a[href$="tests/api.py"]'));
  await act(async () => { [...document.querySelectorAll('.nav-item')].find(button => button.textContent.includes('Proof Sprints')).click(); });
  assert.match(document.querySelector('.proof-detail').textContent, /fastapi\/fastapi/);
  await act(async () => { byText('Submit proof').click(); });
  await fill(document.querySelector('input[placeholder*="/pull/123"]'), 'https://github.com/fastapi/fastapi/pull/1');
  await act(async () => { byText('Check proof').click(); });
  assert.match(document.querySelector('.submission-card').textContent, /Unverified/);
  await act(async () => { [...document.querySelectorAll('.nav-item')].find(button => button.textContent.includes('Settings')).click(); });
  assert.equal(document.querySelector('.settings-card textarea').value, 'Built a REST API with Node and PostgreSQL.');
  await fill(document.querySelector('.settings-card textarea'), 'Built two backend APIs.');
  await act(async () => { byText('Save profile').click(); });
  assert.equal(JSON.parse(localStorage.getItem('skillbridge-guest')).profile.background, 'Built two backend APIs.');
  await act(async () => { [...document.querySelectorAll('.nav-item')].find(button => button.textContent.includes('Evidence Library')).click(); });
  assert.match(document.querySelector('.evidence-row').textContent, /fastapi\/fastapi/);
  await act(async () => { [...document.querySelectorAll('.nav-item')].find(button => button.textContent.includes('Activity')).click(); });
  assert.ok([...document.querySelectorAll('.activity-row')].some(row => row.textContent.includes('analyzed')));
  await act(async () => { document.querySelector('.add-button').click(); });
  await fill(document.querySelector('input[placeholder="Or paste https://github.com/owner/repo"]'), 'https://example.com/not-github');
  await act(async () => { byText('Review source').click(); });
  assert.match(document.querySelector('[role="dialog"] [role="alert"]').textContent, /public https:\/\/github.com/);
  assert.equal(document.querySelector('.review-box'), null);
  await fill(document.querySelector('input[placeholder="Or paste https://github.com/owner/repo"]'), 'https://github.com/nobody/not-a-repo');
  await act(async () => { byText('Review source').click(); });
  await act(async () => { byText('Confirm and analyze').click(); });
  assert.match(document.querySelector('[role="dialog"] [role="alert"]').textContent, /public GitHub repository URL/);
  assert.ok(document.querySelector('[role="dialog"]'), 'A failed analysis must keep the review dialog open');
  await act(async () => { document.querySelector('button[aria-label="Close dialog"]').click(); });
  await act(async () => { document.querySelector('button[aria-label="Profile menu"]').click(); });
  await act(async () => { [...document.querySelectorAll('.dropdown button')].find(button => button.textContent === 'Sign in').click(); });
  assert.match(document.querySelector('[role="dialog"]').textContent, /No student account session has been created/);
  await act(async () => { byText('Explore Guest demo').click(); });
  assert.equal(document.querySelector('[role="dialog"]'), null, 'Returning to an existing Guest demo must close account dialog');
  assert.match(document.querySelector('.demo-strip').textContent, /Guest demo/);
  assert.equal(requests.some(request => request.target.includes('/me/')), false, 'Guest changes must not call protected routes');
  } finally {
    act(() => { root.unmount(); });
    dom.window.close();
  }
});
