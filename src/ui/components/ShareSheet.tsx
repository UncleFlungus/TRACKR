import { useState } from 'react';
import {
  Users,
  X,
  Send,
  Clock,
  LogOut,
  Globe,
  Copy,
  Check,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  useTrackerMembers,
  useTrackerInvites,
  useMyRole,
  useSharingMutations,
  usePublicLink,
} from '@/core/data';
import type { Tracker, TrackerRole } from '@/core/types';

interface Props {
  tracker: Tracker;
  onClose: () => void;
}

/**
 * Owners get the roster, per-member role controls, removal and an invite form.
 * Everyone else gets the roster and a way out. There is no link to copy: an
 * invitation is addressed to an email and lands on that person's home page the
 * next time they open the app.
 *
 * RLS enforces all of it too. This only decides what to offer.
 */
export default function ShareSheet({ tracker, onClose }: Props) {
  const { user } = useAuth();
  const members = useTrackerMembers(tracker.id);
  const invites = useTrackerInvites(tracker.id);
  const myRole = useMyRole(tracker.id);
  const { invite, revokeInvite, setRole, removeMember, leave } =
    useSharingMutations();

  const [email, setEmail] = useState('');
  const [role, setNewRole] = useState<'editor' | 'viewer'>('editor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const isOwner = myRole === 'owner';

  async function handleInvite() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    // Shape check only. The database holds the real constraint, and anything
    // stricter here starts rejecting valid addresses.
    if (!trimmed.includes('@') || trimmed.startsWith('@')) {
      setError('That does not look like an email address.');
      return;
    }
    if (members.some((m) => m.email === trimmed)) {
      setError('They already have access to this tracker.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await invite(tracker.id, trimmed, role);
      setEmail('');
      setSentTo(trimmed);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes('duplicate') || msg.includes('unique')
          ? 'They have already been invited.'
          : 'Could not send that invitation.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    if (!confirm(`Leave "${tracker.name}"? You will lose access to it.`))
      return;
    await leave(tracker.id);
    onClose();
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-grape-100 shrink-0">
          <p className="font-display font-semibold text-[17px] text-grape-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-grape-400" />
            Share
          </p>
          <button
            onClick={onClose}
            className="p-2 text-grape-400 hover:text-grape-700 hover:bg-grape-50 rounded-md transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {isOwner && (
            <div>
              <p className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide mb-2">
                Invite someone
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                    setSentTo(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  placeholder="their@email.com"
                  className="flex-1 min-w-0 bg-grape-50 text-[14px] text-grape-900 placeholder:text-grape-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-grape-300"
                />
                <select
                  value={role}
                  onChange={(e) =>
                    setNewRole(e.target.value as 'editor' | 'viewer')
                  }
                  className="bg-grape-50 text-grape-700 text-[13px] font-semibold rounded-lg px-2 py-2 border-0 focus:outline-none cursor-pointer"
                >
                  <option value="editor">Can log</option>
                  <option value="viewer">Can view</option>
                </select>
                <button
                  onClick={handleInvite}
                  disabled={busy || !email.trim()}
                  className="bg-grape-500 hover:bg-grape-600 disabled:bg-grape-200 text-white rounded-lg p-2 transition-colors shrink-0"
                  aria-label="Send invitation"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              {error && (
                <p className="text-rose-600 text-[12px] mt-1.5">{error}</p>
              )}
              {sentTo && !error && (
                <p className="text-grape-500 text-[12px] mt-1.5">
                  Invited <span className="font-semibold">{sentTo}</span>. It
                  appears on their home page next time they open trackr — if
                  they don't have an account yet, it waits for them.
                </p>
              )}
            </div>
          )}

          <div>
            <p className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide mb-2">
              {members.length === 1 ? 'Only you' : `${members.length} people`}
            </p>
            <div className="space-y-1">
              {members.map((m) => {
                const isMe = m.userId === user?.id;
                return (
                  <div
                    key={m.userId}
                    className="flex items-center gap-2 py-1.5"
                  >
                    <span className="flex-1 min-w-0 truncate text-[14px] text-grape-800">
                      {m.email ?? 'Unknown'}
                      {isMe && (
                        <span className="text-grape-400 text-[12px]">
                          {' '}
                          (you)
                        </span>
                      )}
                    </span>

                    {/* An owner cannot demote themselves out of ownership —
                        transfer is a deliberate act, not a dropdown. */}
                    {isOwner && !isMe && m.role !== 'owner' ? (
                      <select
                        value={m.role}
                        onChange={(e) =>
                          setRole(
                            tracker.id,
                            m.userId,
                            e.target.value as TrackerRole,
                          )
                        }
                        className="bg-grape-50 text-grape-700 text-[12px] font-semibold rounded-md px-1.5 py-1 border-0 focus:outline-none cursor-pointer"
                      >
                        <option value="editor">Can log</option>
                        <option value="viewer">Can view</option>
                      </select>
                    ) : (
                      <span className="text-grape-400 text-[12px] font-semibold uppercase tracking-wide">
                        {m.role === 'owner'
                          ? 'Owner'
                          : m.role === 'editor'
                            ? 'Can log'
                            : 'Can view'}
                      </span>
                    )}

                    {isOwner && !isMe && (
                      <button
                        onClick={() => removeMember(tracker.id, m.userId)}
                        className="p-1 text-grape-300 hover:text-rose-600 rounded-md transition-colors"
                        aria-label={`Remove ${m.email ?? 'member'}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {isOwner && invites.length > 0 && (
            <div>
              <p className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide mb-2">
                Waiting to be accepted
              </p>
              <div className="space-y-1">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-2 py-1.5">
                    <Clock className="w-3.5 h-3.5 text-grape-300 shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-[14px] text-grape-600">
                      {inv.email}
                    </span>
                    <span className="text-grape-400 text-[12px] font-semibold uppercase tracking-wide">
                      {inv.role === 'editor' ? 'Can log' : 'Can view'}
                    </span>
                    <button
                      onClick={() => revokeInvite(tracker.id, inv.id)}
                      className="p-1 text-grape-300 hover:text-rose-600 rounded-md transition-colors"
                      aria-label={`Cancel invitation to ${inv.email}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isOwner && <PublicLinkSection trackerId={tracker.id} />}

          {!isOwner && myRole && (
            <button
              onClick={handleLeave}
              className="inline-flex items-center gap-1.5 text-rose-600 hover:text-rose-700 text-[13px] font-semibold"
            >
              <LogOut className="w-3.5 h-3.5" /> Leave this tracker
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Publishing is separate from membership: a public link grants read access to
 * anyone holding it, with no account, and is revoked by turning it off or
 * resetting it.
 */
function PublicLinkSection({ trackerId }: { trackerId: string }) {
  const { token, loading, publish, unpublish, rotate } =
    usePublicLink(trackerId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const origin = window.location.origin;
  const pageUrl = token ? `${origin}/embed/${token}` : '';
  const apiUrl = token ? `${origin}/api/public/${token}` : '';
  const iframe = token
    ? `<iframe src="${pageUrl}" width="100%" height="600" style="border:0"></iframe>`
    : '';

  return (
    <div>
      <p className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <Globe className="w-3.5 h-3.5" /> Public link
      </p>

      {loading ? null : !token ? (
        <>
          <p className="text-grape-500 text-[13px] mb-2">
            Anyone with the link can view entries, but not change them. Author
            names stay private.
          </p>
          <button
            onClick={() => run(publish)}
            disabled={busy}
            className="bg-grape-50 hover:bg-grape-100 disabled:opacity-50 text-grape-700 text-[13px] font-semibold rounded-lg px-3 py-2 transition-colors"
          >
            Create public link
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <CopyRow label="Page" value={pageUrl} />
          <CopyRow label="Embed" value={iframe} />
          <CopyRow label="JSON" value={apiUrl} />
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => {
                if (
                  confirm(
                    'Reset the link? The current one stops working everywhere it has been shared.',
                  )
                )
                  run(rotate);
              }}
              disabled={busy}
              className="text-grape-500 hover:text-grape-700 text-[13px] font-semibold disabled:opacity-50"
            >
              Reset link
            </button>
            <button
              onClick={() => {
                if (confirm('Turn off the public link?')) run(unpublish);
              }}
              disabled={busy}
              className="text-rose-600 hover:text-rose-700 text-[13px] font-semibold disabled:opacity-50"
            >
              Turn off
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-rose-600 text-[12px] mt-1.5">{error}</p>}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the text is still there to select by hand.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide w-12 shrink-0">
        {label}
      </span>
      <input
        readOnly
        value={value}
        onFocus={(e) => e.target.select()}
        className="flex-1 min-w-0 bg-grape-50 text-[12px] text-grape-700 rounded-md px-2 py-1.5 focus:outline-none font-mono"
      />
      <button
        onClick={copy}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="p-1.5 text-grape-400 hover:text-grape-700 hover:bg-grape-50 rounded-md transition-colors shrink-0"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}
