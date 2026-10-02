.PHONY: run build test docker-build tf-init tf-plan tf-apply

PORT ?= 8090
SANDBOX_PORT ?= 8091
PROJECT_ID ?= $(shell gcloud config get-value project 2>/dev/null)

run:
	@echo "Starting Enterprise Skill Builder on port $(PORT)..."
	PORT=$(PORT) GOOGLE_CLOUD_PROJECT=$(PROJECT_ID) go run ./cmd/server

run-sandbox:
	@echo "Starting Local Sandbox Worker on port $(SANDBOX_PORT)..."
	PORT=$(SANDBOX_PORT) GOOGLE_CLOUD_QUOTA_PROJECT=$(PROJECT_ID) AGY_ADC_AUTH=true go run ./cmd/sandbox-worker

build:
	mkdir -p bin
	go build -o bin/skill-builder-server ./cmd/server
	go build -o bin/sandbox-worker ./cmd/sandbox-worker

test:
	go test -v ./...

docker-build:
	docker build -f Dockerfile.web -t skill-builder-web:latest .
	docker build -f Dockerfile.sandbox -t skill-builder-sandbox:latest .

tf-init:
	terraform -chdir=terraform init

tf-plan:
	terraform -chdir=terraform plan

tf-apply:
	terraform -chdir=terraform apply
