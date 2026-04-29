// ══════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════

function getQueryParam(param) {
    return new URLSearchParams(window.location.search).get(param);
}

function capitalizeFirstLetter(str) {
    return str ? str.toUpperCase() : '';
}

function calculateAge(dob, endDateStr) {
    if (!dob) return { years: 0, months: 0, days: 0 };
    const birthDate = new Date(dob);
    const endDate = endDateStr ? new Date(endDateStr) : new Date();
    if (!endDateStr) endDate.setDate(endDate.getDate() - 1);

    let years = endDate.getFullYear() - birthDate.getFullYear();
    let months = endDate.getMonth() - birthDate.getMonth();
    let days = endDate.getDate() - birthDate.getDate();

    if (days < 0) {
        months -= 1;
        days += new Date(endDate.getFullYear(), endDate.getMonth(), 0).getDate();
    }
    if (months < 0) {
        years -= 1;
        months += 12;
    }
    return { years, months, days };
}

function formatAge(age) {
    return `${age.years} Years, ${age.months} Months, ${age.days} Days`;
}

// ══════════════════════════════════════════════════════════════
// SELECTION HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Highlight a single option within a group identified by element IDs.
 * @param {string[]} elementIds - Array of DOM element IDs in the group
 * @param {HTMLElement|string|null} selected - The selected element, or a data-value string
 */
function highlightSelection(elementIds, selected) {
    elementIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        if (selected instanceof HTMLElement) {
            el.classList.toggle('selected', el === selected);
        } else {
            // selected is a data-value string or null
            el.classList.toggle('selected', el.getAttribute('data-value') === selected);
        }
    });
}

/**
 * Highlight by data-value within a NodeList of elements.
 */
function highlightByValue(elements, value) {
    elements.forEach(el => {
        el.classList.toggle('selected', el.getAttribute('data-value') === value);
    });
}

// ══════════════════════════════════════════════════════════════
// ELIGIBILITY CHECKS
// ══════════════════════════════════════════════════════════════

async function runAllEligibilityChecks(members) {
    if (!window.eligibilityChecks) return;

    const checks = [
        'PACEEligibilityCheck', 'LISEligibilityCheck', 'MSPEligibilityCheck',
        'PTRREligibilityCheck', 'SNAPEligibilityCheck', 'LIHEAPEligibilityCheck'
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

async function runLIHEAPCheckAndDisplay() {
    const clientId = getQueryParam('id');
    if (!clientId) return;

    const response = await fetch(`/get-client/${clientId}`);
    if (!response.ok) return;
    const updatedClient = await response.json();

    if (window.eligibilityChecks?.LIHEAPEligibilityCheck) {
        await window.eligibilityChecks.LIHEAPEligibilityCheck(updatedClient);
    }
    if (window.eligibilityChecks?.displayLIHEAPHouseholds) {
        await window.eligibilityChecks.displayLIHEAPHouseholds();
    }
}

// ══════════════════════════════════════════════════════════════
// CLIENT API HELPERS
// ══════════════════════════════════════════════════════════════

async function fetchClient(clientId) {
    const response = await fetch(`/get-client/${clientId}`);
    if (!response.ok) throw new Error(`Failed to fetch client data: ${response.statusText}`);
    return response.json();
}

async function saveClientField(clientId, key, value) {
    try {
        const response = await fetch('/update-client', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, clientData: { [key]: value } }),
        });

        if (!response.ok) {
            console.error(`Failed to update ${key}: ${value}`);
            return false;
        }
        console.log(`Successfully updated ${key}: ${value}`);
        return true;
    } catch (error) {
        console.error(`Error updating ${key}: ${value}`, error);
        return false;
    }
}

async function saveSelectionToClient(questionId, value) {
    const clientId = getQueryParam('id');
    if (!clientId) return;

    try {
        const response = await fetch('/update-client', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, clientData: { [questionId]: value } }),
        });

        if (!response.ok) throw new Error(`Failed to save ${questionId}: ${response.statusText}`);
        console.log(`Saved ${questionId}: ${value} for client ${clientId}`);
        await loadSavedData();
    } catch (error) {
        console.error(`Error saving ${questionId}: ${value}`, error);
    }
}

async function loadHouseholdMembers() {
    const clientId = getQueryParam('id');
    if (!clientId) return [];

    try {
        const clientData = await fetchClient(clientId);
        return clientData?.householdMembers || [];
    } catch (error) {
        console.error('Error loading household members:', error);
        return [];
    }
}

// ══════════════════════════════════════════════════════════════
// PROGRAM STATUS VISIBILITY
// ══════════════════════════════════════════════════════════════

/**
 * Check if a program is still "open" for screening
 * Priority:
 * 1. Check client-level programStatus (if set, this is authoritative)
 * 2. If no client-level status, check if any member has screeningInProgress = true
 * 3. If no members exist and no client-level status, default to true (open)
 * @param {object} clientData - The client data object containing householdMembers and programStatus
 * @param {string} programKey - The program key (e.g., 'SNAP', 'LIHEAP', 'PACE', 'LIS', 'MSP', 'PTRR')
 * @returns {boolean} - Whether the program is still open
 */
function isProgramOpen(clientData, programKey) {
    // First check client-level program status (authoritative if set)
    const clientProgramStatus = clientData.programStatus?.[programKey];
    if (clientProgramStatus !== undefined && clientProgramStatus.screeningInProgress !== undefined) {
        return clientProgramStatus.screeningInProgress === true;
    }
    
    // Fall back to checking members
    const members = clientData.householdMembers || [];
    
    // If no members exist and no client-level status, program is "open" by default
    if (members.length === 0) {
        return true;
    }
    
    // Program is "open" if ANY member has screeningInProgress = true for this program
    return members.some(member => {
        const benefit = member[programKey];
        return benefit?.screeningInProgress === true;
    });
}

/**
 * Apply visibility to main page questions based on program eligibility status
 * @param {object} clientData - The client data object
 */
