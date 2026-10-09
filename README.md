# Enterprise Skill Builder for Gemini Enterprise & Antigravity 2.0

An open-source, customer-deployable web application and Cloud Run Gen2 gVisor sandbox factory that enables Customer Engineers (CEs), Solutions Architects, and business users to:
- **Author skills by Voice or Text** (`gemini-3.8-flash`) or **Import & Adapt Existing Skills from a Web URL** (automatically converting skills built for Anthropic Claude or OpenAI GPT/Codex to `gemini-3.8-flash`, Gemini Enterprise, and Antigravity 2.0).
- **Connect Enterprise Data, Bring-Your-Own MCP Servers, and REST APIs** with automatic JSON-RPC `tools/list` discovery, OpenAPI 3.0.3 specification auto-discovery or documentation-based inference, and governed **Authentication (AuthN)** and **Authorization (AuthZ)** backed by Google Cloud Secret Manager.
- **Dry-Run & Self-Heal in an Isolated Sandbox**: Compile and verify deterministic Python 3.11 skills via the headless **Antigravity CLI (`agy`)**, including live loopback HTTP AuthN/AuthZ verification (`401 Unauthorized`, `403 Forbidden`, and `200 OK`) and static AST/Bandit security checks (`SEC-01` through `SEC-06`).
- **Benchmark Lift with SkillsBench + Harbor**: Execute 5 paired `Baseline (No-Skill)` vs. `With-Skill` evaluation trials (`harbor-trial-01` through `harbor-trial-05`), compute Normalized Gain ($g$), and verify `/logs/verifier/reward.txt = 1.0`.
- **Publish in One Click**: Register verified skill bundles directly into the **Google Cloud Agent Platform Skill Registry**, attach them to **Gemini Enterprise**, or download a portable `.zip` archive.

---

## Architecture Overview: One-Time Terraform vs. Self-Service Web Portal

This repository separates **One-Time Platform Deployment (Terraform)** from **Day-to-Day Skill Creation & Registration (Web Portal)**:

1. **One-Time Admin Deployment (`terraform init && terraform plan && terraform apply`)**:
   - A Cloud Administrator runs Terraform **once** against a target GCP project.
   - Terraform automatically:
     1. Enables all required Google Cloud APIs (`run`, `cloudbuild`, `artifactregistry`, `iap`, `aiplatform`, `discoveryengine`, `secretmanager`, `compute`, `storage`, `firestore`, `serviceusage`, `cloudresourcemanager`, `iam`).
     2. Creates an **Artifact Registry** Docker repository (`enterprise-skill-builder`) and triggers **Cloud Build** (`gcloud builds submit`) to build and push both `Dockerfile.web` and `Dockerfile.sandbox` from source (no local Docker daemon required).
     3. Creates two dedicated least-privilege Service Accounts:
        - `skill-builder-web-sa`: Runs the Web Portal and holds permissions (`roles/aiplatform.user`, `roles/discoveryengine.admin`, `roles/storage.objectAdmin`, `roles/secretmanager.secretAccessor`) to discover tools and publish skills into the Agent Registry and Gemini Enterprise.
        - `skill-builder-sandbox-sa`: Runs the isolated sandbox worker with `AGY_ADC_AUTH=true`, `GOOGLE_CLOUD_QUOTA_PROJECT=<project_id>`, and `roles/secretmanager.secretAccessor`.
     4. Provisions an isolated VPC (`skill-builder-sandbox-vpc`) and deploys the **Cloud Run Gen2 gVisor Sandbox Worker** (`skill-builder-sandbox`) with internal-only ingress.
     5. Deploys the **Enterprise Skill Builder Web Portal** (`skill-builder-web`) on Cloud Run behind **Identity-Aware Proxy (IAP)** and grants access (`roles/iap.httpsResourceAccessor`) to the business users and groups specified in `iap_allowed_members`.

