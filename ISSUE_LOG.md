# Proximity - Issue Log

**Last Updated:** November 10, 2025 - 8:30 PM

## 🔴 Critical Issues

### 0. Audio Still Playing After Leaving Channel
**Status:** ✅ FIXED (Nov 10, 2025 10:15 AM)
**Priority:** Critical
**Reported:** Nov 10, 2025 10:06 AM

**Problem:**
- User leaves voice channel but can still hear other users talking
- Audio elements not properly stopped on disconnect
- disconnectAll() only closed WebRTC connections, didn't stop audio playback

**Solution Implemented:**
- Enhanced `AudioManager.disconnectAll()` to stop and remove audio elements
- Now queries `audio[data-user-id]` and calls `pause()`, clears `srcObject`, and `remove()`
- Added logging for each audio element being stopped

**Fixed In:** Commit ac57af6
**Files Modified:**
- `src/renderer/js/audio/AudioManager.js:811-827`

---

### 1. Audio Device Selection Not Working
**Status:** 🔍 DIAGNOSED - Ready to Fix
**Priority:** High
**Reported:** Nov 10, 2025 10:03 AM
**Diagnosed:** Nov 10, 2025 8:30 PM

**Problem:**
- Users cannot change their audio input/output devices
- Device selection dropdowns exist and are populated by UIManager
- But changing devices doesn't actually work in practice

**Root Cause Identified:**
1. ✅ **Device enumeration is working** - `UIManager.populateAudioDevices()` correctly calls `navigator.mediaDevices.enumerateDevices()` and populates both dropdowns (line 647-698)
2. ✅ **HTML elements exist** - Both `#audioDevice` (input) and `#audioOutputDevice` (output) exist in settings modal
3. ❌ **Event listeners are incomplete** - `app.js` has event listener for input device change (line 474-481) but implementation needs verification
4. ❌ **No output device change handler** - Missing event listener for `#audioOutputDevice` in app.js
5. ⚠️ **AudioManager methods exist** but may need testing:
   - `changeInputDevice(deviceId)` - Lines 328-382 in AudioManager.js
   - `changeOutputDevice(deviceId)` - Lines 384-410 in AudioManager.js

**Affected Files:**
- `src/renderer/js/ui/UIManager.js:647-698` - Device enumeration (WORKING)
- `src/renderer/js/app.js:474-481` - Input device change listener (EXISTS)
- `src/renderer/js/app.js` - Missing output device change listener (NEEDED)
- `src/renderer/js/audio/AudioManager.js:328-410` - Change device methods (NEED TESTING)
- `src/renderer/index.html:186-196` - Device select dropdowns (EXIST)

**Fix Required:**
1. Add event listener for output device selection in app.js
2. Verify that input device selection properly calls AudioManager.changeInputDevice()
3. Ensure settings are saved when devices change
4. Test that device changes work during active voice chat
5. Verify device lock functionality doesn't interfere

---

### 2. Test Microphone/Headphones Buttons Not Working
**Status:** Open
**Priority:** High
**Reported:** Nov 10, 2025 10:03 AM

**Problem:**
- "Test Microphone" button doesn't provide audio feedback
- "Test Output" button doesn't play test sound
- No visual indication that test is running

**Expected Behavior:**
- Test Microphone: Show live audio level meter, user hears themselves
- Test Output: Play test tone through selected output device

**Affected Files:**
- `src/renderer/js/app.js:558-566` - Test button event listeners
- `src/renderer/js/audio/AudioManager.js` - Test microphone/output methods
- `src/renderer/index.html:238-239` - Test buttons in settings

**Related Code:**
```javascript
// app.js:558
const testMicrophoneBtn = document.getElementById('testMicrophone');
if (testMicrophoneBtn) {
    testMicrophoneBtn.addEventListener('click', () => this.testMicrophone());
}
```

**Investigation Needed:**
- Check if `testMicrophone()` method exists and is properly implemented
- Verify audio context is initialized
- Check for Web Audio API permissions

---

### 3. Chat Message Delete Not Working
**Status:** Open
**Priority:** Medium
**Reported:** Nov 10, 2025 10:03 AM

**Problem:**
- User clicks delete on their own message
- Console shows: `app.js:384 Deleting message: 1762786973965-fq94k57vl`
- Message does not disappear from chat
- No error message shown to user

**Expected Behavior:**
- User clicks delete button on their message
- Message disappears from their chat view
- Socket emits delete event to server
- Server broadcasts delete to all users
- Message removed from localStorage

**Affected Files:**
- `src/renderer/js/app.js:376-390` - Delete message handler
- `src/renderer/js/ui/UIManager.js:656` - removeChatMessage method
- `src/server/signaling-server.js` - Server-side delete handler
- `src/renderer/js/app.js:646-656` - 'message-deleted' socket listener

