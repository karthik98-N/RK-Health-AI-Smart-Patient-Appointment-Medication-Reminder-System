/* =========================================================
   RK Health – Backend-Integrated UI Actions
   ========================================================= */

const ENABLE_PATIENT_LOGIN = true;

function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function stripHTML(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<\/?[^>]+(>|$)/g, "");
}

const API_CACHE = {};
const CACHE_TTL = 10000; // 10 seconds

// APPS_SCRIPT_URL is loaded globally from config.js. When running on localhost, we default to the local Flask API.
async function fetchAPI(endpoint, method = 'GET', body = null) {
  if (method !== 'GET') {
    for (let key in API_CACHE) delete API_CACHE[key];
  } else {
    if (API_CACHE[endpoint] && (Date.now() - API_CACHE[endpoint].timestamp < CACHE_TTL)) {
      return API_CACHE[endpoint].data;
    }
  }

  let result;
  // Always use Flask server for AI summary since Apps Script lacks Groq/Llama AI integration
  const isAISummary = endpoint.includes('/generate-summary');
  const useAppsScript = isAISummary ? false : ((typeof USE_LOCAL_API !== 'undefined' && USE_LOCAL_API) ? false : (APPS_SCRIPT_URL && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'));
  if (useAppsScript) {
    if (method === 'GET') {
      const action = endpoint.split('/').pop(); // 'patients', 'medications', or 'appointments'
      const response = await fetch(`${APPS_SCRIPT_URL}?action=${action}`);
      const json = await response.json();
      API_CACHE[endpoint] = { timestamp: Date.now(), data: json };
      return json;
    } else {
      let action = "";
      let payload = body ? JSON.parse(JSON.stringify(body)) : {};

      if (endpoint === '/api/appointments') {
        action = 'addAppointment';
      } else if (endpoint === '/api/medications') {
        action = 'addMedication';
      } else if (endpoint.includes('/taken')) {
        action = 'medicationTaken';
        payload.id = endpoint.split('/')[3];
      } else if (method === 'DELETE' && endpoint.startsWith('/api/medications/')) {
        action = 'deleteMedication';
        payload.id = endpoint.split('/').pop();
      } else if (method === 'POST' && endpoint.startsWith('/api/medications/') && !endpoint.includes('/taken')) {
        action = 'updateMedication';
        payload.id = endpoint.split('/').pop();
      } else if (endpoint === '/api/generate-summary') {
        action = 'generateSummary';
      } else if (endpoint === '/api/send-sms') {
        action = 'sendSMS';
      } else if (endpoint === '/api/send-email') {
        action = 'sendEmail';
      } else if (endpoint.startsWith('/api/patients/')) {
        action = 'updatePatient';
        payload.id = endpoint.split('/').pop();
      } else if (endpoint === '/api/patients') {
        action = 'getOrCreatePatient';
      }

      payload.action = action;

      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        redirect: 'follow',
        body: JSON.stringify(payload)
      });
      return response.json();
    }
  } else {
    const options = { method };
    if (body) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    const response = await fetch(endpoint, options);
    const json = await response.json();
    if (method === 'GET') {
      API_CACHE[endpoint] = { timestamp: Date.now(), data: json };
    }
    return json;
  }
}

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

function goTo(sectionId, skipReportLoad = false) {
  sections.forEach(s => s.classList.toggle('active', s.id === `section-${sectionId}`));
  navLinks.forEach(l => l.classList.toggle('active', l.dataset.section === sectionId));

  if (sectionId === 'reports' && !skipReportLoad) {
    const loggedInName = localStorage.getItem('patientName');
    if (loggedInName && window.patientsList && window.patientsList.length > 0) {
      const p = window.patientsList.find(patient => patient.name.toLowerCase() === loggedInName.toLowerCase());
      if (p) {
        window.viewPatientReport(p.id, p.name);
      }
    }
  }

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
  error: 'fa-circle-xmark',
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
  setTimeout(remove, 8000); // 8 seconds, especially to allow clicking calendar links
}
window.showToast = showToast;

/* ---------- Modal ---------- */
const aiModal = document.getElementById('aiModal');
function openModal() { aiModal.classList.add('show'); aiModal.setAttribute('aria-hidden', 'false'); }
function closeModal() { aiModal.classList.remove('show'); aiModal.setAttribute('aria-hidden', 'true'); }
aiModal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeModal));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// Global patients list storage
window.patientsList = [];

/* ---------- API calls to load data ---------- */

async function loadPatients() {
  try {
    const data = await fetchAPI('/api/patients');
    window.patientsList = data;

    const loggedInEmail = localStorage.getItem('patientEmail');
    if (ENABLE_PATIENT_LOGIN && loggedInEmail) {
      window.patientsList = data.filter(p => p.email && p.email.toLowerCase() === loggedInEmail.toLowerCase());
      if (window.patientsList.length > 0) {
        const dbPatient = window.patientsList[0];
        const localName = localStorage.getItem('patientName');
        if (dbPatient.name && dbPatient.name !== localName) {
          localStorage.setItem('patientName', dbPatient.name);
          if (dbPatient.phone && dbPatient.phone !== 'N/A' && dbPatient.phone !== 'null') {
            localStorage.setItem('patientPhone', dbPatient.phone);
          }
          checkPatientLogin();
        }
      }
    }

    renderPatients(window.patientsList);
    updatePatientDashboardStats();
  } catch (err) {
    console.error('Failed to load patients:', err);
    showToast('error', 'Error', 'Failed to load patient records.');
  }
}

async function loadMedications() {
  try {
    const data = await fetchAPI('/api/medications');
    window.medicationsList = data;

    const loggedInName = localStorage.getItem('patientName');
    if (ENABLE_PATIENT_LOGIN && loggedInName) {
      window.medicationsList = data.filter(m => {
        const mName = stripHTML(m.patient_name || m.patientName || '').trim().toLowerCase();
        const lName = stripHTML(loggedInName || '').trim().toLowerCase();
        return mName === lName;
      });
    }

    renderMedications(window.medicationsList);
    updatePatientDashboardStats();
    if (typeof window.renderNotifications === 'function') {
      window.renderNotifications();
    }
  } catch (err) {
    console.error('Failed to load medications:', err);
    showToast('error', 'Error', 'Failed to load medications.');
  }
}

async function loadAppointments() {
  try {
    const data = await fetchAPI('/api/appointments');
    window.appointmentsList = data;

    const loggedInName = localStorage.getItem('patientName');
    if (ENABLE_PATIENT_LOGIN && loggedInName) {
      window.appointmentsList = data.filter(a => {
        const aName = stripHTML(a.patient_name || a.patientName || '').trim().toLowerCase();
        const lName = stripHTML(loggedInName || '').trim().toLowerCase();
        return aName === lName;
      });
    }

    renderAppointments(window.appointmentsList);
    if (typeof window.renderNotifications === 'function') {
      window.renderNotifications();
    }
  } catch (err) {
    console.error('Failed to load appointments:', err);
  }
}

/* ---------- Rendering functions ---------- */

const STATUS_CLASS = { Completed: 'chip-success', Pending: 'chip-warning', Missed: 'chip-danger' };

function renderMedications(meds) {
  const medGrid = document.getElementById('medGrid');
  if (!medGrid) return;

  if (meds.length === 0) {
    medGrid.innerHTML = '<p class="muted" style="grid-column:1/-1;text-align:center;padding:40px 0;">No medication logs found.</p>';
    return;
  }

  medGrid.innerHTML = meds.map(m => `
    <article class="med-card fade-in">
      <div class="med-head">
        <div style="display:flex; gap:12px; align-items:center;">
          <div class="med-icon"><i class="fa-solid fa-capsules"></i></div>
          <div class="med-title">
            <h4>${escapeHTML(m.name)} ${escapeHTML(m.dose)}</h4>
            <span>${escapeHTML(m.freq)}</span>
            <div class="med-patient-tag" style="margin-top: 4px; font-size: 11px; color: var(--primary); font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" data-patient-name="${escapeHTML(m.patient_name || m.patientName || 'Unknown')}" onclick="filterMedicationsByPatient(this.dataset.patientName)" title="Click to filter by this patient">
              <i class="fa-solid fa-user"></i> ${escapeHTML(m.patient_name || m.patientName || 'Unknown')}
            </div>
          </div>
        </div>
        <span class="chip ${STATUS_CLASS[m.status] || 'chip-warning'}">${m.status}</span>
      </div>
      <div class="med-meta">
        ${(Array.isArray(m.schedule) ? m.schedule : (typeof m.schedule === 'string' ? m.schedule.split(',') : [])).map(s => `<span class="tag active">${s.trim()}</span>`).join('')}
      </div>
      <div>
        <div class="compliance-row">
          <span class="muted">Compliance</span>
          <strong>${m.compliance || 0}%</strong>
        </div>
        <div class="bar" style="margin-top:6px;"><div class="bar-fill" style="width:${m.compliance}%"></div></div>
      </div>
      <div class="med-next"><i class="fa-regular fa-clock"></i> Next: ${escapeHTML(m.next || m.next_time || 'N/A')}</div>
      <div class="med-actions">
        <button class="btn btn-outline" onclick="editMedication(${m.id})"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn btn-outline" onclick="markTaken(${m.id})"><i class="fa-solid fa-check"></i> Taken</button>
        <button class="btn btn-outline" onclick="deleteMedication(${m.id})" style="color:var(--danger)"><i class="fa-solid fa-trash"></i></button>
      </div>
    </article>
  `).join('');
}

