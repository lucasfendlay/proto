async function fetchApplicantData(clientId) {
    try {
        const response = await fetch(`/get-client/${clientId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch client data: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching applicant data:', error);
        return null;
    }
}

/**
 * Merges multiple PDF byte arrays into a single PDF document.
 */
async function mergePDFs(pdfByteArrays) {
    const { PDFDocument } = PDFLib;
    const mergedPdf = await PDFDocument.create();
    for (const pdfBytes of pdfByteArrays) {
        const pdf = await PDFDocument.load(pdfBytes);
        // Flatten this source doc so its form fields become baked-in page content
        // before we copy its pages into the merged output.
        try { pdf.getForm().flatten(); } catch (e) { /* no form / nothing to flatten */ }
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
    }
    return mergedPdf;
}

/**
 * Loads a PDF asset from /assets/ and returns its ArrayBuffer.
 */
async function loadPDFAsset(assetPath) {
    const response = await fetch(`/assets/${assetPath}`);
    if (!response.ok) {
        throw new Error(`Failed to load PDF asset: ${assetPath} (${response.statusText})`);
    }
    return await response.arrayBuffer();
}

/* ============================================================
 *  HELPERS — shared math
 * ============================================================ */

function calculateYearlyAmountFromExpense(expense) {
    const amount = parseFloat(expense.amount) || 0;
    switch ((expense.frequency || '').toLowerCase()) {
        case 'monthly':  return amount * 12;
        case 'weekly':   return amount * 52;
        case 'biweekly': return amount * 26;
        case 'daily':    return amount * 365;
        case 'yearly':
        case 'annual':   return amount;
        default:         return 0;
    }
}

function monthsBetweenRounded(startStr, endStr) {
    if (!startStr || !endStr) return null;
    const start = new Date(`${String(startStr).slice(0, 10)}T00:00:00Z`);
    const end   = new Date(`${String(endStr).slice(0, 10)}T00:00:00Z`);
    if (isNaN(start) || isNaN(end) || end < start) return null;
    const days = (end - start) / 86400000 + 1;
    return Math.max(0, Math.min(12, Math.round(days / 30.4375)));
}

function fullMonthsBetween(startStr, endStr) {
    if (!startStr || !endStr) return 0;
    const start = new Date(`${String(startStr).slice(0, 10)}T00:00:00Z`);
    const end   = new Date(`${String(endStr).slice(0, 10)}T00:00:00Z`);
    if (isNaN(start) || isNaN(end) || end < start) return 0;
    const days = (end - start) / 86400000 + 1;
    return Math.max(0, Math.floor(days / 30.4375));
}

const fmtMoney = (n) => (n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
});

/**
 * Computes per-rental Lines 4-8 (PA-1000 RC) and the Line 8 total.
 */
function computeRentals({ ptrrApplicant, spouse, data }) {
    const ptrrApp = ptrrApplicant?.PTRR?.application?.[0] || {};
    const previousYearRentals = Array.isArray(ptrrApp.previousYearRentals) ? ptrrApp.previousYearRentals : [];
    const isRented = data.residenceStatus === 'rented' || data.residenceStatus === 'rentedowned';

    if (!isRented) return { rentalsWithMath: [], totalLine8: 0 };

    const combinedExpenses = [...(ptrrApplicant?.expenses || []), ...(spouse?.expenses || [])];
    const rentExpenses = combinedExpenses.filter(
        (e) => e.type?.toLowerCase() === 'previous year' && e.kind?.toLowerCase() === 'rent'
    );

    let rentals;
    if (previousYearRentals.length > 0) {
        rentals = previousYearRentals.map((r) => ({
            previousYearRentAmount: parseFloat(r?.previousYearRentAmount) || 0,
            rentalPropertyAddress:  r?.rentalPropertyAddress || {},
            subsidizedHousingPrevious: r?.subsidizedHousingPrevious || null,
            subsidizedRentAmount:   parseFloat(r?.subsidizedRentAmount) || 0,
            rentalType:             r?.rentalType || null,
            buildingName:           r?.buildingName || '',
            domicilliaryFosterCare: r?.domicilliaryFosterCare || null,
        }));
    } else {
        const legacyRentTotal = rentExpenses.reduce((s, e) => s + calculateYearlyAmountFromExpense(e), 0);
        rentals = [{
            previousYearRentAmount: legacyRentTotal,
            rentalPropertyAddress: {
                streetAddress: data.streetAddress, streetAddress2: data.streetAddress2,
                city: data.city, state: data.state, zipCode: data.zipCode,
            },
            subsidizedHousingPrevious: null,
            subsidizedRentAmount: parseFloat(data.subsidizedRentAmount) || 0,
            rentalType: data.rentalType || null,
            buildingName: data.buildingName || '',
            domicilliaryFosterCare: data.domicilliaryFosterCare || null,
        }];
    }

    const monthsOccupiedDefault = parseInt(ptrrApp.monthsOccupied) || 12;

    const findRentExpenseForRental = (rental, idx) => {
        const addr = rental.rentalPropertyAddress || {};
        const street = (addr.streetAddress || '').trim().toLowerCase();
        const zip = (addr.zipCode || '').trim();
        if (street || zip) {
            const m = rentExpenses.find((e) => {
                const es = (e.streetAddress || e.address?.streetAddress || '').trim().toLowerCase();
                const ez = (e.zipCode || e.address?.zipCode || '').trim();
                return (street && es && street === es) || (zip && ez && zip === ez);
            });
            if (m) return m;
        }
        return rentExpenses[idx] || null;
    };

    const rentalsWithMath = rentals.map((r, idx) => {
        const monthlyRent    = r.previousYearRentAmount || 0;
        const netMonthlyRent = Math.max(0, monthlyRent - (r.subsidizedRentAmount || 0));
        const assoc = findRentExpenseForRental(r, idx);
        const derived = assoc ? monthsBetweenRounded(assoc.startDate, assoc.endDate) : null;
        const monthsOccupied = (derived != null) ? derived : monthsOccupiedDefault;
        const line8 = netMonthlyRent * monthsOccupied;
        console.log(`Rental[${idx}] monthsOccupied=${monthsOccupied} (derived=${derived}, default=${monthsOccupiedDefault}), Line8=${line8.toFixed(2)}`);
        return { ...r, monthlyRent, netMonthlyRent, monthsOccupied, line8 };
    });

    const totalLine8 = rentalsWithMath.reduce((s, r) => s + r.line8, 0);
    return { rentalsWithMath, totalLine8 };
}

/* ============================================================
 *  SCHEDULE A — PA-1000A (Multiple Homes)
 * ============================================================ */

async function buildScheduleA({ ptrrApplicant, sanitizedSSN, residenceStatus }) {
    const { PDFDocument } = PDFLib;
    const ptrrApp = ptrrApplicant?.PTRR?.application?.[0] || {};
    const properties = Array.isArray(ptrrApp.previousYearProperties) ? ptrrApp.previousYearProperties : [];

    const required =
        properties.length >= 2 &&
        (residenceStatus === 'owned' || residenceStatus === 'rentedowned');
    if (!required) return null;

    const taxYear = new Date().getFullYear() - 1;
    const totalDaysInYear = ((taxYear % 4 === 0 && taxYear % 100 !== 0) || taxYear % 400 === 0) ? 366 : 365;

    const daysBetween = (s, e) => {
        if (!s || !e) return 0;
        const a = new Date(`${String(s).slice(0, 10)}T00:00:00Z`);
        const b = new Date(`${String(e).slice(0, 10)}T00:00:00Z`);
        if (isNaN(a) || isNaN(b) || b < a) return 0;
        return Math.max(0, Math.round((b - a) / 86400000) + 1);
    };

    const annualizeAmount = (amount, frequency) => {
        const a = parseFloat(amount) || 0;
        if (!a) return 0;
        switch ((frequency || '').toLowerCase()) {
            case 'daily':       return a * 365;
            case 'weekly':      return a * 52;
            case 'bi-weekly':
            case 'biweekly':    return a * 26;
            case 'monthly':     return a * 12;
            case 'quarterly':   return a * 4;
            default:            return a;
        }
    };

    const buildHome = (p) => {
        const addr = p?.propertyAddress || {};
        const start = p?.propertyTaxStartDate || '';
        const end   = p?.propertyTaxEndDate || `${taxYear}-12-31`;
        const days = daysBetween(start, end);
        const percentage = totalDaysInYear > 0 ? (days / totalDaysInYear) * 100 : 0;
        const annualizedTax = annualizeAmount(p?.propertyTaxAmount, p?.propertyTaxFrequency);
        const proratedTax = annualizedTax * (percentage / 100);
        return { addr, start, end, days, percentage, annualizedTax, proratedTax };
    };

    const homes = properties.map(buildHome);
    const totalProratedTax = homes.reduce((sum, h) => sum + h.proratedTax, 0);

    const pa1000aBytes = await loadPDFAsset('2025_pa-1000a.pdf');
    const pa1000aDoc   = await PDFDocument.load(pa1000aBytes);
    const pa1000aForm  = pa1000aDoc.getForm();

    const setField = (name, val) => {
        try { pa1000aForm.getTextField(name).setText(val); }
        catch (e) { console.warn(`PA-1000A: ${name}:`, e.message); }
    };
    const setMonthDay = (mName, dName, dateStr) => {
        if (!dateStr) return;
        const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
        if (isNaN(d)) return;
        setField(mName, String(d.getUTCMonth() + 1).padStart(2, '0'));
        setField(dName, String(d.getUTCDate()).padStart(2, '0'));
    };

    const aFullName = `${ptrrApplicant?.firstName || ''} ${ptrrApplicant?.middleInitial || ''} ${ptrrApplicant?.lastName || ''}`.trim();
    setField('Name as shown on PA-1000', aFullName);
    setField('Social Security Number', sanitizedSSN);

    const home1 = homes[0];
    setField('Street address - First Home', home1.addr.streetAddress || '');
    setField('City or Post Office - First Home', home1.addr.city || '');
    setField('State - First Home', (home1.addr.state || '').toUpperCase().slice(0, 2));
    setField('Zip Code - First Home', home1.addr.zipCode || '');
    setMonthDay('1. Month', '1. Day', home1.start);
    setField('1. Total property taxes paid on first home', fmtMoney(home1.annualizedTax));
    setMonthDay('2. Month', '2. Day', home1.end);
    setField('2. Number of days you or the deceased owned and occupied each home', String(home1.days));
    setField('3. Percentage of the year that you owned and occupied each home', home1.percentage.toFixed(2) + '%');
    setField('4. Multiply Line 1 by Line 3', fmtMoney(home1.proratedTax));

    if (homes[1]) {
        const home2 = homes[1];
        setField('Street address - Second Home', home2.addr.streetAddress || '');
        setField('City or Post Office - Second home', home2.addr.city || '');
        setField('State - Second home', (home2.addr.state || '').toUpperCase().slice(0, 2));
        setField('Zip Code - Second home', home2.addr.zipCode || '');
        setMonthDay('3. Month', '3. Day', home2.start);
        setMonthDay('4. Month', '4. Day', home2.end);
        setField('1B. Total property taxes paid on second home', fmtMoney(home2.annualizedTax));
        setField('2B. Number of months lived in second home', String(home2.days));
        setField('3B. Percentage of the year that you owned and occupied second home', home2.percentage.toFixed(2) + '%');
        setField('4B. Multiply Line 1 by Line 3', fmtMoney(home2.proratedTax));
    }

    setField('5. Total property taxes paid', fmtMoney(totalProratedTax));

    homes.forEach((h, i) => {
        console.log(`PA-1000A: Home ${i + 1} - ${h.days} days, ${h.percentage.toFixed(2)}%, prorated $${h.proratedTax.toFixed(2)}`);
    });
    console.log(`PA-1000A: Total prorated (Line 5): $${totalProratedTax.toFixed(2)}`);

    const pdfBytes = await pa1000aDoc.save();
    return { pdfBytes, totalProratedTax };
}

/* ============================================================
 *  SCHEDULE F — PA-1000 F/G (lessees / deed-holders)
 * ============================================================ */

function mapRelationshipForScheduleF(raw) {
    if (!raw) return '';
    const r = String(raw).toLowerCase().trim();
    if (['parent','mother','father','mom','dad','stepparent','stepmother','stepfather'].includes(r)) return 'Parent';
    if (['child','son','daughter','stepchild'].includes(r)) return 'Child';
    if (['sibling','brother','sister','stepbrother','stepsister','half-brother','half-sister'].includes(r)) return 'Sibling';
    if (['grandparent','grandmother','grandfather'].includes(r)) return 'Grandparent';
    if (['grandchild','grandson','granddaughter'].includes(r)) return 'Grandchild';
    if (['aunt','uncle','aunt/uncle'].includes(r)) return 'Aunt/Uncle';
    if (['niece','nephew','niece/nephew'].includes(r)) return 'Niece/Nephew';
    if (r === 'cousin') return 'Cousin';
    if (r === 'friend') return 'Friend';
    return 'Other';
}

function resolveRelationshipForEntry(entry, ptrrApplicant) {
    if (!entry?.householdMemberId) return entry?.relationship || '';
    const rels = ptrrApplicant?.relationships || [];
    const rel = rels.find(r => r?.relatedMemberId === entry.householdMemberId);
    return mapRelationshipForScheduleF(rel?.relationship);
}

async function buildScheduleF({
    ptrrApplicant,
    spouse,
    sanitizedSSN,
    data,
    residenceStatus,
    propertyTaxBeforeF,
    rentBeforeF,
}) {
    const { PDFDocument } = PDFLib;
    const ptrrApp = ptrrApplicant?.PTRR?.application?.[0] || {};
    const rawOthers = Array.isArray(ptrrApp.scheduleF_othersOnLeaseOrDeed)
        ? ptrrApp.scheduleF_othersOnLeaseOrDeed
        : [];

    /* ---------- Build exclusion set: spouse + minor children ---------- */
    const hhMembersAll = Array.isArray(ptrrApplicant?.householdMembers)
        ? ptrrApplicant.householdMembers
        : (Array.isArray(data?.householdMembers) ? data.householdMembers : []);

    // Helper: age at Dec 31 of the tax year (from DOB; falls back to age string)
    const _taxYearForExcl = new Date().getFullYear() - 1;
    const _yearEndExcl = new Date(Date.UTC(_taxYearForExcl, 11, 31));
    const ageAtYearEndFromDob = (dobStr) => {
        if (!dobStr) return null;
        const dob = new Date(`${String(dobStr).slice(0, 10)}T00:00:00Z`);
        if (isNaN(dob)) return null;
        let a = _yearEndExcl.getUTCFullYear() - dob.getUTCFullYear();
        const beforeBday =
            _yearEndExcl.getUTCMonth() < dob.getUTCMonth() ||
            (_yearEndExcl.getUTCMonth() === dob.getUTCMonth() && _yearEndExcl.getUTCDate() < dob.getUTCDate());
        if (beforeBday) a--;
        return a;
    };
    const memberAgeAtYearEnd = (m) => {
        if (!m) return null;
        const fromDob = ageAtYearEndFromDob(m.dob);
        if (fromDob != null) return fromDob;
        const match = String(m.age || '').match(/(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    };

// ...existing code...
const excludedIds = new Set();

// Spouse (any way it's recorded — symmetric, so direction doesn't matter)
const spouseIdsRaw = [
    ptrrApplicant?.previousSpouseId,
    ptrrApplicant?.spouseId,
    spouse?.householdMemberId,
    ...((ptrrApplicant?.relationships || [])
        .filter(r => String(r?.relationship || '').toLowerCase() === 'spouse')
        .map(r => r.relatedMemberId)),
].filter(Boolean);
spouseIdsRaw.forEach(id => excludedIds.add(id));

// Also pick up spouse via reverse direction (other member -> applicant as "spouse")
hhMembersAll.forEach(m => {
    if (!m || m.householdMemberId === ptrrApplicant?.householdMemberId) return;
    (m.relationships || []).forEach(r => {
        if (r?.relatedMemberId === ptrrApplicant?.householdMemberId &&
            String(r?.relationship || '').toLowerCase() === 'spouse') {
            excludedIds.add(m.householdMemberId);
        }
    });
});

// ── Minor children of the applicant ──
// Convention: applicant.relationships[i].relationship = applicant's role
//   toward relatedMemberId.
//   "parent"   → applicant is parent of relatedMemberId → that ID is a CHILD.
//   "child"    → applicant labeled the related member as a child directly.
const APPLICANT_PARENT_LABELS = new Set([
    'parent','mother','father','mom','dad','stepparent','stepmother','stepfather'
]);
const CHILD_LABELS = new Set(['child','son','daughter','stepchild']);

const addIfMinor = (hhId) => {
    const child = hhMembersAll.find(m => m.householdMemberId === hhId);
    const a = memberAgeAtYearEnd(child);
    if (a != null && a < 18) excludedIds.add(hhId);
};

// Direction 1: applicant.relationships
(ptrrApplicant?.relationships || []).forEach(r => {
    const role = String(r?.relationship || '').toLowerCase();
    if (APPLICANT_PARENT_LABELS.has(role) || CHILD_LABELS.has(role)) {
        addIfMinor(r.relatedMemberId);
    }
});

// Direction 2 (defensive): another member's relationships pointing at applicant.
// If they say "child" toward applicant (their role toward applicant is child)
// → applicant is the child's something else; that's not us.
// If they say "parent" toward applicant → that other member is the applicant's parent.
// The case we want here is: other member's role toward applicant is "child"
//   meaning the OTHER is the child → applicant's child. Add if minor.
hhMembersAll.forEach(m => {
    if (!m || m.householdMemberId === ptrrApplicant?.householdMemberId) return;
    (m.relationships || []).forEach(r => {
        if (r?.relatedMemberId !== ptrrApplicant?.householdMemberId) return;
        const role = String(r?.relationship || '').toLowerCase();
        if (CHILD_LABELS.has(role)) addIfMinor(m.householdMemberId);
    });
});

const CHILD_REL_LABELS = new Set(['child','son','daughter','stepchild']);

const others = rawOthers.filter(e => {
    // Exclude linked household members flagged as spouse/minor child
    if (e?.householdMemberId && excludedIds.has(e.householdMemberId)) return false;

    // Only exclude MANUAL minors whose relationship is explicitly "child"
    const relRaw = String(e?.relationship || '').toLowerCase().trim();
    const isChildRel = CHILD_REL_LABELS.has(relRaw);
    if (isChildRel) {
        const fromDob = ageAtYearEndFromDob(e?.dob);
        const manualAge = fromDob != null
            ? fromDob
            : (() => {
                const m = String(e?.age ?? '').match(/(\d+)/);
                return m ? parseInt(m[1], 10) : NaN;
            })();
        if (Number.isFinite(manualAge) && manualAge < 18) return false;
    }

    return true;
});

if (rawOthers.length !== others.length) {
    console.log(`Schedule F: filtered out ${rawOthers.length - others.length} spouse/minor-child entr${rawOthers.length - others.length === 1 ? 'y' : 'ies'}.`);
}

    const eligible = (residenceStatus === 'owned' ||
                      residenceStatus === 'rented' ||
                      residenceStatus === 'rentedowned');

    // No-op pass-through when F isn't required.
    if (!eligible || others.length === 0) {
        return {
            pdfs: [],
            totalPeople: 0,
            copies: 0,
            adjustedPropertyTax: propertyTaxBeforeF || 0,
            adjustedTotalRent:   rentBeforeF       || 0,
        };
    }

    /* ---------- Line 2: eligible-claimant fraction ---------- */
    const isMarriedTogether =
        (ptrrApplicant?.previousMaritalStatus || '').toLowerCase().includes('married (living together)');

    // Helper: compute a person's age at Dec 31 of the tax year.
    const _taxYearForF = new Date().getFullYear() - 1;
    const _yearEndF = new Date(Date.UTC(_taxYearForF, 11, 31));
    const ageAtTaxYearEnd = (dobStr) => {
        if (!dobStr) return null;
        const dob = new Date(`${String(dobStr).slice(0, 10)}T00:00:00Z`);
        if (isNaN(dob)) return null;
        let a = _yearEndF.getUTCFullYear() - dob.getUTCFullYear();
        const beforeBday =
            _yearEndF.getUTCMonth() < dob.getUTCMonth() ||
            (_yearEndF.getUTCMonth() === dob.getUTCMonth() && _yearEndF.getUTCDate() < dob.getUTCDate());
        if (beforeBday) a--;
        return a;
    };

    const hhMembersF = Array.isArray(ptrrApplicant?.householdMembers)
        ? ptrrApplicant.householdMembers
        : (Array.isArray(data?.householdMembers) ? data.householdMembers : []);

    const resolveEntryAge = (entry) => {
        // Prefer DOB from the linked household member (most accurate)
        if (entry?.householdMemberId) {
            const hh = hhMembersF.find(m => m?.householdMemberId === entry.householdMemberId);
            if (hh) {
                const fromDob = ageAtTaxYearEnd(hh.dob);
                if (fromDob != null) return fromDob;
                const m = String(hh.age || '').match(/(\d+)/);
                if (m) return parseInt(m[1], 10);
            }
        }
        // Manual entry: try DOB then numeric age
        const fromDob = ageAtTaxYearEnd(entry?.dob);
        if (fromDob != null) return fromDob;
        const n = parseInt(entry?.age, 10);
        return Number.isNaN(n) ? null : n;
    };

    // Members 65+ at year end on the lease/deed do NOT count toward the
    // "other people" denominator (they're effectively eligible claimants too).
    const countableOthers = others.filter(e => {
        const a = resolveEntryAge(e);
        return a == null ? true : a < 65;
    });

    // Spouse and minor children are excluded entirely from Schedule F math —
    // they're already filtered out of `others`. The numerator is just the
    // claimant (1). Anyone else on the lease/deed goes in the denominator.
    const qualifyingClaimants =
        Number.isFinite(parseInt(ptrrApp.scheduleF_qualifyingClaimants))
            ? parseInt(ptrrApp.scheduleF_qualifyingClaimants)
            : 1;

    const totalPersons =
        Number.isFinite(parseInt(ptrrApp.scheduleF_totalPersons))
            ? parseInt(ptrrApp.scheduleF_totalPersons)
            : qualifyingClaimants + countableOthers.length;

    const eligiblePct = totalPersons > 0
        ? Math.max(0, Math.min(1, qualifyingClaimants / totalPersons))
        : 1;

    console.log('Schedule F age filter →', {
        totalOthers: others.length,
        excluded65Plus: others.length - countableOthers.length,
        countableOthers: countableOthers.length,
        qualifyingClaimants, totalPersons,
        eligiblePct: eligiblePct.toFixed(4),
    });

    /* ---------- Line 1 / Line 3 cascade ---------- */
    const startTax  = propertyTaxBeforeF || 0;
    const startRent = rentBeforeF        || 0;

    let fLine1 = 0;
    let adjustedTax  = startTax;
    let adjustedRent = startRent;

    if (residenceStatus === 'owned') {
        fLine1 = startTax;
        adjustedTax = fLine1 * eligiblePct;       // → PA-1000 Line 14
    } else if (residenceStatus === 'rented') {
        fLine1 = startRent;
        adjustedRent = fLine1 * eligiblePct;      // → PA-1000 Line 16
    } else { // rentedowned: print tax on form, but apply % to BOTH internally
        fLine1 = startTax;
        adjustedTax  = startTax  * eligiblePct;   // → PA-1000 Line 14
        adjustedRent = startRent * eligiblePct;   // → PA-1000 Line 16
    }
    const fLine3 = fLine1 * eligiblePct;

    console.log('Schedule F cascade →', {
        residenceStatus,
        qualifyingClaimants, totalPersons,
        eligiblePct: eligiblePct.toFixed(4),
        startTax, startRent,
        fLine1, fLine3,
        adjustedTax, adjustedRent,
    });

    /* ---------- Build PDFs ---------- */
    const claimantFullName = `${ptrrApplicant?.firstName || ''} ${ptrrApplicant?.middleInitial || ''} ${ptrrApplicant?.lastName || ''}`
        .replace(/\s+/g, ' ').trim();

    const taxYear = new Date().getFullYear() - 1;
    const computeAgeAtYearEnd = (dobStr) => {
        if (!dobStr) return '';
        const dob = new Date(`${String(dobStr).slice(0, 10)}T00:00:00Z`);
        if (isNaN(dob)) return '';
        const yearEnd = new Date(Date.UTC(taxYear, 11, 31));
        let age = yearEnd.getUTCFullYear() - dob.getUTCFullYear();
        const beforeBday =
            yearEnd.getUTCMonth() < dob.getUTCMonth() ||
            (yearEnd.getUTCMonth() === dob.getUTCMonth() && yearEnd.getUTCDate() < dob.getUTCDate());
        if (beforeBday) age--;
        return String(Math.max(0, age));
    };
    const claimantAge = computeAgeAtYearEnd(ptrrApplicant?.dob);

    const useMailing = (data.mailingAddressSameAsResidential || '').toLowerCase() === 'no';
    const claimAddr = {
        streetAddress:  useMailing ? (data.mailingStreetAddress  || '') : (data.streetAddress  || ''),
        streetAddress2: useMailing ? (data.mailingStreetAddress2 || '') : (data.streetAddress2 || ''),
        city:           useMailing ? (data.mailingCity           || '') : (data.city           || ''),
        state:          useMailing ? (data.mailingState          || '') : (data.state          || ''),
        zipCode:        useMailing ? (data.mailingZipCode        || '') : (data.zipCode        || ''),
    };
    const formatAddrOneLine = (a = {}) => [
        [a.streetAddress, a.streetAddress2].filter(Boolean).join(' '),
        [a.city, (a.state || '').toUpperCase().slice(0, 2)].filter(Boolean).join(', '),
        a.zipCode || ''
    ].filter(Boolean).join(', ').trim();
    const sameAsClaim = (a = {}) =>
        (a.streetAddress || '').trim().toLowerCase() === (claimAddr.streetAddress || '').trim().toLowerCase() &&
        (a.zipCode || '').trim() === (claimAddr.zipCode || '').trim();

    const fmtNoCommas = (n) => (Number(n) || 0).toFixed(2);

    const chunks = [];
    for (let i = 0; i < others.length; i += 2) chunks.push(others.slice(i, i + 2));

    const ROW_PREFIXES = ['2', '3'];
    const filledPdfs = [];

    for (let c = 0; c < chunks.length; c++) {
        const chunk = chunks[c];
        const fgBytes = await loadPDFAsset('2025_pa-1000f-g.pdf');
        const fgDoc   = await PDFDocument.load(fgBytes);
        const fgForm  = fgDoc.getForm();

        // Embed a font once so we can measure text width for auto-sizing.
        const helv = await fgDoc.embedFont(PDFLib.StandardFonts.Helvetica);

        const setField = (name, val) => {
            try {
                const tf = fgForm.getTextField(name);
                const text = val == null ? '' : String(val).toUpperCase(); // global UC patch hits later, but measure on UC
                if (!text) { tf.setText(''); return; }

                // Drop maxLength so long values still write.
                const max = tf.getMaxLength?.();
                if (typeof max === 'number' && text.length > max) {
                    tf.removeMaxLength?.();
                }

                // Find the widget rect to compute available width/height.
                let availW = 0, availH = 0;
                const widgets = tf.acroField?.getWidgets?.() || [];
                if (widgets.length) {
                    const r = widgets[0].getRectangle(); // { x, y, width, height }
                    availW = Math.max(0, r.width  - 4);  // small padding
                    availH = Math.max(0, r.height - 2);
                }

                // Pick the largest size that fits both width AND height.
                const DEFAULT = 10;
                const MIN     = 4;
                let chosen   = DEFAULT;
                if (availW > 0) {
                    for (let size = DEFAULT; size >= MIN; size -= 0.5) {
                        const w = helv.widthOfTextAtSize(text, size);
                        const h = helv.heightAtSize(size);
                        if (w <= availW && h <= (availH || h)) { chosen = size; break; }
                        chosen = size; // keep shrinking
                    }
                }

                tf.setFontSize(chosen);
                tf.setText(text);
            } catch (e) {
                console.warn(`PA-1000 F/G[${c + 1}]: ${name}:`, e.message);
            }
        };

        // Header
        setField('Name as shown on PA-1000', claimantFullName);
        setField('Social Security Number',  sanitizedSSN);

        // Row 1 — claimant
        setField("1. Claimant's name", claimantFullName);
        setField('1. Age', claimantAge);
        setField('1. Address if different than claim form', '');

        // Rows 2–3 — other people on deed/lease
        chunk.forEach((entry, i) => {
            const prefix = ROW_PREFIXES[i];

            // Resolve identity from the linked household member when applicable.
            let firstName = entry.firstName || '';
            let lastName  = entry.lastName  || '';
            let ageVal    = entry.age;

            if (entry.householdMemberId) {
                const hhMembers = Array.isArray(ptrrApplicant?.householdMembers)
                    ? ptrrApplicant.householdMembers
                    : (Array.isArray(data?.householdMembers) ? data.householdMembers : []);
                const hh = hhMembers.find(m => m?.householdMemberId === entry.householdMemberId);
                if (hh) {
                    firstName = hh.firstName || firstName;
                    lastName  = hh.lastName  || lastName;
                    // hh.age may be "52 Years, 3 Months" — extract leading int
                    const m = String(hh.age || '').match(/(\d+)/);
                    if (m) ageVal = parseInt(m[1], 10);
                }
            }

            const fullName = [firstName, lastName]
                .map(s => String(s || '').trim()).filter(Boolean).join(' ').trim();
            const ssn = String(entry.socialSecurityNumber || '').replace(/\D/g, '').slice(0, 9);
            const ageStr = ageVal == null || ageVal === '' ? '' : String(ageVal);
            const relationship = resolveRelationshipForEntry(entry, ptrrApplicant);

            let addrLine = '';
            if (entry.sameAddressAsClaimant === 'no') {
                addrLine = formatAddrOneLine(entry.address || {});
            } else if (entry.sameAddressAsClaimant == null && entry.address && !sameAsClaim(entry.address)) {
                addrLine = formatAddrOneLine(entry.address || {});
            }

            setField(`${prefix}. Name`, fullName);
            setField(`${prefix}. Age`, ageStr);
            setField(`${prefix}. Relationship`, relationship);
            setField(`${prefix}. Social Security Number`, ssn);
            setField(`${prefix}. Address if different than claim form`, addrLine);
        });

        // Lines 1 / 2 / 3 — only on the FIRST copy
        if (c === 0) {
            // 2A is decimal form (the form pre-prints ".") — two digits after the decimal: 0.50 → "50"
            // 2B is percentage form: 50% → "50"
            const eligiblePctInt   = Math.round(eligiblePct * 100);              // 0..100
            const eligibleDecimal2 = String(eligiblePctInt).padStart(2, '0');    // always 2 chars

            setField('1. Total property taxes or rent paid in 2021', fmtNoCommas(fLine1));
            setField('2A. Eligible claimant percentage', eligibleDecimal2);          // e.g. "50" → reads as .50
            setField('2B. Eligible claimant percentage', String(eligiblePctInt));    // e.g. "50" → reads as 50%
            setField(
                '3. Eligible property taxes or rent paid multiply the amount on line 1 by the percentage on line 2',
                fmtNoCommas(fLine3)
            );
        }

        const pdfBytes = await fgDoc.save();
        filledPdfs.push(pdfBytes);
        console.log(`Schedule F copy ${c + 1}/${chunks.length}: ${chunk.length} other(s); L1=${fLine1.toFixed(2)} × ${qualifyingClaimants}/${totalPersons} = L3=${fLine3.toFixed(2)}${c === 0 ? '' : ' (overflow only)'}.`);
    }

    return {
        pdfs: filledPdfs,
        totalPeople: others.length,
        copies: chunks.length,
        adjustedPropertyTax: adjustedTax,
        adjustedTotalRent:   adjustedRent,
    };
}

/* ============================================================
 *  SCHEDULE B / D / E — PA-1000 B/D/E (single shared PDF)
 *
 *  Pipeline order: B → D → E   (D and E both cascade off B)
 *
 *  - B: Widow/widower remarried during claim year. Reduces tax
 *       (owners/rentedowned) or rent (renters) by widow %.
 *  - D: TANF / cash public assistance. Reduces RENT only.
 *       Uses post-B rent if B triggered for a renter.
 *  - E: Mixed-use homestead. Scales by residence %.
 *         • rented        → Line 1 = post-B/D rent      → PA-1000 Line 16
 *         • owned         → Line 1 = post-B tax         → PA-1000 Line 14
 *         • rentedowned   → Line 1 = post-B tax only    → PA-1000 Line 14
 *           (rent for rentedowned does NOT pass through E)
 * ============================================================ */

async function buildScheduleBDE({
    ptrrApplicant,
    spouse,
    sanitizedSSN,
    residenceStatus,        // 'owned' | 'rented' | 'rentedowned'
    propertyTaxBeforeE,     // from Schedule A or raw PA-1000 calc
    totalRentBeforeE,       // sum of Line 8 across all PA-1000 RCs
}) {
    const { PDFDocument } = PDFLib;
    const ptrrApp = ptrrApplicant?.PTRR?.application?.[0] || {};
    const taxYear = new Date().getFullYear() - 1;
    const totalDaysInYear =
        ((taxYear % 4 === 0 && taxYear % 100 !== 0) || taxYear % 400 === 0) ? 366 : 365;

    const fmtNoCommas = (n) => (Number(n) || 0).toFixed(2);

    const isOwner  = residenceStatus === 'owned' || residenceStatus === 'rentedowned';
    const isRenter = residenceStatus === 'rented' || residenceStatus === 'rentedowned';

    /* ---------- Schedule B eligibility ---------- */
    const maritalRaw = (ptrrApplicant?.previousMaritalStatus || '').toLowerCase().trim();
    const wasWidowed = maritalRaw === 'widowed' || maritalRaw.includes('widow');
    const isDisabled = (ptrrApplicant?.disability || '').toLowerCase() === 'yes';

    const remarriageDate =
        ptrrApp.remarriageDate ||
        ptrrApp.ptrrRemarriageDate ||
        ptrrApp.dateOfRemarriage ||
        ptrrApplicant?.remarriageDate ||
        '';

    let remarry = null;
    let remarriageInTaxYear = false;
    if (remarriageDate) {
        remarry = new Date(`${String(remarriageDate).slice(0, 10)}T00:00:00Z`);
        if (!isNaN(remarry) && remarry.getUTCFullYear() === taxYear) remarriageInTaxYear = true;
    }

    let applicantAgeAtYearEnd = null;
    if (ptrrApplicant?.dob) {
        const dob = new Date(`${String(ptrrApplicant.dob).slice(0, 10)}T00:00:00Z`);
        if (!isNaN(dob)) {
            const yearEnd = new Date(Date.UTC(taxYear, 11, 31));
            applicantAgeAtYearEnd = yearEnd.getUTCFullYear() - dob.getUTCFullYear();
            const beforeBday =
                yearEnd.getUTCMonth() < dob.getUTCMonth() ||
                (yearEnd.getUTCMonth() === dob.getUTCMonth() && yearEnd.getUTCDate() < dob.getUTCDate());
            if (beforeBday) applicantAgeAtYearEnd--;
        }
    }
    const qualifiesAsWidow5064 =
        wasWidowed && !isDisabled &&
        applicantAgeAtYearEnd != null &&
        applicantAgeAtYearEnd >= 50 && applicantAgeAtYearEnd <= 64;

        const currentMaritalRaw = (ptrrApplicant?.maritalStatus || ptrrApplicant?.currentMaritalStatus || '').toLowerCase().trim();
    const stillWidowed = currentMaritalRaw === 'widowed' || currentMaritalRaw.includes('widow');

    const scheduleBNeeded = qualifiesAsWidow5064 && remarriageInTaxYear && !stillWidowed;

    /* ---------- Schedule D eligibility (rent only) ---------- */
    const allIncome = [...(ptrrApplicant?.income || []), ...(spouse?.income || [])];
    const tanfEntries = allIncome.filter(
        (inc) => inc?.type?.toLowerCase() === 'previous' && inc?.kind?.toLowerCase() === 'tanf'
    );
    let monthsOnAssistance = tanfEntries.reduce(
        (sum, inc) => sum + fullMonthsBetween(inc.startDate, inc.endDate),
        0
    );
    monthsOnAssistance = Math.min(12, monthsOnAssistance);
    const scheduleDNeeded = isRenter && tanfEntries.length > 0 && monthsOnAssistance > 0;

    /* ---------- Schedule E eligibility ---------- */
    const mixedUse = (ptrrApp.scheduleE_mixedUse || '').toLowerCase() === 'yes';
    const rawPct   = parseFloat(ptrrApp.scheduleE_residencePercent);
    const residencePct = (mixedUse && !isNaN(rawPct)) ? Math.max(0, Math.min(100, rawPct)) : 100;
    const scheduleENeeded = mixedUse && residencePct < 100;

    /* ============================================================
     *  CASCADE: B → D (rent) → E
     * ============================================================ */
    const startTax  = propertyTaxBeforeE || 0;
    const startRent = totalRentBeforeE   || 0;

    let curTax  = startTax;
    let curRent = startRent;

    // ----- Schedule B math -----
    // Line 4 = Line 1 × Line 3 (displayed rounded percentage)
    let widowDays = 0;
    let widowDisplayedPct = 0;     // integer % printed on Line 3
    let widowFactor = 1;           // = displayed % / 100  (used for Line 4 + cascade)
    let bLine1 = 0, bLine4 = 0;

    if (scheduleBNeeded) {
        const yearStart = new Date(Date.UTC(taxYear, 0, 1));
        const yearEnd   = new Date(Date.UTC(taxYear, 11, 31));
        let windowEnd = new Date(remarry.getTime() - 86400000);
        if (windowEnd > yearEnd)   windowEnd = yearEnd;
        if (windowEnd < yearStart) windowEnd = yearStart;
        widowDays = Math.max(0, Math.min(totalDaysInYear,
            Math.round((windowEnd - yearStart) / 86400000) + 1));
        widowDisplayedPct = Math.round((widowDays / totalDaysInYear) * 100);
        widowFactor = widowDisplayedPct / 100;

        // Line 1 source per your spec
        if (residenceStatus === 'rented') {
            bLine1 = startRent;
        } else {
            // owned or rentedowned → property tax only
            bLine1 = startTax;
        }
        bLine4 = bLine1 * widowFactor;

        // Cascade: apply widow factor to BOTH tax and rent so D/E see post-B values.
        curTax  = startTax  * widowFactor;
        curRent = startRent * widowFactor;
    }

    // ----- Schedule D math (rent only) -----
    let dLine2 = 0, dLine3 = 0, dLine4 = 0;
    if (scheduleDNeeded) {
        // If B was needed and renter, use B Line 4. Otherwise use raw rent total.
        dLine2 = (scheduleBNeeded && residenceStatus === 'rented') ? bLine4 : startRent;
        // For rentedowned with B, post-B rent = curRent (= startRent * widowFactor)
        if (scheduleBNeeded && residenceStatus === 'rentedowned') {
            dLine2 = curRent;
        }
        dLine3 = (dLine2 / 12) * monthsOnAssistance;   // (Line 2 / 12) × Line 1
        dLine4 = Math.max(0, dLine2 - dLine3);
        curRent = dLine4;
    }

    // ----- Schedule E math -----
    // Line 1 source:
    //   rented      → curRent (post-B/D rent)
    //   owned       → curTax  (post-B tax)
    //   rentedowned → curTax  (post-B tax) ONLY — rent does not enter E
    const eFactor = scheduleENeeded ? (residencePct / 100) : 1;
    let eLine1 = 0, eLine3 = 0;
    if (scheduleENeeded) {
        if (residenceStatus === 'rented') {
            eLine1 = curRent;
            eLine3 = eLine1 * eFactor;
            curRent = eLine3;            // → PA-1000 Line 16
        } else if (residenceStatus === 'owned') {
            eLine1 = curTax;
            eLine3 = eLine1 * eFactor;
            curTax = eLine3;             // → PA-1000 Line 14
        } else { // rentedowned
            eLine1 = curTax;             // tax only on Schedule E
            eLine3 = eLine1 * eFactor;
            curTax = eLine3;             // → PA-1000 Line 14
            // curRent unchanged (no E adjustment for rent in rentedowned)
        }
    }

    console.log('Schedule B/D/E cascade →', {
        residenceStatus,
        scheduleBNeeded, scheduleDNeeded, scheduleENeeded,
        startTax, startRent,
        afterB:  { tax: curTax, rent: scheduleDNeeded ? dLine2 : curRent },
        afterD:  { rent: scheduleDNeeded ? dLine4 : '(n/a)' },
        finalTax: curTax, finalRent: curRent,
        widowDisplayedPct, monthsOnAssistance, residencePct,
    });

    if (!scheduleBNeeded && !scheduleDNeeded && !scheduleENeeded) {
        return {
            pdfBytes: null,
            adjustedPropertyTax: startTax,
            adjustedTotalRent:   startRent,
        };
    }

    /* ============================================================
     *  LOAD + FILL THE PDF
     * ============================================================ */
    const bdeBytes = await loadPDFAsset('2025_pa-1000b-d-e.pdf');
    const bdeDoc   = await PDFDocument.load(bdeBytes);
    const bdeForm  = bdeDoc.getForm();

    const setField = (name, val) => {
        try { bdeForm.getTextField(name).setText(val == null ? '' : String(val)); }
        catch (e) { console.warn(`PA-1000 B/D/E: ${name}:`, e.message); }
    };

    const fullName = `${ptrrApplicant?.firstName || ''} ${ptrrApplicant?.middleInitial || ''} ${ptrrApplicant?.lastName || ''}`.trim();
    setField('Name as shown on PA-1000', fullName);
    setField('Social Security Number', sanitizedSSN);

    /* ---------- SCHEDULE B ---------- */
    if (scheduleBNeeded) {
        console.log('🔍 Sched B values about to write:', {
            bLine1, widowDays, widowDisplayedPct, bLine4,
            startRent, startTax, residenceStatus,
        });
        // List actual field names once for sanity:
        bdeForm.getFields().forEach(f => console.log('FIELD:', f.getName()));

        setField('1. Total property tax or rent', fmtNoCommas(bLine1));
        setField('2. Number of days you were a widow or widower', String(widowDays));
        setField('3. Percentage of the year you were a widow or widower', String(widowDisplayedPct));
        setField('4. Eligible property taxes or rent paid', fmtNoCommas(bLine4));
        setField('5. Month', String(remarry.getUTCMonth() + 1).padStart(2, '0'));
        setField('5. Day',   String(remarry.getUTCDate()).padStart(2, '0'));
        console.log(`Schedule B: L1=${bLine1.toFixed(2)} × ${widowDisplayedPct}% → L4=${bLine4.toFixed(2)}`);
    }

    /* ---------- SCHEDULE D (rent only) ---------- */
    if (scheduleDNeeded) {
        setField('1. Total Number of months received cash public assistance', String(monthsOnAssistance));
        setField('2. Total rent that you paid in 2021', fmtNoCommas(dLine2));
        setField('3. Total rent you paid during the months that you received cash public assistance', fmtNoCommas(dLine3));
        setField('4. Eligible rent paid', fmtNoCommas(dLine4));
        console.log(`Schedule D: months=${monthsOnAssistance}, L2=${dLine2.toFixed(2)}, L3=${dLine3.toFixed(2)}, L4=${dLine4.toFixed(2)}`);
    }

    /* ---------- SCHEDULE E ---------- */
    if (scheduleENeeded) {
        setField('1. Total property taxes or rent paid', fmtNoCommas(eLine1));

        const pctInt = Math.floor(residencePct);
        const pctDec = Math.round((residencePct - pctInt) * 100);
        setField('2. Percentage', String(pctInt));
        setField('Percentage of home used as residence', String(pctInt));
        setField('3. Eligible property taxes or rent paid', fmtNoCommas(eLine3));
        console.log(`Schedule E @ ${residencePct}% (${residenceStatus}): L1=${eLine1.toFixed(2)} → L3=${eLine3.toFixed(2)}`);
    }

    const pdfBytes = await bdeDoc.save();
    return {
        pdfBytes,
        adjustedPropertyTax: curTax,   // → PA-1000 Line 14 (owners / rentedowned)
        adjustedTotalRent:   curRent,  // → PA-1000 Line 16 (renters / rentedowned)
    };
}

/* ============================================================
 *  MAIN — generatePDF
 * ============================================================ */

async function generatePDF(data) {
    const { PDFDocument } = PDFLib;

    // Force ALL CAPS for every text written to any PDF.
    (function enableGlobalUpperCase() {
        if (PDFLib.__uppercasePatched) return;
        PDFLib.__uppercasePatched = true;
        const toUpper = (v) => (v == null ? v : String(v).toUpperCase());
        const tfProto = PDFLib.PDFTextField && PDFLib.PDFTextField.prototype;
        if (tfProto && tfProto.setText) {
            const orig = tfProto.setText;
            tfProto.setText = function (text) { return orig.call(this, toUpper(text)); };
        }
        const pageProto = PDFLib.PDFPage && PDFLib.PDFPage.prototype;
        if (pageProto && pageProto.drawText) {
            const orig = pageProto.drawText;
            pageProto.drawText = function (text, options) { return orig.call(this, toUpper(text), options); };
        }
    })();

    // Load main PA-1000 template
    const pdfBytes = await fetch('/assets/2025_pa-1000.pdf').then((res) => res.arrayBuffer());
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();

    const ptrrApplicant = data.householdMembers?.find(
        (member) => member.PTRR?.application?.some((app) => app.applying === true)
    );

    // Claimant deceased
    try {
        const applicantPTRRApp = ptrrApplicant?.PTRR?.application?.[0] || null;
        const claimantDeceasedAnswer  = applicantPTRRApp?.ptrrDeceasedAnswer;
        const claimantDeceasedDateRaw = applicantPTRRApp?.ptrrDeceasedDate;

        const claimantDeceasedCheck = form.getCheckBox('Click on oval if claimant is deceased');
        const page = pdfDoc.getPages()[0];
        const deathDateCoords = { x: 519, y: 482 };

        if (claimantDeceasedAnswer === 'yes') {
            if (claimantDeceasedCheck) claimantDeceasedCheck.check();
            const formattedClaimantDeath = claimantDeceasedDateRaw
                ? new Date(new Date(`${claimantDeceasedDateRaw}T00:00:00Z`).getTime() + 86400000)
                      .toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' })
                : '';
            page.drawText(formattedClaimantDeath, {
                x: deathDateCoords.x, y: deathDateCoords.y, size: 8,
                font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
                color: PDFLib.rgb(0, 0, 0),
            });
        } else if (claimantDeceasedCheck) {
            claimantDeceasedCheck.uncheck();
        }
    } catch (error) {
        console.error('Error processing claimant deceased:', error.message);
    }

    const spouse = data.householdMembers?.find((m) => m.householdMemberId === ptrrApplicant?.previousSpouseId);
    if (spouse) console.log('Spouse found:', spouse);
    else console.warn('No spouse found in household members.');

    // Basic identity
    form.getTextField('Use ALL CAPS to enter first name (10 spaces limit)').setText(ptrrApplicant?.firstName || '');
    form.getTextField('Your Middle Initial').setText(ptrrApplicant?.middleInitial || '');
    form.getTextField('Use ALL CAPS to enter last name (13 spaces limit)').setText(ptrrApplicant?.lastName || '');

    const formattedDob = ptrrApplicant?.dob
        ? new Date(new Date(`${ptrrApplicant.dob}T00:00:00Z`).getTime() + 86400000)
              .toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' })
        : '';

    const rawSSN = ptrrApplicant?.socialSecurityNumber || '';
    const sanitizedSSN = rawSSN.replace(/[-\s]/g, '');
    form.getTextField('Enter your SSN without dashes or spaces').setText(sanitizedSSN);
    form.getTextField('Enter claimant\'s birthdate in mm/dd/yy format').setText(formattedDob);

    // Address
    const useMailing = (data.mailingAddressSameAsResidential || '').toLowerCase() === 'no';
    const addrLine1 = useMailing ? (data.mailingStreetAddress  || '') : (data.streetAddress  || '');
    const addrLine2 = useMailing ? (data.mailingStreetAddress2 || '') : (data.streetAddress2 || '');
    const addrCity  = useMailing ? (data.mailingCity           || '') : (data.city           || '');
    const addrState = useMailing ? (data.mailingState          || '') : (data.state          || '');
    const addrZip   = useMailing ? (data.mailingZipCode        || '') : (data.zipCode        || '');

    form.getTextField('Use ALL CAPS to enter first line of address').setText(addrLine1);
    form.getTextField('Use ALL CAPS to enter second line of address').setText(addrLine2);
    form.getTextField('Use ALL CAPS to enter city or post office').setText(addrCity);
    form.getTextField('Use ALL CAPS to enter two-character state abbreviation').setText(addrState.toUpperCase().slice(0, 2));
    form.getTextField('Enter five-digit ZIP Code').setText(addrZip);

    // Spouse info
    if (spouse) {
        try {
            form.getTextField('Use ALL CAPS to enter spouse\'s first name (10 spaces limit)').setText(spouse.firstName || '');
            const formattedSpouseDob = spouse.dob
                ? new Date(new Date(`${spouse.dob}T00:00:00Z`).getTime() + 86400000)
                      .toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' })
                : '';
            form.getTextField('Enter spouse\'s birthdate in mm/dd/yy format').setText(formattedSpouseDob);

            const rawSp = (spouse.socialSecurityNumber || '').replace(/[-\s]/g, '');
            if (rawSp.length === 9) form.getTextField('Enter spouse\'s SSN without dashes or spaces').setText(rawSp);
            form.getTextField('Spouse - Middle Initial').setText(spouse.middleInitial || '');
        } catch (error) {
            console.error('Error adding spouse info:', error.message);
        }
    }

    // Spouse deceased + DOD
    const spouseDeceasedField = form.getCheckBox('Click on oval if spouse is deceased');
    if (spouseDeceasedField) {
        const maritalStatus = ptrrApplicant?.previousMaritalStatus?.toLowerCase().trim();

        // Only mark spouse deceased if claimant qualifies for oval C
        // (widowed AND age 50–64 at end of prior tax year)
        let qualifiesForOvalC = false;
        if (maritalStatus === 'widowed' && ptrrApplicant?.dob) {
            const lastYear = new Date().getFullYear() - 1;
            const ageAtYearEnd = lastYear - new Date(ptrrApplicant.dob).getFullYear();
            const isDisabled = (ptrrApplicant?.disability || '').toLowerCase() === 'yes';
            if (ageAtYearEnd >= 50 && ageAtYearEnd <= 64 && !isDisabled) {
                qualifiesForOvalC = true;
            }
        }

        if (qualifiesForOvalC) {
            spouseDeceasedField.check();
            if (ptrrApplicant?.dateOfSpousePassing) {
                const formattedDateOfDeath = new Date(new Date(`${ptrrApplicant.dateOfSpousePassing}T00:00:00Z`).getTime() + 86400000)
                    .toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' });
                pdfDoc.getPages()[0].drawText(formattedDateOfDeath, {
                    x: 519, y: 463, size: 8,
                    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
                    color: PDFLib.rgb(0, 0, 0),
                });
            }
        } else {
            spouseDeceasedField.uncheck();
        }
    }

    const page = pdfDoc.getPages()[0];

    // Residence ovals
    const ownerOval       = { x: 461, y: 656 };
    const renterOval      = { x: 461, y: 638 };
    const renterownerOval = { x: 461, y: 627 };
    const drawOval = (c) => page.drawEllipse({ x: c.x, y: c.y, xScale: 5, yScale: 5, color: PDFLib.rgb(0, 0, 0) });
    if (data.residenceStatus === 'owned')        drawOval(ownerOval);
    else if (data.residenceStatus === 'rented')  drawOval(renterOval);
    else if (data.residenceStatus === 'rentedowned') drawOval(renterownerOval);

    // Claimant status ovals (A/B/C/D)
    const claimantStatusOvals = {
        A: { x: 461, y: 587 }, B: { x: 461, y: 576 },
        C: { x: 461, y: 541 }, D: { x: 461, y: 522 },
    };
    const lastYear = new Date().getFullYear() - 1;
    let applicantAge65OrOlder = false;
    if (ptrrApplicant?.dob) {
        const applicantAge = lastYear - new Date(ptrrApplicant.dob).getFullYear();
        if (applicantAge >= 65) {
            applicantAge65OrOlder = true;
            drawOval(claimantStatusOvals.A);
        }
    }
    if (!applicantAge65OrOlder && spouse?.dob) {
        const spouseAge = lastYear - new Date(spouse.dob).getFullYear();
        if (spouseAge >= 65) drawOval(claimantStatusOvals.B);
    }
    if (ptrrApplicant?.previousMaritalStatus?.toLowerCase().trim() === 'widowed' && ptrrApplicant?.dob) {
        const a = lastYear - new Date(ptrrApplicant.dob).getFullYear();
        const isDisabled = (ptrrApplicant?.disability || '').toLowerCase() === 'yes';
        if (a >= 50 && a <= 64 && !isDisabled) drawOval(claimantStatusOvals.C);
    }
    if (ptrrApplicant?.disability?.toLowerCase() === 'yes' && ptrrApplicant?.dob) {
        const a = lastYear - new Date(ptrrApplicant.dob).getFullYear();
        if (a >= 18 && a <= 64) drawOval(claimantStatusOvals.D);
    }

    const countyCodes = {
        "Adams": "01",
        "Allegheny": "02",
        "Armstrong": "03",
        "Beaver": "04",
        "Bedford": "05",
        "Berks": "06",
        "Blair": "07",
        "Bradford": "08",
        "Bucks": "09",
        "Butler": "10",
        "Cambria": "11",
        "Cameron": "12",
        "Carbon": "13",
        "Centre": "14",
        "Chester": "15",
        "Clarion": "16",
        "Clearfield": "17",
        "Clinton": "18",
        "Columbia": "19",
        "Crawford": "20",
        "Cumberland": "21",
        "Dauphin": "22",
        "Delaware": "23",
        "Elk": "24",
        "Erie": "25",
        "Fayette": "26",
        "Forest": "27",
        "Franklin": "28",
        "Fulton": "29",
        "Greene": "30",
        "Huntingdon": "31",
        "Indiana": "32",
        "Jefferson": "33",
        "Juniata": "34",
        "Lackawanna": "35",
        "Lancaster": "36",
        "Lawrence": "37",
        "Lebanon": "38",
        "Lehigh": "39",
        "Luzerne": "40",
        "Lycoming": "41",
        "McKean": "42",
        "Monroe": "43",
        "Montgomery": "44",
        "Montour": "45",
        "Northampton": "46",
        "Northumberland": "47",
        "Perry": "48",
        "Philadelphia": "49",
        "Pike": "50",
        "Potter": "51",
        "Schuylkill": "52",
        "Snyder": "53",
        "Somerset": "54",
        "Sullivan": "55",
        "Susquehanna": "56",
        "Tioga": "57",
        "Union": "58",
        "Venango": "59",
        "Warren": "60",
        "Washington": "61",
        "Wayne": "62",
        "Westmoreland": "63",
        "Wyoming": "64",
        "York": "65"
    };
    
    const schoolDistrictCodes = {
        "Adams": {
            "Bermudian Springs School District": "01110",
            "Conewago Valley School District": "01160",
            "Fairfield Area School District": "01305",
            "Gettysburg Area School District": "01375",
            "Littlestown Area School District": "01520",
            "Upper Adams School District": "01852"
        },
        "Allegheny": {
            "Allegheny Valley School District": "02060",
            "Avonworth School District": "02075",
            "Baldwin-Whitehall School District": "02110",
            "Bethel Park School District": "02125",
            "Brentwood Borough School District": "02145"
        },
        "Armstrong": {
            "Apollo-Ridge School District": "03010",
            "Armstrong School District": "03020",
            "Bradys Bend Area School District": "03100",
            "Kittanning Area School District": "03420",
            "Leechburg Area School District": "03450"
        },
        "Beaver": {
            "Aliquippa School District": "04010",
            "Ambridge Area School District": "04020",
            "Beaver Area School District": "04050",
            "Blackhawk School District": "04100",
            "Center Area School District": "04130"
        },
        "Bedford": {
            "Bedford Area School District": "05010",
            "Everett Area School District": "05100",
            "Fulton County School District": "05200",
            "Northern Bedford County School District": "05400",
            "Southern Bedford County School District": "05500"
        },
        "Berks": {
            "Antietam School District": "06010",
            "Boyertown Area School District": "06030",
            "Brandywine Heights Area School District": "06040",
            "Daniel Boone Area School District": "06060",
            "East Penn School District": "06110"
        },
        "Blair": {
            "Altoona Area School District": "07010",
            "Bellwood-Antis School District": "07020",
            "Claysburg-Kimmel School District": "07100",
            "Hollidaysburg Area School District": "07300",
            "Juniata Valley School District": "07400"
        },
        "Bradford": {
            "Athens Area School District": "08010",
            "Bradford Area School District": "08020",
            "Canton Area School District": "08100",
            "Sayre Area School District": "08500",
            "Troy Area School District": "08700"
        },
        "Bucks": {
            "Bensalem Township School District": "09010",
            "Bristol Borough School District": "09020",
            "Bristol Township School District": "09030",
            "Buckingham Township School District": "09040",
            "Central Bucks School District": "09100"
        },
        "Butler": {
            "Butler Area School District": "10010",
            "Cabot School District": "10020",
            "Connoquenessing Area School District": "10100",
            "Hampton Township School District": "10300",
            "Mars Area School District": "10400"
        },
        "Cambria": {
            "Cambria Heights School District": "11010",
            "Conemaugh Valley School District": "11100",
            "Ferndale Area School District": "11200",
            "Greater Johnstown School District": "11300",
            "Northern Cambria School District": "11400"
        },
        "Cameron": {
            "Cameron County School District": "12010"
        },
        "Carbon": {
            "Lehighton Area School District": "13060",
            "Palmerton Area School District": "13120",
            "Souderton Area School District": "13180",
            "Weatherly Area School District": "13260"
        },
        "Centre": {
            "Bellefonte Area School District": "14010",
            "State College Area School District": "14400",
            "Philipsburg-Osceola Area School District": "14300"
        },
        "Chester": {
            "Avon Grove School District": "15010",
            "Coatesville Area School District": "15100",
            "Downingtown Area School District": "15200",
            "Great Valley School District": "15300",
            "Kennett Consolidated School District": "15400"
        },
        "Clarion": {
            "Clarion Area School District": "16010",
            "Eldred School District": "16100",
            "Forest Area School District": "16200",
            "Keystone School District": "16300",
            "Redbank Valley School District": "16500"
        },
        "Clearfield": {
            "Curwensville Area School District": "17010",
            "DuBois Area School District": "17100",
            "Graffius School District": "17200",
            "Moshannon Valley School District": "17400",
            "West Branch Area School District": "17500"
        },
        "Clinton": {
            "Clinton County School District": "18010",
            "Muncy School District": "18200"
        },
        "Columbia": {
            "Berwick Area School District": "19010",
            "Bloomsburg Area School District": "19100",
            "Central Columbia School District": "19200",
            "Danville Area School District": "19300",
            "Millville Area School District": "19400"
        },
        "Crawford": {
            "Cranberry Area School District": "20010",
            "Conneaut Area School District": "20100",
            "Linesville Area School District": "20300",
            "Meadville Area School District": "20400",
            "Northwestern School District": "20500"
        },
        "Cumberland": {
            "Cumberland Valley School District": "21010",
            "East Pennsboro Area School District": "21100",
            "Shippensburg Area School District": "21300",
            "South Middleton School District": "21400",
            "West Shore School District": "21500"
        },
        "Dauphin": {
            "Central Dauphin School District": "22020",
            "Dauphin County Technical School": "22100",
            "Halifax Area School District": "22300",
            "Harrisburg School District": "22400",
            "Lower Dauphin School District": "22500"
        },
        "Delaware": {
            "Chichester School District": "23010",
            "Concord School District": "23100",
            "Delaware County Technical School": "23200",
            "Garnet Valley School District": "23300",
            "Haverford Township School District": "23400"
        },
        "Elk": {
            "Elk County School District": "24010"
        },
        "Erie": {
            "Corry Area School District": "25010",
            "Erie City School District": "25100",
            "Fairview School District": "25200",
            "Fort LeBoeuf School District": "25300",
            "Girard School District": "25400"
        },
        "Fayette": {
            "Albert Gallatin Area School District": "26010",
            "Brownsville Area School District": "26100",
            "Connellsville Area School District": "26200",
            "Fayette County Area School District": "26300",
            "Uniontown Area School District": "26500"
        },
        'Forest': {
            'Forest Area School District': '27010'
        },
        "Franklin": {
            "Chambersburg Area School District": "28010",
            "Fannett-Metal School District": "28100",
            "Greencastle-Antrim School District": "28200",
            "Shippensburg Area School District": "28300"
        },
        "Fulton": {
            "Fulton County School District": "29010"
        },
        "Greene": {
            "Greene County School District": "30010",
            "Jefferson-Morgan School District": "30100"
        },
        "Huntingdon": {
            "Huntingdon Area School District": "31010",
            "Mount Union Area School District": "31200",
            "Southern Huntingdon County School District": "31400"
        },
        "Indiana": {
            "Indiana Area School District": "32010",
            "Penns Manor Area School District": "32100",
            "Purchase Line School District": "32300"
        },
        "Jefferson": {
            "Brookville Area School District": "33010",
            "DuBois Area School District": "33100",
            "Punxsutawney Area School District": "33300"
        },
        "Juniata": {
            "Juniata County School District": "34010"
        },
        "Lackawanna": {
            "Carbondale Area School District": "35010",
            "Lakeland School District": "35100",
            "Mid Valley School District": "35200",
            "North Pocono School District": "35300",
            "Scranton School District": "35400"
        },
        "Lancaster": {
            "Conestoga Valley School District": "36020",
            "Cocalico School District": "36100",
            "Columbia Borough School District": "36150",
            "Donegal School District": "36200",
            "Ephrata Area School District": "36300"
        },
        "Lawrence": {
            "Ellwood City Area School District": "37010",
            "Lawrence County School District": "37100",
            "Neshannock Township School District": "37200"
        },
        "Lebanon": {
            "Annville-Cleona School District": "38010",
            "Cornwall-Lebanon School District": "38100",
            "Eastern Lebanon County School District": "38200",
            "Lebanon School District": "38300",
            "Northern Lebanon School District": "38400"
        },
        "Lehigh": {
            "Allentown School District": "39010",
            "Catasauqua Area School District": "39100",
            "East Penn School District": "39150",
            "Northern Lehigh School District": "39300",
            "Parkland School District": "39400"
        },
        "Luzerne": {
            "Dallas School District": "40010",
            "Hazleton Area School District": "40100",
            "Kingston Area School District": "40200",
            "Lake-Lehman School District": "40300",
            "Nanticoke Area School District": "40500"
        },
        "Lycoming": {
            "Canton Area School District": "41010",
            "Muncy School District": "41100",
            "South Williamsport Area School District": "41400",
            "Wellsboro Area School District": "41500"
        },
        "McKean": {
            "Bradford Area School District": "42010",
            "Cameron County School District": "42100",
            "Port Allegany School District": "42300"
        },
        "Monroe": {
            "East Stroudsburg Area School District": "43010",
            "Pleasant Valley School District": "43100",
            "Stroudsburg Area School District": "43200"
        },
        "Montgomery": {
            "Abington School District": "44010",
            "Cheltenham Township School District": "44100",
            "Hatboro-Horsham School District": "44300",
            "Lower Merion School District": "44400",
            "Methacton School District": "44500"
        },
        "Montour": {
            "Montour School District": "45010"
        },
        "Northampton": {
            "Bethlehem Area School District": "46010",
            "Easton Area School District": "46100",
            "Nazareth Area School District": "46200",
            "Northampton Area School District": "46300",
            "Pen Argyl Area School District": "46400"
        },
        "Northumberland": {
            "Danville Area School District": "47010",
            "Line Mountain School District": "47100",
            "Milton Area School District": "47200",
            "Shamokin Area School District": "47400",
            "Warrior Run School District": "47500"
        },
        "Perry": {
            "Duncannon Borough School District": "48010",
            "Newport School District": "48100",
            "Susquenita School District": "48300"
        },
        "Philadelphia": {
            "Philadelphia City School District": "49010"
        },
        "Pike": {
            "Delaware Valley School District": "50010",
            "Wallenpaupack Area School District": "50200"
        },
        "Potter": {
            "Coudersport Area School District": "51010",
            "Oswayo Valley School District": "51200"
        },
        "Schuylkill": {
            "Blue Mountain School District": "52010",  
            "Mahanoy Area School District": "52100",
            "Minersville Area School District": "52200",
            "North Schuylkill School District": "52400",
            "Pottsville Area School District": "52500"
        },
        "Snyder": {
            "Middleburg Area School District": "53010",
            "Selinsgrove Area School District": "53100",
            "Shamokin Dam Area School District": "53200"
        },
        "Somerset": {
            "Conemaugh Township Area School District": "54010",
            "North Star School District": "54100",
            "Rockwood Area School District": "54300",
            "Somerset Area School District": "54400"
        },
        "Sullivan": {
            "Sullivan County School District": "55010"
        },
        "Susquehanna": {
            "Forest City Regional School District": "56010",
            "Montrose Area School District": "56100"
        },
        "Tioga": {
            "Elkland Area School District": "57010",
            "Wellsboro Area School District": "57100"
        },
        "Union": {
            "Lewisburg Area School District": "58010",
            "Mifflinburg Area School District": "58100"
        },
        "Venango": {
            "Cranberry Area School District": "59010",
            "Franklin Area School District": "59100",
            "Oil City Area School District": "59300"
        },
        "Warren": {
            "Warren County School District": "60010"
        },
        "Washington": {
            "Bentleyville School District": "61010",
            "California Area School District": "61100",
            "Charleroi Area School District": "61200",
            "Fort Cherry School District": "61300",
            "McGuffey School District": "61500"
        },
        "Wayne": {
            "Honesdale School District": "62010",
            "Wallenpaupack Area School District": "62100"
        },
        "Westmoreland": {
            "Derry Area School District": "63010",
            "Greensburg-Salem School District": "63100",
            "Hempfield Area School District": "63200",
            "Jeannette City School District": "63300",
            "Latrobe Area School District": "63400"
        },
        "Wyoming": {
            "Tunkhannock Area School District": "64010"
        },
        "York": {
            "Central York School District": "65010",
            "Dallastown Area School District": "65100",
            "Eastern York School District": "65200",
            "Hanover Public School District": "65300",
            "Red Lion Area School District": "65500"
        }
    };
    
    const selectedCounty = data.county;
    const countyCode = countyCodes[selectedCounty] || '';
    form.getTextField('Enter the two-digit county code from the list on page 15').setText(countyCode);

    const selectedSchoolDistrict = data.schoolDistrict;
    const schoolDistrictCode = schoolDistrictCodes[selectedCounty]?.[selectedSchoolDistrict] || '';
    form.getTextField('Enter the five-digit school district code from the list on pages 16 and 17').setText(schoolDistrictCode);

    const countryCodeField = form.getTextField('Enter the two-character country code');
    if (countryCodeField) countryCodeField.setText('US');

    // Phone
    const phoneNumberField = form.getTextField('Enter claimant’s daytime telephone number');
    if (phoneNumberField) {
        const phoneNumber = (data.phoneNumber || '').replace(/[()\-\s]/g, '').slice(0, 10);
        phoneNumberField.setText(phoneNumber);
    }

    // ============================================================
    //  INCOME CALCULATIONS  (unchanged)
    // ============================================================
    function calculateYearlyIncome(income) {
        const amount = parseFloat(income.amount) || 0;
        if (!amount) return 0;

        const taxYear = new Date().getFullYear() - 1;
        const yearStart = new Date(Date.UTC(taxYear, 0, 1));
        const yearEnd   = new Date(Date.UTC(taxYear, 11, 31));
        const totalDaysInYear =
            ((taxYear % 4 === 0 && taxYear % 100 !== 0) || taxYear % 400 === 0) ? 366 : 365;

        // Clamp the income window to the tax year
        const rawStart = income.startDate ? new Date(`${String(income.startDate).slice(0, 10)}T00:00:00Z`) : yearStart;
        const rawEnd   = income.endDate   ? new Date(`${String(income.endDate).slice(0, 10)}T00:00:00Z`)   : yearEnd;
        const start = rawStart < yearStart ? yearStart : rawStart;
        const end   = rawEnd   > yearEnd   ? yearEnd   : rawEnd;
        if (isNaN(start) || isNaN(end) || end < start) return 0;

        const daysActive = Math.max(0, Math.round((end - start) / 86400000) + 1);
        const yearFraction = Math.min(1, daysActive / totalDaysInYear);

        const freq = (income.frequency || '').toLowerCase();
        let annualized;
        switch (freq) {
            case 'daily':       annualized = amount * 365; break;
            case 'weekly':      annualized = amount * 52;  break;
            case 'bi-weekly':
            case 'biweekly':    annualized = amount * 26;  break;
            case 'semi-monthly':
            case 'semimonthly': annualized = amount * 24;  break;
            case 'monthly':     annualized = amount * 12;  break;
            case 'quarterly':   annualized = amount * 4;   break;
            case 'semi-annually':
            case 'semiannually':annualized = amount * 2;   break;
            case 'yearly':
            case 'annual':
            case 'annually':    annualized = amount;       break;
            // One-time / lump payments aren't annualized
            case 'one-time':
            case 'onetime':
            case 'lump sum':
            case 'lumpsum':     return amount;
            default:            annualized = amount * 12;  break; // safe default
        }

        return annualized * yearFraction;
    }

    const applicantIncome = ptrrApplicant?.income || [];
    const spouseIncome    = spouse?.income || [];
    const sumIncome = (kinds, allowNegativeKinds = []) => {
        return [...applicantIncome, ...spouseIncome]
            .filter((inc) => inc.type?.toLowerCase() === 'previous' && kinds.includes(inc.kind?.toLowerCase()))
            .reduce((total, inc) => {
                const yi = calculateYearlyIncome(inc);
                return total + (allowNegativeKinds.includes(inc.kind?.toLowerCase()) ? -yi : yi);
            }, 0);
    };

    const totalRailroadRetirementIncome  = sumIncome(['railroad retirement tier 1']);
    const totalYearlyIncome              = sumIncome(['ssa retirement', 'ssi', 'ssp', 'ssdi', 'social security survivor benefits']);
    const totalRailroadRetirementIncome2 = sumIncome(['railroad retirement tier 2', 'pension', 'annuity', 'ira distributions']);
    const interestanddividends           = sumIncome(['interest', 'dividends']);
    const propertysale                   = sumIncome(['property sale', 'property sale loss'], ['property sale loss']);
    const rentalIncome                   = sumIncome(['rental income', 'rental loss'], ['rental loss']);
    const selfEmploymentIncome           = sumIncome(['self-employment', 'business loss'], ['business loss']);
    const employmentIncome               = sumIncome(['employment']);
    const gamblingAndLotteryWinnings     = sumIncome(['gambling winnings', 'lottery winnings']);
    const inheritanceAlimonyChildSupport = sumIncome(['inheritance', 'alimony', 'child support']);
    const workersCompCashAssistanceUnemployment = sumIncome(['workers compensation', 'tanf', 'unemployment']);

    const insuranceBenefits = [...applicantIncome, ...spouseIncome]
        .filter((i) => i.type?.toLowerCase() === 'previous' && ['disability insurance', 'life insurance', 'death benefits'].includes(i.kind?.toLowerCase()))
        .reduce((t, i) => {
            const yi = calculateYearlyIncome(i);
            return t + (i.kind?.toLowerCase() === 'death benefits' ? Math.max(0, yi - 5000) : yi);
        }, 0);

    const inKindIncome = sumIncome(['inkind income']);
    const adjustedInKindIncome = Math.max(0, inKindIncome - 300);

    const processedKinds = [
        'ssa retirement','ssi','ssp','ssdi','social security survivor benefits',
        'railroad retirement tier 1','railroad retirement tier 2','pension','annuity','ira distributions',
        'interest','dividends','property sale','property sale loss','rental income','rental loss',
        'self-employment','business loss','employment','gambling winnings','lottery winnings',
        'inheritance','alimony','child support','workers compensation','tanf','unemployment',
        'disability insurance','life insurance','death benefits','inkind income',
    ];
    const miscellaneousIncome = [...applicantIncome, ...spouseIncome]
        .filter((i) => i.type?.toLowerCase() === 'previous' && !processedKinds.includes(i.kind?.toLowerCase()))
        .reduce((t, i) => t + calculateYearlyIncome(i), 0);

    const federalCSRSEntries = [...applicantIncome, ...spouseIncome]
        .filter((i) => i.type?.toLowerCase() === 'previous' && i.kind?.toLowerCase() === 'federal csrs');
    const isMarriedTogether = ptrrApplicant?.previousMaritalStatus?.toLowerCase().includes('married (living together)');
    const federalCSRSAmount = federalCSRSEntries.length > 0 ? (isMarriedTogether ? 21902 : 10951) : 0;

    const totalIncome = Math.max(0,
        (totalYearlyIncome / 2) +
        (totalRailroadRetirementIncome / 2) +
        totalRailroadRetirementIncome2 +
        interestanddividends +
        Math.max(0, propertysale) +
        Math.max(0, rentalIncome) +
        Math.max(0, selfEmploymentIncome) +
        employmentIncome +
        gamblingAndLotteryWinnings +
        inheritanceAlimonyChildSupport +
        workersCompCashAssistanceUnemployment +
        insuranceBenefits +
        adjustedInKindIncome +
        miscellaneousIncome -
        federalCSRSAmount
    );

    const totalIncomeFormatted = fmtMoney(totalIncome);

    // Income → page 1
    const helv = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const drawAt = (txt, x, y, size = 12) => page.drawText(txt, { x, y, size, font: helv, color: PDFLib.rgb(0, 0, 0) });

    drawAt(totalIncomeFormatted, 473, 101);
    drawAt(fmtMoney(totalYearlyIncome), 277, 423);
    drawAt(fmtMoney(totalYearlyIncome / 2), 473, 421);
    drawAt(fmtMoney(totalRailroadRetirementIncome), 267, 398);
    drawAt(fmtMoney(totalRailroadRetirementIncome / 2), 473, 399);
    drawAt(fmtMoney(totalRailroadRetirementIncome2), 473, 377);
    drawAt(fmtMoney(interestanddividends), 473, 355);
    drawAt(fmtMoney(Math.abs(propertysale)), 473, 334);
    if (propertysale < 0) drawOval({ x: 421, y: 340 });
    drawAt(fmtMoney(Math.abs(rentalIncome)), 473, 313);
    if (rentalIncome < 0) drawOval({ x: 421, y: 319 });
    drawAt(fmtMoney(Math.abs(selfEmploymentIncome)), 473, 292);
    if (selfEmploymentIncome < 0) drawOval({ x: 421, y: 298 });
    drawAt(fmtMoney(employmentIncome), 473, 271);
    drawAt(fmtMoney(gamblingAndLotteryWinnings), 473, 250);
    drawAt(fmtMoney(inheritanceAlimonyChildSupport), 473, 229);
    drawAt(fmtMoney(workersCompCashAssistanceUnemployment), 473, 207);
    drawAt(fmtMoney(insuranceBenefits), 473, 186);
    drawAt(fmtMoney(adjustedInKindIncome), 473, 165);
    drawAt(fmtMoney(miscellaneousIncome), 473, 143);
    drawAt(fmtMoney(federalCSRSAmount), 473, 122);

    const fullName = `${ptrrApplicant?.firstName || ''} ${ptrrApplicant?.middleInitial || ''} ${ptrrApplicant?.lastName || ''}`.trim();
    const yourNameField = form.getTextField('Your Name:');
    if (yourNameField) yourNameField.setText(fullName);

    // ============================================================
    //  SCHEDULE PRE-PROCESSING — order matters!
    //  A → rentals → E (cascade) → D (uses adjusted rent) → B
    // ============================================================
    const scheduleA = await buildScheduleA({
        ptrrApplicant, sanitizedSSN, residenceStatus: data.residenceStatus,
    });

    const { rentalsWithMath, totalLine8 } = computeRentals({ ptrrApplicant, spouse, data });

    // Property tax BEFORE Schedule E adjustment
    const combinedExpenses = [...(ptrrApplicant?.expenses || []), ...(spouse?.expenses || [])];
    let propertyTaxBeforeE = 0;
    if (data.residenceStatus === 'owned' || data.residenceStatus === 'rentedowned') {
        propertyTaxBeforeE = scheduleA
            ? scheduleA.totalProratedTax
            : combinedExpenses
                .filter((ex) => ex.type?.toLowerCase() === 'previous year' && ex.kind?.toLowerCase() === 'property taxes')
                .reduce((s, ex) => s + calculateYearlyAmountFromExpense(ex), 0);
    }

    // B / D / E (cascades into Line 14 / Line 16)
    const scheduleBDE = await buildScheduleBDE({
        ptrrApplicant, spouse, sanitizedSSN,
        residenceStatus: data.residenceStatus,
        propertyTaxBeforeE,
        totalRentBeforeE: totalLine8,
    });

    // Schedule F is the FINAL cascade step — feed it the post-B/D/E values.
    const scheduleF = await buildScheduleF({
        ptrrApplicant,
        spouse,
        sanitizedSSN,
        data,
        residenceStatus: data.residenceStatus,
        propertyTaxBeforeF: scheduleBDE.adjustedPropertyTax,
        rentBeforeF:        scheduleBDE.adjustedTotalRent,
    });

    const finalPropertyTax = scheduleF.adjustedPropertyTax;
    const finalTotalRent   = scheduleF.adjustedTotalRent;

    // ============================================================
    //  PAGE 2 — Lines 14, 16, 20%-rent, rebate calcs
    // ============================================================
    const page2 = pdfDoc.getPages()[1];
    const drawAt2 = (txt, x, y, size = 12) => page2.drawText(txt, { x, y, size, font: helv, color: PDFLib.rgb(0, 0, 0) });

    let totalPropertyTax = 0;
    if (data.residenceStatus === 'owned' || data.residenceStatus === 'rentedowned') {
        totalPropertyTax = finalPropertyTax;
        drawAt2(fmtMoney(totalPropertyTax), 473, 649);
        console.log(`PA-1000 Line 14 (post-Schedule-E): $${totalPropertyTax.toFixed(2)}`);
    }

    let rentPaid20Percent = 0;
    if (data.residenceStatus === 'rented' || data.residenceStatus === 'rentedowned') {
        drawAt2(fmtMoney(finalTotalRent), 473, 606);
        console.log(`PA-1000 Line 16 (post-Schedule-E): $${finalTotalRent.toFixed(2)}`);
        rentPaid20Percent = finalTotalRent * 0.2;
        drawAt2(fmtMoney(rentPaid20Percent), 473, 584);
    }

    // Rebate Table A
    const rebateTableA = [
        { maxIncome: 8270,  rebate: 1000 },
        { maxIncome: 15510, rebate: 770 },
        { maxIncome: 18610, rebate: 460 },
        { maxIncome: 46520, rebate: 380 },
    ];
    const calculateRebate = (ti) => {
        for (const b of rebateTableA) if (ti <= b.maxIncome) return b.rebate;
        return 0;
    };
    const rebateAmount = calculateRebate(totalIncome);
    const rebateAmountFormatted = fmtMoney(rebateAmount);

    if (data.residenceStatus === 'owned' || data.residenceStatus === 'rentedowned') {
        drawAt2(rebateAmountFormatted, 264, 629, 6);
    }

    const rebateAmountValue = rebateAmount;
    const lesserAmount = Math.min(totalPropertyTax, rebateAmountValue);
    const lesserAmountFormatted = fmtMoney(lesserAmount);
    if (data.residenceStatus === 'owned' || data.residenceStatus === 'rentedowned') {
        drawAt2(lesserAmountFormatted, 473, 628);
    }

    if (data.residenceStatus === 'rented' || data.residenceStatus === 'rentedowned') {
        drawAt2(rebateAmountFormatted, 232, 567, 6);
    }
    if (data.residenceStatus === 'rentedowned') {
        drawAt2(rebateAmountFormatted, 126, 527, 6);
    }

    const rentRebateAmount = Math.min(rentPaid20Percent, rebateAmount);
    const rentRebateAmountFormatted = fmtMoney(rentRebateAmount);
    if (data.residenceStatus === 'rented' || data.residenceStatus === 'rentedowned') {
        drawAt2(rentRebateAmountFormatted, 473, 563);
    }

    const sumOfRentAndLesser = rentRebateAmount + lesserAmount;
    const finalLesserAmount = Math.min(rebateAmountValue, sumOfRentAndLesser);
    if (data.residenceStatus === 'rentedowned') {
        drawAt2(fmtMoney(finalLesserAmount), 473, 543);
    }

    drawAt2(totalIncomeFormatted, 126, 361);

    // Income-bracket oval
    const ovalPositions = [
        { x: 528, y: 341 }, { x: 528, y: 331 }, { x: 528, y: 320 }, { x: 528, y: 310 },
        { x: 528, y: 341 }, { x: 528, y: 331 }, { x: 528, y: 320 }, { x: 528, y: 310 },
    ];
    let ovalIndex = -1;
    if (data.residenceStatus === 'owned' || data.residenceStatus === 'rentedowned') {
        if (totalIncome <= 8270)       ovalIndex = 0;
        else if (totalIncome <= 15510) ovalIndex = 1;
        else if (totalIncome <= 18610) ovalIndex = 2;
        else                            ovalIndex = 3;
    } else if (data.residenceStatus === 'rented') {
        if (totalIncome <= 8270)       ovalIndex = 4;
        else if (totalIncome <= 15510) ovalIndex = 5;
        else if (totalIncome <= 18610) ovalIndex = 6;
        else                            ovalIndex = 7;
    }
    if (ovalIndex >= 0 && ovalIndex < ovalPositions.length) {
        const { x, y } = ovalPositions[ovalIndex];
        page2.drawEllipse({
            x, y, xScale: 20, yScale: 5,
            borderColor: PDFLib.rgb(0, 0, 0), borderWidth: 1,
        });
    }

    // Flatten the main filled PA-1000 up front so it's baked in regardless of merge path.
    try { pdfDoc.getForm().flatten(); } catch (e) { console.warn('Flatten (main) failed:', e.message); }
    const filledPdfBytes = await pdfDoc.save();
    const pdfsToMerge = [filledPdfBytes];

    // ============================================================
    //  PA-1000 RC — one per rental
    // ============================================================
    if (data.residenceStatus === 'rented' || data.residenceStatus === 'rentedowned') {
        for (let rIdx = 0; rIdx < rentalsWithMath.length; rIdx++) {
            const rental = rentalsWithMath[rIdx];
            try {
                const rcPdfBytes = await loadPDFAsset('2025_pa-1000rc.pdf');
                const rcPdfDoc   = await PDFDocument.load(rcPdfBytes);
                const rcForm     = rcPdfDoc.getForm();
                const rcSet = (name, val) => {
                    try { rcForm.getTextField(name).setText(val == null ? '' : String(val)); }
                    catch (e) { console.warn(`RC[${rIdx}]: ${name}:`, e.message); }
                };

                const rcFullName = `${ptrrApplicant?.firstName || ''} ${ptrrApplicant?.middleInitial || ''} ${ptrrApplicant?.lastName || ''}`.trim();
                rcSet('Name as shown on PA-1000', rcFullName);
                rcSet('Your Social Security Number', sanitizedSSN);

                const addr = rental.rentalPropertyAddress || {};
                const rentalStreet = `${addr.streetAddress || ''}${addr.streetAddress2 ? ' ' + addr.streetAddress2 : ''}`.trim();
                rcSet('Street address of the residence', rentalStreet);
                rcSet('Your address - City, State, ZIP Code', `${addr.city || ''}, ${(addr.state || '').toUpperCase()} ${addr.zipCode || ''}`.trim());

                const ptrrApp = ptrrApplicant?.PTRR?.application?.[0] || {};
                rcSet("Owner's business name or Landlords name", ptrrApp.landlordName || '');
                rcSet("Landlord's Address", ptrrApp.landlordAddress || '');
                rcSet("Landlord's City, State, ZIP Code", ptrrApp.landlordCityStateZip || '');
                rcSet("Landlord's EIN", ptrrApp.landlordEin || '');
                rcSet("Landlord's daytime telephone number", (ptrrApp.landlordPhone || '').replace(/[()\-\s]/g, '').slice(0, 10));
                rcSet('Building Name', rental.buildingName || '');

                if (rental.rentalType) {
                    const rcPage = rcPdfDoc.getPages()[0];
                    const rentalTypeOvals = {
                        'apartmentHouse':    { x: 388, y: 562 },
                        'apartmentBuilding': { x: 388, y: 550 },
                        'boardingHome':      { x: 388, y: 538 },
                        'mobileHome':        { x: 388, y: 526 },
                        'personalCareHome':  { x: 388, y: 514 },
                        'mobileHomeLot':     { x: 492, y: 562 },
                        'nursingHome':       { x: 492, y: 550 },
                        'privateHome':       { x: 492, y: 538 },
                        'assistedLiving':    { x: 492, y: 526 },
                        'condominium':       { x: 492, y: 514 },
                    };
                    const c = rentalTypeOvals[rental.rentalType];
                    if (c) rcPage.drawEllipse({ x: c.x, y: c.y, xScale: 5, yScale: 5, color: PDFLib.rgb(0, 0, 0) });
                }

                if (rental.domicilliaryFosterCare === 'domicillary' || rental.domicilliaryFosterCare === 'foster') {
                    try { rcForm.getCheckBox('3. Domiciliary/Foster Care').check(); }
                    catch (e) { console.warn(`RC[${rIdx}]: Dom/Foster:`, e.message); }
                }

                rcSet('4. Amount of rent per month', fmtMoney(rental.monthlyRent));
                rcSet('5. Amount paid or subsidized by a governmental agency', fmtMoney(rental.subsidizedRentAmount || 0));
                rcSet('6. Total monthly amount of rent paid', fmtMoney(rental.netMonthlyRent));
                rcSet('7. Number of months occupied', String(rental.monthsOccupied));
                rcSet('8. Total rent paid', fmtMoney(rental.line8));

                pdfsToMerge.push(await rcPdfDoc.save());
                console.log(`PA-1000 RC #${rIdx + 1} of ${rentalsWithMath.length} added (Line 8 = ${rental.line8.toFixed(2)}).`);
            } catch (error) {
                console.error(`Error filling PA-1000 RC #${rIdx + 1}:`, error);
            }
        }
    }
        // Append schedules in order: A → B/D/E → F (one PDF per 2 extra people)
        if (scheduleA) {
            pdfsToMerge.push(scheduleA.pdfBytes);
            console.log('PA-1000A added to merge queue.');
        }
        if (scheduleBDE && scheduleBDE.pdfBytes) {
            pdfsToMerge.push(scheduleBDE.pdfBytes);
            console.log('PA-1000 B/D/E added to merge queue.');
        }
        if (scheduleF && Array.isArray(scheduleF.pdfs)) {
            scheduleF.pdfs.forEach((bytes, i) => {
                pdfsToMerge.push(bytes);
                console.log(`PA-1000 F copy ${i + 1}/${scheduleF.copies} added to merge queue.`);
            });
            console.log(`Schedule F: ${scheduleF.totalPeople} other person(s) across ${scheduleF.copies} copy(ies).`);
        }

        let finalPdfBytes;
        if (pdfsToMerge.length > 1) {
            const mergedDoc = await mergePDFs(pdfsToMerge);
            // Flatten all form fields so the output is read-only
            try { mergedDoc.getForm().flatten(); } catch (e) { console.warn('Flatten (merged) failed:', e.message); }
            finalPdfBytes = await mergedDoc.save();
        } else {
            // Re-load the single doc so we can flatten before saving
            const singleDoc = await PDFDocument.load(filledPdfBytes);
            try { singleDoc.getForm().flatten(); } catch (e) { console.warn('Flatten (single) failed:', e.message); }
            finalPdfBytes = await singleDoc.save();
        }

    // Upload + note
    const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
    const fileName = `PA-1000_${ptrrApplicant?.firstName || 'Unknown'}_${ptrrApplicant?.lastName || 'Unknown'}_${new Date().toISOString().slice(0, 10)}.pdf`;
    try {
        const clientId = new URLSearchParams(window.location.search).get('id');
        const activeUser = sessionStorage.getItem('loggedInUser') || 'Unknown User';

        const formData = new FormData();
        formData.append('file', blob, fileName);
        formData.append('clientId', clientId);
        formData.append('title', fileName.replace('.pdf', ''));
        formData.append('generatedBy', activeUser);

        const uploadResponse = await fetch('/upload-letter', { method: 'POST', body: formData });
        const uploadResult = await uploadResponse.json();
        if (uploadResponse.ok && uploadResult.success) {
            console.log('Letter uploaded successfully:', uploadResult.message);
        } else {
            console.error('Failed to upload letter:', uploadResult.message);
            alert('Failed to upload the letter to the client profile.');
        }

        const note = {
            id: crypto.randomUUID(),
            text: 'PTRR Application completed.',
            timestamp: new Date().toLocaleString(),
            username: activeUser,
        };
        const noteResponse = await fetch('/add-note-to-client', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, note }),
        });
        const noteResult = await noteResponse.json();
        if (noteResponse.ok && noteResult.success) {
            if (typeof window.renderNotes === 'function') window.renderNotes(clientId);
        } else {
            console.error('Failed to log note:', noteResult.message);
        }
    } catch (error) {
        console.error('Error uploading letter or logging note:', error);
    }
}

async function listFormFields() {
    const { PDFDocument } = PDFLib;
    try {
        const pdfBytes = await fetch('/assets/2025_pa-1000f-g.pdf').then((res) => res.arrayBuffer());
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const form = pdfDoc.getForm();
        console.log('Listing all form fields:');
        form.getFields().forEach((f) => {
            console.log(`Field name: ${f.getName()}`);
            console.log(`Field type: ${f.constructor.name}`);
        });
    } catch (error) {
        console.error('Error listing form fields:', error);
    }
}