/* =========================================================
   lab.js — 실험실 화면 (그리기 · 계기판 · 조작 · 미션)
   ---------------------------------------------------------
   계산은 parallax.js 가 하고, 이 파일은 그것을 '보이게' 만든다.
   (앞선 세 앱의 lab.js 와 같은 구조 · 같은 규칙)

   화면의 핵심 장치 세 가지
     ① **선생님 활동지를 그대로 화면에 옮겼다.** 뒤에 숫자표(1~20), 앞에 구멍 두 개.
        구멍을 바꿔 보면 별이 배경의 **다른 숫자**와 겹친다 — 그것이 시차다.
     ② 지구 궤도 장면에서 **두 자리(1월·7월)를 겹쳐 그린다.**
        ∠ASB 가 통째로 보이고, 그 **절반**이 연주시차라는 것이 눈에 들어온다.
     ③ 세 장면이 **같은 계기판**을 쓴다. 기선·거리·시차가 늘 같은 자리에 있어서
        "책상 위 구멍"과 "지구 공전"이 다른 이야기가 아님을 계기판이 말해 준다.

   ⚠ 캔버스 크기는 CSS 가 정한다. 여기서는 '보이는 크기'를 읽어 해상도만 맞춘다.
   ⚠ 애니메이션이 없으므로 requestAnimationFrame 을 돌리지 않는다.
     값이 바뀔 때만 refresh() 로 다시 그린다(brightness 앱과 같다).
   ========================================================= */
