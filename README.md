# mcp-darksky

한국 중심의 밤하늘 촬영 조건을 점수화하는 MCP 서버입니다.  
Open-Meteo 예보와 공기질 데이터를 모으고, 천문 계산과 촬영 리스크 규칙을 합쳐 시간대별 점수와 추천을 반환합니다.

공유를 염두에 두고 `stdio`와 `Streamable HTTP`를 모두 지원합니다.

## Tools

### `score_night_sky`
- 입력: 위도, 경도, 날짜, 타임존, 선택적 site profile
- 출력:
  - `hourly_conditions`
  - `scores`
  - `derived_recommendations`
  - `risk_flags`
  - `astronomy_context`
  - `source_attribution`

### `describe_scoring_model`
- 점수 필드와 해석 규칙을 연결된 AI가 이해할 수 있도록 간단한 설명을 반환합니다.

## Run modes

### Local MCP client development

```bash
npm run start:stdio
```

### Public / remote deployment

```bash
npm run start:http
```

기본 엔드포인트:

- MCP: `http://localhost:3000/mcp`
- Health: `http://localhost:3000/health`

환경 변수:

- `PORT` 또는 `MCP_PORT`: HTTP 포트
- `HOST`: 기본값 `0.0.0.0`
- `PUBLIC_BASE_URL`: 외부에 노출되는 기준 URL
- `ALLOWED_HOSTS`: 쉼표 구분 허용 호스트 목록
- `MCP_TRANSPORT=http`: `npm start`를 HTTP 모드로 실행

## Local development

```bash
npm install
npm test
npm run start:stdio
```

## Deployment notes

- 사람들에게 공유할 계획이면 `Streamable HTTP` 모드로 배포하는 것이 맞습니다.
- 초반에는 Railway, Render, Fly.io 같은 단순 Node 호스팅에 바로 올릴 수 있습니다.
- 운영 단계에서는 `PUBLIC_BASE_URL`을 실제 도메인으로 설정하는 편이 좋습니다.
- `ALLOWED_HOSTS`를 설정하면 공개 배포 시 호스트 헤더를 제한할 수 있습니다.

## Notes

- `site_profile.bortle_class`를 넣으면 장소별 기본 광공해를 반영할 수 있습니다.
- `go_no_go`는 시간대 평균과 최고점 둘 다 고려해서 계산합니다.
- 강수, 강설, 짙은 안개는 `hard_fail_reasons`로 내려가며 점수를 강하게 제한합니다.
