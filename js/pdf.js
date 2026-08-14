/* =========================================================
   pdf.js — ai-class 공용 PDF 엔진 + 화면 도구
   ---------------------------------------------------------
   이 파일이 하는 일
     ① 학생이 작성한 내용을 A4 캔버스에 그려서 PDF 파일로 만든다.
     ② 여러 쪽으로 넘어가는 글을 자동으로 나눠 준다(자동 쪽나눔).
     ③ 손글씨 판(캔버스)을 만들어 준다.
     ④ 학년·반·학번·이름을 물어보는 창을 띄운다.

   왜 외부 라이브러리를 쓰지 않는가?
     PDF 에 한글 글꼴을 넣으려면 글꼴 파일(수 MB)을 함께 배포해야 한다.
     대신 "한글을 캔버스에 그림으로 그린 뒤 그 그림을 PDF 에 넣는" 방법을 쓰면
     글꼴 없이도 한글이 그대로 보인다. binary-converter 앱에서 검증된 방법이다.

   왜 ES 모듈(import/export)을 쓰지 않는가?
     index.html 을 그냥 더블클릭해서(file://) 열어도 동작해야 한다.
     file:// 에서는 모듈이 차단되지만, 지금처럼 <script src="..."> 로 불러오는
     '클래식 스크립트'는 정상적으로 실행된다.
   ========================================================= */
