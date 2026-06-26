// ── CONFIG ────────────────────────────────────────────────────
const ADMIN_PASSWORD = 'Varadero2020'; // ← Change this to your password
const STORAGE_KEY    = 'iw_cars';  // Must match your index.html
// ─────────────────────────────────────────────────────────────

let cars = [];
let editingId = null;
let pendingPhotos = [];   // new File objects
let keptPhotos   = [];    // existing base64/url strings to keep
let deleteTargetId = null;
let currentView = 'dashboard';

// ── AUTH ─────────────────────────────────────────────────────
function doLogin() {
  const pass = document.getElementById('login-pass').value;
  if (pass === ADMIN_PASSWORD) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-screen').style.display = 'block';
    loadCars();
  } else {
    const err = document.getElementById('login-error');
    err.textContent = 'Incorrect password. Try again.';
    document.getElementById('login-pass').value = '';
    document.getElementById('login-pass').focus();
    setTimeout(() => { err.textContent = ''; }, 3000);
  }
}

function doLogout() {
  document.getElementById('admin-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-pass').value = '';
}

// ── DATA ──────────────────────────────────────────────────────
async function loadCars() {
  const { data, error } = await supabase
    .from('cars')
    .select('*')
    .order('id', { ascending: false });

  if (error) {
    console.error(error);
    toast('Failed to load cars', 'error');
    return;
  }

  cars = data || [];
  refreshAll();
}

async function persistCars() {
  await loadCars();
}

function refreshAll() {
  updateStats();
  updateNavCounts();
  renderDashboard();
  renderInventoryView();
  renderFiltered('avail-tbody', c => c.status === 'available');
  renderFiltered('sold-tbody',  c => c.status === 'sold');
}

// ── STATS ─────────────────────────────────────────────────────
function updateStats() {
  const avail = cars.filter(c => c.status === 'available');
  const sold  = cars.filter(c => c.status === 'sold');
  const val   = avail.reduce((s, c) => s + (Number(c.price) || 0), 0);
  set('stat-total', cars.length);
  set('stat-avail', avail.length);
  set('stat-sold',  sold.length);
  set('stat-value', '$' + val.toLocaleString());
}

function updateNavCounts() {
  set('nav-count-all',   cars.length);
  set('nav-count-avail', cars.filter(c => c.status === 'available').length);
  set('nav-count-sold',  cars.filter(c => c.status === 'sold').length);
}

function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── NAVIGATION ────────────────────────────────────────────────
function goView(view, navEl) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  if (navEl) navEl.classList.add('active');
  currentView = view;

  if (view === 'inventory') {
    document.getElementById('inv-title').innerHTML = 'All <span style="color:var(--accent)">Cars</span>';
    document.getElementById('inv-subtitle').textContent = `${cars.length} total listings`;
    document.getElementById('filter-status').value = '';
    renderInventoryView();
  }
  if (view === 'available') renderFiltered('avail-tbody', c => c.status === 'available');
  if (view === 'sold')      renderFiltered('sold-tbody',  c => c.status === 'sold');
}

// ── RENDER ────────────────────────────────────────────────────
function thumbHTML(car) {
  if (car.photos && car.photos.length > 0 && car.photos[0]) {
    return `<div class="car-thumb-wrap"><img src="${car.photos[0]}" alt="" onerror="this.parentElement.innerHTML='🚗'"></div>`;
  }
  return `<div class="car-thumb-wrap">🚗</div>`;
}

function statusPill(car) {
  return car.status === 'sold'
    ? `<span class="status-pill pill-sold">Sold</span>`
    : `<span class="status-pill pill-available">Available</span>`;
}

function rowHTML(car, compact = false) {
  const mil = compact ? '' : `<td>${(car.mileage || 0).toLocaleString()} mi</td>`;
  const typ = compact ? '' : `<td style="color:var(--muted-light);font-size:0.82rem;">${cap(car.type || '—')}</td>`;
  return `
    <tr>
      <td>${thumbHTML(car)}</td>
      <td>
        <div class="car-name-cell">
          <strong>${car.year} ${car.make} ${car.model}</strong>
          <span>${car.color || ''} · ${car.engine || '—'}</span>
        </div>
      </td>
      ${mil}${typ}
      <td class="price-cell">$${Number(car.price || 0).toLocaleString()}</td>
      <td>${statusPill(car)}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-outline btn-sm" onclick="openDrawer(${car.id})">✏️ Edit</button>
          <button class="btn btn-sm" style="background:var(--yellow-dim);border:1px solid rgba(245,158,11,0.25);color:var(--yellow);" onclick="toggleSold(${car.id})">
            ${car.status === 'sold' ? '↩ Relist' : '✔ Mark Sold'}
          </button>
          <button class="btn btn-danger btn-sm" onclick="askDelete(${car.id})">🗑</button>
        </div>
      </td>
    </tr>`;
}

function emptyRow(cols, msg) {
  return `<tr><td colspan="${cols}">
    <div class="empty-table">
      <div class="empty-table-icon">🚗</div>
      <div class="empty-table-text">${msg}</div>
    </div>
  </td></tr>`;
}

