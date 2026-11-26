import { useState } from 'react';
import { Search, UserPlus, Users as UsersIcon, Power } from 'lucide-react';
import { api } from '../../services/api.js';
import { invalidate, useDebounced, useQuery } from '../../hooks/useQuery.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader, Input, Select, Badge, Avatar, EmptyState, ErrorState, SkeletonRows, Modal, Button, DefinitionList, ConfirmDialog } from '../../components/ui/index.js';
import { fmtDate, fmtRelative, fmtDateTime } from '../../utils/format.js';
import { EMAIL_RE, passwordOk } from '../../utils/validation.js';

const ROLE = { student: ['Student', 'outline'], faculty: ['Faculty', 'pine'], admin: ['Admin', 'marigold'] };

function UserDetail({ id, onClose }) {
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, error, refetch } = useQuery(() => api.user(id), [id], { tags: ['users'] });
  const [confirm, setConfirm] = useState(false);
  const u = data?.user;
  const toggle = async () => {
    try {
      await api.setUserActive(u.id, !u.isActive);
      toast.success(u.isActive ? 'Account deactivated' : 'Account reactivated', u.name);
      setConfirm(false);
      invalidate('users', 'analytics', 'faculty', 'slots');
    } catch (e) {
      toast.error('Couldn’t update account', e.message);
    }
  };
  const s = u?.stats;
  return (
    <>
      <Modal open={!confirm} onClose={onClose} title="Account details" size="md"
        footer={u && (
          <>
            {u.id !== me.id && (
              <Button variant={u.isActive ? 'danger' : 'primary'} icon={Power} onClick={() => setConfirm(true)}>
                {u.isActive ? 'Deactivate account' : 'Reactivate account'}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </>
        )}>
        {error ? <ErrorState error={error} onRetry={refetch} /> : !u ? <SkeletonRows rows={4} className="p-0" /> : (
          <>
            <div className="mb-3 flex items-center gap-3">
              <Avatar name={u.name} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{u.name}</p>
                <p className="truncate text-sm text-ink-500">{u.email}</p>
              </div>
              <Badge tone={ROLE[u.role][1]}>{ROLE[u.role][0]}</Badge>
            </div>
            <DefinitionList items={[
              ['Status', u.isActive ? <Badge tone="pine" dot>Active</Badge> : <Badge tone="neutral" dot>Deactivated</Badge>],
              ['Registered', fmtDateTime(u.createdAt)],
              ['Last sign-in', u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'Never'],
              u.role === 'faculty' && ['Department', u.department],
              u.role === 'faculty' && ['Designation', u.designation],
              u.role === 'faculty' && ['Office', u.officeLocation],
              u.role === 'student' && s && ['Bookings', `${s.total} total · ${s.confirmed} confirmed · ${s.completed} completed · ${s.noShow} no-show · ${s.cancelled} cancelled`],
              u.role === 'faculty' && s && ['Slots', `${s.slots} published · ${s.openUpcoming} open upcoming`],
              u.role === 'faculty' && s && ['Appointments', `${s.total} total · ${s.completed} completed · ${s.noShow} no-show · ${s.cancelled} cancelled`],
            ]} />
          </>
        )}
      </Modal>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} tone={u?.isActive ? 'danger' : 'primary'}
        title={u?.isActive ? `Deactivate ${u?.name}?` : `Reactivate ${u?.name}?`}
        description={u?.isActive
          ? `They will be signed out and unable to sign in.${u?.role === 'faculty' ? ' Their open slots will be hidden from students.' : ''} Existing records are kept.`
          : 'They will be able to sign in again.'}
        confirmLabel={u?.isActive ? 'Deactivate' : 'Reactivate'} onConfirm={toggle} />
    </>
  );
}

