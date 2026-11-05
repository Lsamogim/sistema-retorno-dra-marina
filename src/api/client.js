// Único ponto de contato com o servidor: trata erros, rede e sessão expirada.
export const NETWORK_ERROR_MESSAGE = 'Sem conexão com o servidor. Nada foi salvo.';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let unauthorizedHandler = null;
export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
}

export async function request(method, url, body) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'include',
      headers: body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', NETWORK_ERROR_MESSAGE);
  }
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    if (res.status === 401) unauthorizedHandler?.();
    throw new ApiError(
      res.status,
      payload?.error?.code || 'HTTP_ERROR',
      payload?.error?.message || `Não foi possível concluir (erro ${res.status}).`
    );
  }
  return payload;
}
