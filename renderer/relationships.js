document.addEventListener('DOMContentLoaded', async function () {
    const clientId = getQueryParameter('id'); // Get the client ID from the query parameter

    // Define reciprocal relationships
    const reciprocalRelationshipMap = {
        spouse: 'spouse',
        parent: 'child',
        child: 'parent',
        sibling: 'sibling',
        grandparent: 'grandchild',
        grandchild: 'grandparent',
        'aunt/uncle': 'niece/nephew',
        'niece/nephew': 'aunt/uncle',
        cousin: 'cousin',
        unrelated: 'unrelated',
        'adopted child': 'adoptive parent',
        'adoptive parent': 'adopted child',
        'foster child': 'foster parent',
        'foster parent': 'foster child',
        'step-child': 'step-parent',
        'step-parent': 'step-child',
        guardian: 'ward',
        ward: 'guardian',
        'step-sibling': 'step-sibling',
        'half-sibling': 'half-sibling',
        'other': 'other'
    };

    async function loadHouseholdMembers() {
        const clientId = getQueryParameter('id'); // Retrieve the client ID from the URL
        if (!clientId) {
            console.error('Client ID not found in query parameters.');
            return [];
        }
    
        try {
            // Fetch client data from the backend
            const response = await fetch(`/get-client/${clientId}`);
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

    async function saveRelationship(memberId, relatedMemberId, relationship) {
        const clientId = getQueryParameter('id'); // Retrieve the client ID from the URL
        if (!clientId) {
            console.error('Client ID not found in query parameters.');
            return;
        }
    
        try {
            // Save the relationship in the household member's relationships array
            const relationshipResponse = await fetch(`/update-relationship`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    clientId,
                    memberId,
                    relatedMemberId,
                    relationship,
                }),
            });
    
            if (!relationshipResponse.ok) {
                throw new Error(`Failed to save relationship: ${relationshipResponse.statusText}`);
            }
    
            const members = await loadHouseholdMembers();
    
            const member = members.find((m) => m.householdMemberId === memberId);
            const relatedMember = members.find((m) => m.householdMemberId === relatedMemberId);
    
            if (
                member &&
                member.meals === 'yes' &&
                relatedMember &&
                relatedMember.nonCitizenStatus !== 'Ineligible Non-Citizen' &&
                relatedMember.studentStatus !== 'Ineligible Student'
            ) {
                const memberAge = parseAge(member.age);
                const relatedMemberAge = parseAge(relatedMember.age);
    
                // Check if the relationship is "spouse" and update meals property
                if (relationship === 'spouse') {
                    relatedMember.meals = 'yes';
    
                    // Save the updated meals property for the spouse
                    await fetch(`/update-household-member`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            clientId,
                            memberId: relatedMemberId,
                            updatedData: { meals: 'yes' },
                        }),
                    });
    
                    console.log(`Updated meals for spouse: ${relatedMemberId}`);
                }
    
                // Check for parent/child relationship and age condition
                if ((relationship === 'parent' || relationship === 'child') && relatedMemberAge < 22) {
                    relatedMember.meals = 'yes';
    
                    // Save the updated meals property
                    await fetch(`/update-household-member`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            clientId,
                            memberId: relatedMemberId,
                            updatedData: { meals: 'yes' },
                        }),
                    });
    
                    console.log(`Updated meals for parent/child: ${relatedMemberId}`);
                }

                if ((relationship === 'step-parent' || relationship === 'step-child') && relatedMemberAge < 22) {
                    relatedMember.meals = 'yes';
    
                    // Save the updated meals property
                    await fetch(`/update-household-member`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            clientId,
                            memberId: relatedMemberId,
                            updatedData: { meals: 'yes' },
                        }),
                    });
    
                    console.log(`Updated meals for step-parent/step-child: ${relatedMemberId}`);
                }

                if ((relationship === 'adoptive parent' || relationship === 'adopted child') && relatedMemberAge < 22) {
                    relatedMember.meals = 'yes';

                    // Save the updated meals property
                    await fetch(`/update-household-member`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            clientId,
                            memberId: relatedMemberId,
                            updatedData: { meals: 'yes' },
                        }),
                    });

                    console.log(`Updated meals for adoptive parent/adopted child: ${relatedMemberId}`);
                }

                if ((relationship === 'guardian' || relationship === 'ward') && relatedMemberAge < 18) {
                    relatedMember.meals = 'yes';
    
                    // Save the updated meals property
                    await fetch(`/update-household-member`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            clientId,
                            memberId: relatedMemberId,
                            updatedData: { meals: 'yes' },
                        }),
                    });
    
                    console.log(`Updated meals for guardian/ward: ${relatedMemberId}`);
                }
    
            }
    
            // Trigger eligibility checks
            await window.eligibilityChecks.PACEEligibilityCheck(members);
            await window.eligibilityChecks.LISEligibilityCheck(members);
            await window.eligibilityChecks.MSPEligibilityCheck(members);
            await window.eligibilityChecks.PTRREligibilityCheck(members);
            await window.eligibilityChecks.SNAPEligibilityCheck(members);
    
            // Optionally update the UI
            await window.eligibilityChecks.updateAndDisplayHouseholdMembers();
            await window.eligibilityChecks.displaySNAPHouseholds();
    
            console.log(`Relationship saved: ${memberId} -> ${relatedMemberId}: ${relationship}`);
        } catch (error) {
            console.error('Error saving relationship:', error);
        }
    }
    
    // Helper function to parse age from the format "XX Years, XX Months, XX Days"
    function parseAge(ageString) {
        const yearsMatch = ageString.match(/(\d+)\s*Years/);
        return yearsMatch ? parseInt(yearsMatch[1], 10) : 0;
    }

    async function displayHouseholdMembers() {
        const householdMemberContainer = document.createElement('div');
        householdMemberContainer.classList.add('household-member-container');
    
        // Add styles to make the container narrower
        householdMemberContainer.style.maxWidth = '600px'; // Adjust the width as needed
        householdMemberContainer.style.margin = '0 auto'; // Center the container
    
        document.body.appendChild(householdMemberContainer);
    
        const members = await loadHouseholdMembers();
    
        if (members.length === 0) {
            const noMembersMessage = document.createElement('p');
            noMembersMessage.textContent = 'No household members found.';
            householdMemberContainer.appendChild(noMembersMessage);
        } else {
            members.forEach(member => {
                const memberDiv = document.createElement('div');
                memberDiv.classList.add('household-member');
    
                // Populate member details
                memberDiv.innerHTML = `
                    <p><strong>Name:</strong> ${member.firstName} ${member.middleInitial || ''} ${member.lastName}</p>
                    <p><strong>Date of Birth:</strong> ${member.dob}</p>
                    <p><strong>Marital Status:</strong> ${member.maritalStatus}</p>
                    <div class="relationships-container">
                        <p><strong>Relationships:</strong></p>
                    </div>
                `;
    
                // Add dropdowns for relationships with other members
                const relationshipsContainer = memberDiv.querySelector('.relationships-container');
                members
                    .filter(otherMember => otherMember.householdMemberId !== member.householdMemberId) // Exclude the current member
                    .forEach(otherMember => {
                        const relationshipDiv = document.createElement('div');
                        relationshipDiv.classList.add('relationship-entry');
    
                        relationshipDiv.innerHTML = `
                            <p><strong>${otherMember.firstName} ${otherMember.middleInitial || ''} ${otherMember.lastName}</strong></p>
                            <select class="relationship-dropdown" data-member-id="${member.householdMemberId}" data-related-member-id="${otherMember.householdMemberId}">
                                <option value="">Select Relationship</option>
                                <option value="spouse">Spouse</option>
                                <option value="parent">Parent</option>
                                <option value="child">Child</option>
                                <option value="sibling">Sibling</option>
                                <option value=" half-sibling">Half-Sibling</option>
                                <option value="grandparent">Grandparent</option>
                                <option value="grandchild">Grandchild</option>
                                <option value="step-parent">Step-Parent</option>
                                <option value="step-child">Step-Child</option>
                                <option value="step-sibling">Step-Sibling</option>
                                <option value="aunt/uncle">Aunt/Uncle</option>
                                <option value="niece/nephew">Niece/Nephew</option>
                                <option value="cousin">Cousin</option>
                                <option value="adoptive parent">Adoptive Parent</option>
                                <option value="adopted child">Adopted Child</option>
                                <option value="foster parent">Foster Parent</option>
                                <option value="foster child">Foster Child</option>
                                <option value="guardian">Guardian</option>
                                <option value="ward">Ward</option>
                                <option value="other"> Other Relationship</option>
                                <option value="unrelated">Unrelated</option>
                            </select>
                        `;
    
                        // Prepopulate the dropdown with the saved relationship
                        const dropdown = relationshipDiv.querySelector('.relationship-dropdown');
                        const savedRelationship = member.relationships?.find(r => r.relatedMemberId === otherMember.householdMemberId)?.relationship;
                        if (savedRelationship) {
                            dropdown.value = savedRelationship;
    
                            // Simulate a change event to trigger any associated logic
                            dropdown.dispatchEvent(new Event('change'));
                        }
    
                        // Add event listener to save the relationship when selected
                        dropdown.addEventListener('change', async function () {
                            const relationship = this.value;
                            const memberId = this.dataset.memberId;
                            const relatedMemberId = this.dataset.relatedMemberId;
    
                            // Save the relationship
                            await saveRelationship(memberId, relatedMemberId, relationship);
    
                            // Automatically set the reciprocal relationship
                            const reciprocalRelationship = reciprocalRelationshipMap[relationship];
                            if (reciprocalRelationship) {
                                const relatedDropdown = document.querySelector(
                                    `.relationship-dropdown[data-member-id="${relatedMemberId}"][data-related-member-id="${memberId}"]`
                                );
                                if (relatedDropdown) {
                                    relatedDropdown.value = reciprocalRelationship;
                                    await saveRelationship(relatedMemberId, memberId, reciprocalRelationship);
                                }
                            }
                        });
    
                        relationshipsContainer.appendChild(relationshipDiv);
                    });
    
                householdMemberContainer.appendChild(memberDiv);
            });
        }
    
    
        // Add action buttons below the household member containers
        const actionButtonsDiv = document.createElement('div');
        actionButtonsDiv.classList.add('action-buttons');
        actionButtonsDiv.innerHTML = `
            <button id="save-exit" onclick="redirectToRelationshipsView()">Save and Release Profile</button>
            <button id="save-continue" onclick="GoToCurrentEnrollmentsEdit()">Save and Continue</button>
        `;
        document.body.appendChild(actionButtonsDiv);
    }

    // Display household members on page load
    await displayHouseholdMembers();
});

