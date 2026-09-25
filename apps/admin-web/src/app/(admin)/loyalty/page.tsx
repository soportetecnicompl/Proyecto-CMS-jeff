'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { authFetch, ApiError } from '@/lib/api';

interface LoyaltyRule {
  id: string;
  name: string;
  stampsPerVisit: number;
  pointsPerCurrency: string;
  currencyUnit: string;
  isActive: boolean;
}

interface Reward {
  id: string;
  name: string;
  description: string | null;
  stampsCost: number | null;
  pointsCost: number | null;
  isActive: boolean;
}

export default function LoyaltyPage() {
  const [rules, setRules] = useState<LoyaltyRule[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [ruleForm, setRuleForm] = useState({ name: '', stampsPerVisit: 1, pointsPerCurrency: 1, currencyUnit: 10 });
  const [rewardForm, setRewardForm] = useState({ name: '', description: '', stampsCost: '', pointsCost: '' });

  const loadRules = () => authFetch<LoyaltyRule[]>('/loyalty/rules').then(setRules).catch(() => undefined);
  const loadRewards = () => authFetch<Reward[]>('/loyalty/rewards').then(setRewards).catch(() => undefined);

  useEffect(() => {
    loadRules();
    loadRewards();
  }, []);

  const handleCreateRule = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await authFetch('/loyalty/rules', { method: 'POST', body: JSON.stringify(ruleForm) });
      setRuleForm({ name: '', stampsPerVisit: 1, pointsPerCurrency: 1, currencyUnit: 10 });
      loadRules();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la regla');
    }
  };

  const handleCreateReward = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await authFetch('/loyalty/rewards', {
        method: 'POST',
        body: JSON.stringify({
          name: rewardForm.name,
          description: rewardForm.description || undefined,
          stampsCost: rewardForm.stampsCost ? Number(rewardForm.stampsCost) : undefined,
          pointsCost: rewardForm.pointsCost ? Number(rewardForm.pointsCost) : undefined,
        }),
      });
      setRewardForm({ name: '', description: '', stampsCost: '', pointsCost: '' });
      loadRewards();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el premio');
    }
  };

  return (
    <div>
      <h1>Lealtad</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <section style={{ marginBottom: '2.5rem' }}>
        <h2>Reglas (RF-06/RF-07)</h2>
        <form onSubmit={handleCreateRule} style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0', flexWrap: 'wrap' }}>
          <input
            placeholder="Nombre"
            required
            value={ruleForm.name}
            onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
          />
          <input
            type="number"
            min={0}
            placeholder="Sellos por visita"
            required
            value={ruleForm.stampsPerVisit}
            onChange={(e) => setRuleForm({ ...ruleForm, stampsPerVisit: Number(e.target.value) })}
          />
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="Puntos por unidad"
            required
            value={ruleForm.pointsPerCurrency}
            onChange={(e) => setRuleForm({ ...ruleForm, pointsPerCurrency: Number(e.target.value) })}
          />
          <input
            type="number"
            min={0.01}
            step="0.01"
            placeholder="Lempiras por unidad"
            required
            value={ruleForm.currencyUnit}
            onChange={(e) => setRuleForm({ ...ruleForm, currencyUnit: Number(e.target.value) })}
          />
          <button type="submit">Crear regla activa</button>
        </form>
        <table cellPadding={8} style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th>Nombre</th>
              <th>Sellos/visita</th>
              <th>Puntos por L.</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} style={{ borderBottom: '1px solid #eee' }}>
                <td>{rule.name}</td>
                <td>{rule.stampsPerVisit}</td>
                <td>
                  {rule.pointsPerCurrency} por L.{rule.currencyUnit}
                </td>
                <td>{rule.isActive ? 'Activa' : 'Inactiva'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Premios (RF-08)</h2>
        <form onSubmit={handleCreateReward} style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0', flexWrap: 'wrap' }}>
          <input
            placeholder="Nombre"
            required
            value={rewardForm.name}
            onChange={(e) => setRewardForm({ ...rewardForm, name: e.target.value })}
          />
          <input
            placeholder="Descripción (opcional)"
            value={rewardForm.description}
            onChange={(e) => setRewardForm({ ...rewardForm, description: e.target.value })}
          />
          <input
            type="number"
            min={1}
            placeholder="Costo en sellos"
            value={rewardForm.stampsCost}
            onChange={(e) => setRewardForm({ ...rewardForm, stampsCost: e.target.value })}
          />
          <input
            type="number"
            min={1}
            placeholder="Costo en puntos"
            value={rewardForm.pointsCost}
            onChange={(e) => setRewardForm({ ...rewardForm, pointsCost: e.target.value })}
          />
          <button type="submit">Crear premio</button>
        </form>
        <table cellPadding={8} style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th>Nombre</th>
              <th>Costo sellos</th>
              <th>Costo puntos</th>
            </tr>
          </thead>
          <tbody>
            {rewards.map((reward) => (
              <tr key={reward.id} style={{ borderBottom: '1px solid #eee' }}>
                <td>{reward.name}</td>
                <td>{reward.stampsCost ?? '—'}</td>
                <td>{reward.pointsCost ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
