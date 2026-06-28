# RK Health – AI Smart Patient Appointment & Medication Reminder System

RK Health is a patient reminder and healthcare record management dashboard. The system consolidates appointment scheduling, medication tracking, automated reminders, and AI-driven clinical summaries into a unified, responsive interface.

This repository is built using HTML5, CSS3, and JavaScript (ES6) for the frontend, Google Apps Script as the serverless API controller, Google Sheets as the cloud database, and external APIs (Google Calendar, Twilio SMS, Groq/Llama AI).

---

## Technical Prerequisites & Environment Setup Guide

### 1. Project Overview
Deploying a modern multi-service application requires strict synchronization between local and cloud infrastructure. This documentation ensures developers and evaluators set up their hardware, software, user accounts, and API permissions correctly prior to executing the codebase. Skipping these prerequisites will lead to CORS errors, authentication failures, or non-functional API features.

```
+------------------------+      REST APIs      +----------------------------+
|  Web Browser Frontend  | ------------------> |  Google Apps Script Backend|
+------------------------+                     +----------------------------+
            |                                                 |
            | (Generates Calendar Link)                       | (Stores / Reads logs)
            v                                                 v
+------------------------+                     +----------------------------+
|  Google Calendar API   |                     |   Google Sheets Database   |
+------------------------+                     +----------------------------+
                                                              |
                                           +------------------+------------------+
                                           |                                     |
                                           v (Dispatches SMS)                    v (Summarizes Visit)
                               +------------------------+            +------------------------+
                               |    Twilio SMS API      |            |   Groq (Llama 3) API   |
                               +------------------------+            +------------------------+
```

---

### 2. Hardware Requirements
To compile, test, and execute the RK Health platform locally, the development machine must meet the following minimum specifications:

| Component | Minimum Specification | Recommended Specification |
| :--- | :--- | :--- |
| **Operating System** | Windows 10/11, macOS Catalina or above, or Ubuntu Linux 20.04+ | Windows 11 / macOS Sonoma / Linux (Ubuntu 22.04 LTS) |
| **Processor** | Dual-core Intel Core i3 / AMD Ryzen 3 (or equivalent) | Quad-core Intel Core i5 / AMD Ryzen 5 / Apple Silicon M-series |
| **Memory (RAM)** | 4 GB | 8 GB or 16 GB |
| **Storage** | 500 MB free space (excluding OS requirements) | 2 GB free SSD space |
| **Connectivity** | Active Internet connection (Broadband) | High-speed Fiber Broadband (>25 Mbps) |

---

### 3. Software Requirements
The following local tools are required to edit, track, and serve the application code:
*   **Modern Web Browser (Chrome/Edge):** For rendering the frontend dashboard and debugging client-side scripts using Developer Tools.
*   **Visual Studio Code (VS Code):** The recommended IDE for markup, styles, and JavaScript development.
*   **Git (v2.30+):** For local version control, branch tracking, and staging code changes.
*   **Node.js (Optional, v18+):** Required if running local build tools or package configurations.
*   **Postman / Thunder Client:** Highly recommended for testing the Flask / Google Apps Script web endpoints independently.

---

### 4. Required Accounts & Services
The application interacts with multiple external platforms. Register the following accounts prior to deployment:

1.  **GitHub Account:** Required to host the project repository online and configure **GitHub Pages** to serve the static client dashboard (`index.html`, `css/`, `js/`) via a public URL.
2.  **Google Account:** Standard account needed to access **Google Sheets** (database store), **Google Apps Script** (execution engine), and **Google Calendar** (for creating appointment event links).
3.  **Twilio Developer Account:** Required to acquire a Twilio Phone Number, Account SID, and Auth Token for dispatching real-time SMS reminders to patients' verified mobile numbers.
4.  **Groq / AI Provider Account:** Access to the Groq Cloud Console is required to generate an API key for the Llama 3 model to summarize symptoms and return structured medical summaries.

---

### 5. Browser Compatibility
The frontend dashboard is designed using modern CSS Variables, Flexbox/Grid layouts, and Async-Await ES6 JavaScript.

| Browser | Compatibility | Features Enabled |
| :--- | :--- | :--- |
| **Google Chrome (v100+)** | Full Support | HTML5 Speech, Dialog elements, CSS transitions, Fetch API. |
| **Microsoft Edge (v100+)** | Full Support | Same Chromium engine as Chrome; identical features. |
| **Mozilla Firefox (v98+)** | Full Support | Fully compatible with grid layouts and CSS properties. |
| **Apple Safari (v15+)** | Full Support | Responsive styling, flexbox grids, and system fonts. |

*Note: Internet Explorer (IE) is **not** supported.*

---

### 6. APIs & Services Specification
*   **Google Sheets API:** Stores tables for patient records, appointments, and medication schedules in a Google Spreadsheet.
*   **Google Apps Script Web App:** Serves as the main REST API. It receives HTTP `POST` requests containing appointment/medication data from the frontend and performs CRUD operations on the linked Google Sheet.
*   **Google Calendar API:** Leverages structured HTTP GET template URLs to allow patients to instantly add scheduled visits to their personal calendar.
*   **Twilio Programmable SMS API:** Dispatches messages by triggering an HTTPS request from backend to Twilio's REST API.
*   **AI Inference API (Grok/Llama via Groq):** Compiles a diagnostic instruction prompt and sends it to `llama3-8b-8192`. The JSON response is parsed to update the UI summary modal.

