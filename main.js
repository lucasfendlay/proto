const express = require('express');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
app.use(express.json()); // Parse JSON request bodies

require('dotenv').config(); // Load environment variables from a .env file

const uri = process.env.MONGODB_URI; // Use environment variable for MongoDB URI
const dbName = process.env.DB_NAME; // Use environment variable for database name
let db;

// Connect to MongoDB
async function connectToMongoDB() {
    const client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
    console.log('Connected to MongoDB');
}
connectToMongoDB();

// Serve static files from the "src/renderer" directory
app.use(express.static(path.join(__dirname, 'renderer')));
// Redirect to splash.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'renderer', 'splash.html'));
});

app.use((req, res, next) => {
    const originalSend = res.send;

    res.send = function (body) {
        if (typeof body === 'string' && body.includes('<head>')) {
            // Inject the meta tag into the <head> section
            body = body.replace(
                '<head>',
                `<head><meta name="viewport" content="width=device-width, initial-scale=1.0">`
            );
        }
        originalSend.call(this, body);
    };

    next();
});

// Start the server
const PORT = process.env.PORT || 3000; // Use the PORT environment variable or default to 3000
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Handle port conflicts gracefully
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please use a different port.`);
        process.exit(1);
    } else {
        console.error('Server error:', err);
    }
});

// Initialize WebSocket server
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server }); // Attach WebSocket to the same HTTP server

const userConnections = {}; // Store user connections as arrays

wss.on('connection', (ws, req) => {
    const params = new URLSearchParams(req.url.replace(/^.*\?/, ''));
    const username = params.get('username');

    if (username) {
        if (!userConnections[username]) {
            userConnections[username] = [];
        }
        userConnections[username].push(ws);
        console.log(`WebSocket connection established for user: ${username}`);
    } else {
        console.log('WebSocket connection attempted without a username.');
    }

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'ping') {
                console.log(`Received heartbeat from user: ${username}`);
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    });

    ws.on('close', () => {
        if (username) {
            userConnections[username] = userConnections[username].filter(conn => conn !== ws);
            if (userConnections[username].length === 0) {
                delete userConnections[username];
            }
            console.log(`WebSocket connection closed for user: ${username}`);
        }
    });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    console.log('Login attempt with:', { username, password });

    try {
        // Ensure username is treated as a string
        const user = await db.collection('accounts').findOne({ username: String(username) });

        if (!user) {
            console.log('User not found:', username);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Compare the provided password with the stored hashed password
        const isPasswordValid = await bcrypt.compare(password, user.password);

        console.log('Password match:', isPasswordValid);

        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: 'Invalid password' });
        }

        // If login is successful
        res.json({ success: true, message: 'Login successful', username: user.username });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ success: false, message: 'An error occurred during login' });
    }
});

// Account creation
app.post('/create-account', async (req, res) => {
    const { username, password, role } = req.body;

    console.log('Received data:', req.body); // Add this line

    try {
        const collection = db.collection('accounts');
        const existingAccount = await collection.findOne({ username });

        if (existingAccount) {
            return res.status(400).json({ success: false, message: 'Username already exists!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await collection.insertOne({ username, role, password: hashedPassword });

        res.json({ success: true });
    } catch (error) {
        console.error('Error during account creation:', error);
        res.status(500).json({ success: false, message: 'An error occurred. Please try again later.' });
    }
});

// Endpoint to fetch all users
app.get('/get-users', async (req, res) => {
    try {
        const users = await db.collection('accounts').find({}, { projection: { username: 1, _id: 0 } }).toArray();
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch users.' });
    }
});

// Endpoint to fetch the user's role based on the username
app.get('/get-user-role', async (req, res) => {
    const { username } = req.query;

    if (!username) {
        return res.status(400).json({ success: false, message: 'Username is required.' });
    }

    try {
        // Fetch the user from the database
        const user = await db.collection('accounts').findOne({ username });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // Return the user's role
        res.json({ success: true, role: user.role });
    } catch (error) {
        console.error('Error fetching user role:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch user role.' });
    }
});

// Add a new client
app.post('/add-client', async (req, res) => {
    const client = req.body;

    try {
        const collection = db.collection('clients');
        await collection.insertOne(client);

        res.json({ success: true });
    } catch (error) {
        console.error('Error adding client:', error);
        res.status(500).json({ success: false, message: 'Failed to add client.' });
    }
});

app.post('/add-client-batch', async (req, res) => {
    const { clients } = req.body;

    if (!Array.isArray(clients) || clients.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid or empty client data.' });
    }

    try {
        const collection = db.collection('clients');
        const result = await collection.insertMany(clients);

        res.json({ success: true, insertedCount: result.insertedCount });
    } catch (error) {
        console.error('Error adding client batch:', error);
        res.status(500).json({ success: false, message: 'Failed to add client batch.' });
    }
});

const cron = require('node-cron');

// Schedule the task to run every Sunday at midnight
cron.schedule('0 0 * * 0', async () => {
    console.log('Running weekly cleanup for invalid documents...');
    try {
        const collection = db.collection('clients');
        const result = await collection.deleteMany({
            $or: [
                { firstName: { $exists: false } },
                { lastName: { $exists: false } },
                { firstName: null },
                { lastName: null },
                { firstName: '' },
                { lastName: '' },
                { firstName: 'id', lastName: 'firstName', phoneNumber: 'lastName' } // Additional invalid criteria
            ],
        });

        console.log(`Weekly cleanup completed. Deleted ${result.deletedCount} invalid documents.`);
    } catch (error) {
        console.error('Error during weekly cleanup:', error);
    }
});

// Clear all clients
app.delete('/clear-clients', async (req, res) => {
    try {
        const collection = db.collection('clients');
        await collection.deleteMany({});

        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing clients:', error);
        res.status(500).json({ success: false, message: 'Failed to clear clients.' });
    }
});

// Log a new call
app.post('/log-call', async (req, res) => {
    const { clientId, callLog } = req.body;

    try {
        const collection = db.collection('clients');
        const result = await collection.updateOne(
            { id: clientId },
            { $push: { callLogs: callLog } }
        );

        if (result.modifiedCount > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Client not found or call log not added.' });
        }
    } catch (error) {
        console.error('Error logging call:', error);
        res.status(500).json({ success: false, message: 'Failed to log call.' });
    }
});

// Fetch a client by ID
app.get('/get-client/:clientId', async (req, res) => {
    const { clientId } = req.params;

    try {
        const collection = db.collection('clients');
        const client = await collection.findOne({ id: clientId });

        if (client) {
            res.json(client);
        } else {
            res.status(404).json({ success: false, message: 'Client not found.' });
        }
    } catch (error) {
        console.error('Error fetching client:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch client.' });
    }
});

app.put('/update-client', async (req, res) => {
    console.log('Request body received at /update-client:', req.body);

    const { clientId, clientData } = req.body;

    if (!clientId || !clientData) {
        return res.status(400).json({ success: false, message: 'Missing clientId or clientData in the request body.' });
    }

    try {
        const collection = db.collection('clients');
        console.log('Filter:', { id: clientId });
        console.log('Update data:', clientData);

        const result = await collection.updateOne(
            { id: clientId },
            { $set: clientData }
        );

        console.log('Update result:', result);

        if (result.matchedCount > 0) {
            res.json({ success: true, message: 'Client updated successfully (or no changes were necessary).' });
        } else {
            res.status(404).json({ success: false, message: `No client found with ID ${clientId}.` });
        }
    } catch (error) {
        console.error('Error updating client:', error);
        res.status(500).json({ success: false, message: 'Failed to update client.' });
    }
});

// Delete a client
app.delete('/delete-client/:clientId', async (req, res) => {
    const { clientId } = req.params;

    try {
        const collection = db.collection('clients');
        const result = await collection.deleteOne({ id: clientId });

        if (result.deletedCount > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Client not found.' });
        }
    } catch (error) {
        console.error('Error deleting client:', error);
        res.status(500).json({ success: false, message: 'Failed to delete client.' });
    }
});

app.post('/add-to-contacts', async (req, res) => {
    const { clientId, contact, index, delete: isDelete } = req.body;

    if (!clientId || (!contact && !isDelete)) {
        return res.status(400).json({ success: false, message: 'Missing required fields: clientId or contact details.' });
    }

    try {
        const collection = db.collection('clients');

        if (isDelete) {
            // Delete a contact at the specified index
            const contactKey = `Contacts.${index}`;
            const updateQuery = { $unset: { [contactKey]: '' } };

            const result = await collection.updateOne({ id: clientId }, updateQuery);

            // Remove empty entries from the Contacts array
            if (result.modifiedCount > 0) {
                await collection.updateOne({ id: clientId }, { $pull: { Contacts: null } });
            }

            return res.json({ success: true, message: 'Contact deleted successfully.' });
        }

        const client = await collection.findOne({ id: clientId });

        if (!client) {
            return res.status(404).json({ success: false, message: 'Client not found.' });
        }

        if (index !== undefined && index !== null) {
            // Update an existing contact
            const existingContact = client.Contacts[index];

            // Check if the new contact data is identical to the existing data
            if (JSON.stringify(existingContact) === JSON.stringify(contact)) {
                return res.json({ success: true, message: 'No changes detected. Contact not updated.' });
            }

            const contactKey = `Contacts.${index}`;
            const updateQuery = { $set: { [contactKey]: contact } };

            const result = await collection.updateOne({ id: clientId }, updateQuery);

            if (result.modifiedCount > 0) {
                return res.json({ success: true, message: 'Contact updated successfully.' });
            } else {
                return res.status(500).json({ success: false, message: 'Failed to update contact.' });
            }
        } else {
            // Add a new contact
            const updateQuery = { $push: { Contacts: contact } };

            const result = await collection.updateOne({ id: clientId }, updateQuery);

            if (result.modifiedCount > 0) {
                return res.json({ success: true, message: 'Contact added successfully.' });
            } else {
                return res.status(500).json({ success: false, message: 'Failed to add contact.' });
            }
        }
    } catch (error) {
        console.error('Error updating contact for client:', error);
        res.status(500).json({ success: false, message: 'Failed to update contact for client.' });
    }
});

// Add a note to a client
app.post('/add-note-to-client', async (req, res) => {
    const { clientId, note } = req.body;

    try {
        const collection = db.collection('clients');
        const result = await collection.updateOne(
            { id: clientId },
            { $push: { notes: note } }
        );

        if (result.modifiedCount > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Client not found or note not added.' });
        }
    } catch (error) {
        console.error('Error adding note:', error);
        res.status(500).json({ success: false, message: 'Failed to add note.' });
    }
});

app.get('/get-all-clients', async (req, res) => {
    try {
        const collection = db.collection('clients');
        const clients = await collection.find({}).toArray();

        // Wrap the clients array in an object
        res.json({ clients });
    } catch (error) {
        console.error('Error fetching clients:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch clients.' });
    }
});

// Fetch notes for a client
app.get('/get-client-notes/:clientId', async (req, res) => {
    const { clientId } = req.params;

    try {
        const collection = db.collection('clients');
        const client = await collection.findOne({ id: clientId });

        if (client) {
            res.json(client.notes || []);
        } else {
            res.status(404).json({ success: false, message: 'Client not found.' });
        }
    } catch (error) {
        console.error('Error fetching client notes:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch client notes.' });
    }
});

app.put('/update-client-notes', async (req, res) => {
    const { clientId, notes } = req.body;

    try {
        const collection = db.collection('clients');
        const result = await collection.updateOne(
            { id: clientId },
            { $set: { notes } }
        );

        if (result.modifiedCount > 0) {
            res.json({ success: true });
        } else {
            res.status(400).json({ success: false, message: 'Failed to update notes.' });
        }
    } catch (error) {
        console.error('Error updating client notes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add a note
app.post('/add-note', async (req, res) => {
    const { clientId, note } = req.body;

    try {
        const collection = db.collection('clients');
        const client = await collection.findOne({ id: clientId });

        if (!client.notes) {
            client.notes = [];
        }
        client.notes.push(note);

        const result = await collection.updateOne(
            { id: clientId },
            { $set: { notes: client.notes } }
        );

        res.json({ success: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error adding note:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete a household member
app.delete('/delete-household-member', async (req, res) => {
    const { clientId, memberId } = req.body;

    try {
        const collection = db.collection('clients');
        const client = await collection.findOne({ id: clientId });

        if (!client) {
            return res.status(404).json({ success: false, error: 'Client not found' });
        }

        const updatedMembers = client.householdMembers.filter(
            (member) => member.householdMemberId !== memberId
        );

        const result = await collection.updateOne(
            { id: clientId },
            { $set: { householdMembers: updatedMembers } }
        );

        res.json({ success: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error deleting household member:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Fetch household members for a specific client
app.get('/get-household-members', async (req, res) => {
    const { clientId } = req.query; // Get the clientId from the query parameters

    if (!clientId) {
        return res.status(400).json({ success: false, message: 'Client ID is required.' });
    }

    try {
        const collection = db.collection('clients');
        const client = await collection.findOne({ id: clientId });

        if (!client) {
            return res.status(404).json({ success: false, message: 'Client not found.' });
        }

        // Return the household members
        res.json(client.householdMembers || []);
    } catch (error) {
        console.error('Error fetching household members:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch household members.' });
    }
});

// Save a household member
app.post('/save-household-member', async (req, res) => {
    const { clientId, member } = req.body;

    try {
        if (!member.householdMemberId) {
            throw new Error('householdMemberId is required for household members.');
        }

        const collection = db.collection('clients');
        const client = await collection.findOne({ id: clientId });

        if (!client) {
            return res.status(404).json({ success: false, message: 'Client not found.' });
        }

        const householdMembers = client.householdMembers || [];
        const existingMemberIndex = householdMembers.findIndex(
            (m) => m.householdMemberId === member.householdMemberId
        );

        if (existingMemberIndex !== -1) {
            householdMembers[existingMemberIndex] = {
                ...householdMembers[existingMemberIndex],
                ...member,
            };
        } else {
            householdMembers.push(member);
        }

        const result = await collection.updateOne(
            { id: clientId },
            { $set: { householdMembers } }
        );

        res.json({ success: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error saving household member:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update a household member
app.put('/update-household-member', async (req, res) => {
    const { clientId, member } = req.body;

    try {
        const collection = db.collection('clients');
        const client = await collection.findOne({ id: clientId });

        if (!client) {
            return res.status(404).json({ success: false, error: 'Client not found' });
        }

        const memberIndex = client.householdMembers.findIndex(
            (m) => m.householdMemberId === member.householdMemberId
        );

        if (memberIndex === -1) {
            return res.status(404).json({ success: false, error: 'Household member not found' });
        }

        client.householdMembers[memberIndex] = {
            ...client.householdMembers[memberIndex],
            ...member,
        };

        const result = await collection.updateOne(
            { id: clientId },
            { $set: { householdMembers: client.householdMembers } }
        );

        res.json({ success: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error updating household member:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update relationship
app.put('/update-relationship', async (req, res) => {
    const { clientId, memberId, relatedMemberId, relationship } = req.body;

    try {
        const client = await db.collection('clients').findOne({ id: clientId });

        if (!client) {
            return res.status(404).json({ success: false, message: 'Client not found' });
        }

        const member = client.householdMembers.find(m => m.householdMemberId === memberId);
        if (!member) {
            return res.status(404).json({ success: false, message: 'Household member not found' });
        }

        member.relationships = member.relationships || [];
        const existingRelationshipIndex = member.relationships.findIndex(r => r.relatedMemberId === relatedMemberId);

        if (existingRelationshipIndex !== -1) {
            member.relationships[existingRelationshipIndex].relationship = relationship;
        } else {
            member.relationships.push({ relatedMemberId, relationship });
        }

        const result = await db.collection('clients').updateOne(
            { id: clientId, 'householdMembers.householdMemberId': memberId },
            { $set: { 'householdMembers.$.relationships': member.relationships } }
        );

        if (result.modifiedCount > 0) {
            res.json({ success: true });
        } else {
            res.status(500).json({ success: false, message: 'Failed to update the relationship in the database.' });
        }
    } catch (error) {
        console.error('Error updating relationship:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get member relationships
app.get('/get-member-relationships/:clientId/:memberId', async (req, res) => {
    const { clientId, memberId } = req.params;

    try {
        const client = await db.collection('clients').findOne({ id: clientId });

        if (!client) {
            return res.status(404).json({ success: false, message: 'Client not found' });
        }

        const member = client.householdMembers.find(m => m.householdMemberId === memberId);

        if (!member) {
            return res.status(404).json({ success: false, message: 'Household member not found' });
        }

        res.json(member.relationships || []);
    } catch (error) {
        console.error('Error fetching member relationships:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update household members
app.put('/update-household-members', async (req, res) => {
    const { clientId, members } = req.body;

    try {
        const result = await db.collection('clients').updateOne(
            { id: clientId },
            { $set: { householdMembers: members } }
        );

        if (result.modifiedCount > 0) {
            res.json({ success: true });
        } else if (result.matchedCount === 0) {
            res.status(404).json({ success: false, message: 'Client not found' });
        } else {
            res.status(400).json({ success: false, message: 'No changes were made to the household members.' });
        }
    } catch (error) {
        console.error('Error updating household members:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Save household member selection
app.post('/save-household-member-selection', async (req, res) => {
    const { clientId, memberId, question, value } = req.body;

    try {
        const client = await db.collection('clients').findOne({ id: clientId });

        if (!client) {
            return res.status(404).json({ success: false, message: 'Client not found' });
        }

        const member = client.householdMembers.find(m => m.householdMemberId === memberId);

        if (!member) {
            return res.status(404).json({ success: false, message: 'Household member not found' });
        }

        member.selections = member.selections || {};
        member.selections[question] = value;

        await db.collection('clients').updateOne(
            { id: clientId, 'householdMembers.householdMemberId': memberId },
            { $set: { 'householdMembers.$.selections': member.selections } }
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error saving household member selection:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get household member selections
app.get('/get-household-member-selections/:clientId/:memberId', async (req, res) => {
    const { clientId, memberId } = req.params;

    try {
        const client = await db.collection('clients').findOne({ id: clientId });

        if (!client) {
            return res.status(404).json({ success: false, message: 'Client not found' });
        }

        const member = client.householdMembers.find(m => m.householdMemberId === memberId);

        if (!member) {
            return res.status(404).json({ success: false, message: 'Household member not found' });
        }

        res.json(member.selections || {});
    } catch (error) {
        console.error('Error fetching household member selections:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update member income
app.post('/update-member-income', async (req, res) => {
    const { clientId, memberId, income } = req.body;

    try {
        const collection = db.collection('clients');
        const result = await collection.updateOne(
            { id: clientId, 'householdMembers.householdMemberId': memberId },
            { $push: { 'householdMembers.$.income': income } }
        );

        res.json({ success: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error updating member income:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Fetch income by ID
app.get('/get-income/:memberId/:incomeId', async (req, res) => {
    const { memberId, incomeId } = req.params;

    try {
        const collection = db.collection('clients');
        const client = await collection.findOne({ 'householdMembers.householdMemberId': memberId });
        const income = client?.householdMembers
            ?.find(member => member.householdMemberId === memberId)
            ?.income?.find(income => income.id === incomeId);

        res.json(income || null);
    } catch (error) {
        console.error('Error fetching income:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/delete-income', async (req, res) => {
    const { clientId, memberId, incomeId } = req.query;

    console.log('Delete income request received:', { clientId, memberId, incomeId });

    if (!clientId || !memberId || memberId === "null" || !incomeId) {
        return res.status(400).json({ success: false, message: 'Missing or invalid parameters.' });
    }

    try {
        const collection = db.collection('clients');
        console.log('Executing MongoDB query with filter:', {
            id: clientId,
            'householdMembers.householdMemberId': memberId
        });
        console.log('Pulling income with ID:', incomeId);

        const result = await collection.updateOne(
            { id: clientId, 'householdMembers.householdMemberId': memberId },
            { $pull: { 'householdMembers.$.income': { id: incomeId } } }
        );

        console.log('MongoDB update result:', result);

        if (result.modifiedCount > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Income not found or no changes made.' });
        }
    } catch (error) {
        console.error('Error deleting income:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update income
app.put('/update-income', async (req, res) => {
    const { memberId, incomeId, updatedIncome } = req.body;

    try {
        const collection = db.collection('clients');
        const result = await collection.updateOne(
            { 'householdMembers.householdMemberId': memberId, 'householdMembers.income.id': incomeId },
            { $set: { 'householdMembers.$.income.$[income]': updatedIncome } },
            { arrayFilters: [{ 'income.id': incomeId }] }
        );

        res.json({ success: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error updating income:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Add an asset
app.post('/add-asset', async (req, res) => {
    const { clientId, memberId, asset } = req.body;

    try {
        const collection = db.collection('clients');
        const result = await collection.updateOne(
            { id: clientId, 'householdMembers.householdMemberId': memberId },
            { $push: { 'householdMembers.$.assets': asset } }
        );

        res.json({ success: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error adding asset:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Fetch an asset
app.get('/get-asset/:memberId/:assetId', async (req, res) => {
    const { memberId, assetId } = req.params;

    try {
        const collection = db.collection('clients');
        const client = await collection.findOne({ 'householdMembers.householdMemberId': memberId });
        const asset = client?.householdMembers
            ?.find(member => member.householdMemberId === memberId)
            ?.assets?.find(asset => asset.id === assetId);

        res.json(asset || null);
    } catch (error) {
        console.error('Error fetching asset:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update an asset
app.put('/update-asset', async (req, res) => {
    const { memberId, assetId, updatedAsset } = req.body;

    try {
        const collection = db.collection('clients');
        const result = await collection.updateOne(
            { 'householdMembers.householdMemberId': memberId, 'householdMembers.assets.id': assetId },
            { $set: { 'householdMembers.$.assets.$[asset]': updatedAsset } },
            { arrayFilters: [{ 'asset.id': assetId }] }
        );

        res.json({ success: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error updating asset:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete an asset
app.delete('/delete-asset', async (req, res) => {
    const { memberId, assetId } = req.body;

    try {
        const collection = db.collection('clients');
        const result = await collection.updateOne(
            { 'householdMembers.householdMemberId': memberId },
            { $pull: { 'householdMembers.$.assets': { id: assetId } } }
        );

        res.json({ success: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error deleting asset:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Save an expense
app.post('/save-expense', async (req, res) => {
    const { clientId, memberId, expense } = req.body;

    try {
        if (!clientId || !memberId || !expense) {
            return res.status(400).json({ success: false, message: 'Missing required parameters: clientId, memberId, or expense.' });
        }

        if (!expense.id) {
            expense.id = `expense-${Date.now()}`; // Generate a unique ID if not provided
        }

        const collection = db.collection('clients');
        const result = await collection.updateOne(
            { id: clientId, 'householdMembers.householdMemberId': memberId },
            { $push: { 'householdMembers.$.expenses': expense } }
        );

        if (result.modifiedCount > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Failed to save expense. No matching client or member found.' });
        }
    } catch (error) {
        console.error('Error saving expense:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get expenses for a specific household member and type
app.get('/get-expense', async (req, res) => {
    const { householdMemberId, expenseId, type } = req.query;

    try {
        const collection = db.collection('clients');
        const client = await collection.findOne(
            { 'householdMembers.householdMemberId': householdMemberId },
            { projection: { 'householdMembers.$': 1 } }
        );

        const member = client?.householdMembers?.[0];
        if (!member || !member.expenses) return res.json([]);

        if (expenseId) {
            return res.json(member.expenses.find(expense => expense.id === expenseId) || null);
        }

        res.json(type ? member.expenses.filter(expense => expense.type === type) : member.expenses);
    } catch (error) {
        console.error(`Error fetching expenses for member ${householdMemberId}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update an expense
