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
async function createNavigationButtons() {
    const navigationContainer = document.createElement('div');
    navigationContainer.classList.add('navigation-buttons-container');

    // Profile ID pill (top-left of nav banner) - click to copy URL
    const clientId = getQueryParameter('id');
    const profileIdPill = document.createElement('span');
    profileIdPill.id = 'profileId';
    profileIdPill.textContent = clientId || 'Loading...';
    profileIdPill.title = 'Click to copy page URL';
    profileIdPill.setAttribute('role', 'button');
    profileIdPill.setAttribute('tabindex', '0');
    profileIdPill.style.cssText = [
        'position: fixed',
        'top: 10px',
        'left: 65px',
        'margin: 5px',
        'z-index: 10001',
        'display: inline-block',
        'font-size: 1.8rem',
        'font-weight: 600',
        'color: #fff',
        'background-color: #007bff',
        'padding: 4px 14px',
        'border-radius: 999px',
        'letter-spacing: 0.03em',
        'box-shadow: 0 1px 3px rgba(0, 123, 255, 0.3)',
        'cursor: pointer',
        'user-select: none',
        'transition: background-color 0.2s ease, transform 0.15s ease'
    ].join(';');

    profileIdPill.addEventListener('mouseover', () => {
        profileIdPill.style.backgroundColor = '#0056b3';
    });
    profileIdPill.addEventListener('mouseout', () => {
        profileIdPill.style.backgroundColor = '#007bff';
    });

    const copyPageUrl = async () => {
        const url = window.location.href;
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(url);
            } else {
                const ta = document.createElement('textarea');
                ta.value = url;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }

            // Visual feedback: temporarily show "Copied!" then restore
            const originalText = profileIdPill.textContent;
            profileIdPill.textContent = 'Link Copied!';
            profileIdPill.style.backgroundColor = '#28a745';
            setTimeout(() => {
                profileIdPill.textContent = originalText;
                profileIdPill.style.backgroundColor = '#007bff';
            }, 1200);
        } catch (err) {
            console.error('Failed to copy URL:', err);
        }
    };

    profileIdPill.addEventListener('click', copyPageUrl);
    profileIdPill.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            copyPageUrl();
        }
    });

    document.body.appendChild(profileIdPill);

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
    // Add a border line below the navigation container
    navigationContainer.style.borderBottom = '2px solid #ccc';
    navigationContainer.style.paddingBottom = '10px';
    navigationContainer.style.marginBottom = '10px';
}

// Call this function on DOMContentLoaded to ensure the buttons are added to the page
document.addEventListener('DOMContentLoaded', createNavigationButtons);