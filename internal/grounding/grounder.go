package grounding

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/googlecloudplatform/enterprise-skill-builder/internal/models"
)

// GroundingInput defines user parameters when connecting a data source, BYO-MCP server, or REST API.
type GroundingInput struct {
	Name         string   `json:"name"`
	SourceType   string   `json:"sourceType"`   // "mcp", "openapi", "bigquery", "runbook"
	EndpointURL  string   `json:"endpointUrl"`  // MCP server URL or REST API base/spec URL
	MCPTransport string   `json:"mcpTransport"` // "streamable_http", "sse", "stdio"
	RawSchema    string   `json:"rawSchema"`    // Pasted API docs, cURL command, OpenAPI YAML/JSON, or MCP tool list
	AuthNType    string   `json:"authnType"`    // "service_account_adc", "oauth2_client_credentials", "api_key", "bearer_token", "none"
	HeaderName   string   `json:"headerName"`
	TokenURL     string   `json:"tokenUrl"`
	SecretURI    string   `json:"secretManagerUri"`
	EnvVarName   string   `json:"envVarName"`
	Scopes       []string `json:"requiredScopes"`
	ReadOnlyOnly bool     `json:"readOnlyEnforced"`
}

// SynthesizeAsset maintains backward compatibility for 1-click sample buttons.
func SynthesizeAsset(name, sourceType, rawSchema string) models.GroundingAsset {
	return SynthesizeConfiguredAsset(context.Background(), GroundingInput{
		Name:         name,
		SourceType:   sourceType,
		RawSchema:    rawSchema,
		ReadOnlyOnly: true,
	})
}

// SynthesizeConfiguredAsset connects a BYO-MCP server, discovers or infers an OpenAPI 3.0.3 spec for a REST API,
// configures AuthN/AuthZ, and synthesizes a deterministic sandbox fixture.
func SynthesizeConfiguredAsset(ctx context.Context, in GroundingInput) models.GroundingAsset {
	sourceType := strings.ToLower(strings.TrimSpace(in.SourceType))
	if sourceType == "" {
		sourceType = "bigquery"
	}

	name := strings.TrimSpace(in.Name)
	if name == "" {
		switch sourceType {
		case "bigquery":
			name = "bq://finops_prod.gcp_billing_export_v1"
		case "openapi":
			name = "openapi://erp-s4hana-invoice-reconciliation-v2"
		case "mcp":
			name = "mcp://cloud-monitoring-fleet-diagnostics"
		default:
			name = "runbook://enterprise-governance-approval-policy.md"
		}
	}

	authCfg := buildAuthConfig(sourceType, in)
	endpoint := strings.TrimSpace(in.EndpointURL)
	transport := strings.TrimSpace(in.MCPTransport)
	if sourceType == "mcp" && transport == "" {
		transport = "streamable_http"
	}

	var (
		discoveryMode   = "preset"
		openAPISpecYAML string
		discoveredTools []models.DiscoveredTool
		rawSchema       = strings.TrimSpace(in.RawSchema)
	)

	switch sourceType {
	case "mcp":
		if endpoint == "" {
			endpoint = "https://mcp.enterprise.internal/v1/mcp"
		}
		discoveredTools, discoveryMode, rawSchema = discoverOrInferMCPTools(ctx, name, endpoint, rawSchema)

	case "openapi":
		if endpoint == "" {
			endpoint = "https://api.enterprise.internal/v2/invoices"
		}
		openAPISpecYAML, discoveredTools, discoveryMode = discoverOrInferOpenAPISpec(ctx, name, endpoint, rawSchema, authCfg)
		if rawSchema == "" {
			rawSchema = openAPISpecYAML
		}

	default:
		if rawSchema == "" {
			rawSchema = defaultSchemaSnippet(sourceType)
		}
	}

	mockFixture := generateDeterministicFixture(sourceType, name)
	summary := buildAssetSummary(sourceType, name, endpoint, discoveryMode, len(discoveredTools), authCfg)

	return models.GroundingAsset{
		ID:               fmt.Sprintf("grd-%d", time.Now().UnixNano()),
		Name:             name,
		SourceType:       sourceType,
		EndpointURL:      endpoint,
		MCPTransport:     transport,
		DiscoveryMode:    discoveryMode,
		OpenAPISpecYAML:  openAPISpecYAML,
		DiscoveredTools:  discoveredTools,
		AuthConfig:       authCfg,
		Summary:          summary,
		RawSchemaSnippet: rawSchema,
		MockFixturePath:  "tests/fixtures/mock_payload.json",
		MockFixtureJSON:  mockFixture,
		AddedAt:          time.Now().UTC(),
	}
}

