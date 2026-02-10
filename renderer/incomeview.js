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
// CLIENT API HELPERS
// ══════════════════════════════════════════════════════════════

async function fetchClientData() {
    const clientId = getQueryParameter('id');
    if (!clientId) return null;

    try {
        const response = await fetch(`${BACKEND_URL}/get-client/${clientId}`);
        if (!response.ok) throw new Error('Failed to fetch client data.');
        return await response.json();
    } catch (error) {
        console.error('Error fetching client data:', error);
        return null;
    }
}

async function loadHouseholdMembers() {
    const client = await fetchClientData();
    return client?.householdMembers || [];
}

// ══════════════════════════════════════════════════════════════
// FARMWORKER STATUS DISPLAY
// ══════════════════════════════════════════════════════════════

async function refreshFarmworkerVisibility() {
    const farmworkerQuestion = document.getElementById('farmworker-question');
    if (!farmworkerQuestion) return;

    const client = await fetchClientData();
    if (!client) return;

    const householdMembers = client.householdMembers || [];
    const hasMeals = householdMembers.some(member => member.meals === 'yes');

    farmworkerQuestion.style.display = hasMeals ? 'block' : 'none';
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

// ══════════════════════════════════════════════════════════════
// INCOME HTML GENERATION
// ══════════════════════════════════════════════════════════════

function generateIncomeItemHTML(income) {
    return `
        <li data-income-id="${income.id}">
            <p><strong>Income Type:</strong> ${income.type}</p>
            <p><strong>Income Kind:</strong> ${income.kind}</p>
            <p><strong>Amount:</strong> $${income.amount}</p>
            <p><strong>Frequency:</strong> ${income.frequency}</p>
            <p><strong>Start Date:</strong> ${income.startDate}</p>
            <p><strong>End Date:</strong> ${income.endDate}</p>
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
            ${filtered.map(income => generateIncomeItemHTML(income)).join('')}
        </ul>
    `;
}

// ══════════════════════════════════════════════════════════════
// DISPLAY HOUSEHOLD MEMBERS
// ══════════════════════════════════════════════════════════════

async function displayHouseholdMembers() {
    const container = document.getElementById('household-member-container');
    if (!container) return;

    container.innerHTML = '';
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

        const incomes = member.income || [];
        const hasIncome = Array.isArray(incomes) && incomes.length > 0;

        let incomeHTML = '';
        if (hasIncome) {
            incomeHTML = generateIncomeListHTML(incomes, member.householdMemberId, "Current") +
                         generateIncomeListHTML(incomes, member.householdMemberId, "Previous");
        }
        if (!incomeHTML) {
            incomeHTML = '<p>No income records available.</p>';
        }

        memberDiv.innerHTML = `
            <h3>${member.firstName} ${member.middleInitial || ''} ${member.lastName}</h3>
            <p><strong>Date of Birth:</strong> ${member.dob || 'N/A'}</p>
            <p><strong>Marital Status:</strong> ${member.maritalStatus || 'N/A'}</p>
            <div class="income-list">${incomeHTML}</div>
        `;

        container.appendChild(memberDiv);
    });
}

// ══════════════════════════════════════════════════════════════
// GLOBAL EXPORTS
// ══════════════════════════════════════════════════════════════

window.refreshIncomeDisplay = displayHouseholdMembers;

// ══════════════════════════════════════════════════════════════
// SINGLE DOMContentLoaded INITIALIZATION
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([
        displayHouseholdMembers(),
        refreshFarmworkerVisibility(),
        highlightSavedFarmworkerSelection()
    ]);
});