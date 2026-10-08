# Enterprise Skill Builder for Gemini Enterprise & Antigravity 2.0

An open-source, customer-deployable web application and Cloud Run Gen2 gVisor sandbox factory that enables Customer Engineers (CEs), Solutions Architects, and business users to interview by voice or text, ground enterprise schemas, compile and self-heal deterministic Python 3.11 skills via the headless **Antigravity CLI (`agy`)**, evaluate lift via **SkillsBench + Harbor**, and register skills directly into the **Google Cloud Agent Platform Skill Registry** and **Gemini Enterprise**.

---

## How Terraform & the Web Portal Work Together

This repository separates **One-Time Platform Deployment (Terraform)** from **Day-to-Day Skill Creation & Registration (Web Portal)**:

1. **One-Time Admin Deployment (`terraform init && terraform plan && terraform apply`)**:
   - A Cloud Administrator runs Terraform **once** against a target GCP project.
   - Terraform automatically:
     1. Enables all required Google Cloud APIs (`run`, `cloudbuild`, `artifactregistry`, `iap`, `aiplatform`, `discoveryengine`, `compute`, `storage`, `iam`).
     2. Creates an **Artifact Registry** Docker repository (`enterprise-skill-builder`) and automatically runs **Cloud Build** to build and push both `Dockerfile.web` and `Dockerfile.sandbox` from source.
     3. Creates two dedicated least-privilege Service Accounts:
        - `skill-builder-web-sa`: Runs the Web Portal and holds permissions (`roles/aiplatform.user`, `roles/discoveryengine.admin`, `roles/storage.objectAdmin`) to publish skills into the Agent Registry and Gemini Enterprise.
        - `skill-builder-sandbox-sa`: Runs the isolated sandbox worker with `AGY_ADC_AUTH=true` and `GOOGLE_CLOUD_QUOTA_PROJECT=<project_id>`.
     4. Provisions an isolated VPC (`skill-builder-sandbox-vpc`) and deploys the **Cloud Run Gen2 gVisor Sandbox Worker** (`skill-builder-sandbox`) with internal-only ingress.
     5. Deploys the **Enterprise Skill Builder Web Portal** (`skill-builder-web`) on Cloud Run behind **Identity-Aware Proxy (IAP)** and grants access (`roles/iap.httpsResourceAccessor`) to the business users and groups specified in `iap_allowed_members`.

2. **Self-Service Portal for Business Users & Skill Builders (Zero Terraform Needed per Skill)**:
   - Once Terraform outputs the `skill_builder_web_url`, any authorized business user, analyst, or engineer in `iap_allowed_members` simply opens that URL in their browser.
   - Inside the web portal, users can:
     - Conduct a **Voice or Text Interview** (`gemini-3.8-flash`) with the live **Skill Summary**, or **Import & Adapt an Existing Skill from a Web URL** (automatically converting skills built for Anthropic Claude or OpenAI GPT/Codex to `gemini-3.8-flash`, Gemini Enterprise, and Antigravity 2.0).
     - Attach **Business Data, Bring-Your-Own MCP Servers, or REST APIs**:
       - Connect custom **MCP servers** (`streamable_http`, `sse`, or `stdio`) with live JSON-RPC 2.0 `tools/list` discovery.
       - Connect **REST APIs** with automatic `/openapi.json` discovery or **OpenAPI 3.0.3 YAML inference** directly from pasted API documentation, `curl` examples, or sample JSON payloads.
       - Configure **Authentication (AuthN)** (`service_account_adc`, `oauth2_client_credentials`, `bearer_token`, `api_key` backed by Google Cloud Secret Manager) and **Authorization (AuthZ)** (required OAuth2/IAM scopes and read-only HTTP method guardrails).
     - Click **Run sandbox test** to execute headless `agy` inside the frozen Python 3.11 Gemini Enterprise runtime, including live loopback verification of `scripts/tool_client.py` (`401 Unauthorized` on missing AuthN, `403 Forbidden` on missing AuthZ scope or blocked `DELETE`, and `200 OK` on authenticated tool invocation).
     - Run paired **SkillsBench + Harbor** evaluations (`Baseline No-Skill` vs. `With-Skill`, including `harbor-trial-05` for MCP/OpenAPI tool invocation & AuthN/AuthZ enforcement) and inspect `/logs/verifier/reward.txt` and Normalized Gain ($g$).
     - Publish the verified skill directly into the **Google Cloud Agent Registry**, attach it to a **Gemini Enterprise** app, or **Download the `.zip` archive**.

---

## Customer Admin Prerequisites (2 IAM Roles Required)

To deploy this application into a Google Cloud project (including Argolis or enterprise customer organizations), the deploying administrator only needs:

1. **Tools installed (or use Google Cloud Shell, which has all three pre-installed)**:
   - `gcloud` CLI (authenticated via `gcloud auth login` and `gcloud auth application-default login`)
   - `terraform` (`>= 1.6.0`)
   - `git`
