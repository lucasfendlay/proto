function populateActiveUser() {
    const activeUser = sessionStorage.getItem('loggedInUser');
    if (activeUser) {
        console.log('Active User:', activeUser); // Debugging

        // Fetch the user's role from the backend
        fetch(`/get-user-role?username=${encodeURIComponent(activeUser)}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    // Display the cleaned username and role in the upper right-hand corner
                    const userInfoDiv = document.createElement('div');
                    userInfoDiv.style.position = 'fixed';
                    userInfoDiv.style.top = '10px';
                    userInfoDiv.style.right = '10px';
                    userInfoDiv.style.backgroundColor = '#007bff';
                    userInfoDiv.style.color = 'white';
                    userInfoDiv.style.padding = '10px';
                    userInfoDiv.style.borderRadius = '5px';
                    userInfoDiv.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
                    userInfoDiv.style.zIndex = '1000000';
                    userInfoDiv.textContent = `User: ${activeUser.trim()} | Role: ${data.role}`;
                    document.body.appendChild(userInfoDiv);

// Fetch client data to check for checkedOut status
const clientId = getQueryParam('id'); // Retrieve the client ID from the URL
if (clientId) {
    fetch(`/get-client/${clientId}`)
        .then(clientResponse => clientResponse.json())
        .then(clientData => {
            if (clientData.checkedOut) {
                const checkedOutInfo = clientData.checkedOut.find(entry => entry.status === true);
                if (checkedOutInfo) {
                    const checkedOutMessage = checkedOutInfo.user === activeUser.trim()
                    ? 'Profile checked out by you.'
                    : `Profile checked out by ${checkedOutInfo.user} on ${new Date(checkedOutInfo.timestamp).toLocaleDateString()} at ${new Date(checkedOutInfo.timestamp).toLocaleTimeString()}.`;
                
                // Create a new div for the checkedOut message
                const checkedOutDiv = document.createElement('div');
                checkedOutDiv.textContent = checkedOutMessage;
                
                // Set styles based on whether the user matches
                if (checkedOutInfo.user === activeUser.trim()) {
                    checkedOutDiv.style.backgroundColor = '#007bff'; // Blue background
                } else {
                    checkedOutDiv.style.backgroundColor = '#ff4d4d'; // Red background
                }
                
                checkedOutDiv.style.color = 'white';
                checkedOutDiv.style.position = 'fixed'; // Position it fixed on the screen
                checkedOutDiv.style.top = '10px'; // Align it to the top
                checkedOutDiv.style.left = '10px'; // Align it to the left
                checkedOutDiv.style.padding = '10px';
                checkedOutDiv.style.borderRadius = '5px';
                checkedOutDiv.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
                checkedOutDiv.style.zIndex = '1000000';
                
                // Append the new div to the body
                document.body.appendChild(checkedOutDiv);                }
            }
        })
        .catch(error => {
            console.error('Error fetching client data:', error);
        });
} else {
    console.error('No clientId found in query parameters');
}                }
            })
            .catch(error => {
                console.error('Error fetching user role:', error);
            });
    } else {
        console.error('No active user found in sessionStorage');
    }
}

// Utility function to get query parameter by name
function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Call the function to populate the active user
populateActiveUser();