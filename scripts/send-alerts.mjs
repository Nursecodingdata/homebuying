import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import { addDaysKst, nowKstDate } from "./lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_PATHS = [
  path.join(ROOT, "public", "data", "listings.json"),
  path.join(ROOT, "src", "data", "listings.json")
];
const ALERT_STATE_PATH = path.join(ROOT, ".state", "sent-alerts.json");
const RECIPIENTS = ["kellyanne@naver.com"];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

async function readListings() {
  for (const p of DATA_PATHS) {
    try {
      const content = await fs.readFile(p, "utf-8");
      const json = JSON.parse(content);
      if (Array.isArray(json.items)) return json.items;
    } catch {
      continue;
    }
  }
  return [];
}

async function readState() {
  try {
    const content = await fs.readFile(ALERT_STATE_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return { sentKeys: {} };
  }
}

async function writeState(state) {
  await fs.mkdir(path.dirname(ALERT_STATE_PATH), { recursive: true });
  await fs.writeFile(ALERT_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

function findUpcomingWeekTargets(items, baseDate) {
  const target = addDaysKst(baseDate, 7);
  return items.filter((item) => item.applicationStartDate === target);
}

function keyFor(item) {
  return `${item.id}::${item.applicationStartDate}`;
}

function composeMail(items, baseDate) {
  const targetDate = addDaysKst(baseDate, 7);
  const subject = `[청약 알리미] ${targetDate} 시작 일정 ${items.length}건`;
  const lines = items.map(
    (item, i) =>
      `${i + 1}. ${item.name}\n- 지역: ${item.region}/${item.subregion}\n- 접수: ${item.applicationStartDate} ~ ${item.applicationEndDate}\n- 공급기관: ${item.provider}\n- 공고: ${item.announcementUrl}`
  );
  const text = [
    `청약 시작일이 7일 남은 일정 안내입니다. (기준일: ${baseDate}, 대상일: ${targetDate})`,
    "",
    ...lines
  ].join("\n");
  return { subject, text };
}

async function main() {
  const baseDate = nowKstDate();
  const listings = await readListings();

  if (!listings.length) {
    console.warn("[alert] No listings found. Skip sending.");
    return;
  }

  const state = await readState();
  const candidates = findUpcomingWeekTargets(listings, baseDate);
  const unsent = candidates.filter((item) => !state.sentKeys[keyFor(item)]);

  if (!unsent.length) {
    console.log("[alert] No unsent 7-day reminders.");
    return;
  }

  const host = requireEnv("MAIL_HOST");
  const port = Number(requireEnv("MAIL_PORT"));
  const user = requireEnv("MAIL_USER");
  const pass = requireEnv("MAIL_PASSWORD");
  const from = process.env.MAIL_FROM || user;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  const { subject, text } = composeMail(unsent, baseDate);
  await transporter.sendMail({
    from,
    to: RECIPIENTS.join(","),
    subject,
    text
  });

  for (const item of unsent) {
    state.sentKeys[keyFor(item)] = {
      sentAt: new Date().toISOString(),
      recipient: RECIPIENTS
    };
  }
  await writeState(state);
  console.log(`[alert] sent ${unsent.length} reminder(s) to ${RECIPIENTS.join(", ")}`);
}

main().catch((e) => {
  console.error("[alert] fatal error:", e);
  process.exit(1);
});
