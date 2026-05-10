import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { listOpenDisputes, resolveDispute } from '../escrow';
import { parseApiError } from '../../api';

type Dispute = {
  id: string | number;
  milestone_id: string | number;
  filed_by: string | number;
  reason: string;
  status: string;
  response?: string | null;
  created_at?: string;
  filer?: { display_name?: string };
  milestone?: {
    id: string | number;
    title: string;
    amount: string;
    escrow?: {
      collaboration?: {
        id: string | number;
        worker?: { client_profile?: { display_name?: string } };
        employer?: { client_profile?: { display_name?: string } };
      };
    };
  };
};

export function EscrowDisputesTab() {
  const [data, setData] = useState<Dispute[] | null>(null);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | number | null>(null);
  const [workerPct, setWorkerPct] = useState(50);
  const [keepFee, setKeepFee] = useState(true);
  const [reasoning, setReasoning] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState('');

  const reload = useCallback(async () => {
    setError('');
    try {
      const res = (await listOpenDisputes()) as Dispute[];
      setData(res);
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Failed to load disputes');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function submit(disputeId: string | number) {
    if (reasoning.trim().length < 30) {
      setActionErr('Reasoning must be at least 30 characters.');
      return;
    }
    setActionErr('');
    setBusy(true);
    try {
      await resolveDispute(disputeId, {
        worker_pct: workerPct,
        employer_refund_pct: 100 - workerPct,
        platform_kept_fee: keepFee,
        reasoning: reasoning.trim(),
      });
      setActiveId(null);
      setReasoning('');
      await reload();
    } catch (err) {
      setActionErr(parseApiError(err)?.message ?? 'Resolve failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Escrow disputes</CardTitle>
        <CardDescription>
          Mediator queue. Decide the worker / employer split on each disputed
          milestone (binding on platform). Worker % + employer refund % must
          sum to 100.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div role="alert" className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}
        {data == null ? (
          <p className="text-sm text-fg-muted">Loading…</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-fg-muted">No open disputes.</p>
        ) : (
          data.map((d) => (
            <div key={String(d.id)} className="rounded-md border border-border-default bg-raised p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="warning">{d.status}</Badge>
                <span className="font-medium">
                  Milestone "{d.milestone?.title}" — £{d.milestone?.amount}
                </span>
                <span className="text-xs text-fg-muted">
                  Collab #{String(d.milestone?.escrow?.collaboration?.id)}
                </span>
              </div>
              <div className="text-sm text-fg-muted">
                <strong>Worker:</strong> {d.milestone?.escrow?.collaboration?.worker?.client_profile?.display_name}
                {' · '}
                <strong>Employer:</strong> {d.milestone?.escrow?.collaboration?.employer?.client_profile?.display_name}
              </div>
              <div className="text-sm">
                <strong>Filed by {d.filer?.display_name}:</strong> {d.reason}
              </div>
              {d.response ? (
                <div className="text-sm text-fg-muted">
                  <strong>Counterparty response:</strong> {d.response}
                </div>
              ) : null}
              {activeId === d.id ? (
                <div className="space-y-2 pt-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Worker share %</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={workerPct}
                        onChange={(e) => setWorkerPct(Number(e.target.value))}
                      />
                      <p className="text-xs text-fg-muted">Employer refund: {100 - workerPct}%</p>
                    </div>
                    <div className="space-y-1">
                      <Label>Platform keeps fee?</Label>
                      <select
                        value={keepFee ? 'yes' : 'no'}
                        onChange={(e) => setKeepFee(e.target.value === 'yes')}
                        className="h-9 rounded-md border border-border-default bg-raised px-3 text-sm"
                      >
                        <option value="yes">Yes (default)</option>
                        <option value="no">No (refund platform fee too)</option>
                      </select>
                    </div>
                  </div>
                  <Label>Reasoning (≥30 chars, audit-logged)</Label>
                  <Textarea
                    value={reasoning}
                    onChange={(e) => setReasoning(e.target.value)}
                    rows={3}
                    placeholder="e.g. Worker delivered 60% of agreed scope per chat evidence; employer's complaints about quality not substantiated by submitted artifacts."
                  />
                  {actionErr ? <div role="alert" className="text-xs text-danger">{actionErr}</div> : null}
                  <div className="flex gap-2">
                    <Button onClick={() => submit(d.id)} disabled={busy}>
                      {busy ? 'Resolving…' : 'Resolve dispute'}
                    </Button>
                    <Button variant="ghost" onClick={() => { setActiveId(null); setReasoning(''); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" onClick={() => { setActiveId(d.id); setReasoning(''); }}>
                  Resolve
                </Button>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
