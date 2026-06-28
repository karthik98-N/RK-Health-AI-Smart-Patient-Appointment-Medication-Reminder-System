/* =========================================================
   RK Health – UI Interactions (Frontend only)
   ========================================================= */

/* ---------- Sidebar / Mobile menu ---------- */
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');
const menuToggle = document.getElementById('menuToggle');

menuToggle?.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
});
overlay?.addEventListener('click', () => {
  sidebar.classList.remove('open');
  overlay.classList.remove('show');
});

/* ---------- Navigation between sections ---------- */
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('.page-section');

function goTo(sectionId) {
  sections.forEach(s => s.classList.toggle('active', s.id === `section-${sectionId}`));
  navLinks.forEach(l => l.classList.toggle('active', l.dataset.section === sectionId));
  // Close mobile sidebar
  sidebar.classList.remove('open');
  overlay.classList.remove('show');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    goTo(link.dataset.section);
  });
});

document.querySelectorAll('[data-go]').forEach(btn => {
  btn.addEventListener('click', () => goTo(btn.dataset.go));
});

/* ---------- Toast notifications ---------- */
const toastContainer = document.getElementById('toastContainer');
const TOAST_ICONS = {
  success: 'fa-circle-check',
  warning: 'fa-triangle-exclamation',
  error:   'fa-circle-xmark',
};

