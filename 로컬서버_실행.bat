@echo off
cd /d "%~dp0"
title 연주시차 실험실 - 로컬 서버

echo.
echo  ================================================
echo    연주시차 실험실 : 로컬 서버
echo  ================================================
echo.

rem 파이썬을 python - py 순서로 찾는다.
rem 윈도우에는 실행되지 않는 파이썬 "가짜 파일"이 깔려 있는 경우가 있어서,
rem 찾았다고 끝내지 않고 실제로 한 번 돌려 본 뒤에 쓴다.
where python >nul 2>nul
if errorlevel 1 goto TRYPY
python -c "pass" >nul 2>nul
if not errorlevel 1 goto RUNPY

:TRYPY
where py >nul 2>nul
if errorlevel 1 goto NOPY
py -c "pass" >nul 2>nul
if not errorlevel 1 goto RUNPY2

:NOPY
echo  [안내] 이 컴퓨터에서는 파이썬이 실행되지 않습니다.
echo.
echo         서버는 없어도 됩니다.
echo         이 폴더의 index.html 을 더블클릭하면
echo         실험실 - 학습지 - 선생님용 화면이 모두 그대로 동작합니다.
echo.
pause
exit /b 1

:RUNPY
python server.py
goto ENDED

:RUNPY2
py server.py
goto ENDED

:ENDED
echo.
echo  서버가 종료되었습니다. 아무 키나 누르면 창이 닫힙니다.
pause >nul
