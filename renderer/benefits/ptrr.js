(function () {
    // Helper: prorated yearly income for previous year (with optional half for certain kinds)
    function prevYearYearly(income, previousYearStart, previousYearEnd, halfIncomeTypes) {
        let ym;
        switch ((income.frequency || '').toLowerCase()) {
            case 'one-time': ym = 1; break;
            case 'weekly': ym = 52; break;
            case 'bi-weekly': ym = 26; break;
            case 'semi-monthly': ym = 24; break;
            case 'monthly': ym = 12; break;
            case 'quarterly': ym = 4; break;
            case 'annually': ym = 1; break;
            default: ym = 0;
        }
        let yearlyAmount = Number(income.amount || 0) * ym;
        if (halfIncomeTypes.includes(income.kind?.toLowerCase())) yearlyAmount /= 2;

        const [sy, sm, sd] = (income.startDate || '').split('-').map(Number);
        const start = new Date(sy, (sm || 1) - 1, sd || 1);
        let end;
        if (income.endDate) {
            const [ey, em, ed] = income.endDate.split('-').map(Number);
            end = new Date(ey, em - 1, ed);
        } else end = new Date();

        if (start <= previousYearEnd && end >= previousYearStart) {
            const activeStart = start < previousYearStart ? previousYearStart : start;
            const activeEnd = end > previousYearEnd ? previousYearEnd : end;
            const activeDays = Math.min((activeEnd - activeStart) / (1000 * 60 * 60 * 24) + 1, 365);
            return yearlyAmount * (activeDays / 365);
        }
        return 0;
    }

    async function run(members, context) {
        const { clientId, Utils } = context;
        if (!Utils) { console.error('PTRR: EligibilityUtils not available'); return members; }

        // Refetch fresh client
        let freshClient = context.client;
        try {
            const r = await fetch(`/get-client/${clientId}`);
            if (r.ok) freshClient = await r.json();
        } catch (e) { console.error('PTRR: failed to refetch client'); }

        const heads = members.filter(m => m.headOfHousehold === true);
        members.forEach(m => {
            if (!m.headOfHousehold) {
                m.PTRR = {
                    combinedIncome: 0,
                    eligibility: ["Not Checked"],
                    screeningInProgress: m.PTRR?.screeningInProgress ?? false,
                    screeningCloseReason: m.PTRR?.screeningCloseReason ?? "Not Applicable"
                };
            }
        });

        const currentYear = new Date().getFullYear();
        const previousYear = currentYear - 1;
        const previousYearStart = new Date(previousYear, 0, 1);
        const previousYearEnd = new Date(previousYear, 11, 31);
        const halfIncomeTypes = Utils.PTRR_THRESHOLDS.halfIncomeTypes;

        for (const member of heads) {
            try {
                const previousYearIncomes = (member.income || []).filter(i => i.type?.toLowerCase() === "previous");
                let totalGrossIncome = previousYearIncomes.reduce(
                    (s, i) => s + prevYearYearly(i, previousYearStart, previousYearEnd, halfIncomeTypes), 0);

                const spouse = members.find(m => m.householdMemberId === member.previousSpouseId);
                if (spouse) {
                    const spousePrev = (spouse.income || []).filter(i => i.type?.toLowerCase() === "previous");
                    totalGrossIncome += spousePrev.reduce(
                        (s, i) => s + prevYearYearly(i, previousYearStart, previousYearEnd, halfIncomeTypes), 0);
                }

                const eligibility = [];
                const applicationStatus = member.selections?.["Has this person already applied for PTRR this year?"]?.toLowerCase();
                const dob = new Date(member.dob);
                const today = new Date();
                let age = today.getFullYear() - dob.getFullYear();
                if (today.getMonth() < dob.getMonth() ||
                    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--;
                const isDisabled = member.disability?.toLowerCase() === "yes";
                const isWidowed = member.previousMaritalStatus?.toLowerCase() === "widowed";

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
                } else if (!applicationStatus || applicationStatus.trim() === "n/a" ||
                           applicationStatus.trim() === "not interested" ||
                           applicationStatus.trim() === "agecriterianotmet") {
                    eligibility.push("Needs Current PTRR Application Status");
                } else if (applicationStatus === "notinterested") {
                    eligibility.push("Not Interested");
                } else if (applicationStatus.trim() === "no" && (() => {
                    const rs = freshClient?.residenceStatus?.toLowerCase();
                    if (rs !== "rented" && rs !== "rentedowned") return false;
                    const tanfIncomes = previousYearIncomes.filter(i => (i.kind || '').toLowerCase() === 'tanf');
                    if (!tanfIncomes.length) return false;
                    const intervals = tanfIncomes.map(inc => {
                        const [sy, sm, sd] = (inc.startDate || '').split('-').map(Number);
                        const start = new Date(sy, (sm || 1) - 1, sd || 1);
                        let end;
                        if (inc.endDate) {
                            const [ey, em, ed] = inc.endDate.split('-').map(Number);
                            end = new Date(ey, em - 1, ed);
                        } else end = new Date();
                        const cs = start < previousYearStart ? previousYearStart : start;
                        const ce = end > previousYearEnd ? previousYearEnd : end;
                        return { start: cs, end: ce };
                    }).filter(i => i.start <= i.end);
                    if (!intervals.length) return false;
                    intervals.sort((a, b) => a.start - b.start);
                    const merged = [intervals[0]];
                    for (let i = 1; i < intervals.length; i++) {
                        const last = merged[merged.length - 1];
                        const oneDayAfter = new Date(last.end.getTime() + 86400000);
                        if (intervals[i].start <= oneDayAfter) {
                            if (intervals[i].end > last.end) last.end = intervals[i].end;
                        } else merged.push(intervals[i]);
                    }
                    const totalDays = merged.reduce((s, iv) => s + Math.floor((iv.end - iv.start) / 86400000) + 1, 0);
                    return (totalDays / 30.4375) > 11;
                })()) {
                    eligibility.push("Not Likely Eligible for PTRR (TANF Recipient for Entirety of Application Year)");
                } else if (applicationStatus.trim() === "no" && totalGrossIncome > Utils.PTRR_THRESHOLDS.incomeLimit) {
                    eligibility.push("Not Likely Eligible for PTRR (Income)");
                } else {
                    const rs = freshClient?.residenceStatus?.toLowerCase();
                    const relevantExpenses = (member.expenses || []).filter(exp => {
                        const isPT = exp.kind?.trim() === "Property Taxes";
                        const isRent = exp.kind?.trim() === "Rent";
                        const isPrev = exp.type?.trim() === "Previous Year";
                        if (rs === "owned") return isPT && isPrev;
                        if (rs === "rented") return isRent && isPrev;
                        if (rs === "rentedowned") return (isPT || isRent) && isPrev;
                        return false;
                    });

                    if (applicationStatus.trim() === "no" && relevantExpenses.length === 0) {
                        if (rs === "owned") eligibility.push("Needs Previous Year Property Tax Expense");
                        else if (rs === "rented") eligibility.push("Needs Previous Year Rent Expense");
                        else if (rs === "rentedowned") eligibility.push("Needs Previous Year Property Tax and Rent Expense");
                        else eligibility.push("Not Likely Eligible for PTRR (No Relevant Expenses)");
                    } else if (applicationStatus.trim() === "no" && rs === "rentedowned") {
                        const hasPT = relevantExpenses.some(e => e.kind?.trim() === "Property Taxes" && Number(e.amount || 0) > 0);
                        const hasRent = relevantExpenses.some(e => e.kind?.trim() === "Rent" && Number(e.amount || 0) > 0);
                        if (!hasPT && !hasRent) eligibility.push("Needs Previous Year Property Tax and Rent Expense");
                        else if (!hasPT) eligibility.push("Needs Previous Year Property Tax Expense");
                        else if (!hasRent) eligibility.push("Needs Previous Year Rent Expense");
                        else eligibility.push("Likely Eligible for PTRR");
                    } else {
                        const total = relevantExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
                        if (total > 0) eligibility.push("Likely Eligible for PTRR");
                        else if (rs === "owned") eligibility.push("Needs Previous Year Property Tax Expense");
                        else if (rs === "rented") eligibility.push("Needs Previous Year Rent Expense");
                        else eligibility.push("Needs Previous Year Property Tax and Rent Expense");
                    }
                }

                member.PTRR = {
                    combinedIncome: totalGrossIncome,
                    eligibility,
                    screeningInProgress: member.PTRR?.screeningInProgress ?? true,
                    screeningCloseReason: member.PTRR?.screeningCloseReason ?? null
                };
            } catch (err) { console.error(`PTRR error for ${member.firstName}:`, err); }
        }

        try {
            await fetch(`/save-household-members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, householdMembers: members })
            });
        } catch (err) { console.error('PTRR save error:', err); }

        return members;
    }

    window.BenefitRegistry.register({
        key: 'PTRR',
        label: 'PTRR',
        run,
        renderConfig: {
            key: 'PTRR',
            label: 'PTRR',
            filter: m => m.headOfHousehold === true && (m.deceased ?? '').toLowerCase() !== 'yes',
            getDetails: m => `<p><strong>Gross Income:</strong> $${m.PTRR?.combinedIncome?.toFixed(2) || 'N/A'}</p>`,
            spouseLabel: 'Previous Year Spouse',
            getSpouse: (member, allMembers) => member.previousSpouseId
                ? allMembers.find(m => m.householdMemberId === member.previousSpouseId)
                : null,
            maritalLabel: 'Previous Year Marital Status',
            getMaritalValue: m => m.previousMaritalStatus || 'N/A'
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
            { value: "Already Applied",                        label: "Already Applied This Year" },
            { value: "Ineligible - Income",                    label: "Ineligible - Income" },
            { value: "Age/Disability/Widow Criteria Not Met",  label: "Age/Disability/Widow Criteria Not Met" },
            { value: "No Formal Lease",                        label: "No Formal Lease" },
            { value: "No Relevant Expenses",                   label: "No Relevant Expenses" },
            { value: "Hard Determination",                     label: "Use Hard Determination Closeout Reason(s)" },
            { value: "Not Interested",                         label: "Not Interested" },
            { value: "Too Confusing",                          label: "Too Confusing" },
            { value: "Will Call Back",                         label: "Will Call Back" }
        ],
    
        mapHardDetermination(ineligibilityReason) {
            const u = (ineligibilityReason || '').toUpperCase();
            if (u.includes('ALREADY APPLIED'))  return 'Already Applied';
            if (u.includes('NOT INTERESTED'))   return 'Not Interested';
            if (u.includes('TANF'))             return 'Ineligible - TANF Recipient for Entirety of Application Year';
            if (u.includes('AGE') || u.includes('DISABILITY') || u.includes('WIDOW'))
                return 'Age/Disability/Widow Criteria Not Met';
            if (u.includes('NO FORMAL LEASE'))     return 'No Formal Lease';
            if (u.includes('NO RELEVANT EXPENSES')) return 'No Relevant Expenses';
            if (u.includes('INCOME') || u.includes('NOT LIKELY')) return 'Ineligible - Income';
            return ineligibilityReason || 'Ineligible - Hard Determination';
        }
    });
    
    })();