function applyProgramBasedQuestionVisibility(clientData) {
    // Check program statuses
    const snapOpen = isProgramOpen(clientData, 'SNAP');
    const liheapOpen = isProgramOpen(clientData, 'LIHEAP');
    const paceOpen = isProgramOpen(clientData, 'PACE');
    const lisOpen = isProgramOpen(clientData, 'LIS');
    const mspOpen = isProgramOpen(clientData, 'MSP');
    const ptrrOpen = isProgramOpen(clientData, 'PTRR');

    // Get container references
    const containers = {
        snap: document.getElementById('snap-container'),
        student: document.getElementById('student-container'),
        citizen: document.getElementById('citizen-container'),
        liheap: document.getElementById('liheap-container'),
        heatingCrisis: document.getElementById('heatingCrisis-container'),
        residenceStatusCurrent: document.getElementById('residenceStatusCurrent-container'),
        subsidizedHousing: document.getElementById('subsidizedHousing-container'),
        heatingCost: document.getElementById('heatingCost-container'),
        medicaid: document.getElementById('medicaid-container'),
        medicare: document.getElementById('medicare-container'),
        disability: document.getElementById('disability-container'),
        residenceStatus: document.getElementById('residenceStatus-container'),
    };

    // SNAP open → show SNAP enrollment, student question, citizen question
    if (containers.snap) {
        containers.snap.style.display = snapOpen ? '' : 'none';
    }
    if (containers.student) {
        containers.student.style.display = snapOpen ? '' : 'none';
    }
    if (containers.citizen) {
        containers.citizen.style.display = snapOpen ? '' : 'none';
    }

    // LIHEAP open → show LIHEAP enrollment and conditional follow-ups
    if (containers.liheap) {
        containers.liheap.style.display = liheapOpen ? '' : 'none';
    }
    // Hide all LIHEAP follow-up questions if LIHEAP is closed
    if (!liheapOpen) {
        if (containers.heatingCrisis) containers.heatingCrisis.style.display = 'none';
        if (containers.residenceStatusCurrent) containers.residenceStatusCurrent.style.display = 'none';
        if (containers.subsidizedHousing) containers.subsidizedHousing.style.display = 'none';
        if (containers.heatingCost) containers.heatingCost.style.display = 'none';
    }

    // PACE, LIS, or MSP open → show Medicaid question
    if (containers.medicaid) {
        const showMedicaid = paceOpen || lisOpen || mspOpen;
        containers.medicaid.style.display = showMedicaid ? '' : 'none';
    }

    // LIS or MSP open → show Medicare question
    if (containers.medicare) {
        const showMedicare = lisOpen || mspOpen;
        containers.medicare.style.display = showMedicare ? '' : 'none';
    }

    // LIS or MSP open → show Disability question
    if (containers.disability) {
        const showDisability = lisOpen || mspOpen;
        containers.disability.style.display = showDisability ? '' : 'none';
    }

    // PTRR open → show Previous year residence status
    if (containers.residenceStatus) {
        containers.residenceStatus.style.display = ptrrOpen ? '' : 'none';
    }

    console.log('Program-based visibility applied:', {
        snapOpen,
        liheapOpen,
        paceOpen,
        lisOpen,
        mspOpen,
        ptrrOpen
    });
}

// ══════════════════════════════════════════════════════════════
// MODAL QUESTION DEFINITIONS
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

const MODAL_QUESTIONS = [
    { id: 'disability', elements: ['modal-disability-yes', 'modal-disability-no'] },
    { id: 'medicare', elements: ['modal-medicare-yes', 'modal-medicare-no'] },
    { id: 'medicaid', elements: ['modal-medicaid-yes', 'modal-medicaid-no'] },
    { id: 'student', elements: ['modal-student-yes', 'modal-student-no'] },
    { id: 'meals', elements: ['modal-meals-yes', 'modal-meals-no'] },
    { id: 'citizen', elements: ['modal-citizen-yes', 'modal-citizen-no'] },
    { id: 'deceased', elements: ['modal-deceased-yes', 'modal-deceased-no'] },
];

const MODAL_FIELD_IDS = [
    'firstName', 'middleInitial', 'lastName', 'dob',
    'socialSecurityNumber', 'legalSex', 'maritalStatus',
    'previousMaritalStatus', 'studentStatus', 'nonCitizenStatus'
];

const MODAL_QUESTION_CONTAINER_IDS = [
    'disabilityQuestion', 'medicareQuestion', 'medicaidQuestion',
    'studentQuestion', 'mealsQuestion', 'citizenQuestion',
];

// ══════════════════════════════════════════════════════════════
// LIHEAP / RESIDENCE / HOUSING VISIBILITY LOGIC
// ══════════════════════════════════════════════════════════════

function getContainerRefs() {
    return {
        residenceStatus: document.getElementById('residenceStatusCurrent-container'),
        heatingCrisis: document.getElementById('heatingCrisis-container'),
        subsidizedHousing: document.getElementById('subsidizedHousing-container'),
        heatingCost: document.getElementById('heatingCost-container'),
    };
}

function hideAllLiheapContainers() {
    const c = getContainerRefs();
    Object.values(c).forEach(el => { if (el) el.style.display = 'none'; });
}

function clearSelectionsForPrefix(...prefixes) {
    prefixes.forEach(prefix => {
        document.querySelectorAll(`[id^="${prefix}-"]`).forEach(opt => opt.classList.remove('selected'));
    });
}

async function applyLiheapVisibility(clientData) {
    const c = getContainerRefs();
    const liheap = clientData.liheapEnrollment;
    const crisis = clientData.heatingCrisis;
    const residence = clientData.residenceStatusCurrent;
    const subsidized = clientData.subsidizedHousing;

    if (liheap === 'notinterested') {
        hideAllLiheapContainers();
        return;
    }

    if (liheap === 'yes' && crisis === 'no') {
        c.residenceStatus.style.display = 'none';
        c.subsidizedHousing.style.display = 'none';
        c.heatingCost.style.display = 'none';
        c.heatingCrisis.style.display = 'block';
        return;
    }

    c.residenceStatus.style.display = 'block';
    c.heatingCrisis.style.display = 'block';

    if (residence === 'owned') {
        c.subsidizedHousing.style.display = 'none';
        c.heatingCost.style.display = 'none';
    } else {
        c.subsidizedHousing.style.display = 'block';
        c.heatingCost.style.display = subsidized === 'yes' ? 'block' : 'none';
    }
}

// ══════════════════════════════════════════════════════════════
// LOAD SAVED DATA (MAIN PAGE RENDER)
// ══════════════════════════════════════════════════════════════

async function loadSavedData() {
    const clientId = getQueryParam('id');
    if (!clientId) return;

    try {
        const clientData = await fetchClient(clientId);
        if (!clientData) return;

        // Apply program-based question visibility FIRST
        applyProgramBasedQuestionVisibility(clientData);

        // Highlight saved selections for main questions
        MAIN_QUESTIONS.forEach(q => {
            const savedValue = clientData[q.id];
            if (savedValue) {
                highlightSelection(q.elements, savedValue);
            }
        });

        // Household size dropdown
        const sizeDropdown = document.getElementById('household-size');
        if (sizeDropdown && clientData.householdSize) {
            sizeDropdown.value = clientData.householdSize;
        }

        // Render household members
        renderHouseholdMembers(clientData);

        // "Add Self" button
        await checkAndAddSelfButton(clientData);

        // LIHEAP visibility - apply if LIHEAP is open AND user has made a selection
        if (isProgramOpen(clientData, 'LIHEAP') && clientData.liheapEnrollment) {
            await applyLiheapVisibility(clientData);
        }

            // Subsidized Housing Previous — show only if residenceStatus is rented or rentedowned
    const shPrevContainer = document.getElementById('subsidizedHousingPrevious-container');
    if (shPrevContainer) {
        if (clientData.residenceStatus === 'rented' || clientData.residenceStatus === 'rentedowned') {
            shPrevContainer.style.display = 'block';
        } else {
            shPrevContainer.style.display = 'none';
        }
    }

    // Restore subsidizedHousingPrevious selection
    if (clientData.subsidizedHousingPrevious) {
        highlightSelection(
            ['subsidizedHousingPrevious-yes', 'subsidizedHousingPrevious-no'],
            clientData.subsidizedHousingPrevious
        );
    }

        // Run eligibility checks
        const members = clientData.householdMembers || [];
        await runAllEligibilityChecks(members);

    } catch (error) {
        console.error('Error loading saved data:', error);
    }
}

