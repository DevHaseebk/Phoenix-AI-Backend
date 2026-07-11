#!/usr/bin/env node
/**
 * Recovery tool for the recurring "migration was modified after it was
 * applied" checksum-drift problem (see docs/12_Migration_Safety_Notes.md
 * §7). This project's safe migration workflow requires hand-editing
 * already-applied migration files (to strip bundled unrelated models, or to
 * recreate a vector index Prisma's diffing can't see) - editing an applied
 * file's content is exactly what makes its on-disk checksum stop matching
 * the checksum Prisma recorded at apply time.
 *
 * IMPORTANT, verified directly against Prisma 6.19.3's actual behavior in
 * this project (not assumed): `prisma migrate resolve --applied <name>`
 * ALONE throws P3008 ("already recorded as applied") for a migration that
 * is already in the `_prisma_migrations` table - it does not resolve
 * checksum drift by itself. The two-step recovery that actually works:
 *   1. Delete that migration's row from `_prisma_migrations` (Prisma's own
 *      internal bookkeeping table - this never touches any application
 *      data table, and does not re-run or undo the migration's SQL).
 *   2. Run `prisma migrate resolve --applied <name>` again, which then
 *      re-inserts the row, computing the checksum fresh from the CURRENT
 *      on-disk file content.
 * This script does both steps, but only after confirming real drift exists
 * (refuses to touch anything if the checksum already matches), and
 * verifies the fix afterward. It never runs migrate reset and never
 * modifies any migration.sql file.
 *
 * Usage: node prisma/resolve-migration-drift.js <migration_name>
 *    or: npm run db:migrate:resolve-drift -- <migration_name>
 */
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const migrationName = process.argv[2];

  if (!migrationName) {
    console.error('Usage: node prisma/resolve-migration-drift.js <migration_name>');
    process.exitCode = 1;
    return;
  }

  const sqlPath = path.join(__dirname, 'migrations', migrationName, 'migration.sql');

  if (!fs.existsSync(sqlPath)) {
    console.error(`No migration.sql found at ${sqlPath}`);
    process.exitCode = 1;
    return;
  }

  const onDiskChecksum = crypto
    .createHash('sha256')
    .update(fs.readFileSync(sqlPath))
    .digest('hex');

  const prisma = new PrismaClient();

  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT checksum FROM "_prisma_migrations" WHERE migration_name = $1`,
      migrationName,
    );

    if (rows.length === 0) {
      console.error(
        `"${migrationName}" has no row in _prisma_migrations - it may not be applied yet. ` +
          'This tool is only for already-applied migrations with drifted checksums; nothing to do.',
      );
      process.exitCode = 1;
      return;
    }

    if (rows[0].checksum === onDiskChecksum) {
      console.log(
        `"${migrationName}" checksum already matches the on-disk file (${onDiskChecksum}). No drift - nothing to do.`,
      );
      return;
    }

    console.log(`Drift confirmed for "${migrationName}":`);
    console.log(`  stored:   ${rows[0].checksum}`);
    console.log(`  on-disk:  ${onDiskChecksum}`);
    console.log('\nDeleting the tracking row (application data tables are untouched)...');

    await prisma.$executeRawUnsafe(
      `DELETE FROM "_prisma_migrations" WHERE migration_name = $1`,
      migrationName,
    );

    console.log('Re-registering as applied via `prisma migrate resolve --applied`...');
    execSync(`npx prisma migrate resolve --applied ${migrationName}`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });

    const after = await prisma.$queryRawUnsafe(
      `SELECT checksum FROM "_prisma_migrations" WHERE migration_name = $1`,
      migrationName,
    );

    if (after.length === 1 && after[0].checksum === onDiskChecksum) {
      console.log(`\nFixed. "${migrationName}" checksum now matches the on-disk file.`);
    } else {
      console.error(
        `\nSomething went wrong - checksum still does not match after resolve. Manual investigation needed.`,
      );
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('resolve-migration-drift failed:', error);
  process.exitCode = 1;
});
