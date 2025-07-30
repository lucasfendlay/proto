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

// Function to create navigation buttons
function createNavigationButtons() {
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
        { label: 'Expenses', action: GoToExpensesEdit, page: 'expensesedit.html' },
        { label: 'Assets', action: GoToAssetsEdit, page: 'assetsedit.html' },
        { label: 'Estimations', action: GoToEstimationsEdit, page: 'estimationsstep.html' },
        { label: 'Referrals', action: GoToReferralsEdit, page: 'referralsedit.html' }
    ];

    // Create buttons, excluding the one for the current page
    buttons.forEach(button => {
        if (button.page !== currentPage) {
            const btn = document.createElement('button');
            btn.textContent = button.label;
            btn.classList.add('navigation-button'); // Add a class for styling
            btn.addEventListener('click', button.action);
            navigationContainer.appendChild(btn);
        }
    });

    // Insert the navigation container at the very top of the body
    document.body.insertBefore(navigationContainer, document.body.firstChild);
}

// Call this function on DOMContentLoaded to ensure the buttons are added to the page
document.addEventListener('DOMContentLoaded', createNavigationButtons);