// Firebase configuration and helpers
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc, onSnapshot, query, orderBy }
    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyCCCj33LlcJ1yB0SxI6mH8jBm0AT2YB9hQ",
    authDomain: "netballstats-6a872.firebaseapp.com",
    projectId: "netballstats-6a872",
    storageBucket: "netballstats-6a872.firebasestorage.app",
    messagingSenderId: "340532434363",
    appId: "1:340532434363:web:763de79b6ca1bd8f04209e"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ---- Teams ----
const DB = {
    async saveTeam(team) {
        const id = team.name.toLowerCase().replace(/\s+/g, '-');
        await setDoc(doc(db, 'teams', id), team);
    },

    async getTeams() {
        const snap = await getDocs(collection(db, 'teams'));
        return snap.docs.map(d => d.data());
    },

    async deleteTeam(teamName) {
        const id = teamName.toLowerCase().replace(/\s+/g, '-');
        await deleteDoc(doc(db, 'teams', id));
    },

    // ---- Matches ----
    async saveMatch(match) {
        await setDoc(doc(db, 'matches', String(match.id)), match);
    },

    async getMatches() {
        const snap = await getDocs(collection(db, 'matches'));
        const matches = snap.docs.map(d => d.data());
        // Sort by id (timestamp) descending
        matches.sort((a, b) => b.id - a.id);
        return matches;
    },

    async deleteMatch(matchId) {
        await deleteDoc(doc(db, 'matches', String(matchId)));
    },

    // ---- Live Match (real-time) ----
    async saveLiveMatch(match) {
        // Build court map { pos: playerName }
        const court = {};
        if (match.court) {
            Object.entries(match.court).forEach(([pos, p]) => {
                if (p) court[pos] = { id: p.id, name: p.name };
            });
        }

        await setDoc(doc(db, 'live', 'current'), {
            id: match.id,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            quarter: match.quarter,
            quarterScores: match.quarterScores,
            timerSeconds: match.timerSeconds || 0,
            quarterLength: match.quarterLength,
            lastEvent: match.lastEvent || '',
            status: match.status || 'live',
            statistician: match.statistician || null,
            playerStats: match.playerStats,
            players: match.players,
            court: court,
            courtTime: match.courtTime || {},
            cpToGoal: match.cpToGoal || 0,
            toToGoal: match.toToGoal || 0,
            quarterComments: match.quarterComments || {},
            events: match.events.slice(-30),
            updatedAt: Date.now()
        });
    },

    async clearLiveMatch() {
        await setDoc(doc(db, 'live', 'current'), { status: 'none', statistician: null });
    },

    // Statistician lock
    async claimStatistician(name) {
        await setDoc(doc(db, 'live', 'lock'), {
            name,
            claimedAt: Date.now(),
            active: true
        });
    },

    async releaseStatistician() {
        await setDoc(doc(db, 'live', 'lock'), { active: false, name: null });
    },

    async getStatistician() {
        const snap = await getDoc(doc(db, 'live', 'lock'));
        return snap.exists() ? snap.data() : null;
    },

    onStatistician(callback) {
        return onSnapshot(doc(db, 'live', 'lock'), (snap) => {
            callback(snap.exists() ? snap.data() : null);
        });
    },

    // Subscribe to live match updates (for viewer)
    onLiveMatch(callback) {
        return onSnapshot(doc(db, 'live', 'current'), (snap) => {
            const data = snap.data();
            callback(data || { status: 'none' });
        });
    }
};

export { DB, db };
