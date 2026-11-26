import { Link } from 'react-router-dom';
import { Logo } from '../components/ui/index.js';
import { useAuth, homeFor } from '../context/AuthContext.jsx';

export default function NotFound() {
  const { user } = useAuth();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center">
      <Logo withText={false} className="mb-6" />
      <p className="label-caps">Error 404</p>
      <h1 className="mt-2 font-serif text-4xl text-ink-900">This room is empty.</h1>
      <p className="mt-3 max-w-sm text-sm text-ink-500">The page you were looking for doesn’t exist or has moved.</p>
      <Link to={user ? homeFor(user.role) : '/'} className="link mt-6 text-sm">
        {user ? 'Back to your dashboard' : 'Back to the home page'}
      </Link>
    </main>
  );
}
