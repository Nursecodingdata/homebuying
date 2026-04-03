import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateItem } from "./lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT, "public", "data", "listings.json");

async function main() {
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  const json = JSON.parse(raw);

  if (!Array.isArray(json.items)) {
    throw new Error("items is not an array");
  }

  if (!json.items.length) {
    throw new Error("items is empty");
  }

  const invalid = json.items.filter((item) => !validateItem(item));
  if (invalid.length) {
    throw new Error(`invalid items found: ${invalid.length}`);
  }

  console.log(`[check:data] ok - ${json.items.length} items`);
}

main().catch((e) => {
  console.error("[check:data] failed:", e.message);
  process.exit(1);
});
