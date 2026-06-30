/**
 * RK Health – Google Apps Script Serverless Backend
 * Handles CRUD operations, syncing data to Google Sheets, and serving API responses.
 */

const SPREADSHEET_ID = "1Ax6RHHZR2TmR4sPK6-TWqReCP9dMXazydZygqsWKc6I";

/**
 * Access a sheet by name. Automatically inserts sheet if not found.
 */
function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

/**
 * GET Handler for URL requests.
 * Endpoint: WebAppURL?action=[patients|appointments|medications]
 */
function doGet(e) {
  const action = e.parameter.action;
  
  try {
    if (action === "patients") {
      return responseSuccess(getTableData("patients"));
    } else if (action === "appointments") {
      return responseSuccess(getTableData("appointments"));
    } else if (action === "medications") {
      return responseSuccess(getTableData("medications"));
    } else {
      return responseError("Invalid GET action requested.");
    }
  } catch (err) {
    return responseError(err.toString());
  }
}

/**
 * POST Handler for creating, updating, and deleting entries.
 * Endpoint: WebAppURL
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    // Invalidate caches on mutation
    if (["addAppointment", "addMedication", "medicationTaken", "deleteMedication", "updatePatient", "updateMedication", "getOrCreatePatient"].includes(action)) {
      try {
        const cache = CacheService.getScriptCache();
        cache.removeAll(["RK_HEALTH_patients", "RK_HEALTH_appointments", "RK_HEALTH_medications"]);
      } catch(err) {}
    }
    
    if (action === "addAppointment") {
      return responseSuccess(addAppointment(data));
    } else if (action === "addMedication") {
      return responseSuccess(addMedication(data));
    } else if (action === "medicationTaken") {
      return responseSuccess(medicationTaken(data.id));
    } else if (action === "deleteMedication") {
      return responseSuccess(deleteMedication(data.id));
    } else if (action === "updatePatient") {
      return responseSuccess(updatePatient(data.id, data));
    } else if (action === "updateMedication") {
      return responseSuccess(updateMedication(data.id, data));
    } else if (action === "sendEmail") {
      return responseSuccess(sendEmailAction(data));
    } else if (action === "sendSMS") {
      return responseSuccess(sendSMSAction(data));
    } else if (action === "getOrCreatePatient") {
      return responseSuccess(getOrCreatePatient(data));
    } else {
      return responseError("Invalid POST action requested.");
    }
  } catch (err) {
    return responseError(err.toString());
  }
}

/**
 * Retrieves tabular values from a sheet and converts them to a JSON array.
 */
function getTableData(sheetName) {
  const cache = CacheService.getScriptCache();
  const cacheKey = "RK_HEALTH_" + sheetName;
  try {
    const cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch(e) {}

  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  
  const headers = values[0];
  const list = [];
  for (let i = 1; i < values.length; i++) {
    let row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[i][j];
    }
    list.push(row);
  }
  
  try {
    cache.put(cacheKey, JSON.stringify(list), 300); // 5 minutes TTL
  } catch(e) {}
  
  return list;
}

/**
 * Adds an appointment and links/updates the corresponding patient profile.
 */
function addAppointment(data) {
  const sheet = getSheet("appointments");
  const pSheet = getSheet("patients");
  
  const patientName = data.patientName;
  const age = data.age;
  const gender = data.gender;
  const phone = data.phone;
  const doctor = data.doctor;
  const department = data.department;
  const dateVal = data.date;
  const timeVal = data.time;
  const visit = data.visit || "First Visit";
  const priority = data.priority || "Normal";
  const symptoms = data.symptoms || "";
  
  // Find or generate patient ID
  let patientId = "";
  const pValues = pSheet.getDataRange().getValues();
  for (let i = 1; i < pValues.length; i++) {
    if (pValues[i][1].toString().toLowerCase() === patientName.toLowerCase()) {
      patientId = pValues[i][0];
      // Update dynamic patient info
      pSheet.getRange(i+1, 3).setValue(phone);
      pSheet.getRange(i+1, 4).setValue(age);
      pSheet.getRange(i+1, 5).setValue(gender);
      break;
    }
  }
  
  // Create patient profile if new
  if (!patientId) {
    patientId = "RK-" + Math.floor(1000 + Math.random() * 9000);
    pSheet.appendRow([patientId, patientName, phone, age, gender, 87, "Pending"]);
  }
  
  const appointmentId = sheet.getLastRow();
  sheet.appendRow([
    appointmentId,
    patientId,
    patientName,
    doctor,
    department,
    dateVal,
    timeVal,
    visit,
    priority,
    symptoms,
    "", // calendar link generated on frontend
    new Date().toISOString()
  ]);
  
  return { success: true, patient_id: patientId, message: "Appointment saved." };
}

/**
 * Adds a medication schedule entry.
 */
