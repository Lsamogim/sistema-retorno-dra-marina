import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { endpoints } from '../api/endpoints.js';
import { useRoute } from '../app/router.jsx';
import { useToast } from '../ui/index.js';
import { PREDICTED_STAGE, TODAY_STAGE_IDS, isStaleOverdue, sortForStage, stageLabel } from '../domain/stages.js';

// Quanto tempo o cartão fica no lugar mostrando "Movido para…" (spec 2.2, regra 1).
export const MOVED_MS = 4000;

const TodayContext = createContext(null);
export const keyOf = (item) => `${item.patientId}:${item.categoryId}`;

function destinationUrl(stage) {
  if (TODAY_STAGE_IDS.includes(stage)) return `/hoje?etapa=${stage}`;
  if (stage === 'fora') return '/pacientes?situacao=fora';
  return '/pacientes?situacao=ainda_nao';
}

export function TodayProvider({ children }) {
  const { navigate } = useRoute();
  const toast = useToast();
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [data, setData] = useState({ referenceDate: null, categories: [], items: [] });
  const [moved, setMoved] = useState(() => new Map());
  const [lastMovedStage, setLastMovedStage] = useState(null);
  const beforesRef = useRef(new Map());
  const timersRef = useRef(new Map());
  const [, forceRender] = useState(0);

  const reload = useCallback(async () => {
    try {
      const t = await endpoints.getToday();
      setData({ referenceDate: t.referenceDate, categories: t.categories, items: t.items });
      setStatus('ready');
      setError(null);
    } catch (err) {
      setError(err.message);
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
      if (status === 'ready') toast.show({ message: err.message, tone: 'error' });
    }
  }, [toast, status]);

  useEffect(() => {
    reload();
    const timers = timersRef.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clearMoved = useCallback((key) => {
    clearTimeout(timersRef.current.get(key));
    timersRef.current.delete(key);
    setMoved((m) => {
      if (!m.has(key)) return m;
      const next = new Map(m);
      next.delete(key);
      return next;
    });
  }, []);

  const scheduleMovedEnd = useCallback(
    (key) => {
      clearTimeout(timersRef.current.get(key));
      timersRef.current.set(
        key,
        setTimeout(() => {
          timersRef.current.delete(key);
          setMoved((m) => {
            const next = new Map(m);
            next.delete(key);
            return next;
          });
          // Itens que saíram do fluxo do dia deixam a lista quando o aviso termina.
          setData((d) => ({
            ...d,
            items: d.items.filter((i) => keyOf(i) !== key || TODAY_STAGE_IDS.includes(i.stage)),
          }));
        }, MOVED_MS)
      );
    },
    []
  );

  /** Substitui os itens de um paciente pelos devolvidos pelo servidor. */
  const replacePatientItems = useCallback((patientId, items, keepKey) => {
    setData((d) => {
      const others = d.items.filter((i) => i.patientId !== patientId);
      const fresh = items.filter((i) => TODAY_STAGE_IDS.includes(i.stage) || keyOf(i) === keepKey);
      return { ...d, items: [...others, ...fresh] };
    });
  }, []);

  const act = useCallback(
    async (item, body) => {
      const key = keyOf(item);
      const fromStage = item.stage;
      const snapshot = data.items;
      setMoved((m) => new Map(m).set(key, { fromStage, toStage: PREDICTED_STAGE[body.action] || fromStage }));
      try {
        const res = await endpoints.act(item.patientId, item.categoryId, body);
        const updated = res.items.find((i) => keyOf(i) === key);
        const toStage = updated?.stage || PREDICTED_STAGE[body.action] || fromStage;
        beforesRef.current.set(key, { before: res.before, patientId: item.patientId, categoryId: item.categoryId });
        replacePatientItems(item.patientId, res.items, key);
        setMoved((m) => new Map(m).set(key, { fromStage, toStage }));
        setLastMovedStage(`${toStage}:${Date.now()}`);
        scheduleMovedEnd(key);
        forceRender((n) => n + 1);
        toast.show({
          message: `${item.patientName} foi para ${stageLabel(toStage)}`,
          actions: [
            { label: 'Desfazer', onClick: () => undoRef.current(key) },
            { label: 'Ver', onClick: () => navigate(destinationUrl(toStage)) },
          ],
        });
        return { ok: true, toStage };
      } catch (err) {
        clearMoved(key);
        setData((d) => ({ ...d, items: snapshot }));
        toast.show({ message: err.message, tone: 'error' });
        return { ok: false, error: err };
      }
    },
    [data.items, replacePatientItems, scheduleMovedEnd, clearMoved, toast, navigate]
  );

  const undo = useCallback(
    async (key) => {
      const entry = beforesRef.current.get(key);
      if (!entry) return false;
      try {
        const res = await endpoints.restore(entry.patientId, entry.categoryId, entry.before);
        beforesRef.current.delete(key);
        clearMoved(key);
        replacePatientItems(entry.patientId, res.items, null);
        forceRender((n) => n + 1);
        toast.show({ message: 'Ação desfeita.' });
        return true;
      } catch (err) {
        toast.show({ message: err.message, tone: 'error' });
        return false;
      }
    },
    [clearMoved, replacePatientItems, toast]
  );
  const undoRef = useRef(undo);
  undoRef.current = undo;

  const effectiveStage = useCallback((item) => moved.get(keyOf(item))?.toStage || item.stage, [moved]);

  const counts = useMemo(() => {
    const c = { chamar: 0, chamarAntigos: 0, aguardando: 0, agendado: 0, concluido: 0 };
    for (const item of data.items) {
      const stage = effectiveStage(item);
      if (stage === 'chamar' && isStaleOverdue({ ...item, stage })) c.chamarAntigos += 1;
      else if (c[stage] !== undefined) c[stage] += 1;
    }
    return c;
  }, [data.items, effectiveStage]);

  /** Itens que aparecem numa etapa: os que estão nela, mais os que acabaram de sair dela (aviso de 4 s). */
  const visibleItems = useCallback(
    (stage) => {
      const list = data.items.filter((item) => {
        const m = moved.get(keyOf(item));
        return m ? m.fromStage === stage : item.stage === stage;
      });
      return sortForStage(stage, list);
    },
    [data.items, moved]
  );

  const canUndo = useCallback((key) => beforesRef.current.has(key), []); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(
    () => ({
      status,
      error,
      items: data.items,
      categories: data.categories,
      referenceDate: data.referenceDate,
      counts,
      moved,
      lastMovedStage: lastMovedStage ? lastMovedStage.split(':')[0] : null,
      lastMovedToken: lastMovedStage,
      keyOf,
      visibleItems,
      act,
      undo,
      canUndo,
      reload,
    }),
    [status, error, data, counts, moved, lastMovedStage, visibleItems, act, undo, canUndo, reload]
  );

  return <TodayContext.Provider value={value}>{children}</TodayContext.Provider>;
}

export function useToday() {
  const ctx = useContext(TodayContext);
  if (!ctx) throw new Error('useToday precisa estar dentro de TodayProvider');
  return ctx;
}