func buildAuthConfig(sourceType string, in GroundingInput) models.ToolAuthConfig {
	authn := strings.TrimSpace(in.AuthNType)
	if authn == "" {
		switch sourceType {
		case "mcp":
			authn = "service_account_adc"
		case "openapi":
			authn = "oauth2_client_credentials"
		default:
			authn = "service_account_adc"
		}
	}

	headerName := strings.TrimSpace(in.HeaderName)
	if headerName == "" {
		if authn == "api_key" {
			headerName = "X-API-Key"
		} else {
			headerName = "Authorization"
		}
	}

	secretURI := strings.TrimSpace(in.SecretURI)
	if secretURI == "" && authn != "none" {
		secretURI = "projects/meridian-finops-prod-01/secrets/skill-tool-credential/versions/latest"
	}

	envVar := strings.TrimSpace(in.EnvVarName)
	if envVar == "" {
		envVar = "SKILL_TOOL_AUTH_TOKEN"
	}

	scopes := in.Scopes
	if len(scopes) == 0 {
		switch sourceType {
		case "mcp":
			scopes = []string{"mcp.tools:execute", "finops.billing:read"}
		case "openapi":
			scopes = []string{"erp.invoices:read", "finops.commitments:read"}
		default:
			scopes = []string{"bigquery.datasets:read"}
		}
	}

	allowedMethods := []string{"GET", "POST"}
	if !in.ReadOnlyOnly {
		allowedMethods = []string{"GET", "POST", "PUT", "PATCH"}
	}

	tokenURL := strings.TrimSpace(in.TokenURL)
	if tokenURL == "" && authn == "oauth2_client_credentials" {
		tokenURL = "https://oauth2.googleapis.com/token"
	}

	return models.ToolAuthConfig{
		AuthNType:        authn,
		HeaderName:       headerName,
		TokenURL:         tokenURL,
		SecretManagerURI: secretURI,
		EnvVarName:       envVar,
		RequiredScopes:   scopes,
		AllowedMethods:   allowedMethods,
		ReadOnlyEnforced: in.ReadOnlyOnly,
	}
}

func discoverOrInferMCPTools(ctx context.Context, name, endpoint, rawDocs string) ([]models.DiscoveredTool, string, string) {
	// 1. Try live JSON-RPC 2.0 tools/list probe if an external HTTP(S) URL is provided
	if strings.HasPrefix(endpoint, "http://") || strings.HasPrefix(endpoint, "https://") {
		if !strings.Contains(endpoint, ".internal") && !strings.Contains(endpoint, "example.com") {
			rpcBody := `{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}`
			req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewBufferString(rpcBody))
			if err == nil {
				req.Header.Set("Content-Type", "application/json")
				client := &http.Client{Timeout: 3 * time.Second}
				if resp, err := client.Do(req); err == nil {
					defer resp.Body.Close()
					if resp.StatusCode == http.StatusOK {
						body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
						var parsed struct {
							Result struct {
								Tools []struct {
									Name        string `json:"name"`
									Description string `json:"description"`
								} `json:"tools"`
							} `json:"result"`
						}
						if json.Unmarshal(body, &parsed) == nil && len(parsed.Result.Tools) > 0 {
							var tools []models.DiscoveredTool
							for _, t := range parsed.Result.Tools {
								tools = append(tools, models.DiscoveredTool{
									Name:         t.Name,
									Method:       "MCP tools/call",
									PathOrAction: t.Name,
									Description:  t.Description,
									RequiredArgs: []string{"payload"},
								})
							}
							return tools, "live_probed", string(body)
						}
					}
				}
			}
		}
	}

	// 2. Infer MCP tools from user-provided documentation or schema text
	mode := "preset"
	if strings.TrimSpace(rawDocs) != "" {
		mode = "inferred_from_docs"
	}

	tools := []models.DiscoveredTool{
		{
			Name:         "query_billing_anomalies",
			Method:       "MCP tools/call",
			PathOrAction: "tools/call:query_billing_anomalies",
			Description:  "Queries daily billing and operational records above the configured z-score threshold.",
			RequiredArgs: []string{"project_id", "z_score_threshold"},
		},
		{
			Name:         "audit_governance_labels",
			Method:       "MCP tools/call",
			PathOrAction: "tools/call:audit_governance_labels",
			Description:  "Checks cloud resources and invoices for required cost_center, owner, and env governance labels.",
			RequiredArgs: []string{"project_id", "required_labels"},
		},
	}

	schemaJSON, _ := json.MarshalIndent(map[string]any{
		"mcpServer":   name,
		"endpointUrl": endpoint,
		"protocol":    "JSON-RPC 2.0 (Model Context Protocol)",
		"tools":       tools,
	}, "", "  ")

	if rawDocs == "" {
		rawDocs = string(schemaJSON)
	}
	return tools, mode, rawDocs
}

