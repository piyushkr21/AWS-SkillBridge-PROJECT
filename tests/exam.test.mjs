import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

test('exam guide cites uploaded pages and exports a valid PDF', async () => {
  await mkdir('tests/.generated', { recursive: true });
  await build({ entryPoints: ['src/exam.ts'], outfile: 'tests/.generated/exam.mjs', bundle: true, format: 'esm', platform: 'node', packages: 'external' });
  const { buildExamPrep, studyPdfBlob } = await import(pathToFileURL(`${process.cwd()}/tests/.generated/exam.mjs`).href);
  const syllabus = [{ document: 'syllabus.txt', page: 2, text: 'API testing and integration tests. Database design and SQL queries. Deployment pipelines and monitoring.' }];
  const papers = [{ document: 'paper.txt', page: 4, text: 'Explain API testing and integration tests. Compare SQL queries.' }];
  const result = buildExamPrep(syllabus, papers);
  assert.ok(result.topics.some(topic => topic.references.some(ref => ref.document === 'paper.txt' && ref.page === 4)));
  assert.ok(result.topics.every(topic => /not (a prediction|an exam prediction)/.test(topic.reason)));
  assert.equal(result.plan.length, 7);
  const bytes = new Uint8Array(await studyPdfBlob(result).arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  assert.ok(bytes.length > 1000);
  const structured = buildExamPrep([{ document: 'structured.txt', page: 1, text: 'Backend Systems syllabus Unit 1: API testing. Test REST endpoint responses. Unit 2: Database design. Study SQL tables. Unit 3: Deployment. Review release checks.' }], []);
  assert.deepEqual(structured.topics.map(topic => topic.title), ['API Testing', 'Database Design', 'Deployment']);
});

test('guided ASUR cites the uploaded page instead of inventing a source', async () => {
  process.env.LOCAL_DEV = '1';
  const { handler } = await import('../backend/handler.js');
  const response = await handler({ rawPath: '/public/chat', body: JSON.stringify({ message: 'What should I study first from my syllabus?', context: { profile: {}, exam: { topics: [{ title: 'API Testing' }], pages: [{ document: 'syllabus.txt', page: 2, text: 'API testing covers response codes and integration tests.' }] } } }), requestContext: { http: { method: 'POST', sourceIp: '127.0.0.1' } } });
  assert.equal(response.statusCode, 200);
  assert.match(JSON.parse(response.body).reply, /syllabus\.txt, p\. 2/);
  assert.match(JSON.parse(response.body).reply, /not a guaranteed exam question/i);
});
