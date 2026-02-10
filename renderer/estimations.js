document.addEventListener('DOMContentLoaded', async function () {
    const clientId = getQueryParameter('id'); // Get the client ID from the query parameter
    const modal = document.getElementById('shelter-modal'); // Modal element
    const modalTitle = document.getElementById('modal-title'); // Modal title element
    const closeModal = document.getElementById('close-modal'); // Close button
    let currentMemberId = null;

    // Hide the main content until fully loaded
    const mainContent = document.querySelector('.main-content') || document.body;
    mainContent.style.visibility = 'hidden';
    mainContent.style.opacity = '0';
    mainContent.style.transition = 'opacity 0.3s ease';

    function getQueryParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }
    
    // Load household members
    async function loadHouseholdMembers() {
        const clientId = getQueryParameter('id'); // Retrieve the client ID from the URL
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

    async function displayHouseholdMembers(prefetchedMembers) {
        const householdMemberContainer = document.getElementById('household-members-container');
        const members = prefetchedMembers || await loadHouseholdMembers();
    
        householdMemberContainer.innerHTML = ''; // Clear existing content
    
        const clientId = getQueryParameter('id');

    if (members.length === 0) {
        const noMembersMessage = document.createElement('p');
        noMembersMessage.textContent = 'No household members found.';
        householdMemberContainer.appendChild(noMembersMessage);
    } else {
        // Sort members: headOfHousehold: true listed first
        members.sort((a, b) => b.headOfHousehold - a.headOfHousehold);

        members.forEach(member => {
            const memberDiv = document.createElement('div');
            memberDiv.classList.add('household-member-box'); // Add a class for styling

            // Check if member is deceased
            const isDeceased = (member.deceased ?? '').toLowerCase() === 'yes';

// ...existing code...
            // Check which benefits have screening closed for this member
            const paceScreeningClosed = member.PACE?.screeningInProgress === false;
            const lisScreeningClosed = member.LIS?.screeningInProgress === false;
            const mspScreeningClosed = member.MSP?.screeningInProgress === false;
            const ptrrScreeningClosed = member.PTRR?.screeningInProgress === false;

            // Determine which benefits are actively open (not closed, not "Not Checked", not deceased-skipped)
            const openBenefits = [];
            if (!isDeceased && !paceScreeningClosed && !member.PACE?.eligibility?.includes('Not Checked')) {
                if (member.PACE?.eligibility && member.PACE.eligibility.length > 0) openBenefits.push('PACE');
            }
            if (!isDeceased && !lisScreeningClosed && !member.LIS?.eligibility?.includes('Not Checked')) {
                if (member.LIS?.eligibility && member.LIS.eligibility.length > 0) openBenefits.push('LIS');
            }
            if (!isDeceased && !mspScreeningClosed && !member.MSP?.eligibility?.includes('Not Checked')) {
                if (member.MSP?.eligibility && member.MSP.eligibility.length > 0) openBenefits.push('MSP');
            }
            if (!ptrrScreeningClosed && !member.PTRR?.eligibility?.includes('Not Checked')) {
                if (member.PTRR?.eligibility && member.PTRR.eligibility.length > 0) openBenefits.push('PTRR');
            }

            // Build benefit sections dynamically and sort open first, closed last
            const benefitSections = [];

            // PACE section
                if (!isDeceased) {
                    if (paceScreeningClosed) {
                        benefitSections.push({ closed: true, html: `
                        <div style="background-color:rgb(212, 212, 212); border: 1px solid rgb(0, 0, 0); padding: 8px; border-radius: 4px; margin: 8px 0; text-align: center; width: 100%; box-sizing: border-box;">
                            <p style="margin: 0 0 6px 0;"><strong>PACE Screening Closed</strong></p>
                            <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${member.PACE?.screeningCloseReason || 'N/A'}</p>
                            <button class="btn-reopen-individual-screening" data-benefit="PACE" data-member-id="${member.householdMemberId}"
                                style="background-color: #007bff; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: background-color 0.3s;"
                                onmouseover="this.style.backgroundColor='#0056b3'" 
                                onmouseout="this.style.backgroundColor='#007bff'">
                                Reopen PACE Screening
                            </button>
                        </div>
                    `});
                } else if (!member.PACE?.eligibility?.includes('Not Checked')) {
                    const paceElig = member.PACE?.eligibility?.map(capitalizeFirstLetter) || [];
                    const paceIsNot = paceElig.some(item => item.includes("NOT") || item.includes("ALREADY ENROLLED") || item.includes("NOT INTERESTED") || item.includes("AGE CRITERIA NOT MET") || item.includes("ENROLLED IN MEDICAID") || item.includes("RESIDENCY NOT MET"));
                    const paceNeedsInfo = paceElig.some(item => item.includes("NEEDS") || item.includes("DETERMINATION PENDING"));
                    const paceIsLikely = !paceIsNot && !paceNeedsInfo;
                    const paceBgColor = paceIsNot ? '#f8d7da' : paceNeedsInfo ? '#fff3cd' : paceIsLikely ? '#d4edda' : 'transparent';
                    const paceBorderColor = paceIsNot ? '#f5c6cb' : paceNeedsInfo ? '#ffc107' : paceIsLikely ? '#c3e6cb' : '#ccc';

                    benefitSections.push({ closed: false, html: `
                        <details class="custom-details" style="background-color: ${paceBgColor}; border: 1px solid ${paceBorderColor}; border-radius: 4px; padding: 8px; margin: 8px 0; width: 100%; box-sizing: border-box;">
                            <summary><br><strong>PACE</strong><br>
                            <p><strong></strong> ${
                                paceElig.join(', ') || 'Not Available'
                            }</summary></p>
                            <hr class="separator-bar">
                            <p><strong>Gross Adjusted Income:</strong> $${member.PACE?.combinedIncome?.toFixed(2) || 'N/A'}</p>
                        </details>
                    `});
                }
            }

            // LIS section
            if (!isDeceased) {
                if (lisScreeningClosed) {
                    benefitSections.push({ closed: true, html: `
                        <div style="background-color:rgb(212, 212, 212); border: 1px solid rgb(0, 0, 0); padding: 8px; border-radius: 4px; margin: 8px 0; text-align: center; width: 100%; box-sizing: border-box;">
                            <p style="margin: 0 0 6px 0;"><strong>LIS Screening Closed</strong></p>
                            <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${member.LIS?.screeningCloseReason || 'N/A'}</p>
                            <button class="btn-reopen-individual-screening" data-benefit="LIS" data-member-id="${member.householdMemberId}"
                                style="background-color: #007bff; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: background-color 0.3s;"
                                onmouseover="this.style.backgroundColor='#0056b3'" 
                                onmouseout="this.style.backgroundColor='#007bff'">
                                Reopen LIS Screening
                            </button>
                        </div>
                    `});
                } else if (!member.LIS?.eligibility?.includes('Not Checked')) {
                    const lisElig = member.LIS?.eligibility?.map(capitalizeFirstLetter) || [];
                    const lisIsNot = lisElig.some(item => item.includes("NOT") || item.includes("ALREADY ENROLLED") || item.includes("NOT INTERESTED") || item.includes("NOT ENROLLED IN MEDICARE") || item.includes("ENROLLED IN MEDICAID"));
                    const lisNeedsInfo = lisElig.some(item => item.includes("NEEDS") || item.includes("DETERMINATION PENDING"));
                    const lisIsLikely = !lisIsNot && !lisNeedsInfo;
                    const lisBgColor = lisIsNot ? '#f8d7da' : lisNeedsInfo ? '#fff3cd' : lisIsLikely ? '#d4edda' : 'transparent';
                    const lisBorderColor = lisIsNot ? '#f5c6cb' : lisNeedsInfo ? '#ffc107' : lisIsLikely ? '#c3e6cb' : '#ccc';

                    benefitSections.push({ closed: false, html: `
                        <details class="custom-details" style="background-color: ${lisBgColor}; border: 1px solid ${lisBorderColor}; border-radius: 4px; padding: 8px; margin: 8px 0; width: 100%; box-sizing: border-box;">
                            <summary><br><strong>LIS</strong><br>
                            <p><strong></strong> ${
                                lisElig.join(', ') || 'Not Available'
                            }</summary></p>
                            <hr class="separator-bar">
                            <p><strong>Gross Income:</strong> $${member.LIS?.combinedIncome?.toFixed(2) || 'N/A'}</p>
                            <p><strong>Combined Assets:</strong> $${member.LIS?.combinedAssets?.toFixed(2) || 'N/A'}</p>
                        </details>
                    `});
                }
            }

            // MSP section
            if (!isDeceased) {
                if (mspScreeningClosed) {
                    benefitSections.push({ closed: true, html: `
                        <div style="background-color:rgb(212, 212, 212); border: 1px solid rgb(0, 0, 0); padding: 8px; border-radius: 4px; margin: 8px 0; text-align: center; width: 100%; box-sizing: border-box;">
                            <p style="margin: 0 0 6px 0;"><strong>MSP Screening Closed</strong></p>                            <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${member.MSP?.screeningCloseReason || 'N/A'}</p>
                            <button class="btn-reopen-individual-screening" data-benefit="MSP" data-member-id="${member.householdMemberId}"
                                style="background-color: #007bff; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: background-color 0.3s;"
                                onmouseover="this.style.backgroundColor='#0056b3'" 
                                onmouseout="this.style.backgroundColor='#007bff'">
                                Reopen MSP Screening
                            </button>
                        </div>
                    `});
                } else if (!member.MSP?.eligibility?.includes('Not Checked')) {
                    const mspElig = member.MSP?.eligibility?.map(capitalizeFirstLetter) || [];
                    const mspIsNot = mspElig.some(item => item.includes("NOT") || item.includes("ALREADY ENROLLED") || item.includes("NOT INTERESTED") || item.includes("NOT ENROLLED IN MEDICARE") || item.includes("ENROLLED IN MEDICAID"));
                    const mspNeedsInfo = mspElig.some(item => item.includes("NEEDS") || item.includes("DETERMINATION PENDING"));
                    const mspIsLikely = !mspIsNot && !mspNeedsInfo;
                    const mspBgColor = mspIsNot ? '#f8d7da' : mspNeedsInfo ? '#fff3cd' : mspIsLikely ? '#d4edda' : 'transparent';
                    const mspBorderColor = mspIsNot ? '#f5c6cb' : mspNeedsInfo ? '#ffc107' : mspIsLikely ? '#c3e6cb' : '#ccc';

                    benefitSections.push({ closed: false, html: `
                        <details class="custom-details" style="background-color: ${mspBgColor}; border: 1px solid ${mspBorderColor}; border-radius: 4px; padding: 8px; margin: 8px 0; width: 100%; box-sizing: border-box;">
                            <summary><br><strong>MSP</strong>
                            <p><strong></strong> ${
                                mspElig.join(', ') || 'Not Available'
                            }</summary></p>
                            <hr class="separator-bar">
                            <p><strong>Gross Adjusted Income:</strong> $${member.MSP?.combinedIncome?.toFixed(2) || 'N/A'}</p>
                            <p><strong>Combined Assets:</strong> $${member.MSP?.combinedAssets?.toFixed(2) || 'N/A'}</p>
                        </details>
                    `});
                }
            }

            // PTRR section
            if (member.headOfHousehold) {
                if (ptrrScreeningClosed) {
                    benefitSections.push({ closed: true, html: `
                            <div style="background-color:rgb(212, 212, 212); border: 1px solid rgb(0, 0, 0); padding: 8px; border-radius: 4px; margin: 8px 0; text-align: center; width: 100%; box-sizing: border-box;">
                                <p style="margin: 0 0 6px 0;"><strong>PTRR Screening Closed</strong></p>                        <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${member.PTRR?.screeningCloseReason || 'N/A'}</p>
                            <button class="btn-reopen-individual-screening" data-benefit="PTRR" data-member-id="${member.householdMemberId}"
                                style="background-color: #007bff; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: background-color 0.3s;"
                                onmouseover="this.style.backgroundColor='#0056b3'" 
                                onmouseout="this.style.backgroundColor='#007bff'">
                                Reopen PTRR Screening
                            </button>
                        </div>
                    `});
                } else if (!member.PTRR?.eligibility?.includes('Not Checked')) {
                    const ptrrElig = member.PTRR?.eligibility?.map(capitalizeFirstLetter) || [];
                    const ptrrIsNot = ptrrElig.some(item => item.includes("NOT") || item.includes("ALREADY APPLIED") || item.includes("NOT INTERESTED") || item.includes("NO FORMAL LEASE") || item.includes("AGE") || item.includes("CRITERIA NOT MET"));
                    const ptrrNeedsInfo = ptrrElig.some(item => item.includes("NEEDS") || item.includes("DETERMINATION PENDING"));
                    const ptrrIsLikely = !ptrrIsNot && !ptrrNeedsInfo;
                    const ptrrBgColor = ptrrIsNot ? '#f8d7da' : ptrrNeedsInfo ? '#fff3cd' : ptrrIsLikely ? '#d4edda' : 'transparent';
                    const ptrrBorderColor = ptrrIsNot ? '#f5c6cb' : ptrrNeedsInfo ? '#ffc107' : ptrrIsLikely ? '#c3e6cb' : '#ccc';

                    benefitSections.push({ closed: false, html: `
                        <details class="custom-details" style="background-color: ${ptrrBgColor}; border: 1px solid ${ptrrBorderColor}; border-radius: 4px; padding: 8px; margin: 8px 0; width: 100%; box-sizing: border-box;">
                            <summary><br><strong>PTRR Eligibility</strong>
                            <p><strong></strong> ${
                                ptrrElig.join(', ') || 'Not Available'
                            }</summary></p>
                            <hr class="separator-bar">
                            <p><strong>Gross Income:</strong> $${member.PTRR?.combinedIncome?.toFixed(2) || 'N/A'}</p>
                        </details>
                    `});
                }
            }

            // Sort: open benefits first, closed benefits last
            benefitSections.sort((a, b) => a.closed - b.closed);

            // Populate member details
            memberDiv.innerHTML = `
                ${member.headOfHousehold ? `<p class="household-member-info" style="color: black; border: 2px solid black; padding: 5px; display: inline-block;"><strong>Head of Household</strong></p>` : ''}
                ${isDeceased ? `<p class="household-member-info" style="color: black; border: 2px solid black; padding: 5px; display: inline-block;"><strong>Deceased</strong></p>` : ''}

                ${openBenefits.length > 0 ? `
                    <br>
                    <button class="btn-close-member-screening" data-member-id="${member.householdMemberId}" style="
                        background-color: #dc3545;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        padding: 8px 16px;
                        font-size: 13px;
                        cursor: pointer;
                        transition: background-color 0.3s;
                    " onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Close Screening(s)</button>
                ` : ''}

                <h3>${capitalizeFirstLetter(member.firstName)} ${capitalizeFirstLetter(member.middleInitial || '')} ${capitalizeFirstLetter(member.lastName)}</h3>
                <p><strong>Age:</strong> ${member.age?.split('Y')[0] || 'N/A'}</p>
                <p><strong>Marital Status:</strong> ${capitalizeFirstLetter(member.maritalStatus || 'N/A')}</p>
                ${
                    member.relationships?.some(r => r.relationship === 'spouse')
                        ? `<p><strong>Spouse:</strong> ${
                              capitalizeFirstLetter(members.find(m => m.householdMemberId === member.relationships.find(r => r.relationship === 'spouse')?.relatedMemberId)?.firstName || 'N/A')
                          } ${
                              capitalizeFirstLetter(members.find(m => m.householdMemberId === member.relationships.find(r => r.relationship === 'spouse')?.relatedMemberId)?.lastName || '')
                          }</p>`
                        : ''
                }
                ${benefitSections.map(s => s.html).join('')}
            `;
            householdMemberContainer.appendChild(memberDiv);

            // Attach close screening button listener (single button per member)
            const closeMemberBtn = memberDiv.querySelector('.btn-close-member-screening');
            if (closeMemberBtn) {
                closeMemberBtn.addEventListener('click', () => {
                    const memberId = closeMemberBtn.dataset.memberId;
                    openCloseMemberModal(clientId, members, memberId, openBenefits);
                });
            }

            // Attach reopen screening button listeners
            memberDiv.querySelectorAll('.btn-reopen-individual-screening').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const benefit = btn.dataset.benefit;
                    const memberId = btn.dataset.memberId;
                    const targetMember = members.find(m => m.householdMemberId === memberId);

                    if (targetMember && targetMember[benefit]) {
                        targetMember[benefit].screeningInProgress = true;
                        targetMember[benefit].screeningCloseReason = null;

                        try {
                            const saveResponse = await fetch(`/save-household-members`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ clientId, householdMembers: members })
                            });

                            if (saveResponse.ok) {
                                const memberName = `${capitalizeFirstLetter(targetMember.firstName)} ${capitalizeFirstLetter(targetMember.lastName)}`;
                                await addNoteToClient(clientId, `<strong>${benefit} screening reopened for ${memberName}.</strong>`);
                                await renderNotesContainer();
                                await refreshAllDisplays();
                            } else {
                                console.error(`Failed to reopen ${benefit} screening.`);
                            }
                        } catch (error) {
                            console.error(`Error reopening ${benefit} screening:`, error);
                        }
                    }
                });
            });
        });
    }
}

