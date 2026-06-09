import { Link } from 'react-router-dom';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import InteractiveGrid from '../components/InteractiveGrid';

/**
 * Landing page for first-time visitors.
 *
 * Sections:
 *  1. Hero — logo, tagline, CTA, surrounded by floating example trackers.
 *     Background is the cursor-warping InteractiveGrid (desktop) / static
 *     grid (touch).
 *  2. "Why I built this" — personal voice paragraph.
 *  3. FAQ — three short Q&As that pre-empt common questions.
 *  4. Footer — author info and links.
 *
 * Currently mounted at /landing. To make it the default landing experience
 * for strangers, you'd want to either move the app to /app/* or detect
 * "has user data" → redirect from /. Both are routing-only changes.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-cream-50 text-grape-900">
      {/* Top nav — minimal */}
      <nav className="absolute top-0 left-0 right-0 z-20 flex items-center justify-end px-6 py-5">
        <Link
          to="/"
          className="text-grape-700 hover:text-grape-900 text-[13px] font-semibold transition-colors"
        >
          Sign in →
        </Link>
      </nav>

      {/* HERO ====================================================== */}
      <section className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden">
        <InteractiveGrid />

        {/* Floating example trackers — hidden on mobile (md+) so the hero
            doesn't get cluttered. Each card has a small random rotation
            and an animation delay for floatY (defined in index.css). */}
        <FloatingTracker
          name="Wishlist"
          icon="ShoppingBag"
          colorClass="bg-grape-100 text-grape-600"
          entries={['Vintage typewriter — $250', 'Mechanical keyboard — $180']}
          className="hidden md:block top-32 left-[6%] -rotate-3"
          delay="-1s"
        />
        <FloatingTracker
          name="Friend quotes"
          icon="MessageSquareQuote"
          colorClass="bg-sky-100 text-sky-600"
          entries={[
            'Tysa: "I think I\'m allergic to mondays"',
            'Pho: "Why does the cat stare at me"',
          ]}
          className="hidden md:block top-24 right-[6%] rotate-2"
          delay="-3s"
        />
        <FloatingTracker
          name="Job apps"
          icon="Briefcase"
          colorClass="bg-emerald-100 text-emerald-600"
          entries={['BioRender — Interviewing', 'Twitch — Applied']}
          className="hidden md:block bottom-[18%] left-[10%] rotate-2"
          delay="-5s"
        />
        <FloatingTracker
          name="Red flags"
          icon="Flag"
          colorClass="bg-rose-100 text-rose-600"
          entries={[
            'Said "I don\'t read books" — yellow',
            'Cheered for Lakers — orange',
          ]}
          className="hidden md:block bottom-[20%] right-[8%] -rotate-3"
          delay="-2s"
        />
        <FloatingTracker
          name="Libraries to try"
          icon="Library"
          colorClass="bg-amber-100 text-amber-600"
          entries={['Lenis — smooth scroll', 'Motion — animation']}
          className="hidden lg:block top-[55%] left-[2%] rotate-3"
          delay="-4s"
        />

        {/* Hero content */}
        <div className="relative z-10 max-w-2xl text-center">
          <div className="flex items-center justify-center mb-12 -ml-20">
            <img src="/trackr_logo.svg" alt="" className="w-36 h-36 -mt-5" />
            <span className="font-display font-semibold text-[84px] text-grape-900 -ml-1">
              trackr
            </span>
          </div>

          <h1 className="font-display font-medium text-[40px] sm:text-[56px] leading-[1.05] text-grape-900 mb-5 tracking-tight">
            Track anything you want
          </h1>
          <p className="text-[17px] text-grape-500 max-w-md mx-auto mb-10 leading-relaxed">
            Build a custom tracker in 30 seconds with whatever fields you need.
          </p>

          <Link
            to="/"
            className="inline-block bg-grape-900 hover:bg-grape-700 text-white font-display font-semibold rounded-xl px-8 py-3.5 text-[15px] transition-colors shadow-sm"
          >
            Open Trackr →
          </Link>
          <p className="text-[13px] text-grape-400 mt-4 font-mono">
            Free forever · No signup required
          </p>
        </div>
      </section>
      <button
        onClick={() =>
          window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })
        }
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 text-grape-400 hover:text-grape-700 transition-colors"
        aria-label="Scroll to learn more"
      >
        <span className="text-[10px] font-mono uppercase tracking-[0.2em]">
          Learn more
        </span>
        <Icons.ChevronDown
          className="w-4 h-4"
          style={{ animation: 'scrollHint 2s ease-in-out infinite' }}
        />
      </button>
      {/* WHY I BUILT THIS ========================================== */}
      <section className="max-w-2xl mx-auto px-6 py-28 text-center">
        <p className="text-grape-400 text-[10px] font-semibold uppercase tracking-[0.2em] mb-4 font-mono">
          why I built this
        </p>
        <p className="text-grape-800 text-[18px] sm:text-[20px] leading-[1.55]">
          Notes apps are too clunky. Productivity apps are overkill. So I made
          my own — learn the whole thing in 30 seconds,{' '}
          <span className="italic">then track anything you want!</span> Grocery
          lists. Friends who owe you money. Books to read. Whatever You Want.
        </p>
      </section>

      {/* FAQ ======================================================= */}
      <section className="max-w-xl mx-auto px-6 py-16">
        <p className="text-grape-400 text-[10px] font-semibold uppercase tracking-[0.2em] mb-8 font-mono text-center">
          common questions
        </p>
        <div className="space-y-7">
          <FAQItem
            q="Where is my data saved if I'm not signed in?"
            a=" In your browser's local storage (specifically, IndexedDB). It stays on your device — nothing is sent anywhere. If you clear your browser data or switch devices, you'll lose it. Sign up if you want it synced and backed up."
          />
          <FAQItem
            q="What's the catch?"
            a="None. It's free. I made this for myself and you're welcome to use it."
          />
          <FAQItem
            q="Can I track [X]?"
            a="Probably. Try making a tracker for it — that's the whole point."
          />
        </div>
      </section>

      {/* SECOND CTA ================================================ */}
      <section className="max-w-2xl mx-auto px-6 py-20 text-center">
        <Link
          to="/"
          className="inline-block bg-grape-900 hover:bg-grape-700 text-white font-display font-semibold rounded-xl px-8 py-3.5 text-[15px] transition-colors shadow-sm"
        >
          Open Trackr →
        </Link>
        <p className="text-[13px] text-grape-400 mt-4 font-mono">
          Free forever · No signup required
        </p>
      </section>

      {/* FOOTER ==================================================== */}
      <footer className="border-t border-grape-100 px-6 py-10 text-center">
        <p className="text-grape-500 text-[13px]">
          Made by <span className="text-grape-700 font-semibold">Jay Kim</span>
          {' · '}
          <a
            href="https://github.com/jjhhkimm"
            target="_blank"
            rel="noreferrer"
            className="hover:text-grape-700 transition-colors"
          >
            GitHub
          </a>
          {' · '}
          <a
            href="https://jhkim-portfolio.vercel.app"
            className="hover:text-grape-700 transition-colors"
          >
            Portfolio
          </a>
        </p>
      </footer>
    </div>
  );
}

