import { useEffect, useState } from 'react';
import { useUI } from '@/lib/store';
import { useNavigate } from 'react-router-dom';

const QUICK = [
  { label: 'Dashboard', to: '/' },
  { label: 'Tapşırıqlar', to: '/tapşırıqlar' },
  { label: 'Layihələr', to: '/layihelər' },
  { label: 'Müştərilər', to: '/müştərilər' },
  { label: 'Maliyyə Mərkəzi', to: '/maliyyə' },
  { label: 'MIRAI', to: '/mirai' },
  { label: 'Telegram', to: '/telegram' },
  { label: 'Parametrlər', to: '/parametrlər' },
];

export function CmdK() {
  const { cmdkOpen, setCmdK } = useUI();
  const [q, setQ] = useState('');
  const nav = useNavigate();

  useEffect(() => {
    if (!cmdkOpen) setQ('');
  }, [cmdkOpen]);

  if (!cmdkOpen) return null;
  const results = QUICK.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <div
      role="dialog"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-32"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={() => setCmdK(false)}
    >
      <div
        className="w-full max-w-lg card p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ borderRadius: 14 }}
      >
        <input
          autoFocus
          className="input border-0 rounded-none"
          placeholder="Axtar… (Cmd+K)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setCmdK(false);
            if (e.key === 'Enter' && results[0]) {
              nav(results[0].to);
              setCmdK(false);
            }
          }}
        />
        <ul className="max-h-80 overflow-y-auto" style={{ borderTop: '1px solid var(--line-soft)' }}>
          {results.map((i) => (
            <li key={i.to}>
              <button
                type="button"
                className="w-full text-left px-4 py-3 hover:bg-surface-mist text-body"
                onClick={() => {
                  nav(i.to);
                  setCmdK(false);
                }}
              >
                {i.label}
              </button>
            </li>
          ))}
          {results.length === 0 ? (
            <li className="px-4 py-6 text-meta text-center" style={{ color: 'var(--text-muted)' }}>
              Heç nə tapılmadı
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
