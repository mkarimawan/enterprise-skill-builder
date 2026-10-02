package models

import "time"

// SkillSession represents an end-to-end Enterprise Skill Builder workspace session.
type SkillSession struct {
	ID              string               `json:"id"`
	CreatedAt       time.Time            `json:"createdAt"`
	UpdatedAt       time.Time            `json:"updatedAt"`
	OwnerEmail      string               `json:"ownerEmail"`
	Stage           string               `json:"stage"` // "interview", "grounding", "sandbox", "eval", "publish"
	Messages        []ChatMessage        `json:"messages"`
	Blueprint       SkillBlueprint       `json:"blueprint"`
	GroundingAssets []GroundingAsset     `json:"groundingAssets"`
	GeneratedFiles  map[string]string    `json:"generatedFiles"`
	AgyEvents       []AgyStreamEvent     `json:"agyEvents"`
	SecurityReport  *SecurityAuditReport `json:"securityReport,omitempty"`
	HarborReport    *HarborEvalReport    `json:"harborReport,omitempty"`
	PublishHistory  []PublishResult      `json:"publishHistory"`
}

// ChatMessage represents a voice or text turn in the Interview Studio.
type ChatMessage struct {
	ID        string    `json:"id"`
	Role      string    `json:"role"`     // "user" or "assistant"
	Modality  string    `json:"modality"` // "voice" or "text"
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
}

// SkillBlueprint is the structured specification extracted live during the interview.
type SkillBlueprint struct {
	Name              string       `json:"name"`
	DisplayName       string       `json:"displayName"`
	Summary           string       `json:"summary"`
	TargetPlatforms   []string     `json:"targetPlatforms"` // ["Gemini Enterprise Spark (Sobi/Obi)", "Gemini Enterprise Web (Dolphin)", "Antigravity 2.0 / ADK"]
	RuntimeProfile    string       `json:"runtimeProfile"`  // "GE Python 3.11 Frozen + Vendored scripts/lib/"
	UseWhenTriggers   []string     `json:"useWhenTriggers"`
	DoNotUseTriggers  []string     `json:"doNotUseTriggers"`
	InputParameters   []ParamSpec  `json:"inputParameters"`
	Scripts           []ScriptSpec `json:"scripts"`
	ReferenceDocs     []string     `json:"referenceDocs"`
	GuardrailsGotchas []string     `json:"guardrailsGotchas"`
	EvalAssertions    []string     `json:"evalAssertions"`
	ReadinessScore    int          `json:"readinessScore"` // 0 to 100
	OpenQuestions     []string     `json:"openQuestions"`
}

// ParamSpec defines a deterministic CLI input parameter for a skill script.
type ParamSpec struct {
	Flag        string `json:"flag"`
	Type        string `json:"type"`
	Required    bool   `json:"required"`
	Description string `json:"description"`
	Example     string `json:"example"`
}

// ScriptSpec defines a deterministic Python 3.11 script inside scripts/.
type ScriptSpec struct {
	Filename       string   `json:"filename"`
	Purpose        string   `json:"purpose"`
	PackagesUsed   []string `json:"packagesUsed"`
	VendoredLibs   []string `json:"vendoredLibs"`
	OutputContract string   `json:"outputContract"`
}

// GroundingAsset represents an uploaded spec, live GCP schema, or MCP server definition.
type GroundingAsset struct {
	ID               string    `json:"id"`
	Name             string    `json:"name"`
	SourceType       string    `json:"sourceType"` // "openapi", "bigquery", "mcp", "cloudrun", "runbook"
	Summary          string    `json:"summary"`
	RawSchemaSnippet string    `json:"rawSchemaSnippet"`
	MockFixturePath  string    `json:"mockFixturePath"`
	MockFixtureJSON  string    `json:"mockFixtureJson"`
	AddedAt          time.Time `json:"addedAt"`
}

