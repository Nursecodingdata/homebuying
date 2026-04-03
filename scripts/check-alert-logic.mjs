import { addDaysKst } from "./lib.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getTargets(items, baseDate) {
  const target = addDaysKst(baseDate, 7);
  return items.filter((item) => item.applicationStartDate === target);
}

function main() {
  const baseDate = "2026-04-03";
  const items = [
    { id: "a", applicationStartDate: "2026-04-10" },
    { id: "b", applicationStartDate: "2026-04-11" }
  ];
  const targets = getTargets(items, baseDate);

  assert(targets.length === 1, "7-day target count should be 1");
  assert(targets[0].id === "a", "target id should be a");
  console.log("[check:alerts] ok");
}

main();
