// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════

const CURRENT_YEAR = 2026;
const PREVIOUS_YEAR = 2025;

// ══════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════

function getQueryParameter(name) {
    return new URLSearchParams(window.location.search).get(name);
}

function formatAmount(amount) {
    return Number.isInteger(amount) ? amount : amount.toFixed(2);
}

// ══════════════════════════════════════════════════════════════
// HOUSEHOLD MEMBERS CACHE
// ══════════════════════════════════════════════════════════════

let cachedHouseholdMembers = null;

async function getHouseholdMembersCached() {
    if (cachedHouseholdMembers) return cachedHouseholdMembers;
    cachedHouseholdMembers = await loadHouseholdMembers();
    return cachedHouseholdMembers;
}

function invalidateHouseholdCache() {
    cachedHouseholdMembers = null;
}

async function loadHouseholdMembers() {
    const clientId = getQueryParameter('id');
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return [];
    }

    try {
        const response = await fetch(`/get-client/${clientId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch client data: ${response.statusText}`);
        }

        const client = await response.json();
        if (!client || !client.householdMembers) {
            console.error('No household members found for this client.');
            return [];
        }

        return client.householdMembers;
    } catch (error) {
        console.error('Error loading household members:', error);
        return [];
    }
}

// ══════════════════════════════════════════════════════════════
// EXPENSE HTML GENERATION (VIEW-ONLY)
// ══════════════════════════════════════════════════════════════

function renderExpenseList(expenses, title) {
    if (expenses.length === 0) return '';
    
    return `
        <div class="${title.toLowerCase().replace(/\s+/g, '-')}-expenses-container" style="margin: 20px 0;">
            <h4>${title} Expenses</h4>
            <ul>
            ${expenses.map(expense => `
                <li data-expense-id="${expense.id}" class="${Array.isArray(expense.leasePersons) && expense.leasePersons.length > 0 ? 'has-lease' : ''}">
                    <p><strong>Type:</strong><br> ${expense.type}</p>
                    <p><strong>Kind:</strong><br> ${expense.kind}</p>
                    ${Array.isArray(expense.leasePersons) && expense.leasePersons.length > 0 ? `
                        <p><strong>Person(s) on Lease/Deed:</strong><br> ${expense.leasePersons.join(', ')}</p>
                    ` : ''}
                    <p><strong>Amount:</strong><br> $${formatAmount(expense.amount)}</p>
                    <p><strong>Frequency:</strong><br> ${expense.frequency}</p>
                    ${expense.deductedFromSSOrPension ? `
                        <p><strong>Deducted from SS/Pension:</strong><br> ${expense.deductedFromSSOrPension}</p>
                    ` : ''}
                    <p><strong>Start Date:</strong><br> ${expense.startDate}</p>
                    <p><strong>End Date:</strong><br> ${expense.endDate}</p>
                </li>
            `).join('')}
            </ul>
        </div>
    `;
}

function renderUtilityExpenses(expenses) {
    if (expenses.length === 0) return '';
    
    return `
        <div class="utility-expenses-container">
            <h4>Utility Expenses</h4>
            <div class="utility-tags-container">
                ${expenses.map(expense => `
                    <span class="utility-tag">${expense.kind}</span>
                `).join('')}
            </div>
        </div>
    `;
}

function populateExpenses(expenses) {
    const shelterExpenses = expenses.filter(e => e.type === 'Shelter');
    const utilityExpenses = expenses.filter(e => e.type === 'Utility');
    const medicalExpenses = expenses.filter(e => e.type === 'Medical');
    const otherExpenses = expenses.filter(e => e.type === 'Other');
    const previousYearExpenses = expenses.filter(e => e.type === 'Previous Year');

    return `
        ${renderExpenseList(shelterExpenses, 'Shelter')}
        ${renderUtilityExpenses(utilityExpenses)}
        ${renderExpenseList(medicalExpenses, 'Medical')}
        ${renderExpenseList(otherExpenses, 'Other')}
        ${renderExpenseList(previousYearExpenses, 'Previous Year')}
    `;
}

// ══════════════════════════════════════════════════════════════
// DISPLAY HOUSEHOLD MEMBERS (VIEW-ONLY)
// ══════════════════════════════════════════════════════════════

let isDisplaying = false;

async function displayHouseholdMembers() {
    if (isDisplaying) return;
    isDisplaying = true;

    try {
        const container = document.getElementById('household-member-container');
        const members = await loadHouseholdMembers();

        container.innerHTML = '';

        if (members.length === 0) {
            container.innerHTML = '<p>No household members found.</p>';
            return;
        }

        // Sort: head of household first
        members.sort((a, b) => (b.headOfHousehold ? 1 : 0) - (a.headOfHousehold ? 1 : 0));

        for (const member of members) {
            // Fetch expenses for member
            const expenses = await fetch(`/get-expense?householdMemberId=${member.householdMemberId}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            })
                .then(res => res.ok ? res.json() : [])
                .catch(() => []);

            member.expenses = expenses.filter(e => e && e.type);

            // Only show members who have expenses
            if (member.expenses.length === 0) continue;

            const memberDiv = document.createElement('div');
            memberDiv.classList.add('household-member1-box');
            memberDiv.innerHTML = `
                <h3>${member.firstName} ${member.middleInitial || ''} ${member.lastName}</h3>
                <p><strong>Date of Birth:</strong> ${member.dob || 'N/A'}</p>
                <p><strong>Marital Status:</strong> ${member.maritalStatus || 'N/A'}</p>
                <div class="expense-list">
                    <ul id="expense-list-${member.householdMemberId}">
                        ${populateExpenses(member.expenses)}
                    </ul>
                </div>
            `;

            container.appendChild(memberDiv);
        }

        // Show message if no expenses exist for anyone
        if (container.children.length === 0) {
            container.innerHTML = '<p>No expenses recorded for any household members.</p>';
        }

    } finally {
        isDisplaying = false;
    }
}

// ══════════════════════════════════════════════════════════════
// SIDEBAR VISIBILITY
// ══════════════════════════════════════════════════════════════

function hideSidebar() {
    const sidebar = document.getElementById('leftSidebarContainer');
    if (sidebar) {
        sidebar.style.display = 'none';
    }
}

// ══════════════════════════════════════════════════════════════
// MODAL EVENT HANDLERS (VIEW-ONLY - MINIMAL)
// ══════════════════════════════════════════════════════════════

function setupModalEventListeners() {
    const utilityExpenseList = document.getElementById('utility-expense-list');
    const closeUtilityModal = document.getElementById('close-utility-modal');
    const utilityModal = document.getElementById('utility-modal');
    const closeModal = document.getElementById('close-modal');
    const shelterModal = document.getElementById('shelter-modal');

    // Toggle selection on click (utility modal)
    if (utilityExpenseList) {
        utilityExpenseList.addEventListener('click', (event) => {
            if (event.target.classList.contains('selection-box')) {
                event.target.classList.toggle('selected');
            }
        });
    }

    // Close utility modal
    if (closeUtilityModal && utilityModal) {
        closeUtilityModal.addEventListener('click', () => {
            utilityModal.classList.add('hidden');
        });
    }

    // Close shelter modal
    if (closeModal && shelterModal) {
        closeModal.addEventListener('click', () => {
            shelterModal.classList.add('hidden');
        });
    }
}

// ══════════════════════════════════════════════════════════════
// GLOBAL EXPORTS
// ══════════════════════════════════════════════════════════════

window.refreshExpenseButtons = displayHouseholdMembers;

// ══════════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    hideSidebar();
    setupModalEventListeners();
    await displayHouseholdMembers();
});