// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════

const CURRENT_YEAR = 2026;
const PREVIOUS_YEAR = 2025;
const BACKEND_URL = window.location.origin || "http://localhost:3000";

// ══════════════════════════════════════════════════════════════
// DROPDOWN OPTIONS
// ══════════════════════════════════════════════════════════════

const dropdownOptions = {
    Shelter: [
        { value: 'Rent', label: 'Rent' },
        { value: 'Mortgage', label: 'Mortgage' },
        { value: 'Property Taxes', label: 'Property Taxes' },
        { value: 'Homeowners Insurance', label: 'Homeowners Insurance' }
    ],
    Medical: [
        { value: 'Medicare Part B Premium', label: 'Medicare Part B Premium' },
        { value: 'Medicare Part D Premium', label: 'Medicare Part D Premium' },
        { value: 'Other Insurance Premium', label: 'Other Insurance Premium' },
        { value: 'Hospital Co-Pay', label: 'Hospital Co-Pay' },
        { value: 'Doctor Co-Pay', label: 'Doctor Co-Pay' },
        { value: 'Prescription Medication', label: 'Prescription Medication' },
        { value: 'Over-the-Counter Medication', label: 'Over-the-Counter Medication' },
        { value: 'Medical Equipment', label: 'Medical Equipment' },
        { value: 'Transportation', label: 'Transportation' },
        { value: 'Dental', label: 'Dental' },
        { value: 'Vision', label: 'Vision' },
        { value: 'Hearing', label: 'Hearing' },
        { value: 'Long-Term Care', label: 'Long-Term Care' },
        { value: 'Home Health Aide', label: 'Home Health Aide' },
        { value: 'Nursing Home', label: 'Nursing Home' },
        { value: 'Assisted Living', label: 'Assisted Living' },
        { value: 'Durable Medical Equipment', label: 'Durable Medical Equipment' }
    ],
    Other: [
        { value: 'Childcare for Work or Training', label: 'Childcare for Work or Training' },
        { value: 'Child Support', label: 'Child Support' }
    ],
    'Previous Year': [
        { value: 'Medicare Part B Premium', label: 'Medicare Part B Premium' },
        { value: 'Property Taxes', label: 'Property Taxes' },
        { value: 'Rent', label: 'Rent' }
    ]
};

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
// STATE MANAGEMENT
// ══════════════════════════════════════════════════════════════

const memberState = {
    currentMemberId: null,
    setCurrentMemberId(id) { this.currentMemberId = id; },
    getCurrentMemberId() { return this.currentMemberId; },
    resetCurrentMemberId() { this.currentMemberId = null; }
};

let modalState = {
    isEditing: false,
    currentExpenseId: null,
    leaseSelectedPersons: []
};

function resetModalState() {
    modalState.isEditing = false;
    modalState.currentExpenseId = null;
    modalState.leaseSelectedPersons = [];
}

// ══════════════════════════════════════════════════════════════
// DOM ELEMENT GETTERS
// ══════════════════════════════════════════════════════════════

function getModalElements() {
    return {
        modal: document.getElementById('shelter-modal'),
        modalTitle: document.getElementById('modal-title'),
        closeModal: document.getElementById('close-modal'),
        addExpenseButton: document.getElementById('add-expense-button'),
        expenseForm: document.getElementById('shelter-form'),
        expenseKind: document.getElementById('expense-kind'),
        expenseFrequency: document.getElementById('expense-frequency'),
        expenseStartDate: document.getElementById('expense-start-date'),
        expenseEndDate: document.getElementById('expense-end-date'),
        expenseAmount: document.getElementById('expense-amount'),
        ssPensionContainer: document.getElementById('ss-pension-deduction-container'),
        ssPensionSelect: document.getElementById('ss-pension-deduction'),
        leaseContainer: document.getElementById('lease-persons-container'),
        leaseSearch: document.getElementById('lease-search'),
        leaseDropdown: document.getElementById('lease-dropdown'),
        selectedLeaseList: document.getElementById('selected-lease-list')
    };
}

function getUtilityModalElements() {
    return {
        modal: document.getElementById('utility-modal'),
        expenseList: document.getElementById('utility-expense-list'),
        saveBtn: document.getElementById('save-utility-expenses')
    };
}

// ══════════════════════════════════════════════════════════════
// EXPENSE BUTTON VISIBILITY CONDITIONS
// ══════════════════════════════════════════════════════════════

function shouldShowShelterButton(member) {
    return member.SNAP?.screeningInProgress === true && 
           member.meals?.toLowerCase() === "yes";
}

function shouldShowUtilityButton(member) {
    if (!(member.SNAP?.screeningInProgress === true && member.meals?.toLowerCase() === "yes")) {
        return false;
    }
    // Hide if utility expenses already exist
    return !member.expenses?.some(expense => expense.type === 'Utility');
}

