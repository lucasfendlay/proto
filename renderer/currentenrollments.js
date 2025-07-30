document.addEventListener('DOMContentLoaded', async function () {
    // Initialize window.eligibilityChecks
    window.eligibilityChecks = {
        async loadHouseholdMembers() {
            console.log('Loading household members...');
            return []; // Replace with actual logic
        },
        async PACEEligibilityCheck(members) {
            console.log('Running PACE eligibility check...');
        },
        async LISEligibilityCheck(members) {
            console.log('Running LIS eligibility check...');
        },
        async MSPEligibilityCheck(members) {
            console.log('Running MSP eligibility check...');
        },
        async PTRREligibilityCheck(members) {
            console.log('Running PTRR eligibility check...');
        },
        async updateAndDisplayHouseholdMembers() {
            console.log('Updating and displaying household members...');
        }
    };

    const clientId = getQueryParameter('id'); // Get the client ID from the query parameter

    async function loadHouseholdMembers() {
        try {
            // Use the correct backend handler to fetch client data
            const response = await fetch(`/get-client/${clientId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch client data: ${response.statusText}`);
            }

            const client = await response.json();

            if (!client || !client.householdMembers) {
                console.error('No household members found for this client.');
                return [];
            }

            return client.householdMembers; // Return the household members array
        } catch (error) {
            console.error('Error loading household members:', error);
            return [];
        }
    }

    async function addHouseholdMemberToUI(member) {
        const householdMemberContainer = document.getElementById('householdMemberContainer');
        const memberDiv = document.createElement('div');
        memberDiv.classList.add('household-member');
        memberDiv.setAttribute('data-id', member.householdMemberId);

        // Add styles to make the container narrower
        householdMemberContainer.style.minWidth = '600px';
        householdMemberContainer.style.maxWidth = '600px';
        householdMemberContainer.style.margin = '0 auto';

        const dob = new Date(member.dob);
        const age = member.age;
        const client = await fetch(`/get-client/${clientId}`).then(res => res.json());

        const [years, months, days] = age
            .replace(/Years|Months|Days|,/g, '')
            .trim()
            .split(/\s+/)
            .map(value => parseInt(value.trim()) || 0);

        const isOnMedicare = member.medicare === 'yes';
        const isOnMedicaid = member.medicaid === 'yes';
        const isDisabled = member.disability === 'yes';
console.log('Disability:', member.disability, 'Is Disabled:', isDisabled);

const isWidowed = member.previousMaritalStatus && member.previousMaritalStatus.toLowerCase() === 'widowed';
console.log('Previous Marital Status:', member.previousMaritalStatus, 'Is Widowed:', isWidowed);

const residenceStatus = client.residenceStatus ? client.residenceStatus.toLowerCase() : 'other';
console.log('Residence Status:', member.residenceStatus, 'Processed Residence Status:', residenceStatus);

        memberDiv.innerHTML = `
            <p>Name: <strong>${member.firstName} ${member.middleInitial || ''} ${member.lastName}</strong></p>
            <p>Date of Birth: ${member.dob}</p>
            <p>Marital Status: ${member.maritalStatus}</p>
        `;

        let hasQuestions = false;

        // Conditional logic for PACE
        if (years >= 65 || (years === 64 && months === 11 && days > 0) && !isOnMedicaid) {
            hasQuestions = true;
            memberDiv.innerHTML += `
                <div class="selection-box">
                    <label>Is this person currently enrolled in PACE?</label>
                    <div data-value="yes" class="selection-option">Yes</div>
                    <div data-value="no" class="selection-option">No</div>
                    <div data-value="notinterested" class="selection-option">Not Interested</div>
                </div>
            `;
        } else {
            await saveDefaultSelection(clientId, member.householdMemberId, "Is this person currently enrolled in PACE?", "Not Interested");
        }

        // Conditional logic for LIS and MSP
        if (isOnMedicare && !isOnMedicaid) {
            hasQuestions = true;
            memberDiv.innerHTML += `
                <div class="selection-box">
                    <label>Is this person currently enrolled in LIS/ Extra Help?</label>
                    <div data-value="yes" class="selection-option">Yes</div>
                    <div data-value="no" class="selection-option">No</div>
                    <div data-value="notinterested" class="selection-option">Not Interested</div>
                </div>
                <div class="selection-box">
                    <label>Is this person currently enrolled in the Medicare Savings Program?</label>
                    <div data-value="yes" class="selection-option">Yes</div>
                    <div data-value="no" class="selection-option">No</div>
                    <div data-value="notinterested" class="selection-option">Not Interested</div>
                </div>
            `;
        } else {
            await saveDefaultSelection(clientId, member.householdMemberId, "Is this person currently enrolled in LIS?", "Not Interested");
            await saveDefaultSelection(clientId, member.householdMemberId, "Is this person currently enrolled in MSP?", "Not Interested");
        }

        // Conditional logic for PTRR
        if (
            ((years >= 18 && isDisabled) && residenceStatus !== 'other') ||
            ((years >= 50 && isWidowed) && residenceStatus !== 'other') ||
            (years >= 65 && residenceStatus !== 'other')
        ) {
            console.log('PTRR Condition Met:', {
                years,
                isDisabled,
                isWidowed,
                residenceStatus
            });
        
            try {
                const response = await fetch(`/get-client/${clientId}`);
                const client = await response.json();
        
                console.log('Client Response:', client);
        
                if (client && client.residenceStatus === 'other') {
                    console.log('Skipping PTRR question because residenceStatus is "other".');
                    await saveDefaultSelection(clientId, member.householdMemberId, "Has this person already applied for PTRR this year?", "Not Interested");
                } else {
                    hasQuestions = true;
                    console.log('Appending PTRR question to the DOM.');
                    memberDiv.innerHTML += `
                        <div class="selection-box">
                            <label>Has this person already applied for PTRR this year?</label>
                            <div data-value="yes" class="selection-option">Yes</div>
                            <div data-value="no" class="selection-option">No</div>
                            <div data-value="notinterested" class="selection-option">Not Interested</div>
                        </div>
                    `;
                }
            } catch (error) {
                console.error('Error fetching client data for PTRR logic:', error);
            }
        } else {
            console.log('PTRR Condition Not Met:', {
                years,
                isDisabled,
                isWidowed,
                residenceStatus
            });
            await saveDefaultSelection(clientId, member.householdMemberId, "Has this person already applied for PTRR this year?", "Not Interested");
        }

        // Only append the member to the container if they have applicable questions
        if (hasQuestions) {
            householdMemberContainer.appendChild(memberDiv);

            // Recall saved selections and simulate clicks
            const response = await fetch(`/get-household-member-selections/${clientId}/${member.householdMemberId}`);
            const savedSelections = await response.json();

            memberDiv.querySelectorAll('.selection-box').forEach(box => {
                const question = box.querySelector('label').innerText.trim();
                const savedValue = savedSelections[question];

                if (savedValue) {
                    const optionToSelect = box.querySelector(`.selection-option[data-value="${savedValue}"]`);
                    if (optionToSelect) {
                        optionToSelect.classList.add('selected');
                    }
                }
            });

            // Modify the event listener for saving selections
            memberDiv.querySelectorAll('.selection-option').forEach(option => {
                option.addEventListener('click', async function () {
                    const parent = this.parentElement;
                    parent.querySelectorAll('.selection-option').forEach(sibling => sibling.classList.remove('selected'));
                    this.classList.add('selected');

                    const question = parent.querySelector('label').innerText.trim();
                    const value = this.dataset.value;

                    // Save the selection immediately
                    await fetch('/save-household-member-selection', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            clientId,
                            memberId: member.householdMemberId,
                            question,
                            value
                        })
                    });

                    console.log(`Saved: Question = "${question}", Value = "${value}"`);

                    // Trigger eligibility checks after saving
                    const members = await window.eligibilityChecks.loadHouseholdMembers();
                    await window.eligibilityChecks.PACEEligibilityCheck(members);
                    await window.eligibilityChecks.LISEligibilityCheck(members);
                    await window.eligibilityChecks.MSPEligibilityCheck(members);
                    await window.eligibilityChecks.PTRREligibilityCheck(members);

                    // Optionally update the UI
                    await window.eligibilityChecks.updateAndDisplayHouseholdMembers();
                });
            });

            return true; // Member has questions and was appended
        }

        return false; // Member has no questions
    }

    async function displayHouseholdMembers() {
        const householdMemberContainer = document.getElementById('householdMemberContainer');
        householdMemberContainer.innerHTML = '';

        const members = await loadHouseholdMembers();
        let appendedMembers = 0;

        if (members.length === 0) {
            const noMembersMessage = document.createElement('p');
            noMembersMessage.textContent = 'No household members found.';
            householdMemberContainer.appendChild(noMembersMessage);
        } else {
            for (const member of members) {
                const wasAppended = await addHouseholdMemberToUI(member);
                if (wasAppended) {
                    appendedMembers++;
                }
            }
        }
    }

    // Helper function to save default selection
    async function saveDefaultSelection(clientId, memberId, question, value) {
        try {
            const response = await fetch('/save-household-member-selection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    clientId,
                    memberId,
                    question,
                    value
                })
            });
    
            if (!response.ok) {
                throw new Error(`Failed to save selection: ${response.statusText}`);
            }
    
            console.log(`Default saved: Question = "${question}", Value = "${value}"`);
        } catch (error) {
            console.error('Error saving default selection:', error);
        }
    }
    
    // Expose the function globally
    window.saveDefaultSelection = saveDefaultSelection;

    async function checkScreeningStatus() {
        const clientId = getQueryParameter('id'); // Reuse the getQueryParameter function
        if (!clientId) {
            console.error('Client ID not found in query parameters.');
            return;
        }

        try {
            // Use the correct backend handler
            const response = await fetch(`/get-client/${clientId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch client data: ${response.statusText}`);
            }

            const clientData = await response.json();

            // Check if screeningInProgress is true
            if (clientData && clientData.screeningInProgress) {
                document.getElementById('leftSidebarContainer').style.display = 'flex';
            } else {
                document.getElementById('leftSidebarContainer').style.display = 'none';
            }
        } catch (error) {
            console.error('Error fetching client data:', error);
        }
    }

    // Call the function on page load
    window.addEventListener('load', checkScreeningStatus);

    // Helper function to get query parameters
    function getQueryParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    // Display household members on page load
    await displayHouseholdMembers();
});