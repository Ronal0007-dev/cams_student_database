// ═══════════════════════════════════════
//  SMS — Frontend App
// ═══════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

  // ── Current date in topbar ──
  const dateEl = document.getElementById('currentDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
  }

  // ── Theme ──
  const savedTheme = localStorage.getItem('sms-theme') || 'dark';
  applyTheme(savedTheme);

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next    = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('sms-theme', next);
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.getElementById('themeIcon');
    if (icon) {
      icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }

  // ── Sidebar toggle (mobile) ──
  const toggle  = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('open') &&
          !sidebar.contains(e.target) && !toggle.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }

  // ── Auto-dismiss alerts after 4s ──
  setTimeout(() => {
    document.querySelectorAll('.alert').forEach(a => {
      a.style.transition = 'opacity 0.5s';
      a.style.opacity    = '0';
      setTimeout(() => a.remove(), 500);
    });
  }, 4000);

  // ── Highlight active nav link ──
  const path = window.location.pathname;
  document.querySelectorAll('.nav-item').forEach(a => {
    const href = a.getAttribute('href');
    if (href && href !== '/' && path.startsWith(href)) a.classList.add('active');
  });

});

// ── Stream loader (shared across student form, move modal, promote modal) ──
async function loadStreams(classId, selectId, preselect) {
  const sel = document.getElementById(selectId || 'StmID');
  if (!sel) return;
  sel.innerHTML = '<option value="">Loading...</option>';
  if (!classId) {
    sel.innerHTML = '<option value="">Select stream (optional)</option>';
    return;
  }
  try {
    const res     = await fetch('/streams/by-class/' + classId);
    const streams = await res.json();
    sel.innerHTML = '<option value="">No specific stream</option>' +
      streams.map(s =>
        `<option value="${s.StmID}" ${preselect == s.StmID ? 'selected' : ''}>${s.StmName}</option>`
      ).join('');
  } catch (e) {
    sel.innerHTML = '<option value="">Error loading streams</option>';
  }
}
