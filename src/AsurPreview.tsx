import { ArrowRight, BookOpen, FileText, Github, Sparkles } from 'lucide-react';
import AsurRobot from './AsurRobot';
import type { Analysis, ExamPrep } from './types';

type Props = {
  latest?: Analysis;
  exam?: ExamPrep;
  onOpenChat: () => void;
  onAskStudy: () => void;
  onExam: () => void;
  onEvidence: () => void;
};

export default function AsurPreview({ latest, exam, onOpenChat, onAskStudy, onExam, onEvidence }: Props) {
  const topic = exam?.topics[0];
  const source = topic?.references[0];
  const finding = latest?.findings.find(item => item.level === 'strong') || latest?.findings[0];

  return <aside className="asur-preview card" aria-label="ASUR at a glance">
    <div className="asur-preview-head"><span className="asur-preview-robot"><AsurRobot /></span><div><span className="eyebrow">Your study companion</span><h2>Ready when you are.</h2><p>Find the next useful step, then ask ASUR for a quick source-linked answer.</p></div></div>
    <div className="asur-preview-counts"><span><strong>{exam?.documents.length || 0}</strong> study files</span><span><strong>{latest ? 1 : 0}</strong> analyzed repository</span></div>
    <section className="asur-preview-section"><div className="asur-preview-section-title"><BookOpen size={19} /><strong>Study focus</strong></div>{topic ? <><h3>{topic.title}</h3><p>{source ? `From ${source.document}, p. ${source.page}.` : 'Based on your uploaded study material.'} Topics are study suggestions, not exam predictions.</p><button className="asur-preview-link" onClick={onAskStudy}>Ask about this topic <ArrowRight size={16} /></button></> : <><h3>Turn a syllabus into a plan</h3><p>Upload a readable syllabus to see priority topics, practice questions, and a study guide.</p><button className="asur-preview-link" onClick={onExam}>Upload syllabus <ArrowRight size={16} /></button></>}</section>
    <section className="asur-preview-section"><div className="asur-preview-section-title"><Github size={19} /><strong>Proof focus</strong></div>{latest ? <><h3>{finding?.skill || 'Your repository'} in {latest.repository}</h3><p>{finding?.reason || 'Review the source-linked findings in your Skill Map.'}</p><button className="asur-preview-link" onClick={onOpenChat}>Explain this evidence <ArrowRight size={16} /></button></> : <><h3>Make your work visible</h3><p>Add a public repository so ASUR can explain what its file paths support and where proof is limited.</p><button className="asur-preview-link" onClick={onEvidence}>Add public evidence <ArrowRight size={16} /></button></>}</section>
    <div className="asur-preview-footer"><span><FileText size={16} /> Answers cite readable uploads or public sources.</span><button className="primary wide" onClick={onOpenChat}><Sparkles size={17} /> Open ASUR chat <ArrowRight size={17} /></button></div>
  </aside>;
}