function shouldShowMedicalButton(member) {
    // SNAP path: needs meals=yes AND (age >= 60 OR disability)
    const snapMedical = member.SNAP?.screeningInProgress === true && 
                        member.meals?.toLowerCase() === "yes" &&
                        (parseInt(member.age?.split('Y')[0]) >= 60 || member.disability?.toLowerCase() === "yes");
    
    return snapMedical;
}

function shouldShowLiheapMedicalButton(member) {
    // LIHEAP-only path: show if LIHEAP is in progress AND SNAP medical button wasn't already shown
    const snapAlreadyShowsMedical = member.SNAP?.screeningInProgress === true && 
                                     member.meals?.toLowerCase() === "yes" &&
                                     (parseInt(member.age?.split('Y')[0]) >= 60 || member.disability?.toLowerCase() === "yes");
    
    return member.LIHEAP?.screeningInProgress === true && !snapAlreadyShowsMedical;
}

function shouldShowOtherButton(member) {
    return member.SNAP?.screeningInProgress === true && 
           member.meals?.toLowerCase() === "yes";
}

function shouldShowPreviousYearButton(member, allMembers) {
    // Direct eligibility
    if (member.PTRR?.screeningInProgress === true || member.PACE?.screeningInProgress === true) {
        return true;
    }
    
    // Spouse eligibility
    if (member.previousSpouseId) {
        const spouse = allMembers.find(m => m.householdMemberId === member.previousSpouseId);
        if (spouse?.PTRR?.screeningInProgress === true || spouse?.PACE?.screeningInProgress === true) {
            return true;
        }
    }
    
    return false;
}

// ══════════════════════════════════════════════════════════════
// LEASE/DEED DROPDOWN LOGIC
// ══════════════════════════════════════════════════════════════

function shouldShowLeaseDropdown(expenseType, kind) {
    return expenseType === 'Previous Year' && (kind === 'Rent' || kind === 'Property Taxes');
}

function renderLeaseDropdownItems(members) {
    const dropdown = document.getElementById('lease-dropdown');
    if (!dropdown) return;

    dropdown.innerHTML = '';
    
    const options = [
        ...members.map(m => ({
            id: String(m.householdMemberId),
            label: `${m.firstName} ${m.middleInitial || ''} ${m.lastName}`.replace(/\s+/g, ' ').trim()
        })),
        { id: '__outside__', label: 'Outside of Household' }
    ];

    options.forEach(opt => {
        const div = document.createElement('div');
        div.classList.add('dropdown-item');
        div.setAttribute('data-value', opt.id);
        div.textContent = opt.label;

        if (modalState.leaseSelectedPersons.some(p => p.id === opt.id)) {
            div.style.display = 'none';
        }

        div.addEventListener('click', () => {
            if (!modalState.leaseSelectedPersons.some(p => p.id === opt.id)) {
                modalState.leaseSelectedPersons.push({ id: opt.id, label: opt.label });
                renderLeaseSelectedTags();
                div.style.display = 'none';
            }
            const search = document.getElementById('lease-search');
            if (search) search.value = '';
            dropdown.classList.add('hidden');
        });

        dropdown.appendChild(div);
    });
}

function renderLeaseSelectedTags() {
    const selectedList = document.getElementById('selected-lease-list');
    const dropdown = document.getElementById('lease-dropdown');
    if (!selectedList) return;

    selectedList.innerHTML = '';
    
    modalState.leaseSelectedPersons.forEach(sel => {
        const item = document.createElement('div');
        item.classList.add('selected-item');
        item.setAttribute('data-value', sel.id);
        item.innerHTML = `${sel.label} <span class="remove-item" data-value="${sel.id}">&times;</span>`;
        selectedList.appendChild(item);
    });

    selectedList.querySelectorAll('.remove-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const id = e.target.getAttribute('data-value');
            modalState.leaseSelectedPersons = modalState.leaseSelectedPersons.filter(p => p.id !== id);

            const dropdownItem = Array.from(dropdown.children).find(item => item.getAttribute('data-value') === id);
            if (dropdownItem) dropdownItem.style.display = 'block';

            renderLeaseSelectedTags();
        });
    });
}

async function ensureLeaseDropdownVisibility() {
    const { modalTitle, leaseContainer } = getModalElements();
    const expenseType = modalTitle.textContent.includes('Previous Year') ? 'Previous Year' : modalTitle.textContent.split(' ')[1];
    const kind = document.getElementById('expense-kind')?.value;

    if (!leaseContainer) return;

    if (shouldShowLeaseDropdown(expenseType, kind)) {
        leaseContainer.classList.remove('hidden');
        const members = await getHouseholdMembersCached();
        renderLeaseDropdownItems(members);
        renderLeaseSelectedTags();
    } else {
        leaseContainer.classList.add('hidden');
        modalState.leaseSelectedPersons = [];
        renderLeaseSelectedTags();
    }
}

