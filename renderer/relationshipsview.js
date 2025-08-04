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
        unrelated: 'unrelated'
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
            // Sort members to show headOfHousehold: true first
            members.sort((a, b) => {
                if (a.headOfHousehold === b.headOfHousehold) return 0;
                return a.headOfHousehold ? -1 : 1;
            });
    
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
                            <select class="relationship-dropdown" data-member-id="${member.householdMemberId}" data-related-member-id="${otherMember.householdMemberId}" disabled>
                                <option value="">Select Relationship</option>
                                <option value="spouse">Spouse</option>
                                <option value="child">Child</option>
                                <option value="parent">Parent</option>
                                <option value="sibling">Sibling</option>
                                <option value="grandparent">Grandparent</option>
                                <option value="grandchild">Grandchild</option>
                                <option value="aunt/uncle">Aunt/Uncle</option>
                                <option value="niece/nephew">Niece/Nephew</option>
                                <option value="cousin">Cousin</option>
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

async function saveRelationshipsData() {
    // Implement logic to save relationships data if needed
    console.log("Saving relationships data...");
}