2. **Required GCP IAM Roles on the Target Project** (for the admin running `terraform apply`):
   - **Role 1**: `roles/editor` (Project Editor - to enable APIs and create Cloud Run, Artifact Registry, Cloud Build, VPC, and GCS resources)
   - **Role 2**: `roles/resourcemanager.projectIamAdmin` and `roles/iap.admin` (to create the dedicated Service Accounts, bind least-privilege IAM roles, and configure Identity-Aware Proxy access for business users)
   *(Note: Having `roles/owner` on the project covers both Role 1 and Role 2 automatically.)*

---

## 3-Step Customer Deployment Guide (`terraform plan` & `terraform apply`)

### Step 1: Clone the Repository & Configure `terraform.tfvars`

```bash
git clone https://github.com/mkarimawan/enterprise-skill-builder.git
cd enterprise-skill-builder

cp terraform/terraform.tfvars.example terraform/terraform.tfvars
```

Edit `terraform/terraform.tfvars` with your GCP `project_id` and the users/groups who should have access to the Web Portal:

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

### Step 2: Initialize & Plan with Terraform

```bash
terraform -chdir=terraform init
terraform -chdir=terraform plan
```

### Step 3: Build & Deploy the Entire Application (`terraform apply`)

```bash
terraform -chdir=terraform apply
```

During `terraform apply`, Terraform will automatically:
1. Enable the required GCP APIs,
2. Create the Artifact Registry repository,
3. Trigger **Cloud Build** (`gcloud builds submit`) to build both `Dockerfile.web` and `Dockerfile.sandbox` in the cloud (no local Docker daemon required!),
4. Provision the Service Accounts, IAM bindings, VPC network lock, and both Cloud Run Gen2 services, and
5. Output your live portal URL:

```text
Outputs:

skill_builder_web_url         = "https://skill-builder-web-xxxxxxxxxx-uc.a.run.app"
sandbox_worker_internal_url   = "https://skill-builder-sandbox-xxxxxxxxxx-uc.a.run.app"
web_service_account_email     = "skill-builder-web-sa@your-gcp-project-id.iam.gserviceaccount.com"
sandbox_service_account_email = "skill-builder-sandbox-sa@your-gcp-project-id.iam.gserviceaccount.com"
skill_artifacts_bucket        = "your-gcp-project-id-enterprise-skill-bundles"
```

---

## Repository Structure

```text
enterprise-skill-builder/
├── cmd/
│   ├── server/main.go             # Main IAP-protected Web Portal & API server (Golang)
│   └── sandbox-worker/main.go     # Isolated Cloud Run Gen2 gVisor Sandbox Worker daemon
├── internal/
│   ├── auth/iap.go                # Cloud Run Identity-Aware Proxy (IAP) JWT & header verifier
│   ├── interview/engine.go        # Gemini 3.8 Flash Live Voice/Text Interview & Blueprint Canvas engine
│   ├── importer/adapter.go        # Web URL Skill Importer & Adapter (Anthropic/OpenAI -> Gemini, GE & Antigravity)
│   ├── grounding/grounder.go      # BYO-MCP JSON-RPC discovery, OpenAPI 3.0 doc inference, AuthN/AuthZ & fixtures
│   ├── sandbox/agy_harness.go     # Headless Antigravity CLI (agy) runner, tool loopback verifier & AST/Bandit scanner
│   ├── eval/skillsbench.go        # SkillsBench + Harbor task generator & paired 5-trial evaluation runner
│   ├── registry/publisher.go      # Agent Platform Skill Registry & DiscoveryEngine publisher + ZIP packager
│   ├── models/types.go            # Domain models
│   └── store/store.go             # Session store with pre-seeded enterprise FinOps showcase
├── runtime/
│   └── ge_frozen_requirements.txt # Frozen Python 3.11 package list matching the Gemini Enterprise runtime
├── terraform/
│   ├── providers.tf               # Google & Google-Beta providers
│   ├── variables.tf               # Customer inputs (project_id, iap_allowed_members, optional overrides)
│   ├── iam.tf                     # Dedicated SAs, least-privilege IAM roles, and IAP access bindings
│   ├── main.tf                    # Artifact Registry, automated Cloud Build trigger, VPC, Sandbox, and IAP Web App
│   ├── outputs.tf                 # Cloud Run URLs and Service Account outputs
│   └── terraform.tfvars.example   # Minimal customer configuration template
├── web/public/
│   ├── index.html                 # 5-stage Enterprise Skill Builder Web Studio
│   ├── styles.css                 # Vanilla CSS Design System
│   └── app.js                     # Interactive SPA client
├── Dockerfile.web                 # Multi-stage container build for Cloud Run Web Portal
├── Dockerfile.sandbox             # Container build for Cloud Run Gen2 gVisor Sandbox (Python 3.11 + agy + Harbor)
└── Makefile                       # Local dev, build, container, and Terraform targets
```
