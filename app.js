(function () {
  "use strict";

  const STORAGE_KEY = "drone-exam-state";
  const STORAGE_VERSION = 1;
  const SESSION_SIZE = 40;
  const PASS_RATE = 0.8;
  const DISPLAY_LETTERS = ["A", "B", "C", "D"];

  const app = document.getElementById("app");
  const dialogRoot = document.getElementById("dialog-root");
  const toast = document.getElementById("toast");
  const questions = Array.isArray(window.QUESTION_BANK) ? window.QUESTION_BANK : [];
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const chapters = [...new Set(questions.map((question) => question.chapter))];

  let state = loadState();
  let currentView = "home";
  let lastResult = null;
  let toastTimer = null;

  document.getElementById("footer-count").textContent = String(questions.length);

  function defaultState() {
    return {
      version: STORAGE_VERSION,
      progress: {},
      examHistory: [],
      activeSession: null
    };
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!parsed || parsed.version !== STORAGE_VERSION) return defaultState();
      const savedSession = parsed.activeSession;
      const savedPoolSize = savedSession?.mode === "practice"
        ? questions.filter((question) => savedSession.selectedChapters?.includes(question.chapter)).length
        : questions.length;
      const activeSession = savedSession
        && Array.isArray(savedSession.questionIds)
        && savedSession.questionIds.length === Math.min(SESSION_SIZE, savedPoolSize)
        ? savedSession
        : null;
      return {
        ...defaultState(),
        ...parsed,
        progress: parsed.progress || {},
        examHistory: Array.isArray(parsed.examHistory) ? parsed.examHistory : [],
        activeSession
      };
    } catch (error) {
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      showToast("無法儲存進度，請確認瀏覽器允許本機儲存。", 4200);
    }
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[target]] = [copy[target], copy[index]];
    }
    return copy;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function percent(value, total) {
    return total ? Math.round((value / total) * 100) : 0;
  }

  function getProgress(id) {
    return state.progress[id] || { attempts: 0, correct: 0, wrong: 0, lastCorrect: null };
  }

  function recordAttempt(id, isCorrect) {
    const previous = getProgress(id);
    state.progress[id] = {
      attempts: previous.attempts + 1,
      correct: previous.correct + (isCorrect ? 1 : 0),
      wrong: previous.wrong + (isCorrect ? 0 : 1),
      lastCorrect: isCorrect,
      lastAnsweredAt: new Date().toISOString()
    };
  }

  function createSession(mode, pool, selectedChapters) {
    let selected;
    if (mode === "practice") {
      const wrong = shuffle(pool.filter((q) => getProgress(q.id).attempts > 0 && getProgress(q.id).lastCorrect === false));
      const unseen = shuffle(pool.filter((q) => getProgress(q.id).attempts === 0));
      const mastered = shuffle(pool.filter((q) => getProgress(q.id).attempts > 0 && getProgress(q.id).lastCorrect === true));
      selected = [...wrong, ...unseen, ...mastered].slice(0, SESSION_SIZE);
    } else {
      selected = shuffle(pool).slice(0, SESSION_SIZE);
    }

    const optionOrder = {};
    selected.forEach((question) => {
      optionOrder[question.id] = shuffle(Object.keys(question.options));
    });

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      mode,
      status: "active",
      startedAt: new Date().toISOString(),
      questionIds: selected.map((question) => question.id),
      selectedChapters: selectedChapters || chapters,
      optionOrder,
      currentIndex: 0,
      answers: {},
      initialMastered: mode === "practice"
        ? selected.filter((question) => getProgress(question.id).lastCorrect === true).map((question) => question.id)
        : []
    };
  }

  function goTo(view) {
    currentView = view;
    closeDialog();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    app.focus({ preventScroll: true });
  }

  function render() {
    document.body.dataset.view = currentView;
    if (!questions.length) {
      app.innerHTML = `<section class="panel"><h1>題庫載入失敗</h1><p class="lead">請確認 questions.js 與 index.html 放在同一個資料夾後再重新開啟。</p></section>`;
      return;
    }

    if (currentView === "home") renderHome();
    if (currentView === "practice-setup") renderPracticeSetup();
    if (currentView === "session") renderSession();
    if (currentView === "result") renderResult();
    if (currentView === "dashboard") renderDashboard();
  }

  function renderHome() {
    const session = state.activeSession;
    const answered = questions.filter((question) => getProgress(question.id).attempts > 0).length;
    app.innerHTML = `
      <section class="hero">
        <div class="hero-row">
          <div>
            <p class="eyebrow">Remote Pilot Prep</p>
            <h1>每答一題，<br>離起飛更近一點。</h1>
            <p class="lead">從 ${questions.length} 道無人機學科題中反覆練習、消化錯題，或直接挑戰一場 40 題正式抽考。</p>
          </div>
          <div class="hero-badge" aria-label="已接觸 ${answered} 題">
            <div><strong>${answered}</strong><span>題已接觸</span></div>
          </div>
        </div>
      </section>
      ${session ? `
        <section class="resume-banner" aria-label="未完成的回合">
          <div>
            <strong>你有一場${session.mode === "practice" ? "練習" : "正式抽考"}還沒完成</strong>
            <span>目前第 ${session.currentIndex + 1} 題，共 ${session.questionIds.length} 題</span>
          </div>
          <div class="button-row">
            <button class="btn btn-light" type="button" data-action="resume">繼續作答</button>
            <button class="btn btn-ghost-light" type="button" data-action="abandon">放棄回合</button>
          </div>
        </section>` : ""}
      <section class="mode-grid" aria-label="選擇模式">
        <button class="mode-card practice" type="button" data-action="practice-setup">
          <span class="card-icon" aria-hidden="true">✓</span>
          <h2>練習模式</h2>
          <p>即時看答案，錯題會優先回到下一輪，逐步把題庫練熟。</p>
        </button>
        <button class="mode-card exam" type="button" data-action="start-exam">
          <span class="card-icon" aria-hidden="true">40</span>
          <h2>正式抽考</h2>
          <p>全題庫隨機抽題，交卷後統一公布成績與完整檢討。</p>
        </button>
        <button class="mode-card dashboard" type="button" data-action="dashboard">
          <span class="card-icon" aria-hidden="true">↗</span>
          <h2>學習進度</h2>
          <p>掌握率、待複習錯題、章節狀態與歷次抽考成績一次看。</p>
        </button>
      </section>`;
  }

  function renderPracticeSetup() {
    app.innerHTML = `
      <section class="setup-layout">
        <button class="back-link" type="button" data-action="home">← 回首頁</button>
        <div class="panel">
          <p class="eyebrow">Practice Mode</p>
          <h1 style="font-size:clamp(34px,6vw,58px)">選擇練習範圍</h1>
          <p class="lead">每回合最多 40 題。待複習錯題會優先出現，接著是還沒作答過的題目。</p>
          <div class="chapter-list">
            ${chapters.map((chapter) => {
              const count = questions.filter((question) => question.chapter === chapter).length;
              return `<label class="chapter-check">
                <input type="checkbox" name="chapter" value="${escapeHtml(chapter)}" checked>
                <span>${escapeHtml(chapter)}</span><small>${count} 題</small>
              </label>`;
            }).join("")}
          </div>
          <div class="button-row">
            <button class="btn btn-secondary" type="button" data-action="toggle-chapters">取消全選</button>
            <button class="btn btn-primary" type="button" data-action="start-practice">開始 40 題練習</button>
          </div>
        </div>
      </section>`;
  }

  function renderSession() {
    const session = state.activeSession;
    if (!session || !session.questionIds.length) {
      goTo("home");
      return;
    }

    const question = questionById.get(session.questionIds[session.currentIndex]);
    if (!question) {
      state.activeSession = null;
      saveState();
      showToast("這個回合的題目已失效，請重新開始。", 4000);
      goTo("home");
      return;
    }

    const order = session.optionOrder[question.id];
    const answer = session.answers[question.id];
    const isPractice = session.mode === "practice";
    const isAnswered = Boolean(answer);
    const correct = answer === question.answer;
    const questionLength = [...question.text].length;
    const longestOption = Math.max(...Object.values(question.options).map((option) => [...option].length));
    const density = questionLength > 105 || longestOption > 55
      ? "compact"
      : questionLength > 65 || longestOption > 38
        ? "cozy"
        : "standard";
    const progressWidth = ((session.currentIndex + (isAnswered ? 1 : 0)) / session.questionIds.length) * 100;

    app.innerHTML = `
      <section class="quiz-wrap">
        <div class="quiz-head">
          <div class="quiz-meta">
            <span class="pill">${isPractice ? "練習模式" : "正式抽考"}</span>
            <span class="question-count">第 ${session.currentIndex + 1} / ${session.questionIds.length} 題</span>
          </div>
          <button class="btn btn-secondary" type="button" data-action="exit-session">暫停並回首頁</button>
          <div class="progress-track" aria-label="作答進度"><div class="progress-fill" style="width:${progressWidth}%"></div></div>
        </div>
        <article class="question-card density-${density}">
          <div class="question-chapter">${escapeHtml(question.chapter)} · 第 ${escapeHtml(question.number)} 題</div>
          <h1>${escapeHtml(question.text)}</h1>
          <div class="answer-grid" role="group" aria-label="答案選項">
            ${order.map((originalKey, index) => {
              let className = "answer";
              if (!isPractice && answer === originalKey) className += " selected";
              if (isPractice && isAnswered) {
                if (originalKey === question.answer) className += " correct";
                else if (originalKey === answer) className += " wrong";
                else className += " dimmed";
              }
              return `<button class="${className}" type="button" data-action="answer" data-key="${originalKey}" ${isPractice && isAnswered ? "disabled" : ""} aria-pressed="${answer === originalKey}">
                <span class="answer-letter">${DISPLAY_LETTERS[index]}</span>
                <span>${escapeHtml(question.options[originalKey])}</span>
              </button>`;
            }).join("")}
          </div>
          ${isPractice && isAnswered ? renderFeedback(question, answer, correct, order) : ""}
          ${!isPractice ? renderExamControls(session) : ""}
        </article>
      </section>`;
  }

  function renderFeedback(question, answer, correct, order) {
    const correctIndex = order.indexOf(question.answer);
    return `<div class="feedback ${correct ? "correct" : "wrong"}" role="status">
      <div>
        <strong>${correct ? "答對了！" : "再記一次，就會了。"}</strong>
        <p>${correct ? "判斷正確，繼續保持。" : `正確答案是 ${DISPLAY_LETTERS[correctIndex]}：${escapeHtml(question.options[question.answer])}`}</p>
      </div>
      <button class="btn ${correct ? "btn-primary" : "btn-danger"}" type="button" data-action="practice-next">${state.activeSession.currentIndex === state.activeSession.questionIds.length - 1 ? "看結果" : "下一題"}</button>
    </div>`;
  }

  function renderExamControls(session) {
    return `
      <div class="exam-toolbar">
        <button class="btn btn-secondary" type="button" data-action="exam-prev" ${session.currentIndex === 0 ? "disabled" : ""}>← 上一題</button>
        <span class="question-count">已答 ${Object.keys(session.answers).length} / ${session.questionIds.length}</span>
        ${session.currentIndex === session.questionIds.length - 1
          ? `<button class="btn btn-primary" type="button" data-action="submit-exam">交卷</button>`
          : `<button class="btn btn-primary" type="button" data-action="exam-next">下一題 →</button>`}
      </div>
      <div class="number-grid" aria-label="題號導覽">
        ${session.questionIds.map((id, index) => `<button type="button" data-action="jump-question" data-index="${index}" class="${session.answers[id] ? "answered" : ""} ${index === session.currentIndex ? "current" : ""}" aria-label="前往第 ${index + 1} 題">${index + 1}</button>`).join("")}
      </div>`;
  }

  function startPractice() {
    const selected = [...document.querySelectorAll('input[name="chapter"]:checked')].map((input) => input.value);
    if (!selected.length) {
      showToast("請至少選擇一個章節。", 2800);
      return;
    }
    const pool = questions.filter((question) => selected.includes(question.chapter));
    state.activeSession = createSession("practice", pool, selected);
    saveState();
    goTo("session");
  }

  function startExam() {
    if (state.activeSession) {
      showReplaceSessionDialog("exam");
      return;
    }
    state.activeSession = createSession("exam", questions, chapters);
    saveState();
    goTo("session");
  }

  function answerQuestion(key) {
    const session = state.activeSession;
    if (!session) return;
    const id = session.questionIds[session.currentIndex];
    const question = questionById.get(id);

    if (session.mode === "practice") {
      if (session.answers[id]) return;
      session.answers[id] = key;
      recordAttempt(id, key === question.answer);
    } else {
      session.answers[id] = key;
    }
    saveState();
    renderSession();
  }

  function practiceNext() {
    const session = state.activeSession;
    if (!session) return;
    if (session.currentIndex < session.questionIds.length - 1) {
      session.currentIndex += 1;
      saveState();
      renderSession();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      finishPractice();
    }
  }

  function finishPractice() {
    const session = state.activeSession;
    const correct = session.questionIds.filter((id) => session.answers[id] === questionById.get(id).answer).length;
    const initialMastered = new Set(session.initialMastered);
    const newlyMastered = session.questionIds.filter((id) => !initialMastered.has(id) && getProgress(id).lastCorrect === true).length;
    const pendingWrong = questions.filter((question) => {
      const item = getProgress(question.id);
      return item.attempts > 0 && item.lastCorrect === false;
    }).length;
    lastResult = {
      mode: "practice",
      total: session.questionIds.length,
      correct,
      newlyMastered,
      pendingWrong,
      session
    };
    state.activeSession = null;
    saveState();
    goTo("result");
  }

  function moveExam(delta) {
    const session = state.activeSession;
    if (!session) return;
    session.currentIndex = Math.max(0, Math.min(session.questionIds.length - 1, session.currentIndex + delta));
    saveState();
    renderSession();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submitExam() {
    const session = state.activeSession;
    if (!session) return;
    const unanswered = session.questionIds.length - Object.keys(session.answers).length;
    showDialog({
      title: unanswered ? `還有 ${unanswered} 題未作答` : "準備交卷了嗎？",
      message: unanswered ? "未作答題目會計為答錯。你也可以先回到題目完成作答。" : "交卷後就不能修改答案，並會立即公布成績。",
      confirmText: "確認交卷",
      confirmClass: "btn-danger",
      onConfirm: gradeExam
    });
  }

  function gradeExam() {
    const session = state.activeSession;
    if (!session) return;
    const details = session.questionIds.map((id) => {
      const question = questionById.get(id);
      const answer = session.answers[id] || null;
      const isCorrect = answer === question.answer;
      recordAttempt(id, isCorrect);
      return { id, answer, isCorrect, order: session.optionOrder[id] };
    });
    const correct = details.filter((item) => item.isCorrect).length;
    const passed = correct / session.questionIds.length >= PASS_RATE;
    const completedAt = new Date().toISOString();
    state.examHistory.unshift({
      id: session.id,
      completedAt,
      correct,
      total: session.questionIds.length,
      passed
    });
    state.examHistory = state.examHistory.slice(0, 20);
    lastResult = { mode: "exam", total: session.questionIds.length, correct, passed, details, session };
    state.activeSession = null;
    saveState();
    closeDialog();
    goTo("result");
  }

  function renderResult() {
    if (!lastResult) {
      goTo("dashboard");
      return;
    }
    const result = lastResult;
    const rate = percent(result.correct, result.total);
    const exam = result.mode === "exam";
    app.innerHTML = `
      <section class="quiz-wrap">
        <div class="result-hero ${exam ? (result.passed ? "pass" : "fail") : ""}">
          <p class="eyebrow" style="color:inherit">${exam ? "Exam Complete" : "Practice Complete"}</p>
          <div class="result-score">${rate}<small>分</small></div>
          <h1>${exam ? (result.passed ? "通過抽考，漂亮！" : "這次還差一點") : "完成一輪練習！"}</h1>
          <p>${result.correct} / ${result.total} 題答對${exam ? ` · ${result.passed ? "已達 80% 及格標準" : "80% 為及格標準"}` : ""}</p>
          <div class="result-actions">
            <button class="btn btn-light" type="button" data-action="home">回首頁</button>
            <button class="btn btn-ghost-light" type="button" data-action="dashboard">查看學習進度</button>
          </div>
        </div>
        ${exam ? renderExamReview(result) : `
          <div class="result-grid">
            <div class="result-stat"><strong>${result.correct}</strong><span>本回答對</span></div>
            <div class="result-stat"><strong>${result.newlyMastered}</strong><span>新增掌握</span></div>
            <div class="result-stat"><strong>${result.pendingWrong}</strong><span>目前待複習</span></div>
          </div>
          <div class="panel" style="text-align:center">
            <h2>錯題會再回來</h2>
            <p class="lead" style="margin-inline:auto">下一場練習會優先抽出目前尚未答對的題目，答對後就會移出待複習清單。</p>
            <button class="btn btn-primary" type="button" data-action="practice-setup">再練一回</button>
          </div>`}
      </section>`;
  }

  function answerDescription(question, originalKey, order) {
    if (!originalKey) return "未作答";
    const index = order.indexOf(originalKey);
    return `${DISPLAY_LETTERS[index]}：${escapeHtml(question.options[originalKey])}`;
  }

  function renderExamReview(result) {
    return `
      <div class="result-grid">
        <div class="result-stat"><strong>${result.correct}</strong><span>答對題數</span></div>
        <div class="result-stat"><strong>${result.total - result.correct}</strong><span>答錯／未答</span></div>
        <div class="result-stat"><strong>${result.passed ? "通過" : "未通過"}</strong><span>抽考結果</span></div>
      </div>
      <h2>逐題檢討</h2>
      <div class="review-list">
        ${result.details.map((detail, index) => {
          const question = questionById.get(detail.id);
          return `<article class="review-item ${detail.isCorrect ? "ok" : ""}">
            <span class="pill">第 ${index + 1} 題 · ${detail.isCorrect ? "答對" : "答錯"}</span>
            <h3>${escapeHtml(question.text)}</h3>
            <p>你的答案：<strong>${answerDescription(question, detail.answer, detail.order)}</strong></p>
            <p>正確答案：<strong>${answerDescription(question, question.answer, detail.order)}</strong></p>
          </article>`;
        }).join("")}
      </div>`;
  }

  function renderDashboard() {
    const progressItems = questions.map((question) => getProgress(question.id));
    const seen = progressItems.filter((item) => item.attempts > 0).length;
    const mastered = progressItems.filter((item) => item.lastCorrect === true).length;
    const pending = progressItems.filter((item) => item.attempts > 0 && item.lastCorrect === false).length;
    const attempts = progressItems.reduce((sum, item) => sum + item.attempts, 0);
    const correct = progressItems.reduce((sum, item) => sum + item.correct, 0);
    const accuracy = percent(correct, attempts);

    app.innerHTML = `
      <section>
        <div class="dashboard-head">
          <div><p class="eyebrow">Learning Dashboard</p><h1>你的飛行進度</h1></div>
          <button class="btn btn-primary" type="button" data-action="practice-setup">開始練習</button>
        </div>
        <div class="stats-grid">
          ${statCard(questions.length, "題庫總數")}
          ${statCard(seen, "已作答題目")}
          ${statCard(mastered, "目前已掌握")}
          ${statCard(pending, "待複習錯題")}
          ${statCard(attempts, "累積作答")}
          ${statCard(`${accuracy}%`, "累積正確率")}
        </div>
        <div class="dashboard-columns">
          <section class="section-card">
            <h2>章節掌握度</h2>
            <div class="chapter-progress">
              ${chapters.map((chapter) => renderChapterProgress(chapter)).join("")}
            </div>
          </section>
          <section class="section-card">
            <h2>正式抽考紀錄</h2>
            <div class="history-list">
              ${state.examHistory.length ? state.examHistory.map(renderHistory).join("") : `<div class="empty">還沒有抽考紀錄。<br>準備好就挑戰第一場吧！</div>`}
            </div>
            <div class="danger-zone">
              <button class="btn btn-secondary" type="button" data-action="clear-progress">清除全部進度</button>
            </div>
          </section>
        </div>
      </section>`;
  }

  function statCard(value, label) {
    return `<div class="stat-card"><strong>${value}</strong><span>${label}</span></div>`;
  }

  function renderChapterProgress(chapter) {
    const pool = questions.filter((question) => question.chapter === chapter);
    const data = pool.map((question) => getProgress(question.id));
    const mastered = data.filter((item) => item.lastCorrect === true).length;
    const pending = data.filter((item) => item.attempts > 0 && item.lastCorrect === false).length;
    const attempts = data.reduce((sum, item) => sum + item.attempts, 0);
    const correct = data.reduce((sum, item) => sum + item.correct, 0);
    return `<div>
      <div class="chapter-row-head"><strong>${escapeHtml(chapter)}</strong><span>${mastered} / ${pool.length} 題</span></div>
      <div class="mini-track" aria-label="掌握 ${percent(mastered, pool.length)}%"><div class="mini-fill" style="width:${percent(mastered, pool.length)}%"></div></div>
      <div class="chapter-detail">掌握 ${percent(mastered, pool.length)}% · 待複習 ${pending} 題 · 正確率 ${percent(correct, attempts)}%</div>
    </div>`;
  }

  function renderHistory(item) {
    const date = new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(item.completedAt));
    return `<div class="history-item">
      <div><strong>${percent(item.correct, item.total)} 分</strong><span>${date} · ${item.correct}/${item.total} 題</span></div>
      <span class="status ${item.passed ? "pass" : "fail"}">${item.passed ? "通過" : "未通過"}</span>
    </div>`;
  }

  function showDialog({ title, message, confirmText, confirmClass = "btn-primary", onConfirm }) {
    dialogRoot.innerHTML = `<div class="dialog-backdrop" role="presentation">
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title">${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        <div class="dialog-actions">
          <button class="btn btn-secondary" type="button" data-dialog-action="cancel">取消</button>
          <button class="btn ${confirmClass}" type="button" data-dialog-action="confirm">${escapeHtml(confirmText)}</button>
        </div>
      </section>
    </div>`;
    dialogRoot.querySelector('[data-dialog-action="cancel"]').addEventListener("click", closeDialog);
    dialogRoot.querySelector('[data-dialog-action="confirm"]').addEventListener("click", onConfirm, { once: true });
    dialogRoot.querySelector('[data-dialog-action="confirm"]').focus();
  }

  function closeDialog() {
    dialogRoot.innerHTML = "";
  }

  function showReplaceSessionDialog(nextMode) {
    showDialog({
      title: "要放棄目前的回合嗎？",
      message: "未完成的回合會被刪除，但先前已完成的作答紀錄仍會保留。",
      confirmText: "放棄並開始",
      confirmClass: "btn-danger",
      onConfirm: function () {
        state.activeSession = null;
        closeDialog();
        if (nextMode === "exam") startExam();
        else goTo("practice-setup");
      }
    });
  }

  function showToast(message, duration = 2500) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
  }

  function abandonSession() {
    showDialog({
      title: "確定要放棄這個回合？",
      message: "本回合尚未完成的內容會被移除，已經記錄的練習作答仍會保留。",
      confirmText: "確定放棄",
      confirmClass: "btn-danger",
      onConfirm: function () {
        state.activeSession = null;
        saveState();
        closeDialog();
        goTo("home");
      }
    });
  }

  function clearProgress() {
    showDialog({
      title: "清除所有學習進度？",
      message: "這會永久刪除答題狀態、錯題 cycle、未完成回合與正式抽考紀錄。題庫本身不受影響。",
      confirmText: "清除全部進度",
      confirmClass: "btn-danger",
      onConfirm: function () {
        state = defaultState();
        localStorage.removeItem(STORAGE_KEY);
        lastResult = null;
        closeDialog();
        renderDashboard();
        showToast("學習進度已清除。", 2800);
      }
    });
  }

  app.addEventListener("click", function (event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;

    if (action === "home") goTo("home");
    if (action === "dashboard") goTo("dashboard");
    if (action === "practice-setup") {
      if (state.activeSession) showReplaceSessionDialog("practice");
      else goTo("practice-setup");
    }
    if (action === "start-practice") startPractice();
    if (action === "start-exam") startExam();
    if (action === "resume") goTo("session");
    if (action === "abandon") abandonSession();
    if (action === "exit-session") goTo("home");
    if (action === "answer") answerQuestion(target.dataset.key);
    if (action === "practice-next") practiceNext();
    if (action === "exam-prev") moveExam(-1);
    if (action === "exam-next") moveExam(1);
    if (action === "jump-question") {
      state.activeSession.currentIndex = Number(target.dataset.index);
      saveState();
      renderSession();
    }
    if (action === "submit-exam") submitExam();
    if (action === "clear-progress") clearProgress();
    if (action === "toggle-chapters") {
      const inputs = [...document.querySelectorAll('input[name="chapter"]')];
      const allChecked = inputs.every((input) => input.checked);
      inputs.forEach((input) => { input.checked = !allChecked; });
      target.textContent = allChecked ? "全部選取" : "取消全選";
    }
  });

  document.querySelector(".topbar").addEventListener("click", function (event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    if (target.dataset.action === "home") goTo("home");
    if (target.dataset.action === "dashboard") goTo("dashboard");
  });

  document.addEventListener("keydown", function (event) {
    if (currentView !== "session" || !state.activeSession || dialogRoot.children.length) return;
    const session = state.activeSession;
    const id = session.questionIds[session.currentIndex];
    const order = session.optionOrder[id];
    const index = ["1", "2", "3", "4", "a", "b", "c", "d"].indexOf(event.key.toLowerCase()) % 4;
    if (index >= 0 && index < 4) {
      event.preventDefault();
      answerQuestion(order[index]);
    }
    if (event.key === "Enter" && session.mode === "practice" && session.answers[id]) {
      event.preventDefault();
      practiceNext();
    }
    if (session.mode === "exam" && event.key === "ArrowLeft") moveExam(-1);
    if (session.mode === "exam" && event.key === "ArrowRight") moveExam(1);
  });

  render();
}());