// --- Close Member Screening Modal (with checkboxes for open benefits) ---
function createCloseMemberModal() {
    if (document.getElementById('close-member-modal')) return;

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'close-member-modal';
    modalOverlay.style.cssText = `
        display: none;
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 9999;
        justify-content: center;
        align-items: center;
    `;

    modalOverlay.innerHTML = `
        <div style="background: white; padding: 24px; border-radius: 8px; min-width: 380px; max-width: 520px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
            <h3 id="close-member-modal-title" style="margin-top: 0; flex-shrink: 0;">Close Screening</h3>
            <div id="close-member-benefits-checkboxes" style="margin: 12px 0; overflow-y: auto; flex: 1; max-height: 40vh; padding-right: 8px;"></div>
            <div style="flex-shrink: 0;">
                <label for="close-member-reason-select"><strong>Select a reason:</strong></label>
                <select id="close-member-reason-select" style="width: 100%; padding: 8px; margin: 12px 0; font-size: 14px;">
                    <option value="">-- Select a reason --</option>
                </select>
                <div style="display: flex; gap: 10px; justify-content: center; margin-top: 16px;">
                    <button id="close-member-cancel-btn" style="padding: 8px 16px; cursor: pointer;">Cancel</button>
                    <button id="close-member-confirm-btn" style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; transition: background-color 0.3s;" onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Confirm Close</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);

    document.getElementById('close-member-cancel-btn').addEventListener('click', () => {
        modalOverlay.style.display = 'none';
    });

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            modalOverlay.style.display = 'none';
        }
    });
}

function getCloseReasonsForBenefits(selectedBenefits) {
    const commonReasons = [
        { value: "Client Not Interested", label: "Not Interested" },
        { value: "Too Confusing", label: "Too Confusing" },
        { value: "Will Call Back", label: "Will Call Back" },
        { value: "Hard Determination", label: "Use Hard Determination Closeout Reasons" }
    ];

    const benefitReasons = {
        'PACE': [
            { value: "Already Enrolled", label: "Already Enrolled" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Age Criteria Not Met", label: "Age Criteria Not Met" },
            { value: "Enrolled in Medicaid", label: "Enrolled in Medicaid" },
            { value: "Residency Not Met", label: "PA Residency Not Met" },
            ...commonReasons
        ],
        'LIS': [
            { value: "Already Enrolled", label: "Already Enrolled" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Ineligible - Assets", label: "Ineligible - Assets" },
            { value: "Not Enrolled in Medicare", label: "Not Enrolled in Medicare" },
            { value: "Enrolled in Medicaid", label: "Enrolled in Medicaid" },
            ...commonReasons
        ],
        'MSP': [
            { value: "Already Enrolled", label: "Already Enrolled" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Ineligible - Assets", label: "Ineligible - Assets" },
            { value: "Not Enrolled in Medicare", label: "Not Enrolled in Medicare" },
            { value: "Enrolled in Medicaid", label: "Enrolled in Medicaid" },
            ...commonReasons
        ],
        'PTRR': [
            { value: "Already Applied", label: "Already Applied This Year" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Age/Disability/Widow Criteria Not Met", label: "Age/Disability/Widow Criteria Not Met" },
            { value: "No Formal Lease", label: "No Formal Lease" },
            { value: "No Relevant Expenses", label: "No Relevant Expenses" },
            ...commonReasons
        ]
    };

    if (selectedBenefits.length === 0) return [];

    if (selectedBenefits.length === 1) {
        const benefit = selectedBenefits[0];
        return benefitReasons[benefit] || [
            { value: "Already Enrolled", label: "Already Enrolled" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Ineligible - Assets", label: "Ineligible - Assets" },
            ...commonReasons
        ];
    }

    // Multiple benefits selected — compute intersection by value
    const reasonSets = selectedBenefits.map(benefit => {
        const reasons = benefitReasons[benefit] || [];
        return new Set(reasons.map(r => r.value));
    });

    // Find values present in ALL selected benefits
    const sharedValues = [...reasonSets[0]].filter(value =>
        reasonSets.every(set => set.has(value))
    );

    // Use the label from the first benefit's reasons for each shared value
    const firstBenefitReasons = benefitReasons[selectedBenefits[0]] || [];
    return sharedValues.map(value => {
        const match = firstBenefitReasons.find(r => r.value === value);
        return match || { value, label: value };
    });
}

function updateReasonDropdown(selectedBenefits) {
    const select = document.getElementById('close-member-reason-select');
    if (!select) return;

    const reasons = getCloseReasonsForBenefits(selectedBenefits);
    select.innerHTML = '<option value="">-- Select a reason --</option>';
    reasons.forEach(reason => {
        const option = document.createElement('option');
        option.value = reason.value;
        option.textContent = reason.label;
        select.appendChild(option);
    });
}

// Maps the ineligibility reason from the eligibility array to an appropriate close reason
function mapHardDeterminationReason(benefit, ineligibilityReason) {
    const upper = (ineligibilityReason || '').toUpperCase();

    // Common patterns across benefits
    if (upper.includes('ALREADY ENROLLED')) return 'Already Enrolled';
    if (upper.includes('ALREADY APPLIED')) return 'Already Applied';
    if (upper.includes('NOT INTERESTED')) return 'Client Not Interested';
    if (upper.includes('ENROLLED IN MEDICAID')) return 'Enrolled in Medicaid';
    if (upper.includes('NOT ENROLLED IN MEDICARE')) return 'Not Enrolled in Medicare';

    // Benefit-specific mappings
    switch (benefit) {
        case 'PACE':
            if (upper.includes('AGE CRITERIA')) return 'Age Criteria Not Met';
            if (upper.includes('RESIDENCY')) return 'Residency Not Met';
            if (upper.includes('INCOME')) return 'Ineligible - Income';
            if (upper.includes('INELIGIBLE') || upper.includes('NOT LIKELY')) return 'Ineligible - Income';
            break;
        case 'LIS':
            if (upper.includes('INCOME')) return 'Ineligible - Income';
            if (upper.includes('ASSETS') || upper.includes('ASSET')) return 'Ineligible - Assets';
            if (upper.includes('NOT LIKELY')) {
                if (upper.includes('INCOME')) return 'Ineligible - Income';
                if (upper.includes('ASSETS') || upper.includes('ASSET')) return 'Ineligible - Assets';
                return 'Ineligible - Income';
            }
            break;
        case 'MSP':
            if (upper.includes('INCOME')) return 'Ineligible - Income';
            if (upper.includes('ASSETS') || upper.includes('ASSET')) return 'Ineligible - Assets';
            if (upper.includes('NOT LIKELY')) {
                if (upper.includes('INCOME')) return 'Ineligible - Income';
                if (upper.includes('ASSETS') || upper.includes('ASSET')) return 'Ineligible - Assets';
                return 'Ineligible - Income';
            }
            break;
        case 'PTRR':
            if (upper.includes('AGE') || upper.includes('DISABILITY') || upper.includes('WIDOW')) return 'Age/Disability/Widow Criteria Not Met';
            if (upper.includes('NO FORMAL LEASE')) return 'No Formal Lease';
            if (upper.includes('NO RELEVANT EXPENSES')) return 'No Relevant Expenses';
            if (upper.includes('INCOME')) return 'Ineligible - Income';
            if (upper.includes('NOT LIKELY')) return 'Ineligible - Income';
            break;
    }

    // Fallback: use the raw ineligibility reason or a generic one
    return ineligibilityReason || 'Ineligible - Hard Determination';
}

// Check if a benefit for a member is "red" (not eligible / hard closeout candidate)
function isBenefitNotEligible(benefit, member) {
    const eligibility = member[benefit]?.eligibility || [];
    const eligStr = eligibility.join(' ').toUpperCase();

    // Hard closeout statuses — these should always be auto-selected
    const hardCloseouts = [
        'ALREADY ENROLLED', 'ALREADY APPLIED',
        'NOT ENROLLED IN MEDICARE', 'ENROLLED IN MEDICAID',
        'AGE CRITERIA NOT MET', 'RESIDENCY NOT MET',
        'NO FORMAL LEASE', 'NOT INTERESTED'
    ];

    for (const status of hardCloseouts) {
        if (eligStr.includes(status)) return true;
    }

    // Also check for red (NOT LIKELY ELIGIBLE)
    if (eligStr.includes('NOT LIKELY ELIGIBLE') || eligStr.includes('NOT ELIGIBLE')) return true;

    return false;
}

function openCloseMemberModal(clientId, allMembers, memberId, openBenefits) {
    createCloseMemberModal();
    const modal = document.getElementById('close-member-modal');
    const checkboxContainer = document.getElementById('close-member-benefits-checkboxes');
    const select = document.getElementById('close-member-reason-select');
    const confirmBtn = document.getElementById('close-member-confirm-btn');
    const title = document.getElementById('close-member-modal-title');

    title.textContent = `Close Screening(s)`;

    // Build a list of all open benefits across all members (excluding SNAP and LIHEAP)
    const benefitKeys = ['PACE', 'LIS', 'MSP', 'PTRR'];
    const allOpenBenefitEntries = []; // { memberId, memberName, benefit, isNotEligible, ineligibilityReason }

    allMembers.forEach(member => {
        const isDeceased = (member.deceased ?? '').toLowerCase() === 'yes';
        const memberName = `${capitalizeFirstLetter(member.firstName)} ${capitalizeFirstLetter(member.lastName)}`;

        benefitKeys.forEach(benefit => {
            if (isDeceased && benefit !== 'PTRR') return;
            if (benefit === 'PTRR' && !member.headOfHousehold) return;
            if (isDeceased && benefit === 'PTRR') return;

            const benefitObj = member[benefit];
            if (!benefitObj) return;
            if (benefitObj.screeningInProgress === false) return;
            if (benefitObj.eligibility?.includes('Not Checked')) return;

            if (benefitObj.eligibility && benefitObj.eligibility.length > 0) {

                // Determine if this benefit is "not likely eligible" (red card)
                const eligArray = benefitObj.eligibility.map(e => (e || '').toUpperCase());
                const isNotEligible = eligArray.some(item =>
                    item.includes("NOT") ||
                    item.includes("ALREADY ENROLLED") ||
                    item.includes("ALREADY APPLIED") ||
                    item.includes("NOT INTERESTED") ||
                    item.includes("AGE CRITERIA NOT MET") ||
                    item.includes("ENROLLED IN MEDICAID") ||
                    item.includes("NO FORMAL LEASE") ||
                    item.includes("RESIDENCY NOT MET") ||
                    item.includes("NOT ENROLLED IN MEDICARE")
                );

                // Extract the specific ineligibility reason for hard determination mapping
                let ineligibilityReason = '';
                if (isNotEligible) {
                    ineligibilityReason = benefitObj.eligibility.find(e => {
                        const upper = (e || '').toUpperCase();
                        return upper.includes("NOT") ||
                            upper.includes("ALREADY ENROLLED") ||
                            upper.includes("ALREADY APPLIED") ||
                            upper.includes("AGE") ||
                            upper.includes("ENROLLED IN MEDICAID") ||
                            upper.includes("NO FORMAL LEASE") ||
                            upper.includes("RESIDENCY") ||
                            upper.includes("NOT ENROLLED IN MEDICARE") ||
                            upper.includes("NOT INTERESTED");
                    }) || '';
                }

                allOpenBenefitEntries.push({
                    memberId: member.householdMemberId,
                    memberName,
                    benefit,
                    isNotEligible,
                    ineligibilityReason
                });
            }
        });
    });

    // Group entries by member for display
    const groupedByMember = {};
    allOpenBenefitEntries.forEach(entry => {
        if (!groupedByMember[entry.memberId]) {
            groupedByMember[entry.memberId] = {
                memberName: entry.memberName,
                benefits: []
            };
        }
        groupedByMember[entry.memberId].benefits.push({
            benefit: entry.benefit,
            isNotEligible: entry.isNotEligible,
            ineligibilityReason: entry.ineligibilityReason
        });
    });

    // Build selectable benefit tiles grouped by member
    checkboxContainer.innerHTML = '<p style="margin-bottom: 10px;"><strong>Select benefits to close:</strong></p>';

    // Add "Select All" / "Deselect All" toggle
    const selectAllContainer = document.createElement('div');
    selectAllContainer.style.cssText = 'margin-bottom: 12px; padding: 8px 0; border-bottom: 1px solid #ddd;';
    const selectAllBtn = document.createElement('button');
    selectAllBtn.textContent = 'Select All';
    selectAllBtn.style.cssText = `
        padding: 6px 14px;
        background-color: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        margin-right: 8px;
        transition: background-color 0.3s;
    `;
    const deselectAllBtn = document.createElement('button');
    deselectAllBtn.textContent = 'Deselect All';
    deselectAllBtn.style.cssText = `
        padding: 6px 14px;
        background-color: #6c757d;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        transition: background-color 0.3s;
    `;

    const toggleAllTiles = (selected) => {
        const allTiles = checkboxContainer.querySelectorAll('.close-member-benefit-tile');
        allTiles.forEach(tile => {
            const isNotEligibleTile = tile.dataset.isNotEligible === 'true';
            tile.dataset.selected = selected ? 'true' : 'false';
            if (selected) {
                tile.style.borderColor = 'black';
                tile.style.backgroundColor = '#007bff';
                tile.style.color = 'white';
            } else {
                // Immediately apply correct styling based on eligibility
                if (isNotEligibleTile) {
                    tile.style.borderColor = '#f5c6cb';
                    tile.style.backgroundColor = '#f8d7da';
                    tile.style.color = '#721c24';
                } else {
                    tile.style.borderColor = '#ccc';
                    tile.style.backgroundColor = '#f9f9f9';
                    tile.style.color = '#333';
                }
            }
        });
        const selectedBenefits = selected
            ? allOpenBenefitEntries.map(e => e.benefit)
            : [];
        updateReasonDropdown([...new Set(selectedBenefits)]);
    };

    selectAllBtn.addEventListener('click', () => toggleAllTiles(true));
    deselectAllBtn.addEventListener('click', () => toggleAllTiles(false));
    selectAllContainer.appendChild(selectAllBtn);
    selectAllContainer.appendChild(deselectAllBtn);
    checkboxContainer.appendChild(selectAllContainer);

    Object.keys(groupedByMember).forEach(mId => {
        const group = groupedByMember[mId];

        // Member name header
        const memberHeader = document.createElement('p');
        memberHeader.style.cssText = 'margin: 12px 0 4px 0; font-weight: 600; font-size: 14px; color: #555;';
        memberHeader.textContent = group.memberName;
        checkboxContainer.appendChild(memberHeader);

        group.benefits.forEach(benefitEntry => {
            const tile = document.createElement('div');
            tile.className = 'close-member-benefit-tile';
            tile.dataset.benefit = benefitEntry.benefit;
            tile.dataset.memberId = mId;
            tile.dataset.selected = 'false';
            tile.dataset.isNotEligible = benefitEntry.isNotEligible ? 'true' : 'false';
            tile.dataset.ineligibilityReason = benefitEntry.ineligibilityReason || '';
            tile.textContent = benefitEntry.benefit;
            tile.style.cssText = `
                display: block;
                padding: 10px 16px;
                margin: 6px 0;
                border: 2px solid #ccc;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                color: #333;
                background-color: #f9f9f9;
                transition: all 0.2s ease;
                user-select: none;
            `;

            // If this benefit is not eligible (red), add a visual indicator
            if (benefitEntry.isNotEligible) {
                tile.style.borderColor = '#f5c6cb';
                tile.style.backgroundColor = '#f8d7da';
                tile.style.color = '#721c24';
            }

            tile.addEventListener('mouseover', () => {
                if (tile.dataset.selected === 'false') {
                    if (benefitEntry.isNotEligible) {
                        tile.style.borderColor = '#c82333';
                        tile.style.backgroundColor = '#f1b0b7';
                    } else {
                        tile.style.borderColor = '#337ab7';
                        tile.style.backgroundColor = '#e8f0fe';
                    }
                }
            });

            tile.addEventListener('mouseout', () => {
                if (tile.dataset.selected === 'false') {
                    if (benefitEntry.isNotEligible) {
                        tile.style.borderColor = '#f5c6cb';
                        tile.style.backgroundColor = '#f8d7da';
                        tile.style.color = '#721c24';
                    } else {
                        tile.style.borderColor = '#ccc';
                        tile.style.backgroundColor = '#f9f9f9';
                        tile.style.color = '#333';
                    }
                }
            });

            tile.addEventListener('click', () => {
                const isSelected = tile.dataset.selected === 'true';
                tile.dataset.selected = isSelected ? 'false' : 'true';

                if (tile.dataset.selected === 'true') {
                    tile.style.borderColor = 'black';
                    tile.style.backgroundColor = '#007bff';
                    tile.style.color = 'white';
                } else {
                    if (benefitEntry.isNotEligible) {
                        tile.style.borderColor = '#f5c6cb';
                        tile.style.backgroundColor = '#f8d7da';
                        tile.style.color = '#721c24';
                    } else {
                        tile.style.borderColor = '#ccc';
                        tile.style.backgroundColor = '#f9f9f9';
                        tile.style.color = '#333';
                    }
                }

                // Update reason dropdown based on unique selected benefits
                const selectedBenefitNames = Array.from(
                    checkboxContainer.querySelectorAll('.close-member-benefit-tile[data-selected="true"]')
                ).map(t => t.dataset.benefit);
                updateReasonDropdown([...new Set(selectedBenefitNames)]);
            });

            checkboxContainer.appendChild(tile);
        });
    });

    // Auto-select tiles that are "not eligible" (red cards)
    const hasAnyNotEligible = allOpenBenefitEntries.some(e => e.isNotEligible);
    if (hasAnyNotEligible) {
        const allTiles = checkboxContainer.querySelectorAll('.close-member-benefit-tile');
        allTiles.forEach(tile => {
            if (tile.dataset.isNotEligible === 'true') {
                tile.dataset.selected = 'true';
                tile.style.borderColor = 'black';
                tile.style.backgroundColor = '#007bff';
                tile.style.color = 'white';
            }
        });

        // Update reason dropdown based on auto-selected benefits
        const autoSelectedBenefitNames = Array.from(
            checkboxContainer.querySelectorAll('.close-member-benefit-tile[data-selected="true"]')
        ).map(t => t.dataset.benefit);
        updateReasonDropdown([...new Set(autoSelectedBenefitNames)]);

        // Auto-select "Hard Determination" in the dropdown
        select.value = 'Hard Determination';
    } else {
        // Initialize reason dropdown — nothing pre-selected
        select.innerHTML = '<option value="">-- Select a reason --</option>';
    }

    modal.style.display = 'flex';

    // Remove old listener by cloning
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener('click', async () => {
        const selectedTiles = Array.from(
            checkboxContainer.querySelectorAll('.close-member-benefit-tile[data-selected="true"]')
        );
        const reason = select.value;

        if (selectedTiles.length === 0) {
            alert('Please select at least one benefit to close.');
            return;
        }
        if (!reason) {
            alert('Please select a reason.');
            return;
        }

        try {
            // Group selected tiles by member
            const closuresByMember = {};
            selectedTiles.forEach(tile => {
                const mId = tile.dataset.memberId;
                const benefit = tile.dataset.benefit;
                const ineligibilityReason = tile.dataset.ineligibilityReason || '';
                if (!closuresByMember[mId]) closuresByMember[mId] = [];
                closuresByMember[mId].push({ benefit, ineligibilityReason });
            });

            // Apply closures to each member
            const noteLines = [];
            for (const [mId, benefitEntries] of Object.entries(closuresByMember)) {
                const targetMember = allMembers.find(m => String(m.householdMemberId) === String(mId));
                if (targetMember) {
                    const memberName = `${capitalizeFirstLetter(targetMember.firstName)} ${capitalizeFirstLetter(targetMember.lastName)}`;
                    const benefitNoteLines = [];
                    for (const entry of benefitEntries) {
                        if (targetMember[entry.benefit]) {
                            // Determine the actual close reason
                            let closeReason;
                            if (reason === 'Hard Determination') {
                                closeReason = mapHardDeterminationReason(entry.benefit, entry.ineligibilityReason);
                            } else {
                                closeReason = reason;
                            }
                            targetMember[entry.benefit].screeningInProgress = false;
                            targetMember[entry.benefit].screeningCloseReason = closeReason;
                            benefitNoteLines.push(`${entry.benefit} — ${closeReason}`);
                        }
                    }
                    noteLines.push(`<br><strong>${memberName}:</strong><br> ${benefitNoteLines.join('<br>')}`);
                }
            }

            const saveResponse = await fetch(`/save-household-members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, householdMembers: allMembers })
            });

            if (saveResponse.ok) {
                modal.style.display = 'none';
                const noteText = `<strong>Screening(s) closed.</strong><br>${noteLines.join('<br>')}`;
                await addNoteToClient(clientId, noteText);
                await renderNotesContainer();
                await refreshAllDisplays();
            } else {
                console.error('Failed to close screening.');
            }
        } catch (error) {
            console.error('Error closing screening:', error);
        }
    });
}

