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

        noteDiv.innerHTML = `
            <p>${note.text}</p>
            <small>${note.timestamp} by ${cleanedUsername}</small>
            ${
                note.text !== 'New screening initiated.' &&
                note.text !== 'Inbound call logged.' &&
                note.text !== 'Outbound call logged.' &&
                note.text !== 'Profile checked out.' &&
                note.text !== 'Profile released.' &&
                note.text !== 'Profile terminated.' &&
                !note.text.startsWith('Referral provided.') &&
                cleanedUsername === activeUser
                    ? ` <br>
                <button class="interactive" onclick="window.editNote('${clientId}', ${notes.length - 1 - index})">Edit</button>
                <button class="interactive" onclick="window.deleteNote('${clientId}', ${notes.length - 1 - index})">Delete</button>
            `
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
    const clientId = getClientId();
    if (!clientId) {
        console.error('Client ID not found in query parameters.');
        return;
    }

    if (!activeUser) {
        console.error('No active user found in sessionStorage');
        return;
    }

    try {
        // Save a note with a timestamp
        const timestamp = new Date().toLocaleString();
        const noteText = `Profile checked out.`;
        const note = {
            text: noteText,
            timestamp: timestamp,
            username: activeUser, // Ensure the username is passed correctly
        };

        // Save the note and update the client with checkedOut status
        const response = await fetch('/add-note-to-client', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                clientId, 
                note,
                checkedOut: true, // Add checkedOut status
                activeUser // Include the active user
            }),
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            console.error('Failed to save note or update client:', result.message);
            alert('Failed to save note or update client.');
            return;
        }

        console.log('Note and client status updated successfully:', result);

        // Redirect to the profile edit page
        window.location.href = `profileedit.html?id=${clientId}`;
    } catch (error) {
        console.error('Error saving note or updating client status:', error);
    }
};

async function saveNote() {
    console.log('Save button clicked'); // Debugging
    const clientId = getClientId();
    const noteText = noteInput.value.trim();
    console.log('Client ID:', clientId); // Debugging
    console.log('Note Text:', noteText); // Debugging

    if (!noteText) {
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
        text: noteText,
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
        noteInput.value = '';
        renderNotes(clientId);
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