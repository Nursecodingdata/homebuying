import { useEffect, useMemo, useState } from "react";

const REGION_TABS = ["전체", "서울", "과천", "분당"];
const STATUS_LABELS = {
  all: "전체",
  open: "진행중",
  urgent: "임박",
  upcoming: "예정",
  closed: "마감"
};
const STATUS_TABS = ["all", "open", "urgent", "upcoming", "closed"];

function toDate(value) {
  return new Date(`${value}T00:00:00+09:00`);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul"
  }).format(toDate(value));
}

function diffInDays(from, to) {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function computeStatus(item, now) {
  const start = toDate(item.applicationStartDate);
  const end = toDate(item.applicationEndDate);

  if (now > end) return "closed";
  if (now >= start && now <= end) return "open";
  const days = diffInDays(now, start);
  if (days <= 7) return "urgent";
  return "upcoming";
}

function ddayLabel(item, now) {
  const start = toDate(item.applicationStartDate);
  const days = diffInDays(now, start);

  if (days > 0) return `D-${days}`;
  if (days === 0) return "D-day";
  return `D+${Math.abs(days)}`;
}

export default function App() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState("전체");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [sources, setSources] = useState([]);
  const [generatedAt, setGeneratedAt] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch("./data/listings.json", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`데이터 로딩 실패: ${response.status}`);
        }
        const payload = await response.json();
        setRecords(payload.items ?? []);
        setSources(payload.sources ?? []);
        setGeneratedAt(payload.generatedAt ?? "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "알 수 없는 오류");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const now = useMemo(() => new Date(), []);

  const hydrated = useMemo(
    () =>
      records.map((record) => ({
        ...record,
        status: computeStatus(record, now),
        dday: ddayLabel(record, now)
      })),
    [records, now]
  );

  const filtered = useMemo(
    () =>
      hydrated
        .filter((item) => (region === "전체" ? true : item.region === region))
        .filter((item) => (status === "all" ? true : item.status === status))
        .filter((item) => {
          if (!query.trim()) return true;
          const q = query.trim().toLowerCase();
          return (
            item.name.toLowerCase().includes(q) ||
            item.region.toLowerCase().includes(q) ||
            item.subregion.toLowerCase().includes(q) ||
            item.provider.toLowerCase().includes(q)
          );
        })
        .sort((a, b) => toDate(a.applicationStartDate) - toDate(b.applicationStartDate)),
    [hydrated, region, status, query]
  );

  const regions = useMemo(() => REGION_TABS, []);

  const meta = useMemo(() => {
    const fallbackSources = [...new Set(records.map((item) => item.source).filter(Boolean))];
    const sourceList = sources.length ? sources : fallbackSources;
    return {
      lastCheckedAt: generatedAt || records[0]?.lastCheckedAt || "-",
      sources: sourceList.length ? sourceList.join(", ") : "-"
    };
  }, [records, sources, generatedAt]);

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">KOREA HOUSING APPLICATION WATCH</p>
        <h1>수도권 분양일정 테이블</h1>
        <p className="description">
          종료된 일정까지 포함해 <strong>컬럼형 테이블</strong>로 전체 일정을 보여줍니다.
        </p>
      </header>

      <section className="controls">
        <div className="chip-row">
          {regions.map((name) => (
            <button
              key={name}
              className={`chip ${region === name ? "active" : ""}`}
              onClick={() => setRegion(name)}
              type="button"
            >
              {name}
            </button>
          ))}
        </div>
        <div className="chip-row">
          {STATUS_TABS.map((key) => (
            <button
              key={key}
              className={`chip secondary ${status === key ? "active" : ""}`}
              onClick={() => setStatus(key)}
              type="button"
            >
              {STATUS_LABELS[key]}
            </button>
          ))}
        </div>
        <div className="table-toolbar">
          <div className="table-search">
            <span>검색</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="단지명, 지역, 기관"
            />
          </div>
          <div className="table-count">표시: {filtered.length}건</div>
        </div>
      </section>

      <section className="meta">
        <span>전체 건수: {filtered.length}건</span>
        <span>데이터 출처: {meta.sources}</span>
        <span>마지막 갱신: {meta.lastCheckedAt}</span>
      </section>

      {loading && <p className="notice">일정을 불러오는 중입니다...</p>}
      {error && <p className="notice error">{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="notice">조건에 맞는 청약 일정이 없습니다.</p>
      )}

      <main className="table-wrap">
        <table className="schedule-table">
          <thead>
            <tr>
              <th className="col-check">
                <input type="checkbox" aria-label="select all" disabled />
              </th>
              <th>상태</th>
              <th>D-day</th>
              <th>지역</th>
              <th>세부지역</th>
              <th>단지/공고명</th>
              <th>공급유형</th>
              <th>공급기관</th>
              <th>접수 시작일</th>
              <th>접수 종료일</th>
              <th>공고 링크</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td className="col-check">
                  <input type="checkbox" aria-label={`select ${item.name}`} />
                </td>
                <td>
                  <span className={`status-pill ${item.status}`}>
                    <span className="status-dot" />
                    {STATUS_LABELS[item.status]}
                  </span>
                </td>
                <td className="mono">{item.dday}</td>
                <td>{item.region}</td>
                <td>{item.subregion}</td>
                <td className="name-cell">{item.name}</td>
                <td>{item.supplyType}</td>
                <td>{item.provider}</td>
                <td className="mono">{formatDate(item.applicationStartDate)}</td>
                <td className="mono">{formatDate(item.applicationEndDate)}</td>
                <td>
                  <a className="link" href={item.announcementUrl} target="_blank" rel="noreferrer">
                    보기
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
}
