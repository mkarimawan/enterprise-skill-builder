output "skill_builder_web_url" {
  description = "IAP-protected URL for the Enterprise Skill Builder Web Application."
  value       = google_cloud_run_v2_service.web_app.uri
}

output "sandbox_worker_internal_url" {
  description = "Internal-only URL for the Cloud Run Gen2 gVisor Sandbox Worker."
  value       = google_cloud_run_v2_service.sandbox_worker.uri
}

output "web_service_account_email" {
  description = "Dedicated Service Account email for the Web Application."
  value       = google_service_account.web_sa.email
}

output "sandbox_service_account_email" {
  description = "Dedicated Service Account email for the isolated Sandbox Worker (used for AGY_ADC_AUTH=true)."
  value       = google_service_account.sandbox_sa.email
}

output "skill_artifacts_bucket" {
  description = "GCS bucket storing generated Skill .zip bundles and SkillsBench/Harbor evaluation trajectories."
  value       = google_storage_bucket.skill_artifacts.name
}
