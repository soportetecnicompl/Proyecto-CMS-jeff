'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';

interface DashboardSummary {
  activeClients: number;
  totalVisits: number;
  totalRedemptions: number;
  reviewsRequested: number;
}

const TILES: { key: keyof DashboardSummary; label: string }[] = [
  { key: 'activeClients', label: 'Clientes activos' },
  { key: 'totalVisits', label: 'Visitas registradas' },
  { key: 'totalRedemptions', label: 'Premios canjeados' },
  { key: 'reviewsRequested', label: 'Reseñas solicitadas' },
];

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch<DashboardSummary>('/reports/dashboard')
      .then(setSummary)
      .catch(() => setError('No se pudo cargar el dashboard'));
  }, []);

  const handleExport = async () => {
    const token = getToken();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';
    const res = await fetch(`${apiUrl}/reports/clients/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'clientes-metroclub.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1>Dashboard</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        {TILES.map((tile) => (
          <div key={tile.key} style={{ border: '1px solid #ddd', borderRadius: 8, padding: '1rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>{tile.label}</div>
            <div style={{ fontSize: '2rem', fontWeight: 600 }}>{summary?.[tile.key] ?? '—'}</div>
          </div>
        ))}
      </div>
      <p style={{ marginTop: '2rem' }}>
        <button onClick={handleExport}>Exportar base de clientes (CSV)</button>
      </p>
    </div>
  );
}