**Related Code:**
```javascript
// app.js:376 - deleteMessage method
deleteMessage(messageId) {
    console.log('Deleting message:', messageId);
    this.connectionManager.socket.emit('delete-message', {
        messageId,
        channel: this.currentTextChannel
    });
}

// app.js:646 - message-deleted listener
socket.on('message-deleted', (data) => {
    console.log('Message deleted:', data);
    const { messageId } = data;

    if (this.globalChatHistory.general) {
        this.globalChatHistory.general = this.globalChatHistory.general.filter(msg => msg.id !== messageId);
        this.saveGlobalChatHistory();
    }

    this.uiManager.removeChatMessage(messageId);
});
```

**Investigation Needed:**
- Check if server has 'delete-message' handler implemented
- Verify messageId format matches between client and server
- Check if 'message-deleted' event is being emitted by server

---

---

### 7. Screen Sharing Feature Missing
**Status:** 🆕 NEW - Feature Request
**Priority:** Medium
**Reported:** Nov 10, 2025 8:30 PM

**Problem:**
- No screen sharing capability in the app
- Users want to share their screens during voice chat sessions

**Expected Behavior:**
- Button to start/stop screen sharing
- Screen share visible to other users in voice channel
- Proximity-based volume still applies to voice while sharing screen
- Ability to select which screen/window to share

**Implementation Requirements:**
1. **WebRTC Screen Capture:**
   - Use `navigator.mediaDevices.getDisplayMedia()` for screen capture
   - Create separate video track for screen sharing
   - Send screen track via WebRTC peer connections

2. **UI Components Needed:**
   - Screen share button in voice channel controls
   - Visual indicator when someone is screen sharing
   - Screen viewing modal/panel to display shared screen
   - "Stop sharing" button when actively sharing

3. **Backend Considerations:**
   - Socket events: `screen-share-started`, `screen-share-stopped`
   - Signaling for screen share offers/answers
   - Multiple simultaneous screen shares support?

4. **UX Decisions:**
   - Should screen share be visible in proximity map?
   - Picture-in-picture mode for screen share?
   - Record screen sharing?
   - Quality/resolution settings?

**Affected Files (New):**
- `src/renderer/js/audio/AudioManager.js` - Add screen share methods
- `src/renderer/js/app.js` - Add screen share event handlers
- `src/renderer/js/ui/UIManager.js` - Add screen share UI
- `src/renderer/index.html` - Add screen share buttons and modal
- `src/server/signaling-server.js` - Add screen share socket events
- `src/renderer/styles.css` - Style screen share components

**References:**
- [MDN getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)
- WebRTC screen sharing similar to audio peer connections

---

## 🟡 Medium Priority Issues

### 4. UI Width Smushed / Narrow Sidebar
**Status:** Open
**Priority:** Medium
**Reported:** Nov 10, 2025 10:03 AM

**Problem:**
- Application window appears too narrow
- Sidebar taking up too much space or main content area compressed
- Screenshot shows narrow layout

**Expected Behavior:**
- App should have balanced layout with sidebar ~220px and main content area filling rest
- Text should not be cramped
- Proper responsive sizing

**Affected Files:**
- `src/renderer/styles.css` - Layout CSS
- `src/main/main.js:19-20` - Window dimensions (currently 1200x800)

**CSS Classes to Check:**
- `.server-sidebar` - Sidebar width
- `.server-main-content` - Main content area
- `.app-container` - Overall container

**Quick Fix Options:**
1. Increase window width in main.js: `width: 1400` or `1600`
2. Adjust sidebar fixed width in CSS
3. Check for any `display: none` or width overrides

---

### 5. No Timestamps on Chat Messages
**Status:** Open
**Priority:** Medium
**Reported:** Nov 10, 2025 10:03 AM

**Problem:**
- Chat messages don't show when they were sent
- No time or date information visible
- User sees: "Bokuhog: pause" but no timestamp

**Expected Behavior:**
- Show relative time for recent messages ("2 minutes ago", "Just now")
- Show actual time for older messages ("6:28 PM", "Yesterday 3:15 PM")
- Optionally show date for messages from previous days

**Affected Files:**
- `src/renderer/js/ui/UIManager.js:594-643` - addChatMessage method
- `src/renderer/js/app.js:631-638` - Message data structure
- `src/renderer/styles.css` - Chat message styling

**Implementation Needed:**
```javascript
// Format timestamp function needed
function formatMessageTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    // ... more logic
}
```

**UI Enhancement:**
- Add timestamp span to message HTML
- Style with secondary text color
- Consider hover tooltip for exact timestamp

---

### 6. Message Editing System Missing
**Status:** Open
**Priority:** Low
**Reported:** Nov 10, 2025 10:03 AM

