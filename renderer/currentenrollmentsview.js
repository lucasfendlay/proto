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

function parseAge(ageString) {
    if (!ageString) return { years: 0, months: 0, days: 0 };
    
    const [years, months, days] = ageString
        .replace(/Years|Months|Days|,/g, '')
        .trim()
        .split(/\s+/)
        .map(value => parseInt(value.trim()) || 0);
    
    return { years, months, days };
}

// ══════════════════════════════════════════════════════════════
// CLIENT API HELPERS
// ══════════════════════════════════════════════════════════════

async function fetchClientData(clientId) {
    if (!clientId) return null;

    try {
        const response = await fetch(`${BACKEND_URL}/get-client/${clientId}`);
        if (!response.ok) throw new Error(`Failed to fetch client data: ${response.statusText}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching client data:', error);
        return null;
    }
}

async function loadHouseholdMembers() {
    const clientId = getQueryParameter('id');
    if (!clientId) return [];

    try {
        const client = await fetchClientData(clientId);
        return client?.householdMembers || [];
    } catch (error) {
        console.error('Error loading household members:', error);
        return [];
    }
}

async function fetchSavedSelections(clientId, memberId) {
    try {
        const response = await fetch(`${BACKEND_URL}/get-household-member-selections/${clientId}/${memberId}`);
        if (!response.ok) throw new Error(`Failed to fetch saved selections: ${response.statusText}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching saved selections:', error);
        return {};
    }
}

// ══════════════════════════════════════════════════════════════
// SIDEBAR VISIBILITY
// ══════════════════════════════════════════════════════════════

async function checkScreeningStatus() {
    const clientId = getQueryParameter('id');
    if (!clientId) return;

    try {
        const clientData = await fetchClientData(clientId);
        const leftSidebar = document.getElementById('leftSidebarContainer');

        if (!leftSidebar) return;

        leftSidebar.style.display = clientData?.screeningInProgress ? 'flex' : 'none';
    } catch (error) {
        console.error('Error checking screening status:', error);
    }
}

// ══════════════════════════════════════════════════════════════
// ELIGIBILITY CONDITION CHECKS
// ══════════════════════════════════════════════════════════════

function checkPACEEligibility(member, client) {
    const { years, months, days } = parseAge(member.age);
    const isOnMedicaid = member.medicaid === 'yes';
    const paceIsClosed = member.PACE?.screeningInProgress === false;

    return (years >= 65 || (years === 64 && months === 11 && days > 0)) && !isOnMedicaid && !paceIsClosed;
}

function checkLISMSPEligibility(member) {
    const isOnMedicare = member.medicare === 'yes';
    const isOnMedicaid = member.medicaid === 'yes';
    const lisIsClosed = member.LIS?.screeningInProgress === false;
    const mspIsClosed = member.MSP?.screeningInProgress === false;

    return {
        showLIS: isOnMedicare && !isOnMedicaid && !lisIsClosed,
        showMSP: isOnMedicare && !isOnMedicaid && !mspIsClosed
    };
}

function checkPTRREligibility(member, client, members) {
    if (!member.headOfHousehold) return false;

    const ptrrIsClosed = member.PTRR?.screeningInProgress === false;
    if (ptrrIsClosed) return false;

    const { years } = parseAge(member.age);
    const isDisabled = member.disability === 'yes';
    const isWidowed = member.previousMaritalStatus?.toLowerCase() === 'widowed';
    const residenceStatus = client.residenceStatus?.toLowerCase() || 'other';

    if (residenceStatus === 'other') return false;

    let previousSpouseMeetsConditions = false;
    if (member.previousSpouseId) {
        const previousSpouse = members.find(m => m.householdMemberId === member.previousSpouseId);
        if (previousSpouse) {
            const spouseAge = parseAge(previousSpouse.age);
            const spouseIsDisabled = previousSpouse.disability === 'yes';
            const spouseIsWidowed = previousSpouse.previousMaritalStatus?.toLowerCase() === 'widowed';

            previousSpouseMeetsConditions = 
                (spouseAge.years >= 18 && spouseIsDisabled) ||
                (spouseAge.years >= 50 && spouseIsWidowed) ||
                (spouseAge.years >= 65);
        }
    }

    return previousSpouseMeetsConditions ||
           (years >= 18 && isDisabled) ||
           (years >= 50 && isWidowed) ||
           (years >= 65);
}

// ══════════════════════════════════════════════════════════════
// QUESTION HTML GENERATION (READ-ONLY)
// ══════════════════════════════════════════════════════════════

function generatePACEQuestionsHTML() {
    return `
        <div class="selection-box residency-question">
            <label>Has this person lived in Pennsylvania for at least the last 90 consecutive days?</label>
            <div data-value="yes" class="selection-option">Yes</div>
            <div data-value="no" class="selection-option">No</div>
        </div>
        <div class="selection-box pace-question" style="display: none;">
            <label>Is this person currently enrolled in PACE?</label>
            <div data-value="yes" class="selection-option">Yes</div>
            <div data-value="no" class="selection-option">No</div>
            <div data-value="notinterested" class="selection-option">Not Interested</div>
        </div>
    `;
}

function generateLISQuestionHTML() {
    return `
        <div class="selection-box">
            <label>Is this person currently enrolled in LIS/ Extra Help?</label>
            <div data-value="yes" class="selection-option">Yes</div>
            <div data-value="no" class="selection-option">No</div>
            <div data-value="notinterested" class="selection-option">Not Interested</div>
        </div>
    `;
}

function generateMSPQuestionHTML() {
    return `
        <div class="selection-box">
            <label>Is this person currently enrolled in the Medicare Savings Program?</label>
            <div data-value="yes" class="selection-option">Yes</div>
            <div data-value="no" class="selection-option">No</div>
            <div data-value="notinterested" class="selection-option">Not Interested</div>
        </div>
    `;
}

function generatePTRRQuestionHTML() {
    return `
        <div class="selection-box">
            <label>Has this person already applied for PTRR this year?</label>
            <div data-value="yes" class="selection-option">Yes</div>
            <div data-value="no" class="selection-option">No</div>
            <div data-value="notinterested" class="selection-option">Not Interested</div>
        </div>
    `;
}

// ══════════════════════════════════════════════════════════════
// APPLY SAVED SELECTIONS (READ-ONLY)
// ══════════════════════════════════════════════════════════════

async function applySavedSelections(memberDiv, clientId, memberId) {
    const savedSelections = await fetchSavedSelections(clientId, memberId);

    memberDiv.querySelectorAll('.selection-box').forEach(box => {
        const label = box.querySelector('label');
        if (!label) return;

        const question = label.innerText.trim();
        const savedValue = savedSelections[question];

        if (savedValue) {
            const optionToSelect = box.querySelector(`.selection-option[data-value="${savedValue}"]`);
            if (optionToSelect) {
                optionToSelect.classList.add('selected');
            }

            if (question === "Has this person lived in Pennsylvania for at least the last 90 consecutive days?") {
                const paceQuestion = memberDiv.querySelector('.pace-question');
                if (paceQuestion) {
                    paceQuestion.style.display = savedValue === 'yes' ? 'block' : 'none';
                }
            }
        }
    });
}

// ══════════════════════════════════════════════════════════════
// DISPLAY HOUSEHOLD MEMBERS (READ-ONLY)
// ══════════════════════════════════════════════════════════════

async function addHouseholdMemberToUI(member, client, members) {
    const clientId = getQueryParameter('id');
    const memberDiv = document.createElement('div');
    memberDiv.classList.add('household-member');
    memberDiv.setAttribute('data-id', member.householdMemberId);

    memberDiv.innerHTML = `
        <p>Name: <strong>${member.firstName} ${member.middleInitial || ''} ${member.lastName}</strong></p>
        <p>Date of Birth: ${member.dob}</p>
        <p>Marital Status: ${member.maritalStatus}</p>
    `;

    let hasQuestions = false;

    // PACE eligibility
    if (checkPACEEligibility(member, client)) {
        hasQuestions = true;
        memberDiv.innerHTML += generatePACEQuestionsHTML();
    }

    // LIS/MSP eligibility
    const { showLIS, showMSP } = checkLISMSPEligibility(member);
    if (showLIS || showMSP) {
        hasQuestions = true;
        if (showLIS) memberDiv.innerHTML += generateLISQuestionHTML();
        if (showMSP) memberDiv.innerHTML += generateMSPQuestionHTML();
    }

    // PTRR eligibility
    const showPTRR = checkPTRREligibility(member, client, members);
    if (showPTRR) {
        hasQuestions = true;
        memberDiv.innerHTML += generatePTRRQuestionHTML();
    }

    if (!hasQuestions) {
        memberDiv.classList.add('no-questions');
    }

    // Apply saved selections (read-only display)
    await applySavedSelections(memberDiv, clientId, member.householdMemberId);

    return memberDiv;
}

async function displayHouseholdMembers() {
    const container = document.getElementById('householdMemberContainer');
    if (!container) return;

    container.innerHTML = '';

    const clientId = getQueryParameter('id');
    const client = await fetchClientData(clientId);
    const members = await loadHouseholdMembers();

    if (members.length === 0) {
        container.innerHTML = '<p>No household members found.</p>';
        return;
    }

    // Sort: head of household first
    members.sort((a, b) => (b.headOfHousehold ? 1 : 0) - (a.headOfHousehold ? 1 : 0));

    for (const member of members) {
        const memberDiv = await addHouseholdMemberToUI(member, client, members);
        container.appendChild(memberDiv);
    }
}

// ══════════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    await checkScreeningStatus();
    await displayHouseholdMembers();
});