// Integration smoke tests against a running dev server (`npm run dev`), same pattern
// the frontend's Playwright tests use. Run with: npm test
const request = require('supertest');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';

describe('REST API', () => {
    test('GET / health check', async () => {
        const res = await request(BASE_URL).get('/');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    test('POST /api/upload without a token is rejected', async () => {
        const res = await request(BASE_URL).post('/api/upload');
        expect(res.status).toBe(401);
    });

    test('GET /api/admin/users without a token is rejected', async () => {
        const res = await request(BASE_URL).get('/api/admin/users');
        expect(res.status).toBe(401);
    });

    test('GET /api/push/vapid-public-key returns a key when configured', async () => {
        const res = await request(BASE_URL).get('/api/push/vapid-public-key');
        expect([200, 503]).toContain(res.status);
    });
});