**Problem:**
- No way to edit messages after sending
- Common chat app feature missing
- Users have to delete and resend

**Expected Behavior:**
- Click edit button on own message
- Message input field populates with message text
- Edit and press Enter to save
- Show "(edited)" indicator on message
- Socket event to sync edit across clients

**Implementation Required:**
1. Add edit button next to delete button in message UI
2. Create 'edit-message' socket event
3. Server handler for editing messages
4. Update message in localStorage
5. Show edit indicator in UI

**Files to Modify:**
- `src/renderer/js/ui/UIManager.js` - Add edit button to messages
- `src/renderer/js/app.js` - Add editMessage() method
- `src/server/signaling-server.js` - Add 'edit-message' handler
- `src/renderer/styles.css` - Style edit indicator

---

## 🟢 Enhancement Suggestions

### 7. More Robust Chat System
**Status:** Planning
**Priority:** Low
**Reported:** Nov 10, 2025 10:03 AM

**Current Issues:**
- Chat state spread across multiple files
- localStorage used for persistence (limited to ~5MB)
- No message history limit (could grow unbounded)
- No pagination or lazy loading
- Delete/edit system incomplete

**Proposed Solutions:**

**Option A: Keep Current Architecture (Lightweight)**
- Implement message limit (e.g., last 500 messages)
- Add proper delete/edit handlers
- Add message reactions (simple emoji)
- Keep localStorage for simplicity

**Option B: Upgrade to IndexedDB**
- More storage capacity (50MB+)
- Better performance for large message history
- Can store images/files
- More complex to implement

**Option C: Server-Side Storage**
- Messages stored on Railway server
- User sees full history when joining
- Requires database (PostgreSQL on Railway)
- More robust but increases complexity

**Recommendation:** Start with Option A, upgrade to B or C later if needed.

---

## 📋 Debugging Information

### Console Logs Analysis (Nov 10, 2025 10:03 AM)

**Successful Operations:**
✅ Connection to Railway server working
✅ Voice channel join/leave/rejoin working (FIXED!)
✅ Chat messages sending successfully
✅ Proximity map displaying
✅ Audio initialization successful

**Failed Operations:**
❌ Audio device enumeration
❌ Message deletion
❌ Microphone test
❌ Output test

**Key Log Lines:**
```
AudioManager.js:166 Using saved input device: 30876dfdae73de81fbdd12f3bfe8abf868a68b0b90909f565e2090cf20eb483f
// ^ Device ID is saved but not being validated

app.js:384 Deleting message: 1762786973965-fq94k57vl
// ^ Delete event sent but no server response

UIManager.js:378 Toggle voice channel: general-voice Current: null
// ^ This is now CORRECT! Rejoin bug FIXED ✅
```

---

## 🔧 Quick Wins (Easy Fixes)

1. **Window Width** - Change `src/main/main.js:19` from `width: 1200` to `width: 1400`
2. **Timestamps** - Add to `UIManager.addChatMessage()` around line 594
3. **Server Delete Handler** - Add to `src/server/signaling-server.js` (likely missing)

---

## 📂 Key Files Reference

### Frontend
- **App Controller:** `src/renderer/js/app.js` (1,136 lines)
- **UI Manager:** `src/renderer/js/ui/UIManager.js` (677 lines)
- **Audio Manager:** `src/renderer/js/audio/AudioManager.js` (426 lines)
- **Settings Manager:** `src/renderer/js/settings/SettingsManager.js` (126 lines)
- **Main HTML:** `src/renderer/index.html` (346 lines)
- **Styles:** `src/renderer/styles.css`

### Backend
- **Signaling Server:** `src/server/signaling-server.js` (Socket.IO server)
- **Electron Main:** `src/main/main.js` (70 lines)

### Configuration
- **Webpack:** `webpack.config.js`
- **Package:** `package.json`

---

## 🎯 Recommended Fix Order

1. **Window width** (1 minute) - Quick visual improvement
2. **Server delete handler** (5 minutes) - Fix message deletion
3. **Audio device enumeration** (20 minutes) - Core functionality
4. **Message timestamps** (15 minutes) - UX improvement
5. **Test buttons** (30 minutes) - Settings functionality
6. **Message editing** (1 hour) - Feature enhancement

---

## 📝 Notes for Future AI

- Voice channel rejoin bug FIXED as of Nov 10, 2025 10:00 AM
- UIManager.currentVoiceChannel now properly syncs via updateVoiceChannelUI()
- Webpack bundle must be rebuilt after any JS changes: `npm run webpack`
- Electron caches aggressively - added cache clearing in dev mode
- Server running on Railway at `proximityserver-production.up.railway.app`
- All socket events logged with console.log for debugging
- Chat history stored in localStorage key: `proximity-chat-history`
- User settings stored in localStorage key: `proximity-settings`
