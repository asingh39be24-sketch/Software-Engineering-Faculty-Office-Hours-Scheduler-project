import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, GraduationCap, BookOpenText, ShieldCheck, Check, Circle, Info } from 'lucide-react';
import { Button, Input, Logo } from '../components/ui/index.js';
import { useAuth, homeFor } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../services/api.js';
import { EMAIL_RE, PASSWORD_RULES, passwordOk } from '../utils/validation.js';
import { cn } from '../utils/cn.js';

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen bg-paper lg:grid-cols-[1fr_minmax(0,520px)]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Link to="/" className="self-start" aria-label="Office Hours home"><Logo /></Link>
        <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          <h1 className="font-serif text-3xl tracking-tight text-ink-950">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-sm text-ink-500">{footer}</div>}
        </main>
      </div>
      <aside className="relative hidden overflow-hidden bg-pine-900 text-pine-50 lg:block" aria-hidden>
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <p className="font-serif text-[34px] leading-tight text-white">“Is now a good time?”</p>
          <p className="mt-3 max-w-sm text-sm text-pine-200">
            Answered before you knock. Published availability, reserved slots and a shared record of every appointment.
          </p>
          <div className="mt-10 flex gap-6 border-t border-white/10 pt-6 text-xs text-pine-200">
            <span>Conflict-free booking</span><span>Reminders</span><span>Attendance records</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

function PasswordInput({ label = 'Password', value, onChange, error, autoComplete, id, hint }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} label={label} type={show ? 'text' : 'password'} value={value} onChange={onChange} error={error} hint={hint} autoComplete={autoComplete} required className="pr-9" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-1.5 top-[30px] rounded p-1.5 text-ink-400 hover:text-ink-700"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!EMAIL_RE.test(form.email.trim())) errs.email = 'Enter a valid email address';
    if (!form.password) errs.password = 'Enter your password';
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const user = await login(form.email.trim(), form.password);
      toast.success(`Welcome back, ${user.name.replace(/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i, '').split(' ')[0]}`);
      const from = location.state?.from;
      navigate(from && from.startsWith(homeFor(user.role)) ? from : homeFor(user.role), { replace: true });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back. Use the email you registered with."
      footer={<>New here? <Link to="/register" className="link">Create an account</Link></>}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && <p role="alert" className="rounded border border-brick-200 bg-brick-50 px-3 py-2 text-sm text-brick-700">{formError}</p>}
        <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} required autoFocus />
        <PasswordInput id="login-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={errors.password} autoComplete="current-password" />
        <Button type="submit" className="w-full" size="lg" loading={busy}>Sign in</Button>
      </form>
    </AuthShell>
  );
}

const ROLES = [
  { value: 'student', label: 'Student', icon: GraduationCap, desc: 'Book office hours' },
  { value: 'faculty', label: 'Faculty / TA', icon: BookOpenText, desc: 'Offer office hours' },
  { value: 'admin', label: 'Administrator', icon: ShieldCheck, desc: 'Requires authorisation' },
];

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', role: 'student', department: '', designation: '', adminCode: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => { api.config().then(setCfg).catch(() => setCfg({ adminSelfRegistration: false })); }, []);
  const adminBlocked = form.role === 'admin' && cfg && !cfg.adminSelfRegistration;

  const validate = () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Enter your full name';
    if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address';
    if (!passwordOk(form.password)) e.password = 'Password does not meet the requirements below';
    if (form.confirmPassword !== form.password) e.confirmPassword = 'Passwords do not match';
    if (form.role === 'admin' && !form.adminCode.trim()) e.adminCode = 'Enter the administrator access code';
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setFormError('');
    if (Object.keys(e).length || adminBlocked) return;
    setBusy(true);
    try {
      const user = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        role: form.role,
        ...(form.role === 'faculty' && { department: form.department.trim(), designation: form.designation.trim() }),
        ...(form.role === 'admin' && { adminCode: form.adminCode.trim() }),
      });
      toast.success('Account created', `Signed in as ${user.name}.`);
      navigate(homeFor(user.role), { replace: true });
    } catch (err) {
      if (err.code === 'EMAIL_TAKEN') setErrors({ email: err.message });
      else if (err.details?.field) setErrors({ [err.details.field]: err.message });
      else setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Choose how you’ll use Office Hours. You can update your profile later."
      footer={<>Already registered? <Link to="/login" className="link">Sign in</Link></>}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && <p role="alert" className="rounded border border-brick-200 bg-brick-50 px-3 py-2 text-sm text-brick-700">{formError}</p>}

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-800">I am a</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {ROLES.map(({ value, label, icon: Icon, desc }) => {
              const active = form.role === value;
              return (
                <label
                  key={value}
                  className={cn(
                    'relative flex cursor-pointer flex-col rounded border bg-white p-2.5 text-left shadow-xs transition-colors focus-within:ring-2 focus-within:ring-pine-500/40',
                    active ? 'border-pine-600 ring-1 ring-pine-600' : 'border-ink-200 hover:border-ink-300'
                  )}
                >
                  <input type="radio" name="role" value={value} checked={active} onChange={set('role')} className="sr-only" />
                  <Icon className={cn('h-4 w-4', active ? 'text-pine-700' : 'text-ink-400')} aria-hidden />
                  <span className="mt-2 text-sm font-medium leading-tight text-ink-900">{label}</span>
                  <span className="mt-0.5 hidden text-2xs text-ink-500 sm:block">{desc}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {form.role === 'admin' && (
          adminBlocked ? (
            <div className="flex gap-2.5 rounded border border-marigold-200 bg-marigold-50 px-3 py-2.5 text-sm text-ink-700" role="note">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-marigold-500" aria-hidden />
              <p>Administrator accounts can’t be created through public sign-up on this installation. An existing administrator can create one for you from the Users page.</p>
            </div>
          ) : (
            <Input label="Administrator access code" value={form.adminCode} onChange={set('adminCode')} error={errors.adminCode} hint="Issued by the platform operator." autoComplete="off" required />
          )
        )}

        <Input label="Full name" value={form.name} onChange={set('name')} error={errors.name} autoComplete="name" required />
        <Input label="Email address" type="email" value={form.email} onChange={set('email')} error={errors.email} autoComplete="email" required />

        {form.role === 'faculty' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Department" value={form.department} onChange={set('department')} placeholder="e.g. Computer Science" />
            <Input label="Designation" value={form.designation} onChange={set('designation')} placeholder="e.g. Assistant Professor" />
          </div>
        )}

        <PasswordInput id="reg-password" value={form.password} onChange={set('password')} error={errors.password} autoComplete="new-password" />
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1" aria-label="Password requirements">
          {PASSWORD_RULES.map((r) => {
            const ok = r.test(form.password);
            return (
              <li key={r.id} className={cn('flex items-center gap-1.5 text-xs', ok ? 'text-pine-700' : 'text-ink-500')}>
                {ok ? <Check className="h-3 w-3" aria-hidden /> : <Circle className="h-2.5 w-2.5" aria-hidden />}
                {r.label}<span className="sr-only">{ok ? ' (met)' : ' (not met)'}</span>
              </li>
            );
          })}
        </ul>
        <PasswordInput id="reg-confirm" label="Confirm password" value={form.confirmPassword} onChange={set('confirmPassword')} error={errors.confirmPassword} autoComplete="new-password" />

        <Button type="submit" className="w-full" size="lg" loading={busy} disabled={adminBlocked}>Create account</Button>
      </form>
    </AuthShell>
  );
}