async function displaySNAPHouseholds(prefetchedMembers, prefetchedClient) {
    const snapHouseholdContainer = document.getElementById('snap-household-container');
    if (!snapHouseholdContainer) {
        console.error('snap-household-container element not found in the DOM.');
        return;
    }

    const members = prefetchedMembers || await loadHouseholdMembers();
    snapHouseholdContainer.innerHTML = ''; // Clear existing content

    const clientId = getQueryParameter('id');

    // Fetch fresh client data if not provided
    const currentClient = prefetchedClient || await fetch(`/get-client/${clientId}`)
        .then(response => response.ok ? response.json() : null)
        .catch(error => {
            console.error('Error fetching client data:', error);
            return null;
        });
    
        // Check if any SNAP household member has screening closed
        const snapMembers = members.filter(m => m.meals?.toLowerCase() === "yes");
        const screeningClosed = snapMembers.length > 0 && snapMembers[0]?.SNAP?.screeningInProgress === false;
    
        if (screeningClosed) {
            // Show only the reopen button
            const reopenDiv = document.createElement('div');
            reopenDiv.classList.add('household-member-box');
            reopenDiv.innerHTML = `
                <h3>SNAP HOUSEHOLD</h3>
                <p><strong>Members:</strong> ${snapMembers.map(m => `${capitalizeFirstLetter(m.firstName)} ${capitalizeFirstLetter(m.lastName)}`).join(', ')}</p>
                        <div style="background-color:rgb(212, 212, 212); border: 1px solid rgb(0, 0, 0); padding: 8px; border-radius: 4px; margin: 8px 0; text-align: center; width: 100%; box-sizing: border-box;">
                    <p style="margin: 0 0 6px 0;"><strong>SNAP Screening Closed</strong></p>
                    <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${snapMembers[0]?.SNAP?.screeningCloseReason || 'N/A'}</p>
                    <button id="reopen-snap-screening-btn" 
                        style="background-color: #007bff; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: background-color 0.3s;"
                        onmouseover="this.style.backgroundColor='#0056b3'" 
                        onmouseout="this.style.backgroundColor='#007bff'">
                        Reopen SNAP Screening
                    </button>
                </div>
            `;

            snapHouseholdContainer.appendChild(reopenDiv);
    
            document.getElementById('reopen-snap-screening-btn').addEventListener('click', async () => {
                try {
                    // Update each SNAP household member's SNAP object
                    for (const member of snapMembers) {
                        if (member.SNAP) {
                            member.SNAP.screeningInProgress = true;
                            member.SNAP.screeningCloseReason = null;
                        }
                    }
    
                    const saveResponse = await fetch(`/save-household-members`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ clientId, householdMembers: members })
                    });
    
                    if (saveResponse.ok) {
                        await addNoteToClient(clientId, '<strong>SNAP screening reopened.</strong>');
                        await renderNotesContainer();
                        await refreshAllDisplays();
                    } else {
                        console.error('Failed to reopen SNAP screening.');
                    }
                } catch (error) {
                    console.error('Error reopening SNAP screening:', error);
                }
            });
    
            return; // Don't render the full SNAP display
        }
    
        // Group members into SNAP households based on "meals=yes"
        const snapHouseholds = [];
        const processedMembers = new Set();
    
        for (const member of members) {
            if (processedMembers.has(member.householdMemberId)) continue;
    
            if (member.meals?.toLowerCase() === "yes") {
                const snapHousehold = [member];
                processedMembers.add(member.householdMemberId);
    
                for (const otherMember of members) {
                    if (
                        otherMember.householdMemberId !== member.householdMemberId &&
                        otherMember.meals?.toLowerCase() === "yes"
                    ) {
                        snapHousehold.push(otherMember);
                        processedMembers.add(otherMember.householdMemberId);
                    }
                }
    
                snapHouseholds.push(snapHousehold);
            }
        }
    
        if (snapHouseholds.length === 0) {
            const noHouseholdsDiv = document.createElement('div');
            noHouseholdsDiv.classList.add('household-member-box');

            // Check if any SNAP household member has screening in progress
            const anySnapScreeningActive = members.some(m => m.SNAP?.screeningInProgress === true);

            // Check if client is already enrolled in SNAP or not interested
            const isAlreadyEnrolled = currentClient?.snap === 'yes';
            const isNotInterested = currentClient?.snap === 'notinterested';

            // Apply background color based on state
            if (isAlreadyEnrolled || isNotInterested) {
                noHouseholdsDiv.style.backgroundColor = '#f8d7da'; // Red for already enrolled / not interested
                noHouseholdsDiv.style.borderColor = '#f5c6cb';
            } else {
                noHouseholdsDiv.style.backgroundColor = '#fff3cd'; // Yellow for no households found
                noHouseholdsDiv.style.borderColor = '#ffc107';
            }

            noHouseholdsDiv.innerHTML = `
                <h3>SNAP HOUSEHOLD</h3>
                ${isAlreadyEnrolled ? `
                    <p>ALREADY ENROLLED</p>
                ` : isNotInterested ? `
                    <p>NOT INTERESTED</p>
                ` : `
                    <p>NO SNAP HOUSEHOLD MEMBERS FOUND.</p>
                `}
                ${anySnapScreeningActive || isAlreadyEnrolled || isNotInterested ? `
                    <button class="btn-close-snap-screening" style="background-color: #dc3545; color: white; border: none; border-radius: 4px; padding: 8px 16px; font-size: 13px; cursor: pointer; transition: background-color 0.3s;" onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Close SNAP Screening</button>
                ` : ''}
            `;

            snapHouseholdContainer.appendChild(noHouseholdsDiv);

            if (anySnapScreeningActive || isAlreadyEnrolled || isNotInterested) {
                const closeBtn = noHouseholdsDiv.querySelector('.btn-close-snap-screening');
                closeBtn.addEventListener('click', () => {
                    const snapMembers = members.filter(m => m.SNAP?.screeningInProgress === true);
                    openCloseSnapModal(clientId, members, snapMembers);
                });
            }
        } else {

            snapHouseholds.forEach(household => {
                const householdDiv = document.createElement('div');
                householdDiv.classList.add('household-member-box');
    
                const combinedMonthlyIncome = household[0]?.SNAP?.combinedMonthlyIncome || 0;
                const totalNetIncome = household[0]?.SNAP?.totalNetIncome || 0;
                const excessShelterCost = household[0]?.SNAP?.excessShelterCost || 0;
                const totalUtilityAllowance = household[0]?.SNAP?.totalUtilityAllowance || 0;
                const totalMedicalExpenses = household[0]?.SNAP?.totalMedicalExpenses || 0;
                const totalOtherExpenses = household[0]?.SNAP?.totalOtherExpenses || 0;
                const eligibility = household[0]?.SNAP?.eligibility?.map(capitalizeFirstLetter) || 'Not Available';
                const benefitAmount = household[0]?.SNAP?.benefitAmount || 0;
                const combinedAssets = household[0]?.SNAP?.combinedAssets || 0;
    
                const isLikelyEligible = Array.isArray(eligibility)
                    ? !eligibility.some(item => item.includes("NOT") || item.includes("ALREADY ENROLLED") || item.includes("NOT INTERESTED") || item.includes("NEEDS") || item.includes("DETERMINATION PENDING"))
                    : !String(eligibility).includes("NOT") && !String(eligibility).includes("ALREADY ENROLLED") && !String(eligibility).includes("NOT INTERESTED") && !String(eligibility).includes("NEEDS") && !String(eligibility).includes("DETERMINATION PENDING");

                const isNotEligible = Array.isArray(eligibility)
                    ? eligibility.some(item => item.includes("NOT") || item.includes("ALREADY ENROLLED") || item.includes("NOT INTERESTED"))
                    : String(eligibility).includes("NOT") || String(eligibility).includes("ALREADY ENROLLED") || String(eligibility).includes("NOT INTERESTED");

                const needsMoreInfo = Array.isArray(eligibility)
                    ? eligibility.some(item => item.includes("NEEDS") || item.includes("DETERMINATION PENDING"))
                    : String(eligibility).includes("NEEDS") || String(eligibility).includes("DETERMINATION PENDING");

                // Apply color coding based on eligibility
                if (isNotEligible) {
                    householdDiv.style.backgroundColor = '#f8d7da'; // Red background
                    householdDiv.style.borderColor = '#f5c6cb';
                } else if (needsMoreInfo) {
                    householdDiv.style.backgroundColor = '#fff3cd'; // Yellow background
                    householdDiv.style.borderColor = '#ffc107';
                } else if (isLikelyEligible) {
                    householdDiv.style.backgroundColor = '#d4edda'; // Green background
                    householdDiv.style.borderColor = '#c3e6cb';
                }
    
                householdDiv.innerHTML = `
    <details class="custom-details">
    <summary><h3>SNAP HOUSEHOLD</h3></summary>
    <p><strong>Total Gross Income:</strong> $${combinedMonthlyIncome.toFixed(2)}</p>
    <p><strong>Shelter Deduction:</strong> $${excessShelterCost.toFixed(2)}</p>
    <p><strong>Medical Expense Deductions:</strong> $${totalMedicalExpenses.toFixed(2)}</p>
    <p><strong>Other Expense Deductions:</strong> $${totalOtherExpenses.toFixed(2)}</p>
    <p><strong>Adjusted Net Income:</strong> $${totalNetIncome.toFixed(2)}</p>
    <p><strong>Combined Assets:</strong> $${combinedAssets.toFixed(2)}</p>
    <hr class="separator-bar">
    </details>
        <button class="btn-close-snap-screening" style="background-color: #dc3545; color: white; border: none; border-radius: 4px; padding: 8px 16px; font-size: 13px; cursor: pointer; transition: background-color 0.3s;" onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Close SNAP Screening</button>

    <p><strong>Members:</strong> ${household.map(member => `${capitalizeFirstLetter(member.firstName)} ${capitalizeFirstLetter(member.lastName)}`).join(', ')}</p>
    
    <p><strong>Eligibility:</strong> ${Array.isArray(eligibility) ? eligibility.join(', ') : eligibility}</p>
    ${
    isLikelyEligible && benefitAmount > 0
        ? `
        <p><strong>Estimated Benefit Amount:</strong> ${
            benefitAmount < 24 ? "Up to $24.00" : `Up to $24.00 - $${benefitAmount.toFixed(2)}`
        }</p>
        <p><strong>Expedited Eligibility:</strong> ${
            capitalizeFirstLetter(household[0]?.SNAP?.expeditedEligibility || 'N/A')
        }</p>
        `
        : ''
    }
    `;
    
                snapHouseholdContainer.appendChild(householdDiv);
    
                const closeBtn = householdDiv.querySelector('.btn-close-snap-screening');
                closeBtn.addEventListener('click', () => {
                    openCloseSnapModal(clientId, members, household);
                });
            });
        }
    }
    
    // --- SNAP Screening Close Modal ---
    function createCloseSnapModal() {
        if (document.getElementById('close-snap-modal')) return;
    
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'close-snap-modal';
        modalOverlay.style.cssText = `
            display: none;
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 9999;
            justify-content: center;
            align-items: center;
        `;
    
        modalOverlay.innerHTML = `
            <div style="background: white; padding: 24px; border-radius: 8px; min-width: 350px; max-width: 500px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                <h3 style="margin-top: 0;">Close SNAP Screening</h3>
                <label for="snap-close-reason-select"><strong>Select a reason:</strong></label>
                <select id="snap-close-reason-select" style="width: 100%; padding: 8px; margin: 12px 0; font-size: 14px;">
                    <option value="">-- Select a reason --</option>
                    <option value="Already Enrolled">Already Enrolled</option>
                    <option value="Ineligible - Income">Ineligible - Income</option>
                    <option value="Ineligible - Income and Assets">Ineligible - Income and Assets</option>
                    <option value="Client Not Interested"> Not Interested</option>
                    <option value="Client Unresponsive">Too Confusing</option>
                    <option value="Will Call Back">Will Call Back</option>
                </select>
                <div style="display: flex; gap: 10px; justify-content: center; margin-top: 16px;">
                    <button id="snap-close-cancel-btn" style="padding: 8px 16px; cursor: pointer;">Cancel</button>
                    <button id="snap-close-confirm-btn" style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; transition: background-color 0.3s;" onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Confirm Close</button>
                </div>
            </div>
        `;
    
        document.body.appendChild(modalOverlay);
    
        document.getElementById('snap-close-cancel-btn').addEventListener('click', () => {
            modalOverlay.style.display = 'none';
        });
    
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.style.display = 'none';
            }
        });
    }
    
    function openCloseSnapModal(clientId, allMembers, household) {
        createCloseSnapModal();
        const modal = document.getElementById('close-snap-modal');
        const select = document.getElementById('snap-close-reason-select');
        const confirmBtn = document.getElementById('snap-close-confirm-btn');
    
        select.value = '';
        modal.style.display = 'flex';

        // Auto-select the most appropriate reason based on SNAP eligibility
        const snapEligibility = (household[0]?.SNAP?.eligibility || []).join(' ').toUpperCase();
        const clientId2 = getQueryParameter('id');

        // Check client-level statuses first (from the prefetched client or fresh fetch)
        const isAlreadyEnrolled = client?.snap === 'yes';
        const isNotInterested = client?.snap === 'notinterested';

        if (isAlreadyEnrolled) {
            select.value = 'Already Enrolled';
        } else if (isNotInterested) {
            select.value = 'Not Interested';
        } else if (snapEligibility.includes('ALREADY ENROLLED')) {
            select.value = 'Already Enrolled';
        } else if (snapEligibility.includes('NOT INTERESTED')) {
            select.value = 'Client Not Interested';
        } else if (snapEligibility.includes('INCOME AND ASSETS') || snapEligibility.includes('ASSETS')) {
            select.value = 'Ineligible - Income and Assets';
        } else if (snapEligibility.includes('INCOME') && snapEligibility.includes('NOT LIKELY')) {
            select.value = 'Ineligible - Income';
        }

        // Remove old listener by cloning
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
        newConfirmBtn.addEventListener('click', async () => {
            const reason = select.value;
            if (!reason) {
                alert('Please select a reason.');
                return;
            }
    
            try {
                // Update each member in the SNAP household
                for (const member of household) {
                    if (member.SNAP) {
                        member.SNAP.screeningInProgress = false;
                        member.SNAP.screeningCloseReason = reason;
                    }
                }
    
                const saveResponse = await fetch(`/save-household-members`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientId, householdMembers: allMembers })
                });
    
                if (saveResponse.ok) {
                    modal.style.display = 'none';
                    await addNoteToClient(clientId, `<strong>SNAP screening closed.</strong><br><br> Reason: ${reason}`);
                    await renderNotesContainer();
                    await refreshAllDisplays();
                } else {
                    console.error('Failed to close SNAP screening.');
                }
            } catch (error) {
                console.error('Error closing SNAP screening:', error);
            }
        });
    }
    
    async function addNoteToClient(clientId, noteText) {
        const activeUser = sessionStorage.getItem('loggedInUser');
        if (!activeUser) {
            console.error("No active user found in sessionStorage.");
            return;
        }

        const timestamp = new Date().toLocaleString();

        const note = {
            text: noteText,
            timestamp: timestamp,
            username: activeUser
        };

        try {
            const response = await fetch(`/add-note-to-client`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, note })
            });

            if (!response.ok) {
                console.warn('Failed to add note to client.');
            }
        } catch (error) {
            console.error('Error adding note:', error);
        }
    }

    async function renderNotesContainer() {
        const clientId = getQueryParameter('id');
        if (typeof window.renderNotes === 'function') {
            await window.renderNotes(clientId);
        } else {
            console.warn('renderNotes function from notes.js not available. Notes may not refresh.');
        }
    }

