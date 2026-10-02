import test from 'node:test';
import assert from 'node:assert/strict';

process.env.LOCAL_DEV = '1';
const { handler } = await import('../backend/handler.js');

const originalFetch = globalThis.fetch;
const metadata = { full_name: 'student/tasks-api', html_url: 'https://github.com/student/tasks-api', default_branch: 'main', private: false };
const tree = { truncated: false, tree: [
  'src/routes/tasks.ts', 'src/db/schema.sql', 'tests/api.test.ts', '.github/workflows/test.yml', 'README.md',
].map(path => ({ type: 'blob', path })) };

function event(path, body) { return { rawPath: path, body: JSON.stringify(body), requestContext: { http: { method: 'POST', sourceIp: '127.0.0.1' } } }; }
function mockGithub(url) {
  const path = new URL(url).pathname;
  let data;
  if (path.endsWith('/git/trees/main')) data = tree;
  else if (path.endsWith('/pulls/12/files')) data = [{ filename: 'tests/api.test.ts', patch: '+ test("GET /tasks", ... )\n+ test("POST /tasks", ...)' }];
  else if (path.endsWith('/pulls/12')) data = { html_url: 'https://github.com/student/tasks-api/pull/12' };
  else data = metadata;
  return Promise.resolve({ ok: true, status: 200, json: async () => data });
}

test('analysis links deterministic signals to source and preserves uncertainty', async () => {
  globalThis.fetch = mockGithub;
  try {
    const result = await handler(event('/public/analyze', { url: metadata.html_url }));
    assert.equal(result.statusCode, 200);
    const body = JSON.parse(result.body);
    assert.equal(body.repository, 'student/tasks-api');
    assert.equal(body.findings.find(f => f.skill === 'API design').level, 'limited');
    assert.equal(body.findings.find(f => f.skill === 'Testing').sources[0].url, 'https://github.com/student/tasks-api/blob/main/tests/api.test.ts');
    assert.equal(body.findings.find(f => f.skill === 'Deployment').level, 'none');
    assert.match(body.findings.find(f => f.skill === 'Deployment').reason, /does not show whether/);
  } finally { globalThis.fetch = originalFetch; }
});

test('proof check distinguishes inspected changes from unverified runtime behavior', async () => {
  globalThis.fetch = mockGithub;
  try {
    const result = await handler(event('/public/check-proof', { url: 'https://github.com/student/tasks-api/pull/12', repositoryUrl: metadata.html_url }));
    assert.equal(result.statusCode, 200);
    const checks = JSON.parse(result.body).checks;
    assert.equal(checks.find(c => c.label === 'Integration test files').status, 'passed');
    assert.equal(checks.find(c => c.label === 'Endpoint methods in test diff').status, 'passed');
    assert.equal(checks.find(c => c.label === 'Tests pass and behavior is correct').status, 'unverified');
  } finally { globalThis.fetch = originalFetch; }
});

test('analysis refuses non GitHub hosts', async () => {
  const result = await handler(event('/public/analyze', { url: 'https://example.com/student/tasks-api' }));
  assert.equal(result.statusCode, 400);
});

test('guided ASUR separates missing evidence from ability and grounds follow-ups in refreshed sources', async () => {
  globalThis.fetch = mockGithub;
  try {
    const before = await handler(event('/public/chat', { message: 'Do I have testing evidence?', context: { profile: { role: 'Junior Backend Engineer' }, analyses: [] } }));
    assert.equal(before.statusCode, 200);
    assert.match(JSON.parse(before.body).reply, /do not have confirmed public repository evidence/);
    const after = await handler(event('/public/chat', { message: 'What does my testing evidence show?', context: { profile: { role: 'Junior Backend Engineer', background: 'Built an API' }, analyses: [{ repositoryUrl: metadata.html_url, findings: [{ skill: 'Testing', level: 'strong', reason: 'Forged' }] }] } }));
    const answer = JSON.parse(after.body);
    assert.equal(answer.mode, 'guided');
    assert.match(answer.reply, /limited public file path|A relevant public file path/);
    assert.doesNotMatch(answer.reply, /Forged/);
    assert.match(answer.reply, /tests\/api.test.ts/);
    const followUp = await handler(event('/public/chat', { message: 'What should I do next about that?', history: [{ role: 'user', text: 'What does my testing evidence show?' }, { role: 'assistant', text: answer.reply }], context: { profile: { role: 'Junior Backend Engineer' }, analyses: [{ repositoryUrl: metadata.html_url }] } }));
    assert.match(JSON.parse(followUp.body).reply, /Add integration tests for three API endpoints/);
  } finally { globalThis.fetch = originalFetch; }
});

