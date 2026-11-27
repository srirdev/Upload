@echo off
REM One-click local start (no Docker): local PostgreSQL (DATABASE_URL in .env) + local file storage. Development only.
cd /d "%~dp0"

if not exist backend\.venv\Scripts\python.exe (
  echo [setup] Creating Python environment...
  py -3.12 -m venv backend\.venv || (echo Could not create the venv. Install Python 3.12 from python.org & pause & exit /b 1)
  backend\.venv\Scripts\python -m pip install -r backend\requirements.txt || (pause & exit /b 1)
)
if not exist frontend\node_modules (
  echo [setup] Installing frontend packages...
  call npm --prefix frontend install || (pause & exit /b 1)
)

pushd backend
echo [setup] Preparing the database...
.venv\Scripts\python -m alembic upgrade head || (popd & pause & exit /b 1)
.venv\Scripts\python -m app.modules.finance.seed --sample-college
popd

start "UpLOAD API (port 8000)" cmd /k "cd /d %~dp0backend && .venv\Scripts\python -m uvicorn app.main:app --reload --port 8000"
start "UpLOAD Web (port 5173)" cmd /k "cd /d %~dp0frontend && npm run dev"
REM Development scheduler (no Redis needed): runs the idempotent background jobs every 2 minutes.
start "UpLOAD Jobs (every 2 min)" /min cmd /k "cd /d %~dp0backend && for /l %%i in () do (.venv\Scripts\python -m app.workers.run all & timeout /t 120 /nobreak >nul)"

echo.
echo Starting... the browser opens in a few seconds.
echo   Student: http://localhost:5173/student/login
echo   Shop:    http://localhost:5173/shop/login
echo   Rider:   http://localhost:5173/rider/login
echo   Admin:   http://localhost:5173/admin/login  (create one first: see README)
timeout /t 8 >nul
start http://localhost:5173/student/login
