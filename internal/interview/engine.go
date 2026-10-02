package interview

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/googlecloudplatform/enterprise-skill-builder/internal/models"
)

// Engine orchestrates the Dual-Mode Voice & Text Interview Studio powered by Gemini 3.6 Flash.
type Engine struct {
	ProjectID string
	Location  string
	Model     string
}

func NewEngine(projectID, location, model string) *Engine {
	if location == "" {
		location = "us-central1"
	}
	if model == "" {
		model = "gemini-3.6-flash"
	}
	return &Engine{
		ProjectID: projectID,
		Location:  location,
		Model:     model,
	}
}

// ProcessTurn ingests a user's voice transcript or text message, updates the live SkillBlueprint,
// and returns the next targeted architect question or readiness confirmation.
func (e *Engine) ProcessTurn(ctx context.Context, session *models.SkillSession, userInput string, modality string) (string, models.SkillBlueprint, error) {
	if modality == "" {
		modality = "text"
	}

	userMsg := models.ChatMessage{
		ID:        fmt.Sprintf("msg-%d", time.Now().UnixNano()),
		Role:      "user",
		Modality:  modality,
		Content:   userInput,
		Timestamp: time.Now().UTC(),
	}
	session.Messages = append(session.Messages, userMsg)

	// Update Blueprint deterministically + via Vertex AI Gemini 3.6 Flash when configured
	bp := session.Blueprint
	reply := e.synthesizeBlueprintAndReply(ctx, &bp, session.Messages, userInput)

	assistantMsg := models.ChatMessage{
		ID:        fmt.Sprintf("msg-%d", time.Now().UnixNano()+1),
		Role:      "assistant",
		Modality:  modality,
		Content:   reply,
		Timestamp: time.Now().UTC(),
	}
	session.Messages = append(session.Messages, assistantMsg)
	session.Blueprint = bp
	session.UpdatedAt = time.Now().UTC()

	return reply, bp, nil
}

func (e *Engine) synthesizeBlueprintAndReply(ctx context.Context, bp *models.SkillBlueprint, history []models.ChatMessage, latest string) string {
	lower := strings.ToLower(latest)

	// Try live Vertex AI Gemini 3.6 Flash structured extraction first if ProjectID is configured
	if e.ProjectID != "" {
		if aiReply, updatedBP, err := e.callVertexGemini(ctx, *bp, history); err == nil && aiReply != "" {
			*bp = updatedBP
			return aiReply
		}
	}

	// Deterministic Enterprise Skill Architect Extraction & Progressive Interviewing
	userTurns := 0
	for _, m := range history {
		if m.Role == "user" {
			userTurns++
		}
	}

	// Detect domain & slug from user description on early turns
	if bp.Name == "" || bp.Name == "untitled-enterprise-skill" || userTurns == 1 {
		switch {
		case strings.Contains(lower, "finops") || strings.Contains(lower, "cost") || strings.Contains(lower, "billing") || strings.Contains(lower, "anomaly"):
			bp.Name = "finops-cost-anomaly-analyzer"
			bp.DisplayName = "FinOps Cloud Cost Anomaly & Commitment Analyzer"
			bp.Summary = "Detects daily GCP billing SKU spikes, correlates anomalies with Cloud Run / BigQuery job labels, and outputs deterministic JSON remediation actions for Gemini Enterprise (Spark / Sobi) and Antigravity."
			bp.UseWhenTriggers = []string{
				"User asks to investigate GCP billing spikes, daily cost anomalies, or SKU variance by service or project",
				"User wants deterministic CUD (Committed Use Discount) or Cloud Run right-sizing recommendations from billing export rows",
			}
			bp.DoNotUseTriggers = []string{
				"Do not use for modifying IAM billing account permissions or executing live Terraform state deletions directly",
				"Do not use for non-GCP cloud invoices without standardized FOCUS or BigQuery billing export columns",
			}
			bp.InputParameters = []models.ParamSpec{
				{Flag: "--input-json", Type: "path", Required: true, Description: "Path to BigQuery billing export JSON fixture or query result payload", Example: "tests/fixtures/mock_payload.json"},
				{Flag: "--z-score-threshold", Type: "float", Required: false, Description: "Standard deviation threshold for flagging daily SKU cost spikes", Example: "2.5"},
				{Flag: "--output-format", Type: "enum(json|markdown)", Required: false, Description: "Deterministic output contract format", Example: "json"},
			}
			bp.Scripts = []models.ScriptSpec{
				{
					Filename:       "scripts/analyze_cost_anomalies.py",
					Purpose:        "Computes rolling baseline mean/stddev per GCP service SKU, isolates anomalous workloads, and calculates deterministic right-sizing savings.",
					PackagesUsed:   []string{"json", "argparse", "statistics", "math", "datetime"},
					VendoredLibs:   []string{},
					OutputContract: "Strict JSON object containing `anomalies[]`, `total_daily_delta_usd`, `recommended_actions[]`, and `exit_code: 0`.",
				},
			}
			bp.ReferenceDocs = []string{
				"references/bigquery_billing_export_schema.md",
				"references/finops_remediation_runbook.md",
			}
			bp.GuardrailsGotchas = []string{
				"Exclude credits and sustained-use discounts before computing raw usage variance to avoid false-positive end-of-month spikes",
				"Enforce zero external network calls inside the script; operate strictly on passed JSON/CSV payloads for GE air-gapped sandbox compliance",
			}
			bp.EvalAssertions = []string{
				"Identifies anomalous SKU (`Cloud Run CPU Allocation` or `BigQuery Analysis`) with exact z-score >= threshold",
				"Outputs valid JSON schema with `status: OK` and deterministic USD savings calculation within 0.01 tolerance",
				"Executes with zero network sockets under Python 3.11 frozen GE runtime",
			}
			bp.ReadinessScore = 68
			bp.OpenQuestions = []string{
				"What z-score threshold or minimum dollar delta ($ USD) should trigger a P1 FinOps alert vs. informational notice?",
				"Should the skill script also flag untagged resources missing mandatory `cost_center` or `env` labels?",
			}
			return "I have captured the initial blueprint for **finops-cost-anomaly-analyzer** on the live canvas, targeting both Gemini Enterprise (Spark / Sobi / Dolphin) and Antigravity 2.0.\n\nTo make `scripts/analyze_cost_anomalies.py` 100% deterministic, I have two quick clarifying questions:\n1. **Threshold Rules**: What minimum daily dollar increase (for example, `$500/day`) or z-score threshold (for example, `2.5 sigma`) should classify an anomaly as `CRITICAL`?\n2. **Label Governance**: Should the script also audit each anomalous resource for missing `cost_center` and `owner` labels?"

		case strings.Contains(lower, "sap") || strings.Contains(lower, "order") || strings.Contains(lower, "invoice") || strings.Contains(lower, "reconcil"):
			bp.Name = "sap-order-invoice-reconciler"
			bp.DisplayName = "SAP Order-to-Cash & Three-Way Invoice Reconciler"
			bp.Summary = "Performs deterministic three-way matching across SAP Purchase Orders (EKKO/EKPO), Goods Receipts (MSEG), and Vendor Invoices (RBKP), flagging quantity or price tolerance breaches."
			bp.UseWhenTriggers = []string{
				"User asks to reconcile SAP Purchase Orders against Goods Receipts and Vendor Invoices",
				"User wants to audit three-way match discrepancies or blocked payment reasons in Gemini Enterprise Spark",
			}
			bp.DoNotUseTriggers = []string{
				"Do not use for posting live FI/CO journal entries without human finance approval",
				"Do not use for HR payroll reconciliation",
			}
			bp.InputParameters = []models.ParamSpec{
				{Flag: "--input-json", Type: "path", Required: true, Description: "Path to extracted SAP PO/GR/Invoice JSON bundle", Example: "tests/fixtures/mock_payload.json"},
				{Flag: "--price-tolerance-pct", Type: "float", Required: false, Description: "Allowed percentage variance between PO unit price and Invoice unit price", Example: "2.0"},
			}
			bp.Scripts = []models.ScriptSpec{
				{
					Filename:       "scripts/reconcile_sap_three_way.py",
					Purpose:        "Validates three-way match across PO, Goods Receipt, and Invoice lines and emits deterministic block/release codes.",
					PackagesUsed:   []string{"json", "argparse", "decimal", "datetime"},
					VendoredLibs:   []string{},
					OutputContract: "Strict JSON report with `matched_documents[]`, `blocked_invoices[]`, `variance_summary`, and `audit_hash`.",
				},
			}
			bp.ReferenceDocs = []string{
				"references/sap_mm_fi_schema.md",
				"references/tolerance_key_policy.md",
			}
			bp.GuardrailsGotchas = []string{
				"Always use exact `decimal.Decimal` arithmetic (never IEEE 754 float) for currency and tax reconciliation",
				"Normalize SAP currency decimals (such as JPY/KRW zero-decimal currencies) before computing line totals",
			}
			bp.EvalAssertions = []string{
				"Uses exact Decimal arithmetic with zero floating-point rounding drift",
				"Flags invoices exceeding price tolerance (`> 2.0%`) or quantity mismatch (`GR_QTY < INV_QTY`)",
			}
			bp.ReadinessScore = 72
			bp.OpenQuestions = []string{
				"What price tolerance percentage (for example, 2%) and quantity variance policy should trigger an invoice payment block?",
				"Do you need multi-currency conversion handling or single-company-code currency matching?",
			}
			return "I have structured the **sap-order-invoice-reconciler** blueprint on the canvas with `decimal.Decimal` currency precision for Gemini Enterprise Spark and Antigravity.\n\nTwo quick questions to lock down the deterministic rules:\n1. **Tolerance Policy**: Should we enforce a strict `2.0%` unit-price tolerance and `0%` quantity over-delivery tolerance (`INV_QTY <= GR_QTY`)?\n2. **Zero-Decimal Currencies**: Do we need special handling for zero-decimal currencies like `JPY` and `KRW` in the SAP payload?"

		default:
			slug := slugifySkillName(latest)
			bp.Name = slug
			bp.DisplayName = titleizeSlug(slug)
			bp.Summary = fmt.Sprintf("Deterministic enterprise skill (%s) built for Gemini Enterprise (Spark / Sobi / Dolphin) and Antigravity 2.0.", strings.TrimSpace(latest))
			bp.UseWhenTriggers = []string{
				fmt.Sprintf("User requests workflow automation or deterministic analysis for: %s", strings.TrimSpace(latest)),
				"Agent needs validated, schema-checked JSON output rather than free-form LLM guessing",
			}
			bp.DoNotUseTriggers = []string{
				"Do not use for unauthenticated destructive mutations in production without explicit approval token",
				"Do not use for unrelated general knowledge queries",
			}
			bp.InputParameters = []models.ParamSpec{
				{Flag: "--input-json", Type: "path", Required: true, Description: "Path to structured input JSON payload or grounded fixture", Example: "tests/fixtures/mock_payload.json"},
				{Flag: "--threshold", Type: "float", Required: false, Description: "Deterministic policy threshold for anomaly/rule evaluation", Example: "2.0"},
			}
			bp.Scripts = []models.ScriptSpec{
				{
					Filename:       "scripts/run_deterministic_skill.py",
					Purpose:        "Validates input payload against enterprise schema, executes deterministic domain rules, and emits structured JSON output.",
					PackagesUsed:   []string{"json", "argparse", "statistics", "datetime"},
					VendoredLibs:   []string{},
					OutputContract: "Strict JSON payload with `status`, `summary_metrics`, `findings[]`, and `remediation_plan[]`.",
				},
			}
			bp.ReferenceDocs = []string{
				"references/domain_schema.md",
				"references/operational_guardrails.md",
			}
			bp.GuardrailsGotchas = []string{
				"Must execute cleanly inside the air-gapped Gemini Enterprise Python 3.11 sandbox without outbound internet sockets",
				"All CLI arguments must be parsed deterministically via argparse and return exit code 0 on valid runs",
			}
			bp.EvalAssertions = []string{
				"Script returns exit code 0 and valid JSON conforming to the output contract",
				"Accurately flags policy violations and computes exact metrics on grounded mock fixtures",
			}
			bp.ReadinessScore = 65
			bp.OpenQuestions = []string{
				"What specific business thresholds, SLA limits, or validation rules must the Python script enforce?",
				"Which enterprise data schema (BigQuery table, OpenAPI spec, or MCP tool output) should ground the input contract?",
			}
			return fmt.Sprintf("I have initialized the **%s** blueprint on the live canvas.\n\nTo make the skill 100%% deterministic for Gemini Enterprise (Spark / Sobi) and Antigravity, let's lock down two details:\n1. **Business Rules & Thresholds**: What exact thresholds, calculations, or policy checks should the Python script perform instead of leaving them to LLM estimation?\n2. **Input Schema & Edge Cases**: Are there specific fields, missing-tag checks, or gotchas we should enforce in the input payload?", bp.Name)
		}
	}

	// Subsequent user turns refine thresholds, guardrails, and push Readiness Score to 95-100%
	bp.GuardrailsGotchas = append(bp.GuardrailsGotchas, fmt.Sprintf("Customer interview rule: %s", strings.TrimSpace(latest)))
	bp.EvalAssertions = append(bp.EvalAssertions, fmt.Sprintf("Verifies interview constraint: %s", strings.TrimSpace(latest)))
	if len(bp.InputParameters) < 4 && (strings.Contains(lower, "label") || strings.Contains(lower, "tag") || strings.Contains(lower, "cost_center")) {
		bp.InputParameters = append(bp.InputParameters, models.ParamSpec{
			Flag:        "--require-labels",
			Type:        "csv",
			Required:    false,
			Description: "Mandatory governance labels to audit on every record",
			Example:     "cost_center,owner,env",
		})
	}
	bp.OpenQuestions = []string{}
	bp.ReadinessScore = 96

	return fmt.Sprintf("Blueprint updated with your constraints (`Readiness Score: %d%%`).\n\nAll triggers (`<use_when>` / `<do_not_use_for>`), CLI input flags, deterministic Python 3.11 script contracts, and edge-case guardrails are locked in on the canvas. You can now attach optional **Enterprise Grounding Schemas** (OpenAPI, BigQuery, or MCP) or click **Launch Cloud Run Sandbox (AGY Build & Self-Heal)** to compile and verify the skill.", bp.ReadinessScore)
}

func (e *Engine) callVertexGemini(ctx context.Context, currentBP models.SkillBlueprint, history []models.ChatMessage) (string, models.SkillBlueprint, error) {
	tokenCmd := exec.CommandContext(ctx, "gcloud", "auth", "print-access-token")
	tokenBytes, err := tokenCmd.Output()
	if err != nil {
		return "", currentBP, err
	}
	token := strings.TrimSpace(string(tokenBytes))
	if token == "" {
		return "", currentBP, fmt.Errorf("empty ADC token")
	}

	bpJSON, _ := json.Marshal(currentBP)
	var transcript strings.Builder
	for _, m := range history {
		transcript.WriteString(fmt.Sprintf("[%s]: %s\n", strings.ToUpper(m.Role), m.Content))
	}

	prompt := fmt.Sprintf(`You are the Principal Enterprise Skill Architect for Gemini Enterprise (Spark / Sobi / Obi / Dolphin) and Antigravity 2.0.
Given the current SkillBlueprint JSON and the interview transcript, update the SkillBlueprint and provide a concise, high-signal architect response (either asking 1-2 clarifying questions to reach 95%% readiness, or confirming the blueprint is ready for Cloud Run Sandbox compilation).
Never use em-dashes, en-dashes, or section symbols.

CURRENT BLUEPRINT:
%s

TRANSCRIPT:
%s

Respond strictly as JSON with two keys: "reply" (markdown string) and "blueprint" (updated SkillBlueprint object).`, string(bpJSON), transcript.String())

	endpoint := fmt.Sprintf("https://%s-aiplatform.googleapis.com/v1/projects/%s/locations/%s/publishers/google/models/%s:generateContent",
		e.Location, e.ProjectID, e.Location, e.Model)

	reqBody := map[string]any{
		"contents": []map[string]any{
			{
				"role": "user",
				"parts": []map[string]any{
					{"text": prompt},
				},
			},
		},
		"generationConfig": map[string]any{
			"temperature":      0.2,
			"responseMimeType": "application/json",
		},
	}
	bodyBytes, _ := json.Marshal(reqBody)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", currentBP, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	if quotaProj := os.Getenv("GOOGLE_CLOUD_QUOTA_PROJECT"); quotaProj != "" {
		req.Header.Set("x-goog-user-project", quotaProj)
	}

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", currentBP, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", currentBP, fmt.Errorf("vertex status %d", resp.StatusCode)
	}

	respBytes, _ := io.ReadAll(resp.Body)
	var vertexResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(respBytes, &vertexResp); err != nil || len(vertexResp.Candidates) == 0 || len(vertexResp.Candidates[0].Content.Parts) == 0 {
		return "", currentBP, fmt.Errorf("empty vertex candidates")
	}

	var parsed struct {
		Reply     string                `json:"reply"`
		Blueprint models.SkillBlueprint `json:"blueprint"`
	}
	if err := json.Unmarshal([]byte(vertexResp.Candidates[0].Content.Parts[0].Text), &parsed); err != nil {
		return "", currentBP, err
	}
	return parsed.Reply, parsed.Blueprint, nil
}

var nonAlphaNum = regexp.MustCompile(`[^a-z0-9]+`)

func slugifySkillName(input string) string {
	words := strings.Fields(strings.ToLower(input))
	stopWords := map[string]bool{
		"i": true, "want": true, "need": true, "to": true, "build": true, "create": true,
		"a": true, "an": true, "the": true, "skill": true, "that": true, "for": true, "in": true,
		"with": true, "can": true, "we": true, "please": true, "help": true, "me": true,
	}
	var kept []string
	for _, w := range words {
		clean := nonAlphaNum.ReplaceAllString(w, "")
		if clean != "" && !stopWords[clean] {
			kept = append(kept, clean)
		}
		if len(kept) >= 4 {
			break
		}
	}
	if len(kept) == 0 {
		return "enterprise-custom-skill"
	}
	return strings.Join(kept, "-")
}

func titleizeSlug(slug string) string {
	parts := strings.Split(slug, "-")
	for i, p := range parts {
		if len(p) > 0 {
			parts[i] = strings.ToUpper(p[:1]) + p[1:]
		}
	}
	return strings.Join(parts, " ")
}
