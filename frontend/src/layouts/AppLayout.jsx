import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutGrid, Search, CalendarCheck, CalendarClock, ClipboardList, BarChart3, Users, Activity,
  Bell, UserRound, LogOut, Menu, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar, Logo } from '../components/ui/index.js';
import { NotificationBell } from '../components/NotificationBell.jsx';
import { cn } from '../utils/cn.js';

const NAV = {
  student: [
    { to: '/student', label: 'Overview', icon: LayoutGrid, end: true },
    { to: '/student/faculty', label: 'Find faculty', icon: Search },
    { to: '/student/bookings', label: 'My bookings', icon: CalendarCheck },
  ],
  faculty: [
    { to: '/faculty', label: 'Overview', icon: LayoutGrid, end: true },
    { to: '/faculty/availability', label: 'Availability', icon: CalendarClock },
    { to: '/faculty/appointments', label: 'Appointments', icon: ClipboardList },
  ],
  admin: [
    { to: '/admin', label: 'Analytics', icon: BarChart3, end: true },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/slots', label: 'Slots', icon: CalendarClock },
    { to: '/admin/activity', label: 'System activity', icon: Activity },
  ],
};
const ROLE_LABEL = { student: 'Student', faculty: 'Faculty / TA', admin: 'Administrator' };

function NavItem({ item, onNavigate }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group flex h-8 items-center gap-2.5 rounded px-2.5 text-sm transition-colors',
          isActive ? 'bg-white font-medium text-ink-900 shadow-sm' : 'text-ink-600 hover:bg-ink-150/70 hover:text-ink-900'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('h-4 w-4', isActive ? 'text-pine-700' : 'text-ink-400 group-hover:text-ink-600')} aria-hidden />
          {item.label}
        </>
      )}
    </NavLink>
  );
}

function SidebarContent({ onNavigate }) {
  const { user, logout } = useAuth();
  const items = NAV[user.role] || [];
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Logo />
      </div>
      <nav aria-label="Main" className="flex-1 space-y-5 px-3 pt-2">
        <div className="space-y-0.5">
          <p className="label-caps px-2.5 pb-1.5">{ROLE_LABEL[user.role]}</p>
          {items.map((it) => <NavItem key={it.to} item={it} onNavigate={onNavigate} />)}
        </div>
        <div className="space-y-0.5">
          <p className="label-caps px-2.5 pb-1.5">Account</p>
          <NavItem item={{ to: '/notifications', label: 'Notifications', icon: Bell }} onNavigate={onNavigate} />
          <NavItem item={{ to: '/profile', label: 'Profile & settings', icon: UserRound }} onNavigate={onNavigate} />
        </div>
      </nav>
      <div className="border-t border-ink-150 p-3">
        <div className="flex items-center gap-2.5 rounded px-1.5 py-1.5">
          <Avatar name={user.name} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink-900">{user.name}</p>
            <p className="truncate text-xs text-ink-500">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded p-1.5 text-ink-500 hover:bg-ink-150 hover:text-ink-900"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMobileOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-ink-50">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-ink-150 bg-ink-100/70 lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 animate-fade-in bg-ink-950/30" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 animate-slide-in border-r border-ink-150 bg-ink-100 shadow-modal">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3.5 rounded p-1.5 text-ink-500 hover:bg-ink-150"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-ink-150 bg-ink-50/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="-ml-1.5 rounded p-1.5 text-ink-600 hover:bg-ink-100"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
            >
              <Menu className="h-5 w-5" />
            </button>
            <Logo />
          </div>
          <p className="hidden text-sm text-ink-500 lg:block" data-tabular>
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <NotificationBell />
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
