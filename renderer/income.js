// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════

const BACKEND_URL = window.location.origin || "http://localhost:3000";
const CURRENT_YEAR = 2026;
const PREVIOUS_YEAR = 2025;

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

function invalidateCache() {
    clientDataCache = null;
    cacheTimestamp = null;
}

// ══════════════════════════════════════════════════════════════
// ELIGIBILITY CHECKS
// ══════════════════════════════════════════════════════════════

async function runAllEligibilityChecks(members) {
    if (!window.eligibilityChecks) return;

        const validMembers = members.filter(member => member && typeof member === 'object' && member.householdMemberId);


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
            await window.eligibilityChecks[check](validMembers);
        }
    }

    if (window.eligibilityChecks.refreshAllDisplays) {
        await window.eligibilityChecks.refreshAllDisplays();
    }
}

// ══════════════════════════════════════════════════════════════
// CLIENT API HELPERS
// ══════════════════════════════════════════════════════════════

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
            console.error('Failed to update checkedOut status:', result.message);
        }
    } catch (error) {
        console.error('Error updating checkedOut status:', error);
    }
}

async function loadHouseholdMembers() {
    const client = await fetchClientData();
    return (client?.householdMembers || []).filter(member => member && typeof member === 'object' && member.householdMemberId);
}

// ══════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════

function goToAssetsEdit() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `assetsedit.html?id=${clientId}`;
    } else {
        console.error('Client ID not found.');
    }
}

async function goToIncomeView() {
    const clientId = getQueryParameter('id');
    if (!clientId) {
        console.error('Client ID not found.');
        return;
    }

    if (!confirm("Are you sure you want to save and release this profile?")) return;

    const activeUser = sessionStorage.getItem('loggedInUser');
    if (!activeUser) {
        console.error("No active user found.");
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
        console.error("Error during goToIncomeView:", error);
    } finally {
        window.location.href = `incomeview.html?id=${clientId}`;
    }
}

// ══════════════════════════════════════════════════════════════
// FARMWORKER STATUS MANAGEMENT
// ══════════════════════════════════════════════════════════════

async function refreshFarmworkerVisibility() {
    const farmworkerQuestion = document.getElementById('farmworker-question');
    if (!farmworkerQuestion) return;

    const client = await fetchClientData();
    if (!client) return;

    const householdMembers = client.householdMembers || [];
    const hasMealsAndSnapScreening = householdMembers.some(
        member => member.meals === 'yes' && member.SNAP?.screeningInProgress === true
    );

    farmworkerQuestion.style.display = hasMealsAndSnapScreening ? 'block' : 'none';
}

async function highlightSavedFarmworkerSelection() {
    const client = await fetchClientData();
    if (!client) return;

    const farmworkerYes = document.getElementById('farmworker-yes');
    const farmworkerNo = document.getElementById('farmworker-no');

    if (typeof client.isFarmworker === 'boolean') {
        if (client.isFarmworker) {
            farmworkerYes?.classList.add('selected');
            farmworkerNo?.classList.remove('selected');
        } else {
            farmworkerNo?.classList.add('selected');
            farmworkerYes?.classList.remove('selected');
        }
    }
}

async function saveFarmworkerStatus(isFarmworker) {
    const clientId = getQueryParameter('id');
    if (!clientId) return;

    try {
        const response = await fetch(`${BACKEND_URL}/update-client`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, clientData: { isFarmworker } })
        });

        const result = await response.json();
        if (response.ok && result.success) {
            invalidateCache();
        }
    } catch (error) {
        console.error('Error saving farmworker status:', error);
    }
}

// ══════════════════════════════════════════════════════════════
// SIDEBAR VISIBILITY
// ══════════════════════════════════════════════════════════════

