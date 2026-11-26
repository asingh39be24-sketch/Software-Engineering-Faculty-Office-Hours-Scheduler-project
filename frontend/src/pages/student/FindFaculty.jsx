import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, MapPin, ArrowRight, Users, X } from 'lucide-react';
import { api } from '../../services/api.js';
import { useDebounced, useQuery } from '../../hooks/useQuery.js';
import { PageHeader, Input, Select, Avatar, EmptyState, ErrorState, SkeletonRows, Button } from '../../components/ui/index.js';
import { dayKey, fmtDate, fmtTime, timeOfDay, plural } from '../../utils/format.js';

const TIMES = [
  { value: '', label: 'Any time' },
  { value: 'morning', label: 'Morning (before 12)' },
  { value: 'afternoon', label: 'Afternoon (12 – 5)' },
  { value: 'evening', label: 'Evening (after 5)' },
];

export default function FindFaculty() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const department = params.get('dept') || '';
  const date = params.get('date') || '';
  const time = params.get('time') || '';
  const q = useDebounced(search.trim(), 250);
  const setParam = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p, { replace: true }); };

  const deps = useQuery(() => api.departments(), [], { tags: ['faculty'] });
  const { data, error, loading, refetch } = useQuery(() => api.faculty({ search: q, department }), [q, department], { tags: ['slots', 'faculty'] });

  // Date / time-of-day filtering is local-time based, so it happens here.
  const results = useMemo(() => {
    if (!data) return [];
    return data.faculty
      .map((f) => {
        const matching = f.openSlots.filter((s) => (!date || dayKey(s.start) === date) && (!time || timeOfDay(s.start) === time));
        return { ...f, matching };
      })
      .filter((f) => (!date && !time) || f.matching.length > 0);
  }, [data, date, time]);

  const filtersActive = q || department || date || time;
  const clear = () => { setSearch(''); setParams({}, { replace: true }); };
  const today = dayKey(new Date());

  return (
    <>
      <PageHeader title="Find faculty" description="Search the directory and open a schedule to book." onRefresh={refetch} refreshing={loading && !!data} />

      <div className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_0.9fr_0.9fr_auto] lg:items-end">
        <Input icon={Search} aria-label="Search by name" placeholder="Search by name or subject area" value={search} onChange={(e) => { setSearch(e.target.value); setParam('q', e.target.value); }} />
        <Select aria-label="Department" value={department} onChange={(e) => setParam('dept', e.target.value)}>
          <option value="">All departments</option>
          {deps.data?.departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </Select>
        <Input type="date" aria-label="Available on date" min={today} value={date} onChange={(e) => setParam('date', e.target.value)} />
        <Select aria-label="Time of day" value={time} onChange={(e) => setParam('time', e.target.value)}>
          {TIMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <Button variant="ghost" icon={X} onClick={clear} disabled={!filtersActive}>Clear</Button>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5 text-xs text-ink-500">
          <span aria-live="polite">{data ? plural(results.length, 'faculty member', 'faculty members') : 'Loading…'}</span>
          <span className="hidden sm:inline">{date || time ? 'Showing slots that match your filters' : 'Open slots in the next 60 days'}</span>
        </div>
        {error && !data ? <ErrorState error={error} onRetry={refetch} /> : !data ? <SkeletonRows rows={5} /> : results.length === 0 ? (
          <EmptyState icon={Users} title={filtersActive ? 'No one matches these filters' : 'No faculty have registered yet'}
            action={filtersActive && <Button variant="secondary" size="sm" onClick={clear}>Clear filters</Button>}>
            {filtersActive ? 'Try another date, time of day, or department.' : 'Once faculty members sign up and publish availability, they’ll appear here.'}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-ink-100">
            {results.map((f) => {
              const slots = date || time ? f.matching : f.openSlots;
              const nextSlot = slots[0];
              const to = `/student/faculty/${f.id}${nextSlot ? `?date=${dayKey(nextSlot.start)}` : ''}`;
              return (
                <li key={f.id} className="group relative flex flex-col gap-3 px-4 py-4 hover:bg-ink-50/70 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Avatar name={f.name} size="lg" />
                    <div className="min-w-0">
                      <Link to={to} className="font-semibold text-ink-900 after:absolute after:inset-0 hover:underline">{f.name}</Link>
                      <p className="text-sm text-ink-500">{[f.designation, f.department].filter(Boolean).join(' · ') || 'Faculty'}</p>
                      {f.bio && <p className="mt-1 line-clamp-1 max-w-xl text-sm text-ink-600">{f.bio}</p>}
                      {f.officeLocation && <p className="mt-1 inline-flex items-center gap-1 text-xs text-ink-500"><MapPin className="h-3 w-3" />{f.officeLocation}</p>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 pl-14 sm:w-64 sm:justify-end sm:pl-0">
                    <div className="text-left sm:text-right">
                      {nextSlot ? (
                        <>
                          <p className="text-sm font-medium text-pine-700">{plural(slots.length, 'open slot')}</p>
                          <p className="text-xs text-ink-500" data-tabular>Next: {fmtDate(nextSlot.start)}, {fmtTime(nextSlot.start)}</p>
                        </>
                      ) : <p className="text-sm text-ink-400">No open slots</p>}
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-600" aria-hidden />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
