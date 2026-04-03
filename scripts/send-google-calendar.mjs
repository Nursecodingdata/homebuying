import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addDaysKst, nowKstDate } from "./lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_PATHS = [
  path.join(ROOT, "public", "data", "listings.json"),
  path.join(ROOT, "src", "data", "listings.json")
];
const CALENDAR_STATE_PATH = path.join(ROOT, ".state", "google-calendar-sync.json");

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
    const content = await fs.readFile(CALENDAR_STATE_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return { synced: {} };
  }
}

async function writeState(state) {
  await fs.mkdir(path.dirname(CALENDAR_STATE_PATH), { recursive: true });
  await fs.writeFile(CALENDAR_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

function eventKey(item) {
  return `${item.id}::${item.applicationStartDate}`;
}

async function fetchAccessToken(clientId, clientSecret, refreshToken) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${response.status}`);
  }
  const json = await response.json();
  if (!json.access_token) {
    throw new Error("Google token refresh response missing access_token");
  }
  return json.access_token;
}

async function findExistingEvent(accessToken, calendarId, item) {
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("privateExtendedProperty", `homebuyingId=${item.id}`);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  const json = await response.json();
  const first = json.items?.[0];
  return first?.id || null;
}

function toGoogleEvent(item) {
  return {
    summary: `[청약 접수] ${item.name}`,
    description: [
      `지역: ${item.region}/${item.subregion}`,
      `접수기간: ${item.applicationStartDate} ~ ${item.applicationEndDate}`,
      `공급기관: ${item.provider}`,
      `공급유형: ${item.supplyType}`,
      `공고: ${item.announcementUrl}`,
      `source: homebuying-dashboard`
    ].join("\n"),
    start: { date: item.applicationStartDate, timeZone: "Asia/Seoul" },
    end: { date: addDaysKst(item.applicationStartDate, 1), timeZone: "Asia/Seoul" },
    extendedProperties: {
      private: {
        homebuyingId: item.id
      }
    }
  };
}

async function createOrUpdateEvent(accessToken, calendarId, item) {
  const payload = toGoogleEvent(item);
  const existingId = await findExistingEvent(accessToken, calendarId, item);
  const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

  if (!existingId) {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`Google calendar insert failed: ${response.status}`);
    }
    return "created";
  }

  const response = await fetch(`${baseUrl}/${encodeURIComponent(existingId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Google calendar patch failed: ${response.status}`);
  }
  return "updated";
}

async function main() {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
  const refreshToken = requireEnv("GOOGLE_REFRESH_TOKEN");
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const dryRun = process.env.GOOGLE_CALENDAR_DRY_RUN === "1";

  const listings = await readListings();
  if (!listings.length) {
    console.warn("[calendar] No listings found. Skip sync.");
    return;
  }

  const state = await readState();
  const accessToken = dryRun
    ? "dry-run"
    : await fetchAccessToken(clientId, clientSecret, refreshToken);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of listings) {
    const key = eventKey(item);
    if (dryRun) {
      if (!state.synced[key]) created += 1;
      else updated += 1;
      state.synced[key] = { syncedAt: new Date().toISOString(), mode: "dry-run" };
      continue;
    }

    try {
      const action = await createOrUpdateEvent(accessToken, calendarId, item);
      if (action === "created") created += 1;
      else updated += 1;
      state.synced[key] = {
        syncedAt: new Date().toISOString(),
        calendarId,
        applicationStartDate: item.applicationStartDate
      };
    } catch (e) {
      skipped += 1;
      console.warn(`[calendar] skip ${item.id}: ${e.message}`);
    }
  }

  await writeState(state);
  console.log(
    `[calendar] synced ${listings.length} items (created=${created}, updated=${updated}, skipped=${skipped}, dryRun=${dryRun ? "yes" : "no"}, date=${nowKstDate()})`
  );
}

main().catch((e) => {
  console.error("[calendar] fatal error:", e);
  process.exit(1);
});
