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
// ELIGIBILITY CHECKS
// ══════════════════════════════════════════════════════════════

async function runAllEligibilityChecks(members) {
    if (!window.eligibilityChecks) return;

    const checks = [
        'PACEEligibilityCheck',
        'LISEligibilityCheck',
        'MSPEligibilityCheck',
        'PTRREligibilityCheck',
        'SNAPEligibilityCheck',
        'LIHEAPEligibilityCheck'
    ];

    for (const check of checks) {
        if (window.eligibilityChecks[check]) {
            await window.eligibilityChecks[check](members);
        }
    }

    if (window.eligibilityChecks.refreshAllDisplays) {
        await window.eligibilityChecks.refreshAllDisplays();
    }
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

async function setCheckedOutStatus(clientId, status) {
    try {
        const response = await fetch(`${BACKEND_URL}/update-client`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId,
                clientData: {
                    checkedOut: [{
                        status,
                        timestamp: status ? new Date().toISOString() : null,
                        user: status ? sessionStorage.getItem('loggedInUser')?.trim() || 'Unknown User' : null
                    }]
                }
            })
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            console.error(`Failed to update checkedOut status: ${result.message}`);
        }
    } catch (error) {
        console.error('Error updating checkedOut status:', error);
    }
}

// ══════════════════════════════════════════════════════════════
// SELECTION PERSISTENCE
// ══════════════════════════════════════════════════════════════

async function saveSelection(clientId, memberId, question, value) {
    try {
        const response = await fetch(`${BACKEND_URL}/save-household-member-selection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, memberId, question, value })
        });

        if (!response.ok) throw new Error(`Failed to save selection: ${response.statusText}`);
        console.log(`Saved: Question = "${question}", Value = "${value}"`);
    } catch (error) {
        console.error('Error saving selection:', error);
    }
}

async function saveDefaultSelection(clientId, memberId, question, value) {
    await saveSelection(clientId, memberId, question, value);
}

async function clearSelection(clientId, memberId, question) {
    try {
        const response = await fetch(`${BACKEND_URL}/clear-household-member-selection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, memberId, question })
        });

        if (!response.ok) throw new Error(`Failed to clear selection: ${response.statusText}`);
        console.log(`Cleared: Question = "${question}"`);
    } catch (error) {
        console.error('Error clearing selection:', error);
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
// NAVIGATION
// ══════════════════════════════════════════════════════════════

async function redirectToCurrentEnrollments() {
    const clientId = getQueryParameter('id');
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }

    if (!confirm("Are you sure you want to save and release this profile?")) return;

    const activeUser = sessionStorage.getItem('loggedInUser');
    if (!activeUser) {
        console.error("No active user found in sessionStorage.");
        return;
    }

    try {
        await setCheckedOutStatus(clientId, false);

        const note = {
            text: "Profile released.",
            timestamp: new Date().toLocaleString(),
            username: activeUser
        };

        await fetch(`${BACKEND_URL}/add-note-to-client`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, note })
        });
    } catch (error) {
        console.error("Error during redirectToCurrentEnrollments:", error);
    } finally {
        window.location.href = `currentenrollmentsview.html?id=${clientId}`;
    }
}

function goToIncome() {
    const clientId = getQueryParameter('id');
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }
    window.location.href = `incomeedit.html?id=${clientId}`;
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

        leftSidebar.style.display = 'block';

        if (!clientData?.screeningInProgress) {
            const containers = ['snap-household-container', 'liheap-household-container', 'household-members-container'];
            containers.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        }
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

async function checkPTRREligibility(member, client, members) {
    if (!member.headOfHousehold) return false;

    const ptrrIsClosed = member.PTRR?.screeningInProgress === false;
    if (ptrrIsClosed) return false;

    const { years } = parseAge(member.age);
    const isDisabled = member.disability === 'yes';
    const isWidowed = member.previousMaritalStatus?.toLowerCase() === 'widowed';
    const residenceStatus = client.residenceStatus?.toLowerCase() || 'other';

    if (residenceStatus === 'other') return false;

    // Check previous spouse conditions
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
// QUESTION HTML GENERATION
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
// SELECTION EVENT HANDLERS
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

            // Handle Pennsylvania residency visibility for PACE question
            if (question === "Has this person lived in Pennsylvania for at least the last 90 consecutive days?") {
                const paceQuestion = memberDiv.querySelector('.pace-question');
                if (paceQuestion) {
                    paceQuestion.style.display = savedValue === 'yes' ? 'block' : 'none';
                }
            }
        }
    });
}