app.put('/update-expense', async (req, res) => {
    const { householdMemberId, expense } = req.body;

    if (!householdMemberId || !expense || !expense.id) {
        return res.status(400).json({ success: false, message: 'Missing required parameters: householdMemberId or expense.' });
    }

    try {
        const collection = db.collection('clients');
        const result = await collection.updateOne(
            {
                'householdMembers.householdMemberId': householdMemberId,
                'householdMembers.expenses.id': expense.id
            },
            {
                $set: {
                    'householdMembers.$[member].expenses.$[expense]': expense
                }
            },
            {
                arrayFilters: [
                    { 'member.householdMemberId': householdMemberId },
                    { 'expense.id': expense.id }
                ]
            }
        );

        if (result.modifiedCount > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Expense not found or no changes made.' });
        }
    } catch (error) {
        console.error('Error updating expense:', error);
        res.status(500).json({ success: false, message: 'Failed to update expense.' });
    }
});

// Delete an expense
app.delete('/delete-expense', async (req, res) => {
    const { expenseId } = req.body;

    try {
        const collection = db.collection('clients');
        const result = await collection.updateOne(
            { 'householdMembers.expenses.id': expenseId },
            { $pull: { 'householdMembers.$[].expenses': { id: expenseId } } }
        );

        if (result.modifiedCount > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Failed to delete expense. No matching expense found.' });
        }
    } catch (error) {
        console.error('Error deleting expense:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Add a Utility Expense
app.post('/add-utility-expense', async (req, res) => {
    const { clientId, memberId, utilityExpense } = req.body;

    try {
        utilityExpense.type = 'Utility'; // Ensure the type is set to "Utility"
        const collection = db.collection('clients');
        const result = await collection.updateOne(
            { id: clientId, 'householdMembers.householdMemberId': memberId },
            { $push: { 'householdMembers.$.expenses': utilityExpense } }
        );

        res.json({ success: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error adding utility expense:', error);
        res.status(500).json({ success: false, message: 'Failed to add utility expense.' });
    }
});

// Fetch Utility Expenses
app.get('/get-utility-expenses/:clientId/:memberId', async (req, res) => {
    const { clientId, memberId } = req.params;

    try {
        const collection = db.collection('clients');
        const client = await collection.findOne(
            { id: clientId, 'householdMembers.householdMemberId': memberId },
            { projection: { 'householdMembers.$': 1 } }
        );

        const member = client?.householdMembers?.[0];
        if (!member || !member.expenses) return res.json([]);

        const utilityExpenses = member.expenses.filter(expense => expense.type === 'Utility');
        res.json(utilityExpenses);
    } catch (error) {
        console.error('Error fetching utility expenses:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch utility expenses.' });
    }
});

// Update a Utility Expense
app.put('/update-utility-expense', async (req, res) => {
    const { clientId, memberId, expenseId, updatedUtilityExpense } = req.body;

    try {
        updatedUtilityExpense.type = 'Utility'; // Ensure the type remains "Utility"
        const collection = db.collection('clients');
        const result = await collection.updateOne(
            { id: clientId, 'householdMembers.householdMemberId': memberId, 'householdMembers.expenses.id': expenseId },
            { $set: { 'householdMembers.$.expenses.$[expense]': updatedUtilityExpense } },
            { arrayFilters: [{ 'expense.id': expenseId }] }
        );

        res.json({ success: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error updating utility expense:', error);
        res.status(500).json({ success: false, message: 'Failed to update utility expense.' });
    }
});

// Delete all Utility Expenses
app.delete('/delete-utility-expenses', async (req, res) => {
    const { clientId, memberId } = req.body;

    try {
        const collection = db.collection('clients');
        const result = await collection.updateOne(
            { id: clientId, 'householdMembers.householdMemberId': memberId },
            { $pull: { 'householdMembers.$.expenses': { type: 'Utility' } } }
        );

        res.json({ success: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error deleting utility expenses:', error);
        res.status(500).json({ success: false, message: 'Failed to delete utility expenses.' });
    }
});

app.post('/save-household-members', async (req, res) => {
    const { clientId, householdMembers } = req.body;

    try {
        const existingClient = await getClientFromDatabase(clientId); // Fetch existing client data
        if (!existingClient) {
            return res.status(404).send('Client not found');
        }

        // Merge existing household members with incoming data
        const updatedHouseholdMembers = householdMembers.map(member => {
            const existingMember = existingClient.householdMembers.find(m => m.householdMemberId === member.householdMemberId);

            return {
                ...existingMember,
                ...member,
                SNAP: {
                    ...existingMember?.SNAP,
                    ...member.SNAP,
                    application: member.SNAP?.application || existingMember?.SNAP?.application || [],
                },
                LIHEAP: {
                    ...existingMember?.LIHEAP,
                    ...member.LIHEAP,
                    application: member.LIHEAP?.application || existingMember?.LIHEAP?.application || [],
                },
                PACE: {
                    ...existingMember?.PACE,
                    ...member.PACE,
                },
                LIS: {
                    ...existingMember?.LIS,
                    ...member.LIS,
                },
                MSP: {
                    ...existingMember?.MSP,
                    ...member.MSP,
                },
                PTRR: {
                    ...existingMember?.PTRR,
                    ...member.PTRR,
                },
            };
        });

        // Save updated data to the database
        await saveClientToDatabase(clientId, { ...existingClient, householdMembers: updatedHouseholdMembers });
        res.status(200).send('Household members updated successfully.');
    } catch (error) {
        console.error('Error saving household members:', error);
        res.status(500).send('Internal server error');
    }
});

async function getClientFromDatabase(clientId) {
    try {
        return await db.collection('clients').findOne({ id: clientId });
    } catch (error) {
        console.error('Error fetching client from database:', error);
        throw error;
    }
}

async function saveClientToDatabase(clientId, updatedData) {
    try {
        return await db.collection('clients').updateOne({ id: clientId }, { $set: updatedData });
    } catch (error) {
        console.error('Error saving client to database:', error);
        throw error;
    }
}

// Add a Referral
app.post('/add-referral', async (req, res) => {
    try {
        const referral = req.body;

        // Validate required fields
        if (!referral.name || !referral.phone) {
            return res.status(400).json({ success: false, message: 'Name and phone are required.' });
        }

        // Generate a unique referral ID
        referral.referralId = `referral-${Date.now()}`;

        // Log the incoming data
        console.log('Adding referral:', referral);

        // Insert the referral into the database
        const collection = db.collection('referrals');
        await collection.insertOne(referral);

        res.json({ success: true, referralId: referral.referralId });
    } catch (error) {
        console.error('Error adding referral:', error);
        res.status(500).json({ success: false, message: 'Failed to add referral.' });
    }
});

// Update a Referral
app.put('/update-referral', async (req, res) => {
    const { referralId, updatedReferral } = req.body;

    try {
        const collection = db.collection('referrals');
        const result = await collection.updateOne(
            { referralId },
            { $set: updatedReferral }
        );

        if (result.modifiedCount > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: `No referral found with ID ${referralId}.` });
        }
    } catch (error) {
        console.error('Error updating referral:', error);
        res.status(500).json({ success: false, message: 'Failed to update referral.' });
    }
});

// Delete a Referral
app.delete('/delete-referral', async (req, res) => {
    const { referralId } = req.body;

    try {
        const collection = db.collection('referrals');
        const result = await collection.deleteOne({ referralId });

        res.json({ success: result.deletedCount > 0 });
    } catch (error) {
        console.error('Error deleting referral:', error);
        res.status(500).json({ success: false, message: 'Failed to delete referral.' });
    }
});

// Fetch All Referrals
app.get('/get-all-referrals', async (req, res) => {
    try {
        const collection = db.collection('referrals');
        const referrals = await collection.find({}).toArray();

        res.json(referrals);
    } catch (error) {
        console.error('Error fetching referrals:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch referrals.' });
    }
});

// Fetch a Specific Referral
app.get('/get-referral/:referralId', async (req, res) => {
    const { referralId } = req.params;

    try {
        const collection = db.collection('referrals');
        const referral = await collection.findOne({ referralId });

        if (referral) {
            res.json(referral);
        } else {
            res.status(404).json({ success: false, message: `No referral found with ID ${referralId}.` });
        }
    } catch (error) {
        console.error('Error fetching referral:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch referral.' });
    }
});

const multer = require('multer');
const nodemailer = require('nodemailer');

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Email sending endpoint
app.post('/send-email', upload.single('file'), async (req, res) => {
    const { file } = req;
    const { recipientEmail, subject, body } = req.body;

    if (!file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    try {
        // Configure nodemailer
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        // Send the email with the file as an attachment
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: recipientEmail || 'lucascampbellsounddesign@gmail.com', // Default recipient email
            subject: subject || 'Default Subject', // Use dynamic subject or fallback to default
            text: body || 'Default email body.', // Use dynamic body or fallback to default
            attachments: [
                {
                    filename: file.originalname,
                    path: file.path,
                },
            ],
        });

        res.json({ success: true, message: 'Email sent successfully!' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ success: false, message: 'Failed to send email.' });
    }
});

app.post('/upload-to-profile', upload.single('file'), async (req, res) => {
    const { file } = req;
    const { clientId, note } = req.body;

    if (!file || !clientId) {
        return res.status(400).json({ success: false, message: 'File or client ID is missing.' });
    }

    try {
        // Save the file information and note to the client's notes array in the database
        const collection = db.collection('clients');
        const result = await collection.updateOne(
            { id: clientId }, // Find the client by clientId
            {
                $push: {
                    notes: {
                        fileName: file.originalname,
                        filePath: file.path,
                        note,
                        uploadedAt: new Date(),
                    },
                },
            },
            { upsert: false } // Ensure the client must exist (do not create a new client)
        );

        if (result.modifiedCount > 0) {
            res.json({ success: true, message: 'File uploaded and associated with the client profile.' });
        } else {
            res.status(404).json({ success: false, message: 'Client not found.' });
        }
    } catch (error) {
        console.error('Error uploading file to client profile:', error);
        res.status(500).json({ success: false, message: 'Failed to upload file to client profile.' });
    }
});

app.post('/notify-user', (req, res) => {
    const { username, redirectUrl } = req.body;

    if (userConnections[username] && userConnections[username].length > 0) {
        userConnections[username].forEach(conn => {
            conn.send(JSON.stringify({ redirectUrl }));
        });
        console.log(`Redirect message sent to all connections for user: ${username}`);
        res.json({ success: true, message: `User ${username} notified.` });
    } else {
        console.log(`User ${username} is not connected.`);
        res.status(404).json({ success: false, message: `User ${username} is not connected.` });
    }
});