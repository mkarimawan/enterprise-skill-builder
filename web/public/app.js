// Skill Builder Frontend Client (Pantheon Left-Nav + Progressive Disclosure)
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
  const activePageHeading = document.getElementById('activePageHeading');
  const stageTabs = document.querySelectorAll('.cfc-nav-item');
  const stagePanels = document.querySelectorAll('.stage-view');

  const chatTranscript = document.getElementById('chatTranscript');
  const chatInput = document.getElementById('chatInput');
  const sendChatBtn = document.getElementById('sendChatBtn');
  const voiceToggleBtn = document.getElementById('voiceToggleBtn');
  const voiceWaveformBar = document.getElementById('voiceWaveformBar');
  const voiceStatusText = document.getElementById('voiceStatusText');

  const bpReadinessBadge = document.getElementById('bpReadinessBadge');
  const blueprintCanvasContent = document.getElementById('blueprintCanvasContent');

  const groundingForm = document.getElementById('groundingForm');
  const groundingAssetsList = document.getElementById('groundingAssetsList');
  const fixturePreviewCode = document.getElementById('fixturePreviewCode');

  const agyEventStream = document.getElementById('agyEventStream');
  const securityChecksList = document.getElementById('securityChecksList');
  const fileTabsBar = document.getElementById('fileTabsBar');
  const fileViewerContent = document.getElementById('fileViewerContent');
  const downloadBundleBtnSandbox = document.getElementById('downloadBundleBtnSandbox');
  const navDownloadZipLink = document.getElementById('navDownloadZipLink');

  const evalKpiGrid = document.getElementById('evalKpiGrid');
  const harborTrialsList = document.getElementById('harborTrialsList');
  const harborFileTabs = document.getElementById('harborFileTabs');
  const harborFileViewer = document.getElementById('harborFileViewer');

  const publishForm = document.getElementById('publishForm');
  const publishReceiptsList = document.getElementById('publishReceiptsList');
  const downloadZipDirectBtn = document.getElementById('downloadZipDirectBtn');

  const openDrawerBtn = document.getElementById('openDrawerBtn');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const referenceDrawer = document.getElementById('referenceDrawer');
  const drawerContentArea = document.getElementById('drawerContentArea');

  const drawerContentMap = {
    terraform: `
      <div class="ledger-section" style="padding: 0 0 14px 0;">
        <div class="ledger-label">Admin prerequisites</div>
        <p class="ledger-row-sub" style="margin-bottom: 8px;">
          To deploy this portal into a Google Cloud project with Terraform, the administrator needs:
        </p>
        <ul class="ledger-items">
          <li><code>roles/editor</code> (Project Editor)</li>
          <li><code>roles/resourcemanager.projectIamAdmin</code> and <code>roles/iap.admin</code></li>
        </ul>
      </div>
      <div class="ledger-section" style="padding: 14px 0 0 0;">
        <div class="ledger-label">Deploy with Terraform</div>
        <pre class="code-viewer" style="max-height: 320px;">git clone https://github.com/mkarimawan/enterprise-skill-builder.git
cd enterprise-skill-builder

cat &lt;&lt;EOF &gt; terraform/terraform.tfvars
project_id = "your-gcp-project-id"
region     = "us-central1"
enable_iap = true

iap_allowed_members = [
  "user:admin@yourcompany.com"
]
EOF

terraform -chdir=terraform init
terraform -chdir=terraform plan
terraform -chdir=terraform apply</pre>
      </div>
    `,
    runtime: `
      <div class="ledger-section" style="padding: 0;">
        <div class="ledger-label">Sandbox Python 3.11 environment</div>
        <p class="ledger-row-sub" style="margin-bottom: 10px;">
          Skills are tested inside an isolated Cloud Run Gen2 sandbox matching the Gemini Enterprise Python 3.11 package baseline (<code>runtime/ge_frozen_requirements.txt</code>).
        </p>
        <pre class="code-viewer" style="max-height: 320px;">numpy==1.26.4
pandas==2.2.2
pydantic==2.8.2
pyarrow==16.1.0
scikit-learn==1.5.1
scipy==1.14.0
openpyxl==3.1.5
pypdf==4.3.0
python-docx==1.1.2
python-pptx==0.6.23
reportlab==4.2.2
tabulate==0.9.0
pyyaml==6.0.1</pre>
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

    renderInterviewAndBlueprint();
    renderGroundingStage();
    renderSandboxStage();
    renderEvalStage();
    renderPublishStage();
  }

  function switchStage(stageName) {
    state.activeStage = stageName;
    activePageHeading.textContent = stageTitles[stageName] || 'Skill Builder';
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
    const hasBlueprint = Boolean(bp.name && bp.readinessScore > 0);

    if (!hasBlueprint) {
      bpReadinessBadge.textContent = 'Empty';
      bpReadinessBadge.className = 'status-badge status-neutral tabular-nums';
      blueprintCanvasContent.innerHTML = `
        <div class="cfc-empty-state">
          <div class="empty-state-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
          </div>
          <div class="empty-state-title">No skill blueprint yet</div>
          <p class="empty-state-desc">Describe what you want your skill to do on the left, or pick a sample prompt below the text box.</p>
        </div>
      `;
      return;
    }

    bpReadinessBadge.textContent = `${bp.readinessScore}% ready`;
    bpReadinessBadge.className = 'status-badge status-pass tabular-nums';

    const useWhen = (bp.useWhenTriggers || []).map((t) => `<li>${escapeHtml(t)}</li>`).join('');
    const params = (bp.inputParameters || [])
      .map((p) => `<li><code>${escapeHtml(p.flag)}</code>: ${escapeHtml(p.description)}</li>`)
      .join('');
    const guardrails = (bp.guardrailsGotchas || []).map((g) => `<li>${escapeHtml(g)}</li>`).join('');

    blueprintCanvasContent.innerHTML = `
      <div class="ledger-section">
        <div class="ledger-label">Skill name</div>
        <div style="font-weight: 600; font-size: 14px;"><code>${escapeHtml(bp.name)}</code></div>
        <p class="ledger-row-sub" style="margin-top: 4px;">${escapeHtml(bp.summary)}</p>
      </div>

      <div class="ledger-section">
        <div class="ledger-label">When to use</div>
        <ul class="ledger-items">${useWhen}</ul>
      </div>

      <div class="ledger-section">
        <div class="ledger-label">Inputs</div>
        <ul class="ledger-items">${params}</ul>
      </div>

      <div class="ledger-section">
        <div class="ledger-label">Guardrails</div>
        <ul class="ledger-items">${guardrails}</ul>
      </div>
    `;
  }

  function renderGroundingStage() {
    const sess = state.currentSession;
    if (!sess) return;
    const assets = sess.groundingAssets || [];

    if (assets.length === 0) {
      groundingAssetsList.innerHTML = `
        <div class="cfc-empty-state">
          <div class="empty-state-title">No data sources attached</div>
          <p class="empty-state-desc">Attach a table schema or API specification above to generate test data.</p>
        </div>
      `;
      fixturePreviewCode.textContent = '// Attach a data source on the left to preview generated test data';
      return;
    }

    groundingAssetsList.innerHTML = assets
      .map(
        (a) => `
        <div class="ledger-row">
          <div class="ledger-row-header">
            <span class="ledger-row-title"><code>${escapeHtml(a.name)}</code></span>
            <span class="status-badge status-neutral">${escapeHtml(a.sourceType)}</span>
          </div>
          <div class="ledger-row-sub">${escapeHtml(a.summary)}</div>
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
        <div class="cfc-empty-state">
          <div class="empty-state-title">Sandbox not run yet</div>
          <p class="empty-state-desc">Click "Run test" to build the skill files and test them in the isolated Python 3.11 sandbox.</p>
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
          <p class="empty-state-desc">Click "Run evaluation" to compare accuracy with and without the skill.</p>
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
        <div class="kpi-label">Pass rate with skill</div>
        <div class="kpi-value">${skillPct}%</div>
        <div class="kpi-delta">+${skillPct - basePct}% vs. baseline (${basePct}%)</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Normalized gain</div>
        <div class="kpi-value">${rep.normalizedGain.toFixed(2)}</div>
        <div class="kpi-delta">SkillsBench score</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Verifier reward</div>
        <div class="kpi-value">${escapeHtml(rep.rewardTxtValue)}</div>
        <div class="kpi-delta">Avg latency ${rep.avgLatencyMsSkill}ms</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Token reduction</div>
        <div class="kpi-value">-${tokenReduction}%</div>
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
          <p class="empty-state-desc">Choose a destination on the left and click "Publish skill" to register or download the bundle.</p>
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
          <div class="ledger-row-sub tabular-nums"><code>${escapeHtml(r.resourceUri)}</code> (${r.bundleSizeKb} KB)</div>
          <pre class="cmd-snippet">$ ${escapeHtml(r.cliCommand)}</pre>
        </div>
      `
      )
      .join('');
  }

  async function sendInterviewTurn(messageText, modality) {
    if (!state.currentSession || !messageText.trim()) return;
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
    agyEventStream.innerHTML = renderSkeletonLoader(4);
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
    harborTrialsList.innerHTML = renderSkeletonLoader(3);
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

    document.querySelectorAll('.sample-chip').forEach((chip) => {
      chip.addEventListener('click', async () => {
        await sendInterviewTurn(chip.dataset.preset, 'text');
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