function renderDashboard() {
  const tbody = document.getElementById('dash-tbody');
  const recent = [...cars].slice(0, 6);
  tbody.innerHTML = recent.length
    ? recent.map(c => rowHTML(c, true)).join('')
    : emptyRow(5, 'No listings yet — add your first car');
}

function renderInventoryView() {
  const q      = (document.getElementById('search-q')?.value || '').toLowerCase();
  const status = document.getElementById('filter-status')?.value || '';
  const type   = document.getElementById('filter-type')?.value || '';

  const filtered = cars.filter(c => {
    const matchQ = !q || `${c.make} ${c.model} ${c.year} ${c.color}`.toLowerCase().includes(q);
    const matchS = !status || c.status === status;
    const matchT = !type   || c.type   === type;
    return matchQ && matchS && matchT;
  });

  document.getElementById('inv-subtitle').textContent = `${filtered.length} of ${cars.length} listings`;

  const tbody = document.getElementById('inv-tbody');
  tbody.innerHTML = filtered.length
    ? filtered.map(c => rowHTML(c)).join('')
    : emptyRow(7, 'No cars match your search');
}

function renderFiltered(tbodyId, filterFn) {
  const list  = cars.filter(filterFn);
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = list.length
    ? list.map(c => rowHTML(c)).join('')
    : emptyRow(7, 'Nothing here yet');
}

// ── DRAWER ────────────────────────────────────────────────────
function openDrawer(id) {
  editingId     = id;
  pendingPhotos = [];

  const car = id ? cars.find(c => c.id === id) : null;
  keptPhotos = car?.photos ? [...car.photos] : [];

  document.getElementById('drawer-title').innerHTML = car
    ? `Edit <span>${car.year} ${car.make} ${car.model}</span>`
    : 'Add <span>New Car</span>';
  document.getElementById('save-btn').textContent = car ? 'Save Changes' : 'Publish Listing';

  document.getElementById('drawer-body').innerHTML = buildForm(car);
  renderPhotoGrid();

  document.getElementById('overlay').classList.add('open');
  document.getElementById('drawer').classList.add('open');
  document.body.style.overflow = 'hidden';

  // Drag-and-drop on upload zone
  const zone = document.getElementById('upload-zone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    addFiles(e.dataTransfer.files);
  });
}

function closeDrawer() {
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('drawer').classList.remove('open');
  document.body.style.overflow = '';
  editingId = null;
}

