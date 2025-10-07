async function searchClients() {
    const firstNameInput = document.getElementById('searchFirstName').value.toLowerCase();
    const lastNameInput = document.getElementById('searchLastName').value.toLowerCase();

    try {
        const response = await fetch(`/get-all-clients`);
        const data = await response.json();
        const clients = data.clients || [];
        const filteredClients = clients.filter(client => 
            client.firstName.toLowerCase().includes(firstNameInput) && 
            client.lastName.toLowerCase().includes(lastNameInput)
        );

        const clientList = document.getElementById('clientList');
        clientList.innerHTML = '';
        filteredClients.forEach((client) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <a href="profileview.html?id=${client.id}">
                    ${client.firstName} ${client.lastName} | 
                    Phone: ${client.phoneNumber} | 
                    Address: ${client.streetAddress}, ${client.city}, ${client.state}, ${client.zipCode}, ${client.county}
                </a>`;
            clientList.appendChild(li);
        });
    } catch (error) {
        console.error('Error fetching clients:', error);
    }
}

async function saveClientAndLogCall() {
    const client = {
        id: generateUniqueId(),
        firstName: 'New',
        lastName: 'Client',
        phoneNumber: '',
        streetAddress: '',
        city: '',
        state: '',
        zipCode: '',
        county: ''
    };

    try {
        const response = await fetch('/add-client', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(client)
        });

        if (response.ok) {
            window.location.href = `call-logging.html?id=${client.id}`;
        } else {
            alert('Failed to save client.');
        }
    } catch (error) {
        console.error('Error saving client:', error);
    }
}

function generateUniqueId() {
    const randomSixDigits = Math.floor(100000 + Math.random() * 900000); // Generate a random 6-digit number
    return `ID${randomSixDigits}`;
}

async function importClientsFromCSV() {
    const fileInput = document.getElementById('csvFileInput');
    const loadingIndicator = document.getElementById('loadingIndicator'); // Get the loading indicator element
    const file = fileInput.files[0];

    if (!file) {
        alert('Please select a CSV file to upload.');
        return;
    }

    loadingIndicator.style.display = 'block'; // Show the loading indicator

    const reader = new FileReader();
    reader.onload = async function(event) {
        const csvData = event.target.result;
        const rows = csvData.split('\n').map(row => row.split(','));

        if (rows.length <= 1) {
            alert('The CSV file is empty or only contains headers.');
            loadingIndicator.style.display = 'none'; // Hide the loading indicator
            return;
        }

        const clients = rows.slice(1).map((row, index) => {
            if (row.every(cell => !cell.trim())) {
                return null;
            }

            const id = row[0]?.trim() || generateUniqueId();
            const speakingLanguage = row[9]?.trim() || '';
            const notesColumn = row[10]?.trim() || '';

            return {
                id: id,
                firstName: row[1]?.trim(),
                lastName: row[2]?.trim(),
                phoneNumber: row[3]?.trim(),
                streetAddress: row[4]?.trim(),
                city: row[5]?.trim(),
                state: row[6]?.trim(),
                zipCode: row[7]?.trim(),
                county: row[8]?.trim(),
                speakingLanguage: speakingLanguage,
                notesColumn: notesColumn
            };
        }).filter(client => client !== null);

        const BATCH_SIZE = 100;
        for (let i = 0; i < clients.length; i += BATCH_SIZE) {
            const batch = clients.slice(i, i + BATCH_SIZE);
            try {
                const response = await fetch('/add-client-batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clients: batch })
                });

                if (!response.ok) {
                    const errorDetails = await response.text();
                    console.error('Batch error:', errorDetails);
                    alert(`Failed to import a batch of clients. Server responded with: ${errorDetails}`);
                    continue;
                }

                for (const client of batch) {
                    await saveNoteForClient(client.id, `Profile created.`);
                    if (client.notesColumn) {
                        await saveNoteForClient(client.id, client.notesColumn);
                    }
                }
            } catch (error) {
                console.error('Error importing a batch of clients:', error);
                alert(`Failed to import a batch of clients. Error: ${error.message}`);
                continue;
            }
        }

        alert('All clients imported successfully!');
        loadingIndicator.style.display = 'none'; // Hide the loading indicator
        window.location.href = 'home.html';
    };

    reader.onerror = function() {
        alert('Failed to read the file. Please try again.');
        loadingIndicator.style.display = 'none'; // Hide the loading indicator
    };

    reader.readAsText(file);
}

// Helper function to save a note for a client
async function saveNoteForClient(clientId, noteText) {
    const timestamp = new Date().toLocaleString();
    const note = {
        id: crypto.randomUUID(), // Generate a unique ID for the note
        text: noteText,
        timestamp: timestamp,
        username: 'Automated Import' // Use a default username for automated notes
    };

    try {
        const response = await fetch('/add-note-to-client', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ clientId, note }),
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            console.error(`Failed to save note for client ${clientId}:`, result.message);
        } else {
            console.log(`Note saved successfully for client ${clientId}`);
        }
    } catch (error) {
        console.error(`Error saving note for client ${clientId}:`, error);
    }
}