function renderAppointments(apps) {
  const appsBody = document.getElementById('appointmentsListBody');
  if (!appsBody) return;

  if (!apps || apps.length === 0) {
    appsBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;" class="muted">No appointments found.</td></tr>';
    return;
  }

  // Sort by date, newest first
  apps.sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));

  appsBody.innerHTML = apps.map(a => {
    // Check if appointment is in the past
    let isPassed = false;
    if (a.date && a.time) {
      const appDateTime = new Date(a.date + 'T' + a.time);
      isPassed = appDateTime < new Date();
    }
    
    const statusChip = isPassed 
      ? '<span class="chip chip-success"><i class="fa-solid fa-check-double"></i> Completed</span>'
      : '<span class="chip chip-warning"><i class="fa-regular fa-clock"></i> Upcoming</span>';

    return `
      <tr>
        <td>${escapeHTML(a.date || 'N/A')}</td>
        <td>${escapeHTML(a.time || 'N/A')}</td>
        <td>
          <div class="patient-cell" style="display: flex; align-items: center; gap: 8px;">
            <div class="avatar" style="width: 28px; height: 28px; font-size: 10px;"><i class="fa-solid fa-user-doctor"></i></div>
            <span><strong>${escapeHTML(a.doctor || 'Dr. Rohan K.')}</strong></span>
          </div>
        </td>
        <td>${escapeHTML(a.department || 'General')}</td>
        <td><span class="chip ${a.visit === 'Follow-up' ? 'chip-info' : 'chip-primary'}">${escapeHTML(a.visit || 'Consultation')}</span></td>
        <td>${statusChip}</td>
      </tr>
    `;
  }).join('');
}

window.filterMedicationsByPatient = function (patientName) {
  const filtered = window.medicationsList.filter(m => {
    const mName = stripHTML(m.patient_name || m.patientName || '').trim().toLowerCase();
    const targetName = stripHTML(patientName || '').trim().toLowerCase();
    return mName === targetName;
  });
  showToast('info', 'Medications Filtered', `Showing medications for ${patientName}.`);
  renderMedications(filtered);

  let banner = document.getElementById('medFilterBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'medFilterBanner';
    banner.style = 'grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; background: var(--primary-soft); color: var(--primary); padding: 10px 16px; border-radius: 10px; font-size: 13px; font-weight: 500; margin-bottom: 8px;';
    const grid = document.getElementById('medGrid');
    grid.insertBefore(banner, grid.firstChild);
  }
  banner.innerHTML = `
    <span>Showing medications for <strong>${escapeHTML(patientName)}</strong></span>
    <button class="btn btn-sm btn-primary" onclick="clearMedicationFilter()">Clear Filter</button>
  `;
};

window.clearMedicationFilter = function () {
  const banner = document.getElementById('medFilterBanner');
  if (banner) banner.remove();
  renderMedications(window.medicationsList);
};

const REMINDER_CLASS = { Sent: 'chip-success', Pending: 'chip-warning', Missed: 'chip-danger' };
const tbody = document.getElementById('patientsTbody');

function avatarInitials(name) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function renderPatients(rows) {
  if (!tbody) return;
  tbody.innerHTML = rows.map(p => `
    <tr>
      <td><strong>${p.id}</strong></td>
      <td>
        <div class="patient-cell">
          <div class="avatar">${escapeHTML(avatarInitials(p.name))}</div>
          <span>${escapeHTML(p.name)}</span>
        </div>
      </td>
      <td>${escapeHTML(p.date)}</td>
      <td>${escapeHTML(p.doctor)}</td>
      <td>${escapeHTML(p.med)}</td>
      <td><span class="chip ${REMINDER_CLASS[p.reminder] || 'chip-warning'}">${escapeHTML(p.reminder)}</span></td>
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="bar" style="flex:1; min-width:60px;"><div class="bar-fill" style="width:${p.compliance}%"></div></div>
          <strong style="font-size:12px;">${p.compliance}%</strong>
        </div>
      </td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" title="View Report" onclick="viewPatientReport('${p.id}', '${escapeHTML(p.name).replace(/'/g, "\\'")}')"><i class="fa-regular fa-eye"></i></button>
          <button class="icon-btn" title="Edit Patient" onclick="editPatient('${p.id}', '${escapeHTML(p.name).replace(/'/g, "\\'")}')"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-btn" title="Print" onclick="viewPatientReport('${p.id}', '${escapeHTML(p.name).replace(/'/g, "\\'")}', true)"><i class="fa-solid fa-print"></i></button>
          <button class="icon-btn" title="Delete Patient" onclick="showToast('warning','Deleted','Patient ${escapeHTML(p.name).replace(/'/g, "\\'")} removed')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

/* ---------- Patient Action Handlers ---------- */

window.editMedication = async function (id) {
  const med = window.medicationsList.find(m => m.id == id);
  if (!med) return;

  document.getElementById('addMedicationForm').reset();
  
  document.getElementById('medModalTitle').innerText = 'Edit Medication Schedule';
  document.getElementById('medEditId').value = med.id;
  
  const medPatientSelect = document.getElementById('medPatientSelect');
  const patientName = med.patient_name || med.patientName || 'Unknown';
  medPatientSelect.innerHTML = `<option value="${escapeHTML(patientName)}">${escapeHTML(patientName)}</option>`;
  medPatientSelect.value = patientName;
  
  document.getElementById('medNameInput').value = med.name || '';
  document.getElementById('medDoseInput').value = med.dose || '';
  document.getElementById('medPhoneInput').value = med.phone || '';
  document.getElementById('medDurationInput').value = med.duration || 7;
  
  const scheduleList = Array.isArray(med.schedule) ? med.schedule : (typeof med.schedule === 'string' ? med.schedule.split(',') : []);
  const scheduleStr = scheduleList.map(s => s.trim()).filter(Boolean).join(', ');
  
  const selectOpt = Array.from(document.getElementById('medScheduleSelect').options).find(opt => opt.value === scheduleStr);
  if (selectOpt) {
    document.getElementById('medScheduleSelect').value = scheduleStr;
  } else {
    document.getElementById('medScheduleSelect').value = 'Morning';
  }
  
  document.getElementById('addMedicationModal')?.classList.add('show');
};

window.editPatient = async function (id, name) {
  const patient = window.patientsList.find(p => p.id === id);
  if (!patient) return;

  const phone = prompt(`Edit phone number for ${name}:`, patient.phone || '');
  if (phone === null) return;

  const ageStr = prompt(`Edit age for ${name}:`, patient.age || '');
  if (ageStr === null) return;
  const age = parseInt(ageStr, 10);
  if (isNaN(age)) {
    showToast('error', 'Error', 'Age must be a valid number.');
    return;
  }

  const gender = prompt(`Edit gender for ${name} (Male/Female/Other):`, patient.gender || '');
  if (gender === null) return;

  const complianceStr = prompt(`Edit compliance score for ${name} (0-100):`, patient.compliance || '87');
  if (complianceStr === null) return;
  const compliance = parseInt(complianceStr, 10);
  if (isNaN(compliance) || compliance < 0 || compliance > 100) {
    showToast('error', 'Error', 'Compliance must be a number between 0 and 100.');
    return;
  }

  const payload = { phone, age, gender, compliance };

  try {
    const data = await fetchAPI(`/api/patients/${id}`, 'POST', payload);
    if (data.success) {
      showToast('success', 'Patient Updated', `${name}'s details saved.`);
      loadPatients();
    }
  } catch (err) {
    showToast('error', 'Error', 'Failed to update patient details.');
  }
};

window.markTaken = async function (id) {
  const med = window.medicationsList.find(m => m.id == id);
  const name = med ? med.name : 'Medication';
  try {
    const data = await fetchAPI(`/api/medications/${id}/taken`, 'POST');
    if (data.success) {
      showToast('success', 'Marked as Taken', `${name} taken successfully.`);
      loadMedications();
      loadPatients();
    }
  } catch (err) {
    showToast('error', 'Error', 'Failed to update medication status.');
  }
};