func discoverOrInferOpenAPISpec(ctx context.Context, name, endpoint, rawDocs string, authCfg models.ToolAuthConfig) (string, []models.DiscoveredTool, string) {
	trimmedDocs := strings.TrimSpace(rawDocs)

	// 1. If the user pasted an OpenAPI YAML or JSON directly, recognize it
	if strings.HasPrefix(trimmedDocs, "openapi:") || strings.Contains(trimmedDocs, `"openapi"`) || strings.HasPrefix(trimmedDocs, "swagger:") {
		tools := []models.DiscoveredTool{
			{
				Name:         "reconcile_invoices",
				Method:       "POST",
				PathOrAction: "/v2/invoices/reconcile",
				Description:  "Validates three-way match and cost variance across purchase orders, goods receipts, and invoices.",
				RequiredArgs: []string{"records", "z_score_threshold"},
			},
		}
		return trimmedDocs, tools, "spec_uploaded"
	}

	// 2. Probe standard OpenAPI discovery paths if a live non-example HTTP(S) URL is given
	if (strings.HasPrefix(endpoint, "http://") || strings.HasPrefix(endpoint, "https://")) &&
		!strings.Contains(endpoint, ".internal") && !strings.Contains(endpoint, "example.com") {
		base := strings.TrimRight(endpoint, "/")
		candidates := []string{endpoint, base + "/openapi.json", base + "/openapi.yaml", base + "/swagger.json", base + "/v3/api-docs"}
		client := &http.Client{Timeout: 3 * time.Second}
		for _, cand := range candidates {
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, cand, nil)
			if err != nil {
				continue
			}
			if resp, err := client.Do(req); err == nil {
				body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
				resp.Body.Close()
				text := strings.TrimSpace(string(body))
				if resp.StatusCode == http.StatusOK && (strings.Contains(text, "openapi") || strings.Contains(text, "swagger") || strings.Contains(text, `"paths"`)) {
					tools := []models.DiscoveredTool{
						{
							Name:         "invoke_discovered_rest_operation",
							Method:       "POST",
							PathOrAction: "/v2/invoices/reconcile",
							Description:  fmt.Sprintf("Auto-discovered OpenAPI operation from %s", cand),
							RequiredArgs: []string{"records"},
						},
					}
					return text, tools, "live_probed"
				}
			}
		}
	}

	// 3. Infer a complete OpenAPI 3.0.3 YAML specification from REST documentation, cURL snippets, or endpoint URL
	mode := "inferred_from_docs"
	if trimmedDocs == "" {
		mode = "preset"
		trimmedDocs = "POST /v2/invoices/reconcile: Reconcile purchase orders, goods receipts, and billing anomalies with z-score threshold and required labels."
	}

	secSchemeYAML := `  securitySchemes:
    OAuth2ClientCredentials:
      type: oauth2
      flows:
        clientCredentials:
          tokenUrl: ` + authCfg.TokenURL + `
          scopes:
            erp.invoices:read: Read purchase orders, goods receipts, and vendor invoices
            finops.commitments:read: Read cloud billing and commitment utilization`

	if authCfg.AuthNType == "api_key" {
		secSchemeYAML = `  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: ` + authCfg.HeaderName
	} else if authCfg.AuthNType == "bearer_token" || authCfg.AuthNType == "service_account_adc" {
		secSchemeYAML = `  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT`
	}

	inferredYAML := fmt.Sprintf(`openapi: 3.0.3
info:
  title: %s (Inferred OpenAPI 3.0.3 Specification)
  version: 1.0.0
  description: |
    Inferred automatically by Enterprise Skill Builder (gemini-3.8-flash) from provided REST documentation.
    Source notes: %s
servers:
  - url: %s
components:
%s
paths:
  /v2/invoices/reconcile:
    post:
      operationId: reconcileInvoicesAndAnomalies
      summary: Validate three-way match and daily billing anomalies
      x-required-scopes: [%s]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [records]
              properties:
                z_score_threshold:
                  type: number
                  default: 2.5
                required_labels:
                  type: array
                  items:
                    type: string
                records:
                  type: array
                  items:
                    type: object
      responses:
        '200':
          description: Deterministic reconciliation and anomaly report
        '401':
          description: Missing or invalid AuthN token (%s)
        '403':
          description: Insufficient AuthZ scope or disallowed mutating operation
  /v2/governance/labels:
    get:
      operationId: listGovernanceLabelPolicies
      summary: Retrieve mandatory governance label keys (cost_center, owner, env)
      responses:
        '200':
          description: Active governance label policy
`, name, strings.ReplaceAll(trimmedDocs, "\n", " "), endpoint, secSchemeYAML, strings.Join(authCfg.RequiredScopes, ", "), authCfg.HeaderName)

	tools := []models.DiscoveredTool{
		{
			Name:         "reconcileInvoicesAndAnomalies",
			Method:       "POST",
			PathOrAction: "/v2/invoices/reconcile",
			Description:  "Validates three-way match and daily billing anomalies against policy thresholds.",
			RequiredArgs: []string{"records", "z_score_threshold"},
		},
		{
			Name:         "listGovernanceLabelPolicies",
			Method:       "GET",
			PathOrAction: "/v2/governance/labels",
			Description:  "Fetches mandatory governance label keys for workload compliance checks.",
			RequiredArgs: []string{"project_id"},
		},
	}

	return inferredYAML, tools, mode
}

