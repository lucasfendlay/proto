  // Define fetchClientNotes globally
  async function fetchClientNotes(clientId) {
    try {
        const response = await fetch(`/get-client-notes/${clientId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch client notes: ${response.statusText}`);
        }

        const notes = await response.json();
        return notes || [];
    } catch (error) {
        console.error('Error fetching client notes:', error);
        return [];
    }
}

document.addEventListener('DOMContentLoaded', function () {
  const notesContainer = document.getElementById('notes-container');
  const notesList = document.getElementById('notes-list');
  const noteInput = document.getElementById('note-input');
  const saveNoteButton = document.getElementById('save-note');

  let activeUser = null; // Variable to store the active user

  function getClientId() {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('id');
  }

  async function renderNotes(clientId) {
    notesList.innerHTML = '';
    const notes = await fetchClientNotes(clientId);
    console.log('Rendering notes:', notes); // Debugging line

    notes.slice().reverse().forEach((note, index) => {
        const noteDiv = document.createElement('div');
        noteDiv.className = 'note';

        // Use activeUser for comparison
        const cleanedUsername = note.username || 'Automated Import';

        // Ensure note.text is a string before performing checks
        const noteText = typeof note.text === 'string' ? note.text : '';

// Check if the buttons should be displayed
const isCustomNote = ![
    'New screening initiated.',
    'Profile checked out.',
    'Profile released.',
    'Profile terminated.',
    'Profile termination undone.',
    'Profile created.',
].some(keyword => noteText.includes(keyword)) && 
!noteText.includes('Inbound call logged') && 
!noteText.includes('Applying') && 
!noteText.includes('Referral provided');

// Determine if buttons should be shown
let shouldShowButtons = isCustomNote && cleanedUsername === activeUser;

// Ensure buttons are never shown for notes not created by the active user
if (cleanedUsername !== activeUser) {
    shouldShowButtons = false;
}

// Check if the note contains "Referral provided"
const isReferralNote = noteText.includes('Referral provided.');

// Adjust button visibility for "Referral provided" notes
if (isReferralNote) {
    shouldShowButtons = false; // Disable the default buttons
}

// Apply strong formatting to specific notes
const strongFormattedNotes = [
    'New screening initiated.',
    'Profile checked out.',
    'Profile released.',
    'Profile terminated.',
    'Profile termination undone.',
    'Profile created.',
];

const formattedNoteText = strongFormattedNotes.includes(noteText)
    ? `<strong>${noteText}</strong>`
    : noteText;

noteDiv.innerHTML = `
    <p>${formattedNoteText}</p>
    <small>${note.timestamp} by ${cleanedUsername}</small>
    ${
        isReferralNote
            ? ` <br>
                <button 
                    class="interactive" 
                    style="background: red; transition: background-color 0.3s;" 
                    onmouseover="this.style.backgroundColor='darkred'" 
                    onmouseout="this.style.backgroundColor='red'" 
                    onclick="window.deleteNote('${clientId}', ${notes.length - 1 - index})"
                >
                    Delete
                </button>`
            : shouldShowButtons
                ? ` <br>
                    <button class="interactive" onclick="window.editNote('${clientId}', ${notes.length - 1 - index})">Edit</button>
                    <button 
                        class="interactive" 
                        style="background: red; transition: background-color 0.3s;" 
                        onmouseover="this.style.backgroundColor='darkred'" 
                        onmouseout="this.style.backgroundColor='red'" 
                        onclick="window.deleteNote('${clientId}', ${notes.length - 1 - index})"
                    >
                        Delete
                    </button>`
                : ''
    }
`;
notesList.appendChild(noteDiv);
    });
}

window.editNote = async function (clientId, index) {
    console.log('Edit button clicked'); // Debugging
    console.log('Client ID:', clientId); // Debugging
    console.log('Note Index:', index); // Debugging

    try {
        const notes = await fetchClientNotes(clientId);
        const noteToEdit = notes[index];

        if (!noteToEdit) {
            console.error('Note not found at index:', index);
            return;
        }

        // Find the note element in the DOM
        const noteDiv = notesList.children[notes.length - 1 - index];
        if (!noteDiv) {
            console.error('Note element not found in DOM.');
            return;
        }

        // Replace the note's content with an editable textarea and buttons
        noteDiv.innerHTML = `
            <textarea id="edit-note-text" class="edit-textarea">${noteToEdit.text}</textarea>
            <div class="edit-actions">
                <button class="btn btn-primary" id="save-edit">Save</button>
                <button class="btn btn-secondary" id="cancel-edit">Cancel</button>
            </div>
        `;

        // Add event listeners for Save and Cancel buttons
        document.getElementById('save-edit').addEventListener('click', async () => {
            const updatedText = document.getElementById('edit-note-text').value.trim();
            if (!updatedText) {
                console.log('Edit canceled or empty input.');
                renderNotes(clientId); // Re-render the notes to restore the original view
                return;
            }

            // Update the note text
            noteToEdit.text = updatedText;
            noteToEdit.timestamp = new Date().toLocaleString(); // Update the timestamp

            // Save the updated notes back to the database
            try {
                const response = await fetch('/update-client-notes', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ clientId, notes }),
                });

                const result = await response.json();
                if (!response.ok || !result.success) {
                    console.error('Failed to update note:', result.message);
                    alert('Failed to update note.');
                    return;
                }

                console.log('Note updated successfully:', result);

                // Re-render the notes
                renderNotes(clientId);
            } catch (error) {
                console.error('Error updating note:', error);
                alert('An error occurred while updating the note.');
            }
        });

        document.getElementById('cancel-edit').addEventListener('click', () => {
            renderNotes(clientId); // Re-render the notes to restore the original view
        });
    } catch (error) {
        console.error('Error editing note:', error);
    }
};