// ══════════════════════════════════════════════════════════════
// SS/PENSION DEDUCTION VISIBILITY
// ══════════════════════════════════════════════════════════════

async function updateSSPensionDeductionVisibility(expenseType, kind) {
    const { ssPensionContainer, ssPensionSelect } = getModalElements();
    if (!ssPensionContainer || !ssPensionSelect) return;

    if (expenseType === 'Medical' && (kind === 'Medicare Part B Premium' || kind === 'Medicare Part D Premium')) {
        const currentMemberId = memberState.getCurrentMemberId();
        if (currentMemberId) {
            const members = await getHouseholdMembersCached();
            const member = members.find(m => String(m.householdMemberId) === String(currentMemberId));
            if (member?.LIHEAP?.screeningInProgress === true) {
                ssPensionContainer.classList.remove('hidden');
                return;
            }
        }
    }

    ssPensionContainer.classList.add('hidden');
    ssPensionSelect.value = '';
}

// ══════════════════════════════════════════════════════════════
// EXPENSE HTML GENERATION
// ══════════════════════════════════════════════════════════════

function generateExpenseButtons(member, allMembers) {
    let buttons = '';

    // Shelter button (SNAP + meals = yes)
    if (shouldShowShelterButton(member)) {
        buttons += `<button class="add-expense-button" data-member-id="${member.householdMemberId}" data-expense-type="Shelter">Add Shelter Expense</button>`;
    }

    // Utility button (SNAP + meals = yes, no existing utility expenses)
    if (shouldShowUtilityButton(member)) {
        buttons += `<button class="add-expense-button" data-member-id="${member.householdMemberId}" data-expense-type="Utility">Add Utility Expense</button>`;
    }

    // Medical button (SNAP + meals + age>=60 or disability)
    if (shouldShowMedicalButton(member)) {
        buttons += `<button class="add-expense-button" data-member-id="${member.householdMemberId}" data-expense-type="Medical">Add Medical Expense</button>`;
    }

    // Other button (SNAP + meals = yes)
    if (shouldShowOtherButton(member)) {
        buttons += `<button class="add-expense-button" data-member-id="${member.householdMemberId}" data-expense-type="Other">Add Other Expense</button>`;
    }

    // LIHEAP-only Medical button
    if (shouldShowLiheapMedicalButton(member)) {
        buttons += `<button class="add-expense-button" data-member-id="${member.householdMemberId}" data-expense-type="Medical" data-liheap-only="true">Add Medical Expense</button>`;
    }

    // Previous Year button (PTRR or PACE, or spouse has PTRR/PACE)
    if (shouldShowPreviousYearButton(member, allMembers)) {
        buttons += `<button class="add-expense-button" data-member-id="${member.householdMemberId}" data-expense-type="Previous Year">Add Previous Year Expense</button>`;
    }

    return buttons;
}

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
                    <div class="button-container">
                        <button class="edit-expense-button" data-expense-id="${expense.id}">Edit</button>
                        <button class="delete-expense-button" data-expense-id="${expense.id}" style="color: white; background-color: red;">Delete</button>
                    </div>
                </li>
            `).join('')}
            </ul>
        </div>
    `;
}

function renderUtilityExpenses(expenses) {
    if (expenses.length === 0) return '';
    
    return `
        <div class="utility-expenses-container" style="text-align: center; margin: 20px 0;">
            <h4>Utility Expenses</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;">
                ${expenses.map(expense => `
                    <span style="padding: 5px 10px; border: 1px solid #ccc; border-radius: 5px;">
                        ${expense.kind}
                    </span>
                `).join('')}
            </div>
            <div style="margin-top: 10px;">
                <button class="edit-utility-expenses-button" style="margin-right: 10px;">Edit</button>
                <button class="delete-utility-expenses-button" style="color: white; background-color: red;">Delete</button>
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
// DISPLAY HOUSEHOLD MEMBERS
// ══════════════════════════════════════════════════════════════

let isDisplaying = false;

async function displayHouseholdMembers(skipEligibilityChecks = false) {
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
                <div class="add-expense-buttons">
                    ${generateExpenseButtons(member, members)}
                </div>
            `;

            container.appendChild(memberDiv);
        }

        if (skipEligibilityChecks) return;

        // Run eligibility checks
        await runEligibilityChecks(members);

    } finally {
        isDisplaying = false;
    }
}

