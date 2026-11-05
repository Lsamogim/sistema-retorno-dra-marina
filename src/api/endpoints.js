import { request } from './client.js';

const stateUrl = (patientId, categoryId) => `/api/patients/${patientId}/categories/${encodeURIComponent(categoryId)}`;

export const endpoints = {
  getSession: () => request('GET', '/api/auth/session'),
  login: (username, password) => request('POST', '/api/auth/login', { username, password }),
  logout: () => request('POST', '/api/auth/logout'),
  changePassword: (currentPassword, newPassword) => request('PUT', '/api/auth/password', { currentPassword, newPassword }),
  getToday: () => request('GET', '/api/today'),
  getDashboard: () => request('GET', '/api/dashboard'),
  act: (patientId, categoryId, body) => request('PATCH', stateUrl(patientId, categoryId), body),
  updateState: (patientId, categoryId, body) => request('PATCH', stateUrl(patientId, categoryId), body),
  restore: (patientId, categoryId, before) => request('POST', `${stateUrl(patientId, categoryId)}/restore`, { before }),
  updatePatient: (id, fields) => request('PATCH', `/api/patients/${id}`, fields),
  mergePatient: (sourceId, targetPatientId) => request('POST', `/api/patients/${sourceId}/merge`, { targetPatientId }),
  importFile: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('POST', '/api/imports', form);
  },
  saveCategories: (categories) => request('PUT', '/api/categories', { categories }),
  listUsers: () => request('GET', '/api/admin/users'),
  createUser: (data) => request('POST', '/api/admin/users', data),
  updateUser: (id, data) => request('PATCH', `/api/admin/users/${id}`, data),
  listAudit: (beforeId) => request('GET', `/api/admin/audit?limit=100${beforeId ? `&before=${beforeId}` : ''}`),
  backupStatus: () => request('GET', '/api/admin/backup-status'),
};