async function toggleSidebarVisibility() {
    const client = await fetchClientData();
    const leftSidebar = document.getElementById('leftSidebarContainer');
    const snapContainer = document.getElementById('snap-household-container');
    const liheapContainer = document.getElementById('liheap-household-container');
    const householdContainer = document.getElementById('household-members-container');

    if (!leftSidebar) return;

    leftSidebar.style.display = 'block';

    const containers = [snapContainer, liheapContainer, householdContainer];

    if (client?.screeningInProgress) {
        containers.forEach(el => { if (el) el.style.display = ''; });
    } else {
        containers.forEach(el => { if (el) el.style.display = 'none'; });
    }
}

// ══════════════════════════════════════════════════════════════
// INCOME HTML GENERATION
// ══════════════════════════════════════════════════════════════

function generateIncomeItemHTML(income, memberId) {
    return `
        <li data-income-id="${income.id}">
            <p><strong>Income Type:</strong> ${income.type}</p>
            <p><strong>Income Kind:</strong> ${income.kind}</p>
            <p><strong>Amount:</strong> $${income.amount}</p>
            <p><strong>Frequency:</strong> ${income.frequency}</p>
            <p><strong>Start Date:</strong> ${income.startDate}</p>
            <p><strong>End Date:</strong> ${income.endDate}</p>
            <div class="button-container">
                <button class="edit-income-button" data-member-id="${memberId}" data-income-id="${income.id}">Edit</button>
                <button class="delete-income-button" data-member-id="${memberId}" data-income-id="${income.id}">Delete</button>
            </div>
        </li>
    `;
}

function generateIncomeListHTML(incomes, memberId, type) {
    const filtered = incomes.filter(i => i.type === type);
    if (filtered.length === 0) return '';

    const title = type === "Current" ? "Current Year Income:" : "Previous Year Income:";
    return `
        <h4>${title}</h4>
        <ul id="${type.toLowerCase()}-income-list-${memberId}">
            ${filtered.map(income => generateIncomeItemHTML(income, memberId)).join('')}
        </ul>
    `;
}

// ══════════════════════════════════════════════════════════════
// INCOME BUTTON VISIBILITY LOGIC
// ══════════════════════════════════════════════════════════════

function shouldShowCurrentYearButton(member, members) {
    if (member.LIS?.screeningInProgress || 
        member.MSP?.screeningInProgress ||
        (member.SNAP?.screeningInProgress && member.meals === 'yes') ||
        member.LIHEAP?.screeningInProgress) {
        return true;
    }

    if (member.currentSpouseId) {
        const spouse = members.find(m => m.householdMemberId === member.currentSpouseId);
        if (spouse?.LIS?.screeningInProgress || spouse?.MSP?.screeningInProgress) {
            return true;
        }
    }
    return false;
}

function shouldShowPreviousYearButton(member, members) {
    if (member.PACE?.screeningInProgress || member.PTRR?.screeningInProgress) {
        return true;
    }

    if (member.previousSpouseId) {
        const spouse = members.find(m => m.householdMemberId === member.previousSpouseId);
        if (spouse?.PACE?.screeningInProgress || spouse?.PTRR?.screeningInProgress) {
            return true;
        }
    }
    return false;
}

// ══════════════════════════════════════════════════════════════
// DISPLAY HOUSEHOLD MEMBERS
// ══════════════════════════════════════════════════════════════

