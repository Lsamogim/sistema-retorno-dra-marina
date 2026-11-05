import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '../../api/client.js';
import { RouterProvider } from '../../app/router.jsx';
import { ToastProvider } from '../../ui/index.js';
import { TodayProvider } from '../../state/useToday.jsx';
import { PatientSheet } from './PatientSheet.jsx';

vi.mock('../../api/endpoints.js', () => ({
  endpoints: {
    getToday: vi.fn(),
    getDashboard: vi.fn(),
    updatePatient: vi.fn(),
    updateState: vi.fn(),
    act: vi.fn(),
    restore: vi.fn(),
    mergePatient: vi.fn(),
  },
}));
const { endpoints } = await import('../../api/endpoints.js');

const item = {
  patientId: 7,
  categoryId: 'capilar',
  categoryName: 'Capilar',
  patientName: 'Karina Cardoso',
  phone: '(00) 90000-0001',
  isManualPhone: false,
  patientNotes: '',
  whatsappNumber: '5500900000001',
  whatsappMessage: 'Olá',
  effectiveIntervalDays: 15,
  customIntervalDays: null,
  stage: 'chamar',
  stageReason: 'atrasado',
  daysUntilDue: -2,
  dueDate: '2026-11-03',
  lastDate: '2026-10-19',
  anchorDate: '2026-10-19',
  cycleKey: 'k',
  history: [{ id: 1, appointment_date: '2026-10-19', kind: 'procedure', raw_service: 'Tratamento Capilar', situation: 'Atendido' }],
};

async function setup(url = '/pacientes/7') {
  window.history.replaceState(null, '', '/hoje');
  window.history.pushState({ from: '/hoje' }, '', url);
  render(
    <RouterProvider>
      <ToastProvider>
        <TodayProvider>
          <PatientSheet patientId={7} />
        </TodayProvider>
      </ToastProvider>
    </RouterProvider>
  );
  await act(async () => {});
}

beforeEach(() => {
  endpoints.getToday.mockResolvedValue({ referenceDate: '2026-11-05', counts: {}, categories: [], items: [item] });
  endpoints.getDashboard.mockResolvedValue({
    itemsByCategory: { capilar: [item] },
    categories: [{ id: 'capilar', name: 'Capilar' }],
    allPatients: [
      { id: 7, name: 'Karina Cardoso', phone: '' },
      { id: 8, name: 'Karina C.', phone: '' },
    ],
  });
  endpoints.updatePatient.mockResolvedValue({ ok: true });
  endpoints.updateState.mockResolvedValue({ ok: true });
});
afterEach(() => vi.clearAllMocks());

describe('PatientSheet', () => {
  test('editar telefone e sair do campo salva e mostra "Salvo"', async () => {
    await setup();
    const phone = screen.getByLabelText('Telefone / WhatsApp');
    await userEvent.clear(phone);
    await userEvent.type(phone, '(00) 91111-2222');
    await act(async () => fireEvent.blur(phone));
    expect(endpoints.updatePatient).toHaveBeenCalledWith(7, { phoneManual: '(00) 91111-2222' });
    expect(screen.getByText('Salvo')).toBeInTheDocument();
  });

  test('erro ao salvar mostra a mensagem no campo e mantém o valor digitado', async () => {
    endpoints.updatePatient.mockRejectedValueOnce(new ApiError(400, 'BAD', 'Telefone inválido.'));
    await setup();
    const phone = screen.getByLabelText('Telefone / WhatsApp');
    await userEvent.clear(phone);
    await userEvent.type(phone, '123');
    await act(async () => fireEvent.blur(phone));
    expect(screen.getByRole('alert')).toHaveTextContent('Telefone inválido.');
    expect(phone).toHaveValue('123');
  });

  test('data personalizada anterior à última sessão mostra erro', async () => {
    await setup();
    const date = screen.getByLabelText('Próximo retorno personalizado (Capilar)');
    fireEvent.change(date, { target: { value: '2026-10-01' } });
    await act(async () => fireEvent.blur(date));
    expect(screen.getByRole('alert')).toHaveTextContent('A data precisa ser depois da última sessão (19/10/2026).');
    expect(endpoints.updateState).not.toHaveBeenCalled();
  });

  test('protocolo do capilar envia customIntervalDays', async () => {
    await setup();
    fireEvent.change(screen.getByLabelText('Protocolo (Capilar)'), { target: { value: '21' } });
    await act(async () => {});
    expect(endpoints.updateState).toHaveBeenCalledWith(7, 'capilar', { customIntervalDays: 21 });
  });

  test('abrir com ?campo=telefone foca o telefone', async () => {
    await setup('/pacientes/7?campo=telefone');
    expect(screen.getByLabelText('Telefone / WhatsApp')).toHaveFocus();
  });

  test('Esc fecha e volta para /hoje', async () => {
    await setup();
    expect(screen.getByRole('dialog', { name: 'Karina Cardoso' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    expect(window.location.pathname).toBe('/hoje');
  });
});
