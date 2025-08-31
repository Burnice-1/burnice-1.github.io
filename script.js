class DiscordActivityTracker {
    constructor() {
        this.ws = null;
        this.token = null;
        this.heartbeatInterval = null;
        this.lastSequence = null;
        this.sessionId = null;
        this.user = null;
        this.currentActivity = null;
        
        this.initializeElements();
        this.attachEventListeners();
    }
    
    initializeElements() {
        this.elements = {
            tokenInput: document.getElementById('userToken'),
            connectBtn: document.getElementById('connectBtn'),
            connectionStatus: document.getElementById('connectionStatus'),
            username: document.getElementById('username'),
            userStatus: document.getElementById('userStatus'),
            activity: document.getElementById('activity'),
            activityDisplay: document.getElementById('activityDisplay'),
            activityCard: document.getElementById('activityCard'),
            activityIcon: document.getElementById('activityIcon'),
            activityType: document.getElementById('activityType'),
            activityName: document.getElementById('activityName'),
            activityDetails: document.getElementById('activityDetails'),
            logContainer: document.getElementById('logContainer'),
            clearLogs: document.getElementById('clearLogs'),
            customActivityName: document.getElementById('customActivityName'),
            customActivityDetails: document.getElementById('customActivityDetails'),
            customActivityState: document.getElementById('customActivityState'),
            activityTypeSelect: document.getElementById('activityTypeSelect'),
            setActivityBtn: document.getElementById('setActivityBtn'),
            clearActivityBtn: document.getElementById('clearActivityBtn')
        };
    }
    
    attachEventListeners() {
        this.elements.connectBtn.addEventListener('click', () => {
            const token = this.elements.tokenInput.value.trim();
            if (token) {
                this.connect(token);
            } else {
                this.log('エラー: トークンを入力してください', 'error');
            }
        });
        
        this.elements.clearLogs.addEventListener('click', () => {
            this.elements.logContainer.innerHTML = '';
        });
        
        this.elements.tokenInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.elements.connectBtn.click();
            }
        });

        this.elements.setActivityBtn.addEventListener('click', () => {
            this.setCustomActivity();
        });

        this.elements.clearActivityBtn.addEventListener('click', () => {
            this.clearCustomActivity();
        });
    }
    
    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logElement = document.createElement('div');
        logElement.className = `log-message ${type}`;
        logElement.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${message}`;
        this.elements.logContainer.appendChild(logElement);
        this.elements.logContainer.scrollTop = this.elements.logContainer.scrollHeight;
    }
    
    updateConnectionStatus(status, type = 'info') {
        this.elements.connectionStatus.textContent = status;
        this.elements.connectionStatus.className = `value ${type}`;
    }
    
    connect(token) {
        this.token = token;
        this.log('Discord Gateway に接続中...');
        this.updateConnectionStatus('接続中...', 'connecting');
        
        // Close existing connection
        if (this.ws) {
            this.ws.close();
        }
        
        this.ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
        
        this.ws.onopen = () => {
            this.log('WebSocket接続が確立されました');
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
        };
        
        this.ws.onclose = (event) => {
            this.log(`接続が切断されました (コード: ${event.code})`, 'error');
            this.updateConnectionStatus('切断済み', 'error');
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
        };
        
        this.ws.onerror = (error) => {
            this.log('WebSocketエラーが発生しました', 'error');
            this.updateConnectionStatus('エラー', 'error');
        };
    }
    
    handleMessage(data) {
        const { op, d, s, t } = data;
        
        if (s !== null) {
            this.lastSequence = s;
        }
        
        switch (op) {
            case 10: // Hello
                this.log(`Helloを受信、ハートビート間隔: ${d.heartbeat_interval}ms`);
                this.startHeartbeat(d.heartbeat_interval);
                this.identify();
                break;
                
            case 0: // Dispatch
                this.handleDispatch(t, d);
                break;
                
            case 1: // Heartbeat
                this.sendHeartbeat();
                break;
                
            case 7: // Reconnect
                this.log('再接続が必要です');
                this.reconnect();
                break;
                
            case 9: // Invalid Session
                this.log('無効なセッションです', 'error');
                this.updateConnectionStatus('認証エラー', 'error');
                break;
                
            case 11: // Heartbeat ACK
                // this.log('Heartbeat ACK received');
                break;
                
            default:
                this.log(`未知のOPコード: ${op}`);
        }
    }
    
    handleDispatch(event, data) {
        switch (event) {
            case 'READY':
                this.handleReady(data);
                break;
                
            case 'PRESENCE_UPDATE':
                this.handlePresenceUpdate(data);
                break;
                
            default:
                // this.log(`未処理のイベント: ${event}`);
                break;
        }
    }
    
    handleReady(data) {
        this.user = data.user;
        this.sessionId = data.session_id;
        
        this.log(`ログイン成功: ${data.user.username}#${data.user.discriminator}`);
        this.updateConnectionStatus('接続済み', 'success');
        this.elements.username.textContent = `${data.user.username}#${data.user.discriminator}`;
        
        // Update initial presence if available
        if (data.user.presence) {
            this.updatePresence(data.user.presence);
        }
    }
    
    handlePresenceUpdate(data) {
        if (data.user && data.user.id === this.user.id) {
            this.updatePresence(data);
        }
    }
    
    updatePresence(presence) {
        const status = presence.status || 'unknown';
        const activities = presence.activities || [];
        
        this.elements.userStatus.textContent = this.getStatusText(status);
        this.elements.userStatus.className = `value status-${status}`;
        
        if (activities.length > 0) {
            const activity = activities[0]; // Get the first activity
            this.updateActivity(activity);
        } else {
            this.clearActivity();
        }
        
        this.log(`プレゼンス更新: ${status}, アクティビティ: ${activities.length}個`);
    }
    
    updateActivity(activity) {
        const typeText = this.getActivityTypeText(activity.type);
        const icon = this.getActivityIcon(activity.type);
        
        this.elements.activityIcon.textContent = icon;
        this.elements.activityType.textContent = typeText;
        this.elements.activityName.textContent = activity.name || '-';
        
        let details = '';
        if (activity.details) details += activity.details;
        if (activity.state) {
            if (details) details += ' - ';
            details += activity.state;
        }
        
        this.elements.activityDetails.textContent = details || '-';
        this.elements.activity.textContent = `${typeText} ${activity.name}`;
        
        this.elements.activityDisplay.style.display = 'block';
    }
    
    clearActivity() {
        this.elements.activity.textContent = 'なし';
        this.elements.activityDisplay.style.display = 'none';
    }
    
    getStatusText(status) {
        const statusMap = {
            'online': 'オンライン',
            'idle': '離席中',
            'dnd': '取り込み中',
            'offline': 'オフライン',
            'invisible': 'オフライン'
        };
        return statusMap[status] || status;
    }
    
    getActivityTypeText(type) {
        const typeMap = {
            0: 'プレイ中',
            1: 'ストリーミング',
            2: '聞いている',
            3: '視聴中',
            5: '競技中'
        };
        return typeMap[type] || '不明';
    }
    
    getActivityIcon(type) {
        const iconMap = {
            0: '🎮', // Playing
            1: '📺', // Streaming
            2: '🎵', // Listening
            3: '👀', // Watching
            5: '🏆'  // Competing
        };
        return iconMap[type] || '❓';
    }
    
    identify() {
        const identifyPayload = {
            op: 2,
            d: {
                token: this.token,
                properties: {
                    os: 'browser',
                    browser: 'chrome',
                    device: 'chrome'
                },
                intents: 1 << 8 // GUILD_PRESENCES
            }
        };
        
        this.ws.send(JSON.stringify(identifyPayload));
        this.log('認証情報を送信しました');
    }
    
    startHeartbeat(interval) {
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, interval);
    }
    
    sendHeartbeat() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const heartbeatPayload = {
                op: 1,
                d: this.lastSequence
            };
            this.ws.send(JSON.stringify(heartbeatPayload));
        }
    }
    
    reconnect() {
        if (this.token) {
            setTimeout(() => {
                this.connect(this.token);
            }, 1000);
        }
    }

    setCustomActivity() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.log('エラー: Discordに接続されていません', 'error');
            return;
        }

        const name = this.elements.customActivityName.value.trim();
        const details = this.elements.customActivityDetails.value.trim();
        const state = this.elements.customActivityState.value.trim();
        const type = parseInt(this.elements.activityTypeSelect.value);

        if (!name) {
            this.log('エラー: アクティビティ名を入力してください', 'error');
            return;
        }

        const activity = {
            name: name,
            type: type
        };

        if (details) activity.details = details;
        if (state) activity.state = state;

        this.updatePresenceActivity(activity);
        this.log(`カスタムアクティビティを設定: ${name}`);
    }

    clearCustomActivity() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.log('エラー: Discordに接続されていません', 'error');
            return;
        }

        this.updatePresenceActivity(null);
        this.log('アクティビティをクリアしました');
    }


    updatePresenceActivity(activity) {
        const presencePayload = {
            op: 3,
            d: {
                status: 'online',
                since: null,
                activities: activity ? [activity] : [],
                afk: false
            }
        };

        this.ws.send(JSON.stringify(presencePayload));
        this.currentActivity = activity;
    }
}

// Initialize the tracker when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new DiscordActivityTracker();
});