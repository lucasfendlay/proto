document.getElementById('csvFileInput').addEventListener('change', handleFileUpload);

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const csvData = e.target.result;
            parseCSVAndSaveProfiles(csvData);
        };
        reader.readAsText(file);
    }
}

function parseCSVAndSaveProfiles(csvData) {
    const rows = csvData.split('\n').filter(row => row.trim() !== '');
    const clients = rows.map(row => {
        const [firstName, lastName, phoneNumber, streetAddress, city, state, zipCode, county, languageNumber] = row.split(',');
        
        // Determine the language based on the languageNumber column
        const language = languageNumber.trim() === '1' ? 'English' : languageNumber.trim() === '2' ? 'Spanish' : 'Unknown';

        return {
            id: generateUniqueId(),
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phoneNumber: phoneNumber.trim(),
            streetAddress: streetAddress.trim(),
            city: city.trim(),
            state: state.trim(),
            zipCode: zipCode.trim(),
            county: county.trim(),
            notes: [
                {
                    text: 'CAP Closure Letter Recipient, Cohort 1',
                    timestamp: new Date().toISOString()
                },
                {
                    text: `Speaking Language: ${language}`,
                    timestamp: new Date().toISOString()
                }
            ]
        };
    });

    let existingClients = JSON.parse(localStorage.getItem('clients')) || [];
    existingClients = existingClients.concat(clients);
    localStorage.setItem('clients', JSON.stringify(existingClients));
    alert('CSV data imported successfully!');
}

function generateUniqueId() {
    return '_' + Math.random().toString(36).substr(2, 9);
}