async function displayHouseholdMembers() {
    const container = document.getElementById('household-member-container');
    if (!container) return;

    container.innerHTML = '';

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

        const incomes = member.income || [];
        const hasIncome = Array.isArray(incomes) && incomes.length > 0;

        let incomeHTML = '';
        if (hasIncome) {
            incomeHTML = generateIncomeListHTML(incomes, member.householdMemberId, "Current") +
                         generateIncomeListHTML(incomes, member.householdMemberId, "Previous");
        }
        if (!incomeHTML) {
            incomeHTML = '<p class="no-income-message">No income records available.</p>';
        }

        memberDiv.innerHTML = `
            <h3>${member.firstName} ${member.middleInitial || ''} ${member.lastName}</h3>
            <p><strong>Date of Birth:</strong> ${member.dob || 'N/A'}</p>
            <p><strong>Marital Status:</strong> ${member.maritalStatus || 'N/A'}</p>
            <div class="income-list">${incomeHTML}</div>
        `;

        if (shouldShowCurrentYearButton(member, members)) {
            const btn = document.createElement('button');
            btn.className = 'add-income-button';
            btn.dataset.memberId = member.householdMemberId;
            btn.dataset.type = 'Current';
            btn.textContent = 'Add Current Year Income';
            memberDiv.appendChild(btn);
        }

        if (shouldShowPreviousYearButton(member, members)) {
            const btn = document.createElement('button');
            btn.className = 'add-income-button';
            btn.dataset.memberId = member.householdMemberId;
            btn.dataset.type = 'Previous';
            btn.textContent = 'Add Previous Year Income';
            memberDiv.appendChild(btn);
        }

        container.appendChild(memberDiv);
    });
}

// ══════════════════════════════════════════════════════════════
// INCOME CRUD OPERATIONS
// ══════════════════════════════════════════════════════════════

async function saveIncome(memberId, income) {
    const clientId = getQueryParameter('id');
    
    try {
        const response = await fetch(`${BACKEND_URL}/update-member-income`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, memberId, income })
        });

        if (!response.ok) throw new Error('Failed to save income.');

        invalidateCache();
        await refreshAfterIncomeChange();
        return true;
    } catch (error) {
        console.error('Error saving income:', error);
        return false;
    }
}

async function updateIncome(memberId, incomeId, updatedIncome) {
    try {
        const response = await fetch(`${BACKEND_URL}/update-income`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberId, incomeId, updatedIncome })
        });

        if (!response.ok) throw new Error('Failed to update income.');

        invalidateCache();
        await refreshAfterIncomeChange();
        return true;
    } catch (error) {
        console.error('Error updating income:', error);
        return false;
    }
}

async function deleteIncome(memberId, incomeId) {
    const clientId = getQueryParameter('id');

    try {
        const response = await fetch(
            `${BACKEND_URL}/delete-income?clientId=${clientId}&memberId=${memberId}&incomeId=${incomeId}`,
            { method: 'DELETE', headers: { 'Content-Type': 'application/json' } }
        );

        if (!response.ok) throw new Error('Failed to delete income.');

        invalidateCache();
        await refreshAfterIncomeChange();
        return true;
    } catch (error) {
        console.error('Error deleting income:', error);
        return false;
    }
}

async function fetchIncomeDetails(memberId, incomeId) {
    try {
        const response = await fetch(`${BACKEND_URL}/get-income/${memberId}/${incomeId}`);
        if (!response.ok) throw new Error('Failed to fetch income details.');
        return await response.json();
    } catch (error) {
        console.error('Error fetching income details:', error);
        return null;
    }
}

// ══════════════════════════════════════════════════════════════
// REFRESH AFTER INCOME CHANGE
// ══════════════════════════════════════════════════════════════

async function refreshAfterIncomeChange() {
    const members = await loadHouseholdMembers();
    await runAllEligibilityChecks(members);
    await displayHouseholdMembers();
    await refreshFarmworkerVisibility();
}

// ══════════════════════════════════════════════════════════════
// INCOME VALIDATION
// ══════════════════════════════════════════════════════════════

function validateIncomeDates(income) {
    const startDate = new Date(`${income.startDate}T00:00:00Z`);
    const endDate = new Date(`${income.endDate}T00:00:00Z`);
    const startYear = startDate.getUTCFullYear();
    const endYear = endDate.getUTCFullYear();

    if (income.type === 'Current' && (startYear !== CURRENT_YEAR || endYear !== CURRENT_YEAR)) {
        alert(`For Current Year Income, both dates must be in ${CURRENT_YEAR}.`);
        return false;
    }

    if (income.type === 'Previous' && (startYear !== PREVIOUS_YEAR || endYear !== PREVIOUS_YEAR)) {
        alert(`For Previous Year Income, both dates must be in ${PREVIOUS_YEAR}.`);
        return false;
    }

    return true;
}

