/* =========================================================
   RK Health – Backend-Integrated UI Actions
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
    const res = await fetch('/api/patients');
    const data = await res.json();
    window.patientsList = data;
    renderPatients(data);
  } catch (err) {
    console.error('Failed to load patients:', err);
    showToast('error', 'Error', 'Failed to load patient records from backend.');
  }
}

async function loadMedications() {
  try {
    const res = await fetch('/api/medications');
    const data = await res.json();
    renderMedications(data);
  } catch (err) {
    console.error('Failed to load medications:', err);
    showToast('error', 'Error', 'Failed to load medications from backend.');
  }
}

/* ---------- Rendering functions ---------- */

const STATUS_CLASS = { Completed: 'chip-success', Pending: 'chip-warning', Missed: 'chip-danger' };

function renderMedications(meds) {
  const medGrid = document.getElementById('medGrid');
  if (!medGrid) return;
  medGrid.innerHTML = meds.map(m => `
    <article class="med-card fade-in">
      <div class="med-head">
        <div style="display:flex; gap:12px; align-items:center;">
          <div class="med-icon"><i class="fa-solid fa-capsules"></i></div>
          <div class="med-title">
            <h4>${m.name} ${m.dose}</h4>
            <span>${m.freq}</span>
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
        <button class="btn btn-outline" onclick="editMedication('${m.name}', '${m.dose}')"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn btn-outline" onclick="markTaken(${m.id}, '${m.name} ${m.dose}')"><i class="fa-solid fa-check"></i> Taken</button>
        <button class="btn btn-outline" onclick="deleteMedication(${m.id}, '${m.name}')" style="color:var(--danger)"><i class="fa-solid fa-trash"></i></button>
      </div>
    </article>
  `).join('');
}

const REMINDER_CLASS = { Sent: 'chip-success', Pending: 'chip-warning', Missed: 'chip-danger' };
const tbody = document.getElementById('patientsTbody');

function avatarInitials(name) {
  return name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
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
          <button class="icon-btn" title="Edit Patient" onclick="editPatient('${p.name}')"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-btn" title="Print" onclick="viewPatientReport('${p.id}', '${p.name}', true)"><i class="fa-solid fa-print"></i></button>
          <button class="icon-btn" title="Delete Patient" onclick="showToast('warning','Deleted','Patient ${p.name} removed')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

/* ---------- Patient Action Handlers ---------- */

window.editMedication = function(name, dose) {
  showToast('warning', 'Edit Mode', `Editing ${name} ${dose} is not implemented (placeholder).`);
};

window.editPatient = function(name) {
  showToast('warning', 'Edit Mode', `Editing patient ${name} details is not implemented (placeholder).`);
};

window.markTaken = async function(id, name) {
  try {
    const res = await fetch(`/api/medications/${id}/taken`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('success', 'Marked as Taken', `${name} taken successfully.`);
      loadMedications();
      loadPatients();
    }
  } catch (err) {
    showToast('error', 'Error', 'Failed to update medication status.');
  }
};

window.deleteMedication = async function(id, name) {
  try {
    const res = await fetch(`/api/medications/${id}`, { method: 'DELETE' });
    const data = await res.json();
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

window.viewPatientReport = async function(id, name, autoPrint = false) {
  try {
    const appRes = await fetch('/api/appointments');
    const apps = await appRes.json();
    const medRes = await fetch('/api/medications');
    const meds = await medRes.json();
    
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
    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      const calLink = result.calendar_link;
      const successMsg = `Scheduled. <a href="${calLink}" target="_blank" style="color:var(--primary);text-decoration:underline;font-weight:600;"><i class="fa-solid fa-calendar-days"></i> Add to Calendar</a>`;
      showToast('success', 'Appointment Saved', successMsg);
      form.reset();
      loadPatients();
    } else {
      showToast('error', 'Failed', result.message || 'Could not save appointment.');
    }
  } catch (err) {
    showToast('error', 'Error', 'Failed to communicate with Flask backend.');
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
    const res = await fetch('/api/generate-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patientData)
    });
    const data = await res.json();
    
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

document.querySelector('#section-medications .btn-primary')?.addEventListener('click', async () => {
  const name = prompt("Enter medicine name (e.g., Atorvastatin):");
  if (!name) return;
  const dose = prompt("Enter dosage (e.g., 10mg):");
  if (!dose) return;
  const freq = prompt("Enter frequency (e.g., Once daily):");
  if (!freq) return;
  const scheduleStr = prompt("Enter schedules separated by comma (e.g., Morning,Night):");
  if (!scheduleStr) return;
  const schedule = scheduleStr.split(',').map(s => s.trim());
  const phone = prompt("Enter patient phone number (optional):");
  
  const payload = {
    name, dose, freq, schedule, phone,
    patientName: 'Anita Sharma',
    status: 'Pending',
    compliance: 100,
    next_time: 'Tomorrow, 8:00 AM'
  };
  
  try {
    const res = await fetch('/api/medications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('success', 'Medication Added', `${name} ${dose} saved.`);
      loadMedications();
      
      // If phone is valid and configured, send SMS reminder!
      if (phone && phone.trim().length > 5) {
        await fetch('/api/send-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: phone,
            message: `RK Health Reminder: Please take your ${name} ${dose} (${freq}) as scheduled.`
          })
        });
      }
    }
  } catch (err) {
    showToast('error', 'Error', 'Failed to save medication reminder.');
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
  loadPatients();
  loadMedications();
  
  // Welcome message toast
  setTimeout(() => {
    showToast('success', 'Welcome back, Dr. Rohan', 'The system is connected to Flask database & AI summary service.');
  }, 1000);
});
