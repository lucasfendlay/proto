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
                    const clientId = getQueryParam('id');
                    if (clientId) {
                        fetch(`/get-client/${clientId}`)
                            .then(clientResponse => clientResponse.json())
                            .then(clientData => {
                                if (clientData.checkedOut) {
                                    const checkedOutInfo = clientData.checkedOut.find(entry => entry.status === true);
                                    if (checkedOutInfo) {
                                        const checkedOutMessage = checkedOutInfo.user === activeUser.trim()
                                            ? `Profile ${clientId} checked out by you.`
                                            : `Profile ${clientId} checked out by ${checkedOutInfo.user} on ${new Date(checkedOutInfo.timestamp).toLocaleDateString()} at ${new Date(checkedOutInfo.timestamp).toLocaleTimeString()}.`;

                                        // Create the checkedOut message element for the sidebar
                                        const checkedOutDiv = document.createElement('div');
                                        checkedOutDiv.id = 'checked-out-status';
                                        checkedOutDiv.textContent = checkedOutMessage;

                                        const isOwnCheckout = checkedOutInfo.user === activeUser.trim();
                                        checkedOutDiv.style.backgroundColor = isOwnCheckout ? '#007bff' : '#ff4d4d';
                                        checkedOutDiv.style.color = 'white';
                                        checkedOutDiv.style.padding = '10px';
                                        checkedOutDiv.style.borderRadius = '5px';
                                        checkedOutDiv.style.marginBottom = '10px';
                                        checkedOutDiv.style.fontSize = '13px';
                                        checkedOutDiv.style.textAlign = 'center';
                                        checkedOutDiv.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';

                                        // Insert into the left sidebar container
                                        const sidebar = document.querySelector('#contactsSidebarContainer')
                                            || document.querySelector('.left-sidebar-container')
                                            || document.querySelector('#left-sidebar')
                                            || document.querySelector('.left-sidebar')
                                            || document.querySelector('.sidebar-container')
                                            || document.querySelector('[class*="left-sidebar"]');

                                        if (sidebar) {
                                            sidebar.insertBefore(checkedOutDiv, sidebar.firstChild);
                                        } else {
                                            // Fallback: if no sidebar found, append fixed to body
                                            checkedOutDiv.style.position = 'fixed';
                                            checkedOutDiv.style.top = '10px';
                                            checkedOutDiv.style.left = '10px';
                                            checkedOutDiv.style.zIndex = '1000000';
                                            document.body.appendChild(checkedOutDiv);
                                        }
                                    }
                                }
                            })
                            .catch(error => {
                                console.error('Error fetching client data:', error);
                            });
                    } else {
                        console.error('No clientId found in query parameters');
                    }
                }
            })
            .catch(error => {
                console.error('Error fetching user role:', error);
            });
    } else {
        console.error('No active user found in sessionStorage');
    }
}

const loggedInUser = sessionStorage.getItem('loggedInUser');

if (loggedInUser) {
    const ws = new WebSocket(`wss://${window.location.host}/?username=${loggedInUser}`);
    ws.onopen = () => {
        console.log('WebSocket connection established for:', loggedInUser);

        // Start sending heartbeat messages every 30 seconds
        window.heartbeatInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
                console.log('Heartbeat sent to server.');
            }
        }, 30000); // 30 seconds
    };

    let isRedirecting = false;
    let pendingRedirectUrl = null;

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.redirectUrl && !isRedirecting) {
            isRedirecting = true;
            pendingRedirectUrl = data.redirectUrl;
            console.log('Redirect received:', data.redirectUrl);

            // Block any immediate navigation until user acknowledges
            window.addEventListener('beforeunload', blockNavigation);

            // Show a custom modal overlay instead of alert()
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100vw';
            overlay.style.height = '100vh';
            overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.zIndex = '9999999';

            const box = document.createElement('div');
            box.style.backgroundColor = 'white';
            box.style.padding = '30px';
            box.style.borderRadius = '10px';
            box.style.textAlign = 'center';
            box.style.maxWidth = '400px';
            box.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';

            const msg = document.createElement('p');
            msg.textContent = 'This profile has been released by an administrator. You will be redirected to the profile view.';
            msg.style.marginBottom = '20px';
            msg.style.fontSize = '16px';

            const btn = document.createElement('button');
            btn.textContent = 'OK';
            btn.style.padding = '10px 30px';
            btn.style.fontSize = '16px';
            btn.style.cursor = 'pointer';
            btn.style.backgroundColor = '#007bff';
            btn.style.color = 'white';
            btn.style.border = 'none';
            btn.style.borderRadius = '5px';
            btn.onclick = () => {
                window.removeEventListener('beforeunload', blockNavigation);
                window.location.href = pendingRedirectUrl;
            };

            box.appendChild(msg);
            box.appendChild(btn);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
        }
    };

    function blockNavigation(e) {
        if (isRedirecting && pendingRedirectUrl) {
            e.preventDefault();
            e.returnValue = 'This profile was released by an administrator.';
        }
    }

    ws.onclose = () => {
        console.log('WebSocket connection closed.');
        clearInterval(window.heartbeatInterval); // Stop the heartbeat
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
} else {
    console.error('No logged-in user found in sessionStorage. WebSocket connection not established.');
}

// Utility function to get query parameter by name
function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Call the function to populate the active user
populateActiveUser();