// Batch all display refreshes into a single function to avoid visual stutter
async function refreshAllDisplays() {
    // Fetch data once, then pass to all display functions
    const freshMembers = await loadHouseholdMembers();
    const clientId = getQueryParameter('id');
    const clientRes = await fetch(`/get-client/${clientId}`);
    const freshClient = clientRes.ok ? await clientRes.json() : null;

    await displayHouseholdMembers(freshMembers);
    await displaySNAPHouseholds(freshMembers, freshClient);
    await displayLIHEAPHouseholds(freshMembers, freshClient);

    // Refresh the current enrollments questions to show/hide based on closed benefits
    if (window.refreshCurrentEnrollments) {
        await window.refreshCurrentEnrollments();
    }

        // Fetch truly fresh members AFTER all saves are complete, then refresh income
        if (window.refreshIncome) {
            await window.refreshIncome();
        }

            // Refresh farmworker question visibility based on SNAP screening status
    if (window.refreshFarmworkerVisibility) {
        await window.refreshFarmworkerVisibility();
    }

        // Refresh asset display to re-evaluate show/hide Add Asset buttons
        if (window.refreshAssetDisplay) {
            await window.refreshAssetDisplay();
        }

    // Refresh the expense buttons to reflect the change
    if (window.refreshExpenseButtons) {
        await window.refreshExpenseButtons();
    }

    // Check if all screenings are now closed across all members
    await checkAndAutoTerminateScreening(freshMembers);
}

// Auto-terminate screening if all benefits are closed for all members
async function checkAndAutoTerminateScreening(members) {
    // Only check if screening is currently in progress
    if (client.screeningInProgress !== true) return;

    const allBenefits = ['PACE', 'LIS', 'MSP', 'PTRR', 'SNAP', 'LIHEAP'];
    
    // Check if every member has all their benefits either closed (screeningInProgress === false) or not checked
    const allClosed = members.every(member => {
        return allBenefits.every(benefit => {
            const benefitObj = member[benefit];
            if (!benefitObj) return true; // No benefit object = not applicable
            if (benefitObj.eligibility?.includes('Not Checked')) return true; // Skip "Not Checked" benefits
            if (benefitObj.eligibility?.includes('Not Enrolled in Medicare')) return true;
            if (benefitObj.eligibility?.includes('Enrolled in Medicaid')) return true;
            if (benefitObj.eligibility?.includes('Age Criteria Not Met')) return true;
            if (benefitObj.eligibility?.includes('No Formal Lease')) return true;
            if (benefitObj.eligibility?.includes('Not Interested')) return true;
            if (benefitObj.eligibility?.includes('Already Enrolled')) return true;
            if (benefitObj.eligibility?.includes('Already Applied')) return true;
            return benefitObj.screeningInProgress === false;
        });
    });

    if (allClosed) {
        const activeUser = sessionStorage.getItem('loggedInUser')?.trim() || 'Unknown User';

        try {
            // Update client-level screeningInProgress to false
            const updateResponse = await fetch(`/update-client`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, clientData: { screeningInProgress: false } })
            });

            if (updateResponse.ok) {
                if (typeof window.renderNotes === 'function') {
                    await window.renderNotes(clientId);
                }

                client.screeningInProgress = false;
                createStopScreeningButton();

                // Hide all estimation containers
                const householdMemberContainer = document.getElementById('household-members-container');
                const snapHouseholdContainer = document.getElementById('snap-household-container');
                const liheapHouseholdContainer = document.getElementById('liheap-household-container');
                if (householdMemberContainer) householdMemberContainer.style.display = 'none';
                if (snapHouseholdContainer) snapHouseholdContainer.style.display = 'none';
                if (liheapHouseholdContainer) liheapHouseholdContainer.style.display = 'none';

                console.log('All screenings closed — screening auto-terminated.');
            }
        } catch (error) {
            console.error('Error auto-terminating screening:', error);
        }
    }
}

async function displayLIHEAPHouseholds(prefetchedMembers, prefetchedClient) {
    const liheapHouseholdContainer = document.getElementById('liheap-household-container');
    if (!liheapHouseholdContainer) {
        console.error('liheap-household-container element not found in the DOM.');
        return;
    }

    const members = prefetchedMembers || await loadHouseholdMembers();
    liheapHouseholdContainer.innerHTML = ''; // Clear existing content

    // Exclude deceased members from LIHEAP household display
    const activeMembersForLIHEAP = members.filter(
        m => (m.deceased ?? '').toLowerCase() !== 'yes'
    );

// Check if client is not interested in LIHEAP or already enrolled
const clientId = getQueryParameter('id');
const client = prefetchedClient || await fetch(`/get-client/${clientId}`)
    .then(response => response.json())
    .catch(error => {
        console.error('Error fetching client data:', error);
        return null;
    });

// Check if LIHEAP screening is closed FIRST (before checking enrollment status)
const liheapScreeningClosed = activeMembersForLIHEAP.length > 0 && activeMembersForLIHEAP[0]?.LIHEAP?.screeningInProgress === false;

if (liheapScreeningClosed) {
    const reopenDiv = document.createElement('div');
    reopenDiv.classList.add('household-member-box');
    reopenDiv.innerHTML = `
        <h3>LIHEAP HOUSEHOLD</h3>
                <div style="background-color:rgb(212, 212, 212); border: 1px solid rgb(0, 0, 0); padding: 8px; border-radius: 4px; margin: 8px 0; text-align: center; width: 100%; box-sizing: border-box;">
            <p style="margin: 0 0 6px 0;"><strong>LIHEAP Screening Closed</strong></p>
            <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${activeMembersForLIHEAP[0]?.LIHEAP?.screeningCloseReason || 'N/A'}</p>
            <button id="reopen-liheap-screening-btn" 
                style="background-color: #007bff; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: background-color 0.3s;"
                onmouseover="this.style.backgroundColor='#0056b3'" 
                onmouseout="this.style.backgroundColor='#007bff'">
                Reopen LIHEAP Screening
            </button>
        </div>
    `;
    liheapHouseholdContainer.appendChild(reopenDiv);

    document.getElementById('reopen-liheap-screening-btn').addEventListener('click', async () => {
        try {
            for (const member of activeMembersForLIHEAP) {
                if (member.LIHEAP) {
                    member.LIHEAP.screeningInProgress = true;
                    member.LIHEAP.screeningCloseReason = null;
                }
            }

            const saveResponse = await fetch(`/save-household-members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, householdMembers: members })
            });

            if (saveResponse.ok) {
                await addNoteToClient(clientId, '<strong>LIHEAP screening reopened.</strong>');
                await renderNotesContainer();
                await refreshAllDisplays();
            } else {
                console.error('Failed to reopen LIHEAP screening.');
            }
        } catch (error) {
            console.error('Error reopening LIHEAP screening:', error);
        }
    });

    return; // Exit early - screening is closed, don't show anything else
}

// Only check enrollment status if screening is NOT closed
const isLiheapAlreadyEnrolled = client?.liheapEnrollment === 'yes' && client?.heatingCrisis === 'no';
const isLiheapNotInterested = client?.liheapEnrollment === 'notinterested';

    
if (isLiheapAlreadyEnrolled || isLiheapNotInterested) {
    const noHouseholdsDiv = document.createElement('div');
    noHouseholdsDiv.classList.add('household-member-box');
    noHouseholdsDiv.style.backgroundColor = '#f8d7da'; // Red for already enrolled / not interested
    noHouseholdsDiv.style.borderColor = '#f5c6cb';

    const anyLiheapScreeningActive = members.some(m => m.LIHEAP?.screeningInProgress === true);

    noHouseholdsDiv.innerHTML = `
        <h3>LIHEAP HOUSEHOLD</h3>
        ${isLiheapAlreadyEnrolled ? `
            <p>ALREADY ENROLLED</p>
        ` : `
            <p>NOT INTERESTED</p>
        `}
        ${anyLiheapScreeningActive || isLiheapAlreadyEnrolled || isLiheapNotInterested ? `
            <button class="btn-close-liheap-screening" style="background-color: #dc3545; color: white; border: none; border-radius: 4px; padding: 8px 16px; font-size: 13px; cursor: pointer; transition: background-color 0.3s;" onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Close LIHEAP Screening</button>
        ` : ''}
    `;
    liheapHouseholdContainer.appendChild(noHouseholdsDiv);

    if (anyLiheapScreeningActive || isLiheapAlreadyEnrolled || isLiheapNotInterested) {
        const closeBtn = noHouseholdsDiv.querySelector('.btn-close-liheap-screening');
        closeBtn.addEventListener('click', () => {
            const liheapMembers = members.filter(m => m.LIHEAP?.screeningInProgress === true);
            openCloseLiheapModal(clientId, members, liheapMembers);
        });
    }
    return;
}
    
        // Use the combined values from the first active member (uniform across household)
        const combinedYearlyIncome = activeMembersForLIHEAP[0]?.LIHEAP?.combinedYearlyIncome || 0;
        const eligibility = activeMembersForLIHEAP[0]?.LIHEAP?.eligibility?.map(capitalizeFirstLetter) || 'Not Available';
    
        // Create a container for the LIHEAP household details
        const householdDiv = document.createElement('div');
        householdDiv.classList.add('household-member-box');

        const isLikelyEligible = Array.isArray(eligibility)
            ? !eligibility.some(item => item.includes("NOT") || item.includes("ALREADY ENROLLED") || item.includes("NOT INTERESTED")) || eligibility.some(item => item.includes("RECOMMENDED"))
            : !String(eligibility).includes("NOT") && !String(eligibility).includes("ALREADY ENROLLED") && !String(eligibility).includes("NOT INTERESTED") || String(eligibility).includes("RECOMMENDED");

        const isNotEligible = Array.isArray(eligibility)
            ? eligibility.some(item => item.includes("NOT") || item.includes("ALREADY ENROLLED") || item.includes("NOT INTERESTED")) && !eligibility.some(item => item.includes("RECOMMENDED"))
            : (String(eligibility).includes("NOT") || String(eligibility).includes("ALREADY ENROLLED") || String(eligibility).includes("NOT INTERESTED")) && !String(eligibility).includes("RECOMMENDED");

        const needsMoreInfo = Array.isArray(eligibility)
            ? eligibility.some(item => item.includes("NEEDS"))
            : String(eligibility).includes("NEEDS");

        // Apply color coding based on eligibility
        if (isNotEligible) {
            householdDiv.style.backgroundColor = '#f8d7da'; // Red background
            householdDiv.style.borderColor = '#f5c6cb';
        } else if (needsMoreInfo) {
            householdDiv.style.backgroundColor = '#fff3cd'; // Yellow background
            householdDiv.style.borderColor = '#ffc107';
        } else if (isLikelyEligible) {
            householdDiv.style.backgroundColor = '#d4edda'; // Green background
            householdDiv.style.borderColor = '#c3e6cb';
        }
    
        // Populate household details
        householdDiv.innerHTML = `
            <details class="custom-details">
                <summary><h3>LIHEAP HOUSEHOLD</h3></summary>
                <p><strong>Combined Yearly Income:</strong> $${combinedYearlyIncome.toFixed(2)}</p>
                <hr class="separator-bar">
            </details>
                        <button class="btn-close-liheap-screening" style="background-color: #dc3545; color: white; border: none; border-radius: 4px; padding: 8px 16px; font-size: 13px; cursor: pointer; transition: background-color 0.3s;" onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Close LIHEAP Screening</button>

            <p><strong>Members:</strong> ${activeMembersForLIHEAP.map(member => `${capitalizeFirstLetter(member.firstName)} ${capitalizeFirstLetter(member.lastName)}`).join(', ')}</p>
            <p><strong>Eligibility:</strong> ${Array.isArray(eligibility) ? eligibility.join(', ') : eligibility}</p>
        `;
    
        liheapHouseholdContainer.appendChild(householdDiv);

        const closeBtn = householdDiv.querySelector('.btn-close-liheap-screening');
        closeBtn.addEventListener('click', () => {
            openCloseLiheapModal(clientId, members, activeMembersForLIHEAP);
        });
    }

    // --- LIHEAP Screening Close Modal ---
    function createCloseLiheapModal() {
        if (document.getElementById('close-liheap-modal')) return;

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'close-liheap-modal';
        modalOverlay.style.cssText = `
            display: none;
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 9999;
            justify-content: center;
            align-items: center;
        `;

        modalOverlay.innerHTML = `
            <div style="background: white; padding: 24px; border-radius: 8px; min-width: 350px; max-width: 500px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                <h3 style="margin-top: 0;">Close LIHEAP Screening</h3>
                <label for="liheap-close-reason-select"><strong>Select a reason:</strong></label>
                <select id="liheap-close-reason-select" style="width: 100%; padding: 8px; margin: 12px 0; font-size: 14px;">
                    <option value="">-- Select a reason --</option>
                    <option value="Already Enrolled">Already Enrolled</option>
                    <option value="Ineligible - Income">Ineligible - Income</option>
                    <option value="Subsidized Housing and No Heating Responsibility">Subsidized Housing and No Heating Responsibility</option>
                    <option value="Client Not Interested">Not Interested</option>
                    <option value="Client Unresponsive">Too Confusing</option>
                    <option value="Will Call Back">Will Call Back</option>
                </select>
                <div style="display: flex; gap: 10px; justify-content: center; margin-top: 16px;">
                    <button id="liheap-close-cancel-btn" style="padding: 8px 16px; cursor: pointer;">Cancel</button>
                    <button id="liheap-close-confirm-btn" style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; transition: background-color 0.3s;" onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Confirm Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        document.getElementById('liheap-close-cancel-btn').addEventListener('click', () => {
            modalOverlay.style.display = 'none';
        });

        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.style.display = 'none';
            }
        });
    }

    function openCloseLiheapModal(clientId, allMembers, activeLiheapMembers) {
        createCloseLiheapModal();
        const modal = document.getElementById('close-liheap-modal');
        const select = document.getElementById('liheap-close-reason-select');
        const confirmBtn = document.getElementById('liheap-close-confirm-btn');

        select.value = '';
        modal.style.display = 'flex';

        // Auto-select the most appropriate reason based on LIHEAP eligibility
        const liheapEligibility = (activeLiheapMembers[0]?.LIHEAP?.eligibility || []).join(' ').toUpperCase();

        // Check client-level statuses
        const isLiheapAlreadyEnrolled = client?.liheapEnrollment === 'yes' && client?.heatingCrisis === 'no';
        const isLiheapNotInterested = client?.liheapEnrollment === 'notinterested';

        if (isLiheapAlreadyEnrolled) {
            select.value = 'Already Enrolled';
        } else if (isLiheapNotInterested) {
            select.value = 'Client Not Interested';
        } else if (liheapEligibility.includes('ALREADY ENROLLED')) {
            select.value = 'Already Enrolled';
        } else if (liheapEligibility.includes('NOT INTERESTED')) {
            select.value = 'Client Not Interested';
        } else if (liheapEligibility.includes('HEATING COST INCLUDED') && liheapEligibility.includes('SUBSIDIZED')) {
            select.value = 'Subsidized Housing and No Heating Responsibility';
        } else if (liheapEligibility.includes('INCOME') && liheapEligibility.includes('NOT LIKELY')) {
            select.value = 'Ineligible - Income';
        }

        // Remove old listener by cloning
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        newConfirmBtn.addEventListener('click', async () => {
            const reason = select.value;
            if (!reason) {
                alert('Please select a reason.');
                return;
            }

            try {
                for (const member of activeLiheapMembers) {
                    if (member.LIHEAP) {
                        member.LIHEAP.screeningInProgress = false;
                        member.LIHEAP.screeningCloseReason = reason;
                    }
                }

                const saveResponse = await fetch(`/save-household-members`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientId, householdMembers: allMembers })
                });

                if (saveResponse.ok) {
                    modal.style.display = 'none';
                    await addNoteToClient(clientId, `<strong>LIHEAP screening closed.</strong><br><br> Reason: ${reason}`);
                    await renderNotesContainer();
                    await refreshAllDisplays();
                } else {
                    console.error('Failed to close LIHEAP screening.');
                }
            } catch (error) {
                console.error('Error closing LIHEAP screening:', error);
            }
        });
    }

