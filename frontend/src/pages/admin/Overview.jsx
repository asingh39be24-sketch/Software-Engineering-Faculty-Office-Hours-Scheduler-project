import { useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Users, GraduationCap, BookOpenText, CalendarCheck, CheckCircle2, UserX, Gauge, CalendarClock } from 'lucide-react';
import { api } from '../../services/api.js';
import { useQuery } from '../../hooks/useQuery.js';
import { PageHeader, StatGroup, Stat, ErrorState, Select } from '../../components/ui/index.js';
import { ChartCard, ChartTooltip, Legend, SERIES, AXIS } from '../../components/ChartCard.jsx';

const pct = (v) => (v == null ? '—' : `${v}%`);
const shortDate = (ymd) => new Date(`${ymd}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const weekLabel = (ymd) => `Wk of ${shortDate(ymd)}`;
const STATUS = {
  confirmed: { label: 'Confirmed', color: SERIES.cobalt },
  completed: { label: 'Completed', color: SERIES.pine },
  no_show: { label: 'No-show', color: SERIES.brick },
  cancelled: { label: 'Cancelled', color: SERIES.neutral },
};

export default function AdminOverview() {
  const [days, setDays] = useState('30');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data, error, loading, refetch } = useQuery(() => api.analytics({ days, tz }), [days], { tags: ['analytics', 'bookings', 'slots', 'users'] });
  const m = data?.metrics;
  const ch = data?.charts;
  const statusTotal = ch?.statusDistribution.reduce((a, s) => a + s.count, 0) || 0;
  const pastWeeks = ch?.weekly.filter((w) => !w.isFuture) || [];

  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Analytics"
        description={data ? `Live from the database · updated ${new Date(data.generatedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : 'Live from the database'}
        onRefresh={refetch}
        refreshing={loading && !!data}
        actions={
          <Select aria-label="Time range" value={days} onChange={(e) => setDays(e.target.value)} className="h-8 w-36 text-sm">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </Select>
        }
      />
      {error && !data ? <div className="card"><ErrorState error={error} onRetry={refetch} /></div> : (
        <div className="space-y-6">
          <StatGroup className="grid-cols-2 lg:grid-cols-4">
            <Stat label="Registered users" value={m?.users.total} icon={Users} loading={!m} sub={m && `${m.users.admins} admin · ${m.users.inactive} deactivated`} />
            <Stat label="Students" value={m?.users.students} icon={GraduationCap} loading={!m} />
            <Stat label="Faculty / TAs" value={m?.users.faculty} icon={BookOpenText} loading={!m} />
            <Stat label="Total bookings" value={m?.bookings.total} icon={CalendarCheck} loading={!m} sub={m && `${m.bookings.upcoming} upcoming · ${m.bookings.cancelled} cancelled`} />
            <Stat label="Completed" value={m?.bookings.completed} icon={CheckCircle2} accent="text-pine-600" loading={!m} sub={m?.avgLeadTimeHours != null ? `Booked ${m.avgLeadTimeHours} h ahead on average` : undefined} />
            <Stat label="No-show rate" value={pct(m?.noShowRate)} icon={UserX} accent="text-brick-500" loading={!m} sub={m && `${m.bookings.noShow} of ${m.bookings.completed + m.bookings.noShow} concluded`} />
            <Stat label="Slot utilisation" value={pct(m?.slotUtilization)} icon={Gauge} accent="text-cobalt-500" loading={!m} sub={m && `${m.slots.booked} booked of ${m.slots.booked + m.slots.openUpcoming + m.slots.openExpired} published`} />
            <Stat label="Available slots" value={m?.slots.openUpcoming} icon={CalendarClock} accent="text-pine-600" loading={!m} sub="Open and in the future" />
          </StatGroup>

          {!ch ? <div className="grid gap-6 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-72" />)}</div> : (
            <>
              <div className="grid gap-6 lg:grid-cols-3">
                <ChartCard
                  className="lg:col-span-2"
                  title="Bookings over time"
                  description={`Bookings made and cancelled per day, last ${data.periodDays} days`}
                  legend={<Legend items={[{ label: 'Booked', color: SERIES.pine }, { label: 'Cancelled', color: SERIES.neutral }]} />}
                  table={{ columns: ['Date', 'Booked', 'Cancelled'], rows: ch.bookingsOverTime.map((d) => [shortDate(d.date), d.booked, d.cancelled]) }}
                >
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={ch.bookingsOverTime} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#efefec" />
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS.tick} axisLine={{ stroke: AXIS.stroke }} tickLine={false} minTickGap={24} />
                      <YAxis allowDecimals={false} tick={AXIS.tick} axisLine={false} tickLine={false} width={40} />
                      <Tooltip cursor={{ fill: 'rgba(18,18,17,0.04)' }} content={<ChartTooltip labelFormatter={(l) => new Date(`${l}T12:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} />} />
                      <Bar dataKey="booked" name="Booked" fill={SERIES.pine} radius={[4, 4, 0, 0]} maxBarSize={18} />
                      <Bar dataKey="cancelled" name="Cancelled" fill={SERIES.neutral} radius={[4, 4, 0, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard
                  title="Bookings by status"
                  description="All bookings to date"
                  empty={statusTotal === 0 && 'No bookings yet'}
                  table={{ columns: ['Status', 'Bookings', 'Share'], rows: ch.statusDistribution.map((s) => [STATUS[s.status].label, s.count, statusTotal ? `${Math.round((s.count / statusTotal) * 100)}%` : '—']) }}
                >
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={170}>
                      <PieChart>
                        <Tooltip content={<ChartTooltip labelFormatter={(_, p) => p[0]?.name} valueFormatter={(v) => `${v} (${Math.round((v / statusTotal) * 100)}%)`} />} />
                        <Pie data={ch.statusDistribution.map((s) => ({ ...s, name: STATUS[s.status].label }))} dataKey="count" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={1} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                          {ch.statusDistribution.map((s) => <Cell key={s.status} fill={STATUS[s.status].color} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-semibold" data-tabular>{statusTotal}</span>
                      <span className="text-2xs text-ink-500">bookings</span>
                    </div>
                  </div>
                  <ul className="mt-2 space-y-1 px-2">
                    {ch.statusDistribution.map((s) => (
                      <li key={s.status} className="flex items-center gap-2 text-xs">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS[s.status].color }} aria-hidden />
                        <span className="flex-1 text-ink-600">{STATUS[s.status].label}</span>
                        <span className="font-medium text-ink-900" data-tabular>{s.count}</span>
                        <span className="w-10 text-right text-ink-500" data-tabular>{statusTotal ? `${Math.round((s.count / statusTotal) * 100)}%` : '—'}</span>
                      </li>
                    ))}
                  </ul>
                </ChartCard>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <ChartCard
                  title="Slot utilisation by week"
                  description="Published slots that were booked, by appointment week (includes the next two weeks)"
                  legend={<Legend items={[{ label: 'Booked', color: SERIES.cobalt }, { label: 'Not booked', color: '#dededa' }]} />}
                  table={{ columns: ['Week', 'Booked', 'Not booked', 'Utilisation'], rows: ch.weekly.map((w) => [weekLabel(w.week) + (w.isFuture ? ' (upcoming)' : ''), w.booked, w.unbooked, pct(w.utilization)]) }}
                >
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={ch.weekly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#efefec" />
                      <XAxis dataKey="week" tickFormatter={shortDate} tick={AXIS.tick} axisLine={{ stroke: AXIS.stroke }} tickLine={false} />
                      <YAxis allowDecimals={false} tick={AXIS.tick} axisLine={false} tickLine={false} width={40} />
                      <Tooltip cursor={{ fill: 'rgba(18,18,17,0.04)' }} content={<ChartTooltip labelFormatter={(l, p) => `${weekLabel(l)} · ${pct(p[0]?.payload.utilization)} booked`} />} />
                      <Bar dataKey="booked" name="Booked" stackId="s" fill={SERIES.cobalt} stroke="#fff" strokeWidth={1} maxBarSize={36} />
                      <Bar dataKey="unbooked" name="Not booked" stackId="s" fill="#dededa" stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard
                  title="No-show trend"
                  description="Share of concluded appointments that were missed, by week"
                  empty={pastWeeks.every((w) => w.noShowRate == null) && 'No concluded appointments in this period'}
                  table={{ columns: ['Week', 'Completed', 'No-show', 'No-show rate'], rows: pastWeeks.map((w) => [weekLabel(w.week), w.completed, w.noShow, pct(w.noShowRate)]) }}
                >
                  <ResponsiveContainer width="100%" height={230}>
                    <LineChart data={pastWeeks} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#efefec" />
                      <XAxis dataKey="week" tickFormatter={shortDate} tick={AXIS.tick} axisLine={{ stroke: AXIS.stroke }} tickLine={false} />
                      <YAxis domain={[0, (max) => Math.max(20, Math.ceil(max / 10) * 10)]} tickFormatter={(v) => `${v}%`} tick={AXIS.tick} axisLine={false} tickLine={false} width={44} />
                      <Tooltip cursor={{ stroke: '#c6c6c0', strokeDasharray: '3 3' }} content={<ChartTooltip labelFormatter={weekLabel} valueFormatter={(v, p) => `${v}% (${p.payload.noShow} of ${p.payload.completed + p.payload.noShow})`} />} />
                      <Line type="linear" isAnimationActive={false} dataKey="noShowRate" name="No-show rate" stroke={SERIES.brick} strokeWidth={2} dot={{ r: 4, fill: SERIES.brick, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              <ChartCard
                title="Faculty activity"
                description="Slots published and booked per faculty member (top 10)"
                empty={ch.facultyActivity.length === 0 && 'No faculty have published availability yet'}
                legend={<Legend items={[{ label: 'Published', color: '#c6c6c0' }, { label: 'Booked', color: SERIES.pine }]} />}
                table={{ columns: ['Faculty', 'Published', 'Booked', 'Completed', 'No-show'], rows: ch.facultyActivity.map((f) => [f.name, f.published, f.booked, f.completed, f.noShow]) }}
              >
                <ResponsiveContainer width="100%" height={Math.max(140, ch.facultyActivity.length * 44)}>
                  <BarChart data={ch.facultyActivity} layout="vertical" barGap={2} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid horizontal={false} stroke="#efefec" />
                    <XAxis type="number" allowDecimals={false} tick={AXIS.tick} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ ...AXIS.tick, fill: '#41413d' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(18,18,17,0.04)' }} content={<ChartTooltip />} />
                    <Bar dataKey="published" name="Published" fill="#c6c6c0" radius={[0, 4, 4, 0]} maxBarSize={14} />
                    <Bar dataKey="booked" name="Booked" fill={SERIES.pine} radius={[0, 4, 4, 0]} maxBarSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </>
          )}
        </div>
      )}
    </>
  );
}