function setupSelectionHandlers(memberDiv, member, clientId) {
    memberDiv.querySelectorAll('.selection-option').forEach(option => {
        option.addEventListener('click', async function () {
            const parent = this.parentElement;
            parent.querySelectorAll('.selection-option').forEach(sibling => sibling.classList.remove('selected'));
            this.classList.add('selected');

            const question = parent.querySelector('label').innerText.trim();
            const value = this.dataset.value;

            await saveSelection(clientId, member.householdMemberId, question, value);

            // Handle Pennsylvania residency question logic - local UI update only
            if (question === "Has this person lived in Pennsylvania for at least the last 90 consecutive days?") {
                const paceQuestion = memberDiv.querySelector('.pace-question');
                if (paceQuestion) {
                    if (value === 'yes') {
                        paceQuestion.style.display = 'block';
                        await saveSelection(clientId, member.householdMemberId, "Is this person currently enrolled in PACE?", null);
                    } else {
                        paceQuestion.style.display = 'none';
                        paceQuestion.querySelectorAll('.selection-option').forEach(opt => opt.classList.remove('selected'));
                        await saveSelection(clientId, member.householdMemberId, "Is this person currently enrolled in PACE?", "residencynotmet");
                    }
                }
            }

            // Run eligibility checks with full refresh, but skip current enrollments refresh
            const members = await loadHouseholdMembers();
            skipNextRefresh = true;  // Set flag before calling refresh
            await runAllEligibilityChecks(members);
        });
    });
}

// ══════════════════════════════════════════════════════════════
// DISPLAY HOUSEHOLD MEMBERS
// ══════════════════════════════════════════════════════════════

let isDisplaying = false;
let skipNextRefresh = false;

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
    } else {
        await saveDefaultSelection(clientId, member.householdMemberId, "Is this person currently enrolled in LIS?", "Not Interested");
        await saveDefaultSelection(clientId, member.householdMemberId, "Is this person currently enrolled in MSP?", "Not Interested");
    }

    // PTRR eligibility
    const showPTRR = await checkPTRREligibility(member, client, members);
    if (showPTRR) {
        hasQuestions = true;
        memberDiv.innerHTML += generatePTRRQuestionHTML();
    } else if (member.headOfHousehold) {
        await saveDefaultSelection(clientId, member.householdMemberId, "Has this person already applied for PTRR this year?", "Not Interested");
    }

    if (!hasQuestions) return false;

    // Apply saved selections and setup handlers
    await applySavedSelections(memberDiv, clientId, member.householdMemberId);
    setupSelectionHandlers(memberDiv, member, clientId);

    return memberDiv;
}

async function displayHouseholdMembers() {
    if (skipNextRefresh) {
        skipNextRefresh = false;
        return;
    }
    
    if (isDisplaying) return;
    isDisplaying = true;

    const container = document.getElementById('householdMemberContainer');

    try {
        container.innerHTML = '';
        container.style.minWidth = '600px';
        container.style.maxWidth = '600px';
        container.style.margin = '0 auto';

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
            if (memberDiv) {
                container.appendChild(memberDiv);
            }
        }
    } finally {
        isDisplaying = false;
    }
}

// ══════════════════════════════════════════════════════════════
// EVENT HANDLER SETUP
// ══════════════════════════════════════════════════════════════

function setupNavigationHandlers() {
    document.getElementById('save-exit')?.addEventListener('click', redirectToCurrentEnrollments);
    document.getElementById('save-continue')?.addEventListener('click', goToIncome);
}

// ══════════════════════════════════════════════════════════════
// GLOBAL EXPORTS
// ══════════════════════════════════════════════════════════════

window.refreshCurrentEnrollments = displayHouseholdMembers;
window.saveDefaultSelection = saveDefaultSelection;

// ══════════════════════════════════════════════════════════════
// SINGLE DOMContentLoaded INITIALIZATION
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    // Setup navigation handlers
    setupNavigationHandlers();

    // Check screening status for sidebar
    await checkScreeningStatus();

    // Display household members
    await displayHouseholdMembers();
});