test('guided ASUR reports an evidence refresh failure instead of reusing unverified client findings', async () => {
  globalThis.fetch = async () => { throw new Error('network unavailable'); };
  try {
    const result = await handler(event('/public/chat', { message: 'What does testing show?', context: { profile: {}, analyses: [{ repositoryUrl: 'https://github.com/student/other-api', findings: [{ skill: 'Testing', level: 'strong' }] }] } }));
    assert.match(JSON.parse(result.body).reply, /could not refresh the public repository/);
  } finally { globalThis.fetch = originalFetch; }
});

test('ASUR keeps portfolio evidence and uploaded study sources separate', async () => {
  globalThis.fetch = mockGithub;
  const context = { profile: {}, analyses: [{ repositoryUrl: metadata.html_url }], exam: { topics: [{ title: 'Database Design' }], pages: [{ document: 'syllabus.txt', page: 2, text: 'API testing and integration tests.' }] } };
  try {
    const skill = await handler(event('/public/chat', { message: 'What evidence supports my API design skill?', context }));
    assert.match(JSON.parse(skill.body).reply, /API design in student\/tasks-api/);
    assert.match(JSON.parse(skill.body).reply, /github.com\/student\/tasks-api/);
    assert.doesNotMatch(JSON.parse(skill.body).reply, /syllabus\.txt/);
    const study = await handler(event('/public/chat', { message: 'What should I study from my syllabus?', context }));
    assert.match(JSON.parse(study.body).reply, /syllabus\.txt, p\. 2/);
    assert.doesNotMatch(JSON.parse(study.body).reply, /useful starting topic is Database Design/);
    const unknown = await handler(event('/public/chat', { message: 'What does my syllabus say about Kubernetes?', context }));
    assert.match(JSON.parse(unknown.body).reply, /could not find kubernetes/i);
  } finally { globalThis.fetch = originalFetch; }
});

test('ASUR answers a study question without waiting for a repository refresh', async () => {
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; throw new Error('GitHub is unavailable'); };
  try {
    const result = await handler(event('/public/chat', { message: 'What should I study from my syllabus?', context: { profile: {}, analyses: [{ repositoryUrl: 'https://github.com/student/other-api' }], exam: { topics: [{ title: 'API Testing' }], pages: [{ document: 'course-syllabus.txt', page: 3, text: 'API testing covers endpoint responses and failure cases.' }] } } }));
    assert.equal(result.statusCode, 200);
    assert.equal(fetches, 0);
    assert.match(JSON.parse(result.body).reply, /course-syllabus\.txt, p\. 3/);
  } finally { globalThis.fetch = originalFetch; }
});

test('ASUR summarizes only topics supported by readable uploaded pages', async () => {
  const result = await handler(event('/public/chat', { message: 'Summarize the key topics in my syllabus', context: { profile: {}, exam: { topics: [{ title: 'Database Design' }, { title: 'API Testing' }], pages: [{ document: 'syllabus.txt', page: 2, text: 'API testing covers endpoint responses and integration tests.' }] } } }));
  assert.equal(result.statusCode, 200);
  const reply = JSON.parse(result.body).reply;
  assert.match(reply, /API Testing \(syllabus\.txt, p\. 2\)/);
  assert.doesNotMatch(reply, /Database Design/);
});

test('protected state and upload routes reject a guest', async () => {
  for (const path of ['/me/state', '/me/upload']) {
    const result = await handler(event(path, {}));
    assert.equal(result.statusCode, 401);
  }
});

test('malformed JSON is a client error and GitHub outages have a retryable status', async () => {
  const invalid = await handler({ rawPath: '/public/analyze', body: '{invalid', requestContext: { http: { method: 'POST', sourceIp: '127.0.0.1' } } });
  assert.equal(invalid.statusCode, 400);
  globalThis.fetch = async () => { throw new Error('network down'); };
  try {
    const outage = await handler(event('/public/analyze', { url: metadata.html_url }));
    assert.equal(outage.statusCode, 503);
    assert.match(JSON.parse(outage.body).error, /try again/);
  } finally { globalThis.fetch = originalFetch; }
});
