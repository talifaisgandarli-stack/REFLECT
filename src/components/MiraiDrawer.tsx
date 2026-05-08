import { useUI } from '@/lib/store';
import { MiraiSphere } from './MiraiSphere';
import { Mascot } from './Mascot';
import { useState } from 'react';

export function MiraiDrawer() {
  const { miraiPanelOpen, toggleMirai } = useUI();
  const [q, setQ] = useState('');
  const [thinking, setThinking] = useState(false);

  if (!miraiPanelOpen) {
    return (
      <button
        type="button"
        onClick={toggleMirai}
        className="fixed bottom-6 right-6 rounded-full flex items-center justify-center shadow-card-hover"
        style={{
          width: 56,
          height: 56,
          background: 'var(--mirai-surface)',
          color: 'var(--canvas)',
        }}
        aria-label="MIRAI-dən soruş"
      >
        <MiraiSphere size={48} particles={120} />
      </button>
    );
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setThinking(true);
    try {
      // Hits Vercel /api/mirai/chat — see api/mirai/chat.ts
      await fetch('/api/mirai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: q, persona: 'general' }),
      }).catch(() => null);
    } finally {
      setThinking(false);
      setQ('');
    }
  }

  return (
    <aside
      className="fixed top-0 right-0 bottom-0 w-[420px] z-40 flex flex-col"
      style={{ background: 'var(--mirai-surface)', color: 'var(--canvas)' }}
    >
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <MiraiSphere size={32} particles={80} />
          <span className="text-h4">MIRAI</span>
        </div>
        <button onClick={toggleMirai} className="text-meta opacity-70 hover:opacity-100">
          Bağla
        </button>
      </div>
      <div className="flex-1 p-4 overflow-y-auto text-body">
        {thinking ? (
          <div className="flex items-center gap-3">
            <Mascot size={48} />
            <span className="text-ui opacity-80">MIRAI düşünür…</span>
          </div>
        ) : (
          <p className="text-ui opacity-70">
            Sual ver — tapşırıqlar, layihələr, maliyyə, müştərilər haqqında.
          </p>
        )}
      </div>
      <form onSubmit={ask} className="p-4 border-t border-white/5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="MIRAI-dən soruş…"
          className="w-full h-10 rounded-btn px-3 text-body"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--canvas)',
          }}
        />
      </form>
    </aside>
  );
}
