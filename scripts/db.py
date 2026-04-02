from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from email.mime.text import MIMEText
import datetime
from dotenv import load_dotenv
import smtplib
import time
import os
import json
import socket

# db.py
# This script checks for unpaid utility bills and sends email reminders.
# It connects to a database, queries for bills due soon, and uses SMTP to send emails.

# Determine the base directory of the script for robust path construction.
script_dir = os.path.dirname(os.path.abspath(__file__))

# Attempt to load .env file from common locations relative to the script.
# This allows flexibility in where the .env file is placed (e.g., project root).
dotenv_paths = [
    os.path.join(script_dir, '..', '.env'),  # Project root (next to scripts/)
    os.path.join(script_dir, '.env'),
]
# Get custom path from environment variable if set
custom_dotenv_path = os.getenv('PYTHON_DOTENV_PATH')
if custom_dotenv_path:
    dotenv_paths.insert(0, custom_dotenv_path) # Prioritize custom path

loaded_path = None
for path in dotenv_paths:
    if os.path.exists(path):
        load_dotenv(dotenv_path=path)
        loaded_path = path
        break

if not loaded_path:
    print("Warning: .env file not found in any of the specified paths. Relying on pre-set environment variables.")

# --- Configuration Loading & Validation ---
# Load environment variables from .env file.
APP_BASE_URL = os.getenv('APP_BASE_URL', 'https://utilities.example.com').rstrip('/')
DB_HOST = os.getenv('DB_HOST', 'webdb.uvm.edu')
DB_NAME = os.getenv('DB_NAME')
DB_USER = os.getenv('DB_USER')
DB_PASS = os.getenv('DB_PASS')
EMAIL_PASS = os.getenv('EMAIL_PASS') # For the sender email

APP_EMAIL_FROM_NAME = os.getenv('APP_EMAIL_FROM_NAME', 'Utility Service') # Default if not set
PYTHON_SENDER_EMAIL = os.getenv('PYTHON_SENDER_EMAIL')
PYTHON_CONFIRMATION_EMAIL_TO = os.getenv('PYTHON_CONFIRMATION_EMAIL_TO')

# Default DB_SSL_CA_PATH construction
default_ca_path = os.path.join(script_dir, '..', 'webdb-cacert.pem')
DB_SSL_CA_PATH = os.getenv('DB_SSL_CA_PATH', default_ca_path)
# Read DB_USE_SSL, defaulting to 'false' if not set, then convert to boolean.
raw_db_use_ssl = os.getenv('DB_USE_SSL', 'false')
DB_USE_SSL = raw_db_use_ssl.lower() in ['true', '1']


# Load and parse APP_USER_EMAILS
email_map_json = os.getenv('APP_USER_EMAILS', '{}')
try:
    EMAIL_MAP = json.loads(email_map_json)
except json.JSONDecodeError:
    print(f"Warning: Could not parse APP_USER_EMAILS JSON: {email_map_json}. Using empty email map.")
    EMAIL_MAP = {}

# Validate that all critical environment variables are loaded.
# This helps in early detection of configuration issues.
critical_vars = {
    "DB_NAME": DB_NAME, "DB_USER": DB_USER, "DB_PASS": DB_PASS,
    "EMAIL_PASS": EMAIL_PASS,
    "PYTHON_SENDER_EMAIL": PYTHON_SENDER_EMAIL,
    "PYTHON_CONFIRMATION_EMAIL_TO": PYTHON_CONFIRMATION_EMAIL_TO
    # APP_BASE_URL is not strictly critical for script to run, defaults exist.
    # DB_HOST also has a default.
}
missing_vars = [name for name, var in critical_vars.items() if not var]
if missing_vars:
    print(f"Error: Missing critical environment variables: {', '.join(missing_vars)}. Please check your .env file. Exiting.")
    exit(1)

