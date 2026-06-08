import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTrackers, useDataMutations } from '@/core/data';
import { templates } from '@/core/templates';
import { getColorTheme } from '../colors';
import AuthModal from '../components/AuthModal';
import { useHideTemplates } from '@/lib/preferences';

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp =
    (Icons as unknown as Record<string, LucideIcon>)[name] ?? Icons.Box;
  return <Cmp className={className} />;
}

export default function HomePage() {
  const trackers = useTrackers();
  const { createFromTemplate } = useDataMutations();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const isEmpty = trackers && trackers.length === 0;
  const [hideTemplates] = useHideTemplates();
  async function pickTemplate(templateId: string) {
    const newId = await createFromTemplate(templateId);
    navigate(`/t/${newId}`);
  }

  return (
    <div className="min-h-full max-w-3xl mx-auto px-6 py-10">
      <header className="flex items-center justify-between mb-12">
        <div className="flex items-center">
          <svg
            className="w-8 h-8 text-grape-500 -mt-2"
            viewBox="0 0 66 67"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="19.9129"
              cy="46.5419"
              r="18.9129"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle
              cx="19.9128"
              cy="46.542"
              r="6.45646"
              stroke="currentColor"
              strokeWidth="7"
            />
            <circle
              cx="53.6724"
              cy="11.9478"
              r="10.9478"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle cx="53.6724" cy="11.9478" r="5.97388" fill="currentColor" />
            <line
              x1="22.9752"
              y1="43.3287"
              x2="53.4948"
              y2="11.8728"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>

          <span className="font-display font-semibold text-[20px] text-grape-900 -ml-1">
            trackr
          </span>
        </div>
        {/*
          When signed in, this button shows a filled accent style + the first
          letter of the email. When signed out, it shows the neutral User icon.
          Tapping either opens AuthModal, which adapts to the current auth state.
        */}
        <button
          onClick={() => setAuthOpen(true)}
          aria-label={user ? 'Account' : 'Sign in'}
          className={
            user
              ? 'w-9 h-9 rounded-full bg-grape-500 text-white text-[14px] font-semibold flex items-center justify-center hover:bg-grape-600 transition-colors'
              : 'w-9 h-9 rounded-full bg-grape-100 text-grape-700 hover:bg-grape-200 flex items-center justify-center transition-colors'
          }
        >
          {user ? (
            (user.email?.[0] ?? '?').toUpperCase()
          ) : (
            <Icons.User className="w-4 h-4" />
          )}
        </button>
      </header>

      <h1 className="font-display font-semibold text-[28px] text-grape-900 mb-1">
        {isEmpty ? 'Welcome' : 'Your trackers'}
      </h1>
      <p className="text-grape-500 text-[15px] mb-8">
        {isEmpty
          ? 'Nothing to track yet — start fresh or pick a template.'
          : 'Tap one to open, or start a new tracker below.'}
      </p>

      {isEmpty ? (
        <Link
          to="/new"
          className="block bg-grape-50 border-2 border-dashed border-grape-200 rounded-2xl py-14 px-6 text-center hover:bg-grape-100 transition-colors"
        >
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-grape-500 flex items-center justify-center">
            <Icons.Plus className="w-8 h-8 text-white" strokeWidth={2.5} />
          </div>
          <p className="font-display font-semibold text-[17px] text-grape-800">
            New tracker
          </p>
          <p className="text-grape-500 text-[13px] mt-1">
            Set up your own fields
          </p>
        </Link>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {trackers?.map((t) => {
            const theme = getColorTheme(t.color);
            return (
              <Link
                key={t.id}
                to={`/t/${t.id}`}
                className="bg-white border border-grape-100 hover:border-grape-200 rounded-2xl p-4 transition-colors"
              >
                <div
                  className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${theme.tileBg}`}
                >
                  <Icon name={t.icon} className={`w-5 h-5 ${theme.tileFg}`} />
                </div>
                <p className="font-display font-semibold text-[15px] text-grape-900 truncate">
                  <span
                    className="text-[13px] font-semibold text-grape-800 truncate block"
                    title={t.name}
                  >
                    {t.name}
                  </span>
                </p>
                <p className="text-grape-400 text-[12px] mt-0.5">
                  {new Date(t.createdAt).toLocaleDateString()}
                </p>
              </Link>
            );
          })}
          <Link
            to="/new"
            className="border-2 border-dashed border-grape-200 hover:border-grape-300 hover:bg-grape-50 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 transition-colors min-h-27.5 text-grape-500"
          >
            <Icons.Plus className="w-6 h-6" strokeWidth={2} />
            <span className="text-[13px] font-medium">New</span>
          </Link>
        </div>
      )}

      {!hideTemplates && (
        <>
          <h2 className="font-display font-semibold text-grape-700 text-[14px] mt-12 mb-3">
            {isEmpty ? 'Or try a template' : 'Templates'}
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2.5">
            {templates.map((t) => {
              const theme = getColorTheme(t.color);
              return (
                <button
                  key={t.id}
                  onClick={() => pickTemplate(t.id)}
                  className="bg-white border border-grape-100 hover:border-grape-300 rounded-xl px-3.5 py-3 flex items-center gap-2.5 text-left transition-colors"
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${theme.tileBg}`}
                  >
                    <Icon
                      name={t.icon}
                      className={`w-3.5 h-3.5 ${theme.tileFg}`}
                    />
                  </div>
                  <span className="text-[13px] font-semibold text-grape-800">
                    {t.name}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  );
}
