(function () {
    async function run(members, context) {
        const { clientId, Utils } = context;
        if (!Utils) { console.error('MSP: EligibilityUtils not available'); return members; }

        // Step 1
        for (const member of members) {
            try {
                if ((member.deceased ?? '').toLowerCase() === 'yes') {
                    member.MSP = {
                        combinedIncome: 0, combinedAssets: 0, adjustedIncome: 0, adjustedAssets: 0,
                        grossMonthlyIncome: 0, eligibility: ["Not Checked"],
                        screeningInProgress: member.MSP?.screeningInProgress ?? false,
                        screeningCloseReason: member.MSP?.screeningCloseReason ?? "Not Applicable"
                    };
                    continue;
                }
                const currentYearIncomes = Utils.filterCurrentIncomes(member.income || []);
                const toMonthly = list => list.reduce((sum, income) => {
                    const yr = Utils.calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate);
                    return sum + (yr / 12);
                }, 0);
                const totalMonthlyIncome = toMonthly(currentYearIncomes);

                let unearned = toMonthly(currentYearIncomes.filter(i => {
                    const k = i.kind?.toLowerCase() || ''; return k !== 'employment' && k !== 'self-employment';
                }));
                let earned = toMonthly(currentYearIncomes.filter(i => {
                    const k = i.kind?.toLowerCase() || ''; return k === 'employment' || k === 'self-employment';
                }));

                let remainingGen = Utils.MSP_DEDUCTIONS.otherDeduction;
                if (unearned >= remainingGen) { unearned -= remainingGen; remainingGen = 0; }
                else { remainingGen -= unearned; unearned = 0; }
                if (earned > 0) {
                    earned = Math.max(0, earned - remainingGen);
                    earned = Math.max(0, earned - Utils.MSP_DEDUCTIONS.employmentDeduction);
                    earned = earned / 2;
                }
                const adjustedMonthlyIncome = unearned + earned;
                const totalAssets = (member.assets || []).reduce((s, a) => s + Number(a.value || 0), 0);

                member.MSP = {
                    ...(member.MSP || {}),
                    adjustedIncome: adjustedMonthlyIncome,
                    grossMonthlyIncome: totalMonthlyIncome,
                    adjustedAssets: totalAssets,
                    screeningInProgress: member.MSP?.screeningInProgress ?? true,
                    screeningCloseReason: member.MSP?.screeningCloseReason ?? null
                };
            } catch (err) { console.error(`MSP step1 error:`, err); }
        }

        // Step 2
        const combinedValues = new Map();
        for (const member of members) {
            if ((member.deceased ?? '').toLowerCase() === 'yes') continue;
            const sr = member.relationships?.find(r => r.relationship === 'spouse');
            const spouse = sr ? members.find(m => m.householdMemberId === sr.relatedMemberId) : null;
            const hasLivingSpouse = spouse && (spouse.deceased ?? '').toLowerCase() !== 'yes';
            const combinedIncome = hasLivingSpouse
                ? (Number(member.MSP?.adjustedIncome) || 0) + (Number(spouse.MSP?.adjustedIncome) || 0)
                : (member.MSP?.adjustedIncome || 0);
            const combinedAssets = hasLivingSpouse
                ? (Number(member.MSP?.adjustedAssets) || 0) + (Number(spouse.MSP?.adjustedAssets) || 0)
                : (member.MSP?.adjustedAssets || 0);
            combinedValues.set(member.householdMemberId, { combinedIncome, combinedAssets, hasLivingSpouse });
        }

        for (const member of members) {
            try {
                if ((member.deceased ?? '').toLowerCase() === 'yes') continue;
                const v = combinedValues.get(member.householdMemberId);
                if (!v) continue;
                const { combinedIncome, combinedAssets, hasLivingSpouse } = v;
                const eligibility = [];

                const medicare = member.medicare?.toLowerCase();
                const medicaid = member.medicaid?.toLowerCase();
                const mspEnroll = member.selections?.["Is this person currently enrolled in the Medicare Savings Program?"]?.toLowerCase();

                if (!medicare || medicare === 'n/a' || medicare === '') {
                    eligibility.push("Needs Current Medicare Enrollment Status");
                } else if (medicare !== 'yes') {
                    eligibility.push("Not Enrolled in Medicare");
                    member.selections = member.selections || {};
                    member.selections["Is this person currently enrolled in the Medicare Savings Program?"] = null;
                } else if (!medicaid || medicaid === 'n/a' || medicaid === '') {
                    eligibility.push("Needs Current Medicaid Enrollment Status");
                } else if (medicaid === 'yes') {
                    eligibility.push("Enrolled in Medicaid");
                } else if (mspEnroll === 'yes') {
                    eligibility.push("Already Enrolled");
                } else if (mspEnroll === 'notinterested') {
                    eligibility.push("Not Interested");
                } else if (!mspEnroll) {
                    eligibility.push("Needs Current MSP Enrollment Status");
                } else {
                    const householdSize = hasLivingSpouse ? 2 : 1;
                    const assetLimit = hasLivingSpouse ? Utils.MSP_THRESHOLDS.assets.married : Utils.MSP_THRESHOLDS.assets.single;
                    const qmb = Utils.MSP_THRESHOLDS.getIncomeLimit(householdSize, 'qmb');
                    const slmb = Utils.MSP_THRESHOLDS.getIncomeLimit(householdSize, 'slmb');
                    const qi = Utils.MSP_THRESHOLDS.getIncomeLimit(householdSize, 'qi');
                    const assetEligible = combinedAssets <= assetLimit;
                    if (!assetEligible) {
                        if (combinedIncome > qi) eligibility.push("Not Likely Eligible for MSP (Income and Assets)");
                        else eligibility.push("Not Likely Eligible for MSP (Assets)");
                    } else if (combinedIncome <= qmb) eligibility.push("Likely Eligible for QMB");
                    else if (combinedIncome <= slmb) eligibility.push("Likely Eligible for SLMB");
                    else if (combinedIncome <= qi) eligibility.push("Likely Eligible for QI");
                    else eligibility.push("Not Likely Eligible for MSP (Income)");
                }

                member.MSP = {
                    adjustedIncome: member.MSP?.adjustedIncome || 0,
                    adjustedAssets: member.MSP?.adjustedAssets || 0,
                    grossMonthlyIncome: member.MSP?.grossMonthlyIncome || 0,
                    combinedIncome: Math.max(0, combinedIncome || 0),
                    combinedAssets: Math.max(0, combinedAssets || 0),
                    eligibility,
                    screeningInProgress: member.MSP?.screeningInProgress ?? true,
                    screeningCloseReason: member.MSP?.screeningCloseReason ?? null
                };
            } catch (err) { console.error(`MSP step2 error:`, err); }
        }

        try {
            await fetch(`/save-household-members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, householdMembers: members })
            });
        } catch (err) { console.error('MSP save error:', err); }

        return members;
    }

    window.BenefitRegistry.register({
        key: 'MSP',
        label: 'MSP',
        run,
        renderConfig: {
            key: 'MSP',
            label: 'MSP',
            filter: m => (m.deceased ?? '').toLowerCase() !== 'yes',
            getDetails: m => `
                <p><strong>Gross Adjusted Income:</strong> $${m.MSP?.combinedIncome?.toFixed(2) || 'N/A'}</p>
                <p><strong>Combined Assets:</strong> $${m.MSP?.combinedAssets?.toFixed(2) || 'N/A'}</p>`
        },
    
        render(container, ctx) {
            window.RenderUtils.renderIndividualBenefitCard(
                container, this.renderConfig, ctx.members, ctx.programStatus, ctx
            );
        },
    
        getModalEntries({ members, programStatus }) {
            return window.RenderUtils.buildIndividualModalEntries(this.renderConfig, members, programStatus);
        },
    
        // MSP close reasons are identical to LIS
        closeReasons: [
            { value: "Already Enrolled",         label: "Already Enrolled" },
            { value: "Ineligible - Income",      label: "Ineligible - Income" },
            { value: "Ineligible - Assets",      label: "Ineligible - Assets" },
            { value: "Not Enrolled in Medicare", label: "Not Enrolled in Medicare" },
            { value: "Enrolled in Medicaid",     label: "Enrolled in Medicaid" },
            { value: "Hard Determination",       label: "Use Hard Determination Closeout Reason(s)" },
            { value: "Not Interested",           label: "Not Interested" },
            { value: "Too Confusing",            label: "Too Confusing" },
            { value: "Will Call Back",           label: "Will Call Back" }
        ],
    
        mapHardDetermination(ineligibilityReason) {
            const u = (ineligibilityReason || '').toUpperCase();
            if (u.includes('ALREADY ENROLLED'))       return 'Already Enrolled';
            if (u.includes('NOT INTERESTED'))         return 'Not Interested';
            if (u.includes('ENROLLED IN MEDICAID'))   return 'Enrolled in Medicaid';
            if (u.includes('NOT ENROLLED IN MEDICARE')) return 'Not Enrolled in Medicare';
            if (u.includes('ASSETS') || u.includes('ASSET')) return 'Ineligible - Assets';
            if (u.includes('INCOME') || u.includes('NOT LIKELY')) return 'Ineligible - Income';
            return ineligibilityReason || 'Ineligible - Hard Determination';
        }
    });

})();