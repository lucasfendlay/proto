document.addEventListener('DOMContentLoaded', async function () {
    const clientId = getQueryParameter('id'); // Get the client ID from the query parameter
    const modal = document.getElementById('shelter-modal'); // Modal element
    const modalTitle = document.getElementById('modal-title'); // Modal title element
    const closeModal = document.getElementById('close-modal'); // Close button
    let currentMemberId = null;

    // Helper function to get query parameters
function getQueryParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Define the redirectToEstimationsView function and attach it to the global window object
window.redirectToEstimationsView = async function () {
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
        // Add a note about the action
        const note = {
            text: noteContent,
            timestamp: timestamp,
            username: activeUser
        };

        await window.electron.ipcRenderer.invoke('add-note-to-client', { clientId, note });

        // Update screening status in the database
        await window.electron.ipcRenderer.invoke('update-client', {
            clientId,
            clientData: { screeningInProgress: false }
        });

        // Redirect to estimations view
        window.location.href = `estimationsview.html?id=${clientId}`;
    } catch (error) {
        console.error("Error during redirectToEstimationsView:", error);
    }
};
    
    // Load household members
    async function loadHouseholdMembers() {
        try {
            const client = await window.electron.ipcRenderer.invoke('get-client', clientId);
            if (!client || !client.householdMembers) {
                console.error('No household members found for this client.');
                return [];
            }

            console.log('Household members:', client.householdMembers);
            return client.householdMembers;
        } catch (error) {
            console.error('Error loading household members:', error);
            return [];
        }
    }

    async function displayHouseholdMembers() {
        const householdMemberContainer = document.getElementById('household-members-container');
        const members = await loadHouseholdMembers();
    
        householdMemberContainer.innerHTML = ''; // Clear existing content
    
        if (members.length === 0) {
            const noMembersMessage = document.createElement('p');
            noMembersMessage.textContent = 'No household members found.';
            householdMemberContainer.appendChild(noMembersMessage);
        } else {
            members.forEach(member => {
                const memberDiv = document.createElement('div');
                memberDiv.classList.add('household-member-box'); // Add a class for styling
    
                // Populate member details
                memberDiv.innerHTML = `
                    <h3>${member.firstName} ${member.middleInitial || ''} ${member.lastName}</h3>
                    <p><strong>Age:</strong> ${member.age?.split('Y')[0] || 'N/A'}</p>
                    <p><strong>Marital Status:</strong> ${member.maritalStatus || 'N/A'}</p>
                    ${
                        member.relationships?.some(r => r.relationship === 'spouse')
                            ? `<p><strong>Spouse:</strong> ${
                                  members.find(m => m.householdMemberId === member.relationships.find(r => r.relationship === 'spouse')?.relatedMemberId)?.firstName || 'N/A'
                              } ${
                                  members.find(m => m.householdMemberId === member.relationships.find(r => r.relationship === 'spouse')?.relatedMemberId)?.lastName || ''
                              }</p>`
                            : ''
                    }${
                        member.PACE?.eligibility?.includes('Not Checked')
            ? '' // Omit the field if eligibility is "Not Checked"
            : `
                        <details class="custom-details">
                <summary><br><strong>PACE</strong><br>
                <p><strong></strong> ${
                    member.PACE?.eligibility?.join(', ') || 'Not Available'
                }</summary></p>
                  <hr class="separator-bar">

                <p><strong>Gross Adjusted Income:</strong> $${member.PACE?.combinedIncome?.toFixed(2) || 'N/A'}</p>
            </details>
            `                 }
                ${
                    member.LIS?.eligibility?.includes('Not Checked')
            ? '' // Omit the field if LIS eligibility is "Not Checked"
            : `
            <details class="custom-details">
                <summary><br><strong>LIS</strong><br>
                <p><strong></strong> ${
                    member.LIS?.eligibility?.join(', ') || 'Not Available'
                }</summary></p>
                <hr class="separator-bar">

                <p><strong>Gross Income:</strong> $${member.LIS?.combinedIncome?.toFixed(2) || 'N/A'}</p>
                <p><strong>Combined Assets:</strong> $${member.LIS?.combinedAssets?.toFixed(2) || 'N/A'}</p>
            </details>
            `
    }
    ${
        member.MSP?.eligibility?.includes('Not Checked')
            ? '' // Omit the field if MSP eligibility is "Not Checked"
            : `
            <details class="custom-details">
                <summary><br><strong>MSP</strong>
                <p><strong></strong> ${
                    member.MSP?.eligibility?.join(', ') || 'Not Available'
                }</summary></p>
                                <hr class="separator-bar">

                <p><strong>Gross Adjusted Income:</strong> $${member.MSP?.combinedIncome?.toFixed(2) || 'N/A'}</p>
                <p><strong>Combined Assets:</strong> $${member.MSP?.combinedAssets?.toFixed(2) || 'N/A'}</p>
            </details>
            `
    }
    ${
        member.PTRR?.eligibility?.includes('Not Checked')
            ? '' // Omit the field if PTRR eligibility is "Not Checked"
            : `
            <details class="custom-details">
                <summary><br><strong>PTRR Eligibility</strong>
                <p><strong></strong> ${
                    member.PTRR?.eligibility?.join(', ') || 'Not Available'
                }</summary></p>
                                                <hr class="separator-bar">

                <p><strong>Gross Income:</strong> $${member.PTRR?.combinedIncome?.toFixed(2) || 'N/A'}</p>
            </details>
            `
    }
            `;
                householdMemberContainer.appendChild(memberDiv);
            });
        }
    }

    async function displaySNAPHouseholds() {
        const snapHouseholdContainer = document.getElementById('snap-household-container');
        if (!snapHouseholdContainer) {
            console.error('snap-household-container element not found in the DOM.');
            return;
        }
    
        const members = await loadHouseholdMembers();
        snapHouseholdContainer.innerHTML = ''; // Clear existing content
    
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
            const noHouseholdsMessage = document.createElement('p');
            noHouseholdsMessage.textContent = 'No SNAP households found.';
            snapHouseholdContainer.appendChild(noHouseholdsMessage);
        } else {
            snapHouseholds.forEach(household => {
                const householdDiv = document.createElement('div');
                householdDiv.classList.add('household-member-box'); // Apply the same class for styling
                
                // Use the uniform values from the first member of the household
                const combinedMonthlyIncome = household[0]?.SNAP?.combinedMonthlyIncome || 0; // Uniform value
                const totalNetIncome = household[0]?.SNAP?.totalNetIncome || 0; // Uniform value
                const excessShelterCost = household[0]?.SNAP?.excessShelterCost || 0; // Uniform value
                const totalUtilityAllowance = household[0]?.SNAP?.totalUtilityAllowance || 0; // Uniform value
                const totalMedicalExpenses = household[0]?.SNAP?.totalMedicalExpenses || 0; // Uniform value
                const totalOtherExpenses = household[0]?.SNAP?.totalOtherExpenses || 0; // Uniform value
                const eligibility = household[0]?.SNAP?.eligibility || 'Not Available';
                const benefitAmount = household[0]?.SNAP?.benefitAmount || 0;
                const combinedAssets = household[0]?.SNAP?.combinedAssets || 0; // Uniform value
    
                // Check if eligibility includes the word "Not"
                const isNotLikelyEligible = Array.isArray(eligibility)
                    ? eligibility.some(e => e.includes('Not'))
                    : eligibility.includes('Not');
                
                // Populate household details
                householdDiv.innerHTML = `
<details class="custom-details">
  <summary><h3>SNAP Household</h3></summary>
  <p><strong>Total Gross Income:</strong> $${combinedMonthlyIncome.toFixed(2)}</p>
  <p><strong>Shelter Deduction:</strong> $${excessShelterCost.toFixed(2)}</p>
  <p><strong>Medical Expense Deductions:</strong> $${totalMedicalExpenses.toFixed(2)}</p>
  <p><strong>Other Expense Deductions:</strong> $${totalOtherExpenses.toFixed(2)}</p>
  <p><strong>Adjusted Net Income:</strong> $${totalNetIncome.toFixed(2)}</p>
  <p><strong>Combined Assets:</strong> $${combinedAssets.toFixed(2)}</p>
  <hr class="separator-bar">
</details>
  <p><strong>Members:</strong> ${household.map(member => `${member.firstName} ${member.lastName}`).join(', ')}</p>

                    <p><strong>Eligibility:</strong> ${Array.isArray(eligibility) ? eligibility.join(', ') : eligibility}</p>
                    ${
                        !isNotLikelyEligible
                            ? `
                            <p><strong>Estimated Benefit Amount:</strong> ${
                                benefitAmount < 23 ? "Up to $23.00" : `Up to $23.00 - $${benefitAmount.toFixed(2)}`
                            }</p>
                            <p><strong>Expedited Eligibility:</strong> ${
                                household[0]?.SNAP?.expeditedEligibility || 'Not Available'
                            }</p>
                            `
                            : ''
                    }
                `;
            
                snapHouseholdContainer.appendChild(householdDiv);
            });
        }
    }

