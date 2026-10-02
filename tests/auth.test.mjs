import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';

test('mocked Cognito creates a new account, signs into an existing one, and never uses guest state as authentication', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost:5173' });
  for (const key of ['window', 'document', 'navigator', 'location', 'localStorage', 'HTMLElement']) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'HTMLElement' ? dom.window.HTMLElement : dom.window[key] });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.mockSignedIn = false;
  globalThis.mockFirstSignInIncomplete = true;
  globalThis.authCalls = [];
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.endsWith('/config.json')) return { ok: true, json: async () => ({ apiUrl: 'http://localhost:8787', userPoolId: 'ap-south-1_demo', userPoolClientId: 'demo-client', region: 'ap-south-1' }) };
    if (target.endsWith('/me/state')) return { ok: true, json: async () => ({ profile: { name: 'Test Student', role: 'Junior Backend Engineer', background: 'Built APIs', githubUsername: '' }, evidence: [], analyses: [], submissions: [] }) };
    throw new Error(`Unexpected request: ${target}`);
  };
  const { createRoot } = await import('react-dom/client');
  await mkdir('tests/.generated', { recursive: true });
  await build({
    entryPoints: ['src/App.tsx'], outfile: 'tests/.generated/App-auth.mjs', bundle: true, format: 'esm', platform: 'node', packages: 'external',
    plugins: [{ name: 'mock-cognito', setup(builder) {
      builder.onResolve({ filter: /^aws-amplify$/ }, () => ({ path: 'amplify', namespace: 'mock-cognito' }));
      builder.onResolve({ filter: /^aws-amplify\/auth$/ }, () => ({ path: 'auth', namespace: 'mock-cognito' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock-cognito' }, args => ({ loader: 'js', contents: args.path === 'amplify'
        ? 'export const Amplify = { configure() { globalThis.authCalls.push("configure"); } };'
        : `export async function fetchAuthSession() { return { tokens: globalThis.mockSignedIn ? { accessToken: { toString: () => 'fake-token' } } : undefined }; }
           export async function signUp() { globalThis.authCalls.push('signUp'); if (globalThis.authCalls.filter(call => call === 'signUp').length > 1) { const error = new Error('Account exists'); error.name = 'UsernameExistsException'; throw error; } return { isSignUpComplete: true }; }
           export async function signIn() { globalThis.authCalls.push('signIn'); if (globalThis.mockFirstSignInIncomplete) { globalThis.mockFirstSignInIncomplete = false; return { isSignedIn: false }; } globalThis.mockSignedIn = true; return { isSignedIn: true }; }
           export async function signOut() { globalThis.authCalls.push('signOut'); globalThis.mockSignedIn = false; }` }));
    } }],
  });
  const { default: App } = await import(pathToFileURL(`${process.cwd()}/tests/.generated/App-auth.mjs`).href);
  const root = createRoot(document.getElementById('root'));
  async function click(text) {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes(text));
    assert.ok(button, `Missing button: ${text}`);
    await act(async () => { button.click(); });
  }
  async function fill(input, value) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
  }
  async function submit() { await act(async () => { document.querySelector('[role="dialog"] form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); }); }
  try {
    await act(async () => { root.render(React.createElement(App)); });
    assert.ok(document.querySelector('.landing'));
    await click('Create student account');
    assert.ok(document.querySelector('input[type="email"]'));
    assert.ok(document.querySelector('input[type="password"]'));
    assert.equal(document.querySelector('.sidebar'), null);
    await fill(document.querySelector('input[type="email"]'), 'student@example.com');
    await fill(document.querySelector('input[type="password"]'), 'TestPassword123');
    await submit();
    assert.ok(globalThis.authCalls.includes('signUp'));
    assert.equal(globalThis.mockSignedIn, false);
    assert.equal(document.querySelector('input[name="confirmationCode"]'), null);
    assert.ok(document.querySelector('input[type="password"]'));
    assert.ok(globalThis.authCalls.includes('signIn'));
    assert.match(document.querySelector('[role="dialog"] [role="alert"]').textContent, /Additional account verification is required/);
    assert.equal(document.querySelector('.sidebar'), null);
    await submit();
    assert.equal(document.querySelector('.demo-strip'), null);
    assert.match(document.querySelector('.sidebar-footer').textContent, /Test Student/);
    await act(async () => { document.querySelector('button[aria-label="Profile menu"]').click(); });
    await click('Sign out');
    assert.ok(globalThis.authCalls.includes('signOut'));
    assert.ok(document.querySelector('.landing'));
  } finally {
    act(() => { root.unmount(); });
    dom.window.close();
  }
});
