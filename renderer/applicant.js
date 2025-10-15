document.addEventListener('DOMContentLoaded', async () => {
    await loadSavedData(); // Load and display saved data
});

// Function to save the selection using the `/update-client` handler
async function saveClientUpdate(clientId, key, value) {
    try {
        console.log(`Updating ${key} to ${value} for client ${clientId}`); // Debugging log

        const response = await fetch('/update-client', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                clientId,
                clientData: { [key]: value },
            }),
        });

        if (response.ok) {
            console.log(`Successfully updated ${key}: ${value}`);
        
            // Re-fetch client data and re-trigger LIHEAP eligibility check
            const updatedClientResponse = await fetch(`/get-client/${clientId}`);
            if (updatedClientResponse.ok) {
                const updatedClient = await updatedClientResponse.json();
                console.log('Updated client data:', updatedClient); // Debugging log
        
                // Trigger LIHEAP eligibility check
                if (window.eligibilityChecks && window.eligibilityChecks.LIHEAPEligibilityCheck) {
                    await window.eligibilityChecks.LIHEAPEligibilityCheck(updatedClient);
                } else {
                    console.error('LIHEAPEligibilityCheck function not found.');
                }
        
                // Trigger display function
                if (window.eligibilityChecks && window.eligibilityChecks.displayLIHEAPHouseholds) {
                    await window.eligibilityChecks.displayLIHEAPHouseholds();
                } else {
                    console.error('displayLIHEAPHouseholds function not found.');
                }
            }
        } else {
            console.error(`Failed to update ${key}: ${value}`);
        }
    } catch (error) {
        console.error(`Error updating ${key}: ${value}`, error);
    }
}

function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}


// Modify the loadSavedData function to call checkAndAddSelfButton
async function loadSavedData() {
    const clientId = getQueryParam('id'); // Retrieve the client ID from the URL
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }

    try {
        // Fetch the client data from the backend
        const response = await fetch(`/get-client/${clientId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch client data: ${response.statusText}`);
        }
        const clientData = await response.json();

        if (clientData) {
            // Highlight saved selections for main questions
            const mainQuestions = [
                { id: 'disability', elements: ['disability-yes', 'disability-no'] },
                { id: 'medicare', elements: ['medicare-yes', 'medicare-no'] },
                { id: 'medicaid', elements: ['medicaid-yes', 'medicaid-no'] },
                { id: 'student', elements: ['student-yes', 'student-no'] },
                { id: 'snap', elements: ['snap-yes', 'snap-no', 'snap-notinterested'] },
                { id: 'liheap', elements: ['liheap-yes', 'liheap-no', 'liheap-notinterested'] },
                { id: 'subsidizedHousing', elements: ['subsidizedHousing-yes', 'subsidizedHousing-no'] },
                { id: 'heatingCost', elements: ['heatingCost-yes', 'heatingCost-no'] },
                { id: 'heatingCrisis', elements: ['heatingCrisis-yes', 'heatingCrisis-no'] },
                { id: 'residenceStatusCurrent', elements: ['residenceStatusCurrent-owned', 'residenceStatusCurrent-rented', 'residenceStatusCurrent-rentedowned', 'residenceStatusCurrent-other'] },
                { id: 'residenceStatus', elements: ['residenceStatus-owned', 'residenceStatus-rented', 'residenceStatus-rentedowned', 'residenceStatus-other'] },
                { id: 'citizen', elements: ['citizen-yes', 'citizen-no'] }
            ];

            mainQuestions.forEach((question) => {
                const savedValue = clientData[question.id];
                if (savedValue) {
                    question.elements.forEach((elementId) => {
                        const element = document.getElementById(elementId);
                        if (element && element.getAttribute('data-value') === savedValue) {
                            element.classList.add('selected'); // Highlight the saved selection
                        } else if (element) {
                            element.classList.remove('selected'); // Ensure others are not highlighted
                        }
                    });
                }
            });

            // Display all previously saved household members
            if (clientData.householdMembers && Array.isArray(clientData.householdMembers)) {
                householdMemberContainer.innerHTML = ''; // Clear existing members
            
                // Sort members to display the head of household at the top
                const sortedMembers = clientData.householdMembers.sort((a, b) => {
                    return b.headOfHousehold - a.headOfHousehold; // `true` (1) comes before `false` (0)
                });
            
                sortedMembers.forEach((member) => {
                    const memberElement = document.createElement('div');
                    memberElement.classList.add('household-member'); // Add a class for styling
                    memberElement.innerHTML = `
                        <p class="household-member-info"><strong>Name:</strong> ${capitalizeFirstLetter(member.firstName || '')} ${member.middleInitial ? capitalizeFirstLetter(member.middleInitial || '') : ''} ${capitalizeFirstLetter(member.lastName || '')}</p>
                        <p class="household-member-info"><strong>DOB:</strong> ${member.dob}</p>
                        <p class="household-member-info"><strong>Age:</strong> ${member.age}</p>
                        <p class="household-member-info"><strong>Legal Sex:</strong> ${capitalizeFirstLetter(member.legalSex)}</p>
                        <p class="household-member-info"><strong>SSN:</strong> ${member.socialSecurityNumber ? member.socialSecurityNumber : 'N/A'}</p>
                        <p class="household-member-info"><strong>Marital Status:</strong> ${capitalizeFirstLetter(member.maritalStatus)}</p>
                        ${
                            member.previousMaritalStatus && typeof member.previousMaritalStatus === 'string' && member.previousMaritalStatus.toLowerCase() !== 'n/a'
                                ? `<p class="household-member-info"><strong>Previous Marital Status:</strong> ${capitalizeFirstLetter(member.previousMaritalStatus)}</p>`
                                : ''
                        }
                        <p class="household-member-info"><strong>Disability:</strong> ${capitalizeFirstLetter(member.disability)}</p>
                        <p class="household-member-info"><strong>Medicare:</strong> ${capitalizeFirstLetter(member.medicare)}</p>
                        <p class="household-member-info"><strong>Medicaid:</strong> ${capitalizeFirstLetter(member.medicaid)}</p>
                        <p class="household-member-info"><strong>US Citizen:</strong> ${capitalizeFirstLetter(member.citizen)}</p>
                        ${
                            member.nonCitizenStatus && member.nonCitizenStatus.toLowerCase() !== 'citizen'
                                ? `<p class="household-member-info"><strong>Non-Citizen Status:</strong> ${capitalizeFirstLetter(member.nonCitizenStatus)}</p>`
                                : ''
                        }
                        <p class="household-member-info"><strong>Student:</strong> ${capitalizeFirstLetter(member.student)}</p>
                        ${
                            member.studentStatus && member.studentStatus.toLowerCase() !== 'notstudent'
                                ? `<p class="household-member-info"><strong>Student Status:</strong> ${capitalizeFirstLetter(member.studentStatus)}</p>`
                                : ''
                        }
                        <p class="household-member-info"><strong>Included in SNAP Household:</strong> ${capitalizeFirstLetter(member.meals)}</p>
                        <div class="button-container">
                            <button class="edit-member-button" data-member-id="${member.householdMemberId}">Edit</button>
                            ${
                                !member.headOfHousehold
                                    ? ``
                                    : `<p class="household-member-info" style="color: black; border: 2px solid black; padding: 5px; display: inline-block;"><strong>Head of Household</strong></p>`
                            }
                        </div>
                    `;
                    householdMemberContainer.appendChild(memberElement);
                });
        
            
            
            
                // Add event listeners to all "Edit" buttons
                document.querySelectorAll('.edit-member-button').forEach((button) => {
                    button.addEventListener('click', (event) => {
                        const memberId = event.target.getAttribute('data-member-id');
                        const member = clientData.householdMembers.find((m) => m.householdMemberId === memberId);
                        if (member) {
                            openEditModal(member); // Open the modal in edit mode
                        }
                    });
                });
                }
        }
    } catch (error) {
        console.error('Error loading saved data:', error);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const subsidizedHousingContainer = document.getElementById('subsidizedHousing-container');
    const heatingCostContainer = document.getElementById('heatingCost-container');

    // Function to highlight the selected option
function highlightSelection(options, selectedValue) {
    options.forEach(option => {
        if (option.getAttribute('data-value') === selectedValue) {
            option.classList.add('selected'); // Add 'selected' class to the clicked option
        } else {
            option.classList.remove('selected'); // Remove 'selected' class from others
        }
    });
}
});

