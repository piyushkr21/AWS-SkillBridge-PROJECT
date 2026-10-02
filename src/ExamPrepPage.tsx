import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Download, FilePlus2, FileText, HelpCircle, LoaderCircle, UploadCloud } from 'lucide-react';
import type { ExamPrep, ExamPage } from './types';
import { buildExamPrep, readExamFile, studyPdfBlob } from './exam';

type Props = { exam?: ExamPrep; onSave: (exam: ExamPrep) => Promise<void>; onAsk: (question: string) => void; preferred: 'syllabus' | 'past paper' };

export default function ExamPrepPage({ exam, onSave, onAsk, preferred }: Props) {
  const syllabusInput = useRef<HTMLInputElement>(null);
  const papersInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [selectedTopic, setSelectedTopic] = useState(0);
  const [showAnswer, setShowAnswer] = useState<number | null>(null);
  const studyPdf = useMemo(() => exam ? URL.createObjectURL(studyPdfBlob(exam)) : '', [exam]);
  useEffect(() => () => { if (studyPdf) URL.revokeObjectURL(studyPdf); }, [studyPdf]);

  async function receive(files: FileList | null, kind: 'syllabus' | 'past paper') {
    if (!files?.length) return;
    setError(''); setLoading(`Reading ${kind}…`);
    try {
      const incoming: ExamPage[] = [];
      if (files.length > 5) throw new Error('Choose up to five files at a time.');
      for (const file of Array.from(files)) incoming.push(...await readExamFile(file));
      const priorPages = exam?.pages || [];
      const syllabus = kind === 'syllabus' ? incoming : priorPages.filter(page => exam?.documents.some(doc => doc.name === page.document && doc.kind === 'syllabus'));
      const papers = kind === 'past paper' ? [...priorPages.filter(page => exam?.documents.some(doc => doc.name === page.document && doc.kind === 'past paper')), ...incoming] : priorPages.filter(page => exam?.documents.some(doc => doc.name === page.document && doc.kind === 'past paper'));
      if (!syllabus.length) throw new Error('Upload a readable syllabus first, then add past papers.');
      const next = buildExamPrep(syllabus, papers, exam);
      await onSave(next);
      setSelectedTopic(0);
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(''); if (syllabusInput.current) syllabusInput.current.value = ''; if (papersInput.current) papersInput.current.value = ''; }
  }

  const active = exam?.topics[selectedTopic];
  return <section className="page-section exam-page">
    <div className="page-title"><span className="eyebrow">Study with evidence</span><h1>Exam Prep</h1><p>Turn readable syllabus text and past papers into a focused study guide. Priorities are suggestions based on uploaded material, never guaranteed exam questions.</p></div>
    <div className="exam-upload-grid">
      <div className={`card exam-upload ${preferred === 'syllabus' ? 'preferred' : ''}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void receive(e.dataTransfer.files, 'syllabus'); }}><span className="tile violet"><UploadCloud /></span><h2>Upload syllabus</h2><p>Start with a text-based PDF, TXT, or Markdown syllabus. Files are read in your browser; ASUR sends relevant extracted text to the SkillBridge API when you ask a question.</p><button className="primary" onClick={() => syllabusInput.current?.click()} disabled={!!loading}><UploadCloud size={17} /> Choose syllabus</button><input ref={syllabusInput} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" hidden onChange={e => void receive(e.target.files, 'syllabus')} /></div>
      <div className={`card exam-upload ${preferred === 'past paper' ? 'preferred' : ''}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void receive(e.dataTransfer.files, 'past paper'); }}><span className="tile lavender"><FilePlus2 /></span><h2>Add past papers</h2><p>Add up to five text-based files at a time. Repeated themes help order your practice, but do not predict the exam.</p><button className="secondary" onClick={() => papersInput.current?.click()} disabled={!!loading || !exam?.documents.some(doc => doc.kind === 'syllabus')}><FilePlus2 size={17} /> Choose past papers</button><input ref={papersInput} type="file" multiple accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" hidden onChange={e => void receive(e.target.files, 'past paper')} /></div>
    </div>
    <p className="exam-format">Text-based PDF, TXT, or Markdown · 8 MB and 60 pages per PDF · 80 combined pages · Scanned PDFs, images, encrypted PDFs, and DOCX cannot be read here.</p>
    {loading && <div className="banner success" role="status"><LoaderCircle className="spin" size={17} /> {loading}</div>}
    {error && <div className="banner error" role="alert">{error}</div>}
    {!!exam && <>
      <div className="exam-document-row">{exam.documents.map(doc => <span key={doc.name}><FileText size={15} /> {doc.name} · {doc.pages} page{doc.pages === 1 ? '' : 's'} · {doc.kind}</span>)}</div>
      <div className="exam-results-grid"><section className="card exam-topics"><div className="card-heading"><span className="tile violet"><BookOpen /></span><div><strong>Priority topics</strong><small>Each reason links back to your documents.</small></div></div><div className="topic-list">{exam.topics.map((topic, i) => <button className={selectedTopic === i ? 'selected' : ''} key={`${topic.title}-${i}`} onClick={() => setSelectedTopic(i)}><span className={`status ${topic.priority === 'High' ? 'limited' : 'none'}`}>{topic.priority}</span><strong>{topic.title}</strong><ArrowRight size={15} /></button>)}</div></section>
      <section className="card exam-topic-detail"><span className="eyebrow">Why this topic</span><h2>{active?.title}</h2><p>{active?.reason}</p><div className="source-note"><FileText size={16} /> {active?.references.map(ref => `${ref.document}, p. ${ref.page}`).join(' · ')}</div><button className="secondary" onClick={() => onAsk(`Explain ${active?.title} from my syllabus with page citations`)}>Ask ASUR about this <ArrowRight size={15} /></button></section></div>
      <section className="card exam-section"><div className="card-heading"><span className="tile lavender"><HelpCircle /></span><div><strong>Practice questions</strong><small>Use the cited pages to check your answers.</small></div></div>{exam.questions.map((item, i) => <div className="practice-item" key={i}><strong>{i + 1}. {item.question}</strong><button className="link-button" onClick={() => setShowAnswer(showAnswer === i ? null : i)}>{showAnswer === i ? 'Hide study cue' : 'Show study cue'}</button>{showAnswer === i && <p>{item.answer} <span className="citation">{item.reference.document}, p. {item.reference.page}</span></p>}</div>)}</section>
      <section className="card exam-section"><div className="card-heading"><span className="tile lavender"><BookOpen /></span><div><strong>Seven-day study plan</strong><small>Adjust the pace to fit your schedule.</small></div></div><div className="study-plan">{exam.plan.map(item => <div key={item.day}><b>Day {item.day}</b><strong>{item.focus}</strong><span>{item.task}</span></div>)}</div><a className="primary" href={studyPdf} download="skillbridge-study-guide.pdf"><Download size={17} /> Download study PDF</a></section>
    </>}
  </section>;
}
