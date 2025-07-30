// Helper function to get query parameters from the URL
function getQueryParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

function saveHouseholdMembers(members) {
    // Example: Save members to localStorage or send them to a server
    console.log("Saving household members:", members);
    localStorage.setItem('householdMembers', JSON.stringify(members));
}

function SNAPEligibilityCheck(members) {
    const processedMembers = new Set(); // Track members who have already been processed
    let mealsYesCount = 0; // Counter for members with meals = "yes"
    let totalMealsIncome = 0; // Total income for members with meals = "yes"
    let totalMealsAssets = 0; // Total assets for members with meals = "yes"
    let totalNetIncome = 0; // Total net income for members with meals = "yes"
    let totalUtilityAllowance = 0; // Total utility allowance for members with meals = "yes"
    let totalShelterExpenses = 0; // Total shelter expenses for members with meals = "yes"

    // Utility allowance mapping
    const utilityAllowances = {
        "Heating/Cooling": 758,
        "Basic Limited Allowance": 402,
        "Electricity": 72,
        "Gas": 72,
        "Water": 72,
        "Sewage": 72,
        "Trash": 72,
        "Phone": 34
    };

    members.forEach(member => {
        if (processedMembers.has(member.householdMemberId)) {
            return;
        }

        processedMembers.add(member.householdMemberId);

        if (member.meals === "yes") {
            mealsYesCount++; // Increment the counter for meals = "yes"

            const incomes = member.incomes || [];
            const currentYearIncomes = incomes.filter(income => income.yearType === "Current");

            // Calculate total monthly income based on frequency
            const totalIncome = currentYearIncomes.reduce((sum, income) => {
                const amount = Number(income.amount);
                const frequency = income.frequency ? income.frequency.toLowerCase() : "monthly";

                // Convert income to monthly based on frequency
                let monthlyAmount = 0;
                switch (frequency) {
                    case "weekly":
                        monthlyAmount = amount * 4.33; // Approx. 4.33 weeks in a month
                        break;
                    case "biweekly":
                        monthlyAmount = amount * 2.17; // Approx. 2.17 bi-weekly periods in a month
                        break;
                    case "bimonthly":
                        monthlyAmount = amount * 2; // 2 semi-monthly periods in a month
                        break;
                    case "yearly":
                        monthlyAmount = amount / 12;
                        break;
                    case "monthly":
                    default:
                        monthlyAmount = amount; // Already monthly
                        break;
                }

                return sum + monthlyAmount;
            }, 0);

            // Calculate net income for all income types
            const netIncome = currentYearIncomes.reduce((sum, income) => {
                const amount = Number(income.amount);
                const frequency = income.frequency ? income.frequency.toLowerCase() : "monthly";

                // Convert income to monthly based on frequency
                let monthlyAmount = 0;
                switch (frequency) {
                    case "weekly":
                        monthlyAmount = amount * 4.33;
                        break;
                    case "biweekly":
                        monthlyAmount = amount * 2.17;
                        break;
                    case "bimonthly":
                        monthlyAmount = amount * 2;
                        break;
                    case "yearly":
                        monthlyAmount = amount / 12;
                        break;
                    case "monthly":
                    default:
                        monthlyAmount = amount;
                        break;
                }

                // Apply 20% deduction only for employment or self-employment income
                if (income.kind.toLowerCase() === "employment" || income.kind.toLowerCase() === "self-employment") {
                    return sum + (monthlyAmount * 0.8); // Apply 20% deduction
                } else {
                    return sum + monthlyAmount; // No deduction for other income types
                }
            }, 0);

            // Apply standard deduction
const standardDeductions = [
    0, 177, 177, 177, 184, 215, 246, 246, 246, 246, 246, 246, 246, 246, 246, 246
];
const standardDeduction = standardDeductions[mealsYesCount] || 0;
totalNetIncome = Math.max(0, totalNetIncome - standardDeduction);

// Log the applied standard deduction
console.log(`Standard Deduction for ${mealsYesCount} members: $${standardDeduction}`);
console.log(`Net Income after Standard Deduction: $${totalNetIncome}`);

            totalNetIncome += netIncome;

            const assets = member.assets || [];
            const totalAssets = assets.reduce((sum, asset) => sum + Number(asset.value), 0);

            totalMealsIncome += totalIncome;
            totalMealsAssets += totalAssets;

            // Calculate utility allowance
            const utilityExpenses = member.utilityExpenses || [];
            let memberUtilityAllowance = 0;

            // Check if the household qualifies for the Basic Limited Allowance or Heating/Cooling Allowance
            const utilityTypes = utilityExpenses.map(expense => expense.type);
            const basicUtilityTypes = ["Electricity", "Gas", "Water", "Sewage", "Trash", "Phone"];
            const qualifyingUtilities = utilityTypes.filter(type => basicUtilityTypes.includes(type));

            if (utilityTypes.includes("Heating/Cooling")) {
                memberUtilityAllowance = utilityAllowances["Heating/Cooling"];
            } else if (qualifyingUtilities.length >= 2) {
                memberUtilityAllowance = utilityAllowances["Basic Limited Allowance"];
            } else {
                qualifyingUtilities.forEach(type => {
                    memberUtilityAllowance += utilityAllowances[type] || 0;
                });
            }

            totalUtilityAllowance += memberUtilityAllowance;

            // Calculate shelter expenses
            const shelterExpenses = member.shelterExpenses || [];
            const memberShelterExpenses = shelterExpenses.reduce((sum, expense) => sum + Number(expense.value || 0), 0);
            totalShelterExpenses += memberShelterExpenses;


            // Log individual member's income, assets, utility allowance, and shelter expenses
            console.log(`Member: ${member.firstName} ${member.lastName}`);
            console.log(`Income: $${totalIncome}`);
            console.log(`Net Income (employment/self-employment): $${netIncome}`);
            console.log(`Assets: $${totalAssets}`);
            console.log(`Utility Allowance: $${memberUtilityAllowance}`);
            console.log(`Shelter Expenses: $${memberShelterExpenses}`);
        }
    });

    // Apply deduction based on the number of members who share meals
    let monthlyDeduction = 0;
    if (mealsYesCount >= 1 && mealsYesCount <= 3) {
        monthlyDeduction = 204;
    } else if (mealsYesCount === 4) {
        monthlyDeduction = 217;
    } else if (mealsYesCount === 5) {
        monthlyDeduction = 254;
    } else if (mealsYesCount >= 6) {
        monthlyDeduction = 291;
    }

    // Step 1: Divide preliminary net income in half
    const halfPrelimNetIncome = totalNetIncome / 2;

     // Step 2: Subtract half of preliminary net income from total shelter expenses
     let excessShelterCost = totalShelterExpenses - halfPrelimNetIncome;
 
         // Step 3: Apply shelter deduction rules
    let hasElderlyOrDisabled = false;

    // Check if any member with meals = "yes" is elderly or disabled
    members.forEach(member => {
        if (member.meals === "yes") {
            const dob = new Date(member.dob);
            const age = new Date().getFullYear() - dob.getFullYear();
            const isElderly = age >= 60;
            const hasDisability = member.disability && member.disability.toLowerCase() === "yes";

            if (isElderly || hasDisability) {
                hasElderlyOrDisabled = true;
            }
        }
    });

    // Apply shelter deduction rules
    if (!hasElderlyOrDisabled) {
        if (excessShelterCost > 672) {
            excessShelterCost = 672; // Cap the shelter deduction at $672
        } else if (excessShelterCost <= 0) {
            excessShelterCost = 0; // No shelter deduction if the result is zero or less
        }
    } else {
        // No cap for elderly or disabled members
        if (excessShelterCost <= 0) {
            excessShelterCost = 0; // No shelter deduction if the result is zero or less
        }
    }

    // Log whether the cap was applied
    if (hasElderlyOrDisabled) {
        console.log("No cap applied to excess shelter deduction due to elderly or disabled member.");
    } else {
        console.log("Cap applied to excess shelter deduction: $672.");
    }
 
     // Step 4: Calculate total other expenses for members with meals = "yes"
     let totalOtherExpenses = 0;
     members.forEach(member => {
         if (member.meals === "yes") {
             const otherExpenses = member.otherExpenses || [];
             const memberOtherExpenses = otherExpenses.reduce((sum, expense) => sum + Number(expense.value || 0), 0);
             totalOtherExpenses += memberOtherExpenses;
 
             // Log individual member's other expenses
             console.log(`Other Expenses for ${member.firstName} ${member.lastName}: $${memberOtherExpenses}`);
         }
     });

    // Step 6: Subtract medical expenses for eligible members
let totalMedicalExpenses = 0;
members.forEach(member => {
    if (member.meals === "yes") {
        const dob = new Date(member.dob);
        const age = new Date().getFullYear() - dob.getFullYear();
        const isElderly = age >= 60;
        const hasDisability = member.disability && member.disability.toLowerCase() === "yes";

        if (isElderly || hasDisability) {
            const medicalExpenses = member.medicalExpenses || [];
            const memberMedicalExpenses = medicalExpenses.reduce((sum, expense) => {
                const amount = Number(expense.value);
                const frequency = expense.frequency ? expense.frequency.toLowerCase() : "monthly";

                // Convert medical expenses to monthly based on frequency
                let monthlyAmount = 0;
                switch (frequency) {
                    case "weekly":
                        monthlyAmount = amount * 4.33; // Approx. 4.33 weeks in a month
                        break;
                    case "biweekly":
                        monthlyAmount = amount * 2.17; // Approx. 2.17 bi-weekly periods in a month
                        break;
                    case "bimonthly":
                        monthlyAmount = amount * 2; // 2 semi-monthly periods in a month
                        break;
                    case "quarterly":
                        monthlyAmount = amount / 3; // Convert quarterly to monthly
                        break;
                    case "yearly":
                        monthlyAmount = amount / 12; // Convert yearly to monthly
                        break;
                    case "monthly":
                    default:
                        monthlyAmount = amount; // Already monthly
                        break;
                }

                return sum + monthlyAmount;
            }, 0);

            // Subtract $35 from medical expenses
            const adjustedMedicalExpenses = Math.max(0, memberMedicalExpenses - 35);
            totalMedicalExpenses += adjustedMedicalExpenses;

            // Log individual member's medical expenses
            console.log(`Medical Expenses for ${member.firstName} ${member.lastName}: $${adjustedMedicalExpenses}`);
        }
    }
});

    // Subtract total medical expenses from the final net income
    const finalNetIncome = Math.max(0, totalNetIncome - excessShelterCost - totalOtherExpenses - totalMedicalExpenses - monthlyDeduction);

     // Determine gross income limit based on mealsYesCount
     const grossIncomeLimits = [
         0, 2510, 3408, 4304, 5200, 6098, 6994, 7890, 8788, 9686, 10584,
         11482, 12380, 13278, 14176, 15074
     ];
     const grossIncomeLimit = grossIncomeLimits[mealsYesCount] || 0;
 
// Log total income, assets, utility allowance, shelter expenses, other expenses, medical expenses, and final net income
console.log(`Total gross income for members with meals = "yes": $${totalMealsIncome}`);
console.log(`Total prelim net income for members with meals = "yes": $${totalNetIncome}`);
console.log(`Total assets for members with meals = "yes": $${totalMealsAssets}`);
console.log(`Total utility allowance for members with meals = "yes": $${totalUtilityAllowance}`);
console.log(`Total shelter expenses for members with meals = "yes": $${totalShelterExpenses}`);
console.log(`Excess shelter cost for members with meals = "yes": $${excessShelterCost}`);
console.log(`Total other expenses for members with meals = "yes": $${totalOtherExpenses}`);
console.log(`Total medical expenses for members with meals = "yes": $${totalMedicalExpenses}`);
console.log(`Final net income for members with meals = "yes": $${finalNetIncome}`);
console.log(`Gross income limit for ${mealsYesCount} members with meals = "yes": $${grossIncomeLimit}`);

// Check if total income exceeds the gross income limit
if (totalMealsIncome <= grossIncomeLimit) {
    console.log("Household is within the gross income limit.");
    updateSNAPEligibility("Likely Eligible for SNAP", finalNetIncome, mealsYesCount);
} else {
    console.log("Household exceeds the gross income limit.");

    if (hasElderlyOrDisabled) {
        const netIncomeLimits = [
            0, 1255, 1704, 2152, 2600, 3049, 3497, 3945, 4394, 4843, 5292,
            5741, 6190, 6639, 7088, 7537
        ];
        const netIncomeLimit = netIncomeLimits[mealsYesCount] || 0;

        if (finalNetIncome <= netIncomeLimit) {
            console.log("Household passes the net income test.");
            updateSNAPEligibility("Likely Eligible for SNAP", finalNetIncome, mealsYesCount);
        } else {
            console.log("Household fails the net income test.");
            if (totalMealsIncome > grossIncomeLimit && finalNetIncome > netIncomeLimit) {
                if (totalMealsAssets > 4500) {
                    console.log("Household fails the assets limit test. Total assets exceed $4500.");
                    updateSNAPEligibility("Not Likely Eligible for SNAP", finalNetIncome, mealsYesCount);
                } else {
                    console.log("Household passes the assets limit test. Total assets are within $4500.");
                    updateSNAPEligibility("Likely Eligible for SNAP", finalNetIncome, mealsYesCount);
                }
            }
        }
    } else {
        console.log("Household does not include an elderly or disabled member, and exceeds the gross income limit.");
        updateSNAPEligibility("Not Likely Eligible for SNAP", finalNetIncome, mealsYesCount);
    }
}

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

// filepath: /Users/lucasbampbelldie/Desktop/PACE app v2/SNAP.js
function updateSNAPEligibility(status, finalNetIncome, mealsYesCount) {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const clientId = getQueryParameter('id');
    const client = clients.find(c => c.id === clientId);

    if (client) {
        client.SNAPEligibility = status;

        // Calculate and save SNAP benefit if eligible
        let benefitAmount = 0;
        if (status === "Likely Eligible for SNAP") {
            benefitAmount = calculateSNAPBenefit(finalNetIncome, mealsYesCount, status);
            client.SNAPBenefit = benefitAmount;
        } else {
            client.SNAPBenefit = 0;
        }

        // Save updated client data to localStorage
        localStorage.setItem('clients', JSON.stringify(clients));

        // Ensure the SNAP container exists
        let snapContainer = document.getElementById('snapContainer');
        if (!snapContainer) {
            // Create the container dynamically if it doesn't exist
            snapContainer = document.createElement('div');
            snapContainer.id = 'snapContainer';
            snapContainer.classList.add('snap-container');
            const householdMemberContainer = document.getElementById('householdMemberContainer');
            if (householdMemberContainer) {
                householdMemberContainer.appendChild(snapContainer);
            } else {
                console.error('Household member container not found in the UI.');
                return;
            }
        }

        // Clear existing content in the SNAP container
        snapContainer.innerHTML = '';

    }
}
}

