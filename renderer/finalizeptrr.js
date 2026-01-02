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

async function generatePDF(data) {
    const { PDFDocument } = PDFLib;

    // Load the existing PDF template
    const pdfBytes = await fetch('/assets/2024_pa-1000.pdf').then((res) => res.arrayBuffer());
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Get the form fields
    const form = pdfDoc.getForm();

// Find the household member with a PTRR application where applying is true
const ptrrApplicant = data.householdMembers?.find(
    (member) => member.PTRR?.application?.some((app) => app.applying === true)
);

// Find the household member with the `previousSpouseId` matching the applicant's `householdMemberId`
const spouse = data.householdMembers?.find((member) => {
    const isSpouse = member.householdMemberId === ptrrApplicant?.previousSpouseId;

    console.log('Checking household member:', member);
    console.log('Is Spouse:', isSpouse);

    return isSpouse;
});

if (!spouse) {
    console.warn('No spouse found in household members.');
} else {
    console.log('Spouse found:', spouse);
}

// Map database fields to PDF fields
form.getTextField('Use ALL CAPS to enter first name (10 spaces limit)').setText(ptrrApplicant?.firstName || '');
form.getTextField('Your Middle Initial').setText(ptrrApplicant?.middleInitial || '');
form.getTextField('Use ALL CAPS to enter last name (13 spaces limit)').setText(ptrrApplicant?.lastName || '');

// Format the date to mm/dd/yy and add one day
const formattedDob = ptrrApplicant?.dob
    ? new Date(new Date(`${ptrrApplicant.dob}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000)
          .toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' })
    : '';

    const rawSSN = ptrrApplicant?.socialSecurityNumber || '';
const sanitizedSSN = rawSSN.replace(/[-\s]/g, ''); // Remove any existing dashes or spaces
form.getTextField('Enter your SSN without dashes or spaces').setText(sanitizedSSN);

// Set the formatted date in the PDF field
form.getTextField('Enter claimant\'s birthdate in mm/dd/yy format').setText(formattedDob);
form.getTextField('Use ALL CAPS to enter first line of address').setText(data.streetAddress || '');
form.getTextField('Use ALL CAPS to enter second line of address').setText(data.streetAddress2 || '');
form.getTextField('Use ALL CAPS to enter city or post office').setText(data.city || '');

// Ensure the state abbreviation is in uppercase and valid
const validState = (data.state || '').toUpperCase().slice(0, 2);
form.getTextField('Use ALL CAPS to enter two-character state abbreviation').setText(validState);
form.getTextField('Enter five-digit ZIP Code').setText(data.zipCode || '');

if (spouse) {
    try {

// Add spouse's first name
const spouseFirstNameField = form.getTextField('Use ALL CAPS to enter spouse\'s first name (10 spaces limit)');
if (spouseFirstNameField) {
    const spouseFirstName = spouse.firstName || ''; // Use the spouse object
    spouseFirstNameField.setText(spouseFirstName);
    console.log(`Spouse's first name set to: ${spouseFirstName}`);
} else {
    console.error('Field "Use ALL CAPS to enter spouse\'s first name (10 spaces limit)" not found in the form.');
}

// Add spouse's date of birth
const spouseDobField = form.getTextField('Enter spouse\'s birthdate in mm/dd/yy format');
if (spouseDobField) {
    const formattedSpouseDob = spouse.dob
        ? new Date(new Date(`${spouse.dob}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000)
              .toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' })
        : '';
    spouseDobField.setText(formattedSpouseDob);
    console.log(`Spouse's DOB set to: ${formattedSpouseDob}`);
} else {
    console.error('Field "Enter spouse\'s birthdate in mm/dd/yy format" not found in the form.');
}

        // Add spouse's SSN (already handled earlier in the code)
        console.log('Spouse\'s SSN already added to the form.');
    } catch (error) {
        console.error('Error adding spouse\'s information to the form:', error.message, error.stack);
    }

// Add spouse's SSN
const spouseSsnField = form.getTextField('Enter spouse\'s SSN without dashes or spaces');
if (spouseSsnField) {
    const rawSpouseSsn = spouse.socialSecurityNumber || '';
    const sanitizedSpouseSsn = rawSpouseSsn.replace(/[-\s]/g, ''); // Remove existing dashes and spaces

    // Ensure the SSN is exactly 9 characters long
    if (sanitizedSpouseSsn.length === 9) {
        // Format the SSN with dashes for visual display
        const formattedSpouseSsn = `${sanitizedSpouseSsn.slice(0, 3)}-${sanitizedSpouseSsn.slice(3, 5)}-${sanitizedSpouseSsn.slice(5)}`;
        console.log(`Spouse's SSN (formatted): ${formattedSpouseSsn}`);
        
        // Set the raw SSN (without dashes) to avoid maxLength errors
        spouseSsnField.setText(sanitizedSpouseSsn);
    } else {
        console.error('Invalid SSN length. SSN must be 9 digits.');
    }
} else {
    console.error('Field "Enter spouse\'s SSN without dashes or spaces" not found in the form.');
}

    //Add spouse's middle initial
    const spouseMiddleInitialField = form.getTextField('Spouse - Middle Initial');
    if (spouseMiddleInitialField) {
        const spouseMiddleInitial = spouse.middleInitial || '';
        spouseMiddleInitialField.setText(spouseMiddleInitial);
        console.log(`Spouse's middle initial set to: ${spouseMiddleInitial}`);
    } else {
        console.error('Field "Spouse Middle Initial" not found in the form.');
    }
} else {
    console.warn('No spouse found in household members. Skipping spouse information.');
}

// Check the "Spouse Deceased" checkbox only if the previousMaritalStatus is "Widowed"
const spouseDeceasedField = form.getCheckBox('Spouse Deceased');
if (spouseDeceasedField) {
    // Debugging: Log the ptrrApplicant and its previousMaritalStatus
    console.log('PTRR Applicant:', ptrrApplicant);
    console.log('PTRR Applicant Previous Marital Status (raw):', ptrrApplicant?.previousMaritalStatus);

    // Normalize the marital status for comparison
    const maritalStatus = ptrrApplicant?.previousMaritalStatus?.toLowerCase().trim();
    console.log('Normalized Marital Status:', maritalStatus);

    if (maritalStatus === 'widowed') {
        spouseDeceasedField.check(); // Check the box
        console.log('Checkbox "Spouse Deceased" has been checked because marital status is "Widowed".');
    } else {
        spouseDeceasedField.uncheck(); // Uncheck the box
        console.log('Checkbox "Spouse Deceased" has been unchecked because marital status is not "Widowed".');
    }
} else {
    console.error('Checkbox "Spouse Deceased" not found in the form.');
}

const page = pdfDoc.getPages()[0]; // Get the first page of the PDF

// Coordinates for the "owner" and "renter" ovals (replace with actual values)
const ownerOval = { x: 461, y: 656, xRadius: 5, yRadius: 5 }; // Example coordinates for "owner"
const renterOval = { x: 461, y: 638, xRadius: 5, yRadius: 5 }; // Example coordinates for "renter"
const renterownerOval = { x: 461, y: 627, xRadius: 5, yRadius: 5 }; // Example coordinates for "renterowner"

// Fill the appropriate oval based on residenceStatus
if (data.residenceStatus === 'owned') {
    // Draw a filled oval for the "owner"
    page.drawEllipse({
        x: ownerOval.x,
        y: ownerOval.y,
        xScale: ownerOval.xRadius,
        yScale: ownerOval.yRadius,
        color: PDFLib.rgb(0, 0, 0), // Black color
    });
    console.log('Filled the "owner" oval.');
} else if (data.residenceStatus === 'rented') {
    // Draw a filled oval for the "renter"
    page.drawEllipse({
        x: renterOval.x,
        y: renterOval.y,
        xScale: renterOval.xRadius,
        yScale: renterOval.yRadius,
        color: PDFLib.rgb(0, 0, 0), // Black color
    });
    console.log('Filled the "renter" oval.');
} else if (data.residenceStatus === 'rentedowned') {
    // Draw a filled oval for the "renterowner"
    page.drawEllipse({
        x: renterownerOval.x,
        y: renterownerOval.y,
        xScale: renterownerOval.xRadius,
        yScale: renterownerOval.yRadius,
        color: PDFLib.rgb(0, 0, 0), // Black color
    });
    console.log('Filled the "renterowner" oval.');
} else {
    console.log('No oval filled because residenceStatus is neither "owned" nor "rented".');
}

// Coordinates for the claimant status ovals
const claimantStatusOvals = {
    A: { x: 461, y: 587, xRadius: 5, yRadius: 5 }, // Claimant age 65 or older
    B: { x: 461, y: 576, xRadius: 5, yRadius: 5 }, // Claimant under age 65, with a spouse age 65 or older
    C: { x: 461, y: 541, xRadius: 5, yRadius: 5 }, // Widow or widower, age 50 to 64
    D: { x: 461, y: 522, xRadius: 5, yRadius: 5 }, // Permanently disabled
};

// Determine which oval to fill based on the conditions
const currentYear = new Date().getFullYear();
const lastYear = currentYear - 1;

// Check if PTRR applicant was 65 years or older by the end of last year
if (ptrrApplicant?.dob) {
    const applicantAge = lastYear - new Date(ptrrApplicant.dob).getFullYear();
    if (applicantAge >= 65) {
        page.drawEllipse({
            x: claimantStatusOvals.A.x,
            y: claimantStatusOvals.A.y,
            xScale: claimantStatusOvals.A.xRadius,
            yScale: claimantStatusOvals.A.yRadius,
            color: PDFLib.rgb(0, 0, 0), // Black color
        });
        console.log('Filled oval A: Claimant age 65 or older.');
    }
}

// Check if spouse of PTRR applicant was 65 years or older by the end of last year
if (spouse?.dob) {
    const spouseAge = lastYear - new Date(spouse.dob).getFullYear();
    if (spouseAge >= 65) {
        page.drawEllipse({
            x: claimantStatusOvals.B.x,
            y: claimantStatusOvals.B.y,
            xScale: claimantStatusOvals.B.xRadius,
            yScale: claimantStatusOvals.B.yRadius,
            color: PDFLib.rgb(0, 0, 0), // Black color
        });
        console.log('Filled oval B: Claimant under age 65, with a spouse age 65 or older.');
    }
}

// Check if previousMaritalStatus is widowed
if (ptrrApplicant?.previousMaritalStatus?.toLowerCase().trim() === 'widowed') {
    page.drawEllipse({
        x: claimantStatusOvals.C.x,
        y: claimantStatusOvals.C.y,
        xScale: claimantStatusOvals.C.xRadius,
        yScale: claimantStatusOvals.C.yRadius,
        color: PDFLib.rgb(0, 0, 0), // Black color
    });
    console.log('Filled oval C: Widow or widower, age 50 to 64.');
}

// Check if PTRR applicant has a disability
if (ptrrApplicant?.disability?.toLowerCase() === 'yes') {
    page.drawEllipse({
        x: claimantStatusOvals.D.x,
        y: claimantStatusOvals.D.y,
        xScale: claimantStatusOvals.D.xRadius,
        yScale: claimantStatusOvals.D.yRadius,
        color: PDFLib.rgb(0, 0, 0), // Black color
    });
    console.log('Filled oval D: Permanently disabled.');
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

// Example: Set the county code in the PDF form
const selectedCounty = data.county; // e.g., "Northampton"
const countyCode = countyCodes[selectedCounty] || '';
form.getTextField('Enter the two-digit county code from the list on page 15').setText(countyCode);

// Example: Set the school district code in the PDF form
const selectedSchoolDistrict = data.schoolDistrict; // e.g., "Bethlehem Area School District"
const schoolDistrictCode = schoolDistrictCodes[selectedCounty]?.[selectedSchoolDistrict] || '';
form.getTextField('Enter the five-digit school district code from the list on pages 16 and 17').setText(schoolDistrictCode);

// Add the country code to the PDF form
const countryCodeField = form.getTextField('Enter the two-character country code');
if (countryCodeField) {
    countryCodeField.setText('US');
    console.log('Country code set to: US');
} else {
    console.error('Field "Enter the two-character country code" not found in the form.');
}

console.log(`County Code: ${countyCode}`);
console.log(`School District Code: ${schoolDistrictCode}`);

// Add claimant's daytime telephone number
const phoneNumberField = form.getTextField('Enter claimant’s daytime telephone number');
if (phoneNumberField) {
    let phoneNumber = data.phoneNumber || ''; // Use the phone number from the data object

    // Remove parentheses, dashes, and spaces from the phone number
    phoneNumber = phoneNumber.replace(/[()\-\s]/g, '');

    // Ensure the phone number fits within the 10-character limit
    phoneNumber = phoneNumber.slice(0, 10);

    phoneNumberField.setText(phoneNumber);
    console.log(`Claimant's daytime telephone number set to: ${phoneNumber}`);
} else {
    console.error('Field "Enter claimant’s daytime telephone number" not found in the form.');
}

// Calculate yearly income based on prorating, start and end dates
function calculateYearlyIncome(income) {
    const startDate = new Date(income.startDate);
    const endDate = income.endDate ? new Date(income.endDate) : new Date();
    const daysInYear = 365;

    // If the income is monthly, calculate yearly income directly
    if (income.frequency?.toLowerCase() === 'monthly') {
        return (parseFloat(income.amount) || 0) * 12;
    }

    // Calculate the number of days the income applies to
    const applicableDays = Math.max(0, (endDate - startDate) / (1000 * 60 * 60 * 24));
    const yearlyIncome = (parseFloat(income.amount) || 0) * (applicableDays / daysInYear);

    return yearlyIncome;
}

// Extract and sum relevant income types for "Social Security, SSI, and SSP Income"
const applicantIncome = ptrrApplicant?.income || [];
const spouseIncome = spouse?.income || [];
const totalRailroadRetirementIncome = [...applicantIncome, ...spouseIncome]
    .filter((income) =>
        income.type?.toLowerCase() === 'previous' &&
        ['railroad retirement tier 1'].includes(income.kind?.toLowerCase())
    )
    .reduce((total, income) => total + calculateYearlyIncome(income), 0);

const totalYearlyIncome = [...applicantIncome, ...spouseIncome]
    .filter((income) =>
        income.type?.toLowerCase() === 'previous' &&
        ['ssa retirement', 'ssi', 'ssp', 'ssdi', 'social security survivor benefits'].includes(income.kind?.toLowerCase())
    )
    .reduce((total, income) => total + calculateYearlyIncome(income), 0);

    const totalRailroadRetirementIncome2 = [...applicantIncome, ...spouseIncome]
    .filter((income) => {
        const isPrevious = income.type?.toLowerCase() === 'previous';
        const isValidKind = ['railroad retirement tier 2', 'pension', 'annuity', 'ira distributions'].includes(income.kind?.toLowerCase());
        console.log(`Income type: ${income.type}, Kind: ${income.kind}, Is Previous: ${isPrevious}, Is Valid Kind: ${isValidKind}`);
        return isPrevious && isValidKind;
    })
    .reduce((total, income) => {
        const yearlyIncome = calculateYearlyIncome(income);
        console.log(`Adding income: ${yearlyIncome}, Current total: ${total}`);
        return total + yearlyIncome;
    }, 0);

    const interestanddividends = [...applicantIncome, ...spouseIncome]
    .filter((income) => {
        const isPrevious = income.type?.toLowerCase() === 'previous';
        const isValidKind = ['interest', 'dividends'].includes(income.kind?.toLowerCase());
        console.log(`Income type: ${income.type}, Kind: ${income.kind}, Is Previous: ${isPrevious}, Is Valid Kind: ${isValidKind}`);
        return isPrevious && isValidKind;
    })
    .reduce((total, income) => {
        const yearlyIncome = calculateYearlyIncome(income);
        console.log(`Adding income: ${yearlyIncome}, Current total: ${total}`);
        return total + yearlyIncome;
    }, 0);

    const propertysale = [...applicantIncome, ...spouseIncome]
    .filter((income) => {
        const isPrevious = income.type?.toLowerCase() === 'previous';
        const isValidKind = ['property sale', 'property sale loss'].includes(income.kind?.toLowerCase());
        console.log(`Income type: ${income.type}, Kind: ${income.kind}, Is Previous: ${isPrevious}, Is Valid Kind: ${isValidKind}`);
        return isPrevious && isValidKind;
    })
    .reduce((total, income) => {
        const yearlyIncome = calculateYearlyIncome(income);
        const adjustedIncome = income.kind?.toLowerCase() === 'property sale loss' ? -yearlyIncome : yearlyIncome;
        console.log(`Adding income: ${adjustedIncome}, Current total: ${total}`);
        return total + adjustedIncome;
    }, 0);

    const rentalIncome = [...applicantIncome, ...spouseIncome]
    .filter((income) => {
        const isPrevious = income.type?.toLowerCase() === 'previous';
        const isValidKind = ['rental income', 'rental loss'].includes(income.kind?.toLowerCase());
        console.log(`Income type: ${income.type}, Kind: ${income.kind}, Is Previous: ${isPrevious}, Is Valid Kind: ${isValidKind}`);
        return isPrevious && isValidKind;
    })
    .reduce((total, income) => {
        const yearlyIncome = calculateYearlyIncome(income);
        const adjustedIncome = income.kind?.toLowerCase() === 'rental loss' ? -yearlyIncome : yearlyIncome;
        console.log(`Adding income: ${adjustedIncome}, Current total: ${total}`);
        return total + adjustedIncome;
    }, 0);

    const selfEmploymentIncome = [...applicantIncome, ...spouseIncome]
    .filter((income) => {
        const isPrevious = income.type?.toLowerCase() === 'previous';
        const isValidKind = ['self-employment', 'business loss'].includes(income.kind?.toLowerCase());
        console.log(`Income type: ${income.type}, Kind: ${income.kind}, Is Previous: ${isPrevious}, Is Valid Kind: ${isValidKind}`);
        return isPrevious && isValidKind;
    })
    .reduce((total, income) => {
        const yearlyIncome = calculateYearlyIncome(income);
        const adjustedIncome = income.kind?.toLowerCase() === 'business loss' ? -yearlyIncome : yearlyIncome;
        console.log(`Adding income: ${adjustedIncome}, Current total: ${total}`);
        return total + adjustedIncome;
    }, 0);

    const employmentIncome = [...applicantIncome, ...spouseIncome]
    .filter((income) => {
        const isPrevious = income.type?.toLowerCase() === 'previous';
        const isValidKind = income.kind?.toLowerCase() === 'employment';
        console.log(`Income type: ${income.type}, Kind: ${income.kind}, Is Previous: ${isPrevious}, Is Valid Kind: ${isValidKind}`);
        return isPrevious && isValidKind;
    })
    .reduce((total, income) => {
        const yearlyIncome = calculateYearlyIncome(income);
        console.log(`Adding income: ${yearlyIncome}, Current total: ${total}`);
        return total + yearlyIncome;
    }, 0);

    const gamblingAndLotteryWinnings = [...applicantIncome, ...spouseIncome]
    .filter((income) => {
        const isPrevious = income.type?.toLowerCase() === 'previous';
        const isValidKind = ['gambling winnings', 'lottery winnings'].includes(income.kind?.toLowerCase());
        console.log(`Income type: ${income.type}, Kind: ${income.kind}, Is Previous: ${isPrevious}, Is Valid Kind: ${isValidKind}`);
        return isPrevious && isValidKind;
    })
    .reduce((total, income) => {
        const yearlyIncome = calculateYearlyIncome(income);
        console.log(`Adding income: ${yearlyIncome}, Current total: ${total}`);
        return total + yearlyIncome;
    }, 0);

    const inheritanceAlimonyChildSupport = [...applicantIncome, ...spouseIncome]
    .filter((income) => {
        const isPrevious = income.type?.toLowerCase() === 'previous';
        const isValidKind = ['inheritance', 'alimony', 'child support'].includes(income.kind?.toLowerCase());
        console.log(`Income type: ${income.type}, Kind: ${income.kind}, Is Previous: ${isPrevious}, Is Valid Kind: ${isValidKind}`);
        return isPrevious && isValidKind;
    })
    .reduce((total, income) => {
        const yearlyIncome = calculateYearlyIncome(income);
        console.log(`Adding income: ${yearlyIncome}, Current total: ${total}`);
        return total + yearlyIncome;
    }, 0);

    const workersCompCashAssistanceUnemployment = [...applicantIncome, ...spouseIncome]
    .filter((income) => {
        const isPrevious = income.type?.toLowerCase() === 'previous';
        const isValidKind = ['workers compensation', 'cash assistance', 'unemployment'].includes(income.kind?.toLowerCase());
        console.log(`Income type: ${income.type}, Kind: ${income.kind}, Is Previous: ${isPrevious}, Is Valid Kind: ${isValidKind}`);
        return isPrevious && isValidKind;
    })
    .reduce((total, income) => {
        const yearlyIncome = calculateYearlyIncome(income);
        console.log(`Adding income: ${yearlyIncome}, Current total: ${total}`);
        return total + yearlyIncome;
    }, 0);

    const insuranceBenefits = [...applicantIncome, ...spouseIncome]
    .filter((income) => {
        const isPrevious = income.type?.toLowerCase() === 'previous';
        const isValidKind = ['disability insurance', 'life insurance', 'death benefits'].includes(income.kind?.toLowerCase());
        console.log(`Income type: ${income.type}, Kind: ${income.kind}, Is Previous: ${isPrevious}, Is Valid Kind: ${isValidKind}`);
        return isPrevious && isValidKind;
    })
    .reduce((total, income) => {
        const yearlyIncome = calculateYearlyIncome(income);
        if (income.kind?.toLowerCase() === 'death benefits') {
            const adjustedIncome = Math.max(0, yearlyIncome - 5000); // Ensure no negative values
            console.log(`Subtracting $5,000 from death benefits: ${yearlyIncome}, Adjusted: ${adjustedIncome}`);
            return total + adjustedIncome;
        }
        console.log(`Adding income: ${yearlyIncome}, Current total: ${total}`);
        return total + yearlyIncome;
    }, 0);

    const inKindIncome = [...applicantIncome, ...spouseIncome]
    .filter((income) => {
        const isPrevious = income.type?.toLowerCase() === 'previous';
        const isValidKind = income.kind?.toLowerCase() === 'inkind income';
        console.log(`Income type: ${income.type}, Kind: ${income.kind}, Is Previous: ${isPrevious}, Is Valid Kind: ${isValidKind}`);
        return isPrevious && isValidKind;
    })
    .reduce((total, income) => {
        const yearlyIncome = calculateYearlyIncome(income);
        console.log(`Adding income: ${yearlyIncome}, Current total: ${total}`);
        return total + yearlyIncome;
    }, 0);

// Subtract 300 from inKindIncome and ensure it is not negative
const adjustedInKindIncome = Math.max(0, inKindIncome - 300);

const processedKinds = [
    'ssa retirement', 'ssi', 'ssp', 'ssdi', 'social security survivor benefits',
    'railroad retirement tier 1', 'railroad retirement tier 2', 'pension', 'annuity', 'ira distributions',
    'interest', 'dividends', 'property sale', 'property sale loss', 'rental income', 'rental loss',
    'self-employment', 'business loss', 'employment', 'gambling winnings', 'lottery winnings',
    'inheritance', 'alimony', 'child support', 'workers compensation', 'cash assistance', 'unemployment',
    'disability insurance', 'life insurance', 'death benefits', 'in-kind income'
];

const miscellaneousIncome = [...applicantIncome, ...spouseIncome]
    .filter((income) => {
        const isPrevious = income.type?.toLowerCase() === 'previous';
        const isMiscellaneous = !processedKinds.includes(income.kind?.toLowerCase());
        console.log(`Income type: ${income.type}, Kind: ${income.kind}, Is Previous: ${isPrevious}, Is Miscellaneous: ${isMiscellaneous}`);
        return isPrevious && isMiscellaneous;
    })
    .reduce((total, income) => {
        const yearlyIncome = calculateYearlyIncome(income);
        console.log(`Adding miscellaneous income: ${yearlyIncome}, Current total: ${total}`);
        return total + yearlyIncome;
    }, 0);

    const federalCSRS = [...applicantIncome, ...spouseIncome]
    .filter((income) => {
        const isPrevious = income.type?.toLowerCase() === 'previous';
        const isValidKind = income.kind?.toLowerCase() === 'federal csrs';
        console.log(`Income type: ${income.type}, Kind: ${income.kind}, Is Previous: ${isPrevious}, Is Valid Kind: ${isValidKind}`);
        return isPrevious && isValidKind;
    });

// Determine the CSRS amount based on marital status or set to 0 if no federal CSRS income exists
const maritalStatus = ptrrApplicant?.previousMaritalStatus?.toLowerCase().includes('married (living together)');
const federalCSRSAmount = federalCSRS.length > 0 ? (maritalStatus ? 21902 : 10951) : 0;

console.log(`Federal CSRS Amount: ${federalCSRSAmount}`);

// Calculate TOTAL INCOME
const totalIncome = Math.max(0,
    (totalYearlyIncome / 2) + // Line 4
    (totalRailroadRetirementIncome / 2) + // Line 5
    totalRailroadRetirementIncome2 + // Line 6
    interestanddividends + // Line 7
    Math.max(0, propertysale) + // Line 8 (only positive values)
    Math.max(0, rentalIncome) + // Line 9 (only positive values)
    Math.max(0, selfEmploymentIncome) + // Line 10 (only positive values)
    employmentIncome + // Line 11a
    gamblingAndLotteryWinnings + // Line 11b
    inheritanceAlimonyChildSupport + // Line 11c
    workersCompCashAssistanceUnemployment + // Line 11d
    insuranceBenefits + // Line 11e
    adjustedInKindIncome + // Line 11f
    miscellaneousIncome // Line 11g
    - federalCSRSAmount // Subtract Federal CSRS amount
);

// Ensure totalIncome is converted to a string
const totalIncomeFormatted = totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // Format as positive

// Log the TOTAL INCOME for debugging
console.log(`TOTAL INCOME: ${totalIncomeFormatted}`);

// Write TOTAL INCOME to the PDF
page.drawText(totalIncomeFormatted, { // Format with commas and 2 decimal places
    x: 473, // Replace with the actual x-coordinate
    y: 101, // Replace with the actual y-coordinate
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});

// Log the extracted income for debugging
console.log('Total Yearly SSA (Applicant + Spouse):', totalYearlyIncome);
console.log('Total Yearly Railroad Tier 1 (Applicant + Spouse):', totalRailroadRetirementIncome);
console.log('Total Yearly Railroad Tier 2 (Applicant + Spouse):', totalRailroadRetirementIncome2);
console.log('Total Yearly Interest and Dividends (Applicant + Spouse):', interestanddividends);
console.log('Total Yearly Property Sale (Applicant + Spouse):', propertysale);
console.log('Total Yearly Rental Income (Applicant + Spouse):', rentalIncome);
console.log('Total Yearly Self-Employment Income (Applicant + Spouse):', selfEmploymentIncome);
console.log('Total Yearly Employment Income (Applicant + Spouse):', employmentIncome);
console.log('Total Yearly Gambling and Lottery Winnings (Applicant + Spouse):', gamblingAndLotteryWinnings);
console.log('Total Yearly Inheritance, Alimony, Child Support (Applicant + Spouse):', inheritanceAlimonyChildSupport);
console.log('Total Yearly Workers Comp, Cash Assistance, Unemployment (Applicant + Spouse):', workersCompCashAssistanceUnemployment);
console.log('Total Yearly Insurance Benefits (Applicant + Spouse):', insuranceBenefits);
console.log('Total Yearly In-Kind Income (Applicant + Spouse):', adjustedInKindIncome);
console.log('Total Yearly Miscellaneous Income (Applicant + Spouse):', miscellaneousIncome);
console.log(`Federal CSRS amount based on marital status: ${federalCSRSAmount}`);

// Fill the PDF fields with the calculated income values

// Fill "Social Security, SSI, and SSP Income" field
page.drawText(totalYearlyIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { // Format with commas and 2 decimal places
    x: 281, // Replace with the actual x-coordinate
    y: 423, // Replace with the actual y-coordinate
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});

// Example: Fill "Social Security, SSI, and SSP Income / 2" field
page.drawText((totalYearlyIncome / 2).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { // Format with commas and 2 decimal places
    x: 473, // Replace with the actual x-coordinate
    y: 421, // Replace with the actual y-coordinate
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});

// Ensure totalRailroadRetirementIncome is converted to a string
page.drawText(totalRailroadRetirementIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { // Format with commas and 2 decimal places
    x: 267, // Replace with the actual x-coordinate
    y: 398, // Replace with the actual y-coordinate
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});

// Ensure totalRailroadRetirementIncome is converted to a string
page.drawText((totalRailroadRetirementIncome / 2).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { // Format with commas and 2 decimal places
    x: 473, // Replace with the actual x-coordinate
    y: 399, // Replace with the actual y-coordinate
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});

// Ensure totalRailroadRetirementIncome2 is converted to a string
page.drawText(totalRailroadRetirementIncome2.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { // Format with commas and 2 decimal places
    x: 473, // Replace with the actual x-coordinate
    y: 377, // Replace with the actual y-coordinate
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});

// Ensure interestanddividends is converted to a string
page.drawText(interestanddividends.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { // Format with commas and 2 decimal places
    x: 473, // Replace with the actual x-coordinate
    y: 355, // Replace with the actual y-coordinate
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});

// Ensure propertysale is converted to a string
const propertysaleFormatted = Math.abs(propertysale).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // Format as positive
page.drawText(propertysaleFormatted, { // Format with commas and 2 decimal places
    x: 473, // Replace with the actual x-coordinate
    y: 334, // Replace with the actual y-coordinate
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});

// Check if propertysale is negative and draw an oval if it is
if (propertysale < 0) {
    const negativeOval = { x: 421, y: 340, xRadius: 5, yRadius: 5 }; // Replace with actual coordinates for the oval
    page.drawEllipse({
        x: negativeOval.x,
        y: negativeOval.y,
        xScale: negativeOval.xRadius,
        yScale: negativeOval.yRadius,
        color: PDFLib.rgb(0, 0, 0), // Black color
    });
    console.log('Drew an oval to indicate a negative property sale value.');
}

// Ensure rentalIncome is converted to a string
const rentalIncomeFormatted = Math.abs(rentalIncome).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // Format as positive
page.drawText(rentalIncomeFormatted, { // Format with commas and 2 decimal places
    x: 473, // Replace with the actual x-coordinate
    y: 313, // Replace with the actual y-coordinate
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});

// Check if rentalIncome is negative and draw an oval if it is
if (rentalIncome < 0) {
    const negativeOval = { x: 421, y: 319, xRadius: 5, yRadius: 5 }; // Replace with actual coordinates for the oval
    page.drawEllipse({
        x: negativeOval.x,
        y: negativeOval.y,
        xScale: negativeOval.xRadius,
        yScale: negativeOval.yRadius,
        color: PDFLib.rgb(0, 0, 0), // Black color
    });
    console.log('Drew an oval to indicate a negative rental income value.');
}

// Ensure selfEmploymentIncome is converted to a string
const selfEmploymentIncomeFormatted = Math.abs(selfEmploymentIncome).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // Format as positive
page.drawText(selfEmploymentIncomeFormatted, { // Format with commas and 2 decimal places
    x: 473, // Replace with the actual x-coordinate
    y: 292, // Replace with the actual y-coordinate
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});

// Check if selfEmploymentIncome is negative and draw an oval if it is
if (selfEmploymentIncome < 0) {
    const negativeOval = { x: 421, y: 298, xRadius: 5, yRadius: 5 }; // Replace with actual coordinates for the oval
    page.drawEllipse({
        x: negativeOval.x,
        y: negativeOval.y,
        xScale: negativeOval.xRadius,
        yScale: negativeOval.yRadius,
        color: PDFLib.rgb(0, 0, 0), // Black color
    });
    console.log('Drew an oval to indicate a negative self-employment income value.');
}

// Ensure employmentIncome is converted to a string
const employmentIncomeFormatted = employmentIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // Format as positive
page.drawText(employmentIncomeFormatted, { // Format with commas and 2 decimal places
    x: 473, // Replace with the actual x-coordinate
    y: 271, // Replace with the actual y-coordinate
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});

// Ensure gamblingAndLotteryWinnings is converted to a string
const gamblingAndLotteryWinningsFormatted = gamblingAndLotteryWinnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // Format as positive
page.drawText(gamblingAndLotteryWinningsFormatted, { // Format with commas and 2 decimal places
    x: 473, // Replace with the actual x-coordinate
    y: 250, // Replace with the actual y-coordinate
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});

// Ensure inheritanceAlimonyChildSupport is converted to a string
const inheritanceAlimonyChildSupportFormatted = inheritanceAlimonyChildSupport.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // Format as positive
page.drawText(inheritanceAlimonyChildSupportFormatted, { // Format with commas and 2 decimal places
    x: 473, // Replace with the actual x-coordinate
    y: 229, // Replace with the actual y-coordinate
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});

// Ensure workersCompCashAssistanceUnemployment is converted to a string
const workersCompCashAssistanceUnemploymentFormatted = workersCompCashAssistanceUnemployment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // Format as positive
page.drawText(workersCompCashAssistanceUnemploymentFormatted, { // Format with commas and 2 decimal places
    x: 473, // Replace with the actual x-coordinate
    y: 207, // Replace with the actual y-coordinate
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});

// Ensure insuranceBenefits is converted to a string
const insuranceBenefitsFormatted = insuranceBenefits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // Format as positive
page.drawText(insuranceBenefitsFormatted, { // Format with commas and 2 decimal places
    x: 473, // Replace with the actual x-coordinate
    y: 186, // Replace with the actual y-coordinate
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});

// Ensure inKindIncome is converted to a string
const inKindIncomeFormatted = adjustedInKindIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // Format as positive
page.drawText(inKindIncomeFormatted, { // Format with commas and 2 decimal places
    x: 473, // Replace with the actual x-coordinate
    y: 165, // Replace with the actual y-coordinate
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});

// Ensure miscellaneousIncome is converted to a string
const miscellaneousIncomeFormatted = miscellaneousIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // Format as positive
page.drawText(miscellaneousIncomeFormatted, { // Format with commas and 2 decimal places
    x: 473, // Replace with the actual x-coordinate
    y: 143, // Replace with the actual y-coordinate
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});

// Ensure federalCSRSAmount is converted to a string
const federalCSRSFormatted = federalCSRSAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // Format as positive
page.drawText(federalCSRSFormatted, { // Format with commas and 2 decimal places
    x: 473, // Replace with the actual x-coordinate
    y: 122, // Replace with the actual y-coordinate
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});

// Combine PTRR Applicant's first name, middle initial, and last name
const fullName = `${ptrrApplicant?.firstName || ''} ${ptrrApplicant?.middleInitial || ''} ${ptrrApplicant?.lastName || ''}`.trim();

// Set the combined name in the "Your Name:" field
const yourNameField = form.getTextField('Your Name:');
if (yourNameField) {
    yourNameField.setText(fullName);
    console.log(`Set "Your Name:" field to: ${fullName}`);
} else {
    console.error('Field "Your Name:" not found in the form.');
}

// Get the second page of the PDF
const page2 = pdfDoc.getPages()[1]; // Assuming page 2 is the second page

// Helper function to calculate yearly amounts based on frequency
function calculateYearlyAmount(expense) {
    const amount = parseFloat(expense.amount) || 0;
    const frequency = expense.frequency?.toLowerCase();

    switch (frequency) {
        case 'monthly':
            return amount * 12; // Multiply by 12 for monthly frequency
        case 'weekly':
            return amount * 52; // Multiply by 52 for weekly frequency
        case 'biweekly':
            return amount * 26; // Multiply by 26 for biweekly frequency
        case 'daily':
            return amount * 365; // Multiply by 365 for daily frequency
        case 'yearly':
        case 'annual':
            return amount; // Already a yearly amount
        default:
            console.warn(`Unknown frequency "${frequency}" for expense. Defaulting to 0.`);
            return 0; // Default to 0 if frequency is unknown
    }
}

// Extract expenses for the PTRR applicant and their spouse
const applicantExpenses = ptrrApplicant?.expenses || [];
const spouseExpenses = spouse?.expenses || [];
const combinedExpenses = [...applicantExpenses, ...spouseExpenses]; // Combine both arrays

// Initialize totalPropertyTax with a default value
let totalPropertyTax = 0;

if (data.residenceStatus === 'owned' || data.residenceStatus === 'rentedowned') {
    // Calculate total property tax for 2024
    totalPropertyTax = combinedExpenses
        .filter((expense) => {
            const isPrevious = expense.type?.toLowerCase() === 'previous year';
            const isPropertyTax = expense.kind?.toLowerCase() === 'property taxes';
            console.log(`Expense type: ${expense.type}, Kind: ${expense.kind}, Is Previous: ${isPrevious}, Is Property Tax: ${isPropertyTax}`);
            return isPrevious && isPropertyTax;
        })
        .reduce((total, expense) => {
            const yearlyAmount = calculateYearlyAmount(expense);
            console.log(`Adding property tax: ${yearlyAmount}, Current total: ${total}`);
            return total + yearlyAmount;
        }, 0);

    // Format total property tax
    const totalPropertyTaxFormatted = totalPropertyTax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Write the total property tax to the PDF
    page2.drawText(totalPropertyTaxFormatted, {
        x: 473, // Replace with the actual x-coordinate
        y: 649, // Replace with the actual y-coordinate
        size: 12,
        font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
        color: PDFLib.rgb(0, 0, 0), // Black color
    });
    console.log(`Total 2024 Property Tax: ${totalPropertyTaxFormatted}`);
}

// Initialize rentPaid20Percent with a default value
let rentPaid20Percent = 0;

if (data.residenceStatus === 'rented' || data.residenceStatus === 'rentedowned') {
    // Calculate total rent paid for 2024
    const totalRentPaid = combinedExpenses
        .filter((expense) => {
            const isPrevious = expense.type?.toLowerCase() === 'previous year';
            const isRent = expense.kind?.toLowerCase() === 'rent';
            console.log(`Expense type: ${expense.type}, Kind: ${expense.kind}, Is Previous: ${isPrevious}, Is Rent: ${isRent}`);
            return isPrevious && isRent;
        })
        .reduce((total, expense) => {
            const yearlyAmount = calculateYearlyAmount(expense);
            console.log(`Adding rent paid: ${yearlyAmount}, Current total: ${total}`);
            return total + yearlyAmount;
        }, 0);

    // Format total rent paid
    const totalRentPaidFormatted = totalRentPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Write the total rent paid to the PDF
    page2.drawText(totalRentPaidFormatted, {
        x: 473, // Replace with the actual x-coordinate
        y: 606, // Replace with the actual y-coordinate
        size: 12,
        font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
        color: PDFLib.rgb(0, 0, 0), // Black color
    });
    console.log(`Total 2024 Rent Paid: ${totalRentPaidFormatted}`);

    // Calculate 20% of the total rent paid
    rentPaid20Percent = totalRentPaid * 0.2;

    // Format the 20% value
    const rentPaid20PercentFormatted = rentPaid20Percent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Write the 20% of total rent paid to the PDF
    page2.drawText(rentPaid20PercentFormatted, {
        x: 473, // Replace with the actual x-coordinate for the new field
        y: 584, // Replace with the actual y-coordinate for the new field
        size: 12,
        font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
        color: PDFLib.rgb(0, 0, 0), // Black color
    });
    console.log(`20% of Total 2024 Rent Paid: ${rentPaid20PercentFormatted}`);
}

// Define Table A mapping (example values, replace with actual data)
const rebateTableA = [
    { maxIncome: 8270, rebate: 1000 },
    { maxIncome: 15510, rebate: 770 },
    { maxIncome: 18610, rebate: 460 },
    { maxIncome: 46520, rebate: 380 },
];

// Calculate the rebate amount based on total income
function calculateRebate(totalIncome) {
    for (const bracket of rebateTableA) {
        if (totalIncome <= bracket.maxIncome) {
            return bracket.rebate;
        }
    }
    return 0; // No rebate if income exceeds all brackets
}

// Calculate the rebate amount
const rebateAmount = calculateRebate(totalIncome);

// Format the rebate amount
const rebateAmountFormatted = rebateAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Write the rebate amount to the PDF
if (data.residenceStatus === 'owned' || data.residenceStatus === 'rentedowned') {
    // Write the rebate amount to the PDF
    page2.drawText(rebateAmountFormatted, {
        x: 260, // Replace with the actual x-coordinate for the rebate field
        y: 629, // Replace with the actual y-coordinate for the rebate field
        size: 6,
        font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
        color: PDFLib.rgb(0, 0, 0), // Black color
    });
    console.log(`Property Tax Rebate Amount: ${rebateAmountFormatted}`);
}

// Parse totalPropertyTaxFormatted and rebateAmount to numbers for comparison
const rebateAmountValue = parseFloat(rebateAmountFormatted.replace(/,/g, '')); // Convert formatted string to a number

// Compare the two values and determine the lesser amount
const lesserAmount = Math.min(totalPropertyTax, rebateAmountValue);

// Format the lesser amount for display
const lesserAmountFormatted = lesserAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

if (data.residenceStatus === 'owned' || data.residenceStatus === 'rentedowned') {
    // Write the lesser amount to the PDF at the specified coordinates
    page2.drawText(lesserAmountFormatted, {
        x: 473, // Replace with the actual x-coordinate for the field
        y: 628, // Replace with the actual y-coordinate for the field
        size: 12,
        font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
        color: PDFLib.rgb(0, 0, 0), // Black color
    });
    console.log(`Lesser Amount (Total Property Tax vs Rebate): ${lesserAmountFormatted}`);
}

if (data.residenceStatus === 'rented' || data.residenceStatus === 'rentedowned') {
    // Write the rebate amount to the PDF
    page2.drawText(rebateAmountFormatted, {
        x: 232, // Replace with the actual x-coordinate for the rebate field
        y: 567, // Replace with the actual y-coordinate for the rebate field
        size: 6,
        font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
        color: PDFLib.rgb(0, 0, 0), // Black color
    });
    console.log(`Rent Rebate Amount: ${rebateAmountFormatted}`);
}

if (data.residenceStatus === 'rentedowned') {
    // Write the rebate amount to the PDF
    page2.drawText(rebateAmountFormatted, {
        x: 126, // Replace with the actual x-coordinate for the rebate field
        y: 527, // Replace with the actual y-coordinate for the rebate field
        size: 6,
        font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
        color: PDFLib.rgb(0, 0, 0), // Black color
    });
    console.log(`Property Tax/Rental Rebate Amount: ${rebateAmountFormatted}`);
}

// Compare rentPaid20PercentFormatted and rebateAmountFormatted
const rentRebateAmount = Math.min(rentPaid20Percent, rebateAmount);

// Format the lesser amount for display
const rentRebateAmountFormatted = rentRebateAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

if (data.residenceStatus === 'rented' || data.residenceStatus === 'rentedowned') {
    // Write the lesser amount to the PDF below the 20% rent section
    page2.drawText(rentRebateAmountFormatted, {
        x: 473, // Replace with the actual x-coordinate for the field
        y: 563, // Replace with the actual y-coordinate for the field
        size: 12,
        font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
        color: PDFLib.rgb(0, 0, 0), // Black color
    });
    console.log(`Lesser Amount (20% Rent vs Rebate): ${rentRebateAmountFormatted}`);
}

// Parse the formatted strings to numbers for comparison
const rentRebateAmountValue = parseFloat(rentRebateAmountFormatted.replace(/,/g, ''));
const lesserAmountValue = parseFloat(lesserAmountFormatted.replace(/,/g, ''));

// Calculate the sum of rentRebateAmount and lesserAmount
const sumOfRentAndLesser = rentRebateAmountValue + lesserAmountValue;

// Determine the lesser value between rebateAmount and the sum
const finalLesserAmount = Math.min(rebateAmountValue, sumOfRentAndLesser);

// Format the final lesser amount for display
const finalLesserAmountFormatted = finalLesserAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

if (data.residenceStatus === 'rentedowned') {
    // Write the final lesser amount to the PDF
    page2.drawText(finalLesserAmountFormatted, {
        x: 473, // Replace with the actual x-coordinate for the field
        y: 543, // Replace with the actual y-coordinate for the field
        size: 12,
        font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
        color: PDFLib.rgb(0, 0, 0), // Black color
    });
    console.log(`Final Lesser Amount (Rebate vs Sum of Rent and Lesser): ${finalLesserAmountFormatted}`);
}

// Write TOTAL INCOME to page 2
page2.drawText(totalIncomeFormatted, { // Format with commas and 2 decimal places
    x: 126, // Replace with the actual x-coordinate for page 2
    y: 361, // Replace with the actual y-coordinate for page 2
    size: 12,
    font: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    color: PDFLib.rgb(0, 0, 0), // Black color
});
console.log(`TOTAL INCOME written to page 2: ${totalIncomeFormatted}`);


// Define the coordinates for the 8 possible ovals
const ovalPositions = [
    { x: 355, y: 341 }, // Position 1 (Owned Bracket 1)
    { x: 355, y: 331 }, // Position 2 (Owned Bracket 2)
    { x: 355, y: 320 }, // Position 3 (Owned Bracket 3)
    { x: 355, y: 310 }, // Position 4 (Owned Bracket 4)
    { x: 528, y: 341 }, // Position 5 (Rented Bracket 1)
    { x: 528, y: 331 }, // Position 6 (Rented Bracket 2)
    { x: 528, y: 320 }, // Position 7 (Rented Bracket 3)
    { x: 528, y: 310 }, // Position 8 (Rented Bracket 4)
];

// Determine which oval to draw based on residenceStatus and income brackets
let ovalIndex = -1;

if (data.residenceStatus === 'owned' || data.residenceStatus === 'rentedowned') {
    if (totalIncome <= 8270) {
        ovalIndex = 0; // Bracket 1
    } else if (totalIncome <= 15510) {
        ovalIndex = 1; // Bracket 2
    } else if (totalIncome <= 18610) {
        ovalIndex = 2; // Bracket 3
    } else {
        ovalIndex = 3; // Bracket 4
    }
} else if (data.residenceStatus === 'rented') {
    if (totalIncome <= 8270) {
        ovalIndex = 4; // Bracket 1
    } else if (totalIncome <= 15510) {
        ovalIndex = 5; // Bracket 2
    } else if (totalIncome <= 18610) {
        ovalIndex = 6; // Bracket 3
    } else {
        ovalIndex = 7; // Bracket 4
    }
}

// Draw the oval if a valid index is determined
if (ovalIndex >= 0 && ovalIndex < ovalPositions.length) {
    const { x, y } = ovalPositions[ovalIndex];
    page2.drawEllipse({
        x,
        y,
        xScale: 20, // Radius in the x-direction
        yScale: 5, // Radius in the y-direction
        borderColor: PDFLib.rgb(0, 0, 0), // Black border
        borderWidth: 1, // Border width
    });
    console.log(`Drew an unfilled oval at position ${ovalIndex + 1} (x: ${x}, y: ${y}).`);
} else {
    console.warn('No valid oval position determined.');
}

// Save the filled PDF
const filledPdfBytes = await pdfDoc.save();

// Construct the filename dynamically
const year = new Date().getFullYear() - 1; // Get the current year
const formName = "PA-1000";
const applicantFirstName = ptrrApplicant?.firstName || "Applicant";
const applicantLastName = ptrrApplicant?.lastName || "Name";
const fileName = `${year} ${formName} ${applicantFirstName} ${applicantLastName}.pdf`;

// Generate the email subject dynamically
const subject = `Application Submission: ${formName} for ${applicantFirstName} ${applicantLastName}`;

// Generate the email body dynamically
const body = `
Hello,

Please find attached the completed ${formName} form for ${applicantFirstName} ${applicantLastName} for the year ${year}.

Thank you,
Your Team
`;

// Trigger download
const blob = new Blob([filledPdfBytes], { type: 'application/pdf' });
const link = document.createElement('a');
link.href = URL.createObjectURL(blob);
link.download = fileName;
link.click();

// Send the file to the backend
const formData = new FormData();
formData.append('file', blob, fileName); // Attach the file with the generated name
formData.append('recipientEmail', 'lucascampbellsounddesign@gmail.com'); // Add recipient email
formData.append('subject', subject); // Add the dynamic subject
formData.append('body', body); // Add the dynamic body

try {
    const response = await fetch('/send-email', {
        method: 'POST',
        body: formData,
    });

    const result = await response.json();
    console.log(result.message);
} catch (error) {
    console.error('Error sending email:', error);
}}

async function listFormFields() {
    const { PDFDocument } = PDFLib;

    try {
        // Load the existing PDF template
        const pdfBytes = await fetch('/assets/2024_pa-1000.pdf').then((res) => res.arrayBuffer());
        const pdfDoc = await PDFDocument.load(pdfBytes);

        // Get the form fields
        const form = pdfDoc.getForm();
        const fields = form.getFields();

        // Log detailed information about each field
        console.log('Listing all form fields:');
        fields.forEach((field) => {
            console.log(`Field name: ${field.getName()}`);
            console.log(`Field type: ${field.constructor.name}`);
        });
    } catch (error) {
        console.error('Error listing form fields:', error);
    }
}