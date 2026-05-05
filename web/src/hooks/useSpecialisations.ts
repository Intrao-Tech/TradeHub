import { useEffect, useSyncExternalStore } from 'react';
import { api, parseApiError } from '../api';

export type Specialisation = {
  id: number;
  name: string;
  slug?: string;
};

type CacheState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; items: Specialisation[] }
  | { kind: 'error'; error: string };

let state: CacheState = { kind: 'idle' };
let inflight: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((cb) => cb());
}

function setState(next: CacheState) {
  state = next;
  notify();
}

async function fetchOnce(): Promise<void> {
  if (inflight) return inflight;
  setState({ kind: 'loading' });
  inflight = api<Specialisation[] | { items: Specialisation[] }>('/specialisations')
    .then((data) => {
      const items = Array.isArray(data) ? data : (data?.items ?? []);
      setState({ kind: 'ready', items });
    })
    .catch((err) => {
      setState({ kind: 'error', error: parseApiError(err)?.message ?? 'Could not load specialisations.' });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function subscribe(cb: () => void) {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function getSnapshot(): CacheState {
  return state;
}

export type UseSpecialisations = {
  items: Specialisation[];
  loading: boolean;
  error: string | null;
};

export function useSpecialisations(): UseSpecialisations {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (state.kind === 'idle') void fetchOnce();
  }, []);

  return {
    items: snapshot.kind === 'ready' ? snapshot.items : [],
    loading: snapshot.kind === 'loading' || snapshot.kind === 'idle',
    error: snapshot.kind === 'error' ? snapshot.error : null,
  };
}
