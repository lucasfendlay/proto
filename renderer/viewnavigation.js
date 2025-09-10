// Helper function to get the query parameter by name
function getQueryParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Navigation functions for each button
function GoToProfileView() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `profileview.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToHouseholdView() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `householdview.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToRelationshipsView() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `relationshipsview.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToCurrentEnrollmentsView() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `currentenrollmentsview.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToIncomeView() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `incomeview.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToAssetsView() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `assetsview.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToExpensesView() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `expensesview.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToEstimationsView() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `estimationsview.html?id=${clientId}`;
    } else {
        console.error('Client ID not found in query parameters.');
    }
}

function GoToReferralsView() {
    const clientId = getQueryParameter('id');
    if (clientId) {
        window.location.href = `referralsview.html?id=${clientId}`;
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
        { label: 'Home', action: () => window.location.href = 'home.html', page: 'home.html' },
        { label: 'Profile', action: GoToProfileView, page: 'profileview.html' },
        { label: 'Household', action: GoToHouseholdView, page: 'householdview.html' },
        { label: 'Relationships', action: GoToRelationshipsView, page: 'relationshipsview.html' },
        { label: 'Current Enrollments', action: GoToCurrentEnrollmentsView, page: 'currentenrollmentsview.html' },
        { label: 'Income', action: GoToIncomeView, page: 'incomeview.html' },
        { label: 'Assets', action: GoToAssetsView, page: 'assetsview.html' },

        { label: 'Expenses', action: GoToExpensesView, page: 'expensesview.html' },
        { label: 'Estimations', action: GoToEstimationsView, page: 'estimationsview.html' },
        { label: 'Directory', action: () => window.location.href = 'directory.html', page: 'directory.html' },
    ];

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