(function () {
  "use strict";

  var P = window.Parallax;

  /* ---------------------------------------------------------
     0. 상태
     --------------------------------------------------------- */
  var S = {
    scene: "desk",
    deskDist: 40,        // cm — 구멍에서 별까지
    base: 10,            // cm — 구멍 사이 간격(기선)
    eye: "left",         // left | both | right
    starName: "시리우스",
    month: "A",          // A | both | B
    orbit: 1,            // 공전 궤도 크기 배수
    mission: null, predictPick: null, missionState: "ready"
  };

  var BG_DIST = 110;     // cm — 배경 숫자표까지의 거리 (활동지에서 고정)
  var BG_SPAN = 60;      // cm — 숫자표의 가로 길이 (눈금 1~20)

  var canvas, ctx, cssW = 900, cssH = 556;
  var records = [];
  var seen = { eyes: {}, far: false, wide: false, both: false, sirius: false, jupiter: false };

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return P.clamp(v, a, b); }
  function star() { return P.byName(S.starName) || P.STARS[2]; }

  /* ---------------------------------------------------------
     1. 미션
     --------------------------------------------------------- */
  var MISSIONS = [
    {
      id: 1, star: "👀", title: "시차를 만들어라",
      story: "책상 위에 별을 세우고 <b>구멍 두 개</b>로 번갈아 보자. " +
             "왼쪽 구멍과 오른쪽 구멍으로 볼 때 별이 <b>배경의 같은 숫자</b>에 겹쳐 보일까?",
      scene: "desk", setup: { deskDist: 40, base: 10, eye: "left" },
      allow: ["eye"],
      predict: { q: "왼쪽 구멍과 오른쪽 구멍으로 보면 별은?",
                 opts: ["같은 숫자에 겹쳐 보인다", "다른 숫자에 겹쳐 보인다", "안 보인다"], ans: 1 },
      goals: [{ key: "eyeBoth", text: "<b>왼쪽</b>과 <b>오른쪽</b> 구멍으로 각각 보기" }],
      why: "<b>다른 숫자</b>에 겹쳐 보입니다. 보는 <b>자리가 다르기 때문</b>이에요.<br>" +
           "이렇게 관측 자리가 달라져서 물체가 배경에 대해 다른 자리에 있는 것처럼 보이는 것, " +
           "그 <b>각도의 차이</b>를 <b>시차</b>라고 합니다.<br>" +
           "<em>한쪽 눈씩 번갈아 감고 손가락을 보면 바로 확인할 수 있어요.</em>"
    },
    {
      id: 2, star: "📏", title: "멀리 두면 어떻게 될까",
      story: "별을 <b>멀리</b> 옮겨 보자. 구멍 사이 간격은 그대로 두고 별만 멀리 두면 시차는 어떻게 될까?",
      scene: "desk", setup: { deskDist: 25, base: 10, eye: "both" },
      allow: ["deskDist"],
      predict: { q: "별이 멀어지면 시차는?", opts: ["커진다", "작아진다", "변하지 않는다"], ans: 1 },
      goals: [{ key: "far", text: "별을 <b>80 cm 이상</b> 멀리 두기" }],
      why: "<b>작아집니다.</b> 멀수록 두 시선이 이루는 각이 좁아지기 때문입니다.<br>" +
           "그래서 <b>시차는 거리에 반비례</b>합니다. 거꾸로 말하면 " +
           "<b>시차를 재면 거리를 알 수 있다</b>는 뜻이에요 — 이것이 별까지의 거리를 재는 방법입니다."
    },
    {
      id: 3, star: "↔️", title: "구멍을 더 벌리면",
      story: "이번엔 별은 그대로 두고 <b>구멍 사이 간격</b>을 넓혀 보자. 시차는 어떻게 될까?",
      scene: "desk", setup: { deskDist: 60, base: 4, eye: "both" },
      allow: ["base"],
      predict: { q: "구멍 사이가 넓어지면 시차는?", opts: ["커진다", "작아진다", "변하지 않는다"], ans: 0 },
      goals: [{ key: "wide", text: "구멍 사이를 <b>20 cm 이상</b> 벌리기" }],
      why: "<b>커집니다.</b> 두 관측 지점이 멀리 떨어질수록 보는 방향의 차이가 커지기 때문입니다.<br>" +
           "두 관측 지점 사이의 거리를 <b>기선</b>이라고 합니다. " +
           "<b>기선이 길수록 시차가 크게 측정</b>되고, 그만큼 재기 쉬워집니다. " +
           "이것이 미션 6의 열쇠가 됩니다."
    },
    {
      id: 4, star: "🌍", title: "연주시차는 절반",
      story: "이제 하늘로 나가자. 지구는 태양을 돈다. <b>1월</b>과 <b>7월</b>, " +
             "즉 <b>6개월 간격</b>으로 같은 별을 보면 시차가 생긴다. " +
             "<b>두 자리를 겹쳐 보기</b>로 ∠ASB 를 확인하자.",
      scene: "orbit", setup: { starName: "시리우스", month: "A", orbit: 1 },
      allow: ["month", "star"],
      predict: { q: "연주시차는 6개월 간격으로 잰 시차 ∠ASB 의?",
                 opts: ["그대로(전체)", "절반", "2배"], ans: 1 },
      goals: [{ key: "both", text: "<b>두 자리 겹쳐 보기</b>로 ∠ASB 확인하기" }],
      why: "<b>절반</b>입니다. 선생님 학습지의 문장 그대로예요 — " +
           "“지구에서 측정한 별 S의 시차 ∠ASB 의 <b>절반</b>에 해당하는 값을 연주 시차라고 한다.”<br>" +
           "왜 절반일까요? 시차 전체는 <b>지구 궤도의 지름</b>(2 AU)을 기선으로 본 각입니다. " +
           "그 절반은 <b>반지름</b>(1 AU)을 기선으로 본 각이 되죠. " +
           "기준을 <b>태양–별</b> 사이로 잡는 것이 계산에 편하기 때문에 절반을 씁니다."
    },
    {
      id: 5, star: "🔢", title: "1 나누기 연주시차",
      story: "<b>시리우스</b>를 골라 연주시차를 읽고, <b>1 ÷ 연주시차</b>를 해 보자. " +
             "무엇이 나올까?",
      scene: "dist", setup: { starName: "프록시마 센타우리" },
      allow: ["star"],
      predict: { q: "연주시차가 1″인 별까지의 거리를 무엇이라고 할까?",
                 opts: ["1 광년", "1 파섹(pc)", "1 천문단위(AU)"], ans: 1 },
      goals: [{ key: "sirius", text: "<b>시리우스</b>를 골라 연주시차와 거리 확인하기" }],
      why: "<b>거리(pc)</b> 가 나옵니다. 시리우스의 연주시차는 약 <b>0.379″</b>이고, " +
           "1 ÷ 0.379 ≈ <b>2.6 pc</b> — 표에 적힌 거리와 같습니다.<br>" +
           "이렇게 되는 이유는 <b>파섹의 정의</b> 때문입니다. " +
           "“연주시차가 <b>1″</b>인 별까지의 거리를 <b>1 파섹</b>이라고 한다”고 정해 두었으니, " +
           "<b>거리(pc) = 1 ÷ 연주시차(″)</b> 가 저절로 성립합니다.<br>" +
           "<em>1 pc 은 약 3.26 광년입니다.</em>"
    },
    {
      id: 6, star: "🪐", title: "목성에서 재면?",
      story: "아주 먼 별은 연주시차가 너무 작아 재기 어렵다. " +
             "만약 지구가 아니라 <b>목성</b>(태양에서 약 5배 먼 곳)에서 잰다면 시차는 어떻게 될까? " +
             "궤도 크기를 키워 확인하자.",
      scene: "orbit", setup: { starName: "북극성", month: "both", orbit: 1 },
      allow: ["orbit", "star", "month"],
      predict: { q: "목성에서 재면 같은 별의 시차는?",
                 opts: ["더 크게 측정된다", "더 작게 측정된다", "똑같다"], ans: 0 },
      goals: [{ key: "jupiter", text: "궤도를 <b>5배 이상</b>으로 키워 보기" }],
      why: "<b>더 크게 측정됩니다.</b> 목성의 공전 궤도가 지구보다 <b>약 5배</b> 크니까 " +
           "기선이 5배 길어지고, 시차도 <b>약 5배</b>가 됩니다.<br>" +
           "미션 3에서 <b>구멍 사이를 벌렸더니 시차가 커진 것</b>과 똑같은 이야기예요. " +
           "책상 위 구멍이든 행성의 공전 궤도든, <b>기선이 길수록 시차가 크다</b>는 규칙 하나입니다.<br>" +
           "<em>실제로도 더 멀리 있는 탐사선이나 우주 망원경을 쓰면 더 먼 별의 거리를 잴 수 있습니다.</em>"
    }
  ];

  /* ---------------------------------------------------------
     2. 장면 · 크기
     --------------------------------------------------------- */
  function sceneKind() {
    if (S.scene === "mission") return S.mission ? S.mission.scene : "desk";
    return S.scene;
  }

  function layout() {
    if (!canvas) return;
    var r = canvas.getBoundingClientRect();
    cssW = Math.max(320, Math.round(r.width || 900));
    cssH = Math.max(200, Math.round(r.height || cssW / 1.62));
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------------------------------------------------------
     3. 그리기
     --------------------------------------------------------- */
  var COL = { ink: "#e2e8f0", faint: "#64748b", line: "#94a3b8",
              left: "#38bdf8", right: "#f472b6", star: "#fde047" };

  function draw() {
    if (!ctx) return;
    var g = ctx;
    var grad = g.createLinearGradient(0, 0, 0, cssH);
    grad.addColorStop(0, "#0b1220");
    grad.addColorStop(1, "#1e293b");
    g.fillStyle = grad;
    g.fillRect(0, 0, cssW, cssH);
    var k = sceneKind();
    if (k === "desk") drawDesk(g);
    else if (k === "orbit") drawOrbit(g);
    else drawDist(g);
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* ---- 장면 ① 책상 위 시차 (선생님 활동지) ---- */
  function drawDesk(g) {
    var cx = cssW / 2;
    var topY = 46, botY = cssH - 52;
    var pxPerCm = (botY - topY) / BG_DIST;        // 세로 : 구멍 → 배경
    var scalePx = (cssW * 0.86) / BG_SPAN;        // 가로 : 숫자표 폭

    function X(cm) { return cx + cm * scalePx; }
    function Y(cm) { return botY - cm * pxPerCm; }   // cm 는 구멍에서의 거리

    /* 배경 숫자표 */
    g.strokeStyle = COL.line; g.lineWidth = 2;
    g.beginPath(); g.moveTo(X(-BG_SPAN / 2), topY); g.lineTo(X(BG_SPAN / 2), topY); g.stroke();
    g.font = "12px sans-serif"; g.textAlign = "center";
    for (var n = P.SCALE_MIN; n <= P.SCALE_MAX; n++) {
      var t = (n - P.SCALE_MIN) / (P.SCALE_MAX - P.SCALE_MIN);
      var x = X(-BG_SPAN / 2 + BG_SPAN * t);
      g.strokeStyle = "rgba(148,163,184,.6)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, topY); g.lineTo(x, topY - 7); g.stroke();
      g.fillStyle = COL.faint;
      g.fillText(String(n), x, topY - 12);
    }

    /* 구멍 두 개 */
    var holes = [-S.base / 2, S.base / 2];
    var readings = holes.map(function (h) {
      return P.scaleReading(h, S.deskDist, BG_DIST, BG_SPAN);
    });

    /* 시선 — 구멍 → 별 → 배경 */
    holes.forEach(function (h, i) {
      var show = (S.eye === "both") || (S.eye === "left" && i === 0) || (S.eye === "right" && i === 1);
      if (!show) return;
      var col = i === 0 ? COL.left : COL.right;
      var rd = readings[i];
      var bgT = (rd - P.SCALE_MIN) / (P.SCALE_MAX - P.SCALE_MIN);
      var bgX = X(-BG_SPAN / 2 + BG_SPAN * bgT);
      g.strokeStyle = col; g.lineWidth = 2;
      g.beginPath(); g.moveTo(X(h), Y(0)); g.lineTo(bgX, topY); g.stroke();
      /* 배경에서 겹쳐 보이는 자리 */
      g.fillStyle = col;
      g.beginPath(); g.arc(bgX, topY + 10, 6, 0, Math.PI * 2); g.fill();
      g.font = "bold 14px sans-serif"; g.textAlign = "center";
      g.fillText(rd.toFixed(1), bgX, topY + 32);
    });

    /* 별 */
    var sx = X(0), sy = Y(S.deskDist);
    var rg = g.createRadialGradient(sx, sy, 1, sx, sy, 26);
    rg.addColorStop(0, "rgba(253,224,71,.95)");
    rg.addColorStop(1, "rgba(253,224,71,0)");
    g.fillStyle = rg;
    g.beginPath(); g.arc(sx, sy, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = COL.star;
    g.beginPath(); g.arc(sx, sy, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = COL.ink; g.font = "bold 14px sans-serif"; g.textAlign = "left";
    g.fillText("별 (" + S.deskDist + " cm)", sx + 16, sy + 5);

    /* 구멍 그리기 */
    holes.forEach(function (h, i) {
      var col = i === 0 ? COL.left : COL.right;
      var on = (S.eye === "both") || (S.eye === "left" && i === 0) || (S.eye === "right" && i === 1);
      g.fillStyle = on ? col : "rgba(100,116,139,.5)";
      g.beginPath(); g.arc(X(h), Y(0), 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = on ? col : COL.faint;
      g.font = "bold 13px sans-serif"; g.textAlign = "center";
      g.fillText(i === 0 ? "왼쪽" : "오른쪽", X(h), Y(0) + 24);
    });

    /* 기선 표시 */
    g.strokeStyle = COL.line; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(X(holes[0]), Y(0) + 34); g.lineTo(X(holes[1]), Y(0) + 34); g.stroke();
    g.fillStyle = COL.ink; g.font = "13px sans-serif"; g.textAlign = "center";
    g.fillText("기선 " + S.base + " cm", cx, Y(0) + 50);

    /* 시차각 */
    if (S.eye === "both") {
      var deg = P.parallaxDeg(S.base, S.deskDist);
      g.fillStyle = "#fbbf24"; g.font = "bold 18px sans-serif"; g.textAlign = "left";
      g.fillText("시차 " + deg.toFixed(1) + "°", 16, 26);
      g.fillStyle = COL.faint; g.font = "14px sans-serif";
      g.fillText("눈금 차이 " + Math.abs(readings[0] - readings[1]).toFixed(1) + " 칸", 16, 48);
      /* ⚠ 가로(60 cm)와 세로(110 cm)의 축척이 다르다. 눈금 1~20 을 읽을 수 있게
         가로를 늘려 놓았기 때문이다. 그래서 **그림의 벌어진 각은 실제보다 크다.**
         겹쳐 보이는 눈금 값은 정확하므로, 각도는 숫자를 보게 한다. */
      g.fillText("(가로를 늘려 그려서 각이 크게 보입니다 — 각도는 위 숫자를 보세요)", 16, 68);
    } else {
      g.fillStyle = COL.faint; g.font = "14px sans-serif"; g.textAlign = "left";
      g.fillText("👀 '둘 다' 를 누르면 두 시선을 겹쳐 볼 수 있습니다", 16, 26);
    }
  }

  /* ---- 장면 ② 연주시차 (지구 공전) ---- */
  function drawOrbit(g) {
    var st = P.info(star(), S.orbit);
    var cx = cssW * 0.24, cy = cssH * 0.56;
    /* 궤도 반지름은 **배수에 정비례**해야 한다. 화면에 "궤도 6배" 라고 써 놓고
       그림이 1.5배만 커지면(예전 `0.65 + orbit*0.07`) 미션 6 이 통째로 흔들린다.
       최대(6배)를 무대에 맞추고 나머지를 그 비율로 그린다. */
    var orbR = Math.min(cssW * 0.16, cssH * 0.26) * (S.orbit / 6);

    /* 태양과 궤도 */
    g.strokeStyle = "rgba(148,163,184,.45)"; g.lineWidth = 1.5;
    g.setLineDash([5, 5]);
    g.beginPath(); g.ellipse(cx, cy, orbR, orbR * 0.42, 0, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    var sg = g.createRadialGradient(cx, cy, 1, cx, cy, 22);
    sg.addColorStop(0, "rgba(253,224,71,.95)"); sg.addColorStop(1, "rgba(253,224,71,0)");
    g.fillStyle = sg; g.beginPath(); g.arc(cx, cy, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fde047"; g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = COL.faint; g.font = "13px sans-serif"; g.textAlign = "center";
    g.fillText("태양", cx, cy + 30);

    /* 지구 두 자리 */
    var A = { x: cx - orbR, y: cy }, B = { x: cx + orbR, y: cy };
    var showA = (S.month === "A" || S.month === "both");
    var showB = (S.month === "B" || S.month === "both");

    /* 별 — 실제 거리는 어마어마하므로 화면에서는 로그로 눌러 놓는다 */
    var t = clamp((Math.log(st.d) / Math.LN10 + 0.2) / 2.8, 0, 1);
    var starX = cssW * (0.55 + 0.33 * t), starY = cssH * 0.30;

    /* 먼 배경 별들 */
    g.fillStyle = "rgba(226,232,240,.5)";
    for (var i = 0; i < 26; i++) {
      var bx = cssW * 0.42 + ((i * 137) % Math.round(cssW * 0.56));
      var by = 14 + ((i * 71) % Math.round(cssH * 0.20));
      g.beginPath(); g.arc(bx, by, 1.5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = COL.faint; g.font = "12px sans-serif"; g.textAlign = "right";
    g.fillText("아주 먼 배경 별들", cssW - 12, 14);

    /* 시선 — 지구 → 별 → 배경(맨 위) */
    [[A, showA, COL.left, "🅐 1월"], [B, showB, COL.right, "🅑 7월"]].forEach(function (e) {
      var pos = e[0], show = e[1], col = e[2], label = e[3];
      g.fillStyle = show ? col : "rgba(100,116,139,.55)";
      g.beginPath(); g.arc(pos.x, pos.y, 7, 0, Math.PI * 2); g.fill();
      g.font = "bold 13px sans-serif"; g.textAlign = "center";
      g.fillStyle = show ? col : COL.faint;
      g.fillText(label, pos.x, pos.y + 24);
      if (!show) return;
      /* 별을 지나 배경까지 늘린 선.
         ⚠ 위쪽 모서리까지만 늘리면 먼 별에서는 x 가 무대 밖으로 나간다.
           위 모서리와 오른쪽 모서리 중 **먼저 닿는 쪽**에서 멈춘다. */
      var dx = starX - pos.x, dy = starY - pos.y;
      var kTop = (8 - starY) / dy;                       // 위 모서리까지
      var k = kTop;
      if (dx > 0) {
        var kRight = (cssW - 12 - starX) / dx;           // 오른쪽 모서리까지
        if (kRight > 0 && kRight < k) k = kRight;
      }
      var ex = starX + dx * k, ey = starY + dy * k;
      g.strokeStyle = col; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(pos.x, pos.y);
      g.lineTo(ex, ey);
      g.stroke();
      g.fillStyle = col;
      g.beginPath(); g.arc(ex, ey + (k === kTop ? 5 : 0), 5, 0, Math.PI * 2); g.fill();
    });

    /* 별 */
    var rg2 = g.createRadialGradient(starX, starY, 1, starX, starY, 22);
    rg2.addColorStop(0, "rgba(253,224,71,.95)"); rg2.addColorStop(1, "rgba(253,224,71,0)");
    g.fillStyle = rg2; g.beginPath(); g.arc(starX, starY, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = COL.star; g.beginPath(); g.arc(starX, starY, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = COL.ink; g.font = "bold 15px sans-serif"; g.textAlign = "center";
    g.fillText("별 " + st.name, starX, starY - 20);

    /* 값 상자 */
    var bw = Math.min(320, cssW * 0.40);
    g.fillStyle = "rgba(15,23,42,.75)";
    g.strokeStyle = "rgba(148,163,184,.45)"; g.lineWidth = 1.5;
    roundRect(g, 14, 14, bw, S.month === "both" ? 96 : 74, 10); g.fill(); g.stroke();
    g.textAlign = "left"; g.font = "bold 15px sans-serif";
    g.fillStyle = COL.ink;
    g.fillText("거리 " + fmt(st.d) + " pc (" + fmt(st.ly) + " 광년)", 28, 38);
    g.fillStyle = "#fbbf24";
    g.fillText("연주시차 " + fmtSec(st.p), 28, 62);
    if (S.month === "both") {
      g.fillStyle = COL.faint; g.font = "13px sans-serif";
      g.fillText("시차 ∠ASB = " + fmtSec(st.p * 2) + " → 그 절반이 연주시차", 28, 86);
    }

    if (S.orbit > 1) {
      g.fillStyle = "#a78bfa"; g.font = "bold 14px sans-serif"; g.textAlign = "right";
      g.fillText("궤도 " + S.orbit + "배 → 연주시차도 약 " + S.orbit + "배", cssW - 14, cssH - 14);
    } else if (!st.measurable) {
      g.fillStyle = "#f87171"; g.font = "bold 14px sans-serif"; g.textAlign = "right";
      g.fillText("⚠ 너무 작아 지상에서는 재기 어렵다", cssW - 14, cssH - 14);
    }
  }

  /* ---- 장면 ③ 연주시차와 거리 ---- */
  function drawDist(g) {
    var st = P.info(star(), 1);
    var ax = cssW * 0.12, aw = cssW * 0.80, ay = cssH * 0.72, ah = cssH * 0.52;

    /* 축 */
    g.strokeStyle = COL.line; g.lineWidth = 2;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + aw, ay); g.moveTo(ax, ay); g.lineTo(ax, ay - ah); g.stroke();
    g.fillStyle = COL.faint; g.font = "13px sans-serif"; g.textAlign = "center";
    g.fillText("거리 (pc) →", ax + aw / 2, ay + 40);
    g.save(); g.translate(ax - 34, ay - ah / 2); g.rotate(-Math.PI / 2);
    g.fillText("← 연주시차 (″)", 0, 0); g.restore();

    function xOf(pc) { return ax + aw * clamp((Math.log(pc) / Math.LN10 + 0.2) / 2.8, 0, 1); }
    function yOf(p) { return ay - ah * clamp((Math.log(p) / Math.LN10 + 2.5) / 3.2, 0, 1); }

    /* d = 1/p 곡선 */
    g.strokeStyle = "#38bdf8"; g.lineWidth = 2.5;
    g.beginPath();
    for (var i = 0; i <= 80; i++) {
      var pc = Math.pow(10, -0.2 + 2.8 * i / 80);
      var x = xOf(pc), y = yOf(1 / pc);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();

    /* 눈금 */
    [1, 10, 100].forEach(function (pc) {
      var x = xOf(pc);
      g.strokeStyle = "rgba(148,163,184,.4)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, ay); g.lineTo(x, ay - ah); g.stroke();
      g.fillStyle = COL.faint; g.font = "12px sans-serif"; g.textAlign = "center";
      g.fillText(pc + " pc", x, ay + 18);
    });

    /* 잴 수 있는 한계 */
    var ly = yOf(P.LIMIT_GROUND);
    g.strokeStyle = "rgba(248,113,113,.7)"; g.lineWidth = 1.5;
    g.setLineDash([6, 4]);
    g.beginPath(); g.moveTo(ax, ly); g.lineTo(ax + aw, ly); g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#f87171"; g.font = "12px sans-serif"; g.textAlign = "left";
    g.fillText("0.01″ — 이보다 작으면 재기 어렵다", ax + 6, ly - 6);

    /* 별들 */
    P.STARS.forEach(function (s) {
      var inf = P.info(s, 1);
      var x = xOf(inf.d), y = yOf(inf.p);
      var on = (s.name === st.name);
      g.fillStyle = on ? "#fde047" : "rgba(226,232,240,.6)";
      g.beginPath(); g.arc(x, y, on ? 7 : 4, 0, Math.PI * 2); g.fill();
      if (on) {
        g.fillStyle = "#fde047"; g.font = "bold 14px sans-serif"; g.textAlign = "center";
        g.fillText(s.name, x, y - 14);
      }
    });

    /* 값 상자 */
    g.fillStyle = "rgba(15,23,42,.78)";
    g.strokeStyle = "rgba(148,163,184,.45)"; g.lineWidth = 1.5;
    var bw = Math.min(340, cssW * 0.44);
    roundRect(g, cssW - bw - 14, 14, bw, 96, 10); g.fill(); g.stroke();
    g.textAlign = "left";
    g.fillStyle = COL.ink; g.font = "bold 16px sans-serif";
    g.fillText(st.name, cssW - bw, 38);
    g.fillStyle = "#fbbf24"; g.font = "15px sans-serif";
    g.fillText("연주시차 " + fmtSec(st.p), cssW - bw, 62);
    g.fillStyle = COL.ink;
    g.fillText("1 ÷ " + st.p.toFixed(3) + " = " + fmt(st.simple) + " pc", cssW - bw, 86);
  }

  function fmt(v) {
    if (!isFinite(v)) return "∞";
    if (v >= 1000) return Math.round(v).toLocaleString();
    if (v >= 100) return v.toFixed(0);
    if (v >= 10) return v.toFixed(1);
    return v.toFixed(2);
  }
  function fmtSec(s) {
    if (s >= 1) return s.toFixed(3) + "″";
    if (s >= 0.01) return s.toFixed(3) + "″";
    return s.toFixed(4) + "″";
  }

  /* ---------------------------------------------------------
     4. 계기판
     --------------------------------------------------------- */
  function setBar(id, val, full) {
    $(id).querySelector(".bar-fill").style.width = clamp(val / full * 100, 0, 100) + "%";
  }
  function barText(id, t) { $(id).querySelector(".bar-val").textContent = t; }
  function ro(i, name, val, unit) {
    $("roName" + i).textContent = name;
    $("roVal" + i).textContent = val;
    $("roUnit" + i).textContent = unit || "";
  }

  function updatePanel() {
    var k = sceneKind();

    if (k === "desk") {
      var deg = P.parallaxDeg(S.base, S.deskDist);
      var rL = P.scaleReading(-S.base / 2, S.deskDist, BG_DIST, BG_SPAN);
      var rR = P.scaleReading(S.base / 2, S.deskDist, BG_DIST, BG_SPAN);
      $("gaugeTitle").textContent = "📐 시차";
      $("gaugeSub").innerHTML = "구멍을 바꿔 보면 별이 <b>다른 숫자</b>와 겹친다";
      $("barName1").textContent = "시차";
      $("rowB").classList.add("hidden");
      setBar("barA", deg, 60); barText("barA", deg.toFixed(1) + "°");
      ro(1, "별까지 거리", S.deskDist, " cm");
      ro(2, "기선(구멍 사이)", S.base, " cm");
      ro(3, "시차", deg.toFixed(1), "°");
      ro(4, "눈금 차이", Math.abs(rL - rR).toFixed(1), " 칸");
      $("fLaw").innerHTML = '시차 = 2 × arctan( 기선 ÷ 2 ÷ 거리 ) = 2 × arctan( ' +
                            (S.base / 2) + ' ÷ ' + S.deskDist + ' ) = <span class="k">' + deg.toFixed(1) + '°</span>';
      $("fWhy").innerHTML = '<em>왼쪽 구멍 → 눈금 ' + rL.toFixed(1) +
                            ' · 오른쪽 구멍 → 눈금 ' + rR.toFixed(1) + '</em>';
      $("graphTitle").textContent = "📈 거리와 시차";
      $("graphSub").innerHTML = "멀수록 시차는 <b>작아진다</b>";

    } else if (k === "orbit") {
      var st = P.info(star(), S.orbit);
      var base1 = P.info(star(), 1);
      $("gaugeTitle").textContent = "🌍 연주시차";
      $("gaugeSub").innerHTML = "∠ASB 의 <b>절반</b>이 연주시차";
      $("barName1").textContent = "연주시차";
      $("barName2").textContent = "∠ASB";
      $("rowB").classList.remove("hidden");
      var full = Math.max(st.p * 2, 0.05);
      setBar("barA", st.p, full); barText("barA", fmtSec(st.p));
      setBar("barB", st.p * 2, full); barText("barB", fmtSec(st.p * 2));
      ro(1, "거리", fmt(st.d), " pc");
      ro(2, "기선(궤도 반지름)", S.orbit, " AU");
      ro(3, "연주시차", fmtSec(st.p), "");
      ro(4, "지구 대비", (st.p / base1.p).toFixed(1), " 배");
      $("fLaw").innerHTML = '연주시차 = 시차 ∠ASB 의 <span class="t">절반</span> = ' +
                            fmtSec(st.p * 2) + ' ÷ 2 = <span class="k">' + fmtSec(st.p) + '</span>';
      $("fWhy").innerHTML = (S.orbit > 1)
        ? '<em>궤도가 ' + S.orbit + '배 → 기선이 ' + S.orbit + '배 → 연주시차도 약 ' + S.orbit + '배</em>'
        : '<em>지구가 6개월 동안 궤도의 반대편으로 옮겨 가면서 생기는 각이다</em>';
      $("graphTitle").textContent = "📈 거리와 연주시차";
      $("graphSub").innerHTML = "거리 × 연주시차 = <b>1</b>";

    } else {
      var s2 = P.info(star(), 1);
      $("gaugeTitle").textContent = "📏 연주시차와 거리";
      $("gaugeSub").innerHTML = "거리(pc) = <b>1 ÷ 연주시차(″)</b>";
      $("barName1").textContent = "연주시차";
      $("rowB").classList.add("hidden");
      setBar("barA", s2.p, 0.8); barText("barA", fmtSec(s2.p));
      ro(1, "거리", fmt(s2.d), " pc");
      ro(2, "광년으로", fmt(s2.ly), " 광년");
      ro(3, "연주시차", fmtSec(s2.p), "");
      ro(4, "1 ÷ 연주시차", fmt(s2.simple), " pc");
      $("fLaw").innerHTML = '거리 = <span class="t">1</span> ÷ 연주시차 = 1 ÷ ' + s2.p.toFixed(3) +
                            ' = <span class="k">' + fmt(s2.simple) + '</span> pc';
      $("fWhy").innerHTML = s2.measurable
        ? '<em>연주시차가 1″ 인 거리를 <b>1 파섹</b>이라고 정했기 때문에 이렇게 간단해진다</em>'
        : '<em>⚠ 연주시차가 0.01″ 보다 작다 — 지상 망원경으로는 재기 어려운 별이다</em>';
      $("graphTitle").textContent = "📈 거리와 연주시차";
      $("graphSub").innerHTML = "반비례 — 곱하면 언제나 <b>1</b>";
    }

    $("tip").textContent = tipText();
    syncMissionGoals();
  }

  function tipText() {
    var k = sceneKind();
    if (k === "desk") return "구멍을 바꿔 가며 별이 겹치는 숫자를 읽어 보세요";
    if (k === "orbit") return "'두 자리 겹쳐 보기' 로 ∠ASB 를 확인하세요";
    return "별을 골라 1 ÷ 연주시차 를 확인하세요";
  }

  /* ---------------------------------------------------------
     5. 그래프
     --------------------------------------------------------- */
  function drawGraph() {
    var c = $("graph");
    if (!c) return;
    var r = c.getBoundingClientRect();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.max(200, Math.round(r.width)), h = Math.max(100, Math.round(r.height));
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    var g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    var pad = 26, k = sceneKind();

    g.strokeStyle = "#cbd5e1"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(pad, h - pad); g.lineTo(w - 6, h - pad);
    g.moveTo(pad, 6); g.lineTo(pad, h - pad); g.stroke();

    if (k === "desk") {
      /* 거리 15~90 cm 에서의 시차 곡선 */
      g.strokeStyle = "#0284c7"; g.lineWidth = 2.5;
      g.beginPath();
      for (var i = 0; i <= 60; i++) {
        var d = 15 + (90 - 15) * i / 60;
        var x = pad + (w - pad - 6) * (d - 15) / 75;
        var y = (h - pad) - (h - pad - 6) * clamp(P.parallaxDeg(S.base, d) / 60, 0, 1);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      var px = pad + (w - pad - 6) * (S.deskDist - 15) / 75;
      var py = (h - pad) - (h - pad - 6) * clamp(P.parallaxDeg(S.base, S.deskDist) / 60, 0, 1);
      g.fillStyle = "#dc2626"; g.beginPath(); g.arc(px, py, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#64748b"; g.font = "12px sans-serif"; g.textAlign = "center";
      g.fillText("거리(cm)", w / 2, h - 6);

    } else {
      /* 별들의 거리 vs 연주시차 (로그) */
      function xOf(pc) { return pad + (w - pad - 8) * clamp((Math.log(pc) / Math.LN10 + 0.2) / 2.8, 0, 1); }
      function yOf(p) { return (h - pad) - (h - pad - 8) * clamp((Math.log(p) / Math.LN10 + 2.5) / 3.2, 0, 1); }
      g.strokeStyle = "#38bdf8"; g.lineWidth = 2;
      g.beginPath();
      for (var j = 0; j <= 60; j++) {
        var pc = Math.pow(10, -0.2 + 2.8 * j / 60);
        var x2 = xOf(pc), y2 = yOf(1 / pc);
        if (j === 0) g.moveTo(x2, y2); else g.lineTo(x2, y2);
      }
      g.stroke();
      var cur = P.info(star(), 1);
      P.STARS.forEach(function (s) {
        var inf = P.info(s, 1);
        var on = s.name === cur.name;
        g.fillStyle = on ? "#dc2626" : "#94a3b8";
        g.beginPath(); g.arc(xOf(inf.d), yOf(inf.p), on ? 6 : 3.5, 0, Math.PI * 2); g.fill();
      });
      g.fillStyle = "#64748b"; g.font = "12px sans-serif"; g.textAlign = "center";
      g.fillText("거리(pc) — 로그", w / 2, h - 6);
    }
  }

  /* ---------------------------------------------------------
     6. 조작 패널
     --------------------------------------------------------- */
  function syncControls() {
    var k = sceneKind();
    var allow = (S.scene === "mission" && S.mission) ? S.mission.allow : null;
    document.querySelectorAll("[data-for]").forEach(function (el) {
      var scenes = el.getAttribute("data-for").split(/\s+/);
      var need = el.getAttribute("data-need");
      var okScene = scenes.indexOf(S.scene) >= 0 || scenes.indexOf(k) >= 0;
      var okNeed = true;
      if (S.scene === "mission" && need) okNeed = allow && allow.indexOf(need) >= 0;
      el.classList.toggle("hidden", !(okScene && okNeed));
    });
    $("missionCard").classList.toggle("hidden", S.scene !== "mission");
    $("valDeskDist").textContent = S.deskDist + " cm";
    $("valBase").textContent = S.base + " cm";
    $("valOrbit").textContent = S.orbit + " 배" + (S.orbit === 1 ? " (지구)" : (S.orbit === 5 ? " (목성쯤)" : ""));
  }

  function setChips(id, val) {
    var w = $(id); if (!w) return;
    w.querySelectorAll(".chip").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-val") === String(val));
    });
  }

  /* ---------------------------------------------------------
     7. 미션
     --------------------------------------------------------- */
  function loadProgress() {
    try { return JSON.parse(sessionStorage.getItem("px_missions") || "[]"); } catch (e) { return []; }
  }
  function saveProgress(l) { try { sessionStorage.setItem("px_missions", JSON.stringify(l)); } catch (e) {} }

  function renderMissionList() {
    var done = loadProgress(), host = $("missionList");
    host.innerHTML = "";
    MISSIONS.forEach(function (M) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "mcard" + (S.mission && S.mission.id === M.id ? " on" : "") +
                    (done.indexOf(M.id) >= 0 ? " done" : "");
      b.innerHTML = '<span class="mno">미션 ' + M.id + (done.indexOf(M.id) >= 0 ? " ✅" : "") + '</span>' +
                    '<span class="mtitle"><span class="mstar">' + M.star + '</span> ' + M.title + '</span>';
      b.addEventListener("click", function () { pickMission(M); });
      host.appendChild(b);
    });
    $("missionScore").textContent = done.length + " / " + MISSIONS.length;
  }

  function pickMission(M) {
    /* 미션마다 쓰는 장면이 다르므로 장면부터 반드시 맞춘다 */
    S.scene = "mission";
    $("scenes").querySelectorAll(".scene-btn").forEach(function (x) {
      x.classList.toggle("on", x.getAttribute("data-scene") === "mission");
    });
    S.mission = M; S.predictPick = null;
    S.missionState = M.predict ? "predict" : "ready";
    Object.keys(M.setup || {}).forEach(function (kk) { S[kk] = M.setup[kk]; });
    seen = { eyes: {}, far: false, wide: false, both: false, sirius: false, jupiter: false };

    $("rngDeskDist").value = S.deskDist; $("rngBase").value = S.base; $("rngOrbit").value = S.orbit;
    $("selStar").value = S.starName;
    setChips("chipEye", S.eye); setChips("chipMonth", S.month);
    syncControls(); renderMissionList(); renderMissionBody(); refresh();
  }

  function renderMissionBody() {
    var M = S.mission, body = $("missionBody");
    if (!M) { body.classList.add("hidden"); return; }
    body.classList.remove("hidden");
    $("mTitle").textContent = M.star + " 미션 " + M.id + " · " + M.title;
    $("mStory").innerHTML = M.story;

    var pd = $("mPredict");
    if (M.predict && S.missionState === "predict") {
      pd.classList.remove("hidden");
      $("mQ").innerHTML = M.predict.q;
      var opts = $("mOpts"); opts.innerHTML = "";
      M.predict.opts.forEach(function (t, i) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "opt";
        /* 예측 보기에는 굵은 글씨를 쓰지 않는다 — 정답만 굵으면 답이 드러난다(2026-09-28). */
        b.innerHTML = String(t).replace(/<\/?b>/g, "");
        b.addEventListener("click", function () {
          S.predictPick = i; S.missionState = "ready"; renderMissionBody();
        });
        opts.appendChild(b);
      });
    } else pd.classList.add("hidden");

    var gl = $("mGoals");
    if (M.goals && S.missionState !== "predict") {
      gl.classList.remove("hidden");
      gl.innerHTML = '<div class="q">목표</div>' + M.goals.map(function (gg) {
        var ok = checkGoal(gg.key);
        return '<div class="goal' + (ok ? " ok" : "") + '">' + (ok ? "✅ " : "⬜ ") + gg.text + '</div>';
      }).join("");
    } else gl.classList.add("hidden");

    var vd = $("mVerdict");
    if (S.missionState === "won") {
      vd.className = "verdict ok";
      vd.innerHTML = "<b>🎉 성공!</b>" + M.why +
        (M.predict && S.predictPick != null
          ? "<br><br>" + (S.predictPick === M.predict.ans
              ? "예측도 <b>맞았습니다.</b> 잘했어요!"
              : "예측은 달랐지만 <b>직접 확인해서 알아냈습니다.</b> 그것이 더 중요해요.")
          : "");
      vd.classList.remove("hidden");
    } else if (S.missionState === "predict") vd.classList.add("hidden");
    else {
      vd.className = "verdict no";
      vd.innerHTML = "<b>직접 확인하세요</b>목표를 모두 채우면 이유가 열립니다.";
      vd.classList.remove("hidden");
    }
  }

  /* 목표 판정 — 새 목표를 만들면 여기에 분기를 하나 넣는다 */
  function checkGoal(key) {
    switch (key) {
      case "eyeBoth": return !!(seen.eyes.left && seen.eyes.right);
      case "far": return seen.far;
      case "wide": return seen.wide;
      case "both": return seen.both;
      case "sirius": return seen.sirius;
      case "jupiter": return seen.jupiter;
      default: return false;
    }
  }

  function noteSeen() {
    var k = sceneKind();
    if (k === "desk") {
      if (S.eye === "left" || S.eye === "both") seen.eyes.left = true;
      if (S.eye === "right" || S.eye === "both") seen.eyes.right = true;
      if (S.deskDist >= 80) seen.far = true;
      if (S.base >= 20) seen.wide = true;
    } else if (k === "orbit") {
      if (S.month === "both") seen.both = true;
      if (S.orbit >= 5) seen.jupiter = true;
    } else {
      if (S.starName === "시리우스") seen.sirius = true;
    }
  }

  function syncMissionGoals() {
    if (S.scene !== "mission" || !S.mission || S.missionState === "predict") return;
    var M = S.mission;
    if (!M.goals) return;
    var all = M.goals.every(function (gg) { return checkGoal(gg.key); });
    if (all && S.missionState !== "won") {
      S.missionState = "won";
      var done = loadProgress();
      if (done.indexOf(M.id) < 0) { done.push(M.id); saveProgress(done); }
      renderMissionList(); renderMissionBody();
    } else if (S.missionState !== "won") {
      var gl = $("mGoals");
      if (!gl.classList.contains("hidden")) {
        var rows = gl.querySelectorAll(".goal");
        M.goals.forEach(function (gg, i) {
          if (!rows[i]) return;
          var ok = checkGoal(gg.key);
          rows[i].className = "goal" + (ok ? " ok" : "");
          rows[i].innerHTML = (ok ? "✅ " : "⬜ ") + gg.text;
        });
      }
    }
  }

  /* ---------------------------------------------------------
     8. 실험 기록
     --------------------------------------------------------- */
  function addRecord() {
    var k = sceneKind(), r;
    if (k === "desk") {
      r = { scene: "책상 위 시차", who: "별", base: S.base + " cm",
            dist: S.deskDist + " cm", par: P.parallaxDeg(S.base, S.deskDist).toFixed(1) + "°" };
    } else if (k === "orbit") {
      var st = P.info(star(), S.orbit);
      r = { scene: "연주시차", who: st.name, base: S.orbit + " AU",
            dist: fmt(st.d) + " pc", par: fmtSec(st.p) };
    } else {
      var s2 = P.info(star(), 1);
      r = { scene: "연주시차와 거리", who: s2.name, base: "1 AU",
            dist: fmt(s2.d) + " pc", par: fmtSec(s2.p) };
    }
    records.push(r);
    renderRecords();
    window.PdfKit.toast("기록했습니다. (" + records.length + "번째)", "ok");
  }

  function renderRecords() {
    var body = $("recBody");
    body.innerHTML = "";
    records.forEach(function (r, i) {
      var tr = document.createElement("tr");
      tr.innerHTML = "<td>" + (i + 1) + "</td><td>" + r.scene + "</td><td>" + r.who +
                     "</td><td>" + r.base + "</td><td>" + r.dist + "</td><td><b>" + r.par + "</b></td>";
      body.appendChild(tr);
    });
    $("recEmpty").classList.toggle("hidden", records.length > 0);
  }

  /* ---------------------------------------------------------
     9. 다시 그리기
     --------------------------------------------------------- */
  function refresh() { noteSeen(); draw(); updatePanel(); drawGraph(); }

  /* ---------------------------------------------------------
     10. 연결
     --------------------------------------------------------- */
  function bindChips(id, fn) {
    var w = $(id); if (!w) return;
    w.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".chip") : null;
      if (!b) return;
      w.querySelectorAll(".chip").forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      fn(b.getAttribute("data-val"));
    });
  }
  function range(id, fn) {
    var el = $(id);
    if (el) el.addEventListener("input", function () { fn(parseFloat(el.value)); });
  }

  function bind() {
    $("scenes").addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".scene-btn") : null;
      if (!b) return;
      $("scenes").querySelectorAll(".scene-btn").forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      S.scene = b.getAttribute("data-scene");
      if (S.scene === "mission" && !S.mission) pickMission(MISSIONS[0]);
      else { syncControls(); refresh(); }
      renderMissionList();
    });

    $("btnReset").addEventListener("click", function () {
      S.deskDist = 40; S.base = 10; S.eye = "left"; S.month = "A"; S.orbit = 1;
      $("rngDeskDist").value = 40; $("rngBase").value = 10; $("rngOrbit").value = 1;
      setChips("chipEye", "left"); setChips("chipMonth", "A");
      syncControls(); refresh();
    });
    $("btnRecord").addEventListener("click", addRecord);
    $("btnClearRec").addEventListener("click", function () {
      if (!records.length) return;
      if (!confirm("기록을 모두 지울까요?")) return;
      records.length = 0; renderRecords();
    });

    range("rngDeskDist", function (v) { S.deskDist = v; syncControls(); refresh(); });
    range("rngBase", function (v) { S.base = v; syncControls(); refresh(); });
    range("rngOrbit", function (v) { S.orbit = v; syncControls(); refresh(); });
    bindChips("chipEye", function (v) { S.eye = v; refresh(); });
    bindChips("chipMonth", function (v) { S.month = v; refresh(); });

    var sel = $("selStar");
    P.STARS.forEach(function (s) {
      var o = document.createElement("option");
      o.value = s.name; o.textContent = s.name + " (" + s.note + ")";
      sel.appendChild(o);
    });
    sel.value = S.starName;
    sel.addEventListener("change", function () { S.starName = sel.value; refresh(); });

    if (window.ResizeObserver) {
      new ResizeObserver(function () { layout(); draw(); drawGraph(); }).observe(canvas);
    } else {
      window.addEventListener("resize", function () { layout(); draw(); drawGraph(); });
    }
  }

  function boot() {
    canvas = $("stage");
    layout(); bind(); syncControls();
    renderMissionList(); renderRecords(); refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  /* _test 는 검사용 손잡이다 */
  window.PxLab = {
    S: S, MISSIONS: MISSIONS,
    _test: {
      set: function (k, v) { S[k] = v; syncControls(); refresh(); },
      scene: function (n) { S.scene = n; syncControls(); refresh(); },
      pick: function (id) { pickMission(MISSIONS[id - 1]); },
      answer: function (i) { S.predictPick = i; S.missionState = "ready"; renderMissionBody(); refresh(); },
      goals: function () {
        if (!S.mission || !S.mission.goals) return null;
        return S.mission.goals.map(function (gg) { return [gg.key, checkGoal(gg.key)]; });
      },
      state: function () { return S.missionState; },
      records: function () { return records; },
      draw: function () { draw(); return true; }
    }
  };
})();
