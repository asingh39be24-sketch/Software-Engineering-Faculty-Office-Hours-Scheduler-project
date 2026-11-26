import { useCallback, useEffect, useRef, useState } from 'react';

// Tiny data layer: every query declares the data "tags" it depends on; mutations call
// invalidate(tags) and every mounted query with an overlapping tag refetches. This keeps
// all screens consistent after a change without a full page reload.
const listeners = new Set();

export function invalidate(...tags) {
  const set = new Set(tags.flat());
  listeners.forEach((l) => l(set));
}

export function useQuery(fetcher, deps = [], { tags = [], enabled = true, pollMs } = {}) {
  const [state, setState] = useState({ data: undefined, error: null, loading: enabled });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const seq = useRef(0);
  const tagKey = tags.join('|');

  const run = useCallback(
    async ({ silent = false } = {}) => {
      if (!enabled) return;
      const id = ++seq.current;
      if (!silent) setState((s) => ({ ...s, loading: true }));
      try {
        const data = await fetcherRef.current();
        if (id === seq.current) setState({ data, error: null, loading: false });
      } catch (error) {
        if (id === seq.current) setState((s) => ({ data: s.data, error, loading: false }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, ...deps]
  );

  useEffect(() => { run(); }, [run]);

  useEffect(() => {
    if (!tagKey) return undefined;
    const mine = tagKey.split('|');
    const l = (changed) => { if (mine.some((t) => changed.has(t))) run({ silent: true }); };
    listeners.add(l);
    return () => listeners.delete(l);
  }, [tagKey, run]);

  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') run({ silent: true }); };
    document.addEventListener('visibilitychange', onFocus);
    let timer;
    if (pollMs) timer = setInterval(() => run({ silent: true }), pollMs);
    return () => { document.removeEventListener('visibilitychange', onFocus); clearInterval(timer); };
  }, [run, pollMs]);

  return { ...state, refetch: run };
}

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
