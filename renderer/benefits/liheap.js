(function () {
    async function run(_membersParam, context) {
        const { clientId, Utils } = context;
        if (!Utils) { console.error('LIHEAP: EligibilityUtils not available'); return _membersParam; }

        try {
            const response = await fetch(`/get-client/${encodeURIComponent(clientId)}`);
            if (!response.ok) throw new Error(`Failed to fetch client data: ${response.statusText}`);
            const clientData = await response.json();
            if (!clientData?.householdMembers) return _membersParam;

            const members = clientData.householdMembers;
            const active = members.filter(m => (m.deceased ?? '').toLowerCase() !== 'yes');

            let combinedMonthlyIncome = 0;
            let totalMedicarePremiumDeduction = 0;

            for (const member of active) {
                const currentIncomes = (member.income || []).filter(i => i.type?.toLowerCase() === 'current');
                const yearlyIncome = currentIncomes.reduce((s, i) =>
                    s + Utils.calculateYearlyIncome(i.amount, i.frequency, i.startDate, i.endDate), 0);
                const monthlyIncome = yearlyIncome / 12;

                let medicarePremiumDeduction = 0;
                for (const expense of member.expenses || []) {
                    const isMP = expense.kind?.toLowerCase().includes('medicare') && expense.kind?.toLowerCase().includes('premium');
                    const isDeducted = expense.deductedFromSSOrPension?.toLowerCase() === 'yes';
                    if (isMP && isDeducted) {
                        const monthly = (expense.amount * Utils.getYearlyMultiplier(expense.frequency)) / 12;
                        if (monthly > 0) medicarePremiumDeduction += monthly;
                    }
                }
                const effectiveDeduction = Math.min(medicarePremiumDeduction, monthlyIncome);
                totalMedicarePremiumDeduction += effectiveDeduction;
                combinedMonthlyIncome += Math.max(0, monthlyIncome - effectiveDeduction);
            }

            const householdSize = active.length;
            const incomeLimit = Utils.LIHEAP_INCOME_LIMITS[householdSize] || 0;
            const eligibility = [];

            if (clientData.liheapEnrollment === 'notinterested') eligibility.push("Not Interested");
            else if (!clientData.liheapEnrollment || clientData.liheapEnrollment === 'n/a')
                eligibility.push("Needs Current LIHEAP Enrollment Status");
            else if (['no', 'yes'].includes(clientData.liheapEnrollment) &&
                     (!clientData.heatingCrisis || clientData.heatingCrisis === 'n/a'))
                eligibility.push("Needs Heating Crisis Status");
            else if (clientData.liheapEnrollment === 'yes' && clientData.heatingCrisis === 'no')
                eligibility.push("Already Enrolled");
            else if (!clientData.residenceStatusCurrent || clientData.residenceStatusCurrent === 'n/a')
                eligibility.push("Needs Current Residence Status");
            else if (clientData.residenceStatusCurrent !== 'owned' &&
                     (!clientData.subsidizedHousing || clientData.subsidizedHousing === 'n/a'))
                eligibility.push("Needs Subsidized Housing Status");
            else if (clientData.subsidizedHousing === 'yes' &&
                     (!clientData.heatingCost || clientData.heatingCost === 'n/a'))
                eligibility.push("Needs Heating Cost Responsibility Status");
            else if (clientData.subsidizedHousing === 'yes' && clientData.heatingCost === 'yes')
                eligibility.push("Not Likely Eligible for LIHEAP (Heating cost included in rent, household rent is subsidized)");
            else if (clientData.heatingCrisis === 'yes' && combinedMonthlyIncome <= incomeLimit)
                eligibility.push("Likely Eligible for LIHEAP (Crisis)");
            else if (clientData.heatingCrisis === 'yes' && combinedMonthlyIncome > incomeLimit)
                eligibility.push("Not Likely Eligible for LIHEAP but Submission Recommended");
            else if (combinedMonthlyIncome <= incomeLimit) eligibility.push("Likely Eligible for LIHEAP");
            else eligibility.push("Not Likely Eligible for LIHEAP (Income)");

            active.forEach(m => {
                m.LIHEAP = {
                    combinedMonthlyIncome,
                    totalMedicarePremiumDeduction,
                    eligibility,
                    screeningInProgress: m.LIHEAP?.screeningInProgress ?? true,
                    screeningCloseReason: m.LIHEAP?.screeningCloseReason ?? null
                };
            });

            await fetch(`/save-household-members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, householdMembers: members })
            });

            return members;
        } catch (err) {
            console.error('LIHEAP error:', err);
            return _membersParam;
        }
    }

    (function () {
        const U = () => window.RenderUtils;
    
        window.BenefitRegistry.register({
            key: 'LIHEAP',
            label: 'LIHEAP',
            run,
            render(container, ctx) {
                const R = U();
                const { members, client, programStatus, clientId } = ctx;
                const activeMembers = members.filter(m => (m.deceased ?? '').toLowerCase() !== 'yes');
                const liheapClosed = programStatus.LIHEAP?.screeningInProgress === false;
    
                if (liheapClosed) {
                    R.renderClosedBenefitCard(container, {
                        key: 'LIHEAP', label: 'LIHEAP',
                        reason: programStatus.LIHEAP?.screeningCloseReason || 'N/A',
                        onBeforeRefresh: async () => {
                            for (const m of members) {
                                if (m.LIHEAP) { m.LIHEAP.screeningInProgress = true; m.LIHEAP.screeningCloseReason = null; }
                            }
                            await ctx.saveHouseholdMembers(clientId, members);
                        },
                        ctx
                    });
                    return;
                }
    
                const alreadyEnrolled = client?.liheapEnrollment === 'yes' && client?.heatingCrisis === 'no';
                const notInterested = client?.liheapEnrollment === 'notinterested';
                if (alreadyEnrolled || notInterested) {
                    R.renderInfoCard(container, 'LIHEAP',
                        alreadyEnrolled ? 'ALREADY ENROLLED' : 'NOT INTERESTED', R.CARD_COLORS.red);
                    return;
                }
                if (activeMembers.length === 0) {
                    R.renderInfoCard(container, 'LIHEAP', 'NO LIHEAP HOUSEHOLD MEMBERS FOUND.');
                    return;
                }
    
                const l = activeMembers[0]?.LIHEAP || {};
                const combinedMonthlyIncome = l.combinedMonthlyIncome || 0;
                const totalMedicarePremiumDeduction = l.totalMedicarePremiumDeduction || 0;
                const grossMonthlyIncome = combinedMonthlyIncome + totalMedicarePremiumDeduction;
                const eligibility = (l.eligibility || []).map(R.capitalizeFirstLetter);
                const eligStr = eligibility.length > 0 ? eligibility : ['No LIHEAP Household Members Found'];
    
                // LIHEAP: RECOMMENDED overrides NOT
                let color = R.CARD_COLORS.none;
                const hasRecommended = eligStr.some(i => i.includes('RECOMMENDED'));
                const hasNot = eligStr.some(i => R.NOT_ELIGIBLE_KEYWORDS.some(kw => i.includes(kw)));
                const hasNeeds = eligStr.some(i => i.includes('NEEDS'));
                if (hasNot && !hasRecommended) color = R.CARD_COLORS.red;
                else if (hasNeeds) color = R.CARD_COLORS.yellow;
                else if (!hasNot || hasRecommended) color = R.CARD_COLORS.green;
    
                const div = R.makeCardDiv(color);
                div.innerHTML = `
                    <details class="custom-details">
                        ${R.detailsSummaryHTML('LIHEAP')}
                        <p><strong>LIHEAP Household Size:</strong> ${activeMembers.length}</p>
                        <p><strong>Total Gross Income:</strong> $${grossMonthlyIncome.toFixed(2)}</p>
                        <p><strong>Medicare Premium Deductions:</strong> $${totalMedicarePremiumDeduction.toFixed(2)}</p>
                        <p><strong>Adjusted Gross Income:</strong> $${combinedMonthlyIncome.toFixed(2)}</p>
                        <hr class="separator-bar">
                        <p><strong>Members:</strong> ${activeMembers.map(m => `${R.capitalizeFirstLetter(m.firstName || '')} ${R.capitalizeFirstLetter(m.lastName || '')}`).join(', ')}</p>
                        <p><strong>Eligibility:</strong> ${eligStr.join(', ')}</p>
                    </details>`;
                container.appendChild(div);
                R.wireDetailsToggle(div);
            },
    
            getModalEntries({ members, client, programStatus }) {
                const entries = [];
                const liheapMembers = members.filter(m => (m.deceased ?? '').toLowerCase() !== 'yes');
                const liheapClientClosed = programStatus.LIHEAP?.screeningInProgress === false;
                const liheapScreeningOpen = liheapMembers.some(m =>
                    m.LIHEAP?.screeningInProgress !== false && !m.LIHEAP?.eligibility?.includes('Not Checked'));
                const liheapEnrollment = client?.liheapEnrollment?.toLowerCase();
                const heatingCrisis = client?.heatingCrisis?.toLowerCase();
                const alreadyEnrolled = liheapEnrollment === 'yes' && heatingCrisis === 'no';
                const notInterested = liheapEnrollment === 'notinterested';
                const hasClientLevelStatus = alreadyEnrolled || notInterested;
                const visible = !liheapClientClosed && (liheapScreeningOpen || hasClientLevelStatus ||
                    (liheapMembers.length === 0 && liheapEnrollment && liheapEnrollment !== 'n/a'));
    
                if (visible) {
                    let status = { isNotEligible: false, reason: '' };
                    if (liheapMembers.length > 0 && liheapMembers[0]?.LIHEAP?.eligibility) {
                        status = classifyHouseholdLIHEAP(members, client);
                        if (!status.reason) {
                            status.reason = liheapMembers[0]?.LIHEAP?.eligibility?.find(e => (e || '').toUpperCase().includes('NOT')) || '';
                        }
                    } else if (alreadyEnrolled) { status = { isNotEligible: true, reason: 'Already Enrolled' }; }
                    else if (notInterested)     { status = { isNotEligible: true, reason: 'Not Interested' }; }
    
                    entries.push({
                        memberId: 'HOUSEHOLD', memberName: 'LIHEAP Household', benefit: 'LIHEAP',
                        isNotEligible: status.isNotEligible, ineligibilityReason: status.reason, isHousehold: true
                    });
                } else if (programStatus.LIHEAP?.screeningInProgress !== false) {
                    entries.push({
                        memberId: 'NO_MEMBERS', memberName: 'LIHEAP (No Members)', benefit: 'LIHEAP',
                        isNotEligible: false, ineligibilityReason: '', isHousehold: true
                    });
                }
                return entries;
            },
    
            closeReasons: [
                { value: "Already Enrolled",       label: "Already Enrolled" },
                { value: "Ineligible - Income",    label: "Ineligible - Income" },
                { value: "Subsidized Housing and No Heating Responsibility",
                    label: "Subsidized Housing and No Heating Responsibility" },
                { value: "Hard Determination",     label: "Use Hard Determination Closeout Reason(s)" },
                { value: "Not Interested",         label: "Not Interested" },
                { value: "Too Confusing",          label: "Too Confusing" },
                { value: "Will Call Back",         label: "Will Call Back" }
            ],
    
            mapHardDetermination(ineligibilityReason) {
                const u = (ineligibilityReason || '').toUpperCase();
                if (u.includes('ALREADY ENROLLED')) return 'Already Enrolled';
                if (u.includes('NOT INTERESTED'))   return 'Not Interested';
                if (u.includes('HEATING COST INCLUDED') || u.includes('SUBSIDIZED'))
                    return 'Subsidized Housing and No Heating Responsibility';
                if (u.includes('INCOME') || u.includes('NOT LIKELY')) return 'Ineligible - Income';
                return ineligibilityReason || 'Ineligible - Hard Determination';
            }
        });
    
        function classifyHouseholdLIHEAP(members, client) {
            if (client?.liheapEnrollment === 'yes' && client?.heatingCrisis === 'no')
                return { isNotEligible: true, reason: 'Already Enrolled' };
            if (client?.liheapEnrollment === 'notinterested')
                return { isNotEligible: true, reason: 'Not Interested' };
            if (client?.subsidizedHousing === 'yes' && client?.heatingCost === 'yes')
                return { isNotEligible: true, reason: 'Subsidized Housing and No Heating Responsibility' };
            const liheapMember = members.find(m => (m.deceased ?? '').toLowerCase() !== 'yes' && m.LIHEAP?.eligibility);
            if (!liheapMember) return { isNotEligible: false, reason: '' };
            const eligStr = (liheapMember.LIHEAP.eligibility || []).join(' ').toUpperCase();
            if (eligStr.includes('ALREADY ENROLLED')) return { isNotEligible: true, reason: 'Already Enrolled' };
            if (eligStr.includes('NOT INTERESTED'))   return { isNotEligible: true, reason: 'Not Interested' };
            if (eligStr.includes('HEATING COST INCLUDED') || eligStr.includes('SUBSIDIZED'))
                return { isNotEligible: true, reason: 'Subsidized Housing and No Heating Responsibility' };
            if (eligStr.includes('NOT LIKELY')) return { isNotEligible: true, reason: 'Ineligible - Income' };
            return { isNotEligible: false, reason: '' };
        }
    })();

        })();