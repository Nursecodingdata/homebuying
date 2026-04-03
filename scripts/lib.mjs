export const TARGET_REGIONS = [
  { region: "과천", pattern: /과천/ },
  { region: "분당", pattern: /(분당|성남시\s*분당구)/ },
  { region: "서울", pattern: /(서울시|서울특별시|서울)/ }
];

export const KOREA_REGIONS = [
  { region: "서울", pattern: /(서울시|서울특별시|서울)/ },
  { region: "경기", pattern: /(경기도|경기)/ },
  { region: "인천", pattern: /(인천시|인천광역시|인천)/ },
  { region: "부산", pattern: /(부산시|부산광역시|부산)/ },
  { region: "대구", pattern: /(대구시|대구광역시|대구)/ },
  { region: "광주", pattern: /(광주시|광주광역시|광주)/ },
  { region: "대전", pattern: /(대전시|대전광역시|대전)/ },
  { region: "울산", pattern: /(울산시|울산광역시|울산)/ },
  { region: "세종", pattern: /(세종시|세종특별자치시|세종)/ },
  { region: "강원", pattern: /(강원도|강원특별자치도|강원)/ },
  { region: "충북", pattern: /(충청북도|충북)/ },
  { region: "충남", pattern: /(충청남도|충남)/ },
  { region: "전북", pattern: /(전라북도|전북특별자치도|전북)/ },
  { region: "전남", pattern: /(전라남도|전남)/ },
  { region: "경북", pattern: /(경상북도|경북)/ },
  { region: "경남", pattern: /(경상남도|경남)/ },
  { region: "제주", pattern: /(제주도|제주특별자치도|제주)/ },
  { region: "과천", pattern: /과천/ },
  { region: "분당", pattern: /(분당|성남시\s*분당구)/ }
];

export function nowKstDate() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(now);
}

export function addDaysKst(dateStr, days) {
  const base = new Date(`${dateStr}T00:00:00+09:00`);
  base.setDate(base.getDate() + days);
  return formatDate(base);
}

export function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeDate(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  const m = value.match(/(\d{4})[.\-/ ](\d{1,2})[.\-/ ](\d{1,2})/);
  if (!m) return null;
  const yyyy = m[1];
  const mm = m[2].padStart(2, "0");
  const dd = m[3].padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function classifyRegion(text) {
  for (const target of TARGET_REGIONS) {
    if (target.pattern.test(text)) return target.region;
  }
  return null;
}

export function classifyRegionBroad(text) {
  for (const target of KOREA_REGIONS) {
    if (target.pattern.test(text)) return target.region;
  }
  return "기타";
}

export function buildItemId(name, startDate, region, provider) {
  const key = [name, startDate, region, provider].join("|");
  return key
    .toLowerCase()
    .replace(/[^a-z0-9|가-힣]/g, "")
    .replace(/\|+/g, "-");
}

export function validateItem(raw) {
  const required = [
    "id",
    "name",
    "region",
    "subregion",
    "provider",
    "supplyType",
    "applicationStartDate",
    "applicationEndDate",
    "announcementUrl",
    "source",
    "lastCheckedAt"
  ];
  return required.every((key) => !!raw[key]);
}
