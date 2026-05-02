# 대한민국 분양/청약 대시보드 + 메일 알리미

과천, 분당, 서울의 청약 접수 일정을 웹 대시보드로 보여주고, 청약 시작 7일 전에 이메일 알림을 보냅니다.

## 구성

- 웹: `Vite + React` 정적 사이트 (GitHub Pages 배포)
- 데이터: 공식 사이트 페이지 파싱 후 `public/data/listings.json` 생성
- 알림: GitHub Actions 스케줄러 + SMTP 메일 발송

## 로컬 실행

```bash
npm install
npm run data:build
npm run dev
```

## 주요 스크립트

- `npm run data:build`: 공식 사이트 파싱 후 JSON 생성
- `npm run build`: 프론트 빌드
- `npm run alerts:send`: 7일 전 일정 메일 발송
- `npm run test`: 데이터/알림 로직 검증

## GitHub Actions Secrets

`send-alerts.yml`에서 아래 Secrets가 필요합니다.

- `MAIL_HOST`
- `MAIL_PORT`
- `MAIL_USER`
- `MAIL_PASSWORD`
- `MAIL_FROM` (옵션, 미설정 시 `MAIL_USER` 사용)
- `ALERT_RECIPIENTS` (옵션, 쉼표 구분 다중 수신자. 미설정 시 `MAIL_USER` 사용)

## 메일 중복 방지

`.state/sent-alerts.json` 상태 파일을 Actions 캐시로 복원/저장하여 동일 일정의 중복 발송을 방지합니다.

## 수기 데이터 병합

공식 파싱으로 누락되는 일정은 `data/manual-listings.json`의 `items` 배열에 동일 스키마로 추가하면 빌드 시 자동 병합됩니다.

추가 외부 소스 병합 파일:
- `data/r114-listings.json`
- `data/hogangnono-listings.json`
- `data/bunyang-alimi-listings.json`

위 파일들도 동일 스키마의 `items` 배열로 넣으면 자동 병합됩니다.

## 참고

공식 사이트 구조 변경 시 파서 정확도가 떨어질 수 있습니다. 파싱 결과가 없으면 기존 데이터 또는 초기 샘플 데이터를 유지하도록 설계했습니다.
