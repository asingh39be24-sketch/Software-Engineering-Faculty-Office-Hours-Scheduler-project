export class HttpError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, { code: 'BAD_REQUEST', details });
export const unauthorized = (msg = 'Authentication required') => new HttpError(401, msg, { code: 'UNAUTHORIZED' });
export const forbidden = (msg = 'You do not have permission to do this') => new HttpError(403, msg, { code: 'FORBIDDEN' });
export const notFound = (msg = 'Not found') => new HttpError(404, msg, { code: 'NOT_FOUND' });
export const conflict = (msg, code = 'CONFLICT') => new HttpError(409, msg, { code });
