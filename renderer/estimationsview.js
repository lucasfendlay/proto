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

    // ===== READ-ONLY MUTED COLOR PALETTE =====
    const MUTED_COLORS = {
        eligible:    { bg: '#e8efe8', border: '#c5d5c5' },   // muted green
        notEligible: { bg: '#f0e0e0', border: '#d9c5c5' },   // muted red
        needsInfo:   { bg: '#f0ead0', border: '#d9d0b0' },   // muted yellow
        closed:      { bg: '#e8e8e8', border: '#c5c5c5' },   // muted grey
    };

    function getMutedCardColors(eligibility) {
        const isNotElig = isNotEligible(eligibility);
        const needsInfoFlag = needsInfo(eligibility);
        if (isNotElig) return MUTED_COLORS.notEligible;
        if (needsInfoFlag) return MUTED_COLORS.needsInfo;
        return MUTED_COLORS.eligible;
    }

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

    // ===== ELIGIBILITY CHECKS =====
    // ...existing code for PACEEligibilityCheck...
    async function PACEEligibilityCheck(members) {
        const Utils = getUtils();
        if (!Utils) {
            console.error('Cannot run PACEEligibilityCheck: EligibilityUtils not available');
            return;
        }
        for (const member of members) {
            try {
                if ((member.deceased ?? '').toLowerCase() === 'yes') {
                    member.PACE = {
                        adjustedIncome: 0,
                        combinedIncome: 0,
                        eligibility: ["Not Checked"],
                        screeningInProgress: member.PACE?.screeningInProgress ?? false,
                        screeningCloseReason: member.PACE?.screeningCloseReason ?? "Not Applicable"
                    };
                    continue;
                }
    
                const incomes = member.income || [];
                const previousYearIncomes = incomes.filter(income => income.type && income.type.toLowerCase() === "previous");
    
                const currentYear = new Date().getFullYear();
                const previousYear = currentYear - 1;
                const previousYearStart = new Date(previousYear, 0, 1);
                const previousYearEnd = new Date(previousYear, 11, 31);
    
                let totalIncome = previousYearIncomes.reduce((sum, income) => {
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
    
                member.PACE = {
                    ...(member.PACE || {}),
                    adjustedIncome: totalIncome,
                    screeningInProgress: member.PACE?.screeningInProgress ?? true,
                    screeningCloseReason: member.PACE?.screeningCloseReason ?? null
                };
            } catch (error) {
                console.error(`Error calculating adjusted income for ${member.firstName} ${member.lastName}:`, error);
            }
        }
    
        const combinedValues = new Map();
        for (const member of members) {
            if ((member.deceased ?? '').toLowerCase() === 'yes') continue;
            const spouseRelation = member.relationships?.find(r => r.relationship === 'spouse');
            const spouse = spouseRelation ? members.find(m => m.householdMemberId === spouseRelation.relatedMemberId) : null;
            const hasLivingSpouse = spouse && (spouse.deceased ?? '').toLowerCase() !== 'yes';
            let combinedIncome;
            if (hasLivingSpouse) {
                combinedIncome = (Number(member.PACE?.adjustedIncome) || 0) + (Number(spouse.PACE?.adjustedIncome) || 0);
            } else {
                combinedIncome = member.PACE?.adjustedIncome || 0;
            }
            combinedValues.set(member.householdMemberId, { combinedIncome, hasLivingSpouse });
        }
    
        for (const member of members) {
            try {
                if ((member.deceased ?? '').toLowerCase() === 'yes') continue;
                const values = combinedValues.get(member.householdMemberId);
                if (!values) continue;
                const { combinedIncome, hasLivingSpouse } = values;
                const eligibility = [];
                const age = member.age;
                const [years, months, days] = age.replace(/Years,|Months,|Days/g, '').trim().split(/\s+/).map(value => parseInt(value.trim()) || 0);
    
                if (years < 64 || (years === 64 && months < 11) || (years === 64 && months === 11 && days < 0)) {
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
                        if (hasLivingSpouse) {
                            if (combinedIncome < Utils.PACE_THRESHOLDS.married.pace) eligibility.push("Likely Eligible for PACE");
                            else if (combinedIncome <= Utils.PACE_THRESHOLDS.married.pacenet) eligibility.push("Likely Eligible for PACENET");
                            else if (combinedIncome <= Utils.PACE_THRESHOLDS.married.buffer) eligibility.push("Likely Ineligible but Within Buffer");
                            else eligibility.push("Not Likely Eligible for PACE or PACENET (Income)");
                        } else {
                            if (combinedIncome < Utils.PACE_THRESHOLDS.single.pace) eligibility.push("Likely Eligible for PACE");
                            else if (combinedIncome <= Utils.PACE_THRESHOLDS.single.pacenet) eligibility.push("Likely Eligible for PACENET");
                            else if (combinedIncome <= Utils.PACE_THRESHOLDS.single.buffer) eligibility.push("Likely Ineligible but Within Buffer");
                            else eligibility.push("Not Likely Eligible for PACE or PACENET (Income)");
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
            } catch (error) {
                console.error(`Error processing member ${member.firstName} ${member.lastName}:`, error);
            }
        }
    
        const cId = getQueryParameter('id');
        try {
            await fetch(`/save-household-members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId: cId, householdMembers: members }),
            });
        } catch (error) {
            console.error('Error saving household members:', error);
        }
    }
    
    async function LISEligibilityCheck(members) {
        const Utils = getUtils();
        if (!Utils) return;
    
        for (const member of members) {
            try {
                if ((member.deceased ?? '').toLowerCase() === 'yes') {
                    member.LIS = { combinedIncome: 0, combinedAssets: 0, adjustedIncome: 0, adjustedAssets: 0, eligibility: ["Not Checked"], screeningInProgress: member.LIS?.screeningInProgress ?? false, screeningCloseReason: member.LIS?.screeningCloseReason ?? "Not Applicable" };
                    continue;
                }
                const incomes = member.income || [];
                const currentYearIncomes = Utils.filterCurrentIncomes(incomes);
                let totalIncome = currentYearIncomes.reduce((sum, income) => {
                    const yearlyAmount = Utils.calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate);
                    return sum + (yearlyAmount / 12);
                }, 0);
                const assets = member.assets || [];
                const totalAssets = assets.reduce((sum, asset) => sum + Number(asset.value || 0), 0);
                member.LIS = { ...(member.LIS || {}), adjustedIncome: totalIncome, adjustedAssets: totalAssets, screeningInProgress: member.LIS?.screeningInProgress ?? true, screeningCloseReason: member.LIS?.screeningCloseReason ?? null };
            } catch (error) {
                console.error(`Error calculating LIS for ${member.firstName} ${member.lastName}:`, error);
            }
        }
    
        const combinedValues = new Map();
        for (const member of members) {
            if ((member.deceased ?? '').toLowerCase() === 'yes') continue;
            const spouseRelation = member.relationships?.find(r => r.relationship === 'spouse');
            const spouse = spouseRelation ? members.find(m => m.householdMemberId === spouseRelation.relatedMemberId) : null;
            const hasLivingSpouse = spouse && (spouse.deceased ?? '').toLowerCase() !== 'yes';
            let combinedIncome, combinedAssets;
            if (hasLivingSpouse) {
                combinedIncome = (Number(member.LIS?.adjustedIncome) || 0) + (Number(spouse.LIS?.adjustedIncome) || 0);
                combinedAssets = (Number(member.LIS?.adjustedAssets) || 0) + (Number(spouse.LIS?.adjustedAssets) || 0);
            } else {
                combinedIncome = member.LIS?.adjustedIncome || 0;
                combinedAssets = member.LIS?.adjustedAssets || 0;
            }
            combinedValues.set(member.householdMemberId, { combinedIncome, combinedAssets, hasLivingSpouse });
        }
    
        for (const member of members) {
            try {
                if ((member.deceased ?? '').toLowerCase() === 'yes') continue;
                const values = combinedValues.get(member.householdMemberId);
                if (!values) continue;
                const { combinedIncome, combinedAssets, hasLivingSpouse } = values;
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
                    const householdSize = hasLivingSpouse ? 2 : 1;
                    const incomeLimit = Utils.LIS_THRESHOLDS.getIncomeLimit(householdSize);
                    const assetLimit = hasLivingSpouse ? Utils.LIS_THRESHOLDS.assets.married : Utils.LIS_THRESHOLDS.assets.single;
                    const incomeEligible = combinedIncome <= incomeLimit;
                    const assetEligible = combinedAssets <= assetLimit;
                    if (incomeEligible && assetEligible) eligibility.push("Likely Eligible for LIS");
                    else if (!incomeEligible && !assetEligible) eligibility.push("Not Likely Eligible for LIS (Income and Assets)");
                    else if (!incomeEligible) eligibility.push("Not Likely Eligible for LIS (Income)");
                    else eligibility.push("Not Likely Eligible for LIS (Assets)");
                }
    
                member.LIS = { adjustedIncome: member.LIS?.adjustedIncome || 0, adjustedAssets: member.LIS?.adjustedAssets || 0, combinedIncome: Math.max(0, combinedIncome || 0), combinedAssets: Math.max(0, combinedAssets || 0), eligibility, screeningInProgress: member.LIS?.screeningInProgress ?? true, screeningCloseReason: member.LIS?.screeningCloseReason ?? null };
            } catch (error) {
                console.error(`Error processing LIS for ${member.firstName} ${member.lastName}:`, error);
            }
        }
    
        const cId = getQueryParameter('id');
        try { await fetch(`/save-household-members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: cId, householdMembers: members }) }); } catch (error) { console.error('Error saving:', error); }
    }
    
    async function MSPEligibilityCheck(members) {
        const Utils = getUtils();
        if (!Utils) return;
    
        for (const member of members) {
            try {
                if ((member.deceased ?? '').toLowerCase() === 'yes') {
                    member.MSP = { combinedIncome: 0, combinedAssets: 0, adjustedIncome: 0, adjustedAssets: 0, grossMonthlyIncome: 0, eligibility: ["Not Checked"], screeningInProgress: member.MSP?.screeningInProgress ?? false, screeningCloseReason: member.MSP?.screeningCloseReason ?? "Not Applicable" };
                    continue;
                }
                const incomes = member.income || [];
                const currentYearIncomes = Utils.filterCurrentIncomes(incomes);
                let totalMonthlyIncome = currentYearIncomes.reduce((sum, income) => { const yearlyAmount = Utils.calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate); return sum + (yearlyAmount / 12); }, 0);
                let unearnedMonthlyIncome = currentYearIncomes.filter(income => { const kind = income.kind?.toLowerCase() || ''; return kind !== 'employment' && kind !== 'self-employment'; }).reduce((sum, income) => { const yearlyAmount = Utils.calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate); return sum + (yearlyAmount / 12); }, 0);
                let earnedMonthlyIncome = currentYearIncomes.filter(income => { const kind = income.kind?.toLowerCase() || ''; return kind === 'employment' || kind === 'self-employment'; }).reduce((sum, income) => { const yearlyAmount = Utils.calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate); return sum + (yearlyAmount / 12); }, 0);
                let remainingGeneralDeduction = Utils.MSP_DEDUCTIONS.otherDeduction;
                if (unearnedMonthlyIncome >= remainingGeneralDeduction) { unearnedMonthlyIncome -= remainingGeneralDeduction; remainingGeneralDeduction = 0; } else { remainingGeneralDeduction -= unearnedMonthlyIncome; unearnedMonthlyIncome = 0; }
                if (earnedMonthlyIncome > 0) { earnedMonthlyIncome = Math.max(0, earnedMonthlyIncome - remainingGeneralDeduction); earnedMonthlyIncome = Math.max(0, earnedMonthlyIncome - Utils.MSP_DEDUCTIONS.employmentDeduction); earnedMonthlyIncome = earnedMonthlyIncome / 2; }
                const adjustedMonthlyIncome = unearnedMonthlyIncome + earnedMonthlyIncome;
                const assets = member.assets || [];
                const totalAssets = assets.reduce((sum, asset) => sum + Number(asset.value || 0), 0);
                member.MSP = { ...(member.MSP || {}), adjustedIncome: adjustedMonthlyIncome, grossMonthlyIncome: totalMonthlyIncome, adjustedAssets: totalAssets, screeningInProgress: member.MSP?.screeningInProgress ?? true, screeningCloseReason: member.MSP?.screeningCloseReason ?? null };
            } catch (error) { console.error(`Error calculating MSP for ${member.firstName} ${member.lastName}:`, error); }
        }
    
        const combinedValues = new Map();
        for (const member of members) {
            if ((member.deceased ?? '').toLowerCase() === 'yes') continue;
            const spouseRelation = member.relationships?.find(r => r.relationship === 'spouse');
            const spouse = spouseRelation ? members.find(m => m.householdMemberId === spouseRelation.relatedMemberId) : null;
            const hasLivingSpouse = spouse && (spouse.deceased ?? '').toLowerCase() !== 'yes';
            let combinedIncome, combinedAssets;
            if (hasLivingSpouse) { combinedIncome = (Number(member.MSP?.adjustedIncome) || 0) + (Number(spouse.MSP?.adjustedIncome) || 0); combinedAssets = (Number(member.MSP?.adjustedAssets) || 0) + (Number(spouse.MSP?.adjustedAssets) || 0); } else { combinedIncome = member.MSP?.adjustedIncome || 0; combinedAssets = member.MSP?.adjustedAssets || 0; }
            combinedValues.set(member.householdMemberId, { combinedIncome, combinedAssets, hasLivingSpouse });
        }
    
        for (const member of members) {
            try {
                if ((member.deceased ?? '').toLowerCase() === 'yes') continue;
                const values = combinedValues.get(member.householdMemberId);
                if (!values) continue;
                const { combinedIncome, combinedAssets, hasLivingSpouse } = values;
                const eligibility = [];
                const medicareEnrollment = member.medicare?.toLowerCase();
                const medicaidEnrollment = member.medicaid?.toLowerCase();
                const mspEnrollment = member.selections?.["Is this person currently enrolled in the Medicare Savings Program?"]?.toLowerCase();
                if (!medicareEnrollment || medicareEnrollment === 'n/a' || medicareEnrollment === '') { eligibility.push("Needs Current Medicare Enrollment Status"); }
                else if (medicareEnrollment !== 'yes') { eligibility.push("Not Enrolled in Medicare"); member.selections = member.selections || {}; member.selections["Is this person currently enrolled in the Medicare Savings Program?"] = null; }
                else if (medicaidEnrollment === 'yes') { eligibility.push("Enrolled in Medicaid"); }
                else if (mspEnrollment === 'yes') { eligibility.push("Already Enrolled"); }
                else if (mspEnrollment === 'notinterested') { eligibility.push("Not Interested"); }
                else if (!mspEnrollment) { eligibility.push("Needs Current MSP Enrollment Status"); }
                else {
                    const householdSize = hasLivingSpouse ? 2 : 1;
                    const assetLimit = hasLivingSpouse ? Utils.MSP_THRESHOLDS.assets.married : Utils.MSP_THRESHOLDS.assets.single;
                    const qmbIncomeLimit = Utils.MSP_THRESHOLDS.getIncomeLimit(householdSize, 'qmb');
                    const slmbIncomeLimit = Utils.MSP_THRESHOLDS.getIncomeLimit(householdSize, 'slmb');
                    const qiIncomeLimit = Utils.MSP_THRESHOLDS.getIncomeLimit(householdSize, 'qi');
                    const assetEligible = combinedAssets <= assetLimit;
                    if (!assetEligible) { if (combinedIncome > qiIncomeLimit) eligibility.push("Not Likely Eligible for MSP (Income and Assets)"); else eligibility.push("Not Likely Eligible for MSP (Assets)"); }
                    else if (combinedIncome <= qmbIncomeLimit) eligibility.push("Likely Eligible for QMB");
                    else if (combinedIncome <= slmbIncomeLimit) eligibility.push("Likely Eligible for SLMB");
                    else if (combinedIncome <= qiIncomeLimit) eligibility.push("Likely Eligible for QI");
                    else eligibility.push("Not Likely Eligible for MSP (Income)");
                }
                member.MSP = { adjustedIncome: member.MSP?.adjustedIncome || 0, adjustedAssets: member.MSP?.adjustedAssets || 0, grossMonthlyIncome: member.MSP?.grossMonthlyIncome || 0, combinedIncome: Math.max(0, combinedIncome || 0), combinedAssets: Math.max(0, combinedAssets || 0), eligibility, screeningInProgress: member.MSP?.screeningInProgress ?? true, screeningCloseReason: member.MSP?.screeningCloseReason ?? null };
            } catch (error) { console.error(`Error processing MSP for ${member.firstName} ${member.lastName}:`, error); }
        }
    
        const cId = getQueryParameter('id');
        try { await fetch(`/save-household-members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: cId, householdMembers: members }) }); } catch (error) { console.error('Error saving:', error); }
    }
    
    async function PTRREligibilityCheck(members) {
        const Utils = getUtils();
        if (!Utils) return;
        const cId = getQueryParameter('id');
        const freshClientResponse = await fetch(`/get-client/${cId}`);
        const freshClient = freshClientResponse.ok ? await freshClientResponse.json() : client;
        const headOfHouseholdMembers = members.filter(member => member.headOfHousehold === true);
        members.forEach(member => {
            if (!member.headOfHousehold) {
                member.PTRR = { combinedIncome: 0, eligibility: ["Not Checked"], screeningInProgress: member.PTRR?.screeningInProgress ?? false, screeningCloseReason: member.PTRR?.screeningCloseReason ?? "Not Applicable" };
            }
        });
    
        for (const member of headOfHouseholdMembers) {
            try {
                const incomes = member.income || [];
                const previousYearIncomes = incomes.filter(income => income.type && income.type.toLowerCase() === "previous");
                const currentYear = new Date().getFullYear();
                const previousYear = currentYear - 1;
                const previousYearStart = new Date(previousYear, 0, 1);
                const previousYearEnd = new Date(previousYear, 11, 31);
    
                let totalGrossIncome = previousYearIncomes.reduce((sum, income) => {
                    let yearlyMultiplier;
                    switch ((income.frequency || '').toLowerCase()) {
                        case 'one-time': yearlyMultiplier = 1; break; case 'weekly': yearlyMultiplier = 52; break; case 'bi-weekly': yearlyMultiplier = 26; break; case 'semi-monthly': yearlyMultiplier = 24; break; case 'monthly': yearlyMultiplier = 12; break; case 'quarterly': yearlyMultiplier = 4; break; case 'annually': yearlyMultiplier = 1; break; default: yearlyMultiplier = 0; break;
                    }
                    let yearlyAmount = Number(income.amount || 0) * yearlyMultiplier;
                    if (Utils.PTRR_THRESHOLDS.halfIncomeTypes.includes(income.kind?.toLowerCase())) yearlyAmount /= 2;
                    const incomeParts = income.startDate.split('-');
                    const incomeStart = new Date(parseInt(incomeParts[0]), parseInt(incomeParts[1]) - 1, parseInt(incomeParts[2]));
                    let incomeEnd;
                    if (income.endDate) { const endParts = income.endDate.split('-'); incomeEnd = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2])); } else { incomeEnd = new Date(); }
                    if (incomeStart <= previousYearEnd && incomeEnd >= previousYearStart) {
                        const activeStart = incomeStart < previousYearStart ? previousYearStart : incomeStart;
                        const activeEnd = incomeEnd > previousYearEnd ? previousYearEnd : incomeEnd;
                        const activeDays = Math.min((activeEnd - activeStart) / (1000 * 60 * 60 * 24) + 1, 365);
                        return sum + yearlyAmount * (activeDays / 365);
                    }
                    return sum;
                }, 0);
    
                const spouse = members.find(m => m.householdMemberId === member.previousSpouseId);
                if (spouse) {
                    const spouseIncomes = spouse.income || [];
                    const spousePreviousYearIncomes = spouseIncomes.filter(income => income.type && income.type.toLowerCase() === "previous");
                    let spouseTotalGrossIncome = spousePreviousYearIncomes.reduce((sum, income) => {
                        let yearlyMultiplier;
                        switch ((income.frequency || '').toLowerCase()) {
                            case 'one-time': yearlyMultiplier = 1; break; case 'weekly': yearlyMultiplier = 52; break; case 'bi-weekly': yearlyMultiplier = 26; break; case 'semi-monthly': yearlyMultiplier = 24; break; case 'monthly': yearlyMultiplier = 12; break; case 'quarterly': yearlyMultiplier = 4; break; case 'annually': yearlyMultiplier = 1; break; default: yearlyMultiplier = 0; break;
                        }
                        let yearlyAmount = Number(income.amount || 0) * yearlyMultiplier;
                        if (Utils.PTRR_THRESHOLDS.halfIncomeTypes.includes(income.kind?.toLowerCase())) yearlyAmount /= 2;
                        const incomeParts = income.startDate.split('-');
                        const incomeStart = new Date(parseInt(incomeParts[0]), parseInt(incomeParts[1]) - 1, parseInt(incomeParts[2]));
                        let incomeEnd;
                        if (income.endDate) { const endParts = income.endDate.split('-'); incomeEnd = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2])); } else { incomeEnd = new Date(); }
                        if (incomeStart <= previousYearEnd && incomeEnd >= previousYearStart) {
                            const activeStart = incomeStart < previousYearStart ? previousYearStart : incomeStart;
                            const activeEnd = incomeEnd > previousYearEnd ? previousYearEnd : incomeEnd;
                            const activeDays = Math.min((activeEnd - activeStart) / (1000 * 60 * 60 * 24) + 1, 365);
                            return sum + yearlyAmount * (activeDays / 365);
                        }
                        return sum;
                    }, 0);
                    totalGrossIncome += spouseTotalGrossIncome;
                }
    
                const eligibility = [];
                const applicationStatus = member.selections?.["Has this person already applied for PTRR this year?"]?.toLowerCase();
                const dob = new Date(member.dob);
                const today = new Date();
                let age = today.getFullYear() - dob.getFullYear();
                const isDisabled = member.disability?.toLowerCase() === "yes";
                const isWidowed = member.previousMaritalStatus?.toLowerCase() === "widowed";
                if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--;
    
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
                } else if (!applicationStatus || applicationStatus.toLowerCase().trim() === "n/a" || applicationStatus.toLowerCase().trim() === "not interested" || applicationStatus.toLowerCase().trim() === "agecriterianotmet") {
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
                            return (isPropertyTax || isRent) && isPreviousYear;
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
                    } else if (applicationStatus.toLowerCase().trim() === "no" && freshClient.residenceStatus?.toLowerCase() === "rentedowned") {
                        // For rentedowned, must have BOTH a Property Tax AND a Rent expense
                        const hasPreviousPropertyTax = relevantExpenses.some(e => e.kind?.trim() === "Property Taxes");
                        const hasPreviousRent = relevantExpenses.some(e => e.kind?.trim() === "Rent");

                        if (!hasPreviousPropertyTax && !hasPreviousRent) {
                            eligibility.push("Needs Previous Year Property Tax and Rent Expense");
                        } else if (!hasPreviousPropertyTax) {
                            eligibility.push("Needs Previous Year Property Tax Expense");
                        } else if (!hasPreviousRent) {
                            eligibility.push("Needs Previous Year Rent Expense");
                        } else {
                            eligibility.push("Likely Eligible for PTRR");
                        }
                    } else {
                        eligibility.push("Likely Eligible for PTRR");
                    }
                }
    
                member.PTRR = { combinedIncome: totalGrossIncome, eligibility, screeningInProgress: member.PTRR?.screeningInProgress ?? true, screeningCloseReason: member.PTRR?.screeningCloseReason ?? null };
            } catch (error) { console.error(`Error processing ${member.firstName} ${member.lastName}:`, error); }
        }
    
        try { await fetch(`/save-household-members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: cId, householdMembers: members }) }); } catch (error) { console.error('Error saving:', error); }
    }

    async function SNAPEligibilityCheck(members, isFarmworker) {
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

        for (const household of snapHouseholds) {
            try {
                let combinedYearlyIncome = 0, combinedAssets = 0, totalUtilityAllowance = 0, totalShelterExpenses = 0, totalMedicalExpenses = 0, totalOtherExpenses = 0;
                const householdSize = household.length;
                for (const member of household) {
                    const currentIncomes = filterCurrentIncomes(member.income);
                    combinedYearlyIncome += currentIncomes.reduce((sum, income) => sum + calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate), 0);
                    combinedAssets += (member.assets || []).reduce((sum, asset) => sum + Number(asset.value), 0);
                    if (totalUtilityAllowance === 0) totalUtilityAllowance = calculateUtilityAllowance(member, client?.homelessness === 'yes');
                    if (totalShelterExpenses === 0) totalShelterExpenses = (member.expenses || []).filter(e => e.type?.toLowerCase() === "shelter").reduce((sum, e) => sum + calculateYearlyIncome(e.amount, e.frequency, e.startDate, e.endDate) / 12, 0);
                    if (totalMedicalExpenses === 0) { const med = (member.expenses || []).filter(e => e.type?.toLowerCase() === "medical").reduce((sum, e) => sum + calculateYearlyIncome(e.amount, e.frequency, e.startDate, e.endDate) / 12, 0); totalMedicalExpenses = med >= SNAP_MEDICAL_EXPENSE_THRESHOLD ? med : 0; }
                    if (totalOtherExpenses === 0) totalOtherExpenses = (member.expenses || []).filter(e => e.type?.toLowerCase() === "other").reduce((sum, e) => sum + calculateYearlyIncome(e.amount, e.frequency, e.startDate, e.endDate) / 12, 0);
                }
                const combinedMonthlyIncome = combinedYearlyIncome / 12;
                const standardDeduction = SNAP_STANDARD_DEDUCTIONS[householdSize] || 0;
                const employmentIncomeMonthly = household.reduce((sum, member) => sum + filterCurrentIncomes(member.income).filter(i => i.kind === "Employment" || i.kind === "Self-Employment").reduce((s, i) => s + calculateYearlyIncome(i.amount, i.frequency, i.startDate, i.endDate) / 12, 0), 0);
                const otherIncomeMonthly = household.reduce((sum, member) => sum + filterCurrentIncomes(member.income).filter(i => i.kind !== "Employment" && i.kind !== "Self-Employment").reduce((s, i) => s + calculateYearlyIncome(i.amount, i.frequency, i.startDate, i.endDate) / 12, 0), 0);
                const adjustedMonthlyIncome = (employmentIncomeMonthly * 0.8) + otherIncomeMonthly;
                let totalNetIncome = Math.max(0, adjustedMonthlyIncome - standardDeduction - totalMedicalExpenses - totalOtherExpenses);
                const halfPrelimNetIncome = totalNetIncome / 2;
                let excessShelterCost = Math.max(0, totalShelterExpenses + totalUtilityAllowance - halfPrelimNetIncome);
                const hasElderlyOrDisabled = household.some(member => { const { years } = parseAge(member.age); return years >= 60 || member.disability?.toLowerCase() === "yes"; });
                if (!hasElderlyOrDisabled) excessShelterCost = Math.min(excessShelterCost, SNAP_SHELTER_COST_CAP);
                totalNetIncome = Math.max(0, totalNetIncome - excessShelterCost);
                const grossIncomeLimit = SNAP_GROSS_INCOME_LIMITS[householdSize] || 0;
                let snapEligibility;
                if (combinedMonthlyIncome <= grossIncomeLimit) { snapEligibility = ["Likely Eligible for SNAP"]; }
                else if (hasElderlyOrDisabled) { const netIncomeLimit = SNAP_NET_INCOME_LIMITS[householdSize] || 0; if (combinedAssets > SNAP_ELDERLY_DISABLED_ASSET_LIMIT) snapEligibility = ["Not Likely Eligible for SNAP (Income and Assets)"]; else if (totalNetIncome <= netIncomeLimit) snapEligibility = ["Likely Eligible for SNAP"]; else snapEligibility = ["Not Likely Eligible for SNAP (Income)"]; }
                else { snapEligibility = ["Not Likely Eligible for SNAP (Income)"]; }
                const snapBenefit = calculateSNAPBenefit(totalNetIncome, householdSize, snapEligibility[0]);
                const hasActiveIncome = household.some(m => filterCurrentIncomes(m.income).length > 0);
                household.forEach(member => {
                    if (member.meals?.toLowerCase() === "yes") {
                        member.SNAP = { combinedMonthlyIncome, combinedAssets, eligibility: snapEligibility, householdSize, totalNetIncome, totalUtilityAllowance, totalShelterExpenses, totalMedicalExpenses, totalOtherExpenses, standardDeduction, excessShelterCost, benefitAmount: snapBenefit, expeditedEligibility: determineExpeditedEligibility(combinedMonthlyIncome, combinedAssets, totalUtilityAllowance, totalShelterExpenses, isFarmworker, hasActiveIncome) };
                    }
                });
            } catch (error) { console.error('Error processing SNAP household:', error); }
        }
        await saveHouseholdMembers(members);
    }

    async function LIHEAPEligibilityCheck() {
        try {
            const clientData = await fetchClient();
            if (!clientData?.householdMembers) return;
            const members = clientData.householdMembers;
            const activeMembersForLIHEAP = members.filter(m => (m.deceased ?? '').toLowerCase() !== 'yes');
            let combinedMonthlyIncome = 0, totalMedicarePremiumDeduction = 0;
            for (const member of activeMembersForLIHEAP) {
                const currentIncomes = filterCurrentIncomes(member.income);
                const yearlyIncome = currentIncomes.reduce((sum, income) => sum + calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate), 0);
                const monthlyIncome = yearlyIncome / 12;
                let medicarePremiumDeduction = 0;
                for (const expense of member.expenses || []) {
                    const isMedicarePremium = expense.kind?.toLowerCase().includes('medicare') && expense.kind?.toLowerCase().includes('premium');
                    const isDeductedFromSSOrPension = expense.deductedFromSSOrPension?.toLowerCase() === 'yes';
                    if (isMedicarePremium && isDeductedFromSSOrPension) { const monthlyAmount = (expense.amount * getYearlyMultiplier(expense.frequency)) / 12; if (monthlyAmount > 0) medicarePremiumDeduction += monthlyAmount; }
                }
                const effectiveDeduction = Math.min(medicarePremiumDeduction, monthlyIncome);
                totalMedicarePremiumDeduction += effectiveDeduction;
                combinedMonthlyIncome += Math.max(0, monthlyIncome - effectiveDeduction);
            }
            const householdSize = activeMembersForLIHEAP.length;
            const incomeLimit = LIHEAP_INCOME_LIMITS[householdSize] || 0;
            const eligibility = [];
            if (clientData.liheapEnrollment === 'notinterested') eligibility.push("Not Interested");
            else if (!clientData.liheapEnrollment || clientData.liheapEnrollment === 'n/a') eligibility.push("Needs Current Enrollment Status");
            else if (['no', 'yes'].includes(clientData.liheapEnrollment) && (!clientData.heatingCrisis || clientData.heatingCrisis === 'n/a')) eligibility.push("Needs Heating Crisis Status");
            else if (clientData.liheapEnrollment === 'yes' && clientData.heatingCrisis === 'no') eligibility.push("Already Enrolled");
            else if (!clientData.residenceStatusCurrent || clientData.residenceStatusCurrent === 'n/a') eligibility.push("Needs Current Residence Status");
            else if (clientData.residenceStatusCurrent !== 'owned' && (!clientData.subsidizedHousing || clientData.subsidizedHousing === 'n/a')) eligibility.push("Needs Subsidized Housing Status");
            else if (clientData.subsidizedHousing === 'yes' && (!clientData.heatingCost || clientData.heatingCost === 'n/a')) eligibility.push("Needs Heating Cost Responsibility Status");
            else if (clientData.subsidizedHousing === 'yes' && clientData.heatingCost === 'yes') eligibility.push("Not Likely Eligible for LIHEAP (Heating cost included in rent, household rent is subsidized)");
            else if (clientData.heatingCrisis === 'yes' && combinedMonthlyIncome <= incomeLimit) eligibility.push("Likely Eligible for LIHEAP (Crisis)");
            else if (clientData.heatingCrisis === 'yes' && combinedMonthlyIncome > incomeLimit) eligibility.push("Not Likely Eligible for LIHEAP but Submission Recommended");
            else if (combinedMonthlyIncome <= incomeLimit) eligibility.push("Likely Eligible for LIHEAP");
            else eligibility.push("Not Likely Eligible for LIHEAP (Income)");
            activeMembersForLIHEAP.forEach(member => { member.LIHEAP = { combinedMonthlyIncome, totalMedicarePremiumDeduction, eligibility }; });
            await saveHouseholdMembers(members);
        } catch (error) { console.error('Error processing LIHEAP eligibility:', error); }
    }

    // ===== READ-ONLY BENEFIT CARD (no flip, no buttons) =====
    function generateReadOnlyBenefitCard(benefit, member) {
        const bObj = member[benefit];
        if (!bObj || bObj.eligibility?.includes('Not Checked')) return '';

        const eligArray = bObj.eligibility?.map(capitalizeFirstLetter) || [];
        const { bg: bgColor, border: borderColor } = getMutedCardColors(bObj.eligibility);

        const incomeLabel = benefit === 'PACE' ? 'Gross Adjusted Income' : 
                           benefit === 'PTRR' ? 'Gross Income' : 'Gross Income';
        const showAssets = ['LIS', 'MSP'].includes(benefit);

        // Check if screening was closed
        const isClosed = bObj.screeningInProgress === false;
        const closedReason = bObj.screeningCloseReason || 'N/A';

        return `
            <div style="
                width: 100%;
                margin: 8px auto;
                background-color: ${isClosed ? MUTED_COLORS.closed.bg : bgColor};
                border: 1px solid ${isClosed ? MUTED_COLORS.closed.border : borderColor};
                border-radius: 4px;
                padding: 8px;
                box-sizing: border-box;
                opacity: 0.85;
            ">
                <details class="custom-details" style="background-color: transparent; border-radius: 4px; padding: 8px; width: 100%; box-sizing: border-box;">
                    <summary style="display: flex; flex-direction: column; align-items: center; cursor: pointer; text-align: center; padding: 8px;">
                        <br><strong>${benefit}</strong><br>
                        <span class="toggle-text" style="font-size: 14px; margin-bottom: 4px; color: #777;"><i>Show Details</i></span>
                        <p style="color: #555;"><strong></strong> ${eligArray.join(', ') || 'Not Available'}</p>
                        ${isClosed ? `<p style="font-size: 12px; color: #888;"><em>Closed: ${closedReason}</em></p>` : ''}
                    </summary>
                    <hr style="border-color: #ddd;">
                    <p style="color: #666;"><strong>${incomeLabel}:</strong> $${bObj.combinedIncome?.toFixed(2) || 'N/A'}</p>
                    ${showAssets ? `<p style="color: #666;"><strong>Combined Assets:</strong> $${bObj.combinedAssets?.toFixed(2) || 'N/A'}</p>` : ''}
                </details>
            </div>
        `;
    }

    function generateReadOnlyClosedBox(benefit, benefitObj) {
        if (!benefitObj || benefitObj.screeningInProgress !== false) return '';
        return `
            <div style="background-color: ${MUTED_COLORS.closed.bg}; border: 1px solid ${MUTED_COLORS.closed.border}; padding: 8px; border-radius: 4px; margin: 8px auto; text-align: center; width: 100%; box-sizing: border-box; opacity: 0.85;">
                <p style="margin: 0 0 6px 0; color: #666;"><strong>${benefit} Screening Closed</strong></p>
                <p style="margin: 0; font-size: 12px; color: #888;">Reason: ${benefitObj.screeningCloseReason || 'N/A'}</p>
            </div>
        `;
    }

    // ===== DISPLAY FUNCTIONS (READ-ONLY) =====
    async function displayHouseholdMembers() {
        const householdMemberContainer = document.getElementById('household-members-container');
        const members = await loadHouseholdMembers();

        householdMemberContainer.innerHTML = '';

        if (members.length === 0) {
            const noMembersMessage = document.createElement('p');
            noMembersMessage.textContent = 'No household members found.';
            householdMemberContainer.appendChild(noMembersMessage);
            return;
        }

        // Sort members
        members.sort((a, b) => {
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
            if (aHasOpen !== bHasOpen) return bHasOpen - aHasOpen;
            if (b.headOfHousehold !== a.headOfHousehold) return b.headOfHousehold - a.headOfHousehold;
            const parseAgeYears = (ageStr) => { if (!ageStr) return 0; const match = ageStr.match(/(\d+)\s*Years?/i); return match ? parseInt(match[1], 10) : 0; };
            const ageA = parseAgeYears(a.age);
            const ageB = parseAgeYears(b.age);
            if (ageA !== ageB) return ageB - ageA;
            return 0;
        });

        members.forEach(member => {
            const memberDiv = document.createElement('div');
            memberDiv.classList.add('household-member-box');
            memberDiv.style.opacity = '0.9';

            const memberFullName = `${capitalizeFirstLetter(member.firstName)} ${capitalizeFirstLetter(member.lastName)}`;
            const isDeceased = (member.deceased ?? '').toLowerCase() === 'yes';

            // Build benefit sections (read-only, no flip cards, no buttons)
            const benefitSections = [];

            INDIVIDUAL_BENEFITS.forEach(benefit => {
                if (isDeceased && benefit !== 'PTRR') return;
                if (benefit === 'PTRR' && !member.headOfHousehold) return;
                if (benefit === 'PTRR' && isDeceased) return;

                const bObj = member[benefit];
                if (!bObj) return;

                if (bObj.screeningInProgress === false) {
                    benefitSections.push({
                        closed: true,
                        html: generateReadOnlyClosedBox(benefit, bObj)
                    });
                } else if (!bObj.eligibility?.includes('Not Checked')) {
                    const html = generateReadOnlyBenefitCard(benefit, member);
                    if (html) benefitSections.push({ closed: false, html });
                }
            });

            benefitSections.sort((a, b) => a.closed - b.closed);

            const spouse = findSpouse(member, members);
            const spouseName = spouse 
                ? `${capitalizeFirstLetter(spouse.firstName)} ${capitalizeFirstLetter(spouse.lastName)}`
                : null;

            memberDiv.innerHTML = `
                <div class="member-badge-area" style="min-height: 40px; display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;">
                    ${member.headOfHousehold ? `<p class="household-member-info" style="color: #666; border: 2px solid #aaa; padding: 5px; display: inline-block; margin: 0;"><strong>Head of Household</strong></p>` : ''}
                    ${isDeceased ? `<p class="household-member-info" style="color: #666; border: 2px solid #aaa; padding: 5px; display: inline-block; margin: 0;"><strong>Deceased</strong></p>` : ''}
                </div>
                <h3 style="color: #555;">${memberFullName}${member.middleInitial ? ` ${capitalizeFirstLetter(member.middleInitial)}` : ''}</h3>
                <p style="color: #666;"><strong>Age:</strong> ${member.age?.split('Y')[0] || 'N/A'}</p>
                <p style="color: #666;"><strong>Marital Status:</strong> ${capitalizeFirstLetter(member.maritalStatus || 'N/A')}</p>
                ${spouseName ? `<p style="color: #666;"><strong>Spouse:</strong> ${spouseName}</p>` : ''}
                <br>
                ${benefitSections.map(s => s.html).join('')}
            `;

            householdMemberContainer.appendChild(memberDiv);

            // Attach "Show Details" / "Hide Details" toggle (read-only, no flip)
            memberDiv.querySelectorAll('details.custom-details').forEach(detailsEl => {
                detailsEl.addEventListener('toggle', () => {
                    const toggleText = detailsEl.querySelector('.toggle-text');
                    if (toggleText) {
                        toggleText.innerHTML = detailsEl.open ? '<i>Hide Details</i>' : '<i>Show Details</i>';
                    }
                });
            });
        });
    }

    // ===== SNAP DISPLAY (READ-ONLY) =====
    async function displaySNAPHouseholds() {
        const snapContainer = document.getElementById('snap-household-container');
        if (!snapContainer) return;

        const members = await loadHouseholdMembers();
        let clientData = null;

        try {
            const clientRes = await fetch(`/get-client/${clientId}`);
            if (clientRes.ok) clientData = await clientRes.json();
        } catch (e) { console.error('Error fetching client:', e); }

        snapContainer.innerHTML = '';

        const snapMembers = members.filter(m => m.meals?.toLowerCase() === "yes");
        const snapProgramStatus = clientData?.programStatus?.SNAP;
        const screeningClosed = snapProgramStatus?.screeningInProgress === false;

        if (screeningClosed) {
            const closedDiv = document.createElement('div');
            closedDiv.classList.add('household-member-box');
            closedDiv.style.backgroundColor = MUTED_COLORS.closed.bg;
            closedDiv.style.borderColor = MUTED_COLORS.closed.border;
            closedDiv.style.opacity = '0.85';
            closedDiv.innerHTML = `
                <h3 style="color: #666;">SNAP HOUSEHOLD</h3>
                ${snapMembers.length > 0 ? `<p style="color: #777;"><strong>Members:</strong> ${snapMembers.map(m => `${capitalizeFirstLetter(m.firstName)} ${capitalizeFirstLetter(m.lastName)}`).join(', ')}</p>` : ''}
                <div style="padding: 8px; text-align: center;">
                    <p style="margin: 0 0 6px 0; color: #666;"><strong>SNAP Screening Closed</strong></p>
                    <p style="margin: 0; font-size: 12px; color: #888;">Reason: ${snapProgramStatus?.screeningCloseReason || 'N/A'}</p>
                </div>
            `;
            snapContainer.appendChild(closedDiv);
            return;
        }

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
                if (other.householdMemberId !== member.householdMemberId && other.meals?.toLowerCase() === "yes") {
                    snapHousehold.push(other);
                    processedMembers.add(other.householdMemberId);
                }
            }
            snapHouseholds.push(snapHousehold);
        }

        if (snapHouseholds.length === 0) {
            const noHouseholdsDiv = document.createElement('div');
            noHouseholdsDiv.classList.add('household-member-box');
            if (isAlreadyEnrolled || isNotInterested) {
                noHouseholdsDiv.style.backgroundColor = MUTED_COLORS.notEligible.bg;
                noHouseholdsDiv.style.borderColor = MUTED_COLORS.notEligible.border;
            } else {
                noHouseholdsDiv.style.backgroundColor = MUTED_COLORS.needsInfo.bg;
                noHouseholdsDiv.style.borderColor = MUTED_COLORS.needsInfo.border;
            }
            noHouseholdsDiv.style.width = '100%';
            noHouseholdsDiv.style.boxSizing = 'border-box';
            noHouseholdsDiv.style.opacity = '0.85';
            noHouseholdsDiv.innerHTML = `
                <details class="custom-details">
                    <summary style="display: flex; flex-direction: column; align-items: center; cursor: pointer; text-align: center; padding: 8px;">
                        <h3 style="margin: 4px 0; color: #555;">SNAP</h3>
                        <span class="toggle-text" style="font-size: 14px; margin-bottom: 4px; color: #777;"><i>Show Details</i></span>
                    </summary>
                    ${isAlreadyEnrolled ? '<p style="color: #666;">ALREADY ENROLLED</p>' : isNotInterested ? '<p style="color: #666;">NOT INTERESTED</p>' : '<p style="color: #666;">NO SNAP HOUSEHOLD MEMBERS FOUND.</p>'}
                </details>
            `;
            snapContainer.appendChild(noHouseholdsDiv);
            const noHouseholdsDetails = noHouseholdsDiv.querySelector('details.custom-details');
            if (noHouseholdsDetails) {
                noHouseholdsDetails.addEventListener('toggle', () => {
                    const toggleText = noHouseholdsDetails.querySelector('.toggle-text');
                    if (toggleText) toggleText.innerHTML = noHouseholdsDetails.open ? '<i>Hide Details</i>' : '<i>Show Details</i>';
                });
            }
            return;
        }

        snapHouseholds.forEach(household => {
            const householdDiv = createReadOnlySNAPCard(household);
            snapContainer.appendChild(householdDiv);
        });
    }

    function createReadOnlySNAPCard(household) {
        const snapMemberNames = household.map(m => 
            `${capitalizeFirstLetter(m.firstName)} ${capitalizeFirstLetter(m.lastName)}`
        ).join(', ');

        const snapData = household[0]?.SNAP || {};
        const isSnapScreeningClosed = snapData.screeningInProgress === false;

        const householdDiv = document.createElement('div');
        householdDiv.classList.add('household-member-box');
        householdDiv.style.opacity = '0.85';

        if (isSnapScreeningClosed) {
            householdDiv.style.backgroundColor = MUTED_COLORS.closed.bg;
            householdDiv.style.borderColor = MUTED_COLORS.closed.border;
            householdDiv.innerHTML = `
                <h3 style="color: #666;">SNAP HOUSEHOLD</h3>
                <p style="color: #777;"><strong>Members:</strong> ${snapMemberNames}</p>
                <div style="padding: 8px; text-align: center;">
                    <p style="margin: 0 0 6px 0; color: #666;"><strong>SNAP Screening Closed</strong></p>
                    <p style="margin: 0; font-size: 12px; color: #888;">Reason: ${snapData.screeningCloseReason || 'N/A'}</p>
                </div>
            `;
            return householdDiv;
        }

        const eligibility = snapData.eligibility?.map(capitalizeFirstLetter) || ['Not Available'];
        const { bg: cardBgColor, border: cardBorderColor } = getMutedCardColors(snapData.eligibility);
        const snapIsLikelyElig = isLikelyEligible(snapData.eligibility);
        const benefitAmount = snapData.benefitAmount || 0;
        const expeditedEligibility = snapData.expeditedEligibility || 'N/A';

        householdDiv.style.backgroundColor = cardBgColor;
        householdDiv.style.borderColor = cardBorderColor;

        householdDiv.innerHTML = `
            <details class="custom-details" style="background-color: transparent; border-radius: 4px; padding: 8px; margin: 8px auto; width: 100%; box-sizing: border-box;">
                <summary style="display: flex; flex-direction: column; align-items: center; cursor: pointer; text-align: center; padding: 8px;">
                    <br><strong style="color: #555;">SNAP</strong><br>
                    <span class="toggle-text" style="font-size: 14px; margin-bottom: 4px; color: #777;"><i>Show Details</i></span>
                    <p style="color: #666;"><strong>Members:</strong> ${snapMemberNames}</p>
                    <p style="color: #666;"><strong>Eligibility:</strong> ${eligibility.join(', ')}</p>
                    ${snapIsLikelyElig && benefitAmount >= 0 ? `
                        <p style="color: #666;"><strong>Estimated Benefit Amount:</strong> ${benefitAmount <= 24 ? "Up to $24.00" : `Up to $24.00 - $${benefitAmount.toFixed(2)}`}</p>
                        <p style="color: #666;"><strong>Expedited Eligibility:</strong> ${expeditedEligibility}</p>
                    ` : ''}
                </summary>
                <hr style="border-color: #ddd;">
                <p style="color: #666;"><strong>SNAP Household Size:</strong> ${snapData.householdSize || household.length}</p>
                <p style="color: #666;"><strong>Total Gross Income:</strong> $${(snapData.combinedMonthlyIncome || 0).toFixed(2)}</p>
                <p style="color: #666;"><strong>Standard Deduction:</strong> $${(snapData.standardDeduction || 0).toFixed(2)}</p>
                <p style="color: #666;"><strong>Shelter Deduction:</strong> $${(snapData.excessShelterCost || 0).toFixed(2)}</p>
                <p style="color: #666;"><strong>Utility Allowance:</strong> $${(snapData.totalUtilityAllowance || 0).toFixed(2)}</p>
                <p style="color: #666;"><strong>Medical Expense Deductions:</strong> $${(snapData.totalMedicalExpenses || 0).toFixed(2)}</p>
                <p style="color: #666;"><strong>Other Expense Deductions:</strong> $${(snapData.totalOtherExpenses || 0).toFixed(2)}</p>
                <p style="color: #666;"><strong>Adjusted Net Income:</strong> $${(snapData.totalNetIncome || 0).toFixed(2)}</p>
                <p style="color: #666;"><strong>Combined Assets:</strong> $${(snapData.combinedAssets || 0).toFixed(2)}</p>
            </details>
        `;

        const snapDetailsEl = householdDiv.querySelector('details.custom-details');
        if (snapDetailsEl) {
            snapDetailsEl.addEventListener('toggle', () => {
                const toggleText = snapDetailsEl.querySelector('.toggle-text');
                if (toggleText) toggleText.innerHTML = snapDetailsEl.open ? '<i>Hide Details</i>' : '<i>Show Details</i>';
            });
        }

        return householdDiv;
    }

    // ===== LIHEAP DISPLAY (READ-ONLY) =====
    async function displayLIHEAPHouseholds() {
        const liheapContainer = document.getElementById('liheap-household-container');
        if (!liheapContainer) return;

        const members = await loadHouseholdMembers();
        let clientData = null;

        try {
            const clientRes = await fetch(`/get-client/${clientId}`);
            if (clientRes.ok) clientData = await clientRes.json();
        } catch (e) { console.error('Error fetching client:', e); }

        liheapContainer.innerHTML = '';

        const activeMembersForLIHEAP = members.filter(m => (m.deceased ?? '').toLowerCase() !== 'yes');
        const liheapMemberNames = activeMembersForLIHEAP.map(m => 
            `${capitalizeFirstLetter(m.firstName)} ${capitalizeFirstLetter(m.lastName)}`
        ).join(', ');

        const liheapProgramStatus = clientData?.programStatus?.LIHEAP;
        const isLiheapScreeningClosed = liheapProgramStatus?.screeningInProgress === false;

        if (isLiheapScreeningClosed) {
            const closedDiv = document.createElement('div');
            closedDiv.classList.add('household-member-box');
            closedDiv.style.backgroundColor = MUTED_COLORS.closed.bg;
            closedDiv.style.borderColor = MUTED_COLORS.closed.border;
            closedDiv.style.opacity = '0.85';
            closedDiv.innerHTML = `
                <h3 style="color: #666;">LIHEAP HOUSEHOLD</h3>
                <div style="padding: 8px; text-align: center;">
                    <p style="margin: 0 0 6px 0; color: #666;"><strong>LIHEAP Screening Closed</strong></p>
                    <p style="margin: 0; font-size: 12px; color: #888;">Reason: ${liheapProgramStatus?.screeningCloseReason || 'N/A'}</p>
                </div>
            `;
            liheapContainer.appendChild(closedDiv);
            return;
        }

        const isLiheapAlreadyEnrolled = client?.liheapEnrollment === 'yes' && client?.heatingCrisis === 'no';
        const isLiheapNotInterested = client?.liheapEnrollment === 'notinterested';

        if (isLiheapAlreadyEnrolled || isLiheapNotInterested) {
            const noHouseholdsDiv = document.createElement('div');
            noHouseholdsDiv.classList.add('household-member-box');
            noHouseholdsDiv.style.backgroundColor = MUTED_COLORS.notEligible.bg;
            noHouseholdsDiv.style.borderColor = MUTED_COLORS.notEligible.border;
            noHouseholdsDiv.style.opacity = '0.85';
            noHouseholdsDiv.innerHTML = `
                <h3 style="color: #666;">LIHEAP HOUSEHOLD</h3>
                ${isLiheapAlreadyEnrolled ? '<p style="color: #666;">ALREADY ENROLLED</p>' : '<p style="color: #666;">NOT INTERESTED</p>'}
            `;
            liheapContainer.appendChild(noHouseholdsDiv);
            return;
        }

        if (activeMembersForLIHEAP.length === 0) {
            const noHouseholdsDiv = document.createElement('div');
            noHouseholdsDiv.classList.add('household-member-box');
            noHouseholdsDiv.style.backgroundColor = MUTED_COLORS.needsInfo.bg;
            noHouseholdsDiv.style.borderColor = MUTED_COLORS.needsInfo.border;
            noHouseholdsDiv.style.opacity = '0.85';
            noHouseholdsDiv.innerHTML = '<h3 style="color: #666;">LIHEAP HOUSEHOLD</h3><p style="color: #666;">NO LIHEAP HOUSEHOLDS FOUND.</p>';
            liheapContainer.appendChild(noHouseholdsDiv);
            return;
        }

        const liheapData = activeMembersForLIHEAP[0]?.LIHEAP || {};
        const householdDiv = createReadOnlyLIHEAPCard(activeMembersForLIHEAP, liheapMemberNames, liheapData);
        liheapContainer.appendChild(householdDiv);
    }

    function createReadOnlyLIHEAPCard(activeMembersForLIHEAP, liheapMemberNames, liheapData) {
        const eligibility = liheapData.eligibility?.map(capitalizeFirstLetter) || ['Not Available'];
        const combinedMonthlyIncome = liheapData.combinedMonthlyIncome || 0;
        const totalMedicarePremiumDeduction = liheapData.totalMedicarePremiumDeduction || 0;
        const grossMonthlyIncome = combinedMonthlyIncome + totalMedicarePremiumDeduction;

        const { bg: cardBgColor, border: cardBorderColor } = getMutedCardColors(liheapData.eligibility);

        const householdDiv = document.createElement('div');
        householdDiv.classList.add('household-member-box');
        householdDiv.style.backgroundColor = cardBgColor;
        householdDiv.style.borderColor = cardBorderColor;
        householdDiv.style.opacity = '0.85';
        householdDiv.style.width = '100%';
        householdDiv.style.boxSizing = 'border-box';

        householdDiv.innerHTML = `
            <details class="custom-details" style="background-color: transparent; border-radius: 4px; padding: 8px; margin: 8px auto; width: 100%; box-sizing: border-box;">
                <summary style="display: flex; flex-direction: column; align-items: center; cursor: pointer; text-align: center; padding: 8px;">
                    <br><strong style="color: #555;">LIHEAP</strong><br>
                    <span class="toggle-text" style="font-size: 14px; margin-bottom: 4px; color: #777;"><i>Show Details</i></span>
                    <p style="color: #666;"><strong>Members:</strong> ${liheapMemberNames}</p>
                    <p style="color: #666;"><strong>Eligibility:</strong> ${eligibility.join(', ')}</p>
                </summary>
                <hr style="border-color: #ddd;">
                <p style="color: #666;"><strong>LIHEAP Household Size:</strong> ${activeMembersForLIHEAP.length}</p>
                <p style="color: #666;"><strong>Total Gross Income:</strong> $${grossMonthlyIncome.toFixed(2)}</p>
                <p style="color: #666;"><strong>Medicare Premium Deductions:</strong> $${totalMedicarePremiumDeduction.toFixed(2)}</p>
                <p style="color: #666;"><strong>Adjusted Gross Income:</strong> $${combinedMonthlyIncome.toFixed(2)}</p>
            </details>
        `;

        const liheapDetailsEl = householdDiv.querySelector('details.custom-details');
        if (liheapDetailsEl) {
            liheapDetailsEl.addEventListener('toggle', () => {
                const toggleText = liheapDetailsEl.querySelector('.toggle-text');
                if (toggleText) toggleText.innerHTML = liheapDetailsEl.open ? '<i>Hide Details</i>' : '<i>Show Details</i>';
            });
        }

        return householdDiv;
    }

    // ===== INITIALIZATION =====
    async function initialize() {
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

        // Display all sections (read-only)
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
        if (typeof resolveEligibilityChecks === 'function') {
            resolveEligibilityChecks();
        }
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
});