package store

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/googlecloudplatform/enterprise-skill-builder/internal/eval"
	"github.com/googlecloudplatform/enterprise-skill-builder/internal/grounding"
	"github.com/googlecloudplatform/enterprise-skill-builder/internal/models"
	"github.com/googlecloudplatform/enterprise-skill-builder/internal/sandbox"
)

// Store manages SkillSession persistence in memory + disk/Firestore.
type Store struct {
	mu       sync.RWMutex
	sessions map[string]*models.SkillSession
	order    []string
}

func NewStore(harness *sandbox.Harness) *Store {
	s := &Store{
		sessions: make(map[string]*models.SkillSession),
	}
	// Seed a sample session in the background list, then create a clean empty session as the default first session.
	s.seedShowcaseSession(harness)
	s.CreateSession("karimawan@google.com", "")
	return s
}

func (s *Store) seedShowcaseSession(harness *sandbox.Harness) {
	now := time.Now().UTC()
	bp := models.SkillBlueprint{
		Name:        "finops-cost-anomaly-analyzer",
		DisplayName: "Sample: FinOps cost anomaly analyzer",
		Summary:     "Detects daily GCP billing SKU spikes, correlates anomalies with Cloud Run and BigQuery labels, and outputs deterministic JSON remediation actions.",
		TargetPlatforms: []string{
			"Gemini Enterprise",
			"Antigravity",
		},
		RuntimeProfile: "Python 3.11 sandbox",
		UseWhenTriggers: []string{
			"Investigate daily GCP billing spikes or SKU cost anomalies",
			"Audit workloads for missing cost_center, owner, or env labels",
		},
		DoNotUseTriggers: []string{
			"Unlinking billing accounts or deleting production resources",
		},
		InputParameters: []models.ParamSpec{
			{Flag: "--input-json", Type: "path", Required: true, Description: "Billing export JSON payload", Example: "tests/fixtures/mock_payload.json"},
			{Flag: "--z-score-threshold", Type: "float", Required: false, Description: "Z-score threshold for flagging spikes", Example: "2.5"},
			{Flag: "--require-labels", Type: "csv", Required: false, Description: "Required governance labels", Example: "cost_center,owner,env"},
		},
		Scripts: []models.ScriptSpec{
			{
				Filename:       "scripts/analyze_cost_anomalies.py",
				Purpose:        "Computes exact USD variance, z-scores, and governance label compliance.",
				PackagesUsed:   []string{"json", "argparse", "decimal", "hashlib", "pathlib"},
				VendoredLibs:   []string{},
				OutputContract: "JSON object with status, anomaly_count, total_daily_delta_usd, and anomalies[].",
			},
		},
		ReferenceDocs: []string{
			"references/domain_schema.md",
			"references/operational_guardrails.md",
		},
		GuardrailsGotchas: []string{
			"Quantize USD values using decimal.Decimal (ROUND_HALF_UP)",
			"Guard standard deviation division with max(std_dev, 1e-6)",
			"Run offline in sandbox with zero external network sockets",
		},
		EvalAssertions: []string{
			"Flags rec-1001 and rec-1002 with exact total_daily_delta_usd = 3931.25",
			"Detects missing owner label on rec-1001",
		},
		ReadinessScore: 98,
		OpenQuestions:  []string{},
	}

	session := &models.SkillSession{
		ID:         "session-finops-sample",
		CreatedAt:  now.Add(-15 * time.Minute),
		UpdatedAt:  now,
		OwnerEmail: "karimawan@google.com",
		Stage:      "interview",
		Messages: []models.ChatMessage{
			{
				ID:        "msg-1",
				Role:      "user",
				Modality:  "text",
				Content:   "Build a FinOps skill that checks our daily BigQuery billing export for cost spikes over 2.5 sigma and checks for missing cost_center and owner labels.",
				Timestamp: now.Add(-14 * time.Minute),
			},
			{
				ID:        "msg-2",
				Role:      "assistant",
				Modality:  "text",
				Content:   "I have created the **finops-cost-anomaly-analyzer** blueprint on the right.\n\nTwo quick questions to finalize the rules:\n1. What minimum daily dollar increase should trigger an alert?\n2. Should it also check PO vs. invoice price tolerances?",
				Timestamp: now.Add(-13 * time.Minute),
			},
			{
				ID:        "msg-3",
				Role:      "user",
				Modality:  "text",
				Content:   "Use a $250 minimum daily delta and a 2% invoice price tolerance.",
				Timestamp: now.Add(-12 * time.Minute),
			},
			{
				ID:        "msg-4",
				Role:      "assistant",
				Modality:  "text",
				Content:   "Blueprint is ready (`98%`). You can now test it in the sandbox or run evaluations from the left navigation.",
				Timestamp: now.Add(-11 * time.Minute),
			},
		},
		Blueprint: bp,
		GroundingAssets: []models.GroundingAsset{
			grounding.SynthesizeAsset("bq://finops_prod.gcp_billing_export_v1", "bigquery", ""),
		},
	}

	if harness != nil {
		if files, events, sec, err := harness.ExecuteLocalSandbox(context.Background(), session); err == nil {
			session.GeneratedFiles = files
			session.AgyEvents = events
			session.SecurityReport = sec
		}
	}
	if report, err := eval.RunSkillsBenchHarbor(session); err == nil {
		session.HarborReport = report
	}

	s.sessions[session.ID] = session
	s.order = append(s.order, session.ID)
}

func (s *Store) CreateSession(ownerEmail, _ string) *models.SkillSession {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	id := fmt.Sprintf("session-%d", now.UnixNano())
	bp := models.SkillBlueprint{
		Name:        "",
		DisplayName: "Untitled skill",
		Summary:     "",
		TargetPlatforms: []string{
			"Gemini Enterprise",
			"Antigravity",
		},
		RuntimeProfile:    "Python 3.11 sandbox",
		UseWhenTriggers:   []string{},
		DoNotUseTriggers:  []string{},
		InputParameters:   []models.ParamSpec{},
		Scripts:           []models.ScriptSpec{},
		ReferenceDocs:     []string{},
		GuardrailsGotchas: []string{},
		EvalAssertions:    []string{},
		ReadinessScore:    0,
		OpenQuestions:     []string{},
	}

	sess := &models.SkillSession{
		ID:         id,
		CreatedAt:  now,
		UpdatedAt:  now,
		OwnerEmail: ownerEmail,
		Stage:      "interview",
		Messages: []models.ChatMessage{
			{
				ID:        "msg-welcome",
				Role:      "assistant",
				Modality:  "text",
				Content:   "Describe the skill you want to build, or click the microphone to explain it by voice.",
				Timestamp: now,
			},
		},
		Blueprint:       bp,
		GroundingAssets: []models.GroundingAsset{},
		GeneratedFiles:  make(map[string]string),
	}

	s.sessions[id] = sess
	s.order = append([]string{id}, s.order...)
	return sess
}

func (s *Store) GetSession(id string) (*models.SkillSession, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess, ok := s.sessions[id]
	return sess, ok
}

func (s *Store) ListSessions() []*models.SkillSession {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*models.SkillSession, 0, len(s.order))
	for _, id := range s.order {
		if sess, ok := s.sessions[id]; ok {
			out = append(out, sess)
		}
	}
	return out
}