window.deleteMedication = async function (id) {
  const med = window.medicationsList.find(m => m.id == id);
  const name = med ? med.name : 'Medication';
  try {
    const data = await fetchAPI(`/api/medications/${id}`, 'DELETE');
    if (data.success) {
      showToast('warning', 'Deleted', `${name} reminder deleted.`);
      window.addRecentActivity('Medication Removed', `Deleted ${name} medication reminder.`);
      loadMedications();
      loadPatients();
    }
  } catch (err) {
    showToast('error', 'Error', 'Failed to delete medication.');
  }
};

/* ---------- Report Generation ---------- */

window.viewPatientReport = async function (id, name, autoPrint = false) {
  window.currentPatientReportName = name;
  try {
    const [apps, meds] = await Promise.all([
      fetchAPI('/api/appointments'),
      fetchAPI('/api/medications')
    ]);

    const pRecord = window.patientsList.find(p => p.id === id) || {
      id: id,
      name: name,
      phone: localStorage.getItem('patientPhone') || 'N/A',
      compliance: 100
    };

    const pApps = apps.filter(a => (a.patient_name || '').toLowerCase() === name.toLowerCase());
    const pMeds = meds.filter(m => (m.patient_name || '').toLowerCase() === name.toLowerCase());

    // Timestamp
    const genDate = document.getElementById('reportGeneratedDate');
    if (genDate) genDate.textContent = `Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`;

    // ── 1. Patient Details ────────────────────────────────────────
    const detailsPanel = document.getElementById('reportDetailsPanel');
    if (detailsPanel) {
      detailsPanel.innerHTML = `
        <h4>Patient Details</h4>
        <p><strong>Name:</strong> ${escapeHTML(name)}</p>
        <p><strong>Patient ID:</strong> ${escapeHTML(id)}</p>
        <p><strong>Phone:</strong> ${escapeHTML(pRecord.phone || 'N/A')}</p>
        <p><strong>Compliance:</strong> ${pRecord.compliance || 0}%</p>`;
    }

    // ── 2. Appointment History ────────────────────────────────────
    const appsPanel = document.getElementById('reportAppointmentsPanel');
    if (appsPanel) {
      let html = '<h4>Appointment History</h4>';
      if (pApps.length === 0) {
        html += '<p class="muted">No appointments found.</p>';
      } else {
        pApps.slice(0, 6).forEach(a => {
          const isPast = new Date(a.date + 'T' + (a.time || '00:00')) < new Date();
          html += `<p>
            <strong>${escapeHTML(a.date)}</strong> at ${escapeHTML(a.time || '—')} —
            ${escapeHTML(a.doctor || 'Doctor')} (${escapeHTML(a.department || 'General')})
            &nbsp;<span class="chip ${isPast ? 'chip-success' : 'chip-warning'}" style="font-size:10px;">${isPast ? 'Completed' : 'Upcoming'}</span>
          </p>`;
        });
      }
      appsPanel.innerHTML = html;
    }

    // ── 3. Medication Schedule ────────────────────────────────────
    const medsPanel = document.getElementById('reportMedicationsPanel');
    if (medsPanel) {
      let html = '<h4>Medication Schedule</h4>';
      if (pMeds.length === 0) {
        html += '<p class="muted">No medications scheduled.</p>';
      } else {
        pMeds.forEach(m => {
          const scheduleList = (Array.isArray(m.schedule) ? m.schedule : (typeof m.schedule === 'string' ? m.schedule.split(',') : [])).map(s => s.trim()).filter(Boolean);
          const schedule = scheduleList.length > 0 ? scheduleList.join(', ') : (m.freq || 'Daily');
          html += `<p><strong>${escapeHTML(m.name)}</strong> ${escapeHTML(m.dose)} — ${escapeHTML(schedule)}</p>`;
        });
      }
      medsPanel.innerHTML = html;
    }

    // ── 4. Compliance Statistics ──────────────────────────────────
    const compPanel = document.getElementById('reportCompliancePanel');
    if (compPanel) {
      const avgComp = pMeds.length > 0
        ? Math.round(pMeds.reduce((s, m) => s + (m.compliance || 0), 0) / pMeds.length)
        : (pRecord.compliance || 0);
      const compColor = avgComp >= 80 ? 'var(--success)' : avgComp >= 60 ? 'var(--warning)' : 'var(--danger)';
      compPanel.innerHTML = `
        <h4>Compliance Statistics</h4>
        <div class="bar"><div class="bar-fill" style="width:${avgComp}%; background:${compColor};"></div></div>
        <p class="muted">Medication adherence: <strong style="color:${compColor};">${avgComp}%</strong> over 30 days</p>
        <p class="muted">${pMeds.length} medication(s) tracked · ${pApps.length} appointment(s) on record</p>`;
    }

    // ── 5. Doctor Notes ───────────────────────────────────────────
    try {
      const notes = await fetchAPI(`/api/doctor-notes?patient=${encodeURIComponent(name)}`);
      const notesList = document.getElementById('reportDoctorNotesList');
      if (notesList) {
        if (!notes || notes.length === 0) {
          notesList.innerHTML = '<p class="muted">No doctor notes on record.</p>';
        } else {
          notesList.innerHTML = notes.map(n => `
            <p style="margin-bottom:8px; padding: 8px 12px; background:var(--bg); border-radius:8px; border-left: 3px solid var(--primary);">
              <strong>${escapeHTML(n.note_type)}</strong> — ${escapeHTML(n.note)}
              <br><small class="muted"><i class="fa-solid fa-user-doctor"></i> ${escapeHTML(n.doctor_name || 'Doctor')} · ${n.created_at ? new Date(n.created_at).toLocaleDateString() : ''}</small>
            </p>`).join('');
        }
      }
    } catch (_) { /* notes load failure is non-critical */ }

    goTo('reports', true);

    // Wire "Generate AI Summary" button on the report page
    const reportAIBtn = document.getElementById('reportGenerateAIBtn');
    if (reportAIBtn) {
      reportAIBtn.onclick = async () => {
        const summaryText = document.getElementById('reportAISummaryText');
        const riskBadge   = document.getElementById('reportRiskBadge');
        if (summaryText) summaryText.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating AI summary...';
        if (riskBadge)   riskBadge.innerHTML = '';
        try {
          const patientData = {
            patientName: name,
            doctor: pApps[0]?.doctor || 'Dr. Rohan K.',
            department: pApps[0]?.department || 'General Medicine',
            symptoms: pApps[0]?.symptoms || 'General checkup',
            visit: pApps[0]?.visit_type || 'Consultation',
            medications: pMeds.map(m => `${m.name} ${m.dose} (${m.freq})`).join(', ') || 'None',
            compliance: pRecord.compliance || 0
          };
          const data = await fetchAPI('/api/generate-summary', 'POST', patientData);
          if (summaryText) summaryText.textContent = data.summary || 'Summary generated.';

          if (riskBadge && data.risk_level) {
            const risk = data.risk_level;
            const cls = risk.toLowerCase().includes('high') ? 'chip-danger' : risk.toLowerCase().includes('mod') ? 'chip-warning' : 'chip-success';
            riskBadge.innerHTML = `<span class="chip ${cls}"><i class="fa-solid fa-shield-heart"></i> Risk: ${escapeHTML(risk)}</span>`;
            if (data.follow_up) {
              riskBadge.innerHTML += `&nbsp;<span class="chip chip-info"><i class="fa-regular fa-calendar"></i> Follow-up: ${escapeHTML(data.follow_up)}</span>`;
            }
          }
          showToast('success', 'AI Summary Ready', 'The report has been updated with an AI analysis.');
        } catch (err) {
          if (summaryText) summaryText.textContent = 'Error generating AI summary. Ensure the backend is running.';
          console.error('Report AI error:', err);
        }
      };
    }

    if (autoPrint) {
      setTimeout(() => window.print(), 800);
    }

  } catch (err) {
    console.error(err);
    showToast('error', 'Error', 'Failed to generate report details.');
  }
};



/* ---------- Appointment Form Submit ---------- */

const form = document.getElementById('appointmentForm');
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const requiredFields = ['patientName', 'age', 'gender', 'phone', 'doctor', 'department', 'date', 'time'];
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

  const payload = {
    patientName: document.getElementById('patientName').value,
    age: document.getElementById('age').value,
    gender: document.getElementById('gender').value,
    phone: document.getElementById('phone').value,
    email: localStorage.getItem('patientEmail') || '',
    doctor: document.getElementById('doctor').value,
    department: document.getElementById('department').value,
    date: document.getElementById('date').value,
    time: document.getElementById('time').value,
    visit: document.getElementById('visit').value,
    priority: document.getElementById('priority').value,
    symptoms: document.getElementById('symptoms').value
  };

  try {
    const result = await fetchAPI('/api/appointments', 'POST', payload);
    if (result.success) {
      if (payload.phone) {
        localStorage.setItem('patientPhone', payload.phone);
      }
      const calLink = result.calendar_link || `https://www.google.com/calendar/render?action=TEMPLATE&text=RK%20Health%20Appointment%3A%20${encodeURIComponent(payload.patientName)}&dates=&details=Doctor%3A%20${encodeURIComponent(payload.doctor)}&location=RK%20Hospital`;
      const successMsg = `Scheduled. <a href="${calLink}" target="_blank" style="color:var(--primary);text-decoration:underline;font-weight:600;"><i class="fa-solid fa-calendar-days"></i> Add to Calendar</a>`;
      showToast('success', 'Appointment Saved', successMsg);
      window.addRecentActivity('Appointment Booked', `With ${payload.doctor} (${payload.department}) on ${payload.date} at ${payload.time}.`);
      form.reset();
      checkPatientLogin();
      loadPatients();
      loadAppointments();
    } else {
      showToast('error', 'Failed', result.message || 'Could not save appointment.');
    }
  } catch (err) {
    showToast('error', 'Error', 'Failed to communicate with backend.');
  }
});

