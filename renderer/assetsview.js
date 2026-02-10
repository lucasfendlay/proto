// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════

const BACKEND_URL = window.location.origin || "http://localhost:3000";

// ══════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════

function getQueryParameter(name) {
    return new URLSearchParams(window.location.search).get(name);
}

// ══════════════════════════════════════════════════════════════
// CLIENT DATA CACHE
// ══════════════════════════════════════════════════════════════

let clientDataCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5000;

async function fetchClientData(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && clientDataCache && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION)) {
        return clientDataCache;
    }

    const clientId = getQueryParameter('id');
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return null;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/get-client/${clientId}`);
        if (!response.ok) throw new Error('Failed to fetch client data.');
        
        clientDataCache = await response.json();
        cacheTimestamp = now;
        return clientDataCache;
    } catch (error) {
        console.error('Error fetching client data:', error);
        return null;
    }
}

// ══════════════════════════════════════════════════════════════
// CLIENT API HELPERS
// ══════════════════════════════════════════════════════════════

async function loadHouseholdMembers() {
    const client = await fetchClientData();
    return client?.householdMembers || [];
}

// ══════════════════════════════════════════════════════════════
// ASSET HTML GENERATION
// ══════════════════════════════════════════════════════════════

function generateAssetItemHTML(asset) {
    return `
        <li class="list-item" data-asset-id="${asset.id}">
            <p><strong>Type:</strong> ${asset.type}</p>
            <p><strong>Description:</strong> ${asset.description}</p>
            <p><strong>Value:</strong> $${asset.value}</p>
        </li>
    `;
}

function generateAssetListHTML(assets) {
    if (!assets || !Array.isArray(assets) || assets.length === 0) return '';
    return assets.map(asset => generateAssetItemHTML(asset)).join('');
}

// ══════════════════════════════════════════════════════════════
// DISPLAY HOUSEHOLD MEMBERS
// ══════════════════════════════════════════════════════════════

async function displayHouseholdMembers() {
    const container = document.getElementById('household-member-container');
    if (!container) return;

    container.innerHTML = '';
    container.style.textAlign = 'center';
    container.style.minWidth = '925px';
    container.style.maxWidth = '925px';
    container.style.margin = '0 auto';

    const members = await loadHouseholdMembers();

    if (members.length === 0) {
        container.innerHTML = '<p>No household members found.</p>';
        return;
    }

    // Sort: head of household first
    members.sort((a, b) => (b.headOfHousehold ? 1 : 0) - (a.headOfHousehold ? 1 : 0));

    members.forEach(member => {
        const memberDiv = document.createElement('div');
        memberDiv.classList.add('household-member1-box');
        memberDiv.dataset.memberId = member.householdMemberId;

        const assetListHTML = generateAssetListHTML(member.assets);

        memberDiv.innerHTML = `
            <h3>${member.firstName} ${member.middleInitial || ''} ${member.lastName}</h3>
            <p><strong>Date of Birth:</strong> ${member.dob || 'N/A'}</p>
            <div class="asset-list">
                <h4>Assets:</h4>
                <ul id="asset-list-${member.householdMemberId}">${assetListHTML || '<li>No assets recorded.</li>'}</ul>
            </div>
        `;

        container.appendChild(memberDiv);
    });
}

// ══════════════════════════════════════════════════════════════
// GLOBAL EXPORTS
// ══════════════════════════════════════════════════════════════

window.refreshAssetDisplay = displayHouseholdMembers;

// ══════════════════════════════════════════════════════════════
// SINGLE DOMContentLoaded INITIALIZATION
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    await displayHouseholdMembers();
});