PY := server/.venv/Scripts/python.exe

.PHONY: game db api web migrate seed

game: ## export the Godot web build to server/web/
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/export-game.ps1

db: ## start Postgres in Docker (127.0.0.1:15432)
	docker compose up -d db

api: ## run the backend on :8000
	cd server && ../$(PY) main.py

web: ## run the website on :3000
	cd web && npm run dev

migrate: ## create/upgrade tables
	cd server && ../$(PY) -m alembic upgrade head

seed: ## demo users: make seed SEED_PASSWORD=...
	cd server && SEED_PASSWORD=$(SEED_PASSWORD) ../$(PY) seed.py
