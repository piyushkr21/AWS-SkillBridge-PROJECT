import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { signIn, signOut, signUp, fetchAuthSession } from 'aws-amplify/auth';
import { Activity, ArrowLeft, ArrowRight, Bell, BookOpen, BriefcaseBusiness, Check, ChevronDown, ChevronRight, CircleHelp, Code2, Database, FileText, FlaskConical, Github, Home, Layers3, Link2, LoaderCircle, Menu, Moon, Paperclip, Plus, Send, Settings, ShieldCheck, Sparkles, Sun, Target, UserRound, X } from 'lucide-react';
import { api, authConfigured, loadConfig } from './api';
import Overview from './Overview';
import AsurRobot from './AsurRobot';
import AsurPreview from './AsurPreview';
import type { Analysis, AppState, Evidence, Finding } from './types';
import { initialState } from './types';

type Page = 'Overview' | 'Evidence Library' | 'Skill Map' | 'Proof Sprints' | 'Exam Prep' | 'Activity' | 'Settings';
type Modal = 'evidence' | 'auth' | 'onboarding' | 'submission' | null;
type ChatMessage = { role: 'assistant' | 'user'; text: string; mode?: string };

const nav: { label: Page; icon: typeof Home }[] = [
  { label: 'Overview', icon: Home }, { label: 'Evidence Library', icon: FileText },
  { label: 'Skill Map', icon: Layers3 }, { label: 'Proof Sprints', icon: Target },
  { label: 'Exam Prep', icon: BookOpen },
  { label: 'Activity', icon: Activity }, { label: 'Settings', icon: Settings },
];
const skills = ['API design', 'Databases', 'Testing', 'CI/CD', 'Documentation', 'Deployment'];
const sampleRepo = 'https://github.com/fastapi/fastapi';
const ExamPrepPage = lazy(() => import('./ExamPrepPage'));

function readGuest(): AppState {
  try { return { ...initialState, ...JSON.parse(localStorage.getItem('skillbridge-guest') || '{}') }; }
  catch { return initialState; }
}

function timeAgo(value?: string) {
  if (!value) return 'No activity yet';
  const days = Math.floor((Date.now() - Date.parse(value)) / 86400000);
  return days < 1 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
}