# Dry Run Mode Configuration
# APP_DRY_RUN_ADMIN_ONLY and APP_ADMIN_USERS are not directly applicable to this script,
# as it's not run in a specific user's context. If APP_DRY_RUN_ENABLED is true,
# this script will operate in dry-run mode.
APP_DRY_RUN_ENABLED = os.getenv('APP_DRY_RUN_ENABLED', 'false').lower() in ['true', '1']


# --- DatabaseManager Class ---
class DatabaseManager:
    """
    Manages database connections and queries using SQLAlchemy.
    """
    def __init__(self, db_url: str, ssl_args: dict):
        """
        Initializes the DatabaseManager with database URL and SSL arguments.
        Creates a SQLAlchemy engine and sessionmaker.
        """
        try:
            # Create a SQLAlchemy engine. `connect_args` passes SSL options to the DB driver.
            self.engine = create_engine(db_url, connect_args=ssl_args)
            # Configure a sessionmaker for creating sessions.
            self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
            print("Database engine created successfully.")
        except Exception as e:
            print(f"Error creating database engine: {e}")
            raise # Re-raise exception to halt script if DB connection cannot be established.

    def get_unpaid_bills(self) -> list:
        """
        Fetches details for all unpaid bills, including who owes for them.
        Returns a list of dictionaries, each containing:
        'due_date', 'person_name', 'item', 'total_bill_amount', 'cost_per_person', 'bill_id'
        Returns an empty list on error.
        """
        try:
            with self.SessionLocal() as session:
                sql_query = text("""
                    SELECT
                        u.fldDue AS due_date,
                        p.personName AS person_name,
                        u.fldItem AS item,
                        u.fldTotal AS total_bill_amount,
                        u.fldCost AS cost_per_person,
                        u.pmkBillID as bill_id
                    FROM tblUtilities u
                    JOIN tblBillOwes bo ON u.pmkBillID = bo.billID
                    JOIN tblPeople p ON bo.personID = p.personID
                    WHERE u.fldStatus <> 'Paid'
                    ORDER BY u.fldDue, p.personName;
                """)
                result = session.execute(sql_query)
                # Convert Row objects to dictionaries for easier access
                return [row._asdict() for row in result.all()]
        except Exception as e:
            print(f"Error fetching unpaid bills with details: {e}")
            return []

    # get_bill_details_for_reminder is no longer needed as get_unpaid_bills fetches all required info.
    # If it were to be kept, it would need to be updated for the new schema or removed.
    # For this refactor, we assume it's removed/obsolete.

# --- Global Variables & Constants ---
DATE_FORMAT_STR = "%Y-%m-%d" # Standard date format string for display.
SMTP_SERVER = 'smtp.mail.me.com' # SMTP server for sending emails (e.g., iCloud).
SMTP_PORT = 587 # Standard SMTP port for TLS.
db_manager = None # Global instance of DatabaseManager, initialized in main().

# --- Email Functions ---
def get_email_body(due_date_str: str, item_str: str, total: float, cost: float, app_base_url: str, from_name: str, from_contact_email: str, person_name: str = "there") -> str:
    """
    Generates the HTML body for reminder emails.
    Formats the due date and includes bill item, details, and a link to the portal.
    Uses modern, clean styling consistent with the web portal.
    """
    try:
        date_obj = datetime.datetime.strptime(due_date_str, DATE_FORMAT_STR)
        readable_due_date = date_obj.strftime("%B %d, %Y")
    except ValueError:
        readable_due_date = due_date_str

    portal_link = f"{app_base_url}/index.php"

    return f"""<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial; color:#0f1724;">
    <h2 style="margin:0 0 8px 0; font-size:18px; color:#111827;">Reminder: {item_str}</h2>
    <p style="margin:0 0 8px 0; color:#374151; font-size:14px;">Hello {person_name},</p>
    <p style="margin:0 0 8px 0; color:#374151; font-size:14px;">This is a reminder that your <strong>{item_str}</strong> bill (total: ${total:.2f}) is due on <strong>{readable_due_date}</strong>. Your share: <strong>${cost:.2f}</strong>.</p>
    <p style="margin:0 0 12px 0;">
        <a href="{portal_link}" style="display:inline-block;padding:8px 12px;background:linear-gradient(90deg, #7C4DFF, #5B8DEF);color:#fff;border-radius:8px;text-decoration:none;">View details</a>
    </p>
    <hr style="border:none;border-top:1px solid #eef2ff;margin:12px 0;">
    <p style="margin:0;color:#6b7280;font-size:13px;">{from_name} — <a href="mailto:{from_contact_email}">{from_contact_email}</a></p>
</div>
"""