// ══════════════════════════════════════════════════════════════
// RENDER HOUSEHOLD MEMBERS
// ══════════════════════════════════════════════════════════════

function renderHouseholdMembers(clientData) {
    const container = document.getElementById('householdMemberContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!clientData.householdMembers?.length) return;

    const sorted = [...clientData.householdMembers].sort((a, b) => b.headOfHousehold - a.headOfHousehold);

    sorted.forEach(member => {
        const el = document.createElement('div');
        el.classList.add('household-member');
        el.innerHTML = buildMemberHTML(member);
        container.appendChild(el);
    });

    // Remove old listener by cloning the container
    const newContainer = container.cloneNode(true);
    container.parentNode.replaceChild(newContainer, container);

    // Wire up buttons via event delegation on the fresh container
    newContainer.addEventListener('click', async (e) => {
        const target = e.target;
        const memberId = target.getAttribute('data-member-id');
        if (!memberId) return;

        // Fetch fresh client data for each action
        const clientId = getQueryParam('id');
        if (!clientId) return;

        if (target.classList.contains('edit-member-button')) {
            try {
                const freshClientData = await fetchClient(clientId);
                const member = freshClientData.householdMembers?.find(m => m.householdMemberId === memberId);
                if (member) openEditModal(member);
            } catch (error) {
                console.error('Error fetching member for edit:', error);
            }
        } else if (target.classList.contains('delete-member-button')) {
            await deleteHouseholdMember(memberId);
        } else if (target.classList.contains('make-head-button')) {
            await makeHeadOfHousehold(memberId);
        }
    });
}

function buildMemberHTML(member) {
    const deceased = member.deceased === 'yes';
    const name = [
        member.prefix, capitalizeFirstLetter(member.firstName),
        member.middleInitial ? capitalizeFirstLetter(member.middleInitial) : '',
        capitalizeFirstLetter(member.lastName), member.suffix
    ].filter(Boolean).join(' ');

    const info = (label, value) => `<p class="household-member-info"><strong>${label}:</strong> ${value}</p>`;
    const conditionalInfo = (show, label, value) => show ? info(label, value) : '';

    const showPrevMarital =  member.previousMaritalStatus
        && typeof member.previousMaritalStatus === 'string'
        && member.previousMaritalStatus.toLowerCase() !== 'n/a';

    const showNonCitizen = !deceased && member.nonCitizenStatus
        && member.nonCitizenStatus.toLowerCase() !== 'citizen';

    const showStudentStatus = !deceased && member.studentStatus
        && member.studentStatus.toLowerCase() !== 'notstudent';

    return `
        ${info('Name', name)}
        ${info('DOB', member.dob)}
        ${deceased ? `<p class="household-member-info"><strong>Deceased: YES</strong></p>` : ''}
        ${deceased ? info('Date of Death', member.dateOfDeath || 'N/A') : ''}
        ${info('Age', member.age)}
        ${info('Legal Sex', capitalizeFirstLetter(member.legalSex))}
        ${conditionalInfo(!deceased, 'Marital Status', capitalizeFirstLetter(member.maritalStatus))}
        ${conditionalInfo(showPrevMarital, 'Previous Marital Status', capitalizeFirstLetter(member.previousMaritalStatus))}
        ${info('SSN', member.socialSecurityNumber || 'N/A')}
        ${conditionalInfo(!deceased, 'Disability', capitalizeFirstLetter(member.disability))}
        ${conditionalInfo(!deceased, 'Medicare', capitalizeFirstLetter(member.medicare))}
        ${conditionalInfo(!deceased, 'Medicaid', capitalizeFirstLetter(member.medicaid))}
        ${conditionalInfo(!deceased, 'US Citizen', capitalizeFirstLetter(member.citizen))}
        ${conditionalInfo(showNonCitizen, 'Non-Citizen Status', capitalizeFirstLetter(member.nonCitizenStatus))}
        ${conditionalInfo(!deceased, 'Student', capitalizeFirstLetter(member.student))}
        ${conditionalInfo(showStudentStatus, 'Student Status', capitalizeFirstLetter(member.studentStatus))}
        ${conditionalInfo(!deceased, 'Included in SNAP Household', capitalizeFirstLetter(member.meals))}
        <div class="button-container">
            <button class="edit-member-button" data-member-id="${member.householdMemberId}">Edit</button>
            <button class="delete-member-button" data-member-id="${member.householdMemberId}"
                style="color: white; background-color: red">Delete</button>
            ${!member.headOfHousehold
                ? `<button class="make-head-button" data-member-id="${member.householdMemberId}">Make Head of Household</button>`
                : `<p class="household-member-info" style="color: black; border: 2px solid black; padding: 5px; display: inline-block;"><strong>Head of Household</strong></p>`
            }
        </div>
    `;
}

// ══════════════════════════════════════════════════════════════
// ADD SELF BUTTON
// ══════════════════════════════════════════════════════════════

async function checkAndAddSelfButton(clientData) {
    const container = document.getElementById('householdMemberContainer');
    document.getElementById('add-self-button')?.remove();

    const hasSelf = clientData.householdMembers?.some(
        m => m.firstName === clientData.firstName && m.lastName === clientData.lastName
    );

    if (hasSelf) return;

    const btn = document.createElement('button');
    btn.id = 'add-self-button';
    btn.textContent = 'Add Primary Client as Household Member';
    btn.style.cssText = 'margin-bottom: 10px; border: 1px solid black; transition: background-color 0.3s ease, color 0.3s ease;';

    btn.addEventListener('mouseover', () => { btn.style.backgroundColor = '#0056b3'; btn.style.color = 'white'; });
    btn.addEventListener('mouseout', () => { btn.style.backgroundColor = ''; btn.style.color = ''; });

    btn.addEventListener('click', async () => {
        const clientId = getQueryParam('id');
        if (!clientId) return;

        try {
            const data = await fetchClient(clientId);
            if (!data.householdSize || data.householdSize === 0) {
                alert('Household size is not set. Please select a valid household size before adding members.');
                return;
            }
            if (data.householdMembers.length >= data.householdSize) {
                alert('The number of household members cannot exceed the selected household size.');
                return;
            }

            setModalHeader('add');
            await prepareHouseholdMemberModal();
            document.getElementById('firstName').value = data.firstName;
            document.getElementById('lastName').value = data.lastName;
            setupAddOrUpdateButton(false);
            document.getElementById('householdMemberModal').style.display = 'block';
        } catch (error) {
            console.error('Error fetching client data:', error);
        }
    });

    container.parentNode.insertBefore(btn, container);
}

// ══════════════════════════════════════════════════════════════
// HEAD OF HOUSEHOLD
// ══════════════════════════════════════════════════════════════

async function makeHeadOfHousehold(memberId) {
    const clientId = getQueryParam('id');
    if (!clientId) return;

    try {
        const clientData = await fetchClient(clientId);
        if (!clientData?.householdMembers) return;

        const programStatus = clientData.programStatus || {};
        const ptrrDefault = programStatus.PTRR?.screeningInProgress ?? true;

        const updatedMembers = clientData.householdMembers.map(m => {
            const isNewHead = m.householdMemberId === memberId;
            const isDeceased = m.deceased === 'yes';
            return {
                ...m,
                headOfHousehold: isNewHead,
                // Only the new head of household gets PTRR open
                PTRR: { 
                    ...(m.PTRR || {}),
                    screeningInProgress: isNewHead ? ptrrDefault : false 
                },
            };
        });

        const response = await fetch('/update-household-members', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, members: updatedMembers }),
        });

        if (response.ok) {
            console.log(`Head of household updated to: ${memberId}`);
            await loadSavedData();
        } else {
            console.error('Failed to update head of household:', response.statusText);
        }
    } catch (error) {
        console.error('Error updating head of household:', error);
    }
}

