import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';
import { config } from '../config/env';

const client = postgres(config.DATABASE_URL, {
  max: 30,
  idle_timeout: 30,
  connect_timeout: 10,
  max_lifetime: 60 * 30,
});

export const db = drizzle(client, { schema });

export async function closeDb() {
  await client.end({ timeout: 5 });
}
