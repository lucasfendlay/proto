// ══════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════

function getQueryParam(param) {
    return new URLSearchParams(window.location.search).get(param);
}

function capitalizeFirstLetter(str) {
    return str ? str.toUpperCase() : '';
}

// ══════════════════════════════════════════════════════════════
// SELECTION HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Highlight options by matching data-value attribute
 * @param {string[]} elementIds - Array of element IDs to check
 * @param {string} savedValue - The value to match against data-value
 */
function highlightByValue(elementIds, savedValue) {
    elementIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('selected', el.getAttribute('data-value') === savedValue);
    });
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

const MAIN_QUESTIONS = [
    { id: 'disability', elements: ['disability-yes', 'disability-no'] },
    { id: 'medicare', elements: ['medicare-yes', 'medicare-no'] },
    { id: 'medicaid', elements: ['medicaid-yes', 'medicaid-no'] },
    { id: 'student', elements: ['student-yes', 'student-no'] },
    { id: 'snap', elements: ['snap-yes', 'snap-no', 'snap-notinterested'] },
    { id: 'liheapEnrollment', elements: ['liheap-yes', 'liheap-no', 'liheap-notinterested'] },
    { id: 'subsidizedHousing', elements: ['subsidizedHousing-yes', 'subsidizedHousing-no'] },
    { id: 'heatingCost', elements: ['heatingCost-yes', 'heatingCost-no'] },
    { id: 'heatingCrisis', elements: ['heatingCrisis-yes', 'heatingCrisis-no'] },
    { id: 'residenceStatusCurrent', elements: ['residenceStatusCurrent-owned', 'residenceStatusCurrent-rented', 'residenceStatusCurrent-rentedowned', 'residenceStatusCurrent-other'] },
    { id: 'residenceStatus', elements: ['residenceStatus-owned', 'residenceStatus-rented', 'residenceStatus-rentedowned', 'residenceStatus-other'] },
    { id: 'citizen', elements: ['citizen-yes', 'citizen-no'] },
];

// ══════════════════════════════════════════════════════════════
// RENDER FUNCTIONS
// ══════════════════════════════════════════════════════════════

function renderMainQuestions(clientData) {
    MAIN_QUESTIONS.forEach(question => {
        const savedValue = clientData[question.id];
        if (savedValue) {
            highlightByValue(question.elements, savedValue);
        }
    });
}

function renderHouseholdSize(clientData) {
    const dropdown = document.getElementById('household-size');
    if (dropdown && clientData.householdSize) {
        dropdown.value = clientData.householdSize;
    }
}

function renderHouseholdMembers(clientData) {
    const container = document.getElementById('householdMemberContainer');
    if (!container) return;
    
    const members = clientData.householdMembers || [];
    if (!members.length) {
        container.innerHTML = '<p>No household members found.</p>';
        return;
    }

    container.innerHTML = '';

    // Sort: head of household first
    const sorted = [...members].sort((a, b) => b.headOfHousehold - a.headOfHousehold);

    sorted.forEach(member => {
        const el = document.createElement('div');
        el.classList.add('household-member');
        el.innerHTML = buildMemberHTML(member);
        container.appendChild(el);
    });
}

function buildMemberHTML(member) {
    const deceased = member.deceased === 'yes';
    const isNA = (v) => !v || String(v).trim().toLowerCase() === 'n/a';
    const prefix = isNA(member.prefix) ? '' : member.prefix;
    const middle = isNA(member.middleInitial) ? '' : capitalizeFirstLetter(member.middleInitial);
    const suffix = isNA(member.suffix) ? '' : member.suffix;

    const name = [
        prefix,
        capitalizeFirstLetter(member.firstName),
        middle,
        capitalizeFirstLetter(member.lastName),
        suffix
    ].filter(Boolean).join(' ');

    const info = (label, value) => 
        `<p class="household-member-info"><strong>${label}:</strong> ${value}</p>`;

    const conditionalInfo = (condition, label, value) => 
        condition ? info(label, value) : '';

    const showPrevMarital = !deceased 
        && member.previousMaritalStatus 
        && typeof member.previousMaritalStatus === 'string'
        && member.previousMaritalStatus.toLowerCase() !== 'n/a';

    const showNonCitizen = !deceased 
        && member.nonCitizenStatus 
        && member.nonCitizenStatus.toLowerCase() !== 'citizen';

    const showStudentStatus = !deceased 
        && member.studentStatus 
        && member.studentStatus.toLowerCase() !== 'notstudent';

    return `
        ${info('Name', name)}
        ${info('DOB', member.dob || 'N/A')}
        ${deceased ? `<p class="household-member-info"><strong>Deceased:</strong> YES</p>` : ''}
        ${deceased ? info('Date of Death', member.dateOfDeath || 'N/A') : ''}
        ${info('Age', member.age|| 'N/A')}
        ${info('Legal Sex', capitalizeFirstLetter(member.legalSex)|| 'N/A')}
        ${conditionalInfo(!deceased, 'Marital Status', capitalizeFirstLetter(member.maritalStatus))}
        ${conditionalInfo(showPrevMarital, 'Previous Marital Status', capitalizeFirstLetter(member.previousMaritalStatus)|| 'N/A')}
        ${info('SSN', member.socialSecurityNumber || 'N/A')}
        ${conditionalInfo(!deceased, 'Disability', capitalizeFirstLetter(member.disability)|| 'N/A')}
        ${conditionalInfo(!deceased, 'Medicare', capitalizeFirstLetter(member.medicare)|| 'N/A')}
        ${conditionalInfo(!deceased, 'Medicaid', capitalizeFirstLetter(member.medicaid)|| 'N/A')}
        ${conditionalInfo(!deceased, 'US Citizen', capitalizeFirstLetter(member.citizen)|| 'N/A')}
        ${conditionalInfo(showNonCitizen, 'Non-Citizen Status', capitalizeFirstLetter(member.nonCitizenStatus)|| 'N/A')}
        ${conditionalInfo(!deceased, 'Student', capitalizeFirstLetter(member.student)|| 'N/A')}
        ${conditionalInfo(showStudentStatus, 'Student Status', capitalizeFirstLetter(member.studentStatus)|| 'N/A')}
        ${conditionalInfo(!deceased, 'Included in SNAP Household', capitalizeFirstLetter(member.meals)|| 'N/A')}
        ${member.headOfHousehold 
            ? `<p class="household-member-info" style="color: black; border: 2px solid black; padding: 5px; display: inline-block;"><strong>Head of Household</strong></p>` 
            : ''
        }
    `;
}

