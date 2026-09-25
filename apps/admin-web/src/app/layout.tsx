import type { ReactNode } from 'react';

export const metadata = {
  title: 'MetroClub Admin',
  description: 'Panel de administración del programa de fidelización MetroClub',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
