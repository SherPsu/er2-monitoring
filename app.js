// PhilHealth ER2 MEMSEC Monitoring System - JavaScript
// Using Firebase Firestore for cloud database with Authentication

// ============================================================================
// FIREBASE CONFIGURATION
// ============================================================================
// Loads from environment variables for security (works with Vite, Vercel, and direct import)
const firebaseConfig = {
    apiKey: import.meta?.env?.VITE_FIREBASE_API_KEY || process.env?.VITE_FIREBASE_API_KEY || window.__ENV__?.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta?.env?.VITE_FIREBASE_AUTH_DOMAIN || process.env?.VITE_FIREBASE_AUTH_DOMAIN || window.__ENV__?.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta?.env?.VITE_FIREBASE_PROJECT_ID || process.env?.VITE_FIREBASE_PROJECT_ID || window.__ENV__?.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta?.env?.VITE_FIREBASE_STORAGE_BUCKET || process.env?.VITE_FIREBASE_STORAGE_BUCKET || window.__ENV__?.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta?.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || window.__ENV__?.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta?.env?.VITE_FIREBASE_APP_ID || process.env?.VITE_FIREBASE_APP_ID || window.__ENV__?.VITE_FIREBASE_APP_ID || ''
};

/**
 * Environment Configuration Loader
 * Loads Firebase config from environment variables during development
 * For production, use a proper build tool like Vite
 */
function getEnvConfig() {
    // Try to get from window object (set by build tool or server)
    if (window.__ENV__) {
        return window.__ENV__;
    }

    // Fallback: Try to get from meta tags (if set by server)
    const apiKey = document.querySelector('meta[name="firebase-api-key"]')?.content;
    if (apiKey) {
        return {
            apiKey: apiKey,
            authDomain: document.querySelector('meta[name="firebase-auth-domain"]')?.content,
            projectId: document.querySelector('meta[name="firebase-project-id"]')?.content,
            storageBucket: document.querySelector('meta[name="firebase-storage-bucket"]')?.content,
            messagingSenderId: document.querySelector('meta[name="firebase-messaging-sender-id"]')?.content,
            appId: document.querySelector('meta[name="firebase-app-id"]')?.content
        };
    }

    console.warn('Firebase config not found. Make sure environment variables are properly configured.');
    return null;
}

// ============================================================================
// APPLICATION STATE
// ============================================================================
let db = null;
let auth = null;
let recordsCollection = null;

/**
 * Handle Access Choice Modal
 * Routes user to selected service (PACD or ER2 Monitoring)
 */
function handleAccessChoice(choice) {
    const overlay = document.getElementById('accessChoiceOverlay');
    
    if (choice === 'pacd') {
        // Redirect to PACD System
        window.location.href = 'https://philhealth.gov.ph/pacd'; // Replace with actual PACD URL
    } else if (choice === 'er2') {
        // Hide modal and proceed with ER2 Monitoring
        if (overlay) {
            overlay.style.display = 'none';
        }
        // Initialize the application
        initApp();
    }
}
let usersCollection = null;
let currentRecords = [];
let deletedRecords = [];
let unsubscribeRecords = null;
let unsubscribeUsers = null;
let currentStatusFilter = 'All'; // 'All', 'Pending', 'Processed', 'Released'
let agingSortDirection = 'none'; // 'none', 'desc', 'asc'
let employerSortDirection = 'none'; // 'none', 'asc', 'desc'
let confirmActionCallback = null;

// Current user state
let currentUser = null;
let currentUserData = null;

// Chart instances
let statusChart = null;
let monthlyChart = null;
let officerChart = null;

// Initialize Firebase
async function initFirebase() {
    try {
        const { app, getFirestore, collection, enableIndexedDbPersistence, getAuth, onAuthStateChanged } = window.firebaseApp;

        // Check if Firebase is configured
        if (!app) {
            console.warn('Firebase not initialized. Please check your configuration.');
            showNotification('Please configure Firebase to enable cloud sync', 'info');
            return false;
        }

        // Get Firestore and Auth instances
        db = getFirestore(app);
        auth = getAuth(app);

        // Enable offline persistence
        try {
            await enableIndexedDbPersistence(db);
        } catch (err) {
            console.log('Persistence already enabled or not supported');
        }

        // Get reference to collections
        recordsCollection = collection(db, 'er2_records');
        usersCollection = collection(db, 'users');

        // Set up auth state listener
        onAuthStateChanged(auth, handleAuthStateChange);

        return true;
    } catch (error) {
        console.error('Error initializing Firebase:', error);
        showNotification('Failed to connect to Firebase. Check your configuration.', 'error');
        return false;
    }
}

// Handle authentication state changes
async function handleAuthStateChange(user) {
    currentUser = user;

    if (user) {
        // User is signed in - get user data from Firestore
        await loadUserData(user.uid);
        updateUIForLoggedInUser();
        setupRealtimeListener();
        showNotification(`Welcome, ${currentUserData?.name || user.email}!`, 'success');
    } else {
        // User is signed out
        currentUserData = null;
        updateUIForLoggedOutUser();
        if (unsubscribeRecords) {
            unsubscribeRecords();
            unsubscribeRecords = null;
        }
    }
}

// Load user data from Firestore
async function loadUserData(uid) {
    try {
        const { doc, getDoc } = window.firebaseApp;
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
            currentUserData = userDoc.data();
        } else {
            // Create default user data if not exists
            currentUserData = {
                email: currentUser.email,
                name: currentUser.email.split('@')[0],
                role: 'officer',
                createdAt: new Date().toISOString()
            };
            await saveUserData(uid, currentUserData);
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        currentUserData = { name: currentUser.email, role: 'officer' };
    }
}

// Save user data to Firestore
async function saveUserData(uid, data) {
    try {
        const { doc, setDoc } = window.firebaseApp;
        await setDoc(doc(db, 'users', uid), data);
    } catch (error) {
        console.error('Error saving user data:', error);
    }
}

// Update UI for logged in user
function updateUIForLoggedInUser() {
    const userInfo = document.getElementById('userInfo');
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const manageUsersBtn = document.getElementById('manageUsersBtn');

    // Show user info
    userInfo.style.display = 'flex';
    userName.textContent = currentUserData?.name || currentUser.email;
    userRole.textContent = currentUserData?.role || 'officer';
    userRole.className = `user-role ${currentUserData?.role || 'officer'}`;

    // Show/hide buttons
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-flex';

    // Show manage users button only for admin
    if (currentUserData?.role === 'admin') {
        manageUsersBtn.style.display = 'inline-flex';
        loadUsersList();
    } else {
        manageUsersBtn.style.display = 'none';
    }

    // Enable tab content
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('disabled');
    });

    // Auto-fill Processed By for officers
    if (currentUserData?.role === 'officer') {
        const processedByInput = document.getElementById('processedBy');
        if (processedByInput) {
            processedByInput.value = currentUserData.name || currentUser.email.split('@')[0];
        }
    }

    // Close login modal if open
    closeLoginModal();
}

