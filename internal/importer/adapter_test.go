package importer

import (
	"context"
	"strings"
	"testing"

	"github.com/googlecloudplatform/enterprise-skill-builder/internal/models"
)

func TestImportAndAdapt_AnthropicAndOpenAI(t *testing.T) {
	ctx := context.Background()

	t.Run("adapts Anthropic Claude skill to gemini-3.8-flash and Antigravity 2.0", func(t *testing.T) {
		sess := &models.SkillSession{ID: "sess-test-anthropic"}
		req := ImportRequest{
			URL:          "https://github.com/anthropics/skills/blob/main/skills/cloud-finops-auditor/SKILL.md",
			ProviderHint: "anthropic",
			RawContent: `---
name: cloud-finops-auditor
model: claude-3-7-sonnet-20250219
---
Use ANTHROPIC_API_KEY and anthropic.Anthropic() client to analyze daily billing spikes.`,
		}

		rep, bp, err := ImportAndAdapt(ctx, sess, req)
		if err != nil {
			t.Fatalf("ImportAndAdapt failed: %v", err)
		}
		if rep.SourceProvider != "Anthropic Claude" {
			t.Errorf("expected SourceProvider Anthropic Claude, got %q", rep.SourceProvider)
		}
		if rep.TargetGeminiModel != "gemini-3.8-flash" {
			t.Errorf("expected TargetGeminiModel gemini-3.8-flash, got %q", rep.TargetGeminiModel)
		}
		if bp.ReadinessScore < 90 {
			t.Errorf("expected ReadinessScore >= 90, got %d", bp.ReadinessScore)
		}
		if len(rep.Adaptations) < 4 {
			t.Errorf("expected at least 4 adaptation items, got %d", len(rep.Adaptations))
		}
		if len(sess.GroundingAssets) == 0 {
			t.Errorf("expected default grounding asset to be attached on import")
		}
	})

	t.Run("adapts OpenAI GPT-4o skill to gemini-3.8-flash and Gemini Enterprise", func(t *testing.T) {
		sess := &models.SkillSession{ID: "sess-test-openai"}
		req := ImportRequest{
			URL:          "https://github.com/openai/openai-cookbook/blob/main/skills/erp_three_way_match/SKILL.md",
			ProviderHint: "openai",
			RawContent: `---
name: erp-three-way-match
model: gpt-4o
---
Use OPENAI_API_KEY and client.chat.completions.create(model="gpt-4o") to reconcile purchase orders and vendor invoices.`,
		}

		rep, bp, err := ImportAndAdapt(ctx, sess, req)
		if err != nil {
			t.Fatalf("ImportAndAdapt failed: %v", err)
		}
		if !strings.Contains(rep.SourceProvider, "OpenAI") {
			t.Errorf("expected SourceProvider containing OpenAI, got %q", rep.SourceProvider)
		}
		if rep.OriginalModel != "gpt-4o" {
			t.Errorf("expected OriginalModel gpt-4o, got %q", rep.OriginalModel)
		}
		if bp.Name == "" || bp.DisplayName == "" {
			t.Errorf("expected non-empty blueprint Name and DisplayName")
		}
	})
}