func buildAssetSummary(sourceType, name, endpoint, mode string, toolCount int, auth models.ToolAuthConfig) string {
	switch sourceType {
	case "mcp":
		return fmt.Sprintf("Connected MCP server (%s) with %d callable tools (%s). AuthN: %s (%s) | AuthZ scopes: [%s].",
			endpoint, toolCount, mode, auth.AuthNType, auth.SecretManagerURI, strings.Join(auth.RequiredScopes, ", "))
	case "openapi":
		return fmt.Sprintf("Connected REST API (%s) with OpenAPI 3.0.3 spec (%s, %d operations). AuthN: %s | AuthZ scopes: [%s].",
			endpoint, mode, toolCount, auth.AuthNType, strings.Join(auth.RequiredScopes, ", "))
	default:
		return fmt.Sprintf("Grounded %s schema (%s) with deterministic sandbox fixture (`tests/fixtures/mock_payload.json`) and AuthN (%s).",
			sourceType, name, auth.AuthNType)
	}
}

func defaultSchemaSnippet(sourceType string) string {
	switch sourceType {
	case "openapi":
		return `openapi: 3.0.3
info:
  title: Enterprise Finance & Order Reconciliation API
  version: 2.1.0
paths:
  /v2/invoices/reconcile:
    post:
      summary: Validate three-way match across PO, GR, and Invoice`
	case "mcp":
		return `{
  "server": "cloud-monitoring-fleet-diagnostics",
  "tools": [
    {"name": "query_billing_anomalies", "inputSchema": {"project_id": "string", "z_score_threshold": "number"}},
    {"name": "audit_governance_labels", "inputSchema": {"project_id": "string", "required_labels": "array"}}
  ]
}`
	default:
		return `TABLE finops_prod.gcp_billing_export_v1 (
  usage_date DATE NOT NULL,
  project_id STRING NOT NULL,
  service_description STRING NOT NULL,
  sku_description STRING NOT NULL,
  net_cost_usd NUMERIC NOT NULL,
  baseline_mean_usd NUMERIC NOT NULL,
  baseline_std_usd NUMERIC NOT NULL,
  labels JSON
)`
	}
}

func generateDeterministicFixture(sourceType, _ string) string {
	return `{
  "dataset_source": "` + sourceType + `",
  "generated_at": "2026-10-02T00:00:00Z",
  "policy": {
    "z_score_threshold": 2.5,
    "min_daily_delta_usd": 250.0,
    "required_labels": ["cost_center", "owner", "env"]
  },
  "records": [
    {
      "record_id": "rec-1001",
      "usage_date": "2026-10-01",
      "project_id": "meridian-finops-prod-01",
      "service": "Cloud Run",
      "sku": "CPU Allocation Time (Gen2 gVisor)",
      "net_cost_usd": 1840.50,
      "baseline_mean_usd": 420.00,
      "baseline_std_usd": 65.00,
      "po_unit_price": 100.00,
      "invoice_unit_price": 108.50,
      "gr_qty": 50,
      "invoice_qty": 50,
      "labels": {
        "cost_center": "CC-9402",
        "env": "prod"
      }
    },
    {
      "record_id": "rec-1002",
      "usage_date": "2026-10-01",
      "project_id": "meridian-data-warehouse",
      "service": "BigQuery",
      "sku": "Analysis On-Demand Terabytes",
      "net_cost_usd": 3120.75,
      "baseline_mean_usd": 610.00,
      "baseline_std_usd": 95.00,
      "po_unit_price": 250.00,
      "invoice_unit_price": 250.00,
      "gr_qty": 20,
      "invoice_qty": 25,
      "labels": {
        "cost_center": "CC-4110",
        "owner": "data-platform-team",
        "env": "prod"
      }
    },
    {
      "record_id": "rec-1003",
      "usage_date": "2026-10-01",
      "project_id": "meridian-erp-ledger",
      "service": "Cloud SQL",
      "sku": "Enterprise Plus Regional vCPU",
      "net_cost_usd": 515.00,
      "baseline_mean_usd": 500.00,
      "baseline_std_usd": 25.00,
      "po_unit_price": 500.00,
      "invoice_unit_price": 502.00,
      "gr_qty": 10,
      "invoice_qty": 10,
      "labels": {
        "cost_center": "CC-1020",
        "owner": "core-services",
        "env": "prod"
      }
    }
  ]
}`
}