// Helper function to get query parameters
function getQueryParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

function GoToCurrentEnrollmentsEdit() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `currentenrollmentsedit.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

async function redirectToRelationshipsView() {
    const clientId = getQueryParameter('id'); // Reuse the getQueryParameter function
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }

    const confirmAction = confirm("Are you sure you want to save and release this profile?");
    if (!confirmAction) {
        return;
    }

    const noteContent = "Profile released.";
    const timestamp = new Date().toLocaleString();
    const activeUser = sessionStorage.getItem('loggedInUser'); // Retrieve the active user

    if (!activeUser) {
        console.error("No active user found in sessionStorage.");
        return;
    }

    try {
        // Save relationships data (if applicable)
        await saveRelationshipsData();

        // Add a note about the action
        const note = {
            text: noteContent,
            timestamp: timestamp,
            username: activeUser
        };

        const noteResponse = await fetch(`/add-note-to-client`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ clientId, note }),
        });

        if (!noteResponse.ok) {
            throw new Error(`Failed to add note: ${noteResponse.statusText}`);
        }

        // Update screening status in the database
        const updateResponse = await fetch(`/update-client`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                clientId,
                clientData: { screeningInProgress: false },
            }),
        });

        if (!updateResponse.ok) {
            const error = await updateResponse.json();
            console.error('Error details:', error);

            // Check if the error message indicates no changes were made
            if (error.message === 'No changes were made to the client data.') {
                console.log('No changes were made, but proceeding with redirect.');
                // Redirect to the relationships view page
                window.location.href = `relationshipsview.html?id=${clientId}`;
            } else {
                throw new Error(`Failed to update client: ${error.message}`);
            }
        } else {
            // Redirect to relationships view
            window.location.href = `relationshipsview.html?id=${clientId}`;
        }
    } catch (error) {
        console.error("Error during redirectToRelationshipsView:", error);
    }
}

async function saveRelationshipsData() {
    // Implement logic to save relationships data if needed
    console.log("Saving relationships data...");
}