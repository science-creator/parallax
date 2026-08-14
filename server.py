# -*- coding: utf-8 -*-
"""
연주시차 실험실 · 로컬 서버 실행 도우미

- 파이썬 기본 모듈만 사용한다. 추가 설치나 인터넷 연결이 필요 없다.
- 이 파일이 있는 폴더(parallax)를 웹 루트로 삼아 서버를 켜고,
  브라우저에서 index.html(실험실)을 자동으로 열어 준다.
- 8500번 포트가 이미 쓰이고 있으면 8501, 8502 … 순서로 빈 포트를 찾는다.
  (binary-converter 8000번대 · ai-class 8100번대 · EnergyKeeper 8200번대 · electromagnetic-induction 8300번대 · brightness 8400번대와 겹치지 않는다.
   여섯 앱을 동시에 켜 놓고 수업할 수 있다.)

실행 방법
  ① 로컬서버_실행.bat 을 더블클릭          (가장 쉬움)
  ② 또는 명령창에서  python server.py
     브라우저를 자동으로 열지 않으려면  python server.py --no-browser
  종료 : 명령창에서 Ctrl + C

※ index.html 을 그냥 더블클릭해도 모든 기능이 동작한다(외부 의존성 0개).
   파이썬이 깔려 있지 않은 컴퓨터에서는 ②가 아니라 더블클릭을 쓰면 된다.
"""

import functools
import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))   # 이 파일이 있는 폴더 = 웹 루트
FIRST_PORT = 8500                                   # 처음 시도할 포트
TRY_COUNT = 20                                      # 몇 개까지 찾아볼지


def find_free_port(first, count):
    """빈 포트를 찾아 번호를 돌려준다. 못 찾으면 None."""
    for port in range(first, first + count):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue          # 이미 쓰이는 포트 → 다음 번호로
    return None


class Handler(http.server.SimpleHTTPRequestHandler):
    """수업 중 파일을 고쳐도 새로고침하면 바로 반영되도록 캐시를 끈다."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 접속 기록을 짧게 표시 (학생 정보는 남기지 않는다)
        sys.stdout.write("  %s\n" % (fmt % args))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    index = os.path.join(ROOT, "index.html")
    if not os.path.exists(index):
        print("[오류] index.html 을 찾을 수 없습니다:", index)
        return 1

    port = find_free_port(FIRST_PORT, TRY_COUNT)
    if port is None:
        print("[오류] %d ~ %d 사이에 빈 포트가 없습니다." % (FIRST_PORT, FIRST_PORT + TRY_COUNT - 1))
        return 1

    url = "http://localhost:%d/index.html" % port
    handler = functools.partial(Handler, directory=ROOT)

    print("=" * 56)
    print("  연주시차 실험실 · 로컬 서버")
    print("=" * 56)
    print("  실험실   : %s" % url)
    print("  학습지   : http://localhost:%d/worksheet.html" % port)
    print("  선생님용 : http://localhost:%d/teacher.html" % port)
    print("  폴더     : %s" % ROOT)
    print("  종료     : 이 창에서 Ctrl + C  (또는 창 닫기)")
    print("=" * 56)

    with Server(("127.0.0.1", port), handler) as httpd:
        # 서버가 준비된 뒤 기본 브라우저로 열기 (--no-browser 를 주면 열지 않는다)
        if "--no-browser" not in sys.argv:
            threading.Timer(0.7, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n서버를 종료합니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