function capitalizeFirstLetter(string) {
    if (!string) return ''; // Return an empty string if input is falsy
    return string.toUpperCase(); // Convert the entire string to uppercase
}

// Function to highlight the selected option
function highlightSelection(elements, selectedElement) {
    elements.forEach((elementId) => {
        const element = document.getElementById(elementId);
        if (element) {
            if (element === selectedElement) {
                element.classList.add('selected'); // Add the 'selected' class to the clicked element
            } else {
                element.classList.remove('selected'); // Remove the 'selected' class from others
            }
        }
    });
}

// Function to save the heating crisis selection to the client object
async function saveHeatingCrisisSelection(selection) {
    const clientId = getQueryParam('id');
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }

    try {
        const response = await fetch('/update-client', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                clientId,
                clientData: { heatingCrisis: selection },
            }),
        });

        if (response.ok) {
            console.log(`Heating crisis selection saved successfully: ${selection}`);

            // Re-fetch client data to check LIHEAP enrollment
            const updatedClientResponse = await fetch(`/get-client/${clientId}`);
            if (updatedClientResponse.ok) {
                const updatedClient = await updatedClientResponse.json();
                const liheapEnrollment = updatedClient?.liheapEnrollment;

                const residenceStatusContainer = document.getElementById('residenceStatusCurrent-container');
                const subsidizedHousingContainer = document.getElementById('subsidizedHousing-container');
                const heatingCostContainer = document.getElementById('heatingCost-container');

                if (liheapEnrollment === 'yes' && selection === 'no') {
                    // Hide the residenceStatusCurrent container and set its value to null
                    residenceStatusContainer.style.display = 'none';
                    subsidizedHousingContainer.style.display = 'none';
                    heatingCostContainer.style.display = 'none';
                    await saveClientUpdate(clientId, 'subsidizedHousing', null);
                    await saveClientUpdate(clientId, 'heatingCost', null);
                    await saveClientUpdate(clientId, 'residenceStatusCurrent', null);
                    document.querySelectorAll('[id^="residenceStatusCurrent-"]').forEach(option => {
                        option.classList.remove('selected');
                    });
                } else {
                    // Show the residenceStatusCurrent container
                    residenceStatusContainer.style.display = 'block';
                }

                // Trigger LIHEAP eligibility check
                if (window.eligibilityChecks && window.eligibilityChecks.LIHEAPEligibilityCheck) {
                    await window.eligibilityChecks.LIHEAPEligibilityCheck(updatedClient);
                } else {
                    console.error('LIHEAPEligibilityCheck function not found.');
                }

                // Trigger display function
                if (window.eligibilityChecks && window.eligibilityChecks.displayLIHEAPHouseholds) {
                    await window.eligibilityChecks.displayLIHEAPHouseholds();
                } else {
                    console.error('displayLIHEAPHouseholds function not found.');
                }
            } else {
                console.error('Failed to fetch updated client data.');
            }
        } else {
            const error = await response.json();
            console.error('Error saving heating crisis selection:', error.message);
        }
    } catch (error) {
        console.error('Error saving heating crisis selection:', error);
    }
}

// Function to highlight the selected heating crisis option
function highlightHeatingCrisisSelection(selectedValue) {
    const options = document.querySelectorAll('#heatingCrisis-yes, #heatingCrisis-no');
    options.forEach((option) => {
        if (option.getAttribute('data-value') === selectedValue) {
            option.classList.add('selected');
        } else {
            option.classList.remove('selected');
        }
    });
}

// Function to recall the heating crisis selection on page load
async function recallHeatingCrisisSelection() {
    const clientId = getQueryParam('id');
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }

    try {
        const response = await fetch(`/get-client/${clientId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch client data: ${response.statusText}`);
        }

        const client = await response.json();
        const heatingCrisis = client?.heatingCrisis;

        // Highlight the saved selection
        if (heatingCrisis) {
            highlightHeatingCrisisSelection(heatingCrisis);
        }

        // Hide the question if LIHEAP eligibility is "Not Likely Eligible for LIHEAP"
        const liheapEligibility = client?.liheap?.eligibility;
        if (liheapEligibility === 'Not Likely Eligible for LIHEAP') {
            document.getElementById('heatingCrisis-container').style.display = 'none';
        }
    } catch (error) {
        console.error('Error recalling heating crisis selection:', error);
    }
}

// Add event listeners to the heating crisis options
document.querySelectorAll('#heatingCrisis-yes, #heatingCrisis-no').forEach((option) => {
    option.addEventListener('click', async () => {
        const selection = option.getAttribute('data-value');
        highlightHeatingCrisisSelection(selection);
        await saveHeatingCrisisSelection(selection);
    });
});

