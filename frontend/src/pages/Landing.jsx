import { Link } from 'react-router-dom';
import {
  ArrowRight, CalendarClock, ShieldCheck, BellRing, ClipboardCheck, BarChart3, KeyRound, Check, Lock, Database, MousePointerClick,
} from 'lucide-react';
import { Logo } from '../components/ui/index.js';
import { useAuth, homeFor } from '../context/AuthContext.jsx';

const FEATURES = [
  { icon: ShieldCheck, title: 'Conflict-free by construction', body: 'Every reservation runs inside a single database transaction, backed by a uniqueness rule on the slot. Two students can never hold the same time, even when they click at the same instant.' },
  { icon: CalendarClock, title: 'Availability in windows, not one by one', body: 'Faculty enter a window such as 2:00 – 4:00 pm and an appointment length; the scheduler splits it into slots, previews them, and flags anything that overlaps what is already published.' },
  { icon: BellRing, title: 'Notifications that keep both sides informed', body: 'Booking confirmations, cancellations, outcomes and reminders before each appointment arrive in an in-app inbox, with optional email when the institution configures SMTP.' },
  { icon: ClipboardCheck, title: 'Attendance you can actually measure', body: 'After each session, faculty mark it completed or no-show. Missed appointments stop being invisible and become a number you can act on.' },
  { icon: BarChart3, title: 'Analytics from logged data', body: 'Administrators see bookings over time, slot utilisation, no-show trends and faculty activity, computed from the database rather than estimated.' },
  { icon: KeyRound, title: 'Role-based access', body: 'Students, faculty and administrators each get their own workspace. Administrator accounts cannot be created through public sign-up.' },
];

const STEPS = [
  { n: '01', title: 'Faculty publish availability', body: 'Pick a date, a time window and an appointment length. The slots go live immediately.' },
  { n: '02', title: 'Students reserve a slot', body: 'Search by name or department, choose a time that suits them, and confirm. The slot is theirs, instantly.' },
  { n: '03', title: 'Meet, then record the outcome', body: 'Both sides get a reminder. Afterwards, faculty mark the session completed or no-show.' },
];

