// ================= УПРАВЛЕНИЕ ЭКРАНАМИ =================
function showScreen(id) {
  $$('.scr').forEach(s => s.classList.remove('on'));
  $('#' + id).classList.add('on');
}

function busy(t) {
  const el = $('#home-busy');
  el.textContent = t || '';
  el.classList.toggle('waiting', !!t);
}

// ================= УВЕДОМЛЕНИЯ =================
function toast(text, red) {
  const d = document.createElement('div');
  d.className = 'toast' + (red ? ' red' : '');
  d.textContent = text;
  $('#toasts').append(d);
  setTimeout(() => d.remove(), 3800);
}

function banner(text, color) {
  const b = $('#banner');
  $('#banner-text').textContent = text;
  $('#banner-text').style.color = color || 'var(--txt)';
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
}

function showErr(msg) {
  $('#err-msg').textContent = msg;
  showScreen('scr-err');
}

// ================= МОДАЛЬНОЕ ОКНО =================
let modalOk = null;

function ask(text, ok) {
  $('#modal-text').textContent = text;
  modalOk = ok;
  $('#modal').hidden = false;
}

$('#modal-ok').onclick = () => {
  $('#modal').hidden = true;
  modalOk && modalOk();
  modalOk = null;
};

$('#modal-no').onclick = () => {
  $('#modal').hidden = true;
  modalOk = null;
};

// ================= КОПИРОВАНИЕ =================
function copyText(t, label) {
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject())
    .then(() => toast(label + ' скопирован'))
    .catch(() => { prompt('Скопируйте вручную:', t); });
}