// Recall the heating crisis selection on page load
document.addEventListener('DOMContentLoaded', () => {
    recallHeatingCrisisSelection();
    
});

document.addEventListener('DOMContentLoaded', async () => {
    const clientId = getQueryParam('id'); // Retrieve the client ID from the URL
    if (clientId) {
    }

    await loadSavedData(); // Load and display saved data
});

document.addEventListener('DOMContentLoaded', () => {
    const questions = [
        { id: 'disability', elements: ['disability-yes', 'disability-no'] },
        { id: 'medicare', elements: ['medicare-yes', 'medicare-no'] },
        { id: 'medicaid', elements: ['medicaid-yes', 'medicaid-no'] },
        { id: 'student', elements: ['student-yes', 'student-no'] },
        { id: 'snap', elements: ['snap-yes', 'snap-no', 'snap-notinterested'] },
        { id: 'residenceStatus', elements: ['residenceStatus-owned', 'residenceStatus-rented', 'residenceStatus-rentedowned', 'residenceStatus-other'] },
        { id: 'citizen', elements: ['citizen-yes', 'citizen-no'] } // Add this line
    ];

    questions.forEach((question) => {
        question.elements.forEach((elementId) => {
            const element = document.getElementById(elementId);
            if (element) {
                element.addEventListener('click', async () => {
                    const value = element.getAttribute('data-value');

                    // Highlight the selected option
                    highlightSelection(question.elements, element);

                    // Save the selection for the client
                    await saveSelectionToClient(question.id, value);

                    // Apply specific logic based on the question
                    if (['disability', 'medicare', 'medicaid'].includes(question.id) && value === 'no') {
                        // Automatically assign "no" to all members for these questions
                        await updateAllMembers(question.id, 'no');
                    } else if (['student'].includes(question.id) && value === 'no') {
                        // Automatically assign "no" to all members for "student"
                        await updateAllMembers('student', 'no');
                        await updateAllMembers('studentStatus', 'notstudent'); // Set student status to "not student"
                    } else if (['citizen'].includes(question.id) && value === 'yes') {
                        // Automatically assign "no" to all members for "citizen"
                        await updateAllMembers('citizen', 'yes');
                        await updateAllMembers('nonCitizenStatus', 'citizen'); // Set non-citizen status to "citizen"
                    } else if (question.id === 'snap' && (value === 'yes' || value === 'notinterested')) {
                        // Automatically assign "no" to all members for "snap" if "yes" or "not interested"
                        await updateAllMembers('meals', 'no');
                    } else if (question.id === 'residenceStatus') {
                        // Assign the selected residence status to all members
                        await updateAllMembers('residenceStatus', value);
                    }
                });
            }
        });
    });

    // Add listener for the household size dropdown
    const householdSizeDropdown = document.getElementById('household-size');
    if (householdSizeDropdown) {
        householdSizeDropdown.addEventListener('change', async () => {
            const value = householdSizeDropdown.value; // Get the selected value
            if (value) {
                await saveSelectionToClient('householdSize', value); // Save the selection
                console.log(`Household size updated to: ${value}`);
            }
        });
    }
});

async function prepareHouseholdMemberModal() {
    const clientId = getQueryParam('id'); // Retrieve the client ID from the URL
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }

    try {
        // Clear all modal data
        const modalFields = [
            'firstName',
            'middleInitial',
            'lastName',
            'dob',
            'socialSecurityNumber',
            'legalSex',
            'maritalStatus',
            'previousMaritalStatus',
            'studentStatus',
            'nonCitizenStatus'
        ];

            // Make SSN field editable and hide the "Edit SSN" button
    const ssnInput = document.getElementById('socialSecurityNumber');
    const editSSNButton = document.getElementById('editSSNButton');
    ssnInput.readOnly = false; // Make the SSN field editable
    if (editSSNButton) {
        editSSNButton.style.display = 'none'; // Hide the "Edit SSN" button
    }

        resetSSNFields();

        modalFields.forEach((fieldId) => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = ''; // Clear the input field
            }
        });

                // Hide the "Next" button initially
                const nextButton = document.getElementById('nextSSNButton');
                if (nextButton) {
                    nextButton.style.display = 'none';
                }

        // Reset visibility of all modal questions
        const modalQuestions = [
            'disabilityQuestion',
            'medicareQuestion',
            'medicaidQuestion',
            'studentQuestion',
            'mealsQuestion',
            'citizenQuestion',
        ];
        modalQuestions.forEach((questionId) => {
            const question = document.getElementById(questionId);
            if (question) {
                question.style.display = 'block'; // Reset to visible by default
            }
        });

        // Reset all question selections
        const questionOptions = [
            'modal-disability-yes',
            'modal-disability-no',
            'modal-medicare-yes',
            'modal-medicare-no',
            'modal-medicaid-yes',
            'modal-medicaid-no',
            'modal-student-yes',
            'modal-student-no',
            'modal-meals-yes',
            'modal-meals-no',
            'modal-citizen-yes',
            'modal-citizen-no'
        ];
        questionOptions.forEach((optionId) => {
            const option = document.getElementById(optionId);
            if (option) {
                option.classList.remove('selected'); // Remove the 'selected' class
            }
        });

        // Hide the nonCitizenStatusContainer and studentStatusContainer by default
        const nonCitizenStatusContainer = document.getElementById('nonCitizenStatusContainer');
        const studentStatusContainer = document.getElementById('studentStatusContainer');
        if (nonCitizenStatusContainer) {
            nonCitizenStatusContainer.style.display = 'none';
        }
        if (studentStatusContainer) {
            studentStatusContainer.style.display = 'none';
        }

        // Fetch the client data from the backend
        const response = await fetch(`/get-client/${clientId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch client data: ${response.statusText}`);
        }
        const clientData = await response.json();

        // Update the modal questions based on the saved data
        if (clientData) {
            const disabilityQuestion = document.getElementById('disabilityQuestion');
            const medicareQuestion = document.getElementById('medicareQuestion');
            const medicaidQuestion = document.getElementById('medicaidQuestion');
            const studentQuestion = document.getElementById('studentQuestion');
            const mealsQuestion = document.getElementById('mealsQuestion');
            const previousMaritalStatusContainer = document.getElementById('previousMaritalStatus').parentNode; // Get the container

            // Hide or show the previousMaritalStatus dropdown based on headOfHousehold status
const hasHeadOfHousehold = clientData.householdMembers?.some(member => member.headOfHousehold);

if (hasHeadOfHousehold) {
    // Hide for members who are not the head of household
    if (!clientData.headOfHousehold) {
        previousMaritalStatusContainer.style.display = 'none'; // Hide the dropdown
    } else {
        previousMaritalStatusContainer.style.display = 'block'; // Show the dropdown for the head of household
    }
} else {
    // Show if there is no head of household
    previousMaritalStatusContainer.style.display = 'block';
}

            if (clientData.disability === 'yes') {
                disabilityQuestion.style.display = 'block';
            } else {
                disabilityQuestion.style.display = 'none';
            }

            if (clientData.medicare === 'yes') {
                medicareQuestion.style.display = 'block';
            } else {
                medicareQuestion.style.display = 'none';
            }

            if (clientData.medicaid === 'yes') {
                medicaidQuestion.style.display = 'block';
            } else {
                medicaidQuestion.style.display = 'none';
            }

            if (clientData.citizen === 'no') {
                citizenQuestion.style.display = 'block';
            } else {
                citizenQuestion.style.display = 'none';
            }

            if (clientData.student === 'yes') {
                studentQuestion.style.display = 'block';
            } else {
                studentQuestion.style.display = 'none';
            }

            if (clientData.snap === 'yes' || clientData.snap === 'notinterested') {
                mealsQuestion.style.display = 'none';
            } else {
                mealsQuestion.style.display = 'block';
            }

            // Add listeners to highlight the selected options
            const modalQuestions = [
                { id: 'disability', elements: ['modal-disability-yes', 'modal-disability-no'] },
                { id: 'medicare', elements: ['modal-medicare-yes', 'modal-medicare-no'] },
                { id: 'medicaid', elements: ['modal-medicaid-yes', 'modal-medicaid-no'] },
                { id: 'student', elements: ['modal-student-yes', 'modal-student-no'] },
                { id: 'meals', elements: ['modal-meals-yes', 'modal-meals-no'] },
                { id: 'citizen', elements: ['modal-citizen-yes', 'modal-citizen-no'] }
            ];

            modalQuestions.forEach((question) => {
                question.elements.forEach((elementId) => {
                    const element = document.getElementById(elementId);
                    if (element) {
                        element.addEventListener('click', () => {
                            highlightSelection(question.elements, element); // Highlight the selected option
                        });
                    }
                });
            });
        }
    } catch (error) {
        console.error('Error fetching client data:', error);
    }
}

