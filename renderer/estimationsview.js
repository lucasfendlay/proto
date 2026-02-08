document.addEventListener('DOMContentLoaded', async function () {
    const clientId = getQueryParameter('id');
    const modal = document.getElementById('shelter-modal');
    const modalTitle = document.getElementById('modal-title');
    const closeModal = document.getElementById('close-modal');
    let currentMemberId = null;

    function getQueryParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    function syncFlipCardHeights() {
        document.querySelectorAll('.snap-flip-card').forEach(card => {
            const inner = card.querySelector('.snap-flip-card-inner');
            const front = card.querySelector('.snap-flip-card-front');
            const back = card.querySelector('.snap-flip-card-back');
            if (!inner || !front || !back) return;
    
            const backPrevPosition = back.style.position;
            back.style.position = 'relative';
            back.style.transform = 'none';
            back.style.visibility = 'hidden';
    
            const frontHeight = front.scrollHeight;
            const backHeight = back.scrollHeight;
    
            back.style.position = backPrevPosition || '';
            back.style.transform = '';
            back.style.visibility = '';
    
            inner.style.height = Math.max(frontHeight, backHeight) + 'px';
        });
    }
    
    window.addEventListener('DOMContentLoaded', () => {
        const observer = new MutationObserver(() => {
            syncFlipCardHeights();
        });
    
        document.querySelectorAll('.snap-flip-card').forEach(card => {
            observer.observe(card, { childList: true, subtree: true, attributes: true });
        });
    
        document.addEventListener('toggle', () => {
            syncFlipCardHeights();
        }, true);
    
        setTimeout(syncFlipCardHeights, 300);
    });

    // Load household members
    async function loadHouseholdMembers() {
        const clientId = getQueryParameter('id');
        if (!clientId) {
            console.error('Client ID not found in query parameters.');
            return [];
        }

        try {
            const response = await fetch(`/get-client/${clientId}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch client data: ${response.statusText}`);
            }

            const clientData = await response.json();

            if (!clientData || !clientData.householdMembers) {
                console.error('No household members found for this client.');
                return [];
            }

            const normalized = ensureBenefitSchema(clientData.householdMembers);
            console.log('Household members:', normalized);
            return normalized;
        } catch (error) {
            console.error('Error loading household members:', error);
            return [];
        }
    }

    function ensureBenefitSchema(members) {
        const benefitKeys = ['PACE', 'LIS', 'MSP', 'PTRR', 'SNAP', 'LIHEAP'];
        members.forEach(member => {
            benefitKeys.forEach(key => {
                if (!member[key] || typeof member[key] !== 'object') {
                    member[key] = {};
                }
                if (!Array.isArray(member[key].eligibility)) {
                    member[key].eligibility = ['Not Checked'];
                }
                if (!Array.isArray(member[key].application)) {
                    member[key].application = [];
                }
            });
        });
        return members;
    }

    // Dimmed style constants for view-only mode
    const VIEW_OPACITY = '0.7';
    const VIEW_FILTER = 'saturate(0.6)';

    // ===== SINGLE displayHouseholdMembers =====
    async function displayHouseholdMembers() {
        const householdMemberContainer = document.getElementById('household-members-container');
        const members = await loadHouseholdMembers();

        householdMemberContainer.innerHTML = '';

        if (members.length === 0) {
            const noMembersMessage = document.createElement('p');
            noMembersMessage.textContent = 'No household members found.';
            householdMemberContainer.appendChild(noMembersMessage);
        } else {
            members.sort((a, b) => b.headOfHousehold - a.headOfHousehold);

            members.forEach(member => {
                const memberDiv = document.createElement('div');
                memberDiv.classList.add('household-member-box');
                memberDiv.style.opacity = VIEW_OPACITY;
                memberDiv.style.filter = VIEW_FILTER;

                const memberId = String(member.householdMemberId);
                const memberFullName = `${capitalizeFirstLetter(member.firstName)} ${capitalizeFirstLetter(member.lastName)}`;

                const isDeceased = (member.deceased ?? '').toLowerCase() === 'yes';

                const openBenefits = [];
                const individualBenefits = ['PACE', 'LIS', 'MSP', 'PTRR'];
                individualBenefits.forEach(benefit => {
                    if (benefit !== 'PTRR' && isDeceased) return;
                    const bObj = member[benefit];
                    if (!bObj) return;
                    if (bObj.screeningInProgress === false) return;
                    if (bObj.eligibility && bObj.eligibility.length > 0) openBenefits.push(benefit);
                });

                function benefitScreeningClosedBox(benefit) {
                    const benefitObj = member[benefit];
                    if (!benefitObj || benefitObj.screeningInProgress !== false) return '';
                    return `
                        <div style="background-color:rgb(212, 212, 212); border: 1px solid rgb(0, 0, 0); padding: 8px; border-radius: 4px; margin: 8px 0; text-align: center; width: 100%; box-sizing: border-box;">
                            <p style="margin: 0 0 6px 0;"><strong>${benefit} Screening Closed</strong></p>
                            <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${benefitObj.screeningCloseReason || 'N/A'}</p>
                        </div>
                    `;
                }

                function benefitOpenSection(benefit) {
                    const bObj = member[benefit];
                    if (!bObj) return '';

                    const isEligible = Array.isArray(bObj.eligibility)
                        ? !bObj.eligibility.some(item =>
                            item.toLowerCase().includes("not") ||
                            item.toLowerCase().includes("needs") ||
                            item.toLowerCase().includes("already") ||
                            item.toLowerCase().includes("age criteria") ||
                            item.toLowerCase().includes("enrolled in medicaid") ||
                            item.toLowerCase().includes("no formal lease") ||
                            item.toLowerCase().includes("residency")
                        )
                        : false;

                    if (benefit === 'PACE') {
                        const paceElig = bObj.eligibility?.map(capitalizeFirstLetter) || [];
                        const paceIsNot = paceElig.some(item => item.includes("NOT") || item.includes("ALREADY ENROLLED") || item.includes("NOT INTERESTED") || item.includes("AGE CRITERIA NOT MET") || item.includes("ENROLLED IN MEDICAID") || item.includes("RESIDENCY NOT MET"));
                        const paceNeedsInfo = paceElig.some(item => item.includes("NEEDS") || item.includes("DETERMINATION PENDING"));
                        const paceIsLikely = !paceIsNot && !paceNeedsInfo;
                        const paceBgColor = paceIsNot ? '#f8d7da' : paceNeedsInfo ? '#fff3cd' : paceIsLikely ? '#d4edda' : 'transparent';
                        const paceBorderColor = paceIsNot ? '#f5c6cb' : paceNeedsInfo ? '#ffc107' : paceIsLikely ? '#c3e6cb' : '#ccc';

                        return `
                            <div style="
                                width: 100%;
                                margin: 8px 0;
                            ">
                                <div style="
                                    background-color: ${paceBgColor};
                                    border: 1px solid ${paceBorderColor};
                                    border-radius: 4px;
                                    padding: 8px;
                                    width: 100%;
                                    box-sizing: border-box;
                                ">
                                    <details class="custom-details" style="background-color: ${paceBgColor}; border-radius: 4px; padding: 8px; width: 100%; box-sizing: border-box;">
                                        <summary><br><strong>PACE</strong><br> 
                                        <p><strong></strong> ${
                                            bObj.eligibility?.map(capitalizeFirstLetter).join(', ') || 'Not Available'
                                        }<br>

                                        <br>
                                        </summary></p>
                                        <hr class="separator-bar">
                                        <p><strong>Gross Adjusted Income:</strong> $${bObj.combinedIncome?.toFixed(2) || 'N/A'}</p>
                                    </details>
                                </div>
                            </div>
                        `;
                    }

                    if (benefit === 'LIS') {
                        if (bObj.eligibility?.includes('Not Checked')) return '';
                        const lisElig = bObj.eligibility?.map(capitalizeFirstLetter) || [];
                        const lisIsNot = lisElig.some(item => item.includes("NOT") || item.includes("ALREADY ENROLLED") || item.includes("NOT INTERESTED") || item.includes("NOT ENROLLED IN MEDICARE") || item.includes("ENROLLED IN MEDICAID"));
                        const lisNeedsInfo = lisElig.some(item => item.includes("NEEDS") || item.includes("DETERMINATION PENDING"));
                        const lisIsLikely = !lisIsNot && !lisNeedsInfo;
                        const lisBgColor = lisIsNot ? '#f8d7da' : lisNeedsInfo ? '#fff3cd' : lisIsLikely ? '#d4edda' : 'transparent';
                        const lisBorderColor = lisIsNot ? '#f5c6cb' : lisNeedsInfo ? '#ffc107' : lisIsLikely ? '#c3e6cb' : '#ccc';

                        return `
                            <div style="
                                width: 100%;
                                margin: 8px 0;
                            ">
                                <div style="
                                    background-color: ${lisBgColor};
                                    border: 1px solid ${lisBorderColor};
                                    border-radius: 4px;
                                    padding: 8px;
                                    width: 100%;
                                    box-sizing: border-box;
                                ">
                                    <details class="custom-details" style="background-color: ${lisBgColor}; border-radius: 4px; padding: 8px; width: 100%; box-sizing: border-box;">
                                        <summary><br><strong>LIS</strong><br>
                                        <p><strong></strong> ${
                                            bObj.eligibility?.map(capitalizeFirstLetter).join(', ') || 'Not Available'
                                        }<br>
                                        <br>
                                        </summary></p>
                                        <hr class="separator-bar">
                                        <p><strong>Gross Income:</strong> $${bObj.combinedIncome?.toFixed(2) || 'N/A'}</p>
                                        <p><strong>Combined Assets:</strong> $${bObj.combinedAssets?.toFixed(2) || 'N/A'}</p>
                                    </details>
                                </div>
                            </div>
                        `;
                    }

                    if (benefit === 'MSP') {
                        if (bObj.eligibility?.includes('Not Checked')) return '';
                        const mspElig = bObj.eligibility?.map(capitalizeFirstLetter) || [];
                        const mspIsNot = mspElig.some(item => item.includes("NOT") || item.includes("ALREADY ENROLLED") || item.includes("NOT INTERESTED") || item.includes("NOT ENROLLED IN MEDICARE") || item.includes("ENROLLED IN MEDICAID"));
                        const mspNeedsInfo = mspElig.some(item => item.includes("NEEDS") || item.includes("DETERMINATION PENDING"));
                        const mspIsLikely = !mspIsNot && !mspNeedsInfo;
                        const mspBgColor = mspIsNot ? '#f8d7da' : mspNeedsInfo ? '#fff3cd' : mspIsLikely ? '#d4edda' : 'transparent';
                        const mspBorderColor = mspIsNot ? '#f5c6cb' : mspNeedsInfo ? '#ffc107' : mspIsLikely ? '#c3e6cb' : '#ccc';

                        return `
                            <div style="
                                width: 100%;
                                margin: 8px 0;
                            ">
                                <div style="
                                    background-color: ${mspBgColor};
                                    border: 1px solid ${mspBorderColor};
                                    border-radius: 4px;
                                    padding: 8px;
                                    width: 100%;
                                    box-sizing: border-box;
                                ">
                                    <details class="custom-details" style="background-color: ${mspBgColor}; border-radius: 4px; padding: 8px; width: 100%; box-sizing: border-box;">
                                        <summary><br><strong>MSP</strong>
                                        <p><strong></strong> ${
                                            bObj.eligibility?.map(capitalizeFirstLetter).join(', ') || 'Not Available'
                                        }<br>
                                        <br>
                                        </summary></p>
                                        <hr class="separator-bar">
                                        <p><strong>Gross Adjusted Income:</strong> $${bObj.combinedIncome?.toFixed(2) || 'N/A'}</p>
                                        <p><strong>Combined Assets:</strong> $${bObj.combinedAssets?.toFixed(2) || 'N/A'}</p>
                                    </details>
                                </div>
                            </div>
                        `;
                    }

                    if (benefit === 'PTRR') {
                        if (bObj.eligibility?.includes('Not Checked')) return '';
                        const ptrrElig = bObj.eligibility?.map(capitalizeFirstLetter) || [];
                        const ptrrIsNot = ptrrElig.some(item => item.includes("NOT") || item.includes("ALREADY APPLIED") || item.includes("NOT INTERESTED") || item.includes("NO FORMAL LEASE") || item.includes("AGE") || item.includes("CRITERIA NOT MET"));
                        const ptrrNeedsInfo = ptrrElig.some(item => item.includes("NEEDS") || item.includes("DETERMINATION PENDING"));
                        const ptrrIsLikely = !ptrrIsNot && !ptrrNeedsInfo;
                        const ptrrBgColor = ptrrIsNot ? '#f8d7da' : ptrrNeedsInfo ? '#fff3cd' : ptrrIsLikely ? '#d4edda' : 'transparent';
                        const ptrrBorderColor = ptrrIsNot ? '#f5c6cb' : ptrrNeedsInfo ? '#ffc107' : ptrrIsLikely ? '#c3e6cb' : '#ccc';

                        return `
                            <div style="
                                width: 100%;
                                margin: 8px 0;
                            ">
                                <div style="
                                    background-color: ${ptrrBgColor};
                                    border: 1px solid ${ptrrBorderColor};
                                    border-radius: 4px;
                                    padding: 8px;
                                    width: 100%;
                                    box-sizing: border-box;
                                ">
                                    <details class="custom-details" style="background-color: ${ptrrBgColor}; border-radius: 4px; padding: 8px; width: 100%; box-sizing: border-box;">
                                        <summary><br><strong>PTRR</strong>
                                        <p><strong></strong> ${
                                            bObj.eligibility?.map(capitalizeFirstLetter).join(', ') || 'Not Available'
                                        }<br>
                                        <br>
                                        </summary></p>
                                        <hr class="separator-bar">
                                        <p><strong>Gross Income:</strong> $${bObj.combinedIncome?.toFixed(2) || 'N/A'}</p>
                                    </details>
                                </div>
                            </div>
                        `;
                    }

                    return '';
                }

                // Build benefit sections dynamically and sort open first, closed last
                const benefitSections = [];

                if (!isDeceased) {
                    if (member.PACE?.screeningInProgress === false) {
                        benefitSections.push({ closed: true, html: benefitScreeningClosedBox('PACE') });
                    } else {
                        const html = benefitOpenSection('PACE');
                        if (html) benefitSections.push({ closed: false, html });
                    }
                }

                if (!isDeceased) {
                    if (member.LIS?.screeningInProgress === false) {
                        benefitSections.push({ closed: true, html: benefitScreeningClosedBox('LIS') });
                    } else {
                        const html = benefitOpenSection('LIS');
                        if (html) benefitSections.push({ closed: false, html });
                    }
                }

                if (!isDeceased) {
                    if (member.MSP?.screeningInProgress === false) {
                        benefitSections.push({ closed: true, html: benefitScreeningClosedBox('MSP') });
                    } else {
                        const html = benefitOpenSection('MSP');
                        if (html) benefitSections.push({ closed: false, html });
                    }
                }

                if (member.headOfHousehold) {
                    if (member.PTRR?.screeningInProgress === false) {
                        benefitSections.push({ closed: true, html: benefitScreeningClosedBox('PTRR') });
                    } else {
                        const html = benefitOpenSection('PTRR');
                        if (html) benefitSections.push({ closed: false, html });
                    }
                }

                benefitSections.sort((a, b) => a.closed - b.closed);

                memberDiv.innerHTML = `
                <div class="member-badge-area" style="min-height: 40px; display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap;">
                    ${member.headOfHousehold ? `<p class="household-member-info" style="color: black; border: 2px solid black; padding: 5px; display: inline-block; margin: 0;"><strong>Head of Household</strong></p>` : ''}
                    ${isDeceased ? `<p class="household-member-info" style="color: black; border: 2px solid black; padding: 5px; display: inline-block; margin: 0;"><strong>Deceased</strong></p>` : ''}
                </div>
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
                <br>
                ${benefitSections.map(s => s.html).join('')}
            `;
            householdMemberContainer.appendChild(memberDiv);
            });
        }
    }

    // ===== SNAP Households Display =====
    async function displaySNAPHouseholds() {
        const snapHouseholdContainer = document.getElementById('snap-household-container');
        if (!snapHouseholdContainer) {
            console.error('snap-household-container element not found in the DOM.');
            return;
        }

        const members = await loadHouseholdMembers();
        snapHouseholdContainer.innerHTML = '';

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
            noHouseholdsDiv.style.opacity = VIEW_OPACITY;
            noHouseholdsDiv.style.filter = VIEW_FILTER;

            const clientResponse = await fetch(`/get-client/${clientId}`).then(r => r.json()).catch(() => null);
            const isAlreadyEnrolled = clientResponse?.snap === 'yes';
            const isNotInterested = clientResponse?.snap === 'notinterested';

            if (isAlreadyEnrolled || isNotInterested) {
                noHouseholdsDiv.style.backgroundColor = '#f8d7da';
                noHouseholdsDiv.style.borderColor = '#f5c6cb';
            } else {
                noHouseholdsDiv.style.backgroundColor = '#fff3cd';
                noHouseholdsDiv.style.borderColor = '#ffc107';
            }

            noHouseholdsDiv.innerHTML = `
                <h3>SNAP HOUSEHOLD</h3>
                ${isAlreadyEnrolled ? '<p>ALREADY ENROLLED</p>' : isNotInterested ? '<p>NOT INTERESTED</p>' : '<p>NO SNAP HOUSEHOLDS FOUND.</p>'}
            `;
            snapHouseholdContainer.appendChild(noHouseholdsDiv);
            return;
        }

        snapHouseholds.forEach(household => {
            const householdDiv = document.createElement('div');
            householdDiv.classList.add('household-member-box');
            householdDiv.style.opacity = VIEW_OPACITY;
            householdDiv.style.filter = VIEW_FILTER;

            const snapMemberNames = household.map(m => `${capitalizeFirstLetter(m.firstName)} ${capitalizeFirstLetter(m.lastName)}`).join(', ');

            const isSnapScreeningClosed = household[0]?.SNAP?.screeningInProgress === false;
            const snapCloseReason = household[0]?.SNAP?.screeningCloseReason || 'N/A';

            if (isSnapScreeningClosed) {
                householdDiv.innerHTML = `
                    <h3>SNAP HOUSEHOLD</h3>
                    <p><strong>Members:</strong> ${snapMemberNames}</p>
                    <div style="background-color:rgb(212, 212, 212); border: 1px solid rgb(0, 0, 0); padding: 8px; border-radius: 4px; margin: 8px 0; text-align: center; width: 100%; box-sizing: border-box;">
                        <p style="margin: 0 0 6px 0;"><strong>SNAP Screening Closed</strong></p>
                        <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${snapCloseReason}</p>
                    </div>
                `;
                snapHouseholdContainer.appendChild(householdDiv);
                return;
            }

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
                ? !eligibility.some(item => 
                    item.toLowerCase().includes("not") || 
                    item.toLowerCase().includes("needs") || 
                    item.toLowerCase().includes("already")
                )
                : !String(eligibility).toLowerCase().includes("not") &&
                  !String(eligibility).toLowerCase().includes("needs") &&
                  !String(eligibility).toLowerCase().includes("already");

            const snapIsNot = Array.isArray(eligibility)
                ? eligibility.some(item => item.includes("NOT") || item.includes("ALREADY ENROLLED") || item.includes("NOT INTERESTED"))
                : String(eligibility).includes("NOT") || String(eligibility).includes("ALREADY ENROLLED") || String(eligibility).includes("NOT INTERESTED");

            const snapNeedsInfo = Array.isArray(eligibility)
                ? eligibility.some(item => item.includes("NEEDS") || item.includes("DETERMINATION PENDING"))
                : String(eligibility).includes("NEEDS") || String(eligibility).includes("DETERMINATION PENDING");

            const snapIsLikelyGreen = !snapIsNot && !snapNeedsInfo;

            if (snapIsNot) {
                householdDiv.style.backgroundColor = '#f8d7da';
                householdDiv.style.borderColor = '#f5c6cb';
            } else if (snapNeedsInfo) {
                householdDiv.style.backgroundColor = '#fff3cd';
                householdDiv.style.borderColor = '#ffc107';
            } else if (snapIsLikelyGreen) {
                householdDiv.style.backgroundColor = '#d4edda';
                householdDiv.style.borderColor = '#c3e6cb';
            }

            householdDiv.innerHTML = `
                <details class="custom-details" style="background-color: inherit; border-radius: 4px; padding: 8px; margin: 8px 0; width: 100%; box-sizing: border-box;">
                    <summary><br><strong>SNAP HOUSEHOLD</strong><br>
                    <p><strong>Members:</strong> ${snapMemberNames}</p>
                    <p><strong>Eligibility:</strong> ${Array.isArray(eligibility) ? eligibility.join(', ') : eligibility}</p>
                    ${
                        isLikelyEligible && benefitAmount >= 0
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
                    </summary>
                    <hr class="separator-bar">
                    <p><strong>Household Size:</strong> ${household[0]?.SNAP?.householdSize || household.length}</p>
                    <p><strong>Total Gross Income:</strong> $${combinedMonthlyIncome.toFixed(2)}</p>
                    <p><strong>Standard Deduction:</strong> $${(household[0]?.SNAP?.standardDeduction || 0).toFixed(2)}</p>
                    <p><strong>Shelter Deduction:</strong> $${excessShelterCost.toFixed(2)}</p>
                    <p><strong>Utility Allowance:</strong> $${totalUtilityAllowance.toFixed(2)}</p>
                    <p><strong>Medical Expense Deductions:</strong> $${totalMedicalExpenses.toFixed(2)}</p>
                    <p><strong>Other Expense Deductions:</strong> $${totalOtherExpenses.toFixed(2)}</p>
                    <p><strong>Adjusted Net Income:</strong> $${totalNetIncome.toFixed(2)}</p>
                    <p><strong>Combined Assets:</strong> $${combinedAssets.toFixed(2)}</p>
                </details>
            `;

            snapHouseholdContainer.appendChild(householdDiv);
        });
    }   

    // ===== LIHEAP Households Display =====
    async function displayLIHEAPHouseholds() {
        const liheapHouseholdContainer = document.getElementById('liheap-household-container');
        if (!liheapHouseholdContainer) {
            console.error('liheap-household-container element not found in the DOM.');
            return;
        }

        const members = await loadHouseholdMembers();
        liheapHouseholdContainer.innerHTML = '';

        const activeMembersForLIHEAP = members.filter(
            m => (m.deceased ?? '').toLowerCase() !== 'yes'
        );

        const clientId = getQueryParameter('id');
        const clientResponse = await fetch(`/get-client/${clientId}`)
            .then(response => response.json())
            .catch(error => {
                console.error('Error fetching client data:', error);
                return null;
            });

        if (clientResponse && clientResponse.liheapEnrollment === 'notinterested') {
            const notInterestedDiv = document.createElement('div');
            notInterestedDiv.classList.add('household-member-box');
            notInterestedDiv.style.backgroundColor = '#f8d7da';
            notInterestedDiv.style.borderColor = '#f5c6cb';
            notInterestedDiv.style.opacity = VIEW_OPACITY;
            notInterestedDiv.style.filter = VIEW_FILTER;
            notInterestedDiv.innerHTML = '<h3>LIHEAP HOUSEHOLD</h3><p>NOT INTERESTED</p>';
            liheapHouseholdContainer.appendChild(notInterestedDiv);
            return;
        }
    
        if (activeMembersForLIHEAP.length === 0) {
            const noHouseholdsDiv = document.createElement('div');
            noHouseholdsDiv.classList.add('household-member-box');
            noHouseholdsDiv.style.backgroundColor = '#fff3cd';
            noHouseholdsDiv.style.borderColor = '#ffc107';
            noHouseholdsDiv.style.opacity = VIEW_OPACITY;
            noHouseholdsDiv.style.filter = VIEW_FILTER;
            noHouseholdsDiv.innerHTML = '<h3>LIHEAP HOUSEHOLD</h3><p>NO LIHEAP HOUSEHOLDS FOUND.</p>';
            liheapHouseholdContainer.appendChild(noHouseholdsDiv);
            return;
        }

        const liheapMemberNames = activeMembersForLIHEAP.map(m => `${capitalizeFirstLetter(m.firstName)} ${capitalizeFirstLetter(m.lastName)}`).join(', ');

        const isLiheapScreeningClosed = activeMembersForLIHEAP[0]?.LIHEAP?.screeningInProgress === false;
        const liheapCloseReason = activeMembersForLIHEAP[0]?.LIHEAP?.screeningCloseReason || 'N/A';

        if (isLiheapScreeningClosed) {
            const householdDiv = document.createElement('div');
            householdDiv.classList.add('household-member-box');
            householdDiv.style.opacity = VIEW_OPACITY;
            householdDiv.style.filter = VIEW_FILTER;
            householdDiv.innerHTML = `
                <h3>LIHEAP HOUSEHOLD</h3>
                <p><strong>Members:</strong> ${liheapMemberNames}</p>
                <div style="background-color:rgb(212, 212, 212); border: 1px solid rgb(0, 0, 0); padding: 8px; border-radius: 4px; margin: 8px 0; text-align: center; width: 100%; box-sizing: border-box;">
                    <p style="margin: 0 0 6px 0;"><strong>LIHEAP Screening Closed</strong></p>
                    <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${liheapCloseReason}</p>
                </div>
            `;
            liheapHouseholdContainer.appendChild(householdDiv);
            return;
        }

        const combinedYearlyIncome = activeMembersForLIHEAP[0]?.LIHEAP?.combinedYearlyIncome || 0;
        const eligibility = activeMembersForLIHEAP[0]?.LIHEAP?.eligibility?.map(capitalizeFirstLetter) || 'Not Available';

        const householdDiv = document.createElement('div');
        householdDiv.classList.add('household-member-box');
        householdDiv.style.opacity = VIEW_OPACITY;
        householdDiv.style.filter = VIEW_FILTER;

        const liheapIsNotEligible = Array.isArray(eligibility)
            ? eligibility.some(item => item.includes("NOT") || item.includes("ALREADY ENROLLED") || item.includes("NOT INTERESTED")) && !eligibility.some(item => item.includes("RECOMMENDED"))
            : (String(eligibility).includes("NOT") || String(eligibility).includes("ALREADY ENROLLED") || String(eligibility).includes("NOT INTERESTED")) && !String(eligibility).includes("RECOMMENDED");

        const liheapNeedsInfo = Array.isArray(eligibility)
            ? eligibility.some(item => item.includes("NEEDS"))
            : String(eligibility).includes("NEEDS");

        const liheapIsLikely = Array.isArray(eligibility)
            ? !eligibility.some(item => item.includes("NOT") || item.includes("ALREADY ENROLLED") || item.includes("NOT INTERESTED")) || eligibility.some(item => item.includes("RECOMMENDED"))
            : !String(eligibility).includes("NOT") && !String(eligibility).includes("ALREADY ENROLLED") && !String(eligibility).includes("NOT INTERESTED") || String(eligibility).includes("RECOMMENDED");

        if (liheapIsNotEligible) {
            householdDiv.style.backgroundColor = '#f8d7da';
            householdDiv.style.borderColor = '#f5c6cb';
        } else if (liheapNeedsInfo) {
            householdDiv.style.backgroundColor = '#fff3cd';
            householdDiv.style.borderColor = '#ffc107';
        } else if (liheapIsLikely) {
            householdDiv.style.backgroundColor = '#d4edda';
            householdDiv.style.borderColor = '#c3e6cb';
        }

        householdDiv.innerHTML = `
            <details class="custom-details" style="background-color: inherit; border-radius: 4px; padding: 8px; margin: 8px 0; width: 100%; box-sizing: border-box;">
                <summary><br><strong>LIHEAP HOUSEHOLD</strong><br>
                <p><strong>Members:</strong> ${liheapMemberNames}</p>
                <p><strong>Eligibility:</strong> ${Array.isArray(eligibility) ? eligibility.join(', ') : eligibility}</p>
                </summary>
                <hr class="separator-bar">
                <p><strong>Combined Yearly Income:</strong> $${combinedYearlyIncome.toFixed(2)}</p>
            </details>
        `;

        liheapHouseholdContainer.appendChild(householdDiv);
    }

    function capitalizeFirstLetter(string) {
        if (!string) return '';
        return string.toUpperCase();
    }

    // Initialize displays (view-only, no eligibility recalculation or saves)
    await displayHouseholdMembers();
    await displaySNAPHouseholds();
    await displayLIHEAPHouseholds();
});