async function runEligibilityChecks(members) {
    if (!window.eligibilityChecks) {
        console.error('Eligibility checks are not loaded.');
        return;
    }

    const requiredChecks = [
        'PACEEligibilityCheck',
        'LISEligibilityCheck',
        'MSPEligibilityCheck',
        'PTRREligibilityCheck',
        'SNAPEligibilityCheck',
        'LIHEAPEligibilityCheck',
        'updateAndDisplayHouseholdMembers',
        'displaySNAPHouseholds'
    ];

    for (const check of requiredChecks) {
        if (typeof window.eligibilityChecks[check] !== 'function') {
            console.error(`Missing eligibility check method: ${check}`);
            return;
        }
    }

    await window.eligibilityChecks.PACEEligibilityCheck(members);
    await window.eligibilityChecks.LISEligibilityCheck(members);
    await window.eligibilityChecks.MSPEligibilityCheck(members);
    await window.eligibilityChecks.PTRREligibilityCheck(members);
    await window.eligibilityChecks.SNAPEligibilityCheck(members);
    await window.eligibilityChecks.LIHEAPEligibilityCheck(members);

    if (window.eligibilityChecks.refreshAllDisplays) {
        await window.eligibilityChecks.refreshAllDisplays();
    }
}

// ══════════════════════════════════════════════════════════════
// EXPENSE VALIDATION
// ══════════════════════════════════════════════════════════════

function validateExpenseDates(expenseType, startDate, endDate) {
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    const startYear = start.getUTCFullYear();
    const endYear = end.getUTCFullYear();

    if (expenseType === 'Previous Year' && (startYear !== PREVIOUS_YEAR || endYear !== PREVIOUS_YEAR)) {
        alert(`For Previous Year Expenses, both Start Date and End Date must be in ${PREVIOUS_YEAR}.`);
        return false;
    }

    if (expenseType !== 'Previous Year' && (startYear !== CURRENT_YEAR || endYear !== CURRENT_YEAR)) {
        alert(`For ${expenseType} Expenses, both Start Date and End Date must be in ${CURRENT_YEAR}.`);
        return false;
    }

    return true;
}

function getExpenseTypeFromModalTitle(title) {
    return title.includes('Previous Year') ? 'Previous Year' : title.split(' ')[1];
}

// ══════════════════════════════════════════════════════════════
// EXPENSE CRUD OPERATIONS
// ══════════════════════════════════════════════════════════════

async function saveExpense() {
    const clientId = getQueryParameter('id');
    const currentMemberId = memberState.getCurrentMemberId();
    const elements = getModalElements();

    if (!clientId) {
        alert('Client ID is missing. Please check the URL.');
        return;
    }

    if (!currentMemberId) {
        alert('Member ID is missing. Please select a member.');
        return;
    }

    const expenseKind = elements.expenseKind.value;
    const expenseFrequency = elements.expenseFrequency.value;
    const expenseStartDate = elements.expenseStartDate.value;
    const expenseEndDate = elements.expenseEndDate.value;
    const expenseAmount = elements.expenseAmount.value;

    const ssPensionDeduction = !elements.ssPensionContainer.classList.contains('hidden')
        ? elements.ssPensionSelect.value
        : undefined;

    if (!expenseKind || !expenseFrequency || !expenseStartDate || !expenseEndDate || !expenseAmount) {
        alert('Please fill out all fields.');
        return;
    }

    if (!elements.ssPensionContainer.classList.contains('hidden') && !ssPensionDeduction) {
        alert('Please indicate whether this expense is deducted from a Social Security or pension payment.');
        return;
    }

    const expenseType = getExpenseTypeFromModalTitle(elements.modalTitle.textContent);

    if (!validateExpenseDates(expenseType, expenseStartDate, expenseEndDate)) return;

    const newExpense = {
        id: `expense-${Date.now()}`,
        type: expenseType,
        amount: parseFloat(expenseAmount),
        kind: expenseKind,
        frequency: expenseFrequency,
        startDate: expenseStartDate,
        endDate: expenseEndDate,
        leasePersons: shouldShowLeaseDropdown(expenseType, expenseKind)
            ? modalState.leaseSelectedPersons.map(p => p.label)
            : undefined,
        deductedFromSSOrPension: ssPensionDeduction || undefined
    };

    try {
        const response = await fetch('/save-expense', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId,
                memberId: currentMemberId,
                expense: newExpense
            })
        });

        const result = await response.json();

        if (result.success) {
            elements.expenseForm.reset();
            elements.modal.classList.add('hidden');
            invalidateHouseholdCache();
            await displayHouseholdMembers();
        } else {
            alert('Failed to save the expense. Please try again.');
        }
    } catch (error) {
        console.error('Error saving expense:', error);
        alert('An error occurred while saving the expense. Please try again.');
    }
}

