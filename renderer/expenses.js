document.addEventListener('DOMContentLoaded', async function () {
    const clientId = getQueryParameter('id'); // Get the client ID from the query parameter
    const modal = document.getElementById('shelter-modal'); // Modal element
    const utilityModal = document.getElementById('utility-modal'); // Utility modal element
    const modalTitle = document.getElementById('modal-title'); // Modal title element
    const closeModal = document.getElementById('close-modal'); // Close button
    const closeUtilityModal = document.getElementById('close-utility-modal'); // Close button for utility modal
    const addExpenseButton = document.getElementById('add-expense-button'); // Add Expense button
    const saveUtilityExpensesButton = document.getElementById('save-utility-expenses'); // Save Utility Expenses button
    const utilityExpenseList = document.getElementById('utility-expense-list'); // Utility expense list
    let currentMemberId = null;

    // State management object for currentMemberId
const memberState = {
    currentMemberId: null,
    setCurrentMemberId(id) {
        this.currentMemberId = id;
    },
    getCurrentMemberId() {
        return this.currentMemberId;
    },
    resetCurrentMemberId() {
        this.currentMemberId = null;
    }
};

    // Define dropdown options for each expense type
    const dropdownOptions = {
        Shelter: [
            { value: 'Rent', label: 'Rent' },
            { value: 'Mortgage', label: 'Mortgage' },
            { value: 'Property Taxes', label: 'Property Taxes' },
            { value: 'Homeowners Insurance', label: 'Homeowners Insurance' }
        ],
        Medical: [
            { value: 'Medicare Part B Premium', label: 'Medicare Part B Premium' },
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
            { value: 'Durable Medical Equipment', label: 'Durable Medical Equipment' },
            { value: 'Transportation', label: 'Transportation' }
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
    // Load household members
    async function loadHouseholdMembers() {
        try {
            const client = await fetch(`/get-client/${clientId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`Failed to fetch client data: ${response.statusText}`);
                    }
                    return response.json();
                })
                .catch((error) => {
                    console.error('Error fetching client data:', error);
                    return null;
                });            if (!client || !client.householdMembers) {
                console.error('No household members found for this client.');
                return [];
            }
            return client.householdMembers;
        } catch (error) {
            console.error('Error loading household members:', error);
            return [];
        }
    }

    // Function to display household members and their expenses
    async function displayHouseholdMembers() {
        const householdMemberContainer = document.getElementById('household-member-container');
        const members = await loadHouseholdMembers();
    
        householdMemberContainer.innerHTML = ''; // Clear existing content
    
        if (members.length === 0) {
            const noMembersMessage = document.createElement('p');
            noMembersMessage.textContent = 'No household members found.';
            householdMemberContainer.appendChild(noMembersMessage);
        } else {
            for (const member of members) {
                const memberDiv = document.createElement('div');
                memberDiv.classList.add('household-member1-box');
    
                // Fetch expenses for the member
                const expenses = await fetch(`/get-expense?householdMemberId=${member.householdMemberId}`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                })
                    .then((response) => {
                        if (!response.ok) {
                            throw new Error(`Failed to fetch expenses: ${response.statusText}`);
                        }
                        return response.json();
                    })
                    .catch((error) => {
                        console.error('Error fetching expenses:', error);
                        return [];
                    });
    
                // Filter out invalid expenses
                member.expenses = expenses.filter(expense => expense && expense.type);
    
                // Populate member details
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
                        ${
                            member.meals?.toLowerCase() === "yes"
                                ? `
                                    <button class="add-expense-button" data-member-id="${member.householdMemberId}" data-expense-type="Shelter">Add Shelter Expense</button>
                                    ${
                                        member.expenses.some(expense => expense.type === 'Utility')
                                            ? '' // Do not show the button if Utility expenses exist
                                            : `<button class="add-expense-button" data-member-id="${member.householdMemberId}" data-expense-type="Utility">Add Utility Expense</button>`
                                    }
                                    <button class="add-expense-button" data-member-id="${member.householdMemberId}" data-expense-type="Other">Add Other Expense</button>
                                `
                                : ''
                        }
                        ${
                            member.meals?.toLowerCase() === "yes" &&
                            (parseInt(member.age?.split('Y')[0]) >= 60 || member.disability?.toLowerCase() === "yes")
                                ? `<button class="add-expense-button" data-member-id="${member.householdMemberId}" data-expense-type="Medical">Add Medical Expense</button>`
                                : ''
                        }
                        ${
                            (member.selections?.["Has this person already applied for PTRR this year?"]?.toLowerCase() === "no" ||
                             member.selections?.["Is this person currently enrolled in PACE?"]?.toLowerCase() === "no")
                                ? `<button class="add-expense-button" data-member-id="${member.householdMemberId}" data-expense-type="Previous Year">Add Previous Year Expense</button>`
                                : ''
                        }
                    </div>
                `;
    
                householdMemberContainer.appendChild(memberDiv);
            }
        }
    
        // Ensure eligibilityChecks is defined
        if (!window.eligibilityChecks) {
            console.error('Eligibility checks are not loaded.');
            return;
        }
    
        // Ensure all required methods exist
        const requiredChecks = [
            'PACEEligibilityCheck',
            'LISEligibilityCheck',
            'MSPEligibilityCheck',
            'PTRREligibilityCheck',
            'SNAPEligibilityCheck',
            'updateAndDisplayHouseholdMembers',
            'displaySNAPHouseholds'
        ];
    
        for (const check of requiredChecks) {
            if (typeof window.eligibilityChecks[check] !== 'function') {
                console.error(`Missing eligibility check method: ${check}`);
                return;
            }
        }
    
        // Run eligibility checks and update the UI
        const membersForEligibility = await loadHouseholdMembers();
        await window.eligibilityChecks.PACEEligibilityCheck(membersForEligibility);
        await window.eligibilityChecks.LISEligibilityCheck(membersForEligibility);
        await window.eligibilityChecks.MSPEligibilityCheck(membersForEligibility);
        await window.eligibilityChecks.PTRREligibilityCheck(membersForEligibility);
        await window.eligibilityChecks.SNAPEligibilityCheck(membersForEligibility);
    
        console.log('Eligibility Checks:', window.eligibilityChecks);
    
        // Update the UI
        await window.eligibilityChecks.updateAndDisplayHouseholdMembers();
        await window.eligibilityChecks.displaySNAPHouseholds();
    }


// Generic function to close a modal when clicking outside its content or on the modal itself
function setupModalClose(modalId, formId = null, additionalReset = null) {
    document.addEventListener('click', (event) => {
        const modal = document.getElementById(modalId);
        if (modal && (event.target === modal || (!modal.contains(event.target) && !event.target.closest('.add-expense-button')))) {
            modal.classList.add('hidden');
            if (formId) {
                document.getElementById(formId).reset(); // Reset the form if provided
            }
            if (additionalReset) {
                additionalReset(); // Perform additional reset actions if provided
            }
        }
    });
}

// Close the shelter modal
setupModalClose('shelter-modal', 'shelter-form', () => {
    isEditing = false; // Reset editing mode
    currentExpenseId = null; // Reset editing ID
    addExpenseButton.textContent = 'Add Expense'; // Reset button text
});

// Close the utility modal
setupModalClose('utility-modal', null, () => {
    utilityExpenseList.querySelectorAll('.selection-box').forEach(box => box.classList.remove('selected')); // Deselect all utility types
});

// Close the medical modal
setupModalClose('medical-modal', 'medical-form');

// Close the other expense modal
setupModalClose('other-modal', 'other-form');

// Close the previous year expense modal
setupModalClose('previous-year-modal', 'previous-year-form');

    function populateExpenses(expenses) {
        // Group expenses by type
        const shelterExpenses = expenses.filter(expense => expense.type === 'Shelter');
        const utilityExpenses = expenses.filter(expense => expense.type === 'Utility');
        const medicalExpenses = expenses.filter(expense => expense.type === 'Medical');
        const otherExpenses = expenses.filter(expense => expense.type === 'Other');
        const previousYearExpenses = expenses.filter(expense => expense.type === 'Previous Year');
    
        // Helper function to render a list of expenses
        const renderExpenseList = (expenses, title) => {
            if (expenses.length === 0) return '';
            return `
                <div class="${title.toLowerCase().replace(/\s+/g, '-')}-expenses-container" style="margin: 20px 0;">
                    <h4>${title} Expenses</h4>
                    <ul>
                        ${expenses.map(expense => `
                            <li data-expense-id="${expense.id}">
                                <p><strong>Type:</strong> ${expense.type}</p>
                                <p><strong>Kind:</strong> ${expense.kind}</p>
                                <p><strong>Amount:</strong> $${expense.amount}</p>
                                <p><strong>Frequency:</strong> ${expense.frequency}</p>
                                <p><strong>Start Date:</strong> ${expense.startDate}</p>
                                <p><strong>End Date:</strong> ${expense.endDate}</p>
                                <button class="edit-expense-button" data-expense-id="${expense.id}">Edit</button>
                                <button class="delete-expense-button" data-expense-id="${expense.id}" style="color: white; background-color: red;";>Delete</button>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        };

        // Add event listeners for mouseover and mouseout to change the button color
document.addEventListener('mouseover', (event) => {
    if (event.target.classList.contains('delete-expense-button')) {
        event.target.style.backgroundColor = 'darkred'; // Change to dark red on hover
    }
});

document.addEventListener('mouseout', (event) => {
    if (event.target.classList.contains('delete-expense-button')) {
        event.target.style.backgroundColor = 'red'; // Restore original red color
    }
});
    
        // Render utility expenses separately (centered and simplified)
        const renderUtilityExpenses = (expenses) => {
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
        };

        // Add event listeners for mouseover and mouseout to change the button color
document.addEventListener('mouseover', (event) => {
    if (event.target.classList.contains('delete-utility-expenses-button')) {
        event.target.style.backgroundColor = 'darkred'; // Change to dark red on hover
    }
});

document.addEventListener('mouseout', (event) => {
    if (event.target.classList.contains('delete-utility-expenses-button')) {
        event.target.style.backgroundColor = 'red'; // Restore original red color
    }
});
    
         // Combine all expense sections in the desired order
    return `
    ${renderExpenseList(shelterExpenses, 'Shelter')}
    ${renderUtilityExpenses(utilityExpenses, 'Utility')}
    ${renderExpenseList(medicalExpenses, 'Medical')}
    ${renderExpenseList(otherExpenses, 'Other')}
    ${renderExpenseList(previousYearExpenses, 'Previous Year')}
`;
}

    // Save utility expenses
    saveUtilityExpensesButton.addEventListener('click', async () => {
        // Retrieve clientId dynamically from the query parameter
        const urlParams = new URLSearchParams(window.location.search);
        const clientId = urlParams.get('id'); // Get the client ID from the query parameter
    
        // Retrieve currentMemberId dynamically from the modal or selected context
        const currentMemberId = memberState.getCurrentMemberId();
    
        // Debugging: Log the retrieved IDs
        console.log('clientId:', clientId, 'currentMemberId:', currentMemberId);
    
        if (!clientId || !currentMemberId) {
            alert('Both clientId and memberId are required to save utility expenses.');
            return;
        }
    
        const selectedUtilities = Array.from(utilityExpenseList.querySelectorAll('.selection-box.selected'))
            .map(box => box.dataset.utilityType);
    
        if (selectedUtilities.length === 0) {
            alert('Please select at least one utility type.');
            return;
        }
    
        try {
    // Step 1: Fetch existing utility expenses for the current member
    const existingExpenses = await fetch(`/get-expense?householdMemberId=${currentMemberId}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    })
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Failed to fetch expenses: ${response.statusText}`);
            }
            return response.json();
        })
        .catch((error) => {
            console.error('Error fetching expenses:', error);
            return [];
        });

    // Filter for utility expenses
    const utilityExpenses = existingExpenses.filter(expense => expense.type === 'Utility');

    // If no utility expenses exist, skip deletion and proceed to adding new ones
    if (utilityExpenses.length === 0) {
        console.log('No utility expenses found for this member. Proceeding to add new ones.');
    } else {
        // Step 2: Delete all existing utility expenses for the current member
        const deleteResponse = await fetch('/delete-utility-expenses', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                clientId,
                memberId: currentMemberId,
            }),
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to delete utility expenses: ${response.statusText}`);
                }
                return response.json();
            })
            .catch((error) => {
                console.error('Error deleting utility expenses:', error);
                return { success: false };
            });

        if (!deleteResponse.success) {
            alert('Failed to delete existing utility expenses. Please try again.');
            return;
        }
    }

    // Step 3: Add the new utility expenses
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
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                clientId,
                memberId: currentMemberId,
                utilityExpense: expense,
            }),
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to add utility expense: ${response.statusText}`);
                }
                return response.json();
            })
            .catch((error) => {
                console.error('Error adding utility expense:', error);
            });
    }

    // Step 4: Refresh the UI and close the modal
    await displayHouseholdMembers();
    utilityModal.classList.add('hidden');
} catch (error) {
    console.error('Error saving utility expenses:', error);
    alert('An error occurred while saving utility expenses. Please try again.');
}
    });