function IconForSkill({ skill }: { skill: string }) {
  const Icon = skill === 'API design' ? Code2 : skill === 'Databases' ? Database : skill === 'Testing' ? FlaskConical : skill === 'Documentation' ? BookOpen : skill === 'Deployment' ? BriefcaseBusiness : Activity;
  return <Icon size={22} />;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [landing, setLanding] = useState(true);
  const [guest, setGuest] = useState(true);
  const [state, setState] = useState<AppState>(readGuest);
  const [page, setPage] = useState<Page>('Overview');
  const [modal, setModal] = useState<Modal>(null);
  const [menu, setMenu] = useState<'profile' | 'notifications' | 'role' | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [asurOpen, setAsurOpen] = useState(() => window.innerWidth > 1180);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('skillbridge-theme') === 'dark' ? 'dark' : 'light');
  const [examPreferred, setExamPreferred] = useState<'syllabus' | 'past paper'>('syllabus');
  const [asurTab, setAsurTab] = useState<'Chat' | 'Insights'>('Chat');
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', text: 'Hi, I am ASUR. Add a public repository and I can explain what it shows, where proof is limited, and what to build next.', mode: 'guided' }]);
  const [message, setMessage] = useState('');
  const [profileQuestion, setProfileQuestion] = useState<'role' | 'background' | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [githubUser, setGithubUser] = useState('');
  const [repoChoices, setRepoChoices] = useState<{ name: string; html_url: string; description: string | null }[]>([]);
  const [projectUrl, setProjectUrl] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [reviewEvidence, setReviewEvidence] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const attachment = useRef<HTMLInputElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const latest = state.analyses[0];
  const latestSubmission = state.submissions[0];
  const sprintTitle = latest?.findings.find(f => f.skill === 'Testing')?.level === 'strong' ? 'Deepen your API test proof' : 'Make your API testable';

  useEffect(() => { void (async () => {
    await loadConfig();
    if (authConfigured()) {
      try {
        const session = await fetchAuthSession();
        if (session.tokens?.accessToken) {
          const email = session.tokens.idToken?.payload.email;
          if (typeof email === 'string') setAuthEmail(email);
          const saved = await api.getState();
          setState(saved); setGuest(false); setLanding(false);
        }
      } catch { /* Guest state remains available. */ }
    }
    setReady(true);
  })(); }, []);

  useEffect(() => { if (guest) localStorage.setItem('skillbridge-guest', JSON.stringify(state)); }, [state, guest]);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('skillbridge-theme', theme); }, [theme]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, asurOpen]);

  async function save(next: AppState) {
    if (!guest) await api.putState(next);
    setState(next);
  }

  async function saveProfile(next: AppState, after?: () => void) {
    try { await save(next); setError(''); after?.(); }
    catch (cause) { setError(`Profile was not saved: ${(cause as Error).message}`); }
  }

  function openDemo() {
    setLanding(false); setGuest(true); setPage('Overview');
    if (!state.analyses.length) { setRepoUrl(sampleRepo); setModal('evidence'); }
    else setModal(null);
  }

  function openExam(kind: 'syllabus' | 'past paper') { setExamPreferred(kind); setPage('Exam Prep'); setMobileNav(false); }

  async function analyze() {
    setError('');
    try {
      setBusy('Analyzing public GitHub signals');
      const analysis = await api.analyze(repoUrl.trim());
      const evidence: Evidence = { id: crypto.randomUUID(), kind: 'github', label: analysis.repository, url: analysis.repositoryUrl, status: 'confirmed', addedAt: new Date().toISOString() };
      await save({ ...state, evidence: [evidence, ...state.evidence.filter(e => e.url !== analysis.repositoryUrl)], analyses: [analysis, ...state.analyses.filter(a => a.repositoryUrl !== analysis.repositoryUrl)] });
      setNotice(`${analysis.repository} analyzed. Findings are linked to public source files.`);
      setModal(null); setReviewEvidence(false); setPage('Overview');
      setMessages(previous => [...previous, { role: 'assistant', text: `I analyzed ${analysis.repository}. Open Insights to review each finding and its source. The current proof sprint is based on these checks.`, mode: 'guided' }]);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }

  async function findRepos() {
    setError(''); setBusy('Loading public repositories');
    try { const result = await api.repositories(githubUser.trim()); setRepoChoices(result.repos); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }

  function reviewSource() {
    try {
      const url = new URL(repoUrl.trim());
      const parts = url.pathname.split('/').filter(Boolean);
      if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || parts.length < 2) throw new Error();
      setError(''); setReviewEvidence(true);
    } catch { setError('Enter a public https://github.com/owner/repository URL.'); }
  }

  async function addProject() {
    try {
      const url = new URL(projectUrl.trim());
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      const evidence: Evidence = { id: crypto.randomUUID(), kind: 'project', label: url.hostname, url: url.toString(), status: 'student submitted', addedAt: new Date().toISOString() };
      await save({ ...state, evidence: [evidence, ...state.evidence] });
      setProjectUrl(''); setModal(null); setNotice('Project link saved as student submitted.');
    } catch { setError('Enter a public http or https project URL.'); }
  }

  async function uploadCertificate(file?: File) {
    if (!file) return;
    if (guest) { setError('Sign in to upload a private certificate.'); return; }
    if (file.size > 2_000_000 || !['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) {
      setError('Choose a PDF, PNG, or JPEG under 2 MB.'); return;
    }
    setBusy('Uploading certificate'); setError('');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject; reader.readAsDataURL(file);
      });
      const result = await api.upload(file.name, file.type, base64);
      const evidence: Evidence = { id: crypto.randomUUID(), kind: 'certificate', label: file.name, url: result.key, status: 'student submitted', addedAt: new Date().toISOString() };
      await save({ ...state, evidence: [evidence, ...state.evidence] });
      setNotice('Certificate uploaded privately and labelled student submitted.'); setModal(null);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }

  async function submitProof() {
    setBusy('Checking public proof'); setError('');
    try {
      const url = new URL(proofUrl.trim());
      if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.pathname.split('/').filter(Boolean).length < 2) {
        throw new Error('Enter a public GitHub repository or pull request URL, such as https://github.com/owner/repository.');
      }
      const result = await api.checkProof(proofUrl.trim(), latest?.repositoryUrl || '');
      await save({ ...state, submissions: [result, ...state.submissions] });
      setModal(null); setPage('Proof Sprints'); setNotice('Proof checked. Review passed, needs work, and unverified criteria below.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }

  async function sendMessage(text = message) {
    const input = text.trim(); if (!input || chatBusy) return;
    setMessages(previous => [...previous, { role: 'user', text: input }]); setMessage('');
    if (profileQuestion === 'role') {
      if (!/backend/i.test(input)) {
        setMessages(previous => [...previous, { role: 'assistant', text: 'The first release supports Junior Backend Engineer. Is that the role you are aiming for?', mode: 'guided' }]);
        return;
      }
      setProfileQuestion('background');
      setMessages(previous => [...previous, { role: 'assistant', text: 'Great. What have you built or studied so far? A few sentences are enough. I will save your answer in your editable profile.', mode: 'guided' }]);
      return;
    }
    if (profileQuestion === 'background') {
      try { await save({ ...state, profile: { ...state.profile, role: 'Junior Backend Engineer', background: input.slice(0, 2000) } }); }
      catch (cause) { setMessages(previous => [...previous, { role: 'assistant', text: `I could not save your profile: ${(cause as Error).message}`, mode: 'error' }]); return; }
      setProfileQuestion(null);
      setMessages(previous => [...previous, { role: 'assistant', text: 'I saved that background in Settings. Add a public repository next so I can connect advice to source linked work.', mode: 'guided' }]);
      return;
    }
    setChatBusy(true);
    try {
      const result = await api.chat(input, state, messages.map(({ role, text }) => ({ role, text })));
      setMessages(previous => [...previous, { role: 'assistant', text: result.reply, mode: result.mode === 'bedrock' ? 'AI advice' : 'guided response' }]);
    } catch (e) { setMessages(previous => [...previous, { role: 'assistant', text: `I could not answer right now: ${(e as Error).message}`, mode: 'error' }]); }
    finally { setChatBusy(false); }
  }

  function beginProfileChat() {
    setAsurTab('Chat'); setAsurOpen(true); setProfileQuestion('role');
    setMessages(previous => [...previous, { role: 'assistant', text: 'Let us set up your profile. Are you aiming for a Junior Backend Engineer role?', mode: 'guided' }]);
  }

  async function handleAuth() {
    setBusy('Continuing'); setError('');
    try {
      const email = authEmail.trim().toLowerCase();
      try {
        const created = await signUp({ username: email, password: authPassword, options: { userAttributes: { email } } });
        if (!created.isSignUpComplete) throw new Error('This account still requires confirmation. Contact the project owner to complete an older registration.');
      } catch (cause) {
        if ((cause as { name?: string }).name !== 'UsernameExistsException') throw cause;
      }
      const result = await signIn({ username: email, password: authPassword });
      if (!result.isSignedIn) throw new Error('Additional account verification is required. SkillBridge has not opened a student session.');
      const saved = await api.getState(); setState(saved); setGuest(false); setLanding(false); setModal(null);
      if (!saved.profile.background) setModal('onboarding');
    } catch (e) {
      const cause = e as Error & { name?: string };
      setError(cause.name === 'UserNotConfirmedException' ? 'This older account has not been confirmed. Contact the project owner; new accounts no longer need an email code.' : cause.name === 'NotAuthorizedException' ? 'This account exists, but the password is incorrect.' : cause.message);
    }
    finally { setBusy(''); }
  }

  async function leave() {
    await signOut(); setGuest(true); setState(readGuest()); setLanding(true); setMenu(null);
  }

  function authContent() {
    return <>
      <span className="eyebrow">Student account</span>
      <h2>Continue with email</h2>
      <p>Existing accounts sign in. New accounts are created with the same email and password.</p>
      {error && <div className="banner error" role="alert">{error}</div>}
      {!authConfigured() ? <>
        <p role="status">Real sign-in and sign-up are unavailable until Cognito is configured. No student account session has been created.</p>
        <button className="secondary" onClick={openDemo}>Explore Guest demo <ArrowRight size={15} /></button>
      </> : <form onSubmit={e => { e.preventDefault(); void handleAuth(); }}>
        <label>Email<input type="email" required autoComplete="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} /></label>
        <label>Password<input type="password" required minLength={8} autoComplete="current-password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} /></label>
        <button className="primary wide" disabled={!!busy}>{busy || 'Continue'}</button>
        <small>New passwords need uppercase, lowercase, and a number. Email ownership is not verified in this demo; password recovery needs project-owner help.</small>
      </form>}
    </>;
  }

  if (!ready) return <div className="loading-screen"><LoaderCircle className="spin" /> Loading SkillBridge</div>;

  if (landing) return <div className="landing">
    <header className="landing-header"><div className="brand"><span className="brand-symbol">⌁</span> SkillBridge</div><button className="text-button" onClick={() => { setError(''); setModal('auth'); }}>Sign in</button></header>
    <main className="landing-main"><span className="eyebrow">Evidence led career growth</span><h1>Turn the work you have done into the role you want.</h1><p>SkillBridge reads the public proof in your projects, shows what it supports, and gives you one focused sprint to strengthen your backend portfolio.</p><div className="landing-actions"><button className="primary" onClick={openDemo}>Explore Guest demo <ArrowRight size={18} /></button><button className="secondary" onClick={() => { setError(''); setModal('auth'); }}>Create student account</button></div><div className="landing-steps"><span><strong>01</strong> Add public evidence</span><span><strong>02</strong> See source linked skills</span><span><strong>03</strong> Build a proof sprint</span></div></main>
    <div className="landing-preview"><div className="preview-orbit"><Sparkles size={28} /></div><div className="preview-card"><span>Junior Backend Engineer</span><h3>Your next step, backed by proof.</h3><p>Evidence → skill insight → proof sprint → updated evidence</p></div></div>
    {modal === 'auth' && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><div className="modal" role="dialog" aria-modal="true" aria-label="Student authentication"><button className="icon-button modal-close" aria-label="Close dialog" onClick={() => setModal(null)}><X size={20} /></button>{authContent()}</div></div>}
  </div>;

  return <div className={`app-shell ${!asurOpen && page !== 'Overview' ? 'asur-closed-away' : ''}`}>
    {mobileNav && <button className="mobile-nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
      <div className="sidebar-head"><div className="brand"><span className="brand-symbol">⌁</span> SkillBridge</div><button className="sidebar-back icon-button" aria-label="Back to page" onClick={() => setMobileNav(false)}><ArrowLeft size={22} /></button></div>
      <nav aria-label="Main navigation">{nav.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${page === label ? 'active' : ''}`} onClick={() => { setPage(label); setMobileNav(false); setMenu(null); }}><Icon size={21} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-footer"><div className="avatar small"><UserRound size={18} /></div><div><strong>{state.profile.name || (guest ? 'Guest demo' : authEmail.split('@')[0] || 'Student')}</strong><small>{guest ? 'Guest demo' : 'Student'}</small></div><ChevronRight size={17} /></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => { setMenu(null); setMobileNav(!mobileNav); }}><Menu size={22} /></button><div className="breadcrumb"><Home size={15} /> <span className="breadcrumb-workspace">Workspace</span> <span>/</span><strong>{page}</strong></div><div className="top-actions"><div className="dropdown-wrap"><button className="role-select" onClick={() => setMenu(menu === 'role' ? null : 'role')}><BriefcaseBusiness size={18} /> {state.profile.role} <ChevronDown size={16} /></button>{menu === 'role' && <div className="dropdown role-dropdown"><p>First release role</p><button onClick={() => setMenu(null)}>Junior Backend Engineer <Check size={15} /></button></div>}</div><button className="primary add-button" onClick={() => { setModal('evidence'); setError(''); }}> <Plus size={20} /> Add evidence <ChevronDown size={16} /></button><button className="theme-switch" type="button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} aria-pressed={theme === 'dark'}><Sun size={17} /><Moon size={17} /></button><div className="dropdown-wrap"><button className="icon-button notification-button" aria-label="Notifications" onClick={() => setMenu(menu === 'notifications' ? null : 'notifications')}><Bell size={22} />{latest && <i />}</button>{menu === 'notifications' && <div className="dropdown notifications"><strong>Notifications</strong><p>{latest ? `${latest.repository} analysis is ready.` : 'Your evidence updates will appear here.'}</p>{latestSubmission && <p>Your latest proof check is ready.</p>}</div>}</div><div className="dropdown-wrap"><button className="profile-button" aria-label="Profile menu" onClick={() => setMenu(menu === 'profile' ? null : 'profile')}><span className="avatar"><UserRound size={19} /></span><ChevronDown size={16} /></button>{menu === 'profile' && <div className="dropdown"><strong>{state.profile.name || (guest ? 'Guest demo' : authEmail || 'Student')}</strong><button onClick={() => { setPage('Settings'); setMenu(null); }}>Profile settings</button>{guest ? <button onClick={() => { setError(''); setModal('auth'); setMenu(null); }}>Sign in</button> : <button onClick={leave}>Sign out</button>}</div>}</div></div></header>
      {error && <div className="banner error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
      {notice && <div className="banner success" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={16} /></button></div>}
      {guest && <div className="demo-strip"><strong>Guest demo</strong><span>Explore with a public repository. Your demo changes stay in this browser.</span><button onClick={() => setModal('auth')}>Save progress with an account <ArrowRight size={15} /></button></div>}
      <section className="content">
        {page === 'Overview' && <Overview latest={latest} exam={state.exam} onPage={setPage} onExam={openExam} />}
        {page === 'Exam Prep' && <Suspense fallback={<div className="loading-screen"><LoaderCircle className="spin" /> Loading Exam Prep</div>}><ExamPrepPage exam={state.exam} preferred={examPreferred} onSave={async exam => { await save({ ...state, exam }); setNotice('Exam Prep updated from readable document text.'); }} onAsk={question => { setAsurOpen(true); setAsurTab('Chat'); void sendMessage(question); }} /></Suspense>}
        {page === 'Evidence Library' && <section className="page-section"><div className="page-title"><span className="eyebrow">Your sources</span><h1>Evidence Library</h1><p>Only confirmed public sources inform skill findings. Your certificates remain student submitted.</p><button className="primary" onClick={() => setModal('evidence')}><Plus size={17} /> Add evidence</button></div><div className="stack">{state.evidence.length ? state.evidence.map(e => <div className="card evidence-row" key={e.id}><span className="tile lavender">{e.kind === 'github' ? <Github /> : e.kind === 'project' ? <Link2 /> : <FileText />}</span><div><strong>{e.label}</strong><small>{e.kind} · added {timeAgo(e.addedAt)}</small></div><span className={`status ${e.status === 'confirmed' ? 'passed' : 'unverified'}`}>{e.status}</span>{e.url?.startsWith('http') && <a href={e.url} target="_blank" rel="noreferrer" aria-label={`Open ${e.label}`}><ArrowRight size={18} /></a>}</div>) : <Empty title="No evidence yet" body="Add a public repository, project URL, or certificate to start your evidence library." action={() => setModal('evidence')} />}{state.analyses.map(a => <AnalysisCard key={a.repositoryUrl} analysis={a} />)}</div></section>}
        {page === 'Skill Map' && <section className="page-section"><div className="page-title"><span className="eyebrow">Source linked findings</span><h1>Skill Map</h1><p>Public evidence supports these findings. Missing public evidence does not mean missing ability.</p></div><div className="skill-grid">{skills.map(skill => { const finding = latest?.findings.find(f => f.skill === skill); return <div className="card skill-card" key={skill}><span className="tile lavender"><IconForSkill skill={skill} /></span><span className={`status ${finding?.level || 'none'}`}>{finding?.level === 'strong' ? 'Strong evidence' : finding?.level === 'limited' ? 'Limited evidence' : 'No public evidence'}</span><h2>{skill}</h2><p>{finding?.reason || 'Add a public repository to inspect this skill.'}</p>{finding?.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.label} <ArrowRight size={13} /></a>)}</div>; })}</div></section>}
        {page === 'Proof Sprints' && <section className="page-section"><div className="page-title"><span className="eyebrow">One useful next step</span><h1>Proof Sprints</h1><p>A focused challenge tied to the repository you selected.</p></div><div className="card proof-detail"><span className="tile violet"><Target /></span><h2>{sprintTitle}</h2><p>{latest ? `Use ${latest.repository} to create stronger proof for your backend portfolio.` : 'Add a repository to make this sprint specific to your work.'}</p><ol><li>Choose three important API endpoints and describe expected responses.</li><li>Add integration tests covering success and failure cases with a test runner.</li><li>Open a public pull request so the changed files can be inspected.</li></ol><div className="source-note"><ShieldCheck size={17} /> Checks inspect public GitHub metadata and changed file names. They do not run submitted code or verify runtime behavior.</div><button className="primary" onClick={() => { setModal('submission'); setError(''); }}>Submit proof <ArrowRight size={16} /></button></div>{state.submissions.map(s => <div className="card submission-card" key={s.id}><div className="card-heading"><strong>Proof checked {timeAgo(s.submittedAt).toLowerCase()}</strong><a href={s.url} target="_blank" rel="noreferrer">View source <ArrowRight size={14} /></a></div>{s.checks.map(c => <div className="check-row" key={c.label}><span className={`status ${c.status}`}>{c.status === 'passed' ? 'Passed' : c.status === 'needs-work' ? 'Needs work' : 'Unverified'}</span><div><strong>{c.label}</strong><small>{c.detail}</small></div></div>)}</div>)}</section>}
        {page === 'Activity' && <section className="page-section"><div className="page-title"><span className="eyebrow">Your timeline</span><h1>Activity</h1><p>Every analysis and proof check remains visible as your evidence grows.</p></div><div className="stack">{[...state.analyses.map(a => ({ at: a.analyzedAt, title: `${a.repository} analyzed`, detail: `${a.inspectedFiles} public files inspected`, url: a.repositoryUrl })), ...state.submissions.map(s => ({ at: s.submittedAt, title: 'Proof submitted', detail: `${s.checks.filter(c => c.status === 'passed').length} criteria passed`, url: s.url }))].sort((a, b) => b.at.localeCompare(a.at)).map((item, i) => <div className="card activity-row" key={`${item.at}-${i}`}><span className="tile lavender"><Activity /></span><div><strong>{item.title}</strong><small>{item.detail} · {timeAgo(item.at)}</small></div><a href={item.url} target="_blank" rel="noreferrer">Source <ArrowRight size={14} /></a></div>)}{!state.analyses.length && !state.submissions.length && <Empty title="Your timeline is ready" body="Analyze a repository to create your first activity entry." action={() => setModal('evidence')} />}</div></section>}
        {page === 'Settings' && <section className="page-section"><div className="page-title"><span className="eyebrow">Student profile</span><h1>Settings</h1><p>ASUR uses these fields to tailor recommendations. You can edit them any time.</p></div><div className="card settings-card"><label>Name<input value={state.profile.name} onChange={e => setState({ ...state, profile: { ...state.profile, name: e.target.value } })} /></label><label>Target role<select value={state.profile.role} onChange={e => setState({ ...state, profile: { ...state.profile, role: e.target.value } })}><option>Junior Backend Engineer</option></select></label><label>Background<textarea rows={4} value={state.profile.background} onChange={e => setState({ ...state, profile: { ...state.profile, background: e.target.value } })} placeholder="What have you built or studied?" /></label><label>GitHub username<input value={state.profile.githubUsername} onChange={e => setState({ ...state, profile: { ...state.profile, githubUsername: e.target.value } })} /></label><button className="primary" onClick={() => { void saveProfile(state, () => setNotice('Profile saved.')); }}>Save profile</button></div></section>}
      </section>
      {page === 'Overview' && !asurOpen && <AsurPreview latest={latest} exam={state.exam} onOpenChat={() => { setAsurTab('Chat'); setAsurOpen(true); }} onAskStudy={() => { setAsurTab('Chat'); setAsurOpen(true); void sendMessage(`Explain ${state.exam?.topics[0]?.title || 'my syllabus'} from my uploaded syllabus with page citations`); }} onExam={() => openExam('syllabus')} onEvidence={() => { setError(''); setModal('evidence'); }} />}
    </main>
    <button className="asur-launcher" onClick={() => setAsurOpen(!asurOpen)} aria-label={asurOpen ? 'Minimize ASUR' : 'Open ASUR'} aria-expanded={asurOpen}><AsurRobot /></button>
    {asurOpen && <aside className="asur-panel" aria-label="ASUR skill copilot"><div className="asur-header"><span className="asur-mark"><AsurRobot small /></span><div><h2>ASUR <small><i /> Online</small></h2><p>Your skill copilot</p></div><button className="icon-button" aria-label="Minimize ASUR" onClick={() => setAsurOpen(false)}><X size={19} /></button></div><div className="asur-tabs"><button className={asurTab === 'Chat' ? 'active' : ''} onClick={() => setAsurTab('Chat')}>Chat</button><button className={asurTab === 'Insights' ? 'active' : ''} onClick={() => setAsurTab('Insights')}>Insights</button></div><button className="context-strip" onClick={() => setPage('Settings')}><UserRound size={17} /> Using your profile <span>·</span> {state.exam ? `${state.exam.documents.length} study files` : `${state.evidence.length} sources`} <span>·</span> Backend goal <ChevronRight size={16} /></button>{asurTab === 'Chat' ? <><div className="chat-scroll"><div className="chat-messages">{messages.map((m, i) => <div className={`chat-message ${m.role}`} key={i}>{m.role === 'assistant' && <span className="chat-avatar"><AsurRobot small /></span>}<div><p>{m.text}</p>{m.mode && <small>{m.mode}</small>}</div></div>)}{latest && <div className="asur-source"><Github size={20} /><span><strong>{latest.repository}</strong><small>GitHub repository</small></span><a href={latest.repositoryUrl} target="_blank" rel="noreferrer">View source <ArrowRight size={13} /></a></div>}{latest && <div className="asur-action"><small>Recommended</small><strong>{sprintTitle}</strong><p>Add integration tests for key endpoints, then share a public pull request.</p><button className="primary wide" onClick={() => setPage('Proof Sprints')}>Start proof sprint <ArrowRight size={15} /></button></div>}{chatBusy && <div className="chat-message assistant"><span className="chat-avatar"><Sparkles size={18} /></span><div><LoaderCircle className="spin" size={17} /> Thinking</div></div>}<div ref={chatEnd} /></div></div><div className="prompt-row"><button onClick={beginProfileChat}>Set up profile</button>{state.exam && <button onClick={() => void sendMessage("Summarize the key topics in my syllabus")}>Summarize syllabus</button>}<button onClick={() => void sendMessage('Explain my latest skill insight')}>Explain this insight</button><button onClick={() => setModal('evidence')}><Plus size={14} /> Add evidence</button></div><form className="composer" onSubmit={e => { e.preventDefault(); void sendMessage(); }}><button type="button" className="icon-button" aria-label="Attach evidence" onClick={() => setModal('evidence')}><Paperclip size={19} /></button><input value={message} onChange={e => setMessage(e.target.value)} placeholder="Ask ASUR about your work..." aria-label="Message ASUR" /><button type="submit" className="send-button" aria-label="Send message" disabled={chatBusy || !message.trim()}><Send size={19} /></button></form></> : <div className="insights-scroll"><h3>Evidence insights</h3><p>ASUR explains public signals and keeps uncertainty visible.</p>{latest ? latest.findings.map(f => <div className="insight-item" key={f.skill}><div><IconForSkill skill={f.skill} /><strong>{f.skill}</strong><span className={`status ${f.level}`}>{f.level}</span></div><p>{f.reason}</p>{f.sources.map(s => <a href={s.url} target="_blank" rel="noreferrer" key={s.url}>{s.label} <ArrowRight size={12} /></a>)}</div>) : <Empty title="No insights yet" body="Add a public repository to see source linked findings." action={() => setModal('evidence')} />}</div>}</aside>}
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><div className="modal" role="dialog" aria-modal="true" aria-label={modal === 'auth' ? 'Student authentication' : modal === 'evidence' ? 'Add evidence' : modal === 'submission' ? 'Submit proof' : 'Onboarding'}><button className="icon-button modal-close" aria-label="Close dialog" onClick={() => setModal(null)}><X size={20} /></button>{modal !== 'auth' && error && <div className="banner error" role="alert">{error}</div>}{modal === 'evidence' && <><span className="eyebrow">Build your evidence base</span><h2>Add evidence</h2><p>Choose public work to inspect. Review the repository before analysis.</p><div className="modal-section"><h3><Github size={19} /> Public GitHub repository</h3><div className="inline-fields"><input placeholder="GitHub username" value={githubUser} onChange={e => setGithubUser(e.target.value)} /><button className="secondary" disabled={!githubUser.trim() || !!busy} onClick={() => void findRepos()}>Find repos</button></div>{repoChoices.length > 0 && <select aria-label="Select repository" value={repoUrl} onChange={e => { setRepoUrl(e.target.value); setReviewEvidence(false); }}><option value="">Select a repository</option>{repoChoices.map(r => <option key={r.html_url} value={r.html_url}>{r.name}</option>)}</select>}<input placeholder="Or paste https://github.com/owner/repo" value={repoUrl} onChange={e => { setRepoUrl(e.target.value); setReviewEvidence(false); }} />{repoUrl && !reviewEvidence && <button className="secondary" onClick={reviewSource}>Review source</button>}{reviewEvidence && <div className="review-box"><strong>Review before analysis</strong>{guest && repoUrl === sampleRepo && <p>This is a public sample repository for the Guest demo. Choose your own repository for personal insights.</p>}<p>SkillBridge will inspect public repository metadata and file names at <a href={repoUrl} target="_blank" rel="noreferrer">{repoUrl}</a>. It will not execute code. Findings will be linked to source files.</p><button className="primary" disabled={!!busy} onClick={() => void analyze()}>{busy || 'Confirm and analyze'} <ArrowRight size={15} /></button></div>}</div><div className="modal-section"><h3><Link2 size={19} /> Project link</h3><div className="inline-fields"><input placeholder="https://your-project.example" value={projectUrl} onChange={e => setProjectUrl(e.target.value)} /><button className="secondary" onClick={() => void addProject()} disabled={!projectUrl.trim()}>Save link</button></div><small>Saved as student submitted until analyzed.</small></div><div className="modal-section"><h3><FileText size={19} /> Optional certificate</h3><input type="file" ref={attachment} accept="application/pdf,image/png,image/jpeg" hidden onChange={e => void uploadCertificate(e.target.files?.[0])} /><button className="secondary" onClick={() => attachment.current?.click()} disabled={guest || !!busy}><Paperclip size={16} /> Upload PDF or image</button><small>{guest ? 'Sign in to store a private certificate.' : 'Maximum 2 MB. Labelled student submitted.'}</small></div></>}{modal === 'submission' && <><span className="eyebrow">Proof sprint</span><h2>Submit public proof</h2><p>Paste a public GitHub pull request or repository link. The check uses metadata and changed file names only.</p><label>Public URL<input placeholder="https://github.com/owner/repo/pull/123" value={proofUrl} onChange={e => setProofUrl(e.target.value)} /></label><button className="primary" disabled={!proofUrl.trim() || !!busy} onClick={() => void submitProof()}>{busy || 'Check proof'} <ArrowRight size={16} /></button></>}{modal === 'auth' && authContent()}{modal === 'onboarding' && <><span className="eyebrow">A quick introduction</span><h2>Tell ASUR your goal</h2><p>Your answers fill editable profile fields and shape future recommendations.</p><label>What role are you aiming for?<select value={state.profile.role} onChange={e => setState({ ...state, profile: { ...state.profile, role: e.target.value } })}><option>Junior Backend Engineer</option></select></label><label>What have you built or studied?<textarea rows={4} value={state.profile.background} onChange={e => setState({ ...state, profile: { ...state.profile, background: e.target.value } })} placeholder="Courses, projects, technologies, or goals" /></label><button className="primary" onClick={() => { void saveProfile(state, () => setModal('evidence')); }}>Save and add evidence <ArrowRight size={15} /></button></>}</div></div>}
  </div>;
}

function Empty({ title, body, action }: { title: string; body: string; action: () => void }) {
  return <div className="card empty"><CircleHelp size={27} /><h3>{title}</h3><p>{body}</p><button className="secondary" onClick={action}>Add evidence <ArrowRight size={15} /></button></div>;
}

function AnalysisCard({ analysis }: { analysis: Analysis }) {
  return <div className="card analysis-card"><div className="card-heading"><Github size={21} /><strong>{analysis.repository}</strong><small>Analyzed {timeAgo(analysis.analyzedAt)}</small></div><p>{analysis.note}</p><div>{analysis.findings.map((f: Finding) => <div className="analysis-finding" key={f.skill}><span className={`status ${f.level}`}>{f.level}</span><strong>{f.skill}</strong><span>{f.reason}</span><div className="analysis-sources">{f.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.label} <ArrowRight size={12} /></a>)}</div></div>)}</div></div>;
}
