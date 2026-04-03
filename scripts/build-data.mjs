import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addDaysKst, nowKstDate, validateItem, buildItemId, inferSubregion } from "./lib.mjs";
import { scrapeOfficialListings } from "./scrape-official.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DATA_PATH = path.join(ROOT, "public", "data", "listings.json");
const SRC_DATA_PATH = path.join(ROOT, "src", "data", "listings.json");
const MANUAL_DATA_PATH = path.join(ROOT, "data", "manual-listings.json");
const R114_DATA_PATH = path.join(ROOT, "data", "r114-listings.json");
const HOGANGNONO_DATA_PATH = path.join(ROOT, "data", "hogangnono-listings.json");
const BUNYANG_ALIMI_DATA_PATH = path.join(ROOT, "data", "bunyang-alimi-listings.json");
const TARGET_YEAR = String(process.env.TARGET_YEAR || "2026");
const TARGET_REGIONS = new Set(["과천", "분당", "서울"]);
const SALE_ONLY_INCLUDE_REGEX =
  /(주택분양|분양주택|공공분양|민간분양|신혼희망타운|APT\s*분양정보|아파트|APT)/i;
const SALE_ONLY_EXCLUDE_REGEX =
  /(임대|오피스텔|생활숙박|생숙|도시형|토지|상가|공장|보도자료|당첨|발표|계약|공지|입찰|분양권|공급계획|잔여세대)/i;

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

async function readManualData() {
  try {
    const content = await fs.readFile(MANUAL_DATA_PATH, "utf-8");
    const json = JSON.parse(content);
    return Array.isArray(json.items) ? json.items : [];
  } catch {
    return [];
  }
}

async function readExtraSourceData() {
  const files = [R114_DATA_PATH, HOGANGNONO_DATA_PATH, BUNYANG_ALIMI_DATA_PATH];
  const all = [];
  for (const file of files) {
    try {
      const content = await fs.readFile(file, "utf-8");
      const json = JSON.parse(content);
      if (Array.isArray(json.items)) {
        all.push(...json.items);
      }
    } catch {
      continue;
    }
  }
  return all;
}

function buildFallbackSeed() {
  const checked = `${nowKstDate()} 00:00:00 KST`;

  const base = [
    {
      name: "서울 공공분양 사전청약(샘플)",
      region: "서울",
      subregion: "서울특별시",
      provider: "SH공사",
      supplyType: "청약 접수",
      applicationStartDate: `${TARGET_YEAR}-01-15`,
      applicationEndDate: `${TARGET_YEAR}-01-17`,
      announcementUrl:
        "https://www.i-sh.co.kr/app/lay2/program/S48T561C563/www/brd/m_247/list.do?multi_itm_seq=2",
      source: "fallback-seed"
    },
    {
      name: "과천 공공분양 청약(샘플)",
      region: "과천",
      subregion: "과천",
      provider: "LH",
      supplyType: "청약 접수",
      applicationStartDate: `${TARGET_YEAR}-05-08`,
      applicationEndDate: `${TARGET_YEAR}-05-10`,
      announcementUrl: "https://apply.lh.or.kr/",
      source: "fallback-seed"
    },
    {
      name: "분당(성남시 분당구) 민간분양(샘플)",
      region: "분당",
      subregion: "성남시 분당구",
      provider: "청약홈",
      supplyType: "청약 접수",
      applicationStartDate: `${TARGET_YEAR}-09-20`,
      applicationEndDate: `${TARGET_YEAR}-09-22`,
      announcementUrl: "https://www.applyhome.co.kr/",
      source: "fallback-seed"
    }
  ];

  return base.map((item) => ({
    ...item,
    id: buildItemId(item.name, item.applicationStartDate, item.region, item.provider),
    lastCheckedAt: checked
  }));
}

function keepTargetYear(items) {
  return items.filter(
    (item) =>
      String(item.applicationStartDate || "").startsWith(TARGET_YEAR) ||
      String(item.applicationEndDate || "").startsWith(TARGET_YEAR)
  );
}

function keepTargetRegions(items) {
  return items.filter((item) => TARGET_REGIONS.has(item.region));
}

function keepCheongyakOnly(items) {
  return items.filter((item) => {
    const text = `${item.name} ${item.supplyType} ${item.provider}`.trim();
    if (!SALE_ONLY_INCLUDE_REGEX.test(text)) return false;
    if (SALE_ONLY_EXCLUDE_REGEX.test(text)) return false;
    return true;
  });
}

function dedupeById(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    output.push(item);
  }
  return output;
}

function normalizeSubregions(items) {
  return items.map((item) => {
    const inferred = inferSubregion(
      `${item.region || ""} ${item.subregion || ""} ${item.name || ""} ${item.supplyType || ""}`,
      item.region
    );
    return {
      ...item,
      subregion: inferred
    };
  });
}

