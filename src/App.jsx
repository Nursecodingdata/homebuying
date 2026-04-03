import { useEffect, useMemo, useState } from "react";

const CORE_REGIONS = ["과천", "분당", "서울"];
const STATUS_LABELS = {
  all: "전체",
  urgent: "임박",
  upcoming: "예정",
  open: "진행중",
  closed: "마감"
};

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
  const [error, setError] = useState("");

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
        .sort((a, b) => toDate(a.applicationStartDate) - toDate(b.applicationStartDate)),
    [hydrated, region, status]
  );

  const regions = useMemo(() => ["전체", ...CORE_REGIONS], []);

  const meta = useMemo(() => {
    if (!records.length) return { lastCheckedAt: "-", source: "-", generatedAt: "-" };
    const first = records[0];
    return {
      lastCheckedAt: first.lastCheckedAt ?? "-",
      source: first.source ?? "-",
      generatedAt: first.lastCheckedAt ?? "-"
    };
  }, [records]);

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">KOREA HOUSING APPLICATION WATCH</p>
        <h1>2026년 과천 · 분당 · 서울 청약 일정 테이블</h1>
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
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <button
              key={key}
              className={`chip secondary ${status === key ? "active" : ""}`}
              onClick={() => setStatus(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="meta">
        <span>전체 건수: {filtered.length}건</span>
        <span>데이터 출처: {meta.source}</span>
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
                <td>
                  <span className={`badge ${item.status}`}>{STATUS_LABELS[item.status]}</span>
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
