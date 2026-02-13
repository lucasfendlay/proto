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
        window.location.href = `assetsview.html?id=${clientId}`;
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
            ${descriptionHTML}
            <p><strong>Value:</strong> $${asset.value}</p>
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
    const hasActiveScreening =
        member.LIS?.screeningInProgress === true ||
        member.MSP?.screeningInProgress === true ||
        member.SNAP?.screeningInProgress === true ||
        member.LIHEAP?.screeningInProgress === true ||
        (member.currentSpouseId && members.some(spouse =>
            spouse.householdMemberId === member.currentSpouseId &&
            (spouse.LIS?.screeningInProgress === true || spouse.MSP?.screeningInProgress === true)
        ));

    if (!hasActiveScreening) return false;

    const combinedMonthlyIncome = member.SNAP?.combinedMonthlyIncome;
    const householdSize = member.SNAP?.householdSize;

    // Check various conditions for showing the button
    if (member.LIS?.screeningInProgress || member.MSP?.screeningInProgress) return true;
    if (member.LIHEAP?.screeningInProgress) return true;

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
        if (!member.assets || !Array.isArray(member.assets) || member.assets.length === 0) return;        
        const memberDiv = document.createElement('div');
        memberDiv.classList.add('household-member1-box');
        memberDiv.dataset.memberId = member.householdMemberId;

        const assetListHTML = generateAssetListHTML(member.assets, member.householdMemberId);

        memberDiv.innerHTML = `
            <h3>${member.firstName} ${member.middleInitial || ''} ${member.lastName}</h3>
            <p><strong>Date of Birth:</strong> ${member.dob || 'N/A'}</p>
            <div class="asset-list">
                <h4>Assets:</h4>
                <ul id="asset-list-${member.householdMemberId}">${assetListHTML}</ul>
            </div>
        `;

        container.appendChild(memberDiv);
    });

    // Show message if no assets exist for anyone
    if (container.children.length === 0) {
        container.innerHTML = '<p>No assets recorded for any household members.</p>';
    }
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
    modal.classList.add('hidden');
}

function showModal() {
    const { modal } = getModalElements();
    modal.classList.remove('hidden');
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