// ══════════════════════════════════════════════════════════════
// MODAL MANAGEMENT
// ══════════════════════════════════════════════════════════════

let modalState = {
    currentMemberId: null,
    currentIncomeType: null,
    isEditing: false,
    editingIncomeId: null
};

function getModalElements() {
    return {
        modal: document.getElementById('income-modal'),
        modalTitle: document.getElementById('modal-title'),
        closeModalBtn: document.getElementById('close-modal'),
        addIncomeBtn: document.getElementById('add-income-button'),
        incomeForm: document.getElementById('income-form'),
        incomeKind: document.getElementById('income-kind'),
        incomeFrequency: document.getElementById('income-frequency'),
        incomeStartDate: document.getElementById('income-start-date'),
        incomeEndDate: document.getElementById('income-end-date'),
        incomeAmount: document.getElementById('income-amount')
    };
}

function resetModal() {
    const { modal, incomeForm, addIncomeBtn } = getModalElements();
    
    incomeForm.reset();
    modalState = {
        currentMemberId: null,
        currentIncomeType: null,
        isEditing: false,
        editingIncomeId: null
    };
    addIncomeBtn.textContent = 'Add Income';
    modal.classList.add('hidden');
    modal.style.display = 'none';
}

function showModal() {
    const { modal } = getModalElements();
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

function openAddIncomeModal(memberId, incomeType) {
    const { modalTitle, incomeStartDate, incomeEndDate } = getModalElements();
    
    resetModal();
    modalState.currentMemberId = memberId;
    modalState.currentIncomeType = incomeType;

    modalTitle.textContent = `Add ${incomeType === 'Current' ? 'Current Year' : 'Previous Year'} Income`;

    const year = incomeType === 'Current' ? CURRENT_YEAR : PREVIOUS_YEAR;
    incomeStartDate.value = `${year}-01-01`;
    incomeEndDate.value = `${year}-12-31`;

    showModal();
}

async function openEditIncomeModal(memberId, incomeId) {
    const { modalTitle, addIncomeBtn, incomeKind, incomeFrequency, incomeStartDate, incomeEndDate, incomeAmount } = getModalElements();

    const income = await fetchIncomeDetails(memberId, incomeId);
    if (!income) {
        alert('Failed to fetch income details.');
        return;
    }

    incomeKind.value = income.kind;
    incomeFrequency.value = income.frequency;
    incomeStartDate.value = income.startDate;
    incomeEndDate.value = income.endDate;
    incomeAmount.value = income.amount;

    modalState.currentMemberId = memberId;
    modalState.currentIncomeType = income.type;
    modalState.editingIncomeId = incomeId;
    modalState.isEditing = true;

    modalTitle.textContent = `Edit ${income.type} Year Income`;
    addIncomeBtn.textContent = 'Save and Update';
    showModal();
}

async function handleIncomeSubmit() {
    const { incomeKind, incomeFrequency, incomeStartDate, incomeEndDate, incomeAmount } = getModalElements();

    const income = {
        id: modalState.isEditing ? modalState.editingIncomeId : crypto.randomUUID(),
        kind: incomeKind.value,
        type: modalState.currentIncomeType,
        frequency: incomeFrequency.value,
        startDate: incomeStartDate.value,
        endDate: incomeEndDate.value,
        amount: parseFloat(incomeAmount.value)
    };

    // Validate all fields
    if (!modalState.currentMemberId || !income.kind || !income.type || !income.frequency || 
        !income.startDate || !income.endDate || isNaN(income.amount)) {
        alert('Please fill out all fields.');
        return;
    }

    if (!validateIncomeDates(income)) return;

    let success;
    if (modalState.isEditing) {
        success = await updateIncome(modalState.currentMemberId, modalState.editingIncomeId, income);
    } else {
        success = await saveIncome(modalState.currentMemberId, income);
    }

    if (success) {
        resetModal();
    } else {
        alert('Failed to save income. Please try again.');
    }
}

async function handleDeleteIncome(memberId, incomeId) {
    if (!memberId || memberId === "null" || !incomeId) {
        alert('Missing or invalid income or member ID.');
        return;
    }

    if (!confirm('Are you sure you want to delete this income?')) return;

    const success = await deleteIncome(memberId, incomeId);
    if (!success) {
        alert('Failed to delete income. Please try again.');
    }
}

// ══════════════════════════════════════════════════════════════
// EVENT HANDLER SETUP
// ══════════════════════════════════════════════════════════════

function setupModalEventListeners() {
    const { modal, closeModalBtn, addIncomeBtn, incomeForm } = getModalElements();
    const container = document.getElementById('household-member-container');

    // Prevent Enter key submission
    incomeForm.addEventListener('keydown', e => {
        if (e.key === 'Enter') e.preventDefault();
    });

    // Close modal button
    closeModalBtn.addEventListener('click', resetModal);

    // Click outside modal to close
    document.addEventListener('click', e => {
        const isVisible = !modal.classList.contains('hidden') && modal.style.display !== 'none';
        const modalContent = document.querySelector('.modal-content');
        
        if (isVisible && 
            !modalContent.contains(e.target) && 
            !e.target.closest('.add-income-button') && 
            !e.target.closest('.edit-income-button')) {
            resetModal();
        }
    });

    // Event delegation for container clicks
    container.addEventListener('click', async e => {
        const target = e.target;

        if (target.classList.contains('add-income-button')) {
            openAddIncomeModal(target.dataset.memberId, target.dataset.type);
        }

        if (target.classList.contains('edit-income-button')) {
            await openEditIncomeModal(target.dataset.memberId, target.dataset.incomeId);
        }

        if (target.classList.contains('delete-income-button')) {
            await handleDeleteIncome(target.dataset.memberId, target.dataset.incomeId);
        }
    });

    // Submit income button
    addIncomeBtn.addEventListener('click', handleIncomeSubmit);
}

function setupFarmworkerHandlers() {
    const farmworkerYes = document.getElementById('farmworker-yes');
    const farmworkerNo = document.getElementById('farmworker-no');

    farmworkerYes?.addEventListener('click', () => {
        farmworkerYes.classList.add('selected');
        farmworkerNo?.classList.remove('selected');
        saveFarmworkerStatus(true);
    });

    farmworkerNo?.addEventListener('click', () => {
        farmworkerNo.classList.add('selected');
        farmworkerYes?.classList.remove('selected');
        saveFarmworkerStatus(false);
    });
}

function setupNavigationHandlers() {
    document.getElementById('save-exit')?.addEventListener('click', goToIncomeView);
    document.getElementById('save-continue')?.addEventListener('click', goToAssetsEdit);
}

// ══════════════════════════════════════════════════════════════
// GLOBAL EXPORTS
// ══════════════════════════════════════════════════════════════

window.refreshFarmworkerVisibility = refreshFarmworkerVisibility;
window.refreshIncome = displayHouseholdMembers;

// ══════════════════════════════════════════════════════════════
// SINGLE DOMContentLoaded INITIALIZATION
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    // Setup all event listeners
    setupModalEventListeners();
    setupFarmworkerHandlers();
    setupNavigationHandlers();

    // Load initial data
    await Promise.all([
        displayHouseholdMembers(),
        refreshFarmworkerVisibility(),
        highlightSavedFarmworkerSelection(),
        toggleSidebarVisibility()
    ]);
});