/** Illustrative product preview (static markup, not live data). */
function SchedulePreview() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const rows = ['10:00', '10:20', '10:40', '11:00', '11:20'];
  const state = (d, r) => {
    if ((d === 1 && r === 1) || (d === 3 && r === 0) || (d === 0 && r === 3)) return 'booked';
    if ((d === 2 && r > 2) || (d === 4 && r < 2)) return 'none';
    if (d === 1 && r === 3) return 'selected';
    return 'open';
  };
  return (
    <div className="relative" aria-hidden>
      <div className="rounded-lg border border-ink-200 bg-white p-4 shadow-pop sm:p-5">
        <div className="flex items-center justify-between border-b border-ink-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-pine-100 text-xs font-semibold text-pine-800">DS</div>
            <div>
              <p className="text-sm font-semibold text-ink-900">Database Systems office hours</p>
              <p className="text-xs text-ink-500">20-minute appointments</p>
            </div>
          </div>
          <span className="hidden rounded-sm bg-pine-50 px-1.5 py-0.5 text-2xs font-medium text-pine-700 ring-1 ring-inset ring-pine-200 sm:inline">This week</span>
        </div>
        <div className="mt-3 grid grid-cols-[44px_repeat(5,1fr)] gap-1.5 text-center">
          <span />
          {days.map((d) => <span key={d} className="pb-1 text-2xs font-medium uppercase tracking-wider text-ink-500">{d}</span>)}
          {rows.map((t, r) => (
            <div key={t} className="contents">
              <span className="pr-1 text-right font-mono text-2xs leading-7 text-ink-400">{t}</span>
              {days.map((d, di) => {
                const s = state(di, r);
                return (
                  <span
                    key={d + t}
                    className={
                      s === 'booked' ? 'h-7 rounded-sm bg-ink-100 bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgba(0,0,0,0.04)_4px,rgba(0,0,0,0.04)_8px)]'
                        : s === 'selected' ? 'h-7 rounded-sm bg-pine-700 ring-2 ring-pine-700/20 ring-offset-1'
                          : s === 'none' ? 'h-7'
                            : 'h-7 rounded-sm border border-pine-200 bg-pine-50'
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-end gap-4 border-t border-ink-100 pt-3 text-2xs text-ink-500">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-pine-200 bg-pine-50" />Open</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink-150" />Taken</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-pine-700" />Your choice</span>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-3 hidden w-60 rounded-md border border-ink-200 bg-white p-3 shadow-pop sm:block lg:-left-10">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-pine-600 text-white"><Check className="h-3 w-3" /></span>
          <div>
            <p className="text-sm font-medium text-ink-900">Booking confirmed</p>
            <p className="text-xs text-ink-500">Tuesday, 11:00 – 11:20. A reminder will follow.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const primary = user ? { to: homeFor(user.role), label: 'Open dashboard' } : { to: '/register', label: 'Get started' };

  return (
    <div className="min-h-screen bg-paper text-ink-900">
      <header className="sticky top-0 z-30 border-b border-ink-150/80 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link to="/" aria-label="Office Hours home"><Logo /></Link>
          <nav aria-label="Primary" className="hidden items-center gap-7 text-sm text-ink-600 md:flex">
            <a href="#how" className="hover:text-ink-900">How it works</a>
            <a href="#features" className="hover:text-ink-900">Features</a>
            <a href="#students" className="hover:text-ink-900">For students</a>
            <a href="#faculty" className="hover:text-ink-900">For faculty</a>
          </nav>
          <div className="flex items-center gap-2">
            {!user && <Link to="/login" className="rounded px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100">Sign in</Link>}
            <Link to={primary.to} className="inline-flex h-9 items-center gap-1.5 rounded bg-ink-900 px-3.5 text-sm font-medium text-white hover:bg-ink-800">
              {primary.label}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-pine-700">
              <span className="h-px w-6 bg-pine-600" /> Faculty Office-Hours Scheduler
            </p>
            <h1 className="font-serif text-[44px] leading-[1.04] tracking-tight text-ink-950 sm:text-5xl lg:text-[60px]">
              Office hours,<br /> without the <em className="italic text-pine-700">hallway wait.</em>
            </h1>
            <p className="mt-6 max-w-lg text-md text-ink-600">
              Making academic interactions simpler, smarter and more accessible. Faculty and TAs publish the time they have; students reserve
              a slot that is guaranteed to be theirs, and everyone knows what was agreed.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to={primary.to} className="inline-flex h-11 items-center gap-2 rounded bg-pine-700 px-5 text-md font-medium text-white shadow-xs hover:bg-pine-800">
                {primary.label} <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#features" className="inline-flex h-11 items-center rounded border border-ink-200 bg-white px-5 text-md font-medium text-ink-800 hover:border-ink-300 hover:bg-ink-50">
                Explore features
              </a>
            </div>
          </div>
          <div className="lg:pl-6"><SchedulePreview /></div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16 border-y border-ink-150 bg-white">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <div className="max-w-xl">
              <p className="label-caps text-pine-700">How it works</p>
              <h2 className="mt-3 font-serif text-3xl tracking-tight sm:text-4xl">Three steps, one shared record.</h2>
            </div>
            <ol className="mt-12 grid gap-px overflow-hidden rounded-md border border-ink-150 bg-ink-150 md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="bg-white p-6 sm:p-7">
                  <span className="font-mono text-sm text-pine-700">{s.n}</span>
                  <h3 className="mt-4 text-lg font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-2 text-sm text-ink-600">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <div className="grid gap-12 lg:grid-cols-[320px_1fr]">
              <div>
                <p className="label-caps text-pine-700">Features</p>
                <h2 className="mt-3 font-serif text-3xl tracking-tight sm:text-4xl">Built around the one thing that must not fail.</h2>
                <p className="mt-4 text-sm text-ink-600">
                  A booking system is only useful if a confirmed booking can be trusted. Everything else is designed on top of that guarantee.
                </p>
              </div>
              <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
                {FEATURES.map(({ icon: Icon, title, body }) => (
                  <div key={title}>
                    <Icon className="h-5 w-5 text-pine-700" aria-hidden />
                    <h3 className="mt-3 text-md font-semibold tracking-tight">{title}</h3>
                    <p className="mt-1.5 text-sm text-ink-600">{body}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* The guarantee, explained */}
            <div className="mt-16 overflow-hidden rounded-lg bg-ink-950 text-ink-100">
              <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_1.3fr] lg:items-center">
                <div>
                  <p className="label-caps text-marigold-300">Under the hood</p>
                  <h3 className="mt-3 font-serif text-2xl tracking-tight text-white">What happens when two students click “Book” together</h3>
                  <p className="mt-3 text-sm text-ink-400">
                    The check and the reservation happen as one atomic step, and the database itself refuses a second active booking for a slot.
                    The first request wins; the second is told the slot is gone and sees a refreshed list.
                  </p>
                </div>
                <ol className="grid gap-2 text-sm sm:grid-cols-3">
                  {[
                    { icon: MousePointerClick, t: 'Request', d: 'Student confirms a slot' },
                    { icon: Lock, t: 'Transaction', d: 'Verify open → mark booked, atomically' },
                    { icon: Database, t: 'Constraint', d: 'Unique index blocks any duplicate' },
                  ].map(({ icon: Icon, t, d }, i) => (
                    <li key={t} className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex items-center justify-between">
                        <Icon className="h-4 w-4 text-marigold-300" aria-hidden />
                        <span className="font-mono text-2xs text-ink-500">step {i + 1}</span>
                      </div>
                      <p className="mt-3 font-medium text-white">{t}</p>
                      <p className="mt-0.5 text-xs text-ink-400">{d}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="border-t border-ink-150 bg-white">
          <div className="mx-auto grid max-w-6xl gap-px bg-ink-150 sm:px-0 md:grid-cols-2">
            {[
              {
                id: 'students', label: 'For students', title: 'Know you have a slot before you walk over.',
                items: ['See every faculty member’s open times in one place', 'Filter by department, date and time of day', 'Book in two clicks, cancel if plans change', 'Reminders before each appointment', 'A full history of your appointments'],
              },
              {
                id: 'faculty', label: 'For faculty and TAs', title: 'Offer your time once, then let it run itself.',
                items: ['Publish a whole afternoon of slots in one step', 'Overlaps and duplicates are caught before they go live', 'See who is coming and what they want to discuss', 'Record completed sessions and no-shows', 'Withdraw unbooked slots at any time'],
              },
            ].map((b) => (
              <div key={b.id} id={b.id} className="scroll-mt-16 bg-white px-5 py-16 sm:px-10 lg:px-14">
                <p className="label-caps text-pine-700">{b.label}</p>
                <h2 className="mt-3 max-w-md font-serif text-2xl tracking-tight sm:text-3xl">{b.title}</h2>
                <ul className="mt-7 space-y-3">
                  {b.items.map((it) => (
                    <li key={it} className="flex items-start gap-3 text-sm text-ink-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-pine-600" aria-hidden /> {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-ink-150">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-16 sm:px-8 md:flex-row md:items-center">
            <h2 className="max-w-xl font-serif text-3xl tracking-tight">Ready to replace the hallway queue?</h2>
            <Link to={primary.to} className="inline-flex h-11 items-center gap-2 rounded bg-ink-900 px-5 text-md font-medium text-white hover:bg-ink-800">
              {primary.label} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-150 bg-ink-100/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-sm text-ink-500 sm:px-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3">Making academic interactions simpler, smarter and more accessible.</p>
          </div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-2">
            <a href="#how" className="hover:text-ink-900">How it works</a>
            <Link to="/login" className="hover:text-ink-900">Sign in</Link>
            <a href="#features" className="hover:text-ink-900">Features</a>
            <Link to="/register" className="hover:text-ink-900">Create an account</Link>
          </div>
          <p className="text-xs md:text-right">UCS503 Software Engineering project<br />Faculty Office-Hours Scheduler</p>
        </div>
      </footer>
    </div>
  );
}
