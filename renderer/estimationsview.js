// Page: estimationsview.html (READ-ONLY)
// Eligibility logic delegated to window.BenefitRegistry + renderer/benefits/*.js.
// This file only owns the read-only display (muted colors, no flip, no buttons).

function getUtils() {
    const Utils = window.EligibilityUtils;
    if (!Utils) console.error('EligibilityUtils not loaded before estimationsview.js');
    return Utils || null;
}

let resolveEligibilityChecks;
window.eligibilityChecksReady = new Promise(resolve => { resolveEligibilityChecks = resolve; });

document.addEventListener('DOMContentLoaded', async function () {

    if (!window.BenefitRegistry) {
        console.error('BenefitRegistry not loaded. Include benefitRegistry.js and benefits/*.js before estimationsview.js');
        return;
    }

    const {
        INDIVIDUAL_BENEFITS,
        getQueryParameter,
        capitalizeFirstLetter,
        ensureBenefitSchema,
        findSpouse,
        isNotEligible,
        needsInfo,
        isLikelyEligible
    } = window.EligibilityUtils;

    // ===== READ-ONLY MUTED PALETTE =====
    const MUTED_COLORS = {
        eligible:    { bg: '#e8efe8', border: '#c5d5c5' },
        notEligible: { bg: '#f0e0e0', border: '#d9c5c5' },
        needsInfo:   { bg: '#f0ead0', border: '#d9d0b0' },
        closed:      { bg: '#e8e8e8', border: '#c5c5c5' },
    };
    function getMutedCardColors(eligibility) {
        if (isNotEligible(eligibility)) return MUTED_COLORS.notEligible;
        if (needsInfo(eligibility))     return MUTED_COLORS.needsInfo;
        return MUTED_COLORS.eligible;
    }

    // ===== STATE =====
    const clientId = getQueryParameter('id');
    let client = null;

    // ===== DATA =====
    async function fetchClient() {
        try {
            const r = await fetch(`/get-client/${clientId}`);
            return r.ok ? await r.json() : null;
        } catch (e) { console.error('fetchClient:', e); return null; }
    }

    async function loadHouseholdMembers() {
        if (!clientId) return [];
        try {
            const c = await fetchClient();
            if (!c?.householdMembers) return [];
            return ensureBenefitSchema(c.householdMembers);
        } catch (e) { console.error('loadHouseholdMembers:', e); return []; }
    }

    // ===== READ-ONLY CARDS =====
    function generateReadOnlyBenefitCard(benefit, member) {
        const bObj = member[benefit];
        if (!bObj || bObj.eligibility?.includes('Not Checked')) return '';

        const eligArray = bObj.eligibility?.map(capitalizeFirstLetter) || [];
        const { bg: bgColor, border: borderColor } = getMutedCardColors(bObj.eligibility);
        const incomeLabel = benefit === 'PACE' ? 'Gross Adjusted Income' : 'Gross Income';
        const showAssets = ['LIS', 'MSP'].includes(benefit);
        const isClosed = bObj.screeningInProgress === false;
        const closedReason = bObj.screeningCloseReason || 'N/A';

        return `
            <div style="width:100%;margin:8px auto;background-color:${isClosed ? MUTED_COLORS.closed.bg : bgColor};border:1px solid ${isClosed ? MUTED_COLORS.closed.border : borderColor};border-radius:4px;padding:8px;box-sizing:border-box;opacity:0.85;">
                <details class="custom-details" style="background-color:transparent;border-radius:4px;padding:8px;width:100%;box-sizing:border-box;">
                    <summary style="display:flex;flex-direction:column;align-items:center;cursor:pointer;text-align:center;padding:8px;">
                        <br><strong>${benefit}</strong><br>
                        <span class="toggle-text" style="font-size:14px;margin-bottom:4px;color:#777;"><i>Show Details</i></span>
                        <p style="color:#555;">${eligArray.join(', ') || 'Not Available'}</p>
                        ${isClosed ? `<p style="font-size:12px;color:#888;"><em>Closed: ${closedReason}</em></p>` : ''}
                    </summary>
                    <hr style="border-color:#ddd;">
                    <p style="color:#666;"><strong>${incomeLabel}:</strong> $${bObj.combinedIncome?.toFixed(2) || 'N/A'}</p>
                    ${showAssets ? `<p style="color:#666;"><strong>Combined Assets:</strong> $${bObj.combinedAssets?.toFixed(2) || 'N/A'}</p>` : ''}
                </details>
            </div>`;
    }

    function generateReadOnlyClosedBox(benefit, bObj) {
        if (!bObj || bObj.screeningInProgress !== false) return '';
        return `
            <div style="background-color:${MUTED_COLORS.closed.bg};border:1px solid ${MUTED_COLORS.closed.border};padding:8px;border-radius:4px;margin:8px auto;text-align:center;width:100%;box-sizing:border-box;opacity:0.85;">
                <p style="margin:0 0 6px 0;color:#666;"><strong>${benefit} Screening Closed</strong></p>
                <p style="margin:0;font-size:12px;color:#888;">Reason: ${bObj.screeningCloseReason || 'N/A'}</p>
            </div>`;
    }

    function wireDetailsToggles(root) {
        root.querySelectorAll('details.custom-details').forEach(d => {
            d.addEventListener('toggle', () => {
                const t = d.querySelector('.toggle-text');
                if (t) t.innerHTML = d.open ? '<i>Hide Details</i>' : '<i>Show Details</i>';
            });
        });
    }

    // ===== DISPLAY: PER-MEMBER =====
    async function displayHouseholdMembers() {
        const container = document.getElementById('household-members-container');
        const members = await loadHouseholdMembers();
        container.innerHTML = '';

        if (members.length === 0) {
            const p = document.createElement('p');
            p.textContent = 'No household members found.';
            container.appendChild(p);
            return;
        }

        const bk = ['PACE','LIS','MSP','PTRR'];
        const hasOpen = (m, dead) => bk.some(k => {
            if (dead && k !== 'PTRR') return false;
            if (k === 'PTRR' && !m.headOfHousehold) return false;
            if (dead && k === 'PTRR') return false;
            const b = m[k];
            if (!b || b.screeningInProgress === false) return false;
            if (b.eligibility?.includes('Not Checked')) return false;
            return b.eligibility && b.eligibility.length > 0;
        });
        const parseAgeYears = s => { if (!s) return 0; const m = s.match(/(\d+)\s*Years?/i); return m ? parseInt(m[1], 10) : 0; };

        members.sort((a, b) => {
            const da = (a.deceased ?? '').toLowerCase() === 'yes';
            const db = (b.deceased ?? '').toLowerCase() === 'yes';
            const oA = hasOpen(a, da), oB = hasOpen(b, db);
            if (oA !== oB) return oB - oA;
            if (b.headOfHousehold !== a.headOfHousehold) return b.headOfHousehold - a.headOfHousehold;
            return parseAgeYears(b.age) - parseAgeYears(a.age);
        });

        members.forEach(member => {
            const div = document.createElement('div');
            div.classList.add('household-member-box');
            div.style.opacity = '0.9';

            const memberFullName = `${capitalizeFirstLetter(member.firstName)} ${capitalizeFirstLetter(member.lastName)}`;
            const isDeceased = (member.deceased ?? '').toLowerCase() === 'yes';

            const sections = [];
            INDIVIDUAL_BENEFITS.forEach(benefit => {
                if (isDeceased && benefit !== 'PTRR') return;
                if (benefit === 'PTRR' && !member.headOfHousehold) return;
                if (benefit === 'PTRR' && isDeceased) return;
                const bObj = member[benefit];
                if (!bObj) return;
                if (bObj.screeningInProgress === false) {
                    sections.push({ closed: true, html: generateReadOnlyClosedBox(benefit, bObj) });
                } else if (!bObj.eligibility?.includes('Not Checked')) {
                    const html = generateReadOnlyBenefitCard(benefit, member);
                    if (html) sections.push({ closed: false, html });
                }
            });
            sections.sort((a, b) => a.closed - b.closed);

            const spouse = findSpouse(member, members);
            const spouseName = spouse ? `${capitalizeFirstLetter(spouse.firstName)} ${capitalizeFirstLetter(spouse.lastName)}` : null;

            div.innerHTML = `
                <div class="member-badge-area" style="min-height:40px;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">
                    ${member.headOfHousehold ? `<p class="household-member-info" style="color:#666;border:2px solid #aaa;padding:5px;display:inline-block;margin:0;"><strong>Head of Household</strong></p>` : ''}
                    ${isDeceased ? `<p class="household-member-info" style="color:#666;border:2px solid #aaa;padding:5px;display:inline-block;margin:0;"><strong>Deceased</strong></p>` : ''}
                </div>
                <h3 style="color:#555;">${memberFullName}${member.middleInitial ? ` ${capitalizeFirstLetter(member.middleInitial)}` : ''}</h3>
                <p style="color:#666;"><strong>Age:</strong> ${member.age?.split('Y')[0] || 'N/A'}</p>
                <p style="color:#666;"><strong>Marital Status:</strong> ${capitalizeFirstLetter(member.maritalStatus || 'N/A')}</p>
                ${spouseName ? `<p style="color:#666;"><strong>Spouse:</strong> ${spouseName}</p>` : ''}
                <br>
                ${sections.map(s => s.html).join('')}`;
            container.appendChild(div);
            wireDetailsToggles(div);
        });
    }

    // ===== DISPLAY: SNAP =====
    async function displaySNAPHouseholds() {
        const container = document.getElementById('snap-household-container');
        if (!container) return;
        const members = await loadHouseholdMembers();
        let clientData = null;
        try { const r = await fetch(`/get-client/${clientId}`); if (r.ok) clientData = await r.json(); }
        catch (e) { console.error(e); }
        container.innerHTML = '';

        const snapMembers = members.filter(m => m.meals?.toLowerCase() === 'yes');
        const status = clientData?.programStatus?.SNAP;

        if (status?.screeningInProgress === false) {
            const d = document.createElement('div');
            d.classList.add('household-member-box');
            d.style.backgroundColor = MUTED_COLORS.closed.bg;
            d.style.borderColor = MUTED_COLORS.closed.border;
            d.style.opacity = '0.85';
            d.innerHTML = `
                <h3 style="color:#666;">SNAP HOUSEHOLD</h3>
                ${snapMembers.length ? `<p style="color:#777;"><strong>Members:</strong> ${snapMembers.map(m => `${capitalizeFirstLetter(m.firstName)} ${capitalizeFirstLetter(m.lastName)}`).join(', ')}</p>` : ''}
                <div style="padding:8px;text-align:center;">
                    <p style="margin:0 0 6px 0;color:#666;"><strong>SNAP Screening Closed</strong></p>
                    <p style="margin:0;font-size:12px;color:#888;">Reason: ${status?.screeningCloseReason || 'N/A'}</p>
                </div>`;
            container.appendChild(d);
            return;
        }

        const alreadyEnrolled = clientData?.snap === 'yes';
        const notInterested = clientData?.snap === 'notinterested';

        const snapHouseholds = [];
        const seen = new Set();
        for (const m of members) {
            if (seen.has(m.householdMemberId)) continue;
            if (m.meals?.toLowerCase() !== 'yes') continue;
            const h = [m]; seen.add(m.householdMemberId);
            for (const o of members) {
                if (o.householdMemberId !== m.householdMemberId && o.meals?.toLowerCase() === 'yes') {
                    h.push(o); seen.add(o.householdMemberId);
                }
            }
            snapHouseholds.push(h);
        }

        if (snapHouseholds.length === 0) {
            const d = document.createElement('div');
            d.classList.add('household-member-box');
            if (alreadyEnrolled || notInterested) {
                d.style.backgroundColor = MUTED_COLORS.notEligible.bg;
                d.style.borderColor = MUTED_COLORS.notEligible.border;
            } else {
                d.style.backgroundColor = MUTED_COLORS.needsInfo.bg;
                d.style.borderColor = MUTED_COLORS.needsInfo.border;
            }
            d.style.width = '100%'; d.style.boxSizing = 'border-box'; d.style.opacity = '0.85';
            d.innerHTML = `
                <details class="custom-details">
                    <summary style="display:flex;flex-direction:column;align-items:center;cursor:pointer;text-align:center;padding:8px;">
                        <h3 style="margin:4px 0;color:#555;">SNAP</h3>
                        <span class="toggle-text" style="font-size:14px;margin-bottom:4px;color:#777;"><i>Show Details</i></span>
                    </summary>
                    ${alreadyEnrolled ? '<p style="color:#666;">ALREADY ENROLLED</p>' : notInterested ? '<p style="color:#666;">NOT INTERESTED</p>' : '<p style="color:#666;">NO SNAP HOUSEHOLD MEMBERS FOUND.</p>'}
                </details>`;
            container.appendChild(d);
            wireDetailsToggles(d);
            return;
        }

        snapHouseholds.forEach(h => container.appendChild(createReadOnlySNAPCard(h)));
    }

    function createReadOnlySNAPCard(household) {
        const names = household.map(m => `${capitalizeFirstLetter(m.firstName)} ${capitalizeFirstLetter(m.lastName)}`).join(', ');
        const data = household[0]?.SNAP || {};
        const div = document.createElement('div');
        div.classList.add('household-member-box');
        div.style.opacity = '0.85';

        if (data.screeningInProgress === false) {
            div.style.backgroundColor = MUTED_COLORS.closed.bg;
            div.style.borderColor = MUTED_COLORS.closed.border;
            div.innerHTML = `
                <h3 style="color:#666;">SNAP HOUSEHOLD</h3>
                <p style="color:#777;"><strong>Members:</strong> ${names}</p>
                <div style="padding:8px;text-align:center;">
                    <p style="margin:0 0 6px 0;color:#666;"><strong>SNAP Screening Closed</strong></p>
                    <p style="margin:0;font-size:12px;color:#888;">Reason: ${data.screeningCloseReason || 'N/A'}</p>
                </div>`;
            return div;
        }

        const eligibility = data.eligibility?.map(capitalizeFirstLetter) || ['Not Available'];
        const { bg, border } = getMutedCardColors(data.eligibility);
        const likely = isLikelyEligible(data.eligibility);
        const amount = data.benefitAmount || 0;
        const expedited = data.expeditedEligibility || 'N/A';

        div.style.backgroundColor = bg;
        div.style.borderColor = border;
        div.innerHTML = `
            <details class="custom-details" style="background-color:transparent;border-radius:4px;padding:8px;margin:8px auto;width:100%;box-sizing:border-box;">
                <summary style="display:flex;flex-direction:column;align-items:center;cursor:pointer;text-align:center;padding:8px;">
                    <br><strong style="color:#555;">SNAP</strong><br>
                    <span class="toggle-text" style="font-size:14px;margin-bottom:4px;color:#777;"><i>Show Details</i></span>
                    <p style="color:#666;"><strong>Members:</strong> ${names}</p>
                    <p style="color:#666;"><strong>Eligibility:</strong> ${eligibility.join(', ')}</p>
                    ${likely && amount >= 0 ? `
                        <p style="color:#666;"><strong>Estimated Benefit Amount:</strong> ${amount <= 24 ? 'Up to $24.00' : `Up to $24.00 - $${amount.toFixed(2)}`}</p>
                        <p style="color:#666;"><strong>Expedited Eligibility:</strong> ${expedited}</p>
                    ` : ''}
                </summary>
                <hr style="border-color:#ddd;">
                <p style="color:#666;"><strong>SNAP Household Size:</strong> ${data.householdSize || household.length}</p>
                <p style="color:#666;"><strong>Total Gross Income:</strong> $${(data.combinedMonthlyIncome || 0).toFixed(2)}</p>
                <p style="color:#666;"><strong>Standard Deduction:</strong> $${(data.standardDeduction || 0).toFixed(2)}</p>
                <p style="color:#666;"><strong>Shelter Deduction:</strong> $${(data.excessShelterCost || 0).toFixed(2)}</p>
                <p style="color:#666;"><strong>Utility Allowance:</strong> $${(data.totalUtilityAllowance || 0).toFixed(2)}</p>
                <p style="color:#666;"><strong>Medical Expense Deductions:</strong> $${(data.totalMedicalExpenses || 0).toFixed(2)}</p>
                <p style="color:#666;"><strong>Other Expense Deductions:</strong> $${(data.totalOtherExpenses || 0).toFixed(2)}</p>
                <p style="color:#666;"><strong>Adjusted Net Income:</strong> $${(data.totalNetIncome || 0).toFixed(2)}</p>
                <p style="color:#666;"><strong>Combined Assets:</strong> $${(data.combinedAssets || 0).toFixed(2)}</p>
            </details>`;
        wireDetailsToggles(div);
        return div;
    }

    // ===== DISPLAY: LIHEAP =====
    async function displayLIHEAPHouseholds() {
        const container = document.getElementById('liheap-household-container');
        if (!container) return;
        const members = await loadHouseholdMembers();
        let clientData = null;
        try { const r = await fetch(`/get-client/${clientId}`); if (r.ok) clientData = await r.json(); }
        catch (e) { console.error(e); }
        container.innerHTML = '';

        const active = members.filter(m => (m.deceased ?? '').toLowerCase() !== 'yes');
        const names = active.map(m => `${capitalizeFirstLetter(m.firstName)} ${capitalizeFirstLetter(m.lastName)}`).join(', ');
        const status = clientData?.programStatus?.LIHEAP;

        if (status?.screeningInProgress === false) {
            const d = document.createElement('div');
            d.classList.add('household-member-box');
            d.style.backgroundColor = MUTED_COLORS.closed.bg;
            d.style.borderColor = MUTED_COLORS.closed.border;
            d.style.opacity = '0.85';
            d.innerHTML = `
                <h3 style="color:#666;">LIHEAP HOUSEHOLD</h3>
                <div style="padding:8px;text-align:center;">
                    <p style="margin:0 0 6px 0;color:#666;"><strong>LIHEAP Screening Closed</strong></p>
                    <p style="margin:0;font-size:12px;color:#888;">Reason: ${status?.screeningCloseReason || 'N/A'}</p>
                </div>`;
            container.appendChild(d);
            return;
        }

        const alreadyEnrolled = client?.liheapEnrollment === 'yes' && client?.heatingCrisis === 'no';
        const notInterested = client?.liheapEnrollment === 'notinterested';
        if (alreadyEnrolled || notInterested) {
            const d = document.createElement('div');
            d.classList.add('household-member-box');
            d.style.backgroundColor = MUTED_COLORS.notEligible.bg;
            d.style.borderColor = MUTED_COLORS.notEligible.border;
            d.style.opacity = '0.85';
            d.innerHTML = `
                <h3 style="color:#666;">LIHEAP HOUSEHOLD</h3>
                ${alreadyEnrolled ? '<p style="color:#666;">ALREADY ENROLLED</p>' : '<p style="color:#666;">NOT INTERESTED</p>'}`;
            container.appendChild(d);
            return;
        }

        if (active.length === 0) {
            const d = document.createElement('div');
            d.classList.add('household-member-box');
            d.style.backgroundColor = MUTED_COLORS.needsInfo.bg;
            d.style.borderColor = MUTED_COLORS.needsInfo.border;
            d.style.opacity = '0.85';
            d.innerHTML = '<h3 style="color:#666;">LIHEAP HOUSEHOLD</h3><p style="color:#666;">NO LIHEAP HOUSEHOLDS FOUND.</p>';
            container.appendChild(d);
            return;
        }

        const data = active[0]?.LIHEAP || {};
        container.appendChild(createReadOnlyLIHEAPCard(active, names, data));
    }

    function createReadOnlyLIHEAPCard(active, names, data) {
        const eligibility = data.eligibility?.map(capitalizeFirstLetter) || ['Not Available'];
        const combined = data.combinedMonthlyIncome || 0;
        const medDed = data.totalMedicarePremiumDeduction || 0;
        const gross = combined + medDed;
        const { bg, border } = getMutedCardColors(data.eligibility);

        const div = document.createElement('div');
        div.classList.add('household-member-box');
        div.style.backgroundColor = bg;
        div.style.borderColor = border;
        div.style.opacity = '0.85';
        div.style.width = '100%';
        div.style.boxSizing = 'border-box';
        div.innerHTML = `
            <details class="custom-details" style="background-color:transparent;border-radius:4px;padding:8px;margin:8px auto;width:100%;box-sizing:border-box;">
                <summary style="display:flex;flex-direction:column;align-items:center;cursor:pointer;text-align:center;padding:8px;">
                    <br><strong style="color:#555;">LIHEAP</strong><br>
                    <span class="toggle-text" style="font-size:14px;margin-bottom:4px;color:#777;"><i>Show Details</i></span>
                    <p style="color:#666;"><strong>Members:</strong> ${names}</p>
                    <p style="color:#666;"><strong>Eligibility:</strong> ${eligibility.join(', ')}</p>
                </summary>
                <hr style="border-color:#ddd;">
                <p style="color:#666;"><strong>LIHEAP Household Size:</strong> ${active.length}</p>
                <p style="color:#666;"><strong>Total Gross Income:</strong> $${gross.toFixed(2)}</p>
                <p style="color:#666;"><strong>Medicare Premium Deductions:</strong> $${medDed.toFixed(2)}</p>
                <p style="color:#666;"><strong>Adjusted Gross Income:</strong> $${combined.toFixed(2)}</p>
            </details>`;
        wireDetailsToggles(div);
        return div;
    }

    // ===== INIT =====
    async function initialize() {
        client = await fetchClient();
        if (!client) { console.error('Client data unavailable'); return; }

        const members = await loadHouseholdMembers();

        // Delegate ALL eligibility to registry (read-only page still recomputes for display freshness)
        await window.BenefitRegistry.runAll(members, {
            clientId,
            client,
            Utils: getUtils(),
            extras: { isFarmworker: client.isFarmworker }
        });

        await displayHouseholdMembers();
        await displaySNAPHouseholds();
        await displayLIHEAPHouseholds();
    }

    try {
        await initialize();
    } catch (err) {
        console.error('Eligibility init error:', err);
    } finally {
        if (typeof resolveEligibilityChecks === 'function') resolveEligibilityChecks();
        document.body.classList.add('loaded');
    }

    // ===== EXPOSE (back-compat) =====
    async function runOne(key, members) {
        const checker = window.BenefitRegistry.getByKey(key);
        if (!checker) return;
        return checker.run(members, {
            clientId, client, Utils: getUtils(),
            extras: { isFarmworker: client?.isFarmworker }
        });
    }

    window.eligibilityChecks = {
        loadHouseholdMembers,
        displayHouseholdMembers,
        displaySNAPHouseholds,
        displayLIHEAPHouseholds,
        async PACEEligibilityCheck(m)   { return runOne('PACE', m); },
        async LISEligibilityCheck(m)    { return runOne('LIS', m); },
        async MSPEligibilityCheck(m)    { return runOne('MSP', m); },
        async PTRREligibilityCheck(m)   { return runOne('PTRR', m); },
        async SNAPEligibilityCheck(m)   { return runOne('SNAP', m); },
        async LIHEAPEligibilityCheck(m) { return runOne('LIHEAP', m); }
    };
});