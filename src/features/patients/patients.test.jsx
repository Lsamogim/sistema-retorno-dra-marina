import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RouterProvider } from '../../app/router.jsx';
import { PatientsPage } from './PatientsPage.jsx';

vi.mock('../../api/endpoints.js', () => ({ endpoints: { getDashboard: vi.fn() } }));
const { endpoints } = await import('../../api/endpoints.js');

const it = (patientId, patientName, categoryId, stage, extra = {}) => ({
  patientId,
  patientName,
  categoryId,
  categoryName: { capilar: 'Capilar', botox: 'Botox' }[categoryId],
  stage,
  daysUntilDue: 10,
  phone: '(00) 90000-0001',
  ...extra,
});

beforeEach(() => {
  window.history.replaceState(null, '', '/pacientes');
  endpoints.getDashboard.mockResolvedValue({
    categories: [
      { id: 'capilar', name: 'Capilar' },
      { id: 'botox', name: 'Botox' },
    ],
    itemsByCategory: {
      capilar: [it(1, 'Karina Cardoso', 'capilar', 'chamar'), it(2, 'Ana Duarte', 'capilar', 'ainda_nao', { phone: null })],
      botox: [it(3, 'Sabrina Sampaio', 'botox', 'fora', { archivedReason: 'Teve alta', phone: '(00) 95555-1234' })],
    },
    allPatients: [
      { id: 1, name: 'Karina Cardoso', phone: '(00) 90000-0001' },
      { id: 2, name: 'Ana Duarte', phone: '' },
      { id: 3, name: 'Sabrina Sampaio', phone: '(00) 95555-1234' },
    ],
  });
});
afterEach(() => vi.clearAllMocks());

async function setup() {
  render(
    <RouterProvider>
      <PatientsPage />
    </RouterProvider>
  );
  await act(async () => {});
}

describe('PatientsPage', () => {
  test('lista todos e mostra a contagem', async () => {
    await setup();
    expect(screen.getByText('3 pacientes')).toBeInTheDocument();
  });

  test('filtro "Sem telefone" mostra só quem não tem telefone', async () => {
    await setup();
    fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'sem_telefone' } });
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Ana Duarte');
    expect(new URLSearchParams(window.location.search).get('situacao')).toBe('sem_telefone');
  });

  test('filtro "Fora da lista" mostra arquivados com o motivo', async () => {
    await setup();
    fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'fora' } });
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Sabrina Sampaio');
    expect(rows[0]).toHaveTextContent('Teve alta');
  });

  test('busca por telefone encontra o paciente', async () => {
    await setup();
    await userEvent.type(screen.getByLabelText('Buscar paciente'), '5555');
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Sabrina Sampaio');
  });

  test('clicar abre a ficha', async () => {
    await setup();
    await userEvent.click(within(screen.getAllByRole('listitem')[0]).getByRole('button'));
    expect(window.location.pathname).toMatch(/^\/pacientes\/\d+$/);
  });
});