// After PACEEligibilityCheck, reload and display updated household members
async function updateAndDisplayHouseholdMembers() {
    const clientId = getQueryParameter('id');
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }

    try {
        const response = await fetch(`/get-client/${clientId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch updated client data: ${response.statusText}`);
        }

        const updatedClient = await response.json();

        if (updatedClient && updatedClient.householdMembers) {
            console.log('Updated household members:', updatedClient.householdMembers);
            await displayHouseholdMembers(updatedClient.householdMembers);
        } else {
            console.error('Failed to retrieve updated household members.');
        }
    } catch (error) {
        console.error('Error updating and displaying household members:', error);
    }
}

function calculateYearlyIncome(amount, frequency, startDate, endDate, type = "Previous") {
    if (!amount || !frequency) {
        console.error('Invalid income data:', { amount, frequency });
        return 0;
    }

    // Default yearly multiplier based on frequency
    let yearlyMultiplier;
    switch (frequency.toLowerCase()) {
        case 'one-time':
            yearlyMultiplier = 1; // One-time income
            break;
        case 'weekly':
            yearlyMultiplier = 52; // 52 weeks in a year
            break;
        case 'bi-weekly':
            yearlyMultiplier = 26; // 26 bi-weekly periods in a year
            break;
        case 'semi-monthly':
            yearlyMultiplier = 24; // 24 semi-monthly periods in a year
            break;
        case 'monthly':
            yearlyMultiplier = 12; // 12 months in a year
            break;
        case 'quarterly':
            yearlyMultiplier = 4; // 4 quarters in a year
            break;
        case 'annually':
            yearlyMultiplier = 1; // Already yearly
            break;
        default:
            console.error('Unknown frequency:', frequency);
            return 0;
    }

    // Validate and parse the provided startDate and endDate
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.error('Invalid startDate or endDate:', { startDate, endDate });
        return 0; // Return 0 if dates are invalid
    }

    // Calculate the number of days the income is active within the given dates
    const totalDaysInYear = 365; // Assuming a non-leap year
    const activeDays = Math.min(Math.max((end - start) / (1000 * 60 * 60 * 24) + 1, 0), 365); // Cap active days at 365
    // Prorate the yearly income based on active days
    const proratedMultiplier = Math.min(activeDays / totalDaysInYear, 1); // Ensure the multiplier does not exceed 1
    const proratedYearlyIncome = amount * yearlyMultiplier * proratedMultiplier;

    console.log(`Start Date: ${start}, End Date: ${end}`);
    console.log(`Active Days: ${activeDays}, Prorated Multiplier: ${proratedMultiplier}`);
    console.log(`Prorated income: Amount: ${amount}, Frequency: ${frequency}, Prorated Yearly Income: ${proratedYearlyIncome}`);
    return proratedYearlyIncome;
}

async function PACEEligibilityCheck(members) {
    // Step 1: Precompute adjustedIncome for all members
    for (const member of members) {
        try {
            // Skip deceased members - set PACE to Not Checked
            if ((member.deceased ?? '').toLowerCase() === 'yes') {
                member.PACE = {
                    combinedIncome: 0,
                    eligibility: ["Not Checked"],
                    screeningInProgress: member.PACE?.screeningInProgress ?? false,
                    screeningCloseReason: member.PACE?.screeningCloseReason ?? "Not Applicable"
                };
                console.log(`Skipping PACE for deceased member: ${member.firstName} ${member.lastName}`);
                continue;
            }

            const incomes = member.income || [];
            const previousYearIncomes = incomes.filter(income => income.type && income.type.toLowerCase() === "previous");

            // Calculate total income for the previous full year
            const currentYear = new Date().getFullYear();
            const previousYear = currentYear - 1;
            const previousYearStart = new Date(`${previousYear}-01-01`);
            const previousYearEnd = new Date(`${previousYear}-12-31`);

            let totalIncome = previousYearIncomes.reduce((sum, income) => {
                const yearlyAmount = calculateYearlyIncome(
                    income.amount,
                    income.frequency,
                    income.startDate,
                    income.endDate
                );

                // Only include income active during the previous year
                const incomeStart = new Date(income.startDate);
                const incomeEnd = income.endDate ? new Date(income.endDate) : new Date();

                if (incomeStart <= previousYearEnd && incomeEnd >= previousYearStart) {
                    const activeStart = incomeStart < previousYearStart ? previousYearStart : incomeStart;
                    const activeEnd = incomeEnd > previousYearEnd ? previousYearEnd : incomeEnd;

                    const activeDays = Math.min((activeEnd - activeStart) / (1000 * 60 * 60 * 24) + 1, 365);                    const proratedMultiplier = activeDays / 365; // Prorate for the active days in the year
                    return sum + yearlyAmount * proratedMultiplier;
                }

                return sum;
            }, 0);

            const medicarePartBExpense = member.expenses?.find(expense =>
                expense.type === "Previous Year" && expense.kind === "Medicare Part B Premium"
            );

            if (medicarePartBExpense) {
                const startDate = new Date(medicarePartBExpense.startDate);
                const endDate = new Date(medicarePartBExpense.endDate);
                const today = new Date();
                const effectiveEndDate = endDate > today ? today : endDate;

                const monthsActive = (effectiveEndDate.getFullYear() - startDate.getFullYear()) * 12 +
                                     (effectiveEndDate.getMonth() - startDate.getMonth()) + 1;

                let yearlyMultiplier;
                switch (medicarePartBExpense.frequency.toLowerCase()) {
                    case 'one-time': yearlyMultiplier = 1; break;
                    case 'weekly': yearlyMultiplier = 52; break;
                    case 'bi-weekly': yearlyMultiplier = 26; break;
                    case 'semi-monthly': yearlyMultiplier = 24; break;
                    case 'monthly': yearlyMultiplier = 12; break;
                    case 'quarterly': yearlyMultiplier = 4; break;
                    case 'annually': yearlyMultiplier = 1; break;
                    default: yearlyMultiplier = 0; break;
                }

                if (yearlyMultiplier > 0) {
                    const proratedMultiplier = monthsActive / 12;
                    const yearlyMedicarePartB = medicarePartBExpense.amount * yearlyMultiplier * proratedMultiplier;
                    totalIncome -= yearlyMedicarePartB;
                }
            }

            member.adjustedIncome = totalIncome;
            console.log(`Adjusted income for ${member.firstName} ${member.lastName}: $${member.adjustedIncome}`);
        } catch (error) {
            console.error(`Error calculating adjusted income for ${member.firstName} ${member.lastName}:`, error);
        }
    }

// Step 2: Calculate combined income and eligibility
for (const member of members) {
    try {
        // Use the previousSpouseId field to find the spouse
        const spouse = members.find(m => m.householdMemberId === member.previousSpouseId);

        if (spouse) {
            console.log(`Spouse found: ${spouse.firstName} ${spouse.lastName}`);

            const memberIncome = Number(member.adjustedIncome) || 0;
            const spouseIncome = Number(spouse.adjustedIncome) || 0;

            member.combinedIncome = memberIncome + spouseIncome;
            spouse.combinedIncome = member.combinedIncome;

            console.log(`Combined income for ${member.firstName} ${member.lastName} and ${spouse.firstName} ${spouse.lastName}: $${member.combinedIncome}`);
        } else {
            console.log(`No spouse found for ${member.firstName} ${member.lastName}`);
            member.combinedIncome = member.adjustedIncome;
        }
    
               // Eligibility checks
const eligibility = [];

// Parse the age from the member object
const age = member.age; // Example: "64 Years 11 Months 0 Days"
const [years, months, days] = age
    .replace(/Years,|Months,|Days/g, '') // Remove the words "Years", "Months", and "Days"
    .trim()
    .split(/\s+/) // Split by spaces
    .map(value => parseInt(value.trim()) || 0);

// Qualification check for age
if (years < 64 || (years === 64 && months < 11) || (years === 64 && months === 11 && days < 0)) {
    eligibility.push("Age Criteria Not Met");
    member.selections = member.selections || {};
    member.selections["Is this person currently enrolled in PACE?"] = null;
    member.selections["Has this person lived in Pennsylvania for at least the last 90 consecutive days?"] = null; // Clear residency selection
} else {
    // Check PACE and Medicaid enrollment
    const paceEnrollment = member.selections?.["Is this person currently enrolled in PACE?"]?.toLowerCase();
    const medicaidEnrollment = member.medicaid?.toLowerCase();
    const paResidency = member.selections?.["Has this person lived in Pennsylvania for at least the last 90 consecutive days?"]?.toLowerCase();

    if (medicaidEnrollment === "yes") {
        eligibility.push("Enrolled in Medicaid");
        member.selections = member.selections || {};
        member.selections["Is this person currently enrolled in PACE?"] = null; // Set paceEnrollment to "onmedicaid"
        member.selections["Has this person lived in Pennsylvania for at least the last 90 consecutive days?"] = null; // Clear residency selection
    } else if (paResidency === "no") {
        eligibility.push("Residency Not Met");
        member.selections = member.selections || {};
        member.selections["Is this person currently enrolled in PACE?"] = null;
    } else if (paceEnrollment === "yes") {
        eligibility.push("Already Enrolled");
    } else if (paceEnrollment === "notinterested") {
        eligibility.push("Not Interested");
    } else if (!paceEnrollment || paResidency === null) {
        eligibility.push("Needs Current Enrollment Status");
    } else {
        // Proceed to income-based eligibility checks only if none of the above conditions are met
        if (spouse) {
            if (member.combinedIncome < 17700) {
                eligibility.push("Likely Eligible for PACE");
            } else if (member.combinedIncome >= 17701 && member.combinedIncome <= 41500) {
                eligibility.push("Likely Eligible for PACENET");
            } else if (member.combinedIncome >= 41501 && member.combinedIncome <= 51500) {
                eligibility.push("Likely Ineligible but Within Buffer");
            } else if (member.combinedIncome > 51500) {
                eligibility.push("Not Likely Eligible for PACE or PACENET (Income)");
            }
        } else {
            if (member.combinedIncome < 14500) {
                eligibility.push("Likely Eligible for PACE");
            } else if (member.combinedIncome >= 14501 && member.combinedIncome <= 33500) {
                eligibility.push("Likely Eligible for PACENET");
            } else if (member.combinedIncome >= 33501 && member.combinedIncome <= 43500) {
                eligibility.push("Likely Ineligible but Within Buffer");
            } else if (member.combinedIncome > 43500) {
                eligibility.push("Not Likely Eligible for PACE or PACENET (Income)");
            }
        }
    }
}

member.PACE = {
    combinedIncome: Math.max(0, member.combinedIncome),
    eligibility: eligibility,
    screeningInProgress: member.PACE?.screeningInProgress ?? true,
    screeningCloseReason: member.PACE?.screeningCloseReason ?? null
};

console.log(`PACE object for ${member.firstName} ${member.lastName}:`, member.PACE);
            } catch (error) {
                console.error(`Error processing member ${member.firstName} ${member.lastName}:`, error);
            }
        }
    
        // Save the updated members array using a REST API call
const clientId = getQueryParameter('id'); // Get the client ID from the query parameter
try {
    const response = await fetch(`/save-household-members`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clientId, householdMembers: members }),
    });

    if (response.ok) {
        console.log('Household members saved successfully.');
    } else {
        console.error('Failed to save household members:', response.statusText);
    }
} catch (error) {
    console.error('Error saving household members:', error);
}}

async function PTRREligibilityCheck(members) {

        // Get the client ID from the query parameter at the top of the function
        const clientId = getQueryParameter('id');

    // Re-fetch client data to get the latest residenceStatus and other fields
    const freshClientResponse = await fetch(`/get-client/${clientId}`);
    const freshClient = freshClientResponse.ok ? await freshClientResponse.json() : client;

    // Filter members to include only those with headOfHousehold: true
    const headOfHouseholdMembers = members.filter(member => member.headOfHousehold === true);

    // Set PTRR eligibility as "Not Checked" for members who are not head of household
    members.forEach(member => {
        if (!member.headOfHousehold) {
            member.PTRR = {
                combinedIncome: 0,
                eligibility: ["Not Checked"],
                screeningInProgress: member.PTRR?.screeningInProgress ?? false,
                screeningCloseReason: member.PTRR?.screeningCloseReason ?? "Not Applicable"
            };
            console.log(`PTRR eligibility set to "Not Checked" for ${member.firstName} ${member.lastName}`);
        }
    });

    // Process only head of household members
    for (const member of headOfHouseholdMembers) {
        try {
                // Step 1: Calculate total gross income for the previous year
                const incomes = member.income || [];
                const previousYearIncomes = incomes.filter(income => income.type && income.type.toLowerCase() === "previous");
    
                // Calculate total gross income for the previous year
                const currentYear = new Date().getFullYear();
                const previousYear = currentYear - 1;
                const previousYearStart = new Date(`${previousYear}-01-01`);
                const previousYearEnd = new Date(`${previousYear}-12-31`);
    
                let totalGrossIncome = previousYearIncomes.reduce((sum, income) => {
                    let yearlyAmount = calculateYearlyIncome(
                        income.amount,
                        income.frequency,
                        income.startDate,
                        income.endDate
                    );
                
                    // If income kind is "Social Security Retirement" or "Railroad Retirement", divide by 2
                    if (
                        income.kind?.toLowerCase() === "ssa retirement" || // Case-insensitive comparison
                        income.kind?.toLowerCase() === "ssi" ||
                        income.kind?.toLowerCase() === "ssp" ||
                        income.kind?.toLowerCase() === "ssdi" ||
                        income.kind?.toLowerCase() === "railroad retirement tier 1"
                    ) {
                        yearlyAmount /= 2;
                    }
                
                    // Only include income active during the previous year
                    const incomeStart = new Date(income.startDate);
                    const incomeEnd = income.endDate ? new Date(income.endDate) : new Date();
                
                    if (incomeStart <= previousYearEnd && incomeEnd >= previousYearStart) {
                        const activeStart = incomeStart < previousYearStart ? previousYearStart : incomeStart;
                        const activeEnd = incomeEnd > previousYearEnd ? previousYearEnd : incomeEnd;
                
                        const activeDays = Math.min((activeEnd - activeStart) / (1000 * 60 * 60 * 24) + 1, 365);
                        const proratedMultiplier = activeDays / 365; // Prorate for the active days in the year
                        return sum + yearlyAmount * proratedMultiplier;
                    }
                
                    return sum;
                }, 0);
    
                // Combine incomes with spouse if applicable
const spouse = members.find(m => m.householdMemberId === member.previousSpouseId);

if (spouse) {
    console.log(`Spouse found: ${spouse.firstName} ${spouse.lastName}`);

    const spouseIncomes = spouse.income || [];
    const spousePreviousYearIncomes = spouseIncomes.filter(income => income.type && income.type.toLowerCase() === "previous");

    let spouseTotalGrossIncome = spousePreviousYearIncomes.reduce((sum, income) => {
        const yearlyAmount = calculateYearlyIncome(
            income.amount,
            income.frequency,
            income.startDate,
            income.endDate
        );

        const incomeStart = new Date(income.startDate);
        const incomeEnd = income.endDate ? new Date(income.endDate) : new Date();

        if (incomeStart <= previousYearEnd && incomeEnd >= previousYearStart) {
            const activeStart = incomeStart < previousYearStart ? previousYearStart : incomeStart;
            const activeEnd = incomeEnd > previousYearEnd ? previousYearEnd : incomeEnd;

            const activeDays = Math.min((activeEnd - activeStart) / (1000 * 60 * 60 * 24) + 1, 365);
            const proratedMultiplier = activeDays / 365;
            return sum + yearlyAmount * proratedMultiplier;
        }

        return sum;
    }, 0);

    totalGrossIncome += spouseTotalGrossIncome;
} else {
    console.log(`No spouse found for ${member.firstName} ${member.lastName}`);
}
    
                console.log(`Total gross income for ${member.firstName} ${member.lastName}: $${totalGrossIncome}`);
    
                // Step 2: Determine PTRR eligibility
                const eligibility = [];
    
                const applicationStatus = member.selections?.["Has this person already applied for PTRR this year?"]?.toLowerCase();
                const dob = new Date(member.dob);
                const today = new Date();
                let age = today.getFullYear() - dob.getFullYear();
                const isDisabled = member.disability?.toLowerCase() === "yes";
                const isWidowed = member.previousMaritalStatus?.toLowerCase() === "widowed";
    
                if (
                    today.getMonth() < dob.getMonth() ||
                    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())
                ) {
                    age--;
                }
    
                if (member.residenceStatus?.toLowerCase() === "other") {
                    eligibility.push("No Formal Lease");
                } else if (applicationStatus === "yes") {
                    eligibility.push("Already Applied");
                } else if (!(age >= 18 && isDisabled) && !(age >= 50 && isWidowed) && !(age >= 65)) {
    eligibility.push("Age, Disability, or Widow Status Criteria Not Met");
    member.selections = member.selections || {};
    member.selections["Has this person already applied for PTRR this year?"] = "agecriterianotmet";
} else if (!applicationStatus || applicationStatus.toLowerCase().trim() === "n/a" || 
                applicationStatus.toLowerCase().trim() === "not interested" || 
                applicationStatus.toLowerCase().trim() === "agecriterianotmet") {
         eligibility.push("Needs Current Enrollment Status");
        } else if (applicationStatus === "notinterested") {
            eligibility.push("Not Interested");
     } else if (applicationStatus.toLowerCase().trim() === "no" && totalGrossIncome > 46520) {
                    eligibility.push("Not Likely Eligible for PTRR (Income)");
                } else {
                    const relevantExpenses = (member.expenses || []).filter(expense => {
                        const residenceStatus = freshClient.residenceStatus?.toLowerCase();
                        const isPropertyTax = expense.kind?.trim() === "Property Taxes";
                        const isRent = expense.kind?.trim() === "Rent";
                        const isPreviousYear = expense.type?.trim() === "Previous Year";
                    
                        if (residenceStatus === "owned") {
                            return isPropertyTax && isPreviousYear;
                        } else if (residenceStatus === "rented") {
                            return isRent && isPreviousYear;
                        } else if (residenceStatus === "rentedowned") {
                            return (isPropertyTax && isRent) && isPreviousYear;
                        }
                        return false;
                    });
    
                    if (applicationStatus.toLowerCase().trim() === "no" && relevantExpenses.length === 0) {
                        const residenceStatus = freshClient.residenceStatus?.toLowerCase();
                        if (residenceStatus === "owned") {
                            eligibility.push("Needs Previous Year Property Tax Expense");
                        } else if (residenceStatus === "rented") {
                            eligibility.push("Needs Previous Year Rent Expense");
                        } else if (residenceStatus === "rentedowned") {
                            eligibility.push("Needs Previous Year Property Tax and Rent Expense");
                        } else {
                            eligibility.push("Not Likely Eligible for PTRR (No Relevant Expenses)");
                        }
                    } else {
                        eligibility.push("Likely Eligible for PTRR");
                    }
                }
    
                member.PTRR = {
                    combinedIncome: totalGrossIncome,
                    eligibility: eligibility,
                    screeningInProgress: member.PTRR?.screeningInProgress ?? true,
                    screeningCloseReason: member.PTRR?.screeningCloseReason ?? null
                };
    
                console.log(`PTRR object for ${member.firstName} ${member.lastName}:`, member.PTRR);
            } catch (error) {
                console.error(`Error processing member ${member.firstName} ${member.lastName}:`, error);
            }
        }
    
        // Save the updated members array using a REST API call