// ══════════════════════════════════════════════════════════════
// MODAL PREPARATION
// ══════════════════════════════════════════════════════════════

function setModalHeader(mode) {
    const header = document.getElementById('modal-header');
    header.textContent = mode === 'edit' ? 'Edit Household Member' : 'Add Household Member';
}

async function prepareHouseholdMemberModal() {
    const clientId = getQueryParam('id');
    if (!clientId) return;

    // Clear all fields
    MODAL_FIELD_IDS.forEach(id => {
        const field = document.getElementById(id);
        if (field) field.value = '';
    });

    // Make SSN editable, reset SSN state
    const ssnInput = document.getElementById('socialSecurityNumber');
    ssnInput.readOnly = false;
    document.getElementById('editSSNButton')?.remove();
    resetSSNFields();

    // Hide Next button
    const nextBtn = document.getElementById('nextSSNButton');
    if (nextBtn) nextBtn.style.display = 'none';

    // Reset question container visibility
    MODAL_QUESTION_CONTAINER_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'block';
    });

    // Hide date of death
    const dodContainer = document.getElementById('dateOfDeathContainer');
    const dodInput = document.getElementById('dateOfDeath');
    if (dodContainer) dodContainer.style.display = 'none';
    if (dodInput) dodInput.value = '';

    // Clear all modal option selections
    MODAL_QUESTIONS.forEach(q => {
        q.elements.forEach(id => {
            document.getElementById(id)?.classList.remove('selected');
        });
    });

    // Default deceased to "no"
    document.getElementById('modal-deceased-no')?.classList.add('selected');

    // Hide conditional containers
    document.getElementById('nonCitizenStatusContainer').style.display = 'none';
    document.getElementById('studentStatusContainer').style.display = 'none';

    // Fetch client data to conditionally show/hide questions
    try {
        const clientData = await fetchClient(clientId);
        if (!clientData) return;

        const questionVisibility = {
            disabilityQuestion: clientData.disability === 'yes',
            medicareQuestion: clientData.medicare === 'yes',
            medicaidQuestion: clientData.medicaid === 'yes',
            citizenQuestion: clientData.citizen === 'no',
            studentQuestion: clientData.student === 'yes',
            mealsQuestion: !(clientData.snap === 'yes' || clientData.snap === 'notinterested'),
        };

        Object.entries(questionVisibility).forEach(([id, visible]) => {
            const el = document.getElementById(id);
            if (el) el.style.display = visible ? 'block' : 'none';
        });

        //         // Previous marital status visibility
        const prevMaritalContainer = document.getElementById('previousMaritalStatus')?.closest('.selection-box')
        || document.getElementById('previousMaritalStatus')?.parentNode;
    const hasHOH = clientData.householdMembers?.some(m => m.headOfHousehold);

    if (prevMaritalContainer) {
        // When adding a new member: if there's already a HOH, this new member won't be HOH, so hide it
        // If no HOH exists, this member will become HOH (first member), so show it
        prevMaritalContainer.style.display = hasHOH ? 'none' : 'block';
    }

        // Set up modal question click listeners
        setupModalQuestionListeners();

    } catch (error) {
        console.error('Error preparing modal:', error);
    }
}

function setupModalQuestionListeners() {
    MODAL_QUESTIONS.forEach(question => {
        question.elements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (!element) return;

            // Clone to remove old listeners
            const fresh = element.cloneNode(true);
            element.parentNode.replaceChild(fresh, element);

            fresh.addEventListener('click', async () => {
                // Toggle selection
                question.elements.forEach(id => document.getElementById(id)?.classList.remove('selected'));
                fresh.classList.add('selected');

                const value = fresh.getAttribute('data-value');

                // Deceased toggle — apply full visibility
                if (question.id === 'deceased') {
                    await applyDeceasedVisibilityInModal(value === 'yes');
                }

                // Citizen toggle
                if (question.id === 'citizen') {
                    const ncContainer = document.getElementById('nonCitizenStatusContainer');
                    const mealsQ = document.getElementById('mealsQuestion');
                    if (value === 'yes') {
                        if (ncContainer) ncContainer.style.display = 'none';
                        if (mealsQ) mealsQ.style.display = 'block';
                    } else {
                        if (ncContainer) ncContainer.style.display = 'block';
                    }
                }

                // Student toggle
                if (question.id === 'student') {
                    const ssContainer = document.getElementById('studentStatusContainer');
                    const mealsQ = document.getElementById('mealsQuestion');
                    if (value === 'yes') {
                        if (ssContainer) ssContainer.style.display = 'block';
                    } else {
                        if (ssContainer) ssContainer.style.display = 'none';
                        if (mealsQ) mealsQ.style.display = 'block';
                    }
                }
            });
        });
    });
}

// ══════════════════════════════════════════════════════════════
// ADD / EDIT / DELETE HOUSEHOLD MEMBERS
// ══════════════════════════════════════════════════════════════

