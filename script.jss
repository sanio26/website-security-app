// Global variables
let currentAnalysis = null;

// Wait for the DOM to load completely
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded - initializing app');
    
    // Set up tab switching
    setupTabs();
    
    // Set up file upload
    setupFileUpload();
    
    // Set up Enter key for URL input
    const urlInput = document.getElementById('url-input');
    if (urlInput) {
        urlInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                analyzeUrl();
            }
        });
    }
});

// Tab switching
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            const tabName = this.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
            if (tabName) {
                switchTab(tabName);
            } else {
                // Alternative way if onclick attribute isn't set
                const tabText = this.textContent.toLowerCase().trim();
                if (tabText.includes('url')) switchTab('url');
                else if (tabText.includes('upload')) switchTab('upload');
                else if (tabText.includes('history')) switchTab('history');
            }
        });
    });
}

function switchTab(tabName) {
    console.log('Switching to tab:', tabName);
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        // Try to match by text content or onclick attribute
        if (btn.textContent.toLowerCase().includes(tabName) || 
            (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tabName))) {
            btn.classList.add('active');
        }
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const targetTab = document.getElementById(tabName + '-tab');
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    if (tabName === 'history') {
        loadHistory();
    }
}

// Analyze URL
async function analyzeUrl() {
    console.log('Analyze URL called');
    
    const urlInput = document.getElementById('url-input');
    if (!urlInput) {
        console.error('URL input not found');
        return;
    }
    
    let url = urlInput.value.trim();
    console.log('URL entered:', url);
    
    if (!url) {
        alert('Please enter a URL');
        return;
    }
    
    // Add https:// if no protocol is specified
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    
    // Show loading
    document.getElementById('loading').style.display = 'block';
    document.getElementById('results').style.display = 'none';
    
    try {
        console.log('Sending request to /api/analyze');
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: url })
        });
        
        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.error) {
            alert('Error: ' + data.error);
            document.getElementById('loading').style.display = 'none';
            return;
        }
        
        currentAnalysis = data;
        displayResults(data);
        
        // Switch to results view
        document.getElementById('loading').style.display = 'none';
        document.getElementById('results').style.display = 'block';
        
    } catch (error) {
        console.error('Error analyzing URL:', error);
        alert('Error analyzing URL: ' + error.message);
        document.getElementById('loading').style.display = 'none';
    }
}

// Display results
function displayResults(data) {
    console.log('Displaying results:', data);
    
    // Update score card
    document.getElementById('score-value').textContent = data.overall_score || 0;
    
    const safetyBadge = document.getElementById('safety-badge');
    safetyBadge.textContent = data.safety_level || 'Unknown';
    safetyBadge.style.backgroundColor = data.safety_color || 'gray';
    safetyBadge.style.color = 'white';
    safetyBadge.style.padding = '5px 15px';
    safetyBadge.style.borderRadius = '20px';
    
    document.getElementById('analyzed-url').textContent = data.url || '';
    
    // Update SSL info
    const sslInfo = document.getElementById('ssl-info');
    if (data.ssl && data.ssl.has_ssl) {
        sslInfo.innerHTML = `
            <p><strong>Status:</strong> ✅ Valid SSL Certificate</p>
            <p><strong>Issuer:</strong> ${data.ssl.issuer || 'Unknown'}</p>
            <p><strong>Expiry:</strong> ${data.ssl.expiry || 'Valid'}</p>
        `;
    } else {
        sslInfo.innerHTML = '<p><strong>Status:</strong> ❌ No SSL Certificate (Not Secure!)</p>';
    }
    
    // Update headers info
    if (data.security_headers) {
        document.getElementById('headers-score').textContent = data.security_headers.score || 0;
        const headersList = document.getElementById('headers-list');
        headersList.innerHTML = '';
        
        const headers = data.security_headers.headers || {};
        for (const [header, value] of Object.entries(headers)) {
            const status = value !== 'Not set' ? '✅' : '❌';
            headersList.innerHTML += `<li>${status} ${header}: ${value}</li>`;
        }
    }
    
    // Update reputation info
    const repInfo = document.getElementById('reputation-info');
    if (data.reputation) {
        repInfo.innerHTML = `
            <p><strong>Trust Score:</strong> ${data.reputation.trust_score || 0}/100</p>
            <p><strong>Phishing Likelihood:</strong> ${data.reputation.phishing_likelihood || 'Unknown'}</p>
            <p><strong>Known Malicious:</strong> ${data.reputation.known_malicious ? 'Yes' : 'No'}</p>
        `;
    }
    
    // Update terms summary
    if (data.terms) {
        document.getElementById('terms-summary').innerHTML = `
            <p>${data.terms.summary || 'No summary available'}</p>
            ${data.terms.found ? `<p><small>Found at: ${data.terms.paths.join(', ')}</small></p>` : ''}
        `;
    }
}

// File upload setup
function setupFileUpload() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    
    if (!dropZone || !fileInput) {
        console.log('File upload elements not found yet');
        return;
    }
    
    console.log('Setting up file upload');
    
    dropZone.addEventListener('click', () => {
        console.log('Drop zone clicked');
        fileInput.click();
    });
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.background = '#edf2ff';
    });
    
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.background = '#f8f9ff';
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.background = '#f8f9ff';
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadFile(files[0]);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadFile(e.target.files[0]);
        }
    });
}