// =============================================================
// Internal components
// =============================================================

function FloatingTracker({
  name,
  icon,
  colorClass,
  entries,
  className,
  delay,
}: {
  name: string;
  icon: string;
  colorClass: string;
  entries: string[];
  className?: string;
  delay?: string;
}) {
  const Cmp =
    (Icons as unknown as Record<string, LucideIcon>)[icon] ?? Icons.Box;
  return (
    <div
      // 'floatY' is defined in index.css and animates only the `translate`
      // property, so it composes cleanly with the rotate utility on the
      // outer className (no transform-property conflict).
      className={`absolute z-5 bg-white border border-grape-100 rounded-xl px-3 py-2.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all max-w-50 ${className}`}
      style={{
        animation: 'floatY 7s ease-in-out infinite',
        animationDelay: delay,
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <div
          className={`w-5 h-5 rounded flex items-center justify-center ${colorClass}`}
        >
          <Cmp className="w-3 h-3" />
        </div>
        <p className="text-[11px] font-semibold text-grape-800 truncate">
          {name}
        </p>
      </div>
      <div className="space-y-0.5">
        {entries.map((e, i) => (
          <p key={i} className="text-[10px] text-grape-500 truncate">
            {e}
          </p>
        ))}
      </div>
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <p className="text-grape-900 text-[15px] font-semibold mb-1.5">{q}</p>
      <p className="text-grape-500 text-[14px] leading-relaxed">{a}</p>
    </div>
  );
}
