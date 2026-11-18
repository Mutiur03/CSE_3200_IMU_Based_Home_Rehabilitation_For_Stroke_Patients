# Final E2E run (scratch Postgres, ports 15470/18400/3400)
- Bring-up: alembic upgrade head, seed.py, uvicorn, next build + start all OK.
- server/e2e_flow.py: 186 PASS, 0 FAIL.
- Populate (docs/e2e/populate.py): 8 sessions via real API; sessions 1-7 backdated in the scratch DB (API cannot backdate). Quality stays ~93-100 (score is relative to earlier reps), so the quality chart is flat; roll range rises 15 to 45 deg.
- UI walk (docs/e2e/walk.cjs), 1440x900 and 375x812: no horizontal overflow, no NaN/undefined/null text, no Retry on 403/404 pages, no duplicate requests. Only console errors: expected 401 on /login, 403/404 on the not-found pages, 404 on /patient/play (game build not installed).
- Not-found pages show "Not found, or you do not have access to it."
