# Artifact Registry Repository for storing the Web Portal and Sandbox Worker images
resource "google_artifact_registry_repository" "skill_builder_repo" {
  project       = var.project_id
  location      = var.region
  repository_id = "enterprise-skill-builder"
  description   = "Container images for Enterprise Skill Builder Web Portal and Cloud Run Gen2 gVisor Sandbox Worker"
  format        = "DOCKER"
  depends_on    = [google_project_service.enabled_apis]
}

locals {
  default_web_image     = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.skill_builder_repo.repository_id}/skill-builder-web:latest"
  default_sandbox_image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.skill_builder_repo.repository_id}/skill-builder-sandbox:latest"

  resolved_web_image     = var.web_container_image != "" ? var.web_container_image : local.default_web_image
  resolved_sandbox_image = var.sandbox_container_image != "" ? var.sandbox_container_image : local.default_sandbox_image
}

# Automatically build and push Dockerfile.web and Dockerfile.sandbox via Cloud Build during terraform apply
# when custom image URIs are not explicitly provided.
resource "terraform_data" "build_container_images" {
  count = (var.web_container_image == "" || var.sandbox_container_image == "") ? 1 : 0

  triggers_replace = [
    filesha256("${path.module}/../Dockerfile.web"),
    filesha256("${path.module}/../Dockerfile.sandbox"),
    filesha256("${path.module}/../cmd/server/main.go"),
    filesha256("${path.module}/../cmd/sandbox-worker/main.go"),
    filesha256("${path.module}/../web/public/index.html"),
    filesha256("${path.module}/../web/public/app.js"),
    filesha256("${path.module}/../web/public/styles.css"),
  ]

  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = <<-EOT
      set -e
      echo "Building and pushing Enterprise Skill Builder Web Portal image to ${local.default_web_image}..."
      gcloud builds submit --project="${var.project_id}" --region="${var.region}" --tag "${local.default_web_image}" -f Dockerfile.web .
      echo "Building and pushing Cloud Run Gen2 Sandbox Worker image to ${local.default_sandbox_image}..."
      gcloud builds submit --project="${var.project_id}" --region="${var.region}" --tag "${local.default_sandbox_image}" -f Dockerfile.sandbox .
    EOT
  }

  depends_on = [google_artifact_registry_repository.skill_builder_repo]
}

# Isolated VPC Network for the Cloud Run Gen2 gVisor Sandbox Worker
# Blocks arbitrary public internet egress while permitting Private Google Access to Vertex AI and GCS
resource "google_compute_network" "sandbox_vpc" {
  name                    = "skill-builder-sandbox-vpc"
  auto_create_subnetworks = false
  project                 = var.project_id
  depends_on              = [google_project_service.enabled_apis]
}

resource "google_compute_subnetwork" "sandbox_subnet" {
  name                     = "skill-builder-sandbox-subnet"
  ip_cidr_range            = "10.24.0.0/24"
  region                   = var.region
  network                  = google_compute_network.sandbox_vpc.id
  private_ip_google_access = true
}

# GCS Bucket for storing generated Skill Bundles (.zip), Mock Fixtures, and Harbor Eval Reports
resource "google_storage_bucket" "skill_artifacts" {
  name                        = "${var.project_id}-enterprise-skill-bundles"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true

  versioning {
    enabled = true
  }

  depends_on = [google_project_service.enabled_apis]
}

resource "google_storage_bucket_iam_member" "web_bucket_admin" {
  bucket = google_storage_bucket.skill_artifacts.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.web_sa.email}"
}

resource "google_storage_bucket_iam_member" "sandbox_bucket_admin" {
  bucket = google_storage_bucket.skill_artifacts.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.sandbox_sa.email}"
}

# 1. Isolated Cloud Run Gen2 gVisor Sandbox Worker Service
# Runs headless Antigravity CLI (agy --input-format=stream-json --output-format=stream-json)
# inside the frozen Python 3.11 Gemini Enterprise runtime + Harbor evaluation suite
resource "google_cloud_run_v2_service" "sandbox_worker" {
  provider            = google-beta
  name                = "skill-builder-sandbox"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = false

  template {
    service_account                  = google_service_account.sandbox_sa.email
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    max_instance_request_concurrency = 1
    timeout                          = "900s"

    scaling {
      min_instance_count = 0
      max_instance_count = 20
    }

    vpc_access {
      network_interfaces {
        network    = google_compute_network.sandbox_vpc.name
        subnetwork = google_compute_subnetwork.sandbox_subnet.name
      }
      egress = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = local.resolved_sandbox_image

      ports {
        container_port = 8081
      }

      resources {
        limits = {
          cpu    = "4"
          memory = "8Gi"
        }
      }

      env {
        name  = "AGY_ADC_AUTH"
        value = "true"
      }
      env {
        name  = "GOOGLE_CLOUD_QUOTA_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = var.region
      }
      env {
        name  = "ARTIFACT_BUCKET"
        value = google_storage_bucket.skill_artifacts.name
      }
      env {
        name  = "GEMINI_ARCHITECT_MODEL"
        value = var.gemini_architect_model
      }
    }
  }

  depends_on = [
    google_project_service.enabled_apis,
    terraform_data.build_container_images,
  ]
}

# 2. Main Enterprise Skill Builder Web Portal (Protected by Identity-Aware Proxy)
resource "google_cloud_run_v2_service" "web_app" {
  provider            = google-beta
  name                = "skill-builder-web"
  location            = var.region
  launch_stage        = "BETA"
  ingress             = "INGRESS_TRAFFIC_ALL"
  iap_enabled         = var.enable_iap
  deletion_protection = false

  template {
    service_account       = google_service_account.web_sa.email
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
    timeout               = "3600s"

    scaling {
      min_instance_count = 1
      max_instance_count = 10
    }

    containers {
      image = local.resolved_web_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "2"
          memory = "4Gi"
        }
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = var.region
      }
      env {
        name  = "SANDBOX_WORKER_URL"
        value = google_cloud_run_v2_service.sandbox_worker.uri
      }
      env {
        name  = "ARTIFACT_BUCKET"
        value = google_storage_bucket.skill_artifacts.name
      }
      env {
        name  = "DISCOVERY_ENGINE_APP_ID"
        value = var.discovery_engine_app_id
      }
      env {
        name  = "DISCOVERY_ENGINE_LOCATION"
        value = var.discovery_engine_location
      }
      env {
        name  = "GEMINI_LIVE_MODEL"
        value = var.gemini_live_model
      }
      env {
        name  = "GEMINI_ARCHITECT_MODEL"
        value = var.gemini_architect_model
      }
    }
  }

  depends_on = [
    google_cloud_run_v2_service.sandbox_worker,
    terraform_data.build_container_images,
  ]
}
