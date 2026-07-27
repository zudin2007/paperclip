import { applyPendingMigrations, inspectMigrations } from "./client.js";
import { resolveMigrationConnection } from "./migration-runtime.js";

async function main(): Promise<void> {
  const resolved = await resolveMigrationConnection();

  console.log(`Migrating database via ${resolved.source}`);

  try {
    const before = await inspectMigrations(resolved.connectionString);
    if (before.status === "upToDate") {
      console.log("No pending migrations");
      return;
    }

    console.log(`Applying ${before.pendingMigrations.length} pending migration(s)...`);
    await applyPendingMigrations(resolved.connectionString);

    const after = await inspectMigrations(resolved.connectionString);
    if (after.status !== "upToDate") {
      throw new Error(`Migrations incomplete: ${after.pendingMigrations.join(", ")}`);
    }
    console.log("Migrations complete");
  } finally {
    // Leave embedded postgres running: stopping here can strand the cluster
    // mid-shutdown on Windows (pid file gone, shared memory still held),
    // which breaks the dev server start right after. The server adopts a
    // running cluster via postmaster.pid; external-postgres stop is a no-op.
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
// Lingering embedded-postgres/pg handles can keep the event loop alive
// (seen on Windows), so exit explicitly once stdout is drained.
process.stdout.write("", () => process.exit(0));