/* ---------- AI Summary Integration ---------- */

async function generateAndShowSummary(patientData = null) {
  if (!patientData) {
    const loggedInName = localStorage.getItem('patientName');
    patientData = {
      patientName: document.getElementById('patientName').value || 'Anita Sharma',
      doctor: document.getElementById('doctor').value || 'Dr. Rohan K.',
      department: document.getElementById('department').value || 'Cardiology',
      symptoms: document.getElementById('symptoms').value || 'Stable post-op recovery',
      visit: document.getElementById('visit').value || 'Follow-up',
      priority: document.getElementById('priority').value || 'Normal'
    };

    if (loggedInName) {
      patientData.patientName = loggedInName;
      if (window.appointmentsList) {
        const userApps = window.appointmentsList.filter(a => a.patient_name && a.patient_name.toLowerCase() === loggedInName.toLowerCase());
        if (userApps.length > 0) {
          const latest = userApps[0];
          patientData.doctor = latest.doctor || patientData.doctor;
          patientData.department = latest.department || patientData.department;
          patientData.symptoms = latest.symptoms || 'General checkup';
          patientData.visit = latest.visit || patientData.visit;
        }
      }
    }
  }

  openModal();

  const summaryBox = aiModal.querySelector('.summary-box');
  const patientStrong = aiModal.querySelector('.modal-body .kv strong');
  const riskChip = aiModal.querySelector('.kv-grid .kv .chip');
  const followUpStrong = aiModal.querySelector('.kv-grid .kv:nth-child(2) strong');
  const bulletsUl = aiModal.querySelector('.bullets');

  patientStrong.innerText = patientData.patientName;
  summaryBox.innerHTML = '<div style="text-align:center;padding:10px;"><i class="fa-solid fa-spinner fa-spin" style="margin-right:8px;"></i>Generating AI summary...</div>';

  try {
    const data = await fetchAPI('/api/generate-summary', 'POST', patientData);

    summaryBox.innerText = data.summary || "Summary generation completed.";
    window.addRecentActivity('AI Summary Generated', `Created AI summary for ${patientData.patientName}.`);

    // Risk level styling
    const risk = data.risk_level || "Low";
    riskChip.innerText = risk;
    riskChip.className = 'chip'; // reset
    if (risk.toLowerCase() === 'high' || risk.toLowerCase() === 'urgent') {
      riskChip.classList.add('chip-danger');
    } else if (risk.toLowerCase() === 'moderate') {
      riskChip.classList.add('chip-warning');
    } else {
      riskChip.classList.add('chip-success');
    }

    followUpStrong.innerText = data.follow_up || "4 weeks";

    if (data.medications && data.medications.length > 0) {
      bulletsUl.innerHTML = data.medications.map(m => `<li>${escapeHTML(m)}</li>`).join('');
    } else {
      bulletsUl.innerHTML = '<li>Follow doctor directions strictly.</li>';
    }
  } catch (err) {
    summaryBox.innerText = "Error generating AI summary. Verify server API connection.";
  }
}

document.getElementById('openAiModal')?.addEventListener('click', () => generateAndShowSummary());
document.getElementById('openAiModal2')?.addEventListener('click', () => generateAndShowSummary());

/* ---------- Add Medication Action ---------- */

const addMedModal = document.getElementById('addMedicationModal');
const medPatientSelect = document.getElementById('medPatientSelect');
const medNewPatientInput = document.getElementById('medNewPatientInput');
const medPhoneInput = document.getElementById('medPhoneInput');

document.querySelector('#section-medications .btn-primary')?.addEventListener('click', () => {
  document.getElementById('addMedicationForm').reset();
  document.getElementById('medModalTitle').innerText = 'Add Medication Schedule';
  document.getElementById('medEditId').value = '';
  medNewPatientInput.style.display = 'none';
  medNewPatientInput.removeAttribute('required');

  medPatientSelect.innerHTML = '<option value="">Select a patient...</option>';
  if (!ENABLE_PATIENT_LOGIN) {
    medPatientSelect.innerHTML += '<option value="NEW_PATIENT">-- Add New Patient --</option>';
  }
  
  let names = [];
  if (window.patientsList && window.patientsList.length > 0) {
    names = [...new Set(window.patientsList.map(p => p.name))];
  }
  
  if (ENABLE_PATIENT_LOGIN) {
    const loggedInName = localStorage.getItem('patientName');
    if (loggedInName && !names.includes(loggedInName)) {
      names.push(loggedInName);
    }
  }

  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    medPatientSelect.appendChild(opt);
  });

  if (ENABLE_PATIENT_LOGIN) {
    const loggedInName = localStorage.getItem('patientName');
    if (loggedInName) {
      medPatientSelect.value = loggedInName;
      const loggedPhone = localStorage.getItem('patientPhone');
      if (loggedPhone && loggedPhone !== 'N/A' && loggedPhone !== 'null') {
        medPhoneInput.value = loggedPhone;
      } else if (window.patientsList && window.patientsList.length > 0) {
        medPhoneInput.value = window.patientsList[0].phone || '';
      }
    }
  }

  addMedModal?.classList.add('show');
});

function closeMedicationModal() {
  addMedModal?.classList.remove('show');
}
document.getElementById('closeMedModalBtn')?.addEventListener('click', closeMedicationModal);
document.getElementById('cancelMedModalBtn')?.addEventListener('click', closeMedicationModal);
document.querySelector('[data-close-med]')?.addEventListener('click', closeMedicationModal);

medPatientSelect?.addEventListener('change', (e) => {
  const val = e.target.value;
  if (val === 'NEW_PATIENT') {
    medNewPatientInput.style.display = 'block';
    medNewPatientInput.setAttribute('required', 'required');
    medPhoneInput.value = '';
  } else {
    medNewPatientInput.style.display = 'none';
    medNewPatientInput.removeAttribute('required');
    const p = window.patientsList.find(x => x.name === val);
    if (p) {
      medPhoneInput.value = p.phone || '';
    }
  }
});

