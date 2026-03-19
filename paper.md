# mcp-darksky 광공해 추정 메모

## 1. 이 문서의 목적

이 문서는 `mcp-darksky`의 광공해 추정이:

- 왜 이렇게 설계되었는지
- 실제로 어떤 데이터를 써서
- 어떤 순서로 계산되고
- 사용자에게 어떤 의미로 보여야 하는지

를 기록하기 위한 내부 메모입니다.

이 문서는 논문 자체가 아니라, 논문과 구현 사이를 연결하는 설명서입니다.

## 2. 한 줄 요약

이 프로젝트의 광공해 추정은:

1. NASA Black Marble 연간 야간조도 데이터를 읽고
2. 해당 좌표의 밝기를 한국 전체 맥락 안에서 상대적으로 해석한 뒤
3. 그것을 `연속형 보틀 유사값`으로 바꾸고
4. 센서 차이, 데이터 변동성, 주변 광원 영향에 따라 `범위`를 넓히는

방식으로 구현되어 있습니다.

즉, `보틀 4`를 딱 잘라 맞히려는 것이 아니라:

- `estimated_bortle_center = 4.2`
- `estimated_bortle_range = 3.4 ~ 4.9`
- `darkness_percentile_in_korea = 74.2`

처럼, "이 정도 수준으로 보는 것이 가장 그럴듯하다"를 보여주는 모델입니다.

## 3. 왜 정수 보틀이 아니라 소수점 + 범위인가

보틀(Bortle) 등급은 천문 애호가가 밤하늘을 보고 느끼는 체감 척도에 가깝습니다.
즉, 완전히 순수한 물리량이라기보다 다음 요소가 섞입니다.

- 하늘 정점(머리 위) 밝기
- 수평선 쪽 광해
- 대기 상태
- 습도와 에어로졸
- 조명의 색 특성
- 관측자의 눈 적응 상태

그래서 위성 영상만 보고 `이곳은 정확히 보틀 4입니다`라고 말하는 것은 과장일 수 있습니다.

대신 논문들은 대체로:

- `zenith sky brightness`
- `all-sky luminance ratio`
- `SQM equivalent`

같은 연속형 물리량을 먼저 만들고, 보틀은 그 위에 해석용 레이블로 얹습니다.

이 프로젝트도 같은 방향을 따릅니다.

## 4. 어떤 논문 흐름을 따랐는가

핵심 참고 논문은 아래와 같습니다.

