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

const LH_BOARD_SOURCES = [
  {
    provider: "LH청약플러스-임대",
    source: "https://apply.lh.or.kr",
    parser: "lh-board",
    supplyType: "임대주택 공고",
    listUrl: "https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do?mi=1026",
    pageUrls: [
      "https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do?mi=1026"
    ],
    mi: "1026"
  },
  {
    provider: "LH청약플러스-분양",
    source: "https://apply.lh.or.kr",
    parser: "lh-board",
    supplyType: "분양주택 공고",
    listUrl: "https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do?mi=1027",
    pageUrls: [
      "https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do?mi=1027"
    ],
    mi: "1027"
  }
];

const SOURCES = [
  {
    provider: "청약홈-APT",
    source: "https://www.applyhome.co.kr",
    parser: "applyhome-list",
    supplyType: "APT 분양정보",
    listUrl: "https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancListView.do",
    pageUrls: Array.from({ length: 30 }, (_, index) => {
      const page = index + 1;
      return `https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancListView.do?beginPd=${TARGET_YEAR}01&endPd=${TARGET_YEAR}12&pageIndex=${page}`;
    })
  },
  {
    provider: "청약홈-기타유형",
    source: "https://www.applyhome.co.kr",
    parser: "applyhome-list",
    supplyType: "오피스텔/생숙/도시형/민간임대",
    listUrl: "https://www.applyhome.co.kr/ai/aia/selectOtherLttotPblancListView.do",
    pageUrls: Array.from({ length: 20 }, (_, index) => {
      const page = index + 1;
      return `https://www.applyhome.co.kr/ai/aia/selectOtherLttotPblancListView.do?beginPd=${TARGET_YEAR}01&endPd=${TARGET_YEAR}12&pageIndex=${page}`;
    })
  },
  {
    provider: "청약홈-APT잔여세대",
    source: "https://www.applyhome.co.kr",
    parser: "applyhome-list",
    supplyType: "APT 잔여세대",
    listUrl: "https://www.applyhome.co.kr/ai/aia/selectAPTRemndrLttotPblancListView.do",
    pageUrls: Array.from({ length: 12 }, (_, index) => {
      const page = index + 1;
      return `https://www.applyhome.co.kr/ai/aia/selectAPTRemndrLttotPblancListView.do?beginPd=${TARGET_YEAR}01&endPd=${TARGET_YEAR}12&pageIndex=${page}`;
    })
  },
  ...SH_BOARD_SOURCES.map((cfg) => ({
    ...cfg,
    parser: "sh-board",
    pageUrls: Array.from({ length: 10 }, (_, index) => {
      const page = index + 1;
      return `https://www.i-sh.co.kr/app/lay2/program/S48T561C563/www/brd/${cfg.boardPath}/list.do?multi_itm_seq=${cfg.multiItmSeq}&page=${page}`;
    })
  })),
  ...LH_BOARD_SOURCES
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

function resolveCoreRegion(regionCell, title) {
  if (/과천/.test(title) || /과천/.test(regionCell)) return "과천";
  if (/(분당|성남시\s*분당구)/.test(title) || /(분당|성남시\s*분당구)/.test(regionCell)) return "분당";
  if (/서울/.test(regionCell) || /서울/.test(title)) return "서울";
  return null;
}

function parseDateRange(raw) {
  const matches = [...raw.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
  if (!matches.length) return null;
  if (matches.length === 1) return { start: matches[0], end: matches[0] };
  return { start: matches[0], end: matches[1] };
}

function parseApplyhomeListItems(html, sourceMeta) {
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return [];
  const rows = tbodyMatch[1].match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const now = nowKstDate();
  const items = [];

  for (const row of rows) {
    const cols = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      cleanText(stripTagsOnly(m[1]))
    );
    if (cols.length < 8) continue;

    const titleMatch = row.match(/class="txt_l_b"[^>]*><b>([\s\S]*?)<\/b>/i);
    const title = cleanText(stripTagsOnly(titleMatch ? titleMatch[1] : cols[3] || ""));
    if (!title) continue;

    const regionCell = cols[0] || "";
    const region = resolveCoreRegion(regionCell, title);
    if (!region) continue;

    const noticeDate = normalizeDate(cols[6] || "");
    const period = parseDateRange(cols[7] || "");
    const startDate = period?.start || noticeDate;
    const endDate = period?.end || noticeDate;
    if (!startDate || !endDate) continue;
    if (!startDate.startsWith(`${TARGET_YEAR}`) && !endDate.startsWith(`${TARGET_YEAR}`)) continue;

    const rowAttr = row.match(/data-pbno="(\d+)".*data-hmno="(\d+)"/);
    const pbno = rowAttr ? rowAttr[1] : "";
    const hmno = rowAttr ? rowAttr[2] : "";
    const announcementUrl =
      pbno && hmno
        ? `${sourceMeta.listUrl}?pblancNo=${pbno}&houseManageNo=${hmno}`
        : sourceMeta.listUrl;
    const id = buildItemId(title, startDate, region, sourceMeta.provider);

    const item = {
      id,
      name: title,
      region,
      subregion: region,
      provider: sourceMeta.provider,
      supplyType: cols[2] || sourceMeta.supplyType,
      applicationStartDate: startDate,
      applicationEndDate: endDate,
      announcementUrl,
      source: sourceMeta.source,
      lastCheckedAt: `${now} 00:00:00 KST`
    };
    if (validateItem(item)) items.push(item);
  }
  return items;
}

function sanitizeLhTitle(title) {
  return title.replace(/\s*\d+일전$/g, "").replace(/\s*new$/gi, "").trim();
}

function parseLhBoardItems(html, sourceMeta) {
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return [];
  const rows = tbodyMatch[1].match(/<tr>[\s\S]*?<\/tr>/gi) || [];
  const now = nowKstDate();
  const items = [];

  for (const row of rows) {
    const cols = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      cleanText(stripTagsOnly(m[1]))
    );
    if (cols.length < 7) continue;

    const titleCellHtml =
      (row.match(/<td[^>]*class="[^"]*bbs_tit[^"]*"[^>]*>([\s\S]*?)<\/td>/i) || [])[1] || "";
    let title = cleanText(stripTagsOnly(titleCellHtml));
    title = sanitizeLhTitle(title);
    if (!title) continue;

    const regionCell = cols[3] || "";
    const region = resolveCoreRegion(regionCell, title);
    if (!region) continue;

    const postedDate = normalizeDate(cols[5] || "");
    const closeDate = normalizeDate(cols[6] || "") || postedDate;
    if (!postedDate) continue;
    if (!postedDate.startsWith(`${TARGET_YEAR}`) && !String(closeDate || "").startsWith(`${TARGET_YEAR}`)) {
      continue;
    }

    const linkMatch = row.match(
      /class="wrtancInfoBtn"[^>]*data-id1="([^"]+)"[^>]*data-id2="([^"]+)"[^>]*data-id3="([^"]+)"[^>]*data-id4="([^"]+)"/
    );
    let announcementUrl = sourceMeta.listUrl;
    if (linkMatch) {
      const [, panId, ccrCnntSysDsCd, uppAisTpCd, aisTpCd] = linkMatch;
      announcementUrl = `https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=${panId}&ccrCnntSysDsCd=${ccrCnntSysDsCd}&uppAisTpCd=${uppAisTpCd}&aisTpCd=${aisTpCd}&mi=${sourceMeta.mi || ""}`;
    }

    const id = buildItemId(title, postedDate, region, sourceMeta.provider);
    const item = {
      id,
      name: title,
      region,
      subregion: region,
      provider: sourceMeta.provider,
      supplyType: cols[1] || sourceMeta.supplyType,
      applicationStartDate: postedDate,
      applicationEndDate: closeDate,
      announcementUrl,
      source: sourceMeta.source,
      lastCheckedAt: `${now} 00:00:00 KST`
    };
    if (validateItem(item)) items.push(item);
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
  if (sourceMeta.parser === "applyhome-list") {
    return parseApplyhomeListItems(html, sourceMeta);
  }
  if (sourceMeta.parser === "lh-board") {
    return parseLhBoardItems(html, sourceMeta);
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
  let emptyStreak = 0;
  for (const pageUrl of sourceMeta.pageUrls) {
    try {
      const items = await scrapePage(pageUrl, sourceMeta);
      all.push(...items);
      pageLogs.push(`ok:${items.length}`);
      if (items.length === 0) {
        emptyStreak += 1;
      } else {
        emptyStreak = 0;
      }
      if ((sourceMeta.parser === "applyhome-list" || sourceMeta.parser === "sh-board") && emptyStreak >= 2) {
        pageLogs.push("early-stop:empty-streak");
        break;
      }
    } catch (e) {
      pageLogs.push(`fail:${e.message}`);
      emptyStreak += 1;
      if ((sourceMeta.parser === "applyhome-list" || sourceMeta.parser === "sh-board") && emptyStreak >= 2) {
        pageLogs.push("early-stop:error-streak");
        break;
      }
    }
  }
  return { items: all, pageLogs };
}

const OFFICIAL_SOURCE_LIST = [...new Set(SOURCES.map((source) => source.source))];

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

  return { items: deduped, logs, sources: OFFICIAL_SOURCE_LIST };
}
