// ============================================================
// ===== PROFILE BANNER (shared across edit pages) =====
// Requires: PapaParse (for ZIP→county), ./uszips.csv
// Expects banner markup with #clientForm, #profileId, banner-* inputs,
// #household-members-panel, #edit-profile-btn, #terminate-button, etc.
// ============================================================
(function () {
    'use strict';

    function getQueryParam(name) {
        return new URLSearchParams(window.location.search).get(name);
    }

    const BANNER_CLIENT_ID = getQueryParam('id');
    let bannerClient = {};
    let bannerPending = {};
    let bannerSaveTimer = null;
    const BANNER_SAVE_MS = 1500;
    let zipToCountyMap = {};

    const BANNER_FIELD_MAP = {
        'banner-firstName':   'firstName',
        'banner-lastName':    'lastName',
        'banner-phoneNumber': 'phoneNumber',
        'banner-state':       'state'
    };
    const bannerFieldName = (elId) => BANNER_FIELD_MAP[elId] || elId;

    // ── Save queue ──
    function bannerQueue(field, value) {
        bannerPending[field] = value;
        clearTimeout(bannerSaveTimer);
        bannerSaveTimer = setTimeout(bannerFlush, BANNER_SAVE_MS);
    }
    async function bannerFlush() {
        if (!Object.keys(bannerPending).length) return;
        const data = { ...bannerPending };
        bannerPending = {};
        try {
            await fetch('/update-client', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId: BANNER_CLIENT_ID, clientData: data }),
            });
        } catch (e) { console.error('Banner save failed:', e); }
    }
    async function bannerFlushNow() { clearTimeout(bannerSaveTimer); await bannerFlush(); }

    // ── Helpers ──
    function bannerCap(s) { return s ? String(s).toUpperCase() : ''; }

    function formatBannerPhone(phone) {
        if (!phone) return '';
        const cleaned = String(phone).replace(/\D/g, '');
        const d = cleaned.length === 11 && cleaned.startsWith('1') ? cleaned.substring(1) : cleaned;
        if (d.length === 10) return `(${d.substring(0,3)})-${d.substring(3,6)}-${d.substring(6)}`;
        return String(phone);
    }

    function bannerSetSelectionBox(sel, value) {
        const c = document.querySelector(sel);
        if (!c) return;
        c.querySelectorAll('div[data-value]').forEach(d => d.classList.remove('selected'));
        if (value) {
            const s = c.querySelector(`div[data-value="${value}"]`);
            if (s) s.classList.add('selected');
        }
    }

    function updateCountyDropdown(counties, backendCounty = null) {
        const dd = document.getElementById('county');
        if (!dd) return;
        dd.innerHTML = '<option value="" disabled>Select County</option>';
        for (const c of counties) {
            const o = document.createElement('option');
            o.value = c; o.textContent = c;
            dd.appendChild(o);
        }
        if (backendCounty && counties.includes(backendCounty)) dd.value = backendCounty;
        else if (counties.length === 1) dd.value = counties[0];
        else dd.value = '';

        // If we auto-selected a value, clear any invalid highlight
        if (dd.value) dd.classList.remove('banner-invalid');
    }

    // ── Field-level updaters used by inline onclick/onchange ──
    function updateInterpreter(value) {
        bannerSetSelectionBox('.interpreter-container', value);
        document.querySelector('.interpreter-container')?.classList.remove('banner-invalid');
        bannerQueue('interpreter', value);
    }

    function updateHomelessness(value) {
        const cb = document.getElementById('homelessnessCheckbox');
        if (cb) cb.checked = (value === 'yes');
        bannerQueue('homelessness', value);
        if (bannerClient) bannerClient.homelessness = value;

        const lbl = document.querySelector('#clientForm label[for="streetAddress"]');
        if (lbl) lbl.textContent = value === 'yes' ? 'Mailing Address' : 'Street Address';

        ['streetAddress', 'streetAddress2', 'city', 'zipCode'].forEach(f => {
            const el = document.querySelector(`#clientForm #${f}`);
            if (el) el.value = '';
            bannerQueue(f, '');
            if (bannerClient) bannerClient[f] = '';
        });

        const cd = document.getElementById('county');
        if (cd) cd.innerHTML = '<option value="" disabled selected>Select County</option>';
        bannerQueue('county', null);

        const st = document.getElementById('banner-state');
        if (st) st.value = 'PA';
        bannerQueue('state', 'PA');

        // If homeless, hide the best-mailing question entirely and clear any mailing fields.
        if (value === 'yes') {
            bannerSetSelectionBox('.best-mailing-container', null);
            bannerQueue('bestMailingAddress', null);
            if (bannerClient) bannerClient.bestMailingAddress = null;
            clearMailingFields();
        }
        applyMailingVisibility();

        bannerFlushNow();
    }

    // NEW: mailing-address visibility + toggle
    function applyMailingVisibility() {
        const homeless = (bannerClient?.homelessness === 'yes');
        const best = bannerClient?.bestMailingAddress; // 'yes' | 'no' | null
        const wrap = document.getElementById('bestMailingWrapper');
        const mail = document.getElementById('mailingAddressWrapper');
        if (wrap) wrap.style.display = homeless ? 'none' : '';
        const showMailing = (!homeless && best === 'no');
        if (mail) mail.style.display = showMailing ? '' : 'none';

        // Default mailing state to PA when the mailing block becomes visible
        if (showMailing) {
            const ms = document.getElementById('mailingState');
            if (ms && !ms.value) {
                ms.value = 'PA';
                if (bannerClient) bannerClient.mailingState = 'PA';
                bannerQueue('mailingState', 'PA');
            }
        }
    }

    function clearMailingFields() {
        ['mailingStreetAddress','mailingStreetAddress2','mailingCity','mailingState','mailingZipCode']
            .forEach(f => {
                const el = document.getElementById(f);
                if (el) el.value = '';
                bannerQueue(f, '');
                if (bannerClient) bannerClient[f] = '';
            });
    }

    function updateBestMailingAddress(value) {
        bannerSetSelectionBox('.best-mailing-container', value);
        document.querySelector('.best-mailing-container')?.classList.remove('banner-invalid');
        bannerQueue('bestMailingAddress', value);
        if (bannerClient) bannerClient.bestMailingAddress = value;
        if (value === 'yes') clearMailingFields();
        applyMailingVisibility();
        bannerFlushNow();
    }

    // ── Edit-mode toggle ──
    function toggleProfileEdit() {
        const form = document.getElementById('clientForm');
        const btn = document.getElementById('edit-profile-btn');
        if (!form || !btn) return;
        const isReadonly = form.classList.contains('readonly');
        if (isReadonly) {
            form.classList.remove('readonly');
            form.querySelectorAll('input[type="text"]').forEach(el => el.readOnly = false);
            form.querySelectorAll('input[type="checkbox"]').forEach(el => el.disabled = false);
            form.querySelectorAll('select').forEach(el => el.disabled = false);
            btn.textContent = 'Save Changes';
            btn.classList.add('active');
        } else {
            // Validate visible fields before saving
            if (!validateBannerFields(form)) return;

            bannerFlushNow();
            form.classList.add('readonly');
            form.querySelectorAll('input[type="text"]').forEach(el => el.readOnly = true);
            form.querySelectorAll('input[type="checkbox"]').forEach(el => el.disabled = true);
            form.querySelectorAll('select').forEach(el => el.disabled = true);
            btn.textContent = 'Edit Profile';
            btn.classList.remove('active');
        }
    }

    // Check that every visible text input / select in the banner has a value.
    // Also validates the interpreter and (when shown) best-mailing selection boxes.
    function validateBannerFields(form) {
        ensureBannerInvalidStyles();

        const isVisible = (el) => !!(el && el.offsetParent !== null);
        const missing = [];

        // Clear prior invalid marks
        form.querySelectorAll('.banner-invalid').forEach(el => el.classList.remove('banner-invalid'));

        // Text inputs + selects
        form.querySelectorAll('input[type="text"], select').forEach(el => {
            if (!isVisible(el)) return;
            if (el.id === 'streetAddress2' || el.id === 'mailingStreetAddress2') return;
            const val = (el.value || '').trim();
            if (!val) {
                el.classList.add('banner-invalid');
                missing.push(el);
            }
        });

        // Selection boxes (interpreter, best-mailing when visible)
        const checkBox = (containerSel) => {
            const c = form.querySelector(containerSel) || document.querySelector(containerSel);
            if (!c || !isVisible(c)) return;
            if (!c.querySelector('div[data-value].selected')) {
                c.classList.add('banner-invalid');
                missing.push(c);
            }
        };
        checkBox('.interpreter-container');
        checkBox('.best-mailing-container');

        if (missing.length) {
            alert('Please fill in all highlighted fields before saving.');
            const first = missing[0];
            if (typeof first.focus === 'function') first.focus();
            else first.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return false;
        }
        return true;
    }

    function ensureBannerInvalidStyles() {
        if (document.getElementById('banner-invalid-style')) return;
        const style = document.createElement('style');
        style.id = 'banner-invalid-style';
        style.textContent = `
            #clientForm .banner-invalid,
            #clientForm .banner-invalid > select,
            #clientForm .banner-invalid > input {
                border: 2px solid #e53e3e !important;
                background-color: #fff5f5 !important;
                border-radius: 4px;
            }
        `;
        document.head.appendChild(style);
    }

    // ── Household member card rendering ──
    function buildBannerMemberHTML(m) {
        const deceased = m.deceased === 'yes';
        const isNA = (v) => !v || String(v).trim().toLowerCase() === 'n/a';
        const prefix = isNA(m.prefix) ? '' : m.prefix;
        const middle = isNA(m.middleInitial) ? '' : bannerCap(m.middleInitial);
        const suffix = isNA(m.suffix) ? '' : m.suffix;
        const name = [prefix, bannerCap(m.firstName), middle, bannerCap(m.lastName), suffix].filter(Boolean).join(' ');        
        const info = (l, v) => `<p style="margin:2px 0; font-size:0.8rem; color:#334155;"><strong style="color:#1a202c;">${l}:</strong> ${v}</p>`;
        const cond = (s, l, v) => s ? info(l, v) : '';
        const showPrev = m.previousMaritalStatus && String(m.previousMaritalStatus).toLowerCase() !== 'n/a';
        const showNC = !deceased && m.nonCitizenStatus && m.nonCitizenStatus.toLowerCase() !== 'citizen';
        const showSS = !deceased && m.studentStatus && m.studentStatus.toLowerCase() !== 'notstudent';
        const memberId = m.householdMemberId || '';
        return `
            <div style="position:relative; display:flex; margin-bottom:6px; padding-bottom:6px; border-bottom:1px solid #edf2f7;">
                <div style="font-weight:600; color:#1a202c; font-size:0.9rem; text-align:center;">${name || 'Unnamed Member'}</div>
                ${m.headOfHousehold ? '<span style="position:absolute; right:0; top:50%; transform:translateY(-50%); font-size:0.7rem; color:#fff; background:#007bff; padding:2px 8px; border-radius:10px; font-weight:600;">HoH</span>' : ''}
            </div>
            ${info('DOB', m.dob || 'N/A')}
            ${deceased ? `<p style="margin:2px 0; font-size:0.8rem; color:#c53030;"><strong>Deceased: YES</strong></p>` : ''}
            ${deceased ? info('Date of Death', m.dateOfDeath || 'N/A') : ''}
            ${info('Age', m.age || 'N/A')}
            ${info('Legal Sex', bannerCap(m.legalSex) || 'N/A')}
            ${cond(!deceased, 'Marital Status', bannerCap(m.maritalStatus) || 'N/A')}
            ${cond(showPrev, 'Previous Marital Status', bannerCap(m.previousMaritalStatus))}
            ${info('SSN', m.socialSecurityNumber || 'N/A')}
            ${cond(!deceased, 'Disability', bannerCap(m.disability) || 'N/A')}
            ${cond(!deceased, 'Medicare', bannerCap(m.medicare) || 'N/A')}
            ${cond(!deceased, 'Medicaid', bannerCap(m.medicaid) || 'N/A')}
            ${cond(!deceased, 'US Citizen', bannerCap(m.citizen) || 'N/A')}
            ${cond(showNC, 'Non-Citizen Status', bannerCap(m.nonCitizenStatus))}
            ${cond(!deceased, 'Student', bannerCap(m.student) || 'N/A')}
            ${cond(showSS, 'Student Status', bannerCap(m.studentStatus))}
            ${cond(!deceased, 'Included in SNAP Household', bannerCap(m.meals) || 'N/A')}
            <div style="margin-top:8px; text-align:center;">
                <button type="button"
                    class="banner-edit-member-btn"
                    data-member-id="${memberId}"
                    style="background:#007bff; color:#fff; border:1px solid #0056b3; border-radius:6px; padding:6px 14px; font-size:0.8rem; font-weight:600; cursor:pointer; margin-right:6px; transition:background-color 0.15s ease;"
                    onmouseover="this.style.background='#0056b3'"
                    onmouseout="this.style.background='#007bff'">
                    Edit
                </button>
                <button type="button"
                    class="banner-delete-member-btn"
                    data-member-id="${memberId}"
                    style="background:#ff1f1f; color:#fff; border:1px solid #c81212; border-radius:6px; padding:6px 14px; font-size:0.8rem; font-weight:600; cursor:pointer; transition:background-color 0.15s ease;"
                    onmouseover="this.style.background='#c81212'"
                    onmouseout="this.style.background='#ff1f1f'">
                    Delete
                </button>
            </div>
        `;
    }

    let _bannerModalInjectPromise = null;
    async function ensureHouseholdModalInjected() {
        // A "real" modal must have the form fields inside it, not just the shell.
        const existing = document.getElementById('householdMemberModal');
        const isRealModal = !!(existing
            && existing.querySelector('#firstName')
            && existing.querySelector('#modal-header'));

        if (isRealModal) return true;

        // Stub present but incomplete → nuke it so we can inject the real one
        if (existing) existing.remove();

        if (_bannerModalInjectPromise) return _bannerModalInjectPromise;

        _bannerModalInjectPromise = (async () => {
            try {
                const res = await fetch('householdedit.html', { cache: 'no-cache' });
                if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
                const html = await res.text();
                const doc = new DOMParser().parseFromString(html, 'text/html');

                // 1. Copy stylesheets
                const existingHrefs = new Set(
                    [...document.querySelectorAll('link[rel="stylesheet"]')]
                        .map(l => new URL(l.getAttribute('href'), location.href).href)
                );
                doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
                    const href = link.getAttribute('href');
                    if (!href) return;
                    const abs = new URL(href, location.href).href;
                    if (existingHrefs.has(abs)) return;
                    const clone = document.createElement('link');
                    clone.rel = 'stylesheet';
                    clone.href = href;
                    document.head.appendChild(clone);
                    existingHrefs.add(abs);
                });

                // 2. Copy inline <style> blocks
                const existingStyles = new Set(
                    [...document.querySelectorAll('style')].map(s => s.textContent.trim())
                );
                doc.querySelectorAll('style').forEach(style => {
                    const txt = style.textContent.trim();
                    if (!txt || existingStyles.has(txt)) return;
                    const clone = document.createElement('style');
                    clone.textContent = txt;
                    document.head.appendChild(clone);
                    existingStyles.add(txt);
                });

                // 3. Inject the modal
                const modal = doc.getElementById('householdMemberModal');
                if (!modal) throw new Error('#householdMemberModal not found in householdedit.html');

                // Remove any late-arriving duplicate before appending
                document.getElementById('householdMemberModal')?.remove();
                document.body.appendChild(document.importNode(modal, true));

                const injected = document.getElementById('householdMemberModal');
                if (injected) {
                    injected.style.display = 'none';
                    ensureInjectedModalScrollStyles();
                }

                return true;
            } catch (e) {
                console.error('Failed to inject household modal:', e);
                _bannerModalInjectPromise = null;
                return false;
            }
        })();

        return _bannerModalInjectPromise;
    }

    // Open the household member modal from householdedit.js
    async function openBannerMemberEdit(memberId) {
        if (!memberId) return;
        if (typeof window.openEditModal !== 'function') {
            alert('Household editor script is not loaded on this page.');
            return;
        }
        const ok = await ensureHouseholdModalInjected();
        if (!ok) { alert('Could not load the household member editor.'); return; }
        try {
            let member = null;
            if (BANNER_CLIENT_ID) {
                const res = await fetch(`/get-client/${BANNER_CLIENT_ID}`);
                if (res.ok) {
                    const data = await res.json();
                    bannerClient = data;
                    window.bannerClient = data;           // ✅ keep panel in sync
                    if (window.cachedClient !== undefined) window.cachedClient = data;
                    member = (data.householdMembers || []).find(m => m.householdMemberId === memberId);
                }
            }
            if (!member) {
                member = (bannerClient?.householdMembers || []).find(m => m.householdMemberId === memberId);
            }
            if (!member) { alert('Could not find that household member.'); return; }
            await window.openEditModal(member);
        } catch (e) {
            console.error('Failed to open member edit modal:', e);
        }
    }
    window.openBannerMemberEdit = openBannerMemberEdit;

    function renderHouseholdMembersPanel() {
        const panel = document.getElementById('household-members-panel');
        if (!panel) return;
        const members = (bannerClient?.householdMembers) || [];
        if (!members.length) {
            panel.innerHTML = '<p style="margin:0; font-size:0.85rem; color:#64748b;">No household members.</p>';
            return;
        }
        const sorted = [...members].sort((a, b) => (b.headOfHousehold ? 1 : 0) - (a.headOfHousehold ? 1 : 0));
        panel.innerHTML = `<div class="household-members-grid">${sorted.map(m => `<div class="household-member-card">${buildBannerMemberHTML(m)}</div>`).join('')}</div>`;

        // Wire up Edit buttons
        panel.querySelectorAll('.banner-edit-member-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openBannerMemberEdit(btn.getAttribute('data-member-id'));
            });
        });

        // Wire up Delete buttons
        panel.querySelectorAll('.banner-delete-member-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const memberId = btn.getAttribute('data-member-id');
                if (!memberId) return;

                if (typeof window.deleteHouseholdMember === 'function') {
                    // Use householdedit.js's version (has its own confirm + reload)
                    await window.deleteHouseholdMember(memberId);
                } else {
                    // Fallback: delete directly if householdedit.js isn't loaded
                    if (!confirm('Are you sure you want to delete this household member? This action cannot be undone.')) return;
                    try {
                        const res = await fetch('/delete-household-member', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ clientId: BANNER_CLIENT_ID, memberId }),
                        });
                        if (!res.ok) throw new Error(res.statusText);
                    } catch (err) {
                        console.error('Failed to delete household member:', err);
                        alert('Failed to delete household member.');
                        return;
                    }
                }

                // Refresh banner panel from server
                try {
                    if (BANNER_CLIENT_ID) {
                        const r = await fetch(`/get-client/${BANNER_CLIENT_ID}`);
                        if (r.ok) {
                            bannerClient = await r.json();
                            window.bannerClient = bannerClient;
                            renderHouseholdMembersPanel();
                        }
                    }
                } catch (err) {
                    console.error('Failed to refresh banner after delete:', err);
                }
            });
        });
    }

    function toggleHouseholdMembers() {
        const panel = document.getElementById('household-members-panel');
        const label = document.getElementById('household-toggle-label');
        if (!panel) return;
        const hidden = panel.style.display === 'none' || !panel.style.display;
        if (hidden) {
            renderHouseholdMembersPanel();
            panel.style.display = 'block';
            if (label) label.textContent = 'Hide Household Members';
        } else {
            panel.style.display = 'none';
            if (label) label.textContent = 'Show Household Members';
        }
        window.dispatchEvent(new Event('resize'));
    }

    // ── Body padding sync with fixed banner ──
    function setupBannerHeightSync() {
        const banner = document.getElementById('clientForm');
        const panel = document.getElementById('household-members-panel');
        if (!banner) return;

        const sync = () => {
            const bRect = banner.getBoundingClientRect();
            let bottom = bRect.bottom;
            if (panel && panel.style.display !== 'none' && panel.offsetParent !== null) {
                bottom = Math.max(bottom, panel.getBoundingClientRect().bottom);
            }
            document.body.style.paddingTop = (bottom + 16) + 'px';
            document.body.style.marginTop = '0';
        };

        sync();
        if (window.ResizeObserver) {
            const ro = new ResizeObserver(sync);
            ro.observe(banner);
            if (panel) ro.observe(panel);
        }
        window.addEventListener('resize', sync);
        window.addEventListener('scroll', sync, { passive: true });
        if (panel && window.MutationObserver) {
            new MutationObserver(sync).observe(panel, {
                attributes: true, attributeFilter: ['style'], childList: true, subtree: true
            });
        }
    }

    // ── Profile ID click-to-copy ──
    function setupProfileIdCopy() {
        const el = document.getElementById('profileId');
        if (!el || el.dataset.copyBound) return;
        el.dataset.copyBound = 'true';
        el.title = 'Click to copy page URL';
        el.style.cursor = 'copy';
        el.style.userSelect = 'none';
        el.addEventListener('click', async () => {
            const url = window.location.href.replace(/\/[^\/]*\.html/, '/profileview.html');
            try {
                await navigator.clipboard.writeText(url);
                const orig = el.textContent;
                const origFontSize = el.style.fontSize;
                el.textContent = 'Link Copied!';
                el.style.color = '#28a745';
                // Shrink so "Link Copied!" visually matches the profile ID width
                el.style.fontSize = '0.65em';
                setTimeout(() => {
                    el.textContent = orig;
                    el.style.color = '';
                    el.style.fontSize = origFontSize;
                }, 1200);
            } catch (e) { console.error(e); }
        });
    }

    // ── Populate banner from DB ──
    function populateBanner(data) {
        bannerClient = data;
        window.bannerClient = bannerClient;
        const idEl = document.getElementById('profileId');
        if (idEl) idEl.textContent = data.id || 'N/A';
        setupProfileIdCopy();

        const form = document.getElementById('clientForm');
        if (!form) return;
        const q = (sel) => form.querySelector(sel);

        const setVal = (sel, val) => { const el = q(sel); if (el) el.value = val; };
        setVal('#banner-firstName',   bannerCap(data.firstName || ''));
        setVal('#banner-lastName',    bannerCap(data.lastName || ''));
        setVal('#banner-phoneNumber', formatBannerPhone(data.phoneNumber || ''));
        setVal('#streetAddress',      bannerCap(data.streetAddress || ''));
        setVal('#streetAddress2',     bannerCap(data.streetAddress2 || ''));
        setVal('#city',               bannerCap(data.city || ''));
        setVal('#banner-state',       bannerCap(data.state || 'PA'));
        setVal('#zipCode',            data.zipCode || '');
        setVal('#speakingLanguage',   data.speakingLanguage || '');
        setVal('#county',              data.county || '');
        setVal('#mailingStreetAddress',  bannerCap(data.mailingStreetAddress || ''));
        setVal('#mailingStreetAddress2', bannerCap(data.mailingStreetAddress2 || ''));
        setVal('#mailingCity',           bannerCap(data.mailingCity || ''));
        setVal('#mailingState',          bannerCap(data.mailingState || ''));
        setVal('#mailingZipCode',        data.mailingZipCode || '');
        bannerSetSelectionBox('.best-mailing-container', data.bestMailingAddress || null);

        const zip = data.zipCode || '';
        // Always reset the county dropdown; only repopulate if the ZIP is known.
        const countyDd = document.getElementById('county');
        if (zip.length === 5 && zipToCountyMap[zip]) {
            updateCountyDropdown(zipToCountyMap[zip], data.county);
        } else if (countyDd) {
            countyDd.innerHTML = '<option value="" disabled selected>Select County</option>';
        }

        const h = data.homelessness === 'yes' ? 'yes' : 'no';
        const hcb = document.getElementById('homelessnessCheckbox');
        if (hcb) hcb.checked = (h === 'yes');
        bannerSetSelectionBox('.interpreter-container', data.interpreter);
        const lbl = q('label[for="streetAddress"]');
        if (lbl) lbl.textContent = h === 'yes' ? 'Mailing Address' : 'Street Address';

        applyMailingVisibility();

        form.classList.add('readonly');
        form.querySelectorAll('input[type="text"]').forEach(el => el.readOnly = true);
        form.querySelectorAll('input[type="checkbox"]').forEach(el => el.disabled = true);
        form.querySelectorAll('select').forEach(el => el.disabled = true);

        const statusEl = document.getElementById('terminationStatus');
        const termBtn = document.getElementById('terminate-button');
        if (statusEl) statusEl.style.display = data.terminated ? '' : 'none';
        if (termBtn) termBtn.textContent = data.terminated ? 'Undo Termination' : 'Terminate Profile';
    }

    // ── Listeners that queue saves ──
    function setupBannerListeners() {
        const form = document.getElementById('clientForm');
        if (!form) return;

        form.querySelectorAll('input[type="text"]').forEach(input => {
            input.addEventListener('input', (ev) => {
                if (ev.target.value.trim()) ev.target.classList.remove('banner-invalid');
            });
            input.addEventListener('blur', (ev) => {
                const field = bannerFieldName(ev.target.id);
                let value = ev.target.value;
                if (field === 'phoneNumber') value = value.replace(/\D/g, '');
                bannerQueue(field, value);
                if (field === 'zipCode') {
                    const dd = document.getElementById('county');
                    if (value.length === 5 && zipToCountyMap[value]) {
                        updateCountyDropdown(zipToCountyMap[value], bannerClient?.county || null);
                        // Persist auto-selected county (e.g., single-match ZIPs like 19150 → Philadelphia)
                        const selectedCounty = dd?.value || null;
                        if (selectedCounty) {
                            bannerQueue('county', selectedCounty);
                            if (bannerClient) bannerClient.county = selectedCounty;
                        }
                    } else if (dd) {
                        dd.innerHTML = '<option value="" disabled selected>Select County</option>';
                        bannerQueue('county', null);
                        if (bannerClient) bannerClient.county = null;
                    }
                }
                if (bannerClient) bannerClient[field] = value;
                if (field === 'phoneNumber') ev.target.value = formatBannerPhone(value);
                else if (field !== 'zipCode') ev.target.value = value.toUpperCase();
            });

            // Live-filter counties as the user types a ZIP
            if (input.id === 'zipCode') {
                input.addEventListener('input', (ev) => {
                    const digits = ev.target.value.replace(/\D/g, '');
                    const dd = document.getElementById('county');
                    if (digits.length === 5 && zipToCountyMap[digits]) {
                        updateCountyDropdown(zipToCountyMap[digits]);
                    } else if (dd) {
                        dd.innerHTML = '<option value="" disabled selected>Select County</option>';
                    }
                });
            }
        });

        form.querySelectorAll('select').forEach(sel => {
            sel.addEventListener('change', (ev) => {
                if (ev.target.value) ev.target.classList.remove('banner-invalid');
                const field = bannerFieldName(ev.target.id);
                bannerQueue(field, ev.target.value || null);
                if (field === 'county') bannerFlushNow();
            });
        });
    }

    async function confirmAndTerminate() {
        const activeUser = sessionStorage.getItem('loggedInUser');
        if (!activeUser) { alert("Error: No active user found."); return; }
        if (!BANNER_CLIENT_ID) { alert("Error: No client ID found."); return; }

        try {
            // Fetch fresh state in case bannerClient is stale
            const res = await fetch(`/get-client/${BANNER_CLIENT_ID}`);
            if (!res.ok) throw new Error('Failed to fetch client');
            const fresh = await res.json();
            const isTerminated = fresh?.terminated === true;

            const msg = isTerminated
                ? "Are you sure you want to undo the termination of this profile?"
                : "Are you sure you want to terminate this profile?";
            if (!confirm(msg)) return;

            await bannerFlushNow();

            await Promise.all([
                fetch('/update-client', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clientId: BANNER_CLIENT_ID,
                        clientData: { terminated: !isTerminated }
                    }),
                }),
                fetch('/add-note-to-client', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clientId: BANNER_CLIENT_ID,
                        note: {
                            text: isTerminated ? "Profile termination undone." : "Profile terminated.",
                            timestamp: new Date().toLocaleString(),
                            username: activeUser,
                        },
                    }),
                }),
            ]);

            bannerClient.terminated = !isTerminated;

            const statusEl = document.getElementById('terminationStatus');
            const btn = document.getElementById('terminate-button');
            if (statusEl) statusEl.style.display = bannerClient.terminated ? '' : 'none';
            if (btn) btn.textContent = bannerClient.terminated ? 'Undo Termination' : 'Terminate Profile';

            alert(isTerminated ? "Profile termination undone." : "Profile terminated.");
        } catch (error) {
            console.error("Error updating termination status:", error);
            alert("An error occurred. Please try again.");
        }
    }

    // ── ZIP → county lookup CSV ──
    async function loadZipCountyDataBanner() {
        return new Promise(resolve => {
            if (typeof Papa === 'undefined') {
                console.warn('PapaParse not loaded; ZIP→county lookup disabled.');
                return resolve();
            }
            Papa.parse('./uszips.csv', {
                download: true, header: true,
                complete: (results) => {
                    results.data.forEach(row => {
                        const zip = row.zip, counties = row.county_names_all;
                        if (zip && counties) {
                            if (!zipToCountyMap[zip]) zipToCountyMap[zip] = [];
                            counties.split('|').forEach(c => {
                                const t = c.trim();
                                if (!zipToCountyMap[zip].includes(t)) zipToCountyMap[zip].push(t);
                            });
                        }
                    });
                    resolve();
                },
                error: (e) => { console.error('CSV load error:', e); resolve(); }
            });
        });
    }

    // ── Init ──
    async function initBanner() {
        if (!BANNER_CLIENT_ID) return;
        try {
            ensureBannerReadonlyStyles();
            await loadZipCountyDataBanner();
            const res = await fetch(`/get-client/${BANNER_CLIENT_ID}`);
            if (!res.ok) throw new Error(res.statusText);
            const data = await res.json();
            populateBanner(data);
            setupBannerListeners();
            setupBannerHeightSync();
        } catch (e) { console.error('Banner init failed:', e); }
    }

    function ensureInjectedModalScrollStyles() {
        if (document.getElementById('injected-modal-scroll-style')) return;
        const style = document.createElement('style');
        style.id = 'injected-modal-scroll-style';
        style.textContent = `
            /* Force the injected household modal to always scroll on any page,
               regardless of body padding/margins added by the banner. */
            #householdMemberModal {
                position: fixed !important;
                inset: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                max-height: 100vh !important;
                overflow-y: auto !important;
                -webkit-overflow-scrolling: touch;
                z-index: 10000 !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            /* Give the inner content some breathing room and let it grow */
            #householdMemberModal .modal-content,
            #householdMemberModal > div {
                margin: 40px auto !important;
                max-height: none !important;
            }
            /* Prevent background scroll while modal is open (optional) */
            body.household-modal-open { overflow: hidden; }
        `;
        document.head.appendChild(style);
    }

    function ensureBannerReadonlyStyles() {
        if (document.getElementById('banner-readonly-style')) return;
        const style = document.createElement('style');
        style.id = 'banner-readonly-style';
        style.textContent = `
            #clientForm.readonly .interpreter-container,
            #clientForm.readonly .interpreter-container div[data-value],
            #clientForm.readonly .best-mailing-container,
            #clientForm.readonly .best-mailing-container div[data-value],
            #clientForm.readonly .homelessness-container,
            #clientForm.readonly .homelessness-container div[data-value],
            #clientForm.readonly label[for="homelessnessCheckbox"],
            #clientForm.readonly #homelessnessCheckbox {
                cursor: default !important;
            }
            #clientForm.readonly .interpreter-container div[data-value],
            #clientForm.readonly .best-mailing-container div[data-value],
            #clientForm.readonly .homelessness-container div[data-value],
            #clientForm.readonly #homelessnessCheckbox {
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);
    }

    // ── Wrap loadSavedData (if present) so the panel stays in sync ──
    function wrapLoadSavedDataForBanner() {
        if (typeof window.loadSavedData !== 'function') return;
        if (window.loadSavedData.__bannerWrapped) return;
        const original = window.loadSavedData;
        const wrapped = async function (...args) {
            const result = await original.apply(this, args);
            try {
                if (BANNER_CLIENT_ID) {
                    const res = await fetch(`/get-client/${BANNER_CLIENT_ID}`);
                    if (res.ok) {
                        bannerClient = await res.json();
                        window.bannerClient = bannerClient;
                        const panel = document.getElementById('household-members-panel');
                        if (panel && panel.style.display !== 'none') {
                            renderHouseholdMembersPanel();
                        }
                    }
                }
            } catch (e) {
                console.error('Error refreshing banner after loadSavedData:', e);
            }
            return result;
        };
        wrapped.__bannerWrapped = true;
        window.loadSavedData = wrapped;
    }

    // ── Public API on window (inline HTML onclick handlers need globals) ──
    window.BANNER_CLIENT_ID = BANNER_CLIENT_ID;
    window.bannerClient = bannerClient;
    window.bannerQueue = bannerQueue;
    window.bannerFlush = bannerFlush;
    window.bannerFlushNow = bannerFlushNow;
    window.bannerCap = bannerCap;
    window.formatBannerPhone = formatBannerPhone;
    window.bannerSetSelectionBox = bannerSetSelectionBox;
    window.bannerFieldName = bannerFieldName;
    window.zipToCountyMap = zipToCountyMap;
    window.updateCountyDropdown = updateCountyDropdown;
    window.updateInterpreter = updateInterpreter;
    window.updateHomelessness = updateHomelessness;
    window.updateBestMailingAddress = updateBestMailingAddress;
    window.applyMailingVisibility = applyMailingVisibility;
    window.toggleProfileEdit = toggleProfileEdit;
    window.toggleHouseholdMembers = toggleHouseholdMembers;
    window.renderHouseholdMembersPanel = renderHouseholdMembersPanel;
    window.setupProfileIdCopy = setupProfileIdCopy;
    window.populateBanner = populateBanner;
    window.setupBannerListeners = setupBannerListeners;
    window.setupBannerHeightSync = setupBannerHeightSync;
    window.confirmAndTerminate = confirmAndTerminate;
    window.initBanner = initBanner;
    window.loadZipCountyDataBanner = loadZipCountyDataBanner;

        // Auto-init after DOM is ready (unless the page opts out)
        if (window.BANNER_SKIP_AUTOINIT) {
            // Page will call the helpers it needs (setupBannerHeightSync, setupProfileIdCopy,
            // toggleProfileEdit, toggleHouseholdMembers, renderHouseholdMembersPanel,
            // confirmAndTerminate, updateInterpreter, updateHomelessness, etc.)
            // and is responsible for keeping window.bannerClient in sync.
            return;
        }

    // Auto-init after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initBanner();
            // Wrap loadSavedData if/when it's defined; try shortly after
            setTimeout(wrapLoadSavedDataForBanner, 0);
            setTimeout(wrapLoadSavedDataForBanner, 500);
        });
    } else {
        initBanner();
        setTimeout(wrapLoadSavedDataForBanner, 0);
        setTimeout(wrapLoadSavedDataForBanner, 500);
    }
})();