function toPayload(items, logs, sources) {
  const now = nowKstDate();
  return {
    generatedAt: `${now} 00:00:00 KST`,
    itemCount: items.length,
    logs,
    sources: sources ? Array.from(new Set(sources)) : [],
    items: items.sort(
      (a, b) => new Date(`${a.applicationStartDate}T00:00:00+09:00`) - new Date(`${b.applicationStartDate}T00:00:00+09:00`)
    )
  };
}

function withForcedTestItem(items, logs) {
  if (process.env.ALERT_TEST_FORCE_ITEM !== "1") {
    return { items, logs };
  }

  const today = nowKstDate();
  const start = addDaysKst(today, 7);
  const end = addDaysKst(today, 8);
  const name = "[TEST] 서울 알림 검증용 일정";
  const provider = "TEST";
  const region = "서울";
  const forced = {
    id: buildItemId(name, start, region, provider),
    name,
    region,
    subregion: "서울특별시",
    provider,
    supplyType: "청약 접수",
    applicationStartDate: start,
    applicationEndDate: end,
    announcementUrl: "https://github.com/Nursecodingdata/homebuying",
    source: "forced-test-item",
    lastCheckedAt: `${today} 00:00:00 KST`
  };
  return {
    items: [forced, ...items.filter((item) => item.id !== forced.id)],
    logs: [...logs, "ALERT_TEST_FORCE_ITEM=1 - 7일 후 테스트 일정 1건 추가"]
  };
}

async function writePayload(payload) {
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.writeFile(PUBLIC_DATA_PATH, text, "utf-8");
  await fs.writeFile(SRC_DATA_PATH, text, "utf-8");
}

async function main() {
  await ensureDir();

  const existing = keepCheongyakOnly(
    keepTargetRegions(keepTargetYear(await readExistingData()))
  );
  const manual = keepCheongyakOnly(
    keepTargetRegions(keepTargetYear(await readManualData())).filter(validateItem)
  );
  const extras = keepCheongyakOnly(
    keepTargetRegions(keepTargetYear(await readExtraSourceData())).filter(validateItem)
  );
  const { items: scraped, logs, sources: officialSources } = await scrapeOfficialListings();
  const validScraped = keepCheongyakOnly(
    keepTargetRegions(keepTargetYear(scraped.filter(validateItem)))
  );
  const mergedSources = [
    ...(officialSources || []),
    ...existing.map((item) => item.source),
    ...manual.map((item) => item.source),
    ...extras.map((item) => item.source)
  ].filter(Boolean);

  if (validScraped.length) {
    const merged = normalizeSubregions(dedupeById([...validScraped, ...manual, ...extras, ...existing]));
    const maybeForced = withForcedTestItem(merged, [
      ...logs,
      `수기 병합 건수=${manual.length}`,
      `외부 소스 병합 건수=${extras.length}`,
      `주택분양/분양주택 필터 적용 (INCLUDE=${SALE_ONLY_INCLUDE_REGEX}, EXCLUDE=${SALE_ONLY_EXCLUDE_REGEX})`,
      `공식 사이트 파싱 + 기존 데이터 병합 (TARGET_YEAR=${TARGET_YEAR}, TARGET_REGIONS=${[
        ...TARGET_REGIONS
      ].join("/")})`
    ]);
    const payload = toPayload(maybeForced.items, maybeForced.logs, mergedSources);
    await writePayload(payload);
    console.log(`[data] success: ${payload.itemCount} items`);
    return;
  }

  if (existing.length || manual.length || extras.length) {
    const merged = normalizeSubregions(dedupeById([...manual, ...extras, ...existing]));
    const maybeForced = withForcedTestItem(merged, [
      ...logs,
      `수기 병합 건수=${manual.length}`,
      `외부 소스 병합 건수=${extras.length}`,
      `주택분양/분양주택 필터 적용 (INCLUDE=${SALE_ONLY_INCLUDE_REGEX}, EXCLUDE=${SALE_ONLY_EXCLUDE_REGEX})`,
      `공식 파싱 데이터가 없어 기존 데이터 유지 (TARGET_YEAR=${TARGET_YEAR}, TARGET_REGIONS=${[
        ...TARGET_REGIONS
      ].join("/")})`
    ]);
    const payload = toPayload(maybeForced.items, maybeForced.logs, mergedSources);
    await writePayload(payload);
    console.warn("[data] fallback: kept existing listings");
    return;
  }

  const seeded = normalizeSubregions(buildFallbackSeed());
  const maybeForced = withForcedTestItem(seeded, [
    ...logs,
    `공식 파싱/기존 데이터 없음 - 초기 샘플 데이터 사용 (TARGET_YEAR=${TARGET_YEAR}, TARGET_REGIONS=${[
      ...TARGET_REGIONS
    ].join("/")})`
  ]);
  const payload = toPayload(maybeForced.items, maybeForced.logs, mergedSources);
  await writePayload(payload);
  console.warn("[data] fallback: seeded sample data");
}

main().catch((e) => {
  console.error("[data] fatal error:", e);
  process.exit(1);
});