function showToast(type = 'success', title = 'Notice', message = '') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon"><i class="fa-solid ${TOAST_ICONS[type] || TOAST_ICONS.success}"></i></div>
    <div>
      <strong>${title}</strong>
      <p>${message}</p>
    </div>
    <button class="toast-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
  `;
  toastContainer.appendChild(toast);
  const remove = () => { toast.classList.add('hide'); setTimeout(() => toast.remove(), 300); };
  toast.querySelector('.toast-close').addEventListener('click', remove);
  setTimeout(remove, 4500);
}
window.showToast = showToast;

/* ---------- Modal ---------- */
const aiModal = document.getElementById('aiModal');
function openModal() { aiModal.classList.add('show'); aiModal.setAttribute('aria-hidden', 'false'); }
function closeModal() { aiModal.classList.remove('show'); aiModal.setAttribute('aria-hidden', 'true'); }
document.getElementById('openAiModal')?.addEventListener('click', openModal);
document.getElementById('openAiModal2')?.addEventListener('click', openModal);
document.getElementById('genSummaryBtn')?.addEventListener('click', openModal);
aiModal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeModal));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* ---------- Appointment form ---------- */
const form = document.getElementById('appointmentForm');
form?.addEventListener('submit', (e) => {
  e.preventDefault();
  const requiredFields = ['patientName','age','gender','phone','doctor','department','date','time'];
  let ok = true;
  requiredFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el.value) { el.style.borderColor = 'var(--danger)'; ok = false; }
    else { el.style.borderColor = ''; }
  });
  if (!ok) {
    showToast('warning', 'Validation Error', 'Please complete all required fields.');
    return;
  }
  showToast('success', 'Appointment Saved', 'The appointment has been scheduled.');
  form.reset();
});

/* ---------- Medication seed data ---------- */
const medications = [
  { name: 'Atorvastatin', dose: '10mg', freq: 'Once daily', schedule: ['Night'], status: 'Completed', compliance: 92, next: 'Tonight, 9:00 PM' },
  { name: 'Metformin',    dose: '500mg', freq: 'Twice daily', schedule: ['Morning','Night'], status: 'Pending', compliance: 78, next: 'Today, 8:30 PM' },
  { name: 'Aspirin',      dose: '75mg',  freq: 'Once daily', schedule: ['Morning'], status: 'Missed', compliance: 64, next: 'Tomorrow, 8:00 AM' },
  { name: 'Metoprolol',   dose: '25mg',  freq: 'Twice daily', schedule: ['Morning','Afternoon'], status: 'Completed', compliance: 88, next: 'Tomorrow, 8:00 AM' },
  { name: 'Vitamin D3',   dose: '1000IU',freq: 'Once weekly', schedule: ['Morning'], status: 'Pending', compliance: 70, next: 'Sun, 9:00 AM' },
  { name: 'Pantoprazole', dose: '40mg',  freq: 'Once daily', schedule: ['Morning'], status: 'Completed', compliance: 95, next: 'Tomorrow, 7:30 AM' },
];

const STATUS_CLASS = { Completed: 'chip-success', Pending: 'chip-warning', Missed: 'chip-danger' };

const medGrid = document.getElementById('medGrid');
if (medGrid) {
  medGrid.innerHTML = medications.map(m => `
    <article class="med-card fade-in">
      <div class="med-head">
        <div style="display:flex; gap:12px; align-items:center;">
          <div class="med-icon"><i class="fa-solid fa-capsules"></i></div>
          <div class="med-title">
            <h4>${m.name} ${m.dose}</h4>
            <span>${m.freq}</span>
          </div>
        </div>
        <span class="chip ${STATUS_CLASS[m.status]}">${m.status}</span>
      </div>
      <div class="med-meta">
        ${m.schedule.map(s => `<span class="tag active">${s}</span>`).join('')}
      </div>
      <div>
        <div class="compliance-row">
          <span class="muted">Compliance</span>
          <strong>${m.compliance}%</strong>
        </div>
        <div class="bar" style="margin-top:6px;"><div class="bar-fill" style="width:${m.compliance}%"></div></div>
      </div>
      <div class="med-next"><i class="fa-regular fa-clock"></i> Next: ${m.next}</div>
      <div class="med-actions">
        <button class="btn btn-outline"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn btn-outline" onclick="showToast('success','Marked as Taken','${m.name} ${m.dose}')"><i class="fa-solid fa-check"></i> Taken</button>
        <button class="btn btn-outline" onclick="showToast('warning','Deleted','${m.name} removed')" style="color:var(--danger)"><i class="fa-solid fa-trash"></i></button>
      </div>
    </article>
  `).join('');
}

/* ---------- Patients table seed ---------- */
const patients = [
  { id: 'RK-0921', name: 'Anita Sharma',  date: 'Jun 28, 2026', doctor: 'Dr. Rohan K.',   med: 'Atorvastatin', reminder: 'Sent',     compliance: 92 },
  { id: 'RK-0918', name: 'Ramesh Patel',  date: 'Jun 28, 2026', doctor: 'Dr. Mehta',      med: 'Metformin',    reminder: 'Pending',  compliance: 78 },
  { id: 'RK-0905', name: 'Priya Verma',   date: 'Jun 27, 2026', doctor: 'Dr. Iyer',       med: 'Aspirin',      reminder: 'Missed',   compliance: 64 },
  { id: 'RK-0899', name: 'Karan Singh',   date: 'Jun 27, 2026', doctor: 'Dr. Rohan K.',   med: 'Metoprolol',   reminder: 'Sent',     compliance: 88 },
  { id: 'RK-0882', name: 'Neha Kapoor',   date: 'Jun 26, 2026', doctor: 'Dr. Kapoor',     med: 'Vitamin D3',   reminder: 'Sent',     compliance: 70 },
  { id: 'RK-0870', name: 'Suresh Yadav',  date: 'Jun 26, 2026', doctor: 'Dr. Mehta',      med: 'Pantoprazole', reminder: 'Sent',     compliance: 95 },
];

const REMINDER_CLASS = { Sent: 'chip-success', Pending: 'chip-warning', Missed: 'chip-danger' };
const tbody = document.getElementById('patientsTbody');

function avatarInitials(name) {
  return name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
}

function renderPatients(rows) {
  tbody.innerHTML = rows.map(p => `
    <tr>
      <td><strong>${p.id}</strong></td>
      <td>
        <div class="patient-cell">
          <div class="avatar">${avatarInitials(p.name)}</div>
          <span>${p.name}</span>
        </div>
      </td>
      <td>${p.date}</td>
      <td>${p.doctor}</td>
      <td>${p.med}</td>
      <td><span class="chip ${REMINDER_CLASS[p.reminder]}">${p.reminder}</span></td>
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="bar" style="flex:1; min-width:60px;"><div class="bar-fill" style="width:${p.compliance}%"></div></div>
          <strong style="font-size:12px;">${p.compliance}%</strong>
        </div>
      </td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" title="View"><i class="fa-regular fa-eye"></i></button>
          <button class="icon-btn" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-btn" title="Print"><i class="fa-solid fa-print"></i></button>
          <button class="icon-btn" title="Delete" onclick="showToast('warning','Deleted','${p.name} removed')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}
renderPatients(patients);

/* ---------- Patient search ---------- */
const patientSearch = document.getElementById('patientSearch');
patientSearch?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.id.toLowerCase().includes(q) ||
    p.doctor.toLowerCase().includes(q) ||
    p.med.toLowerCase().includes(q)
  );
  renderPatients(filtered);
});

/* ---------- Welcome toast ---------- */
setTimeout(() => showToast('success', 'Welcome back, Dr. Rohan', 'You have 12 upcoming appointments today.'), 600);
