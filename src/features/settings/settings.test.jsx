import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RouterProvider } from '../../app/router.jsx';
import { SessionProvider } from '../../state/session.jsx';
import { ToastProvider } from '../../ui/index.js';
import { TodayProvider } from '../../state/useToday.jsx';
import { SettingsPage } from './SettingsPage.jsx';
import { ImportPage } from '../import/ImportPage.jsx';

vi.mock('../../api/endpoints.js', () => ({
  endpoints: {
    getSession: vi.fn(),
    getToday: vi.fn(),
    getDashboard: vi.fn(),
    changePassword: vi.fn(),
    importFile: vi.fn(),
    listUsers: vi.fn(),
    listAudit: vi.fn(),
    backupStatus: vi.fn(),
    saveCategories: vi.fn(),
  },
}));
const { endpoints } = await import('../../api/endpoints.js');

function wrap(ui, url) {
  window.history.replaceState(null, '', url);
  return render(
    <RouterProvider>
      <SessionProvider>
        <ToastProvider>
          <TodayProvider>{ui}</TodayProvider>
        </ToastProvider>
      </SessionProvider>
    </RouterProvider>
  );
}

const asRole = (role) =>
  endpoints.getSession.mockResolvedValue({
    authenticated: true,
    user: { id: 1, username: 'ana', displayName: 'Ana', role, mustChangePassword: false },
  });

beforeEach(() => {
  endpoints.getToday.mockResolvedValue({ referenceDate: '2026-11-05', counts: {}, categories: [], items: [] });
  endpoints.getDashboard.mockResolvedValue({ categories: [], itemsByCategory: {}, allPatients: [] });
  endpoints.listUsers.mockResolvedValue({ users: [] });
  endpoints.listAudit.mockResolvedValue({ entries: [] });
  endpoints.backupStatus.mockResolvedValue({ local: {}, offsite: {}, encryptionKeyConfigured: false });
});
afterEach(() => vi.clearAllMocks());

describe('Configurações', () => {
  test('recepção não vê Usuárias, Auditoria, Backups nem edição de prazos', async () => {
    asRole('recepcao');
    wrap(<SettingsPage />, '/configuracoes');
    await act(async () => {});
    expect(screen.getByRole('link', { name: 'Minha senha' })).toBeInTheDocument();
    for (const name of ['Usuárias', 'Auditoria', 'Backups', 'Prazos e mensagens']) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });

  test('administradora vê todas as seções', async () => {
    asRole('admin');
    wrap(<SettingsPage />, '/configuracoes');
    await act(async () => {});
    for (const name of ['Prazos e mensagens', 'Minha senha', 'Usuárias', 'Auditoria', 'Backups']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });

  test('troca de senha com confirmação diferente mostra erro', async () => {
    asRole('recepcao');
    wrap(<SettingsPage />, '/configuracoes/senha');
    await act(async () => {});
    await userEvent.type(screen.getByLabelText('Senha atual'), 'senha-atual-1234');
    await userEvent.type(screen.getByLabelText('Nova senha'), 'nova-senha-1234');
    await userEvent.type(screen.getByLabelText('Repita a nova senha'), 'outra-senha-1234');
    await userEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));
    expect(screen.getByRole('alert')).toHaveTextContent('A confirmação é diferente da nova senha.');
    expect(endpoints.changePassword).not.toHaveBeenCalled();
  });
});

describe('Importar agenda', () => {
  test('importação mostra o resumo e o aviso de exportação parcial', async () => {
    asRole('recepcao');
    endpoints.importFile.mockResolvedValue({
      summary: { filename: 'agenda.xlsx', validEvents: 301, newPatients: 4, removedAppointments: 2, cleanupSkipped: 47 },
    });
    wrap(<ImportPage />, '/importar');
    await act(async () => {});
    const file = new File(['x'], 'agenda.xlsx', { type: 'application/vnd.ms-excel' });
    await userEvent.upload(screen.getByLabelText('Planilha da agenda'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Importar agenda' }));
    expect(endpoints.importFile).toHaveBeenCalledWith(file);
    expect(screen.getByText(/Importados 301 atendimentos/)).toBeInTheDocument();
    expect(screen.getByText(/4 pacientes novos/)).toBeInTheDocument();
    expect(screen.getByText(/2 removidos \(cancelados\)/)).toBeInTheDocument();
    expect(screen.getByText(/47 agendamentos mantidos \(parecia exportação parcial\)/)).toBeInTheDocument();
  });
});
