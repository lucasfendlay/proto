document.addEventListener('DOMContentLoaded', async function () {
    const clientId = getQueryParameter('id'); // Get the client ID from the query parameter
    const modal = document.getElementById('income-modal');
    const modalTitle = document.getElementById('modal-title');
    const closeModal = document.getElementById('close-modal');
    const addIncomeButton = document.getElementById('add-income-button');
    const incomeForm = document.getElementById('income-form');
    let currentMemberId = null;
    let currentIncomeType = null;
    const BACKEND_URL = window.location.origin || "http://localhost:3000";


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

// Close the income modal when clicking outside of it
document.addEventListener('click', (event) => {
    if (!modal.contains(event.target) && !event.target.closest('#income-modal') && !event.target.closest('.add-income-button')) {
        modal.classList.add('hidden');
        incomeForm.reset(); // Reset the form
        isEditing = false; // Reset editing mode
        editingIncomeId = null; // Reset editing ID
        addIncomeButton.textContent = 'Add Income'; // Reset button text
    }
});

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

        console.log(`Income saved for member ${memberId}:`, income);

                // Hide the modal after saving
                const modal = document.getElementById('income-modal');
                modal.classList.add('hidden'); // Add the 'hidden' class
                modal.style.display = 'none'; // Ensure the modal is hidden
        
                // Optionally reset the form
                const incomeForm = document.getElementById('income-form');
                incomeForm.reset(); // Clear all input fields in the form
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
                // Sort members to show headOfHousehold: true first
                members.sort((a, b) => {
                    if (a.headOfHousehold === b.headOfHousehold) return 0;
                    return a.headOfHousehold ? -1 : 1;
                });
        
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
                    ${
                        member.income.some(income => income.type === "Current")
                            ? `
                                <h4>Current Year Income:</h4>
                                <ul id="current-income-list-${member.householdMemberId}">
                                    ${member.income
                                        .filter(income => income.type === "Current")
                                        .map(income => `
                                            <li data-income-id="${income.id}">
                                                <p><strong>Income Type:</strong> ${income.type}</p>
                                                <p><strong>Income Kind:</strong> ${income.kind}</p>
                                                <p><strong>Amount:</strong> $${income.amount}</p>
                                                <p><strong>Frequency:</strong> ${income.frequency}</p>
                                                <p><strong>Start Date:</strong> ${income.startDate}</p>
                                                <p><strong>End Date:</strong> ${income.endDate}</p>
                                                <div class="button-container">
                                                    <button class="edit-income-button" data-member-id="${member.householdMemberId}" data-income-id="${income.id}">Edit</button>
                                                    <button class="delete-income-button" data-member-id="${member.householdMemberId}" data-income-id="${income.id}">Delete</button>
                                                </div>
                                            </li>
                                        `).join('')}
                                </ul>
                            `
                            : ''
                    }
                    ${
                        member.income.some(income => income.type === "Previous")
                            ? `
                                <h4>Previous Year Income:</h4>
                                <ul id="previous-income-list-${member.householdMemberId}">
                                    ${member.income
                                        .filter(income => income.type === "Previous")
                                        .map(income => `
                                            <li data-income-id="${income.id}">
                                                <p><strong>Income Type:</strong> ${income.type}</p>
                                                <p><strong>Income Kind:</strong> ${income.kind}</p>
                                                <p><strong>Amount:</strong> $${income.amount}</p>
                                                <p><strong>Frequency:</strong> ${income.frequency}</p>
                                                <p><strong>Start Date:</strong> ${income.startDate}</p>
                                                <p><strong>End Date:</strong> ${income.endDate}</p>
                                                <div class="button-container">
                                                    <button class="edit-income-button" data-member-id="${member.householdMemberId}" data-income-id="${income.id}">Edit</button>
                                                    <button class="delete-income-button" data-member-id="${member.householdMemberId}" data-income-id="${income.id}">Delete</button>
                                                </div>
                                            </li>
                                        `).join('')}
                                </ul>
                            `
                            : ''
                    }
                `
                : '<p>No income records available.</p>'
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

            attachDeleteIncomeListeners(); // Attach delete listeners after rendering members
    
            // Attach event listeners for Edit and Delete buttons
document.querySelectorAll('.edit-income-button').forEach(button => {
    button.addEventListener('click', async function () {
        const incomeId = this.dataset.incomeId;
        const memberId = this.dataset.memberId;
        const BACKEND_URL = window.location.origin || "http://localhost:3000";


        try {
            // Fetch income details from the backend API
            const response = await fetch(`${BACKEND_URL}/get-income/${memberId}/${incomeId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch income details.');
            }

            const fetchedIncome = await response.json();
            currentIncomeType = fetchedIncome.type;


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

                modalTitle.textContent = `Edit ${fetchedIncome.type} Year Income`;
                addIncomeButton.textContent = 'Save and Update'; // Change button text
                modal.classList.remove('hidden');
                modal.style.display = 'block'; // Ensure the modal is visible

            } else {
                alert('Failed to fetch income details.');
            }
        } catch (error) {
            console.error('Error fetching income details:', error);
            alert('Failed to fetch income details. Please try again.');
        }
    });
});
    
// Use event delegation for add-income-button
document.getElementById('household-member-container').addEventListener('click', function (event) {
    if (event.target.classList.contains('add-income-button')) {
        // Reset the modal fields
        incomeForm.reset(); // Clear all input fields in the form
        isEditing = false; // Ensure editing mode is disabled
        editingIncomeId = null; // Clear any previously set editing ID
        addIncomeButton.textContent = 'Add Income'; // Reset button text

        // Set the current member and income type
        currentMemberId = event.target.dataset.memberId;
        currentIncomeType = event.target.dataset.type;

        // Update the modal title
        modalTitle.textContent = `Add ${currentIncomeType === 'Current' ? 'Current Year' : 'Previous Year'} Income`;

        // Set default start and end dates based on income type
        const startDate = currentIncomeType === 'Current'
            ? '2025-01-01' // 1st of January 2025
            : '2024-01-01'; // 1st of January 2024
        document.getElementById('income-start-date').value = startDate;

        const endDate = currentIncomeType === 'Current'
            ? '2025-12-31' // 31st of December 2025
            : '2024-12-31'; // 31st of December 2024
        document.getElementById('income-end-date').value = endDate;

        // Show the modal
        modal.classList.remove('hidden');
        modal.style.display = 'block';
    }
});
        }
    }

    closeModal.addEventListener('click', () => {
        modal.classList.add('hidden'); // Add the 'hidden' class
        modal.style.display = 'none'; // Hide the modal
        incomeForm.reset(); // Reset the form
        isEditing = false; // Reset editing mode
        editingIncomeId = null; // Reset editing ID
        addIncomeButton.textContent = 'Add Income'; // Reset button text
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

    const BACKEND_URL = window.location.origin || "http://localhost:3000";

    if (currentMemberId && income.kind && income.type && income.frequency && income.startDate && income.endDate && income.amount) {
        try {
            if (isEditing) {
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
            } else {
                // Save new income to the database
                await saveIncome(currentMemberId, income);

                // Dynamically update the income list UI
                updateIncomeListUI(currentMemberId, income);
            }

            // Reset modal state
            modal.classList.add('hidden');
            incomeForm.reset();
            isEditing = false;
            editingIncomeId = null;
            addIncomeButton.textContent = 'Add Income';

            // Close the modal
            modal.style.display = 'none';

        } catch (error) {
            console.error('Error saving income:', error);
            alert('Failed to save income. Please try again.');
        }
    } else {
        alert('Please fill out all fields.');
    }
});

// Function to dynamically update the income list UI
function updateIncomeListUI(memberId, income) {
    const memberDiv = document.querySelector(`[data-member-id="${memberId}"]`);
    if (!memberDiv) {
        console.error(`Member div for ID ${memberId} not found.`);
        return;
    }

    const incomeListId = income.type === "Current" 
        ? `current-income-list-${memberId}` 
        : `previous-income-list-${memberId}`;
    let incomeList = document.getElementById(incomeListId);

    // If the income list doesn't exist, create it
    if (!incomeList) {
        incomeList = document.createElement('ul');
        incomeList.id = incomeListId;

        const incomeHeader = document.createElement('h4');
        incomeHeader.textContent = income.type === "Current" ? "Current Year Income:" : "Previous Year Income:";
        memberDiv.querySelector('.income-list').appendChild(incomeHeader);
        memberDiv.querySelector('.income-list').appendChild(incomeList);
    }

    // Add the new income item to the list
    const incomeItem = document.createElement('li');
    incomeItem.setAttribute('data-income-id', income.id);
    incomeItem.innerHTML = `
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
    `;

    incomeList.appendChild(incomeItem);

    // Attach event listeners for the new Edit and Delete buttons
    attachIncomeEventListeners(incomeItem);
    attachDeleteIncomeListeners();
}

// Helper function to attach event listeners to income items
function attachIncomeEventListeners(incomeItem) {
    incomeItem.querySelector('.edit-income-button').addEventListener('click', async function () {
        const incomeId = this.dataset.incomeId;
        const memberId = this.dataset.memberId;
        const BACKEND_URL = window.location.origin || "http://localhost:3000";

        console.log('Edit button clicked with:', { incomeId, memberId });

        try {
            // Fetch income details from the backend API
            const response = await fetch(`${BACKEND_URL}/get-income/${memberId}/${incomeId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch income details.');
            }

            const fetchedIncome = await response.json();
            console.log('Fetched income details:', fetchedIncome);

            if (fetchedIncome) {
                // Populate modal with income details
                document.getElementById('income-kind').value = fetchedIncome.kind;
                document.getElementById('income-frequency').value = fetchedIncome.frequency;
                document.getElementById('income-start-date').value = fetchedIncome.startDate;
                document.getElementById('income-end-date').value = fetchedIncome.endDate;
                document.getElementById('income-amount').value = fetchedIncome.amount;

                currentMemberId = memberId; // Set current member ID
                currentIncomeType = fetchedIncome.type; // Set current income type (e.g., "Current" or "Previous")
                editingIncomeId = incomeId; // Set editing ID
                isEditing = true; // Set editing mode

                // Update the modal title dynamically based on the income type
                const incomeTypeText = fetchedIncome.type === 'Current' ? 'Current Year' : 'Previous Year';
                modalTitle.textContent = `Edit ${incomeTypeText} Income`;

                addIncomeButton.textContent = 'Save and Update'; // Change button text
                modal.classList.remove('hidden');
                modal.style.display = 'block'; // Ensure the modal is visible
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

    function attachDeleteIncomeListeners() {
        document.querySelectorAll('.delete-income-button').forEach(button => {
            button.addEventListener('click', async function () {
                const incomeId = this.dataset.incomeId;
                const memberId = this.dataset.memberId;
    
                console.log('Delete button clicked with:', { incomeId, memberId });
    
                if (!incomeId || !memberId || memberId === "null") {
                    alert('Missing or invalid income or member ID.');
                    return;
                }
    
                const confirmDelete = confirm('Are you sure you want to delete this income?');
                if (!confirmDelete) return;
    
                try {
                    console.log('Sending DELETE request with:', { clientId, memberId, incomeId });
    
                    const response = await fetch(`${BACKEND_URL}/delete-income?clientId=${clientId}&memberId=${memberId}&incomeId=${incomeId}`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' }
                    });
    
                    if (!response.ok) {
                        const errorMessage = await response.text();
                        console.error('Backend error response:', errorMessage);
                        throw new Error('Failed to delete income.');
                    }
    
                    console.log('Income deleted successfully from the database.');
                    const incomeItem = document.querySelector(`[data-income-id="${incomeId}"]`);
                    if (incomeItem) {
                        incomeItem.remove();

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
                    } catch (error) {
                    console.error('Error deleting income:', error);
                    alert('Failed to delete income. Please try again.');
                }
            });
        });
    }

    // Display household members on page load
    await displayHouseholdMembers();

});

