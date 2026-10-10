const { scopeLocation, requireRole } = require('../../src/middleware/rbac');

const run = (mw, req) => new Promise((resolve) => mw(req, {}, (err) => resolve({ err, req })));

describe('location scoping', () => {
  test('location user is pinned to own location', async () => {
    const { err, req } = await run(scopeLocation, { user: { role: 'LOCATION_USER', location: 'Singapore' }, query: {} });
    expect(err).toBeUndefined();
    expect(req.scope.location).toBe('Singapore');
  });
  test('location user cannot read another location', async () => {
    const { err } = await run(scopeLocation, { user: { role: 'LOCATION_USER', location: 'Singapore' }, query: { location: 'London' } });
    expect(err.status).toBe(403);
  });
  test('support user can read any location or ALL', async () => {
    const a = await run(scopeLocation, { user: { role: 'SUPPORT' }, query: { location: 'London' } });
    const b = await run(scopeLocation, { user: { role: 'SUPPORT' }, query: {} });
    expect(a.req.scope.location).toBe('London');
    expect(b.req.scope.location).toBe('ALL');
  });
  test('unknown location is a 400', async () => {
    const { err } = await run(scopeLocation, { user: { role: 'SUPPORT' }, query: { location: 'Mars' } });
    expect(err.status).toBe(400);
  });
  test('requireRole blocks other roles', async () => {
    const { err } = await run(requireRole('SUPPORT'), { user: { role: 'LOCATION_USER' } });
    expect(err.status).toBe(403);
  });
});
