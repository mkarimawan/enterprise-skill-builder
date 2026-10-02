variable "project_id" {
  description = "Target Google Cloud Project ID where the Enterprise Skill Builder application will be built and deployed."
  type        = string
}

variable "region" {
  description = "Primary Google Cloud region for Cloud Run, Artifact Registry, Cloud Build, and VPC networking."
  type        = string
  default     = "us-central1"
}

variable "enable_iap" {
  description = "Enable Cloud Run native Identity-Aware Proxy (IAP) on the Web Portal. Set to true for Google Workspace / Cloud Identity orgs."
  type        = bool
  default     = true
}

variable "iap_allowed_members" {
  description = "List of IAM principals (for example, user:admin@example.com, group:business-users@example.com, or domain:example.com) granted access to the Web Portal via IAP."
  type        = list(string)
  default     = []
}

variable "web_container_image" {
  description = "Optional custom container image URI for the Web App. If left empty, Terraform automatically builds and pushes Dockerfile.web via Cloud Build."
  type        = string
  default     = ""
}

variable "sandbox_container_image" {
  description = "Optional custom container image URI for the Sandbox Worker. If left empty, Terraform automatically builds and pushes Dockerfile.sandbox via Cloud Build."
  type        = string
  default     = ""
}

variable "discovery_engine_app_id" {
  description = "Optional Gemini Enterprise (Discovery Engine) App ID for direct one-click skill mounting onto Spark / Sobi / Dolphin."
  type        = string
  default     = ""
}

variable "discovery_engine_location" {
  description = "Discovery Engine location (global, us, or eu)."
  type        = string
  default     = "global"
}

variable "gemini_live_model" {
  description = "Vertex AI Gemini 3 model used for the Live Voice & Text Interview Studio."
  type        = string
  default     = "gemini-3.6-flash"
}

variable "gemini_architect_model" {
  description = "Vertex AI Gemini 3 model used by the headless Antigravity CLI (agy) inside the sandbox."
  type        = string
  default     = "gemini-3.1-pro-preview"
}
