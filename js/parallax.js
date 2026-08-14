/* =========================================================
   parallax.js — 시차와 연주시차 계산 엔진
   ---------------------------------------------------------
   이 파일은 화면을 전혀 모른다. 숫자만 만든다.
   (EnergyKeeper physics.js · induction.js · stars.js 와 같은 역할)

   ⚠ ES 모듈(import/export)을 쓰지 않는다.
     index.html 을 더블클릭(file://)해서 열어도 동작해야 하기 때문이다.

   ---------------------------------------------------------
   엔진의 핵심 아이디어 — 여기를 고칠 사람은 반드시 읽을 것
   ---------------------------------------------------------

   1. 교실의 '구멍 두 개'와 하늘의 '지구 공전'을 **같은 식 하나**로 계산한다

      선생님 활동지는 책상 위에서 **구멍 두 개**로 별을 본다.
      교과서는 하늘에서 **6개월 간격**으로 별을 본다.
      학생이 이 둘을 다른 이야기로 받아들이면 연주시차가 외울 것이 되어 버린다.

      그래서 이 엔진은 둘을 한 식으로 본다 —
        · 두 관측 지점 사이의 거리를 **기선(baseline)** 이라 부르고,
        · 시차각 = 2 × arctan( 기선 ÷ 2 ÷ 거리 )
      교실에서는 기선이 '구멍 사이 간격'이고, 하늘에서는 '지구 공전 궤도의 지름'이다.
      **바뀌는 것은 기선의 길이뿐**이고 식은 그대로다. 미션 6(목성에서 재기)이 그 결론이다.

   2. 연주시차는 **시차각의 절반**이다

      선생님 학습지 그대로 —
      "지구에서 측정한 별 S의 시차 ∠ASB 의 **절반**에 해당하는 값을 연주 시차라고 한다."
      즉 연주시차는 **반지름(1 AU)** 을 기선으로 본 각이다. 코드에서 절반을 잊기 쉬우므로
      `annualParallax()` 안에서 한 번만 나누고, 다른 곳에서는 그 값을 받아 쓴다.

   3. 거리와 연주시차는 **정의상** d = 1 ÷ p 다

      "연주시차가 1″인 별까지의 거리를 1 파섹(pc)이라고 한다" — 이것이 pc 의 정의다.
      그래서 별 표에는 **거리 d(pc) 만 담고 연주시차는 계산해서 쓴다.**
      p 를 따로 적어 두면 d 와 어긋난 값이 섞인다(자료마다 다르다).
      계산해서 쓰면 **두 값이 언제나 서로 맞는다.** brightness 앱이 절대 등급을 다루는 방식과 같다.

   4. 각도는 **초(″)** 를 기본 단위로 쓴다

      1° = 60′ = 3600″. 별의 연주시차는 1″도 안 되는 아주 작은 각이라 초로 다뤄야 한다.
      반대로 교실 활동(책상 위)의 시차는 수십 도라, 화면에서는 도(°)로 보여 준다.
      **두 단위를 섞지 않도록** 엔진은 언제나 초로 계산하고, 보여 줄 때만 바꾼다.
   ========================================================= */
