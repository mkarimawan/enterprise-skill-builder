# Enable required Google Cloud APIs for building and running the application
locals {
  required_apis = [
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "iap.googleapis.com",
    "aiplatform.googleapis.com",
    "discoveryengine.googleapis.com",
    "compute.googleapis.com",
    "storage.googleapis.com",
    "firestore.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "iam.googleapis.com",
  ]
}

resource "google_project_service" "enabled_apis" {
  for_each           = toset(local.required_apis)
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# 1. Dedicated Service Account for the Main Web Portal (Cloud Run behind IAP)
resource "google_service_account" "web_sa" {
  account_id   = "skill-builder-web-sa"
  display_name = "Enterprise Skill Builder Web Portal Service Account"
  description  = "Identity for the IAP-protected Skill Builder Portal, Live Interview Engine, and Agent Registry / Gemini Enterprise Publisher."
  depends_on   = [google_project_service.enabled_apis]
}

# 2. Dedicated Least-Privilege Service Account for the Isolated Cloud Run Gen2 gVisor Sandbox Worker
resource "google_service_account" "sandbox_sa" {
  account_id   = "skill-builder-sandbox-sa"
  display_name = "Enterprise Skill Builder Sandbox Worker Service Account"
  description  = "Identity for the isolated Cloud Run Gen2 gVisor sandbox running headless Antigravity CLI (agy) with AGY_ADC_AUTH=true."
  depends_on   = [google_project_service.enabled_apis]
}

# Grant Web App SA permission to call Vertex AI Gemini 3 Live API & Schema Grounding
resource "google_project_iam_member" "web_vertex_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.web_sa.email}"
}

# Grant Web App SA permission to read/write Firestore session state
resource "google_project_iam_member" "web_firestore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.web_sa.email}"
}

# Grant Web App SA permission to register skills in Gemini Enterprise (Discovery Engine) and Agent Registry
resource "google_project_iam_member" "web_discoveryengine_admin" {
  project = var.project_id
  role    = "roles/discoveryengine.admin"
  member  = "serviceAccount:${google_service_account.web_sa.email}"
}

# Grant Web App SA permission to invoke ONLY the isolated Sandbox Worker Cloud Run service
resource "google_cloud_run_v2_service_iam_member" "web_invokes_sandbox" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.sandbox_worker.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.web_sa.email}"
}

# Grant Sandbox Worker SA permission to authenticate Antigravity CLI (agy) via ADC and quota project
resource "google_project_iam_member" "sandbox_vertex_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.sandbox_sa.email}"
}

resource "google_project_iam_member" "sandbox_service_usage_consumer" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:${google_service_account.sandbox_sa.email}"
}

# Provision IAP Service Identity and grant it Cloud Run Invoker on the Web Portal when IAP is enabled
resource "google_project_service_identity" "iap_sa" {
  count      = var.enable_iap ? 1 : 0
  provider   = google-beta
  project    = var.project_id
  service    = "iap.googleapis.com"
  depends_on = [google_project_service.enabled_apis]
}

resource "google_cloud_run_v2_service_iam_member" "iap_invokes_web" {
  count    = var.enable_iap ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.web_app.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_project_service_identity.iap_sa[0].email}"
}

# Grant customer-specified IAM principals (business users / groups) access through Identity-Aware Proxy (IAP)
resource "google_iap_web_cloud_run_service_iam_member" "iap_allowed_users" {
  for_each               = var.enable_iap ? toset(var.iap_allowed_members) : toset([])
  provider               = google-beta
  project                = var.project_id
  location               = var.region
  cloud_run_service_name = google_cloud_run_v2_service.web_app.name
  role                   = "roles/iap.httpsResourceAccessor"
  member                 = each.value
}

# When enable_iap is false (optional direct IAM invoker mode), grant iap_allowed_members direct Cloud Run Invoker
resource "google_cloud_run_v2_service_iam_member" "direct_allowed_users" {
  for_each = var.enable_iap ? toset([]) : toset(var.iap_allowed_members)
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.web_app.name
  role     = "roles/run.invoker"
  member   = each.value
}