try {
    const response = await fetch(`/save-household-members`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clientId, householdMembers: members }),
    });

    if (response.ok) {
        console.log('Household members saved successfully.');
    } else {
        console.error('Failed to save household members:', response.statusText);
    }
} catch (error) {
    console.error('Error saving household members:', error);
}}

async function LISEligibilityCheck(members) {
    for (const member of members) {
        try {
            // Skip deceased members - set LIS to Not Checked
            if ((member.deceased ?? '').toLowerCase() === 'yes') {
                member.LIS = {
                    combinedIncome: 0,
                    combinedAssets: 0,
                    eligibility: ["Not Checked"],
                    screeningInProgress: member.LIS?.screeningInProgress ?? false,
                    screeningCloseReason: member.LIS?.screeningCloseReason ?? "Not Applicable"
                };
                console.log(`Skipping LIS for deceased member: ${member.firstName} ${member.lastName}`);
                continue;
            }

            // Step 1: Check age and enrollment status
            const dob = new Date(member.dob);
                const ageDifMs = Date.now() - dob.getTime();
                const ageDate = new Date(ageDifMs);
                const age = Math.abs(ageDate.getUTCFullYear() - 1970);
                const medicareEnrollment = member.medicare?.toLowerCase();
                const medicaidEnrollment = member.medicaid?.toLowerCase();
                if (medicareEnrollment === "no") {
                    console.log(`${member.firstName} ${member.lastName} is not enrolled in Medicare. Marking as 'Not Enrolled in Medicare'.`);
                    member.LIS = {
                        combinedIncome: 0,
                        combinedAssets: 0,
                        eligibility: ["Not Enrolled in Medicare"],
                        screeningInProgress: member.LIS?.screeningInProgress ?? true,
                        screeningCloseReason: member.LIS?.screeningCloseReason ?? null
                    };
                    member.selections = member.selections || {};
                    member.selections["Is this person currently enrolled in LIS/ Extra Help?"] = "notenrolledinmedicare";
                    continue;
                } else if (medicaidEnrollment === "yes") {
                    console.log(`${member.firstName} ${member.lastName} is enrolled in Medicaid. Marking as 'Enrolled in Medicaid'.`);
                    member.LIS = {
                        combinedIncome: 0,
                        combinedAssets: 0,
                        eligibility: ["Enrolled in Medicaid"],
                        screeningInProgress: member.LIS?.screeningInProgress ?? true,
                        screeningCloseReason: member.LIS?.screeningCloseReason ?? null
                    };
                    selections = member.selections || {};
                    selections["Is this person currently enrolled in LIS/ Extra Help?"] = "onmedicaid";
                    member.selections = selections;
                    continue;
                }
    
                const lisEnrollment = member.selections?.["Is this person currently enrolled in LIS/ Extra Help?"]?.toLowerCase();
                if (lisEnrollment === "yes") {
                    console.log(`${member.firstName} ${member.lastName} is already enrolled in LIS. Marking as 'Already Enrolled'.`);
                    member.LIS = {
                        combinedIncome: 0,
                        combinedAssets: 0,
                        eligibility: ["Already Enrolled"],
                        screeningInProgress: member.LIS?.screeningInProgress ?? true,
                        screeningCloseReason: member.LIS?.screeningCloseReason ?? null
                    };
                    continue;
                } else if (lisEnrollment === "notinterested") {
                    console.log(`${member.firstName} ${member.lastName} is not interested. Marking as 'Not Checked'.`);
                    member.LIS = {
                        combinedIncome: 0,
                        combinedAssets: 0,
                        eligibility: ["Not Interested"],
                        screeningInProgress: member.LIS?.screeningInProgress ?? true,
                        screeningCloseReason: member.LIS?.screeningCloseReason ?? null
                    };
                    continue;
                } else if (!lisEnrollment || lisEnrollment.toLowerCase().trim() === "notenrolledinmedicare" ||lisEnrollment.toLowerCase().trim() === "onmedicaid" ||lisEnrollment.toLowerCase().trim() === "n/a" || lisEnrollment.toLowerCase().trim() === "not interested") {
                    console.log(`${member.firstName} ${member.lastName} has LIS status as N/A. Marking as 'Needs Current Enrollment Status'.`);
                    member.LIS = {
                        combinedIncome: 0,
                        combinedAssets: 0,
                        eligibility: ["Needs Current Enrollment Status"],
                        screeningInProgress: member.LIS?.screeningInProgress ?? true,
                        screeningCloseReason: member.LIS?.screeningCloseReason ?? null
                    };
                    continue;
                }
    
                /// Step 2: Calculate total income and assets for LIS
const incomes = member.income?.filter(income => income.type?.toLowerCase() === "current") || [];

// Calculate total income by prorating yearly income based on active duration
let totalIncome = incomes.reduce((sum, income) => {
    const { amount, frequency, startDate, endDate } = income;

    // Log the raw income data
    console.log(`Processing income: Amount = ${amount}, Frequency = ${frequency}, Start Date = ${startDate}, End Date = ${endDate}`);

    // Calculate the prorated yearly income
    const yearlyAmount = calculateYearlyIncome(amount, frequency, startDate, endDate);

    // Log the calculated yearly amount
    console.log(`Calculated Yearly Income: ${yearlyAmount} (Prorated based on active duration)`);

    // Ensure no negative income and add to the total
    const validYearlyAmount = Math.max(0, Number(yearlyAmount));
    console.log(`Valid Yearly Income (Non-Negative): ${validYearlyAmount}`);

    return sum + validYearlyAmount;
}, 0);

console.log(`Total Income for ${member.firstName} ${member.lastName}:`, totalIncome);

// Calculate total assets
const assets = member.assets || [];
let totalAssets = assets.reduce((sum, asset) => {
    console.log(`Processing asset: Value = ${asset.value}`);
    return sum + Number(asset.value);
}, 0);

console.log(`Total Assets for ${member.firstName} ${member.lastName}:`, totalAssets);

// Step 3: Check for spouse and combine incomes and assets
const spouse = members.find(m => {
    return (
        m.householdMemberId === member.relationships?.find(r => r.relationship === 'spouse')?.relatedMemberId &&
        member.relationships?.find(r => r.relatedMemberId === m.householdMemberId)?.relationship === 'spouse'
    );
});

let combinedIncome = totalIncome;
let combinedAssets = totalAssets;

if (spouse) {
    console.log(`Spouse found: ${spouse.firstName} ${spouse.lastName}`);

    // Calculate spouse's income and assets independently for LIS
    const spouseIncomes = spouse.income?.filter(income => income.type?.toLowerCase() === "current") || [];
    let spouseTotalIncome = spouseIncomes.reduce((sum, income) => {
        const { amount, frequency, startDate, endDate } = income;

        // Log the raw income data
        console.log(`Processing spouse income: Amount = ${amount}, Frequency = ${frequency}, Start Date = ${startDate}, End Date = ${endDate}`);

        // Calculate the prorated yearly income
        const yearlyAmount = calculateYearlyIncome(amount, frequency, startDate, endDate);

        // Log the calculated yearly amount
        console.log(`Calculated Spouse Yearly Income: ${yearlyAmount} (Prorated based on active duration)`);

        // Ensure no negative income and add to the total
        const validYearlyAmount = Math.max(0, Number(yearlyAmount));
        console.log(`Valid Spouse Yearly Income (Non-Negative): ${validYearlyAmount}`);

        return sum + validYearlyAmount;
    }, 0);

    const spouseAssets = spouse.assets || [];
    let spouseTotalAssets = spouseAssets.reduce((sum, asset) => {
        console.log(`Processing spouse asset: Value = ${asset.value}`);
        return sum + Number(asset.value);
    }, 0);

    console.log(`Spouse Income: ${spouseTotalIncome}, Spouse Assets: ${spouseTotalAssets}`);

    // Combine incomes and assets
    combinedIncome += spouseTotalIncome;
    combinedAssets += spouseTotalAssets;

    console.log(`Combined income and assets for ${member.firstName} ${member.lastName} and ${spouse.firstName} ${spouse.lastName}: Income = $${combinedIncome}, Assets = $${combinedAssets}`);
} else {
    console.log(`No spouse found for ${member.firstName} ${member.lastName}`);
}
    
                // Step 4: Determine LIS eligibility
                let lisEligibility;
                if (spouse) {
                    if (combinedIncome > 31725) {
                        lisEligibility = ["Not Likely Eligible for LIS (Income)"];
                    } else if (combinedAssets > 36100) {
                        lisEligibility = ["Not Likely Eligible for LIS (Assets)"];
                    } else {
                        lisEligibility = ["Likely Eligible for LIS"];
                    }
                } else {
                    if (combinedIncome > 23475) {
                        lisEligibility = ["Not Likely Eligible for LIS (Income)"];
                    } else if (combinedAssets > 18090) {
                        lisEligibility = ["Not Likely Eligible for LIS (Assets)"];
                    } else {
                        lisEligibility = ["Likely Eligible for LIS"];
                    }
                }
    
                // Step 5: Assign LIS object to member and spouse (if applicable)
                const lisObject = {
                    combinedIncome: combinedIncome,
                    combinedAssets: combinedAssets,
                    eligibility: lisEligibility,
                    screeningInProgress: member.LIS?.screeningInProgress ?? true,
                    screeningCloseReason: member.LIS?.screeningCloseReason ?? null
                };
    
                member.LIS = lisObject;
                if (spouse) {
                    spouse.LIS = {
                        ...lisObject,
                        screeningInProgress: spouse.LIS?.screeningInProgress ?? true,
                        screeningCloseReason: spouse.LIS?.screeningCloseReason ?? null
                    };

                }
    
                console.log(`LIS object for ${member.firstName} ${member.lastName}:`, member.LIS);
            } catch (error) {
                console.error(`Error processing member ${member.firstName} ${member.lastName}:`, error);
            }
        }
    
        // Save the updated members array using a REST API call
const clientId = getQueryParameter('id'); // Get the client ID from the query parameter
try {
    const response = await fetch(`/save-household-members`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clientId, householdMembers: members }),
    });

    if (response.ok) {
        console.log('Household members saved successfully.');
    } else {
        console.error('Failed to save household members:', response.statusText);
    }
} catch (error) {
    console.error('Error saving household members:', error);
}}

async function MSPEligibilityCheck(members) {
    for (const member of members) {
        try {
            // Skip deceased members - set MSP to Not Checked
            if ((member.deceased ?? '').toLowerCase() === 'yes') {
                member.MSP = {
                    combinedIncome: 0,
                    combinedAssets: 0,
                    eligibility: ["Not Checked"],
                    screeningInProgress: member.MSP?.screeningInProgress ?? false,
                    screeningCloseReason: member.MSP?.screeningCloseReason ?? "Not Applicable"
                };
                console.log(`Skipping MSP for deceased member: ${member.firstName} ${member.lastName}`);
                continue;
            }

            // Step 1: Check age and enrollment status
            const dob = new Date(member.dob);
                const ageDifMs = Date.now() - dob.getTime();
                const ageDate = new Date(ageDifMs);
                const age = Math.abs(ageDate.getUTCFullYear() - 1970);
                const medicareEnrollment = member.medicare?.toLowerCase();
                const medicaidEnrollment = member.medicaid?.toLowerCase();
                if (medicareEnrollment === "no") {
                    member.MSP = {
                        combinedIncome: 0,
                        combinedAssets: 0,
                        eligibility: ["Not Enrolled in Medicare"],
                        screeningInProgress: member.MSP?.screeningInProgress ?? true,
                        screeningCloseReason: member.MSP?.screeningCloseReason ?? null
                    };
                    member.selections = member.selections || {};
                    member.selections["Is this person currently enrolled in the Medicare Savings Program?"] = "notenrolledinmedicare";
                    continue;
                } else if (medicaidEnrollment === "yes") {
                    member.MSP = {
                        combinedIncome: 0,
                        combinedAssets: 0,
                        eligibility: ["Enrolled in Medicaid"],
                        screeningInProgress: member.MSP?.screeningInProgress ?? true,
                        screeningCloseReason: member.MSP?.screeningCloseReason ?? null
                    };
                    member.selections = member.selections || {};
                    member.selections["Is this person currently enrolled in the Medicare Savings Program?"] = "onmedicaid";
                    continue;
                }
    
                const mspEnrollment = member.selections?.["Is this person currently enrolled in the Medicare Savings Program?"]?.toLowerCase();
                if (mspEnrollment === "yes") {
                    member.MSP = {
                        combinedIncome: 0,
                        combinedAssets: 0,
                        eligibility: ["Already Enrolled"],
                        screeningInProgress: member.MSP?.screeningInProgress ?? true,
                        screeningCloseReason: member.MSP?.screeningCloseReason ?? null
                    };
                    continue;
                } else if (mspEnrollment === "notinterested") {
                    member.MSP = {
                        combinedIncome: 0,
                        combinedAssets: 0,
                        eligibility: ["Not Interested"],
                        screeningInProgress: member.MSP?.screeningInProgress ?? true,
                        screeningCloseReason: member.MSP?.screeningCloseReason ?? null
                    };
                    continue;
                } else if (!mspEnrollment || mspEnrollment.toLowerCase().trim() === "n/a" || mspEnrollment.toLowerCase().trim() === "notenrolledinmedicare" || mspEnrollment.toLowerCase().trim() === "onmedicaid" || mspEnrollment.toLowerCase().trim() === "not interested") {
                    member.MSP = {
                        combinedIncome: 0,
                        combinedAssets: 0,
                        eligibility: ["Needs Current Enrollment Status"],
                        screeningInProgress: member.MSP?.screeningInProgress ?? true,
                        screeningCloseReason: member.MSP?.screeningCloseReason ?? null
                    };
                    continue;
                }
    
                // Step 2: Calculate total income and assets for MSP
                const incomes = member.income || [];
                const currentYearIncomes = incomes.filter(income => {
                    const startDate = new Date(income.startDate);
                    const endDate = new Date(income.endDate);
                    const today = new Date();
                
                    // Include income only if it is currently active
                    return startDate <= today && (!endDate || endDate >= today);
                });                let totalIncome = currentYearIncomes.reduce((sum, income) => {
                    const yearlyAmount = calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate);
                    let monthlyIncome = yearlyAmount / 12; // Divide yearly income by 12 to get monthly income
    
                    // Apply deductions based on income kind
                    if (income.kind === "Employment" || income.kind === "Self-Employment") {
                        monthlyIncome = (monthlyIncome - 65) / 2; // Subtract 65 and divide by 2
                    } else {
                        monthlyIncome -= 20; // Subtract 20 for other income kinds
                    }
    
                    return sum + Math.max(0, Number(monthlyIncome)); // Ensure no negative income
                }, 0);
                console.log(`Total Income for ${member.firstName} ${member.lastName}:`, totalIncome);
    
                const assets = member.assets || [];
                let totalAssets = assets.reduce((sum, asset) => sum + Number(asset.value), 0);
                console.log(`Total Assets for ${member.firstName} ${member.lastName}:`, totalAssets);
    
                // Step 3: Check for spouse and combine incomes and assets
                const spouse = members.find(m => {
                    return (
                        m.householdMemberId === member.relationships?.find(r => r.relationship === 'spouse')?.relatedMemberId &&
                        member.relationships?.find(r => r.relatedMemberId === m.householdMemberId)?.relationship === 'spouse'
                    );
                });
    
                let combinedIncome = totalIncome;
                let combinedAssets = totalAssets;
    
                if (spouse) {
                    console.log(`Spouse found: ${spouse.firstName} ${spouse.lastName}`);
                    
                    // Calculate spouse's income and assets independently for MSP
                    const spouseIncomes = spouse.income || [];
                    const spouseCurrentYearIncomes = spouseIncomes.filter(income => income.type === "Current");
                    let spouseTotalIncome = spouseCurrentYearIncomes.reduce((sum, income) => {
                        const yearlyAmount = calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate);
                        let monthlyIncome = yearlyAmount / 12;
    
                        if (income.kind === "Employment" || income.kind === "Self-Employment") {
                            monthlyIncome = (monthlyIncome - 65) / 2;
                        } else {
                            monthlyIncome -= 20;
                        }
    
                        return sum + Math.max(0, Number(monthlyIncome));
                    }, 0);
    
                    const spouseAssets = spouse.assets || [];
                    let spouseTotalAssets = spouseAssets.reduce((sum, asset) => sum + Number(asset.value), 0);
    
                    console.log(`Spouse Income: ${spouseTotalIncome}, Spouse Assets: ${spouseTotalAssets}`);
    
                    // Combine incomes and assets
                    combinedIncome += spouseTotalIncome;
                    combinedAssets += spouseTotalAssets;
    
                    console.log(`Combined income and assets for ${member.firstName} ${member.lastName} and ${spouse.firstName} ${spouse.lastName}: Income = $${combinedIncome}, Assets = $${combinedAssets}`);
                } else {
                    console.log(`No spouse found for ${member.firstName} ${member.lastName}`);
                }
    
                // Step 4: Determine MSP eligibility
let mspEligibility;
if (spouse) {
    if (combinedIncome > 2400) {
        mspEligibility = ["Not Likely Eligible for MSP (Income)"];
    } else if (combinedAssets > 14910) {
        mspEligibility = ["Not Likely Eligible for MSP (Assets)"];
    } else if (combinedIncome <= 1783) {
        mspEligibility = ["Likely Eligible for MSP (QMB)"];
    } else if (combinedIncome <= 2135) {
        mspEligibility = ["Likely Eligible for MSP (SLMB)"];
    } else {
        mspEligibility = ["Likely Eligible for MSP (QI)"];
    }
} else {
    if (combinedIncome > 1781) {
        mspEligibility = ["Not Likely Eligible for MSP (Income)"];
    } else if (combinedAssets > 9950) {
        mspEligibility = ["Not Likely Eligible for MSP (Assets)"];
    } else if (combinedIncome <= 1325) {
        mspEligibility = ["Likely Eligible for MSP (QMB)"];
    } else if (combinedIncome <= 1585) {
        mspEligibility = ["Likely Eligible for MSP (SLMB)"];
    } else {
        mspEligibility = ["Likely Eligible for MSP (QI)"];
    }
}
    
                // Step 5: Assign MSP object to member and spouse (if applicable)
                const mspObject = {
                    combinedIncome: combinedIncome,
                    combinedAssets: combinedAssets,
                    eligibility: mspEligibility,
                    screeningInProgress: member.MSP?.screeningInProgress ?? true,
                    screeningCloseReason: member.MSP?.screeningCloseReason ?? null
                };
    
                member.MSP = mspObject;
                if (spouse) {
                    spouse.MSP = {
                        ...mspObject,
                        screeningInProgress: spouse.MSP?.screeningInProgress ?? true,
                        screeningCloseReason: spouse.MSP?.screeningCloseReason ?? null
                    };
                }
    
                console.log(`MSP object for ${member.firstName} ${member.lastName}:`, member.MSP);
            } catch (error) {
                console.error(`Error processing member ${member.firstName} ${member.lastName}:`, error);
            }
        }
    
        // Save the updated members array using a REST API call