// Attach event listener for the "Add Utility Expense" button
document.addEventListener('click', (event) => {
    if (event.target.classList.contains('add-expense-button') && event.target.dataset.expenseType === 'Utility') {
        const memberId = event.target.dataset.memberId; // Get the member ID from the button

        if (!memberId) {
            alert('Failed to retrieve the member ID. Please try again.');
            return;
        }

        // Set the current member ID dynamically
        memberState.setCurrentMemberId(memberId);
        console.log('Set currentMemberId:', memberId);

        // Clear the modal fields
        utilityExpenseList.querySelectorAll('.selection-box').forEach(box => {
            box.classList.remove('selected'); // Deselect all utility types
        });

        // Show the utility modal
        utilityModal.classList.remove('hidden');
    }
});

// Attach event listener to the parent container using event delegation
document.addEventListener('click', (event) => {
    if (event.target.classList.contains('add-expense-button')) {
        const expenseType = event.target.dataset.expenseType; // Get the expense type from the button
        const memberId = event.target.dataset.memberId; // Get the member ID from the button

        if (!memberId) {
            alert('Failed to retrieve the member ID. Please try again.');
            return;
        }

        // Set the current member ID dynamically
        memberState.setCurrentMemberId(memberId);
        console.log('Set currentMemberId:', memberId);

        if (expenseType === 'Utility') {
            // Show the utility modal
            utilityModal.classList.remove('hidden');
        } else {
            // Show the general modal for other expense types
            modalTitle.textContent = `Add ${expenseType} Expense`;

            // Populate the dropdown options dynamically
            const expenseKindDropdown = document.getElementById('expense-kind');
            expenseKindDropdown.innerHTML = ''; // Clear existing options

            // Add a default placeholder option
            const placeholderOption = document.createElement('option');
            placeholderOption.value = '';
            placeholderOption.textContent = `Select ${expenseType} Kind`;
            placeholderOption.disabled = true;
            placeholderOption.selected = true;
            expenseKindDropdown.appendChild(placeholderOption);

            // Populate dropdown options based on the expense type
            if (dropdownOptions[expenseType]) {
                dropdownOptions[expenseType].forEach(option => {
                    const optionElement = document.createElement('option');
                    optionElement.value = option.value;
                    optionElement.textContent = option.label;
                    expenseKindDropdown.appendChild(optionElement);
                });
            }

            // Autofill start and end dates
            const startDateInput = document.getElementById('expense-start-date');
            const endDateInput = document.getElementById('expense-end-date');
            if (expenseType === 'Previous Year') {
                startDateInput.value = '2024-01-01';
                endDateInput.value = '2024-12-31';
            } else {
                startDateInput.value = '2025-01-01';
                endDateInput.value = '2025-12-31';
            }

            // Show the general modal
            modal.classList.remove('hidden');
        }
        // Reset the "Add Expense" button text to default
        addExpenseButton.textContent = 'Add Expense';
    }
});