// AgyStreamEvent mirrors the NDJSON stream emitted by headless `agy --output-format=stream-json`.
type AgyStreamEvent struct {
	Step      int       `json:"step"`
	Type      string    `json:"type"` // "init", "thinking", "tool_call", "tool_result", "self_heal", "security_scan", "done"
	Title     string    `json:"title"`
	Detail    string    `json:"detail"`
	Command   string    `json:"command,omitempty"`
	ExitCode  int       `json:"exitCode,omitempty"`
	Duration  string    `json:"duration,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

// SecurityAuditReport holds results of the GE Sandbox AST, Dependency, and Bandit checks.
type SecurityAuditReport struct {
	Passed             bool              `json:"passed"`
	RuntimeParity      string            `json:"runtimeParity"`
	AllowedPackages    []string          `json:"allowedPackages"`
	VendoredPackages   []string          `json:"vendoredPackages"`
	Checks             []SecurityCheck   `json:"checks"`
	ExecutedCommandLog string            `json:"executedCommandLog"`
}

// SecurityCheck represents an individual deterministic or security verification check.
type SecurityCheck struct {
	ID       string `json:"id"`
	Category string `json:"category"`
	Status   string `json:"status"` // "PASS", "HEALED", "FAIL"
	Detail   string `json:"detail"`
}

// HarborEvalReport holds the SkillsBench + Harbor evaluation results.
type HarborEvalReport struct {
	SuiteID            string              `json:"suiteId"`
	BenchmarkFramework string              `json:"benchmarkFramework"` // "SkillsBench + Harbor v1.0"
	ModelEvaluated     string              `json:"modelEvaluated"`     // "gemini-3.6-flash"
	OraclePassed       bool                `json:"oraclePassed"`
	BaselinePassRate   float64             `json:"baselinePassRate"`
	WithSkillPassRate  float64             `json:"withSkillPassRate"`
	NormalizedGain     float64             `json:"normalizedGain"`
	AvgTokensBaseline  int                 `json:"avgTokensBaseline"`
	AvgTokensWithSkill int                 `json:"avgTokensWithSkill"`
	AvgLatencyMsSkill  int                 `json:"avgLatencyMsSkill"`
	RewardTxtValue     string              `json:"rewardTxtValue"`
	Trials             []HarborTrialResult `json:"trials"`
	HarborFiles        map[string]string   `json:"harborFiles"`
	CompletedAt        time.Time           `json:"completedAt"`
}

// HarborTrialResult captures a paired No-Skill vs. With-Skill evaluation task run.
type HarborTrialResult struct {
	TaskID            string   `json:"taskId"`
	TaskTitle         string   `json:"taskTitle"`
	Prompt            string   `json:"prompt"`
	BaselineReward    float64  `json:"baselineReward"`
	BaselineFailure   string   `json:"baselineFailure"`
	WithSkillReward   float64  `json:"withSkillReward"`
	WithSkillOutput   string   `json:"withSkillOutput"`
	AssertionsChecked []string `json:"assertionsChecked"`
	DurationMs        int      `json:"durationMs"`
}

// PublishRequest specifies where to register/publish the verified skill.
type PublishRequest struct {
	Target              string `json:"target"` // "agent_registry", "gemini_enterprise", "zip_bundle", "all"
	ProjectID           string `json:"projectId"`
	Location            string `json:"location"`
	DiscoveryEngineApp  string `json:"discoveryEngineApp"`
	VersionTag          string `json:"versionTag"`
}

// PublishResult records the registration status and CLI/API receipts.
type PublishResult struct {
	ID            string    `json:"id"`
	Target        string    `json:"target"`
	Status        string    `json:"status"`
	ResourceURI   string    `json:"resourceUri"`
	CLICommand    string    `json:"cliCommand"`
	BundleSizeKB  int       `json:"bundleSizeKb"`
	SHA256Digest  string    `json:"sha256Digest"`
	PublishedAt   time.Time `json:"publishedAt"`
	PublishedBy   string    `json:"publishedBy"`
}
