/* =========================================================
   RK Health – Backend-Integrated UI Actions
   ========================================================= */

// APPS_SCRIPT_URL is loaded globally from config.js. When running on localhost, we default to the local Flask API.
async function fetchAPI(endpoint, method = 'GET', body = null) {
  if (APPS_SCRIPT_URL && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    if (method === 'GET') {
      const action = endpoint.split('/').pop(); // 'patients', 'medications', or 'appointments'
      const response = await fetch(`${APPS_SCRIPT_URL}?action=${action}`);
      return response.json();
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
      } else if (endpoint.startsWith('/api/patients/')) {
        action = 'updatePatient';
        payload.id = endpoint.split('/').pop();
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
    return response.json();
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
    renderPatients(data);
  } catch (err) {
    console.error('Failed to load patients:', err);
    showToast('error', 'Error', 'Failed to load patient records.');
  }
}

async function loadMedications() {
  try {
    const data = await fetchAPI('/api/medications');
    renderMedications(data);
  } catch (err) {
    console.error('Failed to load medications:', err);
    showToast('error', 'Error', 'Failed to load medications.');
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
            <h4>${m.name} ${m.dose}</h4>
            <span>${m.freq}</span>
            <div class="med-patient-tag" style="margin-top: 4px; font-size: 11px; color: var(--primary); font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" onclick="filterMedicationsByPatient('${m.patient_name || m.patientName || 'Unknown'}')" title="Click to filter by this patient">
              <i class="fa-solid fa-user"></i> ${m.patient_name || m.patientName || 'Unknown'}
            </div>
          </div>
        </div>
        <span class="chip ${STATUS_CLASS[m.status] || 'chip-warning'}">${m.status}</span>
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
        <button class="btn btn-outline" onclick="editMedication(${m.id}, '${m.name}', '${m.dose}')"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn btn-outline" onclick="markTaken(${m.id}, '${m.name} ${m.dose}')"><i class="fa-solid fa-check"></i> Taken</button>
        <button class="btn btn-outline" onclick="deleteMedication(${m.id}, '${m.name}')" style="color:var(--danger)"><i class="fa-solid fa-trash"></i></button>
      </div>
    </article>
  `).join('');
}

window.filterMedicationsByPatient = function (patientName) {
  const filtered = window.medicationsList.filter(m => (m.patient_name || m.patientName || '').toLowerCase() === patientName.toLowerCase());
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
    <span>Showing medications for <strong>${patientName}</strong></span>
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
          <div class="avatar">${avatarInitials(p.name)}</div>
          <span>${p.name}</span>
        </div>
      </td>
      <td>${p.date}</td>
      <td>${p.doctor}</td>
      <td>${p.med}</td>
      <td><span class="chip ${REMINDER_CLASS[p.reminder] || 'chip-warning'}">${p.reminder}</span></td>
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="bar" style="flex:1; min-width:60px;"><div class="bar-fill" style="width:${p.compliance}%"></div></div>
          <strong style="font-size:12px;">${p.compliance}%</strong>
        </div>
      </td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" title="View Report" onclick="viewPatientReport('${p.id}', '${p.name}')"><i class="fa-regular fa-eye"></i></button>
          <button class="icon-btn" title="Edit Patient" onclick="editPatient('${p.id}', '${p.name}')"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-btn" title="Print" onclick="viewPatientReport('${p.id}', '${p.name}', true)"><i class="fa-solid fa-print"></i></button>
          <button class="icon-btn" title="Delete Patient" onclick="showToast('warning','Deleted','Patient ${p.name} removed')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

/* ---------- Patient Action Handlers ---------- */

window.editMedication = async function (id, name, dose) {
  const newName = prompt("Edit medicine name:", name);
  if (newName === null) return;

  const newDose = prompt("Edit dosage (e.g., 10mg):", dose);
  if (newDose === null) return;

  const freq = prompt("Edit frequency (e.g., Once daily):");
  if (freq === null) return;

  const complianceStr = prompt("Edit compliance score (0-100):", "100");
  if (complianceStr === null) return;
  const compliance = parseInt(complianceStr, 10);
  if (isNaN(compliance) || compliance < 0 || compliance > 100) {
    showToast('error', 'Error', 'Compliance must be a number between 0 and 100.');
    return;
  }

  const payload = { name: newName, dose: newDose, freq, compliance };

  try {
    const data = await fetchAPI(`/api/medications/${id}`, 'POST', payload);
    if (data.success) {
      showToast('success', 'Medication Updated', `${newName} details saved.`);
      loadMedications();
      loadPatients();
    }
  } catch (err) {
    showToast('error', 'Error', 'Failed to update medication details.');
  }
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

window.markTaken = async function (id, name) {
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

window.deleteMedication = async function (id, name) {
  try {
    const data = await fetchAPI(`/api/medications/${id}`, 'DELETE');
    if (data.success) {
      showToast('warning', 'Deleted', `${name} reminder deleted.`);
      loadMedications();
      loadPatients();
    }
  } catch (err) {
    showToast('error', 'Error', 'Failed to delete medication.');
  }
};

/* ---------- Report Generation ---------- */

window.viewPatientReport = async function (id, name, autoPrint = false) {
  try {
    const apps = await fetchAPI('/api/appointments');
    const meds = await fetchAPI('/api/medications');

    const pRecord = window.patientsList.find(p => p.id === id);
    if (!pRecord) return;

    const pApps = apps.filter(a => a.patient_name.toLowerCase() === name.toLowerCase());
    const pMeds = meds.filter(m => m.patient_name.toLowerCase() === name.toLowerCase());

    // 1. Details
    const detailsDiv = document.querySelector('#section-reports .report-grid > div:nth-child(1)');
    if (detailsDiv) {
      detailsDiv.innerHTML = `
        <h4>Patient Details</h4>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Patient ID:</strong> ${id}</p>
        <p><strong>Phone:</strong> ${pRecord.phone || '+91 98xxxxxx'}</p>
      `;
    }

    // 2. Appointments
    const appDiv = document.querySelector('#section-reports .report-grid > div:nth-child(2)');
    if (appDiv) {
      let html = '<h4>Appointment History</h4>';
      if (pApps.length === 0) {
        html += '<p class="muted">No history found</p>';
      } else {
        pApps.forEach(a => {
          html += `<p>${a.date} — ${a.doctor} (${a.department})</p>`;
        });
      }
      appDiv.innerHTML = html;
    }

    // 3. Medications
    const medDiv = document.querySelector('#section-reports .report-grid > div:nth-child(3)');
    if (medDiv) {
      let html = '<h4>Medication Schedule</h4>';
      if (pMeds.length === 0) {
        html += '<p class="muted">No medications scheduled</p>';
      } else {
        pMeds.forEach(m => {
          html += `<p>${m.name} ${m.dose} — ${m.freq}</p>`;
        });
      }
      medDiv.innerHTML = html;
    }

    // 4. Compliance
    const compDiv = document.querySelector('#section-reports .report-grid > div:nth-child(4)');
    if (compDiv) {
      compDiv.innerHTML = `
        <h4>Compliance Statistics</h4>
        <div class="bar"><div class="bar-fill" style="width:${pRecord.compliance}%"></div></div>
        <p class="muted">Adherence ${pRecord.compliance}% over 30 days</p>
      `;
    }

    // 5. Notes
    const summaryP = document.querySelector('#section-reports .report-section:nth-of-type(1) p');
    if (summaryP) {
      summaryP.innerText = `Patient compliance stands at ${pRecord.compliance}%. Adherence to the medication plan is recommended to achieve optimal results.`;
    }

    const docP = document.querySelector('#section-reports .report-section:nth-of-type(2) p');
    if (docP) {
      if (pApps.length > 0 && pApps[0].symptoms) {
        docP.innerText = `Presented symptoms: ${pApps[0].symptoms}. Appointment scheduled for ${pApps[0].date} at ${pApps[0].time} with ${pApps[0].doctor}.`;
      } else {
        docP.innerText = "No acute symptoms reported. Keep active lifestyle and follow instructions.";
      }
    }

    goTo('reports');

    if (autoPrint) {
      setTimeout(() => window.print(), 500);
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
      const calLink = result.calendar_link || `https://www.google.com/calendar/render?action=TEMPLATE&text=RK%20Health%20Appointment%3A%20${encodeURIComponent(payload.patientName)}&dates=&details=Doctor%3A%20${encodeURIComponent(payload.doctor)}&location=RK%20Hospital`;
      const successMsg = `Scheduled. <a href="${calLink}" target="_blank" style="color:var(--primary);text-decoration:underline;font-weight:600;"><i class="fa-solid fa-calendar-days"></i> Add to Calendar</a>`;
      showToast('success', 'Appointment Saved', successMsg);
      form.reset();
      loadPatients();
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
    patientData = {
      patientName: document.getElementById('patientName').value || 'Anita Sharma',
      doctor: document.getElementById('doctor').value || 'Dr. Rohan K.',
      department: document.getElementById('department').value || 'Cardiology',
      symptoms: document.getElementById('symptoms').value || 'Stable post-op recovery',
      visit: document.getElementById('visit').value || 'Follow-up',
      priority: document.getElementById('priority').value || 'Normal'
    };
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
      bulletsUl.innerHTML = data.medications.map(m => `<li>${m}</li>`).join('');
    } else {
      bulletsUl.innerHTML = '<li>Follow doctor directions strictly.</li>';
    }
  } catch (err) {
    summaryBox.innerText = "Error generating AI summary. Verify server API connection.";
  }
}

