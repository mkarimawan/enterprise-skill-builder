package sandbox

import (
	"context"
	"strings"
	"testing"

	"github.com/googlecloudplatform/enterprise-skill-builder/internal/grounding"
	"github.com/googlecloudplatform/enterprise-skill-builder/internal/models"
)

func TestExecuteLocalSandbox_WithMCPAndOpenAPITools(t *testing.T) {
	ctx := context.Background()
	h := NewHarness("test-gcp-project", "", t.TempDir())

	mcpAsset := grounding.SynthesizeConfiguredAsset(ctx, grounding.GroundingInput{
		Name:         "finops-mcp-server",
		SourceType:   "mcp",
		EndpointURL:  "https://mcp.enterprise.internal/v1/mcp",
		MCPTransport: "streamable_http",
		AuthNType:    "service_account_adc",
		SecretURI:    "projects/test-gcp-project/secrets/mcp-token/versions/latest",
		Scopes:       []string{"mcp.tools:execute", "finops.billing:read"},
		ReadOnlyOnly: true,
	})

	openAPIAsset := grounding.SynthesizeConfiguredAsset(ctx, grounding.GroundingInput{
		Name:         "erp-invoice-api",
		SourceType:   "openapi",
		EndpointURL:  "https://api.enterprise.internal/v2/invoices",
		RawSchema:    "POST /v2/invoices/reconcile - Validate PO, GR, and Invoice tolerance",
		AuthNType:    "oauth2_client_credentials",
		SecretURI:    "projects/test-gcp-project/secrets/erp-token/versions/latest",
		Scopes:       []string{"erp.invoices:read"},
		ReadOnlyOnly: true,
	})

	sess := &models.SkillSession{
		ID: "sess-sandbox-test",
		Blueprint: models.SkillBlueprint{
			Name:        "finops-cost-anomaly-analyzer",
			DisplayName: "FinOps Cost Anomaly & Invoice Reconciler",
			Summary:     "Audits daily billing anomalies and reconciles ERP invoices via governed MCP and OpenAPI tools.",
		},
		GroundingAssets: []models.GroundingAsset{mcpAsset, openAPIAsset},
	}

	files, events, secReport, err := h.ExecuteLocalSandbox(ctx, sess)
	if err != nil {
		t.Fatalf("ExecuteLocalSandbox failed: %v", err)
	}

	for _, requiredFile := range []string{
		"SKILL.md",
		"scripts/analyze_cost_anomalies.py",
		"scripts/tool_client.py",
		"references/tools_manifest.json",
		"references/openapi_spec.yaml",
		"tests/fixtures/mock_payload.json",
	} {
		if content, ok := files[requiredFile]; !ok || strings.TrimSpace(content) == "" {
			t.Errorf("expected generated bundle file %q to be non-empty", requiredFile)
		}
	}

	if len(events) < 6 {
		t.Errorf("expected at least 6 sandbox execution events, got %d", len(events))
	}

	if secReport == nil || !secReport.Passed {
		t.Fatalf("expected SecurityAuditReport Passed=true")
	}

	foundSec06 := false
	for _, chk := range secReport.Checks {
		if chk.ID == "SEC-06" && chk.Status == "PASS" {
			foundSec06 = true
		}
	}
	if !foundSec06 {
		t.Errorf("expected SEC-06 (MCP / REST OpenAPI AuthN, AuthZ & Secret Manager Hygiene) check to PASS")
	}
}
