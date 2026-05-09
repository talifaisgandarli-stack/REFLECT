import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { PageHead } from '@/components/PageHead';
import { NotificationPreferencesPage } from './NotificationPreferences';
import { TemplatesManager } from '@/components/TemplatesManager';
import { KnowledgeBaseManager } from '@/components/KnowledgeBaseManager';
import { GeneralSettingsForm } from '@/components/GeneralSettingsForm';
import { MiraiPersonaEditor } from '@/components/MiraiPersonaEditor';

const NAV = [
  { to: 'umumi', label: 'Ümumi' },
  { to: 'şablonlar', label: 'Şablonlar' },
  { to: 'bilik', label: 'Bilik Bazası' },
  { to: 'mirai', label: 'MIRAI personalar' },
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
            <Route path="mirai" element={<MiraiPersonaEditor />} />
            <Route path="bildirişlər" element={<NotificationsSettings />} />
          </Routes>
        </div>
      </div>
    </>
  );
}

function GeneralSettings() {
  return <GeneralSettingsForm />;
}

function TemplatesSettings() {
  return <TemplatesManager />;
}
function KnowledgeBaseSettings() {
  return <KnowledgeBaseManager />;
}
function NotificationsSettings() {
  return <NotificationPreferencesPage />;
}