(function (global) {
  "use strict";

  /* A4 를 150dpi 로 그릴 때의 픽셀 크기 */
  var PAGE_W = 1240, PAGE_H = 1754;
  var MARGIN = 72;                    // 사방 여백
  var FOOT = 96;                      // 아래쪽에 쪽번호용으로 남겨 두는 높이
  var FONT = "'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',sans-serif";

  /* 색 (화면 CSS 와 같은 값을 쓴다) */
  var C = {
    ink:   "#111827",
    sub:   "#4b5563",
    faint: "#9ca3af",
    line:  "#d1d5db",
    band:  "#eef2ff",
    brand: "#4f46e5",
    ok:    "#059669",
    no:    "#dc2626"
  };

  /* ---------------------------------------------------------
     1. 캔버스 → JPEG 바이트
     --------------------------------------------------------- */
  function jpegOf(canvas) {
    var dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    var base64 = dataUrl.substring(dataUrl.indexOf(",") + 1);
    var bin = atob(base64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  /* ---------------------------------------------------------
     2. PDF 파일 구조를 직접 조립한다
        pageImages : [{width, height, bytes}, ...]
        ⚠ xref 의 각 줄은 정확히 20바이트여야 하고,
          오프셋은 "N 0 obj" 가 시작하는 위치여야 한다. 어긋나면 PDF 가 열리지 않는다.
     --------------------------------------------------------- */
  function buildPdf(pageImages) {
    var A4W = 595, A4H = 842;              // PDF 안에서의 A4 크기(포인트)
    var chunks = [], size = 0;

    function latin1(s) {
      var a = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 0xff;
      return a;
    }
    function put(data) {
      var bytes = (typeof data === "string") ? latin1(data) : data;
      chunks.push(bytes);
      size += bytes.length;
    }

    var objCount = 2 + pageImages.length * 3;
    var offsets = new Array(objCount + 1).fill(0);

    put("%PDF-1.4\n%âãÏÓ\n");

    offsets[1] = size;
    put("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

    var kids = [];
    for (var i = 0; i < pageImages.length; i++) kids.push((3 + i * 3) + " 0 R");
    offsets[2] = size;
    put("2 0 obj\n<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " +
        pageImages.length + " >>\nendobj\n");

    pageImages.forEach(function (img, idx) {
      var pageNo = 3 + idx * 3, contentNo = pageNo + 1, imgNo = pageNo + 2;

      offsets[pageNo] = size;
      put(pageNo + " 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + A4W + " " + A4H + "]" +
          " /Resources << /XObject << /Im0 " + imgNo + " 0 R >> >> /Contents " +
          contentNo + " 0 R >>\nendobj\n");

      var content = "q " + A4W + " 0 0 " + A4H + " 0 0 cm /Im0 Do Q\n";
      offsets[contentNo] = size;
      put(contentNo + " 0 obj\n<< /Length " + content.length + " >>\nstream\n" +
          content + "endstream\nendobj\n");

      offsets[imgNo] = size;
      put(imgNo + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + img.width +
          " /Height " + img.height + " /ColorSpace /DeviceRGB /BitsPerComponent 8" +
          " /Filter /DCTDecode /Length " + img.bytes.length + " >>\nstream\n");
      put(img.bytes);
      put("\nendstream\nendobj\n");
    });

    var xrefAt = size;
    var xref = "xref\n0 " + (objCount + 1) + "\n0000000000 65535 f \n";
    for (var k = 1; k <= objCount; k++) {
      xref += ("0000000000" + offsets[k]).slice(-10) + " 00000 n \n";
    }
    put(xref);
    put("trailer\n<< /Size " + (objCount + 1) + " /Root 1 0 R >>\nstartxref\n" +
        xrefAt + "\n%%EOF\n");

    return new Blob(chunks, { type: "application/pdf" });
  }

  /* ---------------------------------------------------------
     3. 파일 내려받기
     --------------------------------------------------------- */
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ---------------------------------------------------------
     4. 글자 줄바꿈
        한국어는 단어 사이에 공백이 없어 '글자 단위'로 끊는 것이 맞다.
        다만 영어 단어 중간이 잘리면 읽기 어려우므로,
        끊는 자리가 영문·숫자면 마지막 공백까지 되돌려 끊는다.
     --------------------------------------------------------- */
  function wrapText(g, text, maxW) {
    var out = [];
    String(text == null ? "" : text).split("\n").forEach(function (seg) {
      if (seg === "") { out.push(""); return; }
      var line = "";
      Array.from(seg).forEach(function (ch) {
        var t = line + ch;
        if (line !== "" && g.measureText(t).width > maxW) {
          var sp = line.lastIndexOf(" ");
          if (sp > 0 && /[A-Za-z0-9]/.test(ch) && (line.length - sp) <= 20) {
            out.push(line.slice(0, sp));
            line = line.slice(sp + 1) + ch;
          } else {
            out.push(line);
            line = ch;
          }
        } else {
          line = t;
        }
      });
      out.push(line);
    });
    return out;
  }

  /* ---------------------------------------------------------
     5. 문서 만들기 (자동 쪽나눔 레이아웃)

        var doc = PdfKit.createDoc({ title:"학습지 ③", subtitle:"...", meta:{...} });
        doc.h1("1단계"); doc.p("..."); doc.box("답", "...");
        var pages = doc.finish();        // [{width,height,bytes}...]
        PdfKit.downloadBlob(PdfKit.buildPdf(pages), "이름.pdf");
     --------------------------------------------------------- */
  function createDoc(opt) {
    opt = opt || {};
    var pages = [];                     // [{canvas, g}]
    var g = null;
    var y = 0;
    var innerW = PAGE_W - MARGIN * 2;

    function newPage() {
      var canvas = document.createElement("canvas");
      canvas.width = PAGE_W;
      canvas.height = PAGE_H;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, PAGE_W, PAGE_H);
      ctx.textBaseline = "top";
      pages.push({ canvas: canvas, g: ctx });
      g = ctx;
      y = MARGIN;
      drawPageHead(pages.length === 1);
    }

    /* 쪽 머리글 : 첫 쪽에는 제목과 학생 정보, 이후 쪽에는 얇은 제목 줄만 */
    function drawPageHead(first) {
      if (first) {
        g.fillStyle = C.brand;
        g.fillRect(MARGIN, y, 10, 46);
        g.fillStyle = C.ink;
        g.font = "bold 40px " + FONT;
        g.fillText(opt.title || "학습지", MARGIN + 26, y + 2);
        y += 56;
        if (opt.subtitle) {
          g.fillStyle = C.sub;
          g.font = "24px " + FONT;
          wrapText(g, opt.subtitle, innerW).forEach(function (ln) {
            g.fillText(ln, MARGIN, y); y += 32;
          });
        }
        y += 10;
        if (opt.meta) drawMetaBox(opt.meta);
        y += 8;
      } else {
        g.fillStyle = C.faint;
        g.font = "20px " + FONT;
        g.fillText((opt.title || "학습지") + (opt.subtitle ? " · " + opt.subtitle : ""), MARGIN, y);
        y += 30;
        g.strokeStyle = C.line;
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(MARGIN, y); g.lineTo(PAGE_W - MARGIN, y); g.stroke();
        y += 22;
      }
    }

    /* 학생 정보 상자 — 이 상자만이 이름·학번이 남는 유일한 곳이다 */
    function drawMetaBox(m) {
      var h = 74;
      g.fillStyle = C.band;
      g.fillRect(MARGIN, y, innerW, h);
      g.strokeStyle = C.line;
      g.lineWidth = 1.5;
      g.strokeRect(MARGIN, y, innerW, h);
      g.fillStyle = C.ink;
      g.font = "bold 26px " + FONT;
      g.fillText(m.grade + "학년 " + m.cls + "반 " + m.num + "번  " + m.name, MARGIN + 22, y + 12);
      g.fillStyle = C.sub;
      g.font = "20px " + FONT;
      g.fillText("작성 " + m.when, MARGIN + 22, y + 44);
      if (m.right) {
        g.textAlign = "right";
        g.fillStyle = C.ink;
        g.font = "bold 24px " + FONT;
        g.fillText(m.right, PAGE_W - MARGIN - 22, y + 24);
        g.textAlign = "left";
      }
      y += h + 6;
    }

    /* 남은 높이가 부족하면 새 쪽으로 넘긴다 */
    function need(h) {
      if (y + h > PAGE_H - FOOT) newPage();
    }

    /* ---- 그리기 도구들 ---- */
    var api = {
      /* 큰 제목 (단계 제목) */
      h1: function (text) {
        need(74);
        y += 12;
        g.fillStyle = C.brand;
        g.fillRect(MARGIN, y + 4, 7, 32);
        g.fillStyle = C.ink;
        g.font = "bold 31px " + FONT;
        g.fillText(text, MARGIN + 20, y);
        y += 48;
        return api;
      },
      /* 작은 제목 (문항 제목) */
      h2: function (text) {
        g.font = "bold 25px " + FONT;
        var lines = wrapText(g, text, innerW);
        need(lines.length * 34 + 14);
        g.fillStyle = C.ink;
        lines.forEach(function (ln) { g.fillText(ln, MARGIN, y); y += 34; });
        y += 6;
        return api;
      },
      /* 본문 */
      p: function (text, o) {
        o = o || {};
        var sz = o.size || 23, lh = o.lh || 33;
        g.font = (o.bold ? "bold " : "") + sz + "px " + FONT;
        var x = MARGIN + (o.indent || 0);
        var lines = wrapText(g, text, innerW - (o.indent || 0));
        lines.forEach(function (ln) {
          need(lh);
          g.fillStyle = o.color || C.sub;
          g.font = (o.bold ? "bold " : "") + sz + "px " + FONT;
          g.fillText(ln, x, y);
          y += lh;
        });
        y += (o.gap == null ? 4 : o.gap);
        return api;
      },
      /* 목록 */
      bullets: function (arr) {
        (arr || []).forEach(function (t) {
          g.font = "23px " + FONT;
          var lines = wrapText(g, t, innerW - 34);
          lines.forEach(function (ln, i) {
            need(33);
            g.fillStyle = C.sub;
            g.font = "23px " + FONT;
            if (i === 0) g.fillText("·", MARGIN + 8, y);
            g.fillText(ln, MARGIN + 34, y);
            y += 33;
          });
        });
        y += 4;
        return api;
      },
      /* 학생이 쓴 답을 담는 상자 */
      box: function (label, text, o) {
        o = o || {};
        var body = (text == null ? "" : String(text)).trim();
        var empty = body === "";
        if (empty) body = "(작성하지 않음)";

        g.font = "23px " + FONT;
        var lines = wrapText(g, body, innerW - 36);
        var minH = o.minLines ? o.minLines * 33 : 0;
        var bodyH = Math.max(lines.length * 33, minH);
        var labelH = label ? 32 : 0;

        need(labelH + bodyH + 34);
        if (label) {
          g.fillStyle = C.brand;
          g.font = "bold 22px " + FONT;
          g.fillText(label, MARGIN, y);
          y += labelH;
        }
        g.fillStyle = o.fill || "#fafafa";
        g.fillRect(MARGIN, y, innerW, bodyH + 24);
        g.strokeStyle = C.line;
        g.lineWidth = 1.5;
        g.strokeRect(MARGIN, y, innerW, bodyH + 24);
        var ty = y + 12;
        lines.forEach(function (ln) {
          g.fillStyle = empty ? C.faint : C.ink;
          g.font = (empty ? "italic " : "") + "23px " + FONT;
          g.fillText(ln, MARGIN + 18, ty);
          ty += 33;
        });
        y += bodyH + 24 + 14;
        return api;
      },
      /* 표 — rows[0] 은 머리글. 쪽이 넘어가면 머리글을 다시 그린다 */
      table: function (rows, widths, o) {
        o = o || {};
        if (!rows || !rows.length) return api;
        var total = widths.reduce(function (a, b) { return a + b; }, 0);
        var cols = widths.map(function (w) { return Math.round(innerW * w / total); });

        function rowHeight(cells, bold) {
          g.font = (bold ? "bold " : "") + 21 + "px " + FONT;
          var max = 1;
          cells.forEach(function (c, i) {
            max = Math.max(max, wrapText(g, c, cols[i] - 20).length);
          });
          return max * 30 + 16;
        }
        function drawRow(cells, bold, fill) {
          var h = rowHeight(cells, bold);
          need(h);
          var x = MARGIN;
          cells.forEach(function (c, i) {
            g.fillStyle = fill || "#ffffff";
            g.fillRect(x, y, cols[i], h);
            g.strokeStyle = C.line;
            g.lineWidth = 1;
            g.strokeRect(x, y, cols[i], h);
            g.font = (bold ? "bold " : "") + 21 + "px " + FONT;
            var ty = y + 8;
            wrapText(g, c, cols[i] - 20).forEach(function (ln) {
              g.fillStyle = bold ? C.ink : C.sub;
              g.fillText(ln, x + 10, ty);
              ty += 30;
            });
            x += cols[i];
          });
          y += h;
        }

        var head = rows[0];
        drawRow(head, true, C.band);
        for (var r = 1; r < rows.length; r++) {
          if (y + rowHeight(rows[r], false) > PAGE_H - FOOT) {
            newPage();
            drawRow(head, true, C.band);       // 새 쪽에도 머리글을 다시 그린다
          }
          drawRow(rows[r], false, null);
        }
        y += 14;
        return api;
      },
      /* 자동 채점 결과 한 줄 (○ / ×) */
      mark: function (label, ok, note) {
        need(38);
        g.font = "bold 24px " + FONT;
        g.fillStyle = ok === null ? C.faint : (ok ? C.ok : C.no);
        g.fillText(ok === null ? "–" : (ok ? "○" : "×"), MARGIN + 4, y);
        g.fillStyle = C.ink;
        g.font = "23px " + FONT;
        g.fillText(label, MARGIN + 40, y);
        if (note) {
          g.fillStyle = C.sub;
          g.font = "21px " + FONT;
          g.textAlign = "right";
          g.fillText(note, PAGE_W - MARGIN, y + 2);
          g.textAlign = "left";
        }
        y += 36;
        return api;
      },
      /* 그림(손글씨 판·차트 캔버스)을 넣는다 */
      img: function (srcCanvas, o) {
        o = o || {};
        if (!srcCanvas) return api;
        var maxW = innerW;
        var scale = Math.min(1, maxW / srcCanvas.width);
        var w = Math.round(srcCanvas.width * scale);
        var h = Math.round(srcCanvas.height * scale);
        if (o.maxH && h > o.maxH) {
          var s2 = o.maxH / h;
          w = Math.round(w * s2); h = Math.round(h * s2);
        }
        need(h + 16);
        g.drawImage(srcCanvas, MARGIN, y, w, h);
        g.strokeStyle = C.line;
        g.lineWidth = 1.5;
        g.strokeRect(MARGIN, y, w, h);
        y += h + 16;
        return api;
      },
      gap: function (h) { y += (h == null ? 16 : h); return api; },
      rule: function () {
        need(24);
        g.strokeStyle = C.line;
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(MARGIN, y); g.lineTo(PAGE_W - MARGIN, y); g.stroke();
        y += 20;
        return api;
      },
      pageBreak: function () { newPage(); return api; }
    };

    /* 마무리 : 쪽번호를 모든 쪽에 찍고 JPEG 목록을 돌려준다 */
    api.finish = function () {
      var total = pages.length;
      pages.forEach(function (p, i) {
        var c = p.g;
        c.fillStyle = C.faint;
        c.font = "20px " + FONT;
        c.textAlign = "right";
        c.fillText((i + 1) + " / " + total, PAGE_W - MARGIN, PAGE_H - 56);
        c.textAlign = "left";
        if (opt.footer) c.fillText(opt.footer, MARGIN, PAGE_H - 56);
        c.textAlign = "left";
      });
      return pages.map(function (p) {
        return { width: PAGE_W, height: PAGE_H, bytes: jpegOf(p.canvas) };
      });
    };

    newPage();
    return api;
  }

  /* ---------------------------------------------------------
     6. 손글씨 판
        획을 좌표 배열로 모아 두고 다시 그리는 방식이라
        되돌리기가 정확하고 화면 폭이 달라져도 찌그러지지 않는다.
     --------------------------------------------------------- */
  function createPad(wrap, opt) {
    opt = opt || {};
    var canvas = document.createElement("canvas");
    canvas.width = opt.width || 1400;
    canvas.height = opt.height || 420;
    canvas.className = "pad";
    canvas.setAttribute("aria-label", opt.label || "손으로 그리는 칸");
    var ctx = canvas.getContext("2d");

    var strokes = [];
    var drawing = null;
    var tool = { color: "#111111", width: 4, eraser: false };

    function clearAll() {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    function drawStroke(s) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      if (s.points.length === 1) {
        ctx.arc(s.points[0][0], s.points[0][1], s.width / 2, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.fill();
        return;
      }
      ctx.moveTo(s.points[0][0], s.points[0][1]);
      for (var i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i][0], s.points[i][1]);
      ctx.stroke();
    }
    function redraw() { clearAll(); strokes.forEach(drawStroke); }
    function toCanvas(e) {
      var r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) * (canvas.width / r.width),
              (e.clientY - r.top) * (canvas.height / r.height)];
    }

    canvas.addEventListener("pointerdown", function (e) {
      if (opt.enabled && !opt.enabled()) return;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      drawing = {
        color: tool.eraser ? "#ffffff" : tool.color,
        width: tool.eraser ? tool.width * 6 : tool.width,
        points: [toCanvas(e)]
      };
      strokes.push(drawing);
      redraw();
      if (opt.onChange) opt.onChange();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drawing) return;
      drawing.points.push(toCanvas(e));
      drawStroke(drawing);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (t) {
      canvas.addEventListener(t, function () { drawing = null; });
    });

    clearAll();

    var pad = {
      canvas: canvas,
      setColor: function (c) { tool.color = c; tool.eraser = false; },
      setWidth: function (w) { tool.width = w; },
      setEraser: function (on) { tool.eraser = !!on; },
      undo: function () { strokes.pop(); redraw(); if (opt.onChange) opt.onChange(); },
      clear: function () { strokes.length = 0; redraw(); if (opt.onChange) opt.onChange(); },
      isEmpty: function () { return strokes.length === 0; }
    };

    /* 도구 단추 줄 + 캔버스를 한 번에 붙인다 */
    var tools = document.createElement("div");
    tools.className = "pad-tools";
    function btn(text, title, fn, cls) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "pad-btn" + (cls ? " " + cls : "");
      b.textContent = text;
      b.title = title;
      b.addEventListener("click", fn);
      tools.appendChild(b);
      return b;
    }
    ["#111111", "#1d4ed8", "#dc2626"].forEach(function (col) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "pad-color";
      b.style.background = col;
      b.title = "색 바꾸기";
      b.setAttribute("aria-label", "펜 색 " + col);
      b.addEventListener("click", function () {
        pad.setColor(col);
        tools.querySelectorAll(".pad-color").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        eraseBtn.classList.remove("on");
      });
      tools.appendChild(b);
      if (col === "#111111") b.classList.add("on");
    });
    [["얇게", 3], ["보통", 6], ["굵게", 11]].forEach(function (w) {
      var b = btn(w[0], "펜 굵기", function () {
        pad.setWidth(w[1]);
        tools.querySelectorAll(".pad-btn.w").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
      }, "w");
      if (w[1] === 6) b.classList.add("on");
    });
    var eraseBtn = btn("지우개", "지우개로 바꾸기", function () {
      pad.setEraser(true);
      tools.querySelectorAll(".pad-color").forEach(function (x) { x.classList.remove("on"); });
      eraseBtn.classList.add("on");
    });
    btn("되돌리기", "마지막 획 지우기", function () { pad.undo(); });
    btn("전체 지우기", "모두 지우기", function () {
      if (confirm("그린 것을 모두 지울까요?")) pad.clear();
    });

    wrap.appendChild(tools);
    wrap.appendChild(canvas);
    return pad;
  }

  /* ---------------------------------------------------------
     7. 학년·반·학번·이름 물어보기 (PDF 저장 직전 한 번만)
        ⚠ 여기서 받은 값은 어디에도 저장하지 않는다. PDF 안에만 들어간다.
     --------------------------------------------------------- */
  function askStudentInfo(opt, onOk) {
    opt = opt || {};
    var back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="siTitle">' +
        '<h2 id="siTitle">누가 낸 것인지 적어 주세요</h2>' +
        '<p class="modal-note">여기 적은 <b>이름과 학번은 PDF 파일 안에만</b> 들어갑니다.<br>' +
        '이 태블릿·컴퓨터에는 <b>저장되지 않습니다.</b></p>' +
        '<div class="si-grid">' +
          '<label>학년<input type="number" id="siGrade" min="1" max="3" inputmode="numeric"></label>' +
          '<label>반<input type="number" id="siCls" min="1" max="20" inputmode="numeric"></label>' +
          '<label>학번<input type="number" id="siNum" min="1" max="50" inputmode="numeric"></label>' +
          '<label>이름<input type="text" id="siName" maxlength="12" autocomplete="off"></label>' +
        '</div>' +
        '<p class="modal-warn" id="siWarn" hidden></p>' +
        '<div class="modal-btns">' +
          '<button type="button" class="btn ghost" id="siCancel">취소</button>' +
          '<button type="button" class="btn primary" id="siOk">PDF 만들기</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(back);

    var grade = back.querySelector("#siGrade");
    var cls = back.querySelector("#siCls");
    var num = back.querySelector("#siNum");
    var name = back.querySelector("#siName");
    var warn = back.querySelector("#siWarn");
    grade.focus();

    function close() { back.remove(); }
    back.querySelector("#siCancel").addEventListener("click", close);
    back.addEventListener("click", function (e) { if (e.target === back) close(); });
    document.addEventListener("keydown", function esc(e) {
      if (!document.body.contains(back)) { document.removeEventListener("keydown", esc); return; }
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
    });

    function submit() {
      var g = parseInt(grade.value, 10), c = parseInt(cls.value, 10), n = parseInt(num.value, 10);
      var nm = (name.value || "").trim();
      if (!(g >= 1 && g <= 3) || !(c >= 1 && c <= 20) || !(n >= 1 && n <= 50) || nm === "") {
        warn.hidden = false;
        warn.textContent = "학년(1~3) · 반(1~20) · 학번(1~50) · 이름을 모두 올바르게 적어 주세요.";
        return;
      }
      close();
      onOk({ grade: g, cls: c, num: n, name: nm, when: stamp().human });
    }
    back.querySelector("#siOk").addEventListener("click", submit);
    [grade, cls, num, name].forEach(function (el) {
      el.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    });
  }

  /* ---------------------------------------------------------
     8. 날짜·파일 이름
        파일 이름만으로 교사가 정렬·집계할 수 있어야 한다.
        예) 학습지3_1-3-07_홍길동_20260729_1420.pdf
     --------------------------------------------------------- */
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function stamp() {
    var d = new Date();
    var date = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
    var time = pad2(d.getHours()) + pad2(d.getMinutes());
    return {
      date: date,
      time: time,
      human: d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
             " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes())
    };
  }

  /* 파일 이름에 쓸 수 없는 글자를 없앤다 */
  function safeName(s) {
    return String(s || "").replace(/[\\/:*?"<>|_\s]/g, "");
  }

  function makeFileName(prefix, info, extra) {
    var t = stamp();
    return prefix + "_" +
           info.grade + "-" + info.cls + "-" + pad2(info.num) + "_" +
           safeName(info.name) +
           (extra ? "_" + safeName(extra) : "") + "_" +
           t.date + "_" + t.time + ".pdf";
  }

  /* ---------------------------------------------------------
     9. 화면 알림 막대 (저장 결과 안내)
     --------------------------------------------------------- */
  function toast(msg, kind) {
    var el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      document.body.appendChild(el);
    }
    el.className = "show " + (kind || "ok");
    el.textContent = msg;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.className = ""; }, 5000);
  }

  /* ---------------------------------------------------------
     10. 나란히 보기용 '새 창' 링크

     `<a href="kmeans.html" target="ai-class-lab" data-win>` 처럼 써 두면
     이 함수가 그 링크를 **진짜 새 창**으로 열어 준다.

     왜 필요한가?
       target 에 이름만 주면 크롬·엣지는 보통 새 **탭**으로 열어서
       학습지와 실험실을 나란히 놓고 볼 수 없다.
       window.open 에 **크기를 함께 주면 탭이 아니라 창으로** 열린다.

     특징
       - 화면의 오른쪽 절반에 열어 주므로 왼쪽 창(학습지)과 나란히 보인다.
       - target 이름이 같으면 창을 다시 쓴다 → 여러 번 눌러도 창이 쌓이지 않는다.
       - 팝업이 막힌 환경에서는 막지 않고 링크의 기본 동작(새 탭)으로 넘어간다.
     --------------------------------------------------------- */
  function setupSideWindows() {
    document.addEventListener("click", function (e) {
      var a = (e.target && e.target.closest) ? e.target.closest("a[data-win]") : null;
      if (!a || !a.target) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;  // 사용자가 직접 새 탭을 원한 경우

      var sw = screen.availWidth || 1280;
      var sh = screen.availHeight || 800;
      var w = Math.max(560, Math.floor(sw / 2));
      var h = Math.max(600, sh - 40);
      var feat = "popup=yes,width=" + w + ",height=" + h +
                 ",left=" + (sw - w) + ",top=0,resizable=yes,scrollbars=yes";

      var win = null;
      try { win = window.open(a.href, a.target, feat); } catch (err) { win = null; }
      if (win) {
        e.preventDefault();              // 새 창이 떴으니 이 창은 그대로 둔다
        try { win.focus(); } catch (err) {}
      }
      /* win 이 null 이면(팝업 차단) 아무것도 막지 않는다 → target 대로 새 탭이 열린다 */
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupSideWindows);
  } else {
    setupSideWindows();
  }

  global.PdfKit = {
    PAGE_W: PAGE_W, PAGE_H: PAGE_H, FONT: FONT, COLORS: C,
    jpegOf: jpegOf,
    buildPdf: buildPdf,
    downloadBlob: downloadBlob,
    wrapText: wrapText,
    createDoc: createDoc,
    createPad: createPad,
    askStudentInfo: askStudentInfo,
    makeFileName: makeFileName,
    stamp: stamp,
    pad2: pad2,
    toast: toast,
    setupSideWindows: setupSideWindows      // 자동으로 한 번 실행된다. 검사용으로 내보낸다.
  };
})(window);