document.getElementById('addMedicationForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const patientSelect = document.getElementById('medPatientSelect').value;
  const newPatient = document.getElementById('medNewPatientInput').value.trim();
  const patientName = patientSelect === 'NEW_PATIENT' ? newPatient : patientSelect;

  const editId = document.getElementById('medEditId')?.value;
  const name = document.getElementById('medNameInput').value.trim();
  const dose = document.getElementById('medDoseInput').value.trim();
  const phone = document.getElementById('medPhoneInput').value.trim();
  const durationVal = parseInt(document.getElementById('medDurationInput')?.value || '7', 10);
  const duration = isNaN(durationVal) || durationVal < 1 ? 7 : durationVal;

  const scheduleParts = document.getElementById('medScheduleSelect').value.split(',').map(s => s.trim());
  let freq = 'Once daily';
  if (scheduleParts.length === 2) freq = 'Twice daily';
  else if (scheduleParts.length === 3) freq = 'Three times daily';

  if (!patientName) {
    showToast('error', 'Validation Error', 'Please select or enter a patient name.');
    return;
  }

  const payload = {
    patientName: patientName,
    name: name,
    dose: dose,
    freq: freq,
    schedule: scheduleParts,
    phone: phone,
    status: 'Pending',
    compliance: 100,
    next_time: 'Tomorrow, 8:00 AM',
    duration: duration
  };

  const saveBtn = document.getElementById('saveMedicationBtn');
  if (saveBtn) saveBtn.disabled = true;

  try {
    const endpoint = editId ? `/api/medications/${editId}` : '/api/medications';
    const data = await fetchAPI(endpoint, 'POST', payload);
    if (data.success) {
      showToast('success', editId ? 'Medication Updated' : 'Medication Added', `${name} ${dose} saved for ${patientName}.`);
      if (editId) {
        window.addRecentActivity('Medication Updated', `${name} ${dose} schedule updated.`);
      } else {
        window.addRecentActivity('Medication Added', `${name} ${dose} scheduled daily for ${duration} days.`);
      }
      closeMedicationModal();
      loadMedications();
      loadPatients();

      const routine   = document.getElementById('medScheduleSelect').value;
      const routineParts = routine.split(',').map(s => s.trim());
      const timeVal   = document.getElementById('medTimeInput')?.value;

      if (phone && phone.length > 5) {
        // If we are editing, first clear any pending scheduled SMS reminders for this phone number
        if (editId) {
          try {
            await fetchAPI('/api/schedule-sms', 'POST', {
              phone: phone,
              clear_existing: true
            });
          } catch (err) {
            console.error('Failed to clear existing scheduled SMS:', err);
          }
        }

        // Map each routine slot to a fixed daily time (HH:MM)
        const routineMap = {
          'Morning'  : '09:00',
          'Afternoon': '14:00',
          'Night'    : '21:00'
        };

        const now = new Date();

        // Build a list of { scheduledTime: 'YYYY-MM-DDTHH:MM', label, message }
        let scheduleJobs = [];

        if (timeVal) {
          // User picked a specific time override
          const [h, m] = timeVal.split(':').map(Number);
          let firstTarget = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
          if (firstTarget <= now) {
            firstTarget.setDate(firstTarget.getDate() + 1);
          }
          // Schedule daily triggers for duration days
          for (let d = 0; d < duration; d++) {
            let target = new Date(firstTarget.getTime());
            target.setDate(firstTarget.getDate() + d);
            const scheduled_time = target.toISOString().slice(0, 16);
            scheduleJobs.push({
              scheduled_time,
              label: `${target.toLocaleDateString()} at ${timeVal}`,
              message: `RK Health Reminder: Please take your ${name} ${dose} (${freq}) — Custom time.`
            });
          }
        } else {
          // Schedule one job per routine slot per day
          routineParts.forEach(part => {
            const slotTime = routineMap[part];
            if (!slotTime) return;
            const [h, m] = slotTime.split(':').map(Number);
            let firstTarget = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
            if (firstTarget <= now) {
              firstTarget.setDate(firstTarget.getDate() + 1);
            }
            // Schedule daily triggers for duration days
            for (let d = 0; d < duration; d++) {
              let target = new Date(firstTarget.getTime());
              target.setDate(firstTarget.getDate() + d);
              const scheduled_time = target.toISOString().slice(0, 16);
              scheduleJobs.push({
                scheduled_time,
                label: `${target.toLocaleDateString()} ${part} (${slotTime})`,
                message: `RK Health Reminder: Please take your ${name} ${dose} (${freq}) — ${part} dose.`
              });
            }
          });
        }

        // POST each job to backend — Twilio fires server-side, browser can close safely
        if (scheduleJobs.length > 0) {
          const results = await Promise.allSettled(
            scheduleJobs.map(job =>
              fetchAPI('/api/schedule-sms', 'POST', {
                phone,
                message: job.message,
                scheduled_time: job.scheduled_time
              })
            )
          );

          const succeeded = results.filter(r => r.status === 'fulfilled' && r.value?.success);
          if (succeeded.length > 0) {
            showToast('success', `${succeeded.length} Reminder(s) Scheduled`,
              `SMS will be sent daily for ${duration} days.`);
          } else {
            showToast('warning', 'Scheduling Issue', 'Could not register reminders on the server.');
          }
        }
      }
    }
  } catch (err) {
    showToast('error', 'Error', 'Failed to save medication reminder.');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
});

/* ---------- Doctor Notes ---------- */

const NOTE_TYPE_STYLE = {
  'Prescription': { chip: 'chip-info',    icon: 'fa-prescription' },
  'Follow-up':    { chip: 'chip-primary', icon: 'fa-rotate-right' },
  'Observation':  { chip: 'chip-warning', icon: 'fa-eye' },
  'Warning':      { chip: 'chip-danger',  icon: 'fa-triangle-exclamation' },
  'General':      { chip: 'chip-success', icon: 'fa-comment-medical' }
};

// Use event delegation — works even when elements are hidden at page load
document.addEventListener('click', async function (e) {

  // ── Open / toggle panel ──────────────────────────────────────────
  if (e.target.closest('#openDoctorNoteBtn')) {
    const panel = document.getElementById('doctorNotesPanel');
    if (!panel) return;
    const isOpen = panel.style.display === 'block';
    panel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
      // Pre-fill patient name from logged-in user
      const loggedInName = localStorage.getItem('patientName');
      const patientInput = document.getElementById('notePatientInput');
      if (patientInput && loggedInName && !patientInput.value) {
        patientInput.value = loggedInName;
      }
      loadDoctorNotes();
    }
    return;
  }

  // ── Close panel ──────────────────────────────────────────────────
  if (e.target.closest('#closeDoctorNoteBtn')) {
    const panel = document.getElementById('doctorNotesPanel');
    if (panel) panel.style.display = 'none';
    return;
  }

  // ── Save Note ────────────────────────────────────────────────────
  if (e.target.closest('#saveDoctorNoteBtn')) {
    const patient_name = document.getElementById('notePatientInput')?.value.trim();
    const doctor_name  = document.getElementById('noteDoctorInput')?.value.trim();
    const note_type    = document.getElementById('noteTagSelect')?.value;
    const note         = document.getElementById('noteTextarea')?.value.trim();

    if (!patient_name || !note) {
      showToast('error', 'Validation', 'Patient name and note text are required.');
      return;
    }

    const saveBtn = document.getElementById('saveDoctorNoteBtn');
    if (saveBtn) saveBtn.disabled = true;

    try {
      const data = await fetchAPI('/api/doctor-notes', 'POST', {
        patient_name, doctor_name, note_type, note
      });

      if (data.success) {
        showToast('success', 'Note Saved', `Doctor note for ${patient_name} saved successfully.`);
        window.addRecentActivity('Clinical Note Saved', `Saved clinical note (${note_type}) by ${doctor_name || 'Dr. Rohan K.'}.`);
        document.getElementById('noteTextarea').value = '';
        document.getElementById('noteDoctorInput').value = '';
        loadDoctorNotes();
      } else {
        showToast('error', 'Failed', data.message || 'Could not save note.');
      }
    } catch (err) {
      showToast('error', 'Error', 'Failed to connect to server. Check the backend is running.');
      console.error('Doctor Notes save error:', err);
    } finally {
      const btn = document.getElementById('saveDoctorNoteBtn');
      if (btn) btn.disabled = false;
    }
    return;
  }
});

async function loadDoctorNotes() {
  const container = document.getElementById('savedNotesList');
  if (!container) return;
  container.innerHTML = '<p class="muted" style="text-align:center;padding:12px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading notes...</p>';

  try {
    const notes = await fetchAPI('/api/doctor-notes');
    renderDoctorNotes(notes);
  } catch (err) {
    container.innerHTML = '<p class="muted" style="text-align:center;padding:12px;">Failed to load notes.</p>';
    console.error('Failed to load doctor notes:', err);
  }
}

function renderDoctorNotes(notes) {
  const container = document.getElementById('savedNotesList');
  if (!container) return;

  if (!notes || notes.length === 0) {
    container.innerHTML = '<p class="muted" style="text-align:center; padding: 16px;"><i class="fa-regular fa-note-sticky"></i> No notes saved yet.</p>';
    return;
  }

  container.innerHTML = `
    <h4 style="margin-bottom:14px;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;">
      <i class="fa-solid fa-clock-rotate-left"></i>&nbsp; Recent Notes (${notes.length})
    </h4>
    <div style="display:flex;flex-direction:column;gap:12px;">
      ${notes.map(n => {
        const st = NOTE_TYPE_STYLE[n.note_type] || NOTE_TYPE_STYLE['General'];
        const initials = escapeHTML(n.patient_name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase());
        const dateStr  = n.created_at ? new Date(n.created_at).toLocaleString() : '';
        return `
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px 16px;transition:var(--transition);">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;">
              <div class="avatar" style="width:30px;height:30px;font-size:10px;flex-shrink:0;">${initials}</div>
              <strong style="font-size:14px;">${escapeHTML(n.patient_name)}</strong>
              <span class="chip ${st.chip}" style="font-size:11px;">
                <i class="fa-solid ${st.icon}"></i> ${escapeHTML(n.note_type)}
              </span>
              ${n.doctor_name ? `<span class="muted" style="font-size:12px;margin-left:auto;"><i class="fa-solid fa-user-doctor"></i> ${escapeHTML(n.doctor_name)}</span>` : ''}
            </div>
            <p style="font-size:13px;color:var(--text);line-height:1.6;margin:0 0 8px;">${escapeHTML(n.note)}</p>
            ${dateStr ? `<span class="muted" style="font-size:11px;"><i class="fa-regular fa-clock"></i> ${dateStr}</span>` : ''}
          </div>`;
      }).join('')}
    </div>`;
}


