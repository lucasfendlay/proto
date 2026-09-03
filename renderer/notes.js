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

    let activeUser = null;

    function getClientId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id');
    }

    // ── Inject toggle styles ──
    const toggleStyle = document.createElement('style');
    toggleStyle.textContent = `
        .notes-sidebar-toggle {
            display: flex;
            gap: 0;
            margin-bottom: 10px;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #007bff;
            width: 100%;
            flex-shrink: 0;
            position: relative;
            z-index: 0;
            background-color: #fff;
        }

        .notes-toggle-btn {
            flex: 1;
            padding: 8px 12px;
            border: none;
            background-color: #fff;
            color: #007bff;
            cursor: pointer;
            font-size: 0.85rem;
            font-weight: 600;
            transition: background-color 0.2s ease, color 0.2s ease;
        }

        .notes-toggle-btn.active {
            background-color: #007bff;
            color: #fff;
        }

        .notes-toggle-btn:hover:not(.active) {
            background-color: #e6f0ff;
        }

        /* Letters & Documents panels */
        #letters-panel,
        #documents-panel {
            width: 95%;
            overflow-y: auto;
            padding: 10px;
            background-color: #f9f9f9;
            border-top: 1px solid #ccc;
            display: none;
            min-height: 60px;
        }

        #letters-panel .letter-card,
        #documents-panel .document-card {
            border: 1px solid #ccc;
            padding: 10px;
            margin-bottom: 10px;
            background-color: #fff;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            text-align: center;
            cursor: pointer;
            transition: background-color 0.2s ease, box-shadow 0.2s ease;
        }

        #letters-panel .letter-card:hover {
            background-color: #e6f0ff;
            box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
        }

        #letters-panel .letter-card p,
        #documents-panel .document-card p {
            margin: 4px 0;
        }

        .letter-thumbnail {
            width: 100%;
            max-width: 200px;
            height: 120px;
            background-color: #e9ecef;
            border: 1px solid #ccc;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 8px auto;
            font-size: 2rem;
            color: #6c757d;
        }

        .letter-card .letter-actions {
            margin-top: 8px;
            display: flex;
            gap: 6px;
            justify-content: center;
        }

        .letter-card .letter-actions button {
            padding: 4px 10px;
            font-size: 0.8rem;
            border: 1px solid #ccc;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.2s ease;
        }

        .letter-card .letter-actions .delete-letter-btn {
            background-color: red;
            color: white;
            border-color: red;
        }

        .letter-card .letter-actions .delete-letter-btn:hover {
            background-color: darkred;
        }

        .letter-card .letter-actions .open-letter-btn {
            background-color: #007bff;
            color: white;
            border-color: #007bff;
        }

        .letter-card .letter-actions .open-letter-btn:hover {
            background-color: #0056b3;
        }

        .letters-empty,
        .documents-empty {
            color: #6c757d;
            font-style: italic;
            margin-top: 20px;
            text-align: center;
        }
    `;
    document.head.appendChild(toggleStyle);

    // ── Build toggle bar ──
    const toggleBar = document.createElement('div');
    toggleBar.className = 'notes-sidebar-toggle';

    const notesBtn = document.createElement('button');
    notesBtn.className = 'notes-toggle-btn active';
    notesBtn.textContent = 'Notes';
    notesBtn.id = 'notes-tab-btn';

    const lettersBtn = document.createElement('button');
    lettersBtn.className = 'notes-toggle-btn';
    lettersBtn.textContent = 'Letters';
    lettersBtn.id = 'letters-tab-btn';

    const documentsBtn = document.createElement('button');
    documentsBtn.className = 'notes-toggle-btn';
    documentsBtn.textContent = 'Documents';
    documentsBtn.id = 'documents-tab-btn';

    toggleBar.appendChild(notesBtn);
    toggleBar.appendChild(lettersBtn);
    toggleBar.appendChild(documentsBtn);

    // Insert toggle bar as the first child of notes-container
    notesContainer.insertBefore(toggleBar, notesContainer.firstChild);

    // ── Build Letters panel ──
    const lettersPanel = document.createElement('div');
    lettersPanel.id = 'letters-panel';
    lettersPanel.innerHTML = '<p class="letters-empty">No letters available.</p>';
    // Insert after save button, before notes list
    notesList.parentNode.insertBefore(lettersPanel, notesList);

    // ── Build Documents panel ──
    const documentsPanel = document.createElement('div');
    documentsPanel.id = 'documents-panel';
    documentsPanel.innerHTML = '<p class="documents-empty">No documents required.</p>';
    // Insert after letters panel, before notes list
    notesList.parentNode.insertBefore(documentsPanel, notesList);

    // ── Tab switching logic ──
    function showNotesTab(tab) {
        // Elements for Notes tab
        const notesElements = [noteInput, saveNoteButton, notesList];

        // All tab buttons
        const allBtns = [notesBtn, lettersBtn, documentsBtn];

        // Deactivate all buttons, hide all panels
        allBtns.forEach(btn => btn.classList.remove('active'));
        notesElements.forEach(el => {
            if (el) el.style.display = 'none';
        });
        lettersPanel.style.display = 'none';
        documentsPanel.style.display = 'none';

        // Activate selected tab
        if (tab === 'notes') {
            notesBtn.classList.add('active');
            notesElements.forEach(el => {
                if (el) el.style.display = '';
            });
        } else if (tab === 'letters') {
            lettersBtn.classList.add('active');
            lettersPanel.style.display = 'block';
            renderLetters();
        } else if (tab === 'documents') {
            documentsBtn.classList.add('active');
            documentsPanel.style.display = 'block';
            renderDocuments();
        }
    }

    notesBtn.addEventListener('click', () => showNotesTab('notes'));
    lettersBtn.addEventListener('click', () => showNotesTab('letters'));
    documentsBtn.addEventListener('click', () => showNotesTab('documents'));

    // ── Letters rendering — fetches metadata, renders thumbnails ──
    async function renderLetters() {
        const clientId = getClientId();
        if (!clientId) return;

        lettersPanel.innerHTML = '<p style="color:#6c757d;text-align:center;">Loading letters...</p>';

        try {
            const response = await fetch(`/get-letters/${clientId}`);
            if (!response.ok) throw new Error(response.statusText);
            const result = await response.json();
            const letters = result.letters || [];

            if (letters.length === 0) {
                lettersPanel.innerHTML = '<p class="letters-empty">No letters available.</p>';
                return;
            }

            lettersPanel.innerHTML = '';
            const fragment = document.createDocumentFragment();

            letters.slice().reverse().forEach((letter) => {
                const card = document.createElement('div');
                card.className = 'letter-card';

                card.innerHTML = `
                    <div class="letter-thumbnail">📄</div>
                    <p><strong>${letter.title || letter.fileName || 'Untitled Letter'}</strong></p>
                    <p style="font-size:0.8rem;color:#6c757d;">${letter.timestamp || ''}</p>
                    <p style="font-size:0.8rem;color:#6c757d;">By: ${letter.generatedBy || 'Unknown'}</p>
                    <div class="letter-actions">
                        <button class="open-letter-btn">Open</button>
                        <button class="delete-letter-btn">Delete</button>
                    </div>
                `;

                // Open letter in new tab
                card.querySelector('.open-letter-btn').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        const letterResponse = await fetch(`/get-letter/${clientId}/${letter.letterId}`);
                        if (!letterResponse.ok) throw new Error('Failed to fetch letter data');
                        const letterResult = await letterResponse.json();
                        const letterData = letterResult.letter;

                        const byteCharacters = atob(letterData.data);
                        const byteNumbers = new Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        const byteArray = new Uint8Array(byteNumbers);
                        const blob = new Blob([byteArray], { type: letterData.mimeType || 'application/pdf' });
                        const url = URL.createObjectURL(blob);
                        window.open(url, '_blank');
                    } catch (err) {
                        console.error('Error opening letter:', err);
                        alert('Failed to open letter.');
                    }
                });

                // Also open on card click (thumbnail area)
                card.querySelector('.letter-thumbnail').addEventListener('click', () => {
                    card.querySelector('.open-letter-btn').click();
                });

                // Delete letter
                card.querySelector('.delete-letter-btn').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Are you sure you want to delete "${letter.title || letter.fileName}"?`)) return;

                    try {
                        const deleteResponse = await fetch('/delete-letter', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ clientId, letterId: letter.letterId }),
                        });
                        const deleteResult = await deleteResponse.json();
                        if (deleteResponse.ok && deleteResult.success) {
                            renderLetters();
                        } else {
                            alert('Failed to delete letter.');
                        }
                    } catch (err) {
                        console.error('Error deleting letter:', err);
                        alert('An error occurred while deleting the letter.');
                    }
                });

                fragment.appendChild(card);
            });

            lettersPanel.appendChild(fragment);
        } catch (error) {
            console.error('Error rendering letters:', error);
            lettersPanel.innerHTML = '<p style="color:red;">Error loading letters.</p>';
        }
    }

    // ── Documents rendering (placeholder — wire up to your data source) ──
    async function renderDocuments() {
        const clientId = getClientId();
        if (!clientId) return;

        try {
            const response = await fetch(`/get-client/${clientId}`);
            if (!response.ok) throw new Error(response.statusText);
            const client = await response.json();
            const documents = client.Documents || client.documents || [];

            if (documents.length === 0) {
                documentsPanel.innerHTML = '<p class="documents-empty">No documents required.</p>';
                return;
            }

            documentsPanel.innerHTML = '';
            const fragment = document.createDocumentFragment();
            documents.forEach((doc, index) => {
                const card = document.createElement('div');
                card.className = 'document-card';
                card.innerHTML = `
                    <p><strong>${doc.title || doc.name || `Document ${index + 1}`}</strong></p>
                    <p>${doc.date || doc.timestamp || ''}</p>
                    <p>${doc.description || doc.type || ''}</p>
                `;
                fragment.appendChild(card);
            });
            documentsPanel.appendChild(fragment);
        } catch (error) {
            console.error('Error rendering documents:', error);
            documentsPanel.innerHTML = '<p style="color:red;">Error loading documents.</p>';
        }
    }

    // ── Existing notes rendering (unchanged) ──
    async function renderNotes(clientId) {
        notesList.innerHTML = '';
        const notes = await fetchClientNotes(clientId);
        console.log('Rendering notes:', notes);

        notes.slice().reverse().forEach((note, index) => {
            const noteDiv = document.createElement('div');
            noteDiv.className = 'note';

            const cleanedUsername = note.username || 'Automated Import';
            const noteText = typeof note.text === 'string' ? note.text : '';

            const isCustomNote = ![
                'New screening initiated.',
                'Profile checked out.',
                'Profile released.',
                'Profile terminated.',
                'Profile termination undone.',
                'Profile created.',
                'PTRR Application completed.'
            ].some(keyword => noteText.includes(keyword)) &&
            !noteText.includes('Inbound call logged.') &&
            !noteText.includes('Outbound call logged.') &&
            !noteText.includes('Applying') &&
            !noteText.includes('SNAP screening closed.') &&
            !noteText.includes('SNAP screening reopened.') &&
            !noteText.includes('LIHEAP screening closed.') &&
            !noteText.includes('LIHEAP screening reopened.') &&
            !noteText.includes('Screening terminated.') &&
            !noteText.includes('Screening(s) closed.') &&
            !noteText.includes('screening reopened') &&
            !noteText.includes('application closed.') &&
            !noteText.includes('applications closed.') &&
            !noteText.includes('Referral provided');

            let shouldShowButtons = isCustomNote && cleanedUsername === activeUser;
            if (cleanedUsername !== activeUser) {
                shouldShowButtons = false;
            }

            const isReferralNote = noteText.includes('Referral provided.');
            if (cleanedUsername !== activeUser) {
                shouldShowButtons = false;
            } else if (isReferralNote) {
                shouldShowButtons = false;
            }

            const strongFormattedNotes = [
                'New screening initiated.',
                'Profile checked out.',
                'Profile released.',
                'Profile terminated.',
                'Profile termination undone.',
                'Profile created.',
                'PTRR Application completed.'
            ];

            const formattedNoteText = strongFormattedNotes.includes(noteText)
                ? `<strong>${noteText}</strong>`
                : noteText;

            noteDiv.innerHTML = `
                <p>${formattedNoteText}</p>
                <small>${note.timestamp} by ${cleanedUsername}</small>
                ${
                    isReferralNote && cleanedUsername === activeUser
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

    window.renderNotes = renderNotes;

    window.editNote = async function (clientId, index) {
        console.log('Edit button clicked');
        console.log('Client ID:', clientId);
        console.log('Note Index:', index);

        try {
            const notes = await fetchClientNotes(clientId);
            const noteToEdit = notes[index];

            if (!noteToEdit) {
                console.error('Note not found at index:', index);
                return;
            }

            const noteDiv = notesList.children[notes.length - 1 - index];
            if (!noteDiv) {
                console.error('Note element not found in DOM.');
                return;
            }

            noteDiv.innerHTML = `
                <textarea id="edit-note-text" class="edit-textarea">${noteToEdit.text}</textarea>
                <div class="edit-actions">
                    <button class="btn btn-primary" id="save-edit">Save</button>
                    <button class="btn btn-secondary" id="cancel-edit">Cancel</button>
                </div>
            `;

            document.getElementById('save-edit').addEventListener('click', async () => {
                const updatedText = document.getElementById('edit-note-text').value.trim();
                if (!updatedText) {
                    console.log('Edit canceled or empty input.');
                    renderNotes(clientId);
                    return;
                }

                noteToEdit.text = updatedText;
                noteToEdit.timestamp = new Date().toLocaleString();

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
                    renderNotes(clientId);
                } catch (error) {
                    console.error('Error updating note:', error);
                    alert('An error occurred while updating the note.');
                }
            });

            document.getElementById('cancel-edit').addEventListener('click', () => {
                renderNotes(clientId);
            });
        } catch (error) {
            console.error('Error editing note:', error);
        }
    };

    window.GoToProfileEditChecked = async function () {
        console.log('GoToProfileEditChecked function called');

        const clientId = getClientId();
        console.log('Client ID:', clientId);

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
            const noteText = `<strong>Profile checked out.</strong>`;
            await saveNote(noteText);

            const timestamp = new Date().toISOString();
            const updatedCheckedOut = [
                {
                    status: true,
                    timestamp: timestamp,
                    user: activeUser,
                },
            ];

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

            console.log('Fetch response received');
            const result = await response.json();
            console.log('Fetch result:', result);

            if (!response.ok || !result.success) {
                console.error('Failed to save note or update client:', result.message);
                alert('Failed to save note or update client.');
                return;
            }

            console.log('Note and client status updated successfully:', result);

            const currentPage = window.location.pathname.split('/').pop();
            const editPageMapping = {
                'profileview.html': 'profileedit.html',
                'householdview.html': 'householdedit.html',
                'relationshipsview.html': 'relationshipsedit.html',
                'currentenrollmentsview.html': 'currentenrollmentsedit.html',
                'incomeview.html': 'incomeedit.html',
                'assetsview.html': 'assetsedit.html',
                'expensesview.html': 'expensesedit.html',
                'estimationsview.html': 'estimationsstep.html'
            };
            const editPage = editPageMapping[currentPage] || 'profileedit.html';
            const redirectUrl = `${editPage}?id=${clientId}`;
            console.log('Redirecting to:', redirectUrl);
            window.location.href = redirectUrl;
        } catch (error) {
            console.error('Error saving note or updating client status:', error);
        }
    };

    async function saveNote(noteText = null) {
        console.log('Save button clicked');
        const clientId = getClientId();

        const text = typeof noteText === 'string' ? noteText : noteInput.value.trim();
        console.log('Client ID:', clientId);
        console.log('Note Text:', text);

        if (!text) {
            console.log('Note text is empty, aborting save');
            return;
        }

        if (!activeUser) {
            console.error('No active user found in sessionStorage');
            return;
        }

        const timestamp = new Date().toLocaleString();
        const note = {
            id: crypto.randomUUID(),
            text: text,
            timestamp: timestamp,
            username: activeUser,
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

    saveNoteButton.addEventListener('click', saveNote);

    window.deleteNote = async function (clientId, index) {
        try {
            const notes = await fetchClientNotes(clientId);
            if (!notes[index]) {
                console.error('Note not found at index:', index);
                return;
            }

            const confirmDelete = confirm('Are you sure you want to delete this note? This action cannot be undone.');
            if (confirmDelete) {
                notes.splice(index, 1);
                console.log('Updated notes after deletion:', notes);

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

                console.log('Delete result:', result);
                renderNotes(clientId);
            }
        } catch (error) {
            console.error('Error deleting note:', error);
        }
    };

    function populateActiveUser() {
        activeUser = sessionStorage.getItem('loggedInUser');
        if (activeUser) {
            console.log('Active User:', activeUser);
        } else {
            console.error('No active user found in sessionStorage');
        }
    }

    // Initial setup
    const clientId = getClientId();
    populateActiveUser();
    renderNotes(clientId);
});