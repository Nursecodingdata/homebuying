export const TARGET_REGIONS = [
  { region: "과천", pattern: /과천/ },
  { region: "분당", pattern: /(분당|성남시\s*분당구)/ },
  { region: "서울", pattern: /(서울시|서울특별시|서울)/ }
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