async function overwriteExpense() {
    if (!modalState.currentExpenseId) {
        alert('No expense selected for overwriting. Please try again.');
        return;
    }

    const elements = getModalElements();
    const memberContainer = document.querySelector(`.household-member1-box [data-expense-id="${modalState.currentExpenseId}"]`)?.closest('.household-member1-box');
    const memberId = memberContainer?.querySelector('.add-expense-button')?.dataset.memberId;

    if (!memberId) {
        alert('Failed to identify the member. Please try again.');
        return;
    }

    const expenseKind = elements.expenseKind.value;
    const expenseFrequency = elements.expenseFrequency.value;
    const expenseStartDate = elements.expenseStartDate.value;
    const expenseEndDate = elements.expenseEndDate.value;
    const expenseAmount = elements.expenseAmount.value;

    const ssPensionDeduction = !elements.ssPensionContainer.classList.contains('hidden')
        ? elements.ssPensionSelect.value
        : undefined;

    if (!expenseKind || !expenseFrequency || !expenseStartDate || !expenseEndDate || !expenseAmount) {
        alert('Please fill out all fields.');
        return;
    }

    if (!elements.ssPensionContainer.classList.contains('hidden') && !ssPensionDeduction) {
        alert('Please indicate whether this expense is deducted from a Social Security or pension payment.');
        return;
    }

    const expenseType = getExpenseTypeFromModalTitle(elements.modalTitle.textContent);

    if (!validateExpenseDates(expenseType, expenseStartDate, expenseEndDate)) return;

    const updatedExpense = {
        id: modalState.currentExpenseId,
        type: expenseType,
        kind: expenseKind,
        amount: parseFloat(expenseAmount),
        frequency: expenseFrequency,
        startDate: expenseStartDate,
        endDate: expenseEndDate,
        leasePersons: shouldShowLeaseDropdown(expenseType, expenseKind)
            ? modalState.leaseSelectedPersons.map(p => p.label)
            : undefined,
        deductedFromSSOrPension: ssPensionDeduction || undefined
    };

    try {
        const response = await fetch('/update-expense', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                householdMemberId: memberId,
                expense: updatedExpense
            })
        });

        const result = await response.json();

        if (result.success) {
            elements.expenseForm.reset();
            elements.modal.classList.add('hidden');
            resetModalState();
            invalidateHouseholdCache();
            await displayHouseholdMembers();
        } else {
            alert(result.message || 'Failed to overwrite the expense. Please try again.');
        }
    } catch (error) {
        console.error('Error overwriting expense:', error);
        alert(`An error occurred while overwriting the expense: ${error.message}`);
    }
}

async function deleteExpense(expenseId) {
    if (!expenseId) {
        alert('Failed to identify the expense. Please try again.');
        return;
    }

    if (!confirm('Are you sure you want to delete this expense?')) return;

    try {
        const response = await fetch('/delete-expense', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expenseId })
        });

        const result = await response.json();

        if (result.success) {
            invalidateHouseholdCache();
            await displayHouseholdMembers();
        } else {
            alert('Failed to delete the expense. Please try again.');
        }
    } catch (error) {
        console.error('Error deleting expense:', error);
        alert('An error occurred while deleting the expense. Please try again.');
    }
}

// ══════════════════════════════════════════════════════════════
// UTILITY EXPENSE OPERATIONS
// ══════════════════════════════════════════════════════════════

