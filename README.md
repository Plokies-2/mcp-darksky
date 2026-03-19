# mcp-darksky

한국의 밤하늘 촬영 조건을 점수화해 주는 MCP 서버입니다.

이 프로젝트는 단순히 "오늘 밤 별 보일까?"만 답하는 도구가 아니라,
`구름`, `달빛`, `대기 투명도`, `결로 위험`, `광공해`, `은하수/딥스카이 적합성`을 함께 계산해서
AI가 초보자에게도 쉽게 설명할 수 있도록 구조화된 JSON을 돌려주는 것을 목표로 합니다.

## 이 MCP로 할 수 있는 일

- 오늘 밤 별 사진 출사가 괜찮은지 판단
- 몇 시부터 몇 시까지가 가장 좋은지 확인
- 은하수 촬영에 적합한지 확인
- 딥스카이 촬영에 적합한지 확인
- 결로 위험, 달빛 간섭, 미세먼지/연무, 바람 문제 파악
- 장소 이름으로 바로 조회
- 한국 내 광해 수준과 추정 Bortle-like 등급 확인
- 먼 날짜는 과도한 정밀도를 피하고 `outlook` 모드로 단순화

## 누가 쓰면 좋은가

### 1. 일반 사용자 / 초보자

예를 들어 이런 질문에 잘 맞습니다.

- `내일 안반데기마을에서 별사진 찍어도 될까?`
- `오늘 서울 근교에서 출사 가도 돼?`
- `몇 시가 제일 좋아?`

이 경우 AI는 MCP 결과를 읽고 다음처럼 설명할 수 있습니다.

- 오늘은 가도 되는 밤인지
- 가장 좋은 시간대는 언제인지
- 왜 점수가 깎였는지
- 초보자도 무난한지

### 2. 숙련자

예를 들어 이런 용도에 잘 맞습니다.

- 광각 은하수 / 광각 별풍경 / broadband 딥스카이 / narrowband 딥스카이 / star trail 모드 비교
- 타깃 고도와 moon separation 확인
- 시간대별 점수 흐름 확인
- 밤 전체가 아니라 "언제" 좋아지는지 판단

## 제공 기능

### 핵심 점수

- `overall_score`
- `cloud_score`
- `transparency_score`
- `darkness_score`
- `dew_risk_score`
- `stability_score`
- `mode_score`

### 시간 흐름

- `score_curve`
- `blocker_timeline`
- `window_rankings`
- `curve_summary`

즉 이 MCP는 밤 전체를 한 점수로만 보지 않고,
`시간대별로 언제 좋아지고 언제 나빠지는지`도 같이 돌려줍니다.

### 파생 판단

- `best_window`
- `mode_best_window`
- `go_no_go`
- `dew_heater_needed`
- `milky_way_ready`
- `deep_sky_ready`
- `beginner_safe`
- `confidence`

### 천문 관련

- 천문박명 / 천문밤 계산
- 달 고도 / 달 조도 / 달 간섭
- 은하수 중심부 가시성
- 타깃 고도 / airmass
- moon-target separation

### 광해 추정

로컬 Black Marble 데이터를 이용해:

- `estimated_bortle_center`
- `estimated_bortle_range`
- `estimated_bortle_band`
- `equivalent_zenith_brightness_mpsas`
- 한국 내 밝기 / 어두움 percentile

을 계산합니다.

## 입력 방식

### 1. 좌표 입력

- `latitude`
- `longitude`

### 2. 장소명 입력

- `place_query`

예:

- `안반데기마을`
- `육백마지기`
- `구룡령`

장소명 입력은 카카오 Local API를 사용해 좌표로 변환합니다.

### 3. 선택 입력

- `site_profile.bortle_class`
- `site_profile.elevation_m`
- `site_profile.near_water`
- `mode`
- `target`

## 지원하는 모드

- `general`
- `wide_field_milky_way`
- `wide_field_nightscape`
- `broadband_deep_sky`
- `narrowband_deep_sky`
- `star_trail`

즉 같은 밤이라도
`은하수에는 좋지만 broadband 딥스카이엔 애매하다`
같은 해석이 가능합니다.

## MCP 도구

### `score_night_sky`

가까운 날짜용 상세 점수 도구입니다.

- 시간대별 점수
- 최적 시간대
- 위험 요인
- 모드별 적합성
- 타깃 천문 정보

를 돌려줍니다.

### `score_night_sky_outlook`

먼 날짜용 단순화 전망 도구입니다.

`+6일 이후`에는 너무 정밀한 시간대별 점수를 보여주지 않기 위해,
상세 결과 대신 coarse outlook을 반환합니다.

### `estimate_light_pollution`

광해와 Bortle-like 추정 결과를 반환합니다.

### `describe_light_pollution_method`

광해 추정 방법론과 가드레일을 설명합니다.

### `describe_scoring_model`

점수 필드와 해석 규칙을 설명합니다.

