#!/usr/bin/env node
/**
 * Migration safety check (see docs/12_Migration_Safety_Notes.md).
 *
 * Scans every backend/prisma/migrations/*\/migration.sql and fails if any of
 * them contains a `DROP INDEX` on a vector/embedding index (name matching
 * *_embedding_idx) that is not recreated in the same file. This is exactly
 * the failure mode that has twice silently dropped rag_chunks_embedding_idx
 * / ai_memories_embedding_idx: Prisma's schema diffing cannot see manually
 * created ivfflat indexes on Unsupported("vector") columns, so plain
 * `prisma migrate dev` treats them as drift to remove.
 *
 * Scans ALL migration files every run (not just staged/changed ones) - the
 * migrations directory is small (a few dozen files at most for this
 * project's lifetime), so a full scan is cheap and catches drift even if a
 * file was edited without being re-staged in the same commit. This is
 * simpler and more robust than parsing `git diff --cached` for a check this
 * cheap to run in full.
 *
 * Usage: node scripts/check-migration-safety.js [migrationsDir]
 * An optional directory argument overrides the default (used for testing
 * this script itself against a throwaway fixture, not for normal use).
 * Exit code 0 = safe, 1 = violation(s) found (or found unreadable dir).
 */

const fs = require('fs');
const path = require('path');

const migrationsDir =
  process.argv[2] || path.join(__dirname, '..', 'prisma', 'migrations');

const DROP_INDEX_PATTERN =
  /DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?/gi;
const EMBEDDING_INDEX_PATTERN = /_embedding_idx$/i;

function findMigrationFiles() {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(migrationsDir, entry.name, 'migration.sql'))
    .filter((filePath) => fs.existsSync(filePath));
}

function createsIndex(sqlContent, indexName) {
  const createPattern = new RegExp(
    `CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?"?${indexName}"?\\s`,
    'i',
  );

  return createPattern.test(sqlContent);
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations = [];
  let match;

  DROP_INDEX_PATTERN.lastIndex = 0;

  while ((match = DROP_INDEX_PATTERN.exec(content)) !== null) {
    const indexName = match[1];

    if (!EMBEDDING_INDEX_PATTERN.test(indexName)) {
      continue;
    }

    if (!createsIndex(content, indexName)) {
      violations.push(indexName);
    }
  }

  return violations;
}

function main() {
  const files = findMigrationFiles();
  let hasViolations = false;

  for (const filePath of files) {
    const violations = checkFile(filePath);

    if (violations.length === 0) {
      continue;
    }

    hasViolations = true;
    const relativePath = path.relative(process.cwd(), filePath);

    for (const indexName of violations) {
      console.error(
        `\n✖ Migration safety violation in ${relativePath}:\n` +
          `  DROP INDEX on "${indexName}" is not recreated in this file.\n` +
          `  This is a vector/embedding index invisible to Prisma's diffing - dropping it\n` +
          `  degrades semantic search from an ANN index to a full table scan, silently.\n` +
          `  Fix: add "CREATE INDEX ${indexName} ON <table> USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);"\n` +
          `  to this same migration file, or remove the DROP INDEX statement entirely if it\n` +
          `  was unintentional drift. See docs/12_Migration_Safety_Notes.md.`,
      );
    }
  }

  if (hasViolations) {
    console.error('\nMigration safety check FAILED.\n');
    process.exit(1);
  }

  console.log(
    `Migration safety check passed (${files.length} migration file(s) scanned, no unrecreated embedding-index drops found).`,
  );
  process.exit(0);
}

main();
