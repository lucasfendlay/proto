function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

function capitalizeFirstLetter(string) {
    if (!string) return '';
    return string.toUpperCase();
}

// Optional: Minimal client update utility (used by small retained features)
async function saveClientUpdate(clientId, key, value) {
    try {
        const response = await fetch('/update-client', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, clientData: { [key]: value } }),
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error(`Failed to update ${key}:`, err.message || response.statusText);
        }
    } catch (error) {
        console.error(`Error updating ${key}:`, error);
    }
}

// Retain only email recall/save if the #emailAddress input still exists
async function saveEmailAddressToDatabase() {
    const emailInput = document.getElementById('emailAddress');
    if (!emailInput) return; // Guard: element missing

    const email = emailInput.value.trim();
    const clientId = getQueryParam('id');
    if (!clientId || !email) return;

    try {
        const response = await fetch('/update-client', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, clientData: { emailAddress: email } }),
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('Failed to save email address:', err.message || response.statusText);
        }
    } catch (error) {
        console.error('Error saving email address:', error);
    }
}

async function recallEmailAddressFromDatabase() {
    const input = document.getElementById('emailAddress');
    if (!input) return; // Guard: element missing

    const clientId = getQueryParam('id');
    if (!clientId) return;

    try {
        const response = await fetch(`/get-client/${clientId}`);
        if (!response.ok) throw new Error(response.statusText);
        const client = await response.json();
        input.value = client.emailAddress || '';
    } catch (error) {
        console.error('Error recalling email address:', error);
    }
}

// Initialize minimal features
document.addEventListener('DOMContentLoaded', () => {
    // Email field populate (if present)
    recallEmailAddressFromDatabase();

    // Attach email save on blur (if present)
    const emailInput = document.getElementById('emailAddress');
    if (emailInput) {
        emailInput.addEventListener('blur', saveEmailAddressToDatabase);
    }
});
// ...existing code...