document.addEventListener('DOMContentLoaded', () => {
    const householdMemberContainer = document.getElementById('householdMemberContainer');

    function createMealsYesContainer(client) {
        const membersWithMealsYes = client.householdMembers.filter(member => member.meals === "yes");

        if (membersWithMealsYes.length > 0) {
            // Create a new container for members with meals = "yes"
            const mealsYesContainer = document.createElement('div');
            mealsYesContainer.classList.add('household-member'); // Use the same class for consistent styling

            // Add a title to the container
            const title = document.createElement('h3');
            title.textContent = 'SNAP Household';
            mealsYesContainer.appendChild(title);

            // Add each member's details to the container
            membersWithMealsYes.forEach(member => {
                const memberInfo = document.createElement('p');
                memberInfo.textContent = `${member.firstName} ${member.lastName}`;
                mealsYesContainer.appendChild(memberInfo);
            });

            // Add SNAP eligibility status to the container
            const eligibilityStatus = document.createElement('p');
            eligibilityStatus.textContent = `SNAP Eligibility: ${client.SNAPEligibility || "Unknown"}`;
            mealsYesContainer.appendChild(eligibilityStatus);

            // Add SNAP benefit amount to the container only if eligible
            if (client.SNAPEligibility === "Likely Eligible for SNAP") {
                const benefitAmount = document.createElement('p');
                if (client.SNAPBenefit === 23) {
                    benefitAmount.textContent = `SNAP Estimated Benefit Amount: Up to $23.00`;
                } else {
                    benefitAmount.textContent = `SNAP Estimated Benefit Amount: Up to $23.00 - $${(client.SNAPBenefit || 0).toFixed(2)}`;
                }
                mealsYesContainer.appendChild(benefitAmount);

                // Check expedited benefits eligibility
                const totalAssets = membersWithMealsYes.reduce((sum, member) => sum + (member.assets || []).reduce((aSum, asset) => aSum + Number(asset.value || 0), 0), 0);
                const totalGrossIncome = membersWithMealsYes.reduce((sum, member) => {
                    return sum + (member.incomes || []).reduce((iSum, income) => {
                        const amount = Number(income.amount || 0);
                        const frequency = income.frequency ? income.frequency.toLowerCase() : "monthly";

                        // Convert income to monthly based on frequency
                        let monthlyAmount = 0;
                        switch (frequency) {
                            case "weekly":
                                monthlyAmount = amount * 4.33; // Approx. 4.33 weeks in a month
                                break;
                            case "biweekly":
                                monthlyAmount = amount * 2.17; // Approx. 2.17 bi-weekly periods in a month
                                break;
                            case "bimonthly":
                                monthlyAmount = amount * 2; // 2 semi-monthly periods in a month
                                break;
                            case "yearly":
                                monthlyAmount = amount / 12; // Convert yearly to monthly
                                break;
                            case "monthly":
                            default:
                                monthlyAmount = amount; // Already monthly
                                break;
                        }

                        return iSum + monthlyAmount;
                    }, 0);
                }, 0);

                const totalShelterExpenses = membersWithMealsYes.reduce((sum, member) => {
                    return sum + (member.shelterExpenses || []).reduce((sSum, expense) => sSum + Number(expense.value || 0), 0);
                }, 0);

                const totalUtilityAllowance = membersWithMealsYes.reduce((sum, member) => {
                    const utilityExpenses = member.utilityExpenses || [];
                    const utilityTypes = utilityExpenses.map(expense => expense.type);
                    const basicUtilityTypes = ["Electricity", "Gas", "Water", "Sewage", "Trash", "Phone"];
                    const qualifyingUtilities = utilityTypes.filter(type => basicUtilityTypes.includes(type));
                    if (utilityTypes.includes("Heating/Cooling")) {
                        return sum + 758; // Heating/Cooling allowance
                    } else if (qualifyingUtilities.length >= 2) {
                        return sum + 402; // Basic Limited Allowance
                    } else {
                        return sum + qualifyingUtilities.reduce((uSum, type) => uSum + (utilityAllowances[type] || 0), 0);
                    }
                }, 0);

                const expeditedEligibility = document.createElement('p');

                // Ensure migrantProperty is retrieved correctly from the "Migrant" field
                const migrantProperty = client && client.Migrant ? client.Migrant.toString().toLowerCase() : "no";

                if (totalAssets <= 100 && totalGrossIncome < 150) {
                    expeditedEligibility.textContent = "Expedited Benefits Eligibility: Yes (Low Assets and Income)";
                } else if (totalGrossIncome + totalAssets < totalShelterExpenses + totalUtilityAllowance) {
                    expeditedEligibility.textContent = "Expedited Benefits Eligibility: Yes (Shelter Expenses Exceed Income and Assets)";
                } else if (totalAssets <= 100 && migrantProperty === "yes") {
                    expeditedEligibility.textContent = "Expedited Benefits Eligibility: Yes (Migrant or Seasonal Farm Worker)";
                } else {
                    expeditedEligibility.textContent = "Expedited Benefits Eligibility: No";
                }

                mealsYesContainer.appendChild(expeditedEligibility);
            }

            // Append the new container to the main household member container
            householdMemberContainer.appendChild(mealsYesContainer);
        }
    }

    function initializeSNAPEligibility() {
        const clients = JSON.parse(localStorage.getItem('clients')) || [];
        const clientId = getQueryParameter('id');
        let client = clients.find(c => c.id === clientId);
    
        if (client) {
            // Show loading indicator
            const loadingIndicator = document.createElement('p');
            loadingIndicator.textContent = 'Calculating SNAP eligibility...';
            loadingIndicator.id = 'loadingIndicator';
            householdMemberContainer.appendChild(loadingIndicator);
    
            // Perform calculations asynchronously
            setTimeout(() => {
                // Call SNAPEligibilityCheck with household members
                SNAPEligibilityCheck(client.householdMembers);
    
                // Update the client object with the latest data from localStorage
                const updatedClients = JSON.parse(localStorage.getItem('clients')) || [];
                client = updatedClients.find(c => c.id === clientId);
    
                // Remove loading indicator
                const loadingElement = document.getElementById('loadingIndicator');
                if (loadingElement) {
                    householdMemberContainer.removeChild(loadingElement);
                }
    
                // Create the mealsYesContainer after calculations are done
                createMealsYesContainer(client);
            }, 0); // Delay to simulate async processing
        } else {
            console.log("No client found with the given ID.");
        }
    }

    // Initialize SNAP eligibility calculations and UI rendering
    initializeSNAPEligibility();
});