// Track the current mode (add or edit)
let isEditing = false;
let currentExpenseId = null; // Track the expense ID being edited

// Attach event listener to the "Add Expense" button
addExpenseButton.addEventListener('click', async () => {
    if (isEditing) {
        // Editing mode: Call the overwriteExpense function
        await overwriteExpense();
    } else {
        // Adding mode: Call the saveExpense function
        await saveExpense();
    }
});

// Function to save a new expense
async function saveExpense() {
    // Ensure clientId is retrieved correctly
    const clientId = getQueryParameter('id');
    if (!clientId) {
        console.error('clientId is missing. Ensure the URL contains the "id" query parameter.');
        alert('Client ID is missing. Please check the URL.');
        return;
    }

    // Ensure memberId is set correctly
    const currentMemberId = memberState.getCurrentMemberId();
    if (!currentMemberId) {
        console.error('currentMemberId is missing. Ensure a member is selected.');
        alert('Member ID is missing. Please select a member.');
        return;
    }

    console.log('clientId:', clientId, 'currentMemberId:', currentMemberId);

    // Get values from the form
    const expenseKind = document.getElementById('expense-kind').value;
    const expenseFrequency = document.getElementById('expense-frequency').value;
    const expenseStartDate = document.getElementById('expense-start-date').value;
    const expenseEndDate = document.getElementById('expense-end-date').value;
    const expenseAmount = document.getElementById('expense-amount').value;

    // Validate input fields
    if (!expenseKind || !expenseFrequency || !expenseStartDate || !expenseEndDate || !expenseAmount) {
        alert('Please fill out all fields.');
        return;
    }

    // Create a new expense object
    const newExpense = {
        id: `expense-${Date.now()}`, // Generate a unique ID
        type: modalTitle.textContent.includes('Previous Year') 
        ? 'Previous Year' 
        : modalTitle.textContent.split(' ')[1], // Extract type from modal title        kind: expenseKind,
        amount: parseFloat(expenseAmount),
        kind: expenseKind,
        frequency: expenseFrequency,
        startDate: expenseStartDate,
        endDate: expenseEndDate
    };

    console.log('New Expense:', newExpense);

    try {
        // Save the expense using the `save-expense` handler
        const response = await fetch('/save-expense', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                clientId,
                memberId: currentMemberId,
                expense: newExpense,
            }),
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to save expense: ${response.statusText}`);
                }
                return response.json();
            })
            .catch((error) => {
                console.error('Error saving expense:', error);
                return { success: false };
            });

        console.log('Save Expense Response:', response);

        if (response.success) {
            console.log('Expense saved successfully.');

            // Reset the form and close the modal
            document.getElementById('shelter-form').reset();
            modal.classList.add('hidden');

            // Update the UI
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
    if (!currentExpenseId) {
        alert('No expense selected for overwriting. Please try again.');
        return;
    }

    // Extract memberId and validate structure
    const memberContainer = document.querySelector(`.household-member1-box [data-expense-id="${currentExpenseId}"]`)?.closest('.household-member1-box');
    const memberId = memberContainer?.querySelector('.add-expense-button')?.dataset.memberId;

    if (!memberId) {
        console.error('Failed to extract memberId. Ensure the parent container has a valid structure.');
        alert('Failed to identify the member. Please try again.');
        return;
    }

    console.log('Overwriting expense with:', { memberId, currentExpenseId });

    // Retrieve form values
    const expenseKind = document.getElementById('expense-kind').value;
    const expenseFrequency = document.getElementById('expense-frequency').value;
    const expenseStartDate = document.getElementById('expense-start-date').value;
    const expenseEndDate = document.getElementById('expense-end-date').value;
    const expenseAmount = document.getElementById('expense-amount').value;

    // Validate input fields
    if (!expenseKind || !expenseFrequency || !expenseStartDate || !expenseEndDate || !expenseAmount) {
        alert('Please fill out all fields.');
        return;
    }

    // Construct the updated expense object
    const updatedExpense = {
        id: currentExpenseId,
        type: modalTitle.textContent.includes('Previous Year') 
            ? 'Previous Year' 
            : modalTitle.textContent.split(' ')[1], // Extract type from modal title
        kind: expenseKind,
        amount: parseFloat(expenseAmount),
        frequency: expenseFrequency,
        startDate: expenseStartDate,
        endDate: expenseEndDate,
    };

    console.log('Updated Expense Payload:', updatedExpense);

    try {
        // Send the updated expense to the server
        const response = await fetch('/update-expense', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                householdMemberId: memberId, // Include memberId in the request
                expense: updatedExpense,
            }),
        });

        const responseText = await response.text();
        console.log('Raw Response Text:', responseText);

        if (!response.ok) {
            throw new Error(`Failed to overwrite expense: ${responseText}`);
        }

        const responseData = JSON.parse(responseText);

        if (!responseData.success) {
            console.error('Failed to overwrite expense:', responseData);
            alert(responseData.message || 'Failed to overwrite the expense. Please try again.');
            return;
        }

        console.log('Expense overwritten successfully.');
        await refreshUIAfterExpenseUpdate();
    } catch (error) {
        console.error('Error overwriting expense:', error);
        alert(`An error occurred while overwriting the expense: ${error.message}`);
    }
}

// Helper function to refresh the UI after an expense update
async function refreshUIAfterExpenseUpdate() {
    try {
        await displayHouseholdMembers(); // Refresh the household members UI
        document.getElementById('shelter-form').reset(); // Reset the form
        modal.classList.add('hidden'); // Close the modal
    } catch (error) {
        console.error('Error refreshing UI:', error);
        alert('An error occurred while refreshing the UI. Please try again.');
    }
}

document.addEventListener('click', async function (event) {
    if (event.target.classList.contains('edit-expense-button')) {
        // Extract expenseId from the button's dataset
        const expenseId = event.target.dataset.expenseId;

        // Extract memberId from the closest parent container
        const memberContainer = event.target.closest('.household-member1-box');
        const memberId = memberContainer?.querySelector('.add-expense-button')?.dataset.memberId;

        // Validate memberId and expenseId
        if (!memberId) {
            console.error('Failed to extract memberId. Ensure the parent container has a valid structure.');
            alert('Failed to identify the member. Please try again.');
            return;
        }

        if (!expenseId) {
            console.error('Failed to extract expenseId. Ensure the button has a valid data-expense-id attribute.');
            alert('Failed to identify the expense. Please try again.');
            return;
        }

        console.log('Fetching expense with:', { memberId, expenseId });

        try {
            // Fetch the expense data from the database
            const expense = await fetch(`/get-expense?householdMemberId=${memberId}&expenseId=${expenseId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`Failed to fetch expense: ${response.statusText}`);
                    }
                    return response.json();
                })
                .catch((error) => {
                    console.error('Error fetching expense:', error);
                    return null;
                });

            if (!expense) {
                alert('Expense not found.');
                return;
            }

            console.log('Fetched expense:', expense);

            // Autofill the modal fields with the expense data
            const expenseKindDropdown = document.getElementById('expense-kind');
            const startDateInput = document.getElementById('expense-start-date');
            const endDateInput = document.getElementById('expense-end-date');
            const frequencyInput = document.getElementById('expense-frequency');
            const amountInput = document.getElementById('expense-amount');

            const expenseType = expense.type;
            if (!dropdownOptions[expenseType]) {
                console.error(`No dropdown options found for expense type: ${expenseType}`);
                alert('Invalid expense type. Please try again.');
                return;
            }

            // Populate dropdown options
            expenseKindDropdown.innerHTML = '';
            dropdownOptions[expenseType].forEach(option => {
                const optionElement = document.createElement('option');
                optionElement.value = option.value;
                optionElement.textContent = option.label;
                if (option.value === expense.kind) {
                    optionElement.selected = true;
                }
                expenseKindDropdown.appendChild(optionElement);
            });

            // Autofill other fields
            startDateInput.value = expense.startDate || '';
            endDateInput.value = expense.endDate || '';
            frequencyInput.value = expense.frequency || '';
            amountInput.value = expense.amount || '';

            console.log('Autofilling modal fields:', {
                kind: expense.kind,
                startDate: expense.startDate,
                endDate: expense.endDate,
                frequency: expense.frequency,
                amount: expense.amount,
            });

            // Update the modal title
            modalTitle.textContent = `Edit ${expenseType} Expense`;

            // Set the current expense ID and switch to editing mode
            currentExpenseId = expense.id;
            isEditing = true;

            // Show the modal
            modal.classList.remove('hidden');

            // Change the button text to "Save and Update"
            addExpenseButton.textContent = 'Save and Update';
        } catch (error) {
            console.error('Error fetching expense:', error);
            alert('An error occurred while fetching the expense. Please try again.');
        }
    }
});