2. **Self-Service Portal for Business Users & Skill Builders (Zero Terraform Needed per Skill)**:
   - Once Terraform outputs `skill_builder_web_url`, any authorized user in `iap_allowed_members` opens that URL in their browser to create, adapt, ground, sandbox-test, evaluate, and publish skills without writing infrastructure code.

---

## Option A: Step-by-Step Cloud Deployment Guide (Terraform on Google Cloud)

### Step 1: Verify Admin Prerequisites

To deploy into a Google Cloud project, you need:
1. **CLI Tools** (all pre-installed in Google Cloud Shell):
   - `gcloud` CLI
   - `terraform` (`>= 1.6.0`)
   - `git`
2. **IAM Roles on the Target GCP Project**:
   - `roles/editor` (Project Editor - to enable APIs and provision Cloud Run, Artifact Registry, Cloud Build, Secret Manager, VPC, and GCS resources)
   - `roles/resourcemanager.projectIamAdmin` and `roles/iap.admin` (to create dedicated Service Accounts, bind least-privilege IAM roles, and configure IAP access)
   *(Note: `roles/owner` covers all required permissions automatically.)*

### Step 2: Authenticate with Google Cloud

Run the following commands to authenticate your session and set your target GCP project:

```bash
export PROJECT_ID="your-gcp-project-id"

gcloud auth login
gcloud auth application-default login
gcloud config set project "${PROJECT_ID}"
```

### Step 3: Clone the Repository & Configure `terraform.tfvars`

```bash
git clone https://github.com/mkarimawan/enterprise-skill-builder.git
cd enterprise-skill-builder

cp terraform/terraform.tfvars.example terraform/terraform.tfvars
```

Open `terraform/terraform.tfvars` and set your `project_id`, `region`, and the `iap_allowed_members` who should have access to the Web Portal:

```hcl
project_id = "your-gcp-project-id"
region     = "us-central1"
enable_iap = true

iap_allowed_members = [
  "user:your-admin@yourcompany.com",
  "group:business-skill-builders@yourcompany.com"
]

# Optional: Gemini Enterprise App ID for one-click skill mounting
discovery_engine_app_id   = ""
discovery_engine_location = "global"
```

### Step 4: Run `terraform init`, `terraform plan`, and `terraform apply`

```bash
terraform -chdir=terraform init
terraform -chdir=terraform plan
terraform -chdir=terraform apply
```

When prompted, type `yes`. Terraform will enable APIs, build both container images in Cloud Build, deploy the isolated Sandbox Worker and IAP Web Portal on Cloud Run Gen2, and print the outputs:

```text
Outputs:

skill_builder_web_url         = "https://skill-builder-web-xxxxxxxxxx-uc.a.run.app"
sandbox_worker_internal_url   = "https://skill-builder-sandbox-xxxxxxxxxx-uc.a.run.app"
web_service_account_email     = "skill-builder-web-sa@your-gcp-project-id.iam.gserviceaccount.com"
sandbox_service_account_email = "skill-builder-sandbox-sa@your-gcp-project-id.iam.gserviceaccount.com"
skill_artifacts_bucket        = "your-gcp-project-id-enterprise-skill-bundles"
```

### Step 5: (Optional) Store BYO-MCP or REST API Credentials in Secret Manager

When business users connect custom MCP servers or REST APIs that require Bearer tokens, OAuth2 client secrets, or API keys, store the secret value in Google Cloud Secret Manager and reference its Secret Manager URI in Step 2 of the Web Portal:

```bash
echo -n "your-mcp-or-rest-api-secret-token" | gcloud secrets create mcp-tool-credential \
  --project="${PROJECT_ID}" \
  --replication-policy="automatic" \
  --data-file=-
```

The Secret Manager URI to paste in the Web Portal is:
`projects/<your-gcp-project-id>/secrets/mcp-tool-credential/versions/latest`

---

## Option B: Step-by-Step Local Development & Testing Quickstart

