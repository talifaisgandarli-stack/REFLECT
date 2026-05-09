import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { PageHead } from '@/components/PageHead';
import { NotificationPreferencesPage } from './NotificationPreferences';
import { TemplatesManager } from '@/components/TemplatesManager';
import { KnowledgeBaseManager } from '@/components/KnowledgeBaseManager';
import { GeneralSettingsForm } from '@/components/GeneralSettingsForm';
import { MiraiPersonaEditor } from '@/components/MiraiPersonaEditor';
import { useT } from '@/lib/i18n';

const NAV = [
  { to: 'umumi', key: 'settings.tab.general' },
  { to: 'şablonlar', key: 'settings.tab.templates' },
  { to: 'bilik', key: 'settings.tab.knowledge' },
  { to: 'mirai', key: 'settings.tab.mirai' },
  { to: 'bildirişlər', key: 'settings.tab.notifications' },
];

export function SettingsPage() {
  const t = useT();
  return (
    <>
      <PageHead meta={t('settings.meta')} title={t('settings.title')} />
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
              {t(n.key)}
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