// Reset the mode when the modal is closed
closeModal.addEventListener('click', () => {
    isEditing = false;
    currentExpenseId = null;
    addExpenseButton.textContent = 'Add Expense'; // Reset button text
});

document.addEventListener('click', async (event) => {
    if (event.target.classList.contains('delete-expense-button')) {
        const expenseId = event.target.dataset.expenseId;

        if (!expenseId) {
            alert('Failed to identify the expense. Please try again.');
            return;
        }

        const confirmDelete = confirm('Are you sure you want to delete this expense?');
        if (!confirmDelete) return;

        try {
            const response = await fetch('/delete-expense', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ expenseId }),
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`Failed to delete expense: ${response.statusText}`);
                    }
                    return response.json();
                })
                .catch((error) => {
                    console.error('Error deleting expense:', error);
                    return { success: false };
                });
            
            if (response.success) {
                console.log('Expense deleted successfully.');
                await displayHouseholdMembers(); // Refresh the UI
            } else {
                console.error('Failed to delete expense:', response.message);
                alert('Failed to delete the expense. Please try again.');
            }
            if (response.success) {
                console.log('Expense deleted successfully.');
                await displayHouseholdMembers(); // Refresh the UI
            } else {
                console.error('Failed to delete expense:', response.message);
                alert('Failed to delete the expense. Please try again.');
            }
        } catch (error) {
            console.error('Error deleting expense:', error);
            alert('An error occurred while deleting the expense. Please try again.');
        }
    }
});