const clientId = getQueryParameter('id'); // Get the client ID from the query parameter
try {
    const response = await fetch(`/save-household-members`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clientId, householdMembers: members }),
    });

    if (response.ok) {
        console.log('Household members saved successfully.');
    } else {
        console.error('Failed to save household members:', response.statusText);
    }
} catch (error) {
    console.error('Error saving household members:', error);
}}

    // Add the calculateSNAPBenefit function
function calculateSNAPBenefit(finalNetIncome, householdSize, eligibilityStatus) {
    const maxAllotments = [
        0, 298, 546, 785, 994, 1183, 1421, 1571, 1789, 1789 + 218, 1789 + 218 * 2, 1789 + 218 * 3, 1789 + 218 * 4, 1789 + 218 * 5, 1789 + 218 * 6, 1789 + 218 * 7
    ];
    const maxAllotment = maxAllotments[householdSize] || 0;

    console.log(`Household Size: ${householdSize}`);
    console.log(`Max Allotment: $${maxAllotment}`);

    // Calculate 30% of the household's final net income
    const incomeContribution = finalNetIncome * 0.3;
    console.log(`Final Net Income: $${finalNetIncome}`);
    console.log(`Income Contribution (30% of Net Income): $${incomeContribution}`);

    // Subtract the income contribution from the maximum allotment
    let benefitAmount = Math.max(0, maxAllotment - incomeContribution);
    console.log(`Calculated Benefit Amount Before Adjustment: $${benefitAmount}`);

    // If the benefit amount is less than $24 and the household is "Likely Eligible for SNAP", set it to $24
    if (benefitAmount < 24 && eligibilityStatus === "Likely Eligible for SNAP") {
        benefitAmount = 24;
        console.log("Benefit adjusted to $24 due to eligibility.");
    }

    // Always return the benefit amount with two decimal places
    return parseFloat(benefitAmount.toFixed(2));
}

function determineExpeditedEligibility(combinedIncome, combinedAssets, finalNetIncome, utilityAllowance, totalShelterExpenses, isFarmworker, hasActiveIncome) {
    let expeditedEligibility = "No";

    // Check if isFarmworker is true, combined assets <= 100, and there is no active income
    if (isFarmworker === true && combinedAssets <= 100 && !hasActiveIncome) {
        expeditedEligibility = "Yes, Migrant or Seasonal Farmworker";
    }
    // Check if combined income <= 150 and combined assets <= 100
    else if (combinedIncome <= 150 && combinedAssets <= 100) {
        expeditedEligibility = "Yes, Low Income and Assets";
    }
    // Check if final net income + combined assets < utility allowance + total shelter expenses
    else if (combinedIncome + combinedAssets <= utilityAllowance + totalShelterExpenses) {
        expeditedEligibility = "Yes, Shelter Costs Exceed Income and Assets";
    }

    return expeditedEligibility;
}

async function SNAPEligibilityCheck(members, isFarmworker) {
        // Step 1: Group members into SNAP households based on "meals=yes"
        const snapHouseholds = [];
        const processedMembers = new Set();
    
        for (const member of members) {
            if (processedMembers.has(member.householdMemberId)) continue;
    
            if (member.meals?.toLowerCase() === "yes") {
                const snapHousehold = [member];
                processedMembers.add(member.householdMemberId);
    
                // Find other members who also share meals
                for (const otherMember of members) {
                    if (
                        otherMember.householdMemberId !== member.householdMemberId &&
                        otherMember.meals?.toLowerCase() === "yes"
                    ) {
                        snapHousehold.push(otherMember);
                        processedMembers.add(otherMember.householdMemberId);
                    }
                }
    
                snapHouseholds.push(snapHousehold);
            }
        }
    
        // Step 2: Process each SNAP household
for (const household of snapHouseholds) {
    try {
        let combinedYearlyIncome = 0; // Yearly income for all members
        let combinedAssets = 0;
        let totalNetIncome = 0;
        let totalUtilityAllowance = 0;
        let totalShelterExpenses = 0;
        let totalMedicalExpenses = 0;
        let totalOtherExpenses = 0;
        let mealsYesCount = household.length;

        // Utility allowance mapping
        const utilityAllowances = {
            "Heating and/or Cooling": 758,
            "Basic Limited Allowance": 402,
            "Electric": 72,
            "Gas": 72,
            "Oil": 72,
            "Propane": 72,
            "Wood": 72,
            "Coal": 72,
            "Kerosene": 72,
            "Water": 72,
            "Sewage": 72,
            "Trash": 72,
            "Phone": 34,
            "Homeless": 190

        };

        // Combine incomes, assets, and calculate deductions for all members in the household
        for (const member of household) {
            const incomes = member.income || [];
            const currentYearIncomes = incomes.filter(income => {
                const startDate = new Date(income.startDate);
                const endDate = new Date(income.endDate);
                const today = new Date();
            
                // Include income only if it is currently active
                return startDate <= today && (!endDate || endDate >= today);
            });            const yearlyIncome = currentYearIncomes.reduce((sum, income) => {
                const yearlyAmount = calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate);
                return sum + yearlyAmount;
            }, 0);

            const netIncome = currentYearIncomes.reduce((sum, income) => {
                const yearlyAmount = calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate);
                const monthlyAmount = yearlyAmount / 12;
            
                return sum + monthlyAmount; // No 20% deduction applied
            }, 0);

            const assets = member.assets || [];
            const totalAssets = assets.reduce((sum, asset) => sum + Number(asset.value), 0);

            combinedYearlyIncome += yearlyIncome;
            combinedAssets += totalAssets;
            totalNetIncome += netIncome;

// Update the utility allowance calculation
if (totalUtilityAllowance === 0) {
    let memberUtilityAllowance = 0;

    // Check if the client is homeless
    if (client.homelessness === 'yes') {
        memberUtilityAllowance = utilityAllowances["Homeless"];
    } else {
        const utilityKinds = (member.expenses || [])
            .filter(expense => expense.type?.toLowerCase() === "utility")
            .map(expense => expense.kind);

        const basicUtilityKinds = ["Electric", "Gas", "Oil", "Propane", "Wood", "Coal", "Kerosene", "Water", "Sewage", "Trash", "Phone"];
        const qualifyingUtilities = utilityKinds.filter(kind => basicUtilityKinds.includes(kind));

        if (utilityKinds.includes("Heating and/or Cooling")) {
            memberUtilityAllowance = utilityAllowances["Heating and/or Cooling"];
        } else if (qualifyingUtilities.length >= 2) {
            memberUtilityAllowance = utilityAllowances["Basic Limited Allowance"];
        } else {
            qualifyingUtilities.forEach(kind => {
                memberUtilityAllowance += utilityAllowances[kind] || 0;
            });
        }
    }

    totalUtilityAllowance = memberUtilityAllowance; // Assign the calculated utility allowance to the household
}

// Log the calculated utility allowance for debugging
console.log(`Utility Allowance for household: $${totalUtilityAllowance}`);

            // Calculate shelter expenses (only once for the household)
if (totalShelterExpenses === 0) {
    const shelterExpenses = member.expenses?.filter(expense => expense.type.toLowerCase() === "shelter") || [];
    totalShelterExpenses = shelterExpenses.reduce((sum, expense) => {
        const yearlyAmount = calculateYearlyIncome(
            expense.amount,
            expense.frequency,
            expense.startDate,
            expense.endDate
        );
        return sum + yearlyAmount / 12; // Convert yearly to monthly
    }, 0);
    console.log(`Total shelter expenses for ${member.firstName} ${member.lastName}: $${totalShelterExpenses}`);
}
// Calculate medical expenses (only once for the household)
if (totalMedicalExpenses === 0) {
    const medicalExpenses = member.expenses?.filter(expense => expense.type.toLowerCase() === "medical") || [];
    totalMedicalExpenses = medicalExpenses.reduce((sum, expense) => {
        const yearlyAmount = calculateYearlyIncome(
            expense.amount,
            expense.frequency,
            expense.startDate,
            expense.endDate
        );
        return sum + yearlyAmount / 12; // Convert yearly to monthly
    }, 0);

    // If the total medical expenses are less than $35, set it to $0
    if (totalMedicalExpenses < 35) {
        totalMedicalExpenses = 0;
    }

    console.log(`Total medical expenses for ${member.firstName} ${member.lastName}: $${totalMedicalExpenses}`);
}

// Calculate other expenses (only once for the household)
if (totalOtherExpenses === 0) {
    const otherExpenses = member.expenses?.filter(expense => expense.type.toLowerCase() === "other") || [];
    totalOtherExpenses = otherExpenses.reduce((sum, expense) => {
        const yearlyAmount = calculateYearlyIncome(
            expense.amount,
            expense.frequency,
            expense.startDate,
            expense.endDate
        );
        return sum + yearlyAmount / 12; // Convert yearly to monthly
    }, 0);
    console.log(`Total other expenses for ${member.firstName} ${member.lastName}: $${totalOtherExpenses}`);
}
        }

        // Convert combined yearly income to monthly income
const combinedMonthlyIncome = combinedYearlyIncome / 12;

// Apply standard deduction
const standardDeductions = [
    0, 209, 209, 209, 223, 261, 299, 299, 299, 299, 299, 299, 299, 299, 299, 299
];
const standardDeduction = standardDeductions[mealsYesCount] || 0;

// Calculate the total income with a 20% deduction applied only to "Employment" or "Self-Employment" income kinds
const employmentIncomeMonthly = household.reduce((sum, member) => {
    const incomes = member.income || [];
    return sum + incomes
        .filter(income => 
            (income.kind === "Employment" || income.kind === "Self-Employment") &&
            new Date(income.startDate) <= new Date() && 
            (!income.endDate || new Date(income.endDate) >= new Date())
        )
        .reduce((subSum, income) => subSum + (calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate) / 12), 0);
}, 0);

const otherIncomeMonthly = household.reduce((sum, member) => {
    const incomes = member.income || [];
    return sum + incomes
        .filter(income => 
            income.kind !== "Employment" && 
            income.kind !== "Self-Employment" &&
            new Date(income.startDate) <= new Date() && 
            (!income.endDate || new Date(income.endDate) >= new Date())
        )
        .reduce((subSum, income) => subSum + (calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate) / 12), 0);
}, 0);

// Apply the 20% deduction only to employment/self-employment income
const adjustedMonthlyIncome = (employmentIncomeMonthly * 0.8) + otherIncomeMonthly;

// Calculate total net income
totalNetIncome = Math.max(
    0,
    adjustedMonthlyIncome - standardDeduction - totalMedicalExpenses - totalOtherExpenses
);

// Calculate excess shelter cost
const halfPrelimNetIncome = totalNetIncome / 2;
let excessShelterCost = totalShelterExpenses + totalUtilityAllowance - halfPrelimNetIncome;

// Log the calculation for debugging
console.log(`Excess Shelter Cost Calculation: Total Shelter Expenses: ${totalShelterExpenses}, Half of Preliminary Net Income: ${halfPrelimNetIncome}, Excess Shelter Cost: ${excessShelterCost}`);

        // Cap excessShelterCost at zero
        excessShelterCost = Math.max(0, excessShelterCost);

        // Check for elderly or disabled members
        let hasElderlyOrDisabled = false;
        household.forEach(member => {
            const ageParts = member.age.match(/(\d+)\s*Years,?\s*(\d+)?\s*Months?,?\s*(\d+)?\s*Days?/i);
const years = parseInt(ageParts[1], 10) || 0;

// Define isElderly based on the years value
const isElderly = years >= 60;

console.log(`Age: ${years} Years`);
console.log(`Is Elderly: ${isElderly}`);
            const hasDisability = member.disability?.toLowerCase() === "yes";

            if (isElderly || hasDisability) {
                hasElderlyOrDisabled = true;
            }
        });

        if (!hasElderlyOrDisabled) {
            excessShelterCost = Math.min(excessShelterCost, 744); // Cap shelter deduction at $744
        }

        // Subtract excess shelter cost
        totalNetIncome = Math.max(0, totalNetIncome - excessShelterCost);

        // Determine gross income limit
        const grossIncomeLimits = [
            0, 2610, 3526, 4442, 5360, 6276, 7192, 8110, 9026, 9944, 10862,
            11780, 12698, 13616, 14534, 15452
        ];
        const grossIncomeLimit = grossIncomeLimits[mealsYesCount] || 0;

        // Determine eligibility
        let snapEligibility;
        if (combinedMonthlyIncome <= grossIncomeLimit) {
            snapEligibility = ["Likely Eligible for SNAP"];
        } else if (hasElderlyOrDisabled) {
            const netIncomeLimits = [
                0, 1305, 1763, 2221, 2680, 3138, 3596, 4055, 4513, 4972, 5431, 5890,
                6349, 6808, 7267, 7726, 8185
            ];
            const netIncomeLimit = netIncomeLimits[mealsYesCount] || 0;
            
            if (combinedMonthlyIncome <= grossIncomeLimit) {
                snapEligibility = ["Likely Eligible for SNAP"];
            } else if (combinedAssets > 4500) {
                snapEligibility = ["Not Likely Eligible for SNAP (Income and Assets)"];
            } else if (combinedMonthlyIncome >= grossIncomeLimit && totalNetIncome > netIncomeLimit) {
                snapEligibility = ["Determination Pending Expenses (Over Gross Income Limit)"];
            } else if (totalNetIncome <= netIncomeLimit && combinedAssets <= 4500) {
                snapEligibility = ["Likely Eligible for SNAP"];
            } else if (totalNetIncome > netIncomeLimit) {
                snapEligibility = ["Not Likely Eligible for SNAP (Income)"];
            }
        } else {
            snapEligibility = ["Not Likely Eligible for SNAP (Income)"];
        }
        
        console.log(`SNAP Eligibility for Household:`, snapEligibility);

        // Calculate SNAP benefit
        const snapBenefit = calculateSNAPBenefit(totalNetIncome, mealsYesCount, snapEligibility);

        const today = new Date();
        const hasActiveIncome = household.some(member => 
            member.meals?.toLowerCase() === "yes" &&
            (member.income || []).some(income => {
                const startDate = new Date(income.startDate);
                const endDate = income.endDate ? new Date(income.endDate) : null;
                return startDate <= today && (!endDate || endDate >= today);
            })
        );

        // Assign SNAP eligibility, benefit, and expedited eligibility to each household member
        household.forEach(member => {
            member.SNAP = {
                combinedMonthlyIncome,
                combinedAssets,
                eligibility: snapEligibility,
                householdSize: mealsYesCount,
                totalNetIncome,
                totalUtilityAllowance,
                totalShelterExpenses,
                totalMedicalExpenses,
                totalOtherExpenses,
                standardDeduction,
                excessShelterCost,
                benefitAmount: snapBenefit,
                expeditedEligibility: determineExpeditedEligibility(
                    combinedMonthlyIncome,
                    combinedAssets,
                    totalNetIncome,
                    totalUtilityAllowance,
                    totalShelterExpenses,
                    isFarmworker,
                    hasActiveIncome
                )
            };

            console.log(`SNAP object for member ${member.firstName} ${member.lastName}:`, member.SNAP);
        });
    } catch (error) {
        console.error(`Error processing SNAP household:`, error);
    }
}

    // Save the updated members array using a REST API call
