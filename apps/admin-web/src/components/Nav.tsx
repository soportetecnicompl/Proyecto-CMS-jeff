'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearSession, getUser } from '@/lib/auth';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/complexes', label: 'Complejos' },
  { href: '/loyalty', label: 'Lealtad' },
  { href: '/templates', label: 'Plantillas WhatsApp' },
];

export function Nav() {
  const router = useRouter();
  const user = getUser();

  const handleLogout = () => {
    clearSession();
    router.replace('/login');
  };

  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1rem 2rem', borderBottom: '1px solid #ddd' }}>
      <strong>MetroClub Admin</strong>
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href}>
          {link.label}
        </Link>
      ))}
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {user && <span>{user.name}</span>}
        <button onClick={handleLogout}>Cerrar sesión</button>
      </span>
    </nav>
  );
}
