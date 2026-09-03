window.EligibilityUtils = (function() {
    
// ===== CONSTANTS =====
const BENEFIT_KEYS = ['PACE', 'LIS', 'MSP', 'PTRR', 'SNAP', 'LIHEAP', 'SFBP'];
const INDIVIDUAL_BENEFITS = ['PACE', 'LIS', 'MSP', 'PTRR', 'SFBP'];

// 2026 Federal Poverty Level (annual)
const FPL = {
    base: 15960,           // 1 person
    perAdditional: 5680,   // each additional person
    get: function(householdSize) {
        if (householdSize <= 0) return 0;
        if (householdSize === 1) return this.base;
        return this.base + (householdSize - 1) * this.perAdditional;
    },
    getMonthly: function(householdSize) {
        return this.get(householdSize) / 12;
    },
    getAtPercent: function(householdSize, percent) {
        return this.get(householdSize) * percent;
    },
    getMonthlyAtPercent: function(householdSize, percent) {
        return this.getMonthly(householdSize) * percent;
    }
};

// FPL percentage thresholds by program
const FPL_PERCENTAGES = {
    LIS: 1.50,              // 150% FPL
    LIHEAP: 1.50,           // 150% FPL
    SNAP_GROSS: 2.00,       // 200% FPL (gross income test)
    SNAP_NET: 1.00,         // 100% FPL (net income test)
    MSP_QMB: 1.00,          // 100% FPL
    MSP_SLMB: 1.20,         // 120% FPL
    MSP_QI: 1.35,            // 135% FPL
    SFBP: 1.30              // 130% FPL
};

const UTILITY_ALLOWANCES = {
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

// PACE thresholds (previous year income) - NOT FPL-based
const PACE_THRESHOLDS = {
    single: {
        pace: 14500,
        pacenet: 33500,
        buffer: 43500
    },
    married: {
        pace: 17700,
        pacenet: 41500,
        buffer: 51500
    },
    minAgeYears: 64,
    minAgeMonths: 11
};

// LIS thresholds (current year income & assets)
const LIS_THRESHOLDS = {
    incomePercent: FPL_PERCENTAGES.LIS,
    getIncomeLimit: (householdSize) => FPL.getMonthlyAtPercent(householdSize, FPL_PERCENTAGES.LIS),
    assets: {
        single: 18090,
        married: 36100
    }
};

// MSP thresholds (monthly income & assets)
const MSP_THRESHOLDS = {
    incomePercents: {
        qmb: FPL_PERCENTAGES.MSP_QMB,
        slmb: FPL_PERCENTAGES.MSP_SLMB,
        qi: FPL_PERCENTAGES.MSP_QI
    },
    getIncomeLimit: (householdSize, level) => {
        const percent = MSP_THRESHOLDS.incomePercents[level];
        return FPL.getMonthlyAtPercent(householdSize, percent);
    },
    assets: {
        single: 9950,
        married: 14910
    }
};

// MSP income deductions
const MSP_DEDUCTIONS = {
    employmentDeduction: 65,
    otherDeduction: 20
};

// PTRR thresholds (previous year income) - NOT FPL-based
const PTRR_THRESHOLDS = {
    incomeLimit: 46520,
    halfIncomeTypes: ["ssa retirement", "ssi", "ssp", "ssdi", "railroad retirement tier 1"]
};

// SNAP thresholds - derived from FPL
const SNAP_MAX_ALLOTMENTS = [0, 298, 546, 785, 994, 1183, 1421, 1571, 1789];
const SNAP_STANDARD_DEDUCTIONS = [0, 209, 209, 209, 223, 261, 299, 299, 299, 299, 299, 299, 299, 299, 299, 299];

// Generate SNAP income limits from FPL
const SNAP_GROSS_INCOME_LIMITS = Array.from({ length: 16 }, (_, i) => 
    i === 0 ? 0 : Math.round(FPL.getMonthlyAtPercent(i, FPL_PERCENTAGES.SNAP_GROSS))
);
const SNAP_NET_INCOME_LIMITS = Array.from({ length: 17 }, (_, i) => 
    i === 0 ? 0 : Math.round(FPL.getMonthlyAtPercent(i, FPL_PERCENTAGES.SNAP_NET))
);

// LIHEAP income limits (150% FPL annually)
const LIHEAP_INCOME_LIMITS = Array.from({ length: 16 }, (_, i) => 
    i === 0 ? 0 : Math.round(FPL.getMonthlyAtPercent(i, FPL_PERCENTAGES.LIHEAP))
);

// SFBP income limits (130% FPL, monthly)
const SFBP_INCOME_LIMITS = Array.from({ length: 16 }, (_, i) =>
    i === 0 ? 0 : Math.round(FPL.getMonthlyAtPercent(i, FPL_PERCENTAGES.SFBP))
);

const SFBP_THRESHOLDS = {
    minAgeYears: 60,
    incomePercent: FPL_PERCENTAGES.SFBP,
    getIncomeLimit: (householdSize) => FPL.getMonthlyAtPercent(householdSize, FPL_PERCENTAGES.SFBP)
};

const SNAP_SHELTER_COST_CAP = 744;
const SNAP_MEDICAL_EXPENSE_THRESHOLD = 35;
const SNAP_ELDERLY_DISABLED_ASSET_LIMIT = 4500;
const SNAP_MINIMUM_BENEFIT = 24;
const SNAP_EXPEDITED_INCOME_LIMIT = 150;
const SNAP_EXPEDITED_ASSET_LIMIT = 100;

    // ===== UTILITY FUNCTIONS =====
    function getQueryParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    function capitalizeFirstLetter(string) {
        return string ? string.toUpperCase() : '';
    }

    function ensureBenefitSchema(members) {
        members.forEach(member => {
            BENEFIT_KEYS.forEach(key => {
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

    // ===== INCOME CALCULATION HELPERS =====
    function getYearlyMultiplier(frequency) {
        const multipliers = {
            'one-time': 1,
            'weekly': 52,
            'bi-weekly': 26,
            'semi-monthly': 24,
            'monthly': 12,
            'quarterly': 4,
            'annually': 1
        };
        return multipliers[frequency?.toLowerCase()] || 0;
    }

    function calculateYearlyIncome(amount, frequency, startDate, endDate, type = "Current") {
        if (!amount || !frequency) {
            console.error('Invalid income data:', { amount, frequency });
            return 0;
        }

        const yearlyMultiplier = getYearlyMultiplier(frequency);
        if (yearlyMultiplier === 0) {
            console.error('Unknown frequency:', frequency);
            return 0;
        }

        // For "Previous" year income, prorate based on active days within the year
        if (type === "Previous") {
            const start = new Date(startDate);
            const end = new Date(endDate);

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                console.error('Invalid startDate or endDate:', { startDate, endDate });
                return 0;
            }

            const totalDaysInYear = 365;
            const activeDays = Math.min(Math.max((end - start) / (1000 * 60 * 60 * 24) + 1, 0), 365);
            const proratedMultiplier = Math.min(activeDays / totalDaysInYear, 1);
            return amount * yearlyMultiplier * proratedMultiplier;
        }

        // For current income: if it's active right now, return full annualized amount.
        // If it's not active (end date has passed), return 0.
        // The caller can also use filterCurrentIncomes() to pre-filter.
        if (endDate) {
            const end = new Date(endDate);
            const today = new Date();
            if (end < today) {
                return 0; // Income has ended, don't count it
            }
        }
        if (startDate) {
            const start = new Date(startDate);
            const today = new Date();
            if (start > today) {
                return 0; // Income hasn't started yet, don't count it
            }
        }

        return amount * yearlyMultiplier;
    }

    function isIncomeActive(income) {
        const startDate = new Date(income.startDate);
        const endDate = income.endDate ? new Date(income.endDate) : null;
        const today = new Date();
        return startDate <= today && (!endDate || endDate >= today);
    }

    function filterCurrentIncomes(incomes) {
        return (incomes || []).filter(income => isIncomeActive(income));
    }

    function filterPreviousYearIncomes(incomes) {
        return (incomes || []).filter(income => income.type?.toLowerCase() === "previous");
    }

    // ===== ELIGIBILITY CHECK HELPERS =====
    function hasEligibilityFlag(eligibility, ...flags) {
        if (!Array.isArray(eligibility)) return false;
        return eligibility.some(item => {
            const lower = item.toLowerCase();
            return flags.some(flag => lower.includes(flag.toLowerCase()));
        });
    }

    function isNotEligible(eligibility) {
        return hasEligibilityFlag(eligibility, 'not', 'already enrolled', 'already applied', 'age criteria', 'enrolled in medicaid', 'no formal lease', 'residency', 'not enrolled in medicare');
    }

    function needsInfo(eligibility) {
        return hasEligibilityFlag(eligibility, 'needs', 'determination pending');
    }

    function isLikelyEligible(eligibility) {
        return !isNotEligible(eligibility) && !needsInfo(eligibility);
    }

    function getCardColors(eligibility) {
        if (isNotEligible(eligibility)) {
            return { bg: '#f8d7da', border: '#f5c6cb' };
        }
        if (needsInfo(eligibility)) {
            return { bg: '#fff3cd', border: '#ffc107' };
        }
        return { bg: '#d4edda', border: '#c3e6cb' };
    }

    // ===== SPOUSE & AGE HELPERS =====
    function findSpouse(member, members) {
        return members.find(m => 
            m.householdMemberId === member.relationships?.find(r => r.relationship === 'spouse')?.relatedMemberId &&
            member.relationships?.find(r => r.relatedMemberId === m.householdMemberId)?.relationship === 'spouse'
        );
    }

    function findPreviousSpouse(member, members) {
        return members.find(m => m.householdMemberId === member.previousSpouseId);
    }

    function parseAge(ageString) {
        if (!ageString) return { years: 0, months: 0, days: 0 };
        const match = ageString.match(/(\d+)\s*Years?,?\s*(\d+)?\s*Months?,?\s*(\d+)?\s*Days?/i);
        if (!match) return { years: 0, months: 0, days: 0 };
        return {
            years: parseInt(match[1], 10) || 0,
            months: parseInt(match[2], 10) || 0,
            days: parseInt(match[3], 10) || 0
        };
    }

    function calculateAgeFromDob(dob) {
        const dobDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - dobDate.getFullYear();
        if (today.getMonth() < dobDate.getMonth() || 
            (today.getMonth() === dobDate.getMonth() && today.getDate() < dobDate.getDate())) {
            age--;
        }
        return age;
    }

    // ===== SNAP HELPERS =====
    function calculateSNAPBenefit(finalNetIncome, householdSize, eligibilityStatus) {
        const maxAllotment = SNAP_MAX_ALLOTMENTS[householdSize] || 
            (householdSize > 8 ? 1789 + 218 * (householdSize - 8) : 0);

        const incomeContribution = finalNetIncome * 0.3;
        let benefitAmount = Math.max(0, maxAllotment - incomeContribution);

        if (benefitAmount < SNAP_MINIMUM_BENEFIT && eligibilityStatus === "Likely Eligible for SNAP") {
            benefitAmount = SNAP_MINIMUM_BENEFIT;
        }

        return parseFloat(benefitAmount.toFixed(2));
    }

    function determineExpeditedEligibility(combinedIncome, combinedAssets, utilityAllowance, totalShelterExpenses, isFarmworker, hasActiveIncome) {
        if (isFarmworker === true && combinedAssets <= SNAP_EXPEDITED_ASSET_LIMIT && !hasActiveIncome) {
            return "Yes, Migrant or Seasonal Farmworker";
        }
        if (combinedIncome <= SNAP_EXPEDITED_INCOME_LIMIT && combinedAssets <= SNAP_EXPEDITED_ASSET_LIMIT) {
            return "Yes, Low Income and Assets";
        }
        if (combinedIncome + combinedAssets <= utilityAllowance + totalShelterExpenses) {
            return "Yes, Shelter Costs Exceed Income and Assets";
        }
        return "No";
    }

    function calculateUtilityAllowance(member, isHomeless) {
        if (isHomeless) return UTILITY_ALLOWANCES["Homeless"];

        const utilityKinds = (member.expenses || [])
            .filter(e => e.type?.toLowerCase() === "utility")
            .map(e => e.kind);

        const basicUtilityKinds = ["Electric", "Gas", "Oil", "Propane", "Wood", "Coal", "Kerosene", "Water", "Sewage", "Trash", "Phone"];
        const qualifyingUtilities = utilityKinds.filter(kind => basicUtilityKinds.includes(kind));

        if (utilityKinds.includes("Heating and/or Cooling")) {
            return UTILITY_ALLOWANCES["Heating and/or Cooling"];
        }
        if (qualifyingUtilities.length >= 2) {
            return UTILITY_ALLOWANCES["Basic Limited Allowance"];
        }
        return qualifyingUtilities.reduce((sum, kind) => sum + (UTILITY_ALLOWANCES[kind] || 0), 0);
    }

    // ===== RETURN PUBLIC API =====
    return {
        // Constants
        BENEFIT_KEYS,
        INDIVIDUAL_BENEFITS,
        FPL,
        FPL_PERCENTAGES,
        UTILITY_ALLOWANCES,
        PACE_THRESHOLDS,
        LIS_THRESHOLDS,
        MSP_THRESHOLDS,
        MSP_DEDUCTIONS,
        PTRR_THRESHOLDS,
        SNAP_MAX_ALLOTMENTS,
        SNAP_STANDARD_DEDUCTIONS,
        SNAP_GROSS_INCOME_LIMITS,
        SNAP_NET_INCOME_LIMITS,
        SNAP_SHELTER_COST_CAP,
        SNAP_MEDICAL_EXPENSE_THRESHOLD,
        SNAP_ELDERLY_DISABLED_ASSET_LIMIT,
        SNAP_MINIMUM_BENEFIT,
        SNAP_EXPEDITED_INCOME_LIMIT,
        SNAP_EXPEDITED_ASSET_LIMIT,
        LIHEAP_INCOME_LIMITS,
        SFBP_THRESHOLDS,
        SFBP_INCOME_LIMITS,
        
        // Utility functions
        getQueryParameter,
        capitalizeFirstLetter,
        ensureBenefitSchema,
        
        // Income helpers
        getYearlyMultiplier,
        calculateYearlyIncome,
        isIncomeActive,
        filterCurrentIncomes,
        filterPreviousYearIncomes,
        
        // Eligibility helpers
        hasEligibilityFlag,
        isNotEligible,
        needsInfo,
        isLikelyEligible,
        getCardColors,
        
        // Spouse & age helpers
        findSpouse,
        findPreviousSpouse,
        parseAge,
        calculateAgeFromDob,
        
        // SNAP helpers
        calculateSNAPBenefit,
        determineExpeditedEligibility,
        calculateUtilityAllowance
    };
})();