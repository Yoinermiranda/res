export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') ?? 'null');
  } catch {
    return null;
  }
}

export function getStoredToken() {
  return localStorage.getItem('token') || '';
}

export function clearStoredSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}
