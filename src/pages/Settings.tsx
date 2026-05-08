import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { PageHead } from '@/components/PageHead';
import { NotificationPreferencesPage } from './NotificationPreferences';
import { TemplatesManager } from '@/components/TemplatesManager';

const NAV = [
  { to: 'umumi', label: 'Ümumi' },
  { to: 'şablonlar', label: 'Şablonlar' },
  { to: 'bilik', label: 'Bilik Bazası' },
  { to: 'bildirişlər', label: 'Bildirişlər' },
];

export function SettingsPage() {
  return (
    <>
      <PageHead meta="Yalnız admin" title="Parametrlər" />
      <div className="grid grid-cols-1 lg:grid-cols-[200px,1fr] gap-6">
        <nav className="space-y-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-btn text-ui ${isActive ? 'bg-surface-mist' : ''}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="card">
          <Routes>
            <Route index element={<Navigate to="umumi" replace />} />
            <Route path="umumi" element={<GeneralSettings />} />
            <Route path="şablonlar" element={<TemplatesSettings />} />
            <Route path="bilik" element={<KnowledgeBaseSettings />} />
            <Route path="bildirişlər" element={<NotificationsSettings />} />
          </Routes>
        </div>
      </div>
    </>
  );
}

function GeneralSettings() {
  return (
    <div className="space-y-3">
      <h3 className="text-h3">Şirkət</h3>
      <label className="block">
        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Şirkət adı</span>
        <input className="input mt-1 max-w-md" defaultValue="Reflect" />
      </label>
      <label className="block">
        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Region / Saat qurşağı</span>
        <input className="input mt-1 max-w-md" defaultValue="Asia/Baku" disabled />
      </label>
    </div>
  );
}

function TemplatesSettings() {
  return <TemplatesManager />;
}
function KnowledgeBaseSettings() {
  return <p className="text-body">Yüklənmiş PDF-lər və MIRAI RAG mənbələri — burada idarə olunur.</p>;
}
function NotificationsSettings() {
  return <NotificationPreferencesPage />;
}
