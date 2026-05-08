import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const requiredEnv = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const sslCaContent = process.env.DB_SSL_CA_CONTENT
  ? process.env.DB_SSL_CA_CONTENT.replace(/\\n/g, '\n')
  : null;
const sslCaPath = process.env.DB_SSL_CA
  ? path.resolve(rootDir, process.env.DB_SSL_CA)
  : null;
const sslOptions = sslCaContent
  ? { ca: sslCaContent }
  : sslCaPath
    ? { ca: fs.readFileSync(sslCaPath) }
    : null;

const connectionConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true,
  ...(sslOptions ? { ssl: sslOptions } : {})
};

const sqlFiles = [
  'schema.sql',
  'logic.sql',
  'bootstrap.sql',
  'security.sql',
  'checks.sql'
];

function normalizeSql(filename, sql) {
  let normalized = sql.replace(/^\uFEFF/, '');

  if (filename === 'schema.sql') {
    normalized = normalized
      .split(/\r?\n/)
      .filter((line) => !/^\s*CREATE\s+DATABASE\b/i.test(line))
      .filter((line) => !/^\s*USE\s+\w+/i.test(line))
      .filter((line) => !/^\s*CHARACTER\s+SET\b/i.test(line))
      .filter((line) => !/^\s*COLLATE\b/i.test(line))
      .join('\n');
  }

  normalized = normalized
    .replace(/^\s*DELIMITER\s+\$\$\s*$/gim, '')
    .replace(/^\s*DELIMITER\s+;\s*$/gim, '')
    .replace(/\$\$/g, ';');

  return normalized.trim();
}

async function run() {
  const connection = await mysql.createConnection(connectionConfig);
  try {
    await connection.query(`USE \`${process.env.DB_NAME}\``);

    for (const filename of sqlFiles) {
      const filePath = path.join(rootDir, filename);
      const sql = fs.readFileSync(filePath, 'utf8');
      const normalized = normalizeSql(filename, sql);
      if (!normalized) {
        console.log(`Skipping ${filename} (empty).`);
        continue;
      }
      console.log(`Running ${filename}...`);
      await connection.query(normalized);
    }

    console.log('Database initialization complete.');
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error('Database initialization failed.');
  console.error(error);
  process.exit(1);
});