You can also build, test, and run the entire Enterprise Skill Builder locally on Linux or macOS using Go (`>= 1.22`) and Python (`>= 3.11`).

### Step 1: Run Automated Unit & Integration Tests

```bash
git clone https://github.com/mkarimawan/enterprise-skill-builder.git
cd enterprise-skill-builder

make test
# Or directly:
go test -v ./...
```

This runs automated tests verifying:
- `internal/importer`: Adapting Anthropic Claude (`claude-3-7-sonnet`) and OpenAI (`gpt-4o`) skills from URLs to `gemini-3.8-flash`, Gemini Enterprise, and Antigravity 2.0.
- `internal/grounding`: BYO-MCP JSON-RPC `tools/list` discovery, REST OpenAPI 3.0.3 YAML inference from documentation, and AuthN/AuthZ configuration.
- `internal/sandbox`: Isolated sandbox generation of `SKILL.md`, `scripts/analyze_cost_anomalies.py`, `scripts/tool_client.py`, `references/tools_manifest.json`, `references/openapi_spec.yaml`, live loopback `401`/`403`/`200 OK` verification, and `SEC-01` through `SEC-06` security checks.
- `internal/eval`: SkillsBench + Harbor 5-trial benchmark suite (`harbor-trial-01` through `harbor-trial-05`) and Normalized Gain ($g = 1.0$) calculation.

### Step 2: Start the Local Web Studio

```bash
make run
# Or directly:
PORT=8090 go run ./cmd/server
```

Open `http://localhost:8090` in your browser and verify health via:

```bash
curl -s http://localhost:8090/healthz
```

---

## Step-by-Step Guide: Using the 5-Stage Web Portal

1. **Stage 1 - Create Skill (Voice/Text Interview or Import from URL)**:
   - Click the skill title at the top of the page to name your skill inline.
   - Describe what your skill should do using text or microphone voice (`gemini-3.8-flash`), **or** paste a URL to an existing skill built for **Anthropic Claude** or **OpenAI GPT/Codex** (or click one of the sample URL chips) and click **Adapt to Gemini**.
   - Review the **Skill Summary** on the right, including the **Gemini & Antigravity Adaptation Report** showing how models, SDK clients, credentials, and routing tags were converted.

2. **Stage 2 - Data Sources, BYO-MCP Servers & REST APIs (with AuthN & AuthZ)**:
   - Click **Attach sample** next to any built-in enterprise data source, or expand **Connect your own MCP server, REST API, or custom dataset (with AuthN & AuthZ)**.
   - Choose **MCP server (`streamable_http` / `sse` / `stdio`)** or **REST API (OpenAPI auto-discovery or doc inference)**:
     - For REST APIs without a hosted `/openapi.json`, paste `curl` examples, endpoint notes, or click **Try REST doc-to-OpenAPI example** so Skill Builder synthesizes a complete **OpenAPI 3.0.3 YAML specification**.
     - Configure **AuthN** (`service_account_adc`, `oauth2_client_credentials`, `bearer_token`, or `api_key`), **Google Cloud Secret Manager URI**, **Required AuthZ Scopes**, and **Read-Only Guardrail** (blocks `DELETE`, `PUT`, and `DROP`).
   - Click **Discover / infer tools (OpenAPI 3.0 / MCP)** to preview or **Connect & attach tool** to bind the endpoint to your skill.

3. **Stage 3 - Sandbox Test (Cloud Run Gen2 gVisor + Loopback Tool Verification)**:
   - Click **Run sandbox test**.
   - The sandbox generates the complete skill bundle (`SKILL.md`, `scripts/analyze_cost_anomalies.py`, `scripts/tool_client.py`, `references/tools_manifest.json`, `references/openapi_spec.yaml`, `tests/fixtures/mock_payload.json`), executes a live loopback HTTP server inside the sandbox to verify `401 Unauthorized` (missing AuthN token), `403 Forbidden` (missing AuthZ scope or blocked `DELETE`), and `200 OK` (valid credential + scope), and runs static AST/Bandit security checks (`SEC-01` through `SEC-06`).