window.GoToProfileEditChecked = async function () {
    console.log('GoToProfileEditChecked function called'); // Debugging log

    const clientId = getClientId();
    console.log('Client ID:', clientId); // Debugging log

    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }

    const activeUser = sessionStorage.getItem('loggedInUser')?.trim();
    if (!activeUser) {
        console.error('No active user found in sessionStorage');
        return;
    }

    try {
        // Save a note with a timestamp
        const noteText = `<strong>Profile checked out.</strong>`;
        await saveNote(noteText); // Call saveNote with the predefined note text

        // Update the checkedOut array
        const timestamp = new Date().toISOString();
        const updatedCheckedOut = [
            {
                status: true,
                timestamp: timestamp,
                user: activeUser,
            },
        ];

        // Send the update request to the server
        const response = await fetch('/update-client', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                clientId,
                clientData: {
                    checkedOut: updatedCheckedOut,
                },
            }),
        });

        console.log('Fetch response received'); // Debugging log
        const result = await response.json();
        console.log('Fetch result:', result); // Debugging log

        if (!response.ok || !result.success) {
            console.error('Failed to save note or update client:', result.message);
            alert('Failed to save note or update client.');
            return;
        }

        console.log('Note and client status updated successfully:', result);

        // Redirect to the profile edit page
        const redirectUrl = `profileedit.html?id=${clientId}`;
        console.log('Redirecting to:', redirectUrl); // Debugging log
        window.location.href = redirectUrl;
    } catch (error) {
        console.error('Error saving note or updating client status:', error);
    }
};

async function saveNote(noteText = null) {
    console.log('Save button clicked'); // Debugging
    const clientId = getClientId();
    
    // Ensure the text is properly retrieved
    const text = typeof noteText === 'string' ? noteText : noteInput.value.trim();
    console.log('Client ID:', clientId); // Debugging
    console.log('Note Text:', text); // Debugging

    if (!text) {
        console.log('Note text is empty, aborting save'); // Debugging
        return;
    }

    if (!activeUser) {
        console.error('No active user found in sessionStorage');
        return;
    }

    const timestamp = new Date().toLocaleString();
    const note = {
        id: crypto.randomUUID(), // Generate a unique ID for the note
        text: text, // Ensure this is a string
        timestamp: timestamp,
        username: activeUser, // Ensure the username is passed correctly
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
            console.error('Failed to save note:', result.message);
            alert('Failed to save note.');
            return;
        }

        console.log('Note saved successfully:', result);
        noteInput.value = ''; // Clear the input field after saving
        renderNotes(clientId); // Re-render the notes
    } catch (error) {
        console.error('Error saving note:', error);
    }
}

window.deleteNote = async function (clientId, index) {
    try {
        const notes = await fetchClientNotes(clientId);
        if (!notes[index]) {
            console.error('Note not found at index:', index);
            return;
        }

        const confirmDelete = confirm('Are you sure you want to delete this note? This action cannot be undone.');
        if (confirmDelete) {
            notes.splice(index, 1); // Remove the note from the array
            console.log('Updated notes after deletion:', notes); // Debugging

            // Update the notes in the database
            const response = await fetch('/update-client-notes', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ clientId, notes }),
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                console.error('Failed to delete note:', result.message);
                alert('Failed to delete note.');
                return;
            }

            console.log('Delete result:', result); // Debugging
            renderNotes(clientId);
        }
    } catch (error) {
        console.error('Error deleting note:', error);
    }
};

  function populateActiveUser() {
      activeUser = sessionStorage.getItem('loggedInUser');
      if (activeUser) {
          console.log('Active User:', activeUser); // Debugging
      } else {
          console.error('No active user found in sessionStorage');
      }
  }

  saveNoteButton.addEventListener('click', saveNote);

  // Initial setup
  const clientId = getClientId();
  populateActiveUser(); // Populate the active user
  renderNotes(clientId);
});