function gatherModalData() {
    const dob = document.getElementById('dob').value;
    const dateOfDeath = document.getElementById('dateOfDeath')?.value || '';

    // Gather yes/no answers
    const answers = {};
    MODAL_QUESTIONS.forEach(q => {
        const container = document.getElementById(`${q.id}Question`);
        const visible = !container || container.style.display !== 'none';
        if (visible) {
            q.elements.forEach(id => {
                const el = document.getElementById(id);
                if (el?.classList.contains('selected')) {
                    answers[q.id] = el.getAttribute('data-value');
                }
            });
        } else {
            answers[q.id] = 'no';
        }
    });

    // Citizen question hidden means all citizens
    const citizenQ = document.getElementById('citizenQuestion');
    if (citizenQ?.style.display === 'none') {
        answers.citizen = 'yes';
    }

    // Derived statuses
    if (answers.citizen === 'yes') answers.nonCitizenStatus = 'citizen';
    if (answers.student === 'no') answers.studentStatus = 'notstudent';

    const nonCitizenStatus = document.getElementById('nonCitizenStatus').value;
    const studentStatus = document.getElementById('studentStatus').value;
    const age = calculateAge(dob, answers.deceased === 'yes' ? dateOfDeath : '');

    const data = {
        prefix: document.getElementById('prefix').value.trim(),
        firstName: document.getElementById('firstName').value.trim(),
        middleInitial: document.getElementById('middleInitial').value.trim(),
        lastName: document.getElementById('lastName').value.trim(),
        suffix: document.getElementById('suffix').value.trim(),
        dob,
        socialSecurityNumber: document.getElementById('socialSecurityNumber').value.trim(),
        legalSex: document.getElementById('legalSex').value,
        maritalStatus: document.getElementById('maritalStatus').value,
        previousMaritalStatus: document.getElementById('previousMaritalStatus').value,
        age: formatAge(age),
        nonCitizenStatus,
        studentStatus,
        ...answers,
        dateOfDeath: answers.deceased === 'yes' ? dateOfDeath : '',
    };

    // Ineligible non-citizen / student → meals = no
    if (nonCitizenStatus.toLowerCase() === 'ineligible non-citizen') data.meals = 'no';
    if (studentStatus.toLowerCase() === 'ineligible student') data.meals = 'no';

    return data;
}

async function addHouseholdMember() {
    const clientId = getQueryParam('id');
    if (!clientId) return;

    try {
        const clientData = await fetchClient(clientId);
        const isFirstMember = !clientData.householdMembers?.length;

        // Get program status from client level, defaulting to true (open) if not set
        const programStatus = clientData.programStatus || {};
        
        const modalData = gatherModalData();
        
        // PTRR should only be open for head of household
        const ptrrOpen = isFirstMember
            ? (programStatus.PTRR?.screeningInProgress ?? true)
            : false;

        const memberData = {
            householdMemberId: crypto.randomUUID(),
            ...modalData,
            headOfHousehold: isFirstMember,
            // Inherit residence status from client level
            residenceStatus: clientData.residenceStatus || '',
            // Initialize based on client-level program status
            SNAP: { screeningInProgress: programStatus.SNAP?.screeningInProgress ?? true },
            LIHEAP: { screeningInProgress: programStatus.LIHEAP?.screeningInProgress ?? true },
            PACE: { screeningInProgress: programStatus.PACE?.screeningInProgress ?? true },
            LIS: { screeningInProgress: programStatus.LIS?.screeningInProgress ?? true },
            MSP: { screeningInProgress: programStatus.MSP?.screeningInProgress ?? true },
            PTRR: { screeningInProgress: ptrrOpen },
        };

        const response = await fetch('/save-household-member', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, member: memberData }),
        });

        if (response.ok) {
            console.log('Household member added:', memberData);
            await loadSavedData();
            closeModal();
        } else {
            console.error('Failed to save household member.');
        }
    } catch (error) {
        console.error('Error adding household member:', error);
    }
}

async function updateHouseholdMember(memberId) {
    const clientId = getQueryParam('id');
    if (!clientId) return;

    try {
        const updatedData = {
            householdMemberId: memberId,
            ...gatherModalData(),
        };

        const { previousMaritalStatus, maritalStatus } = updatedData;

        // Clear previousSpouseId if previous marital status changed
        if (previousMaritalStatus !== 'Married (Living Together)') {
            updatedData.previousSpouseId = null;
        }

        // Fetch current client data to check head of household status
        const clientData = await fetchClient(clientId);
        const currentMember = clientData.householdMembers?.find(m => m.householdMemberId === memberId);

        // PTRR should only be open for head of household
        const isHeadOfHousehold = currentMember?.headOfHousehold === true;
        if (!isHeadOfHousehold) {
            updatedData.PTRR = { screeningInProgress: false };
        }

        // Clear spouse relationships if no longer married
        if (maritalStatus !== 'Married (Living Together)') {
            if (currentMember) {
                updatedData.relationships = null;
                const spouseId = currentMember.relationships?.spouse;
                if (spouseId) {
                    const spouse = clientData.householdMembers.find(m => m.householdMemberId === spouseId);
                    if (spouse) {
                        spouse.relationships = null;
                        await fetch('/update-household-member', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ clientId, member: spouse }),
                        });
                    }
                }
            }
        }

        const response = await fetch('/update-household-member', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, member: updatedData }),
        });

        if (response.ok) {
            console.log('Household member updated:', updatedData);
            await loadSavedData();
            closeModal();
        } else {
            console.error('Failed to update household member.');
        }
    } catch (error) {
        console.error('Error updating household member:', error);
    }
}

async function deleteHouseholdMember(memberId) {
    const clientId = getQueryParam('id');
    if (!clientId) return;
    if (!confirm('Are you sure you want to delete this household member? This action cannot be undone.')) return;

    try {
        const response = await fetch('/delete-household-member', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, memberId }),
        });

        if (response.ok) {
            console.log(`Household member ${memberId} deleted.`);
            await loadSavedData();
        } else {
            console.error('Failed to delete household member.');
        }
    } catch (error) {
        console.error('Error deleting household member:', error);
    }
}

function closeModal() {
    document.getElementById('householdMemberModal').style.display = 'none';
    document.getElementById('householdMemberForm').reset();
}

function setupAddOrUpdateButton(isEditing, member = null) {
    const btn = document.getElementById('add-member');
    btn.textContent = isEditing ? 'Save and Update' : 'Add Member';

    // Clone to remove old listeners
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);

    fresh.addEventListener('click', async (e) => {
        e.preventDefault();
        if (isEditing && member) {
            await updateHouseholdMember(member.householdMemberId);
        } else {
            await addHouseholdMember();
        }
    });
}

// ══════════════════════════════════════════════════════════════
// OPEN EDIT MODAL
// ══════════════════════════════════════════════════════════════

