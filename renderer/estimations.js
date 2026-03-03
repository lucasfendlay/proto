// Ensure EligibilityUtils is available globally
function getUtils() {
    const Utils = window.EligibilityUtils;
    if (!Utils) {
        console.error('EligibilityUtils not loaded. Make sure eligibilityutils.js is included before estimations.js');
        return null;
    }
    return Utils;
}

document.addEventListener('DOMContentLoaded', async function () {
    const Utils = window.EligibilityUtils;
    const clientId = getQueryParameter('id');
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
            // Filter to ensure only valid objects are returned, preventing undefined members from causing errors in eligibility checks
            return clientData.householdMembers.filter(member => member && typeof member === 'object' && member.householdMemberId);
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
            members.sort((a, b) => {
                // Check if member has any open (non-closed, non-Not Checked) benefits
                const benefitKeys = ['PACE', 'LIS', 'MSP', 'PTRR'];
                const isDeceased_a = (a.deceased ?? '').toLowerCase() === 'yes';
                const isDeceased_b = (b.deceased ?? '').toLowerCase() === 'yes';

                const hasOpenBenefits = (member, isDeceased) => {
                    return benefitKeys.some(key => {
                        if (isDeceased && key !== 'PTRR') return false;
                        if (key === 'PTRR' && !member.headOfHousehold) return false;
                        if (isDeceased && key === 'PTRR') return false;
                        const benefitObj = member[key];
                        if (!benefitObj) return false;
                        if (benefitObj.screeningInProgress === false) return false;
                        if (benefitObj.eligibility?.includes('Not Checked')) return false;
                        return benefitObj.eligibility && benefitObj.eligibility.length > 0;
                    });
                };

                const aHasOpen = hasOpenBenefits(a, isDeceased_a);
                const bHasOpen = hasOpenBenefits(b, isDeceased_b);

                // Primary sort: open benefits first, closed benefits last
                if (aHasOpen !== bHasOpen) {
                    return bHasOpen - aHasOpen;
                }

                // Secondary sort: head of household first within each group
                if (b.headOfHousehold !== a.headOfHousehold) {
                    return b.headOfHousehold - a.headOfHousehold;
                }

                // Tertiary sort: oldest to youngest by age
                const parseAgeYears = (ageStr) => {
                    if (!ageStr) return 0;
                    const match = ageStr.match(/(\d+)\s*Years?/i);
                    return match ? parseInt(match[1], 10) : 0;
                };
                const ageA = parseAgeYears(a.age);
                const ageB = parseAgeYears(b.age);
                if (ageA !== ageB) {
                    return ageB - ageA; // Oldest first
                }

                return 0;
            });
    
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

                                // Invalidate expense household cache so Previous Year dropdown reflects updated screening status
                                if ((benefit === 'PACE' || benefit === 'PTRR') && window.invalidateHouseholdCache) {
                                    window.invalidateHouseholdCache();
                                }

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
            <style>
                #close-member-benefits-checkboxes::-webkit-scrollbar {
                    width: 8px;
                }
                #close-member-benefits-checkboxes::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 4px;
                }
                #close-member-benefits-checkboxes::-webkit-scrollbar-thumb {
                    background: #888;
                    border-radius: 4px;
                }
                #close-member-benefits-checkboxes::-webkit-scrollbar-thumb:hover {
                    background: #555;
                }
            </style>
            <div id="close-member-benefits-checkboxes" style="margin: 12px 0; overflow-y: scroll; flex: 1; max-height: 50vh; padding-right: 8px;"></div>
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
        { value: "Hard Determination", label: "Use Hard Determination Closeout Reason(s)" },
        { value: "Not Interested", label: "Not Interested" },
        { value: "Too Confusing", label: "Too Confusing" },
        { value: "Will Call Back", label: "Will Call Back" }
        ];

    const benefitReasons = {
        'PACE': [
            ...commonReasons,
            { value: "Already Enrolled", label: "Already Enrolled" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Age Criteria Not Met", label: "Age Criteria Not Met" },
            { value: "Enrolled in Medicaid", label: "Enrolled in Medicaid" },
            { value: "Residency Not Met", label: "PA Residency Not Met" },
        ],
        'LIS': [
            ...commonReasons,
            { value: "Already Enrolled", label: "Already Enrolled" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Ineligible - Assets", label: "Ineligible - Assets" },
            { value: "Not Enrolled in Medicare", label: "Not Enrolled in Medicare" },
            { value: "Enrolled in Medicaid", label: "Enrolled in Medicaid" },
        ],
        'MSP': [
            ...commonReasons,
            { value: "Already Enrolled", label: "Already Enrolled" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Ineligible - Assets", label: "Ineligible - Assets" },
            { value: "Not Enrolled in Medicare", label: "Not Enrolled in Medicare" },
            { value: "Enrolled in Medicaid", label: "Enrolled in Medicaid" },
        ],
        'PTRR': [
            ...commonReasons,
            { value: "Already Applied", label: "Already Applied This Year" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Age/Disability/Widow Criteria Not Met", label: "Age/Disability/Widow Criteria Not Met" },
            { value: "No Formal Lease", label: "No Formal Lease" },
            { value: "No Relevant Expenses", label: "No Relevant Expenses" },
        ],
        'SNAP': [
            ...commonReasons,
            { value: "Already Enrolled", label: "Already Enrolled" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Ineligible - Income and Assets", label: "Ineligible - Income and Assets" },
        ],
        'LIHEAP': [
            ...commonReasons,
            { value: "Already Enrolled", label: "Already Enrolled" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Subsidized Housing and No Heating Responsibility", label: "Subsidized Housing and No Heating Responsibility" },
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

    // Check if any tiles are selected and ALL selected tiles are red (not eligible)
    const checkboxContainer = document.getElementById('close-member-benefits-checkboxes');
    const selectedTiles = checkboxContainer
        ? Array.from(checkboxContainer.querySelectorAll('.close-member-benefit-tile[data-selected="true"]'))
        : [];
    const hasSelectedTiles = selectedTiles.length > 0;
    const allSelectedAreRed = hasSelectedTiles && selectedTiles.every(t => t.dataset.isNotEligible === 'true');

    select.innerHTML = '<option value="">-- Select a reason --</option>';
    reasons.forEach(reason => {
        // Only include "Hard Determination" if ALL selected tiles are red
        if (reason.value === 'Hard Determination' && !allSelectedAreRed) return;

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
    if (upper.includes('NOT INTERESTED')) return 'Not Interested';
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
        case 'SNAP':
            if (upper.includes('INCOME AND ASSETS') || (upper.includes('INCOME') && upper.includes('ASSETS'))) return 'Ineligible - Income and Assets';
            if (upper.includes('ASSETS') && upper.includes('NOT LIKELY')) return 'Ineligible - Income and Assets';
            if (upper.includes('INCOME') && upper.includes('NOT LIKELY')) return 'Ineligible - Income';
            if (upper.includes('NOT LIKELY')) return 'Ineligible - Income';
            break;
        case 'LIHEAP':
            if (upper.includes('HEATING COST INCLUDED') || upper.includes('SUBSIDIZED')) return 'Subsidized Housing and No Heating Responsibility';
            if (upper.includes('INCOME') && upper.includes('NOT LIKELY')) return 'Ineligible - Income';
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
        'NO FORMAL LEASE', 'NOT INTERESTED',
        'HEATING COST INCLUDED', 'SUBSIDIZED'
    ];

    for (const status of hardCloseouts) {
        if (eligStr.includes(status)) return true;
    }

    // Also check for red (NOT LIKELY ELIGIBLE)
    if (eligStr.includes('NOT LIKELY ELIGIBLE') || eligStr.includes('NOT ELIGIBLE')) return true;

    return false;
}

// Check if household-level SNAP is "not eligible" (red)
function isHouseholdSnapNotEligible(members, clientSnap) {
    // Check client-level statuses first
    if (clientSnap === 'yes') return { isNotEligible: true, reason: 'Already Enrolled' };
    if (clientSnap === 'notinterested') return { isNotEligible: true, reason: 'Not Interested' };
    
    // Find a SNAP member to check eligibility
    const snapMember = members.find(m => m.meals?.toLowerCase() === 'yes' && m.SNAP?.eligibility);
    if (!snapMember) return { isNotEligible: false, reason: '' };
    
    const eligStr = (snapMember.SNAP.eligibility || []).join(' ').toUpperCase();
    
    if (eligStr.includes('ALREADY ENROLLED')) return { isNotEligible: true, reason: 'Already Enrolled' };
    if (eligStr.includes('NOT INTERESTED')) return { isNotEligible: true, reason: 'Not Interested' };
    if (eligStr.includes('INCOME AND ASSETS') || (eligStr.includes('INCOME') && eligStr.includes('ASSETS'))) {
        return { isNotEligible: true, reason: 'Ineligible - Income and Assets' };
    }
    if (eligStr.includes('NOT LIKELY')) return { isNotEligible: true, reason: 'Ineligible - Income' };
    
    return { isNotEligible: false, reason: '' };
}

// Check if household-level LIHEAP is "not eligible" (red)
function isHouseholdLiheapNotEligible(members, client) {
    // Check client-level statuses first
    if (client?.liheapEnrollment === 'yes' && client?.heatingCrisis === 'no') {
        return { isNotEligible: true, reason: 'Already Enrolled' };
    }
    if (client?.liheapEnrollment === 'notinterested') {
        return { isNotEligible: true, reason: 'Not Interested' };
    }
    if (client?.subsidizedHousing === 'yes' && client?.heatingCost === 'yes') {
        return { isNotEligible: true, reason: 'Subsidized Housing and No Heating Responsibility' };
    }
    
    // Find a LIHEAP member to check eligibility
    const liheapMember = members.find(m => (m.deceased ?? '').toLowerCase() !== 'yes' && m.LIHEAP?.eligibility);
    if (!liheapMember) return { isNotEligible: false, reason: '' };
    
    const eligStr = (liheapMember.LIHEAP.eligibility || []).join(' ').toUpperCase();
    
    if (eligStr.includes('ALREADY ENROLLED')) return { isNotEligible: true, reason: 'Already Enrolled' };
    if (eligStr.includes('NOT INTERESTED')) return { isNotEligible: true, reason: 'Not Interested' };
    if (eligStr.includes('HEATING COST INCLUDED') || eligStr.includes('SUBSIDIZED')) {
        return { isNotEligible: true, reason: 'Subsidized Housing and No Heating Responsibility' };
    }
    if (eligStr.includes('NOT LIKELY')) return { isNotEligible: true, reason: 'Ineligible - Income' };
    
    return { isNotEligible: false, reason: '' };
}

async function openCloseMemberModal(clientId, allMembers, memberId = null, openBenefits = null, preSelectBenefit = null) {
    createCloseMemberModal();
    const modal = document.getElementById('close-member-modal');
    const checkboxContainer = document.getElementById('close-member-benefits-checkboxes');
    const select = document.getElementById('close-member-reason-select');
    const confirmBtn = document.getElementById('close-member-confirm-btn');
    const title = document.getElementById('close-member-modal-title');

    title.textContent = `Close Screening(s)`;

    // Fetch fresh client data
    const freshClientResponse = await fetch(`/get-client/${clientId}`);
    const freshClient = freshClientResponse.ok ? await freshClientResponse.json() : null;

    // Build a list of all open benefits across all members (excluding closed ones)
    const individualBenefitKeys = ['PACE', 'LIS', 'MSP', 'PTRR'];
    const allOpenBenefitEntries = []; // { memberId, memberName, benefit, isNotEligible, ineligibilityReason, isHousehold }

    // --- HOUSEHOLD-LEVEL BENEFITS (SNAP and LIHEAP) ---
    // Check if SNAP screening is open - NOW ALSO CHECK CLIENT-LEVEL STATUS
    const snapMembers = allMembers.filter(m => m.meals?.toLowerCase() === 'yes');
    const snapScreeningOpen = snapMembers.some(m => m.SNAP?.screeningInProgress !== false && !m.SNAP?.eligibility?.includes('Not Checked'));
    const programStatus = freshClient?.programStatus || {};
    const snapClientClosed = programStatus.SNAP?.screeningInProgress === false;
    
    // Check client-level SNAP status for "already enrolled" or "not interested"
    const clientSnapStatus = freshClient?.snap?.toLowerCase();
    const snapHasClientLevelStatus = clientSnapStatus === 'yes' || clientSnapStatus === 'notinterested';
    
    // Show SNAP if: (has members with open screening OR has client-level status that needs closing) AND not already closed at client level
    if (!snapClientClosed && (snapScreeningOpen || snapHasClientLevelStatus)) {
        let snapIsNotEligible = false;
        let snapIneligibilityReason = '';
        
        if (snapMembers.length > 0) {
            const snapStatus = isHouseholdSnapNotEligible(allMembers, freshClient?.snap);
            snapIsNotEligible = snapStatus.isNotEligible;
            snapIneligibilityReason = snapStatus.reason || snapMembers[0]?.SNAP?.eligibility?.find(e => (e || '').toUpperCase().includes('NOT')) || '';
        } else {
            // No SNAP members, but client-level status exists
            if (clientSnapStatus === 'yes') {
                snapIsNotEligible = true;
                snapIneligibilityReason = 'Already Enrolled';
            } else if (clientSnapStatus === 'notinterested') {
                snapIsNotEligible = true;
                snapIneligibilityReason = 'Not Interested';
            }
        }
        
        allOpenBenefitEntries.push({
            memberId: 'HOUSEHOLD',
            memberName: 'SNAP Household',
            benefit: 'SNAP',
            isNotEligible: snapIsNotEligible,
            ineligibilityReason: snapIneligibilityReason,
            isHousehold: true
        });
    }

    // Check if LIHEAP screening is open - NOW ALSO CHECK CLIENT-LEVEL STATUS
    const liheapMembers = allMembers.filter(m => (m.deceased ?? '').toLowerCase() !== 'yes');
    const liheapScreeningOpen = liheapMembers.some(m => m.LIHEAP?.screeningInProgress !== false && !m.LIHEAP?.eligibility?.includes('Not Checked'));
    const liheapClientClosed = programStatus.LIHEAP?.screeningInProgress === false;
    
    // Check client-level LIHEAP status
    const liheapEnrollment = freshClient?.liheapEnrollment?.toLowerCase();
    const heatingCrisis = freshClient?.heatingCrisis?.toLowerCase();
    const liheapAlreadyEnrolled = liheapEnrollment === 'yes' && heatingCrisis === 'no';
    const liheapNotInterested = liheapEnrollment === 'notinterested';
    const liheapHasClientLevelStatus = liheapAlreadyEnrolled || liheapNotInterested;
    
    // Show LIHEAP if: (has members with open screening OR has client-level status that needs closing) AND not already closed at client level
    if (!liheapClientClosed && (liheapScreeningOpen || liheapHasClientLevelStatus)) {
        let liheapIsNotEligible = false;
        let liheapIneligibilityReason = '';
        
        if (liheapMembers.length > 0 && liheapMembers[0]?.LIHEAP?.eligibility) {
            const liheapStatus = isHouseholdLiheapNotEligible(allMembers, freshClient);
            liheapIsNotEligible = liheapStatus.isNotEligible;
            liheapIneligibilityReason = liheapStatus.reason || liheapMembers[0]?.LIHEAP?.eligibility?.find(e => (e || '').toUpperCase().includes('NOT')) || '';
        } else {
            // Check client-level status
            if (liheapAlreadyEnrolled) {
                liheapIsNotEligible = true;
                liheapIneligibilityReason = 'Already Enrolled';
            } else if (liheapNotInterested) {
                liheapIsNotEligible = true;
                liheapIneligibilityReason = 'Not Interested';
            }
        }
        
        allOpenBenefitEntries.push({
            memberId: 'HOUSEHOLD',
            memberName: 'LIHEAP Household',
            benefit: 'LIHEAP',
            isNotEligible: liheapIsNotEligible,
            ineligibilityReason: liheapIneligibilityReason,
            isHousehold: true
        });
    }

    // --- INDIVIDUAL-LEVEL BENEFITS ---
    allMembers.forEach(member => {
        const isDeceased = (member.deceased ?? '').toLowerCase() === 'yes';
        const memberName = `${capitalizeFirstLetter(member.firstName)} ${capitalizeFirstLetter(member.lastName)}`;

        individualBenefitKeys.forEach(benefit => {
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
                    ineligibilityReason,
                    isHousehold: false
                });
            }
        });
    });

    // Separate household and individual entries
    const householdEntries = allOpenBenefitEntries.filter(e => e.isHousehold);
    const individualEntries = allOpenBenefitEntries.filter(e => !e.isHousehold);

    // Group individual entries by member for display
    const groupedByMember = {};
    individualEntries.forEach(entry => {
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

    // Build selectable benefit tiles
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

    // --- RENDER HOUSEHOLD-LEVEL BENEFITS FIRST ---
    if (householdEntries.length > 0) {
        const householdHeader = document.createElement('p');
        householdHeader.style.cssText = 'margin: 12px 0 4px 0; font-weight: 700; font-size: 15px; color: #333; border-bottom: 2px solid #007bff; padding-bottom: 4px;';
        householdHeader.textContent = '🏠 Household Benefits';
        checkboxContainer.appendChild(householdHeader);

        householdEntries.forEach(entry => {
            const tile = document.createElement('div');
            tile.className = 'close-member-benefit-tile';
            tile.dataset.benefit = entry.benefit;
            tile.dataset.memberId = 'HOUSEHOLD';
            tile.dataset.selected = 'false';
            tile.dataset.isNotEligible = entry.isNotEligible ? 'true' : 'false';
            tile.dataset.ineligibilityReason = entry.ineligibilityReason || '';
            tile.dataset.isHousehold = 'true';
            tile.textContent = entry.benefit;
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

            if (entry.isNotEligible) {
                tile.style.borderColor = '#f5c6cb';
                tile.style.backgroundColor = '#f8d7da';
                tile.style.color = '#721c24';
            }

            tile.addEventListener('mouseover', () => {
                if (tile.dataset.selected === 'false') {
                    if (entry.isNotEligible) {
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
                    if (entry.isNotEligible) {
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
                    if (entry.isNotEligible) {
                        tile.style.borderColor = '#f5c6cb';
                        tile.style.backgroundColor = '#f8d7da';
                        tile.style.color = '#721c24';
                    } else {
                        tile.style.borderColor = '#ccc';
                        tile.style.backgroundColor = '#f9f9f9';
                        tile.style.color = '#333';
                    }
                }

                const selectedBenefitNames = Array.from(
                    checkboxContainer.querySelectorAll('.close-member-benefit-tile[data-selected="true"]')
                ).map(t => t.dataset.benefit);
                updateReasonDropdown([...new Set(selectedBenefitNames)]);
            });

            checkboxContainer.appendChild(tile);
        });
    }

    // --- RENDER INDIVIDUAL-LEVEL BENEFITS ---
    if (Object.keys(groupedByMember).length > 0) {
        const individualHeader = document.createElement('p');
        individualHeader.style.cssText = 'margin: 16px 0 4px 0; font-weight: 700; font-size: 15px; color: #333; border-bottom: 2px solid #28a745; padding-bottom: 4px;';
        individualHeader.textContent = '👤 Individual Benefits';
        checkboxContainer.appendChild(individualHeader);

        Object.keys(groupedByMember).forEach(mId => {
            const group = groupedByMember[mId];

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
                tile.dataset.isHousehold = 'false';
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

                    const selectedBenefitNames = Array.from(
                        checkboxContainer.querySelectorAll('.close-member-benefit-tile[data-selected="true"]')
                    ).map(t => t.dataset.benefit);
                    updateReasonDropdown([...new Set(selectedBenefitNames)]);
                });

                checkboxContainer.appendChild(tile);
            });
        });
    }

    // Auto-select tiles that are "not eligible" (red cards)
    // Apply any explicit preSelectBenefit passed into the modal before auto-selection
    if (preSelectBenefit) {
        const matchingTiles = checkboxContainer.querySelectorAll(`.close-member-benefit-tile[data-benefit="${preSelectBenefit}"]`);
        matchingTiles.forEach(tile => {
            // Only auto-select if the tile is red (not eligible)
            if (tile.dataset.isNotEligible === 'true') {
                tile.dataset.selected = 'true';
                tile.style.borderColor = 'black';
                tile.style.backgroundColor = '#007bff';
                tile.style.color = 'white';
            }
        });
        const preSelectedBenefitNames = Array.from(
            checkboxContainer.querySelectorAll('.close-member-benefit-tile[data-selected="true"]')
        ).map(t => t.dataset.benefit);
        updateReasonDropdown([...new Set(preSelectedBenefitNames)]);
    }

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

        const autoSelectedBenefitNames = Array.from(
            checkboxContainer.querySelectorAll('.close-member-benefit-tile[data-selected="true"]')
        ).map(t => t.dataset.benefit);
        updateReasonDropdown([...new Set(autoSelectedBenefitNames)]);

        // Only auto-set to 'Hard Determination' if there are actually red tiles selected
        const anyRedSelected = Array.from(
            checkboxContainer.querySelectorAll('.close-member-benefit-tile[data-selected="true"]')
        ).some(t => t.dataset.isNotEligible === 'true');

        if (anyRedSelected && Array.from(select.options).some(o => o.value === 'Hard Determination')) {
            select.value = 'Hard Determination';
        }
    } else {
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
            // Separate household and individual closures
            const householdClosures = selectedTiles.filter(t => t.dataset.isHousehold === 'true');
            const individualClosures = selectedTiles.filter(t => t.dataset.isHousehold === 'false');

            const noteLines = [];

            // --- PROCESS HOUSEHOLD CLOSURES ---
            for (const tile of householdClosures) {
                const benefit = tile.dataset.benefit;
                const ineligibilityReason = tile.dataset.ineligibilityReason || '';

                let closeReason;
                if (reason === 'Hard Determination') {
                    closeReason = mapHardDeterminationReason(benefit, ineligibilityReason);
                } else {
                    closeReason = reason;
                }

                if (benefit === 'SNAP') {
                    // Close SNAP for all SNAP household members
                    for (const member of allMembers) {
                        if (member.SNAP) {
                            member.SNAP.screeningInProgress = false;
                            member.SNAP.screeningCloseReason = closeReason;
                        }                    }
                    // Update client-level program status
                    await updateClientProgramStatus(clientId, 'SNAP', false, closeReason);
                    noteLines.push(`<br><strong><u>SNAP</u></strong><br><em>${closeReason}</em>`);

                    if (window.refreshFarmworkerVisibility) {
                        await window.refreshFarmworkerVisibility();
                    }
                } else if (benefit === 'LIHEAP') {
                    // Close LIHEAP for all LIHEAP household members
                    for (const member of allMembers) {
                        if (member.LIHEAP) {
                            member.LIHEAP.screeningInProgress = false;
                            member.LIHEAP.screeningCloseReason = closeReason;
                        }
                    }
                    // Update client-level program status
                    await updateClientProgramStatus(clientId, 'LIHEAP', false, closeReason);
                    noteLines.push(`<br><strong><u>LIHEAP</u></strong><br><em>${closeReason}</em>`);
                }
            }

            // --- PROCESS INDIVIDUAL CLOSURES ---
            const closuresByMember = {};
            individualClosures.forEach(tile => {
                const mId = tile.dataset.memberId;
                const benefit = tile.dataset.benefit;
                const ineligibilityReason = tile.dataset.ineligibilityReason || '';
                if (!closuresByMember[mId]) closuresByMember[mId] = [];
                closuresByMember[mId].push({ benefit, ineligibilityReason });
            });

            for (const [mId, benefitEntries] of Object.entries(closuresByMember)) {
                const targetMember = allMembers.find(m => String(m.householdMemberId) === String(mId));
                if (targetMember) {
                    const memberName = `${capitalizeFirstLetter(targetMember.firstName)} ${capitalizeFirstLetter(targetMember.lastName)}`;
                    const benefitNoteLines = [];
                    for (const entry of benefitEntries) {
                        if (targetMember[entry.benefit]) {
                            let closeReason;
                            if (reason === 'Hard Determination') {
                                closeReason = mapHardDeterminationReason(entry.benefit, entry.ineligibilityReason);
                            } else {
                                closeReason = reason;
                            }
                            targetMember[entry.benefit].screeningInProgress = false;
                            targetMember[entry.benefit].screeningCloseReason = closeReason;
                            benefitNoteLines.push(`<strong>${entry.benefit}</strong><br><em> ${closeReason}</em>`);
                        }
                    }
                    noteLines.push(`<br><strong><u>${memberName}</u></strong><br> ${benefitNoteLines.join('<br>')}`);
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

                // Invalidate expense household cache so Previous Year dropdown reflects updated screening status
                const closedBenefits = selectedTiles.map(t => t.dataset.benefit);
                if ((closedBenefits.includes('PACE') || closedBenefits.includes('PTRR')) && window.invalidateHouseholdCache) {
                    window.invalidateHouseholdCache();
                }

                await refreshAllDisplays();
            } else {
                console.error('Failed to close screening.');
            }
        } catch (error) {
            console.error('Error closing screening:', error);
        }
    });
}

// ===== SNAP DISPLAY =====
async function displaySNAPHouseholds() {
    const snapContainer = document.getElementById('snap-household-container');
    if (!snapContainer) {
        console.error('snap-household-container element not found.');
        return;
    }

    const members = await loadHouseholdMembers();
    snapContainer.innerHTML = '';

    const clientId = getQueryParameter('id');

    // Fetch fresh client data
    let clientData = null;
    try {
        const clientRes = await fetch(`/get-client/${clientId}`);
        if (clientRes.ok) {
            clientData = await clientRes.json();
        }
    } catch (e) {
        console.error('Error fetching client data:', e);
    }

    const isScreeningInProgress = clientData?.screeningInProgress === true;

    // Check CLIENT-LEVEL program status ONLY for SNAP (household benefit)
    const programStatus = clientData?.programStatus || {};
    const snapScreeningClosed = programStatus.SNAP?.screeningInProgress === false;
    const snapCloseReason = programStatus.SNAP?.screeningCloseReason || 'N/A';

    const snapMembers = members.filter(m => m.meals?.toLowerCase() === "yes");

    if (snapScreeningClosed) {
        // Show only the reopen button with grey styling matching other closed benefits
        const reopenDiv = document.createElement('div');
        reopenDiv.classList.add('household-member-box');
        reopenDiv.style.backgroundColor = 'rgb(212, 212, 212)';
        reopenDiv.style.borderColor = 'rgb(0, 0, 0)';
        reopenDiv.innerHTML = `
            <h3>SNAP HOUSEHOLD</h3>
            ${snapMembers.length > 0 ? `<p><strong>Members:</strong> ${snapMembers.map(m => `${capitalizeFirstLetter(m.firstName)} ${capitalizeFirstLetter(m.lastName)}`).join(', ')}</p>` : ''}
            <div style="padding: 8px; border-radius: 4px; margin: 8px auto; text-align: center; width: 100%; box-sizing: border-box;">
                <p style="margin: 0 0 6px 0;"><strong>SNAP Screening Closed</strong></p>
                <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${snapCloseReason}</p>
                <button class="reopen-snap-screening-btn" 
                    style="background-color: #007bff; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: background-color 0.3s;"
                    onmouseover="this.style.backgroundColor='#0056b3'" 
                    onmouseout="this.style.backgroundColor='#007bff'">
                    Reopen SNAP Screening
                </button>
            </div>
        `;

        snapContainer.appendChild(reopenDiv);

        reopenDiv.querySelector('.reopen-snap-screening-btn').addEventListener('click', async () => {
            try {
                // Update ALL members' SNAP object (not just snapMembers)
                for (const member of members) {
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
                    // Also update client-level program status
                    await updateClientProgramStatus(clientId, 'SNAP', true);
                    await addNoteToClient(clientId, '<strong>SNAP screening reopened.</strong>');
                    await renderNotesContainer();
                    if (window.refreshFarmworkerVisibility) {
                        await window.refreshFarmworkerVisibility();
                    }
                    await refreshAllDisplays();
                } else {
                    console.error('Failed to reopen SNAP screening.');
                }
            } catch (error) {
                console.error('Error reopening SNAP screening:', error);
            }
        });

        return; // Don't render anything else
    }

    // Only check enrollment status if screening is NOT closed
    const isAlreadyEnrolled = clientData?.snap === 'yes';
    const isNotInterested = clientData?.snap === 'notinterested';

    // Build SNAP households
    const snapHouseholds = [];
    const processedMembers = new Set();

    for (const member of members) {
        if (processedMembers.has(member.householdMemberId)) continue;
        if (member.meals?.toLowerCase() !== "yes") continue;

        const snapHousehold = [member];
        processedMembers.add(member.householdMemberId);

        for (const other of members) {
            if (other.householdMemberId !== member.householdMemberId && 
                other.meals?.toLowerCase() === "yes") {
                snapHousehold.push(other);
                processedMembers.add(other.householdMemberId);
            }
        }
        snapHouseholds.push(snapHousehold);
    }

    if (snapHouseholds.length === 0) {
        const noHouseholdsDiv = document.createElement('div');
        noHouseholdsDiv.classList.add('household-member-box');

        // Check if any SNAP household member has screening in progress
        const anySnapScreeningActive = members.some(m => m.SNAP?.screeningInProgress === true);

        // Apply background color based on state
        if (isAlreadyEnrolled || isNotInterested) {
            noHouseholdsDiv.style.backgroundColor = '#f8d7da';
            noHouseholdsDiv.style.borderColor = '#f5c6cb';
        } else {
            noHouseholdsDiv.style.backgroundColor = '#fff3cd';
            noHouseholdsDiv.style.borderColor = '#ffc107';
        }

        noHouseholdsDiv.style.width = '100%';
        noHouseholdsDiv.style.boxSizing = 'border-box';

        noHouseholdsDiv.innerHTML = `
            <h3>SNAP HOUSEHOLD</h3>
            ${isAlreadyEnrolled ? '<p>ALREADY ENROLLED</p>' : isNotInterested ? '<p>NOT INTERESTED</p>' : '<p>NO SNAP HOUSEHOLD MEMBERS FOUND.</p>'}
            ${anySnapScreeningActive || isAlreadyEnrolled || isNotInterested ? `
                <button class="btn-close-snap-screening" 
                    style="background-color: #dc3545; color: white; border: none; border-radius: 4px; padding: 8px 16px; font-size: 13px; cursor: pointer; transition: background-color 0.3s; margin: 8px auto;"
                    onmouseover="this.style.backgroundColor='#a71d2a'" 
                    onmouseout="this.style.backgroundColor='#dc3545'">Close Screening(s)</button>
            ` : ''}
        `;
        snapContainer.appendChild(noHouseholdsDiv);

        if (anySnapScreeningActive || isAlreadyEnrolled || isNotInterested) {
            const closeBtn = noHouseholdsDiv.querySelector('.btn-close-snap-screening');
            closeBtn.addEventListener('click', async () => {
                const freshMembers = await loadHouseholdMembers();
                openCloseMemberModal(clientId, freshMembers, null, null, 'SNAP');
            });
        }

        return;
    }

    snapHouseholds.forEach(household => {
        const householdDiv = createSNAPHouseholdCard(household, members);
        snapContainer.appendChild(householdDiv);
    });
}

function createSNAPHouseholdCard(household, allMembers) {
    const householdDiv = document.createElement('div');
    householdDiv.classList.add('household-member-box');

    const combinedMonthlyIncome = household[0]?.SNAP?.combinedMonthlyIncome || 0;
    const totalNetIncome = household[0]?.SNAP?.totalNetIncome || 0;
    const excessShelterCost = household[0]?.SNAP?.excessShelterCost || 0;
    const totalUtilityAllowance = household[0]?.SNAP?.totalUtilityAllowance || 0;
    const totalMedicalExpenses = household[0]?.SNAP?.totalMedicalExpenses || 0;
    const totalOtherExpenses = household[0]?.SNAP?.totalOtherExpenses || 0;
    const eligibility = household[0]?.SNAP?.eligibility?.map(capitalizeFirstLetter) || ['Not Available'];
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
        householdDiv.style.backgroundColor = '#f8d7da';
        householdDiv.style.borderColor = '#f5c6cb';
    } else if (needsMoreInfo) {
        householdDiv.style.backgroundColor = '#fff3cd';
        householdDiv.style.borderColor = '#ffc107';
    } else if (isLikelyEligible) {
        householdDiv.style.backgroundColor = '#d4edda';
        householdDiv.style.borderColor = '#c3e6cb';
    }

    householdDiv.innerHTML = `
        <details class="custom-details">
            <summary><h3>SNAP HOUSEHOLD</h3></summary>
            <p><strong>SNAP Household Size:</strong> ${household[0]?.SNAP?.householdSize || household.length}</p>
            <p><strong>Total Gross Income:</strong> $${(combinedMonthlyIncome || 0).toFixed(2)}</p>
            <p><strong>Standard Deduction:</strong> $${(household[0]?.SNAP?.standardDeduction || 0).toFixed(2)}</p>
            <p><strong>Shelter Deduction:</strong> $${(excessShelterCost || 0).toFixed(2)}</p>
            <p><strong>Utility Allowance:</strong> $${(totalUtilityAllowance || 0).toFixed(2)}</p>
            <p><strong>Medical Expense Deductions:</strong> $${(totalMedicalExpenses || 0).toFixed(2)}</p>
            <p><strong>Other Expense Deductions:</strong> $${(totalOtherExpenses || 0).toFixed(2)}</p>
            <p><strong>Adjusted Net Income:</strong> $${(totalNetIncome || 0).toFixed(2)}</p>
            <p><strong>Combined Assets:</strong> $${(combinedAssets || 0).toFixed(2)}</p>
            <hr class="separator-bar">
        </details>
        <button class="btn-close-snap-screening" 
            style="background-color: #dc3545; color: white; border: none; border-radius: 4px; padding: 8px 16px; font-size: 13px; cursor: pointer; transition: background-color 0.3s;"
            onmouseover="this.style.backgroundColor='#a71d2a'" 
            onmouseout="this.style.backgroundColor='#dc3545'">Close Screening(s)</button>
        <p><strong>Members:</strong> ${household.map(member => `${capitalizeFirstLetter(member.firstName)} ${capitalizeFirstLetter(member.lastName)}`).join(', ')}</p>
        <p><strong>Eligibility:</strong> ${Array.isArray(eligibility) ? eligibility.join(', ') : eligibility}</p>
        ${isLikelyEligible && benefitAmount >= 0 ? `
            <p><strong>Estimated Benefit Amount:</strong><br> ${
                benefitAmount <= 24 ? "Up to $24.00" : `Up to $24.00 - $${benefitAmount.toFixed(2)}`
            }</p>
            <p><strong>Expedited Eligibility:</strong> ${household[0]?.SNAP?.expeditedEligibility || 'N/A'}</p>
        ` : ''}
    `;

    const closeBtn = householdDiv.querySelector('.btn-close-snap-screening');
    closeBtn.addEventListener('click', async () => {
        const freshMembers = await loadHouseholdMembers();
        openCloseMemberModal(clientId, freshMembers, null, null, 'SNAP');
    });

    return householdDiv;
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

    async function updateClientProgramStatus(clientId, benefit, isOpen, closeReason = null) {
        try {
            // Fetch current client data
            const response = await fetch(`/get-client/${clientId}`);
            if (!response.ok) throw new Error('Failed to fetch client data');
            const clientData = await response.json();
    
            // Initialize programStatus if it doesn't exist
            const programStatus = clientData.programStatus || {};
            
            // Update the specific benefit's status
            programStatus[benefit] = {
                screeningInProgress: isOpen,
                screeningCloseReason: isOpen ? null : closeReason
            };
    
            // Save updated client data
            const updateResponse = await fetch(`/update-client`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    clientId, 
                    clientData: { programStatus } 
                })
            });
    
            if (!updateResponse.ok) {
                console.error(`Failed to update client program status for ${benefit}`);
            }
        } catch (error) {
            console.error(`Error updating client program status for ${benefit}:`, error);
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
        if (window.invalidateAssetCache) {
            window.invalidateAssetCache();
        }
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

    // Don't auto-terminate if there are no household members
    if (!members || members.length === 0) return;

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

    // Check CLIENT-LEVEL program status ONLY for LIHEAP (household benefit)
    const programStatus = client?.programStatus || {};
    const liheapScreeningClosed = programStatus.LIHEAP?.screeningInProgress === false;
    const liheapCloseReason = programStatus.LIHEAP?.screeningCloseReason || 'N/A';

    if (liheapScreeningClosed) {
        const reopenDiv = document.createElement('div');
        reopenDiv.classList.add('household-member-box');
        reopenDiv.style.backgroundColor = 'rgb(212, 212, 212)';
        reopenDiv.style.borderColor = 'rgb(0, 0, 0)';
        reopenDiv.innerHTML = `
            <h3>LIHEAP HOUSEHOLD</h3>
            <div style="padding: 8px; border-radius: 4px; margin: 8px 0; text-align: center; width: 100%; box-sizing: border-box;">
                <p style="margin: 0 0 6px 0;"><strong>LIHEAP Screening Closed</strong></p>
                <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${liheapCloseReason}</p>
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
                for (const member of members) {
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
                    // Also update client-level program status
                    await updateClientProgramStatus(clientId, 'LIHEAP', true);
                    
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
        noHouseholdsDiv.style.backgroundColor = '#f8d7da';
        noHouseholdsDiv.style.borderColor = '#f5c6cb';
        noHouseholdsDiv.style.width = '100%';
        noHouseholdsDiv.style.boxSizing = 'border-box';

        const anyLiheapScreeningActive = members.some(m => m.LIHEAP?.screeningInProgress === true);

        noHouseholdsDiv.innerHTML = `
            <h3>LIHEAP HOUSEHOLD</h3>
            ${isLiheapAlreadyEnrolled ? `
                <p>ALREADY ENROLLED</p>
            ` : `
                <p>NOT INTERESTED</p>
            `}
            ${anyLiheapScreeningActive || isLiheapAlreadyEnrolled || isLiheapNotInterested ? `
                <button class="btn-close-liheap-screening" style="background-color: #dc3545; color: white; border: none; border-radius: 4px; padding: 8px 16px; font-size: 13px; cursor: pointer; transition: background-color 0.3s;" onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Close Screening(s)</button>
            ` : ''}
        `;
        liheapHouseholdContainer.appendChild(noHouseholdsDiv);

        if (anyLiheapScreeningActive || isLiheapAlreadyEnrolled || isLiheapNotInterested) {
            const closeBtn = noHouseholdsDiv.querySelector('.btn-close-liheap-screening');
            closeBtn.addEventListener('click', () => {
                openCloseMemberModal(clientId, members, null, null, 'LIHEAP');
            });
        }
        return;
    }

    // Check if there are no active LIHEAP members (no household members found)
    if (activeMembersForLIHEAP.length === 0) {
        const noHouseholdsDiv = document.createElement('div');
        noHouseholdsDiv.classList.add('household-member-box');
        noHouseholdsDiv.style.backgroundColor = '#fff3cd';
        noHouseholdsDiv.style.borderColor = '#ffc107';
        noHouseholdsDiv.style.width = '100%';
        noHouseholdsDiv.style.boxSizing = 'border-box';

        const anyLiheapScreeningActive = members.some(m => m.LIHEAP?.screeningInProgress === true);

        noHouseholdsDiv.innerHTML = `
            <h3>LIHEAP HOUSEHOLD</h3>
            <p>NO LIHEAP HOUSEHOLD MEMBERS FOUND.</p>
            ${anyLiheapScreeningActive ? `
                <button class="btn-close-liheap-screening" style="background-color: #dc3545; color: white; border: none; border-radius: 4px; padding: 8px 16px; font-size: 13px; cursor: pointer; transition: background-color 0.3s;" onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Close Screening(s)</button>
            ` : ''}
        `;
        liheapHouseholdContainer.appendChild(noHouseholdsDiv);

        if (anyLiheapScreeningActive) {
            const closeBtn = noHouseholdsDiv.querySelector('.btn-close-liheap-screening');
            closeBtn.addEventListener('click', () => {
                openCloseMemberModal(clientId, members, null, null, 'LIHEAP');
            });
        }
        return;
    }

    // Read the values directly from the LIHEAP object (set by LIHEAPEligibilityCheck)
    const combinedMonthlyIncome = activeMembersForLIHEAP[0]?.LIHEAP?.combinedMonthlyIncome || 0;
    const totalMedicarePremiumDeduction = activeMembersForLIHEAP[0]?.LIHEAP?.totalMedicarePremiumDeduction || 0;
    const grossMonthlyIncome = combinedMonthlyIncome + totalMedicarePremiumDeduction;
    const eligibility = activeMembersForLIHEAP[0]?.LIHEAP?.eligibility?.map(capitalizeFirstLetter) || 'No LIHEAP Household Members Found';

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
        householdDiv.style.backgroundColor = '#f8d7da';
        householdDiv.style.borderColor = '#f5c6cb';
    } else if (needsMoreInfo) {
        householdDiv.style.backgroundColor = '#fff3cd';
        householdDiv.style.borderColor = '#ffc107';
    } else if (isLikelyEligible) {
        householdDiv.style.backgroundColor = '#d4edda';
        householdDiv.style.borderColor = '#c3e6cb';
    }

    // Populate household details
    householdDiv.innerHTML = `
        <details class="custom-details">
            <summary><h3>LIHEAP HOUSEHOLD</h3></summary>
                    <p><strong>LIHEAP Household Size:</strong> ${activeMembersForLIHEAP.length}</p>
                    <p><strong>Total Gross Income:</strong> $${grossMonthlyIncome.toFixed(2)}</p>
                    <p><strong>Medicare Premium Deductions:</strong> $${totalMedicarePremiumDeduction.toFixed(2)}</p>
                    <p><strong>Adjusted Gross Income:</strong> $${combinedMonthlyIncome.toFixed(2)}</p>
            <hr class="separator-bar">
        </details>
                    <button class="btn-close-liheap-screening" style="background-color: #dc3545; color: white; border: none; border-radius: 4px; padding: 8px 16px; font-size: 13px; cursor: pointer; transition: background-color 0.3s;" onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Close Screening(s)</button>

        <p><strong>Members:</strong> ${activeMembersForLIHEAP.length > 0 
            ? activeMembersForLIHEAP.map(member => `${capitalizeFirstLetter(member.firstName || '')} ${capitalizeFirstLetter(member.lastName || '')}`).join(', ') 
            : 'N/A'}</p>
                <p><strong>Eligibility:</strong> ${Array.isArray(eligibility) ? eligibility.join(', ') : eligibility}</p>
    `;

    liheapHouseholdContainer.appendChild(householdDiv);

    const closeBtn = householdDiv.querySelector('.btn-close-liheap-screening');
    closeBtn.addEventListener('click', () => {
        openCloseMemberModal(clientId, members, null, null, 'LIHEAP');
    });
}

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

async function PACEEligibilityCheck(members) {
    const Utils = getUtils();
    if (!Utils) {
        console.error('Cannot run PACEEligibilityCheck: EligibilityUtils not available');
        return;
    }
    // Step 1: Calculate adjusted income for each member
    for (const member of members) {
        try {
            // Skip deceased members - set PACE to Not Checked
            if ((member.deceased ?? '').toLowerCase() === 'yes') {
                member.PACE = {
                    adjustedIncome: 0,
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
            // Use local date constructors to avoid UTC timezone parsing issues
            const previousYearStart = new Date(previousYear, 0, 1); // Jan 1
            const previousYearEnd = new Date(previousYear, 11, 31); // Dec 31

// ...existing code...
let totalIncome = previousYearIncomes.reduce((sum, income) => {
    // Calculate the raw yearly amount from amount × frequency multiplier
    // Don't use Utils.calculateYearlyIncome which may filter out ended income
    let yearlyMultiplier;
    switch ((income.frequency || '').toLowerCase()) {
        case 'one-time': yearlyMultiplier = 1; break;
        case 'weekly': yearlyMultiplier = 52; break;
        case 'bi-weekly': yearlyMultiplier = 26; break;
        case 'semi-monthly': yearlyMultiplier = 24; break;
        case 'monthly': yearlyMultiplier = 12; break;
        case 'quarterly': yearlyMultiplier = 4; break;
        case 'annually': yearlyMultiplier = 1; break;
        default: yearlyMultiplier = 0; break;
    }
    const yearlyAmount = Number(income.amount || 0) * yearlyMultiplier;

    // Only include income active during the previous year
    // Parse dates using local time to match previousYearStart/End
    const incomeParts = income.startDate.split('-');
    const incomeStart = new Date(parseInt(incomeParts[0]), parseInt(incomeParts[1]) - 1, parseInt(incomeParts[2]));                let incomeEnd;
                if (income.endDate) {
                    const endParts = income.endDate.split('-');
                    incomeEnd = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2]));
                } else {
                    incomeEnd = new Date();
                }

                if (incomeStart <= previousYearEnd && incomeEnd >= previousYearStart) {
                    const activeStart = incomeStart < previousYearStart ? previousYearStart : incomeStart;
                    const activeEnd = incomeEnd > previousYearEnd ? previousYearEnd : incomeEnd;

                    const activeDays = Math.min((activeEnd - activeStart) / (1000 * 60 * 60 * 24) + 1, 365);
                    const proratedMultiplier = activeDays / 365;
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

            // Store adjusted income inside the PACE object, not on the member directly
            member.PACE = {
                ...(member.PACE || {}),
                adjustedIncome: totalIncome,
                screeningInProgress: member.PACE?.screeningInProgress ?? true,
                screeningCloseReason: member.PACE?.screeningCloseReason ?? null
            };

            console.log(`PACE adjusted income for ${member.firstName} ${member.lastName}: $${totalIncome}`);
        } catch (error) {
            console.error(`Error calculating adjusted income for ${member.firstName} ${member.lastName}:`, error);
        }
    }

    // Step 2: Calculate combined income/assets first, then determine eligibility independently per member
    // First pass: compute combined income for all members
    const combinedValues = new Map(); // memberId -> { combinedIncome, hasLivingSpouse }
    for (const member of members) {
        if ((member.deceased ?? '').toLowerCase() === 'yes') continue;

        const spouseRelation = member.relationships?.find(r => r.relationship === 'spouse');
        const spouse = spouseRelation
            ? members.find(m => m.householdMemberId === spouseRelation.relatedMemberId)
            : null;
        const hasLivingSpouse = spouse && (spouse.deceased ?? '').toLowerCase() !== 'yes';

        let combinedIncome;

        if (hasLivingSpouse) {
            combinedIncome = (Number(member.PACE?.adjustedIncome) || 0) + (Number(spouse.PACE?.adjustedIncome) || 0);
            console.log(`PACE Combined income for ${member.firstName} and ${spouse.firstName}: $${combinedIncome}`);
        } else {
            combinedIncome = member.PACE?.adjustedIncome || 0;
        }

        combinedValues.set(member.householdMemberId, { combinedIncome, hasLivingSpouse });
    }

    // Second pass: determine eligibility independently for each member using shared combined values
    for (const member of members) {
        try {
            if ((member.deceased ?? '').toLowerCase() === 'yes') continue;

            const values = combinedValues.get(member.householdMemberId);
            if (!values) continue;

            const { combinedIncome, hasLivingSpouse } = values;

            // Eligibility checks — independent per member
            const eligibility = [];

            // Parse the age from the member object
            const age = member.age;
            const [years, months, days] = age
                .replace(/Years,|Months,|Days/g, '')
                .trim()
                .split(/\s+/)
                .map(value => parseInt(value.trim()) || 0);

            // Qualification check for age
            if (years < 64 || (years === 64 && months < 11) || (years === 64 && months === 11 && days < 0)) {
                eligibility.push("Age Criteria Not Met");
                member.selections = member.selections || {};
                member.selections["Is this person currently enrolled in PACE?"] = null;
                member.selections["Has this person lived in Pennsylvania for at least the last 90 consecutive days?"] = null;
            } else {
                // Check PACE and Medicaid enrollment
                const paceEnrollment = member.selections?.["Is this person currently enrolled in PACE?"]?.toLowerCase();
                const medicaidEnrollment = member.medicaid?.toLowerCase();
                const paResidency = member.selections?.["Has this person lived in Pennsylvania for at least the last 90 consecutive days?"]?.toLowerCase();

                if (medicaidEnrollment === "yes") {
                    eligibility.push("Enrolled in Medicaid");
                    member.selections = member.selections || {};
                    member.selections["Is this person currently enrolled in PACE?"] = null;
                    member.selections["Has this person lived in Pennsylvania for at least the last 90 consecutive days?"] = null;
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
                    // Income-based eligibility using hasLivingSpouse instead of spouse reference
                    if (hasLivingSpouse) {
                        if (combinedIncome < Utils.PACE_THRESHOLDS.married.pace) {
                            eligibility.push("Likely Eligible for PACE");
                        } else if (combinedIncome >= Utils.PACE_THRESHOLDS.married.pace && combinedIncome <= Utils.PACE_THRESHOLDS.married.pacenet) {
                            eligibility.push("Likely Eligible for PACENET");
                        } else if (combinedIncome >= Utils.PACE_THRESHOLDS.married.pacenet && combinedIncome <= Utils.PACE_THRESHOLDS.married.buffer) {
                            eligibility.push("Likely Ineligible but Within Buffer");
                        } else if (combinedIncome > Utils.PACE_THRESHOLDS.married.buffer) {
                            eligibility.push("Not Likely Eligible for PACE or PACENET (Income)");
                        }
                    } else {
                        if (combinedIncome < Utils.PACE_THRESHOLDS.single.pace) {
                            eligibility.push("Likely Eligible for PACE");
                        } else if (combinedIncome >= Utils.PACE_THRESHOLDS.single.pace && combinedIncome <= Utils.PACE_THRESHOLDS.single.pacenet) {
                            eligibility.push("Likely Eligible for PACENET");
                        } else if (combinedIncome >= Utils.PACE_THRESHOLDS.single.pacenet && combinedIncome <= Utils.PACE_THRESHOLDS.single.buffer) {
                            eligibility.push("Likely Ineligible but Within Buffer");
                        } else if (combinedIncome > Utils.PACE_THRESHOLDS.single.buffer) {
                            eligibility.push("Not Likely Eligible for PACE or PACENET (Income)");
                        }
                    }
                }
            }

            member.PACE = {
                adjustedIncome: member.PACE?.adjustedIncome || 0,
                combinedIncome: Math.max(0, combinedIncome || 0),
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
    const clientId = getQueryParameter('id');
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
    }
}

async function LISEligibilityCheck(members) {
    const Utils = getUtils();
    if (!Utils) {
        console.error('Cannot run LISEligibilityCheck: EligibilityUtils not available');
        return;
    }

    // Step 1: Calculate adjusted income and assets for each member
    for (const member of members) {
        try {
            // Skip deceased members
            if ((member.deceased ?? '').toLowerCase() === 'yes') {
                member.LIS = {
                    combinedIncome: 0,
                    combinedAssets: 0,
                    adjustedIncome: 0,
                    adjustedAssets: 0,
                    eligibility: ["Not Checked"],
                    screeningInProgress: member.LIS?.screeningInProgress ?? false,
                    screeningCloseReason: member.LIS?.screeningCloseReason ?? "Not Applicable"
                };
                console.log(`Skipping LIS for deceased member: ${member.firstName} ${member.lastName}`);
                continue;
            }

            const incomes = member.income || [];
            const currentYearIncomes = Utils.filterCurrentIncomes(incomes);

            // Calculate total monthly income from current incomes
            let totalIncome = currentYearIncomes.reduce((sum, income) => {
                const yearlyAmount = Utils.calculateYearlyIncome(
                    income.amount,
                    income.frequency,
                    income.startDate,
                    income.endDate
                );
                return sum + (yearlyAmount / 12);
            }, 0);

            // Calculate total assets
            const assets = member.assets || [];
            const totalAssets = assets.reduce((sum, asset) => sum + Number(asset.value || 0), 0);

            // Store adjusted values inside the LIS object (initialized here, finalized in Step 2)
            member.LIS = {
                ...(member.LIS || {}),
                adjustedIncome: totalIncome,
                adjustedAssets: totalAssets,
                screeningInProgress: member.LIS?.screeningInProgress ?? true,
                screeningCloseReason: member.LIS?.screeningCloseReason ?? null
            };

            console.log(`LIS adjusted monthly income for ${member.firstName} ${member.lastName}: $${totalIncome}`);
            console.log(`LIS adjusted assets for ${member.firstName} ${member.lastName}: $${totalAssets}`);
        } catch (error) {
            console.error(`Error calculating LIS adjusted income/assets for ${member.firstName} ${member.lastName}:`, error);
        }
    }

    // Step 2: Calculate combined income/assets first, then determine eligibility independently per member
    // First pass: compute combined income/assets for all members
    const combinedValues = new Map(); // memberId -> { combinedIncome, combinedAssets, hasLivingSpouse }
    for (const member of members) {
        if ((member.deceased ?? '').toLowerCase() === 'yes') continue;

        const spouseRelation = member.relationships?.find(r => r.relationship === 'spouse');
        const spouse = spouseRelation
            ? members.find(m => m.householdMemberId === spouseRelation.relatedMemberId)
            : null;
        const hasLivingSpouse = spouse && (spouse.deceased ?? '').toLowerCase() !== 'yes';

        let combinedIncome, combinedAssets;

        if (hasLivingSpouse) {
            combinedIncome = (Number(member.LIS?.adjustedIncome) || 0) + (Number(spouse.LIS?.adjustedIncome) || 0);
            combinedAssets = (Number(member.LIS?.adjustedAssets) || 0) + (Number(spouse.LIS?.adjustedAssets) || 0);
            console.log(`LIS Combined income for ${member.firstName} and ${spouse.firstName}: $${combinedIncome}`);
            console.log(`LIS Combined assets for ${member.firstName} and ${spouse.firstName}: $${combinedAssets}`);
        } else {
            combinedIncome = member.LIS?.adjustedIncome || 0;
            combinedAssets = member.LIS?.adjustedAssets || 0;
        }

        combinedValues.set(member.householdMemberId, { combinedIncome, combinedAssets, hasLivingSpouse });
    }

    // Second pass: determine eligibility independently for each member using shared combined values
    for (const member of members) {
        try {
            if ((member.deceased ?? '').toLowerCase() === 'yes') continue;

            const values = combinedValues.get(member.householdMemberId);
            if (!values) continue;

            const { combinedIncome, combinedAssets, hasLivingSpouse } = values;

            // Eligibility determination — independent per member
            const eligibility = [];

            const medicareEnrollment = member.medicare?.toLowerCase();
            const medicaidEnrollment = member.medicaid?.toLowerCase();
            const lisEnrollment = member.selections?.["Is this person currently enrolled in LIS/ Extra Help?"]?.toLowerCase();

            if (!medicareEnrollment || medicareEnrollment === 'n/a' || medicareEnrollment === '') {
                eligibility.push("Needs Current Medicare Enrollment Status");
            } else if (medicareEnrollment !== 'yes') {
                eligibility.push("Not Enrolled in Medicare");
                member.selections = member.selections || {};
                member.selections["Is this person currently enrolled in LIS/ Extra Help?"] = null;
            } else if (medicaidEnrollment === 'yes') {
                eligibility.push("Enrolled in Medicaid - Auto Deemed for LIS");
            } else if (lisEnrollment === 'yes') {
                eligibility.push("Already Enrolled");
            } else if (lisEnrollment === 'notinterested') {
                eligibility.push("Not Interested");
            } else if (!lisEnrollment) {
                eligibility.push("Needs Current LIS Enrollment Status");
            } else {
                // Determine household size for FPL calculation
                const householdSize = hasLivingSpouse ? 2 : 1;

                // Income limit: 150% FPL based on household size
                const incomeLimit = Utils.LIS_THRESHOLDS.getIncomeLimit(householdSize);

                // Asset limit: based on marital status
                const assetLimit = hasLivingSpouse
                    ? Utils.LIS_THRESHOLDS.assets.married
                    : Utils.LIS_THRESHOLDS.assets.single;

                const incomeEligible = combinedIncome <= incomeLimit;
                const assetEligible = combinedAssets <= assetLimit;

                console.log(`LIS thresholds for ${member.firstName}: income limit=$${incomeLimit.toFixed(2)} (${Utils.FPL_PERCENTAGES.LIS * 100}% FPL for ${householdSize}), asset limit=$${assetLimit}`);
                console.log(`LIS check: income $${combinedIncome.toFixed(2)} ${incomeEligible ? '<=' : '>'} $${incomeLimit.toFixed(2)}, assets $${combinedAssets.toFixed(2)} ${assetEligible ? '<=' : '>'} $${assetLimit}`);

                if (incomeEligible && assetEligible) {
                    eligibility.push("Likely Eligible for LIS");
                } else if (!incomeEligible && !assetEligible) {
                    eligibility.push("Not Likely Eligible for LIS (Income and Assets)");
                } else if (!incomeEligible) {
                    eligibility.push("Not Likely Eligible for LIS (Income)");
                } else {
                    eligibility.push("Not Likely Eligible for LIS (Assets)");
                }
            }

            member.LIS = {
                adjustedIncome: member.LIS?.adjustedIncome || 0,
                adjustedAssets: member.LIS?.adjustedAssets || 0,
                combinedIncome: Math.max(0, combinedIncome || 0),
                combinedAssets: Math.max(0, combinedAssets || 0),
                eligibility: eligibility,
                screeningInProgress: member.LIS?.screeningInProgress ?? true,
                screeningCloseReason: member.LIS?.screeningCloseReason ?? null
            };

            console.log(`LIS object for ${member.firstName} ${member.lastName}:`, member.LIS);
        } catch (error) {
            console.error(`Error processing LIS for member ${member.firstName} ${member.lastName}:`, error);
        }
    }

    // Save the updated members array
    const clientId = getQueryParameter('id');
    try {
        const response = await fetch(`/save-household-members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, householdMembers: members }),
        });

        if (response.ok) {
            console.log('Household members saved successfully after LIS check.');
        } else {
            console.error('Failed to save household members:', response.statusText);
        }
    } catch (error) {
        console.error('Error saving household members:', error);
    }
}

