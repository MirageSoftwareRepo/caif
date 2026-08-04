import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Server-only Drizzle client. Consumed by `@/db/index` (CLI: seed, migrations)
// and by server code via `@/db/index.server`. Importing this from the client
// bundle would leak `postgres` into the browser — always go through a server
// function or a `*.server.ts` module.
const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });