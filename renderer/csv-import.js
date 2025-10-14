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
    const loadingIndicator = document.getElementById('loadingIndicator');
    const progressBar = document.getElementById('progressBar');
    const progressPercentage = document.getElementById('progressPercentage');
    const file = fileInput.files[0];

    if (!file) {
        alert('Please select a CSV file to upload.');
        return;
    }

    loadingIndicator.style.display = 'block'; // Show the loading indicator
    progressBar.style.width = '0%'; // Reset progress bar
    progressPercentage.textContent = '0%'; // Reset progress percentage

    const reader = new FileReader();
    reader.onload = async function(event) {
        const csvData = event.target.result;
        const rows = csvData.split('\n').map(row => row.split(','));

        if (rows.length <= 1) {
            alert('The CSV file is empty or only contains headers.');
            loadingIndicator.style.display = 'none'; // Hide the loading indicator
            return;
        }

        // Replace blank cells with "N/A"
        const sanitizedRows = rows.map(row => row.map(cell => cell.trim() || ''));

        const updatedRows = [sanitizedRows[0]]; // Start with the header row
        const existingClientsResponse = await fetch('/get-all-clients'); // Fetch all existing clients
        const existingClientsData = await existingClientsResponse.json();
        const existingClients = existingClientsData.clients || [];

        let shouldExportCsv = false; // Flag to determine if CSV export is needed

        const clients = rows.slice(1).map((row, index) => {
            if (row.every(cell => !cell.trim())) {
                return null;
            }
        
            const id = row[0]?.trim();
            const mailID = row[10]?.trim() || ''; // Column K (mailID)
        
            if (id) {
                const normalizedId = id.trim(); // Ensure ID is trimmed
                const existingClient = existingClients.find(client => client.id === normalizedId);
        
                if (existingClient) {
                    // Update only the mailID field for the existing client
                    const normalizedMailID = mailID.trim(); // Ensure mailID is trimmed
                    existingClient.mailID = normalizedMailID;
        
                    // Always add a note to the existing profile
                    saveNoteForClient(
                        existingClient.id,
                        buildClientNote({
                            mailID: normalizedMailID,
                            dataSource: row[12]?.trim() || '', // Column M (dataSource)
                            outreachMailDate: row[13]?.trim() || '' // Column N (outreachMailDate)
                        })
                    );
        
                    // Update the row in the CSV
                    updatedRows[index + 1] = row; // Keep the row as is
                    updatedRows[index + 1][10] = normalizedMailID; // Update mailID in the row
                    return null; // Skip creating a new client object
                }
            }
        
            const speakingLanguage = row[9]?.trim() || '';
            const primaryBenefit = row[11]?.trim() || ''; // New column
            const dataSource = row[12]?.trim() || ''; // New column
            const outreachMailDate = row[13]?.trim() || ''; // New column
            const dateOfBirth = row[14]?.trim() || ''; // New column
            const legalSex = row[15]?.trim() || ''; // New column
            const socialSecurity = row[16]?.trim() || ''; // New column
        
            // Create a new client object
const client = {
    id: (id || generateUniqueId()).toUpperCase(),
    firstName: row[1]?.trim().toUpperCase(),
    lastName: row[2]?.trim().toUpperCase(),
    phoneNumber: row[3]?.trim().toUpperCase(),
    streetAddress: row[4]?.trim().replace(/^"|"$/g, '').toUpperCase(),
    city: row[5]?.trim().toUpperCase(),
    state: row[6]?.trim().toUpperCase(),
    zipCode: row[7]?.trim().toUpperCase(),
    county: row[8]?.trim().toUpperCase(),
    speakingLanguage: speakingLanguage.toUpperCase(),
    mailID: mailID.toUpperCase(),
    primaryBenefit: primaryBenefit.toUpperCase(),
    dataSource: dataSource.toUpperCase(),
    outreachMailDate: outreachMailDate.toUpperCase(),
    householdMembers: [] // Prepare an array for household members
};
        
            // Add household member data to the client object
            if (dateOfBirth || legalSex || socialSecurity) {
                // Normalize legalSex values
                const normalizedLegalSex = legalSex.toUpperCase() === 'M' ? 'MALE' : legalSex.toUpperCase() === 'F' ? 'FEMALE' : legalSex.toUpperCase();
            
                // Helper function to calculate age in years, months, and days
const calculateAge = (dob) => {
    const birthDate = new Date(dob);
    const today = new Date();
    today.setDate(today.getDate() - 1); // Subtract 1 day from the current date
    let years = today.getFullYear() - birthDate.getFullYear();
    let months = today.getMonth() - birthDate.getMonth();
    let days = today.getDate() - birthDate.getDate();

    if (days < 0) {
        months -= 1;
        days += new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    }
    if (months < 0) {
        years -= 1;
        months += 12;
    }

    return { years, months, days };
};

// Reformat dateOfBirth from MM/DD/YYYY to YYYY/MM/DD and calculate age
let formattedDateOfBirth = '';
let age = null;

if (dateOfBirth) {
    const [month, day, year] = dateOfBirth.split('/');
    if (month && day && year) {
        formattedDateOfBirth = `${year}-${month}-${day}`; // Ensure correct order

        // Calculate age
        const { years, months, days } = calculateAge(formattedDateOfBirth);
        age = `${years} years, ${months} months, ${days} days`; // Format age as a string
    }
}

client.householdMembers.push({
    householdMemberId: crypto.randomUUID(), // Ensure a unique ID is generated
    firstName: client.firstName.toUpperCase(),
    lastName: client.lastName.toUpperCase(),
    dob: formattedDateOfBirth,
    age: age, // Include the calculated age as a string
    legalSex: normalizedLegalSex || '',
    socialSecurityNumber: socialSecurity ? socialSecurity.toUpperCase() : ''
});
            }

            updatedRows.push([
                client.id,
                client.firstName,
                client.lastName,
                client.phoneNumber,
                client.streetAddress,
                client.city,
                client.state,
                client.zipCode,
                client.county,
                client.speakingLanguage,
                client.mailID,
                client.primaryBenefit,
                client.dataSource,
                client.outreachMailDate
            ]);
        
            shouldExportCsv = true; // Mark that a new client was added, so CSV export is needed
            return client; // Return the properly defined client object
        }).filter(client => client !== null);
        
        const BATCH_SIZE = 100;
        const totalBatches = Math.ceil(clients.length / BATCH_SIZE);
        
        // Step 1: Send all clients in batches
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
        
                const responseData = await response.json();
                const importedClients = responseData.clients || [];
        
                for (let j = 0; j < batch.length; j++) {
                    const client = batch[j];
                    const importedClient = importedClients[j];
                    if (importedClient && importedClient.id) {
                        client.id = importedClient.id; // Update the ID with the server-generated ID
                        updatedRows[i + j + 1][0] = importedClient.id; // Update the ID in the CSV row
                    }
        
                    await saveNoteForClient(client.id, buildClientNote(client, true)); // Pass true for isNewProfile
                }
        
                // Update progress bar
                const currentBatch = Math.floor(i / BATCH_SIZE) + 1;
                const progress = Math.min((currentBatch / totalBatches) * 100, 100);
                progressBar.style.width = `${progress}%`;
                progressPercentage.textContent = `${Math.round(progress)}%`;
            } catch (error) {
                console.error('Error importing a batch of clients:', error);
                alert(`Failed to import a batch of clients. Error: ${error.message}`);
                continue;
            }
        }
        
        // Step 2: Create household members for each client
        for (const client of clients) {
            for (const member of client.householdMembers) {
                await createHouseholdMember(client.id, member);
            }
        }

        // Trigger CSV download only if new clients were added
        if (shouldExportCsv) {
            const updatedCsvContent = updatedRows.map(row => row.join(',')).join('\n');
            const blob = new Blob([updatedCsvContent], { type: 'text/csv' });
            const downloadLink = document.createElement('a');
            downloadLink.href = URL.createObjectURL(blob);
            downloadLink.download = 'updated-clients.csv';
            downloadLink.click();
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

async function createHouseholdMember(clientId, householdMemberData) {
    try {
        // Ensure the householdMemberId is included
        householdMemberData.householdMemberId = householdMemberData.householdMemberId || crypto.randomUUID();

        // Set headOfHousehold to true
        householdMemberData.headOfHousehold = true;

        // Log the data being sent for debugging
        console.log('Sending householdMemberData:', householdMemberData);

        const response = await fetch('/save-household-member', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId: clientId,
                member: householdMemberData // Match the backend's `member` field
            })
        });

        if (!response.ok) {
            const errorDetails = await response.text();
            console.error(`Failed to create household member for client ${clientId}:`, errorDetails);
        } else {
            console.log(`Household member created successfully for client ${clientId}`);
        }
    } catch (error) {
        console.error(`Error creating household member for client ${clientId}:`, error);
    }
}

function buildClientNote(client, isNewProfile) {
    const noteParts = [];

    if (isNewProfile) {
        noteParts.push('<strong>Profile created and outreach letter sent.</strong><br><br>');
    } else {
        noteParts.push('<strong>Non-responder letter sent.</strong><br><br>');
    }

    if (client.mailID) {
        noteParts.push(`<strong>Mail ID: ${client.mailID} </strong><br><br>`);
    }
    if (client.primaryBenefit) {
        noteParts.push(`<strong>Primary Benefit: ${client.primaryBenefit}</strong><br><br>`);
    }
    if (client.dataSource) {
        noteParts.push(`<strong>Data Source: ${client.dataSource}</strong><br><br>`);
    }
    if (client.outreachMailDate) {
        noteParts.push(`<strong>Outreach Mail Date: ${client.outreachMailDate}</strong><br><br>`);
    }

    // Join the note parts with two line breaks
    return noteParts.join('\r\n\r\n'); // Use \r\n for better cross-platform compatibility
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