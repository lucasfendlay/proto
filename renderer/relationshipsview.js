// ══════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════

function getQueryParam(param) {
    return new URLSearchParams(window.location.search).get(param);
}

// ══════════════════════════════════════════════════════════════
// API HELPERS
// ══════════════════════════════════════════════════════════════

let cachedClientData = null;

async function fetchClient(clientId, forceRefresh = false) {
    if (cachedClientData && !forceRefresh) {
        return cachedClientData;
    }
    
    const response = await fetch(`/get-client/${clientId}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch client data: ${response.statusText}`);
    }
    
    cachedClientData = await response.json();
    return cachedClientData;
}

function getHouseholdMembers() {
    return cachedClientData?.householdMembers || [];
}

// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════

const RELATIONSHIP_LABELS = {
    'spouse': 'Spouse',
    'parent': 'Parent',
    'child': 'Child',
    'sibling': 'Sibling',
    'half-sibling': 'Half-Sibling',
    'grandparent': 'Grandparent',
    'grandchild': 'Grandchild',
    'step-parent': 'Step-Parent',
    'step-child': 'Step-Child',
    'step-sibling': 'Step-Sibling',
    'aunt/uncle': 'Aunt/Uncle',
    'niece/nephew': 'Niece/Nephew',
    'cousin': 'Cousin',
    'adoptive parent': 'Adoptive Parent',
    'adopted child': 'Adopted Child',
    'foster parent': 'Foster Parent',
    'foster child': 'Foster Child',
    'guardian': 'Guardian',
    'ward': 'Ward',
    'other': 'Other Relationship',
    'unrelated': 'Unrelated',
};

// ══════════════════════════════════════════════════════════════
// RENDER FUNCTIONS
// ══════════════════════════════════════════════════════════════

function buildRelationshipHTML(member, relatedMember) {
    const savedRelationship = member.relationships?.find(
        r => r.relatedMemberId === relatedMember.householdMemberId
    )?.relationship;

    const relationshipLabel = savedRelationship 
        ? RELATIONSHIP_LABELS[savedRelationship] || savedRelationship 
        : 'No relationship specified';

    const fullName = [
        relatedMember.firstName,
        relatedMember.middleInitial || '',
        relatedMember.lastName
    ].filter(Boolean).join(' ');

    return `
        <div class="relationship-entry">
            <p><strong>${fullName}</strong></p>
            <span class="relationship-label">${relationshipLabel}</span>
        </div>
    `;
}

function buildMemberHTML(member, allMembers) {
    const otherMembers = allMembers.filter(m => m.householdMemberId !== member.householdMemberId);
    
    const relationshipsHTML = otherMembers.length
        ? otherMembers.map(other => buildRelationshipHTML(member, other)).join('')
        : '<p>No other household members</p>';

    const fullName = [
        member.firstName,
        member.middleInitial || '',
        member.lastName
    ].filter(Boolean).join(' ');

    return `
        <p><strong>Name:</strong> ${fullName}</p>
        <p><strong>Date of Birth:</strong> ${member.dob}</p>
        <p><strong>Marital Status:</strong><br>${member.maritalStatus || 'N/A'}</p>
        <div class="relationships-container">
            <p><strong>Relationships:</strong></p>
            ${relationshipsHTML}
        </div>
    `;
}

function renderHouseholdMembers(members) {
    const container = document.getElementById('householdMemberContainer');
    if (!container) return;

    if (!members.length) {
        container.innerHTML = '<p>No household members found.</p>';
        return;
    }

    container.innerHTML = '';

    // Sort: head of household first
    const sorted = [...members].sort((a, b) => (b.headOfHousehold ? 1 : 0) - (a.headOfHousehold ? 1 : 0));

    sorted.forEach(member => {
        const memberDiv = document.createElement('div');
        memberDiv.classList.add('household-member');
        memberDiv.innerHTML = buildMemberHTML(member, members);
        container.appendChild(memberDiv);
    });
}

// ══════════════════════════════════════════════════════════════
// MAIN DATA LOADER
// ══════════════════════════════════════════════════════════════

async function loadPageData() {
    const clientId = getQueryParam('id');
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }

    try {
        // Single fetch for all data
        const clientData = await fetchClient(clientId, true);
        if (!clientData) return;

        // Render household members with relationships
        const members = clientData.householdMembers || [];
        renderHouseholdMembers(members);

    } catch (error) {
        console.error('Error loading page data:', error);
    }
}

// ══════════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    await loadPageData();
});