import {
  buildItemId,
  classifyRegionBroad,
  normalizeDate,
  nowKstDate,
  validateItem
} from "./lib.mjs";

const TARGET_YEAR = Number(process.env.TARGET_YEAR || "2026");

const SH_BOARD_SOURCES = [
  {
    provider: "SH공사-주택분양",
    source: "https://www.i-sh.co.kr",
    boardPath: "m_244",
    multiItmSeq: 1,
    supplyType: "주택분양 공고",
    defaultRegion: "서울"
  },
  {
    provider: "SH공사-주택임대",
    source: "https://www.i-sh.co.kr",
    boardPath: "m_247",
    multiItmSeq: 2,
    supplyType: "주택임대 공고",
    defaultRegion: "서울"
  },
  {
    provider: "SH공사-토지",
    source: "https://www.i-sh.co.kr",
    boardPath: "m_255",
    multiItmSeq: 8,
    supplyType: "토지 공고",
    defaultRegion: "서울"
  },
  {
    provider: "SH공사-상가/공장",
    source: "https://www.i-sh.co.kr",
    boardPath: "m_256",
    multiItmSeq: 16,
    supplyType: "상가/공장 공고",
    defaultRegion: "서울"
  }
];

const SOURCES = [
  ...SH_BOARD_SOURCES.map((cfg) => ({
    ...cfg,
    parser: "sh-board",
    pageUrls: Array.from({ length: 10 }, (_, index) => {
      const page = index + 1;
      return `https://www.i-sh.co.kr/app/lay2/program/S48T561C563/www/brd/${cfg.boardPath}/list.do?multi_itm_seq=${cfg.multiItmSeq}&page=${page}`;
    })
  })),
  {
    provider: "LH청약센터",
    source: "https://apply.lh.or.kr",
    parser: "generic",
    supplyType: "공공분양 청약",
    pageUrls: [
      "https://apply.lh.or.kr/lhapply/apply/wrtanc/selectWrtancList.do"
    ]
  },
  {
    provider: "마이홈",
    source: "https://www.myhome.go.kr",
    parser: "generic",
    supplyType: "청약 접수",
    pageUrls: [
      "https://www.myhome.go.kr/hws/portal/schd/schd/selectRsdtRcritNtcListView.do"
    ]
  }
];

function stripTagsAndScripts(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

function extractCandidatesFromText(text) {
  const chunks = text.split(/(?=[가-힣A-Za-z0-9].{10,220}\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})/g);
  return chunks.filter((line) => {
    const region = classifyRegionBroad(line);
    const hasDate = /(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})/.test(line);
    return !!region && region !== "기타" && hasDate;
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
  const cut = compact.slice(0, 90);
  return `${region} ${cut}`.slice(0, 120);
}

function createItem(rawLine, sourceMeta, regionOverride = null, urlOverride = null) {
  const region = classifyRegionBroad(rawLine);
  const finalRegion = regionOverride || (region === "기타" ? sourceMeta.defaultRegion || "기타" : region);
  if (finalRegion === "기타") return null;
  const dates = parseDates(rawLine);
  if (!dates) return null;
  if (!dates.start.startsWith(`${TARGET_YEAR}`) && !dates.end.startsWith(`${TARGET_YEAR}`)) {
    return null;
  }

  const name = deriveName(rawLine, finalRegion);
  const id = buildItemId(name, dates.start, finalRegion, sourceMeta.provider);
  const now = nowKstDate();

  const item = {
    id,
    name,
    region: finalRegion,
    subregion: finalRegion,
    provider: sourceMeta.provider,
    supplyType: sourceMeta.supplyType,
    applicationStartDate: dates.start,
    applicationEndDate: dates.end,
    announcementUrl: urlOverride || sourceMeta.announcementUrl || sourceMeta.source,
    source: sourceMeta.source,
    lastCheckedAt: `${now} 00:00:00 KST`
  };

  return validateItem(item) ? item : null;
}

function cleanText(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTagsOnly(html) {
  return html.replace(/<[^>]*>/g, " ");
}

function parseShBoardItems(html, sourceMeta) {
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return [];

  const rows = tbodyMatch[1].match(/<tr>[\s\S]*?<\/tr>/gi) || [];
  const items = [];

  for (const row of rows) {
    const cols = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      cleanText(stripTagsOnly(m[1]))
    );
    if (cols.length < 4) continue;

    const titleCellHtml = (row.match(/<td class="txtL">([\s\S]*?)<\/td>/i) || [])[1] || "";
    const title = cleanText(stripTagsOnly(titleCellHtml));
    const seq = (row.match(/getDetailView\('(\d+)'\)/) || [])[1] || "";
    const registeredDate = cols.find((col) => /^\d{4}-\d{2}-\d{2}$/.test(col)) || "";
    if (!title || !registeredDate) continue;
    if (!registeredDate.startsWith(`${TARGET_YEAR}`)) continue;

    const detailUrl = seq
      ? `https://www.i-sh.co.kr/app/lay2/program/S48T561C563/www/brd/${sourceMeta.boardPath}/view.do?multi_itm_seq=${sourceMeta.multiItmSeq}&seq=${seq}`
      : sourceMeta.source;

    const detectedRegion = classifyRegionBroad(title);
    const region = detectedRegion === "기타" ? sourceMeta.defaultRegion || "서울" : detectedRegion;
    const rawLine = `${sourceMeta.defaultRegion || ""} ${title} ${registeredDate}`;
    const built = createItem(rawLine, sourceMeta, region, detailUrl);
    if (!built) continue;
    built.name = title;
    built.applicationStartDate = registeredDate;
    built.applicationEndDate = registeredDate;
    built.subregion = region;
    items.push(built);
  }

  return items;
}

async function scrapePage(url, sourceMeta) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }
  });
  if (!response.ok) {
    throw new Error(`${sourceMeta.provider} 응답 오류: ${response.status}`);
  }
  const html = await response.text();
  if (sourceMeta.parser === "sh-board") {
    return parseShBoardItems(html, sourceMeta);
  }

  const plain = stripTagsAndScripts(html)
    .replace(/\s+/g, " ")
    .trim();
  const candidates = extractCandidatesFromText(plain);
  return candidates.map((line) => createItem(line, sourceMeta)).filter(Boolean);
}

async function scrapeSource(sourceMeta) {
  const all = [];
  const pageLogs = [];
  for (const pageUrl of sourceMeta.pageUrls) {
    try {
      const items = await scrapePage(pageUrl, sourceMeta);
      all.push(...items);
      pageLogs.push(`ok:${items.length}`);
    } catch (e) {
      pageLogs.push(`fail:${e.message}`);
    }
  }
  return { items: all, pageLogs };
}

export async function scrapeOfficialListings() {
  const all = [];
  const logs = [];

  for (const source of SOURCES) {
    try {
      const { items, pageLogs } = await scrapeSource(source);
      all.push(...items);
      logs.push(`${source.provider}: ${items.length}건 파싱 (${pageLogs.join(", ")})`);
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
