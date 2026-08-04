// CLI-only entry (bun db:seed, migrate-file-storage.ts). Client/server code
// must import `@/db/index.server` instead — importing this file from the
// client bundle would leak `postgres` into the browser.
export { db } from "./index.server";
