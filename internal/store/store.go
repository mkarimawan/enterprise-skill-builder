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
	s.seedShowcaseSession(harness)
	return s
}

func (s *Store) seedShowcaseSession(harness *sandbox.Harness) {
	now := time.Now().UTC()
	bp := models.SkillBlueprint{
		Name:        "finops-cost-anomaly-analyzer",
		DisplayName: "FinOps Cloud Cost Anomaly & Commitment Analyzer",
		Summary:     "Detects daily GCP billing SKU spikes, correlates anomalies with Cloud Run and BigQuery labels, validates three-way invoice tolerances, and outputs deterministic JSON remediation actions for Gemini Enterprise (Spark / Sobi) and Antigravity 2.0.",
		TargetPlatforms: []string{
			"Gemini Enterprise Spark (Sobi / Obi VMaaS)",
			"Gemini Enterprise Web (Dolphin)",
			"Antigravity 2.0 / ADK SkillToolset",
		},
		RuntimeProfile: "GE Python 3.11 Frozen (ge_skills_image) + Vendored scripts/lib/",
		UseWhenTriggers: []string{
			"User asks to investigate daily GCP billing spikes, SKU cost anomalies, or FinOps commitment coverage",
			"User wants deterministic three-way PO/Invoice variance checks and missing governance label audits (`cost_center`, `owner`, `env`)",
		},
		DoNotUseTriggers: []string{
			"Do not use for unlinking production billing accounts or executing destructive Terraform state deletions",
			"Do not use for non-structured free-text invoices without JSON/CSV schema grounding",
		},
		InputParameters: []models.ParamSpec{
			{Flag: "--input-json", Type: "path", Required: true, Description: "Path to BigQuery billing export or grounded JSON payload", Example: "tests/fixtures/mock_payload.json"},
			{Flag: "--z-score-threshold", Type: "float", Required: false, Description: "Standard deviation z-score threshold for flagging daily SKU spikes", Example: "2.5"},
			{Flag: "--require-labels", Type: "csv", Required: false, Description: "Mandatory FinOps governance labels to audit on every workload", Example: "cost_center,owner,env"},
			{Flag: "--output-format", Type: "enum(json|markdown)", Required: false, Description: "Deterministic output contract format", Example: "json"},
		},
		Scripts: []models.ScriptSpec{
			{
				Filename:       "scripts/analyze_cost_anomalies.py",
				Purpose:        "Computes exact Decimal USD variance, rolling z-scores, three-way invoice tolerances, and governance label compliance in an air-gapped Python 3.11 environment.",
				PackagesUsed:   []string{"json", "argparse", "decimal", "hashlib", "pathlib"},
				VendoredLibs:   []string{},
				OutputContract: "Strict JSON object with `status`, `anomaly_count`, `total_daily_delta_usd`, `anomalies[]`, `blocked_invoices[]`, and `audit_hash`.",
			},
		},
		ReferenceDocs: []string{
			"references/domain_schema.md",
			"references/operational_guardrails.md",
		},
		GuardrailsGotchas: []string{
			"Always quantize USD currency values using `decimal.Decimal` (`ROUND_HALF_UP`) to eliminate IEEE 754 floating-point drift",
			"Guard standard-deviation division with `max(std_dev, 1e-6)` so zero-variance baseline SKUs never raise `ZeroDivisionError`",
			"Enforce zero external network calls inside `scripts/`; operate strictly on grounded JSON/CSV inputs for GE sandbox security",
		},
		EvalAssertions: []string{
			"Flags `rec-1001` (Cloud Run, z=21.85) and `rec-1002` (BigQuery, z=26.43) with exact `total_daily_delta_usd = 3931.25`",
			"Detects missing `owner` governance label on `rec-1001` and three-way quantity mismatch on `rec-1002`",
			"Achieves 1.0 reward in Harbor verifier (`/logs/verifier/reward.txt`) with Normalized Gain g = 1.00",
		},
		ReadinessScore: 98,
		OpenQuestions:  []string{},
	}

	session := &models.SkillSession{
		ID:         "session-finops-showcase",
		CreatedAt:  now.Add(-15 * time.Minute),
		UpdatedAt:  now,
		OwnerEmail: "karimawan@google.com",
		Stage:      "interview",
		Messages: []models.ChatMessage{
			{
				ID:        "msg-1",
				Role:      "user",
				Modality:  "voice",
				Content:   "We need a deterministic FinOps and Procurement skill for Gemini Enterprise Spark and Antigravity that analyzes our daily BigQuery billing export and SAP PO lines, flags cost spikes over 2.5 sigma, and checks for missing cost_center and owner labels.",
				Timestamp: now.Add(-14 * time.Minute),
			},
			{
				ID:        "msg-2",
				Role:      "assistant",
				Modality:  "voice",
				Content:   "I have captured the **finops-cost-anomaly-analyzer** blueprint on the live canvas, targeting both Gemini Enterprise (Spark / Sobi / Dolphin) and Antigravity 2.0.\n\nTo make `scripts/analyze_cost_anomalies.py` 100% deterministic, I have two quick clarifying questions:\n1. **Threshold Rules**: What minimum daily dollar increase or z-score threshold should classify an anomaly as `CRITICAL`?\n2. **Three-Way Match & Label Governance**: Should the script also block invoices when unit price variance exceeds `2.0%` or `invoice_qty > gr_qty`, and audit `cost_center,owner,env` labels?",
				Timestamp: now.Add(-13 * time.Minute),
			},
			{
				ID:        "msg-3",
				Role:      "user",
				Modality:  "voice",
				Content:   "Yes, enforce a $250 minimum daily delta, 2.5 sigma threshold, strict Decimal currency rounding, and block any invoice with >2% price variance or quantity over-delivery.",
				Timestamp: now.Add(-12 * time.Minute),
			},
			{
				ID:        "msg-4",
				Role:      "assistant",
				Modality:  "voice",
				Content:   "Blueprint locked in (`Readiness Score: 98%`). I have also grounded the BigQuery billing export schema (`bq://finops_prod.gcp_billing_export_v1`), compiled and self-healed the Python 3.11 skill bundle via the headless Antigravity CLI (`agy`) in the sandbox, and executed the paired **SkillsBench + Harbor** evaluation suite (`Normalized Gain g = +100%`, `reward.txt = 1.0`). You can inspect every stage using the tabs above or start a new skill interview!",
				Timestamp: now.Add(-11 * time.Minute),
			},
		},
		Blueprint: bp,
		GroundingAssets: []models.GroundingAsset{
			grounding.SynthesizeAsset("bq://finops_prod.gcp_billing_export_v1", "bigquery", ""),
			grounding.SynthesizeAsset("mcp://cloud-run-fleet-diagnostics/tools/list", "mcp", ""),
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

func (s *Store) CreateSession(ownerEmail, titleHint string) *models.SkillSession {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	id := fmt.Sprintf("session-%d", now.UnixNano())
	bp := models.SkillBlueprint{
		Name:        "new-enterprise-skill",
		DisplayName: "New Enterprise Skill Blueprint",
		Summary:     "Speak or type in the Interview Studio to define your skill's triggers, deterministic Python 3.11 scripts, and grounded schemas.",
		TargetPlatforms: []string{
			"Gemini Enterprise Spark (Sobi / Obi VMaaS)",
			"Gemini Enterprise Web (Dolphin)",
			"Antigravity 2.0 / ADK SkillToolset",
		},
		RuntimeProfile:    "GE Python 3.11 Frozen (ge_skills_image) + Vendored scripts/lib/",
		UseWhenTriggers:   []string{},
		DoNotUseTriggers:  []string{},
		InputParameters:   []models.ParamSpec{},
		Scripts:           []models.ScriptSpec{},
		ReferenceDocs:     []string{},
		GuardrailsGotchas: []string{},
		EvalAssertions:    []string{},
		ReadinessScore:    15,
		OpenQuestions: []string{
			"What workflow or business problem should this skill solve deterministically?",
			"What input data source (BigQuery, OpenAPI, SAP, MCP) will the skill process?",
		},
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
				Modality:  "voice",
				Content:   "Welcome to the **Enterprise Skill Builder Studio** (Gemini 3.6 Flash Live). Tell me by voice or text what skill you want to build for Gemini Enterprise (Spark / Sobi / Dolphin) or Antigravity 2.0, or pick one of the Enterprise Templates above.",
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