function addMedication(data) {
  const sheet = getSheet("medications");
  const id = sheet.getLastRow();
  sheet.appendRow([
    id,
    data.patientName,
    data.name,
    data.dose,
    data.freq,
    data.schedule ? data.schedule.join(",") : "",
    "Pending",
    100,
    "Tomorrow, 8:00 AM",
    data.phone,
    new Date().toISOString()
  ]);
  return { success: true, message: "Medication added." };
}

/**
 * Marks a medication status as completed and boosts dynamic compliance.
 */
function medicationTaken(medId) {
  const sheet = getSheet("medications");
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0].toString() === medId.toString()) {
      const currentCompliance = parseInt(values[i][7] || 100);
      sheet.getRange(i + 1, 7).setValue("Completed");
      sheet.getRange(i + 1, 8).setValue(Math.min(100, currentCompliance + 5));
      break;
    }
  }
  return { success: true, message: "Medication updated." };
}

/**
 * Deletes a medication row.
 */
function deleteMedication(medId) {
  const sheet = getSheet("medications");
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0].toString() === medId.toString()) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return { success: true, message: "Medication deleted." };
}

/**
 * Updates a medication's name, dose, frequency, and compliance.
 */
function updateMedication(medId, data) {
  const sheet = getSheet("medications");
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0].toString() === medId.toString()) {
      sheet.getRange(i + 1, 3).setValue(data.name);
      sheet.getRange(i + 1, 4).setValue(data.dose);
      sheet.getRange(i + 1, 5).setValue(data.freq);
      sheet.getRange(i + 1, 8).setValue(data.compliance);
      break;
    }
  }
  return { success: true, message: "Medication updated." };
}

/**
 * Updates a patient's demographics and compliance score.
 */
function updatePatient(patientId, data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // 1. Update patient profile in 'patients' sheet
  const sheet = ss.getSheetByName("patients");
  const values = sheet.getDataRange().getValues();
  let oldName = "";
  for (let i = 1; i < values.length; i++) {
    if (values[i][0].toString() === patientId.toString()) {
      oldName = values[i][1];
      if (data.name) {
        sheet.getRange(i + 1, 2).setValue(data.name);
      }
      sheet.getRange(i + 1, 3).setValue(data.phone);
      sheet.getRange(i + 1, 4).setValue(data.age);
      sheet.getRange(i + 1, 5).setValue(data.gender);
      sheet.getRange(i + 1, 6).setValue(data.compliance);
      break;
    }
  }

  // 2. Propagate name update if it has changed
  if (data.name && oldName && oldName.toLowerCase() !== data.name.toLowerCase()) {
    // Update medications sheet
    const medSheet = ss.getSheetByName("medications");
    if (medSheet) {
      const medValues = medSheet.getDataRange().getValues();
      for (let i = 1; i < medValues.length; i++) {
        if (medValues[i][1] && medValues[i][1].toLowerCase() === oldName.toLowerCase()) {
          medSheet.getRange(i + 1, 2).setValue(data.name);
        }
      }
    }

    // Update appointments sheet
    const apptSheet = ss.getSheetByName("appointments");
    if (apptSheet) {
      const apptValues = apptSheet.getDataRange().getValues();
      for (let i = 1; i < apptValues.length; i++) {
        if (apptValues[i][1] && apptValues[i][1].toLowerCase() === oldName.toLowerCase()) {
          apptSheet.getRange(i + 1, 2).setValue(data.name);
        }
      }
    }
  }

  return { success: true, message: "Patient updated." };
}

/**
 * Return successful HTTP Output response.
 */
