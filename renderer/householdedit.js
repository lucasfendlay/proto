document.addEventListener('DOMContentLoaded', async () => {
    await loadSavedData(); // Load and display saved data
});

function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// Function to check for existing members and dynamically add the button
async function checkAndAddSelfButton(clientData) {
    const householdMemberContainer = document.getElementById('householdMemberContainer');

    // Remove the button if it already exists
    const existingButton = document.getElementById('add-self-button');
    if (existingButton) {
        existingButton.remove();
    }

    // Check if a member with the same first and last name exists
    const existingMember = clientData.householdMembers?.some(
        (member) =>
            member.firstName === clientData.firstName &&
            member.lastName === clientData.lastName
    );

    if (!existingMember) {
        const addSelfButton = document.createElement('button');
        addSelfButton.id = 'add-self-button';
        addSelfButton.textContent = 'Add Primary Client as Household Member';
        addSelfButton.style.marginBottom = '10px';
        addSelfButton.style.border = '1px solid black'; // Add a solid black border
addSelfButton.style.transition = 'background-color 0.3s ease, color 0.3s ease'; // Smooth transition for hover effects

// Add hover effect using JavaScript
addSelfButton.addEventListener('mouseover', () => {
    addSelfButton.style.backgroundColor = '#0056b3'; // Light gray background on hover
    addSelfButton.style.color = 'white'; // Ensure text color is black
});

addSelfButton.addEventListener('mouseout', () => {
    addSelfButton.style.backgroundColor = ''; // Reset background color
    addSelfButton.style.color = ''; // Reset text color
});

        // Add the button above the householdMemberContainer
        householdMemberContainer.parentNode.insertBefore(addSelfButton, householdMemberContainer);

        // Add click event listener to the button
        addSelfButton.addEventListener('click', async () => {
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
        
                // Set the modal to "Add" mode
                setModalHeader('add');
        
                // Prepare the modal
                await prepareHouseholdMemberModal();
        
                // Autofill first and last name
                document.getElementById('firstName').value = clientData.firstName;
                document.getElementById('lastName').value = clientData.lastName;
        
                // Set up the button for adding a new member
                setupAddOrUpdateButton(false);
        
                // Show the modal
                document.getElementById('householdMemberModal').style.display = 'block';
            } catch (error) {
                console.error('Error fetching client data:', error);
            }
        });
    }
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

            // Display household size
            const householdSizeDropdown = document.getElementById('household-size');
            if (householdSizeDropdown && clientData.householdSize) {
                householdSizeDropdown.value = clientData.householdSize; // Set the dropdown value
            }

            // Display all previously saved household members
            if (clientData.householdMembers && Array.isArray(clientData.householdMembers)) {
                householdMemberContainer.innerHTML = ''; // Clear existing members
                clientData.householdMembers.forEach((member) => {
                    const memberElement = document.createElement('div');
                    memberElement.classList.add('household-member'); // Add a class for styling
                    memberElement.innerHTML = `
<p class="household-member-info"><strong>Name:</strong> ${capitalizeFirstLetter(member.firstName || '')} ${member.middleInitial ? capitalizeFirstLetter(member.middleInitial || '') : ''} ${capitalizeFirstLetter(member.lastName || '')}</p>    <p class="household-member-info"><strong>DOB:</strong> ${member.dob}</p>
    <p class="household-member-info"><strong>Age:</strong> ${member.age}</p>
    <p class="household-member-info"><strong>Marital Status:</strong> ${capitalizeFirstLetter(member.maritalStatus)}</p>
    ${member.previousMaritalStatus && member.previousMaritalStatus.toLowerCase() !== 'n/a' ? 
        `<p class="household-member-info"><strong>Previous Marital Status:</strong> ${capitalizeFirstLetter(member.previousMaritalStatus)}</p>` 
        : ''}
            <p class="household-member-info"><strong>Disability:</strong> ${capitalizeFirstLetter(member.disability)}</p>
    <p class="household-member-info"><strong>Medicare:</strong> ${capitalizeFirstLetter(member.medicare)}</p>
    <p class="household-member-info"><strong>Medicaid:</strong> ${capitalizeFirstLetter(member.medicaid)}</p>
    <p class="household-member-info"><strong>US Citizen:</strong> ${capitalizeFirstLetter(member.citizen)}</p>
${member.nonCitizenStatus && member.nonCitizenStatus.toLowerCase() !== 'citizen' 
    ? `<p class="household-member-info"><strong>Non-Citizen Status:</strong> ${capitalizeFirstLetter(member.nonCitizenStatus)}</p>` 
    : ''}
    <p class="household-member-info"><strong>Student:</strong> ${capitalizeFirstLetter(member.student)}</p>
${member.studentStatus.toLowerCase() !== 'notstudent' ? `<p class="household-member-info"><strong>Student Status:</strong> ${capitalizeFirstLetter(member.studentStatus)}</p>` : ''}    <p class="household-member-info"><strong>Included in SNAP Household:</strong> ${capitalizeFirstLetter(member.meals)}</p>
    <div class="button-container">
        <button class="edit-member-button" data-member-id="${member.householdMemberId}">Edit</button>
        <button class="delete-member-button" data-member-id="${member.householdMemberId}" style="color: white; background-color: red" 
    onmouseover="this.style.backgroundColor='darkred'" 
    onmouseout="this.style.backgroundColor='red'">Delete</button>
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
            
                // Add event listeners to all "Delete" buttons
                document.querySelectorAll('.delete-member-button').forEach((button) => {
                    button.addEventListener('click', async (event) => {
                        const memberId = event.target.getAttribute('data-member-id');
                        await deleteHouseholdMember(memberId); // Call the delete function
                    });
                });
            }

            // Check and add the "Add Self" button
            await checkAndAddSelfButton(clientData);

            // Load household members before running eligibility checks
        const members = await loadHouseholdMembers();

        // Trigger eligibility checks
        await window.eligibilityChecks.PACEEligibilityCheck(members);
        await window.eligibilityChecks.LISEligibilityCheck(members);
        await window.eligibilityChecks.MSPEligibilityCheck(members);
        await window.eligibilityChecks.PTRREligibilityCheck(members);
        await window.eligibilityChecks.SNAPEligibilityCheck(members);

        // Optionally update the UI
        await window.eligibilityChecks.updateAndDisplayHouseholdMembers();
        await window.eligibilityChecks.displaySNAPHouseholds();
        }
    } catch (error) {
        console.error('Error loading saved data:', error);
    }
}

function capitalizeFirstLetter(string) {
    if (!string) return ''; // Return an empty string if input is falsy
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// Function to handle saving the selection
async function saveSelectionToClient(questionId, value) {
    const clientId = getQueryParam('id'); // Retrieve the client ID from the URL
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }

    try {
        // Prepare the data to update
        const updateData = {};
        updateData[questionId] = value;

        // Send the update to the backend
        const response = await fetch(`/update-client`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                clientId,
                clientData: updateData,
            }),
        });

        if (!response.ok) {
            throw new Error(`Failed to save ${questionId}: ${response.statusText}`);
        }

        console.log(`Saved ${questionId}: ${value} for client ${clientId}`);

        await loadSavedData();
    } catch (error) {
        console.error(`Error saving ${questionId}: ${value}`, error);
    }
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
            'maritalStatus',
            'previousMaritalStatus',
            'studentStatus',
            'nonCitizenStatus'
        ];
        modalFields.forEach((fieldId) => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = ''; // Clear the input field
            }
        });

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

            // Hide or show the previousMaritalStatus dropdown based on residenceStatus
            if (clientData.residenceStatus === 'other') {
                previousMaritalStatusContainer.style.display = 'none'; // Hide the dropdown
            } else {
                previousMaritalStatusContainer.style.display = 'block'; // Show the dropdown
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
            alert('The number of household members cannot exceed the selected household size.');
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
        const firstName = document.getElementById('firstName').value.trim();
        const middleInitial = document.getElementById('middleInitial').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const dob = document.getElementById('dob').value; // Date of birth
        const maritalStatus = document.getElementById('maritalStatus').value;
        const previousMaritalStatus = document.getElementById('previousMaritalStatus').value;
        const studentStatus = document.getElementById('studentStatus').value;
        const nonCitizenStatus = document.getElementById('nonCitizenStatus').value;

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

        // Set nonCitizenStatus to "citizen" if citizen is "yes"
        if (answers.citizen === 'yes') {
            answers.nonCitizenStatus = 'citizen';
        }

        // Set studentStatus to "not student" if student is "no"
        if (answers.student === 'no') {
            answers.studentStatus = 'notstudent';
        }

        // Prepare the data to save
        const householdMemberData = {
            householdMemberId: crypto.randomUUID(), // Generate a unique ID
            firstName,
            middleInitial,
            lastName,
            dob,
            age: `${age.years} Years, ${age.months} Months, ${age.days} Days`,
            maritalStatus,
            previousMaritalStatus,
            nonCitizenStatus,
            studentStatus,
            ...answers,
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
    const addMemberButton = document.getElementById('add-member');
    const nonCitizenStatusContainer = document.getElementById('nonCitizenStatusContainer');
    const nonCitizenStatus = document.getElementById('nonCitizenStatus');
    const studentStatusContainer = document.getElementById('studentStatusContainer');
    const studentStatus = document.getElementById('studentStatus');
    const mealsQuestion = document.getElementById('mealsQuestion');
    const previousMaritalStatusDropdown = document.getElementById('previousMaritalStatus'); // Get the dropdown

    // Step 1: Prepare the modal logic to identify visible questions
    await prepareHouseholdMemberModal(); // Resets modal and prepares it based on client data

    // Step 2: Autofill the modal with the member's data
    document.getElementById('firstName').value = member.firstName || '';
    document.getElementById('middleInitial').value = member.middleInitial || '';
    document.getElementById('lastName').value = member.lastName || '';
    document.getElementById('dob').value = member.dob || '';
    document.getElementById('maritalStatus').value = member.maritalStatus || '';

    // Step 3: Autofill the previousMaritalStatus dropdown
    if (previousMaritalStatusDropdown) {
        previousMaritalStatusDropdown.value = member.previousMaritalStatus || ''; // Set the dropdown value
    }

    if (member.student === 'yes') {
        studentStatusContainer.style.display = 'block'; // Show the student status dropdown
        if (member.studentStatus) {
            studentStatus.value = member.studentStatus; // Select the saved value
        }

        // Hide the mealsQuestion if "Ineligible Student" is selected
        if (member.studentStatus.toLowerCase() === 'ineligible student') {
            mealsQuestion.style.display = 'none';
        }
    } else {
        studentStatusContainer.style.display = 'none'; // Hide the student status dropdown
        studentStatus.value = ''; // Reset the student status value
        mealsQuestion.style.display = 'block'; // Ensure mealsQuestion is visible for non-students
    }

    if (member.citizen === 'no') {
        nonCitizenStatusContainer.style.display = 'block'; // Show the dropdown
        if (member.nonCitizenStatus) {
            nonCitizenStatus.value = member.nonCitizenStatus; // Select the saved value

            // Hide the mealsQuestion if "Ineligible Non-Citizen" is selected
            if (member.nonCitizenStatus.toLowerCase() === 'ineligible non-citizen') {
                mealsQuestion.style.display = 'none';
            } else {
                mealsQuestion.style.display = 'block';
            }
        }
    } else {
        nonCitizenStatusContainer.style.display = 'none'; // Hide the dropdown for citizens
        mealsQuestion.style.display = 'block'; // Ensure mealsQuestion is visible for citizens
    }

    // Step 4: Highlight the selected options for modal questions
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

                // Add click event listener to allow changing the selection
                element.addEventListener('click', () => {
                    // Remove 'selected' class from all elements in the group
                    question.elements.forEach((id) => {
                        const siblingElement = document.getElementById(id);
                        if (siblingElement) {
                            siblingElement.classList.remove('selected');
                        }
                    });

                    // Add 'selected' class to the clicked element
                    element.classList.add('selected');
                });
            }
        });
    });

    // Set up the button for updating the member
    setupAddOrUpdateButton(true, member);

    // Show the modal
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

        if (clientData && clientData.householdMembers) {
            console.log('Loaded household members:', clientData.householdMembers);
            return clientData.householdMembers; // Return the list of household members
        } else {
            console.warn('No household members found.');
            return [];
        }
    } catch (error) {
        console.error('Error loading household members:', error);
        return [];
    }
}