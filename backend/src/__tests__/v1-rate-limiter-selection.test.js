const express = require('express');
const request = require('supertest');

const mockDb = { get: jest.fn(), all: jest.fn(), prepare: jest.fn(() => ({ run: jest.fn() })) };
const mockVllmCompleteLimiter = jest.fn((req, res, next) => next());
const mockVllmStreamLimiter = jest.fn((req, res, next) => next());

jest.mock('../db', () => mockDb);
jest.mock('../middleware/rateLimiter', () => ({
  vllmCompleteLimiter: (...args) => mockVllmCompleteLimiter(...args),
  vllmStreamLimiter: (...args) => mockVllmStreamLimiter(...args),
  modelCatalogLimiter: (req, res, next) => next(),
}));

describe('v1 chat limiter selection', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    mockDb.get.mockReset();
    mockDb.all.mockReset();
    mockVllmCompleteLimiter.mockClear();
    mockVllmStreamLimiter.mockClear();

    const router = require('../routes/v1');
    app = express();
    app.use(express.json());
    app.use('/v1', router);
  });

  test('uses complete limiter when stream is false', async () => {
    const res = await request(app)
      .post('/v1/chat/completions')
      .send({ model: 'any-model', messages: [{ role: 'user', content: 'hi' }] });

    expect(res.status).toBe(401); // auth expected after limiter
    expect(mockVllmCompleteLimiter).toHaveBeenCalledTimes(1);
    expect(mockVllmStreamLimiter).not.toHaveBeenCalled();
  });

  test('uses stream limiter when stream is true', async () => {
    const res = await request(app)
      .post('/v1/chat/completions')
      .send({ model: 'any-model', messages: [{ role: 'user', content: 'hi' }], stream: true });

    expect(res.status).toBe(401); // auth expected after limiter
    expect(mockVllmStreamLimiter).toHaveBeenCalledTimes(1);
    expect(mockVllmCompleteLimiter).not.toHaveBeenCalled();
  });
});
