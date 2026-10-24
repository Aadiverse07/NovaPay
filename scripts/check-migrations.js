const fs = require('node:fs/promises');
const path = require('node:path');
const { parse, parsePlPgSQL } = require('@libpg-query/parser');

const root = path.resolve(__dirname, '..');
const migrationDirectory = path.join(root, 'supabase', 'migrations');

async function main() {
  const files = (await fs.readdir(migrationDirectory))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  if (files.length === 0) throw new Error('No numbered SQL migrations found.');

  let failed = false;
  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationDirectory, file), 'utf8');
    try {
      await parse(sql);
      await parsePlPgSQL(sql);
      console.log(`${file}: PostgreSQL 17 SQL and PL/pgSQL syntax OK`);
    } catch (error) {
      failed = true;
      const position = Number.isInteger(error.position) ? ` at parser position ${error.position}` : '';
      console.error(`${file}: syntax error${position}: ${error.message}`);
    }
  }
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Migration parser failed: ${error.message}`);
  process.exitCode = 1;
});
