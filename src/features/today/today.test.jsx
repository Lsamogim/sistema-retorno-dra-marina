import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RouterProvider } from '../../app/router.jsx';
import { ToastProvider } from '../../ui/index.js';
import { TodayProvider } from '../../state/useToday.jsx';
import { TodayPage } from './TodayPage.jsx';

vi.mock('../../api/endpoints.js', () => ({
  endpoints: { getToday: vi.fn(), act: vi.fn(), restore: vi.fn() },
}));
const { endpoints } = await import('../../api/endpoints.js');

const mk = (over) => ({
  categoryId: 'capilar',
  categoryName: 'Capilar',
  effectiveIntervalDays: 15,
  daysUntilDue: -2,
  cycleKey: 'k',
  anchorDate: '2026-10-20',
  stage: 'chamar',
  stageReason: 'atrasado',
  whatsappNumber: '5500900000001',
  whatsappMessage: 'Olá Karina, tudo bem?',
  ...over,
});
const karina = mk({ patientId: 1, patientName: 'Karina Cardoso' });
const semTelefone = mk({ patientId: 2, patientName: 'Ana Duarte', whatsappNumber: null, categoryId: 'laser', categoryName: 'Laser', effectiveIntervalDays: 30 });
const confirmar = mk({ patientId: 4, patientName: 'Bruna Lacerda', stageReason: 'faltou_talvez', scheduledFor: '2026-11-03', categoryId: 'laser', categoryName: 'Laser', effectiveIntervalDays: 30 });
const agendada = mk({ patientId: 3, patientName: 'Sabrina Sampaio', stage: 'agendado', stageReason: 'manual', scheduledFor: '2026-11-10', categoryId: 'botox', categoryName: 'Botox', hasDualReturn: true, cyclePhase: 'review' });

function setup(url = '/hoje') {
  window.history.replaceState(null, '', url);
  render(
    <RouterProvider>
      <ToastProvider>
        <TodayProvider>
          <TodayPage />
        </TodayProvider>
      </ToastProvider>
    </RouterProvider>
  );
  return act(async () => {});
}

beforeEach(() => {
  endpoints.getToday.mockResolvedValue({
    referenceDate: '2026-11-05',
    counts: {},
    categories: [
      { id: 'capilar', name: 'Capilar' },
      { id: 'laser', name: 'Laser' },
      { id: 'botox', name: 'Botox' },
    ],
    items: [karina, semTelefone, agendada, confirmar],
  });
  endpoints.act.mockImplementation(async (patientId, categoryId, body) => {
    const map = { contacted: 'aguardando', archive: 'fora', scheduled: 'agendado' };
    return { ok: true, undoToken: 'tok', items: [{ ...karina, stage: map[body.action] }] };
  });
  vi.spyOn(window, 'open').mockImplementation(() => null);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('TodayPage', () => {
  test('Enviar WhatsApp abre wa.me com a mensagem e registra contato', async () => {
    await setup();
    const row = screen.getByRole('listitem', { name: /Karina Cardoso/ });
    await userEvent.click(within(row).getByRole('button', { name: /Enviar WhatsApp/ }));
    expect(window.open).toHaveBeenCalledWith(
      `https://wa.me/5500900000001?text=${encodeURIComponent('Olá Karina, tudo bem?')}`,
      '_blank',
      'noopener,noreferrer'
    );
    expect(endpoints.act).toHaveBeenCalledWith(1, 'capilar', { action: 'contacted', cycleKey: 'k' });
  });

  test('paciente sem telefone mostra "Adicionar telefone" e não abre wa.me', async () => {
    await setup();
    const row = screen.getByRole('listitem', { name: /Ana Duarte/ });
    expect(within(row).queryByRole('button', { name: /Enviar WhatsApp/ })).not.toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Adicionar telefone' }));
    expect(window.open).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/pacientes/2');
    expect(new URLSearchParams(window.location.search).get('campo')).toBe('telefone');
  });

  test('linha movida mostra "Movido para Aguardando resposta" com Desfazer', async () => {
    await setup();
    const row = screen.getByRole('listitem', { name: /Karina Cardoso/ });
    await userEvent.click(within(row).getByRole('button', { name: /Enviar WhatsApp/ }));
    const moved = screen.getByRole('listitem', { name: /Karina Cardoso/ });
    expect(moved).toHaveTextContent('Movido para Aguardando resposta');
    expect(within(moved).getByRole('button', { name: 'Desfazer' })).toBeInTheDocument();
  });

  test('etapa vem da URL (?etapa=agendado) e trocar a aba atualiza a URL', async () => {
    await setup('/hoje?etapa=agendado');
    expect(screen.getByRole('tab', { name: /Agendados/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('listitem', { name: /Sabrina Sampaio/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Chamar/ }));
    expect(new URLSearchParams(window.location.search).get('etapa')).toBe('chamar');
    expect(screen.getByRole('listitem', { name: /Karina Cardoso/ })).toBeInTheDocument();
  });

  test('agendamento manual vencido pergunta "Faltou?" e oferece Veio', async () => {
    await setup();
    const row = screen.getByRole('listitem', { name: /Bruna Lacerda/ });
    expect(row).toHaveTextContent('Faltou? Estava agendado para 03/11');
    await userEvent.click(within(row).getByRole('button', { name: 'Veio' }));
    expect(endpoints.act).toHaveBeenCalledWith(4, 'laser', expect.objectContaining({ action: 'done' }));
  });

  test('filtro de procedimento e busca reduzem a lista', async () => {
    await setup();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    fireEvent.change(screen.getByLabelText('Procedimento'), { target: { value: 'laser' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('listitem', { name: /Ana Duarte/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Procedimento'), { target: { value: '' } });
    await userEvent.type(screen.getByLabelText('Buscar paciente'), 'karina');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('listitem', { name: /Karina Cardoso/ })).toBeInTheDocument();
  });

  test('"Não volta mais em nenhum procedimento" pede confirmação com o nome do paciente', async () => {
    await setup();
    const row = screen.getByRole('listitem', { name: /Karina Cardoso/ });
    await userEvent.click(within(row).getByRole('button', { name: /Mais ações/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Não vai voltar' }));
    await userEvent.click(screen.getByLabelText('Não volta mais em nenhum procedimento'));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    const confirm = screen.getByRole('alertdialog');
    expect(confirm).toHaveTextContent('Karina Cardoso');
    expect(endpoints.act).not.toHaveBeenCalled();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Tirar de todos os procedimentos' }));
    expect(endpoints.act).toHaveBeenCalledWith(1, 'capilar', expect.objectContaining({ action: 'archive', allCategories: true }));
  });

  test('Agendou pede a data e envia scheduled', async () => {
    await setup();
    const row = screen.getByRole('listitem', { name: /Karina Cardoso/ });
    await userEvent.click(within(row).getByRole('button', { name: /Mais ações/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Agendou' }));
    fireEvent.change(screen.getByLabelText('Data do agendamento'), { target: { value: '2026-11-12' } });
    await userEvent.click(screen.getByRole('button', { name: 'Salvar agendamento' }));
    expect(endpoints.act).toHaveBeenCalledWith(1, 'capilar', { action: 'scheduled', date: '2026-11-12' });
  });
});
