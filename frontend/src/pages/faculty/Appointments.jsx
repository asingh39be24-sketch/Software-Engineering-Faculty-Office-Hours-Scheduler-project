import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ClipboardList, CheckCircle2, UserX, MoreHorizontal } from 'lucide-react';
import { api } from '../../services/api.js';
import { useDebounced, useQuery } from '../../hooks/useQuery.js';
import { CancelNote } from '../../components/CancelNote.jsx';
import { PageHeader, Tabs, Input, BookingStatus, EmptyState, ErrorState, SkeletonRows, Button, Avatar } from '../../components/ui/index.js';
import { BookingDetailModal, useBookingActions, canMarkNoShow } from '../../components/BookingDetail.jsx';
import { fmtDate, fmtRange } from '../../utils/format.js';

const TABS = [
  { value: 'upcoming', label: 'Upcoming', key: 'upcoming' },
  { value: 'awaiting', label: 'Needs outcome', key: 'awaitingOutcome' },
  { value: 'completed', label: 'Completed', key: 'completed' },
  { value: 'no_show', label: 'No-show', key: 'noShow' },
  { value: 'cancelled', label: 'Cancelled', key: 'cancelled' },
  { value: 'all', label: 'All', key: 'total' },
];

export default function Appointments() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'upcoming';
  const setTab = (t) => setParams({ tab: t }, { replace: true });
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [selected, setSelected] = useState(null);
  const actions = useBookingActions();
  const { data, error, loading, refetch } = useQuery(() => api.bookings({ scope: tab, search: q }), [tab, q], { tags: ['bookings'] });
  const counts = useQuery(() => api.facultyDashboard(), [], { tags: ['bookings', 'dashboard'] }).data?.counts;

  const quick = (b) => {
    const isPastStart = canMarkNoShow(b);
    if (b.status !== 'confirmed') return null;
    return (
      <div className="flex justify-end gap-1">
        <Button size="xs" variant="secondary" icon={UserX} disabled={!isPastStart} title={isPastStart ? 'Mark no-show' : 'Available once the appointment has started'}
          loading={actions.pending === `no_show-${b.id}`} onClick={() => actions.noShow(b).catch(() => {})}><span className="sr-only lg:not-sr-only">No-show</span></Button>
        <Button size="xs" icon={CheckCircle2} loading={actions.pending === `completed-${b.id}`} onClick={() => actions.complete(b).catch(() => {})}>
          <span className="sr-only lg:not-sr-only">Completed</span>
        </Button>
      </div>
    );
  };

  return (
    <>
      <PageHeader title="Appointments" description="Everyone who has booked your time." onRefresh={refetch} refreshing={loading && !!data} />
      <Tabs label="Appointment status" value={tab} onChange={setTab} items={TABS.map((t) => ({ ...t, count: counts?.[t.key] }))} className="mb-4" />
      <div className="card overflow-hidden">
        <div className="border-b border-ink-100 p-3">
          <Input icon={Search} aria-label="Search appointments" placeholder="Search by student name, email or topic" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        </div>
        {error && !data ? <ErrorState error={error} onRetry={refetch} /> : !data ? <SkeletonRows rows={5} /> : data.bookings.length === 0 ? (
          <EmptyState icon={ClipboardList} title={q ? 'No matching appointments' : 'Nothing here yet'}>
            {q ? 'Try a different name or email.' : tab === 'awaiting' ? 'Every past appointment has an outcome.' : 'Appointments appear here when students book your slots.'}
          </EmptyState>
        ) : (
          <>
            {/* Table on wider screens */}
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs text-ink-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Student</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Time</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-ink-50/70">
                    <td className="max-w-[260px] px-4 py-2.5">
                      <button type="button" onClick={() => setSelected(b)} className="flex items-center gap-2.5 text-left">
                        <Avatar name={b.student.name} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium hover:underline">{b.student.name}</span>
                          <span className="block truncate text-xs text-ink-500">{b.student.email}</span>
                        </span>
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">{fmtDate(b.start)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-700" data-tabular>{fmtRange(b.start, b.end)}</td>
                    <td className="px-4 py-2.5"><BookingStatus booking={b} /><CancelNote booking={b} viewer="faculty" className="mt-1 max-w-[220px]" /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {quick(b)}
                        <button type="button" onClick={() => setSelected(b)} className="rounded p-1.5 text-ink-500 hover:bg-ink-100" aria-label={`Details for ${b.student.name}`}><MoreHorizontal className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Stacked list on phones */}
            <ul className="divide-y divide-ink-100 md:hidden">
              {data.bookings.map((b) => (
                <li key={b.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => setSelected(b)} className="min-w-0 text-left">
                      <p className="truncate font-medium">{b.student.name}</p>
                      <p className="text-sm text-ink-500" data-tabular>{fmtDate(b.start)} · {fmtRange(b.start, b.end)}</p>
                      <CancelNote booking={b} viewer="faculty" />
                    </button>
                    <BookingStatus booking={b} />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <Button size="xs" variant="ghost" onClick={() => setSelected(b)}>Details</Button>
                    {quick(b)}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {selected && <BookingDetailModal booking={selected} viewer="faculty" onClose={() => setSelected(null)} />}
    </>
  );
}
