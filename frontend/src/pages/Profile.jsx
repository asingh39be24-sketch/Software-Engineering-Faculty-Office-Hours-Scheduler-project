import { useState } from 'react';
import { api } from '../services/api.js';
import { invalidate } from '../hooks/useQuery.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, Section, Input, Textarea, Button, Badge, Avatar } from '../components/ui/index.js';
import { PASSWORD_RULES, passwordOk } from '../utils/validation.js';

export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const isFaculty = user.role === 'faculty';
  const [p, setP] = useState({ name: user.name, department: user.department || '', designation: user.designation || '', officeLocation: user.officeLocation || '', bio: user.bio || '' });
  const [savingP, setSavingP] = useState(false);
  const [pErr, setPErr] = useState({});
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwErr, setPwErr] = useState({});
  const [savingPw, setSavingPw] = useState(false);
  const setF = (k) => (e) => setP((x) => ({ ...x, [k]: e.target.value }));

  const saveProfile = async (e) => {
    e.preventDefault();
    if (p.name.trim().length < 2) { setPErr({ name: 'Enter your full name' }); return; }
    setPErr({});
    setSavingP(true);
    try {
      const { user: u } = await api.updateMe(isFaculty ? p : { name: p.name });
      setUser(u);
      toast.success('Profile saved');
      invalidate('faculty', 'users');
    } catch (err) {
      toast.error('Couldn’t save profile', err.message);
    } finally { setSavingP(false); }
  };

  const savePw = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!pw.currentPassword) errs.currentPassword = 'Enter your current password';
    if (!passwordOk(pw.newPassword)) errs.newPassword = PASSWORD_RULES.filter((r) => !r.test(pw.newPassword)).map((r) => r.label).join(', ');
    if (pw.confirm !== pw.newPassword) errs.confirm = 'Passwords do not match';
    setPwErr(errs);
    if (Object.keys(errs).length) return;
    setSavingPw(true);
    try {
      await api.changePassword({ currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      toast.success('Password changed');
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      if (err.details?.field) setPwErr({ [err.details.field]: err.message });
      else toast.error('Couldn’t change password', err.message);
    } finally { setSavingPw(false); }
  };

  return (
    <>
      <PageHeader title="Profile & settings" description="How others see you, and how you sign in." />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Section title="Profile">
          <form onSubmit={saveProfile} noValidate className="space-y-4 p-4">
            <div className="flex items-center gap-3 rounded border border-ink-150 bg-ink-50 p-3">
              <Avatar name={p.name} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{user.email}</p>
                <p className="text-xs text-ink-500">Email can’t be changed</p>
              </div>
              <Badge tone={isFaculty ? 'pine' : user.role === 'admin' ? 'marigold' : 'outline'}>{user.role}</Badge>
            </div>
            <Input label="Full name" value={p.name} onChange={setF('name')} error={pErr.name} required />
            {isFaculty && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Department" value={p.department} onChange={setF('department')} maxLength={100} />
                  <Input label="Designation" value={p.designation} onChange={setF('designation')} maxLength={100} placeholder="e.g. Teaching Assistant" />
                </div>
                <Input label="Office location" value={p.officeLocation} onChange={setF('officeLocation')} maxLength={120} placeholder="Building and room" hint="Shown to students when they book." />
                <Textarea label="Short profile" value={p.bio} onChange={setF('bio')} maxLength={600} rows={3} hint={`Courses you support or what students can ask about. ${600 - p.bio.length} characters left.`} />
              </>
            )}
            <div className="flex justify-end"><Button type="submit" loading={savingP}>Save profile</Button></div>
          </form>
        </Section>
        <Section title="Change password">
          <form onSubmit={savePw} noValidate className="space-y-4 p-4">
            <Input label="Current password" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} error={pwErr.currentPassword} required />
            <Input label="New password" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} error={pwErr.newPassword} hint="8+ characters with upper and lower case letters and a number." required />
            <Input label="Confirm new password" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} error={pwErr.confirm} required />
            <div className="flex justify-end"><Button type="submit" variant="dark" loading={savingPw}>Update password</Button></div>
          </form>
        </Section>
      </div>
    </>
  );
}
