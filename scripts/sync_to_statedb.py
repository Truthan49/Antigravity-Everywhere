#!/usr/bin/env python3
"""
Inject a new trajectory entry into state.vscdb's UnifiedStateSync.
This makes gateway-created conversations visible in Agent Manager.

Usage: python3 sync_to_statedb.py <cascadeId> <title> <workspaceUri>
"""

import sqlite3, base64, os, sys, time
import blackboxprotobuf

STATE_DB = os.path.expanduser("~/Library/Application Support/Antigravity/User/globalStorage/state.vscdb")
KEY = "antigravityUnifiedStateSync.trajectorySummaries"

def build_inner_protobuf(title: str, workspace_uri: str, step_count: int = 0) -> bytes:
    """Build the inner protobuf that goes into field 2.1 (base64-encoded)."""
    now_seconds = int(time.time())
    now_nanos = int((time.time() % 1) * 1e9)
    
    inner = {
        '1': title.encode('utf-8'),                   # summary/title
        '2': step_count,                               # stepCount
        '3': {'1': now_seconds, '2': now_nanos},       # lastModifiedTime
        '5': 1,                                        # status (IDLE)
        '7': {'1': now_seconds, '2': now_nanos},       # createdTime
        '9': {                                         # workspace
            '1': workspace_uri.encode('utf-8'),        # workspaceFolderAbsoluteUri
        },
        '17': {                                        # trajectoryMetadata
            '1': {
                '1': workspace_uri.encode('utf-8'),    # workspaceFolderAbsoluteUri
            },
            '2': {'1': now_seconds, '2': now_nanos},   # createdAt
            '7': workspace_uri.encode('utf-8'),        # workspaceUri
        },
    }
    
    inner_typedef = {
        '1': {'type': 'bytes', 'name': ''},
        '2': {'type': 'int', 'name': ''},
        '3': {'type': 'message', 'name': '', 'message_typedef': {
            '1': {'type': 'int', 'name': ''}, '2': {'type': 'int', 'name': ''}
        }},
        '5': {'type': 'int', 'name': ''},
        '7': {'type': 'message', 'name': '', 'message_typedef': {
            '1': {'type': 'int', 'name': ''}, '2': {'type': 'int', 'name': ''}
        }},
        '9': {'type': 'message', 'name': '', 'message_typedef': {
            '1': {'type': 'bytes', 'name': ''},
        }},
        '17': {'type': 'message', 'name': '', 'message_typedef': {
            '1': {'type': 'message', 'name': '', 'message_typedef': {
                '1': {'type': 'bytes', 'name': ''},
            }},
            '2': {'type': 'message', 'name': '', 'message_typedef': {
                '1': {'type': 'int', 'name': ''}, '2': {'type': 'int', 'name': ''}
            }},
            '7': {'type': 'bytes', 'name': ''},
        }},
    }
    
    return blackboxprotobuf.encode_message(inner, inner_typedef)


def inject_trajectory(cascade_id: str, title: str, workspace_uri: str, step_count: int = 0):
    """Add a new trajectory entry to state.vscdb."""
    
    # Read current data
    db = sqlite3.connect(STATE_DB)
    raw = db.execute(f"SELECT value FROM ItemTable WHERE key=?", (KEY,)).fetchone()
    
    if not raw or not raw[0]:
        print("❌ No existing trajectorySummaries found")
        db.close()
        return False
    
    decoded = base64.b64decode(raw[0])
    msg, typedef = blackboxprotobuf.decode_message(decoded)
    
    trajectories = msg.get('1', [])
    if not isinstance(trajectories, list):
        trajectories = [trajectories]
    
    # Check if already exists
    for t in trajectories:
        cid = t.get('1', b'')
        if isinstance(cid, bytes): cid = cid.decode()
        if cid == cascade_id:
            print(f"⚠️  {cascade_id[:8]} already exists in state.vscdb, skipping")
            db.close()
            return True
    
    # Build new entry
    inner_pb = build_inner_protobuf(title, workspace_uri, step_count)
    inner_b64 = base64.b64encode(inner_pb).decode('utf-8')
    
    new_entry = {
        '1': cascade_id.encode('utf-8'),
        '2': {
            '1': inner_b64.encode('utf-8'),
        }
    }
    
    trajectories.append(new_entry)
    msg['1'] = trajectories
    
    # Re-encode
    new_encoded = blackboxprotobuf.encode_message(msg, typedef)
    new_b64 = base64.b64encode(new_encoded).decode('utf-8')
    
    # Write back
    db.execute("UPDATE ItemTable SET value=? WHERE key=?", (new_b64, KEY))
    db.commit()
    db.close()
    
    print(f"✅ Injected {cascade_id[:8]} into state.vscdb ({len(trajectories)} total)")
    return True


if __name__ == '__main__':
    if len(sys.argv) < 4:
        print(f"Usage: {sys.argv[0]} <cascadeId> <title> <workspaceUri>")
        sys.exit(1)
    
    cascade_id = sys.argv[1]
    title = sys.argv[2]
    workspace_uri = sys.argv[3]
    
    success = inject_trajectory(cascade_id, title, workspace_uri)
    sys.exit(0 if success else 1)