document.addEventListener('click', async (event) => {
    if (event.target.classList.contains('delete-utility-expenses-button')) {
        const confirmDelete = confirm('Are you sure you want to delete all utility expenses?');
        if (!confirmDelete) return;

        try {
            // Retrieve clientId from the query parameter
            const clientId = getQueryParameter('id'); // Assuming this function is already defined

            // Retrieve currentMemberId from the button's dataset or another source
            const memberContainer = event.target.closest('.household-member1-box');
            const currentMemberId = memberContainer?.querySelector('.add-expense-button')?.dataset.memberId;

            if (!clientId || !currentMemberId) {
                throw new Error('Both clientId and memberId are required.');
            }

            // Invoke the backend handler with clientId and memberId
            const response = await fetch('/delete-utility-expenses', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    clientId,
                    memberId: currentMemberId,
                }),
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`Failed to delete utility expenses: ${response.statusText}`);
                    }
                    return response.json();
                })
                .catch((error) => {
                    console.error('Error deleting utility expenses:', error);
                    return { success: false };
                });
            
            if (response.success) {
                console.log('Utility expenses deleted successfully.');
                await displayHouseholdMembers(); // Refresh the UI
            } else {
                console.error('Failed to delete utility expenses:', response.message);
                alert('Failed to delete the utility expenses. Please try again.');
            }


            if (response.success) {
                console.log('Utility expenses deleted successfully.');
                await displayHouseholdMembers(); // Refresh the UI
            } else {
                console.error('Failed to delete utility expenses:', response.message);
                alert('Failed to delete the utility expenses. Please try again.');
            }
        } catch (error) {
            console.error('Error deleting utility expenses:', error);
            alert('An error occurred while deleting the utility expenses. Please try again.');
        }
    }
});