(function (global) {
  "use strict";

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ---------------------------------------------------------
     0. 단위
     --------------------------------------------------------- */
  var ARCSEC_PER_RAD = 206264.806;   // 1 라디안이 몇 초인가
  var AU_PER_PC = 206264.806;        // 1 pc 은 몇 AU 인가 (같은 숫자인 것은 우연이 아니다)
  var LY_PER_PC = 3.26;              // 1 pc ≈ 3.26 광년
  var KM_PER_AU = 149600000;

  function radToArcsec(r) { return r * ARCSEC_PER_RAD; }
  function degToArcsec(d) { return d * 3600; }
  function arcsecToDeg(s) { return s / 3600; }

  /* ---------------------------------------------------------
     1. 시차 — 교실이든 하늘이든 같은 식
        baseline 과 dist 는 **같은 단위**로 넣는다 (cm 든 AU 든 상관없다)
     --------------------------------------------------------- */

  /* 두 관측 지점에서 본 전체 시차각 (도) */
  function parallaxDeg(baseline, dist) {
    if (dist <= 0) return 180;
    return 2 * Math.atan((baseline / 2) / dist) * 180 / Math.PI;
  }

  /* 같은 것을 초(″)로 */
  function parallaxArcsec(baseline, dist) {
    if (dist <= 0) return degToArcsec(180);
    return radToArcsec(2 * Math.atan((baseline / 2) / dist));
  }

  /* 시차각을 알 때 거리를 거꾸로 구한다 */
  function distFromParallax(baseline, deg) {
    var half = deg / 2 * Math.PI / 180;
    if (half <= 0) return Infinity;
    return (baseline / 2) / Math.tan(half);
  }

  /* ---------------------------------------------------------
     2. 연주시차 — 시차각의 **절반**
        기선은 지구 공전 궤도의 **지름(2 AU)**, 그 절반이 반지름 1 AU 다.
     --------------------------------------------------------- */
  var EARTH_ORBIT_AU = 1;            // 공전 궤도 반지름 (AU)

  /* 거리 d(pc) 인 별의 연주시차 (초).
     정의상 d = 1 ÷ p 이지만, 궤도가 커졌을 때(미션 6)도 다룰 수 있도록
     '궤도 반지름 배수'를 받아 일반화해 둔다. */
  function annualParallax(dpc, orbitScale) {
    if (dpc <= 0) return Infinity;
    var r = EARTH_ORBIT_AU * (orbitScale == null ? 1 : orbitScale);   // AU
    /* 전체 시차각의 절반 = 반지름을 기선으로 본 각 */
    return radToArcsec(Math.atan(r / (dpc * AU_PER_PC)));
  }

  /* 연주시차(초) → 거리(pc). 아주 작은 각이라 tan 을 그대로 써도 된다 */
  function distFromAnnual(pArcsec, orbitScale) {
    if (pArcsec <= 0) return Infinity;
    var r = EARTH_ORBIT_AU * (orbitScale == null ? 1 : orbitScale);
    return (r / Math.tan(pArcsec / ARCSEC_PER_RAD)) / AU_PER_PC;
  }

  /* 교과서가 외우게 하는 간단한 꼴 : d(pc) = 1 ÷ p(″) */
  function simpleDist(pArcsec) { return pArcsec > 0 ? 1 / pArcsec : Infinity; }

  function pcToLy(pc) { return pc * LY_PER_PC; }

  /* ---------------------------------------------------------
     3. 연주시차로 잴 수 있는 한계
        각이 너무 작아지면 못 잰다. 맨눈·지상 망원경의 한계를 대략 잡아 둔다.
     --------------------------------------------------------- */
  var LIMIT_GROUND = 0.01;           // 초 — 지상 망원경으로 겨우 재는 정도(≈100 pc)

  function measurable(pArcsec) { return pArcsec >= LIMIT_GROUND; }

  /* ---------------------------------------------------------
     4. 별 자료
        **거리 d(pc) 만 담는다.** 연주시차는 계산해서 쓴다(위 3번).
        brightness 앱과 같은 거리 값을 쓴다 — 두 앱이 서로 어긋나면 안 된다.
     --------------------------------------------------------- */
  var STARS = [
    { name: "프록시마 센타우리", d: 1.30,  note: "태양에서 가장 가까운 별" },
    { name: "알파 센타우리",     d: 1.34,  note: "밤하늘에서 세 번째로 밝다" },
    { name: "시리우스",         d: 2.64,  note: "밤하늘에서 가장 밝게 보이는 별" },
    { name: "프로키온",         d: 3.51,  note: "작은개자리" },
    { name: "알타이르",         d: 5.13,  note: "견우성" },
    { name: "베가",             d: 7.68,  note: "직녀성" },
    { name: "스피카",           d: 77,    note: "처녀자리" },
    { name: "카노푸스",         d: 95,    note: "남쪽 하늘의 밝은 별" },
    { name: "북극성",           d: 133,   note: "북쪽 하늘의 길잡이" },
    { name: "베텔게우스",       d: 168,   note: "오리온자리의 붉은 별" },
    { name: "리겔",             d: 264,   note: "오리온자리의 푸른 별" }
  ];

  function info(star, orbitScale) {
    var p = annualParallax(star.d, orbitScale);
    return {
      name: star.name, note: star.note,
      d: star.d,
      p: p,
      ly: pcToLy(star.d),
      simple: simpleDist(p),                 // 1 ÷ p 로 되돌린 거리 (검산용)
      measurable: measurable(p)
    };
  }

  function byName(n) {
    for (var i = 0; i < STARS.length; i++) if (STARS[i].name === n) return STARS[i];
    return null;
  }

  /* ---------------------------------------------------------
     5. 교실 활동(책상 위)
        선생님 활동지 그대로 — 구멍 두 개로 별을 보고, 배경 숫자표(1~20) 위
        어느 눈금과 겹쳐 보이는지 읽는다.
     --------------------------------------------------------- */
  var SCALE_MIN = 1, SCALE_MAX = 20;

  /* 구멍(관측 지점) x 에서 거리 dist 에 있는 별(x=0)을 볼 때,
     그 시선이 뒤쪽 배경(거리 bgDist)의 어느 자리를 지나는가 → 눈금 값 */
  function scaleReading(holeX, dist, bgDist, spanCm) {
    /* 별을 지나 뒤로 뻗은 시선이 배경에 닿는 가로 위치 */
    var t = bgDist / dist;                       // 닮음비
    var bgX = holeX + (0 - holeX) * t;           // = holeX × (1 − bgDist/dist)
    /* 배경 가로폭 spanCm 을 눈금 1~20 으로 나눈다 */
    var mid = (SCALE_MIN + SCALE_MAX) / 2;
    return clamp(mid + bgX / (spanCm / (SCALE_MAX - SCALE_MIN)), SCALE_MIN, SCALE_MAX);
  }

  global.Parallax = {
    ARCSEC_PER_RAD: ARCSEC_PER_RAD, AU_PER_PC: AU_PER_PC, LY_PER_PC: LY_PER_PC,
    KM_PER_AU: KM_PER_AU, EARTH_ORBIT_AU: EARTH_ORBIT_AU, LIMIT_GROUND: LIMIT_GROUND,
    SCALE_MIN: SCALE_MIN, SCALE_MAX: SCALE_MAX, STARS: STARS,
    clamp: clamp,
    radToArcsec: radToArcsec, degToArcsec: degToArcsec, arcsecToDeg: arcsecToDeg,
    parallaxDeg: parallaxDeg, parallaxArcsec: parallaxArcsec, distFromParallax: distFromParallax,
    annualParallax: annualParallax, distFromAnnual: distFromAnnual, simpleDist: simpleDist,
    pcToLy: pcToLy, measurable: measurable,
    info: info, byName: byName, scaleReading: scaleReading
  };
})(window);
