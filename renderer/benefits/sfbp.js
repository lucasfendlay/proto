(function () {
    // Helper: total current monthly income across ALL living household members
    function householdMonthlyIncome(members, Utils) {
        return members
            .filter(m => (m.deceased ?? '').toLowerCase() !== 'yes')
            .reduce((total, m) => {
                const currentIncomes = (m.income || []).filter(i => i.type?.toLowerCase() === 'current');
                const yearly = currentIncomes.reduce((s, i) =>
                    s + Utils.calculateYearlyIncome(i.amount, i.frequency, i.startDate, i.endDate), 0);
                return total + (yearly / 12);
            }, 0);
    }

    async function run(members, context) {
        const { clientId, Utils } = context;
        if (!Utils) { console.error('SFBP: EligibilityUtils not available'); return members; }

        const heads = members.filter(m => m.headOfHousehold === true);
        members.forEach(m => {
            if (!m.headOfHousehold) {
                m.SFBP = {
                    combinedIncome: 0,
                    householdSize: 0,
                    eligibility: ["Not Checked"],
                    screeningInProgress: m.SFBP?.screeningInProgress ?? false,
                    screeningCloseReason: m.SFBP?.screeningCloseReason ?? "Not Applicable"
                };
            }
        });

        const active = members.filter(m => (m.deceased ?? '').toLowerCase() !== 'yes');
        const householdSize = active.length;
        const combinedIncome = householdMonthlyIncome(members, Utils);
        const incomeLimit = Utils.SFBP_THRESHOLDS.getIncomeLimit(householdSize);

        for (const member of heads) {
            try {
                const eligibility = [];
                const enrollmentStatus = member.selections?.["Is this person currently enrolled in the Senior Food Box Program?"]?.toLowerCase();

                const rawDob = (member.dob ?? '').toString().trim();
                const dob = new Date(rawDob);
                const hasValidDob =
                    rawDob !== '' &&
                    rawDob.toLowerCase() !== 'n/a' &&
                    !isNaN(dob.getTime());

                const today = new Date();
                let age = today.getFullYear() - dob.getFullYear();
                if (today.getMonth() < dob.getMonth() ||
                    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--;

                    if (!hasValidDob) {
                        eligibility.push("Needs Date of Birth");
                        member.selections = member.selections || {};
                        member.selections["Is this person currently enrolled in the Senior Food Box Program?"] = null;
                    } else if (age < Utils.SFBP_THRESHOLDS.minAgeYears) {
                        eligibility.push("Age Criteria Not Met");
                        member.selections = member.selections || {};
                        member.selections["Is this person currently enrolled in the Senior Food Box Program?"] = "agecriterianotmet";
                    } else if (enrollmentStatus === "yes") {
                        eligibility.push("Already Enrolled");
                    } else if (!enrollmentStatus || enrollmentStatus.trim() === "n/a" ||
                               enrollmentStatus.trim() === "not interested" ||
                               enrollmentStatus.trim() === "agecriterianotmet") {
                        eligibility.push("Needs Current SFBP Enrollment Status");
                    } else if (enrollmentStatus === "notinterested") {
                        eligibility.push("Not Interested");
                    } else if (combinedIncome > incomeLimit) {
                        eligibility.push("Not Likely Eligible for SFBP (Income)");
                    } else {
                        eligibility.push("Likely Eligible for SFBP");
                    }

                member.SFBP = {
                    combinedIncome,
                    householdSize,
                    incomeLimit,
                    eligibility,
                    screeningInProgress: member.SFBP?.screeningInProgress ?? true,
                    screeningCloseReason: member.SFBP?.screeningCloseReason ?? null
                };
            } catch (err) { console.error(`SFBP error for ${member.firstName}:`, err); }
        }

        try {
            await fetch(`/save-household-members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, householdMembers: members })
            });
        } catch (err) { console.error('SFBP save error:', err); }

        return members;
    }

    window.BenefitRegistry.register({
        key: 'SFBP',
        label: 'SFBP',
        run,
        renderConfig: {
            key: 'SFBP',
            label: 'Senior Food Box Program',
            filter: m => m.headOfHousehold === true && (m.deceased ?? '').toLowerCase() !== 'yes',
            showSpouse: false,
            showMaritalStatus: false,
            getDetails: m => `
                <p><strong>Household Size:</strong> ${m.SFBP?.householdSize ?? 'N/A'}</p>
                <p><strong>Household Monthly Income:</strong> $${m.SFBP?.combinedIncome?.toFixed(2) || 'N/A'}</p>`
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
            { value: "Hard Determination", label: "Use Hard Determination Closeout Reason(s)" },
            { value: "Not Interested",     label: "Not Interested" },
            { value: "Too Confusing",      label: "Too Confusing" },
            { value: "Will Call Back",     label: "Will Call Back" },
            { value: "Disconnected",       label: "Disconnected" }
        ],

        mapHardDetermination(ineligibilityReason) {
            const u = (ineligibilityReason || '').toUpperCase();
            if (u.includes('ALREADY ENROLLED')) return 'Already Enrolled';
            if (u.includes('NOT INTERESTED'))   return 'Not Interested';
            if (u.includes('AGE'))              return 'Age Criteria Not Met';
            if (u.includes('INCOME') || u.includes('NOT LIKELY')) return 'Ineligible - Income';
            return ineligibilityReason || 'Ineligible - Hard Determination';
        }
    });
})();