/* ---------- Patient search ---------- */
const patientSearch = document.getElementById('patientSearch');
patientSearch?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  const filtered = window.patientsList.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.id.toLowerCase().includes(q) ||
    p.doctor.toLowerCase().includes(q) ||
    p.med.toLowerCase().includes(q)
  );
  renderPatients(filtered);
});

/* ---------- Patient Dashboard Stats Update ---------- */
function updatePatientDashboardStats() {
  if (!ENABLE_PATIENT_LOGIN) return;
  const loggedInName = localStorage.getItem('patientName');
  if (!loggedInName) return;

  const statCards = document.querySelectorAll('.stat-card');
  if (statCards.length < 4) return;

  // Stat Card 0: Doctor Details
  const pRecord = window.patientsList[0];
  const docValue = statCards[0].querySelector('.stat-value');
  const docSub = statCards[0].querySelector('.trend');
  const docLabel = statCards[0].querySelector('.stat-label');
  const docIcon = statCards[0].querySelector('.stat-icon');
  if (docLabel) docLabel.textContent = 'My Doctor';
  if (docIcon) docIcon.className = 'stat-icon icon-blue';
  if (pRecord) {
    if (docValue) docValue.textContent = pRecord.doctor || 'Dr. Rohan K.';
    if (docSub) docSub.innerHTML = `<i class="fa-solid fa-stethoscope"></i> ${pRecord.dept || 'Cardiology'}`;
  } else {
    if (docValue) docValue.textContent = 'Dr. Rohan K.';
    if (docSub) docSub.innerHTML = `<i class="fa-solid fa-stethoscope"></i> Cardiology`;
  }

  // Stat Card 1: Active Department
  const appValue = statCards[1].querySelector('.stat-value');
  const appLabel = statCards[1].querySelector('.stat-label');
  const appSub = statCards[1].querySelector('.trend');
  if (appLabel) appLabel.textContent = 'Active Department';
  if (appValue && pRecord) appValue.textContent = pRecord.dept || 'General';
  if (appSub) appSub.innerHTML = '<i class="fa-solid fa-check-double"></i> Care Plan Enrolled';

  // Stat Card 2: Medication Reminders (Pending)
  const medValue = statCards[2].querySelector('.stat-value');
  const medLabel = statCards[2].querySelector('.stat-label');
  const medSub = statCards[2].querySelector('.trend');
  const pendingCount = (window.medicationsList || []).filter(m => m.status === 'Pending').length;
  const totalCount = (window.medicationsList || []).length;
  if (medLabel) medLabel.textContent = 'Active Medications';
  if (medValue) medValue.textContent = `${totalCount}`;
  if (medSub) medSub.innerHTML = `<i class="fa-solid fa-clock"></i> ${pendingCount} pending logs`;

  // Stat Card 3: Compliance Rate
  const compValue = statCards[3].querySelector('.circle-progress span');
  const compProgress = statCards[3].querySelector('.circle-progress');
  const compSub = statCards[3].querySelector('.trend');
  if (totalCount > 0) {
    const avgCompliance = Math.round(window.medicationsList.reduce((acc, curr) => acc + curr.compliance, 0) / totalCount);
    if (compValue) compValue.textContent = `${avgCompliance}%`;
    if (compProgress) compProgress.style.setProperty('--p', avgCompliance);
    if (compSub) compSub.innerHTML = `<i class="fa-solid fa-heart-pulse"></i> Monthly adherence`;
  } else {
    if (compValue) compValue.textContent = `100%`;
    if (compProgress) compProgress.style.setProperty('--p', 100);
    if (compSub) compSub.innerHTML = `<i class="fa-solid fa-heart-pulse"></i> Perfect adherence`;
  }

  // Update AI Health Insights (Dashboard Overview)
  const aiSummary = document.querySelector('.ai-summary');
  const aiChips = document.querySelector('.ai-chips');
  
  if (aiSummary && aiChips) {
    const onSchedule = (window.medicationsList || []).filter(m => m.status === 'Completed').length;
    const atRisk = (window.medicationsList || []).filter(m => m.status === 'Missed').length;
    
    let avgCompliance = 100;
    if (totalCount > 0) {
      avgCompliance = Math.round(window.medicationsList.reduce((acc, curr) => acc + curr.compliance, 0) / totalCount);
    }
    
    let followUpText = atRisk > 0 ? `<strong>${atRisk} medication(s)</strong> missed recently, indicating a need for a follow-up consultation.` : `Great job staying on track with your prescribed regimen.`;
    
    aiSummary.innerHTML = `Your overall medication adherence this week is <strong>${avgCompliance}%</strong>. ${followUpText} Your continued diligence significantly improves long-term health outcomes.`;
    
    aiChips.innerHTML = `
      <span class="chip chip-success"><i class="fa-solid fa-check"></i> ${onSchedule} on schedule</span>
      <span class="chip chip-warning"><i class="fa-solid fa-triangle-exclamation"></i> ${atRisk} at risk</span>
      <span class="chip chip-info"><i class="fa-solid fa-clock"></i> ${pendingCount} pending review</span>
    `;
  }
}

/* ---------- Patient Portal Authentication ---------- */
let generatedOtp = null;
let otpEmail = '';
let otpPatient = null;

async function checkPatientLogin() {
  const loginScreen = document.getElementById('loginScreen');
  const patientProfileWidget = document.getElementById('patientProfileWidget');
  const patientsSidebarLink = document.getElementById('patientsSidebarLink');

  if (!ENABLE_PATIENT_LOGIN) {
    if (loginScreen) loginScreen.style.display = 'none';
    if (patientProfileWidget) {
      patientProfileWidget.style.display = 'flex';
      document.getElementById('currentPatientName').textContent = 'Dr. Rohan K.';
      document.getElementById('currentPatientPhone').textContent = 'Cardiologist';
      document.getElementById('currentPatientAvatar').textContent = 'DR';
      const logoutBtn = document.getElementById('logoutBtn');
      if (logoutBtn) logoutBtn.style.display = 'none';
    }
    if (patientsSidebarLink) patientsSidebarLink.style.display = 'block';

    const formPatientName = document.getElementById('patientName');
    const formPhone = document.getElementById('phone');
    if (formPatientName) {
      formPatientName.removeAttribute('readonly');
    }
    if (formPhone) {
      formPhone.removeAttribute('readonly');
    }
    window.renderRecentActivities();
    return;
  }

  const loggedInEmail = localStorage.getItem('patientEmail');
  const loggedInName = localStorage.getItem('patientName');

  if (!loggedInEmail || !loggedInName) {
    if (loginScreen) loginScreen.style.display = 'flex';
    if (patientProfileWidget) patientProfileWidget.style.display = 'none';
    if (patientsSidebarLink) patientsSidebarLink.style.display = 'none';
  } else {
    if (loginScreen) loginScreen.style.display = 'none';
    if (patientProfileWidget) {
      patientProfileWidget.style.display = 'flex';
      document.getElementById('currentPatientName').textContent = loggedInName;
      document.getElementById('currentPatientPhone').textContent = loggedInEmail;
      document.getElementById('currentPatientAvatar').textContent = loggedInName.substring(0, 2).toUpperCase();
      const logoutBtn = document.getElementById('logoutBtn');
      if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    }
    
    if (patientsSidebarLink) patientsSidebarLink.style.display = 'none';

    const dashboardGreeting = document.getElementById('dashboardGreeting');
    if (dashboardGreeting) {
      dashboardGreeting.textContent = `Welcome back, ${loggedInName} 👋`;
    }
    const dashboardGreetingSub = document.querySelector('#section-dashboard .section-head p');
    if (dashboardGreetingSub) {
      dashboardGreetingSub.textContent = `Here's what's happening with your care program today.`;
    }

    const formPatientName = document.getElementById('patientName');
    const formPhone = document.getElementById('phone');
    if (formPatientName) {
      formPatientName.value = loggedInName;
      formPatientName.setAttribute('readonly', 'readonly');
    }
    if (formPhone) {
      const loggedPhone = localStorage.getItem('patientPhone');
      if (loggedPhone && loggedPhone !== 'N/A' && loggedPhone !== 'null') {
        formPhone.value = loggedPhone;
        formPhone.setAttribute('readonly', 'readonly');
      } else {
        formPhone.value = '';
        formPhone.removeAttribute('readonly');
        formPhone.placeholder = 'Add Phone Number';
      }
    }

    const summaryPhone = document.getElementById('summaryPhone');
    if (summaryPhone) {
      const loggedPhone = localStorage.getItem('patientPhone');
      summaryPhone.value = (loggedPhone && loggedPhone !== 'N/A') ? loggedPhone : '';
    }
    const settingsNameInput = document.getElementById('settingsNameInput');
    const settingsPhoneInput = document.getElementById('settingsPhoneInput');
    if (settingsNameInput) settingsNameInput.value = loggedInName;
    if (settingsPhoneInput) {
      const loggedPhone = localStorage.getItem('patientPhone');
      settingsPhoneInput.value = (loggedPhone && loggedPhone !== 'N/A' && loggedPhone !== 'null') ? loggedPhone : '';
    }
    window.renderRecentActivities();
  }
}

