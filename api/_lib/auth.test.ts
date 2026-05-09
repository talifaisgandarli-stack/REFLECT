import { describe, expect, it } from 'vitest';
import { errorResponse, HttpError } from './auth';

describe('HttpError', () => {
  it('derives a default code from common HTTP statuses', () => {
    expect(new HttpError(400, 'bad').code).toBe('bad_request');
    expect(new HttpError(401, 'no token').code).toBe('unauthenticated');
    expect(new HttpError(403, 'denied').code).toBe('forbidden');
    expect(new HttpError(404, 'gone').code).toBe('not_found');
    expect(new HttpError(405, 'no').code).toBe('method_not_allowed');
    expect(new HttpError(409, 'dup').code).toBe('conflict');
    expect(new HttpError(413, 'big').code).toBe('payload_too_large');
    expect(new HttpError(429, 'slow').code).toBe('rate_limited');
    expect(new HttpError(500, 'oops').code).toBe('internal_error');
    expect(new HttpError(503, 'gone').code).toBe('internal_error');
    expect(new HttpError(418, 'teapot').code).toBe('error');
  });

  it('preserves an explicit code over the default', () => {
    const e = new HttpError(401, 'Missing bearer token', 'missing_bearer');
    expect(e.code).toBe('missing_bearer');
    expect(e.status).toBe(401);
    expect(e.message).toBe('Missing bearer token');
  });
});

describe('errorResponse', () => {
  it('emits { error, code } for HttpError', async () => {
    const res = errorResponse(new HttpError(401, 'Invalid token', 'invalid_token'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Invalid token', code: 'invalid_token' });
  });

  it('emits 500 + internal_error for unknown throws', async () => {
    // suppress the console.error noise from the catch branch
    const orig = console.error;
    console.error = () => {};
    try {
      const res = errorResponse(new Error('boom'));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toEqual({ error: 'Internal error', code: 'internal_error' });
    } finally {
      console.error = orig;
    }
  });

  it('emits the correct content-type', () => {
    const res = errorResponse(new HttpError(404, 'gone'));
    expect(res.headers.get('content-type')).toBe('application/json');
  });
});
