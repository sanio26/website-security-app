import os
import requests
import validators
import tldextract
import whois
import pytesseract
from datetime import datetime
from PIL import Image
import PyPDF2
import openai
from bs4 import BeautifulSoup
from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
from dotenv import load_dotenv
import hashlib
import json

load_dotenv()

app = Flask(__name__)
app.secret_key = os.urandom(24)
CORS(app)

# Configure upload folder
UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Configure OpenAI (optional - add your key if you have one)
openai.api_key = os.getenv('OPENAI_KEY', '')  # Optional for demo

# In-memory database for demo
scan_history = []

def check_ssl_certificate(url):
    """Basic SSL certificate check"""
    try:
        if url.startswith('https'):
            response = requests.get(url, timeout=5, verify=True)
            return {
                'has_ssl': True,
                'valid': True,
                'issuer': 'Verified',
                'expiry': 'Valid'
            }
    except:
        pass
    return {'has_ssl': False, 'valid': False}

def check_security_headers(url):
    """Check for essential security headers"""
    try:
        response = requests.get(url, timeout=5)
        headers = response.headers
        security_headers = {
            'strict-transport-security': headers.get('Strict-Transport-Security', 'Not set'),
            'content-security-policy': headers.get('Content-Security-Policy', 'Not set'),
            'x-frame-options': headers.get('X-Frame-Options', 'Not set'),
            'x-content-type-options': headers.get('X-Content-Type-Options', 'Not set'),
            'referrer-policy': headers.get('Referrer-Policy', 'Not set')
        }
        
        # Calculate security score
        score = 0
        if security_headers['strict-transport-security'] != 'Not set': score += 20
        if security_headers['content-security-policy'] != 'Not set': score += 20
        if security_headers['x-frame-options'] != 'Not set': score += 20
        if security_headers['x-content-type-options'] != 'Not set': score += 20
        if security_headers['referrer-policy'] != 'Not set': score += 20
        
        return {
            'headers': security_headers,
            'score': score
        }
    except:
        return {'headers': {}, 'score': 0}

def check_reputation(url):
    """Basic reputation check using free APIs"""
    reputation = {
        'phishing_likelihood': 'Low',
        'known_malicious': False,
        'trust_score': 85  # Default score
    }
    
    try:
        # Check URL against free threat intel (example using Google Safe Browsing - would need API key)
        # For demo, we'll do basic checks
        extracted = tldextract.extract(url)
        domain = f"{extracted.domain}.{extracted.suffix}"
        
        # Check domain age via whois
        try:
            domain_info = whois.whois(domain)
            if domain_info.creation_date:
                if isinstance(domain_info.creation_date, list):
                    creation_date = domain_info.creation_date[0]
                else:
                    creation_date = domain_info.creation_date
                
                age_days = (datetime.now() - creation_date).days
                if age_days < 30:
                    reputation['trust_score'] = 40
                    reputation['phishing_likelihood'] = 'High'
                elif age_days < 180:
                    reputation['trust_score'] = 60
                    reputation['phishing_likelihood'] = 'Medium'
        except:
            pass
    except:
        pass
    
    return reputation

def extract_terms_from_url(url):
    """Extract terms and conditions text from common paths"""
    common_paths = [
        '/terms', '/terms-of-service', '/terms-conditions',
        '/privacy', '/privacy-policy', '/legal',
        '/tos', '/terms-of-use'
    ]
    
    terms_text = ""
    found_terms = []
    
    for path in common_paths:
        try:
            full_url = url.rstrip('/') + path
            response = requests.get(full_url, timeout=3)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                # Remove script and style elements
                for script in soup(["script", "style"]):
                    script.decompose()
                text = soup.get_text()
                if len(text) > 500:  # Found substantial content
                    terms_text = text[:5000]  # First 5000 chars
                    found_terms.append(path)
        except:
            continue
    
    return {
        'found': len(found_terms) > 0,
        'paths': found_terms,
        'text': terms_text if terms_text else "No terms and conditions found"
    }

