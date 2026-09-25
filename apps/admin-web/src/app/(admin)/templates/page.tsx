'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { authFetch, ApiError } from '@/lib/api';

interface Template {
  id: string;
  name: string;
  type: string;
  body: string;
  isActive: boolean;
}

const TYPES = ['POST_VISIT', 'REVIEW_REQUEST', 'WIN_BACK', 'BIRTHDAY', 'CAMPAIGN'];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState({ name: '', type: TYPES[0], body: '' });
  const [error, setError] = useState<string | null>(null);

  const load = () => authFetch<Template[]>('/whatsapp/templates').then(setTemplates).catch(() => undefined);

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await authFetch('/whatsapp/templates', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', type: TYPES[0], body: '' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la plantilla');
    }
  };

  return (
    <div>
      <h1>Plantillas de WhatsApp</h1>
      <p style={{ color: '#666' }}>
        Estas plantillas son la fuente de verdad que consumen los flujos de n8n / Chatwoot para RF-11 a RF-15.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0', flexWrap: 'wrap' }}>
        <input
          placeholder="Nombre (ej. post_visit_feedback)"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input
          placeholder="Texto de la plantilla"
          required
          style={{ flex: 1, minWidth: 240 }}
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />
        <button type="submit">Crear plantilla</button>
      </form>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <table cellPadding={8} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
            <th>Nombre</th>
            <th>Tipo</th>
            <th>Texto</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((template) => (
            <tr key={template.id} style={{ borderBottom: '1px solid #eee' }}>
              <td>{template.name}</td>
              <td>{template.type}</td>
              <td>{template.body}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
