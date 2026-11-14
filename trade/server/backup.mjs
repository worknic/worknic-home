// Run on the private server volume. The output contains customer data.
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { existsSync, mkdirSync, chmodSync } from "node:fs";
const dir = process.env.TRADE_DATA_DIR;
if (!dir) throw Error("Set TRADE_DATA_DIR to the existing private volume.");
const source = resolve(dir, "trade.sqlite");
if (!existsSync(source)) throw Error("Existing database not found.");
const output = resolve(dir, "backups");
mkdirSync(output, { recursive: true, mode: 0o700 });
const filename = resolve(
  output,
  new Date().toISOString().replaceAll(":", "-") + ".sqlite",
);
const db = new DatabaseSync(source);
try {
  db.exec("PRAGMA busy_timeout=10000");
  db.prepare("VACUUM main INTO ?").run(filename);
  chmodSync(filename, 0o600);
  console.log(
    "Consistent SQLite backup created under the private volume. Transfer it to a separate restricted backup destination.",
  );
} finally {
  db.close();
}
