// Shared rendering utilities for all benefit modules.
// Exposes window.RenderUtils.
(function () {
    'use strict';

    const CARD_COLORS = {
        red:    { bg: '#f8d7da',            border: '#f5c6cb' },
        yellow: { bg: '#fff3cd',            border: '#ffc107' },
        green:  { bg: '#d4edda',            border: '#c3e6cb' },
        grey:   { bg: 'rgb(212, 212, 212)', border: 'rgb(0, 0, 0)' },
        none:   { bg: 'transparent',        border: '#ccc' }
    };

    const NOT_ELIGIBLE_KEYWORDS = [
        "NOT", "ALREADY ENROLLED", "ALREADY APPLIED", "NOT INTERESTED",
        "AGE CRITERIA NOT MET", "ENROLLED IN MEDICAID", "RESIDENCY NOT MET",
        "NOT ENROLLED IN MEDICARE", "NO FORMAL LEASE"
    ];

    // Benefits whose household-level cache must be dropped when reopened
    const HOUSEHOLD_CACHE_BENEFITS = ['PACE', 'PTRR', 'SFBP'];

    // ------------------------------------------------------------------
    // Small helpers
    // ------------------------------------------------------------------
    function upper(s) { return s ? String(s).toUpperCase() : ''; }

    function classifyEligibility(eligibility, { includeNeeds = true } = {}) {
        const elig = (eligibility || []).map(e => (e || '').toUpperCase());
        const isNot = elig.some(item => NOT_ELIGIBLE_KEYWORDS.some(kw => item.includes(kw)));
        const isNeeds = elig.some(item =>
            item.includes("DETERMINATION PENDING") || (includeNeeds && item.includes("NEEDS"))
        );
        if (isNot) return 'red';
        if (isNeeds) return 'yellow';
        return 'green';
    }

    function colorFromEligibility(eligibility, opts) {
        return CARD_COLORS[classifyEligibility(eligibility, opts)] || CARD_COLORS.none;
    }

    function makeCardDiv(color) {
        const div = document.createElement('div');
        div.classList.add('household-member-box');
        div.style.backgroundColor = color.bg;
        div.style.borderColor = color.border;
        div.style.width = '100%';
        div.style.boxSizing = 'border-box';
        return div;
    }

    function detailsSummaryHTML(label) {
        return `
            <summary style="display: flex; flex-direction: column; align-items: center; cursor: pointer; text-align: center; padding: 8px;">
                <h3 style="margin: 4px 0;">${label}</h3>
                <span class="toggle-text" style="font-size: 14px; margin-bottom: 4px;"><i>Show Details</i></span>
            </summary>`;
    }

    function wireDetailsToggle(root) {
        const details = root.querySelector('details.custom-details');
        if (!details) return;
        details.addEventListener('toggle', () => {
            const t = details.querySelector('.toggle-text');
            if (t) t.innerHTML = details.open ? '<i>Hide Details</i>' : '<i>Show Details</i>';
        });
    }

    // ------------------------------------------------------------------
    // Card renderers
    // ------------------------------------------------------------------

    /**
     * Grey closed card with reopen button.
     * @param {HTMLElement} container
     * @param {object} opts { key, label, reason, extraContent, onBeforeRefresh, ctx }
     *   ctx: { clientId, refreshAllDisplays, updateClientProgramStatus,
     *          addNoteToClient, renderNotesContainer }
     */
    function renderClosedBenefitCard(container, { key, label, reason, extraContent = '', onBeforeRefresh, ctx }) {
        const div = makeCardDiv(CARD_COLORS.grey);
        div.innerHTML = `
            <h3>${label}</h3>
            ${extraContent}
            <div style="padding: 8px; border-radius: 4px; margin: 8px auto; text-align: center; width: 100%; box-sizing: border-box;">
                <p style="margin: 0 0 6px 0;"><strong>${label} Screening Closed</strong></p>
                <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${reason}</p>
                <button class="btn-reopen-benefit-screening" data-benefit="${key}"
                    style="background-color: #007bff; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: background-color 0.3s;"
                    onmouseover="this.style.backgroundColor='#0056b3'"
                    onmouseout="this.style.backgroundColor='#007bff'">
                    Reopen ${label} Screening
                </button>
            </div>`;
        container.appendChild(div);

        div.querySelector('.btn-reopen-benefit-screening').addEventListener('click', async () => {
            try {
                await ctx.updateClientProgramStatus(ctx.clientId, key, true);
                if (onBeforeRefresh) await onBeforeRefresh();
                await ctx.addNoteToClient(ctx.clientId, `<strong>${label} screening reopened.</strong>`);
                await ctx.renderNotesContainer();
                if (HOUSEHOLD_CACHE_BENEFITS.includes(key) && window.invalidateHouseholdCache) {
                    window.invalidateHouseholdCache();
                }
                if (key === 'SNAP' && window.refreshFarmworkerVisibility) {
                    await window.refreshFarmworkerVisibility();
                }
                await ctx.refreshAllDisplays();
            } catch (err) {
                console.error(`Error reopening ${key} screening:`, err);
            }
        });
        return div;
    }

    /** Yellow (or custom-color) info card with a message. */
    function renderInfoCard(container, label, message, color = CARD_COLORS.yellow) {
        const div = makeCardDiv(color);
        div.innerHTML = `
            <details class="custom-details">
                ${detailsSummaryHTML(label)}
                <p>${message}</p>
            </details>`;
        container.appendChild(div);
        wireDetailsToggle(div);
        return div;
    }

    // ------------------------------------------------------------------
    // Individual-benefit (per-member) card renderer.
    // Used by PACE, LIS, MSP, PTRR.
    //
    // config: {
    //   key, label,
    //   filter(member),
    //   getDetails(member) -> HTML,
    //   spouseLabel? (default 'Spouse'),
    //   getSpouse?(member, allMembers) -> memberOrNull,
    //   maritalLabel? (default 'Marital Status'),
    //   getMaritalValue?(member)  (default -> member.maritalStatus)
    // }
    // ------------------------------------------------------------------
    function getSpouseInfo(member, allMembers, config) {
        if (config.showSpouse === false) return '';
        const spouse = config.getSpouse
            ? config.getSpouse(member, allMembers)
            : (() => {
                const rel = member.relationships?.find(r => r.relationship === 'spouse');
                return rel ? allMembers.find(m => m.householdMemberId === rel.relatedMemberId) : null;
              })();
        if (!spouse) return '';
        const label = config.spouseLabel || 'Spouse';
        return `<strong>${label}:</strong> ${upper(spouse.firstName || 'N/A')} ${upper(spouse.lastName || '')}`;
    }

    function buildMemberRowHTML(member, config, allMembers) {
        const benefitObj = member[config.key];
        const memberName = `${upper(member.firstName)} ${upper(member.middleInitial || '')} ${upper(member.lastName)}`;

        if (benefitObj.screeningInProgress === false) {
            return `
                <div style="background-color:${CARD_COLORS.grey.bg}; border: 1px solid ${CARD_COLORS.grey.border}; padding: 8px; border-radius: 4px; margin: 8px 0; text-align: center; width: 100%; box-sizing: border-box;">
                    <p style="margin: 0 0 4px 0;"><strong>${memberName}</strong></p>
                    <p style="margin: 0 0 6px 0;"><strong>${config.label} Screening Closed</strong></p>
                    <p style="margin: 0 0 6px 0; font-size: 12px;">Reason: ${benefitObj.screeningCloseReason || 'N/A'}</p>
                    <button class="btn-reopen-individual-screening" data-benefit="${config.key}" data-member-id="${member.householdMemberId}"
                        style="background-color: #007bff; color: white; border: none; border-radius: 4px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: background-color 0.3s;"
                        onmouseover="this.style.backgroundColor='#0056b3'"
                        onmouseout="this.style.backgroundColor='#007bff'">
                        Reopen ${config.label} Screening
                    </button>
                </div>`;
        }

        const elig = benefitObj.eligibility?.map(upper) || [];
        const color = colorFromEligibility(elig, { includeNeeds: true });
        const spouseInfo = getSpouseInfo(member, allMembers, config);
        const ageDisplay = member.age?.split('Y')[0] || 'N/A';

        const maritalInfo = config.showMaritalStatus === false ? '' : (() => {
            const maritalLabel = config.maritalLabel || 'Marital Status';
            const maritalValue = config.getMaritalValue
                ? config.getMaritalValue(member)
                : (member.maritalStatus || 'N/A');
            return `<strong>${maritalLabel}:</strong> <br>${upper(maritalValue)}<br>`;
        })();

        return `
            <details class="custom-details member-details" style="background-color: ${color.bg}; border: 1px solid #000; border-radius: 4px; padding: 8px; margin: 8px 0; width: 100%; box-sizing: border-box;">
                <summary style="list-style: none; cursor: pointer;"><br><strong>${memberName}</strong>
                    <br>
                    <p>${elig.join(', ') || 'Not Available'}</p>
                </summary>
                <hr class="separator-bar">
                ${member.headOfHousehold ? ' <span style="font-size: 11px; border: 1px solid black; padding: 2px 5px; margin-left: 6px;">Head of Household</span>' : ''}
                <p><strong>Age:</strong> ${ageDisplay} <br>
                ${maritalInfo}
                ${spouseInfo}</p>
                ${config.getDetails(member)}
            </details>`;
    }

    function attachIndividualReopenHandlers(cardDiv, members, ctx) {
        cardDiv.querySelectorAll('.btn-reopen-individual-screening').forEach(btn => {
            btn.addEventListener('click', async () => {
                const benefit = btn.dataset.benefit;
                const memberId = btn.dataset.memberId;
                const target = members.find(m => m.householdMemberId === memberId);
                if (!target || !target[benefit]) return;

                target[benefit].screeningInProgress = true;
                target[benefit].screeningCloseReason = null;

                try {
                    const res = await ctx.saveHouseholdMembers(ctx.clientId, members);
                    if (!res.ok) { console.error(`Failed to reopen ${benefit} screening.`); return; }
                    const name = `${upper(target.firstName)} ${upper(target.lastName)}`;
                    await ctx.addNoteToClient(ctx.clientId, `<strong>${benefit} screening reopened for ${name}.</strong>`);
                    await ctx.renderNotesContainer();
                    if (HOUSEHOLD_CACHE_BENEFITS.includes(benefit) && window.invalidateHouseholdCache) {
                        window.invalidateHouseholdCache();
                    }
                    await ctx.refreshAllDisplays();
                } catch (err) {
                    console.error(`Error reopening ${benefit} screening:`, err);
                }
            });
        });
    }

    /**
     * The main entry point every individual-benefit render() will call.
     */
    function renderIndividualBenefitCard(container, config, members, programStatus, ctx) {
        const eligibleMembers = members.filter(config.filter);

        // No eligible members: possibly show a grey closed card
        if (eligibleMembers.length === 0) {
            const ps = programStatus[config.key];
            if (ps?.screeningInProgress === false) {
                renderClosedBenefitCard(container, {
                    key: config.key, label: config.label,
                    reason: ps.screeningCloseReason || 'N/A', ctx
                });
            } else if (members.length === 0) {
                // "No household members found" state
                renderInfoCard(container, config.label, 'NO HOUSEHOLD MEMBERS FOUND.');
            }
            return;
        }

        // Skip when all "Not Checked"
        if (eligibleMembers.every(m => m[config.key]?.eligibility?.includes('Not Checked'))) return;

        const isOpen = m => {
            const b = m[config.key];
            return b && b.screeningInProgress !== false
                && !b.eligibility?.includes('Not Checked')
                && b.eligibility?.length > 0;
        };
        const openMembers = eligibleMembers.filter(isOpen);
        const closedMembers = eligibleMembers.filter(m => m[config.key]?.screeningInProgress === false);
        const notCheckedCount = eligibleMembers.filter(m => m[config.key]?.eligibility?.includes('Not Checked')).length;

        let color = CARD_COLORS.none;
        if (openMembers.length === 0 && notCheckedCount === 0) {
            color = CARD_COLORS.grey;
        } else if (openMembers.length > 0) {
            const statuses = openMembers.map(m => classifyEligibility(m[config.key]?.eligibility, { includeNeeds: false }));
            if (statuses.every(s => s === 'red')) color = CARD_COLORS.red;
            else if (statuses.every(s => s === 'yellow')) color = CARD_COLORS.yellow;
            else color = CARD_COLORS.green;
        }

        const sorted = [...eligibleMembers].sort((a, b) => {
            const rank = m => openMembers.includes(m) ? 0 : closedMembers.includes(m) ? 1 : 2;
            const diff = rank(a) - rank(b);
            if (diff !== 0) return diff;
            return (b.headOfHousehold ? 1 : 0) - (a.headOfHousehold ? 1 : 0);
        });

        const rowsHTML = sorted
            .filter(m => m[config.key] && !m[config.key].eligibility?.includes('Not Checked'))
            .map(m => buildMemberRowHTML(m, config, members))
            .join('');

        const cardDiv = makeCardDiv(color);
        cardDiv.innerHTML = `
            <details class="custom-details">
                ${detailsSummaryHTML(config.label)}
                ${rowsHTML}
            </details>`;
        container.appendChild(cardDiv);
        wireDetailsToggle(cardDiv);
        attachIndividualReopenHandlers(cardDiv, members, ctx);
    }

    // ------------------------------------------------------------------
    // Shared modal-entry helper for the FOUR individual benefits.
    // Returns entries for members currently open for this benefit.
    // ------------------------------------------------------------------
    function buildIndividualModalEntries(config, members, programStatus) {
        const entries = [];
        const upperCap = s => (s ? String(s).toUpperCase() : '');

        const anyEntry = { present: false };
        members.forEach(member => {
            if ((member.deceased ?? '').toLowerCase() === 'yes') return;
            if (!config.filter(member)) return;

            const b = member[config.key];
            if (!b || b.screeningInProgress === false) return;
            if (b.eligibility?.includes('Not Checked')) return;
            if (!(b.eligibility?.length > 0)) return;

            const upperArr = b.eligibility.map(e => (e || '').toUpperCase());
            const isNotEligible = upperArr.some(item => NOT_ELIGIBLE_KEYWORDS.some(kw => item.includes(kw)));
            let ineligibilityReason = '';
            if (isNotEligible) {
                ineligibilityReason = b.eligibility.find(e => {
                    const u = (e || '').toUpperCase();
                    return NOT_ELIGIBLE_KEYWORDS.some(kw => u.includes(kw)) || u.includes('AGE') || u.includes('RESIDENCY');
                }) || '';
            }
            const memberName = `${upperCap(member.firstName)} ${upperCap(member.lastName)}`;
            entries.push({
                memberId: member.householdMemberId, memberName, benefit: config.key,
                isNotEligible, ineligibilityReason, isHousehold: false
            });
            anyEntry.present = true;
        });

        // "No members found" placeholder in modal, unless benefit is closed at program level
        if (!anyEntry.present && programStatus[config.key]?.screeningInProgress !== false) {
            const eligibleMembers = members.filter(config.filter);
            const allNotChecked = eligibleMembers.length > 0
                && eligibleMembers.every(m => m[config.key]?.eligibility?.includes('Not Checked'));
            const allClosed = eligibleMembers.length > 0
                && eligibleMembers.every(m => m[config.key]?.screeningInProgress === false);
            if (!allNotChecked && !allClosed) {
                entries.push({
                    memberId: 'NO_MEMBERS', memberName: `${config.key} (No Members)`,
                    benefit: config.key, isNotEligible: false, ineligibilityReason: '',
                    isHousehold: true
                });
            }
        }
        return entries;
    }

    // ------------------------------------------------------------------
    // Expose
    // ------------------------------------------------------------------
    window.RenderUtils = {
        CARD_COLORS,
        NOT_ELIGIBLE_KEYWORDS,
        capitalizeFirstLetter: upper,
        classifyEligibility,
        colorFromEligibility,
        makeCardDiv,
        detailsSummaryHTML,
        wireDetailsToggle,
        renderClosedBenefitCard,
        renderInfoCard,
        renderIndividualBenefitCard,
        buildIndividualModalEntries
    };
})();