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
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
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
    const { username, password } = req.body;

    try {
        const collection = db.collection('accounts');
        const existingAccount = await collection.findOne({ username });

        if (existingAccount) {
            return res.status(400).json({ success: false, message: 'Username already exists!' });
        }

        // Hash the password before storing it
        const hashedPassword = await bcrypt.hash(password, 10);
        await collection.insertOne({ username, password: hashedPassword });

        res.json({ success: true });
    } catch (error) {
        console.error('Error during account creation:', error);
        res.status(500).json({ success: false, message: 'An error occurred. Please try again later.' });
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

// Delete invalid documents (missing firstName or lastName)
app.delete('/delete-invalid-documents', async (req, res) => {
    try {
        const collection = db.collection('clients');
        const result = await collection.deleteMany({
            $or: [
                { firstName: { $exists: false } },
                { lastName: { $exists: false } },
                { firstName: null },
                { lastName: null },
                { firstName: '' },
                { lastName: '' }
            ],
        });

        res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
        console.error('Error deleting invalid documents:', error);
        res.status(500).json({ success: false, message: 'Failed to delete invalid documents.' });
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

// Update a client
app.put('/update-client', async (req, res) => {
    console.log('Request body received at /update-client:', req.body);

    const { clientId, clientData } = req.body;

    try {
        const collection = db.collection('clients');
        const result = await collection.updateOne(
            { id: clientId },
            { $set: clientData }
        );

        if (result.modifiedCount > 0) {
            res.json({ success: true });
        } else if (result.matchedCount === 0) {
            res.status(404).json({ success: false, message: `No client found with ID ${clientId}.` });
        } else {
            res.status(400).json({ success: false, message: 'No changes were made to the client data.' });
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

// Save Household Members
app.post('/save-household-members', async (req, res) => {
    const { clientId, householdMembers } = req.body;

    try {
        const collection = db.collection('clients');
        const result = await collection.updateOne(
            { id: clientId },
            { $set: { householdMembers } }
        );

        res.json({ success: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error saving household members:', error);
        res.status(500).json({ success: false, message: 'Failed to save household members.' });
    }
});

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
