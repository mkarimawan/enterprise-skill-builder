package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/googlecloudplatform/enterprise-skill-builder/internal/models"
	"github.com/googlecloudplatform/enterprise-skill-builder/internal/sandbox"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}
	projectID := os.Getenv("GOOGLE_CLOUD_QUOTA_PROJECT")
	if projectID == "" {
		projectID = os.Getenv("GOOGLE_CLOUD_PROJECT")
	}
	workDir := os.Getenv("SANDBOX_WORKDIR")

	harness := sandbox.NewHarness(projectID, "", workDir)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":       "ok",
			"service":      "skill-builder-sandbox-worker",
			"agyAdcAuth":   os.Getenv("AGY_ADC_AUTH"),
			"quotaProject": projectID,
		})
	})

	mux.HandleFunc("POST /v1/sandbox/execute", func(w http.ResponseWriter, r *http.Request) {
		var session models.SkillSession
		if err := json.NewDecoder(r.Body).Decode(&session); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		files, events, secReport, err := harness.ExecuteLocalSandbox(r.Context(), &session)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"generatedFiles": files,
			"agyEvents":      events,
			"securityReport": secReport,
		})
	})

	log.Printf("Isolated Cloud Run Gen2 gVisor Sandbox Worker listening on :%s (AGY_ADC_AUTH=%s)", port, os.Getenv("AGY_ADC_AUTH"))
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("sandbox worker failed: %v", err)
	}
}