// Upload file
async function uploadFile(file) {
    console.log('Uploading file:', file.name);
    
    const formData = new FormData();
    formData.append('file', file);
    
    document.getElementById('loading').style.display = 'block';
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        console.log('Upload response:', data);
        
        if (data.error) {
            alert('Error: ' + data.error);
            return;
        }
        
        // Display extracted text and summary
        alert('File analyzed successfully! Check the console for details.');
        console.log('Extracted:', data.extracted_text);
        console.log('Summary:', data.summary);
        
        document.getElementById('loading').style.display = 'none';
        
    } catch (error) {
        console.error('Error uploading file:', error);
        alert('Error uploading file: ' + error.message);
        document.getElementById('loading').style.display = 'none';
    }
}

// Load history
async function loadHistory() {
    console.log('Loading history');
    
    const historyList = document.getElementById('history-list');
    if (!historyList) return;
    
    historyList.innerHTML = '<p class="loading-text">Loading...</p>';
    
    try {
        const response = await fetch('/api/history');
        const data = await response.json();
        console.log('History data:', data);
        
        if (!data || data.length === 0) {
            historyList.innerHTML = '<p>No scan history yet.</p>';
            return;
        }
        
        historyList.innerHTML = '';
        data.reverse().forEach((scan, index) => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.onclick = () => {
                currentAnalysis = scan;
                displayResults(scan);
                switchTab('url');
            };
            item.innerHTML = `
                <div class="url"><strong>${scan.url || 'Unknown'}</strong></div>
                <div class="score">Score: ${scan.overall_score || 0} - ${scan.safety_level || 'Unknown'}</div>
                <small>${scan.timestamp ? new Date(scan.timestamp).toLocaleString() : 'Unknown date'}</small>
            `;
            historyList.appendChild(item);
        });
        
    } catch (error) {
        console.error('Error loading history:', error);
        historyList.innerHTML = '<p>Error loading history.</p>';
    }
}

// Chat functionality
let chatVisible = false;

function toggleChat() {
    const chatbot = document.getElementById('chatbot');
    if (!chatbot) return;
    
    chatVisible = !chatVisible;
    chatbot.style.display = chatVisible ? 'flex' : 'none';
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    
    const message = input.value.trim();
    if (!message) return;
    
    // Add user message
    const messages = document.getElementById('chat-messages');
    messages.innerHTML += `<div class="message user">${message}</div>`;
    input.value = '';
    
    // Scroll to bottom
    messages.scrollTop = messages.scrollHeight;
    
    // Get bot response
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question: message,
                context: currentAnalysis ? currentAnalysis.terms?.summary || '' : ''
            })
        });
        
        const data = await response.json();
        messages.innerHTML += `<div class="message bot">${data.answer || 'No response'}</div>`;
        messages.scrollTop = messages.scrollHeight;
        
    } catch (error) {
        console.error('Chat error:', error);
        messages.innerHTML += `<div class="message bot">Sorry, I'm having trouble responding.</div>`;
    }
}

// Handle enter key in chat
document.addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'chat-input') {
        sendMessage();
    }
});

// Generate report
function generateReport() {
    if (!currentAnalysis) {
        alert('No analysis to generate report from');
        return;
    }
    
    const report = `
WEBSHIELD PRO - SECURITY REPORT
Generated: ${new Date().toLocaleString()}
URL: ${currentAnalysis.url || 'Unknown'}

OVERALL SAFETY: ${currentAnalysis.safety_level || 'Unknown'} (Score: ${currentAnalysis.overall_score || 0}/100)

SECURITY CHECKS:
- SSL/TLS: ${currentAnalysis.ssl?.has_ssl ? 'Valid' : 'Missing'}
- Security Headers Score: ${currentAnalysis.security_headers?.score || 0}/100
- Trust Score: ${currentAnalysis.reputation?.trust_score || 0}/100

TERMS SUMMARY:
${currentAnalysis.terms?.summary || 'No terms summary available'}

---
This is an automated analysis. Always exercise caution online.
    `;
    
    // Create download link
    const blob = new Blob([report], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `security-report-${Date.now()}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
}

// Share analysis
function shareAnalysis() {
    if (!currentAnalysis) {
        alert('No analysis to share');
        return;
    }
    
    const text = `Check out this security analysis for ${currentAnalysis.url || 'this site'}: ${currentAnalysis.safety_level || 'Unknown'} (Score: ${currentAnalysis.overall_score || 0}/100)`;
    
    if (navigator.share) {
        navigator.share({
            title: 'WebShield Security Analysis',
            text: text,
            url: window.location.href
        }).catch(() => {
            // Fallback if share fails
            copyToClipboard(text);
        });
    } else {
        // Fallback
        copyToClipboard(text);
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('Analysis summary copied to clipboard!');
    }).catch(() => {
        alert('Could not copy to clipboard');
    });
}

// New analysis
function newAnalysis() {
    document.getElementById('results').style.display = 'none';
    const urlInput = document.getElementById('url-input');
    if (urlInput) urlInput.value = '';
    currentAnalysis = null;
}

// Also add click handlers to buttons directly
window.analyzeUrl = analyzeUrl;
window.switchTab = switchTab;
window.toggleChat = toggleChat;
window.sendMessage = sendMessage;
window.generateReport = generateReport;
window.shareAnalysis = shareAnalysis;
window.newAnalysis = newAnalysis;