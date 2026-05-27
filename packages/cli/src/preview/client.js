/**
 * Kappan preview client.
 *
 * - GET /api/chapters で章一覧を取得
 * - 章リンクをクリックして iframe に表示
 * - SSE で再ビルド通知を受信し、該当章の iframe をリロード
 * - エラーオーバーレイ、最新ビルド時刻表示、diagnostics パネル
 */
(async function () {
  const listEl = document.getElementById('chapter-list');
  const iframe = document.getElementById('preview');
  const statusEl = document.getElementById('status');
  const overlayEl = document.getElementById('error-overlay');
  const overlayMsgEl = document.getElementById('error-message');
  const overlayDiagEl = document.getElementById('error-diagnostics');
  const overlayCloseEl = document.getElementById('overlay-close');
  const lastBuildAtEl = document.getElementById('last-build-at');
  const diagPanelEl = document.getElementById('diagnostics');
  const diagListEl = document.getElementById('diag-list');
  const diagCountEl = document.getElementById('diag-count');

  let currentChapterId = null;
  let chapters = [];

  async function loadChapters() {
    const res = await fetch('/api/chapters');
    chapters = await res.json();
    renderList();
    if (!currentChapterId && chapters.length > 0) {
      selectChapter(chapters[0].id);
    }
  }

  function renderList() {
    listEl.innerHTML = '';
    for (const ch of chapters) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#' + ch.id;
      a.dataset.chapterId = ch.id;
      a.innerHTML = '<span class="dot" data-dot="' + ch.id + '"></span>' + escapeHtml(ch.title);
      a.addEventListener('click', (e) => {
        e.preventDefault();
        selectChapter(ch.id);
      });
      if (ch.id === currentChapterId) a.classList.add('active');
      li.appendChild(a);
      listEl.appendChild(li);
    }
  }

  function selectChapter(id) {
    currentChapterId = id;
    iframe.src = '/content/' + id + '.xhtml?t=' + Date.now();
    document.querySelectorAll('aside.nav a').forEach((a) => {
      a.classList.toggle('active', a.dataset.chapterId === id);
    });
    clearDirtyDot(id);
  }

  function reloadCurrent() {
    if (currentChapterId) {
      iframe.src = '/content/' + currentChapterId + '.xhtml?t=' + Date.now();
    }
  }

  function markDirty(id) {
    const dot = document.querySelector('[data-dot="' + id + '"]');
    if (dot) dot.classList.add('dirty');
  }

  function clearDirtyDot(id) {
    const dot = document.querySelector('[data-dot="' + id + '"]');
    if (dot) dot.classList.remove('dirty');
  }

  function showStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.classList.toggle('error', !!isError);
    statusEl.classList.add('show');
    clearTimeout(showStatus._timer);
    showStatus._timer = setTimeout(() => statusEl.classList.remove('show'), 1500);
  }

  function showOverlay(payload) {
    overlayMsgEl.textContent = payload.message || 'Build error';
    overlayDiagEl.innerHTML = '';
    const diags = payload.diagnostics || [];
    for (const d of diags) {
      const li = document.createElement('li');
      li.className = 'sev-' + (d.severity || 'error');
      const loc = d.range && d.range.file ? ' (' + d.range.file + ')' : '';
      li.textContent =
        '[' + (d.severity || 'error') + '] ' + (d.source || '') + ': ' + (d.message || '') + loc;
      overlayDiagEl.appendChild(li);
    }
    overlayEl.classList.add('show');
  }

  function hideOverlay() {
    overlayEl.classList.remove('show');
  }

  overlayCloseEl.addEventListener('click', hideOverlay);

  function renderDiagnostics(diags) {
    diagListEl.innerHTML = '';
    const list = (diags || []).filter(Boolean);
    if (list.length === 0) {
      diagPanelEl.classList.remove('show');
      diagCountEl.textContent = '0';
      return;
    }
    diagPanelEl.classList.add('show');
    diagCountEl.textContent = String(list.length);
    for (const d of list) {
      const li = document.createElement('li');
      const sev = d.severity || 'info';
      const sevSpan = document.createElement('span');
      sevSpan.className = 'sev sev-' + sev;
      sevSpan.textContent = sev;
      const srcSpan = document.createElement('span');
      srcSpan.className = 'src';
      srcSpan.textContent = d.source || '';
      const msgSpan = document.createElement('span');
      msgSpan.textContent = d.message || '';
      li.appendChild(sevSpan);
      li.appendChild(srcSpan);
      li.appendChild(msgSpan);
      if (d.range && d.range.file) {
        const fileSpan = document.createElement('span');
        fileSpan.className = 'file';
        fileSpan.textContent = d.range.file;
        li.appendChild(fileSpan);
      }
      diagListEl.appendChild(li);
    }
  }

  function updateLastBuildAt(iso) {
    if (!iso) return;
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime()) || d.getTime() === 0) {
        lastBuildAtEl.textContent = '—';
        return;
      }
      lastBuildAtEl.dateTime = iso;
      // HH:MM:SS で表示（年月日は枠が狭いので省略）
      lastBuildAtEl.textContent = d.toLocaleTimeString();
    } catch (_) {
      lastBuildAtEl.textContent = iso;
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function connectSse() {
    const es = new EventSource('/__sse');
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.lastBuildAt) updateLastBuildAt(data.lastBuildAt);
        if (data.type === 'chapter-updated') {
          hideOverlay();
          if (data.chapterId === currentChapterId) {
            reloadCurrent();
            showStatus('updated: ' + data.chapterId);
          } else {
            markDirty(data.chapterId);
          }
        } else if (data.type === 'full-reload') {
          hideOverlay();
          loadChapters().then(reloadCurrent);
          showStatus('full reload');
        } else if (data.type === 'error') {
          showOverlay(data);
          showStatus(data.message || 'build error', true);
        } else if (data.type === 'diagnostics') {
          renderDiagnostics(data.diagnostics || []);
        } else if (data.type === 'snapshot') {
          if (data.error) {
            showOverlay(data.error);
          } else {
            hideOverlay();
          }
          renderDiagnostics(data.diagnostics || []);
        }
      } catch (err) {
        console.error('SSE parse error', err);
      }
    };
    es.onerror = () => {
      showStatus('disconnected, retrying...', true);
    };
  }

  await loadChapters();
  connectSse();
})();
