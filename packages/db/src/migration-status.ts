import { inspectMigrations } from "./client.js";
import { resolveMigrationConnection } from "./migration-runtime.js";

const jsonMode = process.argv.includes("--json");

function toError(error: unknown, context = "Migration status check failed"): Error {
  if (error instanceof Error) return error;
  if (error === undefined) return new Error(context);
  if (typeof error === "string") return new Error(`${context}: ${error}`);

  try {
    return new Error(`${context}: ${JSON.stringify(error)}`);
  } catch {
    return new Error(`${context}: ${String(error)}`);
  }
}

async function main(): Promise<void> {
  const connection = await resolveMigrationConnection();

  try {
    const state = await inspectMigrations(connection.connectionString);
    const payload =
      state.status === "upToDate"
        ? {
            source: connection.source,
            status: "upToDate" as const,
            tableCount: state.tableCount,
            pendingMigrations: [] as string[],
          }
        : {
            source: connection.source,
            status: "needsMigrations" as const,
            tableCount: state.tableCount,
            pendingMigrations: state.pendingMigrations,
            reason: state.reason,
          };

    if (jsonMode) {
      console.log(JSON.stringify(payload));
      return;
    }

    if (payload.status === "upToDate") {
      console.log(`Database is up to date via ${payload.source}`);
      return;
    }

    console.log(
      `Pending migrations via ${payload.source}: ${payload.pendingMigrations.join(", ")}`,
    );
  } finally {
    // Leave embedded postgres running: stopping here can strand the cluster
    // mid-shutdown on Windows (pid file gone, shared memory still held),
    // which breaks the dev server start right after. The server adopts a
    // running cluster via postmaster.pid; external-postgres stop is a no-op.
  }
}

function flushStdoutAndExit(code: number): never {
  // Lingering embedded-postgres/pg handles can keep the event loop alive
  // (seen on Windows), so exit explicitly once stdout is drained.
  process.stdout.write("", () => process.exit(code));
  return undefined as never;
}

main()
  .then(() => flushStdoutAndExit(0))
  .catch((error) => {
    const err = toError(error, "Migration status check failed");
    process.stderr.write(`${err.stack ?? err.message}\n`);
    process.exit(1);
  });
