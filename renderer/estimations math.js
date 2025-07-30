document.addEventListener('DOMContentLoaded', async function () {
    const clientId = getQueryParameter('id'); // Get the client ID from the query parameter


    // Call populateHouseholdMembersUI on page load
    await populateHouseholdMembersUI(); // Await the async function

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

    // Display household members
    async function displayHouseholdMembers() {
        const householdMemberContainer = document.getElementById('household-member-container');
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
                    <p><strong>Date of Birth:</strong> ${member.dob || 'N/A'}</p>
                    <p><strong>Marital Status:</strong> ${member.maritalStatus || 'N/A'}</p>
                `;

                householdMemberContainer.appendChild(memberDiv);
            });
        }
    }

    // Display household members on page load
    await displayHouseholdMembers();

    async function PACEEligibilityCheck(members) {
        const processedMembers = new Set(); // Track members who have already been processed
    
        members.forEach(async member => {
            if (processedMembers.has(member.householdMemberId)) {
                return;
            }
    
            const dob = new Date(member.dob);
            const ageDifMs = Date.now() - dob.getTime();
            const ageDate = new Date(ageDifMs);
            const age = Math.abs(ageDate.getUTCFullYear() - 1970);
    
            if (age >= 65 && member.selections["Is this person currently enrolled in PACE?"] === "no") {
                const incomes = member.incomes || [];
                const previousYearIncomes = incomes.filter(income => income.yearType === "Previous");
                let totalIncome = previousYearIncomes.reduce((sum, income) => {
                    const yearlyAmount = calculateYearlyIncome(income.amount, income.frequency);
                    return sum + Number(yearlyAmount);
                }, 0);
    
                const clientId = getQueryParameter('id');
                
                const client = await window.electron.ipcRenderer.invoke('get-client', clientId);
    
                if (client && client.householdMembers) {
                    client.householdMembers.forEach(member => {
                        const medicarePartBExpense = member.medicalExpenses?.find(expense => expense.type === "Medicare Part B");
                        if (medicarePartBExpense) {
                            console.log(`Found Medicare Part B Premium for ${member.firstName} ${member.lastName}:`, medicarePartBExpense);
                        }
                    });
                }
    
                const spouse = members.find(m =>
                    m.relationships &&
                    m.relationships[member.householdMemberId] === 'spouse' &&
                    member.relationships &&
                    member.relationships[m.householdMemberId] === 'spouse'
                );
    
                // Calculate member's adjusted income
                const medicarePartBExpense = member.expenses?.find(expense => 
                    expense.type === "Medical" && expense.kind === "Medicare Part B Premium"
                );
                
                if (medicarePartBExpense) {
                    const yearlyMedicarePartB = medicarePartBExpense.value * 12; // Assuming monthly frequency
                    totalIncome -= yearlyMedicarePartB; // Deduct Medicare Part B for member
                    console.log(`Yearly Medicare Part B Premium for ${member.firstName} ${member.lastName}: $${yearlyMedicarePartB}`);
                }
    
                console.log(`Adjusted income for ${member.firstName} ${member.lastName}: $${totalIncome}`);
    
                if (spouse) {
                    // Calculate spouse's adjusted income
                    const spouseIncomes = spouse.incomes || [];
                    const spousePreviousYearIncomes = spouseIncomes.filter(income => income.yearType === "Previous");
                    let spouseIncomeTotal = spousePreviousYearIncomes.reduce((sum, income) => {
                        const yearlyAmount = calculateYearlyIncome(income.amount, income.frequency);
                        return sum + Number(yearlyAmount);
                    }, 0);
    
                    const spouseMedicarePartBExpense = spouse.medicalExpenses?.find(expense => expense.type === "Medicare Part B");
                    if (spouseMedicarePartBExpense) {
                        const yearlyMedicarePartB = spouseMedicarePartBExpense.value * 12; // Assuming monthly frequency
                        spouseIncomeTotal -= yearlyMedicarePartB; // Deduct Medicare Part B for spouse
                        console.log(`Yearly Medicare Part B Premium for ${spouse.firstName} ${spouse.lastName}: $${yearlyMedicarePartB}`);
                    }
    
                    console.log(`Adjusted spouse income for ${spouse.firstName} ${spouse.lastName}: $${spouseIncomeTotal}`);
    
                    // Combine incomes
                    totalIncome += spouseIncomeTotal;
    
                    member.combinedIncome = totalIncome;
                    spouse.combinedIncome = totalIncome;
    
                    processedMembers.add(spouse.householdMemberId);
                } else {
                    console.log(`No spouse found for ${member.firstName} ${member.lastName}. Sole income: $${totalIncome}`);
                    member.combinedIncome = totalIncome;
                }
    
                // Log the final adjusted income
                console.log(`Final adjusted income for ${member.firstName} ${member.lastName}: $${member.combinedIncome}`);
    
                // Eligibility checks using adjusted income
                if (spouse) {
                    if (member.combinedIncome < 17700) {
                        member.PACEEligibility = "Likely Eligible for PACE";
                    } else if (member.combinedIncome >= 17701 && member.combinedIncome <= 41500) {
                        member.PACEEligibility = "Likely Eligible for PACENET";
                    } else if (member.combinedIncome >= 41501 && member.combinedIncome <= 51500) {
                        member.PACEEligibility = "Likely Ineligible but Within Buffer";
                    } else if (member.combinedIncome > 51500) {
                        member.PACEEligibility = "Not Likely Eligible for PACE or PACENET";
                    }
                } else {
                    if (member.combinedIncome < 14500) {
                        member.PACEEligibility = "Likely Eligible for PACE";
                    } else if (member.combinedIncome >= 14501 && member.combinedIncome <= 33500) {
                        member.PACEEligibility = "Likely Eligible for PACENET";
                    } else if (member.combinedIncome >= 33501 && member.combinedIncome <= 43500) {
                        member.PACEEligibility = "Likely Ineligible but Within Buffer";
                    } else if (member.combinedIncome > 43500) {
                        member.PACEEligibility = "Not Likely Eligible for PACE or PACENET";
                    }
                }
            } else {
                const incomes = member.incomes || [];
                const previousYearIncomes = incomes.filter(income => income.yearType === "Previous");
                member.combinedIncome = previousYearIncomes.reduce((sum, income) => {
                    const yearlyAmount = calculateYearlyIncome(income.amount, income.frequency);
                    return sum + Number(yearlyAmount);
                }, 0);
                member.PACEEligibility = "Not Checked";
            }
    
            processedMembers.add(member.householdMemberId);
        });

    console.log("Total income for all household members:");
    members.forEach(member => {
        console.log(`${member.firstName} ${member.lastName}: $${member.combinedIncome || 0}`);
    });

    saveHouseholdMembers(members);
}

    function PTRREligibilityCheck(members) {
        const processedMembers = new Set();
    
        members.forEach(member => {
            if (processedMembers.has(member.householdMemberId)) {
                return;
            }
    
            // Check if previousYearExpenses array is empty
            if (!member.previousYearExpenses || member.previousYearExpenses.length === 0) {
                console.log(`No previous year expenses found for ${member.firstName} ${member.lastName}. Not eligible for PTRR.`);
                member.PTRREligibility = "Not Likely Eligible for PTRR";
                processedMembers.add(member.householdMemberId);
                return;
            }
    
            // Normalize and check application status
            if ((member["Has this person already applied for PTTR this year?"] || "").toLowerCase().trim() === "no") {
                const incomes = member.incomes || [];
                const previousYearIncomes = incomes.filter(income => income.yearType === "Previous");
                let totalIncome = previousYearIncomes.reduce((sum, income) => sum + Number(income.amount), 0);
    
                const spouse = members.find(m =>
                    m.relationships &&
                    m.relationships[member.householdMemberId] === 'spouse' &&
                    member.relationships &&
                    member.relationships[m.householdMemberId] === 'spouse'
                );
    
                if (spouse) {
                    const spouseIncomes = spouse.incomes || [];
                    const spousePreviousYearIncomes = spouseIncomes.filter(income => income.yearType === "Previous");
                    const spouseIncomeTotal = spousePreviousYearIncomes.reduce((sum, income) => sum + Number(income.amount), 0);
    
                    console.log(`Spouse income for ${spouse.firstName} ${spouse.lastName}: $${spouseIncomeTotal}`);
                    totalIncome += spouseIncomeTotal;
    
                    member.combinedIncome = totalIncome;
                    spouse.combinedIncome = totalIncome;
    
                    processedMembers.add(spouse.householdMemberId);
                } else {
                    console.log(`No spouse found for ${member.firstName} ${member.lastName}. Sole income: $${totalIncome}`);
                    member.combinedIncome = totalIncome;
                }
    
                console.log(`Total income for ${member.firstName} ${member.lastName}: $${totalIncome}`);
    
                if (totalIncome <= 46520) {
                    member.PTRREligibility = "Likely Eligible for PTRR";
                } else {
                    member.PTRREligibility = "Not Likely Eligible for PTRR";
                }
            } else {
                console.log(`${member.firstName} ${member.lastName} has already applied for PTRR. Marking as 'Not Checked'.`);
                member.PTRREligibility = "Not Checked";
            }
    
            processedMembers.add(member.householdMemberId);
        });
    
        console.log("Total income for all household members:");
        members.forEach(member => {
            console.log(`${member.firstName} ${member.lastName}: $${member.combinedIncome || 0}`);
        });
    
        saveHouseholdMembers(members);
    }

    function LISEligibilityCheck(members) {
        const processedMembers = new Set(); // Track members who have already been processed
    
        members.forEach(member => {
            if (processedMembers.has(member.householdMemberId)) {
                return;
            }
    
            const dob = new Date(member.dob);
            const ageDifMs = Date.now() - dob.getTime();
            const ageDate = new Date(ageDifMs);
            const age = Math.abs(ageDate.getUTCFullYear() - 1970);
    
            if (age >= 65 && member["Is this person currently enrolled in LIS?"] === "no") {
                const incomes = member.incomes || [];
                const currentYearIncomes = incomes.filter(income => income.yearType === "Current");
                let totalIncome = currentYearIncomes.reduce((sum, income) => sum + Number(income.amount), 0);
    
                const assets = member.assets || [];
                let totalAssets = assets.reduce((sum, asset) => sum + Number(asset.value), 0);
    
                const spouse = members.find(m =>
                    m.relationships &&
                    m.relationships[member.householdMemberId] === 'spouse' &&
                    member.relationships &&
                    member.relationships[m.householdMemberId] === 'spouse'
                );
    
                if (spouse) {
                    // Calculate spouse's income
                    const spouseIncomes = spouse.incomes || [];
                    const spouseCurrentYearIncomes = spouseIncomes.filter(income => income.yearType === "Current");
                    let spouseIncomeTotal = spouseCurrentYearIncomes.reduce((sum, income) => sum + Number(income.amount), 0);
    
                    // Calculate spouse's assets
                    const spouseAssets = spouse.assets || [];
                    let spouseAssetsTotal = spouseAssets.reduce((sum, asset) => sum + Number(asset.value), 0);
    
                    console.log(`Adjusted spouse income for ${spouse.firstName} ${spouse.lastName}: $${spouseIncomeTotal}`);
                    console.log(`Adjusted spouse assets for ${spouse.firstName} ${spouse.lastName}: $${spouseAssetsTotal}`);
    
                    // Combine incomes and assets
                    totalIncome += spouseIncomeTotal;
                    totalAssets += spouseAssetsTotal;
    
                    member.combinedIncome = totalIncome;
                    member.combinedAssets = totalAssets;
                    spouse.combinedIncome = totalIncome;
                    spouse.combinedAssets = totalAssets;
    
                    processedMembers.add(spouse.householdMemberId);
                } else {
                    console.log(`No spouse found for ${member.firstName} ${member.lastName}. Sole income: $${totalIncome}`);
                    console.log(`No spouse found for ${member.firstName} ${member.lastName}. Sole assets: $${totalAssets}`);
                    member.combinedIncome = totalIncome;
                    member.combinedAssets = totalAssets;
                }
    
                // Log the final adjusted income and assets
                console.log(`Final adjusted income for ${member.firstName} ${member.lastName}: $${member.combinedIncome}`);
                console.log(`Final adjusted assets for ${member.firstName} ${member.lastName}: $${member.combinedAssets}`);
    
                // Eligibility checks using adjusted income and assets
                if (spouse) {
                    if (member.combinedIncome <= 30660 && member.combinedAssets <= 35130) {
                        member.LISEligibility = "Likely Eligible for LIS";
                    } else {
                        member.LISEligibility = "Not Likely Eligible for LIS";
                    }
                } else {
                    if (member.combinedIncome <= 22590 && member.combinedAssets <= 17600) {
                        member.LISEligibility = "Likely Eligible for LIS";
                    } else {
                        member.LISEligibility = "Not Likely Eligible for LIS";
                    }
                }
            } else {
                const incomes = member.incomes || [];
                const currentYearIncomes = incomes.filter(income => income.yearType === "Current");
                member.combinedIncome = currentYearIncomes.reduce((sum, income) => sum + Number(income.amount), 0);
    
                const assets = member.assets || [];
                member.combinedAssets = assets.reduce((sum, asset) => sum + Number(asset.amount), 0);
    
                member.LISEligibility = "Not Checked";
            }
    
            processedMembers.add(member.householdMemberId);
        });
    
        console.log("Total income and assets for all household members:");
        members.forEach(member => {
            console.log(`${member.firstName} ${member.lastName}: Income: $${member.combinedIncome || 0}, Assets: $${member.combinedAssets || 0}`);
        });
    
        saveHouseholdMembers(members);
    }

    function MSPEligibilityCheck(members) {
        const processedMembers = new Set(); // Track members who have already been processed
    
        members.forEach(member => {
            if (processedMembers.has(member.householdMemberId)) {
                return;
            }
    
            const dob = new Date(member.dob);
            const ageDifMs = Date.now() - dob.getTime();
            const ageDate = new Date(ageDifMs);
            const age = Math.abs(ageDate.getUTCFullYear() - 1970);
    
            if (age >= 65 && member["Is this person currently enrolled in MSP?"] === "no") {
                const incomes = member.incomes || [];
                const currentYearIncomes = incomes.filter(income => income.yearType === "Current");
                let totalIncome = currentYearIncomes.reduce((sum, income) => {
                    let adjustedIncome = Number(income.amount);
    
                    // Apply $65 deduction and halve for Employment or Self-Employment income
                    if (income.kind.toLowerCase() === "employment" || income.kind.toLowerCase() === "self-employment") {
                        adjustedIncome = Math.max(0, adjustedIncome - 65) / 2;
                    }
    
                    return sum + adjustedIncome;
                }, 0);
    
                // Subtract $240 per year for the member
                totalIncome -= 240;
    
                const assets = member.assets || [];
                let totalAssets = assets.reduce((sum, asset) => sum + Number(asset.value), 0);
    
                const spouse = members.find(m =>
                    m.relationships &&
                    m.relationships[member.householdMemberId] === 'spouse' &&
                    member.relationships &&
                    member.relationships[m.householdMemberId] === 'spouse'
                );
    
                if (spouse) {
                    // Calculate spouse's income
                    const spouseIncomes = spouse.incomes || [];
                    const spouseCurrentYearIncomes = spouseIncomes.filter(income => income.yearType === "Current");
                    let spouseIncomeTotal = spouseCurrentYearIncomes.reduce((sum, income) => {
                        let adjustedIncome = Number(income.amount);
    
                        // Apply $65 deduction and halve for Employment or Self-Employment income
                        if (income.kind.toLowerCase() === "employment" || income.kind.toLowerCase() === "self-employment") {
                            adjustedIncome = Math.max(0, adjustedIncome - 65) / 2;
                        }
    
                        return sum + adjustedIncome;
                    }, 0);
    
                    // Subtract $240 per year for the spouse
                    spouseIncomeTotal -= 240;
    
                    // Calculate spouse's assets
                    const spouseAssets = spouse.assets || [];
                    let spouseAssetsTotal = spouseAssets.reduce((sum, asset) => sum + Number(asset.value), 0);
    
                    // Combine incomes and assets
                    totalIncome += spouseIncomeTotal;
                    totalAssets += spouseAssetsTotal;
    
                    member.combinedIncome = totalIncome;
                    member.combinedAssets = totalAssets;
                    spouse.combinedIncome = totalIncome;
                    spouse.combinedAssets = totalAssets;
    
                    processedMembers.add(spouse.householdMemberId);
                } else {
                    member.combinedIncome = totalIncome;
                    member.combinedAssets = totalAssets;
                }
    
                // Determine MSP eligibility and save to the MSP key
                if (spouse) {
                    if (member.combinedIncome <= 21396 && member.combinedAssets <= 14470) {
                        member.MSP = "Likely Eligible for MSP (QMB)";
                    } else if (member.combinedIncome > 21396 && member.combinedIncome <= 26700 && member.combinedAssets <= 14470) {
                        member.MSP = "Likely Eligible for MSP (SLMB)";
                    } else if (member.combinedIncome > 26700 && member.combinedIncome <= 31980 && member.combinedAssets <= 14470) {
                        member.MSP = "Likely Eligible for MSP (QI)";
                    } else {
                        member.MSP = "Not Likely Eligible for MSP";
                    }
                } else {
                    if (member.combinedIncome <= 15900 && member.combinedAssets <= 9660) {
                        member.MSP = "Likely Eligible for MSP (QMB)";
                    } else if (member.combinedIncome > 15900 && member.combinedIncome <= 19860 && member.combinedAssets <= 9660) {
                        member.MSP = "Likely Eligible for MSP (SLMB)";
                    } else if (member.combinedIncome > 19860 && member.combinedIncome <= 23880 && member.combinedAssets <= 9660) {
                        member.MSP = "Likely Eligible for MSP (QI)";
                    } else {
                        member.MSP = "Not Likely Eligible for MSP";
                    }
                }
    
                // Ensure MSP is logged correctly
                console.log(`${member.firstName} ${member.lastName}: Income: $${member.combinedIncome || 0}, Assets: $${member.combinedAssets || 0}, MSP: ${member.MSP}`);
            } else {
                member.MSP = "Not Checked";
            }
    
            processedMembers.add(member.householdMemberId);
        });
    
        console.log("Total income and assets for all household members:");
        members.forEach(member => {
            console.log(`${member.firstName} ${member.lastName}: Income: $${member.combinedIncome || 0}, Assets: $${member.combinedAssets || 0}, MSP: ${member.MSP}`);
        });
    
        saveHouseholdMembers(members);
    }

    async function populateHouseholdMembersUI() {
        const householdMemberContainer = document.getElementById('householdMemberContainer');
        householdMemberContainer.innerHTML = '';
    
        const members = await loadHouseholdMembers(); // Await the asynchronous function
    
        PACEEligibilityCheck(members);
        PTRREligibilityCheck(members);
        LISEligibilityCheck(members);
        MSPEligibilityCheck(members);
    
        members.forEach(member => {
            const relatedMember = members.find(m => {
                return m.relationships && m.relationships[member.householdMemberId] === 'spouse';
            });
    
            addHouseholdMemberToUI(member, relatedMember);
        });
    }

    function addHouseholdMemberToUI(member, relatedMember = null) {
        const householdMemberContainer = document.getElementById('householdMemberContainer');
        const memberDiv = document.createElement('div');
        memberDiv.classList.add('household-member');
        memberDiv.setAttribute('data-id', member.householdMemberId);
    
        const dob = new Date(member.dob);
        const ageDifMs = Date.now() - dob.getTime();
        const ageDate = new Date(ageDifMs);
        const age = Math.abs(ageDate.getUTCFullYear() - 1970);
    
        // Build the HTML for the member, excluding SNAP eligibility
        let memberHTML = `
            <p>Name: ${member.firstName} ${member.middleInitial || ''} ${member.lastName}</p>
            <p>Date of Birth: ${member.dob}</p>
            <p>Age: ${age}</p>
            <p>PACE Eligibility: ${member.PACEEligibility || "Not Checked"}</p>
            <p>LIS Eligibility: ${member.LISEligibility || "Not Checked"}</p>
            <p>MSP Eligibility: ${member.MSP || "Not Checked"}</p>
            <p>PTRR Eligibility: ${member.PTRREligibility || "Not Checked"}</p>
        `;
    
        if (relatedMember) {
            memberHTML += `
                <p>Spouse: ${relatedMember.firstName} ${relatedMember.middleInitial || ''} ${relatedMember.lastName}</p>
            `;
        }
    
        memberDiv.innerHTML = memberHTML;
        householdMemberContainer.appendChild(memberDiv);
    }

    function getQueryParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    populateHouseholdMembersUI();
});