function responseSuccess(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Return error HTTP Output response.
 */
function responseError(msg) {
  return ContentService.createTextOutput(JSON.stringify({ error: true, message: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Sends a real email from the connected Google Account.
 */
function sendEmailAction(data) {
  const email = data.email;
  const subject = data.subject || "RK Health Verification";
  const message = data.message;
  
  if (!email) {
    return { success: false, message: "Email is required." };
  }
  
  try {
    MailApp.sendEmail(email, subject, message);
    return { success: true, message: "Email sent successfully." };
  } catch (err) {
    return { success: false, error: err.toString(), message: "Failed to dispatch email via MailApp." };
  }
}

/**
 * Triggers notification. Simulates SMS via Google Apps Script by dispatching email to the registered patient.
 */
function sendSMSAction(data) {
  const phone = data.phone;
  const message = data.message;
  
  if (!phone) {
    return { success: false, message: "Phone is required." };
  }
  
  let email = "";
  try {
    const pSheet = getSheet("patients");
    const pValues = pSheet.getDataRange().getValues();
    const searchPhone = phone.toString().replace(/\D/g, "");
    const cleanSearch = searchPhone.substring(searchPhone.length - 10);
    
    for (let i = 1; i < pValues.length; i++) {
      const dbPhone = pValues[i][2] ? pValues[i][2].toString().replace(/\D/g, "") : "";
      const cleanDb = dbPhone.substring(dbPhone.length - 10);
      if (cleanSearch && cleanDb && cleanSearch === cleanDb) {
        const headers = pValues[0];
        let emailIdx = -1;
        for (let j = 0; j < headers.length; j++) {
          if (headers[j].toString().toLowerCase() === "email") {
            emailIdx = j;
            break;
          }
        }
        if (emailIdx !== -1) {
          email = pValues[i][emailIdx];
        }
        break;
      }
    }
  } catch (err) {
    // Lookup failure
  }
  
  if (email) {
    try {
      MailApp.sendEmail(email, "RK Health Notification Reminder", message);
      return { success: true, message: "SMS simulated: Notification copy sent to " + email };
    } catch (err) {
      return { success: true, warning: err.toString(), message: "Linked email found but failed to send." };
    }
  }
  
  return { success: true, message: "SMS processed (No linked email found to forward copy)." };
}

/**
 * Finds or registers a patient by email or phone dynamically.
 */
function getOrCreatePatient(data) {
  const email = data.email ? data.email.trim().toLowerCase() : "";
  const phone = data.phone ? data.phone.toString().replace(/\D/g, "") : "";
  let name = data.name ? data.name.trim() : "";

  const sheet = getSheet("patients");
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => h.toString().toLowerCase().trim());

  // Find column indices
  const idIdx = headers.indexOf("id");
  const nameIdx = headers.indexOf("name");
  const phoneIdx = headers.indexOf("phone");
  const emailIdx = headers.indexOf("email");
  const ageIdx = headers.indexOf("age");
  const genderIdx = headers.indexOf("gender");
  const complianceIdx = headers.indexOf("compliance");
  const statusIdx = headers.indexOf("reminder_status") !== -1 ? headers.indexOf("reminder_status") : headers.indexOf("status");

  // Search existing patients
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    let match = false;

    if (email && emailIdx !== -1 && row[emailIdx] && row[emailIdx].toString().toLowerCase().trim() === email) {
      match = true;
    } else if (phone && phoneIdx !== -1 && row[phoneIdx]) {
      const rowPhone = row[phoneIdx].toString().replace(/\D/g, "");
      if (phone.includes(rowPhone) || rowPhone.includes(phone)) {
        match = true;
      }
    }

    if (match) {
      return {
        success: true,
        id: idIdx !== -1 ? row[idIdx] : "",
        name: nameIdx !== -1 ? row[nameIdx] : "",
        phone: phoneIdx !== -1 ? row[phoneIdx] : "",
        email: emailIdx !== -1 ? row[emailIdx] : "",
        message: "Patient already exists."
      };
    }
  }

  // Generate new patient ID
  const patientId = "RK-" + Math.floor(1000 + Math.random() * 9000);
  if (!name) {
    if (email) {
      name = email.split('@')[0].replace('.', ' ').replace(/\b\w/g, c => c.toUpperCase());
    } else {
      const cleanDigits = phone.slice(-4);
      name = "Patient - " + (cleanDigits || "New");
    }
  }

  // Construct new row matching spreadsheet headers order
  const newRow = new Array(headers.length || 8).fill("");
  
  // Set defaults for headers if empty
  const finalHeaders = headers.length > 0 ? headers : ["id", "name", "phone", "email", "age", "gender", "compliance", "status"];
  const finalIdIdx = idIdx !== -1 ? idIdx : 0;
  const finalNameIdx = nameIdx !== -1 ? nameIdx : 1;
  const finalPhoneIdx = phoneIdx !== -1 ? phoneIdx : 2;
  const finalEmailIdx = emailIdx !== -1 ? emailIdx : 3;
  const finalAgeIdx = ageIdx !== -1 ? ageIdx : 4;
  const finalGenderIdx = genderIdx !== -1 ? genderIdx : 5;
  const finalComplianceIdx = complianceIdx !== -1 ? complianceIdx : 6;
  const finalStatusIdx = statusIdx !== -1 ? statusIdx : 7;

  // Make sure headers are in sheet if we created it new
  if (values.length === 0 || values[0].length === 0) {
    sheet.appendRow(finalHeaders);
  }

  newRow[finalIdIdx] = patientId;
  newRow[finalNameIdx] = name;
  newRow[finalPhoneIdx] = data.phone || "";
  newRow[finalEmailIdx] = data.email || "";
  newRow[finalAgeIdx] = 35;
  newRow[finalGenderIdx] = "Female";
  newRow[finalComplianceIdx] = 100;
  newRow[finalStatusIdx] = "Pending";

  sheet.appendRow(newRow);

  return {
    success: true,
    id: patientId,
    name: name,
    phone: data.phone || "",
    email: data.email || "",
    message: "New patient registered successfully."
  };
}
