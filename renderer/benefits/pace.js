(function () {
    async function run(members, context) {
        const { clientId, Utils } = context;
        if (!Utils) {
            console.error('PACE: EligibilityUtils not available');
            return members;
        }

        // === Step 1: adjusted income per member (previous year, prorated) ===
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
                const previousYearIncomes = incomes.filter(i => i.type?.toLowerCase() === "previous");

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

                    const [sy, sm, sd] = (income.startDate || '').split('-').map(Number);
                    const incomeStart = new Date(sy, (sm || 1) - 1, sd || 1);
                    let incomeEnd;
                    if (income.endDate) {
                        const [ey, em, ed] = income.endDate.split('-').map(Number);
                        incomeEnd = new Date(ey, em - 1, ed);
                    } else {
                        incomeEnd = new Date();
                    }

                    if (incomeStart <= previousYearEnd && incomeEnd >= previousYearStart) {
                        const activeStart = incomeStart < previousYearStart ? previousYearStart : incomeStart;
                        const activeEnd = incomeEnd > previousYearEnd ? previousYearEnd : incomeEnd;
                        const activeDays = Math.min((activeEnd - activeStart) / (1000 * 60 * 60 * 24) + 1, 365);
                        return sum + yearlyAmount * (activeDays / 365);
                    }
                    return sum;
                }, 0);

                // Medicare Part B previous-year deduction
                const medicarePartBExpense = member.expenses?.find(e =>
                    e.type === "Previous Year" && e.kind === "Medicare Part B Premium"
                );
                if (medicarePartBExpense) {
                    const startDate = new Date(medicarePartBExpense.startDate);
                    const endDate = new Date(medicarePartBExpense.endDate);
                    const today = new Date();
                    const effectiveEndDate = endDate > today ? today : endDate;

                    const monthsActive =
                        (effectiveEndDate.getFullYear() - startDate.getFullYear()) * 12 +
                        (effectiveEndDate.getMonth() - startDate.getMonth()) + 1;

                    let ym;
                    switch (medicarePartBExpense.frequency.toLowerCase()) {
                        case 'one-time': ym = 1; break;
                        case 'weekly': ym = 52; break;
                        case 'bi-weekly': ym = 26; break;
                        case 'semi-monthly': ym = 24; break;
                        case 'monthly': ym = 12; break;
                        case 'quarterly': ym = 4; break;
                        case 'annually': ym = 1; break;
                        default: ym = 0; break;
                    }
                    if (ym > 0) {
                        totalIncome -= medicarePartBExpense.amount * ym * (monthsActive / 12);
                    }
                }

                member.PACE = {
                    ...(member.PACE || {}),
                    adjustedIncome: totalIncome,
                    screeningInProgress: member.PACE?.screeningInProgress ?? true,
                    screeningCloseReason: member.PACE?.screeningCloseReason ?? null
                };
            } catch (err) {
                console.error(`PACE step1 error for ${member.firstName} ${member.lastName}:`, err);
            }
        }

        // === Step 2: combined income + eligibility ===
        const combinedValues = new Map();
        for (const member of members) {
            if ((member.deceased ?? '').toLowerCase() === 'yes') continue;

            const spouseRelation = member.relationships?.find(r => r.relationship === 'spouse');
            const spouse = spouseRelation
                ? members.find(m => m.householdMemberId === spouseRelation.relatedMemberId)
                : null;
            const hasLivingSpouse = spouse && (spouse.deceased ?? '').toLowerCase() !== 'yes';

            const combinedIncome = hasLivingSpouse
                ? (Number(member.PACE?.adjustedIncome) || 0) + (Number(spouse.PACE?.adjustedIncome) || 0)
                : (member.PACE?.adjustedIncome || 0);

            combinedValues.set(member.householdMemberId, { combinedIncome, hasLivingSpouse });
        }

        for (const member of members) {
            try {
                if ((member.deceased ?? '').toLowerCase() === 'yes') continue;
                const values = combinedValues.get(member.householdMemberId);
                if (!values) continue;
                const { combinedIncome, hasLivingSpouse } = values;

                const eligibility = [];
                const age = member.age || '';
                const [years, months, days] = age
                    .replace(/Years,|Months,|Days/g, '')
                    .trim()
                    .split(/\s+/)
                    .map(v => parseInt(v.trim()) || 0);

                if (years < 64 || (years === 64 && months < 11)) {
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
                        eligibility.push("Needs Current PACE Enrollment Status");
                    } else {
                        const t = hasLivingSpouse ? Utils.PACE_THRESHOLDS.married : Utils.PACE_THRESHOLDS.single;
                        if (combinedIncome < t.pace) eligibility.push("Likely Eligible for PACE");
                        else if (combinedIncome <= t.pacenet) eligibility.push("Likely Eligible for PACENET");
                        else if (combinedIncome <= t.buffer) eligibility.push("Likely Ineligible but Within Buffer");
                        else eligibility.push("Not Likely Eligible for PACE or PACENET (Income)");
                    }
                }

                member.PACE = {
                    adjustedIncome: member.PACE?.adjustedIncome || 0,
                    combinedIncome: Math.max(0, combinedIncome || 0),
                    eligibility,
                    screeningInProgress: member.PACE?.screeningInProgress ?? true,
                    screeningCloseReason: member.PACE?.screeningCloseReason ?? null
                };
            } catch (err) {
                console.error(`PACE step2 error for ${member.firstName} ${member.lastName}:`, err);
            }
        }

        // === Save ===
        try {
            const response = await fetch(`/save-household-members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, householdMembers: members }),
            });
            if (!response.ok) console.error('PACE save failed:', response.statusText);
        } catch (err) {
            console.error('PACE save error:', err);
        }

        return members;
    }

    window.BenefitRegistry.register({
        key: 'PACE',
        label: 'PACE',
        run,

        renderConfig: {
            key: 'PACE',
            label: 'PACE',
            filter: m => (m.deceased ?? '').toLowerCase() !== 'yes',
            getDetails: m => `<p><strong>Gross Adjusted Income:</strong> $${m.PACE?.combinedIncome?.toFixed(2) || 'N/A'}</p>`
        },

        render(container, ctx) {
            window.RenderUtils.renderIndividualBenefitCard(
                container, this.renderConfig, ctx.members, ctx.programStatus, ctx
            );
        },

        getModalEntries({ members, programStatus }) {
            return window.RenderUtils.buildIndividualModalEntries(
                this.renderConfig, members, programStatus
            );
        },

        closeReasons: [
            { value: "Hard Determination",   label: "Use Hard Determination Closeout Reason(s)" },
            { value: "Not Interested",       label: "Not Interested" },
            { value: "Too Confusing",        label: "Too Confusing" },
            { value: "Will Call Back",       label: "Will Call Back" },
            { value: "Disconnected",             label: "Disconnected" }
        ],

        mapHardDetermination(ineligibilityReason) {
            const u = (ineligibilityReason || '').toUpperCase();
            if (u.includes('ALREADY ENROLLED'))     return 'Already Enrolled';
            if (u.includes('NOT INTERESTED'))       return 'Not Interested';
            if (u.includes('ENROLLED IN MEDICAID')) return 'Enrolled in Medicaid';
            if (u.includes('AGE CRITERIA'))         return 'Age Criteria Not Met';
            if (u.includes('RESIDENCY'))            return 'Residency Not Met';
            if (u.includes('INCOME') || u.includes('INELIGIBLE') || u.includes('NOT LIKELY'))
                return 'Ineligible - Income';
            return ineligibilityReason || 'Ineligible - Hard Determination';
        }
    });
})();