4. **Stage 4 - Evaluations (SkillsBench + Harbor)**:
   - Click **Run evaluation** to execute all 5 paired `Baseline (No-Skill)` vs. `With-Skill` trials (`harbor-trial-01` through `harbor-trial-05`), including connected MCP/OpenAPI tool invocation and AuthN/AuthZ enforcement.
   - Inspect the Normalized Gain ($g$), token reduction, and generated Harbor verifier files (`task.toml`, `instruction.md`, `solution/solve.sh`, `tests/test_outputs.py`).

5. **Stage 5 - Publish**:
   - Select one or more destinations: **Agent Registry** (default), **Gemini Enterprise**, or **Download `.zip` archive**, and click **Publish skill**.

---

## Repository Structure

```text
enterprise-skill-builder/
|-- cmd/
|   |-- server/main.go               # Main IAP-protected Web Portal & API server (Golang)
|   `-- sandbox-worker/main.go       # Isolated Cloud Run Gen2 gVisor Sandbox Worker daemon
|-- internal/
|   |-- auth/iap.go                  # Cloud Run Identity-Aware Proxy (IAP) JWT & header verifier
|   |-- interview/engine.go          # Gemini 3.8 Flash Live Voice/Text Interview & Blueprint Canvas engine
|   |-- importer/adapter.go          # Web URL Skill Importer & Adapter (Anthropic/OpenAI -> Gemini, GE & Antigravity)
|   |-- importer/adapter_test.go     # Unit tests for Anthropic Claude & OpenAI URL adaptation
|   |-- grounding/grounder.go        # BYO-MCP JSON-RPC discovery, OpenAPI 3.0 doc inference, AuthN/AuthZ & fixtures
|   |-- grounding/grounder_test.go   # Unit tests for BYO-MCP discovery & OpenAPI 3.0.3 inference
|   |-- sandbox/agy_harness.go       # Headless Antigravity CLI (agy) runner, tool loopback verifier & AST/Bandit scanner
|   |-- sandbox/agy_harness_test.go  # Integration tests for sandbox bundle synthesis & loopback AuthN/AuthZ
|   |-- eval/skillsbench.go          # SkillsBench + Harbor task generator & paired 5-trial evaluation runner
|   |-- eval/skillsbench_test.go     # Unit tests for 5-trial SkillsBench + Harbor evaluation suite
|   |-- registry/publisher.go        # Agent Platform Skill Registry & DiscoveryEngine publisher + ZIP packager
|   |-- models/types.go              # Domain models
|   `-- store/store.go               # Session store with pre-seeded enterprise FinOps showcase
|-- runtime/
|   `-- ge_frozen_requirements.txt   # Frozen Python 3.11 package list matching the Gemini Enterprise runtime
|-- terraform/
|   |-- providers.tf                 # Google & Google-Beta providers
|   |-- variables.tf                 # Customer inputs (project_id, iap_allowed_members, optional overrides)
|   |-- iam.tf                       # Dedicated SAs, least-privilege IAM roles, Secret Manager & IAP bindings
|   |-- main.tf                      # Artifact Registry, automated Cloud Build trigger, VPC, Sandbox, and IAP Web App
|   |-- outputs.tf                   # Cloud Run URLs and Service Account outputs
|   `-- terraform.tfvars.example     # Minimal customer configuration template
|-- web/public/
|   |-- index.html                   # 5-stage Enterprise Skill Builder Web Studio
|   |-- styles.css                   # Vanilla CSS Design System
|   `-- app.js                       # Interactive SPA client
|-- Dockerfile.web                   # Multi-stage container build for Cloud Run Web Portal
|-- Dockerfile.sandbox               # Container build for Cloud Run Gen2 gVisor Sandbox (Python 3.11 + agy + Harbor)
`-- Makefile                         # Local dev, build, test, container, and Terraform targets
```
