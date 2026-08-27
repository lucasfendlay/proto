(function () {
    function calculateSNAPBenefit(Utils, finalNetIncome, householdSize, eligibilityStatus) {
        const maxAllotment = Utils.SNAP_MAX_ALLOTMENTS[householdSize] ||
            (householdSize > 8 ? Utils.SNAP_MAX_ALLOTMENTS[8] + 218 * (householdSize - 8) : 0);
        const incomeContribution = finalNetIncome * 0.3;
        let benefitAmount = Math.max(0, maxAllotment - incomeContribution);
        if (benefitAmount < Utils.SNAP_MINIMUM_BENEFIT && eligibilityStatus === "Likely Eligible for SNAP") {
            benefitAmount = Utils.SNAP_MINIMUM_BENEFIT;
        }
        return parseFloat(benefitAmount.toFixed(2));
    }

    function determineExpeditedEligibility(Utils, combinedIncome, combinedAssets, finalNetIncome, utilityAllowance, totalShelterExpenses, isFarmworker, hasActiveIncome) {
        if (isFarmworker === true && combinedAssets <= Utils.SNAP_EXPEDITED_ASSET_LIMIT && !hasActiveIncome)
            return "Yes, Migrant or Seasonal Farmworker";
        if (combinedIncome <= Utils.SNAP_EXPEDITED_INCOME_LIMIT && combinedAssets <= Utils.SNAP_EXPEDITED_ASSET_LIMIT)
            return "Yes, Low Income and Assets";
        if (combinedIncome + combinedAssets <= utilityAllowance + totalShelterExpenses)
            return "Yes, Shelter Costs Exceed Income and Assets";
        return "No";
    }

    async function run(members, context) {
        const { clientId, Utils, client } = context;
        const isFarmworker = context.extras?.isFarmworker;
        if (!Utils) { console.error('SNAP: EligibilityUtils not available'); return members; }

        // Group households
        const snapHouseholds = [];
        const processed = new Set();
        for (const member of members) {
            if (processed.has(member.householdMemberId)) continue;
            if (member.meals?.toLowerCase() !== "yes") continue;
            const hh = [member];
            processed.add(member.householdMemberId);
            for (const other of members) {
                if (other.householdMemberId !== member.householdMemberId && other.meals?.toLowerCase() === "yes") {
                    hh.push(other);
                    processed.add(other.householdMemberId);
                }
            }
            snapHouseholds.push(hh);
        }

        for (const household of snapHouseholds) {
            try {
                let combinedYearlyIncome = 0;
                let combinedAssets = 0;
                let totalNetIncome = 0;
                let totalUtilityAllowance = 0;
                let totalShelterExpenses = 0;
                let totalMedicalExpenses = 0;
                let totalOtherExpenses = 0;
                const mealsYesCount = household.length;
                const utilityAllowances = Utils.UTILITY_ALLOWANCES;

                for (const member of household) {
                    const today = new Date();
                    const currentYearIncomes = (member.income || []).filter(i => {
                        const s = new Date(i.startDate);
                        const e = new Date(i.endDate);
                        return s <= today && (!i.endDate || e >= today);
                    });
                    const yearlyIncome = currentYearIncomes.reduce((s, i) =>
                        s + Utils.calculateYearlyIncome(i.amount, i.frequency, i.startDate, i.endDate), 0);
                    const netIncome = currentYearIncomes.reduce((s, i) =>
                        s + Utils.calculateYearlyIncome(i.amount, i.frequency, i.startDate, i.endDate) / 12, 0);
                    const totalAssets = (member.assets || []).reduce((s, a) => s + Number(a.value), 0);

                    combinedYearlyIncome += yearlyIncome;
                    combinedAssets += totalAssets;
                    totalNetIncome += netIncome;

                    if (totalUtilityAllowance === 0) {
                        let mua = 0;
                        if (client?.homelessness === 'yes') {
                            mua = utilityAllowances["Homeless"];
                        } else {
                            const utilityKinds = (member.expenses || [])
                                .filter(e => e.type?.toLowerCase() === "utility")
                                .map(e => e.kind);
                            const basicKinds = ["Electric","Gas","Oil","Propane","Wood","Coal","Kerosene","Water","Sewage","Trash","Phone"];
                            const qualifying = utilityKinds.filter(k => basicKinds.includes(k));
                            if (utilityKinds.includes("Heating and/or Cooling")) mua = utilityAllowances["Heating and/or Cooling"];
                            else if (qualifying.length >= 2) mua = utilityAllowances["Basic Limited Allowance"];
                            else qualifying.forEach(k => { mua += utilityAllowances[k] || 0; });
                        }
                        totalUtilityAllowance = mua;
                    }

                    if (totalShelterExpenses === 0) {
                        const shelter = member.expenses?.filter(e => e.type.toLowerCase() === "shelter") || [];
                        totalShelterExpenses = shelter.reduce((s, e) =>
                            s + Utils.calculateYearlyIncome(e.amount, e.frequency, e.startDate, e.endDate) / 12, 0);
                    }
                    if (totalMedicalExpenses === 0) {
                        const med = member.expenses?.filter(e => e.type.toLowerCase() === "medical") || [];
                        totalMedicalExpenses = med.reduce((s, e) =>
                            s + Utils.calculateYearlyIncome(e.amount, e.frequency, e.startDate, e.endDate) / 12, 0);
                        if (totalMedicalExpenses < 35) totalMedicalExpenses = 0;
                    }
                    if (totalOtherExpenses === 0) {
                        const other = member.expenses?.filter(e => e.type.toLowerCase() === "other") || [];
                        totalOtherExpenses = other.reduce((s, e) =>
                            s + Utils.calculateYearlyIncome(e.amount, e.frequency, e.startDate, e.endDate) / 12, 0);
                    }
                }

                const combinedMonthlyIncome = combinedYearlyIncome / 12;
                const standardDeduction = Utils.SNAP_STANDARD_DEDUCTIONS[mealsYesCount] || 0;

                const today = new Date();
                const employmentIncomeMonthly = household.reduce((sum, member) =>
                    sum + (member.income || [])
                        .filter(i => (i.kind === "Employment" || i.kind === "Self-Employment") &&
                            new Date(i.startDate) <= today &&
                            (!i.endDate || new Date(i.endDate) >= today))
                        .reduce((s, i) => s + Utils.calculateYearlyIncome(i.amount, i.frequency, i.startDate, i.endDate) / 12, 0), 0);
                const otherIncomeMonthly = household.reduce((sum, member) =>
                    sum + (member.income || [])
                        .filter(i => i.kind !== "Employment" && i.kind !== "Self-Employment" &&
                            new Date(i.startDate) <= today &&
                            (!i.endDate || new Date(i.endDate) >= today))
                        .reduce((s, i) => s + Utils.calculateYearlyIncome(i.amount, i.frequency, i.startDate, i.endDate) / 12, 0), 0);
                const adjustedMonthlyIncome = (employmentIncomeMonthly * 0.8) + otherIncomeMonthly;

                totalNetIncome = Math.max(0, adjustedMonthlyIncome - standardDeduction - totalMedicalExpenses - totalOtherExpenses);
                const halfPrelim = totalNetIncome / 2;
                let excessShelterCost = totalShelterExpenses + totalUtilityAllowance - halfPrelim;
                excessShelterCost = Math.max(0, excessShelterCost);

                let hasElderlyOrDisabled = false;
                household.forEach(m => {
                    const parts = m.age?.match(/(\d+)\s*Years,?\s*(\d+)?\s*Months?,?\s*(\d+)?\s*Days?/i);
                    const years = parts ? (parseInt(parts[1], 10) || 0) : 0;
                    if (years >= 60 || m.disability?.toLowerCase() === "yes") hasElderlyOrDisabled = true;
                });
                if (!hasElderlyOrDisabled) excessShelterCost = Math.min(excessShelterCost, Utils.SNAP_SHELTER_COST_CAP);
                totalNetIncome = Math.max(0, totalNetIncome - excessShelterCost);

                const grossIncomeLimit = Utils.SNAP_GROSS_INCOME_LIMITS[mealsYesCount] || 0;
                let snapEligibility;
                if (combinedMonthlyIncome <= grossIncomeLimit) {
                    snapEligibility = ["Likely Eligible for SNAP"];
                } else if (hasElderlyOrDisabled) {
                    const netIncomeLimit = Utils.SNAP_NET_INCOME_LIMITS[mealsYesCount] || 0;
                    if (combinedMonthlyIncome <= grossIncomeLimit) snapEligibility = ["Likely Eligible for SNAP"];
                    else if (combinedAssets > Utils.SNAP_ELDERLY_DISABLED_ASSET_LIMIT)
                        snapEligibility = ["Not Likely Eligible for SNAP (Income and Assets)"];
                    else if (combinedMonthlyIncome >= grossIncomeLimit && totalNetIncome > netIncomeLimit)
                        snapEligibility = ["Determination Pending Expenses (Over Gross Income Limit)"];
                    else if (totalNetIncome <= netIncomeLimit && combinedAssets <= 4500)
                        snapEligibility = ["Likely Eligible for SNAP"];
                    else if (totalNetIncome > netIncomeLimit)
                        snapEligibility = ["Not Likely Eligible for SNAP (Income)"];
                } else {
                    snapEligibility = ["Not Likely Eligible for SNAP (Income)"];
                }

                const snapBenefit = calculateSNAPBenefit(Utils, totalNetIncome, mealsYesCount, snapEligibility[0]);
                const hasActiveIncome = household.some(m =>
                    m.meals?.toLowerCase() === "yes" &&
                    (m.income || []).some(i => {
                        const s = new Date(i.startDate);
                        const e = i.endDate ? new Date(i.endDate) : null;
                        return s <= today && (!e || e >= today);
                    }));

                household.forEach(member => {
                    member.SNAP = {
                        combinedMonthlyIncome, combinedAssets,
                        eligibility: snapEligibility,
                        householdSize: mealsYesCount,
                        totalNetIncome, totalUtilityAllowance, totalShelterExpenses,
                        totalMedicalExpenses, totalOtherExpenses, standardDeduction, excessShelterCost,
                        benefitAmount: snapBenefit,
                        expeditedEligibility: determineExpeditedEligibility(
                            Utils, combinedMonthlyIncome, combinedAssets, totalNetIncome,
                            totalUtilityAllowance, totalShelterExpenses, isFarmworker, hasActiveIncome
                        ),
                        screeningInProgress: member.SNAP?.screeningInProgress ?? true,
                        screeningCloseReason: member.SNAP?.screeningCloseReason ?? null
                    };
                });
            } catch (err) { console.error('SNAP household error:', err); }
        }

        try {
            await fetch(`/save-household-members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, householdMembers: members })
            });
        } catch (err) { console.error('SNAP save error:', err); }

        return members;
    }


    (function () {
        const U = () => window.RenderUtils;
    
        function createSNAPHouseholdCard(household) {
            const R = U();
            const s = household[0]?.SNAP || {};
            const eligibility = (s.eligibility || ['Not Available']).map(R.capitalizeFirstLetter);
            const color = R.colorFromEligibility(eligibility, { includeNeeds: true });
            const isLikelyEligible = R.classifyEligibility(eligibility, { includeNeeds: true }) === 'green';
            const benefitAmount = s.benefitAmount || 0;
    
            const div = R.makeCardDiv(color);
            div.innerHTML = `
                <details class="custom-details">
                    ${R.detailsSummaryHTML('SNAP')}
                    <p><strong>SNAP Household Size:</strong> ${s.householdSize || household.length}</p>
                    <p><strong>Total Gross Income:</strong> $${(s.combinedMonthlyIncome || 0).toFixed(2)}</p>
                    <p><strong>Standard Deduction:</strong> $${(s.standardDeduction || 0).toFixed(2)}</p>
                    <p><strong>Shelter Deduction:</strong> $${(s.excessShelterCost || 0).toFixed(2)}</p>
                    <p><strong>Utility Allowance:</strong> $${(s.totalUtilityAllowance || 0).toFixed(2)}</p>
                    <p><strong>Medical Expense Deductions:</strong> $${(s.totalMedicalExpenses || 0).toFixed(2)}</p>
                    <p><strong>Other Expense Deductions:</strong> $${(s.totalOtherExpenses || 0).toFixed(2)}</p>
                    <p><strong>Adjusted Net Income:</strong> $${(s.totalNetIncome || 0).toFixed(2)}</p>
                    <p><strong>Combined Assets:</strong> $${(s.combinedAssets || 0).toFixed(2)}</p>
                    <hr class="separator-bar">
                    <p><strong>Members:</strong> ${household.map(m => `${R.capitalizeFirstLetter(m.firstName)} ${R.capitalizeFirstLetter(m.lastName)}`).join(', ')}</p>
                    <p><strong>Eligibility:</strong> ${eligibility.join(', ')}</p>
                    ${isLikelyEligible && benefitAmount >= 0 ? `
                        <p><strong>Estimated Benefit Amount:</strong><br> ${benefitAmount <= 24 ? 'Up to $24.00' : `Up to $24.00 - $${benefitAmount.toFixed(2)}`}</p>
                        <p><strong>Expedited Eligibility:</strong> ${s.expeditedEligibility || 'N/A'}</p>
                    ` : ''}
                </details>`;
            R.wireDetailsToggle(div);
            return div;
        }
    
        window.BenefitRegistry.register({
            key: 'SNAP',
            label: 'SNAP',
            run,
            render(container, ctx) {
                const R = U();
                const { members, client, programStatus, clientId } = ctx;
                const snapClosed = programStatus.SNAP?.screeningInProgress === false;
                const snapMembers = members.filter(m => m.meals?.toLowerCase() === 'yes');
    
                if (snapClosed) {
                    const memberList = snapMembers.length > 0
                        ? `<p><strong>Members:</strong> ${snapMembers.map(m => `${R.capitalizeFirstLetter(m.firstName)} ${R.capitalizeFirstLetter(m.lastName)}`).join(', ')}</p>`
                        : '';
                    R.renderClosedBenefitCard(container, {
                        key: 'SNAP', label: 'SNAP',
                        reason: programStatus.SNAP?.screeningCloseReason || 'N/A',
                        extraContent: memberList,
                        onBeforeRefresh: async () => {
                            for (const m of members) {
                                if (m.SNAP) { m.SNAP.screeningInProgress = true; m.SNAP.screeningCloseReason = null; }
                            }
                            await ctx.saveHouseholdMembers(clientId, members);
                        },
                        ctx
                    });
                    return;
                }
    
                const isAlreadyEnrolled = client?.snap === 'yes';
                const isNotInterested = client?.snap === 'notinterested';
    
                // Build SNAP households
                const snapHouseholds = [];
                const processed = new Set();
                for (const m of members) {
                    if (processed.has(m.householdMemberId) || m.meals?.toLowerCase() !== 'yes') continue;
                    const hh = [m];
                    processed.add(m.householdMemberId);
                    for (const o of members) {
                        if (o.householdMemberId !== m.householdMemberId && o.meals?.toLowerCase() === 'yes') {
                            hh.push(o); processed.add(o.householdMemberId);
                        }
                    }
                    snapHouseholds.push(hh);
                }
    
                if (snapHouseholds.length === 0) {
                    const color = (isAlreadyEnrolled || isNotInterested) ? R.CARD_COLORS.red : R.CARD_COLORS.yellow;
                    const msg = isAlreadyEnrolled ? 'ALREADY ENROLLED'
                        : isNotInterested ? 'NOT INTERESTED'
                        : 'NO SNAP HOUSEHOLD MEMBERS FOUND.';
                    R.renderInfoCard(container, 'SNAP', msg, color);
                    return;
                }
    
                snapHouseholds.forEach(hh => container.appendChild(createSNAPHouseholdCard(hh)));
            },
    
            getModalEntries({ members, client, programStatus }) {
                const R = U();
                const entries = [];
                const snapMembers = members.filter(m => m.meals?.toLowerCase() === 'yes');
                const snapClientClosed = programStatus.SNAP?.screeningInProgress === false;
                const snapScreeningOpen = snapMembers.some(m =>
                    m.SNAP?.screeningInProgress !== false && !m.SNAP?.eligibility?.includes('Not Checked'));
                const clientSnap = client?.snap?.toLowerCase();
                const snapHasClientLevelStatus = clientSnap === 'yes' || clientSnap === 'notinterested';
                const visible = !snapClientClosed && (snapScreeningOpen || snapHasClientLevelStatus ||
                    (snapMembers.length === 0 && clientSnap && clientSnap !== 'n/a'));
    
                if (visible) {
                    let status = { isNotEligible: false, reason: '' };
                    if (snapMembers.length > 0) {
                        status = classifyHouseholdSNAP(members, client);
                        if (!status.reason) {
                            status.reason = snapMembers[0]?.SNAP?.eligibility?.find(e => (e || '').toUpperCase().includes('NOT')) || '';
                        }
                    } else if (clientSnap === 'yes')          { status = { isNotEligible: true, reason: 'Already Enrolled' }; }
                    else if (clientSnap === 'notinterested')  { status = { isNotEligible: true, reason: 'Not Interested' }; }
    
                    entries.push({
                        memberId: 'HOUSEHOLD', memberName: 'SNAP Household', benefit: 'SNAP',
                        isNotEligible: status.isNotEligible, ineligibilityReason: status.reason, isHousehold: true
                    });
                } else if (programStatus.SNAP?.screeningInProgress !== false) {
                    // "No members" placeholder
                    entries.push({
                        memberId: 'NO_MEMBERS', memberName: 'SNAP (No Members)', benefit: 'SNAP',
                        isNotEligible: false, ineligibilityReason: '', isHousehold: true
                    });
                }
                return entries;
            },
    
            closeReasons: [
                { value: "Hard Determination",              label: "Use Hard Determination Closeout Reason(s)" },
                { value: "Low EBA",                         label: "Low EBA" },
                { value: "Not Interested",                  label: "Not Interested" },
                { value: "Too Confusing",                   label: "Too Confusing" },
                { value: "Will Call Back",                  label: "Will Call Back" },
                { value: "Disconnected",             label: "Disconnected" }
            ],
    
            mapHardDetermination(ineligibilityReason) {
                const u = (ineligibilityReason || '').toUpperCase();
                if (u.includes('ALREADY ENROLLED')) return 'Already Enrolled';
                if (u.includes('NOT INTERESTED'))   return 'Not Interested';
                if (u.includes('INCOME AND ASSETS') || (u.includes('INCOME') && u.includes('ASSETS')))
                    return 'Ineligible - Income and Assets';
                if (u.includes('ASSETS') && u.includes('NOT LIKELY')) return 'Ineligible - Income and Assets';
                if (u.includes('INCOME') || u.includes('NOT LIKELY')) return 'Ineligible - Income';
                return ineligibilityReason || 'Ineligible - Hard Determination';
            }
        });
    
        function classifyHouseholdSNAP(members, client) {
            const clientSnap = client?.snap?.toLowerCase();
            if (clientSnap === 'yes')            return { isNotEligible: true, reason: 'Already Enrolled' };
            if (clientSnap === 'notinterested')  return { isNotEligible: true, reason: 'Not Interested' };
            const snapMember = members.find(m => m.meals?.toLowerCase() === 'yes' && m.SNAP?.eligibility);
            if (!snapMember) return { isNotEligible: false, reason: '' };
            const eligStr = (snapMember.SNAP.eligibility || []).join(' ').toUpperCase();
            if (eligStr.includes('ALREADY ENROLLED')) return { isNotEligible: true, reason: 'Already Enrolled' };
            if (eligStr.includes('NOT INTERESTED'))   return { isNotEligible: true, reason: 'Not Interested' };
            if (eligStr.includes('INCOME AND ASSETS') || (eligStr.includes('INCOME') && eligStr.includes('ASSETS'))) {
                return { isNotEligible: true, reason: 'Ineligible - Income and Assets' };
            }
            if (eligStr.includes('NOT LIKELY')) return { isNotEligible: true, reason: 'Ineligible - Income' };
            return { isNotEligible: false, reason: '' };
        }
    })();
})();