const clientId = getQueryParameter('id'); // Get the client ID from the query parameter
try {
    const response = await fetch(`/save-household-members`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clientId, householdMembers: members }),
    });

    if (response.ok) {
        console.log('Household members saved successfully.');
    } else {
        console.error('Failed to save household members:', response.statusText);
    }
} catch (error) {
    console.error('Error saving household members:', error);
}}

// Initialize the display of household members
displayHouseholdMembers();


// With this API call:
const client = await fetch(`/get-client/${clientId}`)
    .then(response => {
        if (!response.ok) {
            throw new Error(`Failed to fetch client data: ${response.statusText}`);
        }
        return response.json();
    })
    .catch(error => {
        console.error('Error fetching client data:', error);
        return null;
    });

if (!client) {
    console.error("Client data could not be retrieved.");
    return;
}

// Log the isFarmworker property from the client object
console.log("isFarmworker:", client.isFarmworker);

async function LIHEAPEligibilityCheck() {
    try {
        // Retrieve the client ID from the query parameter
        const clientId = getQueryParameter('id');
        if (!clientId || typeof clientId !== 'string') {
            throw new Error('Invalid or missing clientId in query parameters.');
        }

        // Fetch the full client object using the client ID
        const response = await fetch(`/get-client/${encodeURIComponent(clientId)}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch client data: ${response.statusText}`);
        }

        const client = await response.json();

        // Ensure the client object contains householdMembers and it's an array
        if (!client || !Array.isArray(client.householdMembers)) {
            console.error('LIHEAPEligibilityCheck: client.householdMembers is not an array:', client.householdMembers);
            return;
        }

        const members = client.householdMembers;

        // Filter out deceased members for LIHEAP inclusion logic only
        const activeMembersForLIHEAP = members.filter(
            m => (m.deceased ?? '').toLowerCase() !== 'yes'
        );

        // Combine all active members' yearly income
        let combinedYearlyIncome = 0;

        activeMembersForLIHEAP.forEach(member => {
            const incomes = (member.income || []).filter(income => income.type?.toLowerCase() === 'current'); // Only include 'current' income

            // Calculate yearly income for each income source
            const yearlyIncome = incomes.reduce((sum, income) => {
                const yearlyAmount = calculateYearlyIncome(
                    income.amount,
                    income.frequency,
                    income.startDate,
                    income.endDate
                );
                return sum + yearlyAmount;
            }, 0);

            combinedYearlyIncome += yearlyIncome;
        });

        // Determine LIHEAP eligibility using only non-deceased members
        const householdSize = activeMembersForLIHEAP.length;
        const incomeLimits = [
            0, 23475, 31725, 39975, 48225, 56475, 64725, 72975, 81225, 89475, 97725, 105975, 114225, 122475, 130725, 138975
        ];
        const incomeLimit = incomeLimits[householdSize] || 0;

        const eligibility = [];
        if (client.liheapEnrollment === 'notinterested') {
            eligibility.push("Not Interested");
        } else if (client.liheapEnrollment === null || client.liheapEnrollment === undefined || client.liheapEnrollment === 'n/a') {
            eligibility.push("Needs Current Enrollment Status");
        } else if ((client.liheapEnrollment === 'no' || client.liheapEnrollment === 'yes') && (client.heatingCrisis === null || client.heatingCrisis === undefined || client.heatingCrisis === 'n/a')) {
            eligibility.push("Needs Heating Crisis Status");
        } else if (client.liheapEnrollment === 'yes' && client.heatingCrisis === 'no') {
            eligibility.push("Already Enrolled");
        } else if (client.residenceStatusCurrent === null || client.residenceStatusCurrent === undefined || client.residenceStatusCurrent === 'n/a') {
            eligibility.push("Needs Current Residence Status");
        } else if ((client.residenceStatusCurrent === null || client.residenceStatusCurrent === undefined || client.residenceStatusCurrent === 'n/a' || client.residenceStatusCurrent !== 'owned') && (client.subsidizedHousing === null || client.subsidizedHousing === undefined || client.subsidizedHousing === 'n/a')) {
            eligibility.push("Needs Subsidized Housing Status");
        } else if (client.subsidizedHousing === 'yes' && (client.heatingCost === null || client.heatingCost === undefined || client.heatingCost === 'n/a')) {
            eligibility.push("Needs Heating Cost Responsibility Status");
        } else if (client.subsidizedHousing === 'yes' && client.heatingCost === 'yes') {
            eligibility.push("Not Likely Eligible for LIHEAP (Heating cost included in rent, household rent is subsidized)");
        } else if (client.heatingCrisis === 'yes' && combinedYearlyIncome <= incomeLimit) {
            eligibility.push("Likely Eligible for LIHEAP (Crisis)");
        } else if (client.heatingCrisis === 'yes' && combinedYearlyIncome > incomeLimit) {
            eligibility.push("Not Likely Eligible for LIHEAP but Submission Recommended");
        } else if (combinedYearlyIncome <= incomeLimit) {
            eligibility.push("Likely Eligible for LIHEAP");
        } else {
            eligibility.push("Not Likely Eligible for LIHEAP (Income)");
        }

        // Update LIHEAP only for non-deceased members
        activeMembersForLIHEAP.forEach(member => {
            member.LIHEAP = {
                combinedYearlyIncome: combinedYearlyIncome,
                eligibility: eligibility
            };
            console.log(`Updated LIHEAP object for ${member.firstName} ${member.lastName}:`, member.LIHEAP);
        });

        // Do not modify deceased members' LIHEAP object
        // Save the updated household members back to the server
        const saveResponse = await fetch(`/save-household-members`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ clientId, householdMembers: members }),
        });

        if (saveResponse.ok) {
            console.log('Household members saved successfully.');
        } else {
            console.error('Failed to save household members:', saveResponse.statusText);
        }
    } catch (error) {
        console.error('Error processing LIHEAP eligibility:', error);
    }
}

function capitalizeFirstLetter(string) {
    if (!string) return ''; // Return an empty string if input is falsy
    return string.toUpperCase(); // Convert the entire string to uppercase
}

// Initialize PACE eligibility check and update the UI
const members = await loadHouseholdMembers();
await PACEEligibilityCheck(members);
await LISEligibilityCheck(members);
await MSPEligibilityCheck(members);
await PTRREligibilityCheck(members);
await SNAPEligibilityCheck(members, client.isFarmworker);
await LIHEAPEligibilityCheck(members);

 // Refresh all displays after all eligibility checks are complete
 await refreshAllDisplays();

// Add "Stop Screening" button at the top of the estimations container
function createStopScreeningButton() {
    const snapHouseholdContainer = document.getElementById('snap-household-container');
    if (!snapHouseholdContainer) return;

    // Remove existing stop screening container if present
    const existing = document.getElementById('stop-screening-container');
    if (existing) existing.remove();

    // Check if client screening is already stopped
    if (client.screeningInProgress === false || client.screeningInProgress === undefined || client.screeningInProgress === null) {
        // Hide all estimation containers but keep sidebar visible
        const householdMemberContainer = document.getElementById('household-members-container');
        const snapContainer = document.getElementById('snap-household-container');
        const liheapContainer = document.getElementById('liheap-household-container');
        if (householdMemberContainer) householdMemberContainer.style.display = 'none';
        if (snapContainer) snapContainer.style.display = 'none';
        if (liheapContainer) liheapContainer.style.display = 'none';

        const stoppedContainer = document.createElement('div');
        stoppedContainer.id = 'stop-screening-container';
        stoppedContainer.style.cssText = 'margin-bottom: 16px; text-align: left;';
        stoppedContainer.innerHTML = `
            <div class="household-member-box" style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 12px;">
                <p><strong>No Screening in Progress</strong></p>
<button id="reopen-all-screening-btn" style="
                    background-color: #007bff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 10px 20px;
                    font-size: 14px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: background-color 0.3s;
                " onmouseover="this.style.backgroundColor='#0056b3'" onmouseout="this.style.backgroundColor='#007bff'">Start New Screening</button>
            </div>
        `;
        snapHouseholdContainer.parentNode.insertBefore(stoppedContainer, snapHouseholdContainer);

        document.getElementById('reopen-all-screening-btn').addEventListener('click', async () => {
            const confirmAction = confirm("Are you sure you want to start a new screening?");
            if (!confirmAction) return;

            const activeUser = sessionStorage.getItem('loggedInUser')?.trim() || 'Unknown User';

            try {
                // 1. Fetch current household members
                const membersResponse = await fetch(`/get-client/${clientId}`);
                if (!membersResponse.ok) throw new Error('Failed to fetch client data');
                const clientData = await membersResponse.json();
                const currentMembers = clientData.householdMembers || [];

                // 2. Reopen screening for all benefits on all members
                const allBenefits = ['PACE', 'LIS', 'MSP', 'PTRR', 'SNAP', 'LIHEAP'];
                for (const member of currentMembers) {
                    for (const benefit of allBenefits) {
                        if (member[benefit]) {
                            member[benefit].screeningInProgress = true;
                            member[benefit].screeningCloseReason = null;
                        }
                    }
                }

                // 3. Save updated household members
                const saveResponse = await fetch(`/save-household-members`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientId, householdMembers: currentMembers })
                });

                if (!saveResponse.ok) {
                    console.error('Failed to save household members.');
                    return;
                }

                // 4. Update client-level screeningInProgress to true
                const updateResponse = await fetch(`/update-client`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientId, clientData: { screeningInProgress: true } })
                });

                if (!updateResponse.ok) {
                    console.error('Failed to update client screening status.');
                    return;
                }

                // 5. Add a note
                const note = {
                    text: '<strong>New screening initiated.</strong>',
                    timestamp: new Date().toLocaleString(),
                    username: activeUser
                };
                await fetch('/add-note-to-client', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientId, note })
                });

                console.log('All screening reopened successfully.');

                // Re-render notes
                if (typeof window.renderNotes === 'function') {
                    await window.renderNotes(clientId);
                }

                client.screeningInProgress = true;
                createStopScreeningButton();

                // Show all estimation containers again
                const householdMemberContainer = document.getElementById('household-members-container');
                const snapHouseholdContainer = document.getElementById('snap-household-container');
                const liheapHouseholdContainer = document.getElementById('liheap-household-container');
                if (householdMemberContainer) householdMemberContainer.style.display = '';
                if (snapHouseholdContainer) snapHouseholdContainer.style.display = '';
                if (liheapHouseholdContainer) liheapHouseholdContainer.style.display = '';

                await refreshAllDisplays();
            } catch (error) {
                console.error('Error reopening all screening:', error);
            }
        });

        return;
    }

    // Only show the Terminate Screening button if screeningInProgress is explicitly true
    if (client.screeningInProgress !== true) return;

    // Insert the stop screening button
    const stopBtnContainer = document.createElement('div');
    stopBtnContainer.id = 'stop-screening-container';
    stopBtnContainer.style.cssText = 'margin-bottom: 16px; text-align: left;';
    stopBtnContainer.innerHTML = `
        <button id="stop-screening-btn" style="
            background-color: #dc3545;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 10px 20px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            transition: background-color 0.3s;
            display: block;
            margin: 0 auto;
        " onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Terminate Screening</button>
    `;

    snapHouseholdContainer.parentNode.insertBefore(stopBtnContainer, snapHouseholdContainer);

    document.getElementById('stop-screening-btn').addEventListener('click', () => {
        openStopScreeningModal();
    });
}

// --- Stop Screening Modal ---
function createStopScreeningModal() {
    if (document.getElementById('stop-screening-modal')) return;

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'stop-screening-modal';
    modalOverlay.style.cssText = `
        display: none;
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 9999;
        justify-content: center;
        align-items: center;
    `;

    modalOverlay.innerHTML = `
        <div style="background: white; padding: 24px; border-radius: 8px; min-width: 350px; max-width: 500px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
            <h3 style="margin-top: 0;">Terminate Screening</h3>
            <p style="margin-bottom: 12px;">This will close screening for <strong>all benefits</strong> across <strong>all household members</strong> and mark this client's screening as complete.</p>
            <label for="stop-screening-reason-select"><strong>Select a reason:</strong></label>
            <select id="stop-screening-reason-select" style="width: 100%; padding: 8px; margin: 12px 0; font-size: 14px;">
                <option value="">-- Select a reason --</option>
                <option value="Not Interested">Not Interested</option>
                <option value="Too Confusing">Too Confusing</option>
                <option value="Unable to Contact">Unable to Contact</option>
                <option value="Will Call Back">Will Call Back</option>
                <option value="Other">Other</option>
            </select>
            <div style="display: flex; gap: 10px; justify-content: center; margin-top: 16px;">
                <button id="stop-screening-cancel-btn" style="padding: 8px 16px; cursor: pointer;">Cancel</button>
                <button id="stop-screening-confirm-btn" style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; transition: background-color 0.3s;" onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Confirm Terminate Screening</button>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);

    document.getElementById('stop-screening-cancel-btn').addEventListener('click', () => {
        modalOverlay.style.display = 'none';
    });

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            modalOverlay.style.display = 'none';
        }
    });
}

async function openStopScreeningModal() {
    createStopScreeningModal();
    const modal = document.getElementById('stop-screening-modal');
    const select = document.getElementById('stop-screening-reason-select');
    const confirmBtn = document.getElementById('stop-screening-confirm-btn');

    select.value = '';
    modal.style.display = 'flex';

    // Remove old listener by cloning
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener('click', async () => {
        const reason = select.value;
        if (!reason) {
            alert('Please select a reason.');
            return;
        }

        const activeUser = sessionStorage.getItem('loggedInUser')?.trim() || 'Unknown User';

        try {
            // 1. Fetch current household members
            const membersResponse = await fetch(`/get-client/${clientId}`);
            if (!membersResponse.ok) throw new Error('Failed to fetch client data');
            const clientData = await membersResponse.json();
            const currentMembers = clientData.householdMembers || [];

            // 2. Close screening for all benefits on all members
            const allBenefits = ['PACE', 'LIS', 'MSP', 'PTRR', 'SNAP', 'LIHEAP'];
            for (const member of currentMembers) {
                for (const benefit of allBenefits) {
                    if (member[benefit]) {
                        member[benefit].screeningInProgress = false;
                        member[benefit].screeningCloseReason = reason;
                    }
                }
            }

            // 3. Save updated household members
            const saveResponse = await fetch('/save-household-members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, householdMembers: currentMembers })
            });

            if (!saveResponse.ok) {
                console.error('Failed to save household members.');
                return;
            }

            // 4. Update client-level screeningInProgress to false
            const updateResponse = await fetch('/update-client', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId,
                    clientData: { screeningInProgress: false }
                })
            });

            if (!updateResponse.ok) {
                console.error('Failed to update client screening status.');
                return;
            }

            // 5. Add a note
            const note = {
                text: `<strong>Screening terminated.</strong><br><br> Reason: ${reason}`,
                timestamp: new Date().toLocaleString(),
                username: activeUser
            };
            await fetch('/add-note-to-client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, note })
            });

            modal.style.display = 'none';
            console.log('All screening closed successfully.');

            // Re-render notes
            if (typeof window.renderNotes === 'function') {
                await window.renderNotes(clientId);
            }

            client.screeningInProgress = false;
            createStopScreeningButton();

            // Hide all estimation containers immediately
            const householdMemberContainer = document.getElementById('household-members-container');
            const snapHouseholdContainer = document.getElementById('snap-household-container');
            const liheapHouseholdContainer = document.getElementById('liheap-household-container');
            if (householdMemberContainer) householdMemberContainer.style.display = 'none';
            if (snapHouseholdContainer) snapHouseholdContainer.style.display = 'none';
            if (liheapHouseholdContainer) liheapHouseholdContainer.style.display = 'none';

            await refreshAllDisplays();
        } catch (error) {
            console.error('Error closing all screening:', error);
        }
    });
}

createStopScreeningButton();

// Expose functions globally
window.eligibilityChecks = {
    loadHouseholdMembers,
    displayHouseholdMembers,
    displaySNAPHouseholds,
    updateAndDisplayHouseholdMembers,
    PACEEligibilityCheck,
    LISEligibilityCheck,
    MSPEligibilityCheck,
    PTRREligibilityCheck,
    SNAPEligibilityCheck,
    displayLIHEAPHouseholds,
    LIHEAPEligibilityCheck,
    refreshAllDisplays
};

    // Show the page now that everything is loaded
    mainContent.style.visibility = 'visible';
    mainContent.style.opacity = '1';

});