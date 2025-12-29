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
                }
            })
            .catch(error => {
                console.error('Error fetching user role:', error);
            });
    } else {
        console.error('No active user found in sessionStorage');
    }
}

// Call the function to populate the active user
populateActiveUser();