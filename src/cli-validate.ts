import { readFileSync } from "node:fs";
import { BlueprintDocumentSchema } from "./document.js";
import { validateBlueprint } from "./validate.js";

const path = process.argv[2] ?? "samples/minimal-hotel.json";
const raw = JSON.parse(readFileSync(path, "utf8"));
const parsed = BlueprintDocumentSchema.safeParse(raw);

if (!parsed.success) {
  console.error("Schema parse failed:");
  console.error(parsed.error.format());
  process.exit(1);
}

const doc = parsed.data;
const issues = validateBlueprint(doc);
if (issues.length) {
  console.error(`Validation failed (${issues.length} issue(s)):`);
  for (const i of issues) {
    console.error(`  [${i.code}] ${i.message}`);
  }
  process.exit(1);
}

console.log(`OK: ${path} (modelVersion ${doc.meta.modelVersion})`);