1. Falchi et al. (2016)  
   [The new world atlas of artificial night sky brightness](https://pmc.ncbi.nlm.nih.gov/articles/PMC4928945/)

2. Duriscoe et al. (2018)  
   [A simplified model of all-sky artificial sky glow derived from VIIRS Day/Night band data](https://repository.library.noaa.gov/view/noaa/21007/noaa_21007_DS1.pdf)

3. Barentine (2022)  
   [Night sky brightness measurement, quality assessment and monitoring](https://www.nature.com/articles/s41550-022-01756-2)

4. Hung (2022)  
   [Identifying distinct metrics for assessing night sky brightness](https://academic.oup.com/mnras/article/511/4/5683/6374878)

5. Zheng et al. (2025)  
   [Machine-Learning-Based Monitoring of Night Sky Brightness Using Sky Quality Meters and Multi-Source Remote Sensing](https://www.mdpi.com/2072-4292/17/8/1332)

6. Fernandez-Ruiz et al. (2023)  
   [Calibrating Nighttime Satellite Imagery with Red Photometer Networks](https://www.mdpi.com/2072-4292/15/17/4189)

이 논문들로부터 가져온 핵심 방향은 다음과 같습니다.

- 위성 야간조도에서 밤하늘 품질을 연속값으로 추정하는 것은 가능하다.
- 하지만 보틀 등급 자체를 고정 정답처럼 맞히는 것은 위험하다.
- 따라서 `continuous proxy + uncertainty` 구조가 더 안전하다.

## 5. 사용한 데이터

현재 구현은 로컬에 내려받은 Black Marble 연간 타일을 사용합니다.

- `VNP46A4`
- `VJ146A4`

한반도 커버 타일:

- `h30v04`
- `h31v04`
- `h30v05`
- `h31v05`

핵심 레이어:

- `AllAngle_Composite_Snow_Free`
- `AllAngle_Composite_Snow_Free_Num`
- `AllAngle_Composite_Snow_Free_Quality`
- `AllAngle_Composite_Snow_Free_Std`

이 값들은 각각:

- 연간 snow-free radiance
- 관측 수
- 품질 플래그
- 지역 내 변동성

을 뜻합니다.

## 6. 비전공자용 설명: 실제로 어떻게 계산되는가

쉽게 말하면 아래 순서입니다.

### 6.1 지도 위의 한 칸을 찾는다

사용자가 위도/경도를 넣으면, 먼저 그 좌표가 Black Marble 타일의 어느 칸에 해당하는지 찾습니다.

이 칸에는 “이 위치가 1년 동안 밤에 얼마나 밝았는가”에 대한 위성 관측값이 들어 있습니다.

### 6.2 한 칸만 보지 않고 주변도 같이 본다

사람이 보는 밤하늘은 딱 발밑 한 점만으로 결정되지 않습니다.
멀리 있는 도시 불빛도 하늘을 밝힐 수 있기 때문입니다.

그래서 이 프로젝트는 세 범위를 같이 봅니다.

- local: 약 1.5 km
- near_5km: 약 5 km
- regional_20km: 약 20 km

즉,

- 바로 그 지점 자체는 어두워도
- 주변 20 km가 밝으면
- 실제 체감은 더 밝을 수 있음

을 반영합니다.

### 6.3 두 위성 센서 결과를 평균적으로 본다

현재는 `VNP46A4`와 `VJ146A4` 두 소스를 함께 봅니다.

이유는 단순합니다.

- 한 센서만 믿는 것보다
- 두 센서가 비슷하게 말하면 더 믿을 만하고
- 둘의 차이가 크면 불확실성이 커집니다

즉, 센서 간 차이 자체가 신뢰도 정보가 됩니다.

### 6.4 한국 안에서 상대적으로 어느 정도 밝은지 본다

이 프로젝트는 한국에 있는 모든 유효 land pixel을 합쳐 통계 파일을 만들어 둡니다.
그 다음 어떤 좌표의 밝기를 한국 전체 분포 안에서 상대 퍼센타일로 바꿉니다.

예를 들어:

- 퍼센타일이 낮다 = 한국 기준으로 꽤 어두운 편
- 퍼센타일이 높다 = 한국 기준으로 매우 밝은 편

이 과정을 쓰는 이유는 radiance 값 분포가 매우 한쪽으로 치우쳐 있기 때문입니다.
도시의 극단적으로 밝은 값 때문에 단순 선형 해석은 불안정해질 수 있습니다.

### 6.5 그 퍼센타일을 보틀 유사 축에 올린다

현재 구현은 아래 anchor를 사용합니다.

```text
0%   -> 1.0
10%  -> 2.0
20%  -> 3.0
35%  -> 4.0
55%  -> 5.0
75%  -> 6.0
90%  -> 7.0
97%  -> 8.0
100% -> 9.0
```

그 사이 값은 선형 보간합니다.

예를 들어 35%와 55% 사이 어딘가라면:

- 보틀 4와 5 사이
- 즉 `4.x`

처럼 나옵니다.

이 값이 `estimated_bortle_center`입니다.

### 6.6 주변이 더 밝으면 중심값을 조금 올린다

어떤 지점 자체는 어두워도, 주변 20 km 평균 radiance가 훨씬 밝으면
실제 체감 하늘은 더 나쁠 가능성이 큽니다.

그래서 `regional_ratio`가 크면 `regional_glow_adjustment`를 조금 더해
중심값을 최대 `+0.8`까지 밝은 쪽으로 이동시킵니다.

이것은 “주변 도시광의 하늘 반사 효과”를 아주 단순하게 흉내 낸 보정입니다.

### 6.7 한국 전체 분포에서 몇 퍼센트인지 계산한다

이제 이 프로젝트는 한 좌표의 값만 계산하는 데서 끝나지 않습니다.
대한민국(남한) 경계 안에 들어오는 유효 land pixel 전체에 대해 같은 축의 분포를 미리 만들어 둡니다.

그 다음 사용자의 결과가 이 분포 안에서 어디쯤 있는지 계산합니다.

예를 들어:

- `brightness_percentile_in_korea = 99.67`
- `brightness_percentile_in_korea = 99.67`

이면,

- 한국 유효 격자 중 거의 최상위 밝기권
- 즉 광해가 매우 강한 편

이라는 뜻입니다.

반대로 값이 낮으면 한국 기준으로 어두운 편입니다.

이 값은 두 가지 용도로 유용합니다.

1. 사용자 설명  
   "이곳은 한국 기준 상위 3% 밝은 지역입니다"처럼 직관적으로 말할 수 있습니다.

2. 모델 점검  
   분포가 지나치게 한쪽으로 몰리면 현재 추정이 skewed되었는지 점검할 수 있습니다.

## 7. 불확실성은 어떻게 계산하는가

중요한 점은 이 프로젝트가 `점 하나`만 내지 않는다는 것입니다.
반드시 `범위`를 같이 냅니다.

현재 범위는 아래 요소들로 넓어집니다.

### 7.1 센서 차이

`VNP46A4`와 `VJ146A4`가 많이 다르면:

- 어떤 해석을 믿어야 할지 애매하므로
- 범위를 넓힙니다

### 7.2 지역 변동성

`Std` 값이 크면:

- 주변 픽셀 밝기가 들쭉날쭉하다는 뜻이므로
- 단일 중심값을 과하게 믿지 않습니다

### 7.3 관측 수와 품질

관측 수가 적거나 품질 플래그가 좋지 않으면:

- 데이터가 덜 안정적이라고 보고
- 범위를 넓힙니다

### 7.4 주변 광원 우세

`regional_20km_mean_radiance / local_radiance`가 크면:

- 내 자리보다 주변 광원이 더 큰 영향을 줄 수 있으므로
- 불확실성을 키웁니다

즉 최종적으로는:

- `estimated_bortle_center`
- `estimated_bortle_range.low`
- `estimated_bortle_range.high`

가 함께 나옵니다.

## 7.1 range 산식

현재 구현의 range는 중심값 주변에 `uncertainty_radius`를 더하고 빼는 방식입니다.

```text
estimated_bortle_range.low  = estimated_bortle_center - uncertainty_radius
estimated_bortle_range.high = estimated_bortle_center + uncertainty_radius
```

핵심은 `uncertainty_radius`가 어떻게 만들어지느냐입니다.

현재 구현식은 아래와 같습니다.

```text
uncertainty_radius
= 0.18
+ 0.45 * sensor_disagreement
+ 0.25 * variability_penalty
+ 0.15 * quality_penalty
+ 0.12 * observation_penalty
+ 0.32 * regional_glow_penalty
+ extrapolation_penalty
```

그리고 마지막으로:

```text
uncertainty_radius = clamp(uncertainty_radius, 0.2, 1.35)
```

즉 range 폭은 최소 `0.4`, 최대 `2.7` 정도가 되도록 제한합니다.

각 항의 의미는 다음과 같습니다.

- `sensor_disagreement`
  - `VNP46A4`와 `VJ146A4`가 많이 다를수록 커집니다.
- `variability_penalty`
  - 지역 내 radiance 표준편차가 크면 커집니다.
- `quality_penalty`
  - quality good fraction이 낮으면 커집니다.
- `observation_penalty`
  - 관측 수가 부족하면 커집니다.
- `regional_glow_penalty`
  - 주변 20km가 local보다 훨씬 밝으면 커집니다.
- `extrapolation_penalty`
  - SQM 유사 회귀가 논문 보정 범위를 벗어나면 추가됩니다.

즉, 이 range는 “임의의 보기 좋은 범위”가 아니라

- 두 센서가 얼마나 일치하는지
- 데이터 자체가 얼마나 안정적인지
- 주변 광원이 해석을 얼마나 흔드는지
- 회귀가 안전한 범위 안쪽인지

를 합쳐서 만든 불확실성 폭입니다.

## 8. SQM 유사값은 왜 같이 내는가

구현에는 아래 식도 포함되어 있습니다.

```text
equivalent_sqm_mag = 20.93 - 0.95 * log10(radiance)
```

이 식은 Fernandez-Ruiz et al. (2023)의 회귀를 반영한 것입니다.

다만 이 값도 그대로 “측정된 SQM”은 아닙니다.
그래서 이름도 `equivalent_zenith_brightness_mpsas`로 두었습니다.

즉 의미는:

- 진짜 현장 SQM 측정기 값이 아니라
- 위성 radiance를 바탕으로 한 SQM 유사 추정값

입니다.

또한 구현에는 `sqm_regression_in_calibrated_range`가 있습니다.

- `true`면 논문 회귀 범위 안쪽이라 조금 더 조심스럽게 쓸 수 있고
- `false`면 외삽이므로 더 조심해야 합니다

## 9. 현재 구현 수식 요약

완전히 단순화해서 적으면 아래와 같습니다.

### 9.1 중심값

```text
local_radiance
-> Korea-relative percentile
-> continuous Bortle-like center
-> modest regional glow adjustment
-> estimated_bortle_center
```

### 9.2 범위

```text
uncertainty_radius
+= 0.18
+ sensor disagreement penalty
+ variability penalty
+ quality penalty
+ observation penalty
+ regional glow penalty
+ extrapolation penalty
```

```text
estimated_bortle_range.low  = center - uncertainty_radius
estimated_bortle_range.high = center + uncertainty_radius
```

## 10. 사용자에게는 어떻게 설명해야 하는가

좋은 표현:

- `추정 보틀 유사값은 4.2 수준입니다.`
- `가능 범위는 3.4~4.9입니다.`
- `주변 20km 광원이 꽤 강해서 실제 체감은 중심값보다 조금 밝게 느껴질 수 있습니다.`
- `위성 연간 야간조도 기반 추정이므로 현장 SQM 측정값과는 다를 수 있습니다.`

피해야 할 표현:

- `이곳은 정확히 보틀 4입니다.`
- `실측 결과 보틀 4.2입니다.`
- `이 값은 현장 눈으로 보는 하늘 품질을 완전히 대체합니다.`

## 11. 이 구현의 강점

- 한국 전체 기준 상대해석이 가능함
- 한국 분포 기준 상위 몇 % 밝은지 바로 설명 가능함
- 도시/산지 차이가 잘 드러남
- 정수 분류보다 더 세밀함
- 과신을 막기 위해 범위를 같이 보여줌
- 향후 원격 전처리 저장소로 옮겨도 구조를 유지하기 쉬움

## 12. 이 구현의 한계

이 모델은 여전히 한계가 분명합니다.

### 12.1 연간 radiance 기반이다

즉:

- 오늘의 안개
- 오늘의 에어로졸
- 오늘의 구름
- 계절별 조명 패턴

은 직접 반영하지 못합니다.

이것은 밤하늘 전체 점수 쪽(Open-Meteo 기반)에서 따로 보정해야 합니다.

### 12.2 VIIRS는 LED에 완벽하지 않다

문헌에서도 계속 지적되듯, VIIRS DNB는 조명 스펙트럼에 따라 체감 밝기를 완전히 재현하지 못할 수 있습니다.

즉,

- 실제 하늘은 더 밝은데
- 위성 radiance는 상대적으로 덜 밝게 보일 가능성

이 있습니다.

### 12.3 보틀은 원래 주관적 성격이 있다

따라서 `4.2`는 물리 실측 정답이 아니라:

- 야간조도 기반
- 한국 상대분포 기반
- 주변 광원 보정 기반

의 추정 중심값입니다.

## 13. 코드 기준 구현 위치

주요 파일은 아래입니다.

- 계산 엔진: `scripts/black_marble_bortle.py`
- 방법론 메타데이터: `src/light-pollution-methodology.js`
- 서비스 연결: `src/service.js`
- MCP 도구: `src/server.js`
- HTTP API: `src/http.js`
- Workers API: `src/worker.js`
- 점수 시스템 연결: `src/scoring.js`
- 실행/감시 문서: `docs/light-pollution-estimator-execution-monitoring.md`

## 14. 앞으로 개선할 수 있는 방향

다음 개선은 특히 가치가 큽니다.

1. 연간 radiance와 오늘의 대기 투명도 정보를 결합하기
2. 한국 실측 SQM/TESS 데이터로 보정하기
3. 해안/산지/대도시 주변 특성에 대한 지역 보정 강화
4. Workers에서도 바로 읽을 수 있는 전처리 아티팩트로 배포하기
5. 최종 사용자에게는 `SQM 유사값 + 보틀 유사값 + 범위`를 함께 보여주기

## 15. 최종 원칙

이 프로젝트는 광공해를 `정확한 보틀 정답`으로 선언하지 않습니다.

대신 다음 원칙을 지킵니다.

- 연속형 추정값을 먼저 만든다
- 보틀은 해석용으로만 쓴다
- 항상 범위를 같이 보여준다
- 논문이 뒷받침하지 않는 표현은 피한다
- 사용자에게는 `estimated`, `proxy`, `Bortle-like`라는 말을 유지한다

이 원칙이 현재 구현의 핵심입니다.
## 13. 2026-03-19 Korea Calibration Note

This project now uses a Republic-of-Korea-specific display calibration for
`estimated_bortle_center`.

Why this was needed:

- The raw Black Marble percentile curve was producing values like `1.0` or
  `2.x` for famous Korean dark sites.
- That is not a good user-facing result for Korea because the country is small,
  nearby skyglow is rarely negligible, and LightPollutionMap.info shows most of
  those benchmark sites in the `class 4` neighborhood.

What changed:

1. The live point sampler now uses the same gates as the national calibration
   corpus.
   - Republic of Korea boundary only
   - land-only pixels
   - `quality == 0`
   - `observations >= 4`
2. The underlying radiance and uncertainty inputs were kept.
3. Only the display-layer percentile-to-Bortle anchors were recalibrated.
4. The regional glow adjustment was made much smaller and capped more tightly.

Benchmark source:

- [`data/lightpollutionmap-korea-benchmarks.json`](/Users/song7/Desktop/school/2026-1/projects/mcp_darksky/data/lightpollutionmap-korea-benchmarks.json)
- Source site: [LightPollutionMap.info](https://www.lightpollutionmap.info/)
- Overlay used: `Sky Brightness (2025)`

Benchmark examples used for calibration:

- Seoul City Hall: site shows `Bortle 8-9`, target display center `8.6`
- Busan City Hall: site shows `Bortle 8-9`, target display center `8.4`
- Andbandegi: site shows `Bortle 4`, target display center `4.2`
- Yukbaekmajigi: site shows `Bortle 4`, target display center `3.8`
- Guryeongnyeong: site shows `Bortle 4`, target display center `3.6`
- Nogodan: site shows `Bortle 4`, target display center `4.1`
- Sobaeksan Observatory: site shows `Bortle 4`, target display center `4.2`
- Hallasan 1100: site shows `Bortle 4`, target display center `4.4`

How to explain this to a non-specialist:

- The satellite data still tells us how bright the ground-based night lighting
  is.
- We still compare that place against the rest of South Korea.
- But instead of converting the darkest few percent directly into `Bortle 1`
  or `Bortle 2`, we now use a Korea-tuned display curve based on well-known
  Korean observing sites checked against LightPollutionMap.info.
- So the number is better aligned with what Korean astrophotography users
  actually expect to see on a map.

Important limitation:

- This is still an `estimated`, `display-calibrated`, `Bortle-like` value.
- It is not a direct field measurement and it is not an official Bortle class.

## 14. Why Hwaak Tunnel Was Slightly Too Bright

During validation, Hwaak Tunnel was coming out a bit brighter than the
LightPollutionMap.info benchmark.

What we found:

- LightPollutionMap.info showed Hwaak Tunnel and nearby points within a few km
  all around `Bortle 4`, with very small SQM differences.
- Our estimator was slightly brighter because the local 1.5 km window had a
  heavy bright upper tail.
- That kind of shape can happen when a mountain dark site includes a road,
  tunnel lighting, or a few bright infrastructure pixels in the same annual
  satellite window.

What we changed:

- We no longer rely only on the local median radiance.
- We now compute:
  - `p25_radiance`
  - `median_radiance`
  - `p75_radiance`
  - a `high_tail_skew_indicator`
- Then we build a `robust_radiance` that shifts slightly from the median toward
  `p25` when the upper tail is unusually heavy.

Conceptually:

```text
if local window has a bright high-end tail:
  robust_radiance = median - partial_shift_toward_p25
else:
  robust_radiance ~= median
```

This helps places like Hwaak Tunnel because:

- a few bright road-related pixels no longer pull the local darkness estimate
  upward as much
- broad dark mountain areas like Andbandegi are barely affected because their
  local distribution is much less skewed

In plain language:

- If the nearby pixels are mostly dark but a few are much brighter, we now
  trust the "typical dark part" of the small area more than before.

## 15. Regional Glow Improvement

After the local-window fix, the next issue was that `regional glow` could still
be too sensitive to a small number of brighter pixels inside the wider 5 km or
20 km neighborhood.

Before:

- the model leaned on wider-window mean radiance too directly
- that could make surrounding glow look stronger than what a user-facing map
  like LightPollutionMap.info suggests

Now:

- each wider window keeps:
  - `mean_radiance`
  - `median_radiance`
  - `p75_radiance`
  - `high_tail_skew_indicator`
- then the model builds a `glow_context_radiance`

Conceptually:

```text
glow_context_radiance
= median
+ bounded_fraction_of_upper_half_spread

where upper_half_spread = p75 - median
```

This means:

- broad surrounding glow is still represented
- but a few unusually bright pixels do not dominate the whole 20 km context

The model now reports both:

- raw `near_5km_mean_radiance` and `regional_20km_mean_radiance`
- robust `near_5km_glow_context_radiance` and `regional_20km_glow_context_radiance`

And `regional_ratio` is now based on:

```text
regional_20km_glow_context_radiance / local_radiance
```

Why this matters:

- mountain roads, tunnel lighting, and isolated bright facilities are common in
  Korean dark-sky candidates
- those should not make the entire surrounding skyglow term look too strong
- this change makes the `regional glow` term more stable and more believable
  for dark mountain sites

## 16. Why We Deferred DEM / Terrain Shielding

After the local skew-aware fix and the regional glow fix, we re-checked whether
it was time to add DEM-based terrain shielding.

Short answer:

- not yet

Why:

- our current Korean benchmark error is already small
- the display-center MAE against the current Korean LightPollutionMap.info
  benchmark set is about `0.15`
- the remaining mismatches are mostly around `0.0 ~ 0.3`
- that is already within the level where user-facing interpretation is more
  sensitive to calibration choices than to a full terrain model

Current benchmark examples at the time of this decision:

- Seoul City Hall: target `8.6`, estimate `8.6`
- Busan City Hall: target `8.4`, estimate `8.6`
- Anbandegi: target `4.2`, estimate `4.2`
- Yukbaekmajigi: target `3.8`, estimate `3.9`
- Guryeongnyeong: target `3.6`, estimate `3.9`
- Sobaeksan Observatory: target `4.2`, estimate `3.9`
- Hallasan 1100: target `4.4`, estimate `4.1`

What the literature suggests:

- large-area zenith sky brightness models do become more precise when they
  include topography or blocking effects
- but that usually belongs to a more complete physical propagation model, not a
  small display-calibrated heuristic
- the Catalonia regional modeling paper explicitly notes that differences from
  the world atlas were expected because that work included the blocking effect
  of topography and obstacles, while the world-atlas assumptions were simpler
- Falchi et al. also describe a global atlas built under simplifying
  assumptions, which is a reminder that terrain-aware precision is a different
  model class, not a tiny patch

Why this matters for our estimator:

- our estimator is still primarily a Korea-relative annual-radiance model
- it is calibrated to user expectations with a small benchmark table
- adding DEM now would increase:
  - coordinate-system complexity
  - tuning surface area
  - maintenance burden
  - overfitting risk on a small benchmark set

In plain language:

- terrain shielding is a real effect
- but it is not yet the bottleneck in this particular implementation
- if we add it too early, the model becomes harder to explain and easier to
  over-tune without a clear measured win

So the current rule is:

- do not add DEM/terrain shielding while benchmark residuals stay small and the
  errors are not clearly terrain-driven
- revisit DEM only if:
  - Korean mountain dark sites start showing a repeated one-sided bias
  - the benchmark set grows and still shows terrain-correlated error
  - or we move from a heuristic Bortle-like proxy toward a fuller zenith sky
    brightness propagation model
