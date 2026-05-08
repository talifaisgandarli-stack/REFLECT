import { PageHead } from '@/components/PageHead';
import { TelegramLinkPanel } from '@/components/TelegramLinkPanel';
import { NotificationPrefsPanel } from '@/components/NotificationPrefsPanel';

export function TelegramLinkPage() {
  return (
    <>
      <PageHead meta="Şəxsi" title="Telegram bağlantısı" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-4xl">
        <div className="card">
          <TelegramLinkPanel />
        </div>
        <div className="card">
          <NotificationPrefsPanel />
        </div>
      </div>
    </>
  );
}
