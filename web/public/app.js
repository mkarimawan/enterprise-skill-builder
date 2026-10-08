// Skill Builder Frontend Client (Google Cloud Console Left-Nav + Open Exploration with In-Page Gating)
(function () {
  const state = {
    sessions: [],
    currentSession: null,
    activeStage: 'interview',
    selectedBundleFile: 'SKILL.md',
    selectedHarborFile: 'harbor_task/task.toml',
    selectedGroundingPreview: 'tools',
    isRecordingVoice: false,
    recognition: null,
  };

  const stageTitles = {
    interview: 'Create skill',
    grounding: 'Data sources',
    sandbox: 'Sandbox test',
    eval: 'Evaluations',
    publish: 'Publish',
  };

  // DOM References
  const sessionSelect = document.getElementById('sessionSelect');
  const newSessionBtn = document.getElementById('newSessionBtn');
  const iapEmailText = document.getElementById('iapEmailText');
  const topBarPublishBtn = document.getElementById('topBarPublishBtn');

  const stageTabs = document.querySelectorAll('.cfc-nav-item');
  const stagePanels = document.querySelectorAll('.stage-view');

  const chatTranscript = document.getElementById('chatTranscript');
  const chatInput = document.getElementById('chatInput');
  const sendChatBtn = document.getElementById('sendChatBtn');
  const voiceToggleBtn = document.getElementById('voiceToggleBtn');
  const voiceWaveformBar = document.getElementById('voiceWaveformBar');
  const voiceStatusText = document.getElementById('voiceStatusText');

  const importSkillUrlInput = document.getElementById('importSkillUrlInput');
  const importProviderSelect = document.getElementById('importProviderSelect');
  const importSkillUrlBtn = document.getElementById('importSkillUrlBtn');

  const skillNameInput = document.getElementById('skillNameInput');
  const editSkillNamePencilBtn = document.getElementById('editSkillNamePencilBtn');
  const saveNameFeedback = document.getElementById('saveNameFeedback');
  const bpReadinessBadge = document.getElementById('bpReadinessBadge');
  const blueprintCanvasContent = document.getElementById('blueprintCanvasContent');
  const blueprintPanelFooter = document.getElementById('blueprintPanelFooter');

  const groundingForm = document.getElementById('groundingForm');
  const groundingAssetsList = document.getElementById('groundingAssetsList');
  const groundingPreviewTabs = document.getElementById('groundingPreviewTabs');
  const groundingToolsInspector = document.getElementById('groundingToolsInspector');
  const fixturePreviewCode = document.getElementById('fixturePreviewCode');

  const sandboxGateNotice = document.getElementById('sandboxGateNotice');
  const sandboxWorkspaceWrap = document.getElementById('sandboxWorkspaceWrap');
  const runSandboxBtn = document.getElementById('runSandboxBtn');
  const sandboxToEvalBtn = document.getElementById('sandboxToEvalBtn');
  const agyEventStream = document.getElementById('agyEventStream');
  const securityChecksList = document.getElementById('securityChecksList');
  const fileTabsBar = document.getElementById('fileTabsBar');
  const fileViewerContent = document.getElementById('fileViewerContent');
  const downloadBundleBtnSandbox = document.getElementById('downloadBundleBtnSandbox');
  const navDownloadZipLink = document.getElementById('navDownloadZipLink');

  const evalGateNotice = document.getElementById('evalGateNotice');
  const evalWorkspaceWrap = document.getElementById('evalWorkspaceWrap');
  const runHarborEvalBtn = document.getElementById('runHarborEvalBtn');
  const evalToPublishBtn = document.getElementById('evalToPublishBtn');
  const evalKpiGrid = document.getElementById('evalKpiGrid');
  const harborTrialsList = document.getElementById('harborTrialsList');
  const harborFileTabs = document.getElementById('harborFileTabs');
  const harborFileViewer = document.getElementById('harborFileViewer');

  const publishGateNotice = document.getElementById('publishGateNotice');
  const publishWorkspaceWrap = document.getElementById('publishWorkspaceWrap');
  const publishForm = document.getElementById('publishForm');
  const publishFormFieldset = document.getElementById('publishFormFieldset');
  const pubCheckGeminiEnterprise = document.getElementById('pubCheckGeminiEnterprise');
  const geAppIdFieldGroup = document.getElementById('geAppIdFieldGroup');
  const publishReceiptsList = document.getElementById('publishReceiptsList');
  const downloadZipDirectBtn = document.getElementById('downloadZipDirectBtn');

  async function init() {
    await loadIdentity();
    await loadSessions();
    bindEvents();
    setupSpeechRecognition();
  }

  async function loadIdentity() {
    try {
      const res = await fetch('/api/identity');
      const data = await res.json();
      if (data.identity && data.identity.email) {
        iapEmailText.textContent = data.identity.email;
      }
      if (data.projectId) {
        const projInput = document.getElementById('pubProjectId');
        if (projInput) projInput.value = data.projectId;
      }
    } catch (_) {
      iapEmailText.textContent = 'Signed in';
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
      opt.textContent = sess.blueprint.displayName || sess.blueprint.name || 'Untitled skill';
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
    navDownloadZipLink.href = downloadUrl;

    updatePageControlsState(sess);
    renderInterviewAndBlueprint();
    renderGroundingStage();
    renderSandboxStage();
    renderEvalStage();
    renderPublishStage();
  }

  // Keeps all left-nav items open for exploration, while graying out controls inside pages whose prerequisites are not yet met.
  function updatePageControlsState(sess) {
    if (!sess) return;
    const bp = sess.blueprint || {};
    const hasBlueprint = Boolean(bp.readinessScore > 0);
    const hasSandbox = Boolean((sess.agyEvents && sess.agyEvents.length > 0) || (sess.securityReport && sess.securityReport.passed));
    const hasEval = Boolean(sess.harborReport && sess.harborReport.oraclePassed);

    // Sandbox page state
    sandboxGateNotice.classList.toggle('hidden-field', hasBlueprint);
    sandboxWorkspaceWrap.classList.toggle('workspace-grayed', !hasBlueprint);
    runSandboxBtn.disabled = !hasBlueprint;
    sandboxToEvalBtn.disabled = !hasSandbox;

    // Evaluations page state
    evalGateNotice.classList.toggle('hidden-field', hasSandbox);
    evalWorkspaceWrap.classList.toggle('workspace-grayed', !hasSandbox);
    runHarborEvalBtn.disabled = !hasSandbox;
    evalToPublishBtn.disabled = !hasEval;

    // Publish page state & top-right Publish button
    publishGateNotice.classList.toggle('hidden-field', hasEval);
    publishWorkspaceWrap.classList.toggle('workspace-grayed', !hasEval);
    publishFormFieldset.disabled = !hasEval;
    topBarPublishBtn.disabled = !hasEval;
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

  function renderSkeletonLoader(count) {
    const bars = [];
    for (let i = 0; i < (count || 3); i++) {
      bars.push(`<div class="skeleton-bar" style="width: ${i % 2 === 0 ? '90%' : '65%'};"></div>`);
    }
    return `<div class="skeleton-stack">${bars.join('')}</div>`;
  }

  function renderInterviewAndBlueprint() {
    const sess = state.currentSession;
    if (!sess) return;

    chatTranscript.innerHTML = (sess.messages || [])
      .map((m) => {
        const sender = m.role === 'user' ? 'You' : 'Assistant';
        return `
          <div class="msg-row ${escapeHtml(m.role)}">
            <div class="msg-sender">${escapeHtml(sender)}</div>
            <div class="msg-text">${formatSimpleMarkdown(m.content)}</div>
          </div>
        `;
      })
      .join('');
    chatTranscript.scrollTop = chatTranscript.scrollHeight;

    const bp = sess.blueprint || {};
    skillNameInput.value = bp.displayName || bp.name || 'Untitled skill';

    const hasBlueprint = Boolean(bp.readinessScore > 0);

    if (!hasBlueprint) {
      bpReadinessBadge.textContent = 'Not started';
      bpReadinessBadge.className = 'status-badge status-neutral';
      blueprintPanelFooter.classList.add('hidden-field');
      blueprintCanvasContent.innerHTML = `
        <div class="cfc-empty-state">
          <div class="empty-state-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
          </div>
          <div class="empty-state-title">Skill summary will appear here</div>
          <p class="empty-state-desc">Give your skill a name above and describe what you want it to do on the left, click a sample prompt, or paste a URL to import an existing Anthropic Claude or OpenAI skill.</p>
        </div>
      `;
      return;
    }

    bpReadinessBadge.textContent = `${bp.readinessScore}% ready`;
    bpReadinessBadge.className = 'status-badge status-pass';
    blueprintPanelFooter.classList.remove('hidden-field');

    const useWhen = (bp.useWhenTriggers || []).map((t) => `<li>${escapeHtml(t)}</li>`).join('');
    const params = (bp.inputParameters || [])
      .map((p) => `<li><code>${escapeHtml(p.flag)}</code>: ${escapeHtml(p.description)}</li>`)
      .join('');
    const guardrails = (bp.guardrailsGotchas || []).map((g) => `<li>${escapeHtml(g)}</li>`).join('');

    let adaptationHtml = '';
    const imp = sess.importReport;
    if (imp && imp.adaptations && imp.adaptations.length > 0) {
      const adaptRows = imp.adaptations
        .map(
          (item) => `
          <div class="adaptation-diff-row">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <strong>${escapeHtml(item.category)}</strong>
              <span class="status-badge status-pass">Adapted</span>
            </div>
            <div class="ledger-row-sub">Source: <code>${escapeHtml(item.original)}</code></div>
            <div class="ledger-row-sub" style="color: var(--status-pass-ink);">Adapted to: <code>${escapeHtml(item.adaptedTo)}</code></div>
            ${item.explanation ? `<div class="ledger-row-sub">${escapeHtml(item.explanation)}</div>` : ''}
          </div>
        `
        )
        .join('');

      adaptationHtml = `
        <div class="adaptation-banner">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
            <span class="ledger-row-title">Adapted from ${escapeHtml(imp.sourceProvider)} to Gemini, GE &amp; Antigravity</span>
            <span class="status-badge status-pass"><code>${escapeHtml(imp.originalModel)}</code> to <code>${escapeHtml(imp.targetGeminiModel)}</code></span>
          </div>
          <div class="ledger-row-sub">Source URL: <code>${escapeHtml(imp.sourceUrl)}</code></div>
          ${adaptRows}
        </div>
      `;
    }

    blueprintCanvasContent.innerHTML = `
      ${adaptationHtml}
      <div class="ledger-section">
        <div class="ledger-label">What this skill does</div>
        <div style="font-weight: 500; font-size: 14px;">${escapeHtml(bp.displayName || bp.name)} <span class="ledger-row-sub">(<code>${escapeHtml(bp.name)}</code>)</span></div>
        <p class="ledger-row-sub" style="margin-top: 4px;">${escapeHtml(bp.summary)}</p>
      </div>

      <div class="ledger-section">
        <div class="ledger-label">When Gemini should use this skill</div>
        <ul class="ledger-items">${useWhen}</ul>
      </div>

      <div class="ledger-section">
        <div class="ledger-label">Inputs required</div>
        <ul class="ledger-items">${params}</ul>
      </div>

      <div class="ledger-section">
        <div class="ledger-label">Safety rules &amp; guardrails</div>
        <ul class="ledger-items">${guardrails}</ul>
      </div>
    `;
  }

  function renderGroundingStage() {
    const sess = state.currentSession;
    if (!sess) return;
    const assets = sess.groundingAssets || [];

    if (groundingPreviewTabs) {
      groundingPreviewTabs.querySelectorAll('.file-tab').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.gpreview === state.selectedGroundingPreview);
      });
    }

    if (assets.length === 0) {
      groundingAssetsList.innerHTML = `
        <div class="cfc-empty-state" style="padding: 28px 16px;">
          <div class="empty-state-title">No business data or tool endpoints connected yet</div>
          <p class="empty-state-desc">Click "Attach sample" next to any system above, or connect your own MCP server or REST API with AuthN/AuthZ below.</p>
        </div>
      `;
      groundingToolsInspector.innerHTML = `
        <div class="cfc-empty-state">
          <div class="empty-state-title">No MCP or OpenAPI tools discovered yet</div>
          <p class="empty-state-desc">Connect an MCP server, REST API, or business dataset on the left to inspect discovered tool schemas, AuthN/AuthZ policies, and OpenAPI 3.0 specifications.</p>
        </div>
      `;
      groundingToolsInspector.classList.remove('hidden-field');
      fixturePreviewCode.classList.add('hidden-field');
      return;
    }

    groundingAssetsList.innerHTML = assets
      .map((a) => {
        const authInfo = a.authConfig
          ? `AuthN: ${a.authConfig.authnType} | AuthZ: ${a.authConfig.readOnlyEnforced ? 'Read-Only Guardrail' : 'Standard'}`
          : 'Synthetic Fixture';
        return `
        <div class="ledger-row">
          <div class="ledger-row-header">
            <span class="ledger-row-title"><code>${escapeHtml(a.name)}</code></span>
            <span class="status-badge status-pass">${escapeHtml(a.sourceType.toUpperCase())} (${escapeHtml(a.discoveryMode || 'connected')})</span>
          </div>
          ${a.endpointUrl ? `<div class="ledger-row-sub">Endpoint: <code>${escapeHtml(a.endpointUrl)}</code></div>` : ''}
          <div class="ledger-row-sub">${escapeHtml(a.summary)}</div>
          <div class="ledger-row-sub"><strong>Security:</strong> ${escapeHtml(authInfo)}</div>
        </div>
      `;
      })
      .join('');

    const latest = assets[assets.length - 1];

    if (state.selectedGroundingPreview === 'tools') {
      groundingToolsInspector.classList.remove('hidden-field');
      fixturePreviewCode.classList.add('hidden-field');

      const tools = latest.discoveredTools || [];
      const auth = latest.authConfig || {};
      const scopes = (auth.requiredScopes || []).join(', ') || 'None specified';

      const toolsHtml = tools
        .map(
          (t) => `
          <div class="ledger-row">
            <div class="ledger-row-header">
              <span class="ledger-row-title"><code>${escapeHtml(t.name)}</code></span>
              <span class="status-badge status-neutral">${escapeHtml(t.method || 'POST')} <code>${escapeHtml(t.pathOrAction || '/')}</code></span>
            </div>
            <div class="ledger-row-sub">${escapeHtml(t.description)}</div>
            ${t.requiredArgs && t.requiredArgs.length ? `<div class="ledger-row-sub">Required args: <code>${escapeHtml(t.requiredArgs.join(', '))}</code></div>` : ''}
          </div>
        `
        )
        .join('');

      groundingToolsInspector.innerHTML = `
        <div class="ledger-section">
          <div class="ledger-label">Authentication (AuthN) &amp; Authorization (AuthZ) contract</div>
          <ul class="ledger-items">
            <li><strong>AuthN Mechanism:</strong> <code>${escapeHtml(auth.authnType || 'service_account_adc')}</code> (${escapeHtml(auth.headerName || 'Authorization')})</li>
            <li><strong>Secret Manager Credential URI:</strong> <code>${escapeHtml(auth.secretManagerUri || 'projects/finops-prod/secrets/mcp-tool-credential/versions/latest')}</code></li>
            <li><strong>Required AuthZ Scopes:</strong> <code>${escapeHtml(scopes)}</code></li>
            <li><strong>Read-Only Guardrail:</strong> ${auth.readOnlyEnforced !== false ? 'Enabled (blocks DELETE / PUT / DROP in sandbox and runtime)' : 'Disabled'}</li>
          </ul>
        </div>
        <div class="panel-header" style="border-top: 1px solid var(--border-subtle);">
          <h3 class="panel-title">Discovered callable tools (${tools.length})</h3>
          <span class="status-badge status-pass">${escapeHtml(latest.discoveryMode || 'discovered')}</span>
        </div>
        <div>${toolsHtml}</div>
      `;
    } else if (state.selectedGroundingPreview === 'spec') {
      groundingToolsInspector.classList.add('hidden-field');
      fixturePreviewCode.classList.remove('hidden-field');
      fixturePreviewCode.textContent = latest.openApiSpecYaml || latest.rawSchemaSnippet || '# No OpenAPI 3.0 or MCP specification available';
    } else {
      groundingToolsInspector.classList.add('hidden-field');
      fixturePreviewCode.classList.remove('hidden-field');
      fixturePreviewCode.textContent = latest.mockFixtureJson || '{}';
    }
  }

  function renderSandboxStage() {
    const sess = state.currentSession;
    if (!sess) return;

    const events = sess.agyEvents || [];
    if (events.length === 0) {
      agyEventStream.innerHTML = `
        <div class="cfc-empty-state">
          <div class="empty-state-title">Sandbox test not run yet</div>
          <p class="empty-state-desc">Click "Run sandbox test" above to build the skill files and verify them in the isolated Python 3.11 sandbox.</p>
        </div>
      `;
    } else {
      agyEventStream.innerHTML = events
        .map((ev) => {
          const badge = ev.type === 'self_heal' ? 'status-warn' : ev.type === 'done' || ev.type === 'security_scan' ? 'status-pass' : 'status-neutral';
          return `
            <div class="ledger-row">
              <div class="ledger-row-header">
                <span class="ledger-row-title">${escapeHtml(ev.title)}</span>
                <span class="status-badge ${badge}">${escapeHtml(ev.duration || '0ms')}</span>
              </div>
              <div class="ledger-row-sub">${escapeHtml(ev.detail)}</div>
              ${ev.command ? `<pre class="cmd-snippet">$ ${escapeHtml(ev.command)}</pre>` : ''}
            </div>
          `;
        })
        .join('');
    }

    const sec = sess.securityReport;
    if (sec && sec.checks) {
      securityChecksList.innerHTML = sec.checks
        .map((c) => {
          const badge = c.status === 'PASS' ? 'status-pass' : 'status-warn';
          return `
            <div class="ledger-row">
              <div class="ledger-row-header">
                <span class="ledger-row-title">${escapeHtml(c.category)}</span>
                <span class="status-badge ${badge}">${escapeHtml(c.status)}</span>
              </div>
              <div class="ledger-row-sub">${escapeHtml(c.detail)}</div>
            </div>
          `;
        })
        .join('');
    } else {
      securityChecksList.innerHTML = '';
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
      fileViewerContent.textContent = '// Run the sandbox test to generate SKILL.md and Python scripts';
    }
  }

  function renderEvalStage() {
    const sess = state.currentSession;
    if (!sess) return;
    const rep = sess.harborReport;

    if (!rep) {
      evalKpiGrid.innerHTML = '';
      harborTrialsList.innerHTML = `
        <div class="cfc-empty-state">
          <div class="empty-state-title">No evaluation results yet</div>
          <p class="empty-state-desc">Click "Run evaluation" to compare accuracy with and without your skill.</p>
        </div>
      `;
      harborFileTabs.innerHTML = '';
      harborFileViewer.textContent = '// Run evaluation to generate benchmark files';
      return;
    }

    const basePct = Math.round((rep.baselinePassRate || 0) * 100);
    const skillPct = Math.round((rep.withSkillPassRate || 0) * 100);
    const tokenReduction = Math.round(((rep.avgTokensBaseline - rep.avgTokensWithSkill) / rep.avgTokensBaseline) * 100);

    evalKpiGrid.innerHTML = `
      <div class="kpi-box">
        <div class="kpi-label">Accuracy with skill</div>
        <div class="kpi-value">${skillPct}%</div>
        <div class="kpi-delta">Up ${skillPct - basePct}% from baseline (${basePct}%)</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Quality gain score</div>
        <div class="kpi-value">${rep.normalizedGain.toFixed(2)}</div>
        <div class="kpi-delta">Normalized gain</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Verification status</div>
        <div class="kpi-value">Passed</div>
        <div class="kpi-delta">Avg response ${rep.avgLatencyMsSkill}ms</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Token savings</div>
        <div class="kpi-value">${tokenReduction}%</div>
        <div class="kpi-delta">${rep.avgTokensWithSkill} vs. ${rep.avgTokensBaseline} tokens</div>
      </div>
    `;

    harborTrialsList.innerHTML = (rep.trials || [])
      .map(
        (t) => `
        <div class="ledger-row">
          <div class="ledger-row-header">
            <span class="ledger-row-title">${escapeHtml(t.taskTitle)}</span>
            <span class="status-badge status-pass">Passed (${t.withSkillReward.toFixed(1)})</span>
          </div>
          <div class="ledger-row-sub">${escapeHtml(t.prompt)}</div>
          <div class="ledger-row-sub" style="color: var(--status-fail-ink);">Without skill: ${escapeHtml(t.baselineFailure)}</div>
          <div class="ledger-row-sub" style="color: var(--status-pass-ink);">With skill: ${escapeHtml(t.WithSkillOutput || t.withSkillOutput)}</div>
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
        <div class="cfc-empty-state">
          <div class="empty-state-title">Not published yet</div>
          <p class="empty-state-desc">Tick where you want to publish on the left (Google Cloud Agent Registry is selected by default) and click "Publish selected".</p>
        </div>
      `;
      return;
    }

    publishReceiptsList.innerHTML = history
      .map(
        (r) => `
        <div class="ledger-row">
          <div class="ledger-row-header">
            <span class="ledger-row-title">${escapeHtml(r.target)}</span>
            <span class="status-badge status-pass">${escapeHtml(r.status)}</span>
          </div>
          <div class="ledger-row-sub"><code>${escapeHtml(r.resourceUri)}</code> (${r.bundleSizeKb} KB)</div>
          <pre class="cmd-snippet">$ ${escapeHtml(r.cliCommand)}</pre>
        </div>
      `
      )
      .join('');
  }

  async function saveSkillName() {
    if (!state.currentSession) return;
    const newName = skillNameInput.value.trim();
    if (!newName) {
      skillNameInput.value = state.currentSession.blueprint.displayName || 'Untitled skill';
      return;
    }
    if (newName === state.currentSession.blueprint.displayName) return;

    const res = await fetch(`/api/sessions/${state.currentSession.id}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: newName }),
    });
    const data = await res.json();
    if (data.session) {
      state.currentSession = data.session;
      const idx = state.sessions.findIndex((s) => s.id === data.session.id);
      if (idx !== -1) state.sessions[idx] = data.session;
      renderSessionSelector(state.currentSession.id);
      renderInterviewAndBlueprint();
      saveNameFeedback.classList.add('visible');
      setTimeout(() => saveNameFeedback.classList.remove('visible'), 1800);
    }
  }

  async function attachDataSource(payload) {
    if (!state.currentSession) return;
    const res = await fetch(`/api/sessions/${state.currentSession.id}/grounding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.session) {
      const idx = state.sessions.findIndex((s) => s.id === data.session.id);
      if (idx !== -1) state.sessions[idx] = data.session;
      setCurrentSession(data.session);
    }
  }

  async function importSkillFromUrl(url, providerHint) {
    if (!state.currentSession) return;
    const cleanUrl = (url || '').trim();
    if (!cleanUrl) return;

    if (importSkillUrlBtn) {
      importSkillUrlBtn.disabled = true;
      importSkillUrlBtn.textContent = 'Adapting...';
    }
    blueprintCanvasContent.innerHTML = renderSkeletonLoader(4);

    try {
      const res = await fetch(`/api/sessions/${state.currentSession.id}/import-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: cleanUrl,
          providerHint: providerHint || (importProviderSelect ? importProviderSelect.value : 'auto'),
        }),
      });
      const data = await res.json();
      if (data.session) {
        state.currentSession = data.session;
        const idx = state.sessions.findIndex((s) => s.id === data.session.id);
        if (idx !== -1) state.sessions[idx] = data.session;
        renderSessionSelector(state.currentSession.id);
        setCurrentSession(state.currentSession);
      }
    } finally {
      if (importSkillUrlBtn) {
        importSkillUrlBtn.disabled = false;
        importSkillUrlBtn.textContent = 'Adapt to Gemini';
      }
    }
  }

  async function sendInterviewTurn(messageText, modality) {
    if (!state.currentSession || !messageText.trim()) return;
    const pendingName = skillNameInput.value.trim();
    if (pendingName && pendingName !== state.currentSession.blueprint.displayName) {
      await saveSkillName();
    }

    sendChatBtn.disabled = true;
    blueprintCanvasContent.innerHTML = renderSkeletonLoader(3);
    try {
      const res = await fetch(`/api/sessions/${state.currentSession.id}/interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText.trim(), modality: modality || 'text' }),
      });
      const data = await res.json();
      if (data.session) {
        state.currentSession = data.session;
        const idx = state.sessions.findIndex((s) => s.id === data.session.id);
        if (idx !== -1) state.sessions[idx] = data.session;
        renderSessionSelector(state.currentSession.id);
        setCurrentSession(state.currentSession);
      }
    } finally {
      sendChatBtn.disabled = false;
    }
  }

  async function triggerSandboxRun() {
    if (!state.currentSession) return;
    switchStage('sandbox');
    runSandboxBtn.disabled = true;
    agyEventStream.innerHTML = renderSkeletonLoader(4);
    try {
      const res = await fetch(`/api/sessions/${state.currentSession.id}/sandbox`, { method: 'POST' });
      const data = await res.json();
      if (data.session) {
        const idx = state.sessions.findIndex((s) => s.id === data.session.id);
        if (idx !== -1) state.sessions[idx] = data.session;
        setCurrentSession(data.session);
      }
    } finally {
      runSandboxBtn.disabled = false;
    }
  }

  async function triggerHarborEval() {
    if (!state.currentSession) return;
    switchStage('eval');
    runHarborEvalBtn.disabled = true;
    harborTrialsList.innerHTML = renderSkeletonLoader(3);
    try {
      const res = await fetch(`/api/sessions/${state.currentSession.id}/eval`, { method: 'POST' });
      const data = await res.json();
      if (data.session) {
        const idx = state.sessions.findIndex((s) => s.id === data.session.id);
        if (idx !== -1) state.sessions[idx] = data.session;
        setCurrentSession(data.session);
      }
    } finally {
      runHarborEvalBtn.disabled = false;
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
    voiceWaveformBar.classList.add('hidden');
    if (state.recognition) {
      try {
        state.recognition.stop();
      } catch (_) {}
    }
  }

  function bindEvents() {
    stageTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        switchStage(tab.dataset.stage);
      });
    });

    sessionSelect.addEventListener('change', async (e) => {
      const id = e.target.value;
      const res = await fetch(`/api/sessions/${id}`);
      const sess = await res.json();
      setCurrentSession(sess);
      switchStage('interview');
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

    editSkillNamePencilBtn.addEventListener('click', () => {
      skillNameInput.focus();
      skillNameInput.select();
    });

    skillNameInput.addEventListener('focus', () => {
      if (skillNameInput.value === 'Untitled skill') {
        skillNameInput.select();
      }
    });

    skillNameInput.addEventListener('blur', () => saveSkillName());
    skillNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        skillNameInput.blur();
      }
    });

    document.querySelectorAll('[data-preset]').forEach((chip) => {
      chip.addEventListener('click', async () => {
        await sendInterviewTurn(chip.dataset.preset, 'text');
      });
    });

    // Web URL Skill Importer (Anthropic Claude / OpenAI / GitHub -> Gemini, GE & Antigravity)
    if (importSkillUrlBtn) {
      importSkillUrlBtn.addEventListener('click', () => {
        const url = importSkillUrlInput ? importSkillUrlInput.value : '';
        const provider = importProviderSelect ? importProviderSelect.value : 'auto';
        importSkillFromUrl(url, provider);
      });
    }

    if (importSkillUrlInput) {
      importSkillUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const url = importSkillUrlInput.value;
          const provider = importProviderSelect ? importProviderSelect.value : 'auto';
          importSkillFromUrl(url, provider);
        }
      });
    }

    document.querySelectorAll('[data-import-url]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.importUrl;
        const provider = btn.dataset.importProvider || 'auto';
        if (importSkillUrlInput) importSkillUrlInput.value = url;
        if (importProviderSelect) importProviderSelect.value = provider;
        importSkillFromUrl(url, provider);
      });
    });

    sendChatBtn.addEventListener('click', () => {
      const text = chatInput.value;
      chatInput.value = '';
      sendInterviewTurn(text, 'text');
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
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
      voiceWaveformBar.classList.remove('hidden');

      if (state.recognition) {
        voiceStatusText.textContent = 'Listening... speak your skill requirements';
        state.recognition.start();
      } else {
        voiceStatusText.textContent = 'Listening...';
        setTimeout(() => {
          if (!state.isRecordingVoice) return;
          stopVoiceRecording();
          sendInterviewTurn(
            'Check our daily BigQuery billing export for cost spikes over 2.5 sigma and flag missing cost_center and owner labels.',
            'voice'
          );
        }, 1400);
      }
    });

    // Step progression and prerequisite helper buttons
    document.getElementById('continueToDataBtn').addEventListener('click', () => switchStage('grounding'));
    document.getElementById('skipToSandboxBtn').addEventListener('click', () => triggerSandboxRun());
    document.getElementById('groundingToSandboxBtn').addEventListener('click', () => {
      const hasBlueprint = Boolean(state.currentSession && state.currentSession.blueprint && state.currentSession.blueprint.readinessScore > 0);
      if (hasBlueprint) {
        triggerSandboxRun();
      } else {
        switchStage('sandbox');
      }
    });
    runSandboxBtn.addEventListener('click', () => triggerSandboxRun());
    sandboxToEvalBtn.addEventListener('click', () => triggerHarborEval());
    runHarborEvalBtn.addEventListener('click', () => triggerHarborEval());
    evalToPublishBtn.addEventListener('click', () => switchStage('publish'));

    document.getElementById('sandboxGoToCreateBtn').addEventListener('click', () => switchStage('interview'));
    document.getElementById('evalGoToSandboxBtn').addEventListener('click', () => switchStage('sandbox'));
    document.getElementById('publishGoToEvalBtn').addEventListener('click', () => switchStage('eval'));

    topBarPublishBtn.addEventListener('click', () => {
      if (!topBarPublishBtn.disabled) {
        switchStage('publish');
      }
    });

    // One-click business data source buttons
    document.querySelectorAll('[data-source-type]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = 'Attached';
        try {
          await attachDataSource({
            sourceType: btn.dataset.sourceType,
            name: btn.dataset.sourceName,
            rawSchema: '',
            authnType: 'service_account_adc',
            secretManagerUri: 'projects/finops-prod/secrets/mcp-tool-credential/versions/latest',
            requiredScopes: ['https://www.googleapis.com/auth/cloud-platform', 'mcp:tools:execute'],
            readOnlyEnforced: true,
          });
        } finally {
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = originalText;
          }, 1200);
        }
      });
    });

    const grdSourceTypeEl = document.getElementById('grdSourceType');
    const grdTransportGroupEl = document.getElementById('grdTransportGroup');
    if (grdSourceTypeEl && grdTransportGroupEl) {
      grdSourceTypeEl.addEventListener('change', () => {
        grdTransportGroupEl.classList.toggle('hidden-field', grdSourceTypeEl.value !== 'mcp');
      });
    }

    const fillSampleRestDocBtn = document.getElementById('fillSampleRestDocBtn');
    if (fillSampleRestDocBtn) {
      fillSampleRestDocBtn.addEventListener('click', async () => {
        document.getElementById('grdSourceType').value = 'openapi';
        if (grdTransportGroupEl) grdTransportGroupEl.classList.add('hidden-field');
        document.getElementById('grdName').value = 'erp-procurement-rest-api';
        document.getElementById('grdEndpointUrl').value = 'https://erp-api.enterprise.internal/v1';
        document.getElementById('grdAuthnType').value = 'oauth2_client_credentials';
        document.getElementById('grdSecretUri').value = 'projects/finops-prod/secrets/erp-oauth-client-secret/versions/latest';
        document.getElementById('grdScopes').value = 'erp:invoices:read, erp:po:match';
        document.getElementById('grdReadOnlyEnforced').checked = true;
        document.getElementById('grdSchema').value = [
          '# Internal ERP Procurement REST API Documentation (No public /openapi.json)',
          'GET /v1/purchase-orders?vendor_id=V-104&status=OPEN - List open purchase orders and line tolerances',
          'POST /v1/invoices/three-way-match - Verify PO, Goods Receipt, and Invoice tolerance (2.0% unit price variance)',
          'DELETE /v1/invoices/{invoice_id} - Cancel vendor invoice (Blocked by Read-Only AuthZ Guardrail)',
        ].join('\n');

        await attachDataSource({
          sourceType: 'openapi',
          name: 'erp-procurement-rest-api',
          endpointUrl: 'https://erp-api.enterprise.internal/v1',
          rawSchema: document.getElementById('grdSchema').value,
          authnType: 'oauth2_client_credentials',
          secretManagerUri: 'projects/finops-prod/secrets/erp-oauth-client-secret/versions/latest',
          requiredScopes: ['erp:invoices:read', 'erp:po:match'],
          readOnlyEnforced: true,
        });
        state.selectedGroundingPreview = 'spec';
        renderGroundingStage();
      });
    }

    // Connect custom MCP server, REST API, or dataset form
    groundingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.currentSession) return;
      const sourceType = document.getElementById('grdSourceType').value;
      const name = document.getElementById('grdName').value.trim() || `${sourceType}-enterprise-connector`;
      const endpointUrl = (document.getElementById('grdEndpointUrl') || {}).value || '';
      const mcpTransport = (document.getElementById('grdMcpTransport') || {}).value || 'streamable_http';
      const authnType = (document.getElementById('grdAuthnType') || {}).value || 'service_account_adc';
      const secretManagerUri = (document.getElementById('grdSecretUri') || {}).value || '';
      const scopesRaw = (document.getElementById('grdScopes') || {}).value || '';
      const requiredScopes = scopesRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const readOnlyEnforced = Boolean((document.getElementById('grdReadOnlyEnforced') || {}).checked);
      const rawSchema = document.getElementById('grdSchema').value;

      await attachDataSource({
        sourceType,
        name,
        endpointUrl: endpointUrl.trim(),
        mcpTransport,
        rawSchema,
        authnType,
        secretManagerUri: secretManagerUri.trim(),
        requiredScopes,
        readOnlyEnforced,
      });
      document.getElementById('grdName').value = '';
      document.getElementById('grdSchema').value = '';
    });

    if (groundingPreviewTabs) {
      groundingPreviewTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.file-tab');
        if (!btn || !btn.dataset.gpreview) return;
        state.selectedGroundingPreview = btn.dataset.gpreview;
        renderGroundingStage();
      });
    }

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

    pubCheckGeminiEnterprise.addEventListener('change', () => {
      geAppIdFieldGroup.classList.toggle('hidden-field', !pubCheckGeminiEnterprise.checked);
    });

    publishForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.currentSession || publishFormFieldset.disabled) return;
      const checkedBoxes = Array.from(document.querySelectorAll('input[name="pubTargets"]:checked'));
      const targets = checkedBoxes.map((cb) => cb.value);
      if (targets.length === 0) {
        targets.push('agent_registry');
        document.getElementById('pubCheckAgentRegistry').checked = true;
      }

      const projectId = document.getElementById('pubProjectId').value;
      const versionTag = document.getElementById('pubVersion').value;
      const discoveryEngineApp = document.getElementById('pubGeAppId').value;

      const res = await fetch(`/api/sessions/${state.currentSession.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets, projectId, location: 'global', versionTag, discoveryEngineApp }),
      });
      const data = await res.json();
      if (data.session) {
        const idx = state.sessions.findIndex((s) => s.id === data.session.id);
        if (idx !== -1) state.sessions[idx] = data.session;
        setCurrentSession(data.session);
        if (targets.includes('zip_bundle')) {
          window.location.href = `/api/sessions/${state.currentSession.id}/download`;
        }
      }
    });
  }

  init();
})();