document.getElementById('add-household-member').addEventListener('click', async () => {
    const clientId = getQueryParam('id'); // Retrieve the client ID from the URL
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }

    try {
        // Fetch the client data to check household size
        const response = await fetch(`/get-client/${clientId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch client data: ${response.statusText}`);
        }
        const clientData = await response.json();

        if (!clientData) {
            console.error('Client data not found.');
            return;
        }

        // Check if the number of household members exceeds the household size
        if (clientData.householdMembers.length >= clientData.householdSize) {
            return;
        }

        // If validation passes, open the modal in "Add" mode
        setModalHeader('add');
        await prepareHouseholdMemberModal(); // Clear and prepare the modal
        setupAddOrUpdateButton(false); // Set up the button for adding a new member
        document.getElementById('householdMemberModal').style.display = 'block'; // Show the modal
    } catch (error) {
        console.error('Error fetching client data:', error);
    }
});

function setModalHeader(mode) {
    const modalHeader = document.getElementById('modal-header');
    if (mode === 'edit') {
        modalHeader.textContent = 'Edit Household Member';
    } else {
        modalHeader.textContent = 'Add Household Member';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const addHouseholdMemberButton = document.getElementById('add-household-member');
    setModalHeader('add');
    const householdMemberModal = document.getElementById('householdMemberModal');
    const closeModalButton = document.getElementById('closeHouseholdMemberModal');

    if (addHouseholdMemberButton && householdMemberModal) {
        addHouseholdMemberButton.addEventListener('click', async () => {
            const clientId = getQueryParam('id'); // Retrieve the client ID from the URL
            if (!clientId) {
                console.error('Client ID not found in query parameters.');
                return;
            }

            try {
                // Fetch the client data to check household size
                const response = await fetch(`/get-client/${clientId}`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch client data: ${response.statusText}`);
                }
                const clientData = await response.json();

                if (!clientData) {
                    console.error('Client data not found.');
                    return;
                }

                // Check if the number of household members exceeds the household size
                if (clientData.householdMembers.length >= clientData.householdSize) {
                    alert('The number of household members cannot exceed the selected household size.');
                    return;
                }

                // Prepare the modal based on saved data
                await prepareHouseholdMemberModal();
                setupAddOrUpdateButton(false);

                householdMemberModal.style.display = 'block'; // Show the modal
            } catch (error) {
                console.error('Error fetching client data:', error);
            }
        });
    }

    // Add listener to close the modal
    if (closeModalButton && householdMemberModal) {
        closeModalButton.addEventListener('click', () => {
            householdMemberModal.style.display = 'none'; // Hide the modal
        });
    }

    // Close the modal when clicking outside of it
    window.addEventListener('click', (event) => {
        if (event.target === householdMemberModal) {
            householdMemberModal.style.display = 'none'; // Hide the modal
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const addMemberButton = document.getElementById('add-member');
    if (addMemberButton) {
        addMemberButton.addEventListener('click', async (event) => {
            event.preventDefault(); // Prevent form submission
            await addHouseholdMember(); // Call the function to add the member
        });
    }
});

async function addHouseholdMember() {
    const clientId = getQueryParam('id'); // Retrieve the client ID from the URL
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }

    try {
        // Gather data from the modal
        const ssnInput = document.getElementById('socialSecurityNumber');
        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const socialSecurityNumber = ssnInput.value.trim();
        const middleInitial = document.getElementById('middleInitial').value.trim();
        const dob = document.getElementById('dob').value;
        const legalSex = document.getElementById('legalSex').value;
        const maritalStatus = document.getElementById('maritalStatus').value;
        const previousMaritalStatus = document.getElementById('previousMaritalStatus').value;
        const nonCitizenStatus = document.getElementById('nonCitizenStatus').value;
        const studentStatus = document.getElementById('studentStatus').value;
        
        // Calculate age in Years, Months, and Days
        const calculateAge = (dob) => {
            const birthDate = new Date(dob);
            const today = new Date();
            today.setDate(today.getDate() - 1); // Subtract 1 day from the current date
            let years = today.getFullYear() - birthDate.getFullYear();
            let months = today.getMonth() - birthDate.getMonth();
            let days = today.getDate() - birthDate.getDate();

            if (days < 0) {
                months -= 1;
                days += new Date(today.getFullYear(), today.getMonth(), 0).getDate();
            }
            if (months < 0) {
                years -= 1;
                months += 12;
            }

            return { years, months, days };
        };

        const age = calculateAge(dob);

        // Gather answers to modal questions
        const modalQuestions = [
            { id: 'disability', elements: ['modal-disability-yes', 'modal-disability-no'] },
            { id: 'medicare', elements: ['modal-medicare-yes', 'modal-medicare-no'] },
            { id: 'medicaid', elements: ['modal-medicaid-yes', 'modal-medicaid-no'] },
            { id: 'student', elements: ['modal-student-yes', 'modal-student-no'] },
            { id: 'meals', elements: ['modal-meals-yes', 'modal-meals-no'] },
            { id: 'citizen', elements: ['modal-citizen-yes', 'modal-citizen-no'] }
        ];

        const answers = {};
        modalQuestions.forEach((question) => {
            const visible = document.getElementById(`${question.id}Question`).style.display !== 'none';
            if (visible) {
                question.elements.forEach((elementId) => {
                    const element = document.getElementById(elementId);
                    if (element && element.classList.contains('selected')) {
                        answers[question.id] = element.getAttribute('data-value');
                    }
                });
            } else {
                // Default to "no" if the question is not visible
                answers[question.id] = 'no';
            }
        });

        // Automatically set citizen status to "yes" if the citizen question is not shown
        const citizenQuestion = document.getElementById('citizenQuestion');
        if (citizenQuestion && citizenQuestion.style.display === 'none') {
            answers.citizen = 'yes';
        }

        // Set nonCitizenStatus to "citizen" if citizen is "yes"
        if (answers.citizen === 'yes') {
            answers.nonCitizenStatus = 'citizen';
        }

        // Set studentStatus to "not student" if student is "no"
        if (answers.student === 'no') {
            answers.studentStatus = 'notstudent';
        }

        const clientData = await fetch(`/get-client/${clientId}`).then(res => res.json());
        if (!clientData) {
            console.error('Client data not found.');
            return;
        }

        // Prepare the data to save
        const householdMemberData = {
            householdMemberId: crypto.randomUUID(), // Generate a unique ID
            firstName,
            middleInitial,
            lastName,
            dob,
            legalSex,
            socialSecurityNumber,
            age: `${age.years} Years, ${age.months} Months, ${age.days} Days`,
            maritalStatus,
            previousMaritalStatus,
            nonCitizenStatus,
            studentStatus,
            ...answers,
            headOfHousehold: clientData.householdMembers.length === 0 // Automatically set as Head of Household if no members exist

        };

        // If nonCitizenStatus is "ineligible non-citizen", set meals to "no"
        if (nonCitizenStatus.toLowerCase() === 'ineligible non-citizen') {
            householdMemberData.meals = 'no';
        }

        // If studentStatus is "ineligible student", set meals to "no"
        if (studentStatus.toLowerCase() === 'ineligible student') {
            householdMemberData.meals = 'no';
        }

        // Save the data to the backend
        const response = await fetch(`/save-household-member`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                clientId,
                member: householdMemberData,
            }),
        });

        if (response.ok) {
            console.log('Household member added successfully:', householdMemberData);

            // Reload the household members to reflect the changes
            await loadSavedData();

            // Close the modal and reset the form
            const householdMemberModal = document.getElementById('householdMemberModal');
            householdMemberModal.style.display = 'none';
            document.getElementById('householdMemberForm').reset();
        } else {
            console.error('Failed to save household member.');
        }
    } catch (error) {
        console.error('Error adding household member:', error);
    }
}

// Function to set up the button for adding or updating a member
function setupAddOrUpdateButton(isEditing, member = null) {
    const addMemberButton = document.getElementById('add-member');
    const householdMemberModal = document.getElementById('householdMemberModal');

    // Update button text based on the context
    addMemberButton.textContent = isEditing ? 'Save and Update' : 'Add Member';

    // Remove any existing event listeners to avoid duplication
    const newAddMemberButton = addMemberButton.cloneNode(true);
    addMemberButton.parentNode.replaceChild(newAddMemberButton, addMemberButton);

    // Add the appropriate event listener
    newAddMemberButton.addEventListener('click', async (event) => {
        event.preventDefault(); // Prevent form submission
        if (isEditing && member) {
            console.log('Updating household member:', member.householdMemberId); // Log for debugging
            await updateHouseholdMember(member.householdMemberId); // Update the member
        } else {
            console.log('Adding new household member'); // Log for debugging
            await addHouseholdMember(); // Add a new member
        }

        // Close the modal and reset the form after the operation
        householdMemberModal.style.display = 'none';
        document.getElementById('householdMemberForm').reset();
    });
}

async function openEditModal(member) {
    setModalHeader('edit'); // Set the modal header to "Edit Household Member"
    const householdMemberModal = document.getElementById('householdMemberModal');

    // Step 1: Prepare the modal (reuse the logic from add modal)
    await prepareHouseholdMemberModal();

    // Step 2: Autofill the modal with the member's data
    document.getElementById('firstName').value = member.firstName || '';
    document.getElementById('middleInitial').value = member.middleInitial || '';
    document.getElementById('lastName').value = member.lastName || '';
    document.getElementById('dob').value = member.dob || '';
    document.getElementById('socialSecurityNumber').value = member.socialSecurityNumber || '';
    document.getElementById('legalSex').value = member.legalSex || '';
    document.getElementById('maritalStatus').value = member.maritalStatus || '';
    document.getElementById('previousMaritalStatus').value = member.previousMaritalStatus || '';
    document.getElementById('studentStatus').value = member.studentStatus || '';
    document.getElementById('nonCitizenStatus').value = member.nonCitizenStatus || '';

    // Make SSN field read-only and add "Edit SSN" button if a valid 9-digit SSN exists
const ssnInput = document.getElementById('socialSecurityNumber');
const confirmSSNContainer = document.getElementById('confirmSSNContainer');

if (ssnInput.value && /^\d{3}-\d{2}-\d{4}$/.test(ssnInput.value)) { // Check if SSN is in the format xxx-xx-xxxx
    const editSSNButton = document.createElement('button'); // Create the "Edit SSN" button
    ssnInput.readOnly = true; // Make the SSN field read-only
    confirmSSNContainer.style.display = 'none'; // Hide the confirm SSN container

    // Configure the "Edit SSN" button
    editSSNButton.id = 'editSSNButton';
    editSSNButton.textContent = 'Edit SSN';

    // Apply the same styles as #nextSSNButton
    editSSNButton.style.display = 'inline-block';
    editSSNButton.style.marginTop = '10px';
    editSSNButton.style.padding = '10px 15px';
    editSSNButton.style.cursor = 'pointer';
    editSSNButton.style.border = '1px solid #000000';
    editSSNButton.style.borderRadius = '5px';
    editSSNButton.style.transition = 'background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease';

    // Add hover effect
    editSSNButton.addEventListener('mouseover', () => {
        editSSNButton.style.backgroundColor = '#0056b3';
        editSSNButton.style.color = 'white';
        editSSNButton.style.borderColor = '#003f7f';
    });
    editSSNButton.addEventListener('mouseout', () => {
        editSSNButton.style.backgroundColor = '';
        editSSNButton.style.color = '';
        editSSNButton.style.borderColor = '#000000';
    });

    // Add a click event listener to trigger the resetSSN function
    editSSNButton.addEventListener('click', (event) => {
        event.preventDefault(); // Prevent the default button behavior
        resetSSNFields(); // Call the resetSSN function
        editSSNButton.style.display = 'none'; // Hide the "Edit SSN" button
    });

    // Insert the "Edit SSN" button after the SSN input field
    ssnInput.parentNode.insertBefore(editSSNButton, ssnInput.nextSibling);
}

    // Step 3: Highlight the selected options for modal questions
    const modalQuestions = [
        { id: 'disability', elements: ['modal-disability-yes', 'modal-disability-no'] },
        { id: 'medicare', elements: ['modal-medicare-yes', 'modal-medicare-no'] },
        { id: 'medicaid', elements: ['modal-medicaid-yes', 'modal-medicaid-no'] },
        { id: 'student', elements: ['modal-student-yes', 'modal-student-no'] },
        { id: 'meals', elements: ['modal-meals-yes', 'modal-meals-no'] },
        { id: 'citizen', elements: ['modal-citizen-yes', 'modal-citizen-no'] }
    ];

    modalQuestions.forEach((question) => {
        question.elements.forEach((elementId) => {
            const element = document.getElementById(elementId);
            if (element) {
                // Highlight the saved selection
                if (element.getAttribute('data-value') === member[question.id]) {
                    element.classList.add('selected');
                } else {
                    element.classList.remove('selected');
                }
            }
        });
    });

    // Step 4: Handle visibility of conditional fields
    const nonCitizenStatusContainer = document.getElementById('nonCitizenStatusContainer');
    const studentStatusContainer = document.getElementById('studentStatusContainer');
    const mealsQuestion = document.getElementById('mealsQuestion');
    const previousMaritalStatusContainer = document.getElementById('previousMaritalStatus').parentNode; // Get the container

    if (member.citizen === 'no') {
        nonCitizenStatusContainer.style.display = 'block';
        if (member.nonCitizenStatus.toLowerCase() === 'ineligible non-citizen') {
            mealsQuestion.style.display = 'none';
        }
    } else {
        nonCitizenStatusContainer.style.display = 'none';
    }

    if (member.student === 'yes') {
        studentStatusContainer.style.display = 'block';
        if (member.studentStatus.toLowerCase() === 'ineligible student') {
            mealsQuestion.style.display = 'none';
        }
    } else {
        studentStatusContainer.style.display = 'none';
    }

    const clientId = getQueryParam('id'); // Retrieve the client ID from the URL
    const response = await fetch(`/get-client/${clientId}`);
    if (response.ok) {
        const clientData = await response.json();
        const hasHeadOfHousehold = clientData.householdMembers?.some(m => m.headOfHousehold);

        if (hasHeadOfHousehold) {
            // Show only for the head of household
            if (member.headOfHousehold) {
                previousMaritalStatusContainer.style.display = 'block';
            } else {
                previousMaritalStatusContainer.style.display = 'none';
            }
        } else {
            // Show if there is no head of household
            previousMaritalStatusContainer.style.display = 'block';
        }
    } else {
        console.error('Failed to fetch client data for editing.');
    }

    // Step 5: Set up the button for updating the member
    setupAddOrUpdateButton(true, member);

    // Step 6: Show the modal
    householdMemberModal.style.display = 'block';
}

async function updateHouseholdMember(memberId) {
    const clientId = getQueryParam('id'); // Retrieve the client ID from the URL
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }

    try {
        // Gather updated data from the modal
        const firstName = document.getElementById('firstName').value.trim();
        const middleInitial = document.getElementById('middleInitial').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const dob = document.getElementById('dob').value;
        const socialSecurityNumber = document.getElementById('socialSecurityNumber').value.trim();
        const legalSex= document.getElementById('legalSex').value;
        const maritalStatus = document.getElementById('maritalStatus').value;
        const previousMaritalStatus = document.getElementById('previousMaritalStatus').value;
        const nonCitizenStatus = document.getElementById('nonCitizenStatus').value;
        const studentStatus = document.getElementById('studentStatus').value;

        // Calculate age in Years, Months, and Days
        const calculateAge = (dob) => {
            const birthDate = new Date(dob);
            const today = new Date();
            today.setDate(today.getDate() - 1); // Subtract 1 day from the current date
            let years = today.getFullYear() - birthDate.getFullYear();
            let months = today.getMonth() - birthDate.getMonth();
            let days = today.getDate() - birthDate.getDate();

            if (days < 0) {
                months -= 1;
                days += new Date(today.getFullYear(), today.getMonth(), 0).getDate();
            }
            if (months < 0) {
                years -= 1;
                months += 12;
            }

            return { years, months, days };
        };

        const age = calculateAge(dob);

        // Gather answers to modal questions
        const modalQuestions = [
            { id: 'disability', elements: ['modal-disability-yes', 'modal-disability-no'] },
            { id: 'medicare', elements: ['modal-medicare-yes', 'modal-medicare-no'] },
            { id: 'medicaid', elements: ['modal-medicaid-yes', 'modal-medicaid-no'] },
            { id: 'student', elements: ['modal-student-yes', 'modal-student-no'] },
            { id: 'meals', elements: ['modal-meals-yes', 'modal-meals-no'] },
            { id: 'citizen', elements: ['modal-citizen-yes', 'modal-citizen-no'] }
        ];

        const answers = {};
        modalQuestions.forEach((question) => {
            question.elements.forEach((elementId) => {
                const element = document.getElementById(elementId);
                if (element && element.classList.contains('selected')) {
                    answers[question.id] = element.getAttribute('data-value');
                }
            });
        });

        // Set nonCitizenStatus to "citizen" if citizen is "yes"
        if (answers.citizen === 'yes') {
            answers.nonCitizenStatus = 'citizen';
        }

        // Set studentStatus to "not student" if student is "no"
        if (answers.student === 'no') {
            answers.studentStatus = 'notstudent';
        }

        // Prepare the updated data
        const updatedMemberData = {
            householdMemberId: memberId,
            firstName,
            middleInitial,
            lastName,
            dob,
            socialSecurityNumber,
            legalSex,
            age: `${age.years} Years, ${age.months} Months, ${age.days} Days`,
            maritalStatus,
            previousMaritalStatus,
            studentStatus,
            nonCitizenStatus,
            ...answers,
        };

        // If nonCitizenStatus is "ineligible non-citizen", set meals to "no"
        if (nonCitizenStatus.toLowerCase() === 'ineligible non-citizen') {
            updatedMemberData.meals = 'no';
        }

        // If studentStatus is "ineligible student", set meals to "no"
        if (studentStatus.toLowerCase() === 'ineligible student') {
            updatedMemberData.meals = 'no';
        }

        // Send the updated data to the backend
        const response = await fetch(`/update-household-member`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                clientId,
                member: updatedMemberData,
            }),
        });

        if (response.ok) {
            console.log('Household member updated successfully:', updatedMemberData);

            // Reload the household members to reflect the changes
            await loadSavedData();

            // Close the modal and reset the form
            const householdMemberModal = document.getElementById('householdMemberModal');
            householdMemberModal.style.display = 'none';
            document.getElementById('householdMemberForm').reset();
        } else {
            console.error('Failed to update household member.');
        }
    } catch (error) {
        console.error('Error updating household member:', error);
    }
}

async function deleteHouseholdMember(memberId) {
    const clientId = getQueryParam('id'); // Retrieve the client ID from the URL
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }

    try {
        // Confirm deletion with the user
        const confirmDelete = confirm('Are you sure you want to delete this household member? This action cannot be undone.');
        if (!confirmDelete) return;

        // Send the delete request to the backend
        const response = await fetch(`/delete-household-member`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                clientId,
                memberId,
            }),
        });

        if (response.ok) {
            console.log(`Household member with ID ${memberId} deleted successfully.`);

            // Reload the household members to reflect the changes
            await loadSavedData();
        } else {
            console.error('Failed to delete household member.');
        }
    } catch (error) {
        console.error('Error deleting household member:', error);
    }
}

async function updateAllMembers(questionId, value) {
    const clientId = getQueryParam('id'); // Retrieve the client ID from the URL
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }

    try {
        // Fetch the current household members
        const response = await fetch(`/get-client/${clientId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch client data: ${response.statusText}`);
        }
        const clientData = await response.json();

        if (clientData && clientData.householdMembers) {
            console.log(`Updating all members for ${questionId} to ${value}`); // Debugging log

            const updatedMembers = clientData.householdMembers.map((member) => {
                const updatedMember = {
                    ...member,
                    [questionId]: value, // Update the specific question with the new value
                };

                // If residenceStatus is "other", set previousMaritalStatus to "N/A"
                if (questionId === 'residenceStatus' && value === 'other') {
                    updatedMember.previousMaritalStatus = 'N/A';
                }

                return updatedMember;
            });

            if (questionId === 'residenceStatus' && value !== 'other') {
                // If residenceStatus is not "other", reset previousMaritalStatus to an empty string
                updatedMembers.forEach((member) => {
                    member.previousMaritalStatus = '';
                });
            }

            console.log('Updated members data to send:', updatedMembers); // Debugging log

            // Send the updated members to the backend
            const updateResponse = await fetch(`/update-household-members`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    clientId,
                    members: updatedMembers,
                }),
            });

            if (updateResponse.ok) {
                console.log(`Successfully updated all members for ${questionId} to ${value}`);
                await loadSavedData(); // Reload the data to reflect changes
            } else {
                console.error(`Failed to update all members for ${questionId}:`, updateResponse.statusText);
            }
        } else {
            console.error('No household members found to update.');
        }
    } catch (error) {
        console.error(`Error updating all members for ${questionId}:`, error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const citizenYes = document.getElementById('modal-citizen-yes');
    const citizenNo = document.getElementById('modal-citizen-no');
    const nonCitizenStatusContainer = document.getElementById('nonCitizenStatusContainer');
    const nonCitizenStatus = document.getElementById('nonCitizenStatus');
    const mealsQuestion = document.getElementById('mealsQuestion');

    let citizenshipStatus = null;

    citizenYes.addEventListener('click', () => {
        citizenshipStatus = 'uscitizen';
        nonCitizenStatusContainer.style.display = 'none';
        mealsQuestion.style.display = 'block'; // Show the meals question
        console.log('Citizenship status saved:', citizenshipStatus);
    });

    citizenNo.addEventListener('click', () => {
        citizenshipStatus = 'noncitizen';
        nonCitizenStatusContainer.style.display = 'block';
    });

    nonCitizenStatus.addEventListener('change', () => {
        const selectedStatus = nonCitizenStatus.value;
        console.log('Non-citizenship status selected:', selectedStatus);

        // Hide the mealsQuestion if "Ineligible Non-Citizen" is selected
        if (selectedStatus.toLowerCase() === 'ineligible non-citizen') {
            mealsQuestion.style.display = 'none';
        } else {
            mealsQuestion.style.display = 'block';
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const studentYes = document.getElementById('modal-student-yes');
    const studentNo = document.getElementById('modal-student-no');
    const studentStatusContainer = document.getElementById('studentStatusContainer');
    const studentStatus = document.getElementById('studentStatus');
    const mealsQuestion = document.getElementById('mealsQuestion');

    let studentEnrollmentStatus = null;

    studentNo.addEventListener('click', () => {
        studentEnrollmentStatus = 'student';
        studentStatusContainer.style.display = 'none';
        mealsQuestion.style.display = 'block'; // Show the meals question
        console.log('Student status saved:', studentEnrollmentStatus);
    });

    studentYes.addEventListener('click', () => {
        studentEnrollmentStatus = 'nonstudent';
        studentStatusContainer.style.display = 'block';
    });

    studentStatus.addEventListener('change', () => {
        const selectedStatus = studentStatus.value;
        console.log('Student status selected:', selectedStatus);

        // Hide the mealsQuestion if "Ineligible Student" is selected
        if (selectedStatus.toLowerCase() === 'ineligible student') {
            mealsQuestion.style.display = 'none';
        } else {
            mealsQuestion.style.display = 'block';
        }

        // Hide the studentStatusContainer if there is no value
        if (!selectedStatus) {
            studentStatusContainer.style.display = 'none';
        }
    });

    // Initial check to hide studentStatusContainer if no value is set
    if (!studentStatus.value) {
        studentStatusContainer.style.display = 'none';
    }
});

async function saveLiheapSelection(selection) {
    const clientId = getQueryParam('id');
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }

    const requestBody = {
        clientId,
        clientData: {
            liheapEnrollment: selection
        }
    };

    try {
        const response = await fetch(`/update-client`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (response.ok) {
            console.log('LIHEAP selection saved successfully:', selection);

            const residenceStatusContainer = document.getElementById('residenceStatusCurrent-container');
            const heatingCostContainer = document.getElementById('heatingCost-container');
            const subsidizedHousingContainer = document.getElementById('subsidizedHousing-container');
            const heatingCrisisContainer = document.getElementById('heatingCrisis-container');
            const residenceStatusOptions = document.querySelectorAll('[id^="residenceStatusCurrent-"]');
            const heatingCostOptions = document.querySelectorAll('[id^="heatingCost-"]'); // Fixed: Use querySelectorAll
            const subsidizedHousingOptions = document.querySelectorAll('[id^="subsidizedHousing-"]'); // Fixed: Use querySelectorAll
            const heatingCrisisOptions = document.querySelectorAll('[id^="heatingCrisis-"]');

            // Fetch the updated client data
            const updatedClientResponse = await fetch(`/get-client/${clientId}`);
            if (updatedClientResponse.ok) {
                const updatedClient = await updatedClientResponse.json();
                const heatingCrisis = updatedClient?.heatingCrisis;

                if (selection === 'yes' && heatingCrisis === 'no') {
                    residenceStatusContainer.style.display = 'none';
                    heatingCostContainer.style.display = 'none';
                    subsidizedHousingContainer.style.display = 'none';
                    await saveClientUpdate(clientId, 'residenceStatusCurrent', null);
                    await saveClientUpdate(clientId, 'heatingCost', null);
                    await saveClientUpdate(clientId, 'subsidizedHousing', null);
                    residenceStatusOptions.forEach(option => option.classList.remove('selected'));
                    heatingCostOptions.forEach(option => option.classList.remove('selected'));
                    subsidizedHousingOptions.forEach(option => option.classList.remove('selected'));
                } else {
                    // Show the residenceStatusCurrent container
                    residenceStatusContainer.style.display = 'block';
                    heatingCostContainer.style.display = 'block';
                    subsidizedHousingContainer.style.display = 'block';
                    heatingCrisisContainer.style.display = 'block';
                }

                // Handle the "notinterested" case
                if (selection === 'notinterested') {
                    heatingCrisisContainer.style.display = 'none';
                    residenceStatusContainer.style.display = 'none';
                    heatingCostContainer.style.display = 'none';
                    subsidizedHousingContainer.style.display = 'none';

                    await saveClientUpdate(clientId, 'heatingCrisis', null);
                    await saveClientUpdate(clientId, 'residenceStatusCurrent', null);
                    await saveClientUpdate(clientId, 'heatingCost', null);
                    await saveClientUpdate(clientId, 'subsidizedHousing', null);
                    heatingCrisisOptions.forEach(option => option.classList.remove('selected'));
                    heatingCostOptions.forEach(option => option.classList.remove('selected'));
                    subsidizedHousingOptions.forEach(option => option.classList.remove('selected'));
                    residenceStatusOptions.forEach(option => option.classList.remove('selected'));
                    residenceStatusOptions.forEach(option => option.classList.remove('selected'));
                } else {
                    heatingCrisisContainer.style.display = 'block';
                }

                // Trigger LIHEAP eligibility check
                if (window.eligibilityChecks && window.eligibilityChecks.LIHEAPEligibilityCheck) {
                    await window.eligibilityChecks.LIHEAPEligibilityCheck(updatedClient);
                } else {
                    console.error('LIHEAPEligibilityCheck function not found.');
                }

                // Trigger display function
                if (window.eligibilityChecks && window.eligibilityChecks.displayLIHEAPHouseholds) {
                    await window.eligibilityChecks.displayLIHEAPHouseholds();
                } else {
                    console.error('displayLIHEAPHouseholds function not found.');
                }
            } else {
                console.error('Failed to fetch updated client data.');
            }
        } else {
            const error = await response.json();
            console.error('Error saving LIHEAP selection:', error);
        }
    } catch (error) {
        console.error('Error saving LIHEAP selection:', error);
    }
}

async function loadHouseholdMembers() {
    const clientId = getQueryParam('id'); // Retrieve the client ID from the URL
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return [];
    }

    try {
        // Fetch the client data from the backend
        const response = await fetch(`/get-client/${clientId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch client data: ${response.statusText}`);
        }

        const clientData = await response.json();

        if (!clientData || !clientData.householdMembers) {
            console.error('No household members found for this client.');
            return [];
        }

        console.log('Household members:', clientData.householdMembers);
        return clientData.householdMembers;
    } catch (error) {
        console.error('Error loading household members:', error);
        return [];
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const citizenYes = document.getElementById('modal-citizen-yes');
    const citizenNo = document.getElementById('modal-citizen-no');
    const nonCitizenStatusContainer = document.getElementById('nonCitizenStatusContainer');
    const nonCitizenStatus = document.getElementById('nonCitizenStatus');
    const mealsQuestion = document.getElementById('mealsQuestion');

    // Initialize dropdown visibility based on the current citizen value
    const initializeCitizenStatus = () => {
        if (citizenYes.classList.contains('selected')) {
            // If "Yes" is selected for citizen
            nonCitizenStatusContainer.style.display = 'none';
            mealsQuestion.style.display = 'block'; // Show the meals question
        } else if (citizenNo.classList.contains('selected')) {
            // If "No" is selected for citizen
            nonCitizenStatusContainer.style.display = 'block';
        }
    };

    // Call the initialization function on page load
    initializeCitizenStatus();

    // Add event listeners for clicks
    citizenYes.addEventListener('click', () => {
        nonCitizenStatusContainer.style.display = 'none';
        mealsQuestion.style.display = 'block'; // Show the meals question
        console.log('Citizenship status saved: uscitizen');
    });

    citizenNo.addEventListener('click', () => {
        nonCitizenStatusContainer.style.display = 'block';
        console.log('Citizenship status saved: noncitizen');
    });

    nonCitizenStatus.addEventListener('change', () => {
        const selectedStatus = nonCitizenStatus.value;
        console.log('Non-citizenship status selected:', selectedStatus);

        // Hide the mealsQuestion if "Ineligible Non-Citizen" is selected
        if (selectedStatus.toLowerCase() === 'ineligible non-citizen') {
            mealsQuestion.style.display = 'none';
        } else {
            mealsQuestion.style.display = 'block';
        }
    });
});