document.addEventListener('DOMContentLoaded', async function () {
    const clientId = getQueryParameter('id'); // Get the client ID from the query parameter
    const modal = document.getElementById('income-modal');
    const modalTitle = document.getElementById('modal-title');
    const closeModal = document.getElementById('close-modal');
    const addIncomeButton = document.getElementById('add-income-button');
    const incomeForm = document.getElementById('income-form');
    let currentMemberId = null;
    let currentIncomeType = null;
    const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';


    // Load household members
async function loadHouseholdMembers() {
    try {
        // Fetch client data from the backend API
        const response = await fetch(`${BACKEND_URL}/get-client/${clientId}`);
        if (!response.ok) {
            throw new Error('Failed to fetch client data.');
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

    // Save income to the database
async function saveIncome(memberId, income) {
    try {
        const response = await fetch(`${BACKEND_URL}/update-member-income`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId,
                memberId,
                income
            })
        });

        if (!response.ok) {
            throw new Error('Failed to save income.');
        }

        console.log(`Income saved for member ${memberId}:`, income);
    } catch (error) {
        console.error('Error saving income:', error);
    }
}

    async function displayHouseholdMembers() {
        const householdMemberContainer = document.getElementById('household-member-container');


        // Clear the container to prevent duplicates
        householdMemberContainer.innerHTML = ''; // Clear all existing content
    
        // Add styles to make the container narrower
        householdMemberContainer.align = 'center'; // Center the container
        householdMemberContainer.style.minWidth = '925px'; // Set a minimum width for the container
        householdMemberContainer.style.maxWidth = '925px'; // Adjust the width as needed
        householdMemberContainer.style.margin = '0 auto'; // Center the container
    
        const members = await loadHouseholdMembers();
    
        if (members.length === 0) {
            const noMembersMessage = document.createElement('p');
            noMembersMessage.textContent = 'No household members found.';
            householdMemberContainer.appendChild(noMembersMessage);
        } else {
            members.forEach(member => {
                const memberDiv = document.createElement('div');
                memberDiv.classList.add('household-member1-box'); // Add a class for styling
                memberDiv.setAttribute('data-member-id', member.householdMemberId);
    
                // Populate member details
                memberDiv.innerHTML = `
                    <h3>${member.firstName} ${member.middleInitial || ''} ${member.lastName}</h3>
                    <p><strong>Date of Birth:</strong> ${member.dob || 'N/A'}</p>
                    <p><strong>Marital Status:</strong> ${member.maritalStatus || 'N/A'}</p>
                    <div class="income-list">
                        ${
                            member.income && Array.isArray(member.income) && member.income.length > 0
                                ? `
                                    <h4>Income:</h4>
                                    <ul id="income-list-${member.householdMemberId}">
                                        ${member.income
                                            .sort((a, b) => {
                                                // Sort by type: "Current" first, then "Previous"
                                                if (a.type === "Current" && b.type === "Previous") return -1;
                                                if (a.type === "Previous" && b.type === "Current") return 1;
                                                return 0; // Keep the order for other cases
                                            })
                                            .map(income => `
                                                <li data-income-id="${income.id}">
                                                    <p><strong>Income Type:</strong> ${income.type}</p>
                                                    <p><strong>Income Kind:</strong> ${income.kind}</p>
                                                    <p><strong>Amount:</strong> $${income.amount}</p>
                                                    <p><strong>Frequency:</strong> ${income.frequency}</p>
                                                    <p><strong>Start Date:</strong> ${income.startDate}</p>
                                                    <p><strong>End Date:</strong> ${income.endDate}</p>
                                                    <button class="edit-income-button" data-member-id="${member.householdMemberId}" data-income-id="${income.id}">Edit</button>
                                                    <button class="delete-income-button" data-member-id="${member.householdMemberId}" data-income-id="${income.id}" style="color: red;">Delete</button>
                                                </li>
                                            `).join('')}
                                    </ul>
                                `
                                : '<p></p>'
                        }
                    </div>
                `;
    
                // Conditional logic for showing buttons
                if (member.meals === 'yes' || member.selections?.['Is this person currently enrolled in LIS/ Extra Help?'] === 'no' || member.selections?.['Is this person currently enrolled in the Medicare Savings Program?'] === 'no') {
                    const addCurrentYearIncomeButton = document.createElement('button');
                    addCurrentYearIncomeButton.classList.add('add-income-button');
                    addCurrentYearIncomeButton.dataset.memberId = member.householdMemberId;
                    addCurrentYearIncomeButton.dataset.type = 'Current';
                    addCurrentYearIncomeButton.textContent = 'Add Current Year Income';
                    memberDiv.appendChild(addCurrentYearIncomeButton);
                }
    
                if (member.selections?.['Is this person currently enrolled in PACE?'] === 'no' || member.selections?.['Has this person already applied for PTRR this year?'] === 'no') {
                    const addPreviousYearIncomeButton = document.createElement('button');
                    addPreviousYearIncomeButton.classList.add('add-income-button');
                    addPreviousYearIncomeButton.dataset.memberId = member.householdMemberId;
                    addPreviousYearIncomeButton.dataset.type = 'Previous';
                    addPreviousYearIncomeButton.textContent = 'Add Previous Year Income';
                    memberDiv.appendChild(addPreviousYearIncomeButton);
                }
    
                householdMemberContainer.appendChild(memberDiv);
            });
    
            // Attach event listeners for Edit and Delete buttons
document.querySelectorAll('.edit-income-button').forEach(button => {
    button.addEventListener('click', async function () {
        const incomeId = this.dataset.incomeId;
        const memberId = this.dataset.memberId;
        const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';


        try {
            // Fetch income details from the backend API
            const response = await fetch(`${BACKEND_URL}/get-income/${memberId}/${incomeId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch income details.');
            }

            const fetchedIncome = await response.json();

            if (fetchedIncome) {
                // Populate modal with income details
                document.getElementById('income-kind').value = fetchedIncome.kind;
                document.getElementById('income-frequency').value = fetchedIncome.frequency;
                document.getElementById('income-start-date').value = fetchedIncome.startDate;
                document.getElementById('income-end-date').value = fetchedIncome.endDate;
                document.getElementById('income-amount').value = fetchedIncome.amount;

                currentMemberId = memberId; // Set current member ID
                currentIncomeType = fetchedIncome.type;
                editingIncomeId = incomeId; // Set editing ID
                isEditing = true; // Set editing mode

                modalTitle.textContent = `Edit Income`;
                addIncomeButton.textContent = 'Save and Update'; // Change button text
                modal.classList.remove('hidden');
            } else {
                alert('Failed to fetch income details.');
            }
        } catch (error) {
            console.error('Error fetching income details:', error);
            alert('Failed to fetch income details. Please try again.');
        }
    });
});
    
            // Add event listeners for income buttons
            document.querySelectorAll('.add-income-button').forEach(button => {
                button.addEventListener('click', function () {
                    currentMemberId = this.dataset.memberId;
                    currentIncomeType = this.dataset.type;
    
                    modalTitle.textContent = `Add ${currentIncomeType === 'Current' ? 'Current Year' : 'Previous Year'} Income`;
    
                    // Set Start Date based on income type
                    const startDate = currentIncomeType === 'Current'
                        ? '2025-01-01' // 1st of January 2025
                        : '2024-01-01'; // 1st of January 2024
                    document.getElementById('income-start-date').value = startDate;
    
                    // Set End Date based on income type
                    const endDate = currentIncomeType === 'Current'
                        ? '2025-12-31' // Default to December 31, 2025, for current income
                        : '2024-12-31'; // Default to December 31, 2024, for previous income
                    document.getElementById('income-end-date').value = endDate;
    
                    modal.classList.remove('hidden');
                });
            });
        }
    }

    // Close modal
    closeModal.addEventListener('click', () => {
        modal.classList.add('hidden');
        incomeForm.reset();
    });

    let isEditing = false; // Track whether the modal is in edit mode
let editingIncomeId = null; // Track the ID of the income being edited

addIncomeButton.addEventListener('click', async () => {
    const income = {
        id: isEditing ? editingIncomeId : crypto.randomUUID(), // Use existing ID if editing
        kind: document.getElementById('income-kind').value,
        type: currentIncomeType,
        frequency: document.getElementById('income-frequency').value,
        startDate: document.getElementById('income-start-date').value,
        endDate: document.getElementById('income-end-date').value,
        amount: parseFloat(document.getElementById('income-amount').value)
    };

    if (currentMemberId && income.kind && income.type && income.frequency && income.startDate && income.endDate && income.amount) {
        if (isEditing) {
            try {
                // Update existing income in the database
                const response = await fetch(`${BACKEND_URL}/update-income`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        memberId: currentMemberId,
                        incomeId: editingIncomeId,
                        updatedIncome: income
                    })
                });
    
                if (!response.ok) {
                    throw new Error('Failed to update income.');
                }
    
                // Update the UI for the existing income entry
                const incomeItem = document.querySelector(`[data-income-id="${editingIncomeId}"]`);
                if (incomeItem) {
                    incomeItem.querySelector('p:nth-child(1)').innerHTML = `<strong>Income Type:</strong> ${income.type}`;
                    incomeItem.querySelector('p:nth-child(2)').innerHTML = `<strong>Income Kind:</strong> ${income.kind}`;
                    incomeItem.querySelector('p:nth-child(3)').innerHTML = `<strong>Amount:</strong> $${income.amount}`;
                    incomeItem.querySelector('p:nth-child(4)').innerHTML = `<strong>Frequency:</strong> ${income.frequency}`;
                    incomeItem.querySelector('p:nth-child(5)').innerHTML = `<strong>Start Date:</strong> ${income.startDate}`;
                    incomeItem.querySelector('p:nth-child(6)').innerHTML = `<strong>End Date:</strong> ${income.endDate}`;
                }
    
                // Reset modal state
                isEditing = false;
                editingIncomeId = null; // Reset editing ID
                addIncomeButton.textContent = 'Add Income'; // Reset button text
                modal.classList.add('hidden'); // Close the modal
                incomeForm.reset(); // Reset the form
            } catch (error) {
                console.error('Error updating income:', error);
                alert('Failed to update income. Please try again.');
            }
        } else {
            // Add new income logic remains unchanged
await saveIncome(currentMemberId, income);

// Ensure the income list exists
let incomeList = document.getElementById(`income-list-${currentMemberId}`);
if (!incomeList) {
    // Create the income list if it doesn't exist
    incomeList = document.createElement('ul');
    incomeList.id = `income-list-${currentMemberId}`;
    const memberDiv = document.querySelector(`[data-member-id="${currentMemberId}"]`);
    if (memberDiv) {
        memberDiv.querySelector('.income-list').appendChild(incomeList);
    } else {
        console.error(`Member div for ID ${currentMemberId} not found.`);
        return;
    }
}

// Update the UI with the new income entry
const incomeItem = document.createElement('li');
incomeItem.setAttribute('data-income-id', income.id);
incomeItem.innerHTML = `
    <p><strong>Income Type:</strong> ${income.type}</p>
    <p><strong>Income Kind:</strong> ${income.kind}</p>
    <p><strong>Amount:</strong> $${income.amount}</p>
    <p><strong>Frequency:</strong> ${income.frequency}</p>
    <p><strong>Start Date:</strong> ${income.startDate}</p>
    <p><strong>End Date:</strong> ${income.endDate}</p>
    <button class="edit-income-button" data-member-id="${currentMemberId}" data-income-id="${income.id}">Edit</button>
    <button class="delete-income-button" data-member-id="${currentMemberId}" data-income-id="${income.id}" style="color: red;">Delete</button>
`;

incomeList.appendChild(incomeItem);

// Add event listeners for the new Edit and Delete buttons
attachIncomeEventListeners(incomeItem);

// Close the modal and reset the form
modal.classList.add('hidden'); // Close the modal
incomeForm.reset(); // Reset the form
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
    } else {
        alert('Please fill out all fields.');
    }
});

// Helper function to attach event listeners to income items
function attachIncomeEventListeners(incomeItem) {
    incomeItem.querySelector('.edit-income-button').addEventListener('click', async function () {
        const incomeId = this.dataset.incomeId;

        try {
            // Fetch income details from the backend API
            const response = await fetch(`${BACKEND_URL}/get-income/${currentMemberId}/${incomeId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch income details.');
            }

            const fetchedIncome = await response.json();

            if (fetchedIncome) {
                // Populate modal with income details
                document.getElementById('income-kind').value = fetchedIncome.kind;
                document.getElementById('income-frequency').value = fetchedIncome.frequency;
                document.getElementById('income-start-date').value = fetchedIncome.startDate;
                document.getElementById('income-end-date').value = fetchedIncome.endDate;
                document.getElementById('income-amount').value = fetchedIncome.amount;

                currentIncomeType = fetchedIncome.type;
                editingIncomeId = incomeId;
                isEditing = true;

                modalTitle.textContent = `Edit Income`;
                addIncomeButton.textContent = 'Save and Update'; // Change button text
                modal.classList.remove('hidden');
            } else {
                alert('Failed to fetch income details.');
            }
        } catch (error) {
            console.error('Error fetching income details:', error);
            alert('Failed to fetch income details. Please try again.');
        }
    });
}
    // Helper function to get query parameters
    function getQueryParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

// Attach event listener for delete buttons
document.addEventListener('click', async function (event) {
    if (event.target.classList.contains('delete-income-button')) {
        const incomeId = event.target.dataset.incomeId;
        const memberId = event.target.dataset.memberId;

        // Retrieve the clientId from the query parameter
        const clientId = getQueryParameter('id'); // Get the client ID from the query parameter

        // Confirm deletion
        const confirmDelete = confirm('Are you sure you want to delete this income entry?');
        if (!confirmDelete) return;

        try {
            // Delete income from the backend API
            const response = await fetch(`${BACKEND_URL}/delete-income`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, memberId, incomeId })
            });

            if (!response.ok) {
                throw new Error('Failed to delete income.');
            }

            // Call displayHouseholdMembers to refresh the UI
            await displayHouseholdMembers();

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

            console.log(`Income with ID ${incomeId} deleted successfully.`);
        } catch (error) {
            console.error('Error deleting income:', error);
            alert('Failed to delete income. Please try again.');
        }
    }
});

    // Display household members on page load
    await displayHouseholdMembers();

});