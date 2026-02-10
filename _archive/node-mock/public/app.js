const runButton = document.getElementById('runButton');
const documentText = document.getElementById('documentText');
const resultBox = document.getElementById('result');

async function runAutomation() {
  runButton.disabled = true;
  runButton.textContent = 'Running...';
  resultBox.textContent = 'Processing...';

  try {
    const response = await fetch('/api/automate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentText: documentText.value })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Request failed');
    }

    resultBox.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    resultBox.textContent = JSON.stringify({ status: 'error', message: error.message }, null, 2);
  } finally {
    runButton.disabled = false;
    runButton.textContent = 'Run Automation';
  }
}

runButton.addEventListener('click', runAutomation);
