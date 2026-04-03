import { useEffect, useMemo, useState } from "react";

const REGIONS = ["전체", "과천", "분당", "서울"];
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

  const meta = useMemo(() => {
    if (!records.length) return { lastCheckedAt: "-", source: "-" };
    const first = records[0];
    return {
      lastCheckedAt: first.lastCheckedAt ?? "-",
      source: first.source ?? "-"
    };
  }, [records]);

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">KOREA HOUSING APPLICATION WATCH</p>
        <h1>과천 · 분당 · 서울 청약 접수 일정</h1>
        <p className="description">
          임박 일정은 <strong>청약 시작 7일 이내</strong> 기준으로 자동 강조됩니다.
        </p>
      </header>

      <section className="controls">
        <div className="chip-row">
          {REGIONS.map((name) => (
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
        <span>데이터 출처: {meta.source}</span>
        <span>마지막 갱신: {meta.lastCheckedAt}</span>
      </section>

      {loading && <p className="notice">일정을 불러오는 중입니다...</p>}
      {error && <p className="notice error">{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="notice">조건에 맞는 청약 일정이 없습니다.</p>
      )}

      <main className="grid">
        {filtered.map((item) => (
          <article key={item.id} className={`card ${item.status}`}>
            <div className="card-top">
              <span className={`badge ${item.status}`}>{STATUS_LABELS[item.status]}</span>
              <span className="dday">{item.dday}</span>
            </div>
            <h2>{item.name}</h2>
            <p className="sub">
              {item.region} · {item.subregion} · {item.supplyType}
            </p>
            <p className="date">
              접수 기간: {formatDate(item.applicationStartDate)} ~{" "}
              {formatDate(item.applicationEndDate)}
            </p>
            <p className="provider">공급기관: {item.provider}</p>
            <a className="link" href={item.announcementUrl} target="_blank" rel="noreferrer">
              모집공고 바로가기
            </a>
          </article>
        ))}
      </main>
    </div>
  );
}
