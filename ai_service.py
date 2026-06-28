import os
import json
import logging
from dotenv import load_dotenv
from groq import Groq

# Configure logger
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Initialize Groq client with error handling
if not GROQ_API_KEY:
    logger.warning("API INITIALIZATION WARNING: GROQ_API_KEY is not set in environment variables. Falling back to local mock data generator.")
    client = None
else:
    try:
        client = Groq(api_key=GROQ_API_KEY)
        logger.info("API INITIALIZATION SUCCESS: Groq client configured successfully.")
    except Exception as e:
        logger.error(f"API INITIALIZATION ERROR: Failed to configure Groq client: {e}")
        client = None

def generate_medical_summary(patient_name, doctor_notes, medications_info):
    """
    Sends visit records to Groq LLM (Llama-3-8b) and returns a structured clinical summary.
    
    Args:
        patient_name (str): Patient's name.
        doctor_notes (str): Chief complaints, symptoms, or diagnostic notes.
        medications_info (str): List of medicines, dosage, or scheduling guidelines.
        
    Returns:
        dict: A structured dictionary containing:
            - visit_overview
            - diagnosis_explanation
            - medication_instructions
            - follow_up_advice
    """
    logger.info(f"Request prepared for patient: {patient_name}")
    logger.info(f"Notes length: {len(doctor_notes)} chars | Medications length: {len(medications_info)} chars")
    
    # 1. Handle missing key
    if not GROQ_API_KEY or client is None:
        logger.warning("API WARNING: Using mock engine for summary generation (No valid GROQ_API_KEY).")
        # Return fallback mock JSON
        return {
            "visit_overview": f"Patient {patient_name} completed their visit. Main complaints reviewed: {doctor_notes}.",
            "diagnosis_explanation": "Vitals are stable. Presenting symptoms indicate need for regular observation and symptomatic relief.",
            "medication_instructions": f"Continue prescribed regimen: {medications_info or 'strictly as directed'}.",
            "follow_up_advice": "Return for a routine follow-up in 4 weeks, or sooner if symptoms worsen."
        }
        
    prompt = f"""
    Generate a professional, patient-friendly medical visit summary for:
    Patient Name: {patient_name}
    Doctor Notes / Symptoms: {doctor_notes}
    Current Medications / Guidelines: {medications_info}
    
    You MUST respond with a valid JSON object matching the following structure:
    {{
        "visit_overview": "A clear, concise 2-3 sentence overview of the visit.",
        "diagnosis_explanation": "A simplified, patient-friendly explanation of what these symptoms/conditions mean.",
        "medication_instructions": "Clear step-by-step guidance on taking prescriptions or managing medications.",
        "follow_up_advice": "Recommended next steps, lifestyle changes, or follow-up schedule."
    }}
    """
    
    try:
        logger.info("API CALL: Dispatching request to Groq LLM API (model: llama-3.3-70b-versatile)...")
        completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a professional medical assistant. You translate complex clinical findings into easy-to-understand, encouraging, patient-friendly instructions. You must respond strictly in JSON."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.8,
            max_tokens=2048,
            response_format={"type": "json_object"}
        )
        
        logger.info("API RESPONSE: Completed successfully.")
        response_content = completion.choices[0].message.content
        
        # Parse the JSON response
        result = json.loads(response_content)
        return result
        
    except json.JSONDecodeError as je:
        logger.error(f"API PARSING ERROR: Failed to parse Groq response as JSON: {je}")
        raise ValueError("Invalid JSON response format from Groq LLM API.")
    except Exception as e:
        logger.error(f"API EXECUTION ERROR: Exception during Groq request: {e}")
        raise e