async function saveUtilityExpenses() {
    const clientId = getQueryParameter('id');
    const currentMemberId = memberState.getCurrentMemberId();
    const { expenseList, modal } = getUtilityModalElements();

    if (!clientId || !currentMemberId) {
        alert('Both clientId and memberId are required to save utility expenses.');
        return;
    }

    const selectedUtilities = Array.from(expenseList.querySelectorAll('.selection-box.selected'))
        .map(box => box.dataset.utilityType);

    if (selectedUtilities.length === 0) {
        alert('Please select at least one utility type.');
        return;
    }

    try {
        // Fetch existing utility expenses
        const existingExpenses = await fetch(`/get-expense?householdMemberId=${currentMemberId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        }).then(res => res.ok ? res.json() : []).catch(() => []);

        const utilityExpenses = existingExpenses.filter(e => e.type === 'Utility');

        // Delete existing utility expenses if any
        if (utilityExpenses.length > 0) {
            const deleteResponse = await fetch('/delete-utility-expenses', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, memberId: currentMemberId })
            }).then(res => res.json()).catch(() => ({ success: false }));

            if (!deleteResponse.success) {
                alert('Failed to delete existing utility expenses. Please try again.');
                return;
            }
        }

        // Add new utility expenses
        const newExpenses = selectedUtilities.map(type => ({
            id: `expense-${Date.now()}-${type}`,
            type: 'Utility',
            kind: type,
            amount: 0,
            frequency: 'N/A',
            startDate: 'N/A',
            endDate: 'N/A'
        }));

        for (const expense of newExpenses) {
            await fetch('/add-utility-expense', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId,
                    memberId: currentMemberId,
                    utilityExpense: expense
                })
            });
        }

        invalidateHouseholdCache();
        await displayHouseholdMembers();
        modal.classList.add('hidden');
    } catch (error) {
        console.error('Error saving utility expenses:', error);
        alert('An error occurred while saving utility expenses. Please try again.');
    }
}

async function deleteUtilityExpenses(memberId) {
    if (!confirm('Are you sure you want to delete all utility expenses?')) return;

    const clientId = getQueryParameter('id');

    if (!clientId || !memberId) {
        alert('Both clientId and memberId are required.');
        return;
    }

    try {
        const response = await fetch('/delete-utility-expenses', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, memberId })
        });

        const result = await response.json();

        if (result.success) {
            invalidateHouseholdCache();
            await displayHouseholdMembers();
        } else {
            alert('Failed to delete the utility expenses. Please try again.');
        }
    } catch (error) {
        console.error('Error deleting utility expenses:', error);
        alert('An error occurred while deleting the utility expenses. Please try again.');
    }
}

async function openEditUtilityModal(memberId) {
    const { modal, expenseList } = getUtilityModalElements();

    try {
        const expenses = await fetch(`/get-expense?householdMemberId=${memberId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        }).then(res => res.ok ? res.json() : []).catch(() => []);

        const utilityExpenses = expenses.filter(e => e.type === 'Utility');

        modal.classList.remove('hidden');

        expenseList.querySelectorAll('.selection-box').forEach(box => {
            const utilityType = box.dataset.utilityType;
            if (utilityExpenses.some(e => e.kind === utilityType)) {
                box.classList.add('selected');
            } else {
                box.classList.remove('selected');
            }
        });

        memberState.setCurrentMemberId(memberId);
    } catch (error) {
        console.error('Error editing utility expenses:', error);
        alert('An error occurred while editing utility expenses. Please try again.');
    }
}

// ══════════════════════════════════════════════════════════════
// MODAL MANAGEMENT
// ══════════════════════════════════════════════════════════════

function openAddExpenseModal(memberId, expenseType, isLiheapOnly = false) {
    const elements = getModalElements();

    memberState.setCurrentMemberId(memberId);
    resetModalState();

    elements.modalTitle.textContent = `Add ${expenseType} Expense`;

    // Populate dropdown options
    elements.expenseKind.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = `Select ${expenseType} Kind`;
    placeholder.disabled = true;
    placeholder.selected = true;
    elements.expenseKind.appendChild(placeholder);

    if (dropdownOptions[expenseType]) {
        const options = isLiheapOnly
            ? dropdownOptions[expenseType].filter(opt => opt.value === 'Medicare Part B Premium' || opt.value === 'Medicare Part D Premium')
            : dropdownOptions[expenseType];

        options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.label;
            elements.expenseKind.appendChild(optionElement);
        });
    }

    // Set default dates
    if (expenseType === 'Previous Year') {
        elements.expenseStartDate.value = `${PREVIOUS_YEAR}-01-01`;
        elements.expenseEndDate.value = `${PREVIOUS_YEAR}-12-31`;
    } else {
        elements.expenseStartDate.value = `${CURRENT_YEAR}-01-01`;
        elements.expenseEndDate.value = `${CURRENT_YEAR}-12-31`;
    }

    elements.addExpenseButton.textContent = 'Add Expense';
    elements.modal.classList.remove('hidden');

    ensureLeaseDropdownVisibility();
}

