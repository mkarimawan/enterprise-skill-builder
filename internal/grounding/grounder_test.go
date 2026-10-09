package grounding

import (
	"context"
	"strings"
	"testing"
)

func TestSynthesizeConfiguredAsset_MCPAndOpenAPI(t *testing.T) {
	ctx := context.Background()

	t.Run("connects BYO-MCP server with ADC AuthN and read-only AuthZ", func(t *testing.T) {
		asset := SynthesizeConfiguredAsset(ctx, GroundingInput{
			Name:         "finops-mcp-server",
			SourceType:   "mcp",
			EndpointURL:  "https://mcp.enterprise.internal/v1/mcp",
			MCPTransport: "streamable_http",
			AuthNType:    "service_account_adc",
			SecretURI:    "projects/finops-prod/secrets/mcp-cred/versions/latest",
			Scopes:       []string{"mcp.tools:execute", "finops.billing:read"},
			ReadOnlyOnly: true,
		})

		if asset.SourceType != "mcp" {
			t.Fatalf("expected sourceType mcp, got %q", asset.SourceType)
		}
		if len(asset.DiscoveredTools) == 0 {
			t.Fatalf("expected discovered MCP tools, got 0")
		}
		if asset.AuthConfig.AuthNType != "service_account_adc" {
			t.Errorf("expected AuthNType service_account_adc, got %q", asset.AuthConfig.AuthNType)
		}
		if !asset.AuthConfig.ReadOnlyEnforced {
			t.Errorf("expected ReadOnlyEnforced=true")
		}
	})

	t.Run("infers OpenAPI 3.0.3 YAML specification from REST documentation", func(t *testing.T) {
		preview := PreviewDiscoveryOrInference(ctx, GroundingInput{
			Name:         "erp-procurement-rest-api",
			SourceType:   "openapi",
			EndpointURL:  "https://erp-api.enterprise.internal/v1",
			RawSchema:    "POST /v2/invoices/reconcile - Reconcile purchase orders, goods receipts, and vendor invoices with 2% tolerance",
			AuthNType:    "oauth2_client_credentials",
			SecretURI:    "projects/finops-prod/secrets/erp-oauth/versions/latest",
			Scopes:       []string{"erp.invoices:read"},
			ReadOnlyOnly: true,
		})

		if preview.DiscoveryMode != "inferred_from_docs" {
			t.Errorf("expected DiscoveryMode inferred_from_docs, got %q", preview.DiscoveryMode)
		}
		if !strings.Contains(preview.OpenAPISpecYAML, "openapi: 3.0.3") {
			t.Errorf("expected valid OpenAPI 3.0.3 YAML header, got:\n%s", preview.OpenAPISpecYAML)
		}
		if !strings.Contains(preview.OpenAPISpecYAML, "OAuth2ClientCredentials") {
			t.Errorf("expected OAuth2ClientCredentials securityScheme in OpenAPI spec")
		}
		if len(preview.DiscoveredTools) == 0 {
			t.Errorf("expected discovered tools from inferred OpenAPI spec")
		}
	})
}
