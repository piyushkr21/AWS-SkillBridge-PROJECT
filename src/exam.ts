import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { jsPDF } from 'jspdf';
import type { ExamPage, ExamPrep, ExamQuestion, ExamTopic } from './types';

GlobalWorkerOptions.workerSrc = new URL('../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const common = new Set('the and for with from into this that your their these those unit module chapter section topic topics course learning outcomes students student introduction overview basic basics using use understand describe explain discuss compare apply how what why when where which are was were can will should have has had more about including between each all its our you covers cover includes include'.split(' '));
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
const titleCase = (value: string) => value.replace(/\b\w+/g, word => /^(api|sql|http|rest|ci|cd)$/i.test(word) ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1).toLowerCase());

export async function readExamFile(file: File): Promise<ExamPage[]> {
  if (file.size > 8_000_000) throw new Error(`${file.name}: file exceeds the 8 MB limit.`);
  if (/\.pdf$/i.test(file.name)) {
    let pdf;
    try { pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true }).promise; }
    catch { throw new Error(`${file.name}: this PDF could not be read. Try an unencrypted text-based PDF.`); }
    if (pdf.numPages > 60) throw new Error(`${file.name}: PDFs are limited to 60 pages.`);
    const pages: ExamPage[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = clean(content.items.map(item => 'str' in item ? item.str : '').join(' ')).slice(0, 2600);
      if (text) pages.push({ document: file.name, page: number, text });
    }
    if (!pages.length || pages.reduce((n, page) => n + page.text.length, 0) < 40) throw new Error(`${file.name}: no readable text was found. This may be a scanned PDF; OCR is not available in this demo.`);
    return pages;
  }
  if (/\.(txt|md)$/i.test(file.name)) {
    const text = await file.text();
    if (!clean(text)) throw new Error(`${file.name}: the file is empty.`);
    if (text.length > 100_000) throw new Error(`${file.name}: text files are limited to 100,000 characters.`);
    return text.match(/[\s\S]{1,2600}/g)!.map((part, i) => ({ document: file.name, page: i + 1, text: clean(part) })).filter(page => page.text);
  }
  throw new Error(`${file.name}: unsupported format. Upload a text-based PDF, TXT, or Markdown file. Scanned images and DOCX need OCR or conversion first.`);
}

