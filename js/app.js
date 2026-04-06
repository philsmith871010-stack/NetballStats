/* ========================================
   NetballStats - Full App
   Navigation, Teams, Match Engine, Stats
   ======================================== */

const App = {
    // ---- State ----
    currentView: 'view-home',
    teams: [],
    matches: [],
    trackingLevel: 'basic',

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
    STORAGE_KEYS: {
        teams: 'netballstats_teams',
        matches: 'netballstats_matches'
    },

    // Action definitions: { key, label, icon, cssClass, positions (null=all), level }
    ACTIONS_BASIC: [
        { key: 'goal', label: 'Goal', icon: '&#9917;', css: 'action-goal', positions: ['GS', 'GA'] },
        { key: 'miss', label: 'Miss', icon: '&#10060;', css: 'action-miss', positions: ['GS', 'GA'] },
        { key: 'centre_pass', label: 'Centre Pass', icon: '&#9654;', css: 'action-neutral', positions: null },
        { key: 'intercept', label: 'Intercept', icon: '&#128170;', css: 'action-positive', positions: null },
        { key: 'turnover', label: 'Turnover', icon: '&#8635;', css: 'action-negative', positions: null },
        { key: 'rebound', label: 'Rebound', icon: '&#8593;', css: 'action-positive', positions: ['GS', 'GA', 'GK', 'GD'] },
    ],
    ACTIONS_DETAILED: [
        { key: 'goal', label: 'Goal', icon: '&#9917;', css: 'action-goal', positions: ['GS', 'GA'] },
        { key: 'miss', label: 'Miss', icon: '&#10060;', css: 'action-miss', positions: ['GS', 'GA'] },
        { key: 'feed', label: 'Feed', icon: '&#10145;', css: 'action-neutral', positions: null },
        { key: 'assist', label: 'Assist', icon: '&#127942;', css: 'action-positive', positions: null },
        { key: 'centre_pass', label: 'Centre Pass', icon: '&#9654;', css: 'action-neutral', positions: null },
        { key: 'intercept', label: 'Intercept', icon: '&#128170;', css: 'action-positive', positions: null },
        { key: 'deflection', label: 'Deflection', icon: '&#128400;', css: 'action-positive', positions: null },
        { key: 'turnover', label: 'Turnover', icon: '&#8635;', css: 'action-negative', positions: null },
        { key: 'rebound', label: 'Rebound', icon: '&#8593;', css: 'action-positive', positions: ['GS', 'GA', 'GK', 'GD'] },
        { key: 'pickup', label: 'Pickup', icon: '&#9995;', css: 'action-positive', positions: null },
        { key: 'penalty_contact', label: 'Contact', icon: '&#9888;', css: 'action-negative', positions: null },
        { key: 'penalty_obstruction', label: 'Obstruct', icon: '&#128683;', css: 'action-negative', positions: null },
    ],

    // ==========================================
    // INIT
    // ==========================================
    init() {
        this.loadData();
        this.showView('view-home');
        document.getElementById('setup-date').value = new Date().toISOString().split('T')[0];
        // Pre-populate 10 empty player rows on setup
        this.populatePlayerRows('setup-team-players', 10);
    },

    // ==========================================
    // DATA PERSISTENCE
    // ==========================================
    loadData() {
        try {
            const teamsJson = localStorage.getItem(this.STORAGE_KEYS.teams);
            if (teamsJson) this.teams = JSON.parse(teamsJson);
            const matchesJson = localStorage.getItem(this.STORAGE_KEYS.matches);
            if (matchesJson) this.matches = JSON.parse(matchesJson);
        } catch (e) {
            console.error('Failed to load data:', e);
        }
    },

    saveTeams() {
        localStorage.setItem(this.STORAGE_KEYS.teams, JSON.stringify(this.teams));
    },

    saveMatches() {
        localStorage.setItem(this.STORAGE_KEYS.matches, JSON.stringify(this.matches));
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
            case 'view-manage-teams':
                this.populatePlayerRows('manage-team-players', 10);
                this.renderSavedTeams();
                break;
            case 'view-setup-team':
                this.populateSavedTeamDropdown();
                if (!document.getElementById('setup-team-players').children.length) {
                    this.populatePlayerRows('setup-team-players', 10);
                }
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
                this.teams.splice(index, 1);
                this.saveTeams();
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

    proceedToLineup() {
        const teamName = document.getElementById('setup-team-name').value.trim();
        const opposition = document.getElementById('setup-opposition').value.trim();
        const players = this.getPlayersFromContainer('setup-team-players');

        if (!teamName) { this.toast('Enter your team name', 'error'); return; }
        if (!opposition) { this.toast('Enter opposition name', 'error'); return; }
        if (players.length < 7) { this.toast('Need at least 7 players', 'error'); return; }

        // Store setup data for match creation
        this.setupTeamName = teamName;
        this.setupPlayers = players.map((p, i) => ({ ...p, id: i }));
        this.setupOpposition = opposition;
        this.setupDate = document.getElementById('setup-date').value;
        this.setupVenue = document.getElementById('setup-venue').value.trim();
        this.setupCompetition = document.getElementById('setup-competition').value.trim();
        this.setupQuarterLength = parseInt(document.getElementById('setup-quarter-length').value);

        // Reset lineup
        this.lineup = {};
        this.POSITIONS.forEach(pos => {
            document.getElementById('lineup-' + pos).textContent = 'Tap to assign';
            document.querySelector(`.position-slot[data-pos="${pos}"]`).classList.remove('assigned');
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
            const numLabel = player.number ? `#${player.number} ` : '';
            return `<button class="picker-player ${taken ? 'taken' : ''}"
                onclick="${taken ? '' : `App.assignPlayer(${player.id})`}"
                ${taken ? 'disabled' : ''}>
                ${numLabel}${player.name}
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
        const numLabel = player.number ? `#${player.number} ` : '';
        document.getElementById('lineup-' + this.selectedPosition).textContent = numLabel + player.name;
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
        };

        // Copy lineup to match court
        this.POSITIONS.forEach(pos => {
            this.match.court[pos] = { ...this.lineup[pos], position: pos };
        });
        this.match.quarterLineups[0] = { ...this.match.court };

        // Init player stats
        this.setupPlayers.forEach(p => {
            this.match.playerStats[p.id] = {};
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
        this.renderEventFeed();
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
        document.getElementById('match-timer').style.color = '#10B981';
        this.timerInterval = setInterval(() => {
            if (this.timerSeconds > 0) {
                this.timerSeconds--;
                this.updateTimerDisplay();
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
            this.showConfirm('End match and see summary?', confirmed => {
                if (confirmed) this.endMatch();
            });
            return;
        }
        this.showConfirm(`End Q${this.match.quarter} and start Q${this.match.quarter + 1}?`, confirmed => {
            if (!confirmed) return;
            this.pauseTimer();
            this.match.quarter++;
            this.timerSeconds = this.match.quarterLength * 60;
            this.match.quarterLineups.push({ ...this.match.court });
            this.updateTimerDisplay();
            this.updateQuarterDisplay();
            this.cancelPlayerSelection();
            this.addSystemEvent(`Q${this.match.quarter} started`);

            // Update button text for Q4
            if (this.match.quarter >= 4) {
                document.getElementById('btn-quarter').textContent = 'Full Time';
            }
        });
    },

    endMatch() {
        this.pauseTimer();
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
            events: this.match.events,
            trackingLevel: this.match.trackingLevel,
            quarterLength: this.match.quarterLength,
        };
        this.matches.unshift(saved);
        this.saveMatches();

        this.viewMatchSummary(0);
    },

    // ==========================================
    // COURT PLAYER GRID (tap player first)
    // ==========================================
    renderCourtPlayers() {
        const grid = document.getElementById('match-court-players');
        grid.innerHTML = this.POSITIONS.map(pos => {
            const player = this.match.court[pos];
            if (!player) return '';
            const stats = this.match.playerStats[player.id] || {};
            const statLine = this.getPlayerStatLine(stats, pos);
            const numLabel = player.number ? `#${player.number}` : '';
            return `<button class="court-player-btn" data-player-id="${player.id}"
                onclick="App.selectMatchPlayer(${player.id}, '${pos}')">
                <span class="cp-pos">${pos}</span>
                <span class="cp-name">${numLabel} ${player.name}</span>
                <span class="cp-stats">${statLine}</span>
            </button>`;
        }).join('');
    },

    getPlayerStatLine(stats, pos) {
        const parts = [];
        if (this.SHOOTING_POSITIONS.includes(pos)) {
            const goals = stats.goal || 0;
            const misses = stats.miss || 0;
            const attempts = goals + misses;
            if (attempts > 0) {
                parts.push(`${goals}/${attempts}`);
            }
        }
        if (stats.intercept) parts.push(`Int:${stats.intercept}`);
        if (stats.turnover) parts.push(`TO:${stats.turnover}`);
        return parts.join(' ') || '--';
    },

    // ==========================================
    // PLAYER SELECTION & ACTIONS (2-tap flow)
    // ==========================================
    selectMatchPlayer(playerId, pos) {
        this.selectedMatchPlayer = { id: playerId, pos };
        const player = this.match.players.find(p => p.id === playerId);

        // Highlight selected
        document.querySelectorAll('.court-player-btn').forEach(btn => {
            btn.classList.toggle('selected', parseInt(btn.dataset.playerId) === playerId);
        });

        // Show actions panel
        document.getElementById('selected-player-name').textContent = player.name;
        document.getElementById('selected-player-pos').textContent = pos;
        document.getElementById('match-actions').classList.remove('hidden');
        document.getElementById('match-player-grid').classList.add('hidden');

        // Render action buttons based on position and tracking level
        this.renderActionButtons(pos);
    },

    renderActionButtons(pos) {
        const actions = this.trackingLevel === 'basic' ? this.ACTIONS_BASIC : this.ACTIONS_DETAILED;
        const grid = document.getElementById('action-buttons');

        grid.innerHTML = actions
            .filter(a => !a.positions || a.positions.includes(pos))
            .map(a => `<button class="action-btn ${a.css}" onclick="App.recordAction('${a.key}')">
                <span class="action-icon">${a.icon}</span>
                ${a.label}
            </button>`).join('');
    },

    cancelPlayerSelection() {
        this.selectedMatchPlayer = null;
        document.querySelectorAll('.court-player-btn').forEach(btn => btn.classList.remove('selected'));
        document.getElementById('match-actions').classList.add('hidden');
        document.getElementById('match-player-grid').classList.remove('hidden');
        this.closeSubs();
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

        // Handle goal scoring
        if (actionKey === 'goal') {
            this.match.homeScore++;
            this.match.quarterScores[this.match.quarter - 1].home++;
            this.updateScoreDisplay();
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
        this.renderEventItem(event);
        this.renderCourtPlayers();

        // Update undo button
        document.getElementById('btn-undo').disabled = false;

        // Flash feedback and return to player grid
        this.toast(`${player.name}: ${actionKey.replace('_', ' ')}`, 'success');
        this.cancelPlayerSelection();
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
        this.renderEventItem(event);
        document.getElementById('btn-undo').disabled = false;
        this.cancelPlayerSelection();
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
        this.renderEventFeed();
        document.getElementById('btn-undo').disabled = !this.match.events.length;
        this.toast('Undone', 'success');
    },

    // ==========================================
    // EVENT FEED
    // ==========================================
    renderEventFeed() {
        const container = document.getElementById('match-events');
        container.innerHTML = '';
        // Show most recent first (last 50)
        const recent = this.match.events.slice(-50).reverse();
        recent.forEach(e => this.renderEventItem(e, false));
    },

    renderEventItem(event, prepend = true) {
        const container = document.getElementById('match-events');
        const div = document.createElement('div');

        let cssClass = 'event-system';
        let icon = '';
        let text = '';

        if (event.action === 'goal') {
            cssClass = 'event-goal';
            icon = '&#9917;';
            text = `<strong>${event.playerName}</strong> scored (${event.position})`;
        } else if (event.action === 'miss') {
            cssClass = 'event-miss';
            icon = '&#10060;';
            text = `<strong>${event.playerName}</strong> missed (${event.position})`;
        } else if (event.action === 'opp_goal') {
            cssClass = 'event-opp';
            icon = '&#9917;';
            text = `<strong>${event.playerName}</strong> scored`;
        } else if (event.action === 'intercept' || event.action === 'deflection' || event.action === 'rebound' || event.action === 'pickup') {
            cssClass = 'event-defence';
            icon = '&#128170;';
            text = `<strong>${event.playerName}</strong> ${event.action} (${event.position})`;
        } else if (event.action === 'turnover') {
            cssClass = 'event-turnover';
            icon = '&#8635;';
            text = `<strong>${event.playerName}</strong> turnover (${event.position})`;
        } else if (event.action === 'system') {
            cssClass = 'event-system';
            icon = '&#8505;';
            text = event.playerName;
        } else {
            cssClass = 'event-system';
            icon = '&#9654;';
            const label = event.action.replace(/_/g, ' ');
            text = `<strong>${event.playerName}</strong> ${label} (${event.position || ''})`;
        }

        div.className = `event-item ${cssClass}`;
        div.innerHTML = `
            <span class="event-time">${event.time || ''}</span>
            <span class="event-icon">${icon}</span>
            <span class="event-text">${text}</span>
        `;

        if (prepend) {
            container.insertBefore(div, container.firstChild);
        } else {
            container.appendChild(div);
        }
    },

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
        this.renderEventItem(event);
    },

    // ==========================================
    // SUBSTITUTIONS
    // ==========================================
    showSubstitution() {
        this.cancelPlayerSelection();
        this.subState = { playerOff: null, playerOn: null, newPos: null };
        document.getElementById('match-player-grid').classList.add('hidden');
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

        // Remove the player going off from their current position
        delete this.match.court[playerOff.pos];

        // Place the incoming player at the new position
        this.match.court[newPos] = { ...onPlayer, position: newPos };

        // If the new position was occupied by someone else (position swap), move them off
        // (This is already handled because we deleted playerOff.pos)

        this.addSystemEvent(`Sub: ${onPlayer.name} on (${newPos}), ${offPlayer.name} off`);
        this.renderCourtPlayers();
        this.closeSubs();
        this.toast(`${onPlayer.name} on for ${offPlayer.name}`, 'success');
    },

    closeSubs() {
        document.getElementById('match-subs').classList.add('hidden');
        document.getElementById('match-player-grid').classList.remove('hidden');
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

        const goals = Object.values(m.playerStats).reduce((sum, s) => sum + (s.goal || 0), 0);
        const misses = Object.values(m.playerStats).reduce((sum, s) => sum + (s.miss || 0), 0);
        const pct = (goals + misses) > 0 ? Math.round((goals / (goals + misses)) * 100) : 0;

        const text = `${m.homeTeam} ${m.homeScore} - ${m.awayScore} ${m.awayTeam}\n` +
            `${m.date || ''}${m.venue ? ' | ' + m.venue : ''}\n` +
            `Shooting: ${goals}/${goals + misses} (${pct}%)\n` +
            m.quarterScores.map((qs, i) => `Q${i + 1}: ${qs.home}-${qs.away}`).join(' | ');

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
        container.innerHTML = this.matches.map((m, i) => `
            <div class="history-card" onclick="App.viewMatchSummary(${i})">
                <div class="hc-date">${m.date || 'Unknown date'}${m.venue ? ' - ' + m.venue : ''}</div>
                <div class="hc-score">${m.homeScore} - ${m.awayScore}</div>
                <div class="hc-teams">${m.homeTeam} vs ${m.awayTeam}</div>
                ${m.competition ? `<div class="hc-comp">${m.competition}</div>` : ''}
                <div class="hc-actions">
                    <button class="btn btn-small btn-outline" onclick="event.stopPropagation(); App.viewMatchSummary(${i})">View</button>
                    <button class="btn btn-small btn-danger" onclick="event.stopPropagation(); App.deleteMatch(${i})">Delete</button>
                </div>
            </div>
        `).join('');
    },

    deleteMatch(index) {
        this.showConfirm('Delete this match?', confirmed => {
            if (confirmed) {
                this.matches.splice(index, 1);
                this.saveMatches();
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
    }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