document.getElementById('openAiModal')?.addEventListener('click', () => {
  generateAndShowSummary({
    patientName: 'Anita Sharma',
    doctor: 'Dr. Rohan K.',
    department: 'Cardiology',
    symptoms: 'Patient shows stable heart rhythm and mild fatigue.',
    visit: 'Follow-up',
    priority: 'Normal'
  });
});
document.getElementById('openAiModal2')?.addEventListener('click', () => {
  generateAndShowSummary({
    patientName: 'Anita Sharma',
    doctor: 'Dr. Rohan K.',
    department: 'Cardiology',
    symptoms: 'Patient shows stable heart rhythm and mild fatigue.',
    visit: 'Follow-up',
    priority: 'Normal'
  });
});
document.getElementById('genSummaryBtn')?.addEventListener('click', () => generateAndShowSummary());

/* ---------- Add Medication Action ---------- */

const addMedModal = document.getElementById('addMedicationModal');
const medPatientSelect = document.getElementById('medPatientSelect');
const medNewPatientInput = document.getElementById('medNewPatientInput');
const medPhoneInput = document.getElementById('medPhoneInput');

document.querySelector('#section-medications .btn-primary')?.addEventListener('click', () => {
  document.getElementById('addMedicationForm').reset();
  medNewPatientInput.style.display = 'none';
  medNewPatientInput.removeAttribute('required');

  medPatientSelect.innerHTML = '<option value="">Select a patient...</option><option value="NEW_PATIENT">-- Add New Patient --</option>';
  if (window.patientsList && window.patientsList.length > 0) {
    const names = [...new Set(window.patientsList.map(p => p.name))];
    names.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      medPatientSelect.appendChild(opt);
    });
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

  let patientName = medPatientSelect.value;
  if (patientName === 'NEW_PATIENT') {
    patientName = medNewPatientInput.value.trim();
  }

  if (!patientName) {
    showToast('error', 'Error', 'Please select or enter a patient name.');
    return;
  }

  const name = document.getElementById('medNameInput').value.trim();
  const dose = document.getElementById('medDoseInput').value.trim();
  const freq = document.getElementById('medFreqSelect').value;
  const scheduleStr = document.getElementById('medScheduleInput').value.trim();
  const schedule = scheduleStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
  const phone = medPhoneInput.value.trim();

  const payload = {
    name, dose, freq, schedule, phone,
    patientName,
    status: 'Pending',
    compliance: 100,
    next_time: 'Tomorrow, 8:00 AM'
  };

  const saveBtn = document.getElementById('saveMedicationBtn');
  if (saveBtn) saveBtn.disabled = true;

  try {
    const data = await fetchAPI('/api/medications', 'POST', payload);
    if (data.success) {
      showToast('success', 'Medication Added', `${name} ${dose} saved for ${patientName}.`);
      closeMedicationModal();
      loadMedications();
      loadPatients();

      if (phone && phone.length > 5) {
        await fetchAPI('/api/send-sms', 'POST', {
          phone: phone,
          message: `RK Health Reminder: Please take your ${name} ${dose} (${freq}) as scheduled.`
        });
      }
    }
  } catch (err) {
    showToast('error', 'Error', 'Failed to save medication reminder.');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
});

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