async function openEditModal(member) {
    setModalHeader('edit');
    await prepareHouseholdMemberModal();

    // Default deceased if missing
    if (member.deceased == null) member.deceased = 'no';

    // Autofill fields
    const fieldMap = {
        prefix: member.prefix, firstName: member.firstName,
        middleInitial: member.middleInitial, lastName: member.lastName,
        suffix: member.suffix, dob: member.dob,
        socialSecurityNumber: member.socialSecurityNumber,
        legalSex: member.legalSex, maritalStatus: member.maritalStatus,
        previousMaritalStatus: member.previousMaritalStatus,
        studentStatus: member.studentStatus, nonCitizenStatus: member.nonCitizenStatus,
    };

    Object.entries(fieldMap).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
    });

    // SSN read-only + Edit button for existing valid SSNs
    const ssnInput = document.getElementById('socialSecurityNumber');
    if (ssnInput.value && /^\d{3}-\d{2}-\d{4}$/.test(ssnInput.value)) {
        ssnInput.readOnly = true;
        document.getElementById('confirmSSNContainer').style.display = 'none';

        // Remove existing edit button if any
        document.getElementById('editSSNButton')?.remove();

        const editBtn = document.createElement('button');
        editBtn.id = 'editSSNButton';
        editBtn.textContent = 'Edit SSN';
        editBtn.type = 'button';
        editBtn.style.cssText = 'margin-top: 10px; padding: 10px 15px; cursor: pointer; border: 1px solid #000; border-radius: 5px; transition: background-color 0.3s ease, color 0.3s ease;';

        editBtn.addEventListener('mouseover', () => { editBtn.style.backgroundColor = '#0056b3'; editBtn.style.color = 'white'; });
        editBtn.addEventListener('mouseout', () => { editBtn.style.backgroundColor = ''; editBtn.style.color = ''; });
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            resetSSNFields();
            editBtn.style.display = 'none';
        });

        ssnInput.parentNode.insertBefore(editBtn, ssnInput.nextSibling);
    }

    // Date of Death
    const dodContainer = document.getElementById('dateOfDeathContainer');
    const dodInput = document.getElementById('dateOfDeath');
    if (member.deceased === 'yes') {
        if (dodContainer) dodContainer.style.display = 'block';
        if (dodInput) dodInput.value = member.dateOfDeath || '';
    } else {
        if (dodContainer) dodContainer.style.display = 'none';
        if (dodInput) dodInput.value = '';
    }

    // Highlight saved modal selections
    MODAL_QUESTIONS.forEach(q => {
        q.elements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('selected', el.getAttribute('data-value') === member[q.id]);
        });
    });

    // Apply deceased visibility
    const isDeceased = member.deceased === 'yes';
    applyDeceasedVisibilityInModal(isDeceased);

    // Re-apply client-level question visibility AFTER deceased visibility,
    // so that questions hidden based on client data stay hidden
    if (!isDeceased) {
        const clientId = getQueryParam('id');
        if (clientId) {
            try {
                const clientData = await fetchClient(clientId);
                if (clientData) {
                    const questionVisibility = {
                        disabilityQuestion: clientData.disability === 'yes',
                        medicareQuestion: clientData.medicare === 'yes',
                        medicaidQuestion: clientData.medicaid === 'yes',
                        citizenQuestion: clientData.citizen === 'no',
                        studentQuestion: clientData.student === 'yes',
                        mealsQuestion: !(clientData.snap === 'yes' || clientData.snap === 'notinterested'),
                    };

                    Object.entries(questionVisibility).forEach(([id, visible]) => {
                        const el = document.getElementById(id);
                        if (el && !visible) el.style.display = 'none';
                    });
                }
            } catch (error) {
                console.error('Error re-applying client-level visibility:', error);
            }
        }
    }

    // Conditional field visibility (only when not deceased)
    if (!isDeceased) {
        const ncContainer = document.getElementById('nonCitizenStatusContainer');
        const ssContainer = document.getElementById('studentStatusContainer');
        const mealsQ = document.getElementById('mealsQuestion');

        if (member.citizen === 'no') {
            ncContainer.style.display = 'block';
            if (member.nonCitizenStatus?.toLowerCase() === 'ineligible non-citizen') {
                mealsQ.style.display = 'none';
            }
        } else {
            ncContainer.style.display = 'none';
        }

        if (member.student === 'yes') {
            ssContainer.style.display = 'block';
            if (member.studentStatus?.toLowerCase() === 'ineligible student') {
                mealsQ.style.display = 'none';
            }
        } else {
            ssContainer.style.display = 'none';
        }
    }

    // Previous marital status visibility
    await applyPreviousMaritalVisibility(member);

    setupAddOrUpdateButton(true, member);
    document.getElementById('householdMemberModal').style.display = 'block';
}

async function applyDeceasedVisibilityInModal(isDeceased) {
    const toggleIds = [
        'disabilityQuestion', 'medicareQuestion', 'medicaidQuestion',
        'studentQuestion', 'mealsQuestion', 'citizenQuestion',
        'nonCitizenStatusContainer', 'studentStatusContainer',
    ];

    if (isDeceased) {
        // Hide everything when deceased
        toggleIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    } else {
        // Re-apply client-level question visibility instead of blindly showing all
        const clientId = getQueryParam('id');
        if (clientId) {
            try {
                const clientData = await fetchClient(clientId);
                if (clientData) {
                    const questionVisibility = {
                        disabilityQuestion: clientData.disability === 'yes',
                        medicareQuestion: clientData.medicare === 'yes',
                        medicaidQuestion: clientData.medicaid === 'yes',
                        citizenQuestion: clientData.citizen === 'no',
                        studentQuestion: clientData.student === 'yes',
                        mealsQuestion: !(clientData.snap === 'yes' || clientData.snap === 'notinterested'),
                    };

                    Object.entries(questionVisibility).forEach(([id, visible]) => {
                        const el = document.getElementById(id);
                        if (el) el.style.display = visible ? 'block' : 'none';
                    });

                    // Re-apply conditional sub-containers based on current modal selections
                    const citizenNo = document.getElementById('modal-citizen-no');
                    const studentYes = document.getElementById('modal-student-yes');

                    const ncContainer = document.getElementById('nonCitizenStatusContainer');
                    const ssContainer = document.getElementById('studentStatusContainer');

                    if (ncContainer) {
                        ncContainer.style.display = citizenNo?.classList.contains('selected') ? 'block' : 'none';
                    }
                    if (ssContainer) {
                        ssContainer.style.display = studentYes?.classList.contains('selected') ? 'block' : 'none';
                    }
                }
            } catch (error) {
                console.error('Error re-applying visibility after deceased toggle:', error);
            }
        }
    }

    // Marital status — hide when deceased, show when alive
    const maritalSelect = document.getElementById('maritalStatus');
    const maritalWrapper = maritalSelect ? maritalSelect.closest('.selection-box') : null;
    if (maritalWrapper) maritalWrapper.style.display = isDeceased ? 'none' : 'block';

    // Previous marital status — NOT affected by deceased toggle.
    // It's controlled solely by HOH status via applyPreviousMaritalVisibility / prepareHouseholdMemberModal.

    // Show/hide date of death
    const dodContainer = document.getElementById('dateOfDeathContainer');
    const dodInput = document.getElementById('dateOfDeath');
    if (dodContainer) dodContainer.style.display = isDeceased ? 'block' : 'none';
    if (!isDeceased && dodInput) dodInput.value = '';
}