function CreateUser({ open, onClose }) {
  const toast = useToast();
  const blank = { name: '', email: '', password: '', role: 'admin' };
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (f.name.trim().length < 2) errs.name = 'Enter a full name';
    if (!EMAIL_RE.test(f.email.trim())) errs.email = 'Enter a valid email';
    if (!passwordOk(f.password)) errs.password = '8+ characters with upper, lower case and a number';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const { user } = await api.createUser({ ...f, name: f.name.trim(), email: f.email.trim() });
      toast.success('Account created', `${user.name} (${user.role})`);
      invalidate('users', 'analytics');
      setF(blank);
      onClose();
    } catch (err) {
      setErrors(err.code === 'EMAIL_TAKEN' ? { email: err.message } : { form: err.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} closeDisabled={busy} title="Create an account" description="Use this to add administrators; students and faculty can also self-register."
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form="create-user" loading={busy}>Create account</Button></>}>
      <form id="create-user" onSubmit={submit} noValidate className="space-y-3">
        {errors.form && <p role="alert" className="text-sm text-brick-600">{errors.form}</p>}
        <Select label="Role" value={f.role} onChange={set('role')}>
          <option value="admin">Administrator</option>
          <option value="faculty">Faculty / TA</option>
          <option value="student">Student</option>
        </Select>
        <Input label="Full name" value={f.name} onChange={set('name')} error={errors.name} required data-autofocus />
        <Input label="Email" type="email" value={f.email} onChange={set('email')} error={errors.email} required />
        <Input label="Temporary password" type="text" value={f.password} onChange={set('password')} error={errors.password} hint="Share it securely; they can change it under Profile." required autoComplete="off" />
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search.trim());
  const { data, error, loading, refetch } = useQuery(() => api.users({ search: q, role, status }), [q, role, status], { tags: ['users'] });

  return (
    <>
      <PageHeader title="Users" description="Everyone registered on the platform." onRefresh={refetch} refreshing={loading && !!data}
        actions={<Button icon={UserPlus} onClick={() => setCreating(true)}>Add user</Button>} />
      <div className="card overflow-hidden">
        <div className="grid gap-2 border-b border-ink-100 p-3 sm:grid-cols-[1fr_160px_160px]">
          <Input icon={Search} aria-label="Search users" placeholder="Search name, email or department" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option><option value="student">Students</option><option value="faculty">Faculty</option><option value="admin">Admins</option>
          </Select>
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option><option value="active">Active</option><option value="inactive">Deactivated</option>
          </Select>
        </div>
        {error && !data ? <ErrorState error={error} onRetry={refetch} /> : !data ? <SkeletonRows rows={6} /> : data.users.length === 0 ? (
          <EmptyState icon={UsersIcon} title="No users match">Try a different search or filter.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Registered users</caption>
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs text-ink-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Role</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Activity</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Registered</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.users.map((u) => (
                  <tr key={u.id} className="cursor-pointer hover:bg-ink-50/70" onClick={() => setSelected(u.id)}>
                    <td className="px-4 py-2.5">
                      <button type="button" className="flex items-center gap-2.5 text-left" onClick={(e) => { e.stopPropagation(); setSelected(u.id); }}>
                        <Avatar name={u.name} size="sm" />
                        <span className="min-w-0">
                          <span className="block font-medium hover:underline">{u.name}</span>
                          <span className="block text-xs text-ink-500">{u.email}</span>
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-2.5"><Badge tone={ROLE[u.role][1]}>{ROLE[u.role][0]}</Badge></td>
                    <td className="px-4 py-2.5 text-ink-600" data-tabular>
                      {u.role === 'student' ? `${u.stats.bookings} bookings` : u.role === 'faculty' ? `${u.stats.slots} slots · ${u.stats.bookings} bookings` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-ink-600" title={fmtDateTime(u.createdAt)}>{fmtDate(u.createdAt, { year: 'numeric' })}</td>
                    <td className="px-4 py-2.5">
                      {u.isActive ? <Badge tone="pine" dot>Active</Badge> : <Badge tone="neutral" dot>Deactivated</Badge>}
                      {u.lastLoginAt && <span className="ml-2 hidden text-xs text-ink-400 xl:inline">seen {fmtRelative(u.lastLoginAt)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {selected && <UserDetail id={selected} onClose={() => setSelected(null)} />}
      <CreateUser open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
