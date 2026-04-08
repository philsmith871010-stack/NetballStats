/* ========================================
   NetballStats - Full App
   Navigation, Teams, Match Engine, Stats
   ======================================== */

// Firebase integration - loaded as module from index.html
let DB = null;
let ClubDB = null;
let FirebaseModule = null;

async function initFirebase() {
    try {
        const scriptPath = new URL('js/firebase.js', document.baseURI).href;
        FirebaseModule = await import(scriptPath);
        ClubDB = FirebaseModule.ClubDB;
        console.log('Firebase connected');
        return true;
    } catch (e) {
        console.warn('Firebase not available, using localStorage fallback:', e.message);
        return false;
    }
}

const App = {
    // ---- State ----
    currentView: 'view-home',
    teams: [],
    matches: [],
    trackingLevel: 'basic',

    // Squad roster (persistent across matches)
    squad: [], // [{ id: 'p_xxx', name: 'Amber', number: '1' }, ...]
    lastLineup: null, // { playerIds: [...], positions: { GS: 'p_xxx', ... } }

    // Current match setup state
    setupPlayers: [],
    setupTeamName: '',

    // Live match state
    match: null,          // Current match object
    timerInterval: null,
    timerRunning: false,
    timerSeconds: 0,
    selectedMatchPlayer: null, // Player selected for action
    subState: { playerOff: null, playerOn: null, newPos: null },

    // ---- Constants ----
    POSITIONS: ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'],
    SHOOTING_POSITIONS: ['GS', 'GA'],
    getStorageKey(type) {
        const prefix = this.clubId ? `ns_${this.clubId}` : 'netballstats';
        return `${prefix}_${type}`;
    },

    // Action definitions: { key, label, icon, cssClass, positions (null=all), category }
    ACTIONS_BASIC: [
        { key: 'goal', label: 'Goal', icon: '&#9917;', css: 'action-goal', positions: ['GS', 'GA'] },
        { key: 'miss', label: 'Miss', icon: '&#10060;', css: 'action-miss', positions: ['GS', 'GA'] },
        { key: 'centre_pass', label: 'C.Pass', icon: '&#9654;', css: 'action-neutral', positions: null },
        { key: 'intercept', label: 'Intercept', icon: '&#128170;', css: 'action-positive', positions: null },
        { key: 'turnover', label: 'Turnover', icon: '&#8635;', css: 'action-negative', positions: null },
        { key: 'rebound', label: 'Rebound', icon: '&#8593;', css: 'action-positive', positions: ['GS', 'GA', 'GK', 'GD'] },
    ],
    ACTIONS_DETAILED: [
        // Shooting
        { key: 'goal', label: 'Goal', icon: '&#9917;', css: 'action-goal', positions: ['GS', 'GA'] },
        { key: 'miss', label: 'Miss', icon: '&#10060;', css: 'action-miss', positions: ['GS', 'GA'] },
        // Positive
        { key: 'centre_pass', label: 'C.Pass', icon: '&#9654;', css: 'action-neutral', positions: null },
        { key: 'feed', label: 'Feed', icon: '&#10145;', css: 'action-neutral', positions: null },
        { key: 'intercept', label: 'Intercept', icon: '&#128170;', css: 'action-positive', positions: null },
        { key: 'deflection', label: 'Deflection', icon: '&#128400;', css: 'action-positive', positions: null },
        { key: 'rebound', label: 'Rebound', icon: '&#8593;', css: 'action-positive', positions: ['GS', 'GA', 'GK', 'GD'] },
        { key: 'pickup', label: 'Pickup', icon: '&#9995;', css: 'action-positive', positions: null },
        // Negative
        { key: 'turnover', label: 'Turnover', icon: '&#8635;', css: 'action-negative', positions: null },
        { key: 'unforced_error', label: 'Unforced', icon: '&#10071;', css: 'action-negative', positions: null },
        { key: 'not_received', label: 'Not Recv', icon: '&#128078;', css: 'action-negative', positions: null },
        { key: 'footwork', label: 'Footwork', icon: '&#129406;', css: 'action-negative', positions: null },
        { key: 'offside', label: 'Offside', icon: '&#128679;', css: 'action-negative', positions: null },
        { key: 'penalty_contact', label: 'Contact', icon: '&#9888;', css: 'action-negative', positions: null },
        { key: 'penalty_obstruction', label: 'Obstruct', icon: '&#128683;', css: 'action-negative', positions: null },
    ],

    // ---- Sample Data ----
    SAMPLE_TEAMS: [
        {
            name: 'Hatfield U13s',
            players: [
                { name: 'Amber', number: '1' },
                { name: 'Daisy', number: '2' },
                { name: 'Alexa', number: '3' },
                { name: 'Poppy', number: '4' },
                { name: 'Aliska', number: '5' },
                { name: 'Gracie', number: '6' },
                { name: 'Ellam', number: '7' },
                { name: 'Immy', number: '8' },
                { name: 'Maisy', number: '9' },
                { name: 'Bella', number: '10' },
                { name: 'Martha', number: '11' },
            ]
        },
        {
            name: 'Lightning',
            players: [
                { name: 'Ruby S', number: '1' },
                { name: 'Amelia J', number: '2' },
                { name: 'Harper L', number: '3' },
                { name: 'Willow C', number: '4' },
                { name: 'Zoe N', number: '5' },
                { name: 'Sienna A', number: '6' },
                { name: 'Poppy G', number: '7' },
                { name: 'Ivy E', number: '8' },
                { name: 'Luna Q', number: '9' },
                { name: 'Freya V', number: '10' },
            ]
        },
    ],

    // ==========================================
    // INIT
    // ==========================================
    clubId: null,
    clubInfo: null,

    async init() {
        this.useFirebase = await initFirebase();

        // Check if we have a saved club session
        const savedClub = localStorage.getItem('netballstats_club_id');
        if (savedClub && this.useFirebase) {
            const ok = await this.selectClub(savedClub, true);
            if (ok) {
                if (this.restoreMatchState()) {
                    // Already in match view
                } else {
                    this.showView('view-landing');
                }
                document.getElementById('setup-date').value = new Date().toISOString().split('T')[0];
                this.populatePlayerRows('setup-team-players', 10);
                return;
            }
        }

        // Seed clubs if needed, then show selector
        this.showView('view-club-select');
        if (this.useFirebase) {
            await this.seedClubs();
            this.loadClubList();
        }

        document.getElementById('setup-date').value = new Date().toISOString().split('T')[0];
        this.populatePlayerRows('setup-team-players', 10);
    },

    // ==========================================
    // DATA PERSISTENCE
    // ==========================================
    async loadData() {
        if (this.useFirebase) {
            try {
                this.teams = await DB.getTeams();
                this.matches = await DB.getMatches();
                return;
            } catch (e) {
                console.error('Firebase load failed, falling back to localStorage:', e);
            }
        }
        try {
            const teamsJson = localStorage.getItem(this.getStorageKey('teams'));
            if (teamsJson) this.teams = JSON.parse(teamsJson);
            const matchesJson = localStorage.getItem(this.getStorageKey('matches'));
            if (matchesJson) this.matches = JSON.parse(matchesJson);
        } catch (e) {
            console.error('Failed to load data:', e);
        }
    },

    seedSampleDataIfEmpty() {
        // Disabled — no sample data, all real matches only
    },

    // ==========================================
    // SQUAD ROSTER
    // ==========================================
    generatePlayerId() {
        return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    },

    async loadSquad() {
        if (this.useFirebase && DB) {
            try {
                this.squad = await DB.getSquad();
                if (this.squad.length) {
                    // Save locally as backup
                    localStorage.setItem(this.getStorageKey('squad'), JSON.stringify(this.squad));
                }
                this.lastLineup = await DB.getLastLineup();
                return;
            } catch (e) { console.error('Failed to load squad from Firebase:', e); }
        }
        // Fallback to localStorage
        try {
            const json = localStorage.getItem(this.getStorageKey('squad'));
            if (json) this.squad = JSON.parse(json);
        } catch (e) {}
    },

    async saveSquad() {
        localStorage.setItem(this.getStorageKey('squad'), JSON.stringify(this.squad));
        if (this.useFirebase && DB) {
            DB.saveSquad(this.squad).catch(e => console.error('Failed to save squad:', e));
        }
    },

    async saveLastLineup(lineup) {
        this.lastLineup = lineup;
        if (this.useFirebase && DB) {
            DB.saveLastLineup(lineup).catch(e => console.error('Failed to save lineup:', e));
        }
    },

    addPlayerToSquad(name, number) {
        if (!name.trim()) return null;
        const player = { id: this.generatePlayerId(), name: name.trim(), number: (number || '').trim() };
        this.squad.push(player);
        this.saveSquad();
        return player;
    },

    removePlayerFromSquad(playerId) {
        this.squad = this.squad.filter(p => p.id !== playerId);
        this.saveSquad();
    },

    // Migrate old-format players (index-based) to ID-based
    migrateOldPlayers() {
        if (this.teams.length > 0 && this.squad.length === 0) {
            const oldTeam = this.teams[0];
            if (oldTeam && oldTeam.players) {
                this.squad = oldTeam.players.map((p, i) => ({
                    id: 'p_legacy_' + i,
                    name: p.name,
                    number: p.number || ''
                }));
                this.saveSquad();
            }
        }
    },

    // ==========================================
    // SQUAD ROSTER PAGE
    // ==========================================
    renderSquadRoster() {
        const container = document.getElementById('squad-roster-list');
        document.getElementById('squad-count').textContent = `${this.squad.length} players`;

        if (!this.squad.length) {
            container.innerHTML = '<p class="empty-state">No players in squad yet</p>';
            return;
        }

        container.innerHTML = this.squad.map(p => {
            const initials = p.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            return `<div class="roster-player">
                <div class="rp-avatar">${initials}</div>
                <div class="rp-info">
                    <div class="rp-name">${p.name}</div>
                </div>
                ${p.number ? `<span class="rp-number">#${p.number}</span>` : ''}
                <span class="rp-remove material-symbols-outlined" onclick="App.removeRosterPlayer('${p.id}')">delete</span>
            </div>`;
        }).join('');
    },

    addRosterPlayer() {
        const nameInput = document.getElementById('roster-new-name');
        const numInput = document.getElementById('roster-new-number');
        const name = nameInput.value.trim();
        const number = numInput.value.trim();
        if (!name) { this.toast('Enter a name', 'error'); return; }

        this.addPlayerToSquad(name, number);
        nameInput.value = '';
        numInput.value = '';
        nameInput.focus();
        this.renderSquadRoster();
        this.toast(`${name} added to squad`, 'success');
    },

    removeRosterPlayer(playerId) {
        const player = this.squad.find(p => p.id === playerId);
        if (!player) return;
        this.showConfirm(`Remove ${player.name} from squad?`, confirmed => {
            if (!confirmed) return;
            this.removePlayerFromSquad(playerId);
            this.renderSquadRoster();
            this.toast(`${player.name} removed`, 'success');
        });
    },

    createSampleMatches() {
        const team = this.SAMPLE_TEAMS[0];
        const players = team.players.map((p, i) => ({ ...p, id: i }));
        // Players: 0=Amber(GS), 1=Daisy(GA), 2=Alexa(WA), 3=Poppy(C), 4=Aliska(WD), 5=Gracie(GD), 6=Ellam(GK), 7=Immy, 8=Maisy, 9=Bella

        // courtTime in seconds: 60min match = 3600s. Starters ~2700-3600s, subs ~600-1200s
        const matches = [
            // Match 1: Opening day win - no subs used
            { opp: 'St Albans Stingers', venue: 'Hatfield Leisure Centre', comp: 'Winter League R1', daysAgo: 56,
              home: 28, away: 22, qs: [{home:7,away:6},{home:8,away:5},{home:6,away:7},{home:7,away:4}],
              stats: {
                0:{goal:16,miss:6,rebound:2}, 1:{goal:12,miss:4,rebound:1},
                2:{centre_pass:6,feed:5,assist:3,turnover:2}, 3:{centre_pass:12,intercept:2,turnover:1},
                4:{intercept:4,deflection:2,turnover:1}, 5:{intercept:3,deflection:2,rebound:3,turnover:1},
                6:{intercept:2,deflection:3,rebound:4}
              },
              ct: {0:3600,1:3600,2:3600,3:3600,4:3600,5:3600,6:3600}
            },
            // Match 2: Tight loss - Immy gets 15 min
            { opp: 'Welwyn Warriors', venue: 'Gosling Sports Park', comp: 'Winter League R2', daysAgo: 49,
              home: 19, away: 23, qs: [{home:5,away:6},{home:4,away:7},{home:6,away:5},{home:4,away:5}],
              stats: {
                0:{goal:10,miss:7,rebound:1}, 1:{goal:9,miss:5,rebound:1},
                2:{centre_pass:5,feed:3,turnover:4}, 3:{centre_pass:9,intercept:1,turnover:3},
                4:{intercept:2,deflection:1,turnover:2}, 5:{intercept:2,deflection:1,rebound:2,turnover:2},
                6:{intercept:1,deflection:2,rebound:3}, 7:{intercept:1,turnover:1}
              },
              ct: {0:3600,1:3600,2:2700,3:3600,4:3600,5:3600,6:3600,7:900}
            },
            // Match 3: County Cup - big win, Maisy gets time
            { opp: 'Hertford Hawks', venue: 'Hertford Sports Village', comp: 'County Cup R1', daysAgo: 42,
              home: 35, away: 18, qs: [{home:10,away:5},{home:9,away:4},{home:8,away:5},{home:8,away:4}],
              stats: {
                0:{goal:20,miss:4,rebound:3}, 1:{goal:15,miss:2,rebound:2,intercept:1},
                2:{centre_pass:9,feed:8,assist:5,turnover:1}, 3:{centre_pass:15,intercept:4,turnover:0},
                4:{intercept:6,deflection:4,turnover:0}, 5:{intercept:5,deflection:3,rebound:4,turnover:0},
                6:{intercept:3,deflection:4,rebound:5}, 8:{feed:2,turnover:1}
              },
              ct: {0:3600,1:3600,2:2700,3:3600,4:3600,5:3600,6:3600,8:900}
            },
            // Match 4: Close win, Immy starts WA, Alexa off bench
            { opp: 'Potters Bar Panthers', venue: 'Hatfield Leisure Centre', comp: 'Winter League R3', daysAgo: 35,
              home: 25, away: 24, qs: [{home:6,away:7},{home:7,away:5},{home:5,away:6},{home:7,away:6}],
              stats: {
                0:{goal:14,miss:5,rebound:2}, 1:{goal:11,miss:4,rebound:1,intercept:1},
                7:{centre_pass:7,feed:4,assist:2,turnover:2}, 3:{centre_pass:11,intercept:3,turnover:1},
                4:{intercept:4,deflection:3,turnover:1}, 5:{intercept:3,deflection:2,rebound:2,turnover:1},
                6:{intercept:2,deflection:3,rebound:4}, 2:{feed:2,assist:1,turnover:1}
              },
              ct: {0:3600,1:3600,7:2700,3:3600,4:3600,5:3600,6:3600,2:900}
            },
            // Match 5: Tough away loss - all subs used
            { opp: 'Stevenage Storm', venue: 'Stevenage Leisure Centre', comp: 'Winter League R4', daysAgo: 28,
              home: 20, away: 30, qs: [{home:4,away:8},{home:6,away:7},{home:5,away:8},{home:5,away:7}],
              stats: {
                0:{goal:11,miss:8,rebound:1}, 1:{goal:9,miss:6,rebound:1},
                2:{centre_pass:5,feed:3,turnover:4}, 3:{centre_pass:8,intercept:1,turnover:3},
                4:{intercept:2,deflection:1,turnover:3}, 5:{intercept:1,deflection:1,rebound:2,turnover:2},
                6:{intercept:2,deflection:2,rebound:2}, 9:{intercept:1,turnover:1}
              },
              ct: {0:3600,1:3600,2:2700,3:2700,4:3600,5:3600,6:3600,7:900,8:900,9:900}
            },
            // Match 6: Bounce back win - everyone plays
            { opp: 'Hitchin Heat', venue: 'Hatfield Leisure Centre', comp: 'Winter League R5', daysAgo: 21,
              home: 32, away: 21, qs: [{home:9,away:5},{home:7,away:6},{home:8,away:4},{home:8,away:6}],
              stats: {
                0:{goal:19,miss:4,rebound:3}, 1:{goal:13,miss:3,rebound:2,intercept:2},
                2:{centre_pass:8,feed:7,assist:4,turnover:1}, 3:{centre_pass:14,intercept:4,turnover:1},
                4:{intercept:5,deflection:3,turnover:0}, 5:{intercept:4,deflection:3,rebound:3,turnover:0},
                6:{intercept:3,deflection:4,rebound:5}, 7:{feed:1,assist:1}, 8:{intercept:1}, 10:{turnover:1}
              },
              ct: {0:3600,1:3600,2:2400,3:2400,4:3600,5:3600,6:3600,7:1200,8:600,10:600}
            },
            // Match 7: County Cup Semi - nail biter, Bella and Martha come on
            { opp: 'Stevenage Storm', venue: 'Welwyn Arena', comp: 'County Cup Semi', daysAgo: 14,
              home: 27, away: 26, qs: [{home:7,away:7},{home:6,away:7},{home:8,away:6},{home:6,away:6}],
              stats: {
                0:{goal:15,miss:5,rebound:2}, 1:{goal:12,miss:4,rebound:2,intercept:1},
                2:{centre_pass:7,feed:6,assist:4,turnover:2}, 3:{centre_pass:13,intercept:3,turnover:1},
                4:{intercept:5,deflection:4,turnover:1}, 5:{intercept:4,deflection:2,rebound:3,turnover:1},
                6:{intercept:3,deflection:3,rebound:5}, 9:{feed:1,turnover:1}
              },
              ct: {0:3600,1:3600,2:2700,3:3600,4:3600,5:3600,6:3600,9:900}
            },
            // Match 8: Last week - dominant, lots of rotation
            { opp: 'Welwyn Warriors', venue: 'Hatfield Leisure Centre', comp: 'Winter League R6', daysAgo: 7,
              home: 34, away: 20, qs: [{home:9,away:5},{home:8,away:5},{home:9,away:6},{home:8,away:4}],
              stats: {
                0:{goal:20,miss:3,rebound:4}, 1:{goal:14,miss:2,rebound:3,intercept:2},
                2:{centre_pass:9,feed:8,assist:6,turnover:1}, 3:{centre_pass:16,intercept:5,turnover:0},
                4:{intercept:6,deflection:5,turnover:0}, 5:{intercept:5,deflection:3,rebound:4,turnover:0},
                6:{intercept:4,deflection:5,rebound:6}, 7:{feed:2,assist:1}, 8:{intercept:1,deflection:1}, 9:{intercept:1}, 10:{intercept:1,deflection:1}
              },
              ct: {0:3600,1:3600,2:2100,3:2400,4:3600,5:2700,6:2700,7:1500,8:900,9:900,10:900}
            },
        ];

        return matches.map((m, idx) => {
            const d = new Date();
            d.setDate(d.getDate() - m.daysAgo);

            // Generate events
            const events = [];
            let eid = 5000 + idx * 500;
            const actionPool = [
                {pid:0,action:'goal',pos:'GS',team:'home'}, {pid:1,action:'goal',pos:'GA',team:'home'},
                {pid:0,action:'miss',pos:'GS',team:'home'}, {pid:1,action:'miss',pos:'GA',team:'home'},
                {pid:3,action:'centre_pass',pos:'C',team:'home'}, {pid:4,action:'intercept',pos:'WD',team:'home'},
                {pid:null,action:'opp_goal',pos:null,team:'away'}, {pid:5,action:'intercept',pos:'GD',team:'home'},
                {pid:6,action:'rebound',pos:'GK',team:'home'}, {pid:2,action:'feed',pos:'WA',team:'home'},
                {pid:4,action:'deflection',pos:'WD',team:'home'}, {pid:2,action:'turnover',pos:'WA',team:'home'},
            ];
            for (let q = 1; q <= 4; q++) {
                events.push({id:eid++, quarter:q, time:'0:00', playerId:null, playerName:`Q${q} started`, position:null, action:'system', team:null});
                for (let i = 0; i < 12; i++) {
                    const a = actionPool[Math.floor(Math.random() * actionPool.length)];
                    const mins = Math.floor((i/12)*15);
                    const secs = String(Math.floor(Math.random()*60)).padStart(2,'0');
                    events.push({id:eid++, quarter:q, time:`${mins}:${secs}`, playerId:a.pid, playerName:a.pid!==null?players[a.pid].name:m.opp, position:a.pos, action:a.action, team:a.team});
                }
            }
            events.push({id:eid++, quarter:4, time:'15:00', playerId:null, playerName:'Full time', position:null, action:'system', team:null});

            return {
                id: Date.now() - m.daysAgo * 86400000 + idx,
                date: d.toISOString().split('T')[0],
                venue: m.venue,
                competition: m.comp,
                homeTeam: team.name,
                awayTeam: m.opp,
                homeScore: m.home,
                awayScore: m.away,
                quarterScores: m.qs,
                players,
                playerStats: m.stats,
                courtTime: m.ct || {},
                events,
                trackingLevel: 'detailed',
                quarterLength: 15,
            };
        });
    },

    saveTeams() {
        localStorage.setItem(this.getStorageKey('teams'), JSON.stringify(this.teams));
        if (this.useFirebase) {
            this.teams.forEach(t => DB.saveTeam(t).catch(e => console.error('Firebase save team error:', e)));
        }
    },

    saveMatches() {
        localStorage.setItem(this.getStorageKey('matches'), JSON.stringify(this.matches));
        if (this.useFirebase) {
            this.matches.forEach(m => DB.saveMatch(m).catch(e => console.error('Firebase save match error:', e)));
        }
    },

    // ==========================================
    // VIEW NAVIGATION
    // ==========================================
    showView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const view = document.getElementById(viewId);
        if (view) {
            view.classList.add('active');
            this.currentView = viewId;
            this.onViewEnter(viewId);
        }
    },

    onViewEnter(viewId) {
        switch (viewId) {
            case 'view-squad':
                this.renderSquadRoster();
                break;
            case 'view-setup-team':
                document.getElementById('setup-team-name').value =
                    this.clubInfo ? this.clubInfo.name : '';
                this.renderSquadPicker();
                break;
            case 'view-history':
                this.renderHistory();
                break;
        }
    },

    // ==========================================
    // PLAYER ROW MANAGEMENT
    // ==========================================
    populatePlayerRows(containerId, count) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        for (let i = 0; i < count; i++) {
            this.appendPlayerRow(container, '', '');
        }
    },

    appendPlayerRow(container, name, number) {
        const row = document.createElement('div');
        row.className = 'player-row';
        row.innerHTML = `
            <input type="text" class="player-num" placeholder="#" value="${number}" maxlength="3">
            <input type="text" class="player-name-input" placeholder="Player name" value="${name}">
            <button class="btn-remove" onclick="App.removePlayerRow(this)">&times;</button>
        `;
        container.appendChild(row);
    },

    addPlayerRow(containerId) {
        const container = document.getElementById(containerId);
        this.appendPlayerRow(container, '', '');
        // Focus the new name input
        const inputs = container.querySelectorAll('.player-name-input');
        inputs[inputs.length - 1].focus();
    },

    removePlayerRow(btn) {
        btn.closest('.player-row').remove();
    },

    getPlayersFromContainer(containerId) {
        const container = document.getElementById(containerId);
        const players = [];
        container.querySelectorAll('.player-row').forEach(row => {
            const name = row.querySelector('.player-name-input').value.trim();
            const number = row.querySelector('.player-num').value.trim();
            if (name) {
                players.push({ name, number });
            }
        });
        return players;
    },

    // ==========================================
    // MANAGE TEAMS
    // ==========================================
    saveTeam() {
        const nameInput = document.getElementById('manage-team-name');
        const name = nameInput.value.trim();
        if (!name) {
            this.toast('Please enter a team name', 'error');
            return;
        }
        const players = this.getPlayersFromContainer('manage-team-players');
        if (players.length < 7) {
            this.toast('Add at least 7 players', 'error');
            return;
        }

        // Check if team exists (update) or new
        const existing = this.teams.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
        if (existing >= 0) {
            this.teams[existing].players = players;
        } else {
            this.teams.push({ name, players });
        }
        this.saveTeams();
        this.renderSavedTeams();
        nameInput.value = '';
        this.populatePlayerRows('manage-team-players', 10);
        this.toast(`Team "${name}" saved!`, 'success');
    },

    renderSavedTeams() {
        const container = document.getElementById('saved-teams-list');
        if (!this.teams.length) {
            container.innerHTML = '<p class="empty-state">No saved teams yet</p>';
            return;
        }
        container.innerHTML = this.teams.map((team, i) => `
            <div class="saved-team-card">
                <div>
                    <div class="stc-name">${team.name}</div>
                    <div class="stc-count">${team.players.length} players</div>
                </div>
                <div class="stc-actions">
                    <button class="btn btn-small btn-outline" onclick="App.editTeam(${i})">Edit</button>
                    <button class="btn btn-small btn-danger" onclick="App.deleteTeam(${i})">Delete</button>
                </div>
            </div>
        `).join('');
    },

    editTeam(index) {
        const team = this.teams[index];
        document.getElementById('manage-team-name').value = team.name;
        const container = document.getElementById('manage-team-players');
        container.innerHTML = '';
        team.players.forEach(p => this.appendPlayerRow(container, p.name, p.number));
        // Add a few empty rows
        for (let i = 0; i < 3; i++) this.appendPlayerRow(container, '', '');
        window.scrollTo(0, 0);
    },

    deleteTeam(index) {
        this.showConfirm(`Delete team "${this.teams[index].name}"?`, confirmed => {
            if (confirmed) {
                const teamName = this.teams[index].name;
                this.teams.splice(index, 1);
                this.saveTeams();
                if (this.useFirebase) DB.deleteTeam(teamName).catch(console.error);
                this.renderSavedTeams();
                this.toast('Team deleted', 'success');
            }
        });
    },

    // ==========================================
    // MATCH SETUP
    // ==========================================
    populateSavedTeamDropdown() {
        const select = document.getElementById('setup-saved-team');
        select.innerHTML = '<option value="">-- Or enter manually below --</option>';
        this.teams.forEach((team, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `${team.name} (${team.players.length} players)`;
            select.appendChild(opt);
        });
    },

    loadSavedTeam() {
        const select = document.getElementById('setup-saved-team');
        const index = parseInt(select.value);
        if (isNaN(index)) return;

        const team = this.teams[index];
        document.getElementById('setup-team-name').value = team.name;

        const container = document.getElementById('setup-team-players');
        container.innerHTML = '';
        team.players.forEach(p => this.appendPlayerRow(container, p.name, p.number));
        for (let i = 0; i < 3; i++) this.appendPlayerRow(container, '', '');
    },

    setTrackingLevel(level) {
        this.trackingLevel = level;
        document.querySelectorAll('.toggle-btn[data-level]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.level === level);
        });
        const hint = document.getElementById('tracking-hint');
        if (level === 'basic') {
            hint.textContent = 'Goals, centre passes, interceptions, turnovers';
        } else {
            hint.textContent = 'All stats: goals, feeds, assists, deflections, rebounds, penalties, pickups';
        }
    },

    // ==========================================
    // SQUAD PICKER (match setup)
    // ==========================================
    _selectedSquadIds: new Set(),

    renderSquadPicker() {
        const container = document.getElementById('squad-picker');

        // Pre-select: use last lineup if available, otherwise select all
        if (!this._selectedSquadIds.size) {
            if (this.lastLineup && this.lastLineup.playerIds) {
                this._selectedSquadIds = new Set(this.lastLineup.playerIds);
            } else {
                this._selectedSquadIds = new Set(this.squad.map(p => p.id));
            }
        }

        // Show only selected players
        const selected = this.squad.filter(p => this._selectedSquadIds.has(p.id));

        if (selected.length) {
            container.innerHTML = selected.map(p =>
                `<div class="squad-player selected">
                    <span class="sp-name">${p.name}</span>
                    ${p.number ? `<span class="sp-number">#${p.number}</span>` : ''}
                    <span class="sp-remove material-symbols-outlined" onclick="App.deselectSquadPlayer('${p.id}')">close</span>
                </div>`
            ).join('');
        } else {
            container.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:1rem">No players selected — add from roster below</p>';
        }

        // Update the dropdown with unselected players
        this.updateRosterDropdown();
    },

    updateRosterDropdown() {
        const dropdown = document.getElementById('squad-add-dropdown');
        const available = this.squad.filter(p => !this._selectedSquadIds.has(p.id));

        dropdown.innerHTML = '<option value="">+ Add player from roster...</option>';
        available.forEach(p => {
            dropdown.innerHTML += `<option value="${p.id}">${p.name}${p.number ? ' #' + p.number : ''}</option>`;
        });

        // Hide dropdown if everyone is already selected
        dropdown.closest('.squad-add-row').style.display = available.length ? 'flex' : 'none';
    },

    addFromRosterDropdown() {
        const dropdown = document.getElementById('squad-add-dropdown');
        const playerId = dropdown.value;
        if (!playerId) return;
        this._selectedSquadIds.add(playerId);
        dropdown.value = '';
        this.renderSquadPicker();
    },

    deselectSquadPlayer(playerId) {
        this._selectedSquadIds.delete(playerId);
        this.renderSquadPicker();
    },

    proceedToLineup() {
        const teamName = this.clubInfo ? this.clubInfo.name : 'Team';
        const opposition = document.getElementById('setup-opposition').value.trim();
        const selectedPlayers = this.squad.filter(p => this._selectedSquadIds.has(p.id));

        if (!opposition) { this.toast('Enter opposition name', 'error'); return; }
        if (selectedPlayers.length < 7) { this.toast(`Select at least 7 players (${selectedPlayers.length} selected)`, 'error'); return; }

        // Save lineup for next time
        this.saveLastLineup({ playerIds: [...this._selectedSquadIds] });

        // Store setup data — use persistent player IDs
        this.setupTeamName = teamName;
        this.setupPlayers = selectedPlayers.map(p => ({ ...p }));
        this.setupOpposition = opposition;
        this.setupDate = document.getElementById('setup-date').value;
        this.setupVenue = document.getElementById('setup-venue').value.trim();
        this.setupCompetition = document.getElementById('setup-competition').value.trim();
        this.setupQuarterLength = parseInt(document.getElementById('setup-quarter-length').value);

        // Auto-assign first 7 players to positions
        this.lineup = {};
        this.POSITIONS.forEach((pos, i) => {
            if (i < this.setupPlayers.length) {
                const player = this.setupPlayers[i];
                this.lineup[pos] = player;
                document.getElementById('lineup-' + pos).textContent = player.name;
                document.querySelector(`.position-slot[data-pos="${pos}"]`).classList.add('assigned');
            } else {
                document.getElementById('lineup-' + pos).textContent = 'Tap to assign';
                document.querySelector(`.position-slot[data-pos="${pos}"]`).classList.remove('assigned');
            }
        });

        this.showView('view-lineup');
    },

    // ==========================================
    // LINEUP SELECTION
    // ==========================================
    lineup: {},
    selectedPosition: null,

    selectPosition(pos) {
        this.selectedPosition = pos;
        const picker = document.getElementById('player-picker');
        const title = document.getElementById('picker-title');
        const grid = document.getElementById('picker-players');

        title.textContent = `Select player for ${pos}`;

        // Show available players (not already assigned to another position)
        const assignedIds = new Set(Object.values(this.lineup).map(p => p.id));

        grid.innerHTML = this.setupPlayers.map(player => {
            const taken = assignedIds.has(player.id) && !(this.lineup[pos] && this.lineup[pos].id === player.id);
            return `<button class="picker-player ${taken ? 'taken' : ''}"
                onclick="${taken ? '' : `App.assignPlayer(${player.id})`}"
                ${taken ? 'disabled' : ''}>
                ${player.name}
            </button>`;
        }).join('');

        picker.classList.remove('hidden');
    },

    assignPlayer(playerId) {
        const player = this.setupPlayers.find(p => p.id === playerId);
        if (!player || !this.selectedPosition) return;

        // Remove player from any other position
        Object.keys(this.lineup).forEach(pos => {
            if (this.lineup[pos] && this.lineup[pos].id === playerId && pos !== this.selectedPosition) {
                delete this.lineup[pos];
                document.getElementById('lineup-' + pos).textContent = 'Tap to assign';
                document.querySelector(`.position-slot[data-pos="${pos}"]`).classList.remove('assigned');
            }
        });

        this.lineup[this.selectedPosition] = player;
        document.getElementById('lineup-' + this.selectedPosition).textContent = player.name;
        document.querySelector(`.position-slot[data-pos="${this.selectedPosition}"]`).classList.add('assigned');

        this.closePlayerPicker();
    },

    closePlayerPicker() {
        document.getElementById('player-picker').classList.add('hidden');
        this.selectedPosition = null;
    },

    // ==========================================
    // START MATCH
    // ==========================================
    startMatch() {
        const filled = this.POSITIONS.filter(pos => this.lineup[pos]);
        if (filled.length < 7) {
            this.toast(`Assign all 7 positions (${filled.length}/7 done)`, 'error');
            return;
        }

        // Create match object
        this.match = {
            id: Date.now(),
            date: this.setupDate,
            venue: this.setupVenue,
            competition: this.setupCompetition,
            homeTeam: this.setupTeamName,
            awayTeam: this.setupOpposition,
            quarterLength: this.setupQuarterLength,
            trackingLevel: this.trackingLevel,
            players: this.setupPlayers,
            homeScore: 0,
            awayScore: 0,
            quarter: 1,
            quarterScores: [{ home: 0, away: 0 }, { home: 0, away: 0 }, { home: 0, away: 0 }, { home: 0, away: 0 }],
            // Current court: { pos: player }
            court: {},
            // Per-quarter lineups for court time tracking
            quarterLineups: [{}],
            // All events
            events: [],
            // Per-player stat accumulators { playerId: { goal: N, miss: N, ... } }
            playerStats: {},
            // Court time tracking: { playerId: seconds }
            courtTime: {},
            // Track who was on court at start of current timing segment
            _courtOnSince: {},
        };

        // Copy lineup to match court
        this.POSITIONS.forEach(pos => {
            this.match.court[pos] = { ...this.lineup[pos], position: pos };
        });
        this.match.quarterLineups[0] = { ...this.match.court };

        // Init player stats and court time
        this.setupPlayers.forEach(p => {
            this.match.playerStats[p.id] = {};
            this.match.courtTime[p.id] = 0;
        });

        // Mark starting 7 as on court from now
        const now = Date.now();
        this.POSITIONS.forEach(pos => {
            const p = this.match.court[pos];
            if (p) this.match._courtOnSince[p.id] = now;
        });

        // Reset timer
        this.timerSeconds = this.match.quarterLength * 60;
        this.timerRunning = false;
        if (this.timerInterval) clearInterval(this.timerInterval);

        // Update UI
        document.getElementById('match-home-name').textContent = this.match.homeTeam;
        document.getElementById('match-away-name').textContent = this.match.awayTeam;
        this.updateScoreDisplay();
        this.updateTimerDisplay();
        this.updateQuarterDisplay();
        this.renderCourtPlayers();
        this.cancelPlayerSelection();

        this.showView('view-match');
        this.addSystemEvent('Match started - Q1');
    },

    // ==========================================
    // SCOREBOARD & TIMER
    // ==========================================
    updateScoreDisplay() {
        document.getElementById('match-home-score').textContent = this.match.homeScore;
        document.getElementById('match-away-score').textContent = this.match.awayScore;
    },

    updateTimerDisplay() {
        const mins = Math.floor(this.timerSeconds / 60);
        const secs = this.timerSeconds % 60;
        document.getElementById('match-timer').textContent =
            `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    updateQuarterDisplay() {
        document.getElementById('match-quarter').textContent = `Q${this.match.quarter}`;
    },

    toggleTimer() {
        if (this.timerRunning) {
            this.pauseTimer();
        } else {
            this.startTimer();
        }
    },

    startTimer() {
        if (this.timerRunning) return;
        this.timerRunning = true;
        this._timerTicks = 0;
        document.getElementById('match-timer').style.color = '#10B981';
        this.timerInterval = setInterval(() => {
            if (this.timerSeconds > 0) {
                this.timerSeconds--;
                this.updateTimerDisplay();
                // Sync timer to Firebase every 15 seconds
                this._timerTicks++;
                if (this._timerTicks % 15 === 0) this.syncLive();
            } else {
                this.pauseTimer();
                this.toast('Quarter time!', 'success');
            }
        }, 1000);
    },

    pauseTimer() {
        this.timerRunning = false;
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        document.getElementById('match-timer').style.color = '#fff';
    },

    getMatchTime() {
        const elapsed = (this.match.quarterLength * 60) - this.timerSeconds;
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    // ==========================================
    // QUARTER MANAGEMENT
    // ==========================================
    nextQuarter() {
        if (this.match.quarter >= 4) {
            this.showQuarterComment(4, () => this.endMatch());
            return;
        }
        const fromQ = this.match.quarter;
        this.showQuarterComment(fromQ, () => {
            this.pauseTimer();
            this.match.quarter++;
            this.timerSeconds = this.match.quarterLength * 60;
            this.match.quarterLineups.push({ ...this.match.court });
            this.updateTimerDisplay();
            this.updateQuarterDisplay();
            this.cancelPlayerSelection();
            this.addSystemEvent(`Q${this.match.quarter} started`);

            if (this.match.quarter >= 4) {
                document.getElementById('btn-quarter').textContent = 'Full Time';
            }
        });
    },

    showQuarterComment(quarter, callback) {
        const label = quarter >= 4 ? 'Full Time' : `End Q${quarter}`;
        const dialog = document.getElementById('confirm-dialog');
        const msg = document.getElementById('confirm-message');
        msg.innerHTML = `<strong>${label}</strong><br>
            <textarea id="quarter-comment" placeholder="Optional comment for live feed..."
            style="width:100%;margin-top:0.5rem;padding:0.5rem;border:1.5px solid var(--border-strong);
            border-radius:var(--radius-xs);background:var(--bg);color:var(--text);
            font-family:var(--font);font-size:0.85rem;resize:none;min-height:60px"></textarea>`;
        dialog.classList.remove('hidden');
        this._confirmCallback = (confirmed) => {
            if (!confirmed) return;
            const comment = document.getElementById('quarter-comment').value.trim();
            if (comment) {
                if (!this.match.quarterComments) this.match.quarterComments = {};
                this.match.quarterComments[quarter] = comment;
                this.addSystemEvent(`Q${quarter} comment: ${comment}`);
            }
            callback();
        };
    },

    abandonMatch() {
        this.showConfirm('Abandon this match? Data will be lost.', confirmed => {
            if (!confirmed) return;
            this.pauseTimer();
            this.match = null;
            this.selectedMatchPlayer = null;
            this.clearMatchState();
            if (this.useFirebase) DB.clearLiveMatch().catch(console.error);
            this.showView('view-home');
            this.toast('Match abandoned', 'success');
        });
    },

    accumulateCourtTime(playerId) {
        if (!this.match || !this.match._courtOnSince[playerId]) return;
        const elapsed = Math.floor((Date.now() - this.match._courtOnSince[playerId]) / 1000);
        this.match.courtTime[playerId] = (this.match.courtTime[playerId] || 0) + elapsed;
    },

    finalizeCourtTime() {
        if (!this.match) return;
        // Accumulate time for everyone still on court
        Object.keys(this.match._courtOnSince).forEach(pid => {
            this.accumulateCourtTime(parseInt(pid));
        });
        this.match._courtOnSince = {};
    },

    endMatch() {
        this.pauseTimer();
        this.finalizeCourtTime();
        this.addSystemEvent('Full time');

        // Save match to history
        const saved = {
            id: this.match.id,
            date: this.match.date,
            venue: this.match.venue,
            competition: this.match.competition,
            homeTeam: this.match.homeTeam,
            awayTeam: this.match.awayTeam,
            homeScore: this.match.homeScore,
            awayScore: this.match.awayScore,
            quarterScores: this.match.quarterScores,
            players: this.match.players,
            playerStats: this.match.playerStats,
            courtTime: this.match.courtTime,
            cpToGoal: this.match.cpToGoal || 0,
            toToGoal: this.match.toToGoal || 0,
            quarterComments: this.match.quarterComments || {},
            events: this.match.events,
            trackingLevel: this.match.trackingLevel,
            quarterLength: this.match.quarterLength,
        };
        this.matches.unshift(saved);
        this.saveMatches();

        // Clear live match state
        this.clearMatchState();
        if (this.useFirebase) {
            DB.clearLiveMatch().catch(console.error);
        }

        this.viewMatchSummary(0);
    },

    // ==========================================
    // PLAYER LIST (left column)
    // ==========================================
    ZONE_MAP: { GS: 'attack', GA: 'attack', WA: 'centre', C: 'centre', WD: 'centre', GD: 'defence', GK: 'defence' },

    renderCourtPlayers() {
        const container = document.getElementById('col-players');
        const courtIds = new Set();

        // On-court players grouped by position order
        let html = '';
        this.POSITIONS.forEach(pos => {
            const player = this.match.court[pos];
            if (!player) return;
            courtIds.add(player.id);
            const stats = this.match.playerStats[player.id] || {};
            const statLine = this.getPlayerStatLine(stats, pos);
            const zone = this.ZONE_MAP[pos];
            const selected = this.selectedMatchPlayer && this.selectedMatchPlayer.id === player.id;
            html += `<div class="player-btn zone-${zone} ${selected ? 'selected' : ''}"
                data-player-id="${player.id}" data-pos="${pos}"
                onclick="App.selectMatchPlayer(${player.id}, '${pos}')">
                <span class="pb-pos">${pos}</span>
                <span class="pb-name">${player.name}</span>
                <span class="pb-stat">${statLine}</span>
            </div>`;
        });

        container.innerHTML = html;
    },

    getPlayerStatLine(stats, pos) {
        const parts = [];
        if (this.SHOOTING_POSITIONS.includes(pos)) {
            const goals = stats.goal || 0;
            const misses = stats.miss || 0;
            const attempts = goals + misses;
            if (attempts > 0) parts.push(`${goals}/${attempts}`);
        }
        if (stats.intercept) parts.push(`I${stats.intercept}`);
        if (stats.turnover) parts.push(`T${stats.turnover}`);
        return parts.join(' ');
    },

    // ==========================================
    // PLAYER SELECTION & ACTION RENDERING
    // ==========================================
    selectMatchPlayer(playerId, pos) {
        if (isNaN(playerId)) return;

        // Toggle off if already selected
        if (this.selectedMatchPlayer && this.selectedMatchPlayer.id === playerId) {
            this.cancelPlayerSelection();
            return;
        }

        this.selectedMatchPlayer = { id: playerId, pos };
        const player = this.match.players.find(p => p.id === playerId);

        // Highlight selected
        document.querySelectorAll('.player-btn').forEach(b => {
            b.classList.toggle('selected', parseInt(b.dataset.playerId) === playerId);
        });

        // Update ticker
        document.getElementById('last-event-ticker').textContent =
            `Selected: ${pos || 'SUB'} ${player.name}`;

        // Render action buttons for this position
        this.renderActionButtons(pos);
    },

    // Action categories
    SHOOTING_ACTIONS: ['goal', 'miss'],
    POSITIVE_ACTIONS: ['centre_pass', 'feed', 'intercept', 'deflection', 'rebound', 'pickup'],
    NEGATIVE_ACTIONS: ['turnover', 'unforced_error', 'not_received', 'footwork', 'offside', 'penalty_contact', 'penalty_obstruction'],

    renderActionButtons(pos) {
        const actions = this.trackingLevel === 'basic' ? this.ACTIONS_BASIC : this.ACTIONS_DETAILED;
        const shootEl = document.getElementById('actions-shooting');
        const posEl = document.getElementById('actions-positive');
        const negEl = document.getElementById('actions-negative');

        const available = pos
            ? actions.filter(a => !a.positions || a.positions.includes(pos))
            : actions;
        const disabled = !pos;

        const renderGroup = (keys) => {
            return available.filter(a => keys.includes(a.key))
                .map(a => `<button class="action-btn ${a.css} ${disabled ? 'disabled' : ''}"
                    ${disabled ? 'disabled' : `onclick="App.recordAction('${a.key}')"`}>
                    <span class="action-icon">${a.icon}</span> ${a.label}
                </button>`).join('');
        };

        shootEl.innerHTML = renderGroup(this.SHOOTING_ACTIONS) ||
            `<button class="action-btn action-goal disabled" disabled><span class="action-icon">&#9917;</span> Goal</button>
             <button class="action-btn action-miss disabled" disabled><span class="action-icon">&#10060;</span> Miss</button>`;
        posEl.innerHTML = renderGroup(this.POSITIVE_ACTIONS);
        negEl.innerHTML = renderGroup(this.NEGATIVE_ACTIONS);
    },

    cancelPlayerSelection() {
        this.selectedMatchPlayer = null;
        document.querySelectorAll('.player-btn').forEach(b => b.classList.remove('selected'));
        document.getElementById('last-event-ticker').textContent = 'Tap a player, then tap an action';
        this.renderActionButtons(null);
    },

    // ==========================================
    // RECORD EVENTS
    // ==========================================
    recordAction(actionKey) {
        if (!this.selectedMatchPlayer) return;
        const { id, pos } = this.selectedMatchPlayer;
        const player = this.match.players.find(p => p.id === id);

        // Increment stat
        if (!this.match.playerStats[id]) this.match.playerStats[id] = {};
        this.match.playerStats[id][actionKey] = (this.match.playerStats[id][actionKey] || 0) + 1;

        // Handle goal scoring + possession tracking
        if (actionKey === 'goal') {
            this.match.homeScore++;
            this.match.quarterScores[this.match.quarter - 1].home++;
            this.updateScoreDisplay();

            // Track CP to goal / TO to goal
            if (!this.match.cpToGoal) this.match.cpToGoal = 0;
            if (!this.match.toToGoal) this.match.toToGoal = 0;
            const recentEvents = this.match.events.slice(-10);
            for (let i = recentEvents.length - 1; i >= 0; i--) {
                const e = recentEvents[i];
                if (e.team !== 'home') continue;
                if (e.action === 'centre_pass') { this.match.cpToGoal++; break; }
                if (e.action === 'intercept' || e.action === 'turnover' || e.action === 'rebound' || e.action === 'deflection' || e.action === 'pickup') { this.match.toToGoal++; break; }
                if (e.action === 'opp_goal' || e.action === 'system') break;
            }
        }

        // Create event
        const event = {
            id: Date.now(),
            quarter: this.match.quarter,
            time: this.getMatchTime(),
            playerId: id,
            playerName: player.name,
            position: pos,
            action: actionKey,
            team: 'home',
        };
        this.match.events.push(event);
        this.renderCourtPlayers();

        // Update undo button
        document.getElementById('btn-undo').disabled = false;

        // Flash ticker with feedback - stay on same player for rapid entry
        this.showTicker(`${pos} ${player.name}: ${actionKey.replace(/_/g, ' ')}`);
    },

    recordAwayGoal() {
        this.match.awayScore++;
        this.match.quarterScores[this.match.quarter - 1].away++;
        this.updateScoreDisplay();

        const event = {
            id: Date.now(),
            quarter: this.match.quarter,
            time: this.getMatchTime(),
            playerId: null,
            playerName: this.match.awayTeam,
            position: null,
            action: 'opp_goal',
            team: 'away',
        };
        this.match.events.push(event);
        document.getElementById('btn-undo').disabled = false;
        this.showTicker(`${this.match.awayTeam} scored`);
    },

    showTicker(message) {
        const ticker = document.getElementById('last-event-ticker');
        ticker.textContent = message;
        ticker.classList.remove('flash');
        void ticker.offsetWidth; // force reflow
        ticker.classList.add('flash');

        // Sync live match to Firebase for viewers
        this.syncLive(message);
    },

    syncLive(lastEvent) {
        if (!this.match) return;
        this.match.lastEvent = lastEvent || '';
        this.match.timerSeconds = this.timerSeconds;
        this.match.status = 'live';
        this.match.statistician = this.statisticianName || null;

        // Always save locally so refresh doesn't lose data
        this.saveMatchState();

        if (this.useFirebase) {
            DB.saveLiveMatch(this.match).catch(e => console.error('Live sync error:', e));
        }
    },

    // Save/restore live match state for browser refresh survival
    saveMatchState() {
        if (!this.match) return;
        const state = {
            match: this.match,
            timerSeconds: this.timerSeconds,
            timerRunning: this.timerRunning,
            trackingLevel: this.trackingLevel,
        };
        localStorage.setItem(this.getStorageKey('live_match'), JSON.stringify(state));
    },

    clearMatchState() {
        localStorage.removeItem(this.getStorageKey('live_match'));
    },

    restoreMatchState() {
        try {
            const json = localStorage.getItem(this.getStorageKey('live_match'));
            if (!json) return false;
            const state = JSON.parse(json);
            if (!state.match || !state.match.id) return false;

            this.match = state.match;
            this.timerSeconds = state.timerSeconds || 0;
            this.trackingLevel = state.trackingLevel || 'basic';

            // Restore UI
            document.getElementById('match-home-name').textContent = this.match.homeTeam;
            document.getElementById('match-away-name').textContent = this.match.awayTeam;
            this.updateScoreDisplay();
            this.updateTimerDisplay();
            this.updateQuarterDisplay();
            this.renderCourtPlayers();
            this.cancelPlayerSelection();

            if (this.match.quarter >= 4) {
                document.getElementById('btn-quarter').textContent = 'Full Time';
            }

            // Resume timer if it was running
            if (state.timerRunning) {
                this.startTimer();
            }

            this.showView('view-match');
            this.showTicker('Match restored');
            return true;
        } catch (e) {
            console.error('Failed to restore match:', e);
            return false;
        }
    },

    // ==========================================
    // UNDO
    // ==========================================
    undoLastEvent() {
        if (!this.match || !this.match.events.length) return;
        const last = this.match.events.pop();

        // Reverse stat
        if (last.team === 'home' && last.playerId !== null) {
            const stats = this.match.playerStats[last.playerId];
            if (stats && stats[last.action]) {
                stats[last.action]--;
                if (stats[last.action] <= 0) delete stats[last.action];
            }
        }

        // Reverse score
        if (last.action === 'goal') {
            this.match.homeScore = Math.max(0, this.match.homeScore - 1);
            this.match.quarterScores[this.match.quarter - 1].home =
                Math.max(0, this.match.quarterScores[this.match.quarter - 1].home - 1);
            this.updateScoreDisplay();
        } else if (last.action === 'opp_goal') {
            this.match.awayScore = Math.max(0, this.match.awayScore - 1);
            this.match.quarterScores[this.match.quarter - 1].away =
                Math.max(0, this.match.quarterScores[this.match.quarter - 1].away - 1);
            this.updateScoreDisplay();
        }

        this.renderCourtPlayers();
        document.getElementById('btn-undo').disabled = !this.match.events.length;
        this.showTicker('Undone');
    },

    // ==========================================
    // EVENT FEED (data only during match, rendered in summary)
    // ==========================================
    addSystemEvent(message) {
        const event = {
            id: Date.now(),
            quarter: this.match ? this.match.quarter : 0,
            time: this.match ? this.getMatchTime() : '',
            playerId: null,
            playerName: message,
            position: null,
            action: 'system',
            team: null,
        };
        if (this.match) this.match.events.push(event);
        this.showTicker(message);
    },

    // ==========================================
    // SUBSTITUTIONS
    // ==========================================
    showSubstitution() {
        this.cancelPlayerSelection();
        this.subState = { playerOff: null, playerOn: null, newPos: null };
        document.getElementById('match-subs').classList.remove('hidden');

        // Players on court
        const onCourt = document.getElementById('subs-on-court');
        onCourt.innerHTML = this.POSITIONS.map(pos => {
            const p = this.match.court[pos];
            if (!p) return '';
            return `<button class="sub-btn" data-id="${p.id}" data-pos="${pos}"
                onclick="App.selectSubOff(${p.id}, '${pos}')">
                ${pos}: ${p.name}
            </button>`;
        }).join('');

        // Bench players (not on court)
        const courtIds = new Set(this.POSITIONS.map(pos => this.match.court[pos]?.id).filter(Boolean));
        const bench = document.getElementById('subs-bench');
        const benchPlayers = this.match.players.filter(p => !courtIds.has(p.id));
        if (benchPlayers.length) {
            bench.innerHTML = benchPlayers.map(p =>
                `<button class="sub-btn" data-id="${p.id}"
                    onclick="App.selectSubOn(${p.id})">
                    ${p.name}
                </button>`
            ).join('');
        } else {
            bench.innerHTML = '<span style="color:var(--text-dim);font-size:0.8rem">No bench players</span>';
        }

        // Position buttons
        const posGrid = document.getElementById('subs-positions');
        posGrid.innerHTML = this.POSITIONS.map(pos =>
            `<button class="sub-btn" data-pos="${pos}" onclick="App.selectSubPos('${pos}')">${pos}</button>`
        ).join('');

        document.getElementById('btn-confirm-sub').disabled = true;
    },

    selectSubOff(playerId, pos) {
        this.subState.playerOff = { id: playerId, pos };
        this.subState.newPos = pos; // default to same position
        document.querySelectorAll('#subs-on-court .sub-btn').forEach(btn => {
            btn.classList.toggle('selected', parseInt(btn.dataset.id) === playerId);
        });
        // Pre-select position
        document.querySelectorAll('#subs-positions .sub-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.pos === pos);
        });
        this.updateSubConfirm();
    },

    selectSubOn(playerId) {
        this.subState.playerOn = { id: playerId };
        document.querySelectorAll('#subs-bench .sub-btn').forEach(btn => {
            btn.classList.toggle('selected', parseInt(btn.dataset.id) === playerId);
        });
        this.updateSubConfirm();
    },

    selectSubPos(pos) {
        this.subState.newPos = pos;
        document.querySelectorAll('#subs-positions .sub-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.pos === pos);
        });
        this.updateSubConfirm();
    },

    updateSubConfirm() {
        const canConfirm = this.subState.playerOff && this.subState.playerOn && this.subState.newPos;
        document.getElementById('btn-confirm-sub').disabled = !canConfirm;
    },

    confirmSub() {
        const { playerOff, playerOn, newPos } = this.subState;
        if (!playerOff || !playerOn || !newPos) return;

        const offPlayer = this.match.players.find(p => p.id === playerOff.id);
        const onPlayer = this.match.players.find(p => p.id === playerOn.id);

        // Update court time: player going off
        this.accumulateCourtTime(playerOff.id);
        delete this.match._courtOnSince[playerOff.id];

        // Remove the player going off from their current position
        delete this.match.court[playerOff.pos];

        // Place the incoming player at the new position
        this.match.court[newPos] = { ...onPlayer, position: newPos };

        // Start tracking court time for player coming on
        this.match._courtOnSince[playerOn.id] = Date.now();

        this.addSystemEvent(`Sub: ${onPlayer.name} on (${newPos}), ${offPlayer.name} off`);
        this.renderCourtPlayers();
        this.closeSubs();
        this.toast(`${onPlayer.name} on for ${offPlayer.name}`, 'success');
    },

    closeSubs() {
        document.getElementById('match-subs').classList.add('hidden');
    },

    // ==========================================
    // POSITION SWAPS (on-court only)
    // ==========================================
    _swapSelection: [],

    showSwapPositions() {
        this.cancelPlayerSelection();
        this._swapSelection = [];
        const grid = document.getElementById('swap-players');
        grid.innerHTML = this.POSITIONS.map(pos => {
            const p = this.match.court[pos];
            if (!p) return '';
            return `<button class="sub-btn" data-pos="${pos}" data-id="${p.id}"
                onclick="App.selectSwapPlayer('${pos}')">${pos}: ${p.name}</button>`;
        }).join('');
        document.getElementById('btn-confirm-swap').disabled = true;
        document.getElementById('match-swap').classList.remove('hidden');
    },

    selectSwapPlayer(pos) {
        const idx = this._swapSelection.indexOf(pos);
        if (idx >= 0) {
            this._swapSelection.splice(idx, 1);
        } else if (this._swapSelection.length < 2) {
            this._swapSelection.push(pos);
        }
        document.querySelectorAll('#swap-players .sub-btn').forEach(btn => {
            btn.classList.toggle('selected', this._swapSelection.includes(btn.dataset.pos));
        });
        document.getElementById('btn-confirm-swap').disabled = this._swapSelection.length !== 2;
    },

    confirmSwap() {
        if (this._swapSelection.length !== 2) return;
        const [posA, posB] = this._swapSelection;
        const playerA = this.match.court[posA];
        const playerB = this.match.court[posB];

        // Swap positions
        this.match.court[posA] = { ...playerB, position: posA };
        this.match.court[posB] = { ...playerA, position: posB };

        this.addSystemEvent(`Swap: ${playerA.name} to ${posB}, ${playerB.name} to ${posA}`);
        this.renderCourtPlayers();
        this.closeSwap();
        this.toast(`${playerA.name} ↔ ${playerB.name}`, 'success');
    },

    closeSwap() {
        document.getElementById('match-swap').classList.add('hidden');
        this._swapSelection = [];
    },

    // ==========================================
    // MATCH SUMMARY
    // ==========================================
    viewMatchSummary(index) {
        const m = this.matches[index];
        if (!m) return;
        this._summaryMatch = m;

        // Render scoreboard
        const sb = document.getElementById('summary-scoreboard');
        sb.innerHTML = `
            <div class="final-label">Full Time</div>
            <div class="final-score">${m.homeScore} - ${m.awayScore}</div>
            <div class="final-teams">${m.homeTeam} vs ${m.awayTeam}</div>
            <div class="final-detail">${m.date || ''}${m.venue ? ' | ' + m.venue : ''}${m.competition ? ' | ' + m.competition : ''}</div>
        `;

        this.showSummaryTab('team');
        this.showView('view-summary');
    },

    showSummaryTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.textContent.toLowerCase() === tab);
        });
        const m = this._summaryMatch;
        const content = document.getElementById('summary-content');

        switch (tab) {
            case 'team':
                content.innerHTML = this.renderTeamSummary(m);
                break;
            case 'players':
                content.innerHTML = this.renderPlayerSummary(m);
                break;
            case 'quarters':
                content.innerHTML = this.renderQuarterSummary(m);
                break;
            case 'timeline':
                content.innerHTML = this.renderTimelineSummary(m);
                break;
        }
    },

    renderTeamSummary(m) {
        const allStats = {};
        Object.values(m.playerStats).forEach(ps => {
            Object.entries(ps).forEach(([k, v]) => {
                allStats[k] = (allStats[k] || 0) + v;
            });
        });

        const goals = allStats.goal || 0;
        const misses = allStats.miss || 0;
        const attempts = goals + misses;
        const pct = attempts > 0 ? Math.round((goals / attempts) * 100) : 0;

        const rows = [
            ['Goals', goals],
            ['Shots', `${goals}/${attempts} (${pct}%)`],
            ['Centre Passes', allStats.centre_pass || 0],
            ['Intercepts', allStats.intercept || 0],
            ['Turnovers', allStats.turnover || 0],
            ['Rebounds', allStats.rebound || 0],
        ];

        if (m.trackingLevel === 'detailed') {
            rows.push(
                ['Feeds', allStats.feed || 0],
                ['Assists', allStats.assist || 0],
                ['Deflections', allStats.deflection || 0],
                ['Pickups', allStats.pickup || 0],
                ['Contact Pen.', allStats.penalty_contact || 0],
                ['Obstruction Pen.', allStats.penalty_obstruction || 0],
            );
        }

        return `<table class="stats-table">
            <thead><tr><th>Stat</th><th>${m.homeTeam}</th></tr></thead>
            <tbody>${rows.map(([label, val]) =>
                `<tr><td>${label}</td><td>${val}</td></tr>`
            ).join('')}</tbody>
        </table>`;
    },

    renderPlayerSummary(m) {
        const cols = m.trackingLevel === 'basic'
            ? ['G', 'Sh%', 'CP', 'Int', 'TO', 'Reb']
            : ['G', 'Sh%', 'Feed', 'Ast', 'CP', 'Int', 'Defl', 'TO', 'Reb', 'PU', 'Pen'];

        const header = `<tr><th>Player</th>${cols.map(c => `<th>${c}</th>`).join('')}</tr>`;

        const rows = m.players.map(p => {
            const s = m.playerStats[p.id] || {};
            const goals = s.goal || 0;
            const misses = s.miss || 0;
            const attempts = goals + misses;
            const pct = attempts > 0 ? Math.round((goals / attempts) * 100) + '%' : '-';

            let cells;
            if (m.trackingLevel === 'basic') {
                cells = [goals || '-', pct, s.centre_pass || '-', s.intercept || '-', s.turnover || '-', s.rebound || '-'];
            } else {
                cells = [goals || '-', pct, s.feed || '-', s.assist || '-', s.centre_pass || '-',
                    s.intercept || '-', s.deflection || '-', s.turnover || '-', s.rebound || '-',
                    s.pickup || '-', ((s.penalty_contact || 0) + (s.penalty_obstruction || 0)) || '-'];
            }

            // Highlight if player has any stats
            const hasStats = Object.keys(s).length > 0;
            return `<tr${hasStats ? '' : ' style="opacity:0.5"'}>
                <td>${p.name}</td>${cells.map(c => `<td>${c}</td>`).join('')}
            </tr>`;
        });

        return `<div style="overflow-x:auto"><table class="stats-table">
            <thead>${header}</thead>
            <tbody>${rows.join('')}</tbody>
        </table></div>`;
    },

    renderQuarterSummary(m) {
        const cards = m.quarterScores.map((qs, i) => `
            <div class="quarter-card">
                <div class="qc-label">Q${i + 1}</div>
                <div class="qc-score">${qs.home} - ${qs.away}</div>
            </div>
        `).join('');

        // Running totals
        let homeRun = 0, awayRun = 0;
        const running = m.quarterScores.map((qs, i) => {
            homeRun += qs.home;
            awayRun += qs.away;
            return `<tr><td>After Q${i + 1}</td><td>${homeRun}</td><td>${awayRun}</td></tr>`;
        }).join('');

        return `
            <div class="quarter-scores">${cards}</div>
            <table class="stats-table">
                <thead><tr><th></th><th>${m.homeTeam}</th><th>${m.awayTeam}</th></tr></thead>
                <tbody>${running}</tbody>
            </table>
        `;
    },

    renderTimelineSummary(m) {
        if (!m.events.length) return '<p class="empty-state">No events recorded</p>';
        return `<div class="event-list" style="max-height:none">
            ${m.events.map(e => {
                let css = 'event-system', icon = '&#9654;', text = '';
                if (e.action === 'goal') { css = 'event-goal'; icon = '&#9917;'; text = `<strong>${e.playerName}</strong> scored`; }
                else if (e.action === 'miss') { css = 'event-miss'; icon = '&#10060;'; text = `<strong>${e.playerName}</strong> missed`; }
                else if (e.action === 'opp_goal') { css = 'event-opp'; icon = '&#9917;'; text = `<strong>${e.playerName}</strong> scored`; }
                else if (e.action === 'system') { css = 'event-system'; icon = '&#8505;'; text = e.playerName; }
                else { text = `<strong>${e.playerName}</strong> ${e.action.replace(/_/g, ' ')}`; }
                return `<div class="event-item ${css}">
                    <span class="event-time">Q${e.quarter} ${e.time || ''}</span>
                    <span class="event-icon">${icon}</span>
                    <span class="event-text">${text}</span>
                </div>`;
            }).join('')}
        </div>`;
    },

    // ==========================================
    // EXPORT
    // ==========================================
    exportMatch() {
        const m = this._summaryMatch;
        if (!m) return;

        const statKeys = m.trackingLevel === 'basic'
            ? ['goal', 'miss', 'centre_pass', 'intercept', 'turnover', 'rebound']
            : ['goal', 'miss', 'feed', 'assist', 'centre_pass', 'intercept', 'deflection', 'turnover', 'rebound', 'pickup', 'penalty_contact', 'penalty_obstruction'];

        let csv = `NetballStats Export\n`;
        csv += `${m.homeTeam} vs ${m.awayTeam}\n`;
        csv += `Score: ${m.homeScore} - ${m.awayScore}\n`;
        csv += `Date: ${m.date || ''}, Venue: ${m.venue || ''}, Competition: ${m.competition || ''}\n\n`;
        csv += `Player,Number,${statKeys.map(k => k.replace(/_/g, ' ')).join(',')}\n`;

        m.players.forEach(p => {
            const s = m.playerStats[p.id] || {};
            csv += `${p.name},${p.number || ''},${statKeys.map(k => s[k] || 0).join(',')}\n`;
        });

        csv += `\nQuarter Scores\n`;
        csv += `Quarter,${m.homeTeam},${m.awayTeam}\n`;
        m.quarterScores.forEach((qs, i) => {
            csv += `Q${i + 1},${qs.home},${qs.away}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${m.homeTeam}_vs_${m.awayTeam}_${m.date || 'match'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.toast('CSV exported!', 'success');
    },

    shareMatch() {
        const m = this._summaryMatch;
        if (!m) return;
        const text = this.buildSummaryText(m);

        if (navigator.share) {
            navigator.share({ title: 'Match Result', text }).catch(() => {});
        } else {
            navigator.clipboard.writeText(text).then(() => {
                this.toast('Copied to clipboard!', 'success');
            }).catch(() => {
                this.toast('Could not copy', 'error');
            });
        }
    },

    buildSummaryText(m) {
        const goals = Object.values(m.playerStats).reduce((sum, s) => sum + (s.goal || 0), 0);
        const misses = Object.values(m.playerStats).reduce((sum, s) => sum + (s.miss || 0), 0);
        const pct = (goals + misses) > 0 ? Math.round((goals / (goals + misses)) * 100) : 0;

        // Find top scorer
        let topScorer = '';
        let topGoals = 0;
        m.players.forEach(p => {
            const g = (m.playerStats[p.id] || {}).goal || 0;
            if (g > topGoals) { topGoals = g; topScorer = p.name; }
        });

        let text = `${m.homeTeam} ${m.homeScore} - ${m.awayScore} ${m.awayTeam}\n`;
        text += m.quarterScores.map((qs, i) => `Q${i + 1}: ${qs.home}-${qs.away}`).join(' | ') + '\n';
        text += `Shooting: ${goals}/${goals + misses} (${pct}%)\n`;
        if (topScorer) text += `Top scorer: ${topScorer} (${topGoals})\n`;
        if (m.date) text += `${m.date}`;
        if (m.venue) text += ` | ${m.venue}`;
        if (m.competition) text += ` | ${m.competition}`;
        return text;
    },

    // Live URL
    getLiveUrl() {
        const base = window.location.href.replace(/\/[^/]*$/, '');
        const clubParam = this.clubId ? `?club=${this.clubId}` : '';
        return `${base}/live.html${clubParam}`;
    },

    shareLiveLink() {
        const url = this.getLiveUrl();
        const text = `Watch live: ${this.match.homeTeam} vs ${this.match.awayTeam}\n${url}`;
        if (navigator.share) {
            navigator.share({ title: 'Watch Live', text, url }).catch(() => {});
        } else {
            this.openWhatsApp(text);
        }
    },

    // WhatsApp sharing
    openWhatsApp(text) {
        const encoded = encodeURIComponent(text);
        window.open(`https://wa.me/?text=${encoded}`, '_blank');
    },

    shareLiveToWhatsApp() {
        if (!this.match) return;
        const m = this.match;
        const elapsed = this.getMatchTime();
        let text = `${m.homeTeam} ${m.homeScore} - ${m.awayScore} ${m.awayTeam}\n`;
        text += `Q${m.quarter} | ${elapsed}\n`;

        // Quick shooting stats
        let goals = 0, misses = 0;
        Object.values(m.playerStats).forEach(s => {
            goals += s.goal || 0;
            misses += s.miss || 0;
        });
        if (goals + misses > 0) {
            text += `Shooting: ${goals}/${goals + misses} (${Math.round((goals / (goals + misses)) * 100)}%)\n`;
        }
        text += `\nWatch live: ${this.getLiveUrl()}`;

        this.openWhatsApp(text);
    },

    shareSummaryToWhatsApp() {
        const m = this._summaryMatch;
        if (!m) return;
        this.openWhatsApp(this.buildSummaryText(m));
    },

    // ==========================================
    // MATCH HISTORY
    // ==========================================
    renderHistory() {
        const container = document.getElementById('history-list');
        const empty = document.getElementById('history-empty');

        if (!this.matches.length) {
            container.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');
        container.innerHTML = this.matches.map((m, i) => {
            const won = m.homeScore > m.awayScore;
            const resultClass = won ? 'hc-win' : 'hc-loss';
            const badge = won ? '<span class="hc-badge hc-badge-w">W</span>' : '<span class="hc-badge hc-badge-l">L</span>';
            return `<div class="history-card ${resultClass}" onclick="App.viewMatchSummary(${i})">
                <div class="hc-top">
                    ${badge}
                    <span class="hc-date">${m.date || ''}${m.venue ? ' · ' + m.venue : ''}</span>
                    ${m.competition ? `<span class="hc-comp">${m.competition}</span>` : ''}
                </div>
                <div class="hc-score">${m.homeScore} - ${m.awayScore}</div>
                <div class="hc-teams">${m.homeTeam} vs ${m.awayTeam}</div>
                <div class="hc-actions">
                    <button class="btn btn-small btn-outline" onclick="event.stopPropagation(); App.viewMatchSummary(${i})">View</button>
                    <button class="btn btn-small btn-danger" onclick="event.stopPropagation(); App.deleteMatch(${i})">Delete</button>
                </div>
            </div>`;
        }).join('');
    },

    deleteMatch(index) {
        this.showConfirm('Delete this match?', confirmed => {
            if (confirmed) {
                const matchId = this.matches[index].id;
                this.matches.splice(index, 1);
                this.saveMatches();
                if (this.useFirebase) DB.deleteMatch(matchId).catch(console.error);
                this.renderHistory();
                this.toast('Match deleted', 'success');
            }
        });
    },

    // ==========================================
    // UI HELPERS
    // ==========================================
    toast(message, type = 'success') {
        const el = document.getElementById('toast');
        el.textContent = message;
        el.className = `toast toast-${type}`;
        el.classList.remove('hidden');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => el.classList.add('hidden'), 2500);
    },

    _confirmCallback: null,
    showConfirm(message, callback) {
        document.getElementById('confirm-message').textContent = message;
        document.getElementById('confirm-dialog').classList.remove('hidden');
        this._confirmCallback = callback;
    },

    confirmDialog(result) {
        document.getElementById('confirm-dialog').classList.add('hidden');
        if (this._confirmCallback) {
            this._confirmCallback(result);
            this._confirmCallback = null;
        }
    },
    // ==========================================
    // CLUB SELECTION & AUTH
    // ==========================================
    async seedClubs() {
        if (!this.useFirebase) return;
        try {
            const existing = await ClubDB.listClubs();
            if (existing.length >= 3) return; // already seeded

            const clubs = [
                { id: 'hatfield-u13', name: 'Hatfield U13s', subtitle: 'Purple Squad', password: 'hatfield2024' },
                { id: 'stahs-u13', name: 'STAHS U13', subtitle: 'St Albans High School', password: 'stahs2024' },
                { id: 'pulse', name: 'Pulse NC', subtitle: 'Pulse Netball Club', password: 'pulse2024' },
            ];
            for (const c of clubs) {
                const ex = await ClubDB.getClub(c.id);
                if (!ex) {
                    await ClubDB.createClub(c.id, { name: c.name, subtitle: c.subtitle, password: c.password });
                    console.log(`Seeded club: ${c.id}`);
                }
            }
        } catch (e) {
            console.error('Failed to seed clubs:', e);
        }
    },

    async loadClubList() {
        if (!this.useFirebase) return;
        try {
            const clubs = await ClubDB.listClubs();
            const container = document.getElementById('club-list');
            if (!clubs.length) {
                container.innerHTML = '<p style="color:var(--text-dim);text-align:center">No clubs set up yet. Seed the database first.</p>';
                return;
            }
            container.innerHTML = clubs.map(c => `
                <div class="club-card" onclick="App.showClubLogin('${c.id}')">
                    <div class="club-card-info">
                        <h3>${c.name || c.id}</h3>
                        <p>${c.subtitle || ''}</p>
                    </div>
                    <span class="material-symbols-outlined" style="color:var(--primary);font-size:1.2rem">chevron_right</span>
                </div>
            `).join('');
        } catch (e) {
            console.error('Failed to load clubs:', e);
        }
    },

    showClubLogin(clubId) {
        this._pendingClubId = clubId;
        document.getElementById('club-login-name').textContent = clubId;
        document.getElementById('club-password').value = '';
        document.getElementById('club-login-error').textContent = '';
        this.showView('view-club-login');
    },

    async submitClubLogin() {
        const password = document.getElementById('club-password').value;
        const clubId = this._pendingClubId;
        if (!password) { document.getElementById('club-login-error').textContent = 'Enter password'; return; }

        const valid = await ClubDB.verifyPassword(clubId, password);
        if (!valid) {
            document.getElementById('club-login-error').textContent = 'Wrong password';
            return;
        }

        await this.selectClub(clubId, false);
        this.showView('view-landing');
    },

    async selectClub(clubId, silent) {
        try {
            const club = await ClubDB.getClub(clubId);
            if (!club) { if (!silent) this.toast('Club not found', 'error'); return false; }

            this.clubId = clubId;
            this.clubInfo = club;
            DB = FirebaseModule.createClubDB(clubId);

            localStorage.setItem('netballstats_club_id', clubId);

            // Update branding
            const titleEls = document.querySelectorAll('.club-brand-name');
            titleEls.forEach(el => { el.textContent = club.name || clubId; });
            const subEls = document.querySelectorAll('.club-brand-sub');
            subEls.forEach(el => { el.textContent = club.subtitle || ''; });

            // Update links with club param
            const clubParam = `?club=${clubId}`;
            const liveLink = document.getElementById('lp-live-link');
            if (liveLink) liveLink.href = `live.html${clubParam}`;
            document.querySelectorAll('a[href*="live.html"]').forEach(a => { a.href = `live.html${clubParam}`; });
            document.querySelectorAll('a[href*="dashboard.html"]').forEach(a => { a.href = `dashboard.html${clubParam}`; });

            // Load data for this club
            await this.loadData();
            await this.loadSquad();
            this.migrateOldPlayers();
            this.seedSampleDataIfEmpty();
            this.checkLandingStatus();

            return true;
        } catch (e) {
            console.error('Club select error:', e);
            return false;
        }
    },

    switchClub() {
        localStorage.removeItem('netballstats_club_id');
        this.clubId = null;
        this.clubInfo = null;
        DB = null;
        this.teams = [];
        this.matches = [];
        this.showView('view-club-select');
        if (this.useFirebase) this.loadClubList();
    },

    // ==========================================
    // STATISTICIAN LOCK
    // ==========================================
    statisticianName: null,

    goHome() {
        if (this.match) {
            this.showConfirm('Leave recorder? A match is in progress — data may be lost.', confirmed => {
                if (confirmed) this.showView('view-landing');
            });
        } else {
            this.showView('view-landing');
        }
    },

    _recorderTarget: null,

    async enterRecorder(target) {
        this._recorderTarget = target || null;
        if (!this.useFirebase) {
            this.showView('view-home');
            return;
        }
        const lock = await DB.getStatistician();
        const myName = localStorage.getItem('netballstats_stat_name');

        if (lock && lock.active) {
            if (myName && lock.name === myName) {
                // I'm the current statistician
                this.statisticianName = myName;
                this.startInactivityTracking();
                document.getElementById('gate-available').style.display = 'none';
                document.getElementById('gate-locked').style.display = 'none';
                document.getElementById('gate-mine').style.display = '';
            } else {
                // Someone else is recording — check if stale (>5 min)
                const elapsed = Date.now() - (lock.claimedAt || 0);
                if (elapsed > this.INACTIVITY_TIMEOUT) {
                    // Stale lock — allow takeover
                    document.getElementById('gate-available').style.display = '';
                    document.getElementById('gate-locked').style.display = 'none';
                    document.getElementById('gate-mine').style.display = 'none';
                    if (myName) document.getElementById('stat-name').value = myName;
                } else {
                    document.getElementById('gate-available').style.display = 'none';
                    document.getElementById('gate-locked').style.display = '';
                    document.getElementById('gate-mine').style.display = 'none';
                    document.getElementById('gate-locked-msg').textContent =
                        `${lock.name} is currently recording stats`;
                }
            }
        } else {
            // Available
            document.getElementById('gate-available').style.display = '';
            document.getElementById('gate-locked').style.display = 'none';
            document.getElementById('gate-mine').style.display = 'none';
            if (myName) document.getElementById('stat-name').value = myName;
        }
        this.showView('view-gate');
    },

    _inactivityTimer: null,
    INACTIVITY_TIMEOUT: 5 * 60 * 1000, // 5 minutes

    _heartbeatTimer: null,

    resetInactivityTimer() {
        if (this._inactivityTimer) clearTimeout(this._inactivityTimer);
        if (!this.statisticianName) return;
        this._inactivityTimer = setTimeout(() => {
            this.toast('Released — 5 min inactive', 'error');
            this.releaseStatistician();
        }, this.INACTIVITY_TIMEOUT);
    },

    startInactivityTracking() {
        const events = ['touchstart', 'click', 'keydown'];
        events.forEach(e => {
            document.addEventListener(e, () => this.resetInactivityTimer(), { passive: true });
        });
        this.resetInactivityTimer();

        // Heartbeat: refresh claimedAt every 60s so others know we're active
        if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
        this._heartbeatTimer = setInterval(() => {
            if (this.statisticianName && this.useFirebase && DB) {
                DB.claimStatistician(this.statisticianName).catch(console.error);
            }
        }, 60000);
    },

    stopInactivityTracking() {
        if (this._inactivityTimer) {
            clearTimeout(this._inactivityTimer);
            this._inactivityTimer = null;
        }
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    },

    async claimStatistician() {
        const name = document.getElementById('stat-name').value.trim();
        if (!name) { this.toast('Enter your name', 'error'); return; }

        this.statisticianName = name;
        localStorage.setItem('netballstats_stat_name', name);

        if (this.useFirebase) {
            await DB.claimStatistician(name);
        }
        document.getElementById('stat-name-badge').textContent = name;
        this.startInactivityTracking();
        const targetView = this._recorderTarget === 'squad' ? 'view-squad' : 'view-home';
        this._recorderTarget = null;
        this.showView(targetView);
        this.toast(`Recording as ${name}`, 'success');
    },

    async releaseStatistician() {
        this.stopInactivityTracking();
        this.statisticianName = null;
        if (this.useFirebase) {
            await DB.releaseStatistician();
        }
        this.toast('Control released', 'success');
        this.showView('view-landing');
    },

    async checkLandingStatus() {
        if (!this.useFirebase || !DB) return;
        // Statistician status
        const lock = await DB.getStatistician();
        const el = document.getElementById('landing-status');
        if (lock && lock.active && lock.name) {
            el.innerHTML = `<div class="landing-stat-active">
                <span class="landing-stat-dot"></span>
                Stats by <strong>${lock.name}</strong>
            </div>`;
        } else {
            el.innerHTML = '';
        }

        // Season overview stats
        this.updateLandingStats();
    },

    updateLandingStats() {
        // Squad count on landing page
        const sqCountEl = document.getElementById('lp-squad-count');
        if (sqCountEl) sqCountEl.textContent = this.squad.length ? `${this.squad.length} players` : '';

        const statsEl = document.getElementById('lp-season-stats');
        if (!statsEl || !this.matches.length) return;

        const wins = this.matches.filter(m => m.homeScore > m.awayScore).length;
        const losses = this.matches.length - wins;
        let goalsFor = 0, goalsAgainst = 0, totalGoals = 0, totalMisses = 0;
        this.matches.forEach(m => {
            goalsFor += m.homeScore || 0;
            goalsAgainst += m.awayScore || 0;
            if (m.playerStats) {
                Object.values(m.playerStats).forEach(s => {
                    totalGoals += s.goal || 0;
                    totalMisses += s.miss || 0;
                });
            }
        });
        const pct = (totalGoals + totalMisses) > 0 ? Math.round((totalGoals / (totalGoals + totalMisses)) * 100) : 0;
        const diff = goalsFor - goalsAgainst;

        statsEl.innerHTML = `
            <div class="lp-stat"><p class="lp-stat-label">Record</p><p class="lp-stat-val">${wins}W ${losses}L</p></div>
            <div class="lp-stat"><p class="lp-stat-label">Shooting</p><p class="lp-stat-val">${pct ? pct + '%' : '-'}</p></div>
            <div class="lp-stat"><p class="lp-stat-label">Goals For</p><p class="lp-stat-val">${goalsFor || '-'}</p></div>
            <div class="lp-stat"><p class="lp-stat-label">Diff</p><p class="lp-stat-val ${diff > 0 ? 'accent' : ''}">${diff > 0 ? '+' : ''}${diff || '-'}</p></div>
        `;
    },
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
