document.addEventListener('DOMContentLoaded', async function () {
    const clientId = getQueryParameter('id'); // Get the client ID from the query parameter
    const modal = document.getElementById('asset-modal');
    const modalTitle = document.getElementById('modal-title');
    const closeModal = document.getElementById('close-modal');
    const addAssetButton = document.getElementById('add-asset-button');
    const assetForm = document.getElementById('asset-form');
    let currentMemberId = null;
    let isEditing = false;
    let editingAssetId = null;

    // Load household members
    async function loadHouseholdMembers() {
        try {
            const response = await fetch(`/get-client/${clientId}`);
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
    // Save asset to the database
async function saveAsset(memberId, asset) {
    try {
        const response = await fetch(`/add-asset`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                clientId,
                memberId,
                asset
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to save asset: ${response.statusText}`);
        }

        console.log(`Asset saved for member ${memberId}:`, asset);
    } catch (error) {
        console.error('Error saving asset:', error);
    }

    // Run eligibility checks and update the UI
    const members = await loadHouseholdMembers();
    await window.eligibilityChecks.PACEEligibilityCheck(members);
    await window.eligibilityChecks.LISEligibilityCheck(members);
    await window.eligibilityChecks.MSPEligibilityCheck(members);
    await window.eligibilityChecks.PTRREligibilityCheck(members);
    await window.eligibilityChecks.SNAPEligibilityCheck(members);

    console.log('Eligibility Checks:', window.eligibilityChecks);

    // Update the UI
    await window.eligibilityChecks.updateAndDisplayHouseholdMembers();
    await window.eligibilityChecks.displaySNAPHouseholds();
}

async function displayHouseholdMembers() {
    const householdMemberContainer = document.getElementById('household-member-container');

    householdMemberContainer.align = 'center'; // Center the container
    householdMemberContainer.style.minWidth = '925px'; // Ensure minimum width
    householdMemberContainer.style.maxWidth = '925px'; // Adjust the width as needed
    householdMemberContainer.style.margin = '0 auto'; // Center the container

    const members = await loadHouseholdMembers();

    householdMemberContainer.innerHTML = ''; // Clear existing content

    if (members.length === 0) {
        const noMembersMessage = document.createElement('p');
        noMembersMessage.textContent = 'No household members found.';
        householdMemberContainer.appendChild(noMembersMessage);
    } else {
        // Sort members to show headOfHousehold: true first
        members.sort((a, b) => {
            if (a.headOfHousehold === b.headOfHousehold) return 0;
            return a.headOfHousehold ? -1 : 1;
        });

        members.forEach(member => {
            const memberDiv = document.createElement('div');
            memberDiv.classList.add('household-member1-box'); // Add a class for styling
    
                // Populate member details
                memberDiv.innerHTML = `
                    <h3>${member.firstName} ${member.middleInitial || ''} ${member.lastName}</h3>
                    <p><strong>Date of Birth:</strong> ${member.dob || 'N/A'}</p>
                    <div class="asset-list">
                        <h4>Assets:</h4>
                        <ul id="asset-list-${member.householdMemberId}">
                            ${
                                member.assets && Array.isArray(member.assets)
    ? member.assets.map(asset => `
        <li class="list-item" data-asset-id="${asset.id}">
            <p><strong>Type:</strong> ${asset.type}</p>
            <p><strong>Description:</strong> ${asset.description}</p>
            <p><strong>Value:</strong> $${asset.value}</p>
                    </li>
    `).join('')
                                    : ''
                            }
                        </ul>
                    </div>
                `;
    
                // Check if "LIS" or "MSP" is "no" in the selections object
                const selections = member.selections || {};
                // Log the entire SNAP object for debugging
console.log(`Member ID: ${member.householdMemberId}, SNAP Object:`, member.SNAP);

// Extract combinedMonthlyIncome directly from the SNAP object
const combinedMonthlyIncome = member.SNAP?.combinedMonthlyIncome;

// Log the extracted combinedMonthlyIncome for debugging
console.log(`Member ID: ${member.householdMemberId}, Combined Monthly Income: ${combinedMonthlyIncome}`);

const grossIncomeLimits = [
    0, 2510, 3408, 4304, 5200, 6098, 6994, 7890, 8788, 9686, 10584,
    11482, 12380, 13278, 14176, 15074
];

const showAddAssetButton = selections['Is this person currently enrolled in LIS/ Extra Help?']?.toLowerCase() === 'no' || 
                           selections['Is this person currently enrolled in the Medicare Savings Program?']?.toLowerCase() === 'no' ||
                           member.meals?.toLowerCase() === 'yes' && (combinedMonthlyIncome !== undefined && parseFloat(combinedMonthlyIncome) <= 150) ||
                           ((parseInt(member.age) >= 60 || member.disability === 'yes') &&
                           (member.SNAP?.householdSize !== undefined && 
                            member.SNAP?.combinedMonthlyIncome > grossIncomeLimits[member.SNAP.householdSize]));                           

    
                if (showAddAssetButton) {
                    const addAssetButton = document.createElement('button');
                    addAssetButton.classList.add('add-asset-button');
                    addAssetButton.dataset.memberId = member.householdMemberId;
                }
    
                householdMemberContainer.appendChild(memberDiv);
            });
    
            // Attach event listeners for Edit and Delete buttons
            document.querySelectorAll('.edit-asset-button').forEach(button => {
                button.addEventListener('click', async function () {
                    const assetId = this.dataset.assetId;
                    const memberId = this.dataset.memberId;
    
                    // Fetch asset details from the database
const fetchedAsset = await fetch(`/get-asset/${memberId}/${assetId}`)
.then(response => {
    if (!response.ok) {
        throw new Error(`Failed to fetch asset: ${response.statusText}`);
    }
    return response.json();
})
.catch(error => {
    console.error('Error fetching asset:', error);
    return null;
});

if (fetchedAsset) {
// Populate modal with asset details
document.getElementById('asset-type').value = fetchedAsset.type;
document.getElementById('asset-description').value = fetchedAsset.description;
document.getElementById('asset-value').value = fetchedAsset.value;

currentMemberId = memberId; // Set current member ID
editingAssetId = assetId; // Set editing ID
isEditing = true; // Set editing mode

modalTitle.textContent = `Edit Asset`;
addAssetButton.textContent = 'Save and Update'; // Change button text
modal.classList.remove('hidden');
} else {
alert('Failed to fetch asset details.');
}
                });
            });
    
            document.querySelectorAll('.delete-asset-button').forEach(button => {
                button.addEventListener('click', async function () {
                    const assetId = this.dataset.assetId;
                    const memberId = this.dataset.memberId;
            
                    // Ask for confirmation before deleting
                    const confirmDelete = confirm('Are you sure you want to delete this asset entry?');
                    if (!confirmDelete) return;
            
                    try {
                        // Delete asset from the database
                        const response = await fetch(`/delete-asset`, {
                            method: 'DELETE',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ memberId, assetId })
                        });
            
                        if (!response.ok) {
                            throw new Error(`Failed to delete asset: ${response.statusText}`);
                        }
            
                        const result = await response.json();
            
                        if (result.success) {
                            // Remove asset from the UI
                            const assetItem = document.querySelector(`[data-asset-id="${assetId}"]`);
                            if (assetItem) assetItem.remove();
            
                            // Run eligibility checks and update the UI
                            const members = await loadHouseholdMembers();
                            await window.eligibilityChecks.PACEEligibilityCheck(members);
                            await window.eligibilityChecks.LISEligibilityCheck(members);
                            await window.eligibilityChecks.MSPEligibilityCheck(members);
                            await window.eligibilityChecks.PTRREligibilityCheck(members);
                            await window.eligibilityChecks.SNAPEligibilityCheck(members);
            
                            console.log('Eligibility Checks:', window.eligibilityChecks);
            
                            // Update the UI
                            await window.eligibilityChecks.updateAndDisplayHouseholdMembers();
                            await window.eligibilityChecks.displaySNAPHouseholds();
                        } else {
                            alert('Failed to delete asset.');
                        }
                    } catch (error) {
                        console.error('Error deleting asset:', error);
                        alert('An error occurred while deleting the asset.');
                    }
                });
            });
    
            // Add event listeners for asset buttons
            document.querySelectorAll('.add-asset-button').forEach(button => {
                button.addEventListener('click', function () {
                    console.log('Add Asset button clicked'); // Debugging log
                    console.log('Member ID:', this.dataset.memberId); // Debugging log
    
                    currentMemberId = this.dataset.memberId;
    
                    modalTitle.textContent = `Add Asset`;
                    modal.classList.remove('hidden'); // Show the modal
                });
            });
    
        }
    }
    // Close modal
    closeModal.addEventListener('click', () => {
        modal.classList.add('hidden');
        assetForm.reset();
    });

    addAssetButton.addEventListener('click', async () => {
        const asset = {
            id: isEditing ? editingAssetId : crypto.randomUUID(), // Use existing ID if editing
            type: document.getElementById('asset-type').value,
            description: document.getElementById('asset-description').value,
            value: parseFloat(document.getElementById('asset-value').value),
        };
    
        if (currentMemberId && asset.type && asset.description && asset.value) {
            if (isEditing) {
                try {
                    // Update existing asset in the database
                    const response = await fetch(`/update-asset`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            memberId: currentMemberId,
                            assetId: editingAssetId,
                            updatedAsset: asset
                        })
                    });
    
                    if (!response.ok) {
                        throw new Error(`Failed to update asset: ${response.statusText}`);
                    }
    
                    // Update the UI for the existing asset entry
                    const assetItem = document.querySelector(`[data-asset-id="${editingAssetId}"]`);
                    if (assetItem) {
                        assetItem.querySelector('p:nth-child(1)').innerHTML = `<strong>Type:</strong> ${asset.type}`;
                        assetItem.querySelector('p:nth-child(2)').innerHTML = `<strong>Description:</strong> ${asset.description}`;
                        assetItem.querySelector('p:nth-child(3)').innerHTML = `<strong>Value:</strong> $${asset.value}`;
                    }
    
                    // Run eligibility checks and update the UI
                    const members = await loadHouseholdMembers();
                    await window.eligibilityChecks.PACEEligibilityCheck(members);
                    await window.eligibilityChecks.LISEligibilityCheck(members);
                    await window.eligibilityChecks.MSPEligibilityCheck(members);
                    await window.eligibilityChecks.PTRREligibilityCheck(members);
                    await window.eligibilityChecks.SNAPEligibilityCheck(members);
    
                    console.log('Eligibility Checks:', window.eligibilityChecks);
    
                    // Update the UI
                    await window.eligibilityChecks.updateAndDisplayHouseholdMembers();
                    await window.eligibilityChecks.displaySNAPHouseholds();
    
                    // Reset modal state
                    isEditing = false;
                    editingAssetId = null; // Reset editing ID
                    addAssetButton.textContent = 'Add Asset'; // Reset button text
                    modal.classList.add('hidden'); // Close the modal
                    assetForm.reset(); // Reset the form
                } catch (error) {
                    console.error('Error updating asset:', error);
                    alert('Failed to update asset.');
                }
            } else {
                // Add new asset
                await saveAsset(currentMemberId, asset);
    
                // Update the UI with the new asset entry
                const assetList = document.getElementById(`asset-list-${currentMemberId}`);
                const assetItem = document.createElement('li');
                assetItem.setAttribute('data-asset-id', asset.id);
                assetItem.innerHTML = `
                    <p><strong>Type:</strong> ${asset.type}</p>
                    <p><strong>Description:</strong> ${asset.description}</p>
                    <p><strong>Value:</strong> $${asset.value}</p>
                    <button class="edit-asset-button" data-member-id="${currentMemberId}" data-asset-id="${asset.id}">Edit</button>
                    <button class="delete-asset-button" data-member-id="${currentMemberId}" data-asset-id="${asset.id}" style="color: red;">Delete</button>
                `;
    
                assetList.appendChild(assetItem);
    
                // Add event listeners for the new Edit and Delete buttons
                attachAssetEventListeners(assetItem);
    
                // Close the modal and reset the form
                modal.classList.add('hidden'); // Close the modal
                assetForm.reset(); // Reset the form
            }
        } else {
            alert('Please fill out all fields.');
        }
    });

    // Helper function to attach event listeners to asset items
    function attachAssetEventListeners(assetItem) {
        assetItem.querySelector('.edit-asset-button').addEventListener('click', async function () {
            const assetId = this.dataset.assetId;

            // Fetch asset details from the database
const fetchedAsset = await fetch(`/get-asset/${currentMemberId}/${assetId}`)
.then(response => {
    if (!response.ok) {
        throw new Error(`Failed to fetch asset: ${response.statusText}`);
    }
    return response.json();
})
.catch(error => {
    console.error('Error fetching asset:', error);
    return null;
});

if (fetchedAsset) {
// Populate modal with asset details
document.getElementById('asset-type').value = fetchedAsset.type;
document.getElementById('asset-description').value = fetchedAsset.description;
document.getElementById('asset-value').value = fetchedAsset.value;

editingAssetId = assetId;
isEditing = true;

modalTitle.textContent = `Edit Asset`;
addAssetButton.textContent = 'Save and Update'; // Change button text
modal.classList.remove('hidden');
} else {
alert('Failed to fetch asset details.');
}
        });

        assetItem.querySelector('.delete-asset-button').addEventListener('click', async function () {
            const assetId = this.dataset.assetId;
        
            // Ask for confirmation before deleting
            const confirmDelete = confirm('Are you sure you want to delete this asset entry?');
            if (!confirmDelete) return;
        
            try {
                // Delete asset from the database
                const response = await fetch(`/delete-asset`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ memberId: currentMemberId, assetId })
                });
        
                if (!response.ok) {
                    throw new Error(`Failed to delete asset: ${response.statusText}`);
                }
        
                const result = await response.json();
        
                if (result.success) {
                    // Remove asset from the UI
                    assetItem.remove();
        
                    // Run eligibility checks and update the UI
                    const members = await loadHouseholdMembers();
                    await window.eligibilityChecks.PACEEligibilityCheck(members);
                    await window.eligibilityChecks.LISEligibilityCheck(members);
                    await window.eligibilityChecks.MSPEligibilityCheck(members);
                    await window.eligibilityChecks.PTRREligibilityCheck(members);
                    await window.eligibilityChecks.SNAPEligibilityCheck(members);
        
                    console.log('Eligibility Checks:', window.eligibilityChecks);
        
                    // Update the UI
                    await window.eligibilityChecks.updateAndDisplayHouseholdMembers();
                    await window.eligibilityChecks.displaySNAPHouseholds();
                } else {
                    alert('Failed to delete asset.');
                }
            } catch (error) {
                console.error('Error deleting asset:', error);
                alert('An error occurred while deleting the asset.');
            }
        });
    }

    // Helper function to get query parameters
    function getQueryParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    // Display household members on page load
    await displayHouseholdMembers();
});