async function applyPreviousMaritalVisibility(member) {
    const clientId = getQueryParam('id');
    if (!clientId) return;

    try {
        const clientData = await fetchClient(clientId);
        const container = document.getElementById('previousMaritalStatus')?.closest('.selection-box')
            || document.getElementById('previousMaritalStatus')?.parentNode;

        if (!container) return;

        if (member.headOfHousehold) {
            // Only show for head of household
            container.style.display = 'block';
        } else {
            // Hide for non-HOH members
            container.style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking previous marital visibility:', error);
    }
}

// ══════════════════════════════════════════════════════════════
// UPDATE ALL MEMBERS (BULK)
// ══════════════════════════════════════════════════════════════

async function updateAllMembers(questionId, value) {
    const clientId = getQueryParam('id');
    if (!clientId) return;

    try {
        const clientData = await fetchClient(clientId);
        if (!clientData?.householdMembers) return;

        const updatedMembers = clientData.householdMembers.map(member => {
            const updated = { ...member, [questionId]: value };
            if (questionId === 'residenceStatus' && value === 'other') {
                updated.previousMaritalStatus = 'N/A';
            }
            return updated;
        });

        const response = await fetch('/update-household-members', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, members: updatedMembers }),
        });

        if (response.ok) {
            console.log(`Updated all members: ${questionId} = ${value}`);
        } else {
            console.error(`Failed to update all members for ${questionId}:`, response.statusText);
        }
    } catch (error) {
        console.error(`Error updating all members for ${questionId}:`, error);
    }
}

// ══════════════════════════════════════════════════════════════
// LIHEAP SELECTION
// ══════════════════════════════════════════════════════════════

async function saveLiheapSelection(selection) {
    const clientId = getQueryParam('id');
    if (!clientId || !selection) return;

    try {
        const response = await fetch('/update-client', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, clientData: { liheapEnrollment: selection } }),
        });

        if (!response.ok) {
            console.error('Error saving LIHEAP selection:', await response.json());
            return;
        }

        console.log('LIHEAP selection saved:', selection);

        // Clear dependent fields in sequence WITHOUT triggering reloads
        if (selection === 'notinterested') {
            await saveClientField(clientId, 'heatingCrisis', null);
            await saveClientField(clientId, 'residenceStatusCurrent', null);
            await saveClientField(clientId, 'heatingCost', null);
            await saveClientField(clientId, 'subsidizedHousing', null);
        } else if (selection === 'yes') {
            const updatedClient = await fetchClient(clientId);
            if (updatedClient?.heatingCrisis === 'no') {
                await saveClientField(clientId, 'residenceStatusCurrent', null);
                await saveClientField(clientId, 'heatingCost', null);
                await saveClientField(clientId, 'subsidizedHousing', null);
            }
        }

        // Single reload at the end
        await loadSavedData();

    } catch (error) {
        console.error('Error saving LIHEAP selection:', error);
    }
}async function saveHeatingCrisisSelection(selection) {
    const clientId = getQueryParam('id');
    if (!clientId) return;

    try {
        const response = await fetch('/update-client', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, clientData: { heatingCrisis: selection } }),
        });

        if (!response.ok) {
            console.error('Error saving heating crisis:', await response.json());
            return;
        }

        const updatedClient = await fetchClient(clientId);

        if (updatedClient.liheapEnrollment === 'yes' && selection === 'no') {
            await saveClientField(clientId, 'subsidizedHousing', null);
            await saveClientField(clientId, 'heatingCost', null);
            await saveClientField(clientId, 'residenceStatusCurrent', null);
        }

        // Single reload at the end
        await loadSavedData();

    } catch (error) {
        console.error('Error saving heating crisis:', error);
    }
}

// ══════════════════════════════════════════════════════════════
// RESIDENCE / SUBSIDIZED / HEATING COST HANDLERS
// ══════════════════════════════════════════════════════════════

async function handleResidenceStatusClick(selectedValue) {
    const clientId = getQueryParam('id');
    if (!clientId) return;

    try {
        const response = await fetch('/update-client', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, clientData: { residenceStatusCurrent: selectedValue } }),
        });
        if (!response.ok) throw new Error('Failed to save residenceStatusCurrent');

        if (selectedValue === 'owned') {
            await saveClientField(clientId, 'subsidizedHousing', null);
            await saveClientField(clientId, 'heatingCost', null);
        }

        // Single reload at the end
        await loadSavedData();

    } catch (error) {
        console.error('Error saving residenceStatusCurrent:', error);
    }
}

// Refactored handleSubsidizedHousingClick
async function handleSubsidizedHousingClick(selectedValue) {
    const clientId = getQueryParam('id');
    if (!clientId) return;

    try {
        const response = await fetch('/update-client', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, clientData: { subsidizedHousing: selectedValue } }),
        });
        if (!response.ok) throw new Error('Failed to save subsidizedHousing');

        if (selectedValue === 'no') {
            await saveClientField(clientId, 'heatingCost', null);
        }

        // Single reload at the end
        await loadSavedData();

    } catch (error) {
        console.error('Error saving subsidizedHousing:', error);
    }
}

// HandleHeatingCostClick
async function handleHeatingCostClick(selectedValue) {
    const clientId = getQueryParam('id');
    if (!clientId) return;

    try {
        const response = await fetch('/update-client', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, clientData: { heatingCost: selectedValue } }),
        });
        if (!response.ok) throw new Error('Failed to save heatingCost');

        // Single reload at the end
        await loadSavedData();

    } catch (error) {
        console.error('Error saving heatingCost:', error);
    }
}

// Subsidized Housing Previous Year
async function handleSubsidizedHousingPreviousClick(selectedValue) {
    const clientId = getQueryParam('id');
    if (!clientId) return;

    try {
        const response = await fetch('/update-client', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, clientData: { subsidizedHousingPrevious: selectedValue } }),
        });
        if (!response.ok) throw new Error('Failed to save subsidizedHousingPrevious');

        await loadSavedData();

    } catch (error) {
        console.error('Error saving subsidizedHousingPrevious:', error);
    }
}

// ══════════════════════════════════════════════════════════════
// LIHEAP ELIGIBILITY CHECK ON LOAD
// ══════════════════════════════════════════════════════════════

async function handleLiheapEligibility(clientId) {
    try {
        const member = await fetchClient(clientId);
        const c = getContainerRefs();

        if (!member.LIHEAP?.eligibility?.includes('Already Enrolled')) {
            Object.values(c).forEach(el => { if (el) el.style.display = 'none'; });
            clearSelectionsForPrefix('residenceStatusCurrent', 'heatingCrisis');
        } else {
            c.residenceStatus.style.display = 'block';
            c.heatingCrisis.style.display = 'block';
        }
    } catch (error) {
        console.error('Error handling LIHEAP eligibility:', error);
    }
}

// ══════════════════════════════════════════════════════════════
// MAIN QUESTION CLICK HANDLER
// ══════════════════════════════════════════════════════════════

const SAVEABLE_QUESTIONS = [
    { id: 'disability', elements: ['disability-yes', 'disability-no'] },
    { id: 'medicare', elements: ['medicare-yes', 'medicare-no'] },
    { id: 'medicaid', elements: ['medicaid-yes', 'medicaid-no'] },
    { id: 'student', elements: ['student-yes', 'student-no'] },
    { id: 'snap', elements: ['snap-yes', 'snap-no', 'snap-notinterested'] },
    { id: 'residenceStatus', elements: ['residenceStatus-owned', 'residenceStatus-rented', 'residenceStatus-rentedowned', 'residenceStatus-other'] },
    { id: 'citizen', elements: ['citizen-yes', 'citizen-no'] },
];

