// Ensure EligibilityUtils is available globally
function getUtils() {
    const Utils = window.EligibilityUtils;
    if (!Utils) {
        console.error('EligibilityUtils not loaded. Make sure eligibilityutils.js is included before estimations.js');
        return null;
    }
    return Utils;
}

// Create a promise that resolves when eligibility checks are complete
let resolveEligibilityChecks;
window.eligibilityChecksReady = new Promise(resolve => {
    resolveEligibilityChecks = resolve;
});

document.addEventListener('DOMContentLoaded', async function () {

    // ===== DESTRUCTURE CONSTANTS FROM ELIGIBILITY UTILS =====
    const {
        BENEFIT_KEYS,
        INDIVIDUAL_BENEFITS,
        PACE_THRESHOLDS,
        LIS_THRESHOLDS,
        MSP_THRESHOLDS,
        MSP_DEDUCTIONS,
        PTRR_THRESHOLDS,
        SNAP_STANDARD_DEDUCTIONS,
        SNAP_GROSS_INCOME_LIMITS,
        SNAP_NET_INCOME_LIMITS,
        SNAP_SHELTER_COST_CAP,
        SNAP_MEDICAL_EXPENSE_THRESHOLD,
        SNAP_ELDERLY_DISABLED_ASSET_LIMIT,
        LIHEAP_INCOME_LIMITS,
        getQueryParameter,
        capitalizeFirstLetter,
        ensureBenefitSchema,
        getYearlyMultiplier,
        calculateYearlyIncome,
        filterCurrentIncomes,
        filterPreviousYearIncomes,
        findSpouse,
        findPreviousSpouse,
        parseAge,
        calculateAgeFromDob,
        calculateSNAPBenefit,
        determineExpeditedEligibility,
        calculateUtilityAllowance,
        isNotEligible,
        needsInfo,
        isLikelyEligible,
        getCardColors
    } = window.EligibilityUtils;

    // ===== STATE =====
    const clientId = getQueryParameter('id');
    let currentMemberId = null;
    let client = null;

    // ===== DATA FETCHING =====
    async function fetchClient() {
        try {
            const response = await fetch(`/get-client/${clientId}`);
            if (!response.ok) throw new Error(`Failed to fetch client: ${response.statusText}`);
            return await response.json();
        } catch (error) {
            console.error('Error fetching client:', error);
            return null;
        }
    }

    async function loadHouseholdMembers() {
        if (!clientId) {
            console.error('Client ID not found in query parameters.');
            return [];
        }

        try {
            const clientData = await fetchClient();
            if (!clientData?.householdMembers) {
                console.error('No household members found for this client.');
                return [];
            }
            return ensureBenefitSchema(clientData.householdMembers);
        } catch (error) {
            console.error('Error loading household members:', error);
            return [];
        }
    }

    async function saveHouseholdMembers(members) {
        try {
            const response = await fetch('/save-household-members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, householdMembers: members })
            });
            if (!response.ok) {
                console.error('Failed to save household members:', response.statusText);
                return false;
            }
            return true;
        } catch (error) {
            console.error('Error saving household members:', error);
            return false;
        }
    }

    // ===== NOTES HELPERS =====
    async function addNoteToClient(clientId, noteText) {
        const activeUser = sessionStorage.getItem('loggedInUser')?.trim() || 'Unknown User';
        const timestamp = new Date().toLocaleString();
        const note = { text: noteText, timestamp, username: activeUser };

        try {
            const response = await fetch('/add-note-to-client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, note })
            });
            if (!response.ok) console.warn('Failed to add note to client.');
        } catch (error) {
            console.error('Error adding note:', error);
        }
    }

    async function renderNotesContainer() {
        if (typeof window.renderNotes === 'function') {
            await window.renderNotes(clientId);
        }
    }

    // ===== FLIP CARD HELPERS =====
    function setupFlipCard(container, { frontSelector, backSelector, hintSelector, backHintSelector, detailsSelector }) {
        const flipInner = container.querySelector('.benefit-flip-card-inner, .snap-flip-card-inner, .liheap-flip-card-inner');
        const frontSide = container.querySelector(frontSelector);
        const backSide = container.querySelector(backSelector);
        const frontHint = frontSide?.querySelector(hintSelector);
        const backHint = backSide?.querySelector(backHintSelector);

        if (!flipInner || !frontSide || !backSide) return;

        let isFlipped = false;

        function syncCardHeight() {
            flipInner.style.height = 'auto';
            frontSide.style.minHeight = '0';
            backSide.style.height = 'auto';

            const origPosition = backSide.style.position;
            const origTransform = backSide.style.transform;
            const origVisibility = backSide.style.visibility;
            
            backSide.style.position = 'relative';
            backSide.style.transform = 'none';
            backSide.style.visibility = 'hidden';

            const frontHeight = frontSide.scrollHeight;
            const backHeight = backSide.scrollHeight;

            backSide.style.position = origPosition;
            backSide.style.transform = origTransform;
            backSide.style.visibility = origVisibility;

            const maxHeight = Math.max(frontHeight, backHeight);
            flipInner.style.height = `${maxHeight}px`;
            backSide.style.height = `${maxHeight}px`;
            frontSide.style.minHeight = `${maxHeight}px`;
        }

        function doFlip() {
            isFlipped = !isFlipped;
            syncCardHeight();
            flipInner.style.transform = isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)';
        }

        requestAnimationFrame(syncCardHeight);

        if (frontHint) frontHint.addEventListener('click', (e) => { e.stopPropagation(); doFlip(); });
        if (backHint) backHint.addEventListener('click', (e) => { e.stopPropagation(); doFlip(); });

        const detailsEl = frontSide.querySelector(detailsSelector || 'details');
        if (detailsEl) {
            detailsEl.addEventListener('toggle', () => requestAnimationFrame(syncCardHeight));
        }

        return { syncCardHeight, doFlip };
    }

    // ===== CLOSE REASONS CONFIGURATION =====
    const COMMON_CLOSE_REASONS = [
        { value: "Hard Determination", label: "Use Hard Determination Closeout Reasons" },
        { value: "Not Interested", label: "Not Interested" },
        { value: "Too Confusing", label: "Too Confusing" },
        { value: "Will Call Back", label: "Will Call Back" }
    ];

    const BENEFIT_CLOSE_REASONS = {
        PACE: [
            { value: "Hard Determination", label: "Use Hard Determination Closeout Reasons" },
            { value: "Already Enrolled", label: "Already Enrolled" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Age Criteria Not Met", label: "Age Criteria Not Met" },
            { value: "Enrolled in Medicaid", label: "Enrolled in Medicaid" },
            { value: "Residency Not Met", label: "PA Residency Not Met" },
            ...COMMON_CLOSE_REASONS
        ],
        LIS: [
            { value: "Hard Determination", label: "Use Hard Determination Closeout Reasons" },
            { value: "Already Enrolled", label: "Already Enrolled" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Ineligible - Assets", label: "Ineligible - Assets" },
            { value: "Not Enrolled in Medicare", label: "Not Enrolled in Medicare" },
            { value: "Enrolled in Medicaid", label: "Enrolled in Medicaid" },
            ...COMMON_CLOSE_REASONS
        ],
        MSP: [
            { value: "Hard Determination", label: "Use Hard Determination Closeout Reasons" },
            { value: "Already Enrolled", label: "Already Enrolled" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Ineligible - Assets", label: "Ineligible - Assets" },
            { value: "Not Enrolled in Medicare", label: "Not Enrolled in Medicare" },
            { value: "Enrolled in Medicaid", label: "Enrolled in Medicaid" },
            ...COMMON_CLOSE_REASONS
        ],
        PTRR: [
            { value: "Hard Determination", label: "Use Hard Determination Closeout Reasons" },
            { value: "Already Applied", label: "Already Applied This Year" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Age/Disability/Widow Criteria Not Met", label: "Age/Disability/Widow Criteria Not Met" },
            { value: "No Formal Lease", label: "No Formal Lease" },
            { value: "No Relevant Expenses", label: "No Relevant Expenses" },
            ...COMMON_CLOSE_REASONS
        ],
        SNAP: [
            { value: "Hard Determination", label: "Use Hard Determination Closeout Reasons" },
            { value: "Already Enrolled", label: "Already Enrolled" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Ineligible - Income and Assets", label: "Ineligible - Income and Assets" },
            ...COMMON_CLOSE_REASONS
        ],
        LIHEAP: [
            { value: "Hard Determination", label: "Use Hard Determination Closeout Reasons" },
            { value: "Already Enrolled", label: "Already Enrolled" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Subsidized Housing and No Heating Responsibility", label: "Subsidized Housing and No Heating Responsibility" },
            ...COMMON_CLOSE_REASONS
        ]
    };

    function getCloseReasonsForBenefits(selectedBenefits) {
        if (selectedBenefits.length === 0) return [];

        if (selectedBenefits.length === 1) {
            return BENEFIT_CLOSE_REASONS[selectedBenefits[0]] || [
                { value: "Hard Determination", label: "Use Hard Determination Closeout Reasons" },
                { value: "Already Enrolled", label: "Already Enrolled" },
                { value: "Ineligible - Income", label: "Ineligible - Income" },
                { value: "Ineligible - Assets", label: "Ineligible - Assets" },
                ...COMMON_CLOSE_REASONS
            ];
        }

        // Multiple benefits - find intersection
        const reasonSets = selectedBenefits.map(benefit => 
            new Set((BENEFIT_CLOSE_REASONS[benefit] || []).map(r => r.value))
        );
        const sharedValues = [...reasonSets[0]].filter(value => 
            reasonSets.every(set => set.has(value))
        );
        const firstBenefitReasons = BENEFIT_CLOSE_REASONS[selectedBenefits[0]] || [];
        return sharedValues.map(value => firstBenefitReasons.find(r => r.value === value) || { value, label: value });
    }

    function getCloseReasonsForBenefit(benefit) {
        return BENEFIT_CLOSE_REASONS[benefit] || [
            { value: "Already Enrolled", label: "Already Enrolled" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Ineligible - Assets", label: "Ineligible - Assets" },
            ...COMMON_CLOSE_REASONS
        ];
    }

    function mapHardDeterminationReason(benefit, ineligibilityReason) {
        const upper = (ineligibilityReason || '').toUpperCase();

        // Common patterns
        if (upper.includes('ALREADY ENROLLED')) return 'Already Enrolled';
        if (upper.includes('ALREADY APPLIED')) return 'Already Applied';
        if (upper.includes('NOT INTERESTED')) return 'Not Interested';
        if (upper.includes('ENROLLED IN MEDICAID')) return 'Enrolled in Medicaid';
        if (upper.includes('NOT ENROLLED IN MEDICARE')) return 'Not Enrolled in Medicare';

        // Benefit-specific
        const benefitMappings = {
            PACE: () => {
                if (upper.includes('AGE CRITERIA')) return 'Age Criteria Not Met';
                if (upper.includes('RESIDENCY')) return 'Residency Not Met';
                if (upper.includes('INCOME') || upper.includes('INELIGIBLE') || upper.includes('NOT LIKELY')) return 'Ineligible - Income';
                return null;
            },
            LIS: () => {
                if (upper.includes('INCOME')) return 'Ineligible - Income';
                if (upper.includes('ASSETS') || upper.includes('ASSET')) return 'Ineligible - Assets';
                if (upper.includes('NOT LIKELY')) return upper.includes('ASSET') ? 'Ineligible - Assets' : 'Ineligible - Income';
                return null;
            },
            MSP: () => {
                if (upper.includes('INCOME')) return 'Ineligible - Income';
                if (upper.includes('ASSETS') || upper.includes('ASSET')) return 'Ineligible - Assets';
                if (upper.includes('NOT LIKELY')) return upper.includes('ASSET') ? 'Ineligible - Assets' : 'Ineligible - Income';
                return null;
            },
            PTRR: () => {
                if (upper.includes('AGE') || upper.includes('DISABILITY') || upper.includes('WIDOW')) return 'Age/Disability/Widow Criteria Not Met';
                if (upper.includes('NO FORMAL LEASE')) return 'No Formal Lease';
                if (upper.includes('NO RELEVANT EXPENSES')) return 'No Relevant Expenses';
                if (upper.includes('INCOME') || upper.includes('NOT LIKELY')) return 'Ineligible - Income';
                return null;
            }
        };

        const mapper = benefitMappings[benefit];
        if (mapper) {
            const result = mapper();
            if (result) return result;
        }

        return ineligibilityReason || 'Ineligible - Hard Determination';
    }

    // ===== ELIGIBILITY CHECKS =====
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
            // Find spouse via relationships array
            const spouseRelation = member.relationships?.find(r => r.relationship === 'spouse');
            const spouse = spouseRelation
                ? members.find(m => m.householdMemberId === spouseRelation.relatedMemberId)
                : null;
    
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
                if (member.combinedIncome < Utils.PACE_THRESHOLDS.married.pace) {
                    eligibility.push("Likely Eligible for PACE");
                } else if (member.combinedIncome >= Utils.PACE_THRESHOLDS.married.pace && member.combinedIncome <= Utils.PACE_THRESHOLDS.married.pacenet) {
                    eligibility.push("Likely Eligible for PACENET");
                } else if (member.combinedIncome >= Utils.PACE_THRESHOLDS.married.pacenet && member.combinedIncome <= Utils.PACE_THRESHOLDS.married.buffer) {
                    eligibility.push("Likely Ineligible but Within Buffer");
                } else if (member.combinedIncome > Utils.PACE_THRESHOLDS.married.buffer) {
                    eligibility.push("Not Likely Eligible for PACE or PACENET (Income)");
                }
            } else {
                if (member.combinedIncome < Utils.PACE_THRESHOLDS.single.pace) {
                    eligibility.push("Likely Eligible for PACE");
                } else if (member.combinedIncome >= Utils.PACE_THRESHOLDS.single.pace && member.combinedIncome <= Utils.PACE_THRESHOLDS.single.pacenet) {
                    eligibility.push("Likely Eligible for PACENET");
                } else if (member.combinedIncome >= Utils.PACE_THRESHOLDS.single.pacenet && member.combinedIncome <= Utils.PACE_THRESHOLDS.single.buffer) {
                    eligibility.push("Likely Ineligible but Within Buffer");
                } else if (member.combinedIncome > Utils.PACE_THRESHOLDS.single.buffer) {
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
                        eligibility: ["Not Checked"],
                        screeningInProgress: member.LIS?.screeningInProgress ?? false,
                        screeningCloseReason: member.LIS?.screeningCloseReason ?? "Not Applicable"
                    };
                    console.log(`Skipping LIS for deceased member: ${member.firstName} ${member.lastName}`);
                    continue;
                }
    
                const incomes = member.income || [];
                const currentYearIncomes = Utils.filterCurrentIncomes(incomes);
    
                // Calculate total yearly income from current incomes
                let totalIncome = currentYearIncomes.reduce((sum, income) => {
                    const yearlyAmount = Utils.calculateYearlyIncome(
                        income.amount,
                        income.frequency,
                        income.startDate,
                        income.endDate
                    );
                    return sum + yearlyAmount;
                }, 0);
    
                // Calculate total assets
                const assets = member.assets || [];
                const totalAssets = assets.reduce((sum, asset) => sum + Number(asset.value || 0), 0);
    
                member.lisAdjustedIncome = totalIncome;
                member.lisAdjustedAssets = totalAssets;
    
                console.log(`LIS adjusted income for ${member.firstName} ${member.lastName}: $${member.lisAdjustedIncome}`);
                console.log(`LIS adjusted assets for ${member.firstName} ${member.lastName}: $${member.lisAdjustedAssets}`);
            } catch (error) {
                console.error(`Error calculating LIS adjusted income/assets for ${member.firstName} ${member.lastName}:`, error);
            }
        }
    
        // Step 2: Calculate combined income/assets and determine eligibility
        for (const member of members) {
            try {
                if ((member.deceased ?? '').toLowerCase() === 'yes') continue;
    
                // Find spouse via relationships array
                const spouseRelation = member.relationships?.find(r => r.relationship === 'spouse');
                const spouse = spouseRelation
                    ? members.find(m => m.householdMemberId === spouseRelation.relatedMemberId)
                    : null;
                const hasLivingSpouse = spouse && (spouse.deceased ?? '').toLowerCase() !== 'yes';
    
                if (hasLivingSpouse) {
                    console.log(`LIS Spouse found: ${spouse.firstName} ${spouse.lastName}`);
    
                    member.lisCombinedIncome = (Number(member.lisAdjustedIncome) || 0) + (Number(spouse.lisAdjustedIncome) || 0);
                    member.lisCombinedAssets = (Number(member.lisAdjustedAssets) || 0) + (Number(spouse.lisAdjustedAssets) || 0);
    
                    console.log(`LIS Combined income for ${member.firstName} and ${spouse.firstName}: $${member.lisCombinedIncome}`);
                    console.log(`LIS Combined assets for ${member.firstName} and ${spouse.firstName}: $${member.lisCombinedAssets}`);
                } else {
                    member.lisCombinedIncome = member.lisAdjustedIncome || 0;
                    member.lisCombinedAssets = member.lisAdjustedAssets || 0;
                }
    
                // Eligibility determination
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
    
                    const combinedIncome = member.lisCombinedIncome;
                    const combinedAssets = member.lisCombinedAssets;
    
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
                    combinedIncome: Math.max(0, member.lisCombinedIncome || 0),
                    combinedAssets: Math.max(0, member.lisCombinedAssets || 0),
                    eligibility: eligibility,
                    screeningInProgress: member.LIS?.screeningInProgress ?? true,
                    screeningCloseReason: member.LIS?.screeningCloseReason ?? null
                };
    
                // If spouse exists, sync the same combined income/assets/eligibility to spouse
                if (hasLivingSpouse && spouse) {
                    spouse.lisCombinedIncome = member.lisCombinedIncome;
                    spouse.lisCombinedAssets = member.lisCombinedAssets;
                    spouse.LIS = {
                        combinedIncome: member.LIS.combinedIncome,
                        combinedAssets: member.LIS.combinedAssets,
                        eligibility: [...eligibility],
                        screeningInProgress: spouse.LIS?.screeningInProgress ?? true,
                        screeningCloseReason: spouse.LIS?.screeningCloseReason ?? null
                    };
                    console.log(`LIS synced to spouse ${spouse.firstName} ${spouse.lastName}:`, spouse.LIS);
                }
    
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
    
    // Place this after the LISEligibilityCheck function, before PTRREligibilityCheck
    
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
    
                member.mspAdjustedIncome = adjustedMonthlyIncome;
                member.mspGrossMonthlyIncome = totalMonthlyIncome;
                member.mspAdjustedAssets = totalAssets;
    
                console.log(`MSP gross monthly income for ${member.firstName} ${member.lastName}: $${totalMonthlyIncome.toFixed(2)}`);
                console.log(`MSP adjusted monthly income for ${member.firstName} ${member.lastName}: $${adjustedMonthlyIncome.toFixed(2)}`);
                console.log(`MSP adjusted assets for ${member.firstName} ${member.lastName}: $${totalAssets.toFixed(2)}`);
            } catch (error) {
                console.error(`Error calculating MSP adjusted income/assets for ${member.firstName} ${member.lastName}:`, error);
            }
        }
    
        // Step 2: Calculate combined income/assets and determine eligibility
        for (const member of members) {
            try {
                if ((member.deceased ?? '').toLowerCase() === 'yes') continue;
    
                // Find spouse via relationships array
                const spouseRelation = member.relationships?.find(r => r.relationship === 'spouse');
                const spouse = spouseRelation
                    ? members.find(m => m.householdMemberId === spouseRelation.relatedMemberId)
                    : null;
                const hasLivingSpouse = spouse && (spouse.deceased ?? '').toLowerCase() !== 'yes';
    
                if (hasLivingSpouse) {
                    console.log(`MSP Spouse found: ${spouse.firstName} ${spouse.lastName}`);
    
                    member.mspCombinedIncome = (Number(member.mspAdjustedIncome) || 0) + (Number(spouse.mspAdjustedIncome) || 0);
                    member.mspCombinedAssets = (Number(member.mspAdjustedAssets) || 0) + (Number(spouse.mspAdjustedAssets) || 0);
    
                    console.log(`MSP Combined income for ${member.firstName} and ${spouse.firstName}: $${member.mspCombinedIncome.toFixed(2)}`);
                    console.log(`MSP Combined assets for ${member.firstName} and ${spouse.firstName}: $${member.mspCombinedAssets.toFixed(2)}`);
                } else {
                    member.mspCombinedIncome = member.mspAdjustedIncome || 0;
                    member.mspCombinedAssets = member.mspAdjustedAssets || 0;
                }
    
                // Eligibility determination
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
    
                    const combinedIncome = member.mspCombinedIncome;
                    const combinedAssets = member.mspCombinedAssets;
    
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
                    combinedIncome: Math.max(0, member.mspCombinedIncome || 0),
                    combinedAssets: Math.max(0, member.mspCombinedAssets || 0),
                    eligibility: eligibility,
                    screeningInProgress: member.MSP?.screeningInProgress ?? true,
                    screeningCloseReason: member.MSP?.screeningCloseReason ?? null
                };
    
                // If spouse exists, sync the same combined income/assets/eligibility to spouse
                if (hasLivingSpouse && spouse) {
                    spouse.mspCombinedIncome = member.mspCombinedIncome;
                    spouse.mspCombinedAssets = member.mspCombinedAssets;
                    spouse.MSP = {
                        combinedIncome: member.MSP.combinedIncome,
                        combinedAssets: member.MSP.combinedAssets,
                        eligibility: [...eligibility],
                        screeningInProgress: spouse.MSP?.screeningInProgress ?? true,
                        screeningCloseReason: spouse.MSP?.screeningCloseReason ?? null
                    };
                    console.log(`MSP synced to spouse ${spouse.firstName} ${spouse.lastName}:`, spouse.MSP);
                }
    
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
                    const previousYearStart = new Date(`${previousYear}-01-01`);
                    const previousYearEnd = new Date(`${previousYear}-12-31`);
        
                    let totalGrossIncome = previousYearIncomes.reduce((sum, income) => {
                        let yearlyAmount = calculateYearlyIncome(
                            income.amount,
                            income.frequency,
                            income.startDate,
                            income.endDate
                        );
                    
                        if (
                            Utils.PTRR_THRESHOLDS.halfIncomeTypes.includes(income.kind?.toLowerCase())
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
                    } else if (!member.residenceStatus || member.residenceStatus.toLowerCase() === "n/a") {
                        eligibility.push("Needs Previous Year Residence Status");
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

    async function SNAPEligibilityCheck(members, isFarmworker) {
        // Group members into SNAP households
        const snapHouseholds = [];
        const processedMembers = new Set();

        for (const member of members) {
            if (processedMembers.has(member.householdMemberId)) continue;

            if (member.meals?.toLowerCase() === "yes") {
                const snapHousehold = [member];
                processedMembers.add(member.householdMemberId);

                for (const other of members) {
                    if (other.householdMemberId !== member.householdMemberId && other.meals?.toLowerCase() === "yes") {
                        snapHousehold.push(other);
                        processedMembers.add(other.householdMemberId);
                    }
                }
                snapHouseholds.push(snapHousehold);
            }
        }

        // Process each household
        for (const household of snapHouseholds) {
            try {
                let combinedYearlyIncome = 0;
                let combinedAssets = 0;
                let totalUtilityAllowance = 0;
                let totalShelterExpenses = 0;
                let totalMedicalExpenses = 0;
                let totalOtherExpenses = 0;
                const householdSize = household.length;

                for (const member of household) {
                    const currentIncomes = filterCurrentIncomes(member.income);
                    combinedYearlyIncome += currentIncomes.reduce((sum, income) => 
                        sum + calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate), 0);

                    combinedAssets += (member.assets || []).reduce((sum, asset) => sum + Number(asset.value), 0);

                    // Calculate utility allowance once
                    if (totalUtilityAllowance === 0) {
                        totalUtilityAllowance = calculateUtilityAllowance(member, client?.homelessness === 'yes');
                    }

                    // Calculate shelter expenses once
                    if (totalShelterExpenses === 0) {
                        totalShelterExpenses = (member.expenses || [])
                            .filter(e => e.type?.toLowerCase() === "shelter")
                            .reduce((sum, e) => sum + calculateYearlyIncome(e.amount, e.frequency, e.startDate, e.endDate) / 12, 0);
                    }

                    // Calculate medical expenses once
                    if (totalMedicalExpenses === 0) {
                        const medExpenses = (member.expenses || [])
                            .filter(e => e.type?.toLowerCase() === "medical")
                            .reduce((sum, e) => sum + calculateYearlyIncome(e.amount, e.frequency, e.startDate, e.endDate) / 12, 0);
                        totalMedicalExpenses = medExpenses >= SNAP_MEDICAL_EXPENSE_THRESHOLD ? medExpenses : 0;
                    }

                    // Calculate other expenses once
                    if (totalOtherExpenses === 0) {
                        totalOtherExpenses = (member.expenses || [])
                            .filter(e => e.type?.toLowerCase() === "other")
                            .reduce((sum, e) => sum + calculateYearlyIncome(e.amount, e.frequency, e.startDate, e.endDate) / 12, 0);
                    }
                }

                const combinedMonthlyIncome = combinedYearlyIncome / 12;
                const standardDeduction = SNAP_STANDARD_DEDUCTIONS[householdSize] || 0;

                // Calculate employment income separately for 20% deduction
                const employmentIncomeMonthly = household.reduce((sum, member) => {
                    return sum + filterCurrentIncomes(member.income)
                        .filter(i => i.kind === "Employment" || i.kind === "Self-Employment")
                        .reduce((s, i) => s + calculateYearlyIncome(i.amount, i.frequency, i.startDate, i.endDate) / 12, 0);
                }, 0);

                const otherIncomeMonthly = household.reduce((sum, member) => {
                    return sum + filterCurrentIncomes(member.income)
                        .filter(i => i.kind !== "Employment" && i.kind !== "Self-Employment")
                        .reduce((s, i) => s + calculateYearlyIncome(i.amount, i.frequency, i.startDate, i.endDate) / 12, 0);
                }, 0);

                const adjustedMonthlyIncome = (employmentIncomeMonthly * 0.8) + otherIncomeMonthly;
                let totalNetIncome = Math.max(0, adjustedMonthlyIncome - standardDeduction - totalMedicalExpenses - totalOtherExpenses);

                // Calculate excess shelter cost
                const halfPrelimNetIncome = totalNetIncome / 2;
                let excessShelterCost = Math.max(0, totalShelterExpenses + totalUtilityAllowance - halfPrelimNetIncome);

                // Check for elderly or disabled
                const hasElderlyOrDisabled = household.some(member => {
                    const { years } = parseAge(member.age);
                    return years >= 60 || member.disability?.toLowerCase() === "yes";
                });

                if (!hasElderlyOrDisabled) {
                    excessShelterCost = Math.min(excessShelterCost, SNAP_SHELTER_COST_CAP);
                }

                totalNetIncome = Math.max(0, totalNetIncome - excessShelterCost);

                // Determine eligibility
                const grossIncomeLimit = SNAP_GROSS_INCOME_LIMITS[householdSize] || 0;
                let snapEligibility;

                if (combinedMonthlyIncome <= grossIncomeLimit) {
                    snapEligibility = ["Likely Eligible for SNAP"];
                } else if (hasElderlyOrDisabled) {
                    const netIncomeLimit = SNAP_NET_INCOME_LIMITS[householdSize] || 0;
                    if (combinedAssets > SNAP_ELDERLY_DISABLED_ASSET_LIMIT) {
                        snapEligibility = ["Not Likely Eligible for SNAP (Income and Assets)"];
                    } else if (totalNetIncome <= netIncomeLimit) {
                        snapEligibility = ["Likely Eligible for SNAP"];
                    } else {
                        snapEligibility = ["Not Likely Eligible for SNAP (Income)"];
                    }
                } else {
                    snapEligibility = ["Not Likely Eligible for SNAP (Income)"];
                }

                const snapBenefit = calculateSNAPBenefit(totalNetIncome, householdSize, snapEligibility[0]);
                const hasActiveIncome = household.some(m => filterCurrentIncomes(m.income).length > 0);

                // Assign to all household members
                household.forEach(member => {
                    if (member.meals?.toLowerCase() === "yes") {
                        member.SNAP = {
                            combinedMonthlyIncome,
                            combinedAssets,
                            eligibility: snapEligibility,
                            householdSize,
                            totalNetIncome,
                            totalUtilityAllowance,
                            totalShelterExpenses,
                            totalMedicalExpenses,
                            totalOtherExpenses,
                            standardDeduction,
                            excessShelterCost,
                            benefitAmount: snapBenefit,
                            expeditedEligibility: determineExpeditedEligibility(
                                combinedMonthlyIncome, combinedAssets, totalUtilityAllowance, 
                                totalShelterExpenses, isFarmworker, hasActiveIncome
                            )
                        };
                    }
                });
            } catch (error) {
                console.error('Error processing SNAP household:', error);
            }
        }

        await saveHouseholdMembers(members);
    }

    async function LIHEAPEligibilityCheck() {
        try {
            const clientData = await fetchClient();
            if (!clientData?.householdMembers) return;

            const members = clientData.householdMembers;
            const activeMembersForLIHEAP = members.filter(m => (m.deceased ?? '').toLowerCase() !== 'yes');

            let combinedYearlyIncome = 0;

            for (const member of activeMembersForLIHEAP) {
                const currentIncomes = filterCurrentIncomes(member.income);
                const yearlyIncome = currentIncomes.reduce((sum, income) => 
                    sum + calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate), 0);

                // Medicare premium deduction
                let medicarePremiumDeduction = 0;
                for (const expense of member.expenses || []) {
                    const isMedicarePremium = expense.kind?.toLowerCase().includes('medicare') && 
                                              expense.kind?.toLowerCase().includes('premium');
                    const isDeductedFromSSOrPension = expense.deductedFromSSOrPension?.toLowerCase() === 'yes';

                    if (isMedicarePremium && isDeductedFromSSOrPension) {
                        const startDate = new Date(expense.startDate);
                        const endDate = new Date(expense.endDate);
                        const today = new Date();
                        const currentYear = today.getFullYear();
                        const yearStart = new Date(`${currentYear}-01-01`);
                        const yearEnd = new Date(`${currentYear}-12-31`);

                        const effectiveStart = startDate > yearStart ? startDate : yearStart;
                        const effectiveEnd = endDate < yearEnd ? endDate : yearEnd;

                        if (effectiveStart <= effectiveEnd && effectiveStart <= today) {
                            const cappedEnd = effectiveEnd > today ? today : effectiveEnd;
                            const daysActive = Math.max(0, Math.floor((cappedEnd - effectiveStart) / (1000 * 60 * 60 * 24)) + 1);
                            const yearlyAmount = expense.amount * getYearlyMultiplier(expense.frequency);
                            if (yearlyAmount > 0) {
                                medicarePremiumDeduction += yearlyAmount * (daysActive / 365);
                            }
                        }
                    }
                }

                combinedYearlyIncome += Math.max(0, yearlyIncome - medicarePremiumDeduction);
            }

            // Determine eligibility
            const householdSize = activeMembersForLIHEAP.length;
            const incomeLimit = LIHEAP_INCOME_LIMITS[householdSize] || 0;
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
            } else if (clientData.heatingCrisis === 'yes' && combinedYearlyIncome <= incomeLimit) {
                eligibility.push("Likely Eligible for LIHEAP (Crisis)");
            } else if (clientData.heatingCrisis === 'yes' && combinedYearlyIncome > incomeLimit) {
                eligibility.push("Not Likely Eligible for LIHEAP but Submission Recommended");
            } else if (combinedYearlyIncome <= incomeLimit) {
                eligibility.push("Likely Eligible for LIHEAP");
            } else {
                eligibility.push("Not Likely Eligible for LIHEAP (Income)");
            }

            // Update only non-deceased members
            activeMembersForLIHEAP.forEach(member => {
                member.LIHEAP = { combinedYearlyIncome, eligibility };
            });

            await saveHouseholdMembers(members);
        } catch (error) {
            console.error('Error processing LIHEAP eligibility:', error);
        }
    }

    // ===== BENEFIT APPLICATION UPDATES =====
    async function updateMemberBenefits(members, benefit, newApplyingState, memberId = null) {
        if (!BENEFIT_KEYS.includes(benefit)) {
            console.warn(`updateMemberBenefits does not handle ${benefit}.`);
            return;
        }

        if (benefit === 'SNAP') {
            members.filter(m => m.meals?.toLowerCase() === "yes").forEach(member => {
                member.SNAP = member.SNAP || {};
                member.SNAP.application = member.SNAP.application || [];
                if (member.SNAP.application.length === 0) {
                    member.SNAP.application.push({ applying: newApplyingState });
                } else {
                    member.SNAP.application.forEach(app => { app.applying = newApplyingState; });
                }
            });
        } else if (benefit === 'LIHEAP') {
            members.forEach(member => {
                member.LIHEAP = member.LIHEAP || {};
                member.LIHEAP.application = member.LIHEAP.application || [];
                if (member.LIHEAP.application.length === 0) {
                    member.LIHEAP.application.push({ applying: newApplyingState });
                } else {
                    member.LIHEAP.application.forEach(app => { app.applying = newApplyingState; });
                }
            });
        } else if (memberId) {
            const member = members.find(m => String(m.householdMemberId) === String(memberId));
            if (!member) {
                console.error(`Member with ID ${memberId} not found.`);
                return;
            }

            member[benefit] = member[benefit] || {};
            member[benefit].application = member[benefit].application || [];

            // Check if apply button is displayed
            const benefitButton = document.querySelector(`.benefit-apply-button[data-benefit="${benefit}"][data-member-id="${memberId}"]`);
            const isButtonDisplayed = benefitButton && benefitButton.style.display !== 'none';

            if (!isButtonDisplayed) {
                newApplyingState = false;
            }

            if (newApplyingState) {
                if (!member[benefit].application.some(app => app.applying)) {
                    member[benefit].application.push({ applying: true });
                }
            } else {
                member[benefit].application = member[benefit].application.filter(app => !app.applying);
            }
        }

        await saveHouseholdMembers(members);
    }

    async function updateSaveContinueButtonVisibility() {
        const members = await loadHouseholdMembers();
        const hasApplyingTrue = members.some(member =>
            Object.values(member).some(benefit =>
                benefit?.application?.some(app => app.applying === true)
            )
        );

        const saveContinueButton = document.getElementById('save-continue');
        if (saveContinueButton) {
            const previousDisplay = saveContinueButton.style.display;
            saveContinueButton.style.display = hasApplyingTrue ? 'block' : 'none';
            if (previousDisplay === 'block' && saveContinueButton.style.display === 'none') {
                location.reload();
            }
        }
    }

    // ===== SCREENING CLOSE/REOPEN =====
    async function checkAndAutoTerminateScreening(members) {
        const currentClient = await fetchClient();
        if (!currentClient || currentClient.screeningInProgress !== true) return;

        const allClosed = members.every(member => {
            return BENEFIT_KEYS.every(benefit => {
                const benefitObj = member[benefit];
                if (!benefitObj) return true;
                
                const autoCloseEligibilities = [
                    'Not Checked', 'Not Enrolled in Medicare', 'Enrolled in Medicaid',
                    'Age Criteria Not Met', 'No Formal Lease', 'Not Interested',
                    'Already Enrolled', 'Already Applied'
                ];
                
                if (benefitObj.eligibility?.some(e => autoCloseEligibilities.includes(e))) return true;
                return benefitObj.screeningInProgress === false;
            });
        });

        if (allClosed) {
            try {
                const updateResponse = await fetch('/update-client', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientId, clientData: { screeningInProgress: false } })
                });

                if (updateResponse.ok) {
                    await renderNotesContainer();
                    if (typeof loadScreeningButtons === 'function') loadScreeningButtons();
                    console.log('All screenings closed — screening auto-terminated.');
                }
            } catch (error) {
                console.error('Error auto-terminating screening:', error);
            }
        }
    }

        // ===== CLIENT PROGRAM STATUS UPDATE =====
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
                    throw new Error('Failed to update client program status');
                }
    
                return true;
            } catch (error) {
                console.error(`Error updating client program status for ${benefit}:`, error);
                return false;
            }
        }

        async function reopenBenefitScreening(benefit, memberIds, displayName) {
            try {
                const clientData = await fetchClient();
                const currentMembers = clientData?.householdMembers || [];
        
                for (const member of currentMembers) {
                    if (memberIds.includes(String(member.householdMemberId)) && member[benefit]) {
                        member[benefit].screeningInProgress = true;
                        member[benefit].screeningCloseReason = null;
                    }
                }
        
                if (!await saveHouseholdMembers(currentMembers)) return;
        
                // Update client-level program status for SNAP and LIHEAP
                if (benefit === 'SNAP' || benefit === 'LIHEAP') {
                    await updateClientProgramStatus(clientId, benefit, true);
                }
        
                // Set client-level screeningInProgress to true
                await fetch('/update-client', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientId, clientData: { screeningInProgress: true } })
                });
        
                const noteText = benefit === 'SNAP' ? '<strong>SNAP screening reopened.</strong>' :
                               benefit === 'LIHEAP' ? '<strong>LIHEAP screening reopened.</strong>' :
                               `<strong>${benefit} screening reopened for ${displayName}.</strong>`;
        
                await addNoteToClient(clientId, noteText);  // Fixed: Added missing clientId argument
                await renderNotesContainer();
        
                if (typeof loadScreeningButtons === 'function') loadScreeningButtons();
        
                await displayHouseholdMembers();
                await displaySNAPHouseholds();
                await displayLIHEAPHouseholds();
            } catch (error) {
                console.error(`Error reopening ${benefit} screening:`, error);
            }
        }

    // ===== HTML GENERATORS =====
    function generateFlipHintHtml(isEligible) {
        return `
            <div class="benefit-flip-hint" style="
                position: absolute;
                top: 4px;
                right: 8px;
                font-size: 32px;
                color: #000;
                cursor: pointer;
                display: ${isEligible ? 'block' : 'none'};
            ">↻</div>
        `;
    }

    function generateBenefitApplyButton(benefit, memberId, bObj, isScreeningInProgress) {
        const shouldHide = bObj.eligibility?.some(e => 
            e.includes('Not') || e.toLowerCase().includes('needs') || 
            e.toLowerCase().includes('no') || e.toLowerCase().includes('already')
        );
        
        const isApplying = bObj.application?.some(app => app.applying);
        
        return `
            <button class="benefit-apply-button" data-benefit="${benefit}" data-member-id="${memberId}" 
                style="display: ${!isScreeningInProgress || shouldHide ? 'none' : 'block'}; margin: 0 auto">
                ${isApplying ? `Stop Applying` : `Apply for ${benefit}`}
            </button>
        `;
    }

    function generateScreeningClosedBox(benefit, benefitObj, memberId, memberFullName) {
        if (!benefitObj || benefitObj.screeningInProgress !== false) return '';
        
        return `
            <div style="background-color:rgb(212, 212, 212); border: 1px solid rgb(0, 0, 0); padding: 8px; border-radius: 4px; margin: 8px 0; text-align: center; width: 100%; box-sizing: border-box;">
                <p style="margin: 0 0 6px 0;"><strong>${benefit} Screening Closed</strong></p>
                <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${benefitObj.screeningCloseReason || 'N/A'}</p>
                <button class="reopen-benefit-btn" 
                    data-benefit="${benefit}" 
                    data-member-ids="${memberId}" 
                    data-display-name="${memberFullName}"
                    style="background-color: #007bff; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: background-color 0.3s;"
                    onmouseover="this.style.backgroundColor='#0056b3'" 
                    onmouseout="this.style.backgroundColor='#007bff'">
                    Reopen ${benefit} Screening
                </button>
            </div>
        `;
    }

    function generateBenefitFlipCard(benefit, member, isScreeningInProgress) {
        const bObj = member[benefit];
        if (!bObj || bObj.eligibility?.includes('Not Checked')) return '';

        const eligArray = bObj.eligibility?.map(capitalizeFirstLetter) || [];
        const isNotElig = isNotEligible(bObj.eligibility);
        const needsInfoFlag = needsInfo(bObj.eligibility);
        const isLikely = !isNotElig && !needsInfoFlag;
        const { bg: bgColor, border: borderColor } = getCardColors(bObj.eligibility);
        const isEligible = isLikelyEligible(bObj.eligibility);

        const incomeLabel = benefit === 'PACE' ? 'Gross Adjusted Income' : 
                           benefit === 'PTRR' ? 'Gross Income' : 'Gross Income';
        const showAssets = ['LIS', 'MSP'].includes(benefit);

        return `
            <div class="benefit-flip-card" data-benefit="${benefit}" data-member-id="${member.householdMemberId}" style="
                perspective: 1000px;
                width: 100%;
                margin: 8px 0;
            ">
                <div class="benefit-flip-card-inner" style="
                    position: relative;
                    width: 100%;
                    transition: transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1);
                    transform-style: preserve-3d;
                ">
                    <!-- FRONT SIDE -->
                    <div class="benefit-flip-card-front" style="
                        backface-visibility: hidden;
                        -webkit-backface-visibility: hidden;
                        background-color: ${bgColor};
                        border: 1px solid ${borderColor};
                        border-radius: 4px;
                        padding: 8px;
                        position: relative;
                        z-index: 1;
                        width: 100%;
                        box-sizing: border-box;
                    ">
                        ${generateFlipHintHtml(isEligible)}
                        <details class="custom-details" style="background-color: ${bgColor}; border-radius: 4px; padding: 8px; width: 100%; box-sizing: border-box;">
                            <summary><br><strong>${benefit}</strong><br> 
                            <p><strong></strong> ${eligArray.join(', ') || 'Not Available'}<br><br></summary></p>
                            <hr class="separator-bar">
                            <p><strong>${incomeLabel}:</strong> $${bObj.combinedIncome?.toFixed(2) || 'N/A'}</p>
                            ${showAssets ? `<p><strong>Combined Assets:</strong> $${bObj.combinedAssets?.toFixed(2) || 'N/A'}</p>` : ''}
                        </details>
                        ${generateBenefitApplyButton(benefit, member.householdMemberId, bObj, isScreeningInProgress)}
                    </div>

                    <!-- BACK SIDE -->
                    <div class="benefit-flip-card-back" style="
                        backface-visibility: hidden;
                        -webkit-backface-visibility: hidden;
                        transform: rotateY(180deg);
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        box-sizing: border-box;
                        background-color: ${bgColor};
                        border: 1px solid ${borderColor};
                        border-radius: 4px;
                        padding: 8px;
                    ">
                        <div class="benefit-flip-hint benefit-flip-back-hint" style="
                            position: absolute;
                            top: 4px;
                            right: 8px;
                            font-size: 32px;
                            color: #000;
                            cursor: pointer;
                            display: ${isEligible ? 'block' : 'none'};
                        ">↻</div>
                        <br><strong>${benefit}</strong>
                        <hr class="separator-bar">
                        <p><em>ESTIMATED ELIGIBILITY SCRIPTING</em></p>
                        <br>
                        ${generateBenefitApplyButton(benefit, member.householdMemberId, bObj, isScreeningInProgress)}
                    </div>
                </div>
            </div>
        `;
    }

    function attachBenefitButtonListeners() {
        document.querySelectorAll('.benefit-apply-button').forEach(btn => {
            // Skip if already has listener
            if (btn.dataset.listenerAttached === 'true') return;
            btn.dataset.listenerAttached = 'true';

            btn.addEventListener('click', async (event) => {
                event.stopPropagation();
                if (btn.dataset.processing === 'true') return;
                btn.dataset.processing = 'true';

                const benefit = btn.dataset.benefit;
                const memberId = btn.dataset.memberId;
                const newApplyingState = btn.textContent.trim().startsWith('Apply');

                const freshMembers = await loadHouseholdMembers();

                if (benefit === 'SNAP') {
                    await updateMemberBenefits(freshMembers, 'SNAP', newApplyingState);
                    await displaySNAPHouseholds();
                } else if (benefit === 'LIHEAP') {
                    await updateMemberBenefits(freshMembers, 'LIHEAP', newApplyingState);
                    await displayLIHEAPHouseholds();
                } else if (memberId) {
                    await updateMemberBenefits(freshMembers, benefit, newApplyingState, memberId);
                    await displayHouseholdMembers();
                }

                await updateSaveContinueButtonVisibility();
                btn.dataset.processing = 'false';
            });
        });
    }

    // ===== DISPLAY FUNCTIONS =====
    async function displayHouseholdMembers() {
        const householdMemberContainer = document.getElementById('household-members-container');
        const members = await loadHouseholdMembers();

        let isScreeningInProgress = false;
        try {
            const clientRes = await fetch(`/get-client/${clientId}`);
            if (clientRes.ok) {
                const clientData = await clientRes.json();
                isScreeningInProgress = clientData.screeningInProgress === true;
            }
        } catch (e) {
            console.error('Error fetching client screening status:', e);
        }

        householdMemberContainer.innerHTML = '';

        if (members.length === 0) {
            householdMemberContainer.innerHTML = '<p>No household members found.</p>';
            return;
        }

        members.sort((a, b) => b.headOfHousehold - a.headOfHousehold);

        members.forEach(member => {
            const memberDiv = document.createElement('div');
            memberDiv.classList.add('household-member-box');

            const memberId = String(member.householdMemberId);
            const memberFullName = `${capitalizeFirstLetter(member.firstName)} ${capitalizeFirstLetter(member.lastName)}`;
            const isDeceased = (member.deceased ?? '').toLowerCase() === 'yes';

            // Determine open benefits for this member
            const openBenefits = [];
            INDIVIDUAL_BENEFITS.forEach(benefit => {
                if (benefit !== 'PTRR' && isDeceased) return;
                const bObj = member[benefit];
                if (!bObj || bObj.screeningInProgress === false) return;
                if (bObj.eligibility?.length > 0) openBenefits.push(benefit);
            });

            // Build benefit sections
            const benefitSections = [];

            // Process individual benefits
            INDIVIDUAL_BENEFITS.forEach(benefit => {
                if (isDeceased && benefit !== 'PTRR') return;
                if (benefit === 'PTRR' && !member.headOfHousehold) return;
                if (benefit === 'PTRR' && isDeceased) return;

                const bObj = member[benefit];
                if (!bObj) return;

                if (bObj.screeningInProgress === false) {
                    benefitSections.push({
                        closed: true,
                        html: generateScreeningClosedBox(benefit, bObj, memberId, memberFullName)
                    });
                } else if (!bObj.eligibility?.includes('Not Checked')) {
                    const html = generateBenefitFlipCard(benefit, member, isScreeningInProgress);
                    if (html) benefitSections.push({ closed: false, html });
                }
            });

            // Sort: open benefits first, closed benefits last
            benefitSections.sort((a, b) => a.closed - b.closed);

            // Find spouse name
            const spouse = findSpouse(member, members);
            const spouseName = spouse 
                ? `${capitalizeFirstLetter(spouse.firstName)} ${capitalizeFirstLetter(spouse.lastName)}`
                : null;

            memberDiv.innerHTML = `
                <div class="member-badge-area" style="min-height: 40px; display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap;">
                    ${member.headOfHousehold ? `<p class="household-member-info" style="color: black; border: 2px solid black; padding: 5px; display: inline-block; margin: 0;"><strong>Head of Household</strong></p>` : ''}
                    ${isDeceased ? `<p class="household-member-info" style="color: black; border: 2px solid black; padding: 5px; display: inline-block; margin: 0;"><strong>Deceased</strong></p>` : ''}
                </div>
                <h3>${memberFullName}${member.middleInitial ? ` ${capitalizeFirstLetter(member.middleInitial)}` : ''}</h3>
                <p><strong>Age:</strong> ${member.age?.split('Y')[0] || 'N/A'}</p>
                <p><strong>Marital Status:</strong> ${capitalizeFirstLetter(member.maritalStatus || 'N/A')}</p>
                ${spouseName ? `<p><strong>Spouse:</strong> ${spouseName}</p>` : ''}
                <br>
                <button class="btn-close-member-screening" data-member-id="${memberId}" style="
                    display: ${isScreeningInProgress ? 'inline-block' : 'none'};
                    background-color: #dc3545;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 8px 16px;
                    font-size: 13px;
                    cursor: pointer;
                    transition: background-color 0.3s;
                " onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Close Screening(s)</button>
                ${benefitSections.map(s => s.html).join('')}
            `;

            householdMemberContainer.appendChild(memberDiv);

            // Initialize flip cards
            initializeFlipCards(memberDiv);

            // Clean up PTRR application state if button is hidden
            const ptrrButton = memberDiv.querySelector(`.benefit-apply-button[data-benefit="PTRR"][data-member-id="${memberId}"]`);
            if (ptrrButton && ptrrButton.style.display === 'none') {
                member.PTRR.application = member.PTRR.application.filter(app => !app.applying);
            }
        });

        // Save updated members
        await saveHouseholdMembers(members);

        // Attach event listeners
        attachBenefitButtonListeners();
        attachCloseMemberScreeningListeners(members);
        attachReopenBenefitListeners();

        // Check for auto-termination
        await checkAndAutoTerminateScreening(members);
    }

    function initializeFlipCards(container) {
        const flipCards = container.querySelectorAll('.benefit-flip-card');
        flipCards.forEach(flipCard => {
            setupFlipCard(flipCard, {
                frontSelector: '.benefit-flip-card-front',
                backSelector: '.benefit-flip-card-back',
                hintSelector: '.benefit-flip-hint',
                backHintSelector: '.benefit-flip-back-hint',
                detailsSelector: 'details'
            });
        });
    }

    function attachReopenBenefitListeners() {
        document.querySelectorAll('.reopen-benefit-btn').forEach(btn => {
            btn.addEventListener('click', async (event) => {
                const benefit = event.target.dataset.benefit;
                const memberIds = event.target.dataset.memberIds.split(',');
                const displayName = event.target.dataset.displayName;
                await reopenBenefitScreening(benefit, memberIds, displayName);
            });
        });
    }

        function attachCloseMemberScreeningListeners(members) {
            document.querySelectorAll('.btn-close-member-screening').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const memberId = btn.dataset.memberId;
                    const freshMembers = await loadHouseholdMembers();
                    openCloseMemberModal(clientId, freshMembers, memberId, null, null);
                });
            });
        }

        // Helper function to map SNAP hard determination reasons
        function mapSnapHardDeterminationReason(eligibilityArray, clientSnap) {
            const eligStr = (eligibilityArray || []).join(' ').toUpperCase();
            
            if (clientSnap === 'yes') return 'Already Enrolled';
            if (clientSnap === 'notinterested') return 'Not Interested';
            if (eligStr.includes('ALREADY ENROLLED')) return 'Already Enrolled';
            if (eligStr.includes('NOT INTERESTED')) return 'Not Interested';
            if (eligStr.includes('INCOME AND ASSETS') || (eligStr.includes('INCOME') && eligStr.includes('ASSETS'))) return 'Ineligible - Income and Assets';
            if (eligStr.includes('ASSETS') && eligStr.includes('NOT LIKELY')) return 'Ineligible - Income and Assets';
            if (eligStr.includes('INCOME') && eligStr.includes('NOT LIKELY')) return 'Ineligible - Income';
            if (eligStr.includes('NOT LIKELY')) return 'Ineligible - Income';
            
            return 'Ineligible - Income';
        }
    
        // Helper function to map LIHEAP hard determination reasons
        function mapLiheapHardDeterminationReason(eligibilityArray, clientData) {
            const eligStr = (eligibilityArray || []).join(' ').toUpperCase();
            
            if (clientData?.liheapEnrollment === 'yes' && clientData?.heatingCrisis === 'no') return 'Already Enrolled';
            if (clientData?.liheapEnrollment === 'notinterested') return 'Not Interested';
            if (eligStr.includes('ALREADY ENROLLED')) return 'Already Enrolled';
            if (eligStr.includes('NOT INTERESTED')) return 'Not Interested';
            if (eligStr.includes('HEATING COST INCLUDED') || (clientData?.subsidizedHousing === 'yes' && clientData?.heatingCost === 'yes')) {
                return 'Subsidized Housing and No Heating Responsibility';
            }
            if (eligStr.includes('INCOME') && eligStr.includes('NOT LIKELY')) return 'Ineligible - Income';
            if (eligStr.includes('NOT LIKELY')) return 'Ineligible - Income';
            
            return 'Ineligible - Income';
        }

    // ===== SNAP DISPLAY =====
    async function displaySNAPHouseholds() {
        const snapContainer = document.getElementById('snap-household-container');
        if (!snapContainer) {
            console.error('snap-household-container element not found.');
            return;
        }

        const members = await loadHouseholdMembers();
        let isScreeningInProgress = false;
        let clientData = null;

        try {
            const clientRes = await fetch(`/get-client/${clientId}`);
            if (clientRes.ok) {
                clientData = await clientRes.json();
                isScreeningInProgress = clientData.screeningInProgress === true;
            }
        } catch (e) {
            console.error('Error fetching client screening status:', e);
        }

        snapContainer.innerHTML = '';

        // Check if SNAP screening is closed at CLIENT level (programStatus)
        const snapMembers = members.filter(m => m.meals?.toLowerCase() === "yes");
        const snapProgramStatus = clientData?.programStatus?.SNAP;
        const screeningClosed = snapProgramStatus?.screeningInProgress === false;

        if (screeningClosed) {
            // Show only the reopen button with grey styling matching other closed benefits
            const reopenDiv = document.createElement('div');
            reopenDiv.classList.add('household-member-box');
            reopenDiv.style.backgroundColor = 'rgb(212, 212, 212)';
            reopenDiv.style.borderColor = 'rgb(0, 0, 0)';
            reopenDiv.innerHTML = `
                <h3>SNAP HOUSEHOLD</h3>
                ${snapMembers.length > 0 ? `<p><strong>Members:</strong> ${snapMembers.map(m => `${capitalizeFirstLetter(m.firstName)} ${capitalizeFirstLetter(m.lastName)}`).join(', ')}</p>` : ''}
                <div style="padding: 8px; border-radius: 4px; margin: 8px 0; text-align: center; width: 100%; box-sizing: border-box;">
                    <p style="margin: 0 0 6px 0;"><strong>SNAP Screening Closed</strong></p>
                    <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${snapProgramStatus?.screeningCloseReason || 'N/A'}</p>
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
                const snapMemberIds = members.map(m => String(m.householdMemberId));
                await reopenBenefitScreening('SNAP', snapMemberIds, 'SNAP Household');
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
            noHouseholdsDiv.style.backgroundColor = (isAlreadyEnrolled || isNotInterested) ? '#f8d7da' : '#fff3cd';
            noHouseholdsDiv.style.borderColor = (isAlreadyEnrolled || isNotInterested) ? '#f5c6cb' : '#ffc107';
            noHouseholdsDiv.innerHTML = `
                <h3>SNAP HOUSEHOLD</h3>
                ${isAlreadyEnrolled ? '<p>ALREADY ENROLLED</p>' : isNotInterested ? '<p>NOT INTERESTED</p>' : '<p>NO SNAP HOUSEHOLDS FOUND.</p>'}
                ${isScreeningInProgress ? `
                    <button class="close-snap-no-household-btn" 
                        style="background-color: #dc3545; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 11px; cursor: pointer; margin: 8px 0;">
                        Close Screening(s)
                    </button>
                ` : ''}
            `;
            snapContainer.appendChild(noHouseholdsDiv);

            // Attach close button listener if screening is in progress
            const closeBtn = noHouseholdsDiv.querySelector('.close-snap-no-household-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', async () => {
                    const freshMembers = await loadHouseholdMembers();
                    openCloseMemberModal(clientId, freshMembers, null, null, 'SNAP');
                });
            }

            return;
        }

        snapHouseholds.forEach(household => {
            const householdDiv = createSNAPHouseholdCard(household, isScreeningInProgress);
            snapContainer.appendChild(householdDiv);
        });
    }

    function createSNAPHouseholdCard(household, isScreeningInProgress) {
        const snapMemberIds = household.map(m => String(m.householdMemberId));
        const snapMemberNames = household.map(m => 
            `${capitalizeFirstLetter(m.firstName)} ${capitalizeFirstLetter(m.lastName)}`
        ).join(', ');

        const snapData = household[0]?.SNAP || {};
        const isSnapScreeningClosed = snapData.screeningInProgress === false;

        const householdDiv = document.createElement('div');

        if (isSnapScreeningClosed) {
            householdDiv.classList.add('household-member-box');
            householdDiv.innerHTML = `
                <h3>SNAP HOUSEHOLD</h3>
                <p><strong>Members:</strong> ${snapMemberNames}</p>
                <div style="background-color:rgb(212, 212, 212); border: 1px solid rgb(0, 0, 0); padding: 8px; border-radius: 4px; margin: 8px 0; text-align: center; width: 100%; box-sizing: border-box;">
                    <p style="margin: 0 0 6px 0;"><strong>SNAP Screening Closed</strong></p>
                    <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${snapData.screeningCloseReason || 'N/A'}</p>
                    <button class="reopen-benefit-btn" 
                        data-benefit="SNAP" 
                        data-member-ids="${snapMemberIds.join(',')}" 
                        data-display-name="SNAP Household"
                        style="background-color: #007bff; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 12px; cursor: pointer;">
                        Reopen SNAP Screening
                    </button>
                </div>
            `;

            householdDiv.querySelector('.reopen-benefit-btn')?.addEventListener('click', async () => {
                await reopenBenefitScreening('SNAP', snapMemberIds, 'SNAP Household');
            });

            return householdDiv;
        }

        // Active SNAP card
        const eligibility = snapData.eligibility?.map(capitalizeFirstLetter) || ['Not Available'];
        const { bg: cardBgColor, border: cardBorderColor } = getCardColors(snapData.eligibility);
        const snapIsLikelyEligible = isLikelyEligible(snapData.eligibility);
        const snapIsNotEligible = isNotEligible(snapData.eligibility);
        const ineligibilityReason = snapIsNotEligible 
            ? (snapData.eligibility?.find(e => isNotEligible([e])) || '')
            : '';

        householdDiv.classList.add('snap-flip-card');
        householdDiv.style.cssText = 'perspective: 1000px; width: 100%; margin-bottom: 16px;';

        const benefitAmount = snapData.benefitAmount || 0;
        const expeditedEligibility = snapData.expeditedEligibility || 'N/A';

        householdDiv.innerHTML = `
            <div class="snap-flip-card-inner" style="
                position: relative;
                width: 100%;
                transition: transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1);
                transform-style: preserve-3d;
            ">
                <!-- FRONT SIDE -->
                <div class="snap-flip-card-front household-member-box" style="
                    backface-visibility: hidden;
                    background-color: ${cardBgColor};
                    border-color: ${cardBorderColor};
                    position: relative;
                    z-index: 1;
                ">
                    <div class="snap-flip-hint" style="
                        position: absolute;
                        top: 8px;
                        right: 12px;
                        font-size: 44px;
                        color: #000;
                        cursor: pointer;
                        display: ${snapIsLikelyEligible ? 'block' : 'none'};
                    ">↻</div>
                    <details class="custom-details" style="background-color: ${cardBgColor}; border-radius: 4px; padding: 8px; margin: 8px 0; width: 100%; box-sizing: border-box;">
                        <summary><br><strong>SNAP HOUSEHOLD</strong><br>
                        <p><strong>Members:</strong> ${snapMemberNames}</p>
                        <p><strong>Eligibility:</strong> ${eligibility.join(', ')}</p>
                        ${snapIsLikelyEligible && benefitAmount >= 0 ? `
                            <p><strong>Estimated Benefit Amount:</strong> ${benefitAmount < 24 ? "Up to $24.00" : `Up to $24.00 - $${benefitAmount.toFixed(2)}`}</p>
                            <p><strong>Expedited Eligibility:</strong> ${capitalizeFirstLetter(expeditedEligibility)}</p>
                        ` : ''}
                        </summary>
                        <hr class="separator-bar">
                        <p><strong>Household Size:</strong> ${snapData.householdSize || household.length}</p>
                        <p><strong>Total Gross Income:</strong> $${(snapData.combinedMonthlyIncome || 0).toFixed(2)}</p>
                        <p><strong>Standard Deduction:</strong> $${(snapData.standardDeduction || 0).toFixed(2)}</p>
                        <p><strong>Shelter Deduction:</strong> $${(snapData.excessShelterCost || 0).toFixed(2)}</p>
                        <p><strong>Utility Allowance:</strong> $${(snapData.totalUtilityAllowance || 0).toFixed(2)}</p>
                        <p><strong>Medical Expense Deductions:</strong> $${(snapData.totalMedicalExpenses || 0).toFixed(2)}</p>
                        <p><strong>Other Expense Deductions:</strong> $${(snapData.totalOtherExpenses || 0).toFixed(2)}</p>
                        <p><strong>Adjusted Net Income:</strong> $${(snapData.totalNetIncome || 0).toFixed(2)}</p>
                        <p><strong>Combined Assets:</strong> $${(snapData.combinedAssets || 0).toFixed(2)}</p>
                    </details>
                    <button class="benefit-apply-button" data-benefit="SNAP" style="display: ${isScreeningInProgress && snapIsLikelyEligible ? 'block' : 'none'}; margin: 0 auto;">
                        ${household.every(m => m.SNAP?.application?.some(app => app.applying)) ? 'Stop Applying' : 'Apply for SNAP'}
                    </button>
                    <button class="close-benefit-btn" 
                        data-benefit="SNAP" 
                        data-member-ids="${snapMemberIds.join(',')}"
                        data-is-not-eligible="${snapIsNotEligible ? 'true' : 'false'}"
                        data-ineligibility-reason="${ineligibilityReason}"
                        style="display: ${isScreeningInProgress ? 'block' : 'none'}; background-color: #dc3545; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 11px; cursor: pointer; margin: 8px 0;">
                        Close Screening(s)
                    </button>
                </div>

                <!-- BACK SIDE -->
                <div class="snap-flip-card-back household-member-box" style="
                    backface-visibility: hidden;
                    transform: rotateY(180deg);
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    box-sizing: border-box;
                    background-color: ${cardBgColor};
                    border-color: ${cardBorderColor};
                ">
                    <div class="snap-flip-hint snap-flip-back-hint" style="
                        position: absolute;
                        top: 8px;
                        right: 12px;
                        font-size: 44px;
                        color: #000;
                        cursor: pointer;
                        display: ${snapIsLikelyEligible ? 'block' : 'none'};
                    ">↻</div>
                    <h3>SNAP HOUSEHOLD</h3>
                    <hr class="separator-bar">
                    <p><em>${benefitAmount <= 24 
                        ? `Your household looks likely eligible for the Supplemental Nutrition Assistance Program (SNAP) benefits. If approved, you would receive an EBT card loaded with your benefit amount each month, which you can use at any participating grocery stores and farmers markets to buy eligible food items.`
                        : `Your household looks likely eligible for up to $${benefitAmount.toFixed(2)} per month in Supplemental Nutrition Assistance Program (SNAP) benefits. If approved, you would receive an EBT card loaded with your benefit amount each month, which you can use at any participating grocery stores and farmers markets to buy eligible food items.`
                    }</em></p>
                    ${expeditedEligibility?.toLowerCase().startsWith('yes') 
                        ? `<p><em>In addition, your household may also qualify for expedited SNAP processing. This means your application could be processed within 7 days instead of the standard 30-day timeline, so you can start receiving benefits sooner.</em></p>`
                        : ''
                    }
                    <br>
                    <button class="benefit-apply-button" data-benefit="SNAP" style="display: ${snapIsLikelyEligible ? 'block' : 'none'}; margin: 0 auto;">
                        ${household.every(m => m.SNAP?.application?.some(app => app.applying)) ? 'Stop Applying' : 'Apply for SNAP'}
                    </button>
                    <button class="close-benefit-btn" 
                        data-benefit="SNAP" 
                        data-member-ids="${snapMemberIds.join(',')}"
                        data-is-not-eligible="${snapIsNotEligible ? 'true' : 'false'}"
                        data-ineligibility-reason="${ineligibilityReason}"
                        style="background-color: #dc3545; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 11px; cursor: pointer; margin: 8px 0;">
                        Close Screening(s)
                    </button>
                </div>
            </div>
        `;

        // Initialize flip card
        setupFlipCard(householdDiv, {
            frontSelector: '.snap-flip-card-front',
            backSelector: '.snap-flip-card-back',
            hintSelector: '.snap-flip-hint',
            backHintSelector: '.snap-flip-back-hint',
            detailsSelector: 'details'
        });

        // Attach button listeners
        householdDiv.querySelectorAll('.benefit-apply-button').forEach(btn => {
            btn.addEventListener('click', async (event) => {
                const newApplyingState = event.target.textContent.trim().startsWith('Apply');
                const freshMembers = await loadHouseholdMembers();
                await updateMemberBenefits(freshMembers, 'SNAP', newApplyingState);
                await displaySNAPHouseholds();
                await updateSaveContinueButtonVisibility();
            });
        });

        householdDiv.querySelectorAll('.close-benefit-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const freshMembers = await loadHouseholdMembers();
                openCloseMemberModal(clientId, freshMembers, null, null, 'SNAP');
            });
        });

        return householdDiv;
    }

    // ===== LIHEAP DISPLAY =====
// ...existing code...
async function displayLIHEAPHouseholds() {
    // Always resolve the container at runtime to avoid scope/name issues
    const liheapContainer = document.getElementById('liheap-household-container');
    if (!liheapContainer) {
        console.warn('liheap-household-container element not found.');
        return;
    }

    const members = await loadHouseholdMembers();
    let isScreeningInProgress = false;
    let clientData = null;

    try {
        const clientRes = await fetch(`/get-client/${clientId}`);
        if (clientRes.ok) {
            clientData = await clientRes.json();
            isScreeningInProgress = clientData.screeningInProgress === true;
        }
    } catch (e) {
        console.error('Error fetching client screening status:', e);
    }

    // use the resolved container consistently
    liheapContainer.innerHTML = '';

    const activeMembersForLIHEAP = members.filter(m => (m.deceased ?? '').toLowerCase() !== 'yes');
    const liheapMemberIds = activeMembersForLIHEAP.map(m => String(m.householdMemberId));
    const liheapMemberNames = activeMembersForLIHEAP.map(m => 
        `${capitalizeFirstLetter(m.firstName)} ${capitalizeFirstLetter(m.lastName)}`
    ).join(', ');

    // Check if LIHEAP screening is closed at CLIENT level (programStatus)
    const liheapProgramStatus = clientData?.programStatus?.LIHEAP;
    const isLiheapScreeningClosed = liheapProgramStatus?.screeningInProgress === false;

    if (isLiheapScreeningClosed) {
        const householdDiv = document.createElement('div');
        householdDiv.classList.add('household-member-box');
        householdDiv.style.backgroundColor = 'rgb(212, 212, 212)';
        householdDiv.style.borderColor = 'rgb(0, 0, 0)';
        householdDiv.innerHTML = `
            <h3>LIHEAP HOUSEHOLD</h3>
            <div style="padding: 8px; border-radius: 4px; margin: 8px 0; text-align: center; width: 100%; box-sizing: border-box;">
                <p style="margin: 0 0 6px 0;"><strong>LIHEAP Screening Closed</strong></p>
                <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${liheapProgramStatus?.screeningCloseReason || 'N/A'}</p>
                <button class="reopen-liheap-btn" style="background-color: #007bff; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 12px; cursor: pointer;">
                    Reopen LIHEAP Screening
                </button>
            </div>
        `;
        liheapContainer.appendChild(householdDiv);

        householdDiv.querySelector('.reopen-liheap-btn')?.addEventListener('click', async () => {
            await reopenBenefitScreening('LIHEAP', liheapMemberIds, 'LIHEAP Household');
        });
        return;
    }

    // Only check enrollment status if screening is NOT closed
    const isLiheapAlreadyEnrolled = client?.liheapEnrollment === 'yes' && client?.heatingCrisis === 'no';
    const isLiheapNotInterested = client?.liheapEnrollment === 'notinterested';

    if (isLiheapAlreadyEnrolled || isLiheapNotInterested) {
        const noHouseholdsDiv = document.createElement('div');
        noHouseholdsDiv.classList.add('household-member-box');
        noHouseholdsDiv.style.backgroundColor = '#f8d7da'; // Red for already enrolled / not interested
        noHouseholdsDiv.style.borderColor = '#f5c6cb';
        noHouseholdsDiv.style.width = '100%'; // Ensure full width
        noHouseholdsDiv.style.boxSizing = 'border-box'; // Consistent box sizing

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
        liheapContainer.appendChild(noHouseholdsDiv);

        if (anyLiheapScreeningActive || isLiheapAlreadyEnrolled || isLiheapNotInterested) {
            const closeBtn = noHouseholdsDiv.querySelector('.btn-close-liheap-screening');
            closeBtn.addEventListener('click', () => {
                openCloseMemberModal(clientId, members, null, null, 'LIHEAP');
            });
        }
        return;
    }

    if (activeMembersForLIHEAP.length === 0) {
        const noHouseholdsDiv = document.createElement('div');
        noHouseholdsDiv.classList.add('household-member-box');
        noHouseholdsDiv.style.backgroundColor = '#fff3cd';
        noHouseholdsDiv.style.borderColor = '#ffc107';
        noHouseholdsDiv.innerHTML = '<h3>LIHEAP HOUSEHOLD</h3><p>NO LIHEAP HOUSEHOLDS FOUND.</p>';
        liheapContainer.appendChild(noHouseholdsDiv);
        return;
    }

    // Active LIHEAP card - get eligibility data from member
    const liheapData = activeMembersForLIHEAP[0]?.LIHEAP || {};
    const householdDiv = createLIHEAPHouseholdCard(activeMembersForLIHEAP, liheapMemberIds, liheapMemberNames, liheapData, isScreeningInProgress);
    liheapContainer.appendChild(householdDiv);
}

    function createLIHEAPHouseholdCard(activeMembersForLIHEAP, liheapMemberIds, liheapMemberNames, liheapData, isScreeningInProgress) {
        const eligibility = liheapData.eligibility?.map(capitalizeFirstLetter) || ['Not Available'];
        const combinedYearlyIncome = liheapData.combinedYearlyIncome || 0;

        const liheapIsNotEligible = eligibility.some(item => 
            (item.includes("NOT") || item.includes("ALREADY ENROLLED") || item.includes("NOT INTERESTED")) && 
            !item.includes("RECOMMENDED")
        );
        const liheapNeedsInfo = eligibility.some(item => item.includes("NEEDS"));
        const liheapIsLikely = !liheapIsNotEligible && !liheapNeedsInfo;

        const ineligibilityReason = liheapIsNotEligible 
            ? (liheapData.eligibility?.find(e => {
                const upper = (e || '').toUpperCase();
                return (upper.includes('NOT') || upper.includes('ALREADY')) && !upper.includes('RECOMMENDED');
            }) || '')
            : '';

        const { bg: cardBgColor, border: cardBorderColor } = liheapIsNotEligible 
            ? { bg: '#f8d7da', border: '#f5c6cb' }
            : liheapNeedsInfo 
                ? { bg: '#fff3cd', border: '#ffc107' }
                : { bg: '#d4edda', border: '#c3e6cb' };

        const householdDiv = document.createElement('div');
        householdDiv.classList.add('liheap-flip-card');
        householdDiv.style.cssText = 'perspective: 1000px; width: 100%; margin-bottom: 16px;';

        householdDiv.innerHTML = `
            <div class="liheap-flip-card-inner" style="
                position: relative;
                width: 100%;
                transition: transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1);
                transform-style: preserve-3d;
            ">
                <!-- FRONT SIDE -->
                <div class="liheap-flip-card-front household-member-box" style="
                    backface-visibility: hidden;
                    background-color: ${cardBgColor};
                    border-color: ${cardBorderColor};
                    position: relative;
                    z-index: 1;
                ">
                    <div class="liheap-flip-hint" style="
                        position: absolute;
                        top: 8px;
                        right: 12px;
                        font-size: 44px;
                        color: #000;
                        cursor: pointer;
                        display: ${liheapIsLikely ? 'block' : 'none'};
                    ">↻</div>
                    <details class="custom-details" style="background-color: ${cardBgColor}; border-radius: 4px; padding: 8px; margin: 8px 0; width: 100%; box-sizing: border-box;">
                        <summary><br><strong>LIHEAP HOUSEHOLD</strong><br>
                        <p><strong>Members:</strong> ${liheapMemberNames}</p>
                        <p><strong>Eligibility:</strong> ${eligibility.join(', ')}</p>
                        </summary>
                        <hr class="separator-bar">
                        <p><strong>Combined Yearly Income:</strong> $${combinedYearlyIncome.toFixed(2)}</p>
                    </details>
                    <button class="benefit-apply-button" data-benefit="LIHEAP" style="display: ${isScreeningInProgress && liheapIsLikely ? 'block' : 'none'}; margin: 0 auto;">
                        ${activeMembersForLIHEAP.every(m => m.LIHEAP?.application?.some(app => app.applying)) ? 'Stop Applying' : 'Apply for LIHEAP'}
                    </button>
                    <button class="close-liheap-btn" 
                        data-member-ids="${liheapMemberIds.join(',')}"
                        data-is-not-eligible="${liheapIsNotEligible ? 'true' : 'false'}"
                        data-ineligibility-reason="${ineligibilityReason}"
                        style="display: ${isScreeningInProgress ? 'block' : 'none'}; background-color: #dc3545; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 11px; cursor: pointer; margin: 8px 0;">
                        Close Screening(s)
                    </button>
                </div>

                <!-- BACK SIDE -->
                <div class="liheap-flip-card-back household-member-box" style="
                    backface-visibility: hidden;
                    transform: rotateY(180deg);
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    box-sizing: border-box;
                    background-color: ${cardBgColor};
                    border-color: ${cardBorderColor};
                ">
                    <div class="liheap-flip-hint liheap-flip-back-hint" style="
                        position: absolute;
                        top: 8px;
                        right: 12px;
                        font-size: 44px;
                        color: #000;
                        cursor: pointer;
                        display: ${liheapIsLikely ? 'block' : 'none'};
                    ">↻</div>
                    <h3>LIHEAP HOUSEHOLD</h3>
                    <hr class="separator-bar">
                    <p><em>ESTIMATED ELIGIBILITY SCRIPTING</em></p>
                    <br>
                    <button class="benefit-apply-button" data-benefit="LIHEAP" style="display: ${liheapIsLikely ? 'block' : 'none'}; margin: 0 auto;">
                        ${activeMembersForLIHEAP.every(m => m.LIHEAP?.application?.some(app => app.applying)) ? 'Stop Applying' : 'Apply for LIHEAP'}
                    </button>
                    <button class="close-liheap-btn" 
                        data-member-ids="${liheapMemberIds.join(',')}"
                        data-is-not-eligible="${liheapIsNotEligible ? 'true' : 'false'}"
                        data-ineligibility-reason="${ineligibilityReason}"
                        style="background-color: #dc3545; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 11px; cursor: pointer; margin: 8px 0;">
                        Close Screening(s)
                    </button>
                </div>
            </div>
        `;

        // Initialize flip card
        setupFlipCard(householdDiv, {
            frontSelector: '.liheap-flip-card-front',
            backSelector: '.liheap-flip-card-back',
            hintSelector: '.liheap-flip-hint',
            backHintSelector: '.liheap-flip-back-hint',
            detailsSelector: 'details'
        });

        // Attach button listeners
        householdDiv.querySelectorAll('.benefit-apply-button').forEach(btn => {
            btn.addEventListener('click', async (event) => {
                event.stopPropagation();
                if (btn.dataset.processing === 'true') return;
                btn.dataset.processing = 'true';

                const newApplyingState = event.target.textContent.trim().startsWith('Apply');
                const freshMembers = await loadHouseholdMembers();
                await updateMemberBenefits(freshMembers, 'LIHEAP', newApplyingState);
                await displayLIHEAPHouseholds();
                await updateSaveContinueButtonVisibility();

                btn.dataset.processing = 'false';
            });
        });

        householdDiv.querySelectorAll('.close-liheap-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const freshMembers = await loadHouseholdMembers();
                openCloseMemberModal(clientId, freshMembers, null, null, 'LIHEAP');
            });
        });

        return householdDiv;
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
            <div id="close-member-benefits-checkboxes" style="margin: 12px 0; overflow-y: auto; flex: 1; max-height: 50vh; padding-right: 8px;"></div>
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

function getCloseReasonsForBenefits(selectedBenefits) {
    const commonReasons = [
        { value: "Not Interested", label: "Not Interested" },
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
        ],
        'SNAP': [
            { value: "Already Enrolled", label: "Already Enrolled" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Ineligible - Income and Assets", label: "Ineligible - Income and Assets" },
            ...commonReasons
        ],
        'LIHEAP': [
            { value: "Already Enrolled", label: "Already Enrolled" },
            { value: "Ineligible - Income", label: "Ineligible - Income" },
            { value: "Subsidized Housing and No Heating Responsibility", label: "Subsidized Housing and No Heating Responsibility" },
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
                        }
                    }
                    // Update client-level program status
                    await updateClientProgramStatus(clientId, 'SNAP', false, closeReason);
                    noteLines.push(`<br><strong>SNAP</strong><br> ${closeReason}`);
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
                    noteLines.push(`<br><strong>LIHEAP</strong><br> ${closeReason}`);
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

    // ===== INITIALIZATION =====
    async function initialize() {
        await updateSaveContinueButtonVisibility();

        client = await fetchClient();
        if (!client) {
            console.error("Client data could not be retrieved.");
            return;
        }

        const members = await loadHouseholdMembers();

        // Run all eligibility checks
        await PACEEligibilityCheck(members);
        await LISEligibilityCheck(members);
        await MSPEligibilityCheck(members);
        await PTRREligibilityCheck(members);
        await SNAPEligibilityCheck(members, client.isFarmworker);
        await LIHEAPEligibilityCheck();

        // Display all sections
        await displayHouseholdMembers();
        await displaySNAPHouseholds();
        await displayLIHEAPHouseholds();
    }

    // Run initialization
    try {
        await initialize();
    } catch (error) {
        console.error('Error during eligibility initialization:', error);
    } finally {
        // Resolve the promise so HTML knows we're done
        if (typeof resolveEligibilityChecks === 'function') {
            resolveEligibilityChecks();
        }
        // Show the page after everything is loaded
        document.body.classList.add('loaded');
    }

    // ===== EXPOSE GLOBAL FUNCTIONS =====
    window.eligibilityChecks = {
        loadHouseholdMembers,
        displayHouseholdMembers,
        displaySNAPHouseholds,
        displayLIHEAPHouseholds,
        PACEEligibilityCheck,
        LISEligibilityCheck,
        MSPEligibilityCheck,
        PTRREligibilityCheck,
        SNAPEligibilityCheck,
        LIHEAPEligibilityCheck
    };

    window.openCloseMemberModal = openCloseMemberModal;
    window.reopenBenefitScreening = reopenBenefitScreening;
});