function candidates(pages: ExamPage[]) {
  const headings = new Map<string, { score: number; refs: { document: string; page: number }[] }>();
  for (const page of pages) {
    for (const match of page.text.matchAll(/\b(?:unit|module|chapter)\s+\d+(?:\.\d+)?\s*[:.-]\s*([^.!?;:]{3,70})/gi)) {
      const phrase = clean(match[1]);
      if (phrase.split(' ').length > 7) continue;
      const key = phrase.toLowerCase();
      const entry = headings.get(key) || { score: 0, refs: [] };
      entry.score += 1;
      if (!entry.refs.some(ref => ref.document === page.document && ref.page === page.page)) entry.refs.push({ document: page.document, page: page.page });
      headings.set(key, entry);
    }
  }
  if (headings.size >= 2) return [...headings].sort((a, b) => b[1].score - a[1].score);
  const score = new Map<string, { score: number; refs: { document: string; page: number }[] }>();
  for (const page of pages) {
    const segments = page.text.split(/(?<=[.!?;:])\s+|\s{2,}|\s*[•●]\s*/).map(clean);
    const phrases = new Set<string>();
    for (const segment of segments) {
      const words = segment.match(/[A-Za-z][A-Za-z+#.-]*/g) || [];
      const useful = words.filter(word => word.length > 2 && !common.has(word.toLowerCase()));
      if (useful.length < 2) continue;
      const phrase = clean(useful.slice(0, 5).join(' ')).replace(/[.,;:]+$/, '');
      if (phrase.length < 8 || phrase.length > 65) continue;
      phrases.add(phrase);
      if (phrases.size >= 15) break;
    }
    for (const phrase of phrases) {
      const key = phrase.toLowerCase();
      const entry = score.get(key) || { score: 0, refs: [] };
      entry.score += 1;
      if (!entry.refs.some(ref => ref.document === page.document && ref.page === page.page)) entry.refs.push({ document: page.document, page: page.page });
      score.set(key, entry);
    }
  }
  return [...score].sort((a, b) => b[1].score - a[1].score || a[0].length - b[0].length).slice(0, 8);
}

export function buildExamPrep(syllabus: ExamPage[], papers: ExamPage[], prior?: ExamPrep): ExamPrep {
  const pages = [...syllabus, ...papers];
  if (pages.length > 80) throw new Error('Exam Prep supports up to 80 combined pages or text sections. Remove a file and try again.');
  const syllabusCandidates = candidates(syllabus);
  if (!syllabusCandidates.length) throw new Error('The syllabus text is too short to identify topics. Upload a more detailed text-based document.');
  const paperText = papers.map(page => page.text.toLowerCase());
  const topics: ExamTopic[] = syllabusCandidates.map(([phrase, entry]) => {
    const words = phrase.split(' ').filter(word => word.length > 3);
    const paperRefs = papers.filter((_, i) => words.filter(word => paperText[i].includes(word)).length >= Math.min(2, words.length)).slice(0, 3).map(page => ({ document: page.document, page: page.page }));
    const references = [...entry.refs.slice(0, 2), ...paperRefs];
    return {
      title: titleCase(phrase),
      reason: paperRefs.length ? `Appears in the syllabus and relates to ${paperRefs.length} uploaded past-paper page${paperRefs.length === 1 ? '' : 's'}. Prioritize for practice; this is not a prediction of exam questions.` : `Appears in the uploaded syllabus${entry.refs.length > 1 ? ` on ${entry.refs.length} pages` : ''}. Study priority is based on the supplied material, not an exam prediction.`,
      references,
      priority: paperRefs.length ? 'High' as const : 'Medium' as const,
    };
  }).sort((a, b) => b.references.filter(ref => papers.some(page => page.document === ref.document)).length - a.references.filter(ref => papers.some(page => page.document === ref.document)).length);
  topics.slice(0, papers.length ? 4 : 3).forEach(topic => { topic.priority = 'High'; });
  const questions: ExamQuestion[] = topics.slice(0, 6).map(topic => ({
    question: `Explain ${topic.title.toLowerCase()} and give one practical example.`,
    answer: `Use the cited material to define ${topic.title.toLowerCase()}, then describe an example and a limitation. This is a practice prompt, not a guaranteed exam question.`,
    reference: topic.references[0],
  }));
  const plan = Array.from({ length: 7 }, (_, day) => {
    const topic = topics[day % topics.length];
    return { day: day + 1, focus: topic.title, task: day < 5 ? 'Review the cited page, write a short summary, then answer a practice question without notes.' : 'Recall the main points, retry a practice question, and check gaps against the cited page.' };
  });
  const documents = [...new Map([...((prior?.documents || []).filter(doc => pages.some(page => page.document === doc.name))), ...[...new Set(syllabus.map(page => page.document))].map(name => ({ name, kind: 'syllabus' as const, pages: syllabus.filter(page => page.document === name).length })), ...[...new Set(papers.map(page => page.document))].map(name => ({ name, kind: 'past paper' as const, pages: papers.filter(page => page.document === name).length }))].map(doc => [doc.name, doc])).values()];
  return { documents, pages, topics, questions, plan, updatedAt: new Date().toISOString() };
}

export function studyPdfBlob(exam: ExamPrep) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  let y = 52;
  const width = 505;
  const write = (value: string, size = 10, gap = 8) => {
    pdf.setFontSize(size);
    for (const line of pdf.splitTextToSize(value, width)) {
      if (y > 785) { pdf.addPage(); y = 52; }
      pdf.text(line, 45, y); y += size * 1.45;
    }
    y += gap;
  };
  write('SkillBridge | Exam Prep study guide', 19, 10);
  write('Priorities and practice are study suggestions based on uploaded text. No topic or question is guaranteed to appear on an exam.', 10, 20);
  write('Priority topics', 15);
  exam.topics.forEach((topic, i) => { write(`${i + 1}. ${topic.title} (${topic.priority})`, 11, 3); write(topic.reason, 9, 3); write(`Sources: ${topic.references.map(ref => `${ref.document}, p. ${ref.page}`).join('; ')}`, 8, 10); });
  write('Practice questions', 15);
  exam.questions.forEach((item, i) => { write(`${i + 1}. ${item.question}`, 10, 3); write(`Study cue: ${item.answer}`, 9, 3); write(`Source: ${item.reference.document}, p. ${item.reference.page}`, 8, 10); });
  write('Seven-day study plan', 15);
  exam.plan.forEach(item => write(`Day ${item.day}: ${item.focus}. ${item.task}`, 10, 8));
  return pdf.output('blob');
}
