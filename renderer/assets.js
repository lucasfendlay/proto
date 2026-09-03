// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════

const BACKEND_URL = window.location.origin || "http://localhost:3000";

const GROSS_INCOME_LIMITS = [
    0, 2510, 3408, 4304, 5200, 6098, 6994, 7890, 8788, 9686, 10584,
    11482, 12380, 13278, 14176, 15074
];

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
    return client?.householdMembers || [];
}

// ══════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════

function goToExpensesEdit() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `expensesedit.html?id=${clientId}`;
    } else {
        console.error('Client ID not found.');
    }
}

async function goToAssetView() {
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
        console.error("Error during goToAssetView:", error);
    } finally {
        window.location.href = `profileview.html?id=${clientId}`;
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
// ASSET HTML GENERATION
// ══════════════════════════════════════════════════════════════

function generateAssetItemHTML(asset, memberId) {
    const descriptionHTML = asset.description && asset.description.trim() 
        ? `<p><strong>Description:</strong> ${asset.description}</p>` 
        : '';

    return `
        <li class="list-item" data-asset-id="${asset.id}">
            <p><strong>Type:</strong> ${asset.type}</p>
            <p><strong>Value:</strong> $${asset.value}</p>
            ${descriptionHTML}

            <div class="button-container">
                <button class="button edit-asset-button" 
                    data-member-id="${memberId}" 
                    data-asset-id="${asset.id}"
                    style="background-color: #007bff; color: white; border: 1px solid #000000;">
                    Edit
                </button>
                <button class="button delete-asset-button" 
                    data-member-id="${memberId}" 
                    data-asset-id="${asset.id}"
                    style="background-color: red; color: white; border: 1px solid #000000;">
                    Delete
                </button>
            </div>
        </li>
    `;
}

function generateAssetListHTML(assets, memberId) {
    if (!assets || !Array.isArray(assets) || assets.length === 0) return '';
    return assets.map(asset => generateAssetItemHTML(asset, memberId)).join('');
}

// ══════════════════════════════════════════════════════════════
// ASSET BUTTON VISIBILITY LOGIC
// ══════════════════════════════════════════════════════════════

function shouldShowAddAssetButton(member, members) {
    if (member.deceased === 'yes') return false;
    const hasActiveScreening =
        member.LIS?.screeningInProgress === true ||
        member.MSP?.screeningInProgress === true ||
        member.SNAP?.screeningInProgress === true ||
        (member.currentSpouseId && members.some(spouse =>
            spouse.householdMemberId === member.currentSpouseId &&
            (spouse.LIS?.screeningInProgress === true || spouse.MSP?.screeningInProgress === true)
        ));

    if (!hasActiveScreening) return false;

    const combinedMonthlyIncome = member.SNAP?.combinedMonthlyIncome;
    const householdSize = member.SNAP?.householdSize;

    // Check various conditions for showing the button
    if (member.LIS?.screeningInProgress || member.MSP?.screeningInProgress) return true;

    // SNAP with meals condition
    if (member.SNAP?.screeningInProgress && member.meals?.toLowerCase() === 'yes' &&
        combinedMonthlyIncome !== undefined && parseFloat(combinedMonthlyIncome) <= 150) {
        return true;
    }

    // SNAP with elderly/disabled and over gross income limit
    if (member.SNAP?.screeningInProgress &&
        (parseInt(member.age) >= 60 || member.disability === 'yes') &&
        householdSize !== undefined &&
        combinedMonthlyIncome > GROSS_INCOME_LIMITS[householdSize]) {
        return true;
    }

    // Spouse screening
    if (member.currentSpouseId) {
        const spouse = members.find(m => m.householdMemberId === member.currentSpouseId);
        if (spouse?.LIS?.screeningInProgress || spouse?.MSP?.screeningInProgress) {
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
    container.style.textAlign = 'center';
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

        const assetListHTML = generateAssetListHTML(member.assets, member.householdMemberId);
        const hasAssets = member.assets && Array.isArray(member.assets) && member.assets.length > 0;
        const isDeceased = (member.deceased ?? '').toLowerCase() === 'yes';

        memberDiv.innerHTML = `
            <h3>${member.firstName.toUpperCase()} ${member.middleInitial.toUpperCase() || ''} ${member.lastName.toUpperCase()}${isDeceased ? ' <br><br><span style="color:rgb(0, 0, 0); font-size: 14px; border: 1px solid #000000; padding: 2px 6px; margin-left: 8px; border-radius: 4px;">DECEASED</span>' : ''}</h3>
            <p><strong>Date of Birth:</strong> ${member.dob || 'N/A'}</p>
            <div class="asset-list">
                ${hasAssets 
                    ? `<h4>Assets:</h4><ul id="asset-list-${member.householdMemberId}">${assetListHTML}</ul>` 
                    : '<p class="no-asset-message">No asset records available.</p>'}
            </div>
        `;

        if (shouldShowAddAssetButton(member, members)) {
            const addBtn = document.createElement('button');
            addBtn.className = 'add-asset-button';
            addBtn.dataset.memberId = member.householdMemberId;
            addBtn.textContent = 'Add Asset';
            memberDiv.appendChild(addBtn);
        }

        container.appendChild(memberDiv);
    });
}

// ══════════════════════════════════════════════════════════════
// ASSET CRUD OPERATIONS
// ══════════════════════════════════════════════════════════════

async function saveAsset(memberId, asset) {
    const clientId = getQueryParameter('id');

    try {
        const response = await fetch(`${BACKEND_URL}/add-asset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, memberId, asset })
        });

        if (!response.ok) throw new Error('Failed to save asset.');

        invalidateCache();
        await refreshAfterAssetChange();
        return true;
    } catch (error) {
        console.error('Error saving asset:', error);
        return false;
    }
}

async function updateAsset(memberId, assetId, updatedAsset) {
    try {
        const response = await fetch(`${BACKEND_URL}/update-asset`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberId, assetId, updatedAsset })
        });

        if (!response.ok) throw new Error('Failed to update asset.');

        invalidateCache();
        await refreshAfterAssetChange();
        return true;
    } catch (error) {
        console.error('Error updating asset:', error);
        return false;
    }
}

async function deleteAsset(memberId, assetId) {
    try {
        const response = await fetch(`${BACKEND_URL}/delete-asset`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberId, assetId })
        });

        if (!response.ok) throw new Error('Failed to delete asset.');

        invalidateCache();
        await refreshAfterAssetChange();
        return true;
    } catch (error) {
        console.error('Error deleting asset:', error);
        return false;
    }
}

async function fetchAssetDetails(memberId, assetId) {
    try {
        const response = await fetch(`${BACKEND_URL}/get-asset/${memberId}/${assetId}`);
        if (!response.ok) throw new Error('Failed to fetch asset details.');
        return await response.json();
    } catch (error) {
        console.error('Error fetching asset details:', error);
        return null;
    }
}

// ══════════════════════════════════════════════════════════════
// REFRESH AFTER ASSET CHANGE
// ══════════════════════════════════════════════════════════════

async function refreshAfterAssetChange() {
    const members = await loadHouseholdMembers();
    await runAllEligibilityChecks(members);
    await displayHouseholdMembers();
}

// ══════════════════════════════════════════════════════════════
// MODAL MANAGEMENT
// ══════════════════════════════════════════════════════════════

let modalState = {
    currentMemberId: null,
    isEditing: false,
    editingAssetId: null
};

function getModalElements() {
    return {
        modal: document.getElementById('asset-modal'),
        modalTitle: document.getElementById('modal-title'),
        closeModalBtn: document.getElementById('close-modal'),
        addAssetBtn: document.getElementById('add-asset-button'),
        assetForm: document.getElementById('asset-form'),
        assetType: document.getElementById('asset-type'),
        assetDescription: document.getElementById('asset-description'),
        assetValue: document.getElementById('asset-value')
    };
}

function resetModal() {
    const { modal, assetForm, addAssetBtn } = getModalElements();

    assetForm.reset();
    modalState = {
        currentMemberId: null,
        isEditing: false,
        editingAssetId: null
    };
    addAssetBtn.textContent = 'Add Asset';
    modal.classList.remove('show');
    modal.classList.add('hidden');
}

function showModal() {
    const { modal } = getModalElements();
    modal.classList.remove('hidden');
    modal.classList.add('show');
}

function openAddAssetModal(memberId) {
    const { modalTitle } = getModalElements();

    resetModal();
    modalState.currentMemberId = memberId;

    modalTitle.textContent = 'Add Asset';
    showModal();
}

async function openEditAssetModal(memberId, assetId) {
    const { modalTitle, addAssetBtn, assetType, assetDescription, assetValue } = getModalElements();

    const asset = await fetchAssetDetails(memberId, assetId);
    if (!asset) {
        alert('Failed to fetch asset details.');
        return;
    }

    assetType.value = asset.type;
    assetDescription.value = asset.description;
    assetValue.value = asset.value;

    modalState.currentMemberId = memberId;
    modalState.editingAssetId = assetId;
    modalState.isEditing = true;

    modalTitle.textContent = 'Edit Asset';
    addAssetBtn.textContent = 'Save and Update';
    showModal();
}

async function handleAssetSubmit() {
    const { assetType, assetDescription, assetValue } = getModalElements();

    const asset = {
        id: modalState.isEditing ? modalState.editingAssetId : crypto.randomUUID(),
        type: assetType.value,
        description: assetDescription.value,
        value: parseFloat(assetValue.value)
    };

    if (!modalState.currentMemberId || !asset.type || isNaN(asset.value)) {
        alert('Please fill out all required fields.');
        return;
    }

    let success;
    if (modalState.isEditing) {
        success = await updateAsset(modalState.currentMemberId, modalState.editingAssetId, asset);
    } else {
        success = await saveAsset(modalState.currentMemberId, asset);
    }

    if (success) {
        resetModal();
    } else {
        alert('Failed to save asset. Please try again.');
    }
}

async function handleDeleteAsset(memberId, assetId) {
    if (!memberId || memberId === "null" || !assetId) {
        alert('Missing or invalid asset or member ID.');
        return;
    }

    if (!confirm('Are you sure you want to delete this asset entry?')) return;

    const success = await deleteAsset(memberId, assetId);
    if (!success) {
        alert('Failed to delete asset. Please try again.');
    }
}

// ══════════════════════════════════════════════════════════════
// EVENT HANDLER SETUP
// ══════════════════════════════════════════════════════════════

function setupModalEventListeners() {
    const { modal, closeModalBtn, addAssetBtn } = getModalElements();
    const container = document.getElementById('household-member-container');

    // Close modal button
    closeModalBtn.addEventListener('click', resetModal);

    // Click outside modal to close
    document.addEventListener('click', e => {
        const isVisible = !modal.classList.contains('hidden');
        const modalContent = modal.querySelector('.modal-content');

        if (isVisible &&
            !modalContent.contains(e.target) &&
            !e.target.closest('.add-asset-button') &&
            !e.target.closest('.edit-asset-button')) {
            resetModal();
        }
    });

    // Event delegation for container clicks
    container.addEventListener('click', async e => {
        const target = e.target;

        if (target.classList.contains('add-asset-button')) {
            openAddAssetModal(target.dataset.memberId);
        }

        if (target.classList.contains('edit-asset-button')) {
            await openEditAssetModal(target.dataset.memberId, target.dataset.assetId);
        }

        if (target.classList.contains('delete-asset-button')) {
            await handleDeleteAsset(target.dataset.memberId, target.dataset.assetId);
        }
    });

    // Submit asset button
    addAssetBtn.addEventListener('click', handleAssetSubmit);
}

function setupNavigationHandlers() {
    document.getElementById('save-exit')?.addEventListener('click', goToAssetView);
    document.getElementById('save-continue')?.addEventListener('click', goToExpensesEdit);
}

// ══════════════════════════════════════════════════════════════
// GLOBAL EXPORTS
// ══════════════════════════════════════════════════════════════

window.refreshAssetDisplay = displayHouseholdMembers;
window.invalidateAssetCache = invalidateCache;

// ══════════════════════════════════════════════════════════════
// SINGLE DOMContentLoaded INITIALIZATION
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    // Setup all event listeners
    setupModalEventListeners();
    setupNavigationHandlers();

    // Load initial data
    await Promise.all([
        displayHouseholdMembers(),
        toggleSidebarVisibility()
    ]);
});