function buildForm(car) {
  const v = car || {};
  const typeOpts = ['sedan','suv','truck','coupe','convertible','van'];
  const transOpts = ['Automatic','Manual','CVT'];
  return `
    <div class="form-section-label">Vehicle Info</div>
    <div class="form-grid">
      <div class="form-field">
        <label>Make <span class="req">*</span></label>
        <input class="form-input" id="f-make" value="${esc(v.make)}" placeholder="e.g. Nissan">
      </div>
      <div class="form-field">
        <label>Model <span class="req">*</span></label>
        <input class="form-input" id="f-model" value="${esc(v.model)}" placeholder="e.g. Altima">
      </div>
      <div class="form-field">
        <label>Year <span class="req">*</span></label>
        <input class="form-input" id="f-year" type="number" value="${v.year||''}" placeholder="2019" min="1950" max="2030">
      </div>
      <div class="form-field">
        <label>Type</label>
        <select class="form-select" id="f-type">
          ${typeOpts.map(t => `<option value="${t}" ${v.type===t?'selected':''}>${cap(t)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="form-section-label">Specs</div>
    <div class="form-grid">
      <div class="form-field">
        <label>Mileage</label>
        <input class="form-input" id="f-mileage" type="number" value="${v.mileage||''}" placeholder="e.g. 40000">
      </div>
      <div class="form-field">
        <label>Color</label>
        <input class="form-input" id="f-color" value="${esc(v.color)}" placeholder="e.g. White">
      </div>
      <div class="form-field">
        <label>Engine</label>
        <input class="form-input" id="f-engine" value="${esc(v.engine)}" placeholder="e.g. 2.5L I4">
      </div>
      <div class="form-field">
        <label>Transmission</label>
        <select class="form-select" id="f-trans">
          ${transOpts.map(t => `<option value="${t}" ${v.transmission===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-field full">
      <label>Description</label>
      <textarea class="form-textarea" id="f-desc" placeholder="Condition, features, history…">${esc(v.description)}</textarea>
    </div>

    <div class="form-section-label">Pricing & Status</div>
    <div class="form-grid">
      <div class="form-field">
        <label>Asking Price ($) <span class="req">*</span></label>
        <input class="form-input" id="f-price" type="number" value="${v.price||''}" placeholder="e.g. 12000">
      </div>
      <div class="form-field">
        <label>Status</label>
        <select class="form-select" id="f-status">
          <option value="available" ${v.status!=='sold'?'selected':''}>Available</option>
          <option value="sold"      ${v.status==='sold'?'selected':''}>Sold</option>
        </select>
      </div>
    </div>

    <div class="form-section-label">Photos</div>
    <div class="upload-zone" id="upload-zone">
      <input type="file" accept="image/*" multiple onchange="addFiles(this.files)">
      <div class="upload-zone-icon">📷</div>
      <div class="upload-zone-text">Click or drag photos here</div>
      <div class="upload-zone-sub">JPG · PNG · WEBP · up to 10 photos</div>
    </div>
    <div id="photo-grid" class="photo-grid"></div>`;
}

// ── PHOTOS ────────────────────────────────────────────────────
function addFiles(files) {
  Array.from(files).forEach(f => {
    if (keptPhotos.length + pendingPhotos.length >= 10) return;
    pendingPhotos.push(f);
  });
  renderPhotoGrid();
}

function renderPhotoGrid() {
  const grid = document.getElementById('photo-grid');
  if (!grid) return;
  let html = '';

  keptPhotos.forEach((src, i) => {
    const badge = i === 0 ? '<div class="photo-item-badge">Cover</div>' : '';
    html += `<div class="photo-item">
      <img src="${src}" alt="">
      <button class="photo-item-remove" onclick="removeKept(${i})">✕</button>
      ${badge}
    </div>`;
  });

  pendingPhotos.forEach((f, i) => {
    const url = URL.createObjectURL(f);
    const isFirst = keptPhotos.length === 0 && i === 0;
    const badge = isFirst ? '<div class="photo-item-badge">Cover</div>' : '';
    html += `<div class="photo-item">
      <img src="${url}" alt="">
      <button class="photo-item-remove" onclick="removePending(${i})">✕</button>
      ${badge}
    </div>`;
  });

  grid.innerHTML = html;
}

function removeKept(i)    { keptPhotos.splice(i, 1);    renderPhotoGrid(); }
function removePending(i) { pendingPhotos.splice(i, 1); renderPhotoGrid(); }

// Convert pending File objects to base64 strings
async function resolvePhotos() {
  const base64s = await Promise.all(pendingPhotos.map(f => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  })));
  return [...keptPhotos, ...base64s];
}

// ── SAVE ──────────────────────────────────────────────────────
async function saveCar() {
  const make  = val('f-make').trim();
  const model = val('f-model').trim();
  const year  = val('f-year');
  const price = val('f-price');

  if (!make || !model || !year || !price) {
    toast('Please fill in all required fields (*)', 'error');
    return;
  }

  const btn = document.getElementById('save-btn');
  btn.innerHTML = '<span class="spinner"></span> Saving…';
  btn.disabled = true;

  const photos = await resolvePhotos();

  const payload = {
    make, model,
    year:         parseInt(year),
    type:         val('f-type'),
    mileage:      parseInt(val('f-mileage')) || 0,
    color:        val('f-color')   || '—',
    engine:       val('f-engine')  || '—',
    transmission: val('f-trans'),
    description:  val('f-desc'),
    price:        parseFloat(price),
    status:       val('f-status'),
    photos,
  };

  if (editingId) {
    const idx = cars.findIndex(c => c.id === editingId);
    if (idx > -1) cars[idx] = { ...cars[idx], ...payload };
    toast(`✅ ${payload.year} ${payload.make} ${payload.model} updated`);
  } else {
    payload.id = Date.now();
    cars.unshift(payload);
    toast(`✅ ${payload.year} ${payload.make} ${payload.model} published`);
  }

  persistCars();
  closeDrawer();
  btn.innerHTML = 'Save Changes';
  btn.disabled = false;
}

// ── QUICK ACTIONS ─────────────────────────────────────────────
function toggleSold(id) {
  const car = cars.find(c => c.id === id);
  if (!car) return;
  car.status = car.status === 'sold' ? 'available' : 'sold';
  persistCars();
  toast(`${car.year} ${car.make} ${car.model} marked as ${car.status}`);
}

// ── DELETE ────────────────────────────────────────────────────
function askDelete(id) {
  const car = cars.find(c => c.id === id);
  if (!car) return;
  deleteTargetId = id;
  document.getElementById('confirm-car-name').textContent = `${car.year} ${car.make} ${car.model}`;
  document.getElementById('confirm-overlay').classList.add('open');
  document.getElementById('confirm-modal').classList.add('open');
}

function closeConfirm() {
  deleteTargetId = null;
  document.getElementById('confirm-overlay').classList.remove('open');
  document.getElementById('confirm-modal').classList.remove('open');
}

function confirmDelete() {
  if (!deleteTargetId) return;
  const car = cars.find(c => c.id === deleteTargetId);
  cars = cars.filter(c => c.id !== deleteTargetId);
  persistCars();
  closeConfirm();
  toast(`🗑️ ${car ? car.year + ' ' + car.make + ' ' + car.model : 'Listing'} removed`);
}

// ── TOAST ─────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${type === 'error' ? '⚠️' : '✅'}</span><span class="toast-text">${msg}</span>`;
  wrap.appendChild(el);
  requestAnimationFrame(() => { requestAnimationFrame(() => el.classList.add('show')); });
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, 3500);
}

// ── HELPERS ───────────────────────────────────────────────────
function val(id)  { return (document.getElementById(id)?.value || ''); }
function esc(s)   { return (s || '').toString().replace(/"/g, '&quot;'); }
function cap(s)   { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }