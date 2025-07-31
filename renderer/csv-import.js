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

async function parseCSVAndSaveProfiles(csvData) {
    const rows = csvData.split('\n').filter(row => row.trim() !== '');
    const clients = rows.map(row => {
        const [firstName, lastName, phoneNumber, streetAddress, city, state, zipCode, county, languageNumber, notesColumn] = row.split(',');

        // Determine the language based on the languageNumber column
        const language = languageNumber.trim() === '1' ? 'English' : languageNumber.trim() === '2' ? 'Spanish' : 'Unknown';

        // Parse notes dynamically from the CSV column
        const additionalNotes = notesColumn ? notesColumn.trim().split(';').map(note => ({
            text: note.trim(),
            timestamp: new Date().toISOString()
        })) : [];

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
                
                ...additionalNotes // Add dynamically parsed notes
            ]
        };
    });

    try {
        const response = await fetch('/add-client-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clients })
        });

        if (response.ok) {
            alert('CSV data imported successfully!');
        } else {
            alert('Failed to import CSV data.');
        }
    } catch (error) {
        console.error('Error importing CSV data:', error);
        alert('An error occurred while importing CSV data.');
    }
}

function generateUniqueId() {
    const randomSixDigits = Math.floor(100000 + Math.random() * 900000); // Generate a random 6-digit number
    return `ID${randomSixDigits}`;
}