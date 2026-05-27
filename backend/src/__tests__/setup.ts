// Provide required env vars before any module is imported
process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.DATABASE_URL = 'postgresql://test:test@localhost/testdb';
