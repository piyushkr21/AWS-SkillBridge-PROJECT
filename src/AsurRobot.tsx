export default function AsurRobot({ small = false }: { small?: boolean }) {
  return <svg className={`robot ${small ? 'robot-small' : ''}`} viewBox={small ? '0 8 100 82' : '0 0 100 128'} role="img" aria-label="ASUR robot wearing an ASUR shirt">
    <defs>
      <linearGradient id="robotShell" x1="0" x2="1" y2="1"><stop stopColor="#fff" /><stop offset="1" stopColor="#c8d2ff" /></linearGradient>
      <linearGradient id="robotShirt" x1="0" x2="1" y2="1"><stop stopColor="#fff" /><stop offset="1" stopColor="#e1e8ff" /></linearGradient>
      <linearGradient id="robotFace" x1="0" x2="1" y2="1"><stop stopColor="#0a163c" /><stop offset="1" stopColor="#253a7e" /></linearGradient>
    </defs>
    <path d="M50 16V7" stroke="#5445f6" strokeWidth="3" strokeLinecap="round" /><circle cx="50" cy="6" r="4" fill="#5445f6" />
    <rect x="6" y="36" width="10" height="24" rx="5" fill="#aab8ef" /><rect x="84" y="36" width="10" height="24" rx="5" fill="#aab8ef" />
    <rect x="11" y="16" width="78" height="62" rx="23" fill="url(#robotShell)" stroke="#8799e4" strokeWidth="2.5" />
    <rect x="19" y="27" width="62" height="39" rx="15" fill="url(#robotFace)" />
    <ellipse cx="38" cy="46" rx="6" ry="8" fill="#a9c9ff" /><ellipse cx="62" cy="46" rx="6" ry="8" fill="#a9c9ff" /><circle cx="40" cy="43" r="2" fill="#e9f3ff" /><circle cx="64" cy="43" r="2" fill="#e9f3ff" />
    <path d="M43 58q7 6 14 0" stroke="#9fc3ff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <path d="M39 77v5m22-5v5" stroke="#9dabe6" strokeWidth="5" strokeLinecap="round" />
    <path d="M24 88l-12 10m64-10 12 10" stroke="#a9b7ee" strokeWidth="8" strokeLinecap="round" /><circle cx="10" cy="101" r="7" fill="url(#robotShell)" stroke="#889ce4" strokeWidth="2" /><circle cx="90" cy="101" r="7" fill="url(#robotShell)" stroke="#889ce4" strokeWidth="2" />
    <path d="M29 81q4-4 10-4h22q6 0 10 4l7 30q-28 9-56 0z" fill="url(#robotShirt)" stroke="#91a3e9" strokeWidth="2" />
    <path d="M39 115v7m22-7v7" stroke="#a7b6ee" strokeWidth="8" strokeLinecap="round" /><path d="M32 122h14m9 0h14" stroke="#4f47be" strokeWidth="6" strokeLinecap="round" />
    <text x="50" y="101" textAnchor="middle" fontSize="15" fontWeight="800" fontFamily="Arial,sans-serif" fill="#3329bd">ASUR</text><circle cx="70" cy="84" r="4" fill="#13c9a8" />
  </svg>;
}
