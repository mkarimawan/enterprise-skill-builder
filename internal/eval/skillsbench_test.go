package eval

import (
	"testing"

	"github.com/googlecloudplatform/enterprise-skill-builder/internal/models"
)

func TestRunSkillsBenchHarbor_IncludesFiveTrialsAndToolVerification(t *testing.T) {
	sess := &models.SkillSession{
		ID: "sess-eval-test",
		Blueprint: models.SkillBlueprint{
			Name:        "finops-cost-anomaly-analyzer",
			DisplayName: "FinOps Cloud Cost Anomaly & Commitment Analyzer",
		},
	}

	rep, err := RunSkillsBenchHarbor(sess)
	if err != nil {
		t.Fatalf("RunSkillsBenchHarbor failed: %v", err)
	}
	if len(rep.Trials) != 5 {
		t.Fatalf("expected 5 Harbor evaluation trials (including harbor-trial-05 tool AuthN/AuthZ), got %d", len(rep.Trials))
	}
	if rep.Trials[4].TaskID != "harbor-trial-05" {
		t.Errorf("expected 5th trial to be harbor-trial-05, got %q", rep.Trials[4].TaskID)
	}
	if rep.WithSkillPassRate != 1.0 {
		t.Errorf("expected WithSkillPassRate=1.0, got %f", rep.WithSkillPassRate)
	}
	if rep.NormalizedGain != 1.0 {
		t.Errorf("expected NormalizedGain=1.0, got %f", rep.NormalizedGain)
	}
	if !rep.OraclePassed || rep.RewardTxtValue != "1.0" {
		t.Errorf("expected OraclePassed=true and RewardTxtValue=1.0, got %v / %q", rep.OraclePassed, rep.RewardTxtValue)
	}
}
