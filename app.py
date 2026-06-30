import os
import sqlite3
import random
from datetime import datetime, timedelta
from urllib.parse import quote
import time
import threading
from collections import defaultdict
from flask import Flask, request, jsonify, render_template, send_from_directory, g

# Simple In-Memory Rate Limiter
RATE_LIMIT_DATA = defaultdict(list)
RATE_LIMIT_WINDOW = 60 # seconds
RATE_LIMIT_MAX = 5     # max requests per window for sensitive routes

def check_rate_limit(ip_address, endpoint):
    """Enforces basic rate limiting for a specific IP and endpoint."""
    now = time.time()
    key = f"{ip_address}:{endpoint}"
    # Clean up old entries
    RATE_LIMIT_DATA[key] = [t for t in RATE_LIMIT_DATA[key] if now - t < RATE_LIMIT_WINDOW]
    if len(RATE_LIMIT_DATA[key]) >= RATE_LIMIT_MAX:
        return False
    RATE_LIMIT_DATA[key].append(now)
    return True

from dotenv import load_dotenv
from twilio.rest import Client as TwilioClient
from ai_service import generate_medical_summary

# Load environment variables
load_dotenv()

# Initialize Flask App
# We configure it to serve static files directly from 'rk-health' folder
app = Flask(
    __name__,
    static_folder='rk-health',
    static_url_path='',
    template_folder='rk-health'
)

@app.after_request
def add_security_headers(response):
    """Adds OWASP recommended security headers."""
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    # Optional: response.headers['Content-Security-Policy'] = "default-src 'self'"
    return response

DATABASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rk_health.db')

def get_db_connection():
    if 'db' not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
        # Enable Write-Ahead Logging for 10x concurrent performance
        g.db.execute("PRAGMA journal_mode=WAL;")
        g.db.execute("PRAGMA synchronous=NORMAL;")
    return g.db