async function handleMainQuestionClick(question, element) {
    const clientId = getQueryParam('id');
    if (!clientId) return;

    const value = element.getAttribute('data-value');
    highlightSelection(question.elements, element);

    // Save to backend
    try {
        const response = await fetch('/update-client', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, clientData: { [question.id]: value } }),
        });
        if (!response.ok) throw new Error(`Failed to save ${question.id}`);
    } catch (error) {
        console.error(`Error saving ${question.id}:`, error);
        return;
    }

    // Apply cascading logic
    if (['disability', 'medicare', 'medicaid'].includes(question.id) && value === 'no') {
        await updateAllMembers(question.id, 'no');
    } else if (question.id === 'student' && value === 'no') {
        await updateAllMembers('student', 'no');
        await updateAllMembers('studentStatus', 'notstudent');
    } else if (question.id === 'citizen' && value === 'yes') {
        await updateAllMembers('citizen', 'yes');
        await updateAllMembers('nonCitizenStatus', 'citizen');
    } else if (question.id === 'snap' && (value === 'yes' || value === 'notinterested')) {
        await updateAllMembers('meals', 'no');
    } else if (question.id === 'residenceStatus') {
        await updateAllMembers('residenceStatus', value);

        // Show/hide subsidized housing previous based on residence status
        const shPrevContainer = document.getElementById('subsidizedHousingPrevious-container');
        if (value === 'rented' || value === 'rentedowned') {
            if (shPrevContainer) shPrevContainer.style.display = 'block';
        } else {
            if (shPrevContainer) shPrevContainer.style.display = 'none';
            // Clear the saved value when hiding
            await saveClientField(clientId, 'subsidizedHousingPrevious', null);
        }
    }

    await loadSavedData();
}

// ══════════════════════════════════════════════════════════════
// NON-CITIZEN / STUDENT STATUS DROPDOWN HANDLERS
// ══════════════════════════════════════════════════════════════

function setupNonCitizenDropdown() {
    document.getElementById('nonCitizenStatus')?.addEventListener('change', function () {
        const mealsQ = document.getElementById('mealsQuestion');
        mealsQ.style.display = this.value.toLowerCase() === 'ineligible non-citizen' ? 'none' : 'block';
    });
}

function setupStudentDropdown() {
    document.getElementById('studentStatus')?.addEventListener('change', function () {
        const mealsQ = document.getElementById('mealsQuestion');
        mealsQ.style.display = this.value.toLowerCase() === 'ineligible student' ? 'none' : 'block';
    });
}

// ══════════════════════════════════════════════════════════════
// SINGLE DOMContentLoaded INITIALIZATION
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    const clientId = getQueryParam('id');

    // ── Ensure modal is hidden on page load ──
    const modal = document.getElementById('householdMemberModal');
    if (modal) modal.style.display = 'none';

    // ── Wire up main page question click handlers ──
    SAVEABLE_QUESTIONS.forEach(question => {
        question.elements.forEach(elementId => {
            const el = document.getElementById(elementId);
            if (el) {
                el.addEventListener('click', () => handleMainQuestionClick(question, el));
            }
        });
    });

    // ── Household size dropdown ──
    document.getElementById('household-size')?.addEventListener('change', async function () {
        if (this.value) {
            await saveSelectionToClient('householdSize', this.value);
            console.log(`Household size updated to: ${this.value}`);
        }
    });

    // ── Add Household Member button ──
    document.getElementById('add-household-member')?.addEventListener('click', async () => {
        if (!clientId) return;

        try {
            const clientData = await fetchClient(clientId);
            if (!clientData.householdSize || clientData.householdSize === 0) {
                alert('Household size is not set. Please select a valid household size before adding members.');
                return;
            }
            if (clientData.householdMembers.length >= clientData.householdSize) {
                alert('The number of household members cannot exceed the selected household size.');
                return;
            }

            setModalHeader('add');
            await prepareHouseholdMemberModal();
            setupAddOrUpdateButton(false);
            document.getElementById('householdMemberModal').style.display = 'block';
        } catch (error) {
            console.error('Error opening add modal:', error);
        }
    });

    // ── Close modal on outside click ──
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('householdMemberModal');
        if (e.target === modal) modal.style.display = 'none';
    });

    // ── Heating Crisis options ──
    document.querySelectorAll('#heatingCrisis-yes, #heatingCrisis-no').forEach(option => {
        option.addEventListener('click', async () => {
            const val = option.getAttribute('data-value');
            highlightByValue(document.querySelectorAll('#heatingCrisis-yes, #heatingCrisis-no'), val);
            await saveHeatingCrisisSelection(val);
        });
    });

    // ── LIHEAP options ──
    document.querySelectorAll('#liheap-yes, #liheap-no, #liheap-notinterested').forEach(option => {
        option.addEventListener('click', () => {
            const val = option.dataset.value;
            highlightByValue(document.querySelectorAll('#liheap-yes, #liheap-no, #liheap-notinterested'), val);
            saveLiheapSelection(val);
        });
    });

    // ── Residence Status Current options ──
    document.querySelectorAll('[id^="residenceStatusCurrent-"]').forEach(option => {
        if (!option.getAttribute('data-value')) return;
        option.addEventListener('click', async () => {
            const val = option.getAttribute('data-value');
            highlightSelection(
                ['residenceStatusCurrent-owned', 'residenceStatusCurrent-rented', 'residenceStatusCurrent-rentedowned', 'residenceStatusCurrent-other'],
                val
            );
            await handleResidenceStatusClick(val);
        });
    });

    // ── Subsidized Housing options ──
    document.querySelectorAll('[id^="subsidizedHousing-"]').forEach(option => {
        option.addEventListener('click', async () => {
            const val = option.getAttribute('data-value');
            if (!val) return;
            highlightSelection(['subsidizedHousing-yes', 'subsidizedHousing-no'], val);
            await handleSubsidizedHousingClick(val);
        });
    });

    // ── Heating Cost options ──
    document.querySelectorAll('[id^="heatingCost-"]').forEach(option => {
        option.addEventListener('click', async () => {
            const val = option.getAttribute('data-value');
            if (!val) return;
            highlightSelection(['heatingCost-yes', 'heatingCost-no'], val);
            await handleHeatingCostClick(val);
        });
    });

        // ── Subsidized Housing Previous options ──
        document.querySelectorAll('[id^="subsidizedHousingPrevious-"]').forEach(option => {
            option.addEventListener('click', async () => {
                const val = option.getAttribute('data-value');
                if (!val) return;
                highlightSelection(['subsidizedHousingPrevious-yes', 'subsidizedHousingPrevious-no'], val);
                await handleSubsidizedHousingPreviousClick(val);
            });
        });

    // ── Non-citizen / Student dropdowns ──
    setupNonCitizenDropdown();
    setupStudentDropdown();

    // ── LIHEAP eligibility on load ──
    if (clientId) {
        await handleLiheapEligibility(clientId);
    }

    // ── Load all saved data ──
    await loadSavedData();
});