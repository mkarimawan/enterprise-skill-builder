// Enterprise Skill Builder Interactive Workbench Client
// Enforces stitch-design-taste, web-app-development, and product-taste rules
(function () {
  const state = {
    sessions: [],
    currentSession: null,
    activeStage: 'interview',
    selectedBundleFile: 'SKILL.md',
    selectedHarborFile: 'harbor_task/task.toml',
    activeDrawerTab: 'terraform',
    isRecordingVoice: false,
    recognition: null,
  };

  // DOM Elements
  const sessionSelect = document.getElementById('sessionSelect');
  const newSessionBtn = document.getElementById('newSessionBtn');
  const iapEmailText = document.getElementById('iapEmailText');
  const stageTabs = document.querySelectorAll('.pipeline-step');
  const stagePanels = document.querySelectorAll('.stage-view');

  const chatTranscript = document.getElementById('chatTranscript');
  const chatInput = document.getElementById('chatInput');
  const sendChatBtn = document.getElementById('sendChatBtn');
  const voiceToggleBtn = document.getElementById('voiceToggleBtn');
  const voiceBtnLabel = document.getElementById('voiceBtnLabel');
  const voiceWaveformBar = document.getElementById('voiceWaveformBar');
  const voiceStatusText = document.getElementById('voiceStatusText');

  const bpReadinessBadge = document.getElementById('bpReadinessBadge');
  const bpProgressBar = document.getElementById('bpProgressBar');
  const blueprintCanvasContent = document.getElementById('blueprintCanvasContent');

  const groundingForm = document.getElementById('groundingForm');
  const groundingAssetsList = document.getElementById('groundingAssetsList');
  const fixturePreviewCode = document.getElementById('fixturePreviewCode');

  const agyEventStream = document.getElementById('agyEventStream');
  const securityChecksList = document.getElementById('securityChecksList');
  const fileTabsBar = document.getElementById('fileTabsBar');
  const fileViewerContent = document.getElementById('fileViewerContent');
  const downloadBundleBtnSandbox = document.getElementById('downloadBundleBtnSandbox');

  const evalKpiGrid = document.getElementById('evalKpiGrid');
  const harborTrialsList = document.getElementById('harborTrialsList');
  const harborFileTabs = document.getElementById('harborFileTabs');
  const harborFileViewer = document.getElementById('harborFileViewer');

  const publishForm = document.getElementById('publishForm');
  const publishReceiptsList = document.getElementById('publishReceiptsList');
  const downloadZipDirectBtn = document.getElementById('downloadZipDirectBtn');

  const openDrawerBtn = document.getElementById('openDrawerBtn');
  const openTerraformDrawerFromPublishBtn = document.getElementById('openTerraformDrawerFromPublishBtn');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const referenceDrawer = document.getElementById('referenceDrawer');
  const drawerContentArea = document.getElementById('drawerContentArea');

  const drawerContentMap = {
    terraform: `
      <div class="ledger-group" style="padding: 0 0 14px 0;">
        <div class="ledger-heading">1. Admin Role Prerequisites (One-Time Setup)</div>
        <p class="ledger-row-desc" style="margin-bottom: 8px;">
          The administrator deploying the platform into a GCP project (or Argolis environment) needs two IAM roles:
        </p>
        <ul class="ledger-list">
          <li><code>roles/editor</code> (Project Editor to enable APIs and provision Cloud Run, Cloud Build, Artifact Registry, VPC, and GCS)</li>
          <li><code>roles/resourcemanager.projectIamAdmin</code> + <code>roles/iap.admin</code> (to create dedicated Service Accounts and bind IAP access for business users)</li>
        </ul>
      </div>
      <div class="ledger-group" style="padding: 14px 0 0 0;">
        <div class="ledger-heading">2. Three-Command Automated Build &amp; Deploy</div>
        <p class="ledger-row-desc" style="margin-bottom: 8px;">
          Terraform automatically creates the Artifact Registry repository, triggers Cloud Build for both containers, provisions <code>skill-builder-web-sa</code> and <code>skill-builder-sandbox-sa</code>, and outputs the IAP-protected portal URL:
        </p>
        <pre class="code-surface" style="max-height: 320px;">git clone https://github.com/mkarimawan/enterprise-skill-builder.git
cd enterprise-skill-builder

cat &lt;&lt;EOF &gt; terraform/terraform.tfvars
project_id = "your-gcp-project-id"
region     = "us-central1"
enable_iap = true

iap_allowed_members = [
  "user:admin@yourcompany.com",
  "group:business-skill-builders@yourcompany.com"
]
EOF

terraform -chdir=terraform init
terraform -chdir=terraform plan
terraform -chdir=terraform apply</pre>
      </div>
    `,
    runtime: `
      <div class="ledger-group" style="padding: 0;">
        <div class="ledger-heading">Gemini Enterprise Python 3.11 Frozen Sandbox Parity</div>
        <p class="ledger-row-desc" style="margin-bottom: 10px;">
          Every skill compiled in the Cloud Run Gen2 gVisor sandbox is verified against <code>runtime/ge_frozen_requirements.txt</code> (mirroring <code>ge_skills_image</code>) so the exact same bundle executes across Gemini Enterprise Web (Dolphin), Gemini Enterprise Spark (Sobi/Obi VMaaS), and Antigravity 2.0:
        </p>
        <pre class="code-surface" style="max-height: 360px;">Python 3.11.9 (Air-Gapped Sandbox Baseline)
- numpy==1.26.4
- pandas==2.2.2
- pydantic==2.8.2
- pyarrow==16.1.0
- scikit-learn==1.5.1
- scipy==1.14.0
- statsmodels==0.14.2
- openpyxl==3.1.5
- pypdf==4.3.0
- python-docx==1.1.2
- python-pptx==0.6.23
- reportlab==4.2.2
- tabulate==0.9.0
- pyyaml==6.0.1

Note: Any additional pure-Python dependency is automatically vendored into scripts/lib/ during sandbox packaging.</pre>
      </div>
    `,
    agy: `
      <div class="ledger-group" style="padding: 0;">
        <div class="ledger-heading">Headless Antigravity CLI (agy) Inside Cloud Run Gen2</div>
        <p class="ledger-row-desc" style="margin-bottom: 10px;">
          The isolated <code>skill-builder-sandbox</code> service runs under <code>skill-builder-sandbox-sa</code> with Application Default Credentials enabled (<code>AGY_ADC_AUTH=true</code>) and streams structured NDJSON events back to the portal:
        </p>
        <pre class="code-surface" style="max-height: 340px;">AGY_ADC_AUTH=true \\
GOOGLE_CLOUD_QUOTA_PROJECT="\${PROJECT_ID}" \\
agy \\
  --input-format=stream-json \\
  --output-format=stream-json \\
  --dangerously-skip-permissions \\
  --enable-terminal-sandbox \\
  --workspace=/workspace/sandboxes/\${SESSION_ID}</pre>
      </div>
    `,
  };

  async function init() {
    renderDrawerContent();
    await loadIdentity();
    await loadSessions();
    bindEvents();
    setupSpeechRecognition();
  }

  function toggleDrawer(open, tabName) {
    if (tabName) {
      state.activeDrawerTab = tabName;
      document.querySelectorAll('[data-drawer-tab]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.drawerTab === tabName);
      });
      renderDrawerContent();
    }
    referenceDrawer.classList.toggle('open', open);
    drawerBackdrop.classList.toggle('open', open);
  }

  function renderDrawerContent() {
    drawerContentArea.innerHTML = drawerContentMap[state.activeDrawerTab] || drawerContentMap.terraform;
  }

  async function loadIdentity() {
    try {
      const res = await fetch('/api/identity');
      const data = await res.json();
      if (data.identity && data.identity.email) {
        iapEmailText.textContent = `${data.identity.email} (${data.identity.iapVerified ? 'IAP Verified' : 'ADC Session'})`;
      }
      if (data.projectId) {
        const projInput = document.getElementById('pubProjectId');
        if (projInput) projInput.value = data.projectId;
      }
    } catch (_) {
      iapEmailText.textContent = 'IAP Session Active';
    }
  }

  async function loadSessions(selectId) {
    const res = await fetch('/api/sessions');
    const data = await res.json();
    state.sessions = data.sessions || [];
    renderSessionSelector(selectId);
    if (state.sessions.length > 0) {
      const target = selectId
        ? state.sessions.find((s) => s.id === selectId) || state.sessions[0]
        : state.sessions[0];
      setCurrentSession(target);
    }
  }

  function renderSessionSelector(selectedId) {
    sessionSelect.innerHTML = '';
    state.sessions.forEach((sess) => {
      const opt = document.createElement('option');
      opt.value = sess.id;
      opt.textContent = `${sess.blueprint.displayName || sess.blueprint.name} (${sess.blueprint.readinessScore}% Ready)`;
      if (selectedId && sess.id === selectedId) {
        opt.selected = true;
      }
      sessionSelect.appendChild(opt);
    });
  }

  function setCurrentSession(sess) {
    state.currentSession = sess;
    sessionSelect.value = sess.id;
    const downloadUrl = `/api/sessions/${sess.id}/download`;
    downloadBundleBtnSandbox.href = downloadUrl;
    downloadZipDirectBtn.href = downloadUrl;

    renderInterviewAndBlueprint();
    renderGroundingStage();
    renderSandboxStage();
    renderEvalStage();
    renderPublishStage();
  }

  function switchStage(stageName) {
    state.activeStage = stageName;
    stageTabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.stage === stageName);
    });
    stagePanels.forEach((panel) => {
      panel.classList.toggle('active', panel.id === `stage-${stageName}`);
    });
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatSimpleMarkdown(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br/>');
  }

  function renderSkeletonLoader(linesCount) {
    const lines = [];
    for (let i = 0; i < (linesCount || 3); i++) {
      const widthClass = i % 2 === 0 ? 'w-95' : 'w-60';
      lines.push(`<div class="skeleton-line ${widthClass}"></div>`);
    }
    return `<div class="skeleton-stack">${lines.join('')}</div>`;
  }

  function renderInterviewAndBlueprint() {
    const sess = state.currentSession;
    if (!sess) return;

    chatTranscript.innerHTML = (sess.messages || [])
      .map((m) => {
        const author = m.role === 'user' ? 'Skill Author' : 'Skill Architect (Gemini 3.6 Flash)';
        const modality = m.modality === 'voice' ? 'VOICE STREAM' : 'TEXT TURN';
        return `
          <div class="turn-row ${escapeHtml(m.role)}">
            <div class="turn-header">
              <span class="turn-author">${escapeHtml(author)}</span>
              <span class="tabular-nums">${escapeHtml(modality)}</span>
            </div>
            <div class="turn-body">${formatSimpleMarkdown(m.content)}</div>
          </div>
        `;
      })
      .join('');
    chatTranscript.scrollTop = chatTranscript.scrollHeight;

    const bp = sess.blueprint || {};
    const score = bp.readinessScore || 0;
    bpReadinessBadge.textContent = `${score}%`;
    bpProgressBar.style.width = `${score}%`;

    const platforms = (bp.targetPlatforms || [])
      .map((p) => `<span class="runtime-tag">${escapeHtml(p)}</span>`)
      .join('');
    const useWhen = (bp.useWhenTriggers || []).map((t) => `<li>${escapeHtml(t)}</li>`).join('') || '<li>Describe when the agent should trigger this skill...</li>';
    const doNotUse = (bp.doNotUseTriggers || []).map((t) => `<li>${escapeHtml(t)}</li>`).join('') || '<li>Describe out-of-scope or destructive actions to block...</li>';
    const params = (bp.inputParameters || [])
      .map((p) => `<li><code>${escapeHtml(p.flag)}</code> (${escapeHtml(p.type)}, ${p.required ? 'required' : 'optional'}): ${escapeHtml(p.description)}</li>`)
      .join('') || '<li>No CLI parameters defined yet.</li>';
    const scripts = (bp.scripts || [])
      .map((s) => `<li><code>${escapeHtml(s.filename)}</code>: ${escapeHtml(s.purpose)}<br/><span class="field-hint">Output Contract: ${escapeHtml(s.outputContract)}</span></li>`)
      .join('') || '<li>Pending deterministic script specification...</li>';
    const guardrails = (bp.guardrailsGotchas || []).map((g) => `<li>${escapeHtml(g)}</li>`).join('') || '<li>Enforce air-gapped Python 3.11 frozen GE runtime parity.</li>';

    blueprintCanvasContent.innerHTML = `
      <div class="ledger-group">
        <div class="ledger-heading">Skill Identifier &amp; Target Runtimes</div>
        <div style="font-weight: 700; font-size: 14px; color: var(--ink-charcoal);">
          <code>${escapeHtml(bp.name)}</code> - ${escapeHtml(bp.displayName)}
        </div>
        <p class="ledger-row-desc" style="margin-top: 4px;">${escapeHtml(bp.summary)}</p>
        <div class="runtime-tag-row">${platforms}</div>
      </div>

      <div class="ledger-group">
        <div class="ledger-heading">Positive Routing Triggers (&lt;use_when&gt;)</div>
        <ul class="ledger-list">${useWhen}</ul>
      </div>

      <div class="ledger-group">
        <div class="ledger-heading">Negative Scope Guardrails (&lt;do_not_use_for&gt;)</div>
        <ul class="ledger-list">${doNotUse}</ul>
      </div>

      <div class="ledger-group">
        <div class="ledger-heading">Deterministic Python 3.11 Scripts &amp; CLI Flags</div>
        <ul class="ledger-list" style="margin-bottom: 8px;">${scripts}</ul>
        <ul class="ledger-list">${params}</ul>
      </div>

      <div class="ledger-group">
        <div class="ledger-heading">Operational Guardrails &amp; Edge-Case Gotchas</div>
        <ul class="ledger-list">${guardrails}</ul>
      </div>
    `;
  }

  function renderGroundingStage() {
    const sess = state.currentSession;
    if (!sess) return;
    const assets = sess.groundingAssets || [];

    if (assets.length === 0) {
      groundingAssetsList.innerHTML = `
        <div class="ledger-row">
          <div class="ledger-row-title">No enterprise grounding schemas attached yet</div>
          <div class="ledger-row-desc">Submit a BigQuery DDL, OpenAPI specification, or MCP server definition above to synthesize a deterministic sandbox fixture.</div>
        </div>
      `;
      fixturePreviewCode.textContent = '// Attach a grounding source to synthesize tests/fixtures/mock_payload.json';
      return;
    }

    groundingAssetsList.innerHTML = assets
      .map(
        (a) => `
        <div class="ledger-row">
          <div class="ledger-row-top">
            <span class="ledger-row-title"><code>${escapeHtml(a.name)}</code></span>
            <span class="status-tag status-neutral">${escapeHtml(a.sourceType.toUpperCase())}</span>
          </div>
          <div class="ledger-row-desc">${escapeHtml(a.summary)}</div>
          <pre class="inline-cmd-snippet">${escapeHtml(a.rawSchemaSnippet)}</pre>
        </div>
      `
      )
      .join('');

    fixturePreviewCode.textContent = assets[0].mockFixtureJson || '{}';
  }

  function renderSandboxStage() {
    const sess = state.currentSession;
    if (!sess) return;

    const events = sess.agyEvents || [];
    if (events.length === 0) {
      agyEventStream.innerHTML = `
        <div class="ledger-row">
          <div class="ledger-row-title">Sandbox build ready</div>
          <div class="ledger-row-desc">Click "Re-Run AGY Build &amp; Self-Heal" to compile SKILL.md and execute the Python 3.11 script inside the sandbox.</div>
        </div>
      `;
    } else {
      agyEventStream.innerHTML = events
        .map((ev) => {
          const statusClass = ev.type === 'self_heal' ? 'status-warn' : ev.type === 'done' || ev.type === 'security_scan' ? 'status-pass' : 'status-neutral';
          return `
            <div class="ledger-row">
              <div class="ledger-row-top">
                <span class="ledger-row-title"><span class="tabular-nums">0${ev.step}</span>. ${escapeHtml(ev.title)}</span>
                <span class="status-tag ${statusClass}">${escapeHtml(ev.type.toUpperCase())} (${escapeHtml(ev.duration || '0ms')})</span>
              </div>
              <div class="ledger-row-desc">${escapeHtml(ev.detail)}</div>
              ${ev.command ? `<pre class="inline-cmd-snippet">$ ${escapeHtml(ev.command)}</pre>` : ''}
            </div>
          `;
        })
        .join('');
    }

    const sec = sess.securityReport;
    if (sec && sec.checks) {
      securityChecksList.innerHTML = sec.checks
        .map((c) => {
          const statusClass = c.status === 'PASS' ? 'status-pass' : c.status === 'HEALED' ? 'status-warn' : 'status-neutral';
          return `
            <div class="ledger-row">
              <div class="ledger-row-top">
                <span class="ledger-row-title"><code>${escapeHtml(c.id)}</code> ${escapeHtml(c.category)}</span>
                <span class="status-tag ${statusClass}">${escapeHtml(c.status)}</span>
              </div>
              <div class="ledger-row-desc">${escapeHtml(c.detail)}</div>
            </div>
          `;
        })
        .join('');
    } else {
      securityChecksList.innerHTML = `<div class="ledger-row"><div class="ledger-row-desc">Pending sandbox AST scan...</div></div>`;
    }

    const files = sess.generatedFiles || {};
    const fileKeys = Object.keys(files).filter((k) => !k.startsWith('harbor_task/'));
    if (fileKeys.length > 0) {
      if (!files[state.selectedBundleFile]) {
        state.selectedBundleFile = fileKeys[0];
      }
      fileTabsBar.innerHTML = fileKeys
        .map(
          (k) => `
          <button id="bundleTab-${escapeHtml(k.replace(/[^a-zA-Z0-9]/g, '-'))}" type="button" class="file-tab ${k === state.selectedBundleFile ? 'active' : ''}" data-file="${escapeHtml(k)}">
            ${escapeHtml(k)}
          </button>
        `
        )
        .join('');
      fileViewerContent.textContent = files[state.selectedBundleFile] || '';
    } else {
      fileTabsBar.innerHTML = '';
      fileViewerContent.textContent = '// Run the sandbox build to inspect SKILL.md and Python 3.11 scripts';
    }
  }

  function renderEvalStage() {
    const sess = state.currentSession;
    if (!sess) return;
    const rep = sess.harborReport;

    if (!rep) {
      evalKpiGrid.innerHTML = `
        <div class="kpi-cell">
          <span class="kpi-metric-label">Evaluation Status</span>
          <span class="kpi-metric-value">Ready</span>
          <span class="kpi-metric-delta">Click "Re-Run Harbor Evaluation Suite" above</span>
        </div>
      `;
      harborTrialsList.innerHTML = '';
      harborFileTabs.innerHTML = '';
      harborFileViewer.textContent = '// Run SkillsBench + Harbor evaluation to inspect task.toml, solve.sh, and test_outputs.py';
      return;
    }

    const basePct = Math.round((rep.baselinePassRate || 0) * 100);
    const skillPct = Math.round((rep.withSkillPassRate || 0) * 100);
    const gainPct = Math.round((rep.normalizedGain || 0) * 100);
    const tokenReduction = Math.round(((rep.avgTokensBaseline - rep.avgTokensWithSkill) / rep.avgTokensBaseline) * 100);

    evalKpiGrid.innerHTML = `
      <div class="kpi-cell">
        <span class="kpi-metric-label">With-Skill Pass Rate (Harbor)</span>
        <span class="kpi-metric-value">${skillPct}%</span>
        <span class="kpi-metric-delta">+${skillPct - basePct}% lift vs. No-Skill (${basePct}%)</span>
      </div>
      <div class="kpi-cell">
        <span class="kpi-metric-label">SkillsBench Normalized Gain (g)</span>
        <span class="kpi-metric-value">${rep.normalizedGain.toFixed(2)}</span>
        <span class="kpi-metric-delta">${gainPct}% error ceiling reduction</span>
      </div>
      <div class="kpi-cell">
        <span class="kpi-metric-label">Harbor Verifier (/logs/verifier/reward.txt)</span>
        <span class="kpi-metric-value">${escapeHtml(rep.rewardTxtValue)}</span>
        <span class="kpi-metric-delta">Oracle verified (${rep.avgLatencyMsSkill}ms avg)</span>
      </div>
      <div class="kpi-cell">
        <span class="kpi-metric-label">Token Efficiency Delta</span>
        <span class="kpi-metric-value">-${tokenReduction}%</span>
        <span class="kpi-metric-delta">${rep.avgTokensWithSkill} vs. ${rep.avgTokensBaseline} baseline tokens</span>
      </div>
    `;

    harborTrialsList.innerHTML = (rep.trials || [])
      .map(
        (t) => `
        <div class="ledger-row">
          <div class="ledger-row-top">
            <span class="ledger-row-title"><code>${escapeHtml(t.taskId)}</code> ${escapeHtml(t.taskTitle)}</span>
            <span class="status-tag status-pass">Base: ${t.baselineReward.toFixed(1)} | Skill: ${t.withSkillReward.toFixed(1)}</span>
          </div>
          <div class="ledger-row-desc" style="margin-bottom: 4px;">Prompt: ${escapeHtml(t.prompt)}</div>
          <div class="ledger-row-desc" style="color: var(--status-fail-ink);"><strong>No-Skill Baseline:</strong> ${escapeHtml(t.baselineFailure)}</div>
          <div class="ledger-row-desc" style="color: var(--status-pass-ink);"><strong>With-Skill Result:</strong> ${escapeHtml(t.WithSkillOutput || t.withSkillOutput)}</div>
        </div>
      `
      )
      .join('');

    const hFiles = rep.harborFiles || {};
    const hKeys = Object.keys(hFiles);
    if (hKeys.length > 0) {
      if (!hFiles[state.selectedHarborFile]) {
        state.selectedHarborFile = hKeys[0];
      }
      harborFileTabs.innerHTML = hKeys
        .map(
          (k) => `
          <button id="harborTab-${escapeHtml(k.replace(/[^a-zA-Z0-9]/g, '-'))}" type="button" class="file-tab ${k === state.selectedHarborFile ? 'active' : ''}" data-hfile="${escapeHtml(k)}">
            ${escapeHtml(k)}
          </button>
        `
        )
        .join('');
      harborFileViewer.textContent = hFiles[state.selectedHarborFile] || '';
    }
  }

  function renderPublishStage() {
    const sess = state.currentSession;
    if (!sess) return;
    const history = sess.publishHistory || [];

    if (history.length === 0) {
      publishReceiptsList.innerHTML = `
        <div class="ledger-row">
          <div class="ledger-row-title">Ready for registration</div>
          <div class="ledger-row-desc">Select your target registry on the left and click "Register &amp; Mount Skill Now" to generate immutable registration receipts and CLI commands.</div>
        </div>
      `;
      return;
    }

    publishReceiptsList.innerHTML = history
      .map(
        (r) => `
        <div class="ledger-row">
          <div class="ledger-row-top">
            <span class="ledger-row-title">${escapeHtml(r.target)}</span>
            <span class="status-tag status-pass">${escapeHtml(r.status)}</span>
          </div>
          <div class="ledger-row-desc tabular-nums">
            URI: <code>${escapeHtml(r.resourceUri)}</code> | SHA-256: <code>${escapeHtml(r.sha256Digest.slice(0, 16))}...</code> (${r.bundleSizeKb} KB)
          </div>
          <pre class="inline-cmd-snippet">$ ${escapeHtml(r.cliCommand)}</pre>
        </div>
      `
      )
      .join('');
  }

  async function sendInterviewTurn(messageText, modality) {
    if (!state.currentSession || !messageText.trim()) return;
    sendChatBtn.disabled = true;
    blueprintCanvasContent.innerHTML = renderSkeletonLoader(4);
    try {
      const res = await fetch(`/api/sessions/${state.currentSession.id}/interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText.trim(), modality: modality || 'text' }),
      });
      const data = await res.json();
      if (data.session) {
        state.currentSession = data.session;
        renderSessionSelector(state.currentSession.id);
        renderInterviewAndBlueprint();
      }
    } finally {
      sendChatBtn.disabled = false;
    }
  }

  async function triggerSandboxRun() {
    if (!state.currentSession) return;
    switchStage('sandbox');
    const runBtn = document.getElementById('runSandboxBtn');
    runBtn.disabled = true;
    agyEventStream.innerHTML = renderSkeletonLoader(5);
    try {
      const res = await fetch(`/api/sessions/${state.currentSession.id}/sandbox`, { method: 'POST' });
      const data = await res.json();
      if (data.session) {
        setCurrentSession(data.session);
      }
    } finally {
      runBtn.disabled = false;
    }
  }

  async function triggerHarborEval() {
    if (!state.currentSession) return;
    switchStage('eval');
    const evalBtn = document.getElementById('runHarborEvalBtn');
    evalBtn.disabled = true;
    harborTrialsList.innerHTML = renderSkeletonLoader(4);
    try {
      const res = await fetch(`/api/sessions/${state.currentSession.id}/eval`, { method: 'POST' });
      const data = await res.json();
      if (data.session) {
        setCurrentSession(data.session);
      }
    } finally {
      evalBtn.disabled = false;
    }
  }

  function setupSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;

    const rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      chatInput.value = transcript;
      if (event.results[event.results.length - 1].isFinal) {
        stopVoiceRecording();
        sendInterviewTurn(transcript, 'voice');
        chatInput.value = '';
      }
    };

    rec.onerror = () => stopVoiceRecording();
    rec.onend = () => {
      if (state.isRecordingVoice) stopVoiceRecording();
    };

    state.recognition = rec;
  }

  function stopVoiceRecording() {
    state.isRecordingVoice = false;
    voiceToggleBtn.classList.remove('recording');
    voiceBtnLabel.textContent = 'Voice Input';
    voiceWaveformBar.classList.add('hidden');
    if (state.recognition) {
      try {
        state.recognition.stop();
      } catch (_) {}
    }
  }

  function bindEvents() {
    stageTabs.forEach((tab) => {
      tab.addEventListener('click', () => switchStage(tab.dataset.stage));
    });

    openDrawerBtn.addEventListener('click', () => toggleDrawer(true, 'terraform'));
    openTerraformDrawerFromPublishBtn.addEventListener('click', () => toggleDrawer(true, 'terraform'));
    closeDrawerBtn.addEventListener('click', () => toggleDrawer(false));
    drawerBackdrop.addEventListener('click', () => toggleDrawer(false));

    document.querySelectorAll('[data-drawer-tab]').forEach((btn) => {
      btn.addEventListener('click', () => toggleDrawer(true, btn.dataset.drawerTab));
    });

    sessionSelect.addEventListener('change', async (e) => {
      const id = e.target.value;
      const res = await fetch(`/api/sessions/${id}`);
      const sess = await res.json();
      setCurrentSession(sess);
    });

    newSessionBtn.addEventListener('click', async () => {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const sess = await res.json();
      await loadSessions(sess.id);
      switchStage('interview');
    });

    document.querySelectorAll('.template-trigger').forEach((chip) => {
      chip.addEventListener('click', async () => {
        const presetText = chip.dataset.preset;
        await sendInterviewTurn(presetText, 'voice');
      });
    });

    sendChatBtn.addEventListener('click', () => {
      const text = chatInput.value;
      chatInput.value = '';
      sendInterviewTurn(text, 'text');
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = chatInput.value;
        chatInput.value = '';
        sendInterviewTurn(text, 'text');
      }
    });

    voiceToggleBtn.addEventListener('click', () => {
      if (state.isRecordingVoice) {
        stopVoiceRecording();
        return;
      }
      state.isRecordingVoice = true;
      voiceToggleBtn.classList.add('recording');
      voiceBtnLabel.textContent = 'Stop Voice';
      voiceWaveformBar.classList.remove('hidden');

      if (state.recognition) {
        voiceStatusText.textContent = 'Listening via Live Microphone (speak your skill requirements)...';
        state.recognition.start();
      } else {
        voiceStatusText.textContent = 'Streaming Live Voice Turn (Gemini 3.6 Flash)...';
        setTimeout(() => {
          if (!state.isRecordingVoice) return;
          stopVoiceRecording();
          sendInterviewTurn(
            'Enforce a strict 2.5 sigma anomaly threshold, $250 minimum daily delta, and verify cost_center and owner governance labels on every record.',
            'voice'
          );
        }, 1600);
      }
    });

    document.getElementById('goToGroundingBtn').addEventListener('click', () => switchStage('grounding'));
    document.getElementById('quickBuildSandboxBtn').addEventListener('click', () => triggerSandboxRun());
    document.getElementById('groundingToSandboxBtn').addEventListener('click', () => triggerSandboxRun());
    document.getElementById('runSandboxBtn').addEventListener('click', () => triggerSandboxRun());
    document.getElementById('sandboxToEvalBtn').addEventListener('click', () => triggerHarborEval());
    document.getElementById('runHarborEvalBtn').addEventListener('click', () => triggerHarborEval());
    document.getElementById('evalToPublishBtn').addEventListener('click', () => switchStage('publish'));

    groundingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.currentSession) return;
      const sourceType = document.getElementById('grdSourceType').value;
      const name = document.getElementById('grdName').value;
      const rawSchema = document.getElementById('grdSchema').value;

      const res = await fetch(`/api/sessions/${state.currentSession.id}/grounding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType, name, rawSchema }),
      });
      const data = await res.json();
      if (data.session) {
        setCurrentSession(data.session);
        document.getElementById('grdName').value = '';
        document.getElementById('grdSchema').value = '';
      }
    });

    fileTabsBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.file-tab');
      if (!btn) return;
      state.selectedBundleFile = btn.dataset.file;
      renderSandboxStage();
    });

    harborFileTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.file-tab');
      if (!btn) return;
      state.selectedHarborFile = btn.dataset.hfile;
      renderEvalStage();
    });

    publishForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.currentSession) return;
      const target = document.getElementById('pubTarget').value;
      const projectId = document.getElementById('pubProjectId').value;
      const versionTag = document.getElementById('pubVersion').value;
      const discoveryEngineApp = document.getElementById('pubGeAppId').value;

      const res = await fetch(`/api/sessions/${state.currentSession.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, projectId, location: 'global', versionTag, discoveryEngineApp }),
      });
      const data = await res.json();
      if (data.session) {
        setCurrentSession(data.session);
      }
    });
  }

  init();
})();
