// Helper function to get the query parameter by name
function getQueryParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Navigation functions for each button
function GoToProfileEdit() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `profileedit.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToHouseholdEdit() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `householdedit.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToRelationshipsEdit() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `relationshipsedit.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToCurrentEnrollmentsEdit() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `currentenrollmentsedit.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToIncomeEdit() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `incomeedit.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToAssetsEdit() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `assetsedit.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToExpensesEdit() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `expensesedit.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToEstimationsEdit() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `estimationsstep.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToReferralsEdit() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `referralsedit.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

// Helper function to get the query parameter by name
function getQueryParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Navigation function for Application Edit
function GoToApplicationEdit() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `applicationedit.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToAdditionalEdit() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `additionaledit.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToInsuranceEdit() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `insuranceedit.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToFinalizeEdit() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `finalizeedit.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

// Function to check if any member is applying for benefits
async function hasApplyingMembers() {
    const clientId = getQueryParameter('id');
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return false;
    }

    try {
        const response = await fetch(`/get-client/${clientId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch client data: ${response.statusText}`);
        }

        const clientData = await response.json();
        const members = clientData.householdMembers || [];

        // Check if any member has applying: true for any benefit
        return members.some(member =>
            Object.keys(member).some(benefit =>
                member[benefit]?.application?.some(app => app.applying === true)
            )
        );
    } catch (error) {
        console.error('Error checking applying members:', error);
        return false;
    }
}

// Function to create navigation buttons
async function createNavigationButtons() {
    const navigationContainer = document.createElement('div');
    navigationContainer.classList.add('navigation-buttons-container'); // Add a class for styling

    // Get the current page's filename
    const currentPage = window.location.pathname.split('/').pop();

    // Define the buttons and their corresponding functions
    const buttons = [
        { label: 'Profile', action: GoToProfileEdit, page: 'profileedit.html' },
        { label: 'Household', action: GoToHouseholdEdit, page: 'householdedit.html' },
        { label: 'Relationships', action: GoToRelationshipsEdit, page: 'relationshipsedit.html' },
        { label: 'Current Enrollments', action: GoToCurrentEnrollmentsEdit, page: 'currentenrollmentsedit.html' },
        { label: 'Income', action: GoToIncomeEdit, page: 'incomeedit.html' },
        { label: 'Assets', action: GoToAssetsEdit, page: 'assetsedit.html' },
        { label: 'Expenses', action: GoToExpensesEdit, page: 'expensesedit.html' },
        { label: 'Estimations', action: GoToEstimationsEdit, page: 'estimationsstep.html' },
        { label: 'Referrals', action: GoToReferralsEdit, page: 'referralsedit.html' }
    ];

    // Check if the Application Edit button should be added
const showApplicationEdit = await hasApplyingMembers();
if (showApplicationEdit) {
    // Find the index of the "Referrals" button
    const referralsIndex = buttons.findIndex(button => button.label === 'Referrals');

    // Insert the "Applicant" button and additional buttons before the "Referrals" button
    const additionalButtons = [
        { label: 'Applicant', action: GoToApplicationEdit, page: 'applicationedit.html' },
        { label: 'Additional', action: GoToAdditionalEdit, page: 'additionaledit.html' },
        { label: 'Insurance', action: GoToInsuranceEdit, page: 'insuranceedit.html' },
        { label: 'Review and Finalize', action: GoToFinalizeEdit, page: 'finalizeedit.html' }
    ];

    buttons.splice(referralsIndex, 0, ...additionalButtons);
}

    // Create buttons, including the one for the current page
    buttons.forEach(button => {
        const btn = document.createElement('button');
        btn.textContent = button.label;
        btn.classList.add('navigation-button'); // Add a class for styling

        // Highlight the button for the current page
        if (button.page === currentPage) {
            btn.classList.add('active'); // Add an 'active' class for styling the current page
        }

        btn.addEventListener('click', button.action);
        navigationContainer.appendChild(btn);
    });

    // Insert the navigation container at the very top of the body
    document.body.insertBefore(navigationContainer, document.body.firstChild);
}

// Call this function on DOMContentLoaded to ensure the buttons are added to the page
document.addEventListener('DOMContentLoaded', createNavigationButtons);