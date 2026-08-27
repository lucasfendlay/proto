(function () {
    async function run(members, context) {
        const { clientId, Utils } = context;
        if (!Utils) { console.error('LIS: EligibilityUtils not available'); return members; }

        // Step 1
        for (const member of members) {
            try {
                if ((member.deceased ?? '').toLowerCase() === 'yes') {
                    member.LIS = {
                        combinedIncome: 0, combinedAssets: 0, adjustedIncome: 0, adjustedAssets: 0,
                        eligibility: ["Not Checked"],
                        screeningInProgress: member.LIS?.screeningInProgress ?? false,
                        screeningCloseReason: member.LIS?.screeningCloseReason ?? "Not Applicable"
                    };
                    continue;
                }
                const currentYearIncomes = Utils.filterCurrentIncomes(member.income || []);
                const totalIncome = currentYearIncomes.reduce((sum, income) => {
                    const yr = Utils.calculateYearlyIncome(income.amount, income.frequency, income.startDate, income.endDate);
                    return sum + (yr / 12);
                }, 0);
                const totalAssets = (member.assets || []).reduce((s, a) => s + Number(a.value || 0), 0);
                member.LIS = {
                    ...(member.LIS || {}),
                    adjustedIncome: totalIncome,
                    adjustedAssets: totalAssets,
                    screeningInProgress: member.LIS?.screeningInProgress ?? true,
                    screeningCloseReason: member.LIS?.screeningCloseReason ?? null
                };
            } catch (err) { console.error(`LIS step1 error for ${member.firstName}:`, err); }
        }

        // Step 2
        const combinedValues = new Map();
        for (const member of members) {
            if ((member.deceased ?? '').toLowerCase() === 'yes') continue;
            const sr = member.relationships?.find(r => r.relationship === 'spouse');
            const spouse = sr ? members.find(m => m.householdMemberId === sr.relatedMemberId) : null;
            const hasLivingSpouse = spouse && (spouse.deceased ?? '').toLowerCase() !== 'yes';
            const combinedIncome = hasLivingSpouse
                ? (Number(member.LIS?.adjustedIncome) || 0) + (Number(spouse.LIS?.adjustedIncome) || 0)
                : (member.LIS?.adjustedIncome || 0);
            const combinedAssets = hasLivingSpouse
                ? (Number(member.LIS?.adjustedAssets) || 0) + (Number(spouse.LIS?.adjustedAssets) || 0)
                : (member.LIS?.adjustedAssets || 0);
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
                const lisEnroll = member.selections?.["Is this person currently enrolled in LIS/ Extra Help?"]?.toLowerCase();

                if (!medicare || medicare === 'n/a' || medicare === '') {
                    eligibility.push("Needs Current Medicare Enrollment Status");
                } else if (medicare !== 'yes') {
                    eligibility.push("Not Enrolled in Medicare");
                    member.selections = member.selections || {};
                    member.selections["Is this person currently enrolled in LIS/ Extra Help?"] = null;
                } else if (!medicaid || medicaid === 'n/a' || medicaid === '') {
                    eligibility.push("Needs Current Medicaid Enrollment Status");
                } else if (medicaid === 'yes') {
                    eligibility.push("Enrolled in Medicaid");
                } else if (lisEnroll === 'yes') {
                    eligibility.push("Already Enrolled");
                } else if (lisEnroll === 'notinterested') {
                    eligibility.push("Not Interested");
                } else if (!lisEnroll) {
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

                member.LIS = {
                    adjustedIncome: member.LIS?.adjustedIncome || 0,
                    adjustedAssets: member.LIS?.adjustedAssets || 0,
                    combinedIncome: Math.max(0, combinedIncome || 0),
                    combinedAssets: Math.max(0, combinedAssets || 0),
                    eligibility,
                    screeningInProgress: member.LIS?.screeningInProgress ?? true,
                    screeningCloseReason: member.LIS?.screeningCloseReason ?? null
                };
            } catch (err) { console.error(`LIS step2 error:`, err); }
        }

        try {
            await fetch(`/save-household-members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, householdMembers: members })
            });
        } catch (err) { console.error('LIS save error:', err); }

        return members;
    }

    window.BenefitRegistry.register({
        key: 'LIS',
        label: 'LIS',
        run,
        renderConfig: {
            key: 'LIS',
            label: 'LIS',
            filter: m => (m.deceased ?? '').toLowerCase() !== 'yes',
            getDetails: m => `
                <p><strong>Gross Income:</strong> $${m.LIS?.combinedIncome?.toFixed(2) || 'N/A'}</p>
                <p><strong>Combined Assets:</strong> $${m.LIS?.combinedAssets?.toFixed(2) || 'N/A'}</p>`
        },
    
        render(container, ctx) {
            window.RenderUtils.renderIndividualBenefitCard(
                container, this.renderConfig, ctx.members, ctx.programStatus, ctx
            );
        },
    
        getModalEntries({ members, programStatus }) {
            return window.RenderUtils.buildIndividualModalEntries(this.renderConfig, members, programStatus);
        },
    
        closeReasons: [
            { value: "Hard Determination",       label: "Use Hard Determination Closeout Reason(s)" },
            { value: "Not Interested",           label: "Not Interested" },
            { value: "Too Confusing",            label: "Too Confusing" },
            { value: "Will Call Back",           label: "Will Call Back" },
            { value: "Disconnected",             label: "Disconnected" }
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