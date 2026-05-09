import { Link } from 'react-router-dom';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useProjects } from '@/lib/hooks';
import { Mascot } from '@/components/Mascot';
import { PROJECT_STATUS_LABEL } from '@/lib/labels';
import { useT } from '@/lib/i18n';

const FOLDER_TONE = ['bg-grad-folder-sage', 'bg-grad-folder-lime', 'bg-grad-folder-forest', 'bg-grad-folder-peach', 'bg-grad-folder-lavender'];

export function ProjectsPage() {
  const t = useT();
  const { data: projects = [], isLoading } = useProjects();

  return (
    <>
      <PageHead
        meta={t('projects.count', { count: projects.length })}
        title={t('projects.title')}
        actions={
          <>
            <input className="input max-w-[240px]" placeholder={t('projects.search')} />
            <button className="btn-primary">{t('projects.create')}</button>
          </>
        }
      />

      {isLoading ? (
        <div className="card text-meta">{t('common.loading')}</div>
      ) : projects.length === 0 ? (
        <EmptyState
          title={t('projects.empty.title')}
          body={t('projects.empty.body')}
          cta={<button className="btn-primary">{t('projects.create')}</button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p, i) => {
            const tone = FOLDER_TONE[i % FOLDER_TONE.length];
            const dark = tone === 'bg-grad-folder-forest';
            return (
              <Link
                key={p.id}
                to={`/layihelər/${p.id}`}
                className={`card-interactive rounded-card p-5 min-h-[180px] flex flex-col justify-between ${tone}`}
                style={{ color: dark ? 'var(--canvas)' : 'var(--ink)' }}
              >
                <div>
                  <span
                    className="chip"
                    style={{
                      background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(14,22,17,0.06)',
                      color: dark ? 'var(--canvas)' : 'var(--ink)',
                    }}
                  >
                    {p.phases[0] ?? t('projects.no_phase')}
                  </span>
                </div>
                <div>
                  <h3 className="text-h3 font-bold">{p.name}</h3>
                  <div className="text-meta mt-1 opacity-80">
                    {PROJECT_STATUS_LABEL[p.status]} · {p.deadline ?? t('projects.no_deadline')}
                  </div>
                </div>
              </Link>
            );
          })}
          <button
            className="rounded-card p-5 min-h-[180px] flex flex-col items-center justify-center gap-2 card-interactive"
            style={{ background: 'transparent', border: '1px dashed var(--line)' }}
          >
            <Mascot size={48} />
            <span className="text-ui">{t('projects.create')}</span>
          </button>
        </div>
      )}
    </>
  );
}