def analyze_with_ai(text, analysis_type="summary"):
    """Use AI to analyze terms or answer questions"""
    if not openai.api_key:
        # Demo mode - return template responses
        if analysis_type == "summary":
            return """**Terms Summary:**
- Data Collection: This website collects basic usage data
- Cookies: Used for functionality and analytics
- Third-party sharing: Limited to essential services
- User rights: Standard GDPR compliance mentioned"""
        else:
            return "I'm in demo mode. For full AI features, add your OpenAI API key!"
    
    try:
        if analysis_type == "summary":
            prompt = f"Summarize these terms and conditions in simple bullet points, focusing on data collection, privacy, and user rights:\n\n{text[:3000]}"
        else:
            prompt = f"Answer this question about the terms: {analysis_type}\n\nTerms text:\n{text[:2000]}"
        
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500
        )
        return response.choices[0].message.content
    except:
        return "AI analysis temporarily unavailable. Using demo mode."

def extract_text_from_image(image_path):
    """Extract text from screenshot using OCR"""
    try:
        image = Image.open(image_path)
        text = pytesseract.image_to_string(image)
        return text
    except:
        return "Could not extract text from image"

def extract_text_from_pdf(pdf_path):
    """Extract text from PDF file"""
    text = ""
    try:
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            for page in pdf_reader.pages:
                text += page.extract_text()
        return text[:5000]  # First 5000 chars
    except:
        return "Could not extract text from PDF"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/analyze', methods=['POST'])
def analyze():
    data = request.json
    url = data.get('url', '')
    
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    
    if not validators.url(url):
        return jsonify({'error': 'Invalid URL'}), 400
    
    # Run all security checks
    ssl_check = check_ssl_certificate(url)
    headers_check = check_security_headers(url)
    reputation_check = check_reputation(url)
    terms_check = extract_terms_from_url(url)
    
    # Generate overall safety score
    overall_score = (
        (50 if ssl_check['has_ssl'] else 0) +
        headers_check['score'] * 0.3 +
        reputation_check['trust_score'] * 0.2
    )
    
    # Determine safety level
    if overall_score >= 70:
        safety_level = "🟢 Safe"
        color = "green"
    elif overall_score >= 40:
        safety_level = "🟡 Caution"
        color = "orange"
    else:
        safety_level = "🔴 Unsafe"
        color = "red"
    
    # Summarize terms with AI
    if terms_check['found']:
        summary = analyze_with_ai(terms_check['text'], "summary")
    else:
        summary = "No terms and conditions page found for automated analysis."
    
    result = {
        'url': url,
        'safety_level': safety_level,
        'safety_color': color,
        'overall_score': round(overall_score, 2),
        'ssl': ssl_check,
        'security_headers': headers_check,
        'reputation': reputation_check,
        'terms': {
            'found': terms_check['found'],
            'paths': terms_check['paths'],
            'summary': summary
        },
        'timestamp': datetime.now().isoformat()
    }
    
    # Save to history
    scan_history.append(result)
    
    return jsonify(result)

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    question = data.get('question', '')
    context = data.get('context', '')
    
    answer = analyze_with_ai(f"Context: {context}\nQuestion: {question}", "question")
    
    return jsonify({
        'answer': answer,
        'question': question
    })

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Handle file uploads (screenshots, PDFs)"""
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    # Save file
    filename = hashlib.md5(file.filename.encode() + str(datetime.now()).encode()).hexdigest()
    ext = os.path.splitext(file.filename)[1].lower()
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename + ext)
    file.save(filepath)
    
    # Extract text based on file type
    text = ""
    if ext in ['.png', '.jpg', '.jpeg', '.gif', '.bmp']:
        text = extract_text_from_image(filepath)
    elif ext == '.pdf':
        text = extract_text_from_pdf(filepath)
    else:
        return jsonify({'error': 'Unsupported file type'}), 400
    
    # Clean up
    os.remove(filepath)
    
    # Analyze extracted text
    if text:
        summary = analyze_with_ai(text, "summary")
        return jsonify({
            'success': True,
            'extracted_text': text[:500] + "..." if len(text) > 500 else text,
            'summary': summary
        })
    else:
        return jsonify({'error': 'Could not extract text from file'}), 400

@app.route('/api/history', methods=['GET'])
def get_history():
    """Return scan history"""
    return jsonify(scan_history[-10:])  # Last 10 scans

@app.route('/api/report/<int:index>', methods=['GET'])
def generate_report(index):
    """Generate PDF report of a scan"""
    if index < len(scan_history):
        scan = scan_history[index]
        # In a real app, generate PDF here
        return jsonify({
            'download_url': f'/api/download/{index}',
            'scan': scan
        })
    return jsonify({'error': 'Scan not found'}), 404

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)