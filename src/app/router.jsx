import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Roteador mínimo sobre a History API: endereço próprio por tela e botão voltar funcionando.
const RouterContext = createContext(null);

const ROUTES = [
  { pattern: /^\/hoje$/, name: 'hoje' },
  { pattern: /^\/pacientes$/, name: 'pacientes' },
  { pattern: /^\/pacientes\/(\d+)$/, name: 'paciente', keys: ['id'] },
  { pattern: /^\/importar$/, name: 'importar' },
  { pattern: /^\/configuracoes$/, name: 'configuracoes' },
  { pattern: /^\/configuracoes\/([a-z-]+)$/, name: 'configuracoes', keys: ['secao'] },
];

function readLocation() {
  if (window.location.pathname === '/' || window.location.pathname === '') {
    window.history.replaceState(window.history.state, '', `/hoje${window.location.search}`);
  }
  return { path: window.location.pathname, search: window.location.search };
}

export function matchRoute(path) {
  for (const r of ROUTES) {
    const m = path.match(r.pattern);
    if (m) {
      const params = Object.fromEntries((r.keys || []).map((k, i) => [k, m[i + 1]]));
      return { name: r.name, params };
    }
  }
  return { name: 'hoje', params: {} };
}

export function RouterProvider({ children }) {
  const [loc, setLoc] = useState(readLocation);

  useEffect(() => {
    const onPop = () => setLoc(readLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    if (to === `${window.location.pathname}${window.location.search}`) return;
    window.history[replace ? 'replaceState' : 'pushState']({ from: window.location.pathname + window.location.search }, '', to);
    setLoc(readLocation());
  }, []);

  const value = useMemo(() => {
    const route = matchRoute(loc.path);
    return { path: loc.path, query: new URLSearchParams(loc.search), route: route.name, params: route.params, navigate };
  }, [loc, navigate]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRoute() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRoute precisa estar dentro de RouterProvider');
  return ctx;
}

/** Atualiza um parâmetro da URL atual sem empilhar histórico. */
export function withQuery(path, query, changes) {
  const next = new URLSearchParams(query);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === undefined || v === '') next.delete(k);
    else next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `${path}?${qs}` : path;
}
