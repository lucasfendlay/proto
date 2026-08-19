// Page: estimationsstep.html
// UI/orchestration for the "edit" step. Eligibility logic is fully delegated to
// window.BenefitRegistry + renderer/benefits/*.js. This file only owns:
//   - page-specific display (flip cards, apply buttons, SNAP/LIHEAP cards)
//   - close/reopen flows for this page
//   - Save & Continue gating

function getUtils() {
    const Utils = window.EligibilityUtils;
    if (!Utils) console.error('EligibilityUtils not loaded before estimationsstep.js');
    return Utils || null;
}

// Signal to HTML that eligibility work is done
let resolveEligibilityChecks;
window.eligibilityChecksReady = new Promise(resolve => { resolveEligibilityChecks = resolve; });

document.addEventListener('DOMContentLoaded', async function () {

    if (!window.BenefitRegistry) {
        console.error('BenefitRegistry not loaded. Include benefitRegistry.js and benefits/*.js before estimationsstep.js');
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
        isLikelyEligible,
        getCardColors
    } = window.EligibilityUtils;

    // ===== STATE =====
    const clientId = getQueryParameter('id');
    let client = null;

    // Registry keys (source of truth)
    const REGISTRY_KEYS = () => window.BenefitRegistry.getAll().map(c => c.key);

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

    async function saveHouseholdMembers(members) {
        try {
            const r = await fetch('/save-household-members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, householdMembers: members })
            });
            return r.ok;
        } catch (e) { console.error('saveHouseholdMembers:', e); return false; }
    }

    async function addNoteToClient(cId, noteText) {
        const activeUser = sessionStorage.getItem('loggedInUser')?.trim() || 'Unknown User';
        try {
            await fetch('/add-note-to-client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: cId,
                    note: { text: noteText, timestamp: new Date().toLocaleString(), username: activeUser }
                })
            });
        } catch (e) { console.error('addNoteToClient:', e); }
    }

    async function renderNotesContainer() {
        if (typeof window.renderNotes === 'function') await window.renderNotes(clientId);
    }

    async function updateClientProgramStatus(cId, benefit, isOpen, closeReason = null) {
        try {
            const r = await fetch(`/get-client/${cId}`);
            if (!r.ok) throw new Error();
            const data = await r.json();
            const programStatus = data.programStatus || {};
            programStatus[benefit] = {
                screeningInProgress: isOpen,
                screeningCloseReason: isOpen ? null : closeReason
            };
            const u = await fetch('/update-client', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId: cId, clientData: { programStatus } })
            });
            return u.ok;
        } catch (e) { console.error('updateClientProgramStatus:', e); return false; }
    }

    // ===== FLIP CARD =====
    function setupFlipCard(container, { frontSelector, backSelector, hintSelector, backHintSelector, detailsSelector }) {
        const flipInner = container.querySelector('.benefit-flip-card-inner, .snap-flip-card-inner, .liheap-flip-card-inner');
        const frontSide = container.querySelector(frontSelector);
        const backSide = container.querySelector(backSelector);
        const frontHint = frontSide?.querySelector(hintSelector);
        const backHint = backSide?.querySelector(backHintSelector);
        if (!flipInner || !frontSide || !backSide) return;

        let isFlipped = false;
        function syncCardHeight() {
            flipInner.style.height = 'auto';
            frontSide.style.minHeight = '0';
            backSide.style.height = 'auto';
            const oP = backSide.style.position, oT = backSide.style.transform, oV = backSide.style.visibility;
            backSide.style.position = 'relative';
            backSide.style.transform = 'none';
            backSide.style.visibility = 'hidden';
            const fH = frontSide.scrollHeight, bH = backSide.scrollHeight;
            backSide.style.position = oP; backSide.style.transform = oT; backSide.style.visibility = oV;
            const max = Math.max(fH, bH);
            flipInner.style.height = `${max}px`;
            backSide.style.height = `${max}px`;
            frontSide.style.minHeight = `${max}px`;
        }
        function doFlip() {
            isFlipped = !isFlipped;
            syncCardHeight();
            flipInner.style.transform = isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)';
        }
        requestAnimationFrame(syncCardHeight);
        if (frontHint) frontHint.addEventListener('click', e => { e.stopPropagation(); doFlip(); });
        if (backHint)  backHint.addEventListener('click',  e => { e.stopPropagation(); doFlip(); });
        const detailsEl = frontSide.querySelector(detailsSelector || 'details');
        if (detailsEl) detailsEl.addEventListener('toggle', () => requestAnimationFrame(syncCardHeight));
    }

    // ===== SAVE & CONTINUE VISIBILITY =====
    async function updateSaveContinueButtonVisibility() {
        const members = await loadHouseholdMembers();
        const hasApplying = members.some(m =>
            Object.values(m).some(b => b?.application?.some(app => app.applying === true))
        );
        const btn = document.getElementById('save-continue');
        if (!btn) return;
        const prev = btn.style.display;
        btn.style.display = hasApplying ? 'block' : 'none';
        if (prev === 'block' && btn.style.display === 'none') location.reload();
    }

    // ===== AUTO-TERMINATE =====
    async function checkAndAutoTerminateScreening(members) {
        const cur = await fetchClient();
        if (!cur || cur.screeningInProgress !== true) return;

        const keys = REGISTRY_KEYS();
        const programStatus = cur.programStatus || {};

        const allClosed = keys.every(benefit => {
            if (programStatus[benefit]?.screeningInProgress === false) return true;
            const withBenefit = (members || []).filter(m => m[benefit] && !m[benefit].eligibility?.includes('Not Checked'));
            if (withBenefit.length === 0) return false;
            const skip = ['Not Checked','Not Enrolled in Medicare','Enrolled in Medicaid',
                'Age Criteria Not Met','No Formal Lease','Not Interested','Already Enrolled','Already Applied'];
            return withBenefit.every(m => {
                const b = m[benefit];
                if (!b) return true;
                if (b.eligibility?.some(e => skip.includes(e))) return true;
                return b.screeningInProgress === false;
            });
        });

        if (!allClosed) return;
        try {
            const r = await fetch('/update-client', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, clientData: { screeningInProgress: false } })
            });
            if (r.ok) {
                await renderNotesContainer();
                if (typeof loadScreeningButtons === 'function') loadScreeningButtons();
            }
        } catch (e) { console.error('auto-terminate:', e); }
    }

    // ===== REOPEN =====
    async function reopenBenefitScreening(benefit, memberIds, displayName) {
        try {
            const data = await fetchClient();
            const members = data?.householdMembers || [];
            for (const m of members) {
                if (memberIds.includes(String(m.householdMemberId)) && m[benefit]) {
                    m[benefit].screeningInProgress = true;
                    m[benefit].screeningCloseReason = null;
                }
            }
            if (!await saveHouseholdMembers(members)) return;

            // Household benefits also track state at client level
            const checker = window.BenefitRegistry.getByKey(benefit);
            const isHouseholdScoped = checker?.getModalEntries?.({ members, client: data, programStatus: {} })
                ?.some(e => e.isHousehold);
            if (isHouseholdScoped) await updateClientProgramStatus(clientId, benefit, true);

            await fetch('/update-client', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, clientData: { screeningInProgress: true } })
            });

            const note = isHouseholdScoped
                ? `<strong>${benefit} screening reopened.</strong>`
                : `<strong>${benefit} screening reopened for ${displayName}.</strong>`;
            await addNoteToClient(clientId, note);
            await renderNotesContainer();
            if (typeof loadScreeningButtons === 'function') loadScreeningButtons();

            await refreshAllDisplays();
        } catch (e) { console.error('reopenBenefitScreening:', e); }
    }

    // ===== HTML GENERATORS =====
    function generateFlipHintHtml(isEligible) {
        return `<div class="benefit-flip-hint" style="position:absolute;top:4px;right:8px;font-size:32px;color:#000;cursor:pointer;display:${isEligible ? 'block' : 'none'};">↻</div>`;
    }

    function generateBenefitApplyButton(benefit, memberId, bObj, isScreeningInProgress) {
        const shouldHide = bObj.eligibility?.some(e =>
            e.includes('Not') || e.toLowerCase().includes('needs') ||
            e.toLowerCase().includes('no') || e.toLowerCase().includes('already')
        );
        const isApplying = bObj.application?.some(app => app.applying);
        return `<button class="benefit-apply-button" data-benefit="${benefit}" data-member-id="${memberId}"
            style="display:${!isScreeningInProgress || shouldHide ? 'none' : 'block'};margin:0 auto">
            ${isApplying ? 'Stop Applying' : `Apply for ${benefit}`}</button>`;
    }

    function generateScreeningClosedBox(benefit, bObj, memberId, memberFullName) {
        if (!bObj || bObj.screeningInProgress !== false) return '';
        return `<div style="background-color:rgb(212,212,212);border:1px solid #000;padding:8px;border-radius:4px;margin:8px auto;text-align:center;width:100%;box-sizing:border-box;">
            <p style="margin:0 0 6px 0;"><strong>${benefit} Screening Closed</strong></p>
            <p style="margin:0 0 6px 0;font-size:12px;">Reason: ${bObj.screeningCloseReason || 'N/A'}</p>
            <button class="reopen-benefit-btn" data-benefit="${benefit}" data-member-ids="${memberId}" data-display-name="${memberFullName}"
                style="background-color:#007bff;color:white;border:none;border-radius:4px;padding:6px 14px;font-size:12px;cursor:pointer;transition:background-color .3s;"
                onmouseover="this.style.backgroundColor='#0056b3'" onmouseout="this.style.backgroundColor='#007bff'">
                Reopen ${benefit} Screening
            </button></div>`;
    }

    function getBenefitSpouseInfoHTML(benefit, member, allMembers) {
        if (benefit === 'PTRR') {
            const prev = member.previousSpouseId ? allMembers.find(m => m.householdMemberId === member.previousSpouseId) : null;
            if (!prev) return '';
            return `<p><strong>Previous Year Spouse:</strong> ${capitalizeFirstLetter(prev.firstName || 'N/A')} ${capitalizeFirstLetter(prev.lastName || '')}</p>`;
        }
        const rel = member.relationships?.find(r => r.relationship === 'spouse');
        if (!rel) return '';
        const spouse = allMembers.find(m => m.householdMemberId === rel.relatedMemberId);
        if (!spouse) return '';
        return `<p><strong>Spouse:</strong> ${capitalizeFirstLetter(spouse.firstName || 'N/A')} ${capitalizeFirstLetter(spouse.lastName || '')}</p>`;
    }

    function getBenefitMaritalStatusHTML(benefit, member) {
        const label = benefit === 'PTRR' ? 'Previous Year Marital Status' : 'Marital Status';
        const value = benefit === 'PTRR' ? (member.previousMaritalStatus || 'N/A') : (member.maritalStatus || 'N/A');
        return `<p><strong>${label}:</strong> ${capitalizeFirstLetter(value)}</p>`;
    }

    function generateBenefitFlipCard(benefit, member, isScreeningInProgress, allMembers = []) {
        const bObj = member[benefit];
        if (!bObj || bObj.eligibility?.includes('Not Checked')) return '';

        const eligArray = bObj.eligibility?.map(capitalizeFirstLetter) || [];
        const { bg: bgColor, border: borderColor } = getCardColors(bObj.eligibility);
        const eligible = isLikelyEligible(bObj.eligibility);

        const incomeLabel = benefit === 'PACE' ? 'Gross Adjusted Income' : 'Gross Income';
        const showAssets = ['LIS','MSP'].includes(benefit);
        const maritalHTML = getBenefitMaritalStatusHTML(benefit, member);
        const spouseHTML  = getBenefitSpouseInfoHTML(benefit, member, allMembers);

        return `
            <div class="benefit-flip-card" data-benefit="${benefit}" data-member-id="${member.householdMemberId}" style="perspective:1000px;width:100%;margin:8px auto;">
                <div class="benefit-flip-card-inner" style="position:relative;width:100%;transition:transform .6s cubic-bezier(.4,.2,.2,1);transform-style:preserve-3d;">
                    <div class="benefit-flip-card-front" style="backface-visibility:hidden;background-color:${bgColor};border:1px solid ${borderColor};border-radius:4px;padding:8px;position:relative;z-index:1;width:100%;box-sizing:border-box;">
                        ${generateFlipHintHtml(eligible)}
                        <details class="custom-details" style="background-color:${bgColor};border-radius:4px;padding:8px;width:100%;box-sizing:border-box;">
                            <summary style="display:flex;flex-direction:column;align-items:center;cursor:pointer;text-align:center;padding:8px;">
                                <br><strong>${benefit}</strong><br>
                                <span class="toggle-text" style="font-size:14px;margin-bottom:4px;"><i>Show Details</i></span>
                                <p>${eligArray.join(', ') || 'Not Available'}<br></p>
                            </summary>
                            <hr class="separator-bar">
                            ${maritalHTML}${spouseHTML}
                            <p><strong>${incomeLabel}:</strong> $${bObj.combinedIncome?.toFixed(2) || 'N/A'}</p>
                            ${showAssets ? `<p><strong>Combined Assets:</strong> $${bObj.combinedAssets?.toFixed(2) || 'N/A'}</p>` : ''}
                        </details>
                        ${generateBenefitApplyButton(benefit, member.householdMemberId, bObj, isScreeningInProgress)}
                    </div>
                    <div class="benefit-flip-card-back" style="backface-visibility:hidden;transform:rotateY(180deg);position:absolute;top:0;left:0;width:100%;box-sizing:border-box;background-color:${bgColor};border:1px solid ${borderColor};border-radius:4px;padding:8px;">
                        <div class="benefit-flip-hint benefit-flip-back-hint" style="position:absolute;top:4px;right:8px;font-size:32px;color:#000;cursor:pointer;display:${eligible ? 'block' : 'none'};">↻</div>
                        <br><strong>${benefit}</strong>
                        <hr class="separator-bar">
                        <p><em>ESTIMATED ELIGIBILITY SCRIPTING</em></p>
                        <br>
                        ${generateBenefitApplyButton(benefit, member.householdMemberId, bObj, isScreeningInProgress)}
                    </div>
                </div>
            </div>`;
    }

    // ===== APPLY BUTTON UPDATES =====
    async function updateMemberBenefits(members, benefit, newApplyingState, memberId = null) {
        let targetMemberIds = null;
        if (memberId && benefit === 'PTRR') {
            targetMemberIds = new Set([String(memberId)]);
            const primary = members.find(m => String(m.householdMemberId) === String(memberId));
            if (primary?.previousSpouseId) targetMemberIds.add(String(primary.previousSpouseId));
            members.forEach(m => {
                if (m.previousSpouseId && String(m.previousSpouseId) === String(memberId)) {
                    targetMemberIds.add(String(m.householdMemberId));
                }
            });
        }

        for (const m of members) {
            if (targetMemberIds) {
                if (!targetMemberIds.has(String(m.householdMemberId))) continue;
            } else if (memberId && String(m.householdMemberId) !== String(memberId)) {
                continue;
            }
            if (benefit === 'SNAP' && m.meals?.toLowerCase() !== 'yes') continue;
            if (benefit === 'LIHEAP' && (m.deceased ?? '').toLowerCase() === 'yes') continue;

            if (targetMemberIds && !m[benefit]) m[benefit] = { eligibility: [], application: [] };
            const bObj = m[benefit];
            if (!bObj) continue;
            if (!bObj.application) bObj.application = [];

            if (newApplyingState) {
                if (!bObj.application.some(a => a.applying === true)) {
                    bObj.application.push({ applying: true, date: new Date().toISOString() });
                }
            } else {
                bObj.application = bObj.application.filter(a => !a.applying);
            }
        }
        await saveHouseholdMembers(members);
    }

    function attachBenefitButtonListeners() {
        document.querySelectorAll('.benefit-apply-button').forEach(btn => {
            if (btn.dataset.listenerAttached === 'true') return;
            btn.dataset.listenerAttached = 'true';
            btn.addEventListener('click', async e => {
                e.stopPropagation();
                if (btn.dataset.processing === 'true') return;
                btn.dataset.processing = 'true';

                const benefit = btn.dataset.benefit;
                const memberId = btn.dataset.memberId;
                const newState = btn.textContent.trim().startsWith('Apply');
                const fresh = await loadHouseholdMembers();

                if (benefit === 'SNAP') {
                    await updateMemberBenefits(fresh, 'SNAP', newState);
                    await displaySNAPHouseholds();
                } else if (benefit === 'LIHEAP') {
                    await updateMemberBenefits(fresh, 'LIHEAP', newState);
                    await displayLIHEAPHouseholds();
                } else if (memberId) {
                    await updateMemberBenefits(fresh, benefit, newState, memberId);
                    await displayHouseholdMembers();
                }
                await updateSaveContinueButtonVisibility();
                btn.dataset.processing = 'false';
            });
        });
    }

    function attachReopenBenefitListeners() {
        document.querySelectorAll('.reopen-benefit-btn').forEach(btn => {
            btn.addEventListener('click', async e => {
                const benefit = e.target.dataset.benefit;
                const memberIds = e.target.dataset.memberIds.split(',');
                const displayName = e.target.dataset.displayName;
                await reopenBenefitScreening(benefit, memberIds, displayName);
            });
        });
    }

    function attachCloseMemberScreeningListeners() {
        document.querySelectorAll('.btn-close-member-screening').forEach(btn => {
            btn.addEventListener('click', async () => {
                const memberId = btn.dataset.memberId;
                const fresh = await loadHouseholdMembers();
                openCloseMemberModal(clientId, fresh, memberId, null, null);
            });
        });
    }

    // ===== DISPLAY: PER-MEMBER =====
    async function displayHouseholdMembers() {
        const container = document.getElementById('household-members-container');
        const members = await loadHouseholdMembers();

        let isScreeningInProgress = false;
        try {
            const cr = await fetch(`/get-client/${clientId}`);
            if (cr.ok) isScreeningInProgress = (await cr.json()).screeningInProgress === true;
        } catch (e) { console.error(e); }

        container.innerHTML = '';
        if (members.length === 0) {
            const p = document.createElement('p');
            p.textContent = 'No household members found.';
            container.appendChild(p);
            return;
        }

        // sort: open first, then head of household, then oldest
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
        const parseAgeYears = s => {
            if (!s) return 0;
            const mt = s.match(/(\d+)\s*Years?/i);
            return mt ? parseInt(mt[1], 10) : 0;
        };
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
            const memberId = String(member.householdMemberId);
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
                    sections.push({ closed: true, html: generateScreeningClosedBox(benefit, bObj, memberId, memberFullName) });
                } else if (!bObj.eligibility?.includes('Not Checked')) {
                    const html = generateBenefitFlipCard(benefit, member, isScreeningInProgress, members);
                    if (html) sections.push({ closed: false, html });
                }
            });
            sections.sort((a, b) => a.closed - b.closed);

            const spouse = findSpouse(member, members);
            const spouseName = spouse ? `${capitalizeFirstLetter(spouse.firstName)} ${capitalizeFirstLetter(spouse.lastName)}` : null;

            div.innerHTML = `
                <div class="member-badge-area" style="min-height:40px;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">
                    ${member.headOfHousehold ? `<p class="household-member-info" style="color:black;border:2px solid black;padding:5px;display:inline-block;margin:0;"><strong>Head of Household</strong></p>` : ''}
                    ${isDeceased ? `<p class="household-member-info" style="color:black;border:2px solid black;padding:5px;display:inline-block;margin:0;"><strong>Deceased</strong></p>` : ''}
                </div>
                <h3>${memberFullName}${member.middleInitial ? ` ${capitalizeFirstLetter(member.middleInitial)}` : ''}</h3>
                <p><strong>Age:</strong> ${member.age?.split('Y')[0] || 'N/A'}</p>
                <p><strong>Marital Status:</strong> ${capitalizeFirstLetter(member.maritalStatus || 'N/A')}</p>
                ${spouseName ? `<p><strong>Spouse:</strong> ${spouseName}</p>` : ''}
                <br>
                <button class="btn-close-member-screening" data-member-id="${memberId}"
                    style="display:${isScreeningInProgress ? 'inline-block' : 'none'};background-color:#dc3545;color:white;flex:none;border:none;border-radius:4px;padding:8px 16px;font-size:13px;cursor:pointer;transition:background-color .3s;"
                    onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Close Screening(s)</button>
                ${sections.map(s => s.html).join('')}`;
            container.appendChild(div);

            // flip-card init
            div.querySelectorAll('.benefit-flip-card').forEach(fc => {
                setupFlipCard(fc, {
                    frontSelector: '.benefit-flip-card-front',
                    backSelector: '.benefit-flip-card-back',
                    hintSelector: '.benefit-flip-hint',
                    backHintSelector: '.benefit-flip-back-hint',
                    detailsSelector: 'details'
                });
                const dEl = fc.querySelector('details.custom-details');
                if (dEl) dEl.addEventListener('toggle', () => {
                    const t = dEl.querySelector('.toggle-text');
                    if (t) t.innerHTML = dEl.open ? '<i>Hide Details</i>' : '<i>Show Details</i>';
                });
            });

            // clean up PTRR apply state if button is hidden
            const ptrrBtn = div.querySelector(`.benefit-apply-button[data-benefit="PTRR"][data-member-id="${memberId}"]`);
            if (ptrrBtn && ptrrBtn.style.display === 'none' && member.PTRR?.application) {
                member.PTRR.application = member.PTRR.application.filter(a => !a.applying);
            }
        });

        await saveHouseholdMembers(members);
        attachBenefitButtonListeners();
        attachCloseMemberScreeningListeners();
        attachReopenBenefitListeners();
        await checkAndAutoTerminateScreening(members);
    }

    // ===== DISPLAY: SNAP =====
    async function displaySNAPHouseholds() {
        const container = document.getElementById('snap-household-container');
        if (!container) return;

        const members = await loadHouseholdMembers();
        let isScreeningInProgress = false, clientData = null;
        try {
            const cr = await fetch(`/get-client/${clientId}`);
            if (cr.ok) { clientData = await cr.json(); isScreeningInProgress = clientData.screeningInProgress === true; }
        } catch (e) { console.error(e); }

        container.innerHTML = '';
        const snapMembers = members.filter(m => m.meals?.toLowerCase() === 'yes');
        const snapStatus = clientData?.programStatus?.SNAP;
        const screeningClosed = snapStatus?.screeningInProgress === false;

        if (screeningClosed) {
            const d = document.createElement('div');
            d.classList.add('household-member-box');
            d.style.backgroundColor = 'rgb(212,212,212)';
            d.style.borderColor = '#000';
            d.innerHTML = `
                <h3>SNAP HOUSEHOLD</h3>
                ${snapMembers.length ? `<p><strong>Members:</strong> ${snapMembers.map(m => `${capitalizeFirstLetter(m.firstName)} ${capitalizeFirstLetter(m.lastName)}`).join(', ')}</p>` : ''}
                <div style="padding:8px;border-radius:4px;margin:8px auto;text-align:center;width:100%;box-sizing:border-box;">
                    <p style="margin:0 0 6px 0;"><strong>SNAP Screening Closed</strong></p>
                    <p style="margin:0 0 6px 0;font-size:12px;">Reason: ${snapStatus?.screeningCloseReason || 'N/A'}</p>
                    <button class="reopen-snap-screening-btn" style="background-color:#007bff;color:white;border:none;border-radius:4px;padding:6px 14px;font-size:12px;cursor:pointer;">Reopen SNAP Screening</button>
                </div>`;
            container.appendChild(d);
            d.querySelector('.reopen-snap-screening-btn').addEventListener('click', async () => {
                await reopenBenefitScreening('SNAP', members.map(m => String(m.householdMemberId)), 'SNAP Household');
            });
            return;
        }

        const alreadyEnrolled = clientData?.snap === 'yes';
        const notInterested = clientData?.snap === 'notinterested';

        // build households
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
                d.style.backgroundColor = '#f8d7da'; d.style.borderColor = '#f5c6cb';
            } else {
                d.style.backgroundColor = '#fff3cd'; d.style.borderColor = '#ffc107';
            }
            d.style.width = '100%'; d.style.boxSizing = 'border-box';
            d.innerHTML = `
                <details class="custom-details">
                    <summary style="display:flex;flex-direction:column;align-items:center;cursor:pointer;text-align:center;padding:8px;">
                        <h3 style="margin:4px 0;">SNAP</h3>
                        <span class="toggle-text" style="font-size:14px;margin-bottom:4px;"><i>Show Details</i></span>
                    </summary>
                    ${alreadyEnrolled ? '<p>ALREADY ENROLLED</p>' : notInterested ? '<p>NOT INTERESTED</p>' : '<p>NO SNAP HOUSEHOLD MEMBERS FOUND.</p>'}
                </details>`;
            container.appendChild(d);
            const dEl = d.querySelector('details.custom-details');
            if (dEl) dEl.addEventListener('toggle', () => {
                const t = dEl.querySelector('.toggle-text');
                if (t) t.innerHTML = dEl.open ? '<i>Hide Details</i>' : '<i>Show Details</i>';
            });
            return;
        }

        snapHouseholds.forEach(h => container.appendChild(createSNAPHouseholdCard(h, isScreeningInProgress)));
    }

    function createSNAPHouseholdCard(household, isScreeningInProgress) {
        const snapMemberIds = household.map(m => String(m.householdMemberId));
        const snapMemberNames = household.map(m => `${capitalizeFirstLetter(m.firstName)} ${capitalizeFirstLetter(m.lastName)}`).join(', ');
        const snapData = household[0]?.SNAP || {};
        const closed = snapData.screeningInProgress === false;
        const div = document.createElement('div');

        if (closed) {
            div.classList.add('household-member-box');
            div.innerHTML = `
                <h3>SNAP HOUSEHOLD</h3>
                <p><strong>Members:</strong> ${snapMemberNames}</p>
                <div style="background-color:rgb(212,212,212);border:1px solid #000;padding:8px;border-radius:4px;margin:8px auto;text-align:center;width:100%;box-sizing:border-box;">
                    <p style="margin:0 0 6px 0;"><strong>SNAP Screening Closed</strong></p>
                    <p style="margin:0 0 6px 0;font-size:12px;">Reason: ${snapData.screeningCloseReason || 'N/A'}</p>
                    <button class="reopen-benefit-btn" data-benefit="SNAP" data-member-ids="${snapMemberIds.join(',')}" data-display-name="SNAP Household"
                        style="background-color:#007bff;color:white;border:none;border-radius:4px;padding:6px 14px;font-size:12px;cursor:pointer;">Reopen SNAP Screening</button>
                </div>`;
            div.querySelector('.reopen-benefit-btn')?.addEventListener('click', async () => {
                await reopenBenefitScreening('SNAP', snapMemberIds, 'SNAP Household');
            });
            return div;
        }

        const eligibility = snapData.eligibility?.map(capitalizeFirstLetter) || ['Not Available'];
        const { bg, border } = getCardColors(snapData.eligibility);
        const likely = isLikelyEligible(snapData.eligibility);
        const notElig = isNotEligible(snapData.eligibility);
        const ineligibilityReason = notElig ? (snapData.eligibility?.find(e => isNotEligible([e])) || '') : '';
        const amount = snapData.benefitAmount || 0;
        const expedited = snapData.expeditedEligibility || 'N/A';

        div.classList.add('snap-flip-card');
        div.style.cssText = 'perspective:1000px;width:100%;margin-bottom:16px;';
        div.innerHTML = `
            <div class="snap-flip-card-inner" style="position:relative;width:100%;transition:transform .6s cubic-bezier(.4,.2,.2,1);transform-style:preserve-3d;">
                <div class="snap-flip-card-front household-member-box" style="backface-visibility:hidden;background-color:${bg};border-color:${border};position:relative;z-index:1;">
                    <div class="snap-flip-hint" style="position:absolute;top:8px;right:12px;font-size:44px;color:#000;cursor:pointer;display:${likely ? 'block' : 'none'};">↻</div>
                    <details class="custom-details" style="background-color:${bg};border-radius:4px;padding:8px;margin:8px auto;width:100%;box-sizing:border-box;">
                        <summary style="display:flex;flex-direction:column;align-items:center;cursor:pointer;text-align:center;padding:8px;">
                            <br><strong>SNAP</strong><br>
                            <span class="toggle-text" style="font-size:14px;margin-bottom:4px;"><i>Show Details</i></span>
                            <p><strong>Members:</strong> ${snapMemberNames}</p>
                            <p><strong>Eligibility:</strong> ${eligibility.join(', ')}</p>
                            ${likely && amount >= 0 ? `
                                <p><strong>Estimated Benefit Amount:</strong> ${amount <= 24 ? 'Up to $24.00' : `Up to $24.00 - $${amount.toFixed(2)}`}</p>
                                <p><strong>Expedited Eligibility:</strong> ${expedited}</p>
                            ` : ''}
                        </summary>
                        <hr class="separator-bar">
                        <p><strong>SNAP Household Size:</strong> ${snapData.householdSize || household.length}</p>
                        <p><strong>Total Gross Income:</strong> $${(snapData.combinedMonthlyIncome || 0).toFixed(2)}</p>
                        <p><strong>Standard Deduction:</strong> $${(snapData.standardDeduction || 0).toFixed(2)}</p>
                        <p><strong>Shelter Deduction:</strong> $${(snapData.excessShelterCost || 0).toFixed(2)}</p>
                        <p><strong>Utility Allowance:</strong> $${(snapData.totalUtilityAllowance || 0).toFixed(2)}</p>
                        <p><strong>Medical Expense Deductions:</strong> $${(snapData.totalMedicalExpenses || 0).toFixed(2)}</p>
                        <p><strong>Other Expense Deductions:</strong> $${(snapData.totalOtherExpenses || 0).toFixed(2)}</p>
                        <p><strong>Adjusted Net Income:</strong> $${(snapData.totalNetIncome || 0).toFixed(2)}</p>
                        <p><strong>Combined Assets:</strong> $${(snapData.combinedAssets || 0).toFixed(2)}</p>
                    </details>
                    <button class="benefit-apply-button" data-benefit="SNAP" style="display:${isScreeningInProgress && likely ? 'block' : 'none'};margin:0 auto;">
                        ${household.every(m => m.SNAP?.application?.some(a => a.applying)) ? 'Stop Applying' : 'Apply for SNAP'}
                    </button>
                    <button class="close-benefit-btn" data-benefit="SNAP" data-member-ids="${snapMemberIds.join(',')}" data-is-not-eligible="${notElig ? 'true' : 'false'}" data-ineligibility-reason="${ineligibilityReason}"
                        style="display:${isScreeningInProgress ? 'inline-block' : 'none'};background-color:#dc3545;color:white;border:none;border-radius:4px;padding:8px 16px;font-size:13px;cursor:pointer;margin:8px auto;"
                        onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Close Screening(s)</button>
                </div>
                <div class="snap-flip-card-back household-member-box" style="backface-visibility:hidden;transform:rotateY(180deg);position:absolute;top:0;left:0;width:100%;box-sizing:border-box;background-color:${bg};border-color:${border};">
                    <div class="snap-flip-hint snap-flip-back-hint" style="position:absolute;top:8px;right:12px;font-size:44px;color:#000;cursor:pointer;display:${likely ? 'block' : 'none'};">↻</div>
                    <h3>SNAP HOUSEHOLD</h3>
                    <hr class="separator-bar">
                    <p><em>${amount <= 24
                        ? `Your household looks likely eligible for the Supplemental Nutrition Assistance Program (SNAP) benefits. If approved, you'll receive an EBT card loaded with your benefit amount each month, which you can use at any participating grocery stores and farmers markets to buy eligible food items.`
                        : `Your household looks likely eligible for up to $${amount.toFixed(2)} per month in Supplemental Nutrition Assistance Program (SNAP) benefits. If approved, you would receive an EBT card loaded with your benefit amount each month, which you can use at any participating grocery stores and farmers markets to buy eligible food items.`}</em></p>
                    ${expedited?.toLowerCase().startsWith('yes') ? `<p><em>In addition, your household may also qualify for expedited SNAP processing. This means your application could be processed within 7 days instead of the standard 30-day timeline, so you can start receiving benefits sooner.</em></p>` : ''}
                    <br>
                    <button class="benefit-apply-button" data-benefit="SNAP" style="display:${likely ? 'block' : 'none'};margin:0 auto;">
                        ${household.every(m => m.SNAP?.application?.some(a => a.applying)) ? 'Stop Applying' : 'Apply for SNAP'}
                    </button>
                    <button class="close-benefit-btn" data-benefit="SNAP" data-member-ids="${snapMemberIds.join(',')}" data-is-not-eligible="${notElig ? 'true' : 'false'}" data-ineligibility-reason="${ineligibilityReason}"
                        style="display:inline-block;background-color:#dc3545;color:white;border:none;border-radius:4px;padding:8px 16px;font-size:13px;cursor:pointer;margin:8px auto;"
                        onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Close Screening(s)</button>
                </div>
            </div>`;

        setupFlipCard(div, {
            frontSelector: '.snap-flip-card-front',
            backSelector: '.snap-flip-card-back',
            hintSelector: '.snap-flip-hint',
            backHintSelector: '.snap-flip-back-hint',
            detailsSelector: 'details'
        });
        const dEl = div.querySelector('details.custom-details');
        if (dEl) dEl.addEventListener('toggle', () => {
            const t = dEl.querySelector('.toggle-text');
            if (t) t.innerHTML = dEl.open ? '<i>Hide Details</i>' : '<i>Show Details</i>';
        });

        div.querySelectorAll('.benefit-apply-button').forEach(btn => {
            btn.addEventListener('click', async e => {
                const newState = e.target.textContent.trim().startsWith('Apply');
                const fresh = await loadHouseholdMembers();
                await updateMemberBenefits(fresh, 'SNAP', newState);
                await displaySNAPHouseholds();
                await updateSaveContinueButtonVisibility();
            });
        });
        div.querySelectorAll('.close-benefit-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const fresh = await loadHouseholdMembers();
                openCloseMemberModal(clientId, fresh, null, null, 'SNAP');
            });
        });

        return div;
    }

    // ===== DISPLAY: LIHEAP =====
    async function displayLIHEAPHouseholds() {
        const container = document.getElementById('liheap-household-container');
        if (!container) return;
        const members = await loadHouseholdMembers();

        let isScreeningInProgress = false, clientData = null;
        try {
            const cr = await fetch(`/get-client/${clientId}`);
            if (cr.ok) { clientData = await cr.json(); isScreeningInProgress = clientData.screeningInProgress === true; }
        } catch (e) { console.error(e); }

        container.innerHTML = '';
        const active = members.filter(m => (m.deceased ?? '').toLowerCase() !== 'yes');
        const memberIds = active.map(m => String(m.householdMemberId));
        const memberNames = active.map(m => `${capitalizeFirstLetter(m.firstName)} ${capitalizeFirstLetter(m.lastName)}`).join(', ');

        const status = clientData?.programStatus?.LIHEAP;
        if (status?.screeningInProgress === false) {
            const d = document.createElement('div');
            d.classList.add('household-member-box');
            d.style.backgroundColor = 'rgb(212,212,212)';
            d.style.borderColor = '#000';
            d.innerHTML = `
                <h3>LIHEAP HOUSEHOLD</h3>
                <div style="padding:8px;border-radius:4px;margin:8px auto;text-align:center;width:100%;box-sizing:border-box;">
                    <p style="margin:0 0 6px 0;"><strong>LIHEAP Screening Closed</strong></p>
                    <p style="margin:0 0 6px 0;font-size:12px;">Reason: ${status?.screeningCloseReason || 'N/A'}</p>
                    <button class="reopen-liheap-btn" style="background-color:#007bff;color:white;border:none;border-radius:4px;padding:6px 14px;font-size:12px;cursor:pointer;">Reopen LIHEAP Screening</button>
                </div>`;
            container.appendChild(d);
            d.querySelector('.reopen-liheap-btn').addEventListener('click', async () => {
                await reopenBenefitScreening('LIHEAP', memberIds, 'LIHEAP Household');
            });
            return;
        }

        const alreadyEnrolled = client?.liheapEnrollment === 'yes' && client?.heatingCrisis === 'no';
        const notInterested = client?.liheapEnrollment === 'notinterested';
        if (alreadyEnrolled || notInterested) {
            const d = document.createElement('div');
            d.classList.add('household-member-box');
            d.style.backgroundColor = '#f8d7da'; d.style.borderColor = '#f5c6cb';
            d.style.width = '100%'; d.style.boxSizing = 'border-box';
            d.innerHTML = `
                <h3>LIHEAP HOUSEHOLD</h3>
                <p>${alreadyEnrolled ? 'ALREADY ENROLLED' : 'NOT INTERESTED'}</p>
                <button class="btn-close-liheap-screening" style="display:${isScreeningInProgress ? 'inline-block' : 'none'};background-color:#dc3545;color:white;border:none;border-radius:4px;padding:8px 16px;font-size:13px;cursor:pointer;margin:8px auto;"
                    onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Close Screening(s)</button>`;
            container.appendChild(d);
            d.querySelector('.btn-close-liheap-screening').addEventListener('click', () => {
                openCloseMemberModal(clientId, members, null, null, 'LIHEAP');
            });
            return;
        }

        if (active.length === 0) {
            const d = document.createElement('div');
            d.classList.add('household-member-box');
            d.style.backgroundColor = '#fff3cd'; d.style.borderColor = '#ffc107';
            d.innerHTML = '<h3>LIHEAP HOUSEHOLD</h3><p>NO LIHEAP HOUSEHOLDS FOUND.</p>';
            container.appendChild(d);
            return;
        }

        const data = active[0]?.LIHEAP || {};
        container.appendChild(createLIHEAPHouseholdCard(active, memberIds, memberNames, data, isScreeningInProgress));
    }

    function createLIHEAPHouseholdCard(active, memberIds, memberNames, data, isScreeningInProgress) {
        const eligibility = data.eligibility?.map(capitalizeFirstLetter) || ['Not Available'];
        const combined = data.combinedMonthlyIncome || 0;
        const medDed = data.totalMedicarePremiumDeduction || 0;
        const gross = combined + medDed;

        const notElig = eligibility.some(i => (i.includes('NOT') || i.includes('ALREADY ENROLLED') || i.includes('NOT INTERESTED')) && !i.includes('RECOMMENDED'));
        const needs = eligibility.some(i => i.includes('NEEDS'));
        const likely = !notElig && !needs;
        const ineligibilityReason = notElig ? (data.eligibility?.find(e => {
            const u = (e || '').toUpperCase();
            return (u.includes('NOT') || u.includes('ALREADY')) && !u.includes('RECOMMENDED');
        }) || '') : '';

        const { bg, border } = notElig ? { bg: '#f8d7da', border: '#f5c6cb' }
            : needs ? { bg: '#fff3cd', border: '#ffc107' }
            : { bg: '#d4edda', border: '#c3e6cb' };

        const div = document.createElement('div');
        div.classList.add('liheap-flip-card');
        div.style.cssText = 'perspective:1000px;width:100%;margin-bottom:16px;';
        div.innerHTML = `
            <div class="liheap-flip-card-inner" style="position:relative;width:100%;transition:transform .6s cubic-bezier(.4,.2,.2,1);transform-style:preserve-3d;">
                <div class="liheap-flip-card-front household-member-box" style="backface-visibility:hidden;background-color:${bg};border-color:${border};position:relative;z-index:1;">
                    <div class="liheap-flip-hint" style="position:absolute;top:8px;right:12px;font-size:44px;color:#000;cursor:pointer;display:${likely ? 'block' : 'none'};">↻</div>
                    <details class="custom-details" style="background-color:${bg};border-radius:4px;padding:8px;margin:8px auto;width:100%;box-sizing:border-box;">
                        <summary style="display:flex;flex-direction:column;align-items:center;cursor:pointer;text-align:center;padding:8px;">
                            <br><strong>LIHEAP</strong><br>
                            <span class="toggle-text" style="font-size:14px;margin-bottom:4px;"><i>Show Details</i></span>
                            <p><strong>Members:</strong> ${memberNames}</p>
                            <p><strong>Eligibility:</strong> ${eligibility.join(', ')}</p>
                        </summary>
                        <hr class="separator-bar">
                        <p><strong>LIHEAP Household Size:</strong> ${active.length}</p>
                        <p><strong>Total Gross Income:</strong> $${gross.toFixed(2)}</p>
                        <p><strong>Medicare Premium Deductions:</strong> $${medDed.toFixed(2)}</p>
                        <p><strong>Adjusted Gross Income:</strong> $${combined.toFixed(2)}</p>
                    </details>
                    <button class="benefit-apply-button" data-benefit="LIHEAP" style="display:${likely ? 'block' : 'none'};margin:0 auto;">
                        ${active.every(m => m.LIHEAP?.application?.some(a => a.applying)) ? 'Stop Applying' : 'Apply for LIHEAP'}
                    </button>
                    <button class="close-liheap-btn" data-member-ids="${memberIds.join(',')}" data-is-not-eligible="${notElig ? 'true' : 'false'}" data-ineligibility-reason="${ineligibilityReason}"
                        style="display:${isScreeningInProgress ? 'inline-block' : 'none'};background-color:#dc3545;color:white;border:none;border-radius:4px;padding:8px 16px;font-size:13px;cursor:pointer;margin:8px auto;"
                        onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Close Screening(s)</button>
                </div>
                <div class="liheap-flip-card-back household-member-box" style="backface-visibility:hidden;transform:rotateY(180deg);position:absolute;top:0;left:0;width:100%;box-sizing:border-box;background-color:${bg};border-color:${border};">
                    <div class="liheap-flip-hint liheap-flip-back-hint" style="position:absolute;top:8px;right:12px;font-size:44px;color:#000;cursor:pointer;display:${likely ? 'block' : 'none'};">↻</div>
                    <h3>LIHEAP HOUSEHOLD</h3>
                    <hr class="separator-bar">
                    <p><em>ESTIMATED ELIGIBILITY SCRIPTING</em></p>
                    <br>
                    <button class="benefit-apply-button" data-benefit="LIHEAP" style="display:${likely ? 'block' : 'none'};margin:0 auto;">
                        ${active.every(m => m.LIHEAP?.application?.some(a => a.applying)) ? 'Stop Applying' : 'Apply for LIHEAP'}
                    </button>
                    <button class="close-liheap-btn" data-member-ids="${memberIds.join(',')}" data-is-not-eligible="${notElig ? 'true' : 'false'}" data-ineligibility-reason="${ineligibilityReason}"
                        style="display:${isScreeningInProgress ? 'inline-block' : 'none'};background-color:#dc3545;color:white;border:none;border-radius:4px;padding:8px 16px;font-size:13px;cursor:pointer;margin:8px auto;"
                        onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Close Screening(s)</button>
                </div>
            </div>`;

        setupFlipCard(div, {
            frontSelector: '.liheap-flip-card-front',
            backSelector: '.liheap-flip-card-back',
            hintSelector: '.liheap-flip-hint',
            backHintSelector: '.liheap-flip-back-hint',
            detailsSelector: 'details'
        });
        const dEl = div.querySelector('details.custom-details');
        if (dEl) dEl.addEventListener('toggle', () => {
            const t = dEl.querySelector('.toggle-text');
            if (t) t.innerHTML = dEl.open ? '<i>Hide Details</i>' : '<i>Show Details</i>';
        });
        div.querySelectorAll('.benefit-apply-button').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.stopPropagation();
                if (btn.dataset.processing === 'true') return;
                btn.dataset.processing = 'true';
                const newState = e.target.textContent.trim().startsWith('Apply');
                const fresh = await loadHouseholdMembers();
                await updateMemberBenefits(fresh, 'LIHEAP', newState);
                await displayLIHEAPHouseholds();
                await updateSaveContinueButtonVisibility();
                btn.dataset.processing = 'false';
            });
        });
        div.querySelectorAll('.close-liheap-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const fresh = await loadHouseholdMembers();
                openCloseMemberModal(clientId, fresh, null, null, 'LIHEAP');
            });
        });
        return div;
    }

    // ===== CLOSE SCREENING MODAL (registry-driven) =====
    function createCloseMemberModal() {
        if (document.getElementById('close-member-modal')) return;
        const overlay = document.createElement('div');
        overlay.id = 'close-member-modal';
        overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;justify-content:center;align-items:center;';
        overlay.innerHTML = `
            <div style="background:white;padding:24px;border-radius:8px;min-width:380px;max-width:520px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 4px 20px rgba(0,0,0,0.3);">
                <h3 id="close-member-modal-title" style="margin-top:0;flex-shrink:0;">Close Screening</h3>
                <div id="close-member-benefits-checkboxes" style="margin:12px 0;overflow-y:auto;flex:1;max-height:50vh;padding-right:8px;"></div>
                <div style="flex-shrink:0;">
                    <label for="close-member-reason-select"><strong>Select a reason:</strong></label>
                    <select id="close-member-reason-select" style="width:100%;padding:8px;margin:12px 0;font-size:14px;"><option value="">-- Select a reason --</option></select>
                    <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;">
                        <button id="close-member-cancel-btn" style="padding:8px 16px;cursor:pointer;">Cancel</button>
                        <button id="close-member-confirm-btn" style="padding:8px 16px;background:#dc3545;color:white;border:none;border-radius:4px;cursor:pointer;transition:background-color .3s;"
                            onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Confirm Close</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        document.getElementById('close-member-cancel-btn').addEventListener('click', () => overlay.style.display = 'none');
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
    }

    // Registry-driven reason intersection
    function getCloseReasonsForBenefits(selectedBenefits) {
        if (selectedBenefits.length === 0) return [];
        const perBenefit = selectedBenefits.map(k => window.BenefitRegistry.getByKey(k)?.closeReasons || []);
        if (perBenefit.length === 1) return perBenefit[0];
        const sets = perBenefit.map(list => new Set(list.map(r => r.value)));
        const shared = [...sets[0]].filter(v => sets.every(s => s.has(v)));
        const first = perBenefit[0];
        return shared.map(v => first.find(r => r.value === v) || { value: v, label: v });
    }

    function mapHardDeterminationReason(benefitKey, ineligibilityReason) {
        const checker = window.BenefitRegistry.getByKey(benefitKey);
        if (checker?.mapHardDetermination) return checker.mapHardDetermination(ineligibilityReason);
        return ineligibilityReason || 'Ineligible - Hard Determination';
    }

    function updateReasonDropdown(selectedBenefits) {
        const select = document.getElementById('close-member-reason-select');
        if (!select) return;
        const reasons = getCloseReasonsForBenefits(selectedBenefits);
        const container = document.getElementById('close-member-benefits-checkboxes');
        const selectedTiles = container ? Array.from(container.querySelectorAll('.close-member-benefit-tile[data-selected="true"]')) : [];
        const allRed = selectedTiles.length > 0 && selectedTiles.every(t => t.dataset.isNotEligible === 'true');

        select.innerHTML = '<option value="">-- Select a reason --</option>';
        reasons.forEach(r => {
            if (r.value === 'Hard Determination' && !allRed) return;
            const opt = document.createElement('option');
            opt.value = r.value; opt.textContent = r.label;
            select.appendChild(opt);
        });
    }

    function createBenefitTile(entry, container, isHousehold) {
        const tile = document.createElement('div');
        tile.className = 'close-member-benefit-tile';
        tile.dataset.benefit = entry.benefit;
        tile.dataset.memberId = isHousehold ? 'HOUSEHOLD' : entry.memberId;
        tile.dataset.selected = 'false';
        tile.dataset.isNotEligible = entry.isNotEligible ? 'true' : 'false';
        tile.dataset.ineligibilityReason = entry.ineligibilityReason || '';
        tile.dataset.isHousehold = isHousehold ? 'true' : 'false';
        tile.textContent = entry.benefit;
        tile.style.cssText = 'display:block;padding:10px 16px;margin:6px 0;border:2px solid #ccc;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500;color:#333;background-color:#f9f9f9;transition:all .2s ease;user-select:none;';

        const idle = () => {
            if (entry.isNotEligible) { tile.style.borderColor = '#f5c6cb'; tile.style.backgroundColor = '#f8d7da'; tile.style.color = '#721c24'; }
            else { tile.style.borderColor = '#ccc'; tile.style.backgroundColor = '#f9f9f9'; tile.style.color = '#333'; }
        };
        const chosen = () => { tile.style.borderColor = 'black'; tile.style.backgroundColor = '#007bff'; tile.style.color = 'white'; };
        if (entry.isNotEligible) idle();

        tile.addEventListener('mouseover', () => {
            if (tile.dataset.selected !== 'false') return;
            if (entry.isNotEligible) { tile.style.borderColor = '#c82333'; tile.style.backgroundColor = '#f1b0b7'; }
            else { tile.style.borderColor = '#337ab7'; tile.style.backgroundColor = '#e8f0fe'; }
        });
        tile.addEventListener('mouseout', () => { if (tile.dataset.selected === 'false') idle(); });
        tile.addEventListener('click', () => {
            tile.dataset.selected = tile.dataset.selected === 'true' ? 'false' : 'true';
            if (tile.dataset.selected === 'true') chosen(); else idle();
            const names = Array.from(container.querySelectorAll('.close-member-benefit-tile[data-selected="true"]')).map(t => t.dataset.benefit);
            updateReasonDropdown([...new Set(names)]);
        });
        return tile;
    }

    async function openCloseMemberModal(cId, allMembers, memberId = null, _openBenefits = null, preSelectBenefit = null) {
        createCloseMemberModal();
        const modal = document.getElementById('close-member-modal');
        const checkboxContainer = document.getElementById('close-member-benefits-checkboxes');
        const select = document.getElementById('close-member-reason-select');
        const confirmBtn = document.getElementById('close-member-confirm-btn');
        document.getElementById('close-member-modal-title').textContent = 'Close Screening(s)';

        const freshClient = await fetchClient();
        const programStatus = freshClient?.programStatus || {};

        // ---- Gather entries from registry ----
        const entries = [];
        for (const checker of window.BenefitRegistry.getAll()) {
            if (typeof checker.getModalEntries !== 'function') continue;
            const list = checker.getModalEntries({ members: allMembers, client: freshClient, programStatus }) || [];
            entries.push(...list);
        }

        // Optional narrow: when a specific memberId was passed, hide unrelated individual entries
        const filtered = memberId
            ? entries.filter(e => e.isHousehold || String(e.memberId) === String(memberId))
            : entries;

        const householdEntries = filtered.filter(e => e.isHousehold);
        const individualEntries = filtered.filter(e => !e.isHousehold);
        const groupedByMember = {};
        individualEntries.forEach(e => {
            if (!groupedByMember[e.memberId]) groupedByMember[e.memberId] = { memberName: e.memberName, benefits: [] };
            groupedByMember[e.memberId].benefits.push({
                benefit: e.benefit, isNotEligible: e.isNotEligible, ineligibilityReason: e.ineligibilityReason
            });
        });

        checkboxContainer.innerHTML = '<p style="margin-bottom:10px;"><strong>Select benefits to close:</strong></p>';

        // Select/Deselect all
        const controls = document.createElement('div');
        controls.style.cssText = 'margin-bottom:12px;padding:8px 0;border-bottom:1px solid #ddd;';
        const mkBtn = (label, bg) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = `padding:6px 14px;background-color:${bg};color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;margin-right:8px;transition:background-color .3s;`;
            return b;
        };
        const selectAllBtn = mkBtn('Select All', '#007bff');
        const deselectAllBtn = mkBtn('Deselect All', '#6c757d');
        const toggleAll = sel => {
            checkboxContainer.querySelectorAll('.close-member-benefit-tile').forEach(tile => {
                const isNot = tile.dataset.isNotEligible === 'true';
                tile.dataset.selected = sel ? 'true' : 'false';
                if (sel) { tile.style.borderColor = 'black'; tile.style.backgroundColor = '#007bff'; tile.style.color = 'white'; }
                else if (isNot) { tile.style.borderColor = '#f5c6cb'; tile.style.backgroundColor = '#f8d7da'; tile.style.color = '#721c24'; }
                else { tile.style.borderColor = '#ccc'; tile.style.backgroundColor = '#f9f9f9'; tile.style.color = '#333'; }
            });
            updateReasonDropdown(sel ? [...new Set(filtered.map(e => e.benefit))] : []);
        };
        selectAllBtn.addEventListener('click', () => toggleAll(true));
        deselectAllBtn.addEventListener('click', () => toggleAll(false));
        controls.appendChild(selectAllBtn); controls.appendChild(deselectAllBtn);
        checkboxContainer.appendChild(controls);

        if (householdEntries.length) {
            const h = document.createElement('p');
            h.style.cssText = 'margin:12px 0 4px 0;font-weight:700;font-size:15px;color:#333;border-bottom:2px solid #007bff;padding-bottom:4px;';
            h.textContent = '🏠 Household Benefits';
            checkboxContainer.appendChild(h);
            householdEntries.forEach(e => checkboxContainer.appendChild(createBenefitTile(e, checkboxContainer, true)));
        }

        if (Object.keys(groupedByMember).length) {
            const h = document.createElement('p');
            h.style.cssText = 'margin:16px 0 4px 0;font-weight:700;font-size:15px;color:#333;border-bottom:2px solid #28a745;padding-bottom:4px;';
            h.textContent = '👤 Individual Benefits';
            checkboxContainer.appendChild(h);
            Object.entries(groupedByMember).forEach(([mId, g]) => {
                const header = document.createElement('p');
                header.style.cssText = 'margin:12px 0 4px 0;font-weight:600;font-size:14px;color:#555;';
                header.textContent = g.memberName;
                checkboxContainer.appendChild(header);
                g.benefits.forEach(b => checkboxContainer.appendChild(createBenefitTile({ ...b, memberId: mId }, checkboxContainer, false)));
            });
        }

        // Pre-select
        if (preSelectBenefit) {
            checkboxContainer.querySelectorAll(`.close-member-benefit-tile[data-benefit="${preSelectBenefit}"]`).forEach(tile => {
                if (tile.dataset.isNotEligible === 'true') {
                    tile.dataset.selected = 'true';
                    tile.style.borderColor = 'black'; tile.style.backgroundColor = '#007bff'; tile.style.color = 'white';
                }
            });
        }

        // Auto-select all red
        if (filtered.some(e => e.isNotEligible)) {
            checkboxContainer.querySelectorAll('.close-member-benefit-tile').forEach(tile => {
                if (tile.dataset.isNotEligible === 'true') {
                    tile.dataset.selected = 'true';
                    tile.style.borderColor = 'black'; tile.style.backgroundColor = '#007bff'; tile.style.color = 'white';
                }
            });
            const names = Array.from(checkboxContainer.querySelectorAll('.close-member-benefit-tile[data-selected="true"]')).map(t => t.dataset.benefit);
            updateReasonDropdown([...new Set(names)]);
            if (Array.from(select.options).some(o => o.value === 'Hard Determination')) select.value = 'Hard Determination';
        } else {
            select.innerHTML = '<option value="">-- Select a reason --</option>';
        }

        modal.style.display = 'flex';

        const newConfirm = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
        newConfirm.addEventListener('click', async () => {
            const selectedTiles = Array.from(checkboxContainer.querySelectorAll('.close-member-benefit-tile[data-selected="true"]'));
            const reason = select.value;
            if (selectedTiles.length === 0) { alert('Please select at least one benefit to close.'); return; }
            if (!reason) { alert('Please select a reason.'); return; }

            try {
                const household = selectedTiles.filter(t => t.dataset.isHousehold === 'true');
                const individual = selectedTiles.filter(t => t.dataset.isHousehold === 'false');
                const noteLines = [];

                for (const tile of household) {
                    const benefit = tile.dataset.benefit;
                    const closeReason = reason === 'Hard Determination'
                        ? mapHardDeterminationReason(benefit, tile.dataset.ineligibilityReason || '')
                        : reason;
                    for (const m of allMembers) {
                        if (m[benefit]) { m[benefit].screeningInProgress = false; m[benefit].screeningCloseReason = closeReason; }
                    }
                    await updateClientProgramStatus(cId, benefit, false, closeReason);
                    noteLines.push(`<br><strong><u>${benefit}</u></strong><br><em>${closeReason}</em>`);
                }

                const byMember = {};
                individual.forEach(tile => {
                    const mId = tile.dataset.memberId;
                    if (!byMember[mId]) byMember[mId] = [];
                    byMember[mId].push({ benefit: tile.dataset.benefit, ineligibilityReason: tile.dataset.ineligibilityReason || '' });
                });
                for (const [mId, arr] of Object.entries(byMember)) {
                    const target = allMembers.find(m => String(m.householdMemberId) === String(mId));
                    if (!target) continue;
                    const memberName = `${capitalizeFirstLetter(target.firstName)} ${capitalizeFirstLetter(target.lastName)}`;
                    const lines = [];
                    for (const { benefit, ineligibilityReason } of arr) {
                        if (!target[benefit]) continue;
                        const closeReason = reason === 'Hard Determination'
                            ? mapHardDeterminationReason(benefit, ineligibilityReason)
                            : reason;
                        target[benefit].screeningInProgress = false;
                        target[benefit].screeningCloseReason = closeReason;
                        lines.push(`<strong>${benefit}</strong><br><em>${closeReason}</em><br>`);
                    }
                    noteLines.push(`<br><strong><u>${memberName}</u></strong><br> ${lines.join('<br>')}`);
                }

                if (!await saveHouseholdMembers(allMembers)) return;
                modal.style.display = 'none';
                await addNoteToClient(cId, `<strong>Screening(s) closed.</strong><br>${noteLines.join('<br>')}`);
                await renderNotesContainer();
                await refreshAllDisplays();
            } catch (err) { console.error('close-confirm:', err); }
        });
    }

    // ===== REFRESH =====
    async function refreshAllDisplays() {
        await displayHouseholdMembers();
        await displaySNAPHouseholds();
        await displayLIHEAPHouseholds();

        if (window.refreshCurrentEnrollments)   await window.refreshCurrentEnrollments();
        if (window.refreshIncome)               await window.refreshIncome();
        if (window.refreshFarmworkerVisibility) await window.refreshFarmworkerVisibility();
        if (window.refreshAssetDisplay)         await window.refreshAssetDisplay();
        if (window.refreshExpenseButtons)       await window.refreshExpenseButtons();

        const members = await loadHouseholdMembers();
        await checkAndAutoTerminateScreening(members);
    }

    // ===== INIT =====
    async function initialize() {
        await updateSaveContinueButtonVisibility();

        client = await fetchClient();
        if (!client) { console.error('Client data unavailable'); return; }

        const members = await loadHouseholdMembers();

        // Delegate ALL eligibility to registry
        if (client.screeningInProgress === true) {
            await window.BenefitRegistry.runAll(members, {
                clientId,
                client,
                Utils: getUtils(),
                extras: { isFarmworker: client.isFarmworker }
            });
        }

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

    // ===== EXPOSE (back-compat with HTML inline script) =====
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
        // Back-compat wrappers — now route through the registry
        async PACEEligibilityCheck(m)   { return runOne('PACE', m); },
        async LISEligibilityCheck(m)    { return runOne('LIS', m); },
        async MSPEligibilityCheck(m)    { return runOne('MSP', m); },
        async PTRREligibilityCheck(m)   { return runOne('PTRR', m); },
        async SNAPEligibilityCheck(m)   { return runOne('SNAP', m); },
        async LIHEAPEligibilityCheck(m) { return runOne('LIHEAP', m); }
    };

    window.openCloseMemberModal = openCloseMemberModal;
    window.reopenBenefitScreening = reopenBenefitScreening;
    window.refreshAllDisplays = refreshAllDisplays;

    // Optional: mirror estimations.js's event API for consistency
    window.refreshEligibility = async function () {
        const fresh = await fetchClient();
        if (fresh) Object.assign(client, fresh);
        const members = await loadHouseholdMembers();
        if (client?.screeningInProgress === true) {
            await window.BenefitRegistry.runAll(members, {
                clientId, client, Utils: getUtils(),
                extras: { isFarmworker: client.isFarmworker }
            });
        }
        await refreshAllDisplays();
    };
    window.addEventListener('household:changed', () => window.refreshEligibility());
});