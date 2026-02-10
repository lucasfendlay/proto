// ══════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════

function getQueryParam(param) {
    return new URLSearchParams(window.location.search).get(param);
}

function parseAge(ageString) {
    if (!ageString) return 0;
    const yearsMatch = ageString.match(/(\d+)\s*Years/i);
    return yearsMatch ? parseInt(yearsMatch[1], 10) : 0;
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

async function updateHouseholdMember(clientId, memberId, updatedData) {
    const response = await fetch(`/update-household-member`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            clientId,
            member: { householdMemberId: memberId, ...updatedData }
        }),
    });
    
    if (!response.ok) {
        throw new Error(`Failed to update household member: ${response.statusText}`);
    }
    
    return response.json();
}

async function saveRelationshipToServer(clientId, memberId, relatedMemberId, relationship) {
    const response = await fetch(`/update-relationship`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, memberId, relatedMemberId, relationship }),
    });
    
    if (!response.ok) {
        throw new Error(`Failed to save relationship: ${response.statusText}`);
    }
    
    return response.json();
}

async function setCheckedOutStatus(clientId, status) {
    const response = await fetch('/update-client', {
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
        }),
    });

    if (!response.ok) {
        console.error(`Failed to update checkedOut status: ${response.statusText}`);
    }
}

async function addNoteToClient(clientId, noteText) {
    const response = await fetch(`/add-note-to-client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            clientId, 
            note: {
                text: noteText,
                timestamp: new Date().toLocaleString(),
                username: sessionStorage.getItem('loggedInUser') || 'Unknown'
            }
        }),
    });
    
    if (!response.ok) {
        throw new Error(`Failed to add note: ${response.statusText}`);
    }
}

// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════

const RECIPROCAL_RELATIONSHIPS = {
    'spouse': 'spouse',
    'parent': 'child',
    'child': 'parent',
    'sibling': 'sibling',
    'grandparent': 'grandchild',
    'grandchild': 'grandparent',
    'aunt/uncle': 'niece/nephew',
    'niece/nephew': 'aunt/uncle',
    'cousin': 'cousin',
    'unrelated': 'unrelated',
    'adopted child': 'adoptive parent',
    'adoptive parent': 'adopted child',
    'foster child': 'foster parent',
    'foster parent': 'foster child',
    'step-child': 'step-parent',
    'step-parent': 'step-child',
    'guardian': 'ward',
    'ward': 'guardian',
    'step-sibling': 'step-sibling',
    'half-sibling': 'half-sibling',
    'other': 'other'
};

const RELATIONSHIP_OPTIONS = [
    { value: '', label: 'Select Relationship' },
    { value: 'spouse', label: 'Spouse' },
    { value: 'parent', label: 'Parent' },
    { value: 'child', label: 'Child' },
    { value: 'sibling', label: 'Sibling' },
    { value: 'half-sibling', label: 'Half-Sibling' },
    { value: 'grandparent', label: 'Grandparent' },
    { value: 'grandchild', label: 'Grandchild' },
    { value: 'step-parent', label: 'Step-Parent' },
    { value: 'step-child', label: 'Step-Child' },
    { value: 'step-sibling', label: 'Step-Sibling' },
    { value: 'aunt/uncle', label: 'Aunt/Uncle' },
    { value: 'niece/nephew', label: 'Niece/Nephew' },
    { value: 'cousin', label: 'Cousin' },
    { value: 'adoptive parent', label: 'Adoptive Parent' },
    { value: 'adopted child', label: 'Adopted Child' },
    { value: 'foster parent', label: 'Foster Parent' },
    { value: 'foster child', label: 'Foster Child' },
    { value: 'guardian', label: 'Guardian' },
    { value: 'ward', label: 'Ward' },
    { value: 'other', label: 'Other Relationship' },
    { value: 'unrelated', label: 'Unrelated' },
];

// Relationships that auto-set meals=yes based on age
const MEALS_RELATIONSHIP_RULES = [
    { relationships: ['spouse'], maxAge: Infinity },
    { relationships: ['parent', 'child', 'step-parent', 'step-child', 'adoptive parent', 'adopted child'], maxAge: 22 },
    { relationships: ['guardian', 'ward'], maxAge: 18 },
];

// ══════════════════════════════════════════════════════════════
// ELIGIBILITY CHECKS
// ══════════════════════════════════════════════════════════════

async function runAllEligibilityChecks() {
    if (!window.eligibilityChecks) {
        console.warn('Eligibility checks not loaded');
        return;
    }

    const members = getHouseholdMembers();

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

    if (typeof window.eligibilityChecks.refreshAllDisplays === 'function') {
        await window.eligibilityChecks.refreshAllDisplays();
    }
}

// ══════════════════════════════════════════════════════════════
// MEALS AUTO-UPDATE LOGIC
// ══════════════════════════════════════════════════════════════

function shouldAutoSetMeals(member, relatedMember, relationship) {
    // Skip if related member is ineligible
    if (relatedMember.nonCitizenStatus === 'Ineligible Non-Citizen' ||
        relatedMember.studentStatus === 'Ineligible Student') {
        return false;
    }

    // Check if member has meals=yes (to propagate)
    if (member.meals !== 'yes') {
        return false;
    }

    const relatedAge = parseAge(relatedMember.age);

    for (const rule of MEALS_RELATIONSHIP_RULES) {
        if (rule.relationships.includes(relationship) && relatedAge < rule.maxAge) {
            return true;
        }
    }

    return false;
}

// ══════════════════════════════════════════════════════════════
// RELATIONSHIP HANDLERS
// ══════════════════════════════════════════════════════════════

async function handleRelationshipChange(clientId, memberId, relatedMemberId, relationship) {
    try {
        // Save the primary relationship
        await saveRelationshipToServer(clientId, memberId, relatedMemberId, relationship);

        // Update local cache
        const members = getHouseholdMembers();
        const member = members.find(m => m.householdMemberId === memberId);
        const relatedMember = members.find(m => m.householdMemberId === relatedMemberId);

        if (member && relatedMember) {
            // Update member's relationships in cache
            if (!member.relationships) member.relationships = [];
            const existingRel = member.relationships.find(r => r.relatedMemberId === relatedMemberId);
            if (existingRel) {
                existingRel.relationship = relationship;
            } else {
                member.relationships.push({ relatedMemberId, relationship });
            }

            // Auto-set meals if applicable
            if (shouldAutoSetMeals(member, relatedMember, relationship)) {
                await updateHouseholdMember(clientId, relatedMemberId, { meals: 'yes' });
                relatedMember.meals = 'yes';
                console.log(`Updated meals for ${relatedMemberId} via ${relationship}`);
            }
        }

        // Save reciprocal relationship
        const reciprocal = RECIPROCAL_RELATIONSHIPS[relationship];
        if (reciprocal) {
            await saveRelationshipToServer(clientId, relatedMemberId, memberId, reciprocal);

            // Update reciprocal dropdown in UI
            const reciprocalDropdown = document.querySelector(
                `.relationship-dropdown[data-member-id="${relatedMemberId}"][data-related-member-id="${memberId}"]`
            );
            if (reciprocalDropdown && reciprocalDropdown.value !== reciprocal) {
                reciprocalDropdown.value = reciprocal;
            }

            // Update cache for reciprocal
            if (relatedMember) {
                if (!relatedMember.relationships) relatedMember.relationships = [];
                const existingRecip = relatedMember.relationships.find(r => r.relatedMemberId === memberId);
                if (existingRecip) {
                    existingRecip.relationship = reciprocal;
                } else {
                    relatedMember.relationships.push({ relatedMemberId: memberId, relationship: reciprocal });
                }
            }
        }

        // Run eligibility checks once after all updates
        await runAllEligibilityChecks();

        console.log(`Relationship saved: ${memberId} -> ${relatedMemberId}: ${relationship}`);
    } catch (error) {
        console.error('Error saving relationship:', error);
    }
}

async function handlePreviousSpouseChange(clientId, memberId, previousSpouseId) {
    try {
        // Update both members' previousSpouseId
        await updateHouseholdMember(clientId, memberId, { previousSpouseId });
        await updateHouseholdMember(clientId, previousSpouseId, { previousSpouseId: memberId });

        // Update local cache
        const members = getHouseholdMembers();
        const member = members.find(m => m.householdMemberId === memberId);
        const spouse = members.find(m => m.householdMemberId === previousSpouseId);
        
        if (member) member.previousSpouseId = previousSpouseId;
        if (spouse) spouse.previousSpouseId = memberId;

        // Update both dropdowns in UI
        updateSpouseDropdowns(memberId, previousSpouseId);

        // Run eligibility checks
        await runAllEligibilityChecks();

        console.log(`Previous spouse saved: ${memberId} <-> ${previousSpouseId}`);
    } catch (error) {
        console.error('Error saving previousSpouseId:', error);
    }
}

function updateSpouseDropdowns(memberId, previousSpouseId) {
    const memberDropdown = document.getElementById(`spouse-dropdown-${memberId}`);
    const spouseDropdown = document.getElementById(`spouse-dropdown-${previousSpouseId}`);

    if (memberDropdown) memberDropdown.value = previousSpouseId;
    if (spouseDropdown) spouseDropdown.value = memberId;
}

// ══════════════════════════════════════════════════════════════
// RENDER FUNCTIONS
// ══════════════════════════════════════════════════════════════

function buildRelationshipDropdownHTML(memberId, relatedMemberId) {
    const options = RELATIONSHIP_OPTIONS.map(opt => 
        `<option value="${opt.value}">${opt.label}</option>`
    ).join('');

    return `
        <select class="relationship-dropdown" 
                data-member-id="${memberId}" 
                data-related-member-id="${relatedMemberId}">
            ${options}
        </select>
    `;
}

function buildSpouseDropdownHTML(member, allMembers) {
    const otherMembers = allMembers.filter(m => m.householdMemberId !== member.householdMemberId);
    const options = otherMembers.map(m => 
        `<option value="${m.householdMemberId}">${m.firstName} ${m.middleInitial || ''} ${m.lastName}</option>`
    ).join('');

    return `
        <div class="spouse-dropdown-container">
            <label for="spouse-dropdown-${member.householdMemberId}">
                <strong>Select Previous Year Spouse:</strong>
            </label>
            <select id="spouse-dropdown-${member.householdMemberId}" class="spouse-dropdown">
                <option value="">Select a household member</option>
                ${options}
            </select>
        </div>
    `;
}

function buildMemberHTML(member, allMembers) {
    const otherMembers = allMembers.filter(m => m.householdMemberId !== member.householdMemberId);
    
    const relationshipsHTML = otherMembers.map(other => `
        <div class="relationship-entry">
            <p><strong>${other.firstName} ${other.middleInitial || ''} ${other.lastName}</strong></p>
            ${buildRelationshipDropdownHTML(member.householdMemberId, other.householdMemberId)}
        </div>
    `).join('');

    const showSpouseDropdown = member.previousMaritalStatus === 'Married (Living Together)';

    return `
        <p><strong>Name:</strong> ${member.firstName} ${member.middleInitial || ''} ${member.lastName}</p>
        <p><strong>Date of Birth:</strong> ${member.dob}</p>
        <p><strong>Marital Status:</strong><br>${member.maritalStatus || 'N/A'}</p>
        ${showSpouseDropdown ? buildSpouseDropdownHTML(member, allMembers) : ''}
        <div class="relationships-container">
            <p><strong>Relationships:</strong></p>
            ${relationshipsHTML}
        </div>
    `;
}

function renderHouseholdMembers(clientId, members) {
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

    // Wire up event listeners
    wireRelationshipDropdowns(clientId, members);
    wireSpouseDropdowns(clientId);

    // Show action buttons
    document.getElementById('actionButtons').style.display = 'block';
}

function wireRelationshipDropdowns(clientId, members) {
    document.querySelectorAll('.relationship-dropdown').forEach(dropdown => {
        const memberId = dropdown.dataset.memberId;
        const relatedMemberId = dropdown.dataset.relatedMemberId;

        // Prepopulate saved value
        const member = members.find(m => m.householdMemberId === memberId);
        const savedRelationship = member?.relationships?.find(r => r.relatedMemberId === relatedMemberId)?.relationship;
        if (savedRelationship) {
            dropdown.value = savedRelationship;
        }

        // Add change listener
        dropdown.addEventListener('change', async function() {
            await handleRelationshipChange(clientId, memberId, relatedMemberId, this.value);
        });
    });
}

function wireSpouseDropdowns(clientId) {
    document.querySelectorAll('.spouse-dropdown').forEach(dropdown => {
        const memberId = dropdown.id.replace('spouse-dropdown-', '');
        const members = getHouseholdMembers();
        const member = members.find(m => m.householdMemberId === memberId);

        // Prepopulate saved value
        if (member?.previousSpouseId) {
            dropdown.value = member.previousSpouseId;
        }

        // Add change listener
        dropdown.addEventListener('change', async function() {
            if (this.value) {
                await handlePreviousSpouseChange(clientId, memberId, this.value);
            }
        });
    });
}

// ══════════════════════════════════════════════════════════════
// SIDEBAR VISIBILITY
// ══════════════════════════════════════════════════════════════

function applySidebarVisibility(clientData) {
    const sidebarContainer = document.getElementById('leftSidebarContainer');
    const snapContainer = document.getElementById('snap-household-container');
    const liheapContainer = document.getElementById('liheap-household-container');
    const householdContainer = document.getElementById('household-members-container');

    if (!sidebarContainer) return;

    sidebarContainer.style.display = 'block';

    const showBenefits = clientData?.screeningInProgress;
    
    if (snapContainer) snapContainer.style.display = showBenefits ? '' : 'none';
    if (liheapContainer) liheapContainer.style.display = showBenefits ? '' : 'none';
    if (householdContainer) householdContainer.style.display = showBenefits ? '' : 'none';
}

// ══════════════════════════════════════════════════════════════
// NAVIGATION HANDLERS
// ══════════════════════════════════════════════════════════════

function goToCurrentEnrollmentsEdit() {
    const clientId = getQueryParam('id');
    if (clientId) {
        window.location.href = `currentenrollmentsedit.html?id=${clientId}`;
    } else {
        console.error('Client ID not found.');
    }
}

async function saveAndReleaseProfile() {
    const clientId = getQueryParam('id');
    if (!clientId) {
        console.error('Client ID not found.');
        return;
    }

    if (!confirm("Are you sure you want to save and release this profile?")) {
        return;
    }

    const activeUser = sessionStorage.getItem('loggedInUser');
    if (!activeUser) {
        console.error("No active user found.");
        return;
    }

    try {
        await setCheckedOutStatus(clientId, false);
        await addNoteToClient(clientId, "Profile released.");
        window.location.href = `relationshipsview.html?id=${clientId}`;
    } catch (error) {
        console.error("Error releasing profile:", error);
    }
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

        // Apply sidebar visibility
        applySidebarVisibility(clientData);

        // Render household members with relationships
        const members = clientData.householdMembers || [];
        renderHouseholdMembers(clientId, members);

        // Run initial eligibility checks
        await runAllEligibilityChecks();

    } catch (error) {
        console.error('Error loading page data:', error);
    }
}

// ══════════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    await loadPageData();

    // Wire up action buttons
    document.getElementById('save-exit')?.addEventListener('click', saveAndReleaseProfile);
    document.getElementById('save-continue')?.addEventListener('click', goToCurrentEnrollmentsEdit);
});