async function MSPEligibilityCheck(members) {
    const Utils = getUtils();
    if (!Utils) {
        console.error('Cannot run MSPEligibilityCheck: EligibilityUtils not available');
        return;
    }

    // Step 1: Calculate adjusted monthly income and assets for each member
    for (const member of members) {
        try {
            // Skip deceased members
            if ((member.deceased ?? '').toLowerCase() === 'yes') {
                member.MSP = {
                    combinedIncome: 0,
                    combinedAssets: 0,
                    adjustedIncome: 0,
                    adjustedAssets: 0,
                    grossMonthlyIncome: 0,
                    eligibility: ["Not Checked"],
                    screeningInProgress: member.MSP?.screeningInProgress ?? false,
                    screeningCloseReason: member.MSP?.screeningCloseReason ?? "Not Applicable"
                };
                console.log(`Skipping MSP for deceased member: ${member.firstName} ${member.lastName}`);
                continue;
            }

            const incomes = member.income || [];
            const currentYearIncomes = Utils.filterCurrentIncomes(incomes);

            // Calculate total monthly income from current incomes
            let totalMonthlyIncome = currentYearIncomes.reduce((sum, income) => {
                const yearlyAmount = Utils.calculateYearlyIncome(
                    income.amount,
                    income.frequency,
                    income.startDate,
                    income.endDate
                );
                return sum + (yearlyAmount / 12);
            }, 0);

            // Apply MSP income deductions
            // $20 general deduction applied to unearned income
            let unearnedMonthlyIncome = currentYearIncomes
                .filter(income => {
                    const kind = income.kind?.toLowerCase() || '';
                    return kind !== 'employment' && kind !== 'self-employment';
                })
                .reduce((sum, income) => {
                    const yearlyAmount = Utils.calculateYearlyIncome(
                        income.amount,
                        income.frequency,
                        income.startDate,
                        income.endDate
                    );
                    return sum + (yearlyAmount / 12);
                }, 0);

            // $65 earned income deduction + 50% of remainder
            let earnedMonthlyIncome = currentYearIncomes
                .filter(income => {
                    const kind = income.kind?.toLowerCase() || '';
                    return kind === 'employment' || kind === 'self-employment';
                })
                .reduce((sum, income) => {
                    const yearlyAmount = Utils.calculateYearlyIncome(
                        income.amount,
                        income.frequency,
                        income.startDate,
                        income.endDate
                    );
                    return sum + (yearlyAmount / 12);
                }, 0);

            // Apply $20 general deduction to unearned income first
            let remainingGeneralDeduction = Utils.MSP_DEDUCTIONS.otherDeduction;
            if (unearnedMonthlyIncome >= remainingGeneralDeduction) {
                unearnedMonthlyIncome -= remainingGeneralDeduction;
                remainingGeneralDeduction = 0;
            } else {
                remainingGeneralDeduction -= unearnedMonthlyIncome;
                unearnedMonthlyIncome = 0;
            }

            // Apply $65 employment deduction, then halve the remainder
            if (earnedMonthlyIncome > 0) {
                // Apply any remaining general deduction to earned income
                earnedMonthlyIncome = Math.max(0, earnedMonthlyIncome - remainingGeneralDeduction);
                // Apply $65 employment deduction
                earnedMonthlyIncome = Math.max(0, earnedMonthlyIncome - Utils.MSP_DEDUCTIONS.employmentDeduction);
                // Halve the remainder
                earnedMonthlyIncome = earnedMonthlyIncome / 2;
            }

            const adjustedMonthlyIncome = unearnedMonthlyIncome + earnedMonthlyIncome;

            // Calculate total assets
            const assets = member.assets || [];
            const totalAssets = assets.reduce((sum, asset) => sum + Number(asset.value || 0), 0);

            // Store adjusted values inside the MSP object (initialized here, finalized in Step 2)
            member.MSP = {
                ...(member.MSP || {}),
                adjustedIncome: adjustedMonthlyIncome,
                grossMonthlyIncome: totalMonthlyIncome,
                adjustedAssets: totalAssets,
                screeningInProgress: member.MSP?.screeningInProgress ?? true,
                screeningCloseReason: member.MSP?.screeningCloseReason ?? null
            };

            console.log(`MSP gross monthly income for ${member.firstName} ${member.lastName}: $${totalMonthlyIncome.toFixed(2)}`);
            console.log(`MSP adjusted monthly income for ${member.firstName} ${member.lastName}: $${adjustedMonthlyIncome.toFixed(2)}`);
            console.log(`MSP adjusted assets for ${member.firstName} ${member.lastName}: $${totalAssets.toFixed(2)}`);
        } catch (error) {
            console.error(`Error calculating MSP adjusted income/assets for ${member.firstName} ${member.lastName}:`, error);
        }
    }

    // Step 2: Calculate combined income/assets first, then determine eligibility independently per member
    // First pass: compute combined income/assets for all members
    const combinedValues = new Map(); // memberId -> { combinedIncome, combinedAssets, hasLivingSpouse }
    for (const member of members) {
        if ((member.deceased ?? '').toLowerCase() === 'yes') continue;

        const spouseRelation = member.relationships?.find(r => r.relationship === 'spouse');
        const spouse = spouseRelation
            ? members.find(m => m.householdMemberId === spouseRelation.relatedMemberId)
            : null;
        const hasLivingSpouse = spouse && (spouse.deceased ?? '').toLowerCase() !== 'yes';

        let combinedIncome, combinedAssets;

        if (hasLivingSpouse) {
            combinedIncome = (Number(member.MSP?.adjustedIncome) || 0) + (Number(spouse.MSP?.adjustedIncome) || 0);
            combinedAssets = (Number(member.MSP?.adjustedAssets) || 0) + (Number(spouse.MSP?.adjustedAssets) || 0);
            console.log(`MSP Combined income for ${member.firstName} and ${spouse.firstName}: $${combinedIncome.toFixed(2)}`);
            console.log(`MSP Combined assets for ${member.firstName} and ${spouse.firstName}: $${combinedAssets.toFixed(2)}`);
        } else {
            combinedIncome = member.MSP?.adjustedIncome || 0;
            combinedAssets = member.MSP?.adjustedAssets || 0;
        }

        combinedValues.set(member.householdMemberId, { combinedIncome, combinedAssets, hasLivingSpouse });
    }

    // Second pass: determine eligibility independently for each member using shared combined values
    for (const member of members) {
        try {
            if ((member.deceased ?? '').toLowerCase() === 'yes') continue;

            const values = combinedValues.get(member.householdMemberId);
            if (!values) continue;

            const { combinedIncome, combinedAssets, hasLivingSpouse } = values;

            // Eligibility determination — independent per member
            const eligibility = [];

            const medicareEnrollment = member.medicare?.toLowerCase();
            const medicaidEnrollment = member.medicaid?.toLowerCase();
            const mspEnrollment = member.selections?.["Is this person currently enrolled in the Medicare Savings Program?"]?.toLowerCase();

            if (!medicareEnrollment || medicareEnrollment === 'n/a' || medicareEnrollment === '') {
                eligibility.push("Needs Current Medicare Enrollment Status");
            } else if (medicareEnrollment !== 'yes') {
                eligibility.push("Not Enrolled in Medicare");
                member.selections = member.selections || {};
                member.selections["Is this person currently enrolled in the Medicare Savings Program?"] = null;
            } else if (medicaidEnrollment === 'yes') {
                eligibility.push("Enrolled in Medicaid");
            } else if (mspEnrollment === 'yes') {
                eligibility.push("Already Enrolled");
            } else if (mspEnrollment === 'notinterested') {
                eligibility.push("Not Interested");
            } else if (!mspEnrollment) {
                eligibility.push("Needs Current MSP Enrollment Status");
            } else {
                // Determine household size for FPL calculation
                const householdSize = hasLivingSpouse ? 2 : 1;

                // Asset limit based on marital status
                const assetLimit = hasLivingSpouse
                    ? Utils.MSP_THRESHOLDS.assets.married
                    : Utils.MSP_THRESHOLDS.assets.single;

                // Get income limits for each MSP level
                const qmbIncomeLimit = Utils.MSP_THRESHOLDS.getIncomeLimit(householdSize, 'qmb');
                const slmbIncomeLimit = Utils.MSP_THRESHOLDS.getIncomeLimit(householdSize, 'slmb');
                const qiIncomeLimit = Utils.MSP_THRESHOLDS.getIncomeLimit(householdSize, 'qi');

                const assetEligible = combinedAssets <= assetLimit;

                console.log(`MSP thresholds for ${member.firstName} (household size ${householdSize}):`);
                console.log(`  QMB income limit: $${qmbIncomeLimit.toFixed(2)} (${Utils.FPL_PERCENTAGES.MSP_QMB * 100}% FPL monthly)`);
                console.log(`  SLMB income limit: $${slmbIncomeLimit.toFixed(2)} (${Utils.FPL_PERCENTAGES.MSP_SLMB * 100}% FPL monthly)`);
                console.log(`  QI income limit: $${qiIncomeLimit.toFixed(2)} (${Utils.FPL_PERCENTAGES.MSP_QI * 100}% FPL monthly)`);
                console.log(`  Asset limit: $${assetLimit}`);
                console.log(`  Combined income: $${combinedIncome.toFixed(2)}, Combined assets: $${combinedAssets.toFixed(2)}`);

                if (!assetEligible) {
                    if (combinedIncome > qiIncomeLimit) {
                        eligibility.push("Not Likely Eligible for MSP (Income and Assets)");
                    } else {
                        eligibility.push("Not Likely Eligible for MSP (Assets)");
                    }
                } else if (combinedIncome <= qmbIncomeLimit) {
                    eligibility.push("Likely Eligible for QMB");
                } else if (combinedIncome <= slmbIncomeLimit) {
                    eligibility.push("Likely Eligible for SLMB");
                } else if (combinedIncome <= qiIncomeLimit) {
                    eligibility.push("Likely Eligible for QI");
                } else {
                    eligibility.push("Not Likely Eligible for MSP (Income)");
                }
            }

            member.MSP = {
                adjustedIncome: member.MSP?.adjustedIncome || 0,
                adjustedAssets: member.MSP?.adjustedAssets || 0,
                grossMonthlyIncome: member.MSP?.grossMonthlyIncome || 0,
                combinedIncome: Math.max(0, combinedIncome || 0),
                combinedAssets: Math.max(0, combinedAssets || 0),
                eligibility: eligibility,
                screeningInProgress: member.MSP?.screeningInProgress ?? true,
                screeningCloseReason: member.MSP?.screeningCloseReason ?? null
            };

            console.log(`MSP object for ${member.firstName} ${member.lastName}:`, member.MSP);
        } catch (error) {
            console.error(`Error processing MSP for member ${member.firstName} ${member.lastName}:`, error);
        }
    }

    // Save the updated members array
    const clientId = getQueryParameter('id');
    try {
        const response = await fetch(`/save-household-members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, householdMembers: members }),
        });

        if (response.ok) {
            console.log('Household members saved successfully after MSP check.');
        } else {
            console.error('Failed to save household members:', response.statusText);
        }
    } catch (error) {
        console.error('Error saving household members:', error);
    }
}

async function PTRREligibilityCheck(members) {
    const Utils = getUtils();
    if (!Utils) {
        console.error('Cannot run PTRREligibilityCheck: EligibilityUtils not available');
        return;
    }
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
                // Use local date constructors to avoid UTC timezone parsing issues
                const previousYearStart = new Date(previousYear, 0, 1); // Jan 1
                const previousYearEnd = new Date(previousYear, 11, 31); // Dec 31
    
                let totalGrossIncome = previousYearIncomes.reduce((sum, income) => {
                    // Calculate the raw yearly amount from amount × frequency multiplier
                    let yearlyMultiplier;
                    switch ((income.frequency || '').toLowerCase()) {
                        case 'one-time': yearlyMultiplier = 1; break;
                        case 'weekly': yearlyMultiplier = 52; break;
                        case 'bi-weekly': yearlyMultiplier = 26; break;
                        case 'semi-monthly': yearlyMultiplier = 24; break;
                        case 'monthly': yearlyMultiplier = 12; break;
                        case 'quarterly': yearlyMultiplier = 4; break;
                        case 'annually': yearlyMultiplier = 1; break;
                        default: yearlyMultiplier = 0; break;
                    }
                    let yearlyAmount = Number(income.amount || 0) * yearlyMultiplier;
                
                    if (
                        Utils.PTRR_THRESHOLDS.halfIncomeTypes.includes(income.kind?.toLowerCase())
                    ) {
                        yearlyAmount /= 2;
                    }
                
                    // Only include income active during the previous year
                    // Parse dates using local time to match previousYearStart/End
                    const incomeParts = income.startDate.split('-');
                    const incomeStart = new Date(parseInt(incomeParts[0]), parseInt(incomeParts[1]) - 1, parseInt(incomeParts[2]));
                    let incomeEnd;
                    if (income.endDate) {
                        const endParts = income.endDate.split('-');
                        incomeEnd = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2]));
                    } else {
                        incomeEnd = new Date();
                    }
                
                    if (incomeStart <= previousYearEnd && incomeEnd >= previousYearStart) {
                        const activeStart = incomeStart < previousYearStart ? previousYearStart : incomeStart;
                        const activeEnd = incomeEnd > previousYearEnd ? previousYearEnd : incomeEnd;
                
                        const activeDays = Math.min((activeEnd - activeStart) / (1000 * 60 * 60 * 24) + 1, 365);
                        const proratedMultiplier = activeDays / 365;
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
        // Calculate the raw yearly amount from amount × frequency multiplier
        let yearlyMultiplier;
        switch ((income.frequency || '').toLowerCase()) {
            case 'one-time': yearlyMultiplier = 1; break;
            case 'weekly': yearlyMultiplier = 52; break;
            case 'bi-weekly': yearlyMultiplier = 26; break;
            case 'semi-monthly': yearlyMultiplier = 24; break;
            case 'monthly': yearlyMultiplier = 12; break;
            case 'quarterly': yearlyMultiplier = 4; break;
            case 'annually': yearlyMultiplier = 1; break;
            default: yearlyMultiplier = 0; break;
        }
        let yearlyAmount = Number(income.amount || 0) * yearlyMultiplier;

        if (
            Utils.PTRR_THRESHOLDS.halfIncomeTypes.includes(income.kind?.toLowerCase())
        ) {
            yearlyAmount /= 2;
        }

        // Parse dates using local time to match previousYearStart/End
        const incomeParts = income.startDate.split('-');        const incomeStart = new Date(parseInt(incomeParts[0]), parseInt(incomeParts[1]) - 1, parseInt(incomeParts[2]));
        let incomeEnd;
        if (income.endDate) {
            const endParts = income.endDate.split('-');
            incomeEnd = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2]));
        } else {
            incomeEnd = new Date();
        }

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
    
                if (!(age >= 18 && isDisabled) && !(age >= 50 && isWidowed) && !(age >= 65)) {
                    eligibility.push("Age, Disability, or Widow Status Criteria Not Met");
                } else if (!member.residenceStatus || member.residenceStatus.toLowerCase() === "n/a") {
                    eligibility.push("Needs Previous Year Residence Status");
                } else if (applicationStatus === "yes") {
                    eligibility.push("Already Applied");
                } else if (member.residenceStatus?.toLowerCase() === "other") {
                    eligibility.push("No Formal Lease");
    member.selections = member.selections || {};
    member.selections["Has this person already applied for PTRR this year?"] = "agecriterianotmet";
} else if (!applicationStatus || applicationStatus.toLowerCase().trim() === "n/a" || 
                applicationStatus.toLowerCase().trim() === "not interested" || 
                applicationStatus.toLowerCase().trim() === "agecriterianotmet") {
         eligibility.push("Needs Current Enrollment Status");
        } else if (applicationStatus === "notinterested") {
            eligibility.push("Not Interested");
        } else if (applicationStatus.toLowerCase().trim() === "no" && totalGrossIncome > Utils.PTRR_THRESHOLDS.incomeLimit) {
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

    // Add the calculateSNAPBenefit function
    function calculateSNAPBenefit(finalNetIncome, householdSize, eligibilityStatus) {
        const Utils = getUtils();
        if (!Utils) {
            console.error('Cannot calculate SNAP benefit: EligibilityUtils not available');
            return 0;
        }
            const maxAllotment = Utils.SNAP_MAX_ALLOTMENTS[householdSize] || 
            (householdSize > 8 ? Utils.SNAP_MAX_ALLOTMENTS[8] + 218 * (householdSize - 8) : 0);

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
    if (benefitAmount < Utils.SNAP_MINIMUM_BENEFIT && eligibilityStatus === "Likely Eligible for SNAP") {
        benefitAmount = Utils.SNAP_MINIMUM_BENEFIT;
    }

    // Always return the benefit amount with two decimal places
    return parseFloat(benefitAmount.toFixed(2));
}

function determineExpeditedEligibility(combinedIncome, combinedAssets, finalNetIncome, utilityAllowance, totalShelterExpenses, isFarmworker, hasActiveIncome) {
    const Utils = getUtils();
    if (!Utils) {
        return "Unknown";
    }
        let expeditedEligibility = "No";

    if (isFarmworker === true && combinedAssets <= Utils.SNAP_EXPEDITED_ASSET_LIMIT && !hasActiveIncome) {
        expeditedEligibility = "Yes, Migrant or Seasonal Farmworker";
    }
    else if (combinedIncome <= Utils.SNAP_EXPEDITED_INCOME_LIMIT && combinedAssets <= Utils.SNAP_EXPEDITED_ASSET_LIMIT) {
        expeditedEligibility = "Yes, Low Income and Assets";
    }
    else if (combinedIncome + combinedAssets <= utilityAllowance + totalShelterExpenses) {
        expeditedEligibility = "Yes, Shelter Costs Exceed Income and Assets";
    }

    return expeditedEligibility;
}

async function SNAPEligibilityCheck(members, isFarmworker) {
    const Utils = getUtils();
    if (!Utils) {
        console.error('Cannot run SNAPEligibilityCheck: EligibilityUtils not available');
        return;
    }
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
        const utilityAllowances = Utils.UTILITY_ALLOWANCES;

        // Combine incomes, assets, and calculate deductions for all members in the household
        for (const member of household) {
            const incomes = member.income || [];
            const currentYearIncomes = incomes.filter(income => {
                const startDate = new Date(income.startDate);
                const endDate = new Date(income.endDate);
                const today = new Date();
            
                // Include income only if it is currently active
                return startDate <= today && (!endDate || endDate >= today);
            });            
            const yearlyIncome = currentYearIncomes.reduce((sum, income) => {
                const yearlyAmount = Utils.calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate);
                return sum + yearlyAmount;
            }, 0);

            const netIncome = currentYearIncomes.reduce((sum, income) => {
                const yearlyAmount = Utils.calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate);
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
        const yearlyAmount = Utils.calculateYearlyIncome(
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
        const yearlyAmount = Utils.calculateYearlyIncome(
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
        const yearlyAmount = Utils.calculateYearlyIncome(
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
const standardDeduction = Utils.SNAP_STANDARD_DEDUCTIONS[mealsYesCount] || 0;

// Calculate the total income with a 20% deduction applied only to "Employment" or "Self-Employment" income kinds
const employmentIncomeMonthly = household.reduce((sum, member) => {
    const incomes = member.income || [];
    return sum + incomes
        .filter(income => 
            (income.kind === "Employment" || income.kind === "Self-Employment") &&
            new Date(income.startDate) <= new Date() && 
            (!income.endDate || new Date(income.endDate) >= new Date())
        )
        .reduce((subSum, income) => subSum + (Utils.calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate) / 12), 0);
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
        .reduce((subSum, income) => subSum + (Utils.calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate) / 12), 0);
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
            const ageParts = member.age?.match(/(\d+)\s*Years,?\s*(\d+)?\s*Months?,?\s*(\d+)?\s*Days?/i);
            const years = ageParts ? (parseInt(ageParts[1], 10) || 0) : 0;

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
            excessShelterCost = Math.min(excessShelterCost, Utils.SNAP_SHELTER_COST_CAP);
        }

        // Subtract excess shelter cost
        totalNetIncome = Math.max(0, totalNetIncome - excessShelterCost);

        // Determine gross income limit
        const grossIncomeLimit = Utils.SNAP_GROSS_INCOME_LIMITS[mealsYesCount] || 0;
        // Determine eligibility
        let snapEligibility;
        if (combinedMonthlyIncome <= grossIncomeLimit) {
            snapEligibility = ["Likely Eligible for SNAP"];
        } else if (hasElderlyOrDisabled) {
            const netIncomeLimit = Utils.SNAP_NET_INCOME_LIMITS[mealsYesCount] || 0;            
            if (combinedMonthlyIncome <= grossIncomeLimit) {
                snapEligibility = ["Likely Eligible for SNAP"];
            } else if (combinedAssets > Utils.SNAP_ELDERLY_DISABLED_ASSET_LIMIT) {
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
    const Utils = getUtils();
    if (!Utils) {
        console.error('Cannot run LIHEAPEligibilityCheck: EligibilityUtils not available');
        return;
    }
    try {
        const clientId = getQueryParameter('id');
        if (!clientId || typeof clientId !== 'string') {
            throw new Error('Invalid or missing clientId in query parameters.');
        }

        const response = await fetch(`/get-client/${encodeURIComponent(clientId)}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch client data: ${response.statusText}`);
        }

        const clientData = await response.json();
        if (!clientData?.householdMembers) return;

        const members = clientData.householdMembers;
        const activeMembersForLIHEAP = members.filter(m => (m.deceased ?? '').toLowerCase() !== 'yes');

        let combinedMonthlyIncome = 0;
        let totalMedicarePremiumDeduction = 0;

        for (const member of activeMembersForLIHEAP) {
            const currentIncomes = (member.income || []).filter(income => income.type?.toLowerCase() === 'current');
            const yearlyIncome = currentIncomes.reduce((sum, income) => 
                sum + Utils.calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate), 0);
            const monthlyIncome = yearlyIncome / 12;

            // Medicare premium deduction
            let medicarePremiumDeduction = 0;
            for (const expense of member.expenses || []) {
                const isMedicarePremium = expense.kind?.toLowerCase().includes('medicare') && 
                                          expense.kind?.toLowerCase().includes('premium');
                const isDeductedFromSSOrPension = expense.deductedFromSSOrPension?.toLowerCase() === 'yes';

                if (isMedicarePremium && isDeductedFromSSOrPension) {
                    const monthlyAmount = (expense.amount * Utils.getYearlyMultiplier(expense.frequency)) / 12;
                    if (monthlyAmount > 0) {
                        medicarePremiumDeduction += monthlyAmount;
                    }
                }
            }

            // Cap deduction at actual income — can't deduct more than you earn
            const effectiveDeduction = Math.min(medicarePremiumDeduction, monthlyIncome);
            totalMedicarePremiumDeduction += effectiveDeduction;
            combinedMonthlyIncome += Math.max(0, monthlyIncome - effectiveDeduction);

            console.log(`LIHEAP Income for ${member.firstName} ${member.lastName}: Monthly: $${monthlyIncome.toFixed(2)}, Medicare Deduction: $${effectiveDeduction.toFixed(2)}, Adjusted: $${(monthlyIncome - effectiveDeduction).toFixed(2)}`);
        }

        // Determine eligibility
        const householdSize = activeMembersForLIHEAP.length;
        const incomeLimit = Utils.LIHEAP_INCOME_LIMITS[householdSize] || 0;
        const eligibility = [];

        if (clientData.liheapEnrollment === 'notinterested') {
            eligibility.push("Not Interested");
        } else if (!clientData.liheapEnrollment || clientData.liheapEnrollment === 'n/a') {
            eligibility.push("Needs Current Enrollment Status");
        } else if (['no', 'yes'].includes(clientData.liheapEnrollment) && 
                   (!clientData.heatingCrisis || clientData.heatingCrisis === 'n/a')) {
            eligibility.push("Needs Heating Crisis Status");
        } else if (clientData.liheapEnrollment === 'yes' && clientData.heatingCrisis === 'no') {
            eligibility.push("Already Enrolled");
        } else if (!clientData.residenceStatusCurrent || clientData.residenceStatusCurrent === 'n/a') {
            eligibility.push("Needs Current Residence Status");
        } else if (clientData.residenceStatusCurrent !== 'owned' && 
                   (!clientData.subsidizedHousing || clientData.subsidizedHousing === 'n/a')) {
            eligibility.push("Needs Subsidized Housing Status");
        } else if (clientData.subsidizedHousing === 'yes' && 
                   (!clientData.heatingCost || clientData.heatingCost === 'n/a')) {
            eligibility.push("Needs Heating Cost Responsibility Status");
        } else if (clientData.subsidizedHousing === 'yes' && clientData.heatingCost === 'yes') {
            eligibility.push("Not Likely Eligible for LIHEAP (Heating cost included in rent, household rent is subsidized)");
        } else if (clientData.heatingCrisis === 'yes' && combinedMonthlyIncome <= incomeLimit) {
            eligibility.push("Likely Eligible for LIHEAP (Crisis)");
        } else if (clientData.heatingCrisis === 'yes' && combinedMonthlyIncome > incomeLimit) {
            eligibility.push("Not Likely Eligible for LIHEAP but Submission Recommended");
        } else if (combinedMonthlyIncome <= incomeLimit) {
            eligibility.push("Likely Eligible for LIHEAP");
        } else {
            eligibility.push("Not Likely Eligible for LIHEAP (Income)");
        }

        // Update only non-deceased members
        activeMembersForLIHEAP.forEach(member => {
            member.LIHEAP = {
                combinedMonthlyIncome,
                totalMedicarePremiumDeduction,
                eligibility,
                screeningInProgress: member.LIHEAP?.screeningInProgress ?? true,
                screeningCloseReason: member.LIHEAP?.screeningCloseReason ?? null
            };
        });

        // Save
        const saveResponse = await fetch(`/save-household-members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, householdMembers: members }),
        });

        if (saveResponse.ok) {
            console.log('Household members saved successfully after LIHEAP check.');
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

        // 5. Restart SNAP and LIHEAP program statuses at the client level
        await updateClientProgramStatus(clientId, 'SNAP', true);
        await updateClientProgramStatus(clientId, 'LIHEAP', true);

        // 6. Add a note
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