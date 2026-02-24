import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

dotenvConfig({ path: resolve(process.cwd(), '.env') });
dotenvConfig({ path: resolve(process.cwd(), '../../.env') });


function env(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) throw new Error(`Missing required env: ${key}`);
  return value;
}

export const config = {
  PORT: parseInt(process.env.PORT ?? '4000', 10),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/huoke',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  JWT_SECRET: process.env.JWT_SECRET || (() => {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET is required');
    return 'huoke-dev-jwt-secret';
  })(),
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || (() => {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_REFRESH_SECRET is required');
    return 'huoke-dev-refresh-secret';
  })(),
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? '',
  DEEPSEEK_BASE_URL:
    process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
  QDRANT_URL: process.env.QDRANT_URL ?? 'http://localhost:6333',
  MEILISEARCH_URL: process.env.MEILISEARCH_URL ?? 'http://localhost:7700',
  MEILISEARCH_KEY: process.env.MEILISEARCH_KEY ?? '',
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT ?? 'localhost',
  MINIO_PORT: parseInt(process.env.MINIO_PORT ?? '9000', 10),
  MINIO_USE_SSL: process.env.MINIO_USE_SSL === 'true',
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY ?? '',
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY ?? '',
  MINIO_BUCKET: process.env.MINIO_BUCKET ?? 'huoke',
} as const;

export type Config = typeof config;