/* ---------- Initial Page Load ---------- */
document.addEventListener('DOMContentLoaded', () => {
  /* ---------- Doctor Profile Switcher ---------- */
  const profileDropdown = document.getElementById('userProfileDropdown');
  const dropdownMenu = document.getElementById('profileDropdownMenu');
  const currentAvatar = document.getElementById('currentDoctorAvatar');
  const currentName = document.getElementById('currentDoctorName');
  const currentSpec = document.getElementById('currentDoctorSpecialty');
  const dashboardGreeting = document.getElementById('dashboardGreeting');

  profileDropdown?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu?.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    dropdownMenu?.classList.remove('show');
  });

  dropdownMenu?.querySelectorAll('li').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownMenu.querySelectorAll('li').forEach(li => li.classList.remove('active'));
      item.classList.add('active');
      
      const docId = item.getAttribute('data-doc-id');
      const name = item.getAttribute('data-name');
      const spec = item.getAttribute('data-spec');
      const avatar = item.getAttribute('data-avatar');
      
      if (currentAvatar) currentAvatar.textContent = avatar;
      if (currentName) currentName.textContent = name;
      if (currentSpec) currentSpec.textContent = spec;
      if (dashboardGreeting) {
        dashboardGreeting.textContent = `Good morning, Dr. ${name.split(' ')[1]} 👋`;
      }
      
      showToast('success', 'Profile Switched', `Switched to ${name}'s dashboard.`);
      dropdownMenu.classList.remove('show');
    });
  });

  loadPatients();
  loadMedications();

  // Welcome message toast
  setTimeout(() => {
    showToast('success', 'Welcome back, Dr. Rohan', 'The system is connected to Flask database & AI summary service.');
  }, 1000);
});
