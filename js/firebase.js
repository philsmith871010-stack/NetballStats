// Firebase configuration and helpers — multi-club scoped
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc, onSnapshot }
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

// ---- Club Registry ----
const ClubDB = {
    async listClubs() {
        const snap = await getDocs(collection(db, 'clubs'));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async getClub(clubId) {
        const snap = await getDoc(doc(db, 'clubs', clubId));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },

    async createClub(clubId, data) {
        await setDoc(doc(db, 'clubs', clubId), data);
    },

    async verifyPassword(clubId, password) {
        const club = await this.getClub(clubId);
        if (!club) return false;
        return club.password === password;
    },
};

// ---- Club-scoped DB operations ----
function createClubDB(clubId) {
    const prefix = `clubs/${clubId}`;

    return {
        clubId,

        // Squad roster (persistent player list with stable IDs)
        async saveSquad(players) {
            await setDoc(doc(db, prefix + '/config', 'squad'), { players, updatedAt: Date.now() });
        },
        async getSquad() {
            const snap = await getDoc(doc(db, prefix + '/config', 'squad'));
            return snap.exists() ? snap.data().players || [] : [];
        },

        // Last lineup (which players were selected + positions)
        async saveLastLineup(lineup) {
            await setDoc(doc(db, prefix + '/config', 'lastLineup'), { lineup, updatedAt: Date.now() });
        },
        async getLastLineup() {
            const snap = await getDoc(doc(db, prefix + '/config', 'lastLineup'));
            return snap.exists() ? snap.data().lineup || null : null;
        },

        // Legacy teams (keep for backward compat)
        async saveTeam(team) {
            const id = team.name.toLowerCase().replace(/\s+/g, '-');
            await setDoc(doc(db, prefix + '/teams', id), team);
        },
        async getTeams() {
            const snap = await getDocs(collection(db, prefix + '/teams'));
            return snap.docs.map(d => d.data());
        },
        async deleteTeam(teamName) {
            const id = teamName.toLowerCase().replace(/\s+/g, '-');
            await deleteDoc(doc(db, prefix + '/teams', id));
        },

        // Matches
        async saveMatch(match) {
            await setDoc(doc(db, prefix + '/matches', String(match.id)), match);
        },
        async getMatches() {
            const snap = await getDocs(collection(db, prefix + '/matches'));
            const matches = snap.docs.map(d => d.data());
            matches.sort((a, b) => b.id - a.id);
            return matches;
        },
        async deleteMatch(matchId) {
            await deleteDoc(doc(db, prefix + '/matches', String(matchId)));
        },

        // Live match
        async saveLiveMatch(match) {
            const court = {};
            if (match.court) {
                Object.entries(match.court).forEach(([pos, p]) => {
                    if (p) court[pos] = { id: p.id, name: p.name };
                });
            }
            await setDoc(doc(db, prefix + '/live', 'current'), {
                id: match.id,
                homeTeam: match.homeTeam, awayTeam: match.awayTeam,
                homeScore: match.homeScore, awayScore: match.awayScore,
                quarter: match.quarter, quarterScores: match.quarterScores,
                timerSeconds: match.timerSeconds || 0, quarterLength: match.quarterLength,
                lastEvent: match.lastEvent || '', status: match.status || 'live',
                statistician: match.statistician || null,
                playerStats: match.playerStats, players: match.players,
                court, courtTime: match.courtTime || {},
                cpToGoal: match.cpToGoal || 0, toToGoal: match.toToGoal || 0,
                quarterComments: match.quarterComments || {},
                events: match.events.slice(-30), updatedAt: Date.now()
            });
        },
        async clearLiveMatch() {
            await setDoc(doc(db, prefix + '/live', 'current'), { status: 'none', statistician: null });
        },

        // Statistician lock
        async claimStatistician(name) {
            await setDoc(doc(db, prefix + '/live', 'lock'), { name, claimedAt: Date.now(), active: true });
        },
        async releaseStatistician() {
            await setDoc(doc(db, prefix + '/live', 'lock'), { active: false, name: null });
        },
        async getStatistician() {
            const snap = await getDoc(doc(db, prefix + '/live', 'lock'));
            return snap.exists() ? snap.data() : null;
        },
        onStatistician(callback) {
            return onSnapshot(doc(db, prefix + '/live', 'lock'), (snap) => {
                callback(snap.exists() ? snap.data() : null);
            });
        },

        // Live match subscription (for viewers)
        onLiveMatch(callback) {
            return onSnapshot(doc(db, prefix + '/live', 'current'), (snap) => {
                const data = snap.data();
                callback(data || { status: 'none' });
            });
        }
    };
}

export { ClubDB, createClubDB, db };