// After PACEEligibilityCheck, reload and display updated household members
async function updateAndDisplayHouseholdMembers() {
    const clientId = getQueryParameter('id'); // Get the client ID from the query parameter
    const updatedMembers = await window.electron.ipcRenderer.invoke('get-client', clientId);

    if (updatedMembers && updatedMembers.householdMembers) {
        console.log('Updated household members:', updatedMembers.householdMembers);
        displayHouseholdMembers(); // Refresh the UI with updated data
    } else {
        console.error('Failed to retrieve updated household members.');
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
            const spouse = members.find(m => {
                return (
                    m.householdMemberId === member.relationships?.find(r => r.relationship === 'spouse')?.relatedMemberId &&
                    member.relationships?.find(r => r.relatedMemberId === m.householdMemberId)?.relationship === 'spouse'
                );
            });

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
    member.selections["Is this person currently enrolled in PACE?"] = "agecriterianotmet";
} else {
    // Check PACE and Medicaid enrollment
    const paceEnrollment = member.selections?.["Is this person currently enrolled in PACE?"]?.toLowerCase();
    const medicaidEnrollment = member.medicaid?.toLowerCase();

    if (medicaidEnrollment === "yes") {
        eligibility.push("Enrolled in Medicaid");
        member.selections = member.selections || {};
        member.selections["Is this person currently enrolled in PACE?"] = "onmedicaid"; // Set paceEnrollment to "onmedicaid"
    } else if (paceEnrollment === "yes") {
        eligibility.push("Already Enrolled");
    } else if (paceEnrollment === "notinterested") {
    eligibility.push("Not Interested");
} else if (!paceEnrollment || paceEnrollment.toLowerCase().trim() === "onmedicaid" || paceEnrollment.toLowerCase().trim() === "n/a" || paceEnrollment.toLowerCase().trim()
     === "not interested" || paceEnrollment.toLowerCase().trim() === "agecriterianotmet") {
    eligibility.push("Needs Current Enrollment Status");
    } else {
        // Income-based eligibility checks
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

// Save eligibility to the PACE object
member.PACE = {
    combinedIncome: Math.max(0, member.combinedIncome),    eligibility: eligibility
};

console.log(`PACE object for ${member.firstName} ${member.lastName}:`, member.PACE);
            } catch (error) {
                console.error(`Error processing member ${member.firstName} ${member.lastName}:`, error);
            }
        }
    
        // Save the updated members array using IPC
        const clientId = getQueryParameter('id'); // Get the client ID from the query parameter
        await window.electron.ipcRenderer.invoke('save-household-members', { clientId, householdMembers: members });
    }

    async function PTRREligibilityCheck(members) {
        for (const member of members) {
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
    
                        const activeDays = Math.min((activeEnd - activeStart) / (1000 * 60 * 60 * 24) + 1, 365);
                        const proratedMultiplier = activeDays / 365; // Prorate for the active days in the year
                        return sum + yearlyAmount * proratedMultiplier;
                    }
    
                    return sum;
                }, 0);
    
                // Combine incomes with spouse if applicable
                const spouse = members.find(m => {
                    return (
                        m.householdMemberId === member.relationships?.find(r => r.relationship === 'spouse')?.relatedMemberId &&
                        member.relationships?.find(r => r.relatedMemberId === m.householdMemberId)?.relationship === 'spouse'
                    );
                });
    
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
                }
    
                console.log(`Total gross income for ${member.firstName} ${member.lastName}: $${totalGrossIncome}`);
    
                // Step 2: Determine PTRR eligibility
                const eligibility = [];
    
                const applicationStatus = member.selections?.["Has this person already applied for PTRR this year?"]?.toLowerCase();
                const dob = new Date(member.dob);
                const today = new Date();
                let age = today.getFullYear() - dob.getFullYear();
                const isDisabled = member.disability?.toLowerCase() === "yes";
                const isWidowed = member.previousmaritalStatus?.toLowerCase() === "widowed";
    
                if (
                    today.getMonth() < dob.getMonth() ||
                    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())
                ) {
                    age--;
                }
    
                if (member.residenceStatus?.toLowerCase() === "other") {
                    eligibility.push("No Formal Lease");
                    delete member.selections?.["Has this person already applied for PTRR this year?"];
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
                    const relevantExpenses = (member.expenses || []).filter(expense =>
                        (expense.kind?.trim() === "Property Taxes" || expense.kind?.trim() === "Rent") &&
                        expense.type?.trim() === "Previous Year"
                    );
    
                    if (applicationStatus.toLowerCase().trim() === "no" && relevantExpenses.length === 0) {
                        eligibility.push("Not Likely Eligible for PTRR (No Relevant Expenses)");
                    } else {
                        eligibility.push("Likely Eligible for PTRR");
                    }
                }
    
                member.PTRR = {
                    combinedIncome: totalGrossIncome,
                    eligibility: eligibility
                };
    
                console.log(`PTRR object for ${member.firstName} ${member.lastName}:`, member.PTRR);
            } catch (error) {
                console.error(`Error processing member ${member.firstName} ${member.lastName}:`, error);
            }
        }
    
        // Save the updated members array using IPC
        const clientId = getQueryParameter('id');
        await window.electron.ipcRenderer.invoke('save-household-members', { clientId, householdMembers: members });
    }

    async function LISEligibilityCheck(members) {
        for (const member of members) {
            try {
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
                        eligibility: ["Not Enrolled in Medicare"]
                    };
                    member.selections = member.selections || {};
                    member.selections["Is this person currently enrolled in LIS/ Extra Help?"] = "notenrolledinmedicare";
                    continue;
                } else if (medicaidEnrollment === "yes") {
                    console.log(`${member.firstName} ${member.lastName} is enrolled in Medicaid. Marking as 'Enrolled in Medicaid'.`);
                    member.LIS = {
                        combinedIncome: 0,
                        combinedAssets: 0,
                        eligibility: ["Enrolled in Medicaid"]
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
                        eligibility: ["Already Enrolled"]
                    };
                    continue;
                } else if (lisEnrollment === "notinterested") {
                    console.log(`${member.firstName} ${member.lastName} is not interested. Marking as 'Not Checked'.`);
                    member.LIS = {
                        combinedIncome: 0,
                        combinedAssets: 0,
                        eligibility: ["Not Interested"]
                    };
                    continue;
                } else if (!lisEnrollment || lisEnrollment.toLowerCase().trim() === "notenrolledinmedicare" ||lisEnrollment.toLowerCase().trim() === "onmedicaid" ||lisEnrollment.toLowerCase().trim() === "n/a" || lisEnrollment.toLowerCase().trim() === "not interested") {
                    console.log(`${member.firstName} ${member.lastName} has LIS status as N/A. Marking as 'Needs Current Enrollment Status'.`);
                    member.LIS = {
                        combinedIncome: 0,
                        combinedAssets: 0,
                        eligibility: ["Needs Current Enrollment Status"]
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
    } else if (combinedAssets > 35130) {
        lisEligibility = ["Not Likely Eligible for LIS (Assets)"];
    } else {
        lisEligibility = ["Likely Eligible for LIS"];
    }
} else {
    if (combinedIncome > 23475) {
        lisEligibility = ["Not Likely Eligible for LIS (Income)"];
    } else if (combinedAssets > 17600) {
        lisEligibility = ["Not Likely Eligible for LIS (Assets)"];
    } else {
        lisEligibility = ["Likely Eligible for LIS"];
    }
}
    
                // Step 5: Assign LIS object to member and spouse (if applicable)
                const lisObject = {
                    combinedIncome: combinedIncome,
                    combinedAssets: combinedAssets,
                    eligibility: lisEligibility
                };
    
                member.LIS = lisObject;
                if (spouse) {
                    spouse.LIS = lisObject;
                    console.log(`LIS object for ${member.firstName} ${member.lastName} and spouse ${spouse.firstName} ${spouse.lastName} assigned.`);
                    continue; // Skip further processing for the spouse
                }
    
                console.log(`LIS object for ${member.firstName} ${member.lastName}:`, member.LIS);
            } catch (error) {
                console.error(`Error processing member ${member.firstName} ${member.lastName}:`, error);
            }
        }
    
        // Save the updated members array using IPC
        const clientId = getQueryParameter('id');
        await window.electron.ipcRenderer.invoke('save-household-members', { clientId, householdMembers: members });
    }

    async function MSPEligibilityCheck(members) {
        for (const member of members) {
            try {
                // Step 1: Check age and enrollment status
                const dob = new Date(member.dob);
                const ageDifMs = Date.now() - dob.getTime();
                const ageDate = new Date(ageDifMs);
                const age = Math.abs(ageDate.getUTCFullYear() - 1970);
                const medicareEnrollment = member.medicare?.toLowerCase();
                const medicaidEnrollment = member.medicaid?.toLowerCase();
                if (medicareEnrollment === "no") {
                    console.log(`${member.firstName} ${member.lastName} is not enrolled in Medicare. Marking as 'Not Enrolled in Medicare'.`);
                    member.MSP = {
                        combinedIncome: 0,
                        combinedAssets: 0,
                        eligibility: ["Not Enrolled in Medicare"]
                    };
                    member.selections = member.selections || {};
                    member.selections["Is this person currently enrolled in the Medicare Savings Program?"] = "notenrolledinmedicare";
                    continue;
} else if (medicaidEnrollment === "yes") {
    console.log(`${member.firstName} ${member.lastName} is enrolled in Medicaid. Marking as 'Enrolled in Medicaid'.`);
    member.MSP = {
        combinedIncome: 0,
        combinedAssets: 0,
        eligibility: ["Enrolled in Medicaid"]
    };
    member.selections = member.selections || {};
    member.selections["Is this person currently enrolled in the Medicare Savings Program?"] = "onmedicaid"; // Set MSP enrollment to "onmedicaid"
    continue;
}
    
                const mspEnrollment = member.selections?.["Is this person currently enrolled in the Medicare Savings Program?"]?.toLowerCase();
                if (mspEnrollment === "yes") {
                    console.log(`${member.firstName} ${member.lastName} is already enrolled in MSP. Marking as 'Already Enrolled'.`);
                    member.MSP = {
                        combinedIncome: 0,
                        combinedAssets: 0,
                        eligibility: ["Already Enrolled"]
                    };
                    continue;
                } else if (mspEnrollment === "notinterested") {
                    console.log(`${member.firstName} ${member.lastName} is not interested. Marking as 'Not Checked'.`);
                    member.MSP = {
                        combinedIncome: 0,
                        combinedAssets: 0,
                        eligibility: ["Not Interested"]
                    };
                    continue;
                } else if (!mspEnrollment || mspEnrollment.toLowerCase().trim() === "n/a" || mspEnrollment.toLowerCase().trim() === "notenrolledinmedicare" || mspEnrollment.toLowerCase().trim() === "onmedicaid" || mspEnrollment.toLowerCase().trim() === "not interested") {
                    console.log(`${member.firstName} ${member.lastName} has MSP status as N/A. Marking as 'Needs Current Enrollment Status'.`);
                    member.MSP = {
                        combinedIncome: 0,
                        combinedAssets: 0,
                        eligibility: ["Needs Current Enrollment Status"]
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
    } else if (combinedAssets > 14470) {
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
    } else if (combinedAssets > 9660) {
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
                    eligibility: mspEligibility
                };
    
                member.MSP = mspObject;
                if (spouse) {
                    spouse.MSP = mspObject;
                    console.log(`MSP object for ${member.firstName} ${member.lastName} and spouse ${spouse.firstName} ${spouse.lastName} assigned.`);
                    continue; // Skip further processing for the spouse
                }
    
                console.log(`MSP object for ${member.firstName} ${member.lastName}:`, member.MSP);
            } catch (error) {
                console.error(`Error processing member ${member.firstName} ${member.lastName}:`, error);
            }
        }
    
        // Save the updated members array using IPC
        const clientId = getQueryParameter('id');
        await window.electron.ipcRenderer.invoke('save-household-members', { clientId, householdMembers: members });
    }

    // Add the calculateSNAPBenefit function
function calculateSNAPBenefit(finalNetIncome, householdSize, eligibilityStatus) {
    const maxAllotments = [
        0, 292, 536, 768, 975, 1158, 1390, 1536, 1756, 1976, 2196, 2416, 2636, 2856, 3076, 3296
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

    // If the benefit amount is less than $23 and the household is "Likely Eligible for SNAP", set it to $23
    if (benefitAmount < 23 && eligibilityStatus === "Likely Eligible for SNAP") {
        benefitAmount = 23;
        console.log("Benefit adjusted to $23 due to eligibility.");
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
            "Phone": 34
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

            // Calculate utility allowance (only once for the household)
            if (totalUtilityAllowance === 0) {

                let memberUtilityAllowance = 0;

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
    0, 204, 204, 204, 217, 254, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291
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
            excessShelterCost = Math.min(excessShelterCost, 712); // Cap shelter deduction at $672
        }

        // Subtract excess shelter cost
        totalNetIncome = Math.max(0, totalNetIncome - excessShelterCost);

        // Determine gross income limit
        const grossIncomeLimits = [
            0, 2510, 3408, 4304, 5200, 6098, 6994, 7890, 8788, 9686, 10584,
            11482, 12380, 13278, 14176, 15074
        ];
        const grossIncomeLimit = grossIncomeLimits[mealsYesCount] || 0;

        // Determine eligibility
        let snapEligibility;
        if (combinedMonthlyIncome <= grossIncomeLimit) {
            snapEligibility = ["Likely Eligible for SNAP"];
        } else if (hasElderlyOrDisabled) {
            const netIncomeLimits = [
                0, 1255, 1704, 2152, 2600, 3049, 3497, 3945, 4394, 4843, 5292,
                5741, 6190, 6639, 7088, 7537
            ];
            const netIncomeLimit = netIncomeLimits[mealsYesCount] || 0;
            
            if (combinedMonthlyIncome <= grossIncomeLimit) {
                snapEligibility = ["Likely Eligible for SNAP"];
            } else if (combinedAssets > 4500) {
                snapEligibility = ["Not Likely Eligible for SNAP (Income and Assets)"];
            } else if (totalNetIncome > netIncomeLimit && totalShelterExpenses === 0 || totalUtilityAllowance === 0) {
                snapEligibility = ["Determination Pending Expenses (Over Gross Income Limit)"];
            } else if (totalNetIncome <= netIncomeLimit && combinedAssets <= 4500) {
                snapEligibility = ["Likely Eligible for SNAP"];
            } else if (totalNetIncome > netIncomeLimit === totalOtherExpenses > 0) {
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

    // Save the updated members array using IPC
    const clientId = getQueryParameter('id');
    await window.electron.ipcRenderer.invoke('save-household-members', { clientId, householdMembers: members });
}

// Initialize the display of household members
displayHouseholdMembers();


// Fetch the client object
const client = await window.electron.ipcRenderer.invoke('get-client', clientId);

if (!client) {
    console.error("Client data could not be retrieved.");
    return;
}

// Log the isFarmworker property from the client object
console.log("isFarmworker:", client.isFarmworker);

// Initialize PACE eligibility check and update the UI
const members = await loadHouseholdMembers();
await PACEEligibilityCheck(members);
await LISEligibilityCheck(members);
await MSPEligibilityCheck(members);
await PTRREligibilityCheck(members);
await SNAPEligibilityCheck(members, client.isFarmworker);

// Update and display household members after eligibility checks
await updateAndDisplayHouseholdMembers();

 // Call this function after eligibility checks
 await displaySNAPHouseholds();

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
    SNAPEligibilityCheck
};
});