@app.teardown_appcontext
def close_db_connection(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    """Initialize database tables and insert seed data if empty."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    cursor = conn.cursor()
    
    # Create Patients Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS patients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            age INTEGER,
            gender TEXT,
            compliance INTEGER DEFAULT 87,
            reminder_status TEXT DEFAULT 'Pending'
        )
    ''')
    
    # Safely alter table to add email column if database already exists
    try:
        cursor.execute("ALTER TABLE patients ADD COLUMN email TEXT")
    except sqlite3.OperationalError:
        pass
        
    # Update existing rows with default emails
    cursor.execute("UPDATE patients SET email = 'anita@example.com' WHERE name = 'Anita Sharma' AND email IS NULL")
    cursor.execute("UPDATE patients SET email = 'ramesh@example.com' WHERE name = 'Ramesh Patel' AND email IS NULL")
    cursor.execute("UPDATE patients SET email = 'priya@example.com' WHERE name = 'Priya Verma' AND email IS NULL")
    cursor.execute("UPDATE patients SET email = 'karan@example.com' WHERE name = 'Karan Singh' AND email IS NULL")
    cursor.execute("UPDATE patients SET email = 'neha@example.com' WHERE name = 'Neha Kapoor' AND email IS NULL")
    cursor.execute("UPDATE patients SET email = 'suresh@example.com' WHERE name = 'Suresh Yadav' AND email IS NULL")
    
    # Create Appointments Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id TEXT,
            patient_name TEXT,
            doctor TEXT,
            department TEXT,
            date TEXT,
            time TEXT,
            visit_type TEXT,
            priority TEXT,
            symptoms TEXT,
            calendar_link TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients (id)
        )
    ''')
    
    # Create Medications Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS medications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_name TEXT,
            name TEXT NOT NULL,
            dose TEXT NOT NULL,
            freq TEXT NOT NULL,
            schedule TEXT, -- comma-separated e.g. "Morning,Night"
            status TEXT DEFAULT 'Pending',
            compliance INTEGER DEFAULT 100,
            next_time TEXT,
            phone TEXT,
            duration INTEGER DEFAULT 7,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    try:
        cursor.execute("ALTER TABLE medications ADD COLUMN duration INTEGER DEFAULT 7")
        conn.commit()
    except sqlite3.OperationalError:
        pass

    # Create Doctor Notes Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS doctor_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_name TEXT NOT NULL,
            doctor_name TEXT NOT NULL,
            note_type TEXT DEFAULT 'General',
            note TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create Indices for 10x faster lookups
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_patients_email ON patients(email)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_meds_patient_name ON medications(patient_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_apps_patient_name ON appointments(patient_name)")

    # Check if database is empty to insert seeds
    cursor.execute("SELECT COUNT(*) FROM patients")
    if cursor.fetchone()[0] == 0:
        # Seed Patients
        patients_seed = [
            ('RK-0921', 'Anita Sharma', '+91 98xxxxxx21', 'anita@example.com', 42, 'Female', 92, 'Sent'),
            ('RK-0918', 'Ramesh Patel', '+91 98xxxxxx18', 'ramesh@example.com', 56, 'Male', 78, 'Pending'),
            ('RK-0905', 'Priya Verma', '+91 98xxxxxx05', 'priya@example.com', 31, 'Female', 64, 'Missed'),
            ('RK-0899', 'Karan Singh', '+91 98xxxxxx99', 'karan@example.com', 65, 'Male', 88, 'Sent'),
            ('RK-0882', 'Neha Kapoor', '+91 98xxxxxx82', 'neha@example.com', 29, 'Female', 70, 'Sent'),
            ('RK-0870', 'Suresh Yadav', '+91 98xxxxxx70', 'suresh@example.com', 48, 'Male', 95, 'Sent')
        ]
        cursor.executemany(
            "INSERT INTO patients (id, name, phone, email, age, gender, compliance, reminder_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            patients_seed
        )
        
        # Seed Medications
        meds_seed = [
            ('Anita Sharma', 'Atorvastatin', '10mg', 'Once daily', 'Night', 'Completed', 92, 'Tonight, 9:00 PM', '+91 98xxxxxx21'),
            ('Ramesh Patel', 'Metformin', '500mg', 'Twice daily', 'Morning,Night', 'Pending', 78, 'Today, 8:30 PM', '+91 98xxxxxx18'),
            ('Priya Verma', 'Aspirin', '75mg', 'Once daily', 'Morning', 'Missed', 64, 'Tomorrow, 8:00 AM', '+91 98xxxxxx05'),
            ('Karan Singh', 'Metoprolol', '25mg', 'Twice daily', 'Morning,Afternoon', 'Completed', 88, 'Tomorrow, 8:00 AM', '+91 98xxxxxx99'),
            ('Neha Kapoor', 'Vitamin D3', '1000IU', 'Once weekly', 'Morning', 'Pending', 70, 'Sun, 9:00 AM', '+91 98xxxxxx82'),
            ('Suresh Yadav', 'Pantoprazole', '40mg', 'Once daily', 'Morning', 'Completed', 95, 'Tomorrow, 7:30 AM', '+91 98xxxxxx70')
        ]
        cursor.executemany(
            "INSERT INTO medications (patient_name, name, dose, freq, schedule, status, compliance, next_time, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            meds_seed
        )
        
        # Seed Appointments
        appointments_seed = [
            ('RK-0921', 'Anita Sharma', 'Dr. Rohan K.', 'Cardiology', '2026-06-28', '10:30', 'Follow-up', 'High', 'Mild chest discomfort', ''),
            ('RK-0918', 'Ramesh Patel', 'Dr. Mehta', 'General Medicine', '2026-06-28', '11:15', 'Follow-up', 'Normal', 'Routine diabetes review', ''),
            ('RK-0905', 'Priya Verma', 'Dr. Iyer', 'General Medicine', '2026-06-27', '09:30', 'First Visit', 'Normal', 'Persistent headache', ''),
            ('RK-0899', 'Karan Singh', 'Dr. Rohan K.', 'Cardiology', '2026-06-27', '14:00', 'Follow-up', 'Normal', 'Post-stent follow-up', ''),
            ('RK-0882', 'Neha Kapoor', 'Dr. Kapoor', 'Pediatrics', '2026-06-26', '16:00', 'First Visit', 'Normal', 'Fever & cough', ''),
            ('RK-0870', 'Suresh Yadav', 'Dr. Mehta', 'Orthopedics', '2026-06-26', '12:30', 'Follow-up', 'Normal', 'Knee pain follow-up', '')
        ]
        cursor.executemany(
            "INSERT INTO appointments (patient_id, patient_name, doctor, department, date, time, visit_type, priority, symptoms, calendar_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            appointments_seed
        )
        
        conn.commit()
    conn.commit()
    conn.close()

# Initialize DB on import/startup
init_db()

def generate_calendar_link(patient_name, doctor, department, date_str, time_str, symptoms, visit_type, priority):
    """Generate Google Calendar Template Event link."""
    try:
        dt = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
        start_dt = dt.strftime("%Y%m%dT%H%M%S")
        end_dt = (dt + timedelta(minutes=30)).strftime("%Y%m%dT%H%M%S")
        dates = f"{start_dt}/{end_dt}"
    except Exception:
        dates = ""
        
    base_url = "https://www.google.com/calendar/render?action=TEMPLATE"
    title = quote(f"RK Health Appointment: {patient_name}")
    details = quote(
        f"Doctor: {doctor}\n"
        f"Department: {department}\n"
        f"Visit Type: {visit_type}\n"
        f"Priority: {priority}\n"
        f"Symptoms: {symptoms}"
    )
    location = quote("RK Hospital")
    calendar_link = f"{base_url}&text={title}&dates={dates}&details={details}&location={location}"
    return calendar_link

# ==================== API ROUTES ====================

@app.route('/')
def home():
    """Serve home page index.html."""
    return app.send_static_file('index.html')

@app.route('/api/patients', methods=['GET'])
def get_patients():
    """Fetch all patients logs."""
    conn = get_db_connection()
    # Join with latest appointment details and latest medication details if available
    cursor = conn.cursor()
    cursor.execute('''
        SELECT p.id, p.name, p.phone, p.email, p.compliance, p.reminder_status as reminder,
               (SELECT date FROM appointments WHERE patient_id = p.id ORDER BY date DESC, time DESC LIMIT 1) as date,
               (SELECT doctor FROM appointments WHERE patient_id = p.id ORDER BY date DESC, time DESC LIMIT 1) as doctor,
               (SELECT name FROM medications WHERE patient_name = p.name ORDER BY id DESC LIMIT 1) as med
        FROM patients p
        ORDER BY p.id DESC
    ''')
    rows = cursor.fetchall()
    conn.close()
    
    patients_list = []
    for r in rows:
        patients_list.append({
            'id': r['id'],
            'name': r['name'],
            'phone': r['phone'] if r['phone'] else 'N/A',
            'email': r['email'] if r['email'] else 'N/A',
            'date': r['date'] if r['date'] else 'N/A',
            'doctor': r['doctor'] if r['doctor'] else 'N/A',
            'med': r['med'] if r['med'] else 'N/A',
            'reminder': r['reminder'],
            'compliance': r['compliance']
        })
    return jsonify(patients_list)

@app.route('/api/patients', methods=['POST'])
def create_patient():
    """Register a new patient dynamically if they do not exist."""
    data = request.json or {}
    email = data.get('email', '').strip().lower()
    phone = data.get('phone')
    name = data.get('name')
    
    if not email and not phone:
        return jsonify({'error': True, 'message': 'email or phone is required.'}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    patient = None
    if email:
        cursor.execute("SELECT * FROM patients WHERE LOWER(email) = ?", (email,))
        patient = cursor.fetchone()
    elif phone:
        clean_target = "".join([c for c in phone if c.isdigit()])
        cursor.execute("SELECT * FROM patients")
        rows = cursor.fetchall()
        for r in rows:
            r_phone = r['phone'] or ""
            clean_r = "".join([c for c in r_phone if c.isdigit()])
            if clean_target and clean_r and (clean_target in clean_r or clean_r in clean_target):
                patient = r
                break
                
    if patient:
        conn.close()
        return jsonify({
            'success': True,
            'id': patient['id'],
            'name': patient['name'],
            'phone': patient['phone'],
            'email': patient['email'],
            'message': 'Patient already exists.'
        })
        
    # Generate new random ID
    patient_id = f"RK-{random.randint(1000, 9999)}"
    if not name:
        if email:
            name = email.split('@')[0].replace('.', ' ').title()
        else:
            last_digits = "".join([c for c in phone if c.isdigit()])
            last_digits = last_digits[-4:] if len(last_digits) >= 4 else "New"
            name = f"Patient - {last_digits}"
            
    cursor.execute(
        "INSERT INTO patients (id, name, phone, email, age, gender, compliance, reminder_status) VALUES (?, ?, ?, ?, 35, 'Female', 100, 'Pending')",
        (patient_id, name, phone, email)
    )
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'id': patient_id,
        'name': name,
        'phone': phone,
        'email': email,
        'message': 'New patient registered successfully.'
    })

@app.route('/api/patients/<id>', methods=['POST'])
def update_patient(id):
    """Update patient details."""
    data = request.json
    phone = data.get('phone')
    email = data.get('email')
    age = int(data.get('age', 0))
    gender = data.get('gender')
    compliance = int(data.get('compliance', 87))
    name = data.get('name')

    conn = get_db_connection()
    cursor = conn.cursor()

    if name:
        # Get the old name of the patient to update related records
        cursor.execute("SELECT name FROM patients WHERE id = ?", (id,))
        old_row = cursor.fetchone()
        old_name = old_row['name'] if old_row else None

        cursor.execute(
            "UPDATE patients SET name = ?, phone = ?, email = ?, age = ?, gender = ?, compliance = ? WHERE id = ?",
            (name, phone, email, age, gender, compliance, id)
        )

        if old_name and old_name.lower() != name.lower():
            # Propagate name change to medications and appointments tables
            cursor.execute(
                "UPDATE medications SET patient_name = ? WHERE LOWER(patient_name) = ?",
                (name, old_name.lower())
            )
            cursor.execute(
                "UPDATE appointments SET patient_name = ? WHERE LOWER(patient_name) = ?",
                (name, old_name.lower())
            )
    else:
        cursor.execute(
            "UPDATE patients SET phone = ?, email = ?, age = ?, gender = ?, compliance = ? WHERE id = ?",
            (phone, email, age, gender, compliance, id)
        )

    conn.commit()
    conn.close()

    return jsonify({"success": True, "message": "Patient updated successfully."})

@app.route('/api/appointments', methods=['GET', 'POST'])
def manage_appointments():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'POST':
        data = request.json
        patient_name = data.get('patientName')
        age = int(data.get('age', 0))
        gender = data.get('gender')
        phone = data.get('phone')
        email = data.get('email', '').strip().lower()
        doctor = data.get('doctor')
        department = data.get('department')
        date_str = data.get('date')
        time_str = data.get('time')
        visit_type = data.get('visit', 'First Visit')
        priority = data.get('priority', 'Normal')
        symptoms = data.get('symptoms', '')
        
        # Check if patient exists by email first, then fallback to name
        row = None
        if email:
            cursor.execute("SELECT * FROM patients WHERE LOWER(email) = ?", (email,))
            row = cursor.fetchone()
        
        if not row:
            cursor.execute("SELECT * FROM patients WHERE name = ? COLLATE NOCASE", (patient_name,))
            row = cursor.fetchone()
            
        if row:
            patient_id = row['id']
            # Update patient info
            cursor.execute(
                "UPDATE patients SET phone = ?, email = COALESCE(email, ?), age = ?, gender = ? WHERE id = ?",
                (phone, email or row['email'], age, gender, patient_id)
            )
        else:
            patient_id = f"RK-{random.randint(1000, 9999)}"
            cursor.execute(
                "INSERT INTO patients (id, name, phone, email, age, gender, compliance, reminder_status) VALUES (?, ?, ?, ?, ?, ?, 100, 'Pending')",
                (patient_id, patient_name, phone, email or None, age, gender)
            )
            
        calendar_link = generate_calendar_link(
            patient_name, doctor, department, date_str, time_str, symptoms, visit_type, priority
        )
        
        cursor.execute('''
            INSERT INTO appointments (patient_id, patient_name, doctor, department, date, time, visit_type, priority, symptoms, calendar_link)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (patient_id, patient_name, doctor, department, date_str, time_str, visit_type, priority, symptoms, calendar_link))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'message': 'Appointment saved successfully.',
            'patient_id': patient_id,
            'calendar_link': calendar_link
        })
    else:
        # GET request
        cursor.execute("SELECT * FROM appointments ORDER BY date DESC, time DESC")
        rows = cursor.fetchall()
        conn.close()
        
        appointments = []
        for r in rows:
            appointments.append({
                'id': r['id'],
                'patient_id': r['patient_id'],
                'patient_name': r['patient_name'],
                'doctor': r['doctor'],
                'department': r['department'],
                'date': r['date'],
                'time': r['time'],
                'visit': r['visit_type'],
                'priority': r['priority'],
                'symptoms': r['symptoms'],
                'calendar_link': r['calendar_link']
            })
        return jsonify(appointments)

@app.route('/api/medications', methods=['GET', 'POST'])
def manage_medications():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'POST':
        data = request.json
        patient_name = data.get('patientName', 'Anita Sharma')  # Default to Anita for dashboard view
        name = data.get('name')
        dose = data.get('dose')
        freq = data.get('freq')
        schedule = ",".join(data.get('schedule', []))
        status = data.get('status', 'Pending')
        compliance = int(data.get('compliance', 100))
        next_time = data.get('next_time', 'Tomorrow, 8:00 AM')
        phone = data.get('phone')
        duration = int(data.get('duration', 7))
        
        cursor.execute('''
            INSERT INTO medications (patient_name, name, dose, freq, schedule, status, compliance, next_time, phone, duration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (patient_name, name, dose, freq, schedule, status, compliance, next_time, phone, duration))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Medication reminder added.'})
    else:
        cursor.execute("SELECT * FROM medications ORDER BY id DESC")
        rows = cursor.fetchall()
        conn.close()
        
        medications_list = []
        for r in rows:
            duration_val = 7
            try:
                duration_val = r['duration']
            except (IndexError, KeyError, sqlite3.OperationalError):
                pass
            medications_list.append({
                'id': r['id'],
                'patient_name': r['patient_name'],
                'name': r['name'],
                'dose': r['dose'],
                'freq': r['freq'],
                'schedule': r['schedule'].split(',') if r['schedule'] else [],
                'status': r['status'],
                'compliance': r['compliance'],
                'next': r['next_time'],
                'phone': r['phone'],
                'duration': duration_val
            })
        return jsonify(medications_list)

@app.route('/api/medications/<int:med_id>', methods=['DELETE'])
def delete_medication(med_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM medications WHERE id = ?", (med_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': 'Medication deleted.'})

@app.route('/api/medications/<int:med_id>', methods=['POST'])
def update_medication(med_id):
    """Update medication details."""
    data = request.json
    
    patient_name = data.get('patientName')
    name = data.get('name')
    dose = data.get('dose')
    freq = data.get('freq')
    schedule = ",".join(data.get('schedule', [])) if isinstance(data.get('schedule'), list) else data.get('schedule')
    compliance = int(data.get('compliance', 100))
    phone = data.get('phone')
    duration = int(data.get('duration', 7))

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """UPDATE medications 
           SET patient_name = ?, name = ?, dose = ?, freq = ?, schedule = ?, compliance = ?, phone = ?, duration = ? 
           WHERE id = ?""",
        (patient_name, name, dose, freq, schedule, compliance, phone, duration, med_id)
    )
    conn.commit()
    conn.close()

    return jsonify({"success": True, "message": "Medication updated successfully."})


# ===== DOCTOR NOTES ROUTES =====

@app.route('/api/doctor-notes', methods=['GET', 'POST'])
def manage_doctor_notes():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Self-healing: ensure table exists even if server was never restarted
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS doctor_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_name TEXT NOT NULL,
            doctor_name TEXT,
            note_type TEXT DEFAULT 'General',
            note TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()

    if request.method == 'POST':
        data = request.json
        patient_name = data.get('patient_name', '').strip()
        doctor_name = data.get('doctor_name', '').strip()
        note_type = data.get('note_type', 'General')
        note = data.get('note', '').strip()

        if not patient_name or not note:
            conn.close()
            return jsonify({'success': False, 'message': 'Patient name and note are required.'}), 400

        cursor.execute(
            "INSERT INTO doctor_notes (patient_name, doctor_name, note_type, note) VALUES (?, ?, ?, ?)",
            (patient_name, doctor_name, note_type, note)
        )
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Doctor note saved.'})

    else:
        patient = request.args.get('patient', '')
        if patient:
            cursor.execute(
                "SELECT * FROM doctor_notes WHERE patient_name LIKE ? ORDER BY created_at DESC",
                (f'%{patient}%',)
            )
        else:
            cursor.execute("SELECT * FROM doctor_notes ORDER BY created_at DESC LIMIT 30")
        rows = cursor.fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])


@app.route('/api/medications/<int:med_id>/taken', methods=['POST'])
def medication_taken(med_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    # Mark status as Completed and increase compliance slightly
    cursor.execute("SELECT compliance, status FROM medications WHERE id = ?", (med_id,))
    row = cursor.fetchone()
    if row:
        new_compliance = min(100, row['compliance'] + 5)
        cursor.execute(
            "UPDATE medications SET status = 'Completed', compliance = ? WHERE id = ?",
            (new_compliance, med_id)
        )
        conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': 'Medication marked as taken.'})

@app.route('/api/generate-summary', methods=['POST'])
def generate_ai_summary():
    """Generate patient-friendly visit summary using Groq API via ai_service."""
    client_ip = request.remote_addr or "127.0.0.1"
    if not check_rate_limit(client_ip, "/api/generate-summary"):
        return jsonify({'error': True, 'message': 'Too many requests. Please wait a moment and try again.'}), 429

    data = request.json or {}
    patient_name = data.get('patientName', 'Anita Sharma')
    doctor = data.get('doctor', 'Dr. Rohan K.')
    department = data.get('department', 'Cardiology')
    symptoms = data.get('symptoms', 'Mild chest discomfort and tiredness')
    visit_type = data.get('visit', 'Follow-up')
    priority = data.get('priority', 'Normal')
    
    doctor_notes = f"Department: {department}. Doctor: {doctor}. Visit Type: {visit_type}. Symptoms: {symptoms}."
    
    # Look up patient's medications dynamically from the database
    meds_list = []
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT name, dose, freq FROM medications WHERE patient_name = ? COLLATE NOCASE", (patient_name,))
        rows = cursor.fetchall()
        for r in rows:
            meds_list.append(f"{r['name']} {r['dose']} ({r['freq']})")
        conn.close()
    except Exception as db_err:
        print("Database error in generate_ai_summary meds lookup:", db_err)
        
    medications_info = ", ".join(meds_list) if meds_list else "Follow doctor guidelines."
    
    try:
        result = generate_medical_summary(patient_name, doctor_notes, medications_info)
        
        # Map output to what the frontend expects:
        # summary, risk_level, follow_up, medications
        summary_text = result.get('summary') or (
            result.get('visit_overview', '') + "\n\n" + result.get('diagnosis_explanation', '')
        )
        risk = result.get('risk_level') or (
            'High' if priority.lower() == 'high' or 'chest' in symptoms.lower() else 'Low'
        )
        follow_up = result.get('follow_up') or result.get('follow_up_advice', '4 weeks')
        
        meds_instr = result.get('medications') or [
            result.get('medication_instructions', 'Follow doctor guidelines.')
        ]
        if isinstance(meds_instr, str):
            meds_instr = [meds_instr]
            
        return jsonify({
            'success': True,
            'summary': summary_text,
            'risk_level': risk,
            'follow_up': follow_up,
            'medications': meds_instr
        })
    except Exception as e:
        return jsonify({
            'error': True,
            'message': str(e),
            'summary': f"Error generating summary. Patient {patient_name} was seen by {doctor} for {symptoms}.",
            'risk_level': 'Moderate',
            'follow_up': '2 weeks',
            'medications': ["Follow doctor instructions."]
        }), 500

@app.route('/generate-summary', methods=['POST'])
def generate_summary_test_route():
    """Test route satisfying project requirements. Expects patient_name, doctor_notes, medications."""
    data = request.json or {}
    patient_name = data.get('patient_name')
    doctor_notes = data.get('doctor_notes')
    medications = data.get('medications', '')
    
    if not patient_name or not doctor_notes:
        return jsonify({
            'error': True,
            'message': 'patient_name and doctor_notes are required fields.'
        }), 400
        
    try:
        result = generate_medical_summary(patient_name, doctor_notes, medications)
        return jsonify(result)
    except Exception as e:
        return jsonify({
            'error': True,
            'message': str(e)
        }), 500

def dispatch_email(email, subject, message):
    """Unified email sender using custom SMTP with automated Google Apps Script Web App fallback."""
    smtp_server = os.getenv("SMTP_SERVER")
    smtp_port = os.getenv("SMTP_PORT", "587")
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    
    # Check if SMTP credentials are valid (not default placeholder strings or empty)
    has_valid_smtp = (
        all([smtp_server, smtp_user, smtp_password]) and
        "your-email@gmail.com" not in smtp_user and
        "your-gmail-app-password" not in smtp_password
    )
    
    if has_valid_smtp:
        try:
            import smtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart
            
            msg = MIMEMultipart()
            msg['From'] = smtp_user
            msg['To'] = email
            msg['Subject'] = subject
            msg.attach(MIMEText(message, 'plain'))
            
            with smtplib.SMTP(smtp_server, int(smtp_port)) as server:
                server.starttls()
                server.login(smtp_user, smtp_password)
                server.send_message(msg)
            print(f"[EMAIL SUCCESS] Dispatched to {email} via SMTP.")
            return True, "Email sent successfully via custom SMTP."
        except Exception as e:
            print("SMTP error, falling back to Apps Script/Mock:", e)
            
    # Fallback Step 1: Send via Google Apps Script Web App (if configured)
    apps_script_url = get_apps_script_url()
    if apps_script_url:
        try:
            import requests
            print(f"[EMAIL] Attempting to dispatch email via Google Apps Script: {apps_script_url}")
            response = requests.post(apps_script_url, json={
                'action': 'sendEmail',
                'email': email,
                'subject': subject,
                'message': message
            }, timeout=15)
            if response.status_code == 200:
                res_json = response.json()
                if not res_json.get('error') and res_json.get('success') != False:
                    print(f"[EMAIL SUCCESS] Dispatched to {email} via Google Apps Script.")
                    return True, "Email sent successfully via Google Apps Script."
                else:
                    print("Google Apps Script email error response:", res_json)
            else:
                print(f"Google Apps Script response status code: {response.status_code}")
        except Exception as script_err:
            print("Failed to dispatch email via Google Apps Script:", script_err)
            
    # Fallback Step 2: Mock mode (print to console log)
    print(f"[EMAIL MOCK] To: {email} | Subject: {subject} | Message: {message}")
    return True, "Email processed (Mock mode - no functional credentials/services available)."

# ===== BACKGROUND SMS SCHEDULER =====

def _sms_scheduler_loop():
    """Background thread: checks every 30s for pending SMS and fires Twilio."""
    import sqlite3 as _sqlite3
    while True:
        try:
            conn = _sqlite3.connect(DATABASE)
            conn.row_factory = _sqlite3.Row
            cursor = conn.cursor()

            # Ensure table exists (in case this thread starts before init_db)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS scheduled_sms (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone TEXT NOT NULL,
                    message TEXT NOT NULL,
                    scheduled_time TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    sent_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            conn.commit()

            now_str = datetime.now().strftime('%Y-%m-%dT%H:%M')
            cursor.execute(
                "SELECT * FROM scheduled_sms WHERE status = 'pending' AND scheduled_time <= ?",
                (now_str,)
            )
            due = cursor.fetchall()

            for row in due:
                _fire_sms(row['id'], row['phone'], row['message'], conn)

            conn.close()
        except Exception as e:
            print(f"[SMS Scheduler] Error: {e}", flush=True)
        time.sleep(30)


def format_phone_number(phone):
    """Normalize and format phone number with +91 if it has 10 digits and lacks country code."""
    if not phone:
        return ""
    cleaned = ''.join(c for c in str(phone) if c.isdigit() or c == '+')
    if not cleaned.startswith('+'):
        if len(cleaned) == 10:
            return '+91' + cleaned
        elif len(cleaned) == 12 and cleaned.startswith('91'):
            return '+' + cleaned
    return cleaned


def _fire_sms(sms_id, phone, message, conn):
    """Attempt to send SMS via Twilio and update record status."""
    account_sid = os.getenv('TWILIO_ACCOUNT_SID')
    auth_token  = os.getenv('TWILIO_AUTH_TOKEN')
    from_phone  = os.getenv('TWILIO_PHONE_NUMBER')
    now_ts      = datetime.now().isoformat()
    formatted_phone = format_phone_number(phone)
    try:
        if all([account_sid, auth_token, from_phone]):
            client = TwilioClient(account_sid, auth_token)
            client.messages.create(body=message, from_=from_phone, to=formatted_phone)
            print(f"[SMS Scheduler] SENT -> {formatted_phone}: {message[:60]}", flush=True)
        else:
            print(f"[SMS Scheduler] MOCK -> {formatted_phone}: {message[:60]}", flush=True)

        conn.execute(
            "UPDATE scheduled_sms SET status = 'sent', sent_at = ? WHERE id = ?",
            (now_ts, sms_id)
        )
        conn.commit()
    except Exception as e:
        print(f"[SMS Scheduler] FAILED -> {formatted_phone}: {e}", flush=True)
        conn.execute(
            "UPDATE scheduled_sms SET status = 'failed', sent_at = ? WHERE id = ?",
            (now_ts, sms_id)
        )
        conn.commit()



# Start the scheduler thread once (daemon = auto-killed when Flask stops)
print("[SMS Scheduler] Starting background daemon thread...", flush=True)
_scheduler_thread = threading.Thread(target=_sms_scheduler_loop, daemon=True)
_scheduler_thread.start()


@app.route('/api/schedule-sms', methods=['POST'])
def schedule_sms():
    """Store a future SMS in the DB; the background thread will fire it at the right time."""
    data = request.json or {}
    phone          = (data.get('phone') or '').strip()
    message        = (data.get('message') or '').strip()
    scheduled_time = (data.get('scheduled_time') or '').strip()  # format: 'YYYY-MM-DDTHH:MM'
    clear_existing = data.get('clear_existing', False)

    if not phone:
        return jsonify({'success': False, 'message': 'phone is required.'}), 400

    conn = get_db_connection()
    if clear_existing:
        conn.execute("DELETE FROM scheduled_sms WHERE phone = ? AND status = 'pending'", (phone,))
        conn.commit()
        if not message or not scheduled_time:
            conn.close()
            return jsonify({'success': True, 'message': 'Cleared pending SMS reminders.'})

    if not message or not scheduled_time:
        conn.close()
        return jsonify({'success': False, 'message': 'message and scheduled_time are required.'}), 400

    conn.execute(
        "INSERT INTO scheduled_sms (phone, message, scheduled_time) VALUES (?, ?, ?)",
        (phone, message, scheduled_time)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': f'SMS scheduled for {scheduled_time}.'})


@app.route('/api/scheduled-sms', methods=['GET'])
def list_scheduled_sms():
    """Return all scheduled SMS records for the dashboard."""
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM scheduled_sms ORDER BY scheduled_time DESC LIMIT 50").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/send-sms', methods=['POST'])
def send_sms():
    """Trigger an SMS reminder via Twilio with automatic email copy fallback."""
    data = request.json or {}
    phone = data.get('phone')
    message = data.get('message', 'Reminder from RK Health.')
    
    # Check if there is an associated patient with an email address
    email = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        search_phone = phone[-10:] if phone and len(phone) >= 10 else phone
        if search_phone:
            cursor.execute("SELECT email FROM patients WHERE phone LIKE ?", (f"%{search_phone}",))
            row = cursor.fetchone()
            if row:
                email = row['email']
        conn.close()
    except Exception as db_err:
        print("Database lookup error in send_sms:", db_err)
        
    # Send email copy to patient's email if available
    email_status = "Not sent (no linked email)"
    if email:
        try:
            success, msg = dispatch_email(email, "RK Health Notification Reminder", message)
            email_status = f"Sent to {email} ({msg})"
        except Exception as email_err:
            print("Failed to dispatch email copy:", email_err)
            email_status = f"Failed to send email copy: {email_err}"
            
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_phone = os.getenv("TWILIO_PHONE_NUMBER")
    
    if not all([account_sid, auth_token, from_phone]):
        # Mock/Log SMS delivery if credentials are not configured
        print(f"[SMS MOCK] To: {phone} | Message: {message}")
        return jsonify({
            'success': True,
            'mocked': True,
            'message': f'SMS processed (Mock mode). Email status: {email_status}'
        })
        
    try:
        formatted_phone = format_phone_number(phone)
        client = TwilioClient(account_sid, auth_token)
        sms = client.messages.create(
            body=message,
            from_=from_phone,
            to=formatted_phone
        )
        return jsonify({
            'success': True,
            'sms_sid': sms.sid,
            'message': f'SMS reminder sent successfully. Email status: {email_status}'
        })
    except Exception as e:
        print("Twilio API error:", e)
        return jsonify({
            'success': False,
            'error': str(e),
            'message': f'Failed to send SMS. Email status: {email_status}'
        }), 500

def get_apps_script_url():
    """Extract APPS_SCRIPT_URL from frontend config.js file."""
    try:
        config_path = os.path.join(os.path.dirname(__file__), "rk-health", "config.js")
        if os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                content = f.read()
                import re
                match = re.search(r'const\s+APPS_SCRIPT_URL\s*=\s*["\']([^"\']+)["\']', content)
                if match:
                    return match.group(1)
    except Exception as e:
        print("Error reading Apps Script URL from config.js:", e)
    return None

@app.route('/api/send-email', methods=['POST'])
def send_email():
    """Trigger an email reminder / OTP via SMTP or fallback to Google Apps Script."""
    client_ip = request.remote_addr or "127.0.0.1"
    if not check_rate_limit(client_ip, "/api/send-email"):
        return jsonify({'error': True, 'message': 'Too many requests. Please wait a moment and try again.'}), 429

    data = request.json or {}
    email = data.get('email')
    message = data.get('message', 'Hello from RK Health.')
    subject = data.get('subject', 'RK Health Verification')
    
    if not email:
        return jsonify({'error': True, 'message': 'email is required.'}), 400
        
    success, msg = dispatch_email(email, subject, message)
    return jsonify({
        'success': success,
        'message': msg
    })

if __name__ == '__main__':
    port = int(os.getenv("PORT", os.getenv("FLASK_PORT", 5000)))
    debug = os.getenv("FLASK_DEBUG", "True").lower() == "true"
    app.run(host='0.0.0.0', port=port, debug=debug)