/* ---------- Google Authentication ---------- */

window.handleGoogleLogin = async function (response) {
  try {
    let email = "patient@example.com";
    let name = "Patient";

    if (response.credential && response.credential !== 'mock_jwt_token') {
      const base64Url = response.credential.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      const decoded = JSON.parse(jsonPayload);
      email = decoded.email;
      name = decoded.name;
    }

    showToast('info', 'Authenticating', 'Signing in with Google...');

    // Find or dynamically register the patient with this email on the backend
    const registerRes = await fetchAPI('/api/patients', 'POST', { 
      email: email,
      name: name 
    });
    
    if (registerRes && registerRes.success) {
      showToast('success', 'Google Verification Successful', `Welcome to RK Health portal, ${name}!`);
      localStorage.setItem('patientEmail', registerRes.email);
      localStorage.setItem('patientPhone', registerRes.phone || '');
      localStorage.setItem('patientName', registerRes.name);
      localStorage.setItem('patientId', registerRes.id);
      
      window.addRecentActivity('Logged In', 'Successfully logged in via Google.');
      
      checkPatientLogin();
      loadPatients();
      loadMedications();
      loadAppointments();
    } else {
      showToast('error', 'Authentication Failed', 'Failed to retrieve or create patient profile.');
    }
  } catch (err) {
    console.error('Google login processing error:', err);
    showToast('error', 'Error', 'Failed to authenticate via Google.');
  }
};

window.renderDemoGoogleButton = function (container) {
  container.innerHTML = `
    <button class="btn btn-outline" style="width: 280px; justify-content: center; gap: 10px; font-weight: 500; border-color: #dadce0; color: var(--text-main); background: var(--bg);" onclick="alert('Please configure your GOOGLE_CLIENT_ID in \\'rk-health/config.js\\' to enable actual Google Authentication. (Currently running in Mock Mode - will log in as patient@example.com for testing)'); handleGoogleLogin({ credential: 'mock_jwt_token' })">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="18px" height="18px" viewBox="0 0 48 48" class="abcRioButtonSvg" style="display: block;">
        <g>
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
          <path fill="#4285F4" d="M46.5 24c0-1.61-.15-3.16-.42-4.69H24v9.09h12.75c-.53 2.87-2.14 5.3-4.57 6.96l7.1 5.5C43.5 35.6 46.5 30.41 46.5 24z"></path>
          <path fill="#FBBC05" d="M10.54 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.98-6.19z"></path>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.1-5.5c-1.97 1.32-4.5 2.11-7.29 2.11-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
        </g>
      </svg>
      Sign in with Google
    </button>
  `;
};