def send_email(recipient_email: str, subject: str, body_html: str) -> bool:
    """
    Sends an email using configured SMTP settings.
    Returns True if email sent successfully, False otherwise.
    """
    global APP_EMAIL_FROM_NAME, PYTHON_SENDER_EMAIL, EMAIL_PASS # Globals for sender info

    if not recipient_email: # Should be pre-validated by caller
        print(f"[WARN] No recipient email address provided. Skipping email.")
        return False

    msg = MIMEText(body_html, 'html')
    msg['Subject'] = subject
    msg['From']    = f"{APP_EMAIL_FROM_NAME} <{PYTHON_SENDER_EMAIL}>"
    msg['To']      = recipient_email

    if APP_DRY_RUN_ENABLED:
        print(f"[DRY RUN] Would send email to: {recipient_email}")
        print(f"[DRY RUN] Subject: '{subject}'")
        return True

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(PYTHON_SENDER_EMAIL, EMAIL_PASS)
            server.sendmail(PYTHON_SENDER_EMAIL, [recipient_email], msg.as_string())
        print(f"Email successfully sent to {recipient_email} with subject '{subject}'.")
        return True
    except (smtplib.SMTPException, socket.error) as e:
        print(f"[ERROR] SMTP error while sending email to {recipient_email}: {e}")
        return False
    except Exception as e:
        print(f"[ERROR] Unexpected error sending email to {recipient_email}: {e}")
        return False


def send_batch_confirmation_email(sent_list: list, dry_run: bool = False):
    """Sends a single consolidated confirmation email to the admin listing all reminders sent.
       sent_list is a list of dicts with 'recipient', 'subject', 'item', 'person_name' keys.
       If dry_run is True, it simulates sending."""
    global APP_EMAIL_FROM_NAME, PYTHON_SENDER_EMAIL, PYTHON_CONFIRMATION_EMAIL_TO, EMAIL_PASS
    
    if not sent_list:
        print("[INFO] No reminders were sent, skipping admin confirmation email.")
        return
    
    confirmation_subject = f'Daily Reminder Batch Report ({len(sent_list)} sent)'
    
    # Build the list of recipients
    recipient_rows = ""
    for item in sent_list:
        recipient_rows += f"""<tr>
            <td style="padding:6px 12px;border-bottom:1px solid #eef2ff;">{item['person_name']}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #eef2ff;">{item['recipient']}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #eef2ff;">{item['item']}</td>
        </tr>"""
    
    confirmation_body = f"""<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#111827;">
    <h3 style="margin:0 0 12px 0;">Daily Reminder Batch Report</h3>
    <p style="margin:0 0 12px 0;color:#374151;">The following <strong>{len(sent_list)}</strong> reminder emails were sent:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
            <tr style="background:#f8fafc;">
                <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;">Name</th>
                <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;">Email</th>
                <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;">Bill Type</th>
            </tr>
        </thead>
        <tbody>
            {recipient_rows}
        </tbody>
    </table>
    <hr style="border:none;border-top:1px solid #eef2ff;margin:16px 0;">
    <p style="margin:0;color:#6b7280;font-size:13px;">{APP_EMAIL_FROM_NAME} — Automated Daily Script</p>
</div>
"""
    msg = MIMEText(confirmation_body, 'html')
    msg['Subject'] = confirmation_subject
    msg['From'] = f"{APP_EMAIL_FROM_NAME} <{PYTHON_SENDER_EMAIL}>"
    msg['To'] = PYTHON_CONFIRMATION_EMAIL_TO

    if dry_run:
        print(f"[DRY RUN] Would send batch confirmation to: {PYTHON_CONFIRMATION_EMAIL_TO}")
        return

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(PYTHON_SENDER_EMAIL, EMAIL_PASS)
            server.sendmail(PYTHON_SENDER_EMAIL, [PYTHON_CONFIRMATION_EMAIL_TO], msg.as_string())
        print(f"Batch confirmation email successfully sent to {PYTHON_CONFIRMATION_EMAIL_TO}.")
    except (smtplib.SMTPException, socket.error) as e:
        print(f"[ERROR] SMTP error while sending batch confirmation email to {PYTHON_CONFIRMATION_EMAIL_TO}: {e}")
    except Exception as e:
        print(f"[ERROR] Unexpected error sending batch confirmation to {PYTHON_CONFIRMATION_EMAIL_TO}: {e}")


