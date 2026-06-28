import os
import sqlite3
import random
from datetime import datetime, timedelta
from urllib.parse import quote
from flask import Flask, request, jsonify, render_template, send_from_directory
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

DATABASE = 'rk_health.db'

def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database tables and insert seed data if empty."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create Patients Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS patients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            phone TEXT,
            age INTEGER,
            gender TEXT,
            compliance INTEGER DEFAULT 87,
            reminder_status TEXT DEFAULT 'Pending'
        )
    ''')
    
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Check if database is empty to insert seeds
    cursor.execute("SELECT COUNT(*) FROM patients")
    if cursor.fetchone()[0] == 0:
        # Seed Patients
        patients_seed = [
            ('RK-0921', 'Anita Sharma', '+91 98xxxxxx21', 42, 'Female', 92, 'Sent'),
            ('RK-0918', 'Ramesh Patel', '+91 98xxxxxx18', 56, 'Male', 78, 'Pending'),
            ('RK-0905', 'Priya Verma', '+91 98xxxxxx05', 31, 'Female', 64, 'Missed'),
            ('RK-0899', 'Karan Singh', '+91 98xxxxxx99', 65, 'Male', 88, 'Sent'),
            ('RK-0882', 'Neha Kapoor', '+91 98xxxxxx82', 29, 'Female', 70, 'Sent'),
            ('RK-0870', 'Suresh Yadav', '+91 98xxxxxx70', 48, 'Male', 95, 'Sent')
        ]
        cursor.executemany(
            "INSERT INTO patients (id, name, phone, age, gender, compliance, reminder_status) VALUES (?, ?, ?, ?, ?, ?, ?)",
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
        SELECT p.id, p.name, p.compliance, p.reminder_status as reminder,
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
            'date': r['date'] if r['date'] else 'N/A',
            'doctor': r['doctor'] if r['doctor'] else 'N/A',
            'med': r['med'] if r['med'] else 'N/A',
            'reminder': r['reminder'],
            'compliance': r['compliance']
        })
    return jsonify(patients_list)

@app.route('/api/patients/<id>', methods=['POST'])
def update_patient(id):
    """Update patient details."""
    data = request.json
    phone = data.get('phone')
    age = int(data.get('age', 0))
    gender = data.get('gender')
    compliance = int(data.get('compliance', 87))

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE patients SET phone = ?, age = ?, gender = ?, compliance = ? WHERE id = ?",
        (phone, age, gender, compliance, id)
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
        doctor = data.get('doctor')
        department = data.get('department')
        date_str = data.get('date')
        time_str = data.get('time')
        visit_type = data.get('visit', 'First Visit')
        priority = data.get('priority', 'Normal')
        symptoms = data.get('symptoms', '')
        
        # Check if patient exists or create new one
        cursor.execute("SELECT id FROM patients WHERE name = ? COLLATE NOCASE", (patient_name,))
        row = cursor.fetchone()
        if row:
            patient_id = row['id']
            # Update patient info
            cursor.execute(
                "UPDATE patients SET phone = ?, age = ?, gender = ? WHERE id = ?",
                (phone, age, gender, patient_id)
            )
        else:
            patient_id = f"RK-{random.randint(1000, 9999)}"
            cursor.execute(
                "INSERT INTO patients (id, name, phone, age, gender, compliance, reminder_status) VALUES (?, ?, ?, ?, ?, 87, 'Pending')",
                (patient_id, patient_name, phone, age, gender)
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
        
        cursor.execute('''
            INSERT INTO medications (patient_name, name, dose, freq, schedule, status, compliance, next_time, phone)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (patient_name, name, dose, freq, schedule, status, compliance, next_time, phone))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Medication reminder added.'})
    else:
        cursor.execute("SELECT * FROM medications ORDER BY id DESC")
        rows = cursor.fetchall()
        conn.close()
        
        medications_list = []
        for r in rows:
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
                'phone': r['phone']
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
    name = data.get('name')
    dose = data.get('dose')
    freq = data.get('freq')
    compliance = int(data.get('compliance', 100))

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE medications SET name = ?, dose = ?, freq = ?, compliance = ? WHERE id = ?",
        (name, dose, freq, compliance, med_id)
    )
    conn.commit()
    conn.close()

    return jsonify({"success": True, "message": "Medication updated successfully."})

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
    data = request.json or {}
    patient_name = data.get('patientName', 'Anita Sharma')
    doctor = data.get('doctor', 'Dr. Rohan K.')
    department = data.get('department', 'Cardiology')
    symptoms = data.get('symptoms', 'Mild chest discomfort and tiredness')
    visit_type = data.get('visit', 'Follow-up')
    priority = data.get('priority', 'Normal')
    
    doctor_notes = f"Department: {department}. Doctor: {doctor}. Visit Type: {visit_type}. Symptoms: {symptoms}."
    medications_info = "Atorvastatin 10mg, Metoprolol 25mg"
    
    try:
        result = generate_medical_summary(patient_name, doctor_notes, medications_info)
        
        # Map output to what the frontend expects:
        # summary, risk_level, follow_up, medications
        return jsonify({
            'summary': result.get('visit_overview', '') + "\n" + result.get('diagnosis_explanation', ''),
            'risk_level': result.get('risk_level', 'Moderate' if priority == 'High' or 'chest' in symptoms.lower() else 'Low'),
            'follow_up': result.get('follow_up_advice', '4 weeks'),
            'medications': [result.get('medication_instructions', 'Follow doctor guidelines.')]
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

@app.route('/api/send-sms', methods=['POST'])
def send_sms():
    """Trigger an SMS reminder via Twilio."""
    data = request.json
    phone = data.get('phone')
    message = data.get('message', 'Reminder from RK Health.')
    
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_phone = os.getenv("TWILIO_PHONE_NUMBER")
    
    if not all([account_sid, auth_token, from_phone]):
        # Mock/Log SMS delivery if credentials are not configured
        print(f"[SMS MOCK] To: {phone} | Message: {message}")
        return jsonify({
            'success': True,
            'mocked': True,
            'message': 'SMS reminder processed (Mock mode - no API credentials).'
        })
        
    try:
        client = TwilioClient(account_sid, auth_token)
        sms = client.messages.create(
            body=message,
            from_=from_phone,
            to=phone
        )
        return jsonify({
            'success': True,
            'sms_sid': sms.sid,
            'message': 'SMS reminder sent successfully.'
        })
    except Exception as e:
        print("Twilio API error:", e)
        return jsonify({
            'success': False,
            'error': str(e),
            'message': 'Failed to send SMS reminder.'
        }), 500

if __name__ == '__main__':
    port = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "True").lower() == "true"
    app.run(host='0.0.0.0', port=port, debug=debug)
