// Enterprise Skill Builder Interactive Frontend Studio
(function () {
  const state = {
    sessions: [],
    currentSession: null,
    activeStage: 'interview',
    selectedBundleFile: 'SKILL.md',
    selectedHarborFile: 'harbor_task/task.toml',
    isRecordingVoice: false,
    recognition: null,
  };

  // DOM References
  const sessionSelect = document.getElementById('sessionSelect');
  const newSessionBtn = document.getElementById('newSessionBtn');
  const iapEmailText = document.getElementById('iapEmailText');
  const stageTabs = document.querySelectorAll('.stage-tab');
  const stagePanels = document.querySelectorAll('.stage-panel');

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
        iapEmailText.textContent = `${data.identity.email} (${data.identity.iapVerified ? 'IAP Verified' : 'ADC Dev'})`;
      }
      if (data.projectId) {
        const projInput = document.getElementById('pubProjectId');
        if (projInput) projInput.value = data.projectId;
      }
    } catch (err) {
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
      opt.textContent = `${sess.blueprint.displayName || sess.blueprint.name} (${sess.blueprint.readinessScore}%)`;
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
      .replace(/`([^`]+)`/g, '<code class="bp-mono">$1</code>')
      .replace(/\n/g, '<br/>');
  }

  function renderInterviewAndBlueprint() {
    const sess = state.currentSession;
    if (!sess) return;

    // Render Transcript
    chatTranscript.innerHTML = (sess.messages || [])
      .map((m) => {
        const roleLabel = m.role === 'user' ? 'Customer Engineer / SME' : 'Gemini 3.6 Flash Skill Architect';
        const modeBadge = m.modality === 'voice' ? '[VOICE]' : '[TEXT]';
        return `
          <div class="chat-bubble ${escapeHtml(m.role)}">
            <div class="bubble-meta">
              <span>${escapeHtml(roleLabel)}</span>
              <span>${escapeHtml(modeBadge)}</span>
            </div>
            <div>${formatSimpleMarkdown(m.content)}</div>
          </div>
        `;
      })
      .join('');
    chatTranscript.scrollTop = chatTranscript.scrollHeight;

    // Render Blueprint Canvas
    const bp = sess.blueprint || {};
    const score = bp.readinessScore || 0;
    bpReadinessBadge.textContent = `${score}%`;
    bpProgressBar.style.width = `${score}%`;

    const platforms = (bp.targetPlatforms || []).map((p) => `<span class="badge badge-neutral">${escapeHtml(p)}</span>`).join(' ');
    const useWhen = (bp.useWhenTriggers || []).map((t) => `<li>${escapeHtml(t)}</li>`).join('') || '<li>Speak or type to populate positive triggers...</li>';
    const doNotUse = (bp.doNotUseTriggers || []).map((t) => `<li>${escapeHtml(t)}</li>`).join('') || '<li>Speak or type to populate negative scope boundaries...</li>';
    const params = (bp.inputParameters || [])
      .map((p) => `<li><code class="bp-mono">${escapeHtml(p.flag)}</code> (${escapeHtml(p.type)}, ${p.required ? 'required' : 'optional'}): ${escapeHtml(p.description)}</li>`)
      .join('') || '<li>No CLI parameters defined yet.</li>';
    const scripts = (bp.scripts || [])
      .map((s) => `<li><code class="bp-mono">${escapeHtml(s.filename)}</code>: ${escapeHtml(s.purpose)}<br/><span class="stage-meta">Output Contract: ${escapeHtml(s.outputContract)}</span></li>`)
      .join('') || '<li>Pending script synthesis...</li>';
    const guardrails = (bp.guardrailsGotchas || []).map((g) => `<li>${escapeHtml(g)}</li>`).join('') || '<li>Air-gapped Python 3.11 frozen GE sandbox baseline.</li>';

    blueprintCanvasContent.innerHTML = `
      <div class="bp-section">
        <div class="bp-section-title">Skill Slug &amp; Target Runtimes</div>
        <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">
          <code class="bp-mono">${escapeHtml(bp.name)}</code> - ${escapeHtml(bp.displayName)}
        </div>
        <div style="font-size: 12.5px; color: var(--text-secondary); margin-bottom: 8px;">${escapeHtml(bp.summary)}</div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">${platforms}</div>
      </div>

      <div class="bp-section">
        <div class="bp-section-title">Routing Triggers (&lt;use_when&gt; / &lt;do_not_use_for&gt;)</div>
        <div style="font-size: 12px; font-weight: 600; color: var(--emerald-text); margin-bottom: 3px;">USE WHEN:</div>
        <ul class="bp-list" style="margin-bottom: 8px;">${useWhen}</ul>
        <div style="font-size: 12px; font-weight: 600; color: var(--danger-text); margin-bottom: 3px;">DO NOT USE FOR:</div>
        <ul class="bp-list">${doNotUse}</ul>
      </div>

      <div class="bp-section">
        <div class="bp-section-title">Deterministic Python 3.11 Scripts &amp; CLI Flags</div>
        <ul class="bp-list" style="margin-bottom: 8px;">${scripts}</ul>
        <ul class="bp-list">${params}</ul>
      </div>

      <div class="bp-section">
        <div class="bp-section-title">Operational Guardrails &amp; Gotchas</div>
        <ul class="bp-list">${guardrails}</ul>
      </div>
    `;
  }

  function renderGroundingStage() {
    const sess = state.currentSession;
    if (!sess) return;
    const assets = sess.groundingAssets || [];

    if (assets.length === 0) {
      groundingAssetsList.innerHTML = `<div class="asset-card">No grounding schemas attached yet. Add a BigQuery table, OpenAPI spec, or MCP server above.</div>`;
      fixturePreviewCode.textContent = '// Attach a grounding source to synthesize tests/fixtures/mock_payload.json';
      return;
    }

    groundingAssetsList.innerHTML = assets
      .map(
        (a) => `
        <div class="asset-card">
          <div class="card-top-row">
            <strong class="bp-mono">${escapeHtml(a.name)}</strong>
            <span class="badge badge-blue">${escapeHtml(a.sourceType.toUpperCase())}</span>
          </div>
          <div style="color: var(--text-secondary); margin-bottom: 6px;">${escapeHtml(a.summary)}</div>
          <pre class="event-cmd">${escapeHtml(a.rawSchemaSnippet)}</pre>
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
      agyEventStream.innerHTML = `<div class="asset-card">Click "Re-Run AGY Sandbox Build &amp; Self-Heal" to launch the headless Antigravity CLI inside the Python 3.11 sandbox.</div>`;
    } else {
      agyEventStream.innerHTML = events
        .map(
          (ev) => `
          <div class="event-item ${escapeHtml(ev.type)}">
            <div class="card-top-row">
              <strong>Step ${ev.step}: ${escapeHtml(ev.title)}</strong>
              <span class="badge badge-neutral">${escapeHtml(ev.type.toUpperCase())} (${escapeHtml(ev.duration || '0ms')})</span>
            </div>
            <div style="color: var(--text-secondary);">${escapeHtml(ev.detail)}</div>
            ${ev.command ? `<pre class="event-cmd">$ ${escapeHtml(ev.command)}</pre>` : ''}
          </div>
        `
        )
        .join('');
    }

    const sec = sess.securityReport;
    if (sec && sec.checks) {
      securityChecksList.innerHTML = sec.checks
        .map((c) => {
          const badgeClass = c.status === 'PASS' ? 'badge-green' : c.status === 'HEALED' ? 'badge-amber' : 'badge-neutral';
          return `
            <div class="security-card">
              <div class="card-top-row">
                <strong>[${escapeHtml(c.id)}] ${escapeHtml(c.category)}</strong>
                <span class="badge ${badgeClass}">${escapeHtml(c.status)}</span>
              </div>
              <div style="color: var(--text-secondary);">${escapeHtml(c.detail)}</div>
            </div>
          `;
        })
        .join('');
    } else {
      securityChecksList.innerHTML = `<div class="security-card">Pending sandbox execution...</div>`;
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
          <button type="button" class="file-tab-btn ${k === state.selectedBundleFile ? 'active' : ''}" data-file="${escapeHtml(k)}">
            ${escapeHtml(k)}
          </button>
        `
        )
        .join('');
      fileViewerContent.textContent = files[state.selectedBundleFile] || '';
    } else {
      fileTabsBar.innerHTML = '';
      fileViewerContent.textContent = '// Run the sandbox build to view SKILL.md and Python 3.11 scripts';
    }
  }

  function renderEvalStage() {
    const sess = state.currentSession;
    if (!sess) return;
    const rep = sess.harborReport;

    if (!rep) {
      evalKpiGrid.innerHTML = `
        <div class="kpi-card">
          <div class="kpi-label">SkillsBench Status</div>
          <div class="kpi-value">Pending</div>
          <div class="kpi-sub">Click "Run Paired SkillsBench + Harbor Suite" above</div>
        </div>
      `;
      harborTrialsList.innerHTML = '';
      harborFileTabs.innerHTML = '';
      harborFileViewer.textContent = '// Run SkillsBench + Harbor evaluation to generate task.toml, solve.sh, and test_outputs.py';
      return;
    }

    const basePct = Math.round((rep.baselinePassRate || 0) * 100);
    const skillPct = Math.round((rep.withSkillPassRate || 0) * 100);
    const gainPct = Math.round((rep.normalizedGain || 0) * 100);
    const tokenReduction = Math.round(((rep.avgTokensBaseline - rep.avgTokensWithSkill) / rep.avgTokensBaseline) * 100);

    evalKpiGrid.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">With-Skill Pass Rate (Harbor)</div>
        <div class="kpi-value">${skillPct}%</div>
        <div class="kpi-sub">+${skillPct - basePct}% lift over No-Skill Baseline (${basePct}%)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">SkillsBench Normalized Gain (g)</div>
        <div class="kpi-value">${rep.normalizedGain.toFixed(2)}</div>
        <div class="kpi-sub">${gainPct}% of possible error ceiling eliminated</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Verifier Reward (/logs/verifier/reward.txt)</div>
        <div class="kpi-value">${escapeHtml(rep.rewardTxtValue)}</div>
        <div class="kpi-sub">Oracle Solution Verified (${rep.avgLatencyMsSkill}ms avg)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Token Consumption Efficiency</div>
        <div class="kpi-value">-${tokenReduction}%</div>
        <div class="kpi-sub">${rep.avgTokensWithSkill} tokens vs. ${rep.avgTokensBaseline} baseline</div>
      </div>
    `;

    harborTrialsList.innerHTML = (rep.trials || [])
      .map(
        (t) => `
        <div class="trial-card">
          <div class="card-top-row">
            <strong>[${escapeHtml(t.taskId)}] ${escapeHtml(t.taskTitle)}</strong>
            <span class="badge badge-green">Baseline: ${t.baselineReward.toFixed(1)} | With-Skill: ${t.withSkillReward.toFixed(1)}</span>
          </div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">Prompt: ${escapeHtml(t.prompt)}</div>
          <div style="font-size: 12px; color: var(--danger-text); margin-bottom: 4px;"><strong>No-Skill Failure:</strong> ${escapeHtml(t.baselineFailure)}</div>
          <div style="font-size: 12px; color: var(--emerald-text);"><strong>With-Skill Deterministic Result:</strong> ${escapeHtml(t.WithSkillOutput || t.withSkillOutput)}</div>
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
          <button type="button" class="file-tab-btn ${k === state.selectedHarborFile ? 'active' : ''}" data-hfile="${escapeHtml(k)}">
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
      publishReceiptsList.innerHTML = `<div class="receipt-card">Click "Register &amp; Mount Skill Now" above to publish this skill to the Agent Platform Skill Registry and Gemini Enterprise Spark / Sobi.</div>`;
      return;
    }

    publishReceiptsList.innerHTML = history
      .map(
        (r) => `
        <div class="receipt-card">
          <div class="card-top-row">
            <strong>${escapeHtml(r.target)}</strong>
            <span class="badge badge-green">${escapeHtml(r.status)}</span>
          </div>
          <div class="bp-mono" style="font-size: 11.5px; color: var(--text-secondary); margin-bottom: 4px;">
            URI: ${escapeHtml(r.resourceUri)} | SHA256: ${escapeHtml(r.sha256Digest.slice(0, 16))}... (${r.bundleSizeKb} KB)
          </div>
          <pre class="event-cmd">$ ${escapeHtml(r.cliCommand)}</pre>
        </div>
      `
      )
      .join('');
  }

  async function sendInterviewTurn(messageText, modality) {
    if (!state.currentSession || !messageText.trim()) return;
    sendChatBtn.disabled = true;
    sendChatBtn.textContent = 'Architect Thinking...';
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
      sendChatBtn.textContent = 'Send Turn';
    }
  }

  async function triggerSandboxRun() {
    if (!state.currentSession) return;
    switchStage('sandbox');
    const runBtn = document.getElementById('runSandboxBtn');
    runBtn.disabled = true;
    runBtn.textContent = 'Running Headless AGY in Sandbox...';
    try {
      const res = await fetch(`/api/sessions/${state.currentSession.id}/sandbox`, { method: 'POST' });
      const data = await res.json();
      if (data.session) {
        setCurrentSession(data.session);
      }
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = 'Re-Run AGY Sandbox Build & Self-Heal';
    }
  }

  async function triggerHarborEval() {
    if (!state.currentSession) return;
    switchStage('eval');
    const evalBtn = document.getElementById('runHarborEvalBtn');
    evalBtn.disabled = true;
    evalBtn.textContent = 'Executing Harbor Paired Trials...';
    try {
      const res = await fetch(`/api/sessions/${state.currentSession.id}/eval`, { method: 'POST' });
      const data = await res.json();
      if (data.session) {
        setCurrentSession(data.session);
      }
    } finally {
      evalBtn.disabled = false;
      evalBtn.textContent = 'Run Paired SkillsBench + Harbor Suite';
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

    rec.onerror = () => {
      stopVoiceRecording();
    };

    rec.onend = () => {
      if (state.isRecordingVoice) {
        stopVoiceRecording();
      }
    };

    state.recognition = rec;
  }

  function stopVoiceRecording() {
    state.isRecordingVoice = false;
    voiceToggleBtn.classList.remove('recording');
    voiceBtnLabel.textContent = 'Voice Interview';
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

    document.querySelectorAll('.chip-btn').forEach((chip) => {
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
        voiceStatusText.textContent = 'Simulating Live Voice Utterance (Gemini 3.6 Flash Live Stream)...';
        setTimeout(() => {
          if (!state.isRecordingVoice) return;
          stopVoiceRecording();
          sendInterviewTurn(
            'Enforce a strict 2.5 sigma anomaly threshold, $250 minimum daily delta, and verify cost_center and owner governance labels on every record.',
            'voice'
          );
        }, 1800);
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
      const btn = e.target.closest('.file-tab-btn');
      if (!btn) return;
      state.selectedBundleFile = btn.dataset.file;
      renderSandboxStage();
    });

    harborFileTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.file-tab-btn');
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