---

### 7. Project Folder Structure
The project directory is structured as follows:

```
RK-Health/
│
├── index.html                  # Main application structure & landing dashboard
├── css/
│   └── style.css               # Vanilla CSS design system (fonts, layouts)
├── js/
│   └── script.js               # Client-side validation, API requests, routing
├── assets/
│   ├── images/                 # SVG or PNG illustrations and logos
│   └── icons/                  # Custom application icons
├── appscript/
│   └── code.gs                 # Google Apps Script source file (backend endpoint)
├── requirements.txt            # Python dependencies (for Flask backend option)
├── app.py                      # Flask Server script (for local development option)
└── README.md                   # Setup instructions and documentation (This file)
```

---

### 8. Installation & Configuration Steps

#### Step 1: Clone the Codebase
Open your terminal (or Git Bash) and run:
```bash
git clone https://github.com/Karthik/RK-Health-AI-Smart-Patient-Appointment-Medication-Reminder-System.git
cd RK-Health-AI-Smart-Patient-Appointment-Medication-Reminder-System
```

#### Step 2: Set up the Google Sheet
1. Open [Google Sheets](https://sheets.google.com/) and create a new blank sheet named `RK_Health_Database`.
2. Copy the **Spreadsheet ID** from the URL bar:
   `https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID_HERE]/edit`

#### Step 3: Configure and Deploy Google Apps Script
1. Go to [Google Apps Script](https://script.google.com/) and create a new project named `RK_Health_Backend`.
2. Copy the code from `appscript/code.gs` into the editor.
3. Replace the placeholder spreadsheet ID with your actual Google Sheet ID:
   ```javascript
   const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID_HERE";
   ```
4. Click **Deploy** -> **New Deployment**. Select **Web App**.
5. Configure access settings:
   * **Execute as:** *Me (your email)*
   * **Who has access:** *Anyone*
6. Click **Deploy**, authorize permissions, and copy the generated **Web App URL**.

#### Step 4: Configure Frontend API Keys
1. Open the project in VS Code.
2. In `js/script.js` (or `rk-health/script.js`), paste your Apps Script URL:
   ```javascript
   const APPS_SCRIPT_URL = "YOUR_DEPLOYED_WEB_APP_URL_HERE";
   ```

#### Step 5: Twilio & AI Credentials (Backend-Specific)
*   **Twilio SMS Config:** Inside your Apps Script (or `.env` for Flask), enter your Twilio `Account SID`, `Auth Token`, and `Twilio Phone Number`.
*   **AI Summary Config:** Paste your Groq API Key under `GROQ_API_KEY` to authenticate Llama summaries.

---

### 9. Knowledge Prerequisites
To successfully modify or expand this project, developers should have a foundational understanding of:
*   **HTML5/CSS3:** DOM layouts, Flexbox/Grid, form validation, semantic markup, and custom properties.
*   **JavaScript (ES6+):** Fetch API, async/await, JSON parsing, and event handling.
*   **REST API Architecture:** HTTP request methods (`GET`, `POST`, `DELETE`), headers, status codes, and body payloads.
*   **Google Apps Script:** Writing basic Javascript execution scripts in Google Cloud, reading spreadsheet objects, and returning JSON.
*   **Git Command Line:** Basic operations such as `git init`, `git add`, `git commit`, `git push`.

---

### 10. Environment Setup Checklist
*   [ ] Visual Studio Code installed.
*   [ ] Git installed and configured.
*   [ ] Google, GitHub, Twilio, and Groq accounts active.
*   [ ] Google Sheet created with appropriate sheet tabs.
*   [ ] Google Apps Script created and authorized.
*   [ ] Apps Script deployed as a Web App with access set to "Anyone".
*   [ ] Web App URL successfully pasted into the frontend `script.js`.
*   [ ] Groq API key and Twilio credentials saved in the backend environment.
*   [ ] Live Server extension installed in VS Code to run frontend locally.

---

### 11. Common Setup Issues & Troubleshooting
*   **CORS Error (Cross-Origin Resource Sharing):** Ensure Apps Script responses are returned using `ContentService.createTextOutput()`. Redeploy the script and update the URL in `script.js` whenever backend changes are saved.
*   **Google Sheets "Access Denied" or Permissions Failures:** Ensure the Google account running the Apps Script has editor permissions on the Sheet. Accept the authorization prompts during deployment.
*   **SMS Fails to Send (Twilio Error):** Verify recipient phone numbers are verified (for Twilio trial accounts) and include country codes (e.g. `+91`).
*   **AI Summary Returns Connection Error:** Verify that the `GROQ_API_KEY` is active and correct.

---

### 12. Best Practices & Security Guidelines
*   **Never Hardcode Secrets in Frontend Code:** All keys (Twilio, Groq, Sheets) must remain on the secure cloud layer (Google Apps Script Properties Service or `.env` files for Flask).
*   **Version Control Protocol:** Do not commit `.env` files or credentials to your public GitHub repository. Maintain an updated `.gitignore` file.
*   **Backup Database Regularly:** Maintain version history inside your Google Sheets database.
*   **Input Sanitization:** Validate user-supplied inputs in JavaScript before sending payloads.
