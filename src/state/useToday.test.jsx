import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError, NETWORK_ERROR_MESSAGE } from '../api/client.js';
import { RouterProvider } from '../app/router.jsx';
import { ToastProvider } from '../ui/index.js';
import { TodayProvider, useToday, MOVED_MS } from './useToday.jsx';

vi.mock('../api/endpoints.js', () => ({
  endpoints: { getToday: vi.fn(), act: vi.fn(), restore: vi.fn() },
}));
const { endpoints } = await import('../api/endpoints.js');

const base = { categoryId: 'capilar', categoryName: 'Capilar', patientName: 'Karina Cardoso', daysUntilDue: -2, cycleKey: 'k' };
const karina = { ...base, patientId: 1, stage: 'chamar', stageReason: 'atrasado' };
const beatriz = { ...base, patientId: 2, patientName: 'Beatriz Macedo', stage: 'chamar', daysUntilDue: -1 };
const todayPayload = {
  referenceDate: '2026-11-05',
  counts: { chamar: 2, chamarAntigos: 0, aguardando: 0, agendado: 0, concluido: 0 },
  categories: [{ id: 'capilar', name: 'Capilar' }],
  items: [karina, beatriz],
};
const undoToken = 'tok-1';

function Harness() {
  const t = useToday();
  if (t.status !== 'ready') return <p>carregando</p>;
  return (
    <div>
      <p>contador chamar:{t.counts.chamar}</p>
      <p>contador aguardando:{t.counts.aguardando}</p>
      <ul aria-label="chamar">
        {t.visibleItems('chamar').map((i) => (
          <li key={i.patientId}>
            {i.patientName}
            {t.moved.get(t.keyOf(i)) ? ` [movido para ${t.moved.get(t.keyOf(i)).toStage}]` : ''}
          </li>
        ))}
      </ul>
      <ul aria-label="aguardando">
        {t.visibleItems('aguardando').map((i) => (
          <li key={i.patientId}>{i.patientName}</li>
        ))}
      </ul>
      <p>pode desfazer:{String(t.canUndo('1:capilar'))}</p>
      <button type="button" onClick={() => t.act(karina, { action: 'contacted', cycleKey: 'k' })}>
        chamar karina
      </button>
      <button type="button" onClick={() => t.undo('1:capilar')}>
        desfazer karina
      </button>
    </div>
  );
}

async function renderReady() {
  render(
    <RouterProvider>
      <ToastProvider>
        <TodayProvider>
          <Harness />
        </TodayProvider>
      </ToastProvider>
    </RouterProvider>
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  window.history.replaceState(null, '', '/hoje');
  endpoints.getToday.mockResolvedValue(structuredClone(todayPayload));
  endpoints.act.mockResolvedValue({ ok: true, undoToken, items: [{ ...karina, stage: 'aguardando', stageReason: null }] });
  endpoints.restore.mockResolvedValue({ ok: true, items: [karina] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useToday', () => {
  test('MOVED_MS é 4000', () => {
    expect(MOVED_MS).toBe(4000);
  });

  test('act contacted mantém o item visível por 4000 ms com moved e depois o remove de chamar', async () => {
    await renderReady();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'chamar karina' })));
    const chamar = screen.getByRole('list', { name: 'chamar' });
    expect(chamar).toHaveTextContent('Karina Cardoso [movido para aguardando]');
    await act(async () => vi.advanceTimersByTime(3999));
    expect(screen.getByRole('list', { name: 'chamar' })).toHaveTextContent('Karina Cardoso');
    await act(async () => vi.advanceTimersByTime(2));
    expect(screen.getByRole('list', { name: 'chamar' })).not.toHaveTextContent('Karina Cardoso');
    expect(screen.getByRole('list', { name: 'aguardando' })).toHaveTextContent('Karina Cardoso');
  });

  test('contadores mudam imediatamente (chamar -1, aguardando +1)', async () => {
    await renderReady();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'chamar karina' })));
    expect(screen.getByText('contador chamar:1')).toBeInTheDocument();
    expect(screen.getByText('contador aguardando:1')).toBeInTheDocument();
  });

  test('erro de rede reverte o item e mostra a mensagem', async () => {
    endpoints.act.mockRejectedValueOnce(new ApiError(0, 'NETWORK', NETWORK_ERROR_MESSAGE));
    await renderReady();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'chamar karina' })));
    expect(screen.getByRole('list', { name: 'chamar' })).toHaveTextContent('Karina Cardoso');
    expect(screen.getByRole('list', { name: 'chamar' })).not.toHaveTextContent('movido');
    expect(screen.getByText('contador chamar:2')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(NETWORK_ERROR_MESSAGE);
  });

  test('undo chama restore com o código de desfazer e devolve o item a chamar', async () => {
    await renderReady();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'chamar karina' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'desfazer karina' })));
    expect(endpoints.restore).toHaveBeenCalledWith(1, 'capilar', undoToken);
    await act(async () => vi.advanceTimersByTime(4001));
    expect(screen.getByRole('list', { name: 'chamar' })).toHaveTextContent('Karina Cardoso');
    expect(screen.getByText('contador chamar:2')).toBeInTheDocument();
  });

  test('toast oferece Ver e Desfazer', async () => {
    await renderReady();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'chamar karina' })));
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Karina Cardoso foi para Aguardando resposta');
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver' })).toBeInTheDocument();
  });

  test('canUndo é falso para itens sem ação nesta sessão', async () => {
    await renderReady();
    expect(screen.getByText('pode desfazer:false')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'chamar karina' })));
    expect(screen.getByText('pode desfazer:true')).toBeInTheDocument();
  });
});