// Update UI for logged out user
function updateUIForLoggedOutUser() {
    const userInfo = document.getElementById('userInfo');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const manageUsersBtn = document.getElementById('manageUsersBtn');

    // Hide user info
    userInfo.style.display = 'none';

    // Show/hide buttons
    loginBtn.style.display = 'inline-flex';
    logoutBtn.style.display = 'none';
    manageUsersBtn.style.display = 'none';

    // Clear records display
    const recordsBody = document.getElementById('recordsBody');
    recordsBody.innerHTML = `
        <tr>
            <td colspan="11" class="login-required-message">
                <h4>🔐 Login Required</h4>
                <p>Please login to view and manage ER2 records.</p>
            </td>
        </tr>
    `;

    // Disable tab content
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('disabled');
    });

    // Reset statistics
    document.getElementById('totalRecords').textContent = '0';
    document.getElementById('pendingRecords').textContent = '0';
    document.getElementById('processedRecords').textContent = '0';
    document.getElementById('releasedRecords').textContent = '0';

    // Show login modal
    setTimeout(() => openLoginModal(), 500);
}

// Set up real-time listener for records
function setupRealtimeListener() {
    const { query, orderBy, onSnapshot } = window.firebaseApp;

    if (!recordsCollection) return;

    const q = query(recordsCollection, orderBy('date_received', 'desc'));

    unsubscribeRecords = onSnapshot(q, (snapshot) => {
        const records = [];
        const deleted = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.is_deleted) {
                deleted.push({
                    id: doc.id,
                    ...data
                });
            } else {
                records.push({
                    id: doc.id,
                    ...data
                });
            }
        });

        currentRecords = records;
        deletedRecords = deleted;
        applySortAndLoad();
        updateStatisticsFromRecords(records);
        updateCharts();

        // Update deleted records modal if open
        const modal = document.getElementById('deletedRecordsModal');
        if (modal && modal.style.display === 'block') {
            loadDeletedRecords();
        }
    }, (error) => {
        console.error('Error in real-time listener:', error);
        showNotification('Real-time sync error', 'error');
    });
}

// Add new record
async function addRecord(data) {
    try {
        const { addDoc, serverTimestamp } = window.firebaseApp;

        const recordData = {
            employer_name: data.employerName,
            pen: data.pen,
            num_employees: parseInt(data.numEmployees),
            num_processed: parseInt(data.numProcessed) || 0,
            date_received: data.dateReceived,
            date_process: data.dateProcess || null,
            processed_by: data.processedBy || null,
            date_released: data.dateReleased || null,
            received_by: data.receivedBy || null,
            created_by: currentUserData?.name || (currentUser ? currentUser.email.split('@')[0] : 'Unknown'),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        await addDoc(recordsCollection, recordData);
        return true;
    } catch (error) {
        console.error('Error adding record:', error);
        showNotification('Failed to add record', 'error');
        return false;
    }
}

// Update record
async function updateRecord(id, data) {
    try {
        const { updateDoc, doc } = window.firebaseApp;

        const recordRef = doc(db, 'er2_records', id);
        const updateData = {
            employer_name: data.employerName,
            pen: data.pen,
            num_employees: parseInt(data.numEmployees),
            num_processed: parseInt(data.numProcessed) || 0,
            date_received: data.dateReceived,
            date_process: data.dateProcess || null,
            processed_by: data.processedBy || null,
            date_released: data.dateReleased || null,
            received_by: data.receivedBy || null,
            updated_at: new Date().toISOString()
        };

        await updateDoc(recordRef, updateData);
        return true;
    } catch (error) {
        console.error('Error updating record:', error);
        showNotification('Failed to update record', 'error');
        return false;
    }
}

// Soft Delete record
async function deleteRecord(id) {
    try {
        const { updateDoc, doc } = window.firebaseApp;

        const recordRef = doc(db, 'er2_records', id);
        await updateDoc(recordRef, {
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by: currentUserData?.name || currentUser.email || 'Unknown'
        });
        return true;
    } catch (error) {
        console.error('Error deleting record:', error);
        showNotification('Failed to delete record', 'error');
        return false;
    }
}

// Restore record
async function restoreRecord(id) {
    try {
        const { updateDoc, doc } = window.firebaseApp;

        const recordRef = doc(db, 'er2_records', id);
        await updateDoc(recordRef, {
            is_deleted: false,
            deleted_at: null,
            deleted_by: null
        });
        return true;
    } catch (error) {
        console.error('Error restoring record:', error);
        showNotification('Failed to restore record', 'error');
        return false;
    }
}

// Permanently Delete record
async function permanentlyDeleteRecord(id) {
    try {
        const { deleteDoc, doc } = window.firebaseApp;

        const recordRef = doc(db, 'er2_records', id);
        await deleteDoc(recordRef);
        return true;
    } catch (error) {
        console.error('Error permanently deleting record:', error);
        showNotification('Failed to permanently delete record', 'error');
        return false;
    }
}

// Get all records (for export)
async function getAllRecords() {
    try {
        const { query, orderBy, getDocs } = window.firebaseApp;

        const q = query(recordsCollection, orderBy('date_received', 'desc'));
        const snapshot = await getDocs(q);

        const records = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (!data.is_deleted) {
                records.push({
                    id: doc.id,
                    ...data
                });
            }
        });

        return records;
    } catch (error) {
        console.error('Error getting records:', error);
        return currentRecords;
    }
}

// Search records client-side (now handled by applySortAndLoad)
function searchRecords(query) {
    const lowerQuery = query.toLowerCase();
    return currentRecords.filter(record =>
        record.employer_name.toLowerCase().includes(lowerQuery) ||
        record.pen.toLowerCase().includes(lowerQuery)
    );
}

// Get aging days for a record
function getAgingDays(record) {
    const status = getStatus(record);
    if (record.date_received && status !== 'Released') {
        const receivedDate = new Date(record.date_received);
        receivedDate.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diffTime = today - receivedDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays >= 0) {
            return diffDays;
        }
    }
    return -1;
}