async function openEditExpenseModal(memberId, expenseId) {
    const elements = getModalElements();

    try {
        const expense = await fetch(`/get-expense?householdMemberId=${memberId}&expenseId=${expenseId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        }).then(res => res.ok ? res.json() : null).catch(() => null);

        if (!expense) {
            alert('Expense not found.');
            return;
        }

        const expenseType = expense.type;

        if (!dropdownOptions[expenseType]) {
            alert('Invalid expense type. Please try again.');
            return;
        }

        // Populate dropdown
        elements.expenseKind.innerHTML = '';
        dropdownOptions[expenseType].forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.label;
            if (option.value === expense.kind) optionElement.selected = true;
            elements.expenseKind.appendChild(optionElement);
        });

        elements.expenseStartDate.value = expense.startDate || '';
        elements.expenseEndDate.value = expense.endDate || '';
        elements.expenseFrequency.value = expense.frequency || '';
        elements.expenseAmount.value = expense.amount || '';

        elements.modalTitle.textContent = `Edit ${expenseType} Expense`;

        modalState.currentExpenseId = expense.id;
        modalState.isEditing = true;

        elements.modal.classList.remove('hidden');

        // Handle SS/Pension visibility
        await updateSSPensionDeductionVisibility(expenseType, expense.kind);
        if (expense.deductedFromSSOrPension) {
            elements.ssPensionSelect.value = expense.deductedFromSSOrPension;
        }

        // Handle Lease/Deed dropdown
        await ensureLeaseDropdownVisibility();
        if (shouldShowLeaseDropdown(expense.type, expense.kind) && Array.isArray(expense.leasePersons)) {
            const members = await getHouseholdMembersCached();
            modalState.leaseSelectedPersons = expense.leasePersons.map(label => {
                const match = members.find(m =>
                    `${m.firstName} ${m.middleInitial || ''} ${m.lastName}`.replace(/\s+/g, ' ').trim() === label
                );
                return { id: match ? String(match.householdMemberId) : '__outside__', label };
            });
            renderLeaseDropdownItems(members);
            renderLeaseSelectedTags();
        }

        elements.addExpenseButton.textContent = 'Save and Update';
    } catch (error) {
        console.error('Error fetching expense:', error);
        alert('An error occurred while fetching the expense. Please try again.');
    }
}

function closeExpenseModal() {
    const elements = getModalElements();
    elements.modal.classList.add('hidden');
    elements.expenseForm.reset();
    resetModalState();
    elements.addExpenseButton.textContent = 'Add Expense';
}

// ══════════════════════════════════════════════════════════════
// MODAL CLOSE ON OUTSIDE CLICK
// ══════════════════════════════════════════════════════════════

function setupModalCloseOnOutsideClick() {
    const shelterModal = document.getElementById('shelter-modal');
    const utilityModal = document.getElementById('utility-modal');

    document.addEventListener('click', (e) => {
        // Shelter modal
        if (shelterModal && !shelterModal.classList.contains('hidden')) {
            const modalContent = shelterModal.querySelector('.modal-content');
            if (modalContent && !modalContent.contains(e.target) && 
                !e.target.closest('.add-expense-button') && 
                !e.target.closest('.edit-expense-button')) {
                closeExpenseModal();
            }
        }

        // Utility modal
        if (utilityModal && !utilityModal.classList.contains('hidden')) {
            const modalContent = utilityModal.querySelector('.modal-content');
            if (modalContent && !modalContent.contains(e.target) && 
                !e.target.closest('.add-expense-button') && 
                !e.target.closest('.edit-utility-expenses-button')) {
                utilityModal.classList.add('hidden');
            }
        }
    });
}

// ══════════════════════════════════════════════════════════════
// DELEGATED EVENT LISTENERS
// ══════════════════════════════════════════════════════════════

function setupDelegatedEventListeners() {
    const container = document.getElementById('household-member-container');
    if (!container) return;

    container.addEventListener('click', async (e) => {
        const target = e.target;

        // Add expense button
        if (target.classList.contains('add-expense-button')) {
            const memberId = target.dataset.memberId;
            const expenseType = target.dataset.expenseType;
            const isLiheapOnly = target.dataset.liheapOnly === 'true';

            if (expenseType === 'Utility') {
                memberState.setCurrentMemberId(memberId);
                const utilityModal = document.getElementById('utility-modal');
                if (utilityModal) {
                    // Clear previous selections
                    utilityModal.querySelectorAll('.selection-box').forEach(box => {
                        box.classList.remove('selected');
                    });
                    utilityModal.classList.remove('hidden');
                }
            } else {
                openAddExpenseModal(memberId, expenseType, isLiheapOnly);
            }
        }

        // Edit expense button
        if (target.classList.contains('edit-expense-button')) {
            const expenseId = target.dataset.expenseId;
            const memberBox = target.closest('.household-member1-box');
            const memberId = memberBox?.querySelector('.add-expense-button')?.dataset.memberId;

            if (memberId && expenseId) {
                memberState.setCurrentMemberId(memberId);
                await openEditExpenseModal(memberId, expenseId);
            }
        }

        // Delete expense button
        if (target.classList.contains('delete-expense-button')) {
            const expenseId = target.dataset.expenseId;
            if (expenseId) {
                await deleteExpense(expenseId);
            }
        }

        // Edit utility expenses button
        if (target.classList.contains('edit-utility-expenses-button')) {
            const memberBox = target.closest('.household-member1-box');
            const memberId = memberBox?.querySelector('.add-expense-button')?.dataset.memberId;

            if (memberId) {
                await openEditUtilityModal(memberId);
            }
        }

        // Delete utility expenses button
        if (target.classList.contains('delete-utility-expenses-button')) {
            const memberBox = target.closest('.household-member1-box');
            const memberId = memberBox?.querySelector('.add-expense-button')?.dataset.memberId;

            if (memberId) {
                await deleteUtilityExpenses(memberId);
            }
        }
    });
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

// ══════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════

function goToScreeningEdit() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `estimationsstep.html?id=${clientId}`;
    } else {
        console.error('Client ID not found.');
    }
}

async function goToExpensesView() {
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
        console.error("Error during goToExpensesView:", error);
    } finally {
        window.location.href = `expensesview.html?id=${clientId}`;
    }
}

// ══════════════════════════════════════════════════════════════
// EVENT HANDLERS SETUP
// ══════════════════════════════════════════════════════════════

function setupEventListeners() {
    const elements = getModalElements();
    const utilityElements = getUtilityModalElements();

    // Close modal button
    elements.closeModal.addEventListener('click', closeExpenseModal);

    // Add/Update expense button
    elements.addExpenseButton.addEventListener('click', async () => {
        if (modalState.isEditing) {
            await overwriteExpense();
        } else {
            await saveExpense();
        }
    });

    // Save utility expenses button
    utilityElements.saveBtn.addEventListener('click', saveUtilityExpenses);

    // Expense kind change handler
    elements.expenseKind.addEventListener('change', async function () {
        const selectedValue = this.value;
        const expenseType = getExpenseTypeFromModalTitle(elements.modalTitle.textContent);

        // Autofill for Medicare Part B Premium
        if (selectedValue === 'Medicare Part B Premium') {
            if (expenseType === 'Medical') {
                elements.expenseAmount.value = '202.90';
                elements.expenseFrequency.value = 'Monthly';
            } else if (expenseType === 'Previous Year') {
                elements.expenseAmount.value = '185';
                elements.expenseFrequency.value = 'Monthly';
            }
        } else {
            elements.expenseAmount.value = '';
            elements.expenseFrequency.value = '';
        }

        await updateSSPensionDeductionVisibility(expenseType, selectedValue);
        await ensureLeaseDropdownVisibility();
    });

    // Lease search focus
    document.addEventListener('focusin', (e) => {
        if (e.target?.id === 'lease-search') {
            document.getElementById('lease-dropdown')?.classList.remove('hidden');
        }
    });

    // Lease search filter
    document.addEventListener('input', (e) => {
        if (e.target?.id === 'lease-search') {
            const filter = e.target.value.toLowerCase();
            const dropdown = document.getElementById('lease-dropdown');
            if (!dropdown) return;

            dropdown.querySelectorAll('.dropdown-item').forEach(item => {
                const text = item.textContent.toLowerCase();
                const isSelected = modalState.leaseSelectedPersons.some(p => p.id === item.getAttribute('data-value'));
                item.style.display = text.includes(filter) && !isSelected ? 'block' : 'none';
            });
        }
    });

    // Hide lease dropdown when clicking outside
    document.addEventListener('click', (event) => {
        const dropdown = document.getElementById('lease-dropdown');
        const search = document.getElementById('lease-search');
        if (!dropdown || !search) return;
        if (!dropdown.contains(event.target) && event.target !== search) {
            dropdown.classList.add('hidden');
        }
    });

    // Utility modal selection boxes
    utilityElements.expenseList.addEventListener('click', (e) => {
        if (e.target.classList.contains('selection-box')) {
            e.target.classList.toggle('selected');
        }
    });

    // Delete button hover effects
    document.addEventListener('mouseover', (event) => {
        if (event.target.classList.contains('delete-expense-button') ||
            event.target.classList.contains('delete-utility-expenses-button')) {
            event.target.style.backgroundColor = 'darkred';
        }
    });

    document.addEventListener('mouseout', (event) => {
        if (event.target.classList.contains('delete-expense-button') ||
            event.target.classList.contains('delete-utility-expenses-button')) {
            event.target.style.backgroundColor = 'red';
        }
    });

    // Modal close on outside click
    setupModalCloseOnOutsideClick();
}

function setupNavigationHandlers() {
    document.getElementById('save-exit')?.addEventListener('click', goToExpensesView);
    document.getElementById('save-continue')?.addEventListener('click', goToScreeningEdit);
}

// ══════════════════════════════════════════════════════════════
// SIDEBAR VISIBILITY
// ══════════════════════════════════════════════════════════════

async function toggleSidebarVisibility() {
    const clientId = getQueryParameter('id');
    if (!clientId) return;

    try {
        const response = await fetch(`${BACKEND_URL}/get-client/${clientId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) return;

        const client = await response.json();
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
    } catch (error) {
        console.error('Error toggling sidebar visibility:', error);
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
    console.log('expenses.js DOMContentLoaded');
    
    setupEventListeners();
    setupNavigationHandlers();
    setupDelegatedEventListeners();
    
    await Promise.all([
        displayHouseholdMembers(),
        toggleSidebarVisibility()
    ]);
    
    console.log('expenses.js initialization complete');
});