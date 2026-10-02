package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/googlecloudplatform/enterprise-skill-builder/internal/auth"
	"github.com/googlecloudplatform/enterprise-skill-builder/internal/eval"
	"github.com/googlecloudplatform/enterprise-skill-builder/internal/grounding"
	"github.com/googlecloudplatform/enterprise-skill-builder/internal/interview"
	"github.com/googlecloudplatform/enterprise-skill-builder/internal/models"
	"github.com/googlecloudplatform/enterprise-skill-builder/internal/registry"
	"github.com/googlecloudplatform/enterprise-skill-builder/internal/sandbox"
	"github.com/googlecloudplatform/enterprise-skill-builder/internal/store"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}
	projectID := os.Getenv("GOOGLE_CLOUD_PROJECT")
	location := os.Getenv("GOOGLE_CLOUD_LOCATION")
	if location == "" {
		location = "us-central1"
	}
	liveModel := os.Getenv("GEMINI_LIVE_MODEL")
	if liveModel == "" {
		liveModel = "gemini-3.6-flash"
	}
	sandboxWorkerURL := os.Getenv("SANDBOX_WORKER_URL")

	harness := sandbox.NewHarness(projectID, sandboxWorkerURL, "")
	interviewEngine := interview.NewEngine(projectID, location, liveModel)
	sessionStore := store.NewStore(harness)

	mux := http.NewServeMux()

	// Health check
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":     "ok",
			"service":    "enterprise-skill-builder-web",
			"liveModel":  liveModel,
			"sandboxUrl": sandboxWorkerURL,
		})
	})

	// IAP Identity Endpoint
	mux.HandleFunc("GET /api/identity", func(w http.ResponseWriter, r *http.Request) {
		id := auth.FromContext(r.Context())
		writeJSON(w, http.StatusOK, map[string]any{
			"identity":       id,
			"projectId":      projectID,
			"region":         location,
			"liveModel":      liveModel,
			"architectModel": "gemini-3.1-pro-preview",
			"sandboxRuntime": "Cloud Run Gen2 gVisor + Python 3.11 Frozen GE + Headless AGY (AGY_ADC_AUTH=true)",
		})
	})

	// List Sessions
	mux.HandleFunc("GET /api/sessions", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"sessions": sessionStore.ListSessions(),
		})
	})

	// Create Session
	mux.HandleFunc("POST /api/sessions", func(w http.ResponseWriter, r *http.Request) {
		id := auth.FromContext(r.Context())
		var body struct {
			Preset string `json:"preset"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)

		sess := sessionStore.CreateSession(id.Email, body.Preset)
		if body.Preset != "" {
			_, _, _ = interviewEngine.ProcessTurn(r.Context(), sess, body.Preset, "text")
		}
		writeJSON(w, http.StatusCreated, sess)
	})

	// Dynamic session routes: /api/sessions/{id}[/action]
	mux.HandleFunc("/api/sessions/", func(w http.ResponseWriter, r *http.Request) {
		trimmed := strings.TrimPrefix(r.URL.Path, "/api/sessions/")
		parts := strings.Split(strings.Trim(trimmed, "/"), "/")
		if len(parts) == 0 || parts[0] == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing session id"})
			return
		}
		sessID := parts[0]
		sess, ok := sessionStore.GetSession(sessID)
		if !ok {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "session not found"})
			return
		}

		if len(parts) == 1 && r.Method == http.MethodGet {
			writeJSON(w, http.StatusOK, sess)
			return
		}

		action := ""
		if len(parts) > 1 {
			action = parts[1]
		}

		switch {
		case action == "interview" && r.Method == http.MethodPost:
			var req struct {
				Message  string `json:"message"`
				Modality string `json:"modality"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Message) == "" {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "message is required"})
				return
			}
			reply, bp, err := interviewEngine.ProcessTurn(r.Context(), sess, req.Message, req.Modality)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"reply":     reply,
				"blueprint": bp,
				"session":   sess,
			})

		case action == "grounding" && r.Method == http.MethodPost:
			var req struct {
				Name       string `json:"name"`
				SourceType string `json:"sourceType"`
				RawSchema  string `json:"rawSchema"`
			}
			_ = json.NewDecoder(r.Body).Decode(&req)
			asset := grounding.SynthesizeAsset(req.Name, req.SourceType, req.RawSchema)
			sess.GroundingAssets = append(sess.GroundingAssets, asset)
			if sess.Blueprint.ReadinessScore < 95 {
				sess.Blueprint.ReadinessScore = 95
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"asset":   asset,
				"session": sess,
			})

		case action == "sandbox" && r.Method == http.MethodPost:
			files, events, secReport, err := harness.BuildAndVerify(r.Context(), sess)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			sess.GeneratedFiles = files
			sess.AgyEvents = events
			sess.SecurityReport = secReport
			sess.Stage = "sandbox"
			writeJSON(w, http.StatusOK, map[string]any{
				"generatedFiles": files,
				"agyEvents":      events,
				"securityReport": secReport,
				"session":        sess,
			})

		case action == "eval" && r.Method == http.MethodPost:
			if len(sess.GeneratedFiles) == 0 {
				files, events, secReport, err := harness.BuildAndVerify(r.Context(), sess)
				if err == nil {
					sess.GeneratedFiles = files
					sess.AgyEvents = events
					sess.SecurityReport = secReport
				}
			}
			report, err := eval.RunSkillsBenchHarbor(sess)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			sess.HarborReport = report
			sess.Stage = "eval"
			writeJSON(w, http.StatusOK, map[string]any{
				"harborReport": report,
				"session":      sess,
			})

		case action == "publish" && r.Method == http.MethodPost:
			id := auth.FromContext(r.Context())
			var req models.PublishRequest
			_ = json.NewDecoder(r.Body).Decode(&req)
			if req.Target == "" {
				req.Target = "all"
			}
			if len(sess.GeneratedFiles) == 0 {
				files, events, secReport, _ := harness.BuildAndVerify(r.Context(), sess)
				sess.GeneratedFiles = files
				sess.AgyEvents = events
				sess.SecurityReport = secReport
			}
			results, err := registry.Publish(sess, req, id.Email)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			sess.Stage = "publish"
			writeJSON(w, http.StatusOK, map[string]any{
				"results": results,
				"session": sess,
			})

		case action == "download" && (r.Method == http.MethodGet || r.Method == http.MethodHead):
			if len(sess.GeneratedFiles) == 0 {
				files, events, secReport, _ := harness.BuildAndVerify(r.Context(), sess)
				sess.GeneratedFiles = files
				sess.AgyEvents = events
				sess.SecurityReport = secReport
			}
			zipBytes, _, err := registry.BuildZipBundle(sess)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			filename := sess.Blueprint.Name
			if filename == "" {
				filename = "enterprise-skill-bundle"
			}
			w.Header().Set("Content-Type", "application/zip")
			w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename+"-bundle.zip"))
			_, _ = w.Write(zipBytes)

		default:
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "unsupported action"})
		}
	})

	// Static Web App Serving
	staticDir := os.Getenv("WEB_STATIC_DIR")
	if staticDir == "" {
		staticDir = filepath.Join("web", "public")
	}
	fs := http.FileServer(http.Dir(staticDir))
	mux.Handle("/", fs)

	handler := auth.IAPMiddleware(mux)
	log.Printf("Enterprise Skill Builder listening on :%s (static=%s)", port, staticDir)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