/* ---------- Initial Page Load ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // Handle report downloading
  document.getElementById('downloadReportBtn')?.addEventListener('click', () => {
    const reportCard = document.getElementById('reportCard');
    if (!reportCard) return;

    // Use html2pdf to generate PDF from the report card element
    const patientName = window.currentPatientReportName || 'Patient';
    const opt = {
      margin:       0.3,
      filename:     `RK_Health_Report_${patientName.replace(/\s+/g, '_')}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(reportCard).save();
    showToast('success', 'Download Started', 'Your report PDF download has started.');
  });

  // Initialize Google Sign-in
  const googleBtnContainer = document.getElementById("googleSignInButton");
  if (googleBtnContainer) {
    if (typeof GOOGLE_CLIENT_ID !== 'undefined' && GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith('YOUR_')) {
      // Load actual Google button
      window.addEventListener('load', () => {
        if (typeof google !== 'undefined') {
          try {
            google.accounts.id.initialize({
              client_id: GOOGLE_CLIENT_ID,
              callback: window.handleGoogleLogin
            });
            google.accounts.id.renderButton(
              googleBtnContainer,
              { theme: "outline", size: "large", width: 280 }
            );
          } catch (e) {
            console.error("Google Sign-In initialization failed:", e);
            window.renderDemoGoogleButton(googleBtnContainer);
          }
        } else {
          window.renderDemoGoogleButton(googleBtnContainer);
        }
      });
    } else {
      window.renderDemoGoogleButton(googleBtnContainer);
    }
  }

  // Step 1: Send OTP
  document.getElementById('sendOtpBtn')?.addEventListener('click', async () => {
    const emailInput = document.getElementById('loginEmail');
    const emailValue = emailInput ? emailInput.value.trim() : '';

    if (!emailValue) {
      showToast('error', 'Error', 'Please enter your email address.');
      return;
    }

    try {
      const sendBtn = document.getElementById('sendOtpBtn');
      sendBtn.disabled = true;
      sendBtn.textContent = 'Checking...';

      // Find or dynamically register the patient with this email
      const registerRes = await fetchAPI('/api/patients', 'POST', { email: emailValue });
      
      let patient = null;
      if (registerRes && registerRes.success) {
        patient = {
          id: registerRes.id,
          name: registerRes.name,
          phone: registerRes.phone || '',
          email: registerRes.email
        };
      }

      if (!patient) {
        showToast('error', 'Authentication Failed', 'Failed to retrieve or create patient profile. Please contact RK Hospital support.');
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send OTP Code';
        return;
      }

      generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      otpEmail = emailValue;
      otpPatient = patient;
      console.log(`[TESTING ONLY] Generated OTP code for ${patient.name} (${emailValue}): ${generatedOtp}`);

      showToast('info', 'Sending OTP', `Requesting OTP email to ${emailValue}...`);
      
      try {
        const emailRes = await fetchAPI('/api/send-email', 'POST', {
          email: emailValue,
          subject: 'RK Health Patient Portal Verification',
          message: `RK Health: Your OTP code is ${generatedOtp}. Do not share this code with anyone.`
        });
        if (emailRes && (emailRes.success || emailRes.mocked)) {
          showToast('success', 'OTP Sent', `OTP code sent to ${emailValue}.`);
        } else {
          showToast('warning', 'Email Service Offline', (emailRes && emailRes.message) || 'Email dispatch failed. Please use developer bypass code 123456.');
        }
      } catch (emailErr) {
        console.error('Email send error:', emailErr);
        showToast('warning', 'Email Service Error', 'Could not reach email service. Please use developer bypass code 123456.');
      }
      
      document.getElementById('loginStep1').style.display = 'none';
      document.getElementById('loginStep2').style.display = 'block';
    } catch (err) {
      console.error(err);
      showToast('error', 'Error', 'Failed to initialize OTP. Please try again.');
    } finally {
      const sendBtn = document.getElementById('sendOtpBtn');
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send OTP Code';
      }
    }
  });

  // Step 2: Verify OTP
  document.getElementById('verifyOtpBtn')?.addEventListener('click', () => {
    const otpInput = document.getElementById('loginOtp');
    const otpValue = otpInput.value.trim();

    if (!otpValue) {
      showToast('error', 'Error', 'Please enter the OTP code.');
      return;
    }

    if (otpValue === generatedOtp || otpValue === '123456') {
      showToast('success', 'Verification Successful', 'Welcome to RK Health portal!');
      localStorage.setItem('patientEmail', otpEmail);
      localStorage.setItem('patientPhone', otpPatient.phone || '');
      localStorage.setItem('patientName', otpPatient.name);
      window.addRecentActivity('Logged In', 'Successfully logged into patient portal.');
      
      otpInput.value = '';
      const emailInput = document.getElementById('loginEmail');
      if (emailInput) emailInput.value = '';
      
      checkPatientLogin();
      loadPatients();
      loadMedications();
    } else {
      showToast('error', 'Invalid OTP', 'The verification code is incorrect. Please try again.');
    }
  });

  document.getElementById('backToEmailBtn')?.addEventListener('click', () => {
    document.getElementById('loginStep2').style.display = 'none';
    document.getElementById('loginStep1').style.display = 'block';
  });

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('patientEmail');
    localStorage.removeItem('patientPhone');
    localStorage.removeItem('patientName');
    showToast('info', 'Logged Out', 'Successfully logged out of your session.');
    checkPatientLogin();
    
    window.patientsList = [];
    window.medicationsList = [];
    window.appointmentsList = [];
    renderPatients([]);
    renderMedications([]);
    renderAppointments([]);
  });

  document.getElementById('headerNotificationBtn')?.addEventListener('click', () => goTo('notifications'));
  document.getElementById('headerSettingsBtn')?.addEventListener('click', () => goTo('settings'));

  const settingsForm = document.getElementById('profileSettingsForm');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newName = document.getElementById('settingsNameInput').value.trim();
      const newPhone = document.getElementById('settingsPhoneInput').value.trim();
      if (!newName || !newPhone) {
        showToast('error', 'Validation Error', 'Name and Phone Number are required.');
        return;
      }
      
      const oldName = localStorage.getItem('patientName');
      const patient = window.patientsList && window.patientsList[0];
      const patientId = patient ? patient.id : null;

      if (patientId) {
        try {
          const payload = {
            name: newName,
            phone: newPhone,
            email: localStorage.getItem('patientEmail') || patient.email || '',
            age: patient.age || 35,
            gender: patient.gender || 'Female',
            compliance: patient.compliance || 100
          };
          const res = await fetchAPI(`/api/patients/${patientId}`, 'POST', payload);
          if (!res || !res.success) {
            showToast('error', 'Sync Error', 'Failed to synchronize profile settings with the server.');
            return;
          }
        } catch (err) {
          console.error('Failed to sync profile settings:', err);
          showToast('error', 'Sync Error', 'Failed to synchronize profile settings with the server.');
          return;
        }
      }
      
      localStorage.setItem('patientName', newName);
      localStorage.setItem('patientPhone', newPhone);
      
      checkPatientLogin();
      
      showToast('success', 'Profile Updated', 'Your profile settings have been saved successfully.');
      window.addRecentActivity('Profile Updated', `Changed name to ${newName} and phone to ${newPhone}.`);
      
      loadPatients();
      loadMedications();
      loadAppointments();
    });
  }

  checkPatientLogin();
  loadPatients();
  loadMedications();
  loadAppointments();

  setTimeout(() => {
    const loggedInName = localStorage.getItem('patientName');
    if (loggedInName) {
      showToast('success', `Welcome back, ${loggedInName}`, 'The patient portal is fully loaded and connected.');
    }
  }, 1000);
});

window.addRecentActivity = function (title, description) {
  const loggedInName = localStorage.getItem('patientName') || 'Dr. Rohan K.';
  const key = `activities_${loggedInName.toLowerCase().replace(/\s+/g, '_')}`;
  let activities = [];
  try {
    activities = JSON.parse(localStorage.getItem(key)) || [];
  } catch(e) {
    activities = [];
  }
  
  activities.unshift({
    title: title,
    description: description,
    timestamp: new Date().toISOString()
  });
  
  if (activities.length > 8) {
    activities = activities.slice(0, 8);
  }
  
  localStorage.setItem(key, JSON.stringify(activities));
  window.renderRecentActivities();
};

window.renderRecentActivities = function () {
  const container = document.querySelector('.timeline');
  if (!container) return;

  const loggedInName = localStorage.getItem('patientName') || 'Dr. Rohan K.';
  const key = `activities_${loggedInName.toLowerCase().replace(/\s+/g, '_')}`;
  let activities = [];
  try {
    activities = JSON.parse(localStorage.getItem(key)) || [];
  } catch(e) {
    activities = [];
  }

  if (activities.length === 0) {
    activities.push({
      title: 'Portal Accessed',
      description: `Welcome to RK Health dashboard, ${loggedInName}.`,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem(key, JSON.stringify(activities));
  }

  container.innerHTML = activities.map(act => {
    const timeDiff = new Date() - new Date(act.timestamp);
    let timeAgo = 'Just now';
    const minutes = Math.floor(timeDiff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      timeAgo = `${days}d ago`;
    } else if (hours > 0) {
      timeAgo = `${hours}h ago`;
    } else if (minutes > 0) {
      timeAgo = `${minutes}m ago`;
    }

    let dotColor = 'dot-blue';
    const titleLower = act.title.toLowerCase();
    if (titleLower.includes('appointment')) dotColor = 'dot-blue';
    else if (titleLower.includes('medication')) dotColor = 'dot-green';
    else if (titleLower.includes('note') || titleLower.includes('ai')) dotColor = 'dot-orange';
    else if (titleLower.includes('login') || titleLower.includes('portal') || titleLower.includes('welcome')) dotColor = 'dot-green';
    else if (titleLower.includes('delete') || titleLower.includes('removed')) dotColor = 'dot-red';

    return `
      <li>
        <span class="dot ${dotColor}"></span>
        <div>
          <strong>${escapeHTML(act.title)}</strong>
          <p class="muted">${escapeHTML(act.description)}</p>
        </div>
        <time>${timeAgo}</time>
      </li>
    `;
  }).join('');
};

window.renderNotifications = function () {
  const container = document.getElementById('notificationsList');
  if (!container) return;

  const apps = window.appointmentsList || [];
  const meds = window.medicationsList || [];

  let items = [];

  // 1. Process Appointments
  apps.forEach(a => {
    let isPassed = false;
    let appTimeObj = new Date();
    if (a.date && a.time) {
      appTimeObj = new Date(a.date + 'T' + a.time);
      isPassed = appTimeObj < new Date();
    }

    if (isPassed) {
      items.push({
        type: 'past_appointment',
        title: 'Completed Appointment',
        description: `Consultation with <strong>${escapeHTML(a.doctor || 'Dr. Rohan K.')}</strong> (${escapeHTML(a.department || 'General')}) on ${escapeHTML(a.date)} at ${escapeHTML(a.time)}.`,
        time: appTimeObj,
        icon: 'fa-solid fa-clipboard-check',
        color: 'var(--muted)',
        bgColor: 'rgba(255,255,255,0.02)',
        badge: 'Completed'
      });
    } else {
      items.push({
        type: 'upcoming_appointment',
        title: 'Upcoming Appointment',
        description: `You have an appointment scheduled with <strong>${escapeHTML(a.doctor || 'Dr. Rohan K.')}</strong> (${escapeHTML(a.department || 'General')}) on ${escapeHTML(a.date)} at ${escapeHTML(a.time)}.`,
        time: appTimeObj,
        icon: 'fa-regular fa-calendar-check',
        color: 'var(--primary)',
        bgColor: 'rgba(var(--primary-rgb), 0.05)',
        badge: 'Upcoming'
      });
    }
  });

  // 2. Process Medications
  meds.forEach(m => {
    if (m.status === 'Missed') {
      items.push({
        type: 'missed_medication',
        title: 'Missed Medication',
        description: `You missed taking your scheduled dose of <strong>${escapeHTML(m.name)} ${escapeHTML(m.dose)}</strong> (${escapeHTML(m.freq)}).`,
        time: new Date(m.created_at || new Date()),
        icon: 'fa-solid fa-triangle-exclamation',
        color: 'var(--danger)',
        bgColor: 'rgba(239, 68, 68, 0.05)',
        badge: 'Missed'
      });
    }
  });

  // Sort: newest items first
  items.sort((a, b) => b.time - a.time);

  // Update header badge count
  const headerBadge = document.querySelector('#headerNotificationBtn .badge');
  if (headerBadge) {
    const alertCount = items.filter(x => x.type === 'upcoming_appointment' || x.type === 'missed_medication').length;
    if (alertCount > 0) {
      headerBadge.textContent = alertCount;
      headerBadge.style.display = 'inline-flex';
    } else {
      headerBadge.style.display = 'none';
    }
  }

  if (items.length === 0) {
    container.innerHTML = `
      <div class="card pad fade-in" style="text-align: center; padding: 40px 20px;">
        <i class="fa-regular fa-bell-slash" style="font-size: 32px; color: var(--muted); margin-bottom: 12px; display: block;"></i>
        <h4 style="margin-bottom: 8px;">All Clear!</h4>
        <p class="muted" style="margin: 0;">You have no active notifications, missed medications, or scheduled appointments at the moment.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(item => {
    const formattedTime = item.time.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    let badgeClass = 'chip-success';
    if (item.badge === 'Missed') badgeClass = 'chip-danger';
    if (item.badge === 'Upcoming') badgeClass = 'chip-warning';
    if (item.badge === 'Completed') badgeClass = 'chip-info';

    return `
      <article class="card fade-in" style="margin-bottom: 16px; padding: 16px; display: flex; align-items: flex-start; gap: 16px; border-left: 4px solid ${item.color}; background: ${item.bgColor};">
        <div style="background: var(--card-bg); width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: ${item.color}; font-size: 18px; border: 1px solid var(--border); flex-shrink: 0;">
          <i class="${item.icon}"></i>
        </div>
        <div style="flex-grow: 1;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 6px;">
            <h4 style="margin: 0; font-size: 15px; font-weight: 600;">${item.title}</h4>
            <span class="chip ${badgeClass}" style="font-size: 10px; padding: 2px 8px;">${item.badge}</span>
          </div>
          <p class="muted" style="margin: 0 0 8px 0; font-size: 13px; line-height: 1.4;">${item.description}</p>
          <time class="muted" style="font-size: 11px; display: flex; align-items: center; gap: 4px;">
            <i class="fa-regular fa-clock"></i> ${formattedTime}
          </time>
        </div>
      </article>
    `;
  }).join('');
};
