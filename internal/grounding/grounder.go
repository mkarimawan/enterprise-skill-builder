package grounding

import (
	"fmt"
	"time"

	"github.com/googlecloudplatform/enterprise-skill-builder/internal/models"
)

// SynthesizeAsset creates a grounded enterprise schema asset and deterministic mock JSON fixture
// so that skills can be compiled and tested safely inside the air-gapped Cloud Run sandbox.
func SynthesizeAsset(name, sourceType, rawSchema string) models.GroundingAsset {
	if sourceType == "" {
		sourceType = "bigquery"
	}
	if name == "" {
		switch sourceType {
		case "bigquery":
			name = "bq://finops_prod.gcp_billing_export_v1"
		case "openapi":
			name = "openapi://sap-s4hana-invoice-reconciliation-v2.yaml"
		case "mcp":
			name = "mcp://cloud-run-fleet-diagnostics/tools/list"
		default:
			name = "runbook://enterprise-sop-policy.md"
		}
	}

	mockFixture := generateDeterministicFixture(sourceType, rawSchema)
	summary := fmt.Sprintf("Grounded %s schema (%s) with deterministic sandbox fixture (`tests/fixtures/mock_payload.json`) for zero-mutation testing.", sourceType, name)

	if rawSchema == "" {
		rawSchema = defaultSchemaSnippet(sourceType)
	}

	return models.GroundingAsset{
		ID:               fmt.Sprintf("grd-%d", time.Now().UnixNano()),
		Name:             name,
		SourceType:       sourceType,
		Summary:          summary,
		RawSchemaSnippet: rawSchema,
		MockFixturePath:  "tests/fixtures/mock_payload.json",
		MockFixtureJSON:  mockFixture,
		AddedAt:          time.Now().UTC(),
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
  "server": "datacloud_bigquery_remote",
  "tools": [
    {"name": "execute_sql_readonly", "inputSchema": {"project_id": "string", "sql": "string"}},
    {"name": "get_table_info", "inputSchema": {"dataset_id": "string", "table_id": "string"}}
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
