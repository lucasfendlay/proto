// Orchestrator: fetches data, delegates rendering to each registered benefit module,
// and owns cross-cutting flows (close modal, stop/start screening, auto-terminate).

document.addEventListener('DOMContentLoaded', async function () {
    let _readyResolve;
    window.eligibilityChecksReady = new Promise(res => { _readyResolve = res; });

    // -------- Setup --------
    const clientId = new URLSearchParams(window.location.search).get('id');

    const mainContent = document.querySelector('.main-content') || document.body;
    mainContent.style.visibility = 'hidden';
    mainContent.style.opacity = '0';
    mainContent.style.transition = 'opacity 0.3s ease';

    if (!window.RenderUtils) { console.error('RenderUtils not loaded'); return; }
    if (!window.BenefitRegistry) { console.error('BenefitRegistry not loaded'); return; }

    const R = window.RenderUtils;
    const cap = R.capitalizeFirstLetter;
    const ALL_BENEFITS = window.BenefitRegistry.getAll().map(c => c.key); // ['PACE','LIS','MSP','PTRR','SNAP','LIHEAP']

    // ==========================================================================
    // Data helpers
    // ==========================================================================
    async function loadHouseholdMembers() {
        if (!clientId) return [];
        try {
            const res = await fetch(`/get-client/${clientId}`);
            if (!res.ok) throw new Error(res.statusText);
            const data = await res.json();
            return (data.householdMembers || []).filter(m => m && typeof m === 'object' && m.householdMemberId);
        } catch (e) { console.error('loadHouseholdMembers:', e); return []; }
    }

    async function fetchClient() {
        try {
            const res = await fetch(`/get-client/${clientId}`);
            return res.ok ? await res.json() : null;
        } catch (e) { console.error('fetchClient:', e); return null; }
    }

    async function addNoteToClient(cId, noteText) {
        const activeUser = sessionStorage.getItem('loggedInUser');
        if (!activeUser) return;
        try {
            await fetch('/add-note-to-client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId: cId, note: {
                    text: noteText, timestamp: new Date().toLocaleString(), username: activeUser
                } })
            });
        } catch (err) { console.error('addNoteToClient:', err); }
    }

    async function renderNotesContainer() {
        if (typeof window.renderNotes === 'function') await window.renderNotes(clientId);
    }

    async function updateClientProgramStatus(cId, benefit, isOpen, closeReason = null) {
        return updateClientProgramStatuses(cId, { [benefit]: { isOpen, closeReason } });
    }

    async function updateClientProgramStatuses(cId, updates) {
        try {
            const res = await fetch(`/get-client/${cId}`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            const programStatus = data.programStatus || {};
            for (const [b, { isOpen, closeReason }] of Object.entries(updates)) {
                programStatus[b] = {
                    screeningInProgress: isOpen,
                    screeningCloseReason: isOpen ? null : (closeReason ?? null)
                };
            }
            await fetch('/update-client', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId: cId, clientData: { programStatus } })
            });
        } catch (err) { console.error('updateClientProgramStatuses:', err); }
    }

    async function saveHouseholdMembers(cId, members) {
        return fetch('/save-household-members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: cId, householdMembers: members })
        });
    }

    function hideScreeningContainers() {
        ['household-members-container', 'snap-household-container',
         'liheap-household-container', 'stop-screening-container',
         'screening-header-actions'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    // Context passed to every benefit's render()
    function makeCtx(members, client) {
        return {
            members, client,
            programStatus: client?.programStatus || {},
            clientId,
            saveHouseholdMembers,
            updateClientProgramStatus,
            addNoteToClient,
            renderNotesContainer,
            refreshAllDisplays
        };
    }

    // ==========================================================================
    // Close-Screening modal (cross-cutting)
    // ==========================================================================
    function createCloseMemberModal() {
        if (document.getElementById('close-member-modal')) return;
        const overlay = document.createElement('div');
        overlay.id = 'close-member-modal';
        overlay.style.cssText = `
            display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); z-index: 9999; justify-content: center; align-items: center;`;
        overlay.innerHTML = `
            <div style="background: white; padding: 24px; border-radius: 8px; min-width: 380px; max-width: 520px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                <h3 id="close-member-modal-title" style="margin-top: 0; flex-shrink: 0;">Close Screening</h3>
                <style>
                    #close-member-benefits-checkboxes::-webkit-scrollbar { width: 8px; }
                    #close-member-benefits-checkboxes::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 4px; }
                    #close-member-benefits-checkboxes::-webkit-scrollbar-thumb { background: #888; border-radius: 4px; }
                    #close-member-benefits-checkboxes::-webkit-scrollbar-thumb:hover { background: #555; }
                </style>
                <div id="close-member-benefits-checkboxes" style="margin: 12px 0; overflow-y: scroll; flex: 1; max-height: 50vh; padding-right: 8px;"></div>
                <div style="flex-shrink: 0;">
                    <label for="close-member-reason-select"><strong>Select a reason:</strong></label>
                    <select id="close-member-reason-select" style="width: 100%; padding: 8px; margin: 12px 0; font-size: 14px;">
                        <option value="">-- Select a reason --</option>
                    </select>
                    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 16px;">
                        <button id="close-member-cancel-btn" style="padding: 8px 16px; cursor: pointer;">Cancel</button>
                        <button id="close-member-confirm-btn" style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; transition: background-color 0.3s;" onmouseover="this.style.backgroundColor='#a71d2a'" onmouseout="this.style.backgroundColor='#dc3545'">Confirm Close</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        document.getElementById('close-member-cancel-btn').addEventListener('click', () => overlay.style.display = 'none');
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
    }

    // Aggregate closeReasons across selected benefits: intersection when multiple selected
    function getCloseReasonsForBenefits(selectedBenefits) {
        if (selectedBenefits.length === 0) return [];
        const perBenefitReasons = selectedBenefits
            .map(k => window.BenefitRegistry.getByKey(k)?.closeReasons || []);
        if (perBenefitReasons.length === 1) return perBenefitReasons[0];
        const sets = perBenefitReasons.map(list => new Set(list.map(r => r.value)));
        const shared = [...sets[0]].filter(v => sets.every(s => s.has(v)));
        const first = perBenefitReasons[0];
        return shared.map(v => first.find(r => r.value === v) || { value: v, label: v });
    }

    function updateReasonDropdown(selectedBenefits) {
        const select = document.getElementById('close-member-reason-select');
        if (!select) return;
        const reasons = getCloseReasonsForBenefits(selectedBenefits);
        const container = document.getElementById('close-member-benefits-checkboxes');
        const selectedTiles = container
            ? Array.from(container.querySelectorAll('.close-member-benefit-tile[data-selected="true"]'))
            : [];
        const allSelectedAreRed = selectedTiles.length > 0
            && selectedTiles.every(t => t.dataset.isNotEligible === 'true');

        select.innerHTML = '<option value="">-- Select a reason --</option>';
        reasons.forEach(r => {
            if (r.value === 'Hard Determination' && !allSelectedAreRed) return;
            const opt = document.createElement('option');
            opt.value = r.value;
            opt.textContent = r.label;
            select.appendChild(opt);
        });
    }

    function mapHardDeterminationReason(benefitKey, ineligibilityReason) {
        const checker = window.BenefitRegistry.getByKey(benefitKey);
        if (checker?.mapHardDetermination) return checker.mapHardDetermination(ineligibilityReason);
        return ineligibilityReason || 'Ineligible - Hard Determination';
    }

    function createBenefitTile(entry, checkboxContainer, isHousehold) {
        const tile = document.createElement('div');
        tile.className = 'close-member-benefit-tile';
        tile.dataset.benefit = entry.benefit;
        tile.dataset.memberId = isHousehold ? 'HOUSEHOLD' : entry.memberId;
        tile.dataset.selected = 'false';
        tile.dataset.isNotEligible = entry.isNotEligible ? 'true' : 'false';
        tile.dataset.ineligibilityReason = entry.ineligibilityReason || '';
        tile.dataset.isHousehold = isHousehold ? 'true' : 'false';
        tile.textContent = entry.benefit;
        tile.style.cssText = `
            display: block; padding: 10px 16px; margin: 6px 0;
            border: 2px solid #ccc; border-radius: 6px; cursor: pointer;
            font-size: 14px; font-weight: 500; color: #333;
            background-color: #f9f9f9; transition: all 0.2s ease; user-select: none;`;

        const idle = () => {
            if (entry.isNotEligible) {
                tile.style.borderColor = '#f5c6cb';
                tile.style.backgroundColor = '#f8d7da';
                tile.style.color = '#721c24';
            } else {
                tile.style.borderColor = '#ccc';
                tile.style.backgroundColor = '#f9f9f9';
                tile.style.color = '#333';
            }
        };
        const chosen = () => {
            tile.style.borderColor = 'black';
            tile.style.backgroundColor = '#007bff';
            tile.style.color = 'white';
        };
        if (entry.isNotEligible) idle();

        tile.addEventListener('mouseover', () => {
            if (tile.dataset.selected !== 'false') return;
            if (entry.isNotEligible) {
                tile.style.borderColor = '#c82333';
                tile.style.backgroundColor = '#f1b0b7';
            } else {
                tile.style.borderColor = '#337ab7';
                tile.style.backgroundColor = '#e8f0fe';
            }
        });
        tile.addEventListener('mouseout', () => { if (tile.dataset.selected === 'false') idle(); });
        tile.addEventListener('click', () => {
            tile.dataset.selected = tile.dataset.selected === 'true' ? 'false' : 'true';
            if (tile.dataset.selected === 'true') chosen(); else idle();
            const names = Array.from(
                checkboxContainer.querySelectorAll('.close-member-benefit-tile[data-selected="true"]')
            ).map(t => t.dataset.benefit);
            updateReasonDropdown([...new Set(names)]);
        });
        return tile;
    }

    async function openCloseMemberModal(cId, allMembers, preSelectBenefit = null) {
        createCloseMemberModal();
        const modal = document.getElementById('close-member-modal');
        const checkboxContainer = document.getElementById('close-member-benefits-checkboxes');
        const select = document.getElementById('close-member-reason-select');
        const confirmBtn = document.getElementById('close-member-confirm-btn');
        document.getElementById('close-member-modal-title').textContent = 'Close Screening(s)';

        const freshClient = await fetchClient();
        const programStatus = freshClient?.programStatus || {};

        // ---- Gather entries from each registered benefit ----
        const entries = [];
        for (const checker of window.BenefitRegistry.getAll()) {
            if (typeof checker.getModalEntries !== 'function') continue;
            const benefitEntries = checker.getModalEntries({
                members: allMembers, client: freshClient, programStatus
            }) || [];
            entries.push(...benefitEntries);
        }

        const householdEntries = entries.filter(e => e.isHousehold);
        const individualEntries = entries.filter(e => !e.isHousehold);
        const groupedByMember = {};
        individualEntries.forEach(e => {
            if (!groupedByMember[e.memberId]) groupedByMember[e.memberId] = { memberName: e.memberName, benefits: [] };
            groupedByMember[e.memberId].benefits.push({
                benefit: e.benefit, isNotEligible: e.isNotEligible, ineligibilityReason: e.ineligibilityReason
            });
        });

        checkboxContainer.innerHTML = '<p style="margin-bottom: 10px;"><strong>Select benefits to close:</strong></p>';

        // Select/Deselect all
        const controls = document.createElement('div');
        controls.style.cssText = 'margin-bottom: 12px; padding: 8px 0; border-bottom: 1px solid #ddd;';
        const mkBtn = (label, bg) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = `padding: 6px 14px; background-color: ${bg}; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; margin-right: 8px; transition: background-color 0.3s;`;
            return b;
        };
        const selectAllBtn = mkBtn('Select All', '#007bff');
        const deselectAllBtn = mkBtn('Deselect All', '#6c757d');
        const toggleAll = selected => {
            checkboxContainer.querySelectorAll('.close-member-benefit-tile').forEach(tile => {
                const isNot = tile.dataset.isNotEligible === 'true';
                tile.dataset.selected = selected ? 'true' : 'false';
                if (selected) {
                    tile.style.borderColor = 'black';
                    tile.style.backgroundColor = '#007bff';
                    tile.style.color = 'white';
                } else if (isNot) {
                    tile.style.borderColor = '#f5c6cb';
                    tile.style.backgroundColor = '#f8d7da';
                    tile.style.color = '#721c24';
                } else {
                    tile.style.borderColor = '#ccc';
                    tile.style.backgroundColor = '#f9f9f9';
                    tile.style.color = '#333';
                }
            });
            updateReasonDropdown(selected ? [...new Set(entries.map(e => e.benefit))] : []);
        };
        selectAllBtn.addEventListener('click', () => toggleAll(true));
        deselectAllBtn.addEventListener('click', () => toggleAll(false));
        controls.appendChild(selectAllBtn);
        controls.appendChild(deselectAllBtn);
        checkboxContainer.appendChild(controls);

        if (householdEntries.length > 0) {
            const h = document.createElement('p');
            h.style.cssText = 'margin: 12px 0 4px 0; font-weight: 700; font-size: 15px; color: #333; border-bottom: 2px solid #007bff; padding-bottom: 4px;';
            h.textContent = '🏠 Household Benefits';
            checkboxContainer.appendChild(h);
            householdEntries.forEach(e => checkboxContainer.appendChild(createBenefitTile(e, checkboxContainer, true)));
        }

        if (Object.keys(groupedByMember).length > 0) {
            const h = document.createElement('p');
            h.style.cssText = 'margin: 16px 0 4px 0; font-weight: 700; font-size: 15px; color: #333; border-bottom: 2px solid #28a745; padding-bottom: 4px;';
            h.textContent = '👤 Individual Benefits';
            checkboxContainer.appendChild(h);
            Object.entries(groupedByMember).forEach(([mId, group]) => {
                const header = document.createElement('p');
                header.style.cssText = 'margin: 12px 0 4px 0; font-weight: 600; font-size: 14px; color: #555;';
                header.textContent = group.memberName;
                checkboxContainer.appendChild(header);
                group.benefits.forEach(b => {
                    checkboxContainer.appendChild(createBenefitTile({ ...b, memberId: mId }, checkboxContainer, false));
                });
            });
        }

        // Pre-select
        if (preSelectBenefit) {
            checkboxContainer.querySelectorAll(`.close-member-benefit-tile[data-benefit="${preSelectBenefit}"]`).forEach(tile => {
                if (tile.dataset.isNotEligible === 'true') {
                    tile.dataset.selected = 'true';
                    tile.style.borderColor = 'black';
                    tile.style.backgroundColor = '#007bff';
                    tile.style.color = 'white';
                }
            });
        }

        // Auto-select all red
        if (entries.some(e => e.isNotEligible)) {
            checkboxContainer.querySelectorAll('.close-member-benefit-tile').forEach(tile => {
                if (tile.dataset.isNotEligible === 'true') {
                    tile.dataset.selected = 'true';
                    tile.style.borderColor = 'black';
                    tile.style.backgroundColor = '#007bff';
                    tile.style.color = 'white';
                }
            });
            const names = Array.from(checkboxContainer.querySelectorAll('.close-member-benefit-tile[data-selected="true"]')).map(t => t.dataset.benefit);
            updateReasonDropdown([...new Set(names)]);
            if (Array.from(select.options).some(o => o.value === 'Hard Determination')) {
                select.value = 'Hard Determination';
            }
        } else {
            select.innerHTML = '<option value="">-- Select a reason --</option>';
        }

        modal.style.display = 'flex';

        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        newConfirmBtn.addEventListener('click', async () => {
            const selectedTiles = Array.from(checkboxContainer.querySelectorAll('.close-member-benefit-tile[data-selected="true"]'));
            const reason = select.value;
            if (selectedTiles.length === 0) { alert('Please select at least one benefit to close.'); return; }
            if (!reason) { alert('Please select a reason.'); return; }

            try {
                const household = selectedTiles.filter(t => t.dataset.isHousehold === 'true');
                const individual = selectedTiles.filter(t => t.dataset.isHousehold === 'false');
                const noteLines = [];
                const programStatusUpdates = {};

                for (const tile of household) {
                    const benefit = tile.dataset.benefit;
                    const closeReason = reason === 'Hard Determination'
                        ? mapHardDeterminationReason(benefit, tile.dataset.ineligibilityReason || '')
                        : reason;
                    for (const m of allMembers) {
                        if (m[benefit]) { m[benefit].screeningInProgress = false; m[benefit].screeningCloseReason = closeReason; }
                    }
                    programStatusUpdates[benefit] = { isOpen: false, closeReason };
                    noteLines.push(`<br><strong><u>${benefit}</u></strong><br><em>${closeReason}</em>`);
                    if (benefit === 'SNAP' && window.refreshFarmworkerVisibility) {
                        await window.refreshFarmworkerVisibility();
                    }
                }

                const byMember = {};
                individual.forEach(tile => {
                    const mId = tile.dataset.memberId;
                    if (!byMember[mId]) byMember[mId] = [];
                    byMember[mId].push({ benefit: tile.dataset.benefit, ineligibilityReason: tile.dataset.ineligibilityReason || '' });
                });
                for (const [mId, benefits] of Object.entries(byMember)) {
                    const target = allMembers.find(m => String(m.householdMemberId) === String(mId));
                    if (!target) continue;
                    const memberName = `${cap(target.firstName)} ${cap(target.lastName)}`;
                    const lines = [];
                    for (const { benefit, ineligibilityReason } of benefits) {
                        if (!target[benefit]) continue;
                        const closeReason = reason === 'Hard Determination'
                            ? mapHardDeterminationReason(benefit, ineligibilityReason)
                            : reason;
                        target[benefit].screeningInProgress = false;
                        target[benefit].screeningCloseReason = closeReason;
                        lines.push(`<strong>${benefit}</strong><br><em> ${closeReason}</em>`);
                    }
                    noteLines.push(`<br><strong><u>${memberName}</u></strong><br> ${lines.join('<br>')}`);
                }

                const saveRes = await saveHouseholdMembers(cId, allMembers);
                if (!saveRes.ok) return;
                if (Object.keys(programStatusUpdates).length > 0) {
                    await updateClientProgramStatuses(cId, programStatusUpdates);
                }

                modal.style.display = 'none';
                await addNoteToClient(cId, `<strong>Screening(s) closed.</strong><br>${noteLines.join('<br>')}`);
                await renderNotesContainer();

                const closed = selectedTiles.map(t => t.dataset.benefit);
                if ((closed.includes('PACE') || closed.includes('PTRR') || closed.includes('SFBP'))
                    && window.invalidateHouseholdCache) {
                    window.invalidateHouseholdCache();
                }
                await refreshAllDisplays();
            } catch (err) { console.error('close-confirm:', err); }
        });
    }

    // ==========================================================================
    // Main refresh
    // ==========================================================================
    async function refreshAllDisplays() {
        const [freshMembers, freshClient] = await Promise.all([loadHouseholdMembers(), fetchClient()]);
        const container = document.getElementById('household-members-container');

        const runSidebarRefreshers = async () => {
            if (window.refreshCurrentEnrollments)   await window.refreshCurrentEnrollments();
            if (window.refreshIncome)               await window.refreshIncome();
            if (window.refreshFarmworkerVisibility) await window.refreshFarmworkerVisibility();
            if (window.invalidateAssetCache)        window.invalidateAssetCache();
            if (window.refreshAssetDisplay)         await window.refreshAssetDisplay();
            if (window.refreshExpenseButtons)       await window.refreshExpenseButtons();
        };

        if (!freshClient || freshClient.screeningInProgress !== true) {
            if (container) { container.innerHTML = ''; container.style.display = 'none'; }
            await runSidebarRefreshers();
            await checkAndAutoTerminateScreening(freshMembers);
    
            const contactsBtn = document.getElementById('toggle-contacts-btn');
            if (contactsBtn?.classList.contains('active')) hideScreeningContainers();
    
            // 🔔 Notify step-page layer (estimationsstep.js) that cards are (re)rendered
            window.dispatchEvent(new Event('eligibility:rendered'));
        }

        if (container) { container.innerHTML = ''; container.style.display = ''; }

        // Top "Close Screening(s)" button
        const topButtons = document.createElement('div');
        topButtons.id = 'close-screening-top-container';
        topButtons.style.cssText = 'text-align: center; margin-bottom: 12px; display: flex; flex-direction: column; align-items: stretch; gap: 8px; width: 300px; margin: 0 auto 12px auto;';
        const closeAllBtn = document.createElement('button');
        closeAllBtn.textContent = 'Close Screening(s)';
        closeAllBtn.style.cssText = `background-color: #dc3545; color: white; border: none; border-radius: 4px;
            padding: 8px !important; font-size: 0.85rem; cursor: pointer; transition: background-color 0.3s;
            width: auto; box-sizing: border-box; flex-shrink: 0;`;
        closeAllBtn.addEventListener('mouseover', () => closeAllBtn.style.backgroundColor = '#a71d2a');
        closeAllBtn.addEventListener('mouseout',  () => closeAllBtn.style.backgroundColor = '#dc3545');
        closeAllBtn.addEventListener('click', async () => {
            const latest = await loadHouseholdMembers();
            openCloseMemberModal(clientId, latest);
        });
        topButtons.appendChild(closeAllBtn);
        container.appendChild(topButtons);

        // Delegate rendering to each benefit module
        const ctx = makeCtx(freshMembers, freshClient);
        for (const checker of window.BenefitRegistry.getAll()) {
            if (typeof checker.render === 'function') {
                try { checker.render(container, ctx); }
                catch (err) { console.error(`Render error in ${checker.key}:`, err); }
            }
        }

        // Sort cards: open first, closed at bottom
        const cards = Array.from(container.querySelectorAll('.household-member-box'));
        cards.sort((a, b) => {
            const aClosed = a.style.backgroundColor === 'rgb(212, 212, 212)';
            const bClosed = b.style.backgroundColor === 'rgb(212, 212, 212)';
            return aClosed === bClosed ? 0 : (aClosed ? 1 : -1);
        });
        cards.forEach(c => container.appendChild(c));

        await runSidebarRefreshers();
        await checkAndAutoTerminateScreening(freshMembers);

        const contactsBtn = document.getElementById('toggle-contacts-btn');
        if (contactsBtn?.classList.contains('active')) hideScreeningContainers();
    }

    async function checkAndAutoTerminateScreening(members) {
        if (client.screeningInProgress !== true) return;
        const freshClient = await fetchClient();
        const programStatus = freshClient?.programStatus || {};

        const allClosed = ALL_BENEFITS.every(benefit => {
            if (programStatus[benefit]?.screeningInProgress === false) return true;
            const withBenefit = (members || []).filter(m => m[benefit] && !m[benefit].eligibility?.includes('Not Checked'));
            if (withBenefit.length === 0) return false;
            return withBenefit.every(m => {
                const b = m[benefit];
                if (!b) return true;
                const skip = ['Not Checked','Not Enrolled in Medicare','Enrolled in Medicaid',
                    'Age Criteria Not Met','No Formal Lease','Not Interested','Already Enrolled','Already Applied'];
                if (skip.some(r => b.eligibility?.includes(r))) return true;
                return b.screeningInProgress === false;
            });
        });
        if (!allClosed) return;

        try {
            const res = await fetch('/update-client', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, clientData: { screeningInProgress: false } })
            });
            if (!res.ok) return;
            await renderNotesContainer();
            client.screeningInProgress = false;
            renderStopScreeningState();
            const container = document.getElementById('household-members-container');
            if (container) container.style.display = 'none';
            console.log('All screenings closed — auto-terminated.');
        } catch (err) { console.error('auto-terminate:', err); }
    }

    // ==========================================================================
    // Initial run
    // ==========================================================================
    const client = await fetchClient();
    if (!client) { console.error('Client data unavailable'); return; }

    const initialMembers = await loadHouseholdMembers();
    if (client.screeningInProgress === true) {
        await window.BenefitRegistry.runAll(initialMembers, {
            clientId, client, Utils: window.EligibilityUtils,
            extras: { isFarmworker: client.isFarmworker }
        });
        await refreshAllDisplays();
    }

    // ==========================================================================
    // Stop / Start Screening
    // ==========================================================================
    async function startNewScreening() {
        try {
            const res = await fetch(`/get-client/${clientId}`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            const currentMembers = data.householdMembers || [];

            for (const m of currentMembers) {
                for (const b of ALL_BENEFITS) {
                    if (m[b]) { m[b].screeningInProgress = true; m[b].screeningCloseReason = null; }
                }
            }
            const saveRes = await saveHouseholdMembers(clientId, currentMembers);
            if (!saveRes.ok) return;

            const updateRes = await fetch('/update-client', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, clientData: { screeningInProgress: true } })
            });
            if (!updateRes.ok) return;

            const updates = {};
            ALL_BENEFITS.forEach(b => updates[b] = { isOpen: true, closeReason: null });
            await updateClientProgramStatuses(clientId, updates);

            await addNoteToClient(clientId, '<strong>New screening initiated.</strong>');
            await renderNotesContainer();
            client.screeningInProgress = true;
            renderStopScreeningState();

            const container = document.getElementById('household-members-container');
            if (container) container.style.display = '';

            const freshMembers = await loadHouseholdMembers();
            await window.BenefitRegistry.runAll(freshMembers, {
                clientId, client, Utils: window.EligibilityUtils,
                extras: { isFarmworker: client.isFarmworker }
            });
            await refreshAllDisplays();
        } catch (err) { console.error('startNewScreening:', err); }
    }

    function renderStopScreeningState() {
        const container = document.getElementById('household-members-container');
        if (!container) return;
        const existing = document.getElementById('stop-screening-container');
        if (existing) existing.remove();
        if (client.screeningInProgress === true) return;

        container.style.display = 'none';
        const stopped = document.createElement('div');
        stopped.id = 'stop-screening-container';
        stopped.style.cssText = 'margin-bottom: 16px; text-align: left;';
        stopped.innerHTML = `
            <div class="household-member-box" style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 12px;">
                <p><strong>No Screening in Progress</strong></p>
                <button id="reopen-all-screening-btn" style="
                    background-color: #007bff; color: white; border: none; border-radius: 4px;
                    padding: 10px 20px; font-size: 14px; font-weight: bold; cursor: pointer;
                    transition: background-color 0.3s;" onmouseover="this.style.backgroundColor='#0056b3'"
                    onmouseout="this.style.backgroundColor='#007bff'">Start New Screening</button>
            </div>`;
        container.parentNode.insertBefore(stopped, container);
        document.getElementById('reopen-all-screening-btn').addEventListener('click', async () => {
            if (!confirm('Are you sure you want to start a new screening?')) return;
            await startNewScreening();
        });

        window.dispatchEvent(new Event('eligibility:rendered'));
    }

    renderStopScreeningState();

    // ==========================================================================
    // Global exposure (back-compat)
    // ==========================================================================
    async function runOne(key, members) {
        const checker = window.BenefitRegistry.getByKey(key);
        if (!checker) return;
        return checker.run(members, {
            clientId, client, Utils: window.EligibilityUtils,
            extras: { isFarmworker: client.isFarmworker }
        });
    }

    window.eligibilityChecks = {
        loadHouseholdMembers,
        refreshAllDisplays,
        async PACEEligibilityCheck(m)   { return runOne('PACE',   m); },
        async LISEligibilityCheck(m)    { return runOne('LIS',    m); },
        async MSPEligibilityCheck(m)    { return runOne('MSP',    m); },
        async PTRREligibilityCheck(m)   { return runOne('PTRR',   m); },
        async SFBPEligibilityCheck(m)   { return runOne('SFBP',   m); },
        async SNAPEligibilityCheck(m)   { return runOne('SNAP',   m); },
        async LIHEAPEligibilityCheck(m) { return runOne('LIHEAP', m); }
    };

        // 🔄 One-call recompute + re-render used by any page that mutates member data
        window.refreshEligibility = async function () {
            try {
                const freshClient = await fetchClient();
                if (!freshClient) return;
                // keep the closure's `client` in sync so auto-terminate/stop-state logic works
                Object.assign(client, freshClient);
    
                const members = await loadHouseholdMembers();
    
                if (client.screeningInProgress === true) {
                    await window.BenefitRegistry.runAll(members, {
                        clientId, client, Utils: window.EligibilityUtils,
                        extras: { isFarmworker: client.isFarmworker }
                    });
                }
                await refreshAllDisplays();
            } catch (err) {
                console.error('refreshEligibility:', err);
            }
        };
    
        // 🔄 Any code can just dispatch this event instead of calling directly
        window.addEventListener('household:changed', () => window.refreshEligibility());
    
        mainContent.style.visibility = 'visible';
        mainContent.style.opacity = '1';

        _readyResolve();
    });