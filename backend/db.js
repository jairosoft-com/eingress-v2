import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required in backend/.env');
}

export const pool = new Pool({
  connectionString,
});

export async function query(text, params) {
  return pool.query(text, params);
}
