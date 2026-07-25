dev:
	docker compose up --build

down:
	docker compose down

reset:
	docker compose down -v

db:
	docker compose up -d mysql redis

fmt:
	cargo fmt --all -- --check

check:
	cargo check --workspace