# --- Main Execution Block ---
if __name__ == '__main__':
    print('============== Initializing Script ==============')
    if APP_DRY_RUN_ENABLED:
        print("############################################################")
        print("## TESTING/DRY-RUN MODE IS CURRENTLY ACTIVE FOR THIS SCRIPT ##")
        print("## Emails will NOT actually be sent.                      ##")
        print("############################################################")

    db_url = f"mysql+mysqlconnector://{DB_USER}:{DB_PASS}@{DB_HOST}/{DB_NAME}"

    ssl_args_dict = {}
    if DB_USE_SSL:
        print("[INFO] DB_USE_SSL is true. Attempting SSL connection for database.")
        if DB_SSL_CA_PATH:
            ca_path_to_check = DB_SSL_CA_PATH
            if not os.path.isabs(ca_path_to_check):
                project_root = os.path.abspath(os.path.join(script_dir, '..', '..'))
                ca_path_to_check = os.path.join(project_root, DB_SSL_CA_PATH)

            if os.path.exists(ca_path_to_check) and os.access(ca_path_to_check, os.R_OK):
                ssl_args_dict['ssl_ca'] = ca_path_to_check
                print(f"[INFO] Using SSL CA certificate for database: {ca_path_to_check}")
            else:
                print(f"[WARN] DB_USE_SSL is true, but DB_SSL_CA_PATH ('{DB_SSL_CA_PATH}', resolved to '{ca_path_to_check}') is invalid or not readable. Attempting connection without client-side SSL CA verification.")
                # Proceeding with empty ssl_args_dict for SSL, relies on server/driver defaults or system CAs.
        else:
            print("[WARN] DB_USE_SSL is true, but DB_SSL_CA_PATH is not set. SSL connection will rely on server configuration and system CAs.")
            # Proceeding with empty ssl_args_dict for SSL.
    else:
        print("[INFO] DB_USE_SSL is false. Attempting connection without SSL for database.")
        # ssl_args_dict remains empty, so SQLAlchemy won't attempt to use SSL explicitly.

    # Initialize the DatabaseManager.
    try:
        db_manager = DatabaseManager(db_url, ssl_args_dict)
    except Exception as e:
        # Errors during engine creation are critical and usually printed by DatabaseManager's __init__.
        print(f"Critical: Failed to initialize DatabaseManager. Exiting script.")
        exit(1) # Terminate script if DatabaseManager cannot be initialized.

    print('============== Checking Bills ==============')
    script_start_time = datetime.datetime.now() # Record script start time for duration calculation.
    print(f"Script started at: {script_start_time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Fetch all unpaid bills from the database.
    # Each item in unpaid_bills_data is a dictionary with all necessary details.
    unpaid_bills_data = db_manager.get_unpaid_bills()

    if unpaid_bills_data: # Proceed if there are any unpaid bills.
        print('-------------- Email Scheduling --------------')
        print(f'Found {len(unpaid_bills_data)} unpaid bill instances (bill per person).')

        email_sent_count = 0    # Counter for successfully sent emails.
        email_failed_count = 0  # Counter for failed email attempts.
        sent_reminders_list = []  # Track successfully sent reminders for batch confirmation

        for bill_info in unpaid_bills_data:
            # Extract data from the bill_info dictionary
            due_date_obj = bill_info['due_date']  # This is already a datetime.date object
            person_name_str = bill_info['person_name']
            item_str = bill_info['item']
            # Ensure these are floats for calculations and formatting
            total_amount_val = float(bill_info['total_bill_amount'])
            cost_per_person_val = float(bill_info['cost_per_person'])
            # bill_id = bill_info['bill_id'] # Available if needed for more detailed logging

            print(f'- Processing: Item=\'{item_str}\', Due={due_date_obj.strftime(DATE_FORMAT_STR)}, For Person=\'{person_name_str}\'')

            recipient_email_str = EMAIL_MAP.get(person_name_str)
            if not recipient_email_str:
                print(f"  - [WARN] No email found for {person_name_str} in APP_USER_EMAILS. Skipping reminder for item '{item_str}'.")
                email_failed_count += 1
                continue

            try:
                days_until_due = (due_date_obj - datetime.date.today()).days
                print(f'  - Days until bill due: {days_until_due}')

                if days_until_due <= 7: # Reminder threshold (e.g., 7 days)
                    print('  - Attempting to prepare and send email...')

                    subject_str = f"URGENT: Reminder - {item_str} Bill Due Soon" if days_until_due <= 3 else f"Reminder: {item_str} Bill Due"

                    email_body_html = get_email_body(
                        due_date_str=due_date_obj.strftime(DATE_FORMAT_STR), # Pass formatted date string for email body
                        item_str=item_str,
                        total=total_amount_val,
                        cost=cost_per_person_val,
                        app_base_url=APP_BASE_URL,
                        from_name=APP_EMAIL_FROM_NAME,
                        from_contact_email=PYTHON_SENDER_EMAIL,
                        person_name=person_name_str
                    )

                    if send_email(
                        recipient_email=recipient_email_str,
                        subject=subject_str,
                        body_html=email_body_html
                    ):
                        # Success/Dry-run message is printed by send_email()
                        email_sent_count += 1
                        sent_reminders_list.append({
                            'recipient': recipient_email_str,
                            'subject': subject_str,
                            'item': item_str,
                            'person_name': person_name_str
                        })
                    else:
                        # Failure message is printed by send_email()
                        email_failed_count += 1
                    time.sleep(1) # Respect rate limits
                else:
                    print(f"    - Reminder not yet due for {person_name_str} (Item: {item_str}).")
            except ValueError as ve:
                print(f"  - [ERROR] Date processing error for {person_name_str}, bill item '{item_str}' due {due_date_obj.strftime(DATE_FORMAT_STR)}: {ve}")
                email_failed_count += 1
            except Exception as e:
                print(f"  - [ERROR] Unexpected error processing for {person_name_str}, bill item '{item_str}' due {due_date_obj.strftime(DATE_FORMAT_STR)}: {e}")
                email_failed_count += 1

        # Print a summary of email sending activity.
        print('-------------- Summary --------------')
        print(f"Total reminder emails attempted: {email_sent_count + email_failed_count}")
        print(f"Successfully sent: {email_sent_count}")
        print(f"Failed to send: {email_failed_count}")
        
        # Send a single consolidated confirmation email to admin
        if sent_reminders_list:
            print('-------------- Admin Notification --------------')
            send_batch_confirmation_email(sent_reminders_list, dry_run=APP_DRY_RUN_ENABLED)

    elif unpaid_bills_data is None: # This case should ideally not be reached if get_unpaid_bills returns [].
        print("Critical error: Could not retrieve bill information. Email scheduling aborted.")
    else: # unpaid_bills_data is an empty list.
        print("No unpaid bills found that require reminders at this time.")

    script_end_time = datetime.datetime.now() # Record script end time.
    print(f"Script finished at: {script_end_time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Total execution time: {script_end_time - script_start_time}") # Print total duration.
    print('=================== Done ===================\n')
