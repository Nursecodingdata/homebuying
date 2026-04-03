import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addDaysKst, nowKstDate, validateItem, buildItemId } from "./lib.mjs";
import { scrapeOfficialListings } from "./scrape-official.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DATA_PATH = path.join(ROOT, "public", "data", "listings.json");
const SRC_DATA_PATH = path.join(ROOT, "src", "data", "listings.json");

async function ensureDir() {
  await fs.mkdir(path.dirname(PUBLIC_DATA_PATH), { recursive: true });
  await fs.mkdir(path.dirname(SRC_DATA_PATH), { recursive: true });
}

async function readExistingData() {
  try {
    const content = await fs.readFile(SRC_DATA_PATH, "utf-8");
    const json = JSON.parse(content);
    return Array.isArray(json.items) ? json.items : [];
  } catch {
    return [];
  }
}

function buildFallbackSeed() {
  const today = nowKstDate();
  const checked = `${today} 00:00:00 KST`;

  const base = [
    {
      name: "과천 지식정보타운 공공분양",
      region: "과천",
      subregion: "과천",
      provider: "LH",
      supplyType: "청약 접수",
      applicationStartDate: addDaysKst(today, 8),
      applicationEndDate: addDaysKst(today, 10),
      announcementUrl: "https://apply.lh.or.kr/",
      source: "https://apply.lh.or.kr/"
    },
    {
      name: "분당(성남시 분당구) 민간분양",
      region: "분당",
      subregion: "성남시 분당구",
      provider: "청약홈",
      supplyType: "청약 접수",
      applicationStartDate: addDaysKst(today, 14),
      applicationEndDate: addDaysKst(today, 15),
      announcementUrl: "https://www.applyhome.co.kr/",
      source: "https://www.applyhome.co.kr/"
    },
    {
      name: "서울 공공분양 사전청약",
      region: "서울",
      subregion: "서울특별시",
      provider: "SH공사",
      supplyType: "청약 접수",
      applicationStartDate: addDaysKst(today, 21),
      applicationEndDate: addDaysKst(today, 23),
      announcementUrl:
        "https://www.i-sh.co.kr/app/lay2/program/S48T561C563/www/brd/m_247/list.do?multi_itm_seq=2",
      source: "https://www.i-sh.co.kr/"
    }
  ];

  return base.map((item) => ({
    ...item,
    id: buildItemId(item.name, item.applicationStartDate, item.region, item.provider),
    lastCheckedAt: checked
  }));
}

function toPayload(items, logs) {
  const now = nowKstDate();
  return {
    generatedAt: `${now} 00:00:00 KST`,
    itemCount: items.length,
    logs,
    items: items.sort(
      (a, b) => new Date(`${a.applicationStartDate}T00:00:00+09:00`) - new Date(`${b.applicationStartDate}T00:00:00+09:00`)
    )
  };
}

async function writePayload(payload) {
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.writeFile(PUBLIC_DATA_PATH, text, "utf-8");
  await fs.writeFile(SRC_DATA_PATH, text, "utf-8");
}

async function main() {
  await ensureDir();

  const existing = await readExistingData();
  const { items: scraped, logs } = await scrapeOfficialListings();
  const validScraped = scraped.filter(validateItem);

  if (validScraped.length) {
    const payload = toPayload(validScraped, [...logs, "공식 사이트 파싱 데이터 사용"]);
    await writePayload(payload);
    console.log(`[data] success: ${validScraped.length} items`);
    return;
  }

  if (existing.length) {
    const payload = toPayload(existing, [...logs, "공식 파싱 데이터가 없어 기존 데이터 유지"]);
    await writePayload(payload);
    console.warn("[data] fallback: kept existing listings");
    return;
  }

  const seeded = buildFallbackSeed();
  const payload = toPayload(seeded, [...logs, "공식 파싱/기존 데이터 없음 - 초기 샘플 데이터 사용"]);
  await writePayload(payload);
  console.warn("[data] fallback: seeded sample data");
}

main().catch((e) => {
  console.error("[data] fatal error:", e);
  process.exit(1);
});
