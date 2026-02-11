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
    async function addNoteToClient(noteText) {
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
        { value: "Client Not Interested", label: "Not Interested" },
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
        if (upper.includes('NOT INTERESTED')) return 'Client Not Interested';
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
        const currentYear = new Date().getFullYear();
        const previousYear = currentYear - 1;
        const previousYearStart = new Date(`${previousYear}-01-01`);
        const previousYearEnd = new Date(`${previousYear}-12-31`);

        // Step 1: Calculate adjusted income for all members
        for (const member of members) {
            try {
                const previousYearIncomes = filterPreviousYearIncomes(member.income);
                let totalIncome = 0;

                for (const income of previousYearIncomes) {
                    const yearlyAmount = calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate);
                    const incomeStart = new Date(income.startDate);
                    const incomeEnd = income.endDate ? new Date(income.endDate) : new Date();

                    if (incomeStart <= previousYearEnd && incomeEnd >= previousYearStart) {
                        const activeStart = incomeStart < previousYearStart ? previousYearStart : incomeStart;
                        const activeEnd = incomeEnd > previousYearEnd ? previousYearEnd : incomeEnd;
                        const activeDays = Math.min((activeEnd - activeStart) / (1000 * 60 * 60 * 24) + 1, 365);
                        totalIncome += yearlyAmount * (activeDays / 365);
                    }
                }

                // Medicare Part B deduction
                const medicarePartBExpense = member.expenses?.find(e => 
                    e.type === "Previous Year" && e.kind === "Medicare Part B Premium"
                );

                if (medicarePartBExpense) {
                    const startDate = new Date(medicarePartBExpense.startDate);
                    const endDate = new Date(medicarePartBExpense.endDate);
                    const today = new Date();
                    const effectiveEndDate = endDate > today ? today : endDate;
                    const monthsActive = (effectiveEndDate.getFullYear() - startDate.getFullYear()) * 12 +
                                         (effectiveEndDate.getMonth() - startDate.getMonth()) + 1;
                    const yearlyMultiplier = getYearlyMultiplier(medicarePartBExpense.frequency);

                    if (yearlyMultiplier > 0) {
                        totalIncome -= medicarePartBExpense.amount * yearlyMultiplier * (monthsActive / 12);
                    }
                }

                member.adjustedIncome = totalIncome;
            } catch (error) {
                console.error(`Error calculating adjusted income for ${member.firstName} ${member.lastName}:`, error);
            }
        }

        // Step 2: Calculate combined income and eligibility
        for (const member of members) {
            try {
                const spouse = findPreviousSpouse(member, members);
                
                if (spouse) {
                    member.combinedIncome = (Number(member.adjustedIncome) || 0) + (Number(spouse.adjustedIncome) || 0);
                    spouse.combinedIncome = member.combinedIncome;
                } else {
                    member.combinedIncome = member.adjustedIncome || 0;
                }

                const eligibility = [];
                const { years, months, days } = parseAge(member.age);

                if (years < PACE_THRESHOLDS.minAgeYears || (years === PACE_THRESHOLDS.minAgeYears && months < PACE_THRESHOLDS.minAgeMonths)) {
                    eligibility.push("Age Criteria Not Met");
                    member.selections = member.selections || {};
                    member.selections["Is this person currently enrolled in PACE?"] = null;
                    member.selections["Has this person lived in Pennsylvania for at least the last 90 consecutive days?"] = null;
                } else {
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
                        // Income-based eligibility
                        const income = member.combinedIncome;
                        const thresholds = spouse ? PACE_THRESHOLDS.married : PACE_THRESHOLDS.single;

                        if (income < thresholds.pace) eligibility.push("Likely Eligible for PACE");
                        else if (income <= thresholds.pacenet) eligibility.push("Likely Eligible for PACENET");
                        else if (income <= thresholds.buffer) eligibility.push("Likely Ineligible but Within Buffer");
                        else eligibility.push("Not Likely Eligible for PACE or PACENET (Income)");
                    }
                }

                member.PACE = {
                    ...member.PACE,
                    combinedIncome: Math.max(0, member.combinedIncome),
                    eligibility
                };
            } catch (error) {
                console.error(`Error processing PACE for ${member.firstName} ${member.lastName}:`, error);
            }
        }

        await saveHouseholdMembers(members);
    }

    async function LISEligibilityCheck(members) {
        for (const member of members) {
            try {
                const medicareEnrollment = member.medicare?.toLowerCase();
                const medicaidEnrollment = member.medicaid?.toLowerCase();

                // Early exit conditions
                if (medicareEnrollment === "no") {
                    member.LIS = { combinedIncome: 0, combinedAssets: 0, eligibility: ["Not Enrolled in Medicare"] };
                    member.selections = member.selections || {};
                    member.selections["Is this person currently enrolled in LIS/ Extra Help?"] = "notenrolledinmedicare";
                    continue;
                }

                if (medicaidEnrollment === "yes") {
                    member.LIS = { combinedIncome: 0, combinedAssets: 0, eligibility: ["Enrolled in Medicaid"] };
                    member.selections = member.selections || {};
                    member.selections["Is this person currently enrolled in LIS/ Extra Help?"] = "onmedicaid";
                    continue;
                }

                const lisEnrollment = member.selections?.["Is this person currently enrolled in LIS/ Extra Help?"]?.toLowerCase();
                
                if (lisEnrollment === "yes") {
                    member.LIS = { combinedIncome: 0, combinedAssets: 0, eligibility: ["Already Enrolled"] };
                    continue;
                }
                
                if (lisEnrollment === "notinterested") {
                    member.LIS = { combinedIncome: 0, combinedAssets: 0, eligibility: ["Not Interested"] };
                    continue;
                }
                
                if (!lisEnrollment || ["notenrolledinmedicare", "onmedicaid", "n/a", "not interested"].includes(lisEnrollment.toLowerCase().trim())) {
                    member.LIS = { combinedIncome: 0, combinedAssets: 0, eligibility: ["Needs Current Enrollment Status"] };
                    continue;
                }

                // Calculate income and assets
                const currentIncomes = filterCurrentIncomes(member.income);
                let totalIncome = currentIncomes.reduce((sum, income) => {
                    const yearlyAmount = calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate);
                    return sum + Math.max(0, yearlyAmount);
                }, 0);

                let totalAssets = (member.assets || []).reduce((sum, asset) => sum + Number(asset.value), 0);

                // Check for spouse
                const spouse = findSpouse(member, members);
                let combinedIncome = totalIncome;
                let combinedAssets = totalAssets;

                if (spouse) {
                    const spouseCurrentIncomes = filterCurrentIncomes(spouse.income);
                    combinedIncome += spouseCurrentIncomes.reduce((sum, income) => {
                        const yearlyAmount = calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate);
                        return sum + Math.max(0, yearlyAmount);
                    }, 0);
                    combinedAssets += (spouse.assets || []).reduce((sum, asset) => sum + Number(asset.value), 0);
                }

                // Determine eligibility
                const thresholds = spouse ? LIS_THRESHOLDS.married : LIS_THRESHOLDS.single;
                let lisEligibility;

                if (combinedIncome > thresholds.income) lisEligibility = ["Not Likely Eligible for LIS (Income)"];
                else if (combinedAssets > thresholds.assets) lisEligibility = ["Not Likely Eligible for LIS (Assets)"];
                else lisEligibility = ["Likely Eligible for LIS"];

                const lisObject = { combinedIncome, combinedAssets, eligibility: lisEligibility };
                member.LIS = lisObject;
                if (spouse) spouse.LIS = lisObject;
            } catch (error) {
                console.error(`Error processing LIS for ${member.firstName} ${member.lastName}:`, error);
            }
        }

        await saveHouseholdMembers(members);
    }

    async function MSPEligibilityCheck(members) {
        for (const member of members) {
            try {
                const medicareEnrollment = member.medicare?.toLowerCase();
                const medicaidEnrollment = member.medicaid?.toLowerCase();

                if (medicareEnrollment === "no") {
                    member.MSP = { combinedIncome: 0, combinedAssets: 0, eligibility: ["Not Enrolled in Medicare"] };
                    member.selections = member.selections || {};
                    member.selections["Is this person currently enrolled in the Medicare Savings Program?"] = "notenrolledinmedicare";
                    continue;
                }

                if (medicaidEnrollment === "yes") {
                    member.MSP = { combinedIncome: 0, combinedAssets: 0, eligibility: ["Enrolled in Medicaid"] };
                    member.selections = member.selections || {};
                    member.selections["Is this person currently enrolled in the Medicare Savings Program?"] = "onmedicaid";
                    continue;
                }

                const mspEnrollment = member.selections?.["Is this person currently enrolled in the Medicare Savings Program?"]?.toLowerCase();

                if (mspEnrollment === "yes") {
                    member.MSP = { combinedIncome: 0, combinedAssets: 0, eligibility: ["Already Enrolled"] };
                    continue;
                }

                if (mspEnrollment === "notinterested") {
                    member.MSP = { combinedIncome: 0, combinedAssets: 0, eligibility: ["Not Interested"] };
                    continue;
                }

                if (!mspEnrollment || ["n/a", "notenrolledinmedicare", "onmedicaid", "not interested"].includes(mspEnrollment.toLowerCase().trim())) {
                    member.MSP = { combinedIncome: 0, combinedAssets: 0, eligibility: ["Needs Current Enrollment Status"] };
                    continue;
                }

                // Calculate income with MSP-specific deductions
                const currentIncomes = filterCurrentIncomes(member.income);
                let totalIncome = currentIncomes.reduce((sum, income) => {
                    const yearlyAmount = calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate);
                    let monthlyIncome = yearlyAmount / 12;

                    if (income.kind === "Employment" || income.kind === "Self-Employment") {
                        monthlyIncome = (monthlyIncome - MSP_DEDUCTIONS.employmentDeduction) / 2;
                    } else {
                        monthlyIncome -= MSP_DEDUCTIONS.otherDeduction;
                    }

                    return sum + Math.max(0, monthlyIncome);
                }, 0);

                let totalAssets = (member.assets || []).reduce((sum, asset) => sum + Number(asset.value), 0);

                const spouse = findSpouse(member, members);
                let combinedIncome = totalIncome;
                let combinedAssets = totalAssets;

                if (spouse) {
                    const spouseCurrentIncomes = (spouse.income || []).filter(i => i.type === "Current");
                    combinedIncome += spouseCurrentIncomes.reduce((sum, income) => {
                        const yearlyAmount = calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate);
                        let monthlyIncome = yearlyAmount / 12;
                        if (income.kind === "Employment" || income.kind === "Self-Employment") {
                            monthlyIncome = (monthlyIncome - MSP_DEDUCTIONS.employmentDeduction) / 2;
                        } else {
                            monthlyIncome -= MSP_DEDUCTIONS.otherDeduction;
                        }
                        return sum + Math.max(0, monthlyIncome);
                    }, 0);
                    combinedAssets += (spouse.assets || []).reduce((sum, asset) => sum + Number(asset.value), 0);
                }

                // Determine eligibility
                const thresholds = spouse ? MSP_THRESHOLDS.married : MSP_THRESHOLDS.single;
                let mspEligibility;

                if (combinedIncome > thresholds.qi) mspEligibility = ["Not Likely Eligible for MSP (Income)"];
                else if (combinedAssets > thresholds.assets) mspEligibility = ["Not Likely Eligible for MSP (Assets)"];
                else if (combinedIncome <= thresholds.qmb) mspEligibility = ["Likely Eligible for MSP (QMB)"];
                else if (combinedIncome <= thresholds.slmb) mspEligibility = ["Likely Eligible for MSP (SLMB)"];
                else mspEligibility = ["Likely Eligible for MSP (QI)"];

                const mspObject = { combinedIncome, combinedAssets, eligibility: mspEligibility };
                member.MSP = mspObject;
                if (spouse) spouse.MSP = mspObject;
            } catch (error) {
                console.error(`Error processing MSP for ${member.firstName} ${member.lastName}:`, error);
            }
        }

        await saveHouseholdMembers(members);
    }

    async function PTRREligibilityCheck(members) {
        const currentYear = new Date().getFullYear();
        const previousYear = currentYear - 1;
        const previousYearStart = new Date(`${previousYear}-01-01`);
        const previousYearEnd = new Date(`${previousYear}-12-31`);

        // Set non-head-of-household members to "Not Checked"
        members.filter(m => !m.headOfHousehold).forEach(member => {
            member.PTRR = { combinedIncome: 0, eligibility: ["Not Checked"] };
        });

        // Process only head of household members
        for (const member of members.filter(m => m.headOfHousehold)) {
            try {
                const previousYearIncomes = filterPreviousYearIncomes(member.income);
                
                let totalGrossIncome = previousYearIncomes.reduce((sum, income) => {
                    let yearlyAmount = calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate);

                    // Half for certain income types
                    if (PTRR_THRESHOLDS.halfIncomeTypes.includes(income.kind?.toLowerCase())) {
                        yearlyAmount /= 2;
                    }

                    const incomeStart = new Date(income.startDate);
                    const incomeEnd = income.endDate ? new Date(income.endDate) : new Date();

                    if (incomeStart <= previousYearEnd && incomeEnd >= previousYearStart) {
                        const activeStart = incomeStart < previousYearStart ? previousYearStart : incomeStart;
                        const activeEnd = incomeEnd > previousYearEnd ? previousYearEnd : incomeEnd;
                        const activeDays = Math.min((activeEnd - activeStart) / (1000 * 60 * 60 * 24) + 1, 365);
                        return sum + yearlyAmount * (activeDays / 365);
                    }
                    return sum;
                }, 0);

                // Add spouse income
                const spouse = findPreviousSpouse(member, members);
                if (spouse) {
                    const spousePreviousIncomes = filterPreviousYearIncomes(spouse.income);
                    totalGrossIncome += spousePreviousIncomes.reduce((sum, income) => {
                        const yearlyAmount = calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate);
                        const incomeStart = new Date(income.startDate);
                        const incomeEnd = income.endDate ? new Date(income.endDate) : new Date();

                        if (incomeStart <= previousYearEnd && incomeEnd >= previousYearStart) {
                            const activeStart = incomeStart < previousYearStart ? previousYearStart : incomeStart;
                            const activeEnd = incomeEnd > previousYearEnd ? previousYearEnd : incomeEnd;
                            const activeDays = Math.min((activeEnd - activeStart) / (1000 * 60 * 60 * 24) + 1, 365);
                            return sum + yearlyAmount * (activeDays / 365);
                        }
                        return sum;
                    }, 0);
                }

                // Determine eligibility
                const eligibility = [];
                const applicationStatus = member.selections?.["Has this person already applied for PTRR this year?"]?.toLowerCase();
                const age = calculateAgeFromDob(member.dob);
                const isDisabled = member.disability?.toLowerCase() === "yes";
                const isWidowed = member.previousMaritalStatus?.toLowerCase() === "widowed";

                if (member.residenceStatus?.toLowerCase() === "other") {
                    eligibility.push("No Formal Lease");
                } else if (!member.residenceStatus || member.residenceStatus.toLowerCase() === "n/a") {
                    eligibility.push("Needs Previous Year Residence Status");
                    delete member.selections?.["Has this person already applied for PTRR this year?"];
                } else if (applicationStatus === "yes") {
                    eligibility.push("Already Applied");
                } else if (!(age >= 18 && isDisabled) && !(age >= 50 && isWidowed) && !(age >= 65)) {
                    eligibility.push("Age, Disability, or Widow Status Criteria Not Met");
                    member.selections = member.selections || {};
                    member.selections["Has this person already applied for PTRR this year?"] = "agecriterianotmet";
                } else if (!applicationStatus || ["n/a", "not interested", "agecriterianotmet"].includes(applicationStatus.toLowerCase().trim())) {
                    eligibility.push("Needs Current Enrollment Status");
                } else if (applicationStatus === "notinterested") {
                    eligibility.push("Not Interested");
                } else if (applicationStatus.toLowerCase().trim() === "no" && totalGrossIncome > PTRR_THRESHOLDS.incomeLimit) {
                    eligibility.push("Not Likely Eligible for PTRR (Income)");
                } else {
                    // Check for relevant expenses
                    const relevantExpenses = (member.expenses || []).filter(expense => {
                        const residenceStatus = client?.residenceStatus?.toLowerCase();
                        const isPropertyTax = expense.kind?.trim() === "Property Taxes";
                        const isRent = expense.kind?.trim() === "Rent";
                        const isPreviousYear = expense.type?.trim() === "Previous Year";

                        if (residenceStatus === "owned") return isPropertyTax && isPreviousYear;
                        if (residenceStatus === "rented") return isRent && isPreviousYear;
                        if (residenceStatus === "rentedowned") return (isPropertyTax || isRent) && isPreviousYear;
                        return false;
                    });

                    if (applicationStatus.toLowerCase().trim() === "no" && relevantExpenses.length === 0) {
                        eligibility.push("Not Likely Eligible for PTRR (No Relevant Expenses)");
                    } else {
                        eligibility.push("Likely Eligible for PTRR");
                    }
                }

                member.PTRR = { combinedIncome: totalGrossIncome, eligibility };
            } catch (error) {
                console.error(`Error processing PTRR for ${member.firstName} ${member.lastName}:`, error);
            }
        }

        await saveHouseholdMembers(members);
    }

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

            // Set client-level screeningInProgress to true
            await fetch('/update-client', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, clientData: { screeningInProgress: true } })
            });

            const noteText = benefit === 'SNAP' ? '<strong>SNAP screening reopened.</strong>' :
                           benefit === 'LIHEAP' ? '<strong>LIHEAP screening reopened.</strong>' :
                           `<strong>${benefit} screening reopened for ${displayName}.</strong>`;

            await addNoteToClient(noteText);
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

    function attachBenefitButtonListeners() {
        document.querySelectorAll('.benefit-apply-button').forEach(button => {
            button.addEventListener('click', async (event) => {
                const benefit = event.target.dataset.benefit;
                if (benefit === 'SNAP' || benefit === 'LIHEAP') return;

                const memberId = event.target.dataset.memberId || null;
                const newApplyingState = event.target.textContent.trim().startsWith('Apply');

                const freshMembers = await loadHouseholdMembers();
                await updateMemberBenefits(freshMembers, benefit, newApplyingState, memberId);
                await displayHouseholdMembers();
                await updateSaveContinueButtonVisibility();
            });
        });
    }

    function attachCloseMemberScreeningListeners(members) {
        document.querySelectorAll('.btn-close-member-screening').forEach(btn => {
            btn.addEventListener('click', () => {
                const memberId = btn.dataset.memberId;
                const targetMember = members.find(m => String(m.householdMemberId) === memberId);
                const isDeceasedMember = (targetMember?.deceased ?? '').toLowerCase() === 'yes';

                const memberOpenBenefits = INDIVIDUAL_BENEFITS.filter(benefit => {
                    if (benefit !== 'PTRR' && isDeceasedMember) return false;
                    const bObj = targetMember?.[benefit];
                    if (!bObj || bObj.screeningInProgress === false) return false;
                    if (bObj.eligibility?.includes('Not Checked')) return false;
                    if (benefit === 'PACE' && bObj.eligibility?.includes('Age Criteria Not Met')) return false;
                    return bObj.eligibility?.length > 0;
                });

                openCloseMemberModal(clientId, members, memberId, memberOpenBenefits);
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

    // ===== SNAP DISPLAY =====
    async function displaySNAPHouseholds() {
        const snapContainer = document.getElementById('snap-household-container');
        if (!snapContainer) {
            console.error('snap-household-container element not found.');
            return;
        }

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

        snapContainer.innerHTML = '';

        // Check if SNAP screening is closed - check ALL members first
        const snapMembers = members.filter(m => m.meals?.toLowerCase() === "yes");
        const anyMemberWithSnapClosed = members.find(m => m.SNAP?.screeningInProgress === false);
        const screeningClosed = anyMemberWithSnapClosed !== undefined;

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
                    <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${anyMemberWithSnapClosed?.SNAP?.screeningCloseReason || 'N/A'}</p>
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
                const snapMemberIds = members
                    .filter(m => m.SNAP?.screeningInProgress === false)
                    .map(m => String(m.householdMemberId));
                await reopenBenefitScreening('SNAP', snapMemberIds, 'SNAP Household');
            });

            return; // Don't render anything else
        }

        // Only check enrollment status if screening is NOT closed
        const clientResponse = await fetch(`/get-client/${clientId}`).then(r => r.json()).catch(() => null);
        const isAlreadyEnrolled = clientResponse?.snap === 'yes';
        const isNotInterested = clientResponse?.snap === 'notinterested';

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
                        Close SNAP Screening
                    </button>
                ` : ''}
            `;
            snapContainer.appendChild(noHouseholdsDiv);

            // Attach close button listener if screening is in progress
            const closeBtn = noHouseholdsDiv.querySelector('.close-snap-no-household-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    // Use all member IDs since there's no specific SNAP household
                    const allMemberIds = members.map(m => String(m.householdMemberId));
                    openCloseSnapModal(allMemberIds);
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
                        style="display: ${isScreeningInProgress ? 'block' : 'none'}; background-color: #dc3545; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 11px; cursor: pointer; margin: 8px 0;">
                        Close SNAP Screening
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
                        style="background-color: #dc3545; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 11px; cursor: pointer; margin: 8px 0;">
                        Close SNAP Screening
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
            btn.addEventListener('click', () => {
                openBenefitScreeningCloseModal('SNAP', snapMemberIds, 'SNAP Household');
            });
        });

        return householdDiv;
    }

    // ===== LIHEAP DISPLAY =====
    async function displayLIHEAPHouseholds() {
        const liheapContainer = document.getElementById('liheap-household-container');
        if (!liheapContainer) {
            console.error('liheap-household-container element not found.');
            return;
        }

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

        liheapContainer.innerHTML = '';

        const activeMembersForLIHEAP = members.filter(m => (m.deceased ?? '').toLowerCase() !== 'yes');
        const liheapMemberIds = activeMembersForLIHEAP.map(m => String(m.householdMemberId));
        const liheapMemberNames = activeMembersForLIHEAP.map(m => 
            `${capitalizeFirstLetter(m.firstName)} ${capitalizeFirstLetter(m.lastName)}`
        ).join(', ');

        const liheapData = activeMembersForLIHEAP[0]?.LIHEAP || {};
        const isLiheapScreeningClosed = liheapData.screeningInProgress === false;

        if (isLiheapScreeningClosed) {
            const householdDiv = document.createElement('div');
            householdDiv.classList.add('household-member-box');
            householdDiv.innerHTML = `
                <h3>LIHEAP HOUSEHOLD</h3>
                <p><strong>Members:</strong> ${liheapMemberNames}</p>
                <div style="background-color:rgb(212, 212, 212); border: 1px solid rgb(0, 0, 0); padding: 8px; border-radius: 4px; margin: 8px 0; text-align: center; width: 100%; box-sizing: border-box;">
                    <p style="margin: 0 0 6px 0;"><strong>LIHEAP Screening Closed</strong></p>
                    <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${liheapData.screeningCloseReason || 'N/A'}</p>
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

        if (activeMembersForLIHEAP.length === 0) {
            const noHouseholdsDiv = document.createElement('div');
            noHouseholdsDiv.classList.add('household-member-box');
            noHouseholdsDiv.style.backgroundColor = '#fff3cd';
            noHouseholdsDiv.style.borderColor = '#ffc107';
            noHouseholdsDiv.innerHTML = '<h3>LIHEAP HOUSEHOLD</h3><p>NO LIHEAP HOUSEHOLDS FOUND.</p>';
            liheapContainer.appendChild(noHouseholdsDiv);
            return;
        }

        // Active LIHEAP card
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
                        style="display: ${isScreeningInProgress ? 'block' : 'none'}; background-color: #dc3545; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 11px; cursor: pointer; margin: 8px 0;">
                        Close LIHEAP Screening
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
                        style="background-color: #dc3545; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 11px; cursor: pointer; margin: 8px 0;">
                        Close LIHEAP Screening
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
            btn.addEventListener('click', () => {
                const isNotEligible = btn.dataset.isNotEligible === 'true';
                openCloseLiheapModal(liheapMemberIds, isNotEligible);
            });
        });

        return householdDiv;
    }

    // ===== CLOSE MODALS =====
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
                        <button id="close-member-confirm-btn" style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">Confirm Close</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        document.getElementById('close-member-cancel-btn').addEventListener('click', () => {
            modalOverlay.style.display = 'none';
        });

        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) modalOverlay.style.display = 'none';
        });
    }

    function openCloseMemberModal(clientId, allMembers, memberId, openBenefits) {
        createCloseMemberModal();
        const modal = document.getElementById('close-member-modal');
        const checkboxContainer = document.getElementById('close-member-benefits-checkboxes');
        const select = document.getElementById('close-member-reason-select');
        const confirmBtn = document.getElementById('close-member-confirm-btn');

        // Build open benefit entries
        const allOpenBenefitEntries = [];
        allMembers.forEach(member => {
            const isDeceased = (member.deceased ?? '').toLowerCase() === 'yes';
            const memberName = `${capitalizeFirstLetter(member.firstName)} ${capitalizeFirstLetter(member.lastName)}`;

            INDIVIDUAL_BENEFITS.forEach(benefit => {
                if (isDeceased && benefit !== 'PTRR') return;
                if (benefit === 'PTRR' && !member.headOfHousehold) return;
                if (isDeceased && benefit === 'PTRR') return;

                const benefitObj = member[benefit];
                if (!benefitObj || benefitObj.screeningInProgress === false) return;
                if (benefitObj.eligibility?.includes('Not Checked')) return;
                if (benefitObj.eligibility?.length > 0) {
                    const isNotElig = isNotEligible(benefitObj.eligibility);
                    const ineligibilityReason = isNotElig 
                        ? benefitObj.eligibility.find(e => isNotEligible([e])) || ''
                        : '';

                    allOpenBenefitEntries.push({
                        memberId: member.householdMemberId,
                        memberName,
                        benefit,
                        isNotEligible: isNotElig,
                        ineligibilityReason
                    });
                }
            });
        });

        // Group by member
        const groupedByMember = {};
        allOpenBenefitEntries.forEach(entry => {
            if (!groupedByMember[entry.memberId]) {
                groupedByMember[entry.memberId] = { memberName: entry.memberName, benefits: [] };
            }
            groupedByMember[entry.memberId].benefits.push(entry);
        });

        // Build UI
        checkboxContainer.innerHTML = '<p style="margin-bottom: 10px;"><strong>Select benefits to close:</strong></p>';

        // Select All / Deselect All buttons
        const selectAllContainer = document.createElement('div');
        selectAllContainer.style.cssText = 'margin-bottom: 12px; padding: 8px 0; border-bottom: 1px solid #ddd;';

        const selectAllBtn = document.createElement('button');
        selectAllBtn.textContent = 'Select All';
        selectAllBtn.style.cssText = 'padding: 6px 14px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; margin-right: 8px;';

        const deselectAllBtn = document.createElement('button');
        deselectAllBtn.textContent = 'Deselect All';
        deselectAllBtn.style.cssText = 'padding: 6px 14px; background-color: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;';

        const toggleAllTiles = (selected) => {
            checkboxContainer.querySelectorAll('.close-member-benefit-tile').forEach(tile => {
                const isNotEligibleTile = tile.dataset.isNotEligible === 'true';
                tile.dataset.selected = selected ? 'true' : 'false';
                if (selected) {
                    tile.style.borderColor = 'black';
                    tile.style.backgroundColor = '#007bff';
                    tile.style.color = 'white';
                } else {
                    tile.style.borderColor = isNotEligibleTile ? '#f5c6cb' : '#ccc';
                    tile.style.backgroundColor = isNotEligibleTile ? '#f8d7da' : '#f9f9f9';
                    tile.style.color = isNotEligibleTile ? '#721c24' : '#333';
                }
            });
            const selectedBenefits = selected ? allOpenBenefitEntries.map(e => e.benefit) : [];
            updateReasonDropdown([...new Set(selectedBenefits)]);
        };

        selectAllBtn.addEventListener('click', () => toggleAllTiles(true));
        deselectAllBtn.addEventListener('click', () => toggleAllTiles(false));
        selectAllContainer.appendChild(selectAllBtn);
        selectAllContainer.appendChild(deselectAllBtn);
        checkboxContainer.appendChild(selectAllContainer);

        // Build tiles
        Object.keys(groupedByMember).forEach(mId => {
            const group = groupedByMember[mId];

            const memberHeader = document.createElement('p');
            memberHeader.style.cssText = 'margin: 12px 0 4px 0; font-weight: 600; font-size: 14px; color: #555;';
            memberHeader.textContent = group.memberName;
            checkboxContainer.appendChild(memberHeader);

            group.benefits.forEach(entry => {
                const tile = document.createElement('div');
                tile.className = 'close-member-benefit-tile';
                tile.dataset.benefit = entry.benefit;
                tile.dataset.memberId = mId;
                tile.dataset.selected = 'false';
                tile.dataset.isNotEligible = entry.isNotEligible ? 'true' : 'false';
                tile.dataset.ineligibilityReason = entry.ineligibilityReason || '';
                tile.textContent = entry.benefit;
                tile.style.cssText = `
                    display: block;
                    padding: 10px 16px;
                    margin: 6px 0;
                    border: 2px solid ${entry.isNotEligible ? '#f5c6cb' : '#ccc'};
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    color: ${entry.isNotEligible ? '#721c24' : '#333'};
                    background-color: ${entry.isNotEligible ? '#f8d7da' : '#f9f9f9'};
                    transition: all 0.2s ease;
                    user-select: none;
                `;

                tile.addEventListener('click', () => {
                    const isSelected = tile.dataset.selected === 'true';
                    tile.dataset.selected = isSelected ? 'false' : 'true';

                    if (tile.dataset.selected === 'true') {
                        tile.style.borderColor = 'black';
                        tile.style.backgroundColor = '#007bff';
                        tile.style.color = 'white';
                    } else {
                        tile.style.borderColor = entry.isNotEligible ? '#f5c6cb' : '#ccc';
                        tile.style.backgroundColor = entry.isNotEligible ? '#f8d7da' : '#f9f9f9';
                        tile.style.color = entry.isNotEligible ? '#721c24' : '#333';
                    }

                    const selectedBenefitNames = Array.from(
                        checkboxContainer.querySelectorAll('.close-member-benefit-tile[data-selected="true"]')
                    ).map(t => t.dataset.benefit);
                    updateReasonDropdown([...new Set(selectedBenefitNames)]);
                });

                checkboxContainer.appendChild(tile);
            });
        });

        // Auto-select not-eligible tiles
        const hasAnyNotEligible = allOpenBenefitEntries.some(e => e.isNotEligible);
        if (hasAnyNotEligible) {
            checkboxContainer.querySelectorAll('.close-member-benefit-tile').forEach(tile => {
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
            select.value = 'Hard Determination';
        } else {
            select.innerHTML = '<option value="">-- Select a reason --</option>';
        }

        modal.style.display = 'flex';

        // Confirm handler
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
                const closuresByMember = {};
                selectedTiles.forEach(tile => {
                    const mId = tile.dataset.memberId;
                    const benefit = tile.dataset.benefit;
                    const ineligibilityReason = tile.dataset.ineligibilityReason || '';
                    if (!closuresByMember[mId]) closuresByMember[mId] = [];
                    closuresByMember[mId].push({ benefit, ineligibilityReason });
                });

                const noteLines = [];
                for (const [mId, benefitEntries] of Object.entries(closuresByMember)) {
                    const targetMember = allMembers.find(m => String(m.householdMemberId) === String(mId));
                    if (targetMember) {
                        const memberName = `${capitalizeFirstLetter(targetMember.firstName)} ${capitalizeFirstLetter(targetMember.lastName)}`;
                        const benefitNoteLines = [];
                        for (const entry of benefitEntries) {
                            if (targetMember[entry.benefit]) {
                                const closeReason = reason === 'Hard Determination'
                                    ? mapHardDeterminationReason(entry.benefit, entry.ineligibilityReason)
                                    : reason;
                                targetMember[entry.benefit].screeningInProgress = false;
                                targetMember[entry.benefit].screeningCloseReason = closeReason;
                                benefitNoteLines.push(`${entry.benefit} — ${closeReason}`);
                            }
                        }
                        noteLines.push(`<br><strong>${memberName}:</strong><br> ${benefitNoteLines.join('<br>')}`);
                    }
                }

                if (await saveHouseholdMembers(allMembers)) {
                    modal.style.display = 'none';
                    await addNoteToClient(`<strong>Screening(s) closed.</strong><br>${noteLines.join('<br>')}`);
                    await renderNotesContainer();
                    await displayHouseholdMembers();
                    const freshMembers = await loadHouseholdMembers();
                    await checkAndAutoTerminateScreening(freshMembers);
                }
            } catch (error) {
                console.error('Error closing screening:', error);
            }
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

    // ===== SNAP/LIHEAP CLOSE MODALS =====
    function createCloseSnapModal() {
        if (document.getElementById('close-snap-modal')) return;

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'close-snap-modal';
        modalOverlay.style.cssText = `display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; justify-content: center; align-items: center;`;

        modalOverlay.innerHTML = `
            <div style="background: white; padding: 24px; border-radius: 8px; min-width: 350px; max-width: 500px;">
                <h3 style="margin-top: 0;">Close SNAP Screening</h3>
                <label for="snap-close-reason-select"><strong>Select a reason:</strong></label>
                <select id="snap-close-reason-select" style="width: 100%; padding: 8px; margin: 12px 0; font-size: 14px;">
                    <option value="">-- Select a reason --</option>
                    <option value="Already Enrolled">Already Enrolled</option>
                    <option value="Ineligible - Income">Ineligible - Income</option>
                    <option value="Ineligible - Assets">Ineligible - Income and Assets</option>
                    <option value="Client Not Interested">Not Interested</option>
                    <option value="Client Unresponsive">Too Confusing</option>
                    <option value="Will Call Back">Will Call Back</option>
                </select>
                <div style="display: flex; gap: 10px; justify-content: center; margin-top: 16px;">
                    <button id="snap-close-cancel-btn" style="padding: 8px 16px; cursor: pointer;">Cancel</button>
                    <button id="snap-close-confirm-btn" style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">Confirm Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        document.getElementById('snap-close-cancel-btn').addEventListener('click', () => {
            modalOverlay.style.display = 'none';
        });

        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) modalOverlay.style.display = 'none';
        });
    }

    function createCloseLiheapModal() {
        if (document.getElementById('close-liheap-modal')) return;

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'close-liheap-modal';
        modalOverlay.style.cssText = `display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; justify-content: center; align-items: center;`;

        modalOverlay.innerHTML = `
            <div style="background: white; padding: 24px; border-radius: 8px; min-width: 350px; max-width: 500px;">
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
                    <button id="liheap-close-confirm-btn" style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">Confirm Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        document.getElementById('liheap-close-cancel-btn').addEventListener('click', () => {
            modalOverlay.style.display = 'none';
        });

        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) modalOverlay.style.display = 'none';
        });
    }

    function openBenefitScreeningCloseModal(benefit, memberIds, displayName) {
        if (benefit === 'SNAP') {
            openCloseSnapModal(memberIds);
        } else if (benefit === 'LIHEAP') {
            openCloseLiheapModal(memberIds);
        } else {
            openCloseIndividualModal(memberIds, benefit, displayName);
        }
    }

    async function openCloseSnapModal(memberIds) {
        createCloseSnapModal();
        const modal = document.getElementById('close-snap-modal');
        const select = document.getElementById('snap-close-reason-select');
        const confirmBtn = document.getElementById('snap-close-confirm-btn');

        select.value = '';
        modal.style.display = 'flex';

        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        newConfirmBtn.addEventListener('click', async () => {
            const reason = select.value;
            if (!reason) {
                alert('Please select a reason.');
                return;
            }

            try {
                const clientData = await fetchClient();
                const currentMembers = clientData?.householdMembers || [];

                currentMembers.forEach(member => {
                    if (memberIds.includes(String(member.householdMemberId)) && member.SNAP) {
                        member.SNAP.screeningInProgress = false;
                        member.SNAP.screeningCloseReason = reason;
                    }
                });

                if (await saveHouseholdMembers(currentMembers)) {
                    modal.style.display = 'none';
                    await addNoteToClient(`<strong>SNAP screening closed.</strong><br><br> Reason: ${reason}`);
                    await renderNotesContainer();
                    await displaySNAPHouseholds();
                    const freshMembers = await loadHouseholdMembers();
                    await checkAndAutoTerminateScreening(freshMembers);
                }
            } catch (error) {
                console.error('Error closing SNAP screening:', error);
            }
        });
    }

    async function openCloseLiheapModal(memberIds, isNotEligible = false) {
        createCloseLiheapModal();
        const modal = document.getElementById('close-liheap-modal');
        const select = document.getElementById('liheap-close-reason-select');
        const confirmBtn = document.getElementById('liheap-close-confirm-btn');

        select.value = isNotEligible ? 'Client Not Interested' : '';
        modal.style.display = 'flex';

        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        newConfirmBtn.addEventListener('click', async () => {
            const reason = select.value;
            if (!reason) {
                alert('Please select a reason.');
                return;
            }

            try {
                const clientData = await fetchClient();
                const currentMembers = clientData?.householdMembers || [];

                currentMembers.forEach(member => {
                    if (memberIds.includes(String(member.householdMemberId)) && member.LIHEAP) {
                        member.LIHEAP.screeningInProgress = false;
                        member.LIHEAP.screeningCloseReason = reason;
                    }
                });

                if (await saveHouseholdMembers(currentMembers)) {
                    modal.style.display = 'none';
                    await addNoteToClient(`<strong>LIHEAP screening closed.</strong><br><br> Reason: ${reason}`);
                    await renderNotesContainer();
                    await displayLIHEAPHouseholds();
                    const freshMembers = await loadHouseholdMembers();
                    await checkAndAutoTerminateScreening(freshMembers);
                }
            } catch (error) {
                console.error('Error closing LIHEAP screening:', error);
            }
        });
    }

    function createCloseIndividualModal() {
        if (document.getElementById('close-individual-modal')) return;

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'close-individual-modal';
        modalOverlay.style.cssText = `display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; justify-content: center; align-items: center;`;

        modalOverlay.innerHTML = `
            <div style="background: white; padding: 24px; border-radius: 8px; min-width: 350px; max-width: 500px;">
                <h3 id="individual-modal-title" style="margin-top: 0;">Close Screening</h3>
                <label for="individual-close-reason-select"><strong>Select a reason:</strong></label>
                <select id="individual-close-reason-select" style="width: 100%; padding: 8px; margin: 12px 0; font-size: 14px;">
                    <option value="">-- Select a reason --</option>
                </select>
                <div style="display: flex; gap: 10px; justify-content: center; margin-top: 16px;">
                    <button id="individual-close-cancel-btn" style="padding: 8px 16px; cursor: pointer;">Cancel</button>
                    <button id="individual-close-confirm-btn" style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">Confirm Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        document.getElementById('individual-close-cancel-btn').addEventListener('click', () => {
            modalOverlay.style.display = 'none';
        });

        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) modalOverlay.style.display = 'none';
        });
    }

    async function openCloseIndividualModal(memberIds, benefit, displayName) {
        createCloseIndividualModal();
        const modal = document.getElementById('close-individual-modal');
        const select = document.getElementById('individual-close-reason-select');
        const confirmBtn = document.getElementById('individual-close-confirm-btn');
        const title = document.getElementById('individual-modal-title');

        title.textContent = `Close ${benefit} Screening for ${displayName}`;

        const reasons = getCloseReasonsForBenefit(benefit);
        select.innerHTML = '<option value="">-- Select a reason --</option>';
        reasons.forEach(reason => {
            const option = document.createElement('option');
            option.value = reason.value;
            option.textContent = reason.label;
            select.appendChild(option);
        });

        modal.style.display = 'flex';

        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        newConfirmBtn.addEventListener('click', async () => {
            const reason = select.value;
            if (!reason) {
                alert('Please select a reason.');
                return;
            }

            try {
                const clientData = await fetchClient();
                const currentMembers = clientData?.householdMembers || [];

                currentMembers.forEach(member => {
                    if (memberIds.includes(String(member.householdMemberId)) && member[benefit]) {
                        member[benefit].screeningInProgress = false;
                        member[benefit].screeningCloseReason = reason;
                    }
                });

                if (await saveHouseholdMembers(currentMembers)) {
                    modal.style.display = 'none';
                    await addNoteToClient(`<strong>${benefit} screening closed for ${displayName}.</strong><br><br> Reason: ${reason}`);
                    await renderNotesContainer();
                    await displayHouseholdMembers();
                    await displaySNAPHouseholds();
                    await displayLIHEAPHouseholds();
                    const freshMembers = await loadHouseholdMembers();
                    await checkAndAutoTerminateScreening(freshMembers);
                }
            } catch (error) {
                console.error(`Error closing ${benefit} screening:`, error);
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

    window.openBenefitScreeningCloseModal = openBenefitScreeningCloseModal;
    window.reopenBenefitScreening = reopenBenefitScreening;
});