document.addEventListener('click', async (event) => {
    if (event.target.classList.contains('edit-utility-expenses-button')) {
        try {
            // Retrieve clientId from the query parameter
            const clientId = getQueryParameter('id'); // Assuming this function is already defined

            // Retrieve currentMemberId from the button's dataset or another source
            const memberContainer = event.target.closest('.household-member1-box');
            const currentMemberId = memberContainer?.querySelector('.add-expense-button')?.dataset.memberId;

            if (!clientId || !currentMemberId) {
                alert('Both clientId and memberId are required to edit utility expenses.');
                return;
            }

            // Fetch utility expenses for the selected member
            const expenses = await fetch(`/get-expense?householdMemberId=${currentMemberId}`, {
    method: 'GET',
    headers: {
        'Content-Type': 'application/json',
    },
})
    .then((response) => {
        if (!response.ok) {
            throw new Error(`Failed to fetch expenses: ${response.statusText}`);
        }
        return response.json();
    })
    .catch((error) => {
        console.error('Error fetching expenses:', error);
        return [];
    });

            // Filter for utility expenses
            const utilityExpenses = expenses.filter(expense => expense.type === 'Utility');

            // Open the utility modal
            utilityModal.classList.remove('hidden');

            // Highlight matching selection boxes
            const selectionBoxes = utilityExpenseList.querySelectorAll('.selection-box');
            selectionBoxes.forEach(box => {
                const utilityType = box.dataset.utilityType;
                if (utilityExpenses.some(expense => expense.kind === utilityType)) {
                    box.classList.add('selected'); // Add a visual highlight
                } else {
                    box.classList.remove('selected'); // Remove highlight if not matching
                }
            });

            // Set the current member ID for saving later
            memberState.setCurrentMemberId(currentMemberId);
        } catch (error) {
            console.error('Error editing utility expenses:', error);
            alert('An error occurred while editing utility expenses. Please try again.');
        }
    }
});

// Display household members on page load
await displayHouseholdMembers();
});