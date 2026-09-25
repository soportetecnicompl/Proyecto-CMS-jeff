import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { Nav } from '@/components/Nav';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <Nav />
      <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>{children}</main>
    </AuthGuard>
  );
}
