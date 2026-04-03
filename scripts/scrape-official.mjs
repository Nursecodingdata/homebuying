import {
  buildItemId,
  classifyRegion,
  normalizeDate,
  nowKstDate,
  validateItem
} from "./lib.mjs";

const SOURCES = [
  {
    provider: "청약홈",
    source: "https://www.applyhome.co.kr",
    pageUrl: "https://www.applyhome.co.kr/co/coa/selectMainView.do",
    supplyType: "청약 접수"
  },
  {
    provider: "SH공사",
    source: "https://www.i-sh.co.kr",
    pageUrl:
      "https://www.i-sh.co.kr/app/lay2/program/S48T561C563/www/brd/m_247/list.do?multi_itm_seq=2",
    supplyType: "공공분양 청약"
  }
];

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

function extractCandidatesFromText(text) {
  const chunks = text.split(/(?=[가-힣A-Za-z0-9].{10,200}\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})/g);
  return chunks.filter((line) => {
    const region = classifyRegion(line);
    const hasDate = /(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})/.test(line);
    return !!region && hasDate;
  });
}

function parseDates(rawLine) {
  const matches = [...rawLine.matchAll(/(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})/g)].map((m) =>
    normalizeDate(m[1])
  );
  if (!matches.length) return null;
  if (matches.length === 1) return { start: matches[0], end: matches[0] };
  return { start: matches[0], end: matches[1] ?? matches[0] };
}

function deriveName(rawLine, region) {
  const compact = rawLine.replace(/\s+/g, " ").trim();
  const cut = compact.slice(0, 80);
  return `${region} ${cut}`.slice(0, 120);
}

function createItem(rawLine, sourceMeta) {
  const region = classifyRegion(rawLine);
  if (!region) return null;
  const dates = parseDates(rawLine);
  if (!dates) return null;

  const name = deriveName(rawLine, region);
  const id = buildItemId(name, dates.start, region, sourceMeta.provider);
  const now = nowKstDate();

  const item = {
    id,
    name,
    region,
    subregion: region,
    provider: sourceMeta.provider,
    supplyType: sourceMeta.supplyType,
    applicationStartDate: dates.start,
    applicationEndDate: dates.end,
    announcementUrl: sourceMeta.pageUrl,
    source: sourceMeta.source,
    lastCheckedAt: `${now} 00:00:00 KST`
  };

  return validateItem(item) ? item : null;
}

async function scrapeSource(sourceMeta) {
  const response = await fetch(sourceMeta.pageUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }
  });
  if (!response.ok) {
    throw new Error(`${sourceMeta.provider} 응답 오류: ${response.status}`);
  }

  const html = await response.text();
  const plain = stripTags(html);
  const candidates = extractCandidatesFromText(plain);
  const parsed = candidates
    .map((line) => createItem(line, sourceMeta))
    .filter(Boolean)
    .slice(0, 30);

  return parsed;
}

export async function scrapeOfficialListings() {
  const all = [];
  const logs = [];

  for (const source of SOURCES) {
    try {
      const items = await scrapeSource(source);
      all.push(...items);
      logs.push(`${source.provider}: ${items.length}건 파싱`);
    } catch (e) {
      logs.push(`${source.provider}: 실패 (${e.message})`);
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const item of all) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }

  return { items: deduped, logs };
}