### `score_night_sky_via_link`

설치 페이지, JSON API, MCP 주소 같은 공유용 링크를 반환합니다.

## 엔드포인트

- `/mcp`: MCP 연결
- `/api/score`: 상세 점수 API
- `/api/score-outlook`: 먼 날짜용 outlook API
- `/api/light-pollution`: 광해 추정 API
- `/api/light-pollution/method`: 방법론 API
- `/prompt`: MCP 설정 없이 쓸 수 있는 프롬프트 페이지
- `/prompt.txt`: plain text 프롬프트
- `/install`: 공유용 설치 안내 페이지
- `/health`: 헬스 체크

## 날짜 정책

이 프로젝트는 "먼 날짜일수록 예보 정밀도를 보수적으로 다룬다"는 정책을 사용합니다.

- `0~5일`: 상세 점수 사용
- `6일~15일`: `outlook` 경로로 유도

이유는 시간대별 날씨는 더 멀리도 볼 수 있어도,
대기질/투명도 계층까지 포함한 점수를 먼 날짜에 그대로 주면
오히려 false precision이 커지기 때문입니다.

## 외부 API 실패 처리

Open-Meteo와 Kakao Local API 호출은
`초기 1회 + 재시도 최대 3회` 정책으로 동작합니다.

즉 일시적인 무응답이나 5xx/429 계열 문제에는 바로 실패하지 않고
짧게 재시도한 뒤, 그래도 안 되면 명시적으로 에러를 반환합니다.

## 실행 방법

### 로컬 MCP

```bash
npm run start:stdio
```

### Node HTTP 서버

```bash
npm run start:http
```

### Workers 스타일 실행

```bash
npm run dev:worker
npm run deploy:worker
```

참고:
현재 프로젝트는 `Node + Python + 로컬 광해 데이터` 구조라서,
실제 운영/기여 관점에서는 Workers보다 Node 컨테이너 호스팅이 더 자연스럽습니다.

## 환경 변수

- `PORT` 또는 `MCP_PORT`: Node HTTP 포트
- `HOST`: Node HTTP bind host, 기본값 `0.0.0.0`
- `PUBLIC_BASE_URL`: 외부에서 보이는 서비스 기본 URL
- `KAKAO_REST_API_KEY`: `place_query` 사용 시 필요
- `REST_API_KEY`: 로컬 호환용 alias
- `BLACK_MARBLE_RUNTIME_ARTIFACT_PATH`: runtime artifact 경로 override
- `BLACK_MARBLE_RUNTIME_ARTIFACT_URL`: Railway 부팅 시 runtime artifact 다운로드 URL
- `ALLOWED_HOSTS`: Node HTTP 허용 호스트 목록
- `MCP_TRANSPORT=http`: `npm start`를 HTTP 모드로 실행

참고:
- Railway처럼 `PORT`가 자동으로 주어지는 배포 환경에서는 `npm start`가 자동으로 HTTP 서버 모드로 동작합니다.

Workers를 쓸 경우에는 `wrangler.toml` 또는 배포 변수에:

- `PUBLIC_BASE_URL`
- `KAKAO_REST_API_KEY`

를 넣어야 합니다.

## 로컬 데이터

광해 추정을 제대로 쓰려면 다음 로컬 데이터가 필요합니다.

- `data/VNP46A4/...`
- `data/VJ146A4/...`
- `data/black-marble-korea-runtime.npz`
- `data/black-marble-korea-distribution.json`

이 원본 타일은 매우 크기 때문에 GitHub 레포에는 포함하지 않는 것을 권장합니다.

## 개발

```bash
npm install
npm run build:light-pollution-stats
npm run build:light-pollution-distribution
npm run build:light-pollution-runtime-artifact
npm test
```

## 배포 전 체크리스트

1. 환경변수 설정
- `PUBLIC_BASE_URL`
- `KAKAO_REST_API_KEY`
- 필요 시 `ALLOWED_HOSTS`

2. 로컬 데이터 확인
- 광해 추정을 쓸 경우 `data/black-marble-korea-runtime.npz` 존재 확인
- raw tile fallback을 유지할 경우 `data/VNP46A4`, `data/VJ146A4`, distribution 파일 존재 확인

3. 테스트 실행
- `npm test`

4. 기본 동작 확인
- `/health`
- `/api/score`
- `/api/score-outlook`
- `/mcp`

5. 배포 후 공유 링크 확인
- `/install`

## 추천 배포 방식

현재 구조 기준으로는 `Railway` 같은 Node 컨테이너 호스팅을 추천합니다.

이유:

- Node 런타임과 잘 맞음
- Python 광해 추정과 로컬 파일 구조를 유지하기 쉬움
- 기여자도 구조를 이해하기 쉬움

Workers는 장기적으로 비용 최적화엔 매력적이지만,
현재 구조를 그대로 쓰기엔 아키텍처 변경이 더 필요합니다.
