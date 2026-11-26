// Thin fetch wrapper. All requests go to /api (proxied to the backend in dev,
// same-origin in production).
const TOKEN_KEY = 'ohs.token';
const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || (status === 0 ? 'Cannot reach the server. Check that the backend is running.' : `Request failed (${status})`));
    this.status = status;
    this.code = body?.code;
    this.details = body?.details;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(method, path, body) {
  const token = tokenStore.get();
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0);
  }
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; } }
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith('/auth/login')) onUnauthorized(data?.error);
    throw new ApiError(res.status, data);
  }
  return data;
}

const qs = (params = {}) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  return s ? `?${s}` : '';
};

export const api = {
  // auth
  config: () => request('GET', '/auth/config'),
  login: (body) => request('POST', '/auth/login', body),
  register: (body) => request('POST', '/auth/register', body),
  me: () => request('GET', '/auth/me'),
  updateMe: (body) => request('PATCH', '/auth/me', body),
  changePassword: (body) => request('POST', '/auth/change-password', body),
  // directory & slots
  faculty: (params) => request('GET', `/faculty${qs(params)}`),
  departments: () => request('GET', '/faculty/departments'),
  facultyDetail: (id) => request('GET', `/faculty/${id}`),
  mySlots: (params) => request('GET', `/slots/mine${qs(params)}`),
  previewSlots: (body) => request('POST', '/slots/preview', body),
  publishSlots: (body) => request('POST', '/slots', body),
  cancelSlot: (id) => request('POST', `/slots/${id}/cancel`),
  // bookings
  book: (slotId, note) => request('POST', '/bookings', { slot_id: slotId, note }),
  bookings: (params) => request('GET', `/bookings${qs(params)}`),
  booking: (id) => request('GET', `/bookings/${id}`),
  cancelBooking: (id, reason) => request('POST', `/bookings/${id}/cancel`, { reason }),
  rescheduleBooking: (id, slotId, note) => request('POST', `/bookings/${id}/reschedule`, { slot_id: slotId, note }),
  // waitlist
  myWaitlist: () => request('GET', '/waitlist'),
  joinWaitlist: (slotId) => request('POST', `/slots/${slotId}/waitlist`),
  leaveWaitlist: (slotId) => request('DELETE', `/slots/${slotId}/waitlist`),
  // swaps between students
  swapCandidates: (bookingId) => request('GET', `/swaps/candidates${qs({ booking_id: bookingId })}`),
  swaps: () => request('GET', '/swaps'),
  requestSwap: (myBookingId, targetBookingId) => request('POST', '/swaps', { my_booking_id: myBookingId, target_booking_id: targetBookingId }),
  respondSwap: (id, action) => request('POST', `/swaps/${id}/${action}`),
  setOutcome: (id, status) => request('PATCH', `/bookings/${id}`, { status }),
  // dashboards
  studentDashboard: () => request('GET', '/dashboard/student'),
  facultyDashboard: (params) => request('GET', `/dashboard/faculty${qs(params)}`),
  // notifications
  notifications: (params) => request('GET', `/notifications${qs(params)}`),
  readNotification: (id) => request('POST', `/notifications/${id}/read`),
  readAllNotifications: () => request('POST', '/notifications/read-all'),
  // admin
  analytics: (params) => request('GET', `/admin/analytics${qs(params)}`),
  monitoring: () => request('GET', '/admin/monitoring'),
  users: (params) => request('GET', `/admin/users${qs(params)}`),
  user: (id) => request('GET', `/admin/users/${id}`),
  setUserActive: (id, isActive) => request('PATCH', `/admin/users/${id}`, { isActive }),
  createUser: (body) => request('POST', '/admin/users', body),
  adminSlots: (params) => request('GET', `/admin/slots${qs(params)}`),
  adminCancelSlot: (id, reason) => request('POST', `/admin/slots/${id}/cancel`, { reason }),
};