// Toggle sort direction for Aging column
function toggleAgingSort() {
    // Reset employer sort
    employerSortDirection = 'none';
    const empIcon = document.getElementById('sortEmployerIcon');
    if (empIcon) empIcon.textContent = '';

    const icon = document.getElementById('sortAgingIcon');
    
    if (agingSortDirection === 'none' || agingSortDirection === 'asc') {
        agingSortDirection = 'desc';
        icon.textContent = '▼';
    } else {
        agingSortDirection = 'asc';
        icon.textContent = '▲';
    }
    
    applySortAndLoad();
}

// Toggle sort direction for Employer column
function toggleEmployerSort() {
    // Reset aging sort
    agingSortDirection = 'none';
    const agingIcon = document.getElementById('sortAgingIcon');
    if (agingIcon) agingIcon.textContent = '';

    const icon = document.getElementById('sortEmployerIcon');
    
    if (employerSortDirection === 'none' || employerSortDirection === 'desc') {
        employerSortDirection = 'asc'; // A-Z first
        icon.textContent = '▲';
    } else {
        employerSortDirection = 'desc';
        icon.textContent = '▼';
    }
    
    applySortAndLoad();
}

// Apply current sort and filters, then render
function applySortAndLoad() {
    let recordsToRender = [...currentRecords];
    
    const query = document.getElementById('searchInput').value.trim().toLowerCase();
    if (query) {
        recordsToRender = recordsToRender.filter(record =>
            record.employer_name.toLowerCase().includes(query) ||
            record.pen.toLowerCase().includes(query)
        );
    }
    
    if (currentStatusFilter !== 'All') {
        recordsToRender = recordsToRender.filter(record => getStatus(record) === currentStatusFilter);
    }
    
    if (agingSortDirection !== 'none') {
        recordsToRender.sort((a, b) => {
            const agingA = getAgingDays(a);
            const agingB = getAgingDays(b);
            
            // Put items with no aging (-1) at the bottom for both sort directions
            if (agingA === -1 && agingB === -1) return 0;
            if (agingA === -1) return 1;
            if (agingB === -1) return -1;

            if (agingSortDirection === 'desc') {
                return agingB - agingA;
            } else {
                return agingA - agingB;
            }
        });
    } else if (employerSortDirection !== 'none') {
        recordsToRender.sort((a, b) => {
            const nameA = a.employer_name.toLowerCase();
            const nameB = b.employer_name.toLowerCase();
            
            if (nameA < nameB) return employerSortDirection === 'asc' ? -1 : 1;
            if (nameA > nameB) return employerSortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }
    
    loadRecords(recordsToRender);
}

// Get statistics object from current records
function getStatistics() {
    const total = currentRecords.length;
    const pending = currentRecords.filter(r => getStatus(r) === 'Pending').length;
    const ongoing = currentRecords.filter(r => getStatus(r) === 'On Going').length;
    const processed = currentRecords.filter(r => getStatus(r) === 'Processed').length;
    const released = currentRecords.filter(r => getStatus(r) === 'Released').length;
    return { total, pending, ongoing, processed, released };
}

// Calculate statistics from records
function updateStatisticsFromRecords(records) {
    const total = records.length;
    const pending = records.filter(r => getStatus(r) === 'Pending').length;
    const ongoing = records.filter(r => getStatus(r) === 'On Going').length;
    const processed = records.filter(r => getStatus(r) === 'Processed').length;
    const released = records.filter(r => getStatus(r) === 'Released').length;

    document.getElementById('totalRecords').textContent = total;
    document.getElementById('pendingRecords').textContent = pending;
    const ongoingEl = document.getElementById('ongoingRecords');
    if (ongoingEl) ongoingEl.textContent = ongoing;
    document.getElementById('processedRecords').textContent = processed;
    document.getElementById('releasedRecords').textContent = released;
}

// Get status based on dates
function getStatus(record) {
    const processed = record.num_processed || 0;
    const total = record.num_employees || 1;
    
    if (processed > 0 && processed < total) {
        return 'On Going';
    }

    if (record.date_released) return 'Released';
    if (record.date_process) return 'Processed';
    return 'Pending';
}

function getStatusClass(status) {
    switch (status) {
        case 'Pending': return 'status-pending';
        case 'On Going': return 'status-ongoing';
        case 'Processed': return 'status-processed';
        case 'Released': return 'status-released';
        default: return 'status-pending';
    }
}

// Format date for display
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Load and display records
function loadRecords(records = null) {
    const recordsBody = document.getElementById('recordsBody');
    const data = records || currentRecords;

    if (data.length === 0) {
        recordsBody.innerHTML = `
            <tr>
                <td colspan="11" class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <p>No records found. Add your first ER2 record above.</p>
                </td>
            </tr>
        `;
        return;
    }

    recordsBody.innerHTML = data.map(record => {
        const status = getStatus(record);
        const statusClass = getStatusClass(status);

        let agingDays = '-';
        let agingClass = '';

        if (record.date_received) {
            const receivedDate = new Date(record.date_received);
            // Ignore time portion for date math
            receivedDate.setHours(0, 0, 0, 0);

            if (status !== 'Released') {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const diffTime = today - receivedDate;
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                
                // Only show positive aging
                if (diffDays >= 0) {
                    agingDays = diffDays;
                    if (diffDays >= 3) {
                        agingClass = 'aging-critical';
                    }
                }
            } else if (record.date_released) {
                // If released, just show '-' since it's no longer aging
                agingDays = '-';
            }
        }

        return `
            <tr class="${agingClass}">
                <td data-label="ID" title="${record.id}">${record.id}</td>
                <td data-label="Employer's Name">${record.employer_name}</td>
                <td data-label="PEN">${record.pen}</td>
                <td data-label="Employees">${record.num_processed || 0}/${record.num_employees}</td>
                <td data-label="Aging (Days)" class="aging-cell">${agingDays}</td>
                <td data-label="Date Recv.">${formatDate(record.date_received)}</td>
                <td data-label="Date Proc.">${formatDate(record.date_process)}</td>
                <td data-label="Proc. By">${record.processed_by || '-'}</td>
                <td data-label="Date Rel.">${formatDate(record.date_released)}</td>
                <td data-label="Recv. By">${record.received_by || '-'}</td>
                <td data-label="Status"><span class="status-badge ${statusClass}">${status}</span></td>
                <td data-label="Actions">
                    <div class="action-buttons">
                        <button class="btn btn-warning" onclick="openEditModal('${record.id}')">Edit</button>
                        <button class="btn btn-danger" onclick="confirmDelete('${record.id}')">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Update statistics display
function updateStatistics() {
    updateStatisticsFromRecords(currentRecords);

    // Update charts
    updateCharts();
}

// Initialize charts
function initCharts() {
    const statusCtx = document.getElementById('statusChart');
    const monthlyCtx = document.getElementById('monthlyChart');
    const officerCtx = document.getElementById('officerChart');

    if (!statusCtx || !monthlyCtx || !officerCtx) {
        console.error('Chart canvas elements not found');
        return;
    }

    console.log('Initializing charts...');

    // Destroy existing charts if they exist
    if (statusChart) {
        statusChart.destroy();
    }
    if (monthlyChart) {
        monthlyChart.destroy();
    }
    if (officerChart) {
        officerChart.destroy();
    }

    // Status Distribution Chart (Doughnut)
    statusChart = new Chart(statusCtx, {
        type: 'doughnut',
        data: {
            labels: ['Pending', 'On Going', 'Processed', 'Released'],
            datasets: [{
                data: [0, 0, 0, 0],
                backgroundColor: [
                    '#f59e0b', // amber for pending
                    '#a855f7', // purple for ongoing
                    '#3b82f6', // blue for processed
                    '#10b981'  // green for released
                ],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    align: 'center',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        font: {
                            size: 13,
                            weight: 500
                        }
                    }
                }
            },
            layout: {
                padding: 8
            },
            cutout: '60%'
        }
    });

    // Monthly Records Chart (Bar)
    monthlyChart = new Chart(monthlyCtx, {
        type: 'bar',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'Records',
                data: [0, 0, 0, 0, 0, 0],
                backgroundColor: '#10b981',
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    },
                    grid: {
                        display: true,
                        drawBorder: false
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });

    // Officer Performance Chart (Bar)
    officerChart = new Chart(officerCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Processed Records',
                data: [],
                backgroundColor: '#3b82f6',
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y', // horizontal bar chart
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    },
                    grid: {
                        display: true,
                        drawBorder: false
                    }
                },
                y: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });

    console.log('Charts initialized successfully');
}

// Update charts with current data
function updateCharts() {
    console.log('Updating charts...');
    if (!statusChart || !monthlyChart) {
        console.log('Charts not initialized, calling initCharts...');
        initCharts();
        if (!statusChart || !monthlyChart) {
            console.error('Failed to initialize charts');
            return;
        }
    }

    // Update status chart
    const stats = getStatistics();
    console.log('Stats:', stats);
    statusChart.data.datasets[0].data = [stats.pending, stats.ongoing, stats.processed, stats.released];
    statusChart.update();

    // Update monthly chart
    const weeklyData = getWeeklyData();
    console.log('Weekly data:', weeklyData);
    monthlyChart.data.labels = weeklyData.labels;
    monthlyChart.data.datasets[0].data = weeklyData.data;
    monthlyChart.update();

    // Update officer chart
    const officerData = getOfficerData();
    console.log('Officer data:', officerData);
    officerChart.data.labels = officerData.labels;
    officerChart.data.datasets[0].data = officerData.data;
    officerChart.update();

    console.log('Charts updated successfully');
}

// Get weekly data for chart (last 8 weeks)
function getWeeklyData() {
    const weeks = {};
    const labels = [];
    const now = new Date();

    // Initialize last 8 weeks
    for (let i = 7; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - (i * 7) - now.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        const fmt = d => `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`;
        const label = `${fmt(weekStart)}–${fmt(weekEnd)}`;
        weeks[label] = { start: new Date(weekStart.setHours(0,0,0,0)), end: new Date(weekEnd.setHours(23,59,59,999)), count: 0 };
        labels.push(label);
    }

    // Count records by week
    currentRecords.forEach(record => {
        if (record.date_received) {
            const date = new Date(record.date_received);
            for (const label of labels) {
                const w = weeks[label];
                if (date >= w.start && date <= w.end) {
                    w.count++;
                    break;
                }
            }
        }
    });

    return {
        labels: labels,
        data: labels.map(label => weeks[label].count)
    };
}

// Get officer data for chart
function getOfficerData() {
    const officerCounts = {};

    currentRecords.forEach(record => {
        // Count if there is a processed_by value
        if (record.processed_by) {
            const officer = record.processed_by.trim();
            if (officer) {
                if (!officerCounts[officer]) {
                    officerCounts[officer] = 0;
                }
                officerCounts[officer]++;
            }
        }
    });

    // Convert to array and sort by count descending
    const sortedOfficers = Object.keys(officerCounts).map(officer => {
        return { name: officer, count: officerCounts[officer] };
    }).sort((a, b) => b.count - a.count);

    return {
        labels: sortedOfficers.map(item => item.name),
        data: sortedOfficers.map(item => item.count)
    };
}

// Show notification
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelectorAll('.notification');
    existing.forEach(n => n.remove());

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Form submission handler
async function handleFormSubmit(e) {
    e.preventDefault();

    const dateProcess = document.getElementById('dateProcess').value;
    const processedBy = document.getElementById('processedBy').value.trim();
    const dateReleased = document.getElementById('dateReleased').value;
    const receivedBy = document.getElementById('receivedBy').value.trim();

    // Conditional validation
    if (dateProcess && !processedBy) {
        showNotification('Please enter "Processed By" when Date Processed is filled', 'error');
        document.getElementById('processedBy').focus();
        return;
    }

    if (dateReleased && !receivedBy) {
        showNotification('Please enter "Received By" when Date Released is filled', 'error');
        document.getElementById('receivedBy').focus();
        return;
    }

    const formData = {
        employerName: document.getElementById('employerName').value.trim(),
        pen: document.getElementById('pen').value.trim(),
        numEmployees: document.getElementById('numEmployees').value,
        numProcessed: document.getElementById('numProcessed').value,
        dateReceived: document.getElementById('dateReceived').value,
        dateProcess: dateProcess,
        processedBy: processedBy,
        dateReleased: dateReleased,
        receivedBy: receivedBy
    };

    const success = await addRecord(formData);
    if (success) {
        clearForm();
        showNotification('Record added successfully!', 'success');
        switchToTab('records');
    }
}

// Clear form
function clearForm() {
    document.getElementById('er2Form').reset();

    // Auto-fill Processed By for officers after reset
    if (currentUserData?.role === 'officer') {
        const processedByInput = document.getElementById('processedBy');
        if (processedByInput) {
            processedByInput.value = currentUserData.name || currentUser.email.split('@')[0];
        }
    }
}

// Generic Confirm Modal
function showConfirmModal(title, message, confirmBtnText, confirmBtnClass, actionCallback) {
    document.getElementById('confirmModalTitle').textContent = title || 'Confirmation';
    document.getElementById('confirmModalMessage').textContent = message;
    
    const actionBtn = document.getElementById('confirmModalActionBtn');
    actionBtn.textContent = confirmBtnText || 'Confirm';
    actionBtn.className = `btn ${confirmBtnClass || 'btn-primary'}`;
    
    confirmActionCallback = actionCallback;
    document.getElementById('confirmModal').style.display = 'block';
}

function closeConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
    confirmActionCallback = null;
}

// Edit modal handlers
function openEditModal(id) {
    const record = currentRecords.find(r => r.id === id);
    if (!record) return;

    // Permission check
    if (currentUserData?.role !== 'admin') {
        const currentUserName = currentUserData?.name || (currentUser ? currentUser.email.split('@')[0] : '');
        const recordOwner = record.created_by || record.processed_by || record.received_by;
        
        if (recordOwner && recordOwner !== currentUserName) {
            showNotification('You do not have permission to edit other officers\' entries.', 'error');
            return;
        }
    }

    document.getElementById('editId').value = record.id;
    document.getElementById('editEmployerName').value = record.employer_name;
    document.getElementById('editPen').value = record.pen;
    document.getElementById('editNumEmployees').value = record.num_employees;
    document.getElementById('editNumProcessed').value = record.num_processed || 0;
    
    // Update display ratio
    const editRatioDisplay = document.getElementById('editEmployeeRatioDisplay');
    if(editRatioDisplay) {
        editRatioDisplay.textContent = `${record.num_processed || 0}/${record.num_employees}`;
    }

    document.getElementById('editDateReceived').value = record.date_received;
    document.getElementById('editDateProcess').value = record.date_process || '';
    document.getElementById('editProcessedBy').value = record.processed_by || '';
    document.getElementById('editDateReleased').value = record.date_released || '';
    document.getElementById('editReceivedBy').value = record.received_by || '';

    document.getElementById('editModal').style.display = 'block';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

async function handleEditSubmit(e) {
    e.preventDefault();

    const dateProcess = document.getElementById('editDateProcess').value;
    const processedBy = document.getElementById('editProcessedBy').value.trim();
    const dateReleased = document.getElementById('editDateReleased').value;
    const receivedBy = document.getElementById('editReceivedBy').value.trim();

    // Conditional validation
    if (dateProcess && !processedBy) {
        showNotification('Please enter "Processed By" when Date Processed is filled', 'error');
        document.getElementById('editProcessedBy').focus();
        return;
    }

    if (dateReleased && !receivedBy) {
        showNotification('Please enter "Received By" when Date Released is filled', 'error');
        document.getElementById('editReceivedBy').focus();
        return;
    }

    const id = document.getElementById('editId').value;
    const formData = {
        employerName: document.getElementById('editEmployerName').value.trim(),
        pen: document.getElementById('editPen').value.trim(),
        numEmployees: document.getElementById('editNumEmployees').value,
        numProcessed: document.getElementById('editNumProcessed').value,
        dateReceived: document.getElementById('editDateReceived').value,
        dateProcess: dateProcess,
        processedBy: processedBy,
        dateReleased: dateReleased,
        receivedBy: receivedBy
    };

    const success = await updateRecord(id, formData);
    if (success) {
        closeEditModal();
        showNotification('Record updated successfully!', 'success');
    }
}

// Delete confirmation
async function confirmDelete(id) {
    const record = currentRecords.find(r => r.id === id);
    if (!record) return;

    // Permission check
    if (currentUserData?.role !== 'admin') {
        const currentUserName = currentUserData?.name || (currentUser ? currentUser.email.split('@')[0] : '');
        const recordOwner = record.created_by || record.processed_by || record.received_by;
        
        if (recordOwner && recordOwner !== currentUserName) {
            showNotification('You do not have permission to delete other officers\' entries.', 'error');
            return;
        }
    }

    showConfirmModal('Delete Record', 'Are you sure you want to delete this record?', 'Delete', 'btn-danger', async () => {
        const success = await deleteRecord(id);
        if (success) {
            showNotification('Record deleted successfully!', 'success');
        }
    });
}

// Search handlers
function handleSearch() {
    applySortAndLoad();
}

function handleReset() {
    document.getElementById('searchInput').value = '';
    applySortAndLoad();
}

// Export to Excel
async function exportToExcel() {
    const records = await getAllRecords();

    if (records.length === 0) {
        showNotification('No records to export', 'error');
        return;
    }

    // Prepare data for Excel
    const data = records.map(r => ({
        'ID': r.id,
        'Employer Name': r.employer_name,
        'PhilHealth Employer Number': r.pen,
        'Total Employees': r.num_employees,
        'Processed Employees': r.num_processed || 0,
        'Date Received': r.date_received,
        'Date Processed': r.date_process || '',
        'Processed By': r.processed_by || '',
        'Date Released': r.date_released || '',
        'Received By': r.received_by || '',
        'Status': getStatus(r),
        'Created At': r.created_at,
        'Updated At': r.updated_at
    }));

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(data);

    // Set column widths
    const colWidths = [
        { wch: 6 },   // ID
        { wch: 35 },  // Employer Name
        { wch: 20 },  // PEN
        { wch: 18 },  // Total Employees
        { wch: 18 },  // Processed Employees
        { wch: 14 },  // Date Received
        { wch: 14 },  // Date Processed
        { wch: 20 },  // Processed By
        { wch: 14 },  // Date Released
        { wch: 20 },  // Received By
        { wch: 12 },  // Status
        { wch: 20 },  // Created At
        { wch: 20 }   // Updated At
    ];
    ws['!cols'] = colWidths;

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ER2 Records');

    // Generate filename with date
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `ER2_Records_${dateStr}.xlsx`;

    // Export file
    XLSX.writeFile(wb, filename);

    showNotification('Excel file exported successfully!', 'success');
}

// Import/Export JSON (for backup/restore)
function exportToJSON() {
    const records = getAllRecords();
    const data = {
        exportDate: new Date().toISOString(),
        records: records
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ER2_Backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();

    showNotification('Backup created successfully!', 'success');
}

// Import data from JSON
async function importFromJSON(file) {
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);

            if (data.records && Array.isArray(data.records)) {
                let importedCount = 0;

                for (const record of data.records) {
                    const recordData = {
                        employerName: record.employer_name,
                        pen: record.pen,
                        numEmployees: record.num_employees,
                        numProcessed: record.num_processed || 0,
                        dateReceived: record.date_received,
                        dateProcess: record.date_process,
                        processedBy: record.processed_by,
                        dateReleased: record.date_released,
                        receivedBy: record.received_by
                    };

                    const success = await addRecord(recordData);
                    if (success) importedCount++;
                }

                showNotification(`Imported ${importedCount} of ${data.records.length} records successfully!`, 'success');
            } else {
                throw new Error('Invalid file format');
            }
        } catch (error) {
            showNotification('Error importing file: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
}

// Tab switching functionality
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');

            // Remove active class from all buttons and contents
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            this.classList.add('active');
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });
}

// Switch to specific tab
function switchToTab(tabName) {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // Remove active class from all buttons and contents
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    // Add active class to target button and content
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');

    // Initialize charts when switching to statistics tab
    if (tabName === 'statistics') {
        setTimeout(() => {
            initCharts();
            updateCharts();
        }, 100);
    }
}

// ==================== PASSWORD TOGGLE ====================

// Toggle password visibility
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const button = input.nextElementSibling;
    const icon = button.querySelector('.eye-icon');

    if (input.type === 'password') {
        input.type = 'text';
        // Change to eye-slash icon (hidden)
        icon.innerHTML = `
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
    } else {
        input.type = 'password';
        // Change back to eye icon (visible)
        icon.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        `;
    }
}

// ==================== FIRST ADMIN SETUP ====================

// Check if this is the first time setup (no users in the system)
async function checkFirstTimeSetup() {
    try {
        const { getDocs, query, collection } = window.firebaseApp;
        const usersSnapshot = await getDocs(query(usersCollection));

        if (usersSnapshot.empty) {
            // No users exist - show first admin setup
            showFirstAdminSetup();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error checking first time setup:', error);
        return false;
    }
}

// Show first admin setup form in login modal
function showFirstAdminSetup() {
    const loginForm = document.getElementById('loginForm');
    loginForm.innerHTML = `
        <div class="login-icon">👑</div>
        <h3 class="login-heading">First Admin Setup</h3>
        <p class="setup-instruction">Welcome! Create the first administrator account to get started.</p>

        <div class="form-group login-field">
            <label for="setupEmail">
                <svg class="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                Admin Email
            </label>
            <input type="email" id="setupEmail" required placeholder="admin@philhealth.gov.ph">
        </div>

        <div class="form-group login-field">
            <label for="setupPassword">
                <svg class="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
                Password (min 6 chars)
            </label>
            <input type="password" id="setupPassword" required placeholder="Create a secure password" minlength="6">
        </div>

        <div class="form-group login-field">
            <label for="setupName">
                <svg class="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="7" r="4"></circle>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                </svg>
                Full Name
            </label>
            <input type="text" id="setupName" required placeholder="System Administrator">
        </div>

        <button type="submit" class="btn btn-primary btn-login">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <polyline points="2,17 12,12 22,17"></polyline>
                <polyline points="2,12 12,7 22,12"></polyline>
            </svg>
            Create Admin Account
        </button>
    `;

    // Update form submission handler
    loginForm.onsubmit = handleFirstAdminSetup;
}

// Handle first admin setup
async function handleFirstAdminSetup(e) {
    e.preventDefault();

    const email = document.getElementById('setupEmail').value.trim();
    const password = document.getElementById('setupPassword').value;
    const name = document.getElementById('setupName').value.trim();

    try {
        const { createUserWithEmailAndPassword } = window.firebaseApp;

        // Create the user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Save admin user data to Firestore
        const adminData = {
            email: email,
            name: name,
            role: 'admin',
            isFirstAdmin: true,
            createdAt: new Date().toISOString()
        };

        await saveUserData(user.uid, adminData);

        showNotification('Admin account created successfully!', 'success');

        // Reload the page to show normal login
        setTimeout(() => {
            window.location.reload();
        }, 2000);

    } catch (error) {
        console.error('Error creating admin:', error);
        let errorMessage = 'Failed to create admin account';

        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Email already registered';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak (min 6 characters)';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address';
        }

        showNotification(errorMessage, 'error');
    }
}

// Table header tooltips — appended to body to avoid overflow clipping
function initTableTooltips() {
    const headers = document.querySelectorAll('th[data-tooltip]');
    let tooltipEl = null;

    headers.forEach(th => {
        th.addEventListener('mouseenter', function () {
            const text = this.getAttribute('data-tooltip');
            if (!text) return;

            tooltipEl = document.createElement('div');
            tooltipEl.className = 'th-tooltip';
            tooltipEl.textContent = text;
            document.body.appendChild(tooltipEl);

            // Position centered below the th
            const rect = this.getBoundingClientRect();
            const ttRect = tooltipEl.getBoundingClientRect();

            let left = rect.left + rect.width / 2 - ttRect.width / 2;
            let top  = rect.bottom + 8;

            // Clamp to viewport edges
            if (left < 8) left = 8;
            if (left + ttRect.width > window.innerWidth - 8)
                left = window.innerWidth - ttRect.width - 8;

            tooltipEl.style.left = left + 'px';
            tooltipEl.style.top  = top  + 'px';

            // Trigger fade-in
            requestAnimationFrame(() => tooltipEl.classList.add('visible'));
        });

        th.addEventListener('mouseleave', function () {
            if (tooltipEl) {
                tooltipEl.remove();
                tooltipEl = null;
            }
        });
    });
}

// Initialize event listeners when DOM is loaded
// ============================================================================
// APPLICATION INITIALIZATION
// ============================================================================

/**
 * Initialize the entire application
 * Called when user selects ER2 Monitoring from access choice modal
 */
async function initApp() {
    // Initialize tabs
    initTabs();

    // Start Live Clock
    function updateDateTime() {
        const now = new Date();
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit'
        };
        const dtElement = document.getElementById('liveDateTime');
        if (dtElement) {
            dtElement.textContent = now.toLocaleString('en-US', options);
        }
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    // Initialize table header tooltips
    initTableTooltips();

    // Initialize Firebase
    await initFirebase();

    // Setup event listeners
    setupEventListeners();

    // Check if this is first time setup
    if (await checkFirstTimeSetup()) {
        openLoginModal();
        return;
    }
}

/**
 * Setup all event listeners for the application
 */
function setupEventListeners() {
    // Attach sort event
    const sortAgingBtn = document.getElementById('sortAgingBtn');
    if (sortAgingBtn) {
        sortAgingBtn.addEventListener('click', toggleAgingSort);
    }
    
    const sortEmployerBtn = document.getElementById('sortEmployerBtn');
    if (sortEmployerBtn) {
        sortEmployerBtn.addEventListener('click', toggleEmployerSort);
    }

    // Attach status filter events
    const filterBtns = document.querySelectorAll('.btn-filter');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            filterBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentStatusFilter = this.getAttribute('data-status');
            applySortAndLoad();
        });
    });

    // Form submission
    const er2Form = document.getElementById('er2Form');
    if (er2Form) {
        er2Form.addEventListener('submit', handleFormSubmit);
    }

    // Clear button
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearForm);
    }

    // Search
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', handleSearch);
    }
    
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', handleReset);
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keyup', function(e) {
            if (e.key === 'Enter') handleSearch();
        });
    }

    // Export
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToExcel);
    }

    // Import
    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
        importBtn.addEventListener('click', function() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = function(e) {
                if (e.target.files.length > 0) {
                    importFromJSON(e.target.files[0]);
                }
            };
            input.click();
        });
    }

    // Edit modal
    const editForm = document.getElementById('editForm');
    if (editForm) {
        editForm.addEventListener('submit', handleEditSubmit);
    }
    
    const closeBtn = document.querySelector('.close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeEditModal);
    }
    
    const cancelEdit = document.getElementById('cancelEdit');
    if (cancelEdit) {
        cancelEdit.addEventListener('click', closeEditModal);
    }

    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Create user form (admin only)
    const createUserForm = document.getElementById('createUserForm');
    if (createUserForm) {
        createUserForm.addEventListener('submit', handleCreateUser);
    }

    // Close modal when clicking outside
    window.addEventListener('click', function(e) {
        const modal = document.getElementById('editModal');
        if (e.target === modal) {
            closeEditModal();
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeEditModal();
            closeLoginModal();
        }
    });
}

document.addEventListener('DOMContentLoaded', async function() {
    // Auto-initialize the app for ER2 Monitoring
    // If the user wants PACD, they will click the button and redirect
    initApp();

    // Employee Ratio Logic
    function setupRatioListeners(empId, procId, displayId) {
        const empInput = document.getElementById(empId);
        const procInput = document.getElementById(procId);
        const display = document.getElementById(displayId);
        
        function update() {
            let total = parseInt(empInput?.value) || 0;
            let proc = parseInt(procInput?.value) || 0;
            
            // Prevent processed from exceeding total
            if (proc > total) {
                proc = total;
                if (procInput) procInput.value = proc;
            }
            
            if(display) display.textContent = `${proc}/${total}`;
        }
        
        if (empInput && procInput) {
            empInput.addEventListener('input', update);
            procInput.addEventListener('input', update);
        }
    }
    
    setupRatioListeners('numEmployees', 'numProcessed', 'employeeRatioDisplay');
    setupRatioListeners('editNumEmployees', 'editNumProcessed', 'editEmployeeRatioDisplay');
});

// ==================== AUTHENTICATION FUNCTIONS ====================

// Login handler
async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
        const { signInWithEmailAndPassword, doc, getDoc, collection, addDoc } = window.firebaseApp;
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        
        // Get user data for logging
        const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
        const userData = userDoc.data() || { name: email, role: 'officer' };

        // Record login history
        await addDoc(collection(db, 'login_history'), {
            uid: userCredential.user.uid,
            email: email,
            name: userData.name || email,
            role: userData.role || 'officer',
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
        });

        // Auth state change will handle the rest
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'Login failed. Please check your credentials.';

        if (error.code === 'auth/user-not-found') {
            errorMessage = 'User not found. Please contact admin to create an account.';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Incorrect password. Please try again.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address.';
        }

        showNotification(errorMessage, 'error');
    }
}

// Logout handler
async function handleLogout() {
    try {
        const { signOut } = window.firebaseApp;
        await signOut(auth);
        showNotification('Logged out successfully', 'success');
    } catch (error) {
        console.error('Logout error:', error);
        showNotification('Error logging out', 'error');
    }
}

// Open login modal
function openLoginModal() {
    document.getElementById('loginModal').style.display = 'block';
    document.getElementById('loginEmail').focus();
}

// Close login modal
function closeLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('loginForm').reset();
}

// ==================== USER MANAGEMENT FUNCTIONS (ADMIN ONLY) ====================

// Open user management modal
function openUserManagementModal() {
    if (currentUserData?.role !== 'admin') {
        showNotification('Only admins can manage users', 'error');
        return;
    }
    document.getElementById('userManagementModal').style.display = 'block';
    loadUsersList();
    loadLoginHistory();
}

// Close user management modal
function closeUserManagementModal() {
    document.getElementById('userManagementModal').style.display = 'none';
    document.getElementById('createUserForm').reset();
}

// Load users list
async function loadUsersList() {
    try {
        const { query, orderBy, onSnapshot, getDocs } = window.firebaseApp;

        const q = query(usersCollection, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);

        const usersBody = document.getElementById('usersBody');

        if (snapshot.empty) {
            usersBody.innerHTML = '<tr><td colspan="5" class="empty-state">No users found</td></tr>';
            return;
        }

        usersBody.innerHTML = snapshot.docs.map(doc => {
            const user = doc.data();
            return `
                <tr>
                    <td>${user.name || 'N/A'}</td>
                    <td>${user.email}</td>
                    <td><span class="role-badge ${user.role}">${user.role}</span></td>
                    <td>${formatDate(user.createdAt)}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-secondary" onclick="resetUserPassword('${user.email}')" style="padding: 4px 8px; font-size: 11px;">Reset Pwd</button>
                            ${doc.id !== currentUser.uid ? `
                                <button class="btn btn-danger" onclick="deleteUserAccount('${doc.id}', '${user.email}')" style="padding: 4px 8px; font-size: 11px;">Delete</button>
                            ` : '<span style="color: var(--text-tertiary); font-size: 11px; margin-left: 5px;">Current User</span>'}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading users:', error);
        showNotification('Failed to load users list', 'error');
    }
}

// Load login history
async function loadLoginHistory() {
    try {
        const { collection, query, orderBy, limit, getDocs } = window.firebaseApp;
        const historyCollection = collection(db, 'login_history');
        const q = query(historyCollection, orderBy('timestamp', 'desc'), limit(20));
        const snapshot = await getDocs(q);
        
        const historyBody = document.getElementById('loginHistoryBody');
        
        if (snapshot.empty) {
            historyBody.innerHTML = '<tr><td colspan="3" class="empty-state">No login history found</td></tr>';
            return;
        }

        historyBody.innerHTML = snapshot.docs.map(doc => {
            const log = doc.data();
            return `
                <tr>
                    <td>
                        <div class="user-log-info">
                            <span class="log-name" style="font-weight: 600; display: block;">${log.name}</span>
                            <span class="log-email" style="font-size: 11px; color: var(--text-tertiary);">${log.email}</span>
                        </div>
                    </td>
                    <td><span class="role-badge ${log.role}">${log.role}</span></td>
                    <td>${formatDateWithTime(log.timestamp)}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading login history:', error);
        document.getElementById('loginHistoryBody').innerHTML = '<tr><td colspan="3" class="empty-state">Error loading history</td></tr>';
    }
}

// Format date with time
function formatDateWithTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Create new user (admin only)
async function handleCreateUser(e) {
    e.preventDefault();

    if (currentUserData?.role !== 'admin') {
        showNotification('Only admins can create users', 'error');
        return;
    }

    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const name = document.getElementById('newUserName').value.trim();
    const role = document.getElementById('newUserRole').value;

    let tempApp = null;
    try {
        const { initializeApp, deleteApp, getAuth, createUserWithEmailAndPassword } = window.firebaseApp;

        // Create a temporary secondary app instance for creating the new user
        // This prevents the admin from being signed out of the primary app
        tempApp = initializeApp(window.firebaseConfig, 'tempAppForCreation');
        const tempAuth = getAuth(tempApp);

        const currentAdmin = auth.currentUser;

        // Create the new user using the temporary auth instance
        const userCredential = await createUserWithEmailAndPassword(tempAuth, email, password);
        const newUser = userCredential.user;

        // Save user data to Firestore (using the primary app's db)
        await saveUserData(newUser.uid, {
            email: email,
            name: name,
            role: role,
            createdBy: currentAdmin.uid,
            createdAt: new Date().toISOString()
        });

        // Clean up the temporary app
        await deleteApp(tempApp);

        showNotification(`User ${email} created successfully!`, 'success');
        document.getElementById('createUserForm').reset();
        loadUsersList();

    } catch (error) {
        console.error('Error creating user:', error);
        let errorMessage = 'Failed to create user';

        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Email already registered';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak (min 6 characters)';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address';
        }

        showNotification(errorMessage, 'error');
    }
}

// Delete user account (admin only)
async function deleteUserAccount(uid, email) {
    if (currentUserData?.role !== 'admin') {
        showNotification('Only admins can delete users', 'error');
        return;
    }

    if (uid === currentUser.uid) {
        showNotification('Cannot delete your own account', 'error');
        return;
    }

    showConfirmModal('Delete User', `Are you sure you want to delete user ${email}?`, 'Delete', 'btn-danger', async () => {
        try {
            const { doc, deleteDoc } = window.firebaseApp;

            // Delete user data from Firestore
            await deleteDoc(doc(db, 'users', uid));

            // Note: To delete the actual Auth user, you need Firebase Admin SDK
            // For now, we just delete the user data record

            showNotification('User deleted successfully', 'success');
            loadUsersList();
        } catch (error) {
            console.error('Error deleting user:', error);
            showNotification('Failed to delete user', 'error');
        }
    });
}

// Make functions available globally for onclick handlers
window.openEditModal = openEditModal;
window.confirmDelete = confirmDelete;
window.switchToTab = switchToTab;
window.openLoginModal = openLoginModal;
window.closeLoginModal = closeLoginModal;
window.handleLogout = handleLogout;
window.openUserManagementModal = openUserManagementModal;
window.closeUserManagementModal = closeUserManagementModal;
window.deleteUserAccount = deleteUserAccount;
window.openDeletedRecordsModal = openDeletedRecordsModal;
window.closeDeletedRecordsModal = closeDeletedRecordsModal;
window.handleRestore = handleRestore;
window.handlePermanentDelete = handlePermanentDelete;
window.closeConfirmModal = closeConfirmModal;
window.togglePassword = togglePassword;

// Deleted Records Modal Handlers
function openDeletedRecordsModal() {
    document.getElementById('deletedRecordsModal').style.display = 'block';
    loadDeletedRecords();
}

function closeDeletedRecordsModal() {
    document.getElementById('deletedRecordsModal').style.display = 'none';
}

function loadDeletedRecords() {
    const tbody = document.getElementById('deletedRecordsBody');
    if (!tbody) return;

    if (deletedRecords.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No deleted records found.</td></tr>';
        return;
    }

    tbody.innerHTML = deletedRecords.map(record => {
        return `
            <tr>
                <td>${record.employer_name}</td>
                <td>${record.pen}</td>
                <td>${formatDateWithTime(record.deleted_at)}</td>
                <td>${record.deleted_by || '-'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-warning" style="background:var(--gov-green-primary); border-color:var(--gov-green-dark); color:white;" onclick="handleRestore('${record.id}')">Restore</button>
                        <button class="btn btn-danger" onclick="handlePermanentDelete('${record.id}')">Perm. Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function handleRestore(id) {
    showConfirmModal('Restore Record', 'Are you sure you want to restore this record?', 'Restore', 'btn-primary', async () => {
        const success = await restoreRecord(id);
        if (success) {
            showNotification('Record restored successfully!', 'success');
        }
    });
}

async function handlePermanentDelete(id) {
    showConfirmModal('Permanently Delete', 'WARNING: This action cannot be undone. Are you sure you want to permanently delete this record?', 'Permanently Delete', 'btn-danger', async () => {
        const success = await permanentlyDeleteRecord(id);
        if (success) {
            showNotification('Record permanently deleted!', 'success');
        }
    });
}

// Reset user password (sends email link)
async function resetUserPassword(email) {
    if (currentUserData?.role !== 'admin') {
        showNotification('Only admins can reset passwords', 'error');
        return;
    }

    showConfirmModal('Reset Password', `Send password reset email to ${email}?`, 'Send Email', 'btn-primary', async () => {
        try {
            const { sendPasswordResetEmail } = window.firebaseApp;
            await sendPasswordResetEmail(auth, email);
            showNotification(`Password reset email sent to ${email}`, 'success');
        } catch (error) {
            console.error('Error sending reset email:', error);
            showNotification(error.message || 'Failed to send reset email', 'error');
        }
    });
}
window.resetUserPassword = resetUserPassword;

// ============================================================================
// ACCESS CHOICE MODAL HANDLER
// ============================================================================

/**
 * Handle user's choice in the access modal
 * @param {string} choice - 'pacd' or 'er2'
 */
window.handleAccessChoice = function(choice) {
    const overlay = document.getElementById('accessChoiceOverlay');
    
    if (choice === 'pacd') {
        // Redirect to PACD system
        window.location.href = 'https://pacd-omega.vercel.app/';
    } else if (choice === 'er2') {
        // Close the modal and show login
        if (overlay) {
            overlay.classList.add('hidden');
        }
        // Open the login modal
        openLoginModal();
    }
};

/**
 * Show the access choice modal on page load
 */
function showAccessChoiceModal() {
    const overlay = document.getElementById('accessChoiceOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
    }
}

/**
 * Initialize access modal on page load
 */
document.addEventListener('DOMContentLoaded', function() {
    // Show the access choice modal when the page loads
    showAccessChoiceModal();
});

// ============================================================================
// EXPORTS FOR ES6 MODULES
// ============================================================================
export { firebaseConfig, getEnvConfig };