// ══════════════════════════════════════════════════════════════
// VISIBILITY LOGIC (LIHEAP-related containers)
// ══════════════════════════════════════════════════════════════

function getContainerRefs() {
    return {
        residenceStatus: document.getElementById('residenceStatusCurrent-container'),
        heatingCrisis: document.getElementById('heatingCrisis-container'),
        subsidizedHousing: document.getElementById('subsidizedHousing-container'),
        heatingCost: document.getElementById('heatingCost-container'),
    };
}

function applyLiheapVisibility(clientData) {
    const c = getContainerRefs();
    
    // If containers don't exist on this page, skip
    if (!c.residenceStatus && !c.heatingCrisis) return;

    const liheap = clientData.liheapEnrollment;
    const crisis = clientData.heatingCrisis;
    const residence = clientData.residenceStatusCurrent;
    const subsidized = clientData.subsidizedHousing;

    // Hide all if not interested
    if (liheap === 'notinterested') {
        Object.values(c).forEach(el => { if (el) el.style.display = 'none'; });
        return;
    }

    // Already enrolled but no crisis
    if (liheap === 'yes' && crisis === 'no') {
        if (c.residenceStatus) c.residenceStatus.style.display = 'none';
        if (c.subsidizedHousing) c.subsidizedHousing.style.display = 'none';
        if (c.heatingCost) c.heatingCost.style.display = 'none';
        if (c.heatingCrisis) c.heatingCrisis.style.display = 'block';
        return;
    }

    // Default visibility
    if (c.residenceStatus) c.residenceStatus.style.display = 'block';
    if (c.heatingCrisis) c.heatingCrisis.style.display = 'block';

    if (residence === 'owned') {
        if (c.subsidizedHousing) c.subsidizedHousing.style.display = 'none';
        if (c.heatingCost) c.heatingCost.style.display = 'none';
    } else {
        if (c.subsidizedHousing) c.subsidizedHousing.style.display = 'block';
        if (c.heatingCost) c.heatingCost.style.display = subsidized === 'yes' ? 'block' : 'none';
    }
}

function applyLiheapEligibilityVisibility(clientData) {
    const c = getContainerRefs();
    
    // If not eligible for LIHEAP, hide related containers
    const isEnrolled = clientData.LIHEAP?.eligibility?.includes('Already Enrolled');
    
    if (!isEnrolled) {
        Object.values(c).forEach(el => { if (el) el.style.display = 'none'; });
    }
}

// ══════════════════════════════════════════════════════════════
// ELIGIBILITY CHECKS
// ══════════════════════════════════════════════════════════════

async function runAllEligibilityChecks(members) {
    if (!window.eligibilityChecks) {
        console.warn('Eligibility checks not loaded');
        return;
    }

    const checks = [
        'PACEEligibilityCheck',
        'LISEligibilityCheck',
        'MSPEligibilityCheck',
        'PTRREligibilityCheck',
        'SNAPEligibilityCheck',
        'LIHEAPEligibilityCheck',
    ];

    for (const check of checks) {
        if (typeof window.eligibilityChecks[check] === 'function') {
            await window.eligibilityChecks[check](members);
        }
    }

    // Update displays
    const displays = [
        'updateAndDisplayHouseholdMembers',
        'displaySNAPHouseholds',
        'displayLIHEAPHouseholds',
    ];

    for (const display of displays) {
        if (typeof window.eligibilityChecks[display] === 'function') {
            await window.eligibilityChecks[display]();
        }
    }
}

// ══════════════════════════════════════════════════════════════
// MAIN DATA LOADER
// ══════════════════════════════════════════════════════════════

async function loadSavedData() {
    const clientId = getQueryParam('id');
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }

    try {
        // Single fetch for all data
        const clientData = await fetchClient(clientId, true);
        if (!clientData) return;

        // Render all UI components
        renderMainQuestions(clientData);
        renderHouseholdSize(clientData);
        renderHouseholdMembers(clientData);

        // Apply visibility rules
        applyLiheapEligibilityVisibility(clientData);
        applyLiheapVisibility(clientData);

        // Run eligibility checks
        const members = clientData.householdMembers || [];
        await runAllEligibilityChecks(members);

    } catch (error) {
        console.error('Error loading saved data:', error);
    }
}

// ══════════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    await loadSavedData();
});