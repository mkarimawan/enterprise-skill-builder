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

// Engine orchestrates the Dual-Mode Voice & Text Interview Studio powered by Gemini 3.8 Flash.
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
		model = "gemini-3.8-flash"
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

	// Update Blueprint deterministically + via Vertex AI Gemini 3.8 Flash when configured
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

	// Try live Vertex AI Gemini 3.8 Flash structured extraction first if ProjectID is configured
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

	// Detect domain & slug from user description on early turns while preserving any custom name the user already saved
	customName := ""
	customDisplay := ""
	if bp.Name != "" && bp.DisplayName != "" && bp.DisplayName != "Untitled skill" {
		customName = bp.Name
		customDisplay = bp.DisplayName
	}

	if bp.ReadinessScore == 0 || userTurns == 1 {
		switch {
		case strings.Contains(lower, "finops") || strings.Contains(lower, "cost") || strings.Contains(lower, "billing") || strings.Contains(lower, "anomaly"):
			bp.Name = "finops-cost-anomaly-analyzer"
			bp.DisplayName = "Billing cost anomaly analyzer"
			bp.Summary = "Checks daily cloud billing data for unexpected cost spikes, verifies required project labels, and recommends cost-saving actions."
			bp.UseWhenTriggers = []string{
				"Investigate daily cloud billing spikes or unusual service cost increases",
				"Check workloads for missing cost_center, owner, or environment labels",
			}
			bp.DoNotUseTriggers = []string{
				"Modifying billing account permissions or deleting live resources",
			}
			bp.InputParameters = []models.ParamSpec{
				{Flag: "--input-json", Type: "path", Required: true, Description: "Billing data records to analyze", Example: "tests/fixtures/mock_payload.json"},
				{Flag: "--z-score-threshold", Type: "float", Required: false, Description: "Sensitivity threshold for flagging cost spikes", Example: "2.5"},
			}
			bp.Scripts = []models.ScriptSpec{
				{
					Filename:       "scripts/analyze_cost_anomalies.py",
					Purpose:        "Calculates daily cost variance per service, flags spikes, and checks required governance labels.",
					PackagesUsed:   []string{"json", "argparse", "statistics", "math", "datetime"},
					VendoredLibs:   []string{},
					OutputContract: "JSON summary with flagged anomalies, total daily dollar impact, and recommended actions.",
				},
			}
			bp.ReferenceDocs = []string{
				"references/bigquery_billing_export_schema.md",
				"references/finops_remediation_runbook.md",
			}
			bp.GuardrailsGotchas = []string{
				"Exclude promotional credits and discounts before calculating usage spikes",
				"Read-only analysis: never modify or delete cloud resources",
			}
			bp.EvalAssertions = []string{
				"Flags cost spikes exceeding threshold with accurate dollar variance",
				"Identifies missing owner or cost_center labels on flagged workloads",
			}
			bp.ReadinessScore = 75
			bp.OpenQuestions = []string{
				"What minimum daily dollar increase should trigger a high-priority alert?",
			}
			if customName != "" {
				bp.Name = customName
				bp.DisplayName = customDisplay
			}
			return fmt.Sprintf("I have drafted **%s** in the skill summary panel on the right.\n\nTwo quick questions if you want to refine it (or you can continue directly to the next step):\n1. What minimum daily dollar increase (for example, `$250/day`) should trigger an alert?\n2. Are there specific project labels (like `cost_center` or `owner`) that every workload must have?", bp.DisplayName)

		case strings.Contains(lower, "sap") || strings.Contains(lower, "order") || strings.Contains(lower, "invoice") || strings.Contains(lower, "reconcil") || strings.Contains(lower, "match"):
			bp.Name = "sap-order-invoice-reconciler"
			bp.DisplayName = "Purchase order & invoice matcher"
			bp.Summary = "Matches purchase orders, goods receipts, and vendor invoices, flagging price or quantity discrepancies beyond your allowed tolerance."
			bp.UseWhenTriggers = []string{
				"Match purchase orders against goods receipts and vendor invoices",
				"Audit blocked invoices or price variance reasons",
			}
			bp.DoNotUseTriggers = []string{
				"Posting live accounting entries without finance approval",
			}
			bp.InputParameters = []models.ParamSpec{
				{Flag: "--input-json", Type: "path", Required: true, Description: "Purchase order, receipt, and invoice records", Example: "tests/fixtures/mock_payload.json"},
				{Flag: "--price-tolerance-pct", Type: "float", Required: false, Description: "Allowed percentage difference between PO price and invoice price", Example: "2.0"},
			}
			bp.Scripts = []models.ScriptSpec{
				{
					Filename:       "scripts/reconcile_sap_three_way.py",
					Purpose:        "Validates three-way match across purchase orders, receipts, and invoices using exact currency math.",
					PackagesUsed:   []string{"json", "argparse", "decimal", "datetime"},
					VendoredLibs:   []string{},
					OutputContract: "JSON report listing matched documents, blocked invoices, and exact variance amounts.",
				},
			}
			bp.ReferenceDocs = []string{
				"references/sap_mm_fi_schema.md",
				"references/tolerance_key_policy.md",
			}
			bp.GuardrailsGotchas = []string{
				"Use exact decimal currency math to avoid rounding errors",
				"Handle zero-decimal currencies such as JPY and KRW accurately",
			}
			bp.EvalAssertions = []string{
				"Flags invoices exceeding the allowed price tolerance percentage",
				"Flags invoices where billed quantity exceeds received quantity",
			}
			bp.ReadinessScore = 78
			bp.OpenQuestions = []string{
				"What price tolerance percentage (for example, 2%) should block an invoice for review?",
			}
			if customName != "" {
				bp.Name = customName
				bp.DisplayName = customDisplay
			}
			return fmt.Sprintf("I have drafted **%s** in the skill summary panel on the right.\n\nYou can refine the rules here in chat (for example, adjusting the `2%%` price tolerance) or click **Continue to data sources** on the right.", bp.DisplayName)

		default:
			slug := slugifySkillName(latest)
			bp.Name = slug
			bp.DisplayName = titleizeSlug(slug)
			if customName != "" {
				bp.Name = customName
				bp.DisplayName = customDisplay
			}
			bp.Summary = fmt.Sprintf("Automates and verifies: %s", strings.TrimSpace(latest))
			bp.UseWhenTriggers = []string{
				fmt.Sprintf("User asks to run or analyze: %s", strings.TrimSpace(latest)),
			}
			bp.DoNotUseTriggers = []string{
				"Making destructive changes in production without approval",
			}
			bp.InputParameters = []models.ParamSpec{
				{Flag: "--input-json", Type: "path", Required: true, Description: "Input records to process", Example: "tests/fixtures/mock_payload.json"},
				{Flag: "--threshold", Type: "float", Required: false, Description: "Threshold or rule limit for flagging items", Example: "2.0"},
			}
			bp.Scripts = []models.ScriptSpec{
				{
					Filename:       "scripts/run_deterministic_skill.py",
					Purpose:        "Checks input records against your business rules and produces a structured report.",
					PackagesUsed:   []string{"json", "argparse", "statistics", "datetime"},
					VendoredLibs:   []string{},
					OutputContract: "Structured JSON report with status, summary metrics, and flagged items.",
				},
			}
			bp.ReferenceDocs = []string{
				"references/domain_schema.md",
				"references/operational_guardrails.md",
			}
			bp.GuardrailsGotchas = []string{
				"Runs safely in an isolated sandbox with read-only access",
				"Validates all required fields before producing recommendations",
			}
			bp.EvalAssertions = []string{
				"Produces accurate output on sample test records",
				"Correctly flags items that breach your threshold rules",
			}
			bp.ReadinessScore = 72
			bp.OpenQuestions = []string{
				"Are there specific thresholds or approval limits this skill should enforce?",
			}
			return fmt.Sprintf("I have drafted **%s** in the skill summary panel on the right.\n\nYou can rename the skill at the top of the summary panel, reply here to add specific thresholds or rules, or continue to the next step.", bp.DisplayName)
		}
	}

	// Subsequent user turns refine thresholds, guardrails, and push Readiness Score to 96%
	bp.GuardrailsGotchas = append(bp.GuardrailsGotchas, fmt.Sprintf("Business rule: %s", strings.TrimSpace(latest)))
	bp.EvalAssertions = append(bp.EvalAssertions, fmt.Sprintf("Verifies rule: %s", strings.TrimSpace(latest)))
	if len(bp.InputParameters) < 4 && (strings.Contains(lower, "label") || strings.Contains(lower, "tag") || strings.Contains(lower, "cost_center")) {
		bp.InputParameters = append(bp.InputParameters, models.ParamSpec{
			Flag:        "--require-labels",
			Type:        "csv",
			Required:    false,
			Description: "Required project labels to check on every record",
			Example:     "cost_center,owner,env",
		})
	}
	bp.OpenQuestions = []string{}
	bp.ReadinessScore = 96

	return fmt.Sprintf("Updated **%s** with your rule (`%d%% ready`).\n\nYou can now connect optional business data in **Data sources**, or go straight to **Sandbox test** to verify the skill.", bp.DisplayName, bp.ReadinessScore)
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

	prompt := fmt.Sprintf(`You are the Principal Enterprise Skill Architect for Gemini Enterprise (GE) and Antigravity 2.0.
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
