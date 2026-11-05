import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError, NETWORK_ERROR_MESSAGE, onUnauthorized, request } from '../api/client.js';
import { RouterProvider, useRoute } from './router.jsx';

afterEach(() => {
  vi.restoreAllMocks();
  onUnauthorized(null);
});

describe('cliente da API', () => {
  test('request em 401 chama onUnauthorized', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Sessão expirada' } }), { status: 401 })
    );
    const handler = vi.fn();
    onUnauthorized(handler);
    await expect(request('GET', '/api/today')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('erro de rede vira ApiError com a mensagem padrão', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await request('PATCH', '/api/x', { a: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe(NETWORK_ERROR_MESSAGE);
    expect(NETWORK_ERROR_MESSAGE).toBe('Sem conexão com o servidor. Nada foi salvo.');
  });

  test('erro do servidor usa a mensagem enviada', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Data inválida.' } }), { status: 400 })
    );
    await expect(request('PATCH', '/api/x', {})).rejects.toMatchObject({ status: 400, message: 'Data inválida.' });
  });
});

describe('roteador', () => {
  function Page() {
    const { path, query, navigate } = useRoute();
    return (
      <div>
        <p>rota:{path}</p>
        <p>etapa:{query.get('etapa') || '-'}</p>
        <button type="button" onClick={() => navigate('/pacientes')}>
          ir
        </button>
      </div>
    );
  }

  test("navigate('/pacientes') troca a página e o voltar retorna a /hoje", async () => {
    window.history.replaceState(null, '', '/hoje?etapa=agendado');
    render(
      <RouterProvider>
        <Page />
      </RouterProvider>
    );
    expect(screen.getByText('rota:/hoje')).toBeInTheDocument();
    expect(screen.getByText('etapa:agendado')).toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'ir' }).click());
    expect(screen.getByText('rota:/pacientes')).toBeInTheDocument();
    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(screen.getByText('rota:/hoje')).toBeInTheDocument();
  });

  test('raiz redireciona para /hoje', () => {
    window.history.replaceState(null, '', '/');
    render(
      <RouterProvider>
        <Page />
      </RouterProvider>
    );
    expect(screen.getByText('rota